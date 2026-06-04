import { Router, type IRouter } from "express";
import { db, botConfigTable } from "@workspace/db";
import {
  GetBotConfigResponse,
  UpdateBotConfigBody,
  UpdateBotConfigResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { reloadDiscordBot } from "../lib/discord";

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
    botToken: config.botToken ? "***" : null,
  }));
});

router.patch("/bot/config", async (req, res): Promise<void> => {
  const parsed = UpdateBotConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const config = await getOrCreateConfig();

  const updateData: Record<string, any> = {};
  if (parsed.data.announcementChannelId !== undefined) updateData.announcementChannelId = parsed.data.announcementChannelId;
  if (parsed.data.guildId !== undefined) updateData.guildId = parsed.data.guildId;
  if (parsed.data.botToken !== undefined && parsed.data.botToken !== "***") {
    updateData.botToken = parsed.data.botToken;
  }

  const [updated] = await db
    .update(botConfigTable)
    .set(updateData)
    .where(eq(botConfigTable.id, config.id))
    .returning();

  if (updateData.botToken) {
    reloadDiscordBot().catch(() => {});
  }

  res.json(UpdateBotConfigResponse.parse({
    ...updated,
    announcementChannelId: updated.announcementChannelId ?? null,
    guildId: updated.guildId ?? null,
    botToken: updated.botToken ? "***" : null,
  }));
});

export default router;
