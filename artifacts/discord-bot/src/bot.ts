import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type CommandInteraction,
  type UserSelectMenuInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, tournamentsTable, questionsTable, registrationsTable } from "@workspace/db";
import { eq, count, sql } from "@workspace/db";
import { logger } from "./logger.js";

let client: Client | null = null;

export function getClient(): Client | null {
  return client;
}

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
  lastReplyInteraction?: ButtonInteraction | ModalSubmitInteraction;
}

const pending = new Map<string, PendingReg>();

function autoDelete(interaction: ModalSubmitInteraction | ButtonInteraction, ms = 5000) {
  setTimeout(() => { interaction.deleteReply().catch(() => {}); }, ms);
}

// ──────────────────────────────────────────────────────────────
// Custom ID helpers
// ──────────────────────────────────────────────────────────────
function cidPlayerBtn(idx: number, tid: number)    { return `rp_${idx}_${tid}`; }
function cidPlayerModal(idx: number, tid: number)  { return `pm_${idx}_${tid}`; }
function cidPlayerSelect(idx: number, tid: number) { return `ps_${idx}_${tid}`; }
function cidTeamBtn(tid: number)                   { return `tn_${tid}`; }
function cidTeamModal(tid: number)                 { return `tnm_${tid}`; }

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
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(allButtons.slice(i, i + btnsPerRow)));
  }
  return rows;
}

function buildStatusMessage(pr: PendingReg): string {
  const done = pr.players.filter(Boolean).length;
  const total = pr.numPlayers;
  return `**تسجيل الفريق** — (${done}/${total} لاعبين)\n\nاضغط على زر كل لاعب لإدخال بياناته:`;
}

function buildAllSelectsContent(pr: PendingReg): string {
  const lines = [`👥 **اختر أعضاء الفريق من السيرفر** لمنشنتهم في إعلان القبول:\n`];
  for (let i = 0; i < pr.numPlayers; i++) {
    const label = PLAYER_LABELS_AR[i];
    const did = pr.players[i]?.discordId;
    lines.push(`اللاعب ${label}: ${did ? `✅ <@${did}>` : "⏳ لم يُختر بعد"}`);
  }
  return lines.join("\n");
}

function buildAllSelectsComponents(pr: PendingReg): ActionRowBuilder<any>[] {
  const allDiscordDone = pr.players.every(p => p?.discordId);
  if (allDiscordDone) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cidTeamBtn(pr.tournamentId))
          .setLabel("🏆 إدخال اسم الفريق وإرسال الطلب")
          .setStyle(ButtonStyle.Success)
      ),
    ];
  }
  return Array.from({ length: pr.numPlayers }, (_, i) => {
    const label = PLAYER_LABELS_AR[i];
    const done = !!pr.players[i]?.discordId;
    const playerName = pr.players[i]?.name ?? "";
    return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(cidPlayerSelect(i, pr.tournamentId))
        .setPlaceholder(`${done ? "✅" : "👤"} اللاعب ${label}${playerName ? ` — ${playerName}` : ""}`)
        .setMaxValues(1)
        .setDisabled(done)
    );
  });
}

// ──────────────────────────────────────────────────────────────
// DB helpers
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

async function checkCapacity(tournamentId: number, maxParticipants: number | null): Promise<boolean> {
  if (maxParticipants == null) return true;
  const [row] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.status} = 'approved'`);
  return Number(row?.count ?? 0) < maxParticipants;
}

async function checkDuplicate(tournamentId: number, discordUserId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.discordUserId} = ${discordUserId}`);
  return !!existing;
}

async function saveRegistration(pr: PendingReg, discordUserId: string, discordUsername: string) {
  const formData: Record<string, string> = {};

  if (pr.numPlayers === 1) {
    const p = pr.players[0];
    if (p) {
      formData["اسم اللاعب"]        = p.name;
      formData["آيدي اللاعب"]      = p.playerId;
      formData["الجهاز"]            = p.device;
      formData["ديسكورد اللاعب"]    = discordUserId;
    }
  } else {
    for (let i = 0; i < pr.numPlayers; i++) {
      const p = pr.players[i];
      const label = PLAYER_LABELS_AR[i];
      if (p) {
        formData[`اسم اللاعب ${label}`]    = p.name;
        formData[`آيدي اللاعب ${label}`]   = p.playerId;
        formData[`جهاز اللاعب ${label}`]   = p.device;
        if (p.discordId) formData[`ديسكورد اللاعب ${label}`] = p.discordId;
      }
    }
    if (pr.teamName) formData["اسم الفريق"] = pr.teamName;
  }

  await db.insert(registrationsTable).values({
    tournamentId: pr.tournamentId,
    discordUserId,
    discordUsername,
    status: "pending",
    formData,
    notificationSent: false,
  });
}

