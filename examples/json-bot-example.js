require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, JSONStorage, XPCalculator } = require('discord-vc-tracker');

// ========================
// CLIENT SETUP
// ========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// ========================
// STORAGE SETUP
// ========================

const storage = new JSONStorage('./data');
const calculator = new XPCalculator();

// ========================
// VOICE MANAGER SETUP
// ========================

const voiceManager = new VoiceManager(client, {
  storage,
  checkInterval: 5000,
  debug: true,
  
  defaultConfig: {
    // Tracking options
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    minUsersToTrack: 0,
    maxUsersToTrack: 0,
    
    // Strategy names
    xpStrategy: 'booster-bonus',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    
    // Strategy configs
    xpConfig: {
      baseAmount: 10,
      boosterMultiplier: 2,
    },
    voiceTimeConfig: {
      baseAmount: 5000,
    },
    
    // Modules
    enableLeveling: true,
    enableVoiceTime: true,
  },
});

// ========================
// CUSTOM STRATEGIES
// ========================

// Time-based XP (bonus at night)
voiceManager.registerXPStrategy('time-based', (member, config) => {
  const hour = new Date().getHours();
  
  // Night bonus (10pm - 6am)
  if (hour >= 22 || hour < 6) return 15;
  
  // Peak hours (6pm - 10pm)
  if (hour >= 18 && hour < 22) return 12;
  
  return 10;
});

// Channel-specific XP
voiceManager.registerXPStrategy('channel-bonus', (member, config) => {
  const channel = member.voice.channel;
  if (!channel) return 10;
  
  // Study channels get 2x XP
  if (channel.name.toLowerCase().includes('study')) return 20;
  
  // Gaming channels get 1.5x XP
  if (channel.name.toLowerCase().includes('game')) return 15;
  
  return 10;
});

// ========================
// VOICE MANAGER EVENTS
// ========================

