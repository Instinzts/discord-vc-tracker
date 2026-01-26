require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, MongoStorage, XPCalculator } = require('discord-vc-tracker');
const mongoose = require('mongoose');

// ========================
// CUSTOM MONGOOSE SCHEMA
// ========================

const GuildSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  vipRoleId: String,
  boosterRoleId: String,
  xpMultiplier: { type: Number, default: 1 },
  bonusChannels: [String],
  customMessage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);

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

const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'  // Separate database for voice data
);

const calculator = new XPCalculator();

// ========================
// VOICE MANAGER SETUP
// ========================

const voiceManager = new VoiceManager(client, {
  storage,
  checkInterval: 5000,
  debug: true,
  
  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    
    xpStrategy: 'guild-settings-xp',  // Custom strategy
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    
    xpConfig: {
      baseAmount: 10,
    },
    voiceTimeConfig: {
      baseAmount: 5000,
    },
    
    enableLeveling: true,
    enableVoiceTime: true,
  },
});

// ========================
// CUSTOM STRATEGIES WITH MONGOOSE
// ========================

// XP Strategy using your custom Mongoose schema
voiceManager.registerXPStrategy('guild-settings-xp', async (member, config) => {
  try {
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    
    if (!settings) {
      return 10; // Default XP
    }
    
    let xp = 10;
    
    // VIP role bonus
    if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId)) {
      xp = 15;
    }
    
    // Booster role bonus
    if (settings.boosterRoleId && member.roles.cache.has(settings.boosterRoleId)) {
      xp = 20;
    }
    
    // Bonus channel check
    const channel = member.voice.channel;
    if (channel && settings.bonusChannels.includes(channel.id)) {
      xp *= 1.5;
    }
    
    // Apply guild multiplier
    xp = Math.floor(xp * settings.xpMultiplier);
    
    return xp;
  } catch (error) {
    console.error('Error in guild-settings-xp strategy:', error);
    return 10; // Fallback
  }
});

// ========================
// VOICE MANAGER EVENTS
// ========================

voiceManager.on('levelUp', async (user, oldLevel, newLevel) => {
  console.log(`🎉 ${user.userId} leveled up: ${oldLevel} → ${newLevel}`);
  
  try {
    const guild = user.guild.discordGuild;
    const member = await guild.members.fetch(user.userId);
    const settings = await GuildSettings.findOne({ guildId: guild.id });
    
    const channel = guild.channels.cache.find(
      ch => ch.name === 'general' || ch.name === 'chat'
    );
    
    if (channel) {
      const message = settings?.customMessage 
        ? settings.customMessage
            .replace('{user}', member.toString())
            .replace('{level}', newLevel)
        : `${member} just reached **Level ${newLevel}**!`;
      
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🎉 Level Up!')
        .setDescription(message)
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
      option.setName('user').setDescription('User to check').setRequired(false)
    ),
  
  // /setviprole command
  new SlashCommandBuilder()
    .setName('setviprole')
    .setDescription('Set VIP role for bonus XP (Admin only)')
    .addRoleOption(option =>
      option.setName('role').setDescription('VIP role').setRequired(true)
    ),
  
  // /setboosterrole command
  new SlashCommandBuilder()
    .setName('setboosterrole')
    .setDescription('Set booster role for bonus XP (Admin only)')
    .addRoleOption(option =>
      option.setName('role').setDescription('Booster role').setRequired(true)
    ),
  
  // /setmultiplier command
  new SlashCommandBuilder()
    .setName('setmultiplier')
    .setDescription('Set XP multiplier for this server (Admin only)')
    .addNumberOption(option =>
      option
        .setName('multiplier')
        .setDescription('XP multiplier (e.g., 1.5 for 1.5x XP)')
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(10)
    ),
  
  // /addbonuschannel command
  new SlashCommandBuilder()
    .setName('addbonuschannel')
    .setDescription('Add a bonus XP channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to give bonus XP in')
        .setRequired(true)
    ),
  
  // /setlevelmessage command
  new SlashCommandBuilder()
    .setName('setlevelmessage')
    .setDescription('Set custom level up message (Admin only)')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Use {user} for mention, {level} for level number')
        .setRequired(true)
    ),
  
  // /serverconfig command
  new SlashCommandBuilder()
    .setName('serverconfig')
    .setDescription('View server voice tracking configuration (Admin only)'),
];