// ──────────────────────────────────────────────────────────────
// Interaction handlers
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
    await interaction.showModal(buildPlayerModal(0, pr));
  } else {
    await interaction.reply({
      content: buildStatusMessage(pr),
      components: [...buildPlayerButtons(pr)],
      ephemeral: true,
    });
    pr.lastReplyInteraction = interaction;
  }
}

async function handlePlayerButton(interaction: ButtonInteraction) {
  const [, idxStr] = interaction.customId.split("_");
  const playerIdx = parseInt(idxStr, 10);
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }
  await interaction.showModal(buildPlayerModal(playerIdx, pr));
}

function buildPlayerModal(playerIdx: number, pr: PendingReg): ModalBuilder {
  const playerLabel = pr.numPlayers === 1 ? "اللاعب" : `اللاعب ${PLAYER_LABELS_AR[playerIdx]}`;
  const deviceHint  = pr.deviceOptions.join(" / ");
  const existing    = pr.players[playerIdx];

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
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(idInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(deviceInput),
  );
  return modal;
}

async function showStatusReply(interaction: ModalSubmitInteraction, pr: PendingReg) {
  if (pr.lastReplyInteraction) {
    await pr.lastReplyInteraction.deleteReply().catch(() => {});
    pr.lastReplyInteraction = undefined;
  }

  const allPlayerDataDone = pr.players.every(Boolean);
  if (allPlayerDataDone) {
    await interaction.reply({
      content: buildAllSelectsContent(pr),
      components: buildAllSelectsComponents(pr),
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: buildStatusMessage(pr),
      components: [...buildPlayerButtons(pr)],
      ephemeral: true,
    });
  }
  pr.lastReplyInteraction = interaction;
}

async function handlePlayerModalSubmit(interaction: ModalSubmitInteraction, playerIdx: number) {
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  const name     = interaction.fields.getTextInputValue("player_name");
  const playerId = interaction.fields.getTextInputValue("player_id");
  const device   = interaction.fields.getTextInputValue("player_device");

  const wasAlreadyDone = pr.players[playerIdx] !== null;
  const existingDiscordId = pr.players[playerIdx]?.discordId;
  pr.players[playerIdx] = { name, playerId, device, discordId: existingDiscordId };

  if (pr.numPlayers === 1) {
    if (await checkDuplicate(pr.tournamentId, interaction.user.id)) {
      await interaction.reply({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", ephemeral: true });
      pending.delete(interaction.user.id);
      return;
    }
    await saveRegistration(pr, interaction.user.id, interaction.user.tag);
    pending.delete(interaction.user.id);
    await interaction.reply({ content: "✅ تم إرسال طلب تسجيلك بنجاح! سيتم مراجعته قريباً.", ephemeral: true });
    autoDelete(interaction);
    return;
  }

  if (wasAlreadyDone) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply().catch(() => {});
    return;
  }

  await showStatusReply(interaction, pr);
}

async function handlePlayerUserSelect(interaction: UserSelectMenuInteraction) {
  const [, idxStr] = interaction.customId.split("_");
  const playerIdx = parseInt(idxStr, 10);
  const pr = pending.get(interaction.user.id);
  if (!pr) {
    await interaction.reply({ content: "انتهت جلسة التسجيل. اضغط زر التسجيل من جديد.", ephemeral: true });
    return;
  }

  const selectedId = interaction.values[0];
  if (pr.players[playerIdx] && selectedId) {
    pr.players[playerIdx]!.discordId = selectedId;
  }

  await interaction.update({
    content: buildAllSelectsContent(pr),
    components: buildAllSelectsComponents(pr),
  });
}

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

  const lastInt = pr.lastReplyInteraction;
  await saveRegistration(pr, interaction.user.id, interaction.user.tag);
  pending.delete(interaction.user.id);

  await interaction.reply({
    content: "✅ تم إرسال طلب تسجيل فريقك بنجاح! سيتم مراجعته قريباً.",
    ephemeral: true,
  });

  autoDelete(interaction);
  if (lastInt) setTimeout(() => { lastInt.deleteReply().catch(() => {}); }, 5000);
}

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

// ──────────────────────────────────────────────────────────────
// Bot initialization
// ──────────────────────────────────────────────────────────────
export async function initDiscordBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
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
      if (interaction.isCommand()) {
        const name = interaction.commandName;
        if (name === "tournament" || name === "بطولة") {
          await handleTournamentCommand(interaction as CommandInteraction);
        }
        return;
      }

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

      if (interaction.isUserSelectMenu()) {
        const cid = (interaction as UserSelectMenuInteraction).customId;
        if (cid.startsWith("ps_")) {
          await handlePlayerUserSelect(interaction as UserSelectMenuInteraction);
        }
        return;
      }

      if (interaction.isModalSubmit()) {
        const cid = (interaction as ModalSubmitInteraction).customId;
        if (cid.startsWith("pm_")) {
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
