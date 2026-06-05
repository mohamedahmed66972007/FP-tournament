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

## Architecture — Separated Bot & API

The Discord bot is fully decoupled from the API server and dashboard:

```
Discord Bot (artifacts/discord-bot)         ← runs on separate 24/7 server
  ├── DISCORD_BOT_TOKEN from env only
  ├── Direct DB connection (DATABASE_URL)
  ├── Handles /tournament command + registration flow
  ├── Saves registrations to DB immediately
  └── Polls DB every 5s:
        • registrations (status != pending AND notificationSent = false)
          → sends approval embed or rejection DM → marks notificationSent = true
        • pending_announcements table
          → posts tournament embed in channel → deletes row

API Server (artifacts/api-server)           ← stateless REST API
  ├── CRUD for tournaments, registrations, questions
  ├── Approve/reject: updates DB only (notificationSent = false)
  ├── Send announcement: inserts into pending_announcements
  └── NO Discord code — bot is completely independent

Dashboard (artifacts/dashboard)             ← can restart without affecting bot
  ├── Reads all data from API/DB
  ├── Bot config page: only guildId + announcementChannelId (no token)
  └── Token is env var on bot server only
```

## Key DB Tables

- `registrations.notificationSent` — false until bot sends approval embed / rejection DM
- `pending_announcements` — queued tournament announcements for the bot to post

## Architecture decisions

- Bot and API share the same `DATABASE_URL` — only way they communicate
- Only one tournament can be active at a time — activating one auto-deactivates others
- Discord modals support max 5 fields — questions beyond 5 are silently ignored in the bot modal
- Approval sends an embed to the configured announcement channel; rejection sends a DM
- Bot token is NEVER stored in DB or passed through dashboard — env var only
- Bot polling interval: 5 seconds (configurable via code)

## Deployment

- **API Server**: Deploy with `DATABASE_URL` env var. No Discord env var needed.
- **Discord Bot**: Deploy separately with both `DATABASE_URL` AND `DISCORD_BOT_TOKEN`. Must be 24/7.
- **Dashboard**: Deploy as a static site or Vite SSR. Connects to API server only.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` after any `lib/*` change before checking artifact packages
- Run `pnpm --filter @workspace/api-spec run codegen` after any openapi.yaml change
- Discord modals are limited to 5 text inputs maximum
- The `ready` event is deprecated in discord.js v14 — use `clientReady` in future versions
- Bot only reads `announcementChannelId` from `bot_config` table; token is env var only

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