// ========================
// COMMAND HANDLERS
// ========================

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  try {
    switch (interaction.commandName) {
      case 'stats':
        await handleStatsCommand(interaction);
        break;
      case 'setviprole':
        await handleSetVipRoleCommand(interaction);
        break;
      case 'setboosterrole':
        await handleSetBoosterRoleCommand(interaction);
        break;
      case 'setmultiplier':
        await handleSetMultiplierCommand(interaction);
        break;
      case 'addbonuschannel':
        await handleAddBonusChannelCommand(interaction);
        break;
      case 'setlevelmessage':
        await handleSetLevelMessageCommand(interaction);
        break;
      case 'serverconfig':
        await handleServerConfigCommand(interaction);
        break;
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
      { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true }
    )
    .setFooter({ text: 'Powered by discord-vc-tracker with MongoDB' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /setviprole COMMAND
// ========================

async function handleSetVipRoleCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const role = interaction.options.getRole('role');
  
  await GuildSettings.findOneAndUpdate(
    { guildId: interaction.guildId },
    { vipRoleId: role.id, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  
  await interaction.reply({
    content: `✅ VIP role set to ${role}! Members with this role will get 15 XP per check.`,
    ephemeral: true,
  });
}

// ========================
// /setboosterrole COMMAND
// ========================

async function handleSetBoosterRoleCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const role = interaction.options.getRole('role');
  
  await GuildSettings.findOneAndUpdate(
    { guildId: interaction.guildId },
    { boosterRoleId: role.id, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  
  await interaction.reply({
    content: `✅ Booster role set to ${role}! Members with this role will get 20 XP per check.`,
    ephemeral: true,
  });
}

// ========================
// /setmultiplier COMMAND
// ========================

async function handleSetMultiplierCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const multiplier = interaction.options.getNumber('multiplier');
  
  await GuildSettings.findOneAndUpdate(
    { guildId: interaction.guildId },
    { xpMultiplier: multiplier, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  
  await interaction.reply({
    content: `✅ XP multiplier set to **${multiplier}x**!`,
    ephemeral: true,
  });
}

// ========================
// /addbonuschannel COMMAND
// ========================

async function handleAddBonusChannelCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const channel = interaction.options.getChannel('channel');
  
  await GuildSettings.findOneAndUpdate(
    { guildId: interaction.guildId },
    { 
      $addToSet: { bonusChannels: channel.id },
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );
  
  await interaction.reply({
    content: `✅ ${channel} is now a bonus XP channel (1.5x XP)!`,
    ephemeral: true,
  });
}

// ========================
// /setlevelmessage COMMAND
// ========================

async function handleSetLevelMessageCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const message = interaction.options.getString('message');
  
  await GuildSettings.findOneAndUpdate(
    { guildId: interaction.guildId },
    { customMessage: message, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  
  await interaction.reply({
    content: `✅ Custom level up message set!\n**Preview:** ${message.replace('{user}', interaction.user.toString()).replace('{level}', '10')}`,
    ephemeral: true,
  });
}

// ========================
// /serverconfig COMMAND
// ========================

async function handleServerConfigCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  const settings = await GuildSettings.findOne({ guildId: interaction.guildId });
  
  if (!settings) {
    return interaction.reply({
      content: '⚙️ No custom configuration set yet. Use the setup commands to configure!',
      ephemeral: true,
    });
  }
  
  const vipRole = settings.vipRoleId 
    ? interaction.guild.roles.cache.get(settings.vipRoleId)?.toString() || 'Not found'
    : 'Not set';
  
  const boosterRole = settings.boosterRoleId
    ? interaction.guild.roles.cache.get(settings.boosterRoleId)?.toString() || 'Not found'
    : 'Not set';
  
  const bonusChannels = settings.bonusChannels.length > 0
    ? settings.bonusChannels
        .map(id => interaction.guild.channels.cache.get(id)?.toString() || 'Unknown')
        .join(', ')
    : 'None';
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Server Voice Tracking Configuration')
    .addFields(
      { name: '🌟 VIP Role', value: vipRole, inline: true },
      { name: '🚀 Booster Role', value: boosterRole, inline: true },
      { name: '✨ XP Multiplier', value: `${settings.xpMultiplier}x`, inline: true },
      { name: '💎 Bonus Channels', value: bonusChannels },
      { name: '💬 Level Up Message', value: settings.customMessage || 'Default message' }
    )
    .setFooter({ text: 'Use the setup commands to modify configuration' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ========================
// CLIENT READY
// ========================

client.once('ready', async () => {
  console.log('===================================');
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('===================================');
  
  // Connect to YOUR Mongoose database
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'your_bot_database',  // Your main database
    });
    console.log('✅ Mongoose connected (custom schemas)');
  } catch (error) {
    console.error('❌ Mongoose connection error:', error);
    process.exit(1);
  }
  
  // Initialize voice manager (uses separate database)
  try {
    await voiceManager.init();
    console.log('✅ Voice Manager initialized (voice data)');
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
  console.log('🎙️ Bot ready with MongoDB + Custom Schemas!');
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
  await mongoose.connection.close();
  client.destroy();
  process.exit(0);
});

// ========================
// START BOT
// ========================

client.login(process.env.DISCORD_BOT_TOKEN);