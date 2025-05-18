const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// Replace this with your actual Discord user ID
const ALLOWED_USER_ID = '123456789012345678';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup the verification system'),

  async execute(interaction) {
    // Check if the user is allowed
    if (interaction.user.id !== ALLOWED_USER_ID) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔐 Verify Your Account')
      .setDescription('Click the button below to verify your SA-MP account.');

    const button = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Click Me')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false // Or true if you want it only visible to the command issuer
    });
  }
};
