import pg from "pg";
import {
  tournamentsTable,
  questionsTable,
  registrationsTable,
  botConfigTable,
  pendingAnnouncementsTable,
} from "./schema";
import { db, switchDatabase } from "./index";

const { Pool } = pg;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  max_participants INTEGER,
  prize TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  options TEXT[],
  "order" INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  form_data JSONB NOT NULL DEFAULT '{}',
  rejection_reason TEXT,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_config (
  id SERIAL PRIMARY KEY,
  announcement_channel_id TEXT,
  guild_id TEXT,
  bot_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_announcements (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export interface MigrationResult {
  tournaments: number;
  questions: number;
  registrations: number;
  botConfig: number;
  pendingAnnouncements: number;
}

export async function testDatabaseConnection(url: string): Promise<void> {
  const testPool = new Pool({ connectionString: url });
  try {
    await testPool.query("SELECT 1");
  } finally {
    await testPool.end().catch(() => {});
  }
}

export async function migrateToDatabase(newUrl: string): Promise<MigrationResult> {
  // 1. Fetch all data from current database
  const [tournaments, questions, registrations, botConfigs, pendingAnn] = await Promise.all([
    db.select().from(tournamentsTable),
    db.select().from(questionsTable),
    db.select().from(registrationsTable),
    db.select().from(botConfigTable),
    db.select().from(pendingAnnouncementsTable),
  ]);

  // 2. Connect to new database and create schema
  const newPool = new Pool({ connectionString: newUrl });

  try {
    await newPool.query(CREATE_TABLES_SQL);

    // 3. Copy data in dependency order

    if (tournaments.length > 0) {
      for (const t of tournaments) {
        await newPool.query(
          `INSERT INTO tournaments (id, name, type, status, max_participants, prize, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             name=$2, type=$3, status=$4, max_participants=$5, prize=$6, updated_at=$8`,
          [t.id, t.name, t.type, t.status, t.maxParticipants ?? null, t.prize ?? null, t.createdAt, t.updatedAt]
        );
      }
      await newPool.query(
        `SELECT setval('tournaments_id_seq', (SELECT COALESCE(MAX(id), 0) FROM tournaments))`
      );
    }

    if (questions.length > 0) {
      for (const q of questions) {
        await newPool.query(
          `INSERT INTO questions (id, tournament_id, label, type, options, "order", required, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             tournament_id=$2, label=$3, type=$4, options=$5, "order"=$6, required=$7`,
          [q.id, q.tournamentId, q.label, q.type, q.options ?? null, q.order, q.required, q.createdAt]
        );
      }
      await newPool.query(
        `SELECT setval('questions_id_seq', (SELECT COALESCE(MAX(id), 0) FROM questions))`
      );
    }

    if (registrations.length > 0) {
      for (const r of registrations) {
        await newPool.query(
          `INSERT INTO registrations (id, tournament_id, discord_user_id, discord_username, status, form_data, rejection_reason, notification_sent, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             status=$5, form_data=$6, rejection_reason=$7, notification_sent=$8, updated_at=$10`,
          [r.id, r.tournamentId, r.discordUserId, r.discordUsername, r.status, JSON.stringify(r.formData), r.rejectionReason ?? null, r.notificationSent, r.createdAt, r.updatedAt]
        );
      }
      await newPool.query(
        `SELECT setval('registrations_id_seq', (SELECT COALESCE(MAX(id), 0) FROM registrations))`
      );
    }

    if (botConfigs.length > 0) {
      for (const c of botConfigs) {
        await newPool.query(
          `INSERT INTO bot_config (id, announcement_channel_id, guild_id, bot_token, updated_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET
             announcement_channel_id=$2, guild_id=$3, bot_token=$4, updated_at=$5`,
          [c.id, c.announcementChannelId ?? null, c.guildId ?? null, c.botToken ?? null, c.updatedAt]
        );
      }
      await newPool.query(
        `SELECT setval('bot_config_id_seq', (SELECT COALESCE(MAX(id), 0) FROM bot_config))`
      );
    }

    if (pendingAnn.length > 0) {
      for (const a of pendingAnn) {
        await newPool.query(
          `INSERT INTO pending_announcements (id, tournament_id, channel_id, created_at)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET tournament_id=$2, channel_id=$3`,
          [a.id, a.tournamentId, a.channelId, a.createdAt]
        );
      }
      await newPool.query(
        `SELECT setval('pending_announcements_id_seq', (SELECT COALESCE(MAX(id), 0) FROM pending_announcements))`
      );
    }

    // 4. Close temporary pool, switch runtime connection
    await newPool.end().catch(() => {});
    await switchDatabase(newUrl);

    return {
      tournaments: tournaments.length,
      questions: questions.length,
      registrations: registrations.length,
      botConfig: botConfigs.length,
      pendingAnnouncements: pendingAnn.length,
    };
  } catch (err) {
    await newPool.end().catch(() => {});
    throw err;
  }
}
