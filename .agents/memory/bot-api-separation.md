---
name: Bot-API separation
description: How the Discord bot and API server are decoupled and communicate
---

The Discord bot (artifacts/discord-bot) is completely independent from the API server (artifacts/api-server). They share only a PostgreSQL database.

**Rule:** Bot and API MUST NOT import from each other. All communication goes through the DB.

**Why:** User explicitly requested production-ready separation so the dashboard can go offline without affecting the bot.

**How it works:**
- `registrations.notificationSent boolean` — false when bot needs to send a notification; bot polls every 5s, sends approval embed or rejection DM, sets it to true
- `pending_announcements` table — API inserts a row when dashboard requests a channel announcement; bot picks it up, posts embed, deletes row
- Bot token: ONLY from `DISCORD_BOT_TOKEN` env var — never from DB or dashboard
- API server has NO discord.js dependency (discord.ts deleted from api-server)

**How to apply:** Any future feature requiring bot↔API communication must use a DB table, not a direct call.
