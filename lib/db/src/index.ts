import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export let db = drizzle(neon(connectionString), { schema });

/**
 * Switch the runtime database connection to a new URL.
 * Uses HTTP driver — no persistent connections, DB can sleep between queries.
 */
export async function switchDatabase(newUrl: string): Promise<void> {
  db = drizzle(neon(newUrl), { schema });
}

export * from "./schema";
export { testDatabaseConnection, migrateToDatabase } from "./migrator";
export type { MigrationResult } from "./migrator";
