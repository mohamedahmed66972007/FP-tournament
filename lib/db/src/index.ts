import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { readFileSync, writeFileSync, existsSync, renameSync, chmodSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";

// Persisted URL file — owner-read-only (0o600) plaintext cache.
// Lives in home dir so it survives server restarts regardless of cwd.
const DB_URL_CACHE = join(homedir(), ".fp-tournament-db-url");

function isValidPostgresUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "postgresql:" || u.protocol === "postgres:";
  } catch {
    return false;
  }
}

function readCachedUrl(): string | null {
  try {
    if (!existsSync(DB_URL_CACHE)) return null;
    const url = readFileSync(DB_URL_CACHE, "utf-8").trim();
    if (!isValidPostgresUrl(url)) return null;
    return url;
  } catch {
    return null;
  }
}

function writeCachedUrl(url: string): void {
  // Atomic write: write to a temp file first, then rename into place.
  // This prevents partial/corrupt writes on crash mid-write.
  const tmp = join(tmpdir(), `.fp-tournament-db-url.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, url, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, DB_URL_CACHE);
    // Ensure restrictive perms even if umask is loose.
    chmodSync(DB_URL_CACHE, 0o600);
  } catch (err) {
    console.error("[db] Failed to persist database URL:", err);
    try { writeFileSync(tmp, "", "utf-8"); } catch { /* ignore cleanup error */ }
  }
}

// Resolution order:
//   1. Cached file (last URL explicitly set by the user via switchDatabase)
//   2. NEON_DATABASE_URL env var
//   3. DATABASE_URL env var
const connectionString =
  readCachedUrl() ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export let db = drizzle(neon(connectionString), { schema });

/**
 * Switch the runtime database connection to a new URL and persist it
 * so the next server restart uses the same database automatically.
 */
export async function switchDatabase(newUrl: string): Promise<void> {
  if (!isValidPostgresUrl(newUrl)) {
    throw new Error("Invalid PostgreSQL URL provided to switchDatabase");
  }
  db = drizzle(neon(newUrl), { schema });
  writeCachedUrl(newUrl);
}

export * from "./schema";
export { testDatabaseConnection, migrateToDatabase } from "./migrator";
export type { MigrationResult } from "./migrator";
export { eq, ne, and, or, sql, count, inArray, isNull, isNotNull, asc, desc, gt, gte, lt, lte } from "drizzle-orm";
