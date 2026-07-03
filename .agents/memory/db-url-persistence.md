---
name: DB URL persistence via cached file
description: How the active database URL is persisted across server restarts in fp-tournament.
---

# DB URL persistence

## Rule
`switchDatabase(url)` in `lib/db/src/index.ts` writes the new URL to `~/.fp-tournament-db-url` (atomic write via tmp+rename, permissions 0o600). On startup, this file is read first before `NEON_DATABASE_URL`/`DATABASE_URL` env vars. If the file is missing or corrupt, startup falls back to env vars cleanly.

**Why:** The "ترحيل قاعدة البيانات" UI calls `switchDatabase()` which previously only changed the in-memory `db` variable — losing the setting on restart. Users were forced to re-enter the URL every time.

**How to apply:** Any future change to `switchDatabase()` must also update `writeCachedUrl()`. If the cache file needs to be cleared (e.g. to force env var usage), delete `~/.fp-tournament-db-url` on the server.

## Security note
The endpoints that trigger `switchDatabase()` (`/api/database/test-connection`, `/api/database/migrate`) are currently unauthenticated — this is a known gap tracked as a follow-up task. The cache file itself is protected with 0o600 permissions.
