import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const pendingAnnouncementsTable = pgTable("pending_announcements", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  channelId: text("channel_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
