import { db, botConfigTable, registrationsTable, tournamentsTable } from "@workspace/db";
import { logger } from "./logger";

const DISCORD_API = "https://discord.com/api/v10";
const PLAYER_LABELS_AR = ["الأول", "الثاني", "الثالث", "الرابع"];

async function getToken(): Promise<string | null> {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  const [config] = await db.select().from(botConfigTable).limit(1);
  return config?.botToken ?? null;
}

async function discordFetch(
  token: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// Send approval embed to announcement channel
// ──────────────────────────────────────────────────────────────
export async function sendApprovalEmbed(
  registration: typeof registrationsTable.$inferSelect,
  tournament: typeof tournamentsTable.$inferSelect
): Promise<void> {
  const token = await getToken();
  if (!token) { logger.warn("No bot token configured — skipping approval embed"); return; }

  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config?.announcementChannelId) {
    logger.warn("No announcement channel configured — skipping approval embed");
    return;
  }

  const formData = registration.formData as Record<string, string>;

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  if (formData["اسم اللاعب"]) {
    const name   = formData["اسم اللاعب"] || "—";
    const id     = formData["آيدي اللاعب"] || "—";
    const device = formData["الجهاز"] || "—";
    const did    = formData["ديسكورد اللاعب"] || registration.discordUserId;
    const mention = did ? `<@${did}> ` : "";
    fields.push({ name: "اللاعب", value: `${mention}${name}#${id}\n${device}`, inline: false });
  } else {
    for (let i = 0; i < PLAYER_LABELS_AR.length; i++) {
      const label = PLAYER_LABELS_AR[i];
      const name  = formData[`اسم اللاعب ${label}`];
      if (!name) break;
      const id     = formData[`آيدي اللاعب ${label}`] || "—";
      const device = formData[`جهاز اللاعب ${label}`] || "—";
      const did    = formData[`ديسكورد اللاعب ${label}`];
      const mention = did ? `<@${did}> ` : "";
      fields.push({ name: `اللاعب ${label}`, value: `${mention}${name}#${id}\n${device}`, inline: true });
    }
    if (formData["اسم الفريق"]) {
      fields.push({ name: "اسم الفريق", value: formData["اسم الفريق"], inline: false });
    }
  }

  const embed = {
    title: "✅ تم قبول تسجيل جديد",
    color: 0x57f287,
    description: `<@${registration.discordUserId}> تم قبول تسجيلك في بطولة **${tournament.name}**`,
    fields,
    timestamp: new Date().toISOString(),
  };

  await discordFetch(token, `/channels/${config.announcementChannelId}/messages`, { embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
// Send rejection DM to user
// ──────────────────────────────────────────────────────────────
export async function sendRejectionDM(
  discordUserId: string,
  tournamentName: string,
  reason: string | null
): Promise<void> {
  const token = await getToken();
  if (!token) { logger.warn("No bot token configured — skipping rejection DM"); return; }

  const msg = reason
    ? `تم رفض طلب تسجيلك في بطولة ${tournamentName}.\n\nالسبب:\n${reason}`
    : `تم رفض طلب تسجيلك في بطولة ${tournamentName}.`;

  const dmChannel = await discordFetch(token, "/users/@me/channels", { recipient_id: discordUserId }) as { id: string };
  await discordFetch(token, `/channels/${dmChannel.id}/messages`, { content: msg });
}

// ──────────────────────────────────────────────────────────────
// Send tournament announcement embed with register button
// ──────────────────────────────────────────────────────────────
export async function sendAnnouncementEmbed(
  tournament: typeof tournamentsTable.$inferSelect,
  channelId: string
): Promise<void> {
  const token = await getToken();
  if (!token) { logger.warn("No bot token configured — skipping announcement"); return; }

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

  const fields = [
    { name: "نوع البطولة", value: typeLabels[tournament.type] ?? tournament.type, inline: true },
    { name: "عدد المشاركين", value: tournament.maxParticipants != null ? `${tournament.maxParticipants}` : "غير محدود", inline: true },
    ...(tournament.prize ? [{ name: "الجائزة", value: tournament.prize, inline: true }] : []),
  ];

  const embed = {
    title: `🏆  ${tournament.name}`,
    color: 0x5865f2,
    description: "اضغط على الزر أدناه للتسجيل في البطولة.",
    fields,
    timestamp: new Date().toISOString(),
  };

  const components = [{
    type: 1,
    components: [{
      type: 2,
      style: 1,
      custom_id: "register_tournament",
      label: "🎮  التسجيل في البطولة",
    }],
  }];

  await discordFetch(token, `/channels/${channelId}/messages`, { embeds: [embed], components });
}
