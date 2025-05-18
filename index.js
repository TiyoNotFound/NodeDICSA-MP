const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const handleModal = require('./verifyModal');
const db = require('./db');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: ['CHANNEL'] // Needed for DMs
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath)) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, c => {
  console.log(`✅ Ready as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  }

  else if (interaction.isButton()) {
    if (interaction.customId === 'verify_button') {
      try {
        const [rows] = await db.execute(
          'SELECT player_name FROM user_verifications WHERE discord_id = ? AND verified = 1 LIMIT 1',
          [interaction.user.id]
        );

        if (rows.length > 0) {
          const embed = new EmbedBuilder()
            .setColor(0xFAA61A)
            .setTitle('🔒 Already Linked')
            .setDescription(`This Discord account is already linked to **${rows[0].player_name}**.`)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

          return await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        }

        // Not yet verified, show modal
        const modal = new ModalBuilder()
          .setCustomId('verify_modal')
          .setTitle('Enter Verification Code');

        const input = new TextInputBuilder()
          .setCustomId('verifyCode')
          .setLabel('Verification Code')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);

        await interaction.showModal(modal);
      } catch (err) {
        console.error('❌ Error checking verification:', err);
        return interaction.reply({
          content: '⚠️ An error occurred. Please try again later.',
          ephemeral: true
        });
      }
    }
  }

  else if (interaction.isModalSubmit()) {
    await handleModal(interaction);
  }
});

// Optional: Logging events
const logger = require('./logger');
client.on(Events.Debug, info => logger.debug(info));
client.on(Events.Warn, info => logger.warn(info));
client.on(Events.Error, error => logger.error(error));

client.login(config.token);
