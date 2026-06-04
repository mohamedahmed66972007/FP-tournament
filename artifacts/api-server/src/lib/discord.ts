import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type CommandInteraction,
} from "discord.js";
import { db, tournamentsTable, questionsTable, registrationsTable, botConfigTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { logger } from "./logger";

let client: Client | null = null;

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────
const PLAYER_LABELS_AR = ["الأول", "الثاني", "الثالث", "الرابع"];
const DEFAULT_DEVICE_OPTIONS = ["PS4", "PS5", "Mobile", "PC"];

const NUM_PLAYERS: Record<string, number> = { solo: 1, duo: 2, squad: 4 };

// ──────────────────────────────────────────────────────────────
// Pending registration state (in-memory per user)
// ──────────────────────────────────────────────────────────────
interface PlayerData {
  name: string;
  playerId: string;
  device: string;
  discordId?: string;
}

interface PendingReg {
  tournamentId: number;
  tournamentType: string;
  numPlayers: number;
  players: Array<PlayerData | null>;
  deviceOptions: string[];
  teamName: string | null;
  initialInteraction?: ButtonInteraction; // stored to delete the buttons message when done
}

const pending = new Map<string, PendingReg>();

// Delete an interaction's reply after `ms` milliseconds (silent fail)
function autoDelete(interaction: ModalSubmitInteraction | ButtonInteraction, ms = 5000) {
  setTimeout(() => { interaction.deleteReply().catch(() => {}); }, ms);
}

// ──────────────────────────────────────────────────────────────
// Custom ID helpers (kept short — Discord limit 100 chars)
// ──────────────────────────────────────────────────────────────
// rp_{idx}_{tid}   = register-player button
// pm_{idx}_{tid}   = player modal customId
// tn_{tid}         = team-name button
// tnm_{tid}        = team-name modal customId

function cidPlayerBtn(idx: number, tid: number)  { return `rp_${idx}_${tid}`; }
function cidPlayerModal(idx: number, tid: number) { return `pm_${idx}_${tid}`; }
function cidTeamBtn(tid: number)                  { return `tn_${tid}`; }
function cidTeamModal(tid: number)                { return `tnm_${tid}`; }

// ──────────────────────────────────────────────────────────────
// UI builders
// ──────────────────────────────────────────────────────────────
function buildPlayerButtons(pr: PendingReg): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const btnsPerRow = 2;

  const allButtons = Array.from({ length: pr.numPlayers }, (_, i) => {
    const done = pr.players[i] !== null;
    return new ButtonBuilder()
      .setCustomId(cidPlayerBtn(i, pr.tournamentId))
      .setLabel(`${done ? "✅" : "🎮"} اللاعب ${PLAYER_LABELS_AR[i]}`)
      .setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Primary);
  });

  for (let i = 0; i < allButtons.length; i += btnsPerRow) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(allButtons.slice(i, i + btnsPerRow))
    );
  }

  return rows;
}

function buildStatusMessage(pr: PendingReg): string {
  const done = pr.players.filter(Boolean).length;
  const total = pr.numPlayers;
  const lines = [
    `**تسجيل الفريق** — (${done}/${total} لاعبين)`,
    "",
    "اضغط على زر كل لاعب لإدخال بياناته:",
  ];
  if (done === total && pr.numPlayers > 1) {
    lines.push("\n✅ أكملت جميع اللاعبين! اضغط الزر أدناه لإدخال اسم الفريق وإرسال الطلب.");
  }
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────
// Fetch device options from DB (first select-type question)
// ──────────────────────────────────────────────────────────────
async function getDeviceOptions(tournamentId: number): Promise<string[]> {
  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.tournamentId, tournamentId));

  const selectQ = questions.find(
    (q) => ["select", "radio", "multiselect"].includes(q.type) && q.options && q.options.length > 0
  );
  return selectQ?.options ?? DEFAULT_DEVICE_OPTIONS;
}

