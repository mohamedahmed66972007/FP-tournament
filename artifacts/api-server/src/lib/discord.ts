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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type CommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { db, tournamentsTable, questionsTable, registrationsTable, botConfigTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { logger } from "./logger";

let client: Client | null = null;

// Stores pending select-menu answers while user is on step 1 (before the modal)
// key = userId, value = { "q_<id>": selectedValue }
const pendingSelections = new Map<string, Record<string, string>>();

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
// Approval embed sent to the announcement channel
// ──────────────────────────────────────────────────────────────
export async function sendApprovalEmbed(
  registration: typeof registrationsTable.$inferSelect,
  tournament: typeof tournamentsTable.$inferSelect,
  questions: (typeof questionsTable.$inferSelect)[]
) {
  if (!client) return;

  const [config] = await db.select().from(botConfigTable).limit(1);
  if (!config?.announcementChannelId) return;

  const channel = await client.channels.fetch(config.announcementChannelId);
  if (!channel || !channel.isTextBased()) return;

  const formData = registration.formData as Record<string, string>;

  // Sort questions by their order field so fields appear in the correct order
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const embed = new EmbedBuilder()
    .setTitle("✅ تم قبول تسجيل جديد")
    .setColor(0x57f287)
    .setDescription(
      `مبروك <@${registration.discordUserId}>!\nتم قبول تسجيلك في بطولة **${tournament.name}**`
    )
    .setTimestamp();

  for (const q of sortedQuestions) {
    const value =
      formData[`q_${q.id}`] ??
      formData[q.id.toString()] ??
      formData[q.label] ??
      "—";
    embed.addFields({ name: q.label, value: String(value) || "—", inline: false });
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
  const typeLabel = typeLabels[t.type] ?? t.type;
  const slotsLabel = t.maxParticipants != null ? `${t.maxParticipants}` : "غير محدود";

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${t.name}`)
    .setColor(0x5865f2)
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.")
    .addFields(
      { name: "نوع البطولة", value: typeLabel, inline: true },
      { name: "عدد المشاركين", value: slotsLabel, inline: true },
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
// Helpers
// ──────────────────────────────────────────────────────────────
function isSelectType(type: string) {
  return ["select", "radio", "multiselect"].includes(type);
}

function buildTextModal(
  tournament: typeof tournamentsTable.$inferSelect,
  textQuestions: (typeof questionsTable.$inferSelect)[]
) {
  const modal = new ModalBuilder()
    .setCustomId(`register_${tournament.id}`)
    .setTitle(`التسجيل في ${tournament.name}`);

  for (const q of textQuestions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(`q_${q.id}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(q.required);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

// ──────────────────────────────────────────────────────────────
// Step 1 – Register button clicked
// ──────────────────────────────────────────────────────────────
async function handleRegistrationButton(interaction: ButtonInteraction) {
  const [activeTournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!activeTournament) {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  // Check capacity
  if (activeTournament.maxParticipants != null) {
    const [row] = await db
      .select({ count: count() })
      .from(registrationsTable)
      .where(
        sql`${registrationsTable.tournamentId} = ${activeTournament.id} AND ${registrationsTable.status} = 'approved'`
      );
    if (Number(row?.count ?? 0) >= activeTournament.maxParticipants) {
      await interaction.reply({ content: "تم اكتمال عدد المشاركين.", ephemeral: true });
      return;
    }
  }

  // Check duplicate
  const [existing] = await db
    .select()
    .from(registrationsTable)
    .where(
      sql`${registrationsTable.tournamentId} = ${activeTournament.id} AND ${registrationsTable.discordUserId} = ${interaction.user.id}`
    );
  if (existing) {
    await interaction.reply({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", ephemeral: true });
    return;
  }

  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.tournamentId, activeTournament.id))
    .orderBy(questionsTable.order);

  // Separate select-type questions (shown as menus) from text-type (shown in modal)
  const selectQuestions = questions.filter(
    (q) => isSelectType(q.type) && q.options && q.options.length > 0
  );
  const textQuestions = questions.filter(
    (q) => !isSelectType(q.type) || !q.options || q.options.length === 0
  );

  // Initialise pending store for this user
  pendingSelections.set(interaction.user.id, {});

  if (selectQuestions.length > 0) {
    // Build one StringSelectMenu row per select question (max 4 menus + 1 continue button = 5 rows)
    const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

    for (const q of selectQuestions.slice(0, 4)) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`selq_${q.id}_${activeTournament.id}`)
        .setPlaceholder(`اختر: ${q.label.slice(0, 80)}`)
        .addOptions(
          q.options!.map((opt) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(opt.slice(0, 100))
              .setValue(opt.slice(0, 100))
          )
        );
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    }

    // Continue button (always visible — user proceeds after making selections)
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`continue_reg_${activeTournament.id}`)
          .setLabel(textQuestions.length > 0 ? "متابعة ←" : "إرسال الطلب ✓")
          .setStyle(ButtonStyle.Success)
      )
    );

    await interaction.reply({
      content:
        "**الخطوة 1 من 2 — اختر إجاباتك ثم اضغط متابعة:**",
      components: rows as any,
      ephemeral: true,
    });
  } else {
    // No select questions — show modal directly
    await interaction.showModal(buildTextModal(activeTournament, textQuestions));
  }
}

