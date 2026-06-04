import { Router, type IRouter } from "express";
import { eq, sql, count } from "drizzle-orm";
import { db, tournamentsTable, registrationsTable, questionsTable } from "@workspace/db";
import {
  ListTournamentsResponse,
  CreateTournamentBody,
  GetTournamentParams,
  GetTournamentResponse,
  UpdateTournamentParams,
  UpdateTournamentBody,
  UpdateTournamentResponse,
  DeleteTournamentParams,
  GetTournamentStatsParams,
  GetTournamentStatsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendRegistrationMessage, getClient } from "../lib/discord";

const router: IRouter = Router();

const DEVICE_OPTIONS = ["Mobile", "PC", "iPad", "Controller"];

const DEFAULT_QUESTIONS: Record<string, Array<{
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  required: boolean;
  order: number;
}>> = {
  solo: [
    { label: "اسم الحساب | Account Name", type: "text", required: true, order: 1 },
    { label: "ID اللعبة | Game ID", type: "number", required: true, order: 2 },
    { label: "الجهاز | Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 3 },
  ],
  duo: [
    { label: "اسم حساب اللاعب الأول | Player 1 Account Name", type: "text", required: true, order: 1 },
    { label: "اسم حساب اللاعب الثاني | Player 2 Account Name", type: "text", required: true, order: 2 },
    { label: "ID اللاعب الأول | Player 1 ID", type: "number", required: true, order: 3 },
    { label: "ID اللاعب الثاني | Player 2 ID", type: "number", required: true, order: 4 },
    { label: "جهاز اللاعب الأول | Player 1 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 5 },
    { label: "جهاز اللاعب الثاني | Player 2 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 6 },
    { label: "اسم الفريق | Team Name", type: "text", required: true, order: 7 },
  ],
  squad: [
    { label: "اسم اللاعب الأول | Player 1 Name", type: "text", required: true, order: 1 },
    { label: "اسم اللاعب الثاني | Player 2 Name", type: "text", required: true, order: 2 },
    { label: "اسم اللاعب الثالث | Player 3 Name", type: "text", required: true, order: 3 },
    { label: "اسم اللاعب الرابع | Player 4 Name", type: "text", required: true, order: 4 },
    { label: "ID اللاعب الأول | Player 1 ID", type: "number", required: true, order: 5 },
    { label: "ID اللاعب الثاني | Player 2 ID", type: "number", required: true, order: 6 },
    { label: "ID اللاعب الثالث | Player 3 ID", type: "number", required: true, order: 7 },
    { label: "ID اللاعب الرابع | Player 4 ID", type: "number", required: true, order: 8 },
    { label: "جهاز اللاعب الأول | Player 1 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 9 },
    { label: "جهاز اللاعب الثاني | Player 2 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 10 },
    { label: "جهاز اللاعب الثالث | Player 3 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 11 },
    { label: "جهاز اللاعب الرابع | Player 4 Device", type: "select", options: DEVICE_OPTIONS, required: true, order: 12 },
    { label: "اسم الفريق | Team Name", type: "text", required: true, order: 13 },
  ],
};

async function getTournamentWithCounts(id: number) {
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!t) return null;

  const [approvedRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${id} AND ${registrationsTable.status} = 'approved'`);

  const [pendingRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${id} AND ${registrationsTable.status} = 'pending'`);

  return {
    ...t,
    acceptedCount: Number(approvedRow?.count ?? 0),
    pendingCount: Number(pendingRow?.count ?? 0),
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/tournaments", async (req, res): Promise<void> => {
  const tournaments = await db.select().from(tournamentsTable).orderBy(tournamentsTable.createdAt);

  const withCounts = await Promise.all(
    tournaments.map(async (t) => {
      const [approvedRow] = await db
        .select({ count: count() })
        .from(registrationsTable)
        .where(sql`${registrationsTable.tournamentId} = ${t.id} AND ${registrationsTable.status} = 'approved'`);
      const [pendingRow] = await db
        .select({ count: count() })
        .from(registrationsTable)
        .where(sql`${registrationsTable.tournamentId} = ${t.id} AND ${registrationsTable.status} = 'pending'`);
      return {
        ...t,
        acceptedCount: Number(approvedRow?.count ?? 0),
        pendingCount: Number(pendingRow?.count ?? 0),
        createdAt: t.createdAt.toISOString(),
      };
    })
  );

  res.json(ListTournamentsResponse.parse(withCounts));
});

router.post("/tournaments", async (req, res): Promise<void> => {
  const parsed = CreateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tournament] = await db.insert(tournamentsTable).values(parsed.data).returning();

  const defaultQs = DEFAULT_QUESTIONS[tournament.type] ?? [];
  if (defaultQs.length > 0) {
    await db.insert(questionsTable).values(
      defaultQs.map((q) => ({ ...q, tournamentId: tournament.id }))
    );
  }

  const result = await getTournamentWithCounts(tournament.id);
  res.status(201).json(GetTournamentResponse.parse(result));
});

router.get("/tournaments/active", async (req, res): Promise<void> => {
  const [t] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!t) {
    res.status(404).json({ error: "No active tournament" });
    return;
  }

  const result = await getTournamentWithCounts(t.id);
  res.json(GetTournamentResponse.parse(result));
});

router.get("/tournaments/:id", async (req, res): Promise<void> => {
  const params = GetTournamentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await getTournamentWithCounts(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.json(GetTournamentResponse.parse(result));
});

router.patch("/tournaments/:id", async (req, res): Promise<void> => {
  const params = UpdateTournamentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.status === "active") {
    await db
      .update(tournamentsTable)
      .set({ status: "inactive" })
      .where(sql`${tournamentsTable.id} != ${params.data.id}`);
  }

  const [updated] = await db
    .update(tournamentsTable)
    .set(parsed.data)
    .where(eq(tournamentsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const result = await getTournamentWithCounts(updated.id);
  res.json(UpdateTournamentResponse.parse(result));
});

router.delete("/tournaments/:id", async (req, res): Promise<void> => {
  const params = DeleteTournamentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(tournamentsTable)
    .where(eq(tournamentsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/tournaments/:id/stats", async (req, res): Promise<void> => {
  const params = GetTournamentStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, params.data.id));
  if (!t) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const [approvedRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${params.data.id} AND ${registrationsTable.status} = 'approved'`);
  const [pendingRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${params.data.id} AND ${registrationsTable.status} = 'pending'`);
  const [rejectedRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${params.data.id} AND ${registrationsTable.status} = 'rejected'`);
  const [totalRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(eq(registrationsTable.tournamentId, params.data.id));

  const approvedCount = Number(approvedRow?.count ?? 0);
  const pendingCount = Number(pendingRow?.count ?? 0);
  const rejectedCount = Number(rejectedRow?.count ?? 0);
  const totalRegistrations = Number(totalRow?.count ?? 0);
  const remainingSeats = t.maxParticipants != null ? t.maxParticipants - approvedCount : null;

  res.json(
    GetTournamentStatsResponse.parse({
      totalRegistrations,
      approvedCount,
      pendingCount,
      rejectedCount,
      remainingSeats,
    })
  );
});

router.post("/tournaments/:id/send-registration-message", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid tournament ID" });
    return;
  }

  const { channelId } = req.body;
  if (!channelId || typeof channelId !== "string") {
    res.status(400).json({ error: "channelId is required" });
    return;
  }

  if (!getClient()) {
    res.status(503).json({ error: "Discord bot not connected. Please configure the bot token first." });
    return;
  }

  try {
    await sendRegistrationMessage(id, channelId);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to send registration message");
    res.status(500).json({ error: err.message ?? "Failed to send message" });
  }
});

export default router;
