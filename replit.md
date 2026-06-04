# Discord Tournament Bot — لوحة تحكم البطولات

بوت Discord متكامل لإدارة بطولات الألعاب مع لوحة تحكم ويب احترافية.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 5000)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `DISCORD_BOT_TOKEN` — Discord bot token (secret)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Discord: discord.js v14
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — DB tables: tournaments, questions, registrations, botConfig
- `artifacts/api-server/src/routes/` — API routes
- `artifacts/api-server/src/lib/discord.ts` — Discord bot logic
- `artifacts/dashboard/src/` — React frontend

## Architecture decisions

- Discord bot runs inside the same process as the Express API server (spawned in `index.ts`)
- Only one tournament can be active at a time — activating one auto-deactivates others
- Discord modals support max 5 fields — questions beyond 5 are silently ignored in the bot modal
- Approval sends an embed to the configured announcement channel; rejection sends a DM
- Bot token stored as a secret (`DISCORD_BOT_TOKEN`) — never commit it

## Product

- Dashboard: create/manage tournaments (Solo/Duo/Squad), toggle active status, edit registration questions (text/number/select/multiselect/radio), review and approve/reject registrations, configure bot channel
- Discord: `/tournament` slash command shows active tournament embed with a registration button, players fill a modal, submissions appear in dashboard for admin review

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` after any `lib/*` change before checking artifact packages
- Run `pnpm --filter @workspace/api-spec run codegen` after any openapi.yaml change
- Discord modals are limited to 5 text inputs maximum
- The `ready` event is deprecated in discord.js v14 — use `clientReady` in future versions

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