// ──────────────────────────────────────────────────────────────
// Step 1b – User picks a value from a StringSelectMenu
// ──────────────────────────────────────────────────────────────
async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
  const parts = interaction.customId.split("_"); // selq_{questionId}_{tournamentId}
  const questionId = parts[1];

  const pending = pendingSelections.get(interaction.user.id) ?? {};
  pending[`q_${questionId}`] = interaction.values[0];
  pendingSelections.set(interaction.user.id, pending);

  // Acknowledge silently so the menus stay visible
  await interaction.deferUpdate();
}

// ──────────────────────────────────────────────────────────────
// Step 2 – "Continue" button: show the text modal (or save directly)
// ──────────────────────────────────────────────────────────────
async function handleContinueRegistration(interaction: ButtonInteraction) {
  const tournamentId = parseInt(interaction.customId.replace("continue_reg_", ""), 10);

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));

  if (!tournament || tournament.status !== "active") {
    await interaction.reply({ content: "البطولة لم تعد متاحة.", ephemeral: true });
    return;
  }

  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.tournamentId, tournamentId))
    .orderBy(questionsTable.order);

  const textQuestions = questions.filter(
    (q) => !isSelectType(q.type) || !q.options || q.options.length === 0
  );

  if (textQuestions.length === 0) {
    // Nothing left to fill — save straight away
    const formData = pendingSelections.get(interaction.user.id) ?? {};
    pendingSelections.delete(interaction.user.id);

    // Check duplicate again (race condition guard)
    const [existing] = await db
      .select()
      .from(registrationsTable)
      .where(
        sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.discordUserId} = ${interaction.user.id}`
      );
    if (existing) {
      await interaction.update({ content: "لقد قمت بالتسجيل مسبقاً في هذه البطولة.", components: [] });
      return;
    }

    await db.insert(registrationsTable).values({
      tournamentId,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.tag,
      status: "pending",
      formData,
    });

    await interaction.update({
      content: "✅ تم إرسال طلب تسجيلك بنجاح! سيتم مراجعته قريباً.",
      components: [],
    });
    return;
  }

  // Show modal for the text questions (this is the first & only response to THIS interaction)
  await interaction.showModal(buildTextModal(tournament, textQuestions));
}

// ──────────────────────────────────────────────────────────────
// Step 3 – Modal submitted
// ──────────────────────────────────────────────────────────────
async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith("register_")) return;

  const tournamentId = parseInt(customId.replace("register_", ""), 10);
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));

  if (!tournament || tournament.status !== "active") {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  // Collect text-input answers
  const formData: Record<string, string> = {};
  for (const [key] of interaction.fields.fields) {
    try {
      formData[key] = interaction.fields.getTextInputValue(key);
    } catch {
      // skip
    }
  }

  // Merge with any pending select answers from step 1
  const selectData = pendingSelections.get(interaction.user.id) ?? {};
  pendingSelections.delete(interaction.user.id);
  const merged = { ...selectData, ...formData };

  await db.insert(registrationsTable).values({
    tournamentId,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.tag,
    status: "pending",
    formData: merged,
  });

  await interaction.reply({
    content: "✅ تم إرسال طلب تسجيلك بنجاح! سيتم مراجعته قريباً.",
    ephemeral: true,
  });
}

// ──────────────────────────────────────────────────────────────
// /tournament command
// ──────────────────────────────────────────────────────────────
async function handleTournamentCommand(interaction: CommandInteraction) {
  const [activeTournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!activeTournament) {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };
  const typeLabel = typeLabels[activeTournament.type] ?? activeTournament.type;
  const slotsLabel =
    activeTournament.maxParticipants != null ? `${activeTournament.maxParticipants}` : "غير محدود";

  const embed = new EmbedBuilder()
    .setTitle(`🏆  ${activeTournament.name}`)
    .setColor(0x5865f2)
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.")
    .addFields(
      { name: "نوع البطولة", value: typeLabel, inline: true },
      { name: "عدد المشاركين", value: slotsLabel, inline: true },
      ...(activeTournament.prize
        ? [{ name: "الجائزة", value: activeTournament.prize, inline: true }]
        : [])
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
      if (interaction.isCommand()) {
        const name = interaction.commandName;
        if (name === "tournament" || name === "بطولة") {
          await handleTournamentCommand(interaction as CommandInteraction);
        }
      } else if (interaction.isStringSelectMenu()) {
        const customId = (interaction as StringSelectMenuInteraction).customId;
        if (customId.startsWith("selq_")) {
          await handleSelectMenuInteraction(interaction as StringSelectMenuInteraction);
        }
      } else if (interaction.isButton()) {
        const customId = (interaction as ButtonInteraction).customId;
        if (customId === "register_tournament") {
          await handleRegistrationButton(interaction as ButtonInteraction);
        } else if (customId.startsWith("continue_reg_")) {
          await handleContinueRegistration(interaction as ButtonInteraction);
        }
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction as ModalSubmitInteraction);
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