voiceManager.on('levelUp', async (user, oldLevel, newLevel) => {
  console.log(`🎉 ${user.userId} leveled up: ${oldLevel} → ${newLevel}`);
  
  // Send level up message
  try {
    const guild = user.guild.discordGuild;
    const member = await guild.members.fetch(user.userId);
    
    // Find a text channel to send the message
    const channel = guild.channels.cache.find(
      ch => ch.name === 'general' || ch.name === 'chat'
    );
    
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🎉 Level Up!')
        .setDescription(`${member} just reached **Level ${newLevel}**!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error sending level up message:', error);
  }
});

voiceManager.on('xpGained', (user, amount) => {
  console.log(`💫 ${user.userId} gained ${amount} XP`);
});

voiceManager.on('voiceTimeGained', (user, amount) => {
  console.log(`⏱️ ${user.userId} gained ${calculator.formatVoiceTime(amount)}`);
});

voiceManager.on('sessionStart', (session) => {
  console.log(`▶️ Session started: ${session.userId} in ${session.channelId}`);
});

voiceManager.on('sessionEnd', (session) => {
  console.log(`⏹️ Session ended: ${session.userId}, duration: ${calculator.formatVoiceTime(session.duration || 0)}`);
});

voiceManager.on('error', (error) => {
  console.error('❌ VoiceManager error:', error);
});

// ========================
// SLASH COMMANDS
// ========================

const commands = [
  // /stats command
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View voice activity statistics')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check (leave empty for yourself)')
        .setRequired(false)
    ),
  
  // /leaderboard command
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View server voice leaderboard')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(false)
        .addChoices(
          { name: 'XP', value: 'xp' },
          { name: 'Level', value: 'level' },
          { name: 'Voice Time', value: 'voiceTime' }
        )
    ),
  
  // /rank command
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your rank card')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check (leave empty for yourself)')
        .setRequired(false)
    ),
];

// ========================
// COMMAND HANDLERS
// ========================

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  try {
    if (interaction.commandName === 'stats') {
      await handleStatsCommand(interaction);
    } else if (interaction.commandName === 'leaderboard') {
      await handleLeaderboardCommand(interaction);
    } else if (interaction.commandName === 'rank') {
      await handleRankCommand(interaction);
    }
  } catch (error) {
    console.error('Command error:', error);
    
    const errorMessage = {
      content: 'An error occurred while executing this command.',
      ephemeral: true,
    };
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// ========================
// /stats COMMAND
// ========================

async function handleStatsCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  const guild = voiceManager.guilds.get(interaction.guildId);
  const user = guild?.users.get(targetUser.id);
  
  if (!user) {
    return interaction.reply({
      content: `${targetUser.username} has no voice activity yet!`,
      ephemeral: true,
    });
  }
  
  const multiplier = await guild.config.getLevelMultiplier();
  const progress = calculator.calculateLevelProgress(user.xp, multiplier);
  const xpToNext = calculator.calculateXPToNextLevel(user.xp, multiplier);
  const rank = await user.getRank('xp');
  
  // Get most active channel
  let mostActiveChannel = 'N/A';
  let maxTime = 0;
  
  for (const [channelId, channel] of user.channels) {
    if (channel.voiceTime > maxTime) {
      maxTime = channel.voiceTime;
      const discordChannel = interaction.guild.channels.cache.get(channelId);
      mostActiveChannel = discordChannel ? discordChannel.name : 'Unknown Channel';
    }
  }
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Voice Stats for ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '⏱️ Voice Time', value: calculator.formatVoiceTime(user.totalVoiceTime), inline: true },
      { name: '⭐ Level', value: `${user.level}`, inline: true },
      { name: '💫 XP', value: `${user.xp.toLocaleString()}`, inline: true },
      { name: '📈 Progress', value: `${progress}% → Level ${user.level + 1}`, inline: true },
      { name: '🎯 XP Needed', value: `${xpToNext.toLocaleString()}`, inline: true },
      { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
      { name: '🔊 Most Active', value: mostActiveChannel, inline: true },
      { name: '🎙️ Sessions', value: `${user.totalSessions}`, inline: true },
      { name: '🔥 Streak', value: `${user.streak} days`, inline: true }
    )
    .setFooter({ text: 'Powered by discord-vc-tracker' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /leaderboard COMMAND
// ========================

async function handleLeaderboardCommand(interaction) {
  const type = interaction.options.getString('type') || 'xp';
  const guild = voiceManager.guilds.get(interaction.guildId);
  
  if (!guild) {
    return interaction.reply({
      content: 'No data available for this server yet!',
      ephemeral: true,
    });
  }
  
  const leaderboard = await guild.getLeaderboard(type, 10);
  
  if (leaderboard.length === 0) {
    return interaction.reply({
      content: 'No leaderboard data available yet!',
      ephemeral: true,
    });
  }
  
  const typeNames = {
    xp: 'XP',
    level: 'Level',
    voiceTime: 'Voice Time',
  };
  
  const description = await Promise.all(
    leaderboard.map(async (entry, index) => {
      const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      const username = member ? member.user.username : 'Unknown User';
      
      let value;
      if (type === 'voiceTime') {
        value = calculator.formatVoiceTime(entry.voiceTime);
      } else if (type === 'level') {
        value = `Level ${entry.level}`;
      } else {
        value = `${entry.xp.toLocaleString()} XP`;
      }
      
      const medal = ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
      return `${medal} ${username} - ${value}`;
    })
  );
  
  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`🏆 ${typeNames[type]} Leaderboard`)
    .setDescription(description.join('\n'))
    .setFooter({ text: `Showing top ${leaderboard.length} users` })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /rank COMMAND
// ========================

async function handleRankCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  const guild = voiceManager.guilds.get(interaction.guildId);
  const user = guild?.users.get(targetUser.id);
  
  if (!user) {
    return interaction.reply({
      content: `${targetUser.username} has no voice activity yet!`,
      ephemeral: true,
    });
  }
  
  const multiplier = await guild.config.getLevelMultiplier();
  const progress = calculator.calculateLevelProgress(user.xp, multiplier);
  const xpToNext = calculator.calculateXPToNextLevel(user.xp, multiplier);
  const currentLevelXP = calculator.calculateXPForLevel(user.level, multiplier);
  const nextLevelXP = calculator.calculateXPForLevel(user.level + 1, multiplier);
  
  const rank = await user.getRank('xp');
  
  // Create progress bar
  const barLength = 20;
  const filled = Math.round((progress / 100) * barLength);
  const progressBar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Rank Card: ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .setDescription(
      `**Level ${user.level}**\n` +
      `${progressBar}\n` +
      `${user.xp.toLocaleString()} / ${Math.floor(nextLevelXP).toLocaleString()} XP\n` +
      `\n` +
      `🏆 **Rank:** ${rank ? `#${rank}` : 'Unranked'}\n` +
      `💫 **XP to Next Level:** ${xpToNext.toLocaleString()}\n` +
      `⏱️ **Voice Time:** ${calculator.formatVoiceTime(user.totalVoiceTime)}\n` +
      `🎙️ **Sessions:** ${user.totalSessions}`
    )
    .setFooter({ text: 'Keep talking to level up!' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// CLIENT READY
// ========================

client.once('ready', async () => {
  console.log('===================================');
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('===================================');
  
  // Initialize voice manager
  try {
    await voiceManager.init();
    console.log('✅ Voice Manager initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Voice Manager:', error);
    process.exit(1);
  }
  
  // Register slash commands
  try {
    console.log('📝 Registering slash commands...');
    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
  
  console.log('===================================');
  console.log('🎙️ Bot is ready and tracking voice!');
  console.log('===================================');
});

// ========================
// ERROR HANDLING
// ========================

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\n⏹️ Shutting down...');
  await voiceManager.destroy();
  client.destroy();
  process.exit(0);
});

// ========================
// START BOT
// ========================

client.login(process.env.DISCORD_BOT_TOKEN);