// ──────────────────────────────────────────────────────────────
// Check duplicate / capacity helpers
// ──────────────────────────────────────────────────────────────
async function checkCapacity(tournamentId: number, maxParticipants: number | null): Promise<boolean> {
  if (maxParticipants == null) return true;
  const [row] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(
      sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.status} = 'approved'`
    );
  return Number(row?.count ?? 0) < maxParticipants;
}

async function checkDuplicate(tournamentId: number, discordUserId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(
      sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.discordUserId} = ${discordUserId}`
    );
  return !!existing;
}

// ──────────────────────────────────────────────────────────────
// Save registration to DB using Arabic keys for the dashboard
// ──────────────────────────────────────────────────────────────
async function saveRegistration(pr: PendingReg, discordUserId: string, discordUsername: string) {
  const formData: Record<string, string> = {};

  if (pr.numPlayers === 1) {
    const p = pr.players[0];
    if (p) {
      formData["اسم اللاعب"]    = p.name;
      formData["آيدي اللاعب"]  = p.playerId;
      formData["الجهاز"]        = p.device;
      formData["ديسكورد اللاعب"] = discordUserId; // always the registrant
    }
  } else {
    for (let i = 0; i < pr.numPlayers; i++) {
      const p = pr.players[i];
      const label = PLAYER_LABELS_AR[i];
      if (p) {
        formData[`اسم اللاعب ${label}`]    = p.name;
        formData[`آيدي اللاعب ${label}`]   = p.playerId;
        formData[`جهاز اللاعب ${label}`]   = p.device;
        // fallback to registrant's Discord ID for player 0
        const did = p.discordId || (i === 0 ? discordUserId : "");
        if (did) formData[`ديسكورد اللاعب ${label}`] = did;
      }
    }
    if (pr.teamName) {
      formData["اسم الفريق"] = pr.teamName;
    }
  }

  await db.insert(registrationsTable).values({
    tournamentId: pr.tournamentId,
    discordUserId,
    discordUsername,
    status: "pending",
    formData,
  });
}

