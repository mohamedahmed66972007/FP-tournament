import { Router, type IRouter } from "express";
import { eq, sql, count } from "drizzle-orm";
import { db, tournamentsTable, registrationsTable } from "@workspace/db";
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

const router: IRouter = Router();

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

  // If activating, deactivate all others first
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

export default router;
