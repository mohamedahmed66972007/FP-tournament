import "dotenv/config";
import { logger } from "./logger.js";
import { initDiscordBot } from "./bot.js";
import { startNotificationPoller } from "./notifications.js";

if (!process.env.DATABASE_URL) {
  logger.error("DATABASE_URL is required");
  process.exit(1);
}

if (!process.env.DISCORD_BOT_TOKEN) {
  logger.error("DISCORD_BOT_TOKEN is required — set it as an environment variable on your bot server");
  process.exit(1);
}

logger.info("Starting Discord bot...");

await initDiscordBot();
startNotificationPoller();