// ──────────────────────────────────────────────────────────────
// STEP 1 — Main register button
// ──────────────────────────────────────────────────────────────
async function handleRegistrationButton(interaction: ButtonInteraction) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!tournament) {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  if (!(await checkCapacity(tournament.id, tournament.maxParticipants))) {
    await interaction.reply({ content: "تم اكتمال عدد المشاركين.", ephemeral: true });
    return;
  }

  if (await checkDuplicate(tournament.id, interaction.user.id)) {
    await interaction.reply({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", ephemeral: true });
    return;
  }

  const numPlayers = NUM_PLAYERS[tournament.type] ?? 1;
  const deviceOptions = await getDeviceOptions(tournament.id);

  const pr: PendingReg = {
    tournamentId: tournament.id,
    tournamentType: tournament.type,
    numPlayers,
    players: Array(numPlayers).fill(null),
    deviceOptions,
    teamName: null,
  };
  pending.set(interaction.user.id, pr);

  if (numPlayers === 1) {
    // Solo — show the player modal directly (Name + ID + Device all in one)
    await interaction.showModal(buildPlayerModal(0, pr, interaction.user.id));
  } else {
    // Duo / Squad — show player buttons; store interaction to delete it when done
    pr.initialInteraction = interaction;
    await interaction.reply({
      content: buildStatusMessage(pr),
      components: [...buildPlayerButtons(pr)],
      ephemeral: true,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// STEP 2 — Player button clicked (duo/squad) → show modal directly
// ──────────────────────────────────────────────────────────────
async function handlePlayerButton(interaction: ButtonInteraction) {
  // customId: rp_{idx}_{tid}
  const [, idxStr] = interaction.customId.split("_");
  const playerIdx = parseInt(idxStr, 10);

  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  await interaction.showModal(buildPlayerModal(playerIdx, pr, interaction.user.id));
}

// ──────────────────────────────────────────────────────────────
// Build the per-player modal (Name + ID + Device — all in one)
// Note: Discord modals only support TextInput, so Device is a
//       text field with the available options shown as placeholder.
// ──────────────────────────────────────────────────────────────
function buildPlayerModal(playerIdx: number, pr: PendingReg, registrantDiscordId: string): ModalBuilder {
  const playerLabel = pr.numPlayers === 1 ? "اللاعب" : `اللاعب ${PLAYER_LABELS_AR[playerIdx]}`;
  const deviceHint  = pr.deviceOptions.join(" / ");
  const existing    = pr.players[playerIdx]; // non-null when editing

  const nameInput = new TextInputBuilder()
    .setCustomId("player_name")
    .setLabel(`اسم ${playerLabel}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("أدخل الاسم المستخدم في اللعبة");
  if (existing?.name) nameInput.setValue(existing.name);

  const idInput = new TextInputBuilder()
    .setCustomId("player_id")
    .setLabel(`آيدي ${playerLabel}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("ID");
  if (existing?.playerId) idInput.setValue(existing.playerId);

  const deviceInput = new TextInputBuilder()
    .setCustomId("player_device")
    .setLabel("الجهاز")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(deviceHint.slice(0, 100));
  if (existing?.device) deviceInput.setValue(existing.device);

  const modal = new ModalBuilder()
    .setCustomId(cidPlayerModal(playerIdx, pr.tournamentId))
    .setTitle(`بيانات ${playerLabel}`);

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(idInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(deviceInput),
  ];

  // Discord ID field only for duo/squad (so we can @mention each player in the embed)
  if (pr.numPlayers > 1) {
    const discordIdInput = new TextInputBuilder()
      .setCustomId("player_discord_id")
      .setLabel("Discord ID (للمنشن في الإعلان)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder(playerIdx === 0 ? "يتم التعبئة تلقائياً" : "الصق Discord ID الخاص باللاعب");
    const prefill = existing?.discordId ?? (playerIdx === 0 ? registrantDiscordId : "");
    if (prefill) discordIdInput.setValue(prefill);
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(discordIdInput));
  }

  modal.addComponents(...rows);
  return modal;
}

// ──────────────────────────────────────────────────────────────
// STEP 5 — Player modal submitted
// ──────────────────────────────────────────────────────────────
async function handlePlayerModalSubmit(interaction: ModalSubmitInteraction, playerIdx: number) {
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  const name     = interaction.fields.getTextInputValue("player_name");
  const playerId = interaction.fields.getTextInputValue("player_id");
  const device   = interaction.fields.getTextInputValue("player_device");
  let discordId: string | undefined;
  try { discordId = interaction.fields.getTextInputValue("player_discord_id") || undefined; } catch {}

  pr.players[playerIdx] = { name, playerId, device, discordId };

  const allDone = pr.players.every(Boolean);

  if (pr.numPlayers === 1) {
    // Solo — save immediately
    if (await checkDuplicate(pr.tournamentId, interaction.user.id)) {
      await interaction.reply({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", ephemeral: true });
      pending.delete(interaction.user.id);
      return;
    }
    await saveRegistration(pr, interaction.user.id, interaction.user.tag);
    pending.delete(interaction.user.id);
    await interaction.reply({
      content: "✅ تم إرسال طلب تسجيلك بنجاح! سيتم مراجعته قريباً.",
      ephemeral: true,
    });
    autoDelete(interaction); // disappears after 5 seconds
    return;
  }

  if (allDone) {
    // All players done — show team name button
    await interaction.reply({
      content: buildStatusMessage(pr),
      components: [
        ...buildPlayerButtons(pr),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(cidTeamBtn(pr.tournamentId))
            .setLabel("🏆 إدخال اسم الفريق وإرسال الطلب")
            .setStyle(ButtonStyle.Success)
        ),
      ],
      ephemeral: true,
    });
  } else {
    // Still players remaining — show updated status with buttons
    await interaction.reply({
      content: buildStatusMessage(pr),
      components: [...buildPlayerButtons(pr)],
      ephemeral: true,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// STEP 6 — Team name button → show modal
// ──────────────────────────────────────────────────────────────
async function handleTeamNameButton(interaction: ButtonInteraction) {
  const tid = parseInt(interaction.customId.replace("tn_", ""), 10);
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(cidTeamModal(tid))
    .setTitle("اسم الفريق");

  const teamNameInput = new TextInputBuilder()
    .setCustomId("team_name")
    .setLabel("اسم الفريق")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("أدخل اسم الفريق في البطولة");

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(teamNameInput));
  await interaction.showModal(modal);
}

// ──────────────────────────────────────────────────────────────
// STEP 7 — Team name modal submitted → save all
// ──────────────────────────────────────────────────────────────
async function handleTeamNameModalSubmit(interaction: ModalSubmitInteraction) {
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  pr.teamName = interaction.fields.getTextInputValue("team_name");

  if (await checkDuplicate(pr.tournamentId, interaction.user.id)) {
    await interaction.reply({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", ephemeral: true });
    pending.delete(interaction.user.id);
    return;
  }

  const initialInt = pr.initialInteraction;
  await saveRegistration(pr, interaction.user.id, interaction.user.tag);
  pending.delete(interaction.user.id);

  await interaction.reply({
    content: "✅ تم إرسال طلب تسجيل فريقك بنجاح! سيتم مراجعته قريباً.",
    ephemeral: true,
  });

  // Delete success message + original buttons message after 5 seconds
  autoDelete(interaction);
  if (initialInt) setTimeout(() => { initialInt.deleteReply().catch(() => {}); }, 5000);
}

// ──────────────────────────────────────────────────────────────
// Approval embed
// ──────────────────────────────────────────────────────────────
export async function sendApprovalEmbed(
  registration: typeof registrationsTable.$inferSelect,
  tournament: typeof tournamentsTable.$inferSelect,
  _questions: (typeof questionsTable.$inferSelect)[]
) {
  if (!client) return;

  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config?.announcementChannelId) return;

  const channel = await client.channels.fetch(config.announcementChannelId);
  if (!channel || !channel.isTextBased()) return;

  const formData = registration.formData as Record<string, string>;

  const embed = new EmbedBuilder()
    .setTitle("✅ تم قبول تسجيل جديد")
    .setColor(0x57f287)
    .setDescription(
      `<@${registration.discordUserId}> تم قبول تسجيلك في بطولة **${tournament.name}**`
    )
    .setTimestamp();

  // Format: group each player's data as "@mention الاسم#الآيدي" + device on next line
  if (formData["اسم اللاعب"]) {
    // Solo — registrant is always the player
    const name    = formData["اسم اللاعب"]    || "—";
    const id      = formData["آيدي اللاعب"]   || "—";
    const device  = formData["الجهاز"]         || "—";
    const did     = formData["ديسكورد اللاعب"] || registration.discordUserId;
    const mention = did ? `<@${did}> ` : "";
    embed.addFields({ name: "اللاعب", value: `${mention}${name}#${id}\n${device}`, inline: false });
  } else {
    // Duo / Squad — iterate players in order
    for (let i = 0; i < PLAYER_LABELS_AR.length; i++) {
      const label  = PLAYER_LABELS_AR[i];
      const name   = formData[`اسم اللاعب ${label}`];
      if (!name) break; // no more players
      const id      = formData[`آيدي اللاعب ${label}`]   || "—";
      const device  = formData[`جهاز اللاعب ${label}`]   || "—";
      const did     = formData[`ديسكورد اللاعب ${label}`];
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
// Rejection DM
// ──────────────────────────────────────────────────────────────
export async function sendRejectionDM(
  discordUserId: string,
  tournamentName: string,
  reason: string | null
) {
  if (!client) return;
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
// Registration announcement message (with register button)
// ──────────────────────────────────────────────────────────────
export async function sendRegistrationMessage(
  tournamentId: number,
  channelId: string
): Promise<void> {
  if (!client) throw new Error("Discord bot not connected");

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
  if (!t) throw new Error("Tournament not found");

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${t.name}`)
    .setColor(0x5865f2)
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.")
    .addFields(
      { name: "نوع البطولة", value: typeLabels[t.type] ?? t.type, inline: true },
      { name: "عدد المشاركين", value: t.maxParticipants != null ? `${t.maxParticipants}` : "غير محدود", inline: true },
      ...(t.prize ? [{ name: "الجائزة", value: t.prize, inline: true }] : [])
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("register_tournament")
      .setLabel("🎮  التسجيل في البطولة")
      .setStyle(ButtonStyle.Primary)
  );

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error("Channel not found or not text-based");

  await (channel as any).send({ embeds: [embed], components: [row] });
}

// ──────────────────────────────────────────────────────────────
// /tournament command
// ──────────────────────────────────────────────────────────────
async function handleTournamentCommand(interaction: CommandInteraction) {
  const [t] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!t) {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${t.name}`)
    .setColor(0x5865f2)
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.")
    .addFields(
      { name: "نوع البطولة", value: typeLabels[t.type] ?? t.type, inline: true },
      { name: "عدد المشاركين", value: t.maxParticipants != null ? `${t.maxParticipants}` : "غير محدود", inline: true },
      ...(t.prize ? [{ name: "الجائزة", value: t.prize, inline: true }] : [])
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("register_tournament")
      .setLabel("🎮  التسجيل في البطولة")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

export function getClient(): Client | null {
  return client;
}

async function getBotToken(): Promise<string | null> {
  try {
    const [config] = await db.select().from(botConfigTable).limit(1);
    if (config?.botToken) return config.botToken;
  } catch {}
  return process.env.DISCORD_BOT_TOKEN ?? null;
}

// ──────────────────────────────────────────────────────────────
// Bot init
// ──────────────────────────────────────────────────────────────
export async function initDiscordBot() {
  const token = await getBotToken();
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — Discord bot disabled");
    return;
  }

  if (client) {
    try { client.destroy(); } catch {}
    client = null;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMessages,
    ],
  });

  client.once("ready", async () => {
    logger.info({ tag: client!.user?.tag }, "Discord bot ready");

    const rest = new REST({ version: "10" }).setToken(token);
    const commands = [
      new SlashCommandBuilder().setName("tournament").setDescription("عرض البطولة الحالية والتسجيل"),
      new SlashCommandBuilder().setName("بطولة").setDescription("عرض البطولة الحالية والتسجيل"),
    ].map((cmd) => cmd.toJSON());

    try {
      await rest.put(Routes.applicationCommands(client!.user!.id), { body: commands });
      logger.info("Slash commands registered");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // ── Slash commands ──
      if (interaction.isCommand()) {
        const name = interaction.commandName;
        if (name === "tournament" || name === "بطولة") {
          await handleTournamentCommand(interaction as CommandInteraction);
        }
        return;
      }

      // ── Buttons ──
      if (interaction.isButton()) {
        const cid = (interaction as ButtonInteraction).customId;

        if (cid === "register_tournament") {
          await handleRegistrationButton(interaction as ButtonInteraction);
        } else if (cid.startsWith("rp_")) {
          await handlePlayerButton(interaction as ButtonInteraction);
        } else if (cid.startsWith("tn_")) {
          await handleTeamNameButton(interaction as ButtonInteraction);
        }
        return;
      }

      // ── Modals ──
      if (interaction.isModalSubmit()) {
        const cid = (interaction as ModalSubmitInteraction).customId;

        if (cid.startsWith("pm_")) {
          // pm_{playerIdx}_{tid}
          const parts = cid.split("_");
          const playerIdx = parseInt(parts[1], 10);
          await handlePlayerModalSubmit(interaction as ModalSubmitInteraction, playerIdx);
        } else if (cid.startsWith("tnm_")) {
          await handleTeamNameModalSubmit(interaction as ModalSubmitInteraction);
        }
      }
    } catch (err) {
      logger.error({ err }, "Discord interaction error");
    }
  });

  try {
    await client.login(token);
  } catch (err) {
    logger.error({ err }, "Discord bot login failed");
  }
}

export async function reloadDiscordBot() {
  await initDiscordBot();
}
