---
name: Bot-API separation architecture
description: How the Discord bot and API server communicate — event-driven, no polling.
---

**Current architecture (event-driven, no polling):**
- Bot only runs Discord gateway (slash commands, modals, saving registrations to DB)
- Bot has NO polling loops — `startNotificationPoller` was removed from `artifacts/discord-bot/src/index.ts`
- API server sends Discord notifications directly via Discord REST API v10 using `fetch`
- `artifacts/api-server/src/lib/discordNotifier.ts` handles: `sendApprovalEmbed`, `sendRejectionDM`, `sendAnnouncementEmbed`
- Token source: env `DISCORD_BOT_TOKEN` first, then `bot_config.botToken` from DB

**DB fields:**
- `registrations.notificationSent` — set `true` immediately by API after sending (not polled)
- `pending_announcements` — legacy table, no longer used; bot no longer polls it
- `bot_config.botToken` — stored via dashboard bot-config page, used by API server only

**Dashboard bot-config UI:**
- Has a password input for bot token (write-only, GET always returns null)
- Only saves to DB if token field is non-empty

**Why:** Neon DB auto-suspends between queries. Polling every 5s defeats this. API-driven notifications fire only when admin actually approves/rejects/announces.

**How to apply:** If adding new admin actions that require Discord notifications, add a function to `discordNotifier.ts` and call it after the DB update in the relevant API route (fire-and-forget with `.catch` to not block the HTTP response).
