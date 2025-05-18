const net = require("net");
const db = require("./db");
const config = require("./config.json");
const { EmbedBuilder } = require("discord.js");

const rateLimit = new Map(); // userId -> timestamp
const RATE_LIMIT_SECONDS = 60;

// 🧹 Clean up old rate limit entries to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of rateLimit.entries()) {
    if (now - timestamp > RATE_LIMIT_SECONDS * 1000) {
      rateLimit.delete(userId);
    }
  }
}, 60 * 1000); // runs every 60 seconds

module.exports = async function handleModal(interaction) {
  try {
    if (!interaction.isModalSubmit()) return;

    const code = interaction.fields.getTextInputValue('verifyCode').trim();
    const discordUserId = interaction.user.id;

    // ⏱️ Rate limiting
    const now = Date.now();
    const lastAttempt = rateLimit.get(discordUserId);
    if (lastAttempt && now - lastAttempt < RATE_LIMIT_SECONDS * 1000) {
      const waitTime = Math.ceil((RATE_LIMIT_SECONDS * 1000 - (now - lastAttempt)) / 1000);
      return await interaction.reply({
        content: `⏱️ Please wait **${waitTime} seconds** before trying again.`,
        ephemeral: true
      });
    }
    rateLimit.set(discordUserId, now);

    // ✅ Check if already verified
    const [existing] = await db.execute(
      "SELECT * FROM user_verifications WHERE discord_id = ? AND verified = 1 LIMIT 1",
      [discordUserId]
    );

    if (existing.length) {
      return await interaction.reply({
        content: "✅ You are already verified.",
        ephemeral: true
      });
    }

    // 👤 Get member from guild
    const member = await interaction.guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      return await interaction.reply({
        content: "⚠️ Could not find your profile in the server.",
        ephemeral: true
      });
    }

    if (member.nickname && member.nickname !== interaction.user.username) {
      return await interaction.reply({
        content: "❌ You already have a nickname. You might already be verified.",
        ephemeral: true
      });
    }

    // 🔍 Check if verification code is valid
    const [rows] = await db.execute(
      "SELECT * FROM user_verifications WHERE verifycode = ? AND verified = 0 LIMIT 1",
      [code]
    );

    if (!rows.length) {
      return await interaction.reply({
        content: "❌ Invalid or already-used verification code.",
        ephemeral: true
      });
    }

    const { player_name, id: rowId } = rows[0];

    // 📝 Update verification status
    const [result] = await db.execute(
      `UPDATE user_verifications
       SET verified = 1, discord_id = ?, verifycode = 0, discord_name = ?
       WHERE id = ? AND verified = 0`,
      [discordUserId, interaction.user.tag, rowId]
    );

    if (result.affectedRows === 0) {
      return await interaction.reply({
        content: "⚠️ Verification failed. Try again later.",
        ephemeral: true
      });
    }

    // 📤 Notify SA-MP via socket
    try {
      const client = new net.Socket();
      client.connect(config.socketPort, config.socketHost, () => {
        client.write(`VERIFY ${player_name} ${interaction.user.username}\n`);
        client.end();
      });
    } catch (e) {
      console.error("⚠️ Socket error:", e);
    }

    // ✏️ Set nickname
    try {
      await member.setNickname(player_name);
    } catch (e) {
      console.warn("⚠️ Failed to set nickname:", e.message);
    }

    // ✅ Send embed to user
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("✅ Verification Successful")
      .setDescription(`You have been successfully verified as **${player_name}**.`)
      .setFooter({
        text: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

    // 📩 DM confirmation
    try {
      await interaction.user.send(`🎉 You have been verified as **${player_name}** on **${interaction.guild.name}**.`);
    } catch {
      console.warn("⚠️ Could not send DM to user.");
    }

  } catch (error) {
    console.error("❌ Error in handleModal:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "⚠️ An unexpected error occurred. Please try again later.",
          ephemeral: true
        });
      } catch (replyError) {
        console.warn("⚠️ Failed to reply to interaction error:", replyError.message);
      }
    }
  }
};
