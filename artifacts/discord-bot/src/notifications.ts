import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from "discord.js";
import {
  db,
  registrationsTable,
  tournamentsTable,
  botConfigTable,
  pendingAnnouncementsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getClient } from "./bot.js";
import { logger } from "./logger.js";

const PLAYER_LABELS_AR = ["الأول", "الثاني", "الثالث", "الرابع"];

// ──────────────────────────────────────────────────────────────
// Send approval embed to announcement channel
// ──────────────────────────────────────────────────────────────
async function sendApprovalEmbed(
  client: Client,
  registration: typeof registrationsTable.$inferSelect,
  tournament: typeof tournamentsTable.$inferSelect
) {
  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config?.announcementChannelId) {
    logger.warn("No announcement channel configured — skipping approval embed");
    return;
  }

  const channel = await client.channels.fetch(config.announcementChannelId);
  if (!channel || !channel.isTextBased()) return;

  const formData = registration.formData as Record<string, string>;

  const embed = new EmbedBuilder()
    .setTitle("✅ تم قبول تسجيل جديد")
    .setColor(0x57f287)
    .setDescription(`<@${registration.discordUserId}> تم قبول تسجيلك في بطولة **${tournament.name}**`)
    .setTimestamp();

  if (formData["اسم اللاعب"]) {
    const name    = formData["اسم اللاعب"] || "—";
    const id      = formData["آيدي اللاعب"] || "—";
    const device  = formData["الجهاز"] || "—";
    const did     = formData["ديسكورد اللاعب"] || registration.discordUserId;
    const mention = did ? `<@${did}> ` : "";
    embed.addFields({ name: "اللاعب", value: `${mention}${name}#${id}\n${device}`, inline: false });
  } else {
    for (let i = 0; i < PLAYER_LABELS_AR.length; i++) {
      const label  = PLAYER_LABELS_AR[i];
      const name   = formData[`اسم اللاعب ${label}`];
      if (!name) break;
      const id     = formData[`آيدي اللاعب ${label}`] || "—";
      const device = formData[`جهاز اللاعب ${label}`] || "—";
      const did    = formData[`ديسكورد اللاعب ${label}`];
      const mention = did ? `<@${did}> ` : "";
      embed.addFields({ name: `اللاعب ${label}`, value: `${mention}${name}#${id}\n${device}`, inline: true });
    }
    if (formData["اسم الفريق"]) {
      embed.addFields({ name: "اسم الفريق", value: formData["اسم الفريق"], inline: false });
    }
  }

  await (channel as any).send({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
// Send rejection DM to user
// ──────────────────────────────────────────────────────────────
async function sendRejectionDM(
  client: Client,
  discordUserId: string,
  tournamentName: string,
  reason: string | null
) {
  try {
    const user = await client.users.fetch(discordUserId);
    const msg = reason
      ? `تم رفض طلب تسجيلك في بطولة ${tournamentName}.\n\nالسبب:\n${reason}`
      : `تم رفض طلب تسجيلك في بطولة ${tournamentName}.`;
    await user.send(msg);
  } catch (err) {
    logger.warn({ err, discordUserId }, "Could not send DM to user");
  }
}

// ──────────────────────────────────────────────────────────────
// Poll DB for registrations that need Discord notifications
// ──────────────────────────────────────────────────────────────
async function processNotifications(client: Client) {
  const pending = await db
    .select()
    .from(registrationsTable)
    .where(
      sql`${registrationsTable.status} != 'pending' AND ${registrationsTable.notificationSent} = false`
    );

  for (const reg of pending) {
    try {
      const [tournament] = await db
        .select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, reg.tournamentId));

      if (reg.status === "approved" && tournament) {
        await sendApprovalEmbed(client, reg, tournament);
      } else if (reg.status === "rejected") {
        const tournamentName = tournament?.name ?? "البطولة";
        await sendRejectionDM(client, reg.discordUserId, tournamentName, reg.rejectionReason ?? null);
      }

      await db
        .update(registrationsTable)
        .set({ notificationSent: true })
        .where(eq(registrationsTable.id, reg.id));

      logger.info({ regId: reg.id, status: reg.status }, "Notification sent");
    } catch (err) {
      logger.error({ err, regId: reg.id }, "Failed to process notification — will retry next cycle");
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Poll DB for pending tournament announcement messages
// ──────────────────────────────────────────────────────────────
async function processAnnouncements(client: Client) {
  const pending = await db.select().from(pendingAnnouncementsTable);

  for (const ann of pending) {
    try {
      const [tournament] = await db
        .select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, ann.tournamentId));

      if (!tournament) {
        await db.delete(pendingAnnouncementsTable).where(eq(pendingAnnouncementsTable.id, ann.id));
        continue;
      }

      const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

      const embed = new EmbedBuilder()
        .setTitle(`🏆  ${tournament.name}`)
        .setColor(0x5865f2)
        .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.")
        .addFields(
          { name: "نوع البطولة", value: typeLabels[tournament.type] ?? tournament.type, inline: true },
          { name: "عدد المشاركين", value: tournament.maxParticipants != null ? `${tournament.maxParticipants}` : "غير محدود", inline: true },
          ...(tournament.prize ? [{ name: "الجائزة", value: tournament.prize, inline: true }] : [])
        )
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("register_tournament")
          .setLabel("🎮  التسجيل في البطولة")
          .setStyle(ButtonStyle.Primary)
      );

      const channel = await client.channels.fetch(ann.channelId);
      if (channel && channel.isTextBased()) {
        await (channel as any).send({ embeds: [embed], components: [row] });
        logger.info({ annId: ann.id, channelId: ann.channelId }, "Announcement sent");
      }

      await db.delete(pendingAnnouncementsTable).where(eq(pendingAnnouncementsTable.id, ann.id));
    } catch (err) {
      logger.error({ err, annId: ann.id }, "Failed to process announcement");
      await db.delete(pendingAnnouncementsTable).where(eq(pendingAnnouncementsTable.id, ann.id)).catch(() => {});
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Start the poller (every 5 minutes — DB sleeps between polls)
// ──────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startNotificationPoller() {
  logger.info("Notification poller started (5min interval)");

  setInterval(async () => {
    const client = getClient();
    if (!client?.isReady()) return;

    await processNotifications(client).catch((err) =>
      logger.error({ err }, "Notification poller error")
    );
    await processAnnouncements(client).catch((err) =>
      logger.error({ err }, "Announcement poller error")
    );
  }, POLL_INTERVAL_MS);
}
