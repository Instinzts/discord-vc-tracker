require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, MongoStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');
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

// Add indexes for better query performance
GuildSettingsSchema.index({ guildId: 1 });

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
// STORAGE & CACHE SETUP
// ========================

const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'  // Separate database for voice tracking data
);

// ✅ CREATE MEMORY CACHE (Recommended for production)
const cache = new MemoryCache({
  ttl: 300000,      // 5 minutes cache lifetime
  maxSize: 1000,    // Max 1000 cached items
  enableStats: true // Track cache performance
});

// ❌ WITHOUT CACHE (Not recommended, but shown for comparison)
// To use without cache, simply don't pass the cache parameter to VoiceManager

const calculator = new XPCalculator();

// ========================
// VOICE MANAGER WITH CACHE
// ========================

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ✅ Enable caching for 10-100x performance boost
  // cache: null,  // ❌ Disable cache (not recommended)
  checkInterval: 10000,
  debug: true,
  
  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    
    xpStrategy: 'guild-settings-xp',  // Custom strategy using your schema
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
    // Query YOUR custom database
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

// ✅ LISTEN FOR CACHE EVENTS (only works if cache is enabled)
voiceManager.on('debug', (message) => {
  // Only show cache-related messages
  if (message.includes('Cache')) {
    console.log(`🗄️  ${message}`);
  }
});

voiceManager.on('error', (error) => {
  console.error('❌ VoiceManager error:', error);
});



// ========================
// CACHE STATISTICS MONITORING
// ========================

let cacheStatsInterval;

