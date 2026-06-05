import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, registrationsTable, tournamentsTable } from "@workspace/db";
import {
  ListRegistrationsQueryParams,
  ListRegistrationsResponse,
  GetRegistrationParams,
  GetRegistrationResponse,
  ApproveRegistrationParams,
  ApproveRegistrationResponse,
  RejectRegistrationParams,
  RejectRegistrationBody,
  RejectRegistrationResponse,
  DeleteRegistrationParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function mapReg(r: typeof registrationsTable.$inferSelect) {
  return {
    ...r,
    formData: r.formData as Record<string, unknown>,
    rejectionReason: r.rejectionReason ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/registrations", async (req, res): Promise<void> => {
  const query = ListRegistrationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let q = db.select().from(registrationsTable).$dynamic();

  if (query.data.tournamentId) {
    q = q.where(eq(registrationsTable.tournamentId, query.data.tournamentId)) as typeof q;
  }
  if (query.data.status) {
    q = q.where(eq(registrationsTable.status, query.data.status)) as typeof q;
  }

  const regs = await q.orderBy(registrationsTable.createdAt);
  res.json(ListRegistrationsResponse.parse(regs.map(mapReg)));
});

router.get("/registrations/:id", async (req, res): Promise<void> => {
  const params = GetRegistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(eq(registrationsTable.id, params.data.id));

  if (!reg) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  res.json(GetRegistrationResponse.parse(mapReg(reg)));
});

router.patch("/registrations/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveRegistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(eq(registrationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, existing.tournamentId));

  if (tournament?.maxParticipants != null) {
    const approvedCount = await db
      .select()
      .from(registrationsTable)
      .where(and(eq(registrationsTable.tournamentId, existing.tournamentId), eq(registrationsTable.status, "approved")));
    if (approvedCount.length >= tournament.maxParticipants) {
      res.status(400).json({ error: "Maximum participants reached" });
      return;
    }
  }

  const [updated] = await db
    .update(registrationsTable)
    .set({ status: "approved", notificationSent: false })
    .where(eq(registrationsTable.id, params.data.id))
    .returning();

  logger.info({ regId: updated.id }, "Registration approved — bot will send notification");

  res.json(ApproveRegistrationResponse.parse(mapReg(updated)));
});

router.patch("/registrations/:id/reject", async (req, res): Promise<void> => {
  const params = RejectRegistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RejectRegistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(eq(registrationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  const [updated] = await db
    .update(registrationsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason ?? null, notificationSent: false })
    .where(eq(registrationsTable.id, params.data.id))
    .returning();

  logger.info({ regId: updated.id }, "Registration rejected — bot will send DM notification");

  res.json(RejectRegistrationResponse.parse(mapReg(updated)));
});

router.delete("/registrations/:id", async (req, res): Promise<void> => {
  const params = DeleteRegistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(eq(registrationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  await db.delete(registrationsTable).where(eq(registrationsTable.id, params.data.id));
  res.status(204).send();
});

export default router;
