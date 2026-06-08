---
name: Drizzle-orm version conflict in discord-bot
description: How to prevent dual-instance drizzle-orm type errors in the discord-bot package.
---

When `lib/db` uses `@neondatabase/serverless`, pnpm resolves TWO drizzle-orm instances:
- `drizzle-orm@0.45.2_@neondatabase+serverless@1.1.0_...` (used by lib/db)
- `drizzle-orm@0.45.2_@types+pg@8.20.0_pg@8.20.0` (used by direct dep in discord-bot)

These cause `Types have separate declarations of a private property 'shouldInlineParams'` errors in tsc.

**Fix:** Remove `"drizzle-orm": "catalog:"` from `artifacts/discord-bot/package.json`.
Then change `import { eq, count, sql } from "drizzle-orm"` in `bot.ts` to `import { eq, count, sql } from "@workspace/db"`.
Also add the re-exports to `lib/db/src/index.ts`:
```ts
export { eq, ne, and, or, sql, count, inArray, isNull, isNotNull, asc, desc, gt, gte, lt, lte } from "drizzle-orm";
```

**Why:** pnpm deduplicates by peer-dep hash. Two drizzle-orm instances with different peer deps are treated as different modules — TypeScript sees their private properties as distinct, causing assignment errors.

**How to apply:** Any workspace package that uses `@workspace/db` should NOT also directly depend on `drizzle-orm` in its package.json.