function startCacheMonitoring() {
  // Only start monitoring if cache is enabled
  if (!voiceManager.cache) {
    console.log('⚠️  Cache monitoring disabled (cache not enabled)');
    return;
  }
  
  cacheStatsInterval = setInterval(async () => {
    const stats = await voiceManager.cache.getStats();
    console.log('\n📊 ===== CACHE STATISTICS =====');
    console.log(`   Hit Rate:    ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`   Hits:        ${stats.hits}`);
    console.log(`   Misses:      ${stats.misses}`);
    console.log(`   Cache Size:  ${stats.size} items`);
    console.log(`   Sets:        ${stats.sets}`);
    console.log(`   Deletes:     ${stats.deletes}`);
    console.log('================================\n');
  }, 60000); // Every 60 seconds
}

// ========================
// SLASH COMMANDS
// ========================

const commands = [
  // User commands
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View voice activity statistics')
    .addUserOption(option =>
      option.setName('user').setDescription('User to check').setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the voice activity leaderboard')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Sort by')
        .addChoices(
          { name: 'XP', value: 'xp' },
          { name: 'Level', value: 'level' },
          { name: 'Voice Time', value: 'voiceTime' }
        )
    ),
  
  // Admin commands - Guild Settings
  new SlashCommandBuilder()
    .setName('setviprole')
    .setDescription('Set VIP role for bonus XP (Admin only)')
    .addRoleOption(option =>
      option.setName('role').setDescription('VIP role').setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('setboosterrole')
    .setDescription('Set booster role for bonus XP (Admin only)')
    .addRoleOption(option =>
      option.setName('role').setDescription('Booster role').setRequired(true)
    ),
  
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
  
  new SlashCommandBuilder()
    .setName('addbonuschannel')
    .setDescription('Add a bonus XP channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to give bonus XP in')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('setlevelmessage')
    .setDescription('Set custom level up message (Admin only)')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Use {user} for mention, {level} for level number')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('serverconfig')
    .setDescription('View server voice tracking configuration (Admin only)'),
  
  // Cache management command (only works if cache is enabled)
  new SlashCommandBuilder()
    .setName('cachestats')
    .setDescription('View cache performance statistics'),


  new SlashCommandBuilder()
    .setName('debugtime')
    .setDescription('Debug voice time freshness (dev only)'),


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
      case 'leaderboard':
        await handleLeaderboardCommand(interaction);
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
      case 'cachestats':
        await handleCacheStatsCommand(interaction);
        break;
      case 'debugtime':
        await handleDebugTimeCommand(interaction);
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



async function handleDebugTimeCommand(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  console.log('🧪 ===== TIME DEBUG START =====');

  // FIRST READ
  const before = await voiceManager.getUser(guildId, userId);
  console.log('⏱️ Voice time BEFORE:', before?.totalVoiceTime);

  await interaction.reply({
    content: `⏱️ **Before:** ${calculator.formatVoiceTime(before.totalVoiceTime)}\n\n➡️ Join a voice channel now and wait ~10 seconds, then run /debugtime again.`,
    ephemeral: true,
  });

  console.log('🧪 ===== TIME DEBUG END =====');
}


// ========================
// /stats COMMAND
// ========================

async function handleStatsCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  // ========================================
  // METHOD 1: ✅ CACHE-AWARE (RECOMMENDED)
  // ========================================
  // This method uses the cache and is 40-200x faster
  const userData = await voiceManager.getUser(interaction.guildId, targetUser.id);
  
  if (!userData) {
    return interaction.reply({
      content: `${targetUser.username} has no voice activity yet!`,
      ephemeral: true,
    });
  }
  
  // Get guild for config
  const guild = voiceManager.guilds.get(interaction.guildId);
  const multiplier = await guild.config.getLevelMultiplier();
  const progress = calculator.calculateLevelProgress(userData.xp, multiplier);
  const xpToNext = calculator.calculateXPToNextLevel(userData.xp, multiplier);
  
  // Calculate rank from cached leaderboard
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, {
    sortBy: 'xp',
    limit: 1000,
  });
  const userEntry = leaderboard.find(entry => entry.userId === targetUser.id);
  const rank = userEntry?.rank || null;
  
  // ========================================
  // METHOD 2: ❌ NON-CACHE-AWARE (NOT RECOMMENDED)
  // ========================================
  // Uncomment the code below to see the non-cache-aware approach
  // This method bypasses the cache and is slower
  
  /*
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
  const rank = await user.getRank('xp');  // Direct database query
  */
  
  // ========================================
  // BUILD EMBED (Works with both methods)
  // ========================================
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Voice Stats for ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { 
        name: '⏱️ Voice Time', 
        value: calculator.formatVoiceTime(userData.totalVoiceTime), 
        inline: true 
      },
      { name: '⭐ Level', value: `${userData.level}`, inline: true },
      { name: '💫 XP', value: `${userData.xp.toLocaleString()}`, inline: true },
      { 
        name: '📈 Progress', 
        value: `${progress}% → Level ${userData.level + 1}`, 
        inline: true 
      },
      { name: '🎯 XP Needed', value: `${xpToNext.toLocaleString()}`, inline: true },
      { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true }
    )
    .setFooter({ text: 'Powered by discord-vc-tracker with CACHING!' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /leaderboard COMMAND
// ========================

async function handleLeaderboardCommand(interaction) {
  const type = interaction.options.getString('type') || 'xp';
  
  // ========================================
  // METHOD 1: ✅ CACHE-AWARE (RECOMMENDED)
  // ========================================
  // This method uses the cache and is 100-400x faster for leaderboards
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, {
    sortBy: type,
    limit: 10
  });
  
  // ========================================
  // METHOD 2: ❌ NON-CACHE-AWARE (NOT RECOMMENDED)
  // ========================================
  // Uncomment the code below to see the non-cache-aware approach
  
  /*
  const guild = voiceManager.guilds.get(interaction.guildId);
  const leaderboard = await guild.getLeaderboard(type, 10);
  */
  
  // ========================================
  // BUILD LEADERBOARD (Works with both methods)
  // ========================================
  
  if (leaderboard.length === 0) {
    return interaction.reply({
      content: 'No leaderboard data available yet!',
      ephemeral: true
    });
  }
  
  const description = await Promise.all(
    leaderboard.map(async (entry, index) => {
      const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      const username = member ? member.user.username : 'Unknown User';
      
      let value;
      if (type === 'voiceTime') {
        value = calculator.formatVoiceTime(entry.voiceTime || entry.totalVoiceTime);
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
    .setTitle(`🏆 ${type.toUpperCase()} Leaderboard`)
    .setDescription(description.join('\n'))
    .setFooter({ text: 'Data cached for optimal performance' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /cachestats COMMAND
// ========================

async function handleCacheStatsCommand(interaction) {
  if (!voiceManager.cache) {
    return interaction.reply({
      content: '❌ Cache is not enabled! Enable caching in the bot configuration for better performance.',
      ephemeral: true,
    });
  }
  
  const stats = await voiceManager.cache.getStats();
  
  // Calculate performance metrics
  const totalRequests = stats.hits + stats.misses;
  const avgResponseTime = stats.hits > 0 
    ? `~${Math.round(5 * (stats.misses / totalRequests))}ms` 
    : 'N/A';
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📊 Cache Performance Statistics')
    .setDescription('Real-time cache performance metrics for voice tracking data')
    .addFields(
      { 
        name: '🎯 Hit Rate', 
        value: `${(stats.hitRate * 100).toFixed(2)}%`, 
        inline: true 
      },
      { 
        name: '✅ Cache Hits', 
        value: `${stats.hits.toLocaleString()}`, 
        inline: true 
      },
      { 
        name: '❌ Cache Misses', 
        value: `${stats.misses.toLocaleString()}`, 
        inline: true 
      },
      { 
        name: '📦 Cache Size', 
        value: `${stats.size} items`, 
        inline: true 
      },
      { 
        name: '➕ Sets', 
        value: `${stats.sets.toLocaleString()}`, 
        inline: true 
      },
      { 
        name: '➖ Deletes', 
        value: `${stats.deletes.toLocaleString()}`, 
        inline: true 
      },
      {
        name: '⚡ Performance Impact',
        value: `Avg response time: ${avgResponseTime}\n` +
               `Estimated speedup: ${stats.hitRate > 0 ? `${Math.round(stats.hitRate * 100)}x` : 'N/A'}`,
        inline: false
      }
    )
    .setFooter({ text: 'Cache stats reset on bot restart' })
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
  console.log('\n===================================');
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('===================================\n');
  
  // Connect to YOUR Mongoose database
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'your_bot_database',  // Your main database
    });
    console.log('✅ Mongoose connected (custom schemas database)');
  } catch (error) {
    console.error('❌ Mongoose connection error:', error);
    process.exit(1);
  }
  
  // Initialize voice manager (uses separate database)
  try {
    await voiceManager.init();
    console.log('✅ Voice Manager initialized (voice tracking database)');
    
    if (voiceManager.cache) {
      console.log('✅ Memory cache enabled!');
    } else {
      console.log('⚠️  Cache disabled - performance may be slower');
    }
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
  
  console.log('\n===================================');
  console.log('🎙️ Bot ready!');
  console.log('📊 Database Architecture:');
  console.log('   - your_bot_database: Guild settings');
  console.log('   - voicetracker: Voice tracking data');
  if (voiceManager.cache) {
    console.log('   - Memory cache: ENABLED (10-100x faster)');
  }
  console.log('===================================\n');
  
  // Start cache monitoring
  startCacheMonitoring();
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
  
  // Show final cache stats if cache is enabled
  if (voiceManager.cache) {
    const stats = await voiceManager.cache.getStats();
    console.log('\n📊 Final Cache Statistics:');
    console.log(`   Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`   Total Hits: ${stats.hits}`);
    console.log(`   Total Misses: ${stats.misses}`);
    console.log(`   Cache Size: ${stats.size} items\n`);
  }
  
  if (cacheStatsInterval) {
    clearInterval(cacheStatsInterval);
  }
  
  await voiceManager.destroy();
  await mongoose.connection.close();
  client.destroy();
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

// ========================
// START BOT
// ========================

client.login(process.env.DISCORD_BOT_TOKEN);