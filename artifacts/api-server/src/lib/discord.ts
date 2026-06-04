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

export function getClient(): Client | null {
  return client;
}

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

  const embed = new EmbedBuilder()
    .setTitle(`تم قبول تسجيل جديد — ${tournament.name}`)
    .setColor(0x57f287)
    .setDescription(
      `**نوع البطولة:** ${tournament.type.toUpperCase()}\n**المستخدم:** <@${registration.discordUserId}> (${registration.discordUsername})`
    )
    .setTimestamp();

  for (const q of questions) {
    const value = formData[q.id.toString()] ?? formData[q.label] ?? "—";
    embed.addFields({ name: q.label, value: String(value), inline: true });
  }

  await (channel as any).send({ embeds: [embed] });
}

export async function sendRejectionDM(discordUserId: string, tournamentName: string, reason: string | null) {
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

  // Check seat limit
  if (activeTournament.maxParticipants != null) {
    const [row] = await db
      .select({ count: count() })
      .from(registrationsTable)
      .where(
        sql`${registrationsTable.tournamentId} = ${activeTournament.id} AND ${registrationsTable.status} = 'approved'`
      );
    const approvedCount = Number(row?.count ?? 0);
    if (approvedCount >= activeTournament.maxParticipants) {
      await interaction.reply({ content: "تم اكتمال عدد المشاركين.", ephemeral: true });
      return;
    }
  }

  // Check duplicate registration
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

  // Discord modals support max 5 components
  const modalQuestions = questions.slice(0, 5);

  const modal = new ModalBuilder()
    .setCustomId(`register_${activeTournament.id}`)
    .setTitle(`التسجيل في ${activeTournament.name}`);

  for (const q of modalQuestions) {
    const input = new TextInputBuilder()
      .setCustomId(`q_${q.id}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(q.required);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith("register_")) return;

  const tournamentId = parseInt(customId.replace("register_", ""), 10);
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));

  if (!tournament || tournament.status !== "active") {
    await interaction.reply({ content: "لا توجد بطولة متاحة حالياً.", ephemeral: true });
    return;
  }

  const formData: Record<string, string> = {};
  for (const [key] of interaction.fields.fields) {
    try {
      formData[key] = interaction.fields.getTextInputValue(key);
    } catch {
      // skip non-text inputs
    }
  }

  await db.insert(registrationsTable).values({
    tournamentId,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.tag,
    status: "pending",
    formData,
  });

  await interaction.reply({
    content: "تم إرسال طلب تسجيلك بنجاح! سيتم مراجعته قريباً.",
    ephemeral: true,
  });
}

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

  const [approvedRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(
      sql`${registrationsTable.tournamentId} = ${activeTournament.id} AND ${registrationsTable.status} = 'approved'`
    );
  const approvedCount = Number(approvedRow?.count ?? 0);
  const remainingSeats =
    activeTournament.maxParticipants != null ? activeTournament.maxParticipants - approvedCount : null;

  const embed = new EmbedBuilder()
    .setTitle(activeTournament.name)
    .setColor(0x5865f2)
    .addFields(
      { name: "نوع البطولة", value: activeTournament.type.toUpperCase(), inline: true },
      {
        name: "المقاعد المتبقية",
        value: remainingSeats != null ? remainingSeats.toString() : "غير محدود",
        inline: true,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("register_tournament")
      .setLabel("🎮 التسجيل في البطولة")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

export async function initDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — Discord bot disabled");
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
  });

  client.once("ready", async () => {
    logger.info({ tag: client!.user?.tag }, "Discord bot ready");

    // Register slash commands
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
      } else if (interaction.isButton()) {
        if ((interaction as ButtonInteraction).customId === "register_tournament") {
          await handleRegistrationButton(interaction as ButtonInteraction);
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
