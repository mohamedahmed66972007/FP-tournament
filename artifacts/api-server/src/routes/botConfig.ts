import { Router, type IRouter } from "express";
import { db, botConfigTable } from "@workspace/db";
import {
  GetBotConfigResponse,
  UpdateBotConfigBody,
  UpdateBotConfigResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateConfig() {
  const [existing] = await db.select().from(botConfigTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(botConfigTable).values({}).returning();
  return created;
}

router.get("/bot/config", async (req, res): Promise<void> => {
  const config = await getOrCreateConfig();
  res.json(GetBotConfigResponse.parse({
    ...config,
    announcementChannelId: config.announcementChannelId ?? null,
    guildId: config.guildId ?? null,
  }));
});

router.patch("/bot/config", async (req, res): Promise<void> => {
  const parsed = UpdateBotConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const config = await getOrCreateConfig();
  const [updated] = await db
    .update(botConfigTable)
    .set(parsed.data)
    .where(eq(botConfigTable.id, config.id))
    .returning();

  res.json(UpdateBotConfigResponse.parse({
    ...updated,
    announcementChannelId: updated.announcementChannelId ?? null,
    guildId: updated.guildId ?? null,
  }));
});

export default router;
