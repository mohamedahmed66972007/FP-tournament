# Discord Tournament Bot — لوحة تحكم البطولات

بوت Discord متكامل لإدارة بطولات الألعاب مع لوحة تحكم ويب احترافية.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server only (port 8080)
- `pnpm --filter @workspace/discord-bot run dev` — run the standalone Discord bot (needs `DISCORD_BOT_TOKEN`)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env (API + Bot): `DATABASE_URL` — Postgres connection string
- Required env (Bot only): `DISCORD_BOT_TOKEN` — Discord bot token (set on bot server, NOT in dashboard)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Discord: discord.js v14
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — DB tables: tournaments, questions, registrations, botConfig, pendingAnnouncements
- `artifacts/api-server/src/routes/` — API routes (no Discord code)
- `artifacts/discord-bot/src/` — Standalone Discord bot (bot.ts + notifications.ts)
- `artifacts/dashboard/src/` — React frontend

## Architecture — Separated Bot & API (event-driven, no polling)

```
Discord Bot (artifacts/discord-bot)         ← runs on separate 24/7 server
  ├── DISCORD_BOT_TOKEN from env only
  ├── Direct DB connection (DATABASE_URL)
  ├── Handles /tournament command + registration flow
  └── Saves registrations to DB — that's it, no polling

API Server (artifacts/api-server)           ← stateless REST API
  ├── CRUD for tournaments, registrations, questions
  ├── Approve: updates DB → sends Discord embed directly via REST API
  ├── Reject: updates DB → sends Discord DM directly via REST API
  ├── Send announcement: sends Discord embed directly via REST API
  └── discordNotifier.ts — reads token from env or DB bot_config.botToken

Dashboard (artifacts/dashboard)             ← can restart without affecting bot
  ├── Reads all data from API/DB
  ├── Bot config page: guildId + announcementChannelId + botToken (write-only field)
  └── Bot token stored in DB (used by API); also stays as env var on bot server
```

## Key DB Tables

- `registrations.notificationSent` — set true immediately by API after sending Discord notification
- `pending_announcements` — legacy table; no longer used (bot no longer polls it)
- `bot_config.botToken` — stored by dashboard UI, used by API server to call Discord REST

## Architecture decisions

- Bot and API share the same `DATABASE_URL`
- Only one tournament can be active at a time — activating one auto-deactivates others
- Discord modals support max 5 fields — questions beyond 5 are silently ignored in the bot modal
- Approval sends an embed to the configured announcement channel; rejection sends a DM
- Bot token stored in DB (for API use) AND as env var on bot server (for gateway connection)
- API sends Discord notifications directly using Discord REST API (fetch, no discord.js)
- GET /bot/config always returns `botToken: null` — write-only, never exposed via API
- DB uses `@neondatabase/serverless` neon-http driver — auto-suspends between queries

## Deployment

- **API Server**: Deploy with `DATABASE_URL`. Add `DISCORD_BOT_TOKEN` as env var OR save it via dashboard bot-config page.
- **Discord Bot**: Deploy separately with both `DATABASE_URL` AND `DISCORD_BOT_TOKEN`. Must be 24/7. No polling code runs.
- **Dashboard**: Deploy as a static site or Vite SSR. Connects to API server only.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Database URL Persistence

When the user switches the database via the "ترحيل قاعدة البيانات" UI (which calls `switchDatabase()`), the new URL is written atomically to `~/.fp-tournament-db-url` with owner-read-only permissions (0o600). On the next server restart, this cached file is read first (before `NEON_DATABASE_URL`/`DATABASE_URL` env vars), so the database connection is restored automatically. If the file is deleted or corrupt, the server falls back to env vars cleanly.

## Gotchas

- Run `pnpm run typecheck:libs` after any `lib/*` change before checking artifact packages
- Run `pnpm --filter @workspace/api-spec run codegen` after any openapi.yaml change
- Discord modals are limited to 5 text inputs maximum
- The `ready` event is deprecated in discord.js v14 — use `clientReady` in future versions
- Bot only reads `announcementChannelId` from `bot_config` table; token is env var only (on bot server)
- API server reads bot token from env `DISCORD_BOT_TOKEN` first, then falls back to `bot_config.botToken` in DB
- `discordNotifier.ts` uses Discord REST API v10 with Node.js built-in fetch — no discord.js in API server

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
