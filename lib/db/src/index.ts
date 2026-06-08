import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export let pool = new Pool({ connectionString });
export let db = drizzle(pool, { schema });

/**
 * Switch the runtime database connection to a new URL.
 * All subsequent queries will use the new connection.
 */
export async function switchDatabase(newUrl: string): Promise<void> {
  const oldPool = pool;
  pool = new Pool({ connectionString: newUrl });
  db = drizzle(pool, { schema });
  setTimeout(() => oldPool.end().catch(() => {}), 2000);
}

export * from "./schema";
export { testDatabaseConnection, migrateToDatabase } from "./migrator";
export type { MigrationResult } from "./migrator";
