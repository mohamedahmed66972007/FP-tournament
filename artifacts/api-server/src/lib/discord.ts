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

async function getBotToken(): Promise<string | null> {
  try {
    const [config] = await db.select().from(botConfigTable).limit(1);
    if (config?.botToken) return config.botToken;
  } catch {}
  return process.env.DISCORD_BOT_TOKEN ?? null;
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

export async function sendRegistrationMessage(tournamentId: number, channelId: string): Promise<void> {
  if (!client) throw new Error("Discord bot not connected");

  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
  if (!t) throw new Error("Tournament not found");

  const [approvedRow] = await db
    .select({ count: count() })
    .from(registrationsTable)
    .where(sql`${registrationsTable.tournamentId} = ${tournamentId} AND ${registrationsTable.status} = 'approved'`);
  const approvedCount = Number(approvedRow?.count ?? 0);
  const remainingSeats = t.maxParticipants != null ? t.maxParticipants - approvedCount : null;

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${t.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "نوع البطولة | Type", value: `${typeLabels[t.type] ?? t.type} (${t.type.toUpperCase()})`, inline: true },
      {
        name: "المقاعد المتبقية | Remaining Seats",
        value: remainingSeats != null ? remainingSeats.toString() : "غير محدود | Unlimited",
        inline: true,
      }
    )
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.\nClick the button below to register for the tournament.")
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("register_tournament")
      .setLabel("🎮 التسجيل في البطولة | Register")
      .setStyle(ButtonStyle.Primary)
  );

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error("Channel not found or not text-based");

  await (channel as any).send({ embeds: [embed], components: [row] });
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

  const typeLabels: Record<string, string> = { solo: "سولو", duo: "دو", squad: "سكواد" };

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${activeTournament.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "نوع البطولة | Type", value: `${typeLabels[activeTournament.type] ?? activeTournament.type} (${activeTournament.type.toUpperCase()})`, inline: true },
      {
        name: "المقاعد المتبقية | Remaining Seats",
        value: remainingSeats != null ? remainingSeats.toString() : "غير محدود | Unlimited",
        inline: true,
      }
    )
    .setDescription("اضغط على الزر أدناه للتسجيل في البطولة.\nClick the button below to register.")
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("register_tournament")
      .setLabel("🎮 التسجيل في البطولة | Register")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
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

export async function reloadDiscordBot() {
  await initDiscordBot();
}
