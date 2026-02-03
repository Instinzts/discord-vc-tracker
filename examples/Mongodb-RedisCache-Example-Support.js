require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, MongoStorage, RedisCache, XPCalculator } = require('discord-vc-tracker');
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

// ✅ CREATE REDIS CACHE (Recommended for production & multi-instance)
const cache = new RedisCache({
  url: process.env.REDIS_URL || 'redis://localhost:6379',  // Redis connection URL
  ttl: 300000,      // 5 minutes cache lifetime
  keyPrefix: 'voice:',  // Namespace for keys
  enableStats: true // Track cache performance
});

const calculator = new XPCalculator();

// ========================
// VOICE MANAGER WITH REDIS CACHE
// ========================

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ✅ Enable Redis caching for persistence & multi-instance support
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

// ✅ LISTEN FOR REDIS CACHE EVENTS
voiceManager.on('debug', (message) => {
  // Only show cache-related messages
  if (message.includes('Cache') || message.includes('Redis')) {
    console.log(`🗄️  ${message}`);
  }
});

voiceManager.on('error', (error) => {
  console.error('❌ VoiceManager error:', error);
});

// ========================
// REDIS CACHE STATISTICS MONITORING
// ========================

let cacheStatsInterval;

function startCacheMonitoring() {
  cacheStatsInterval = setInterval(async () => {
    const stats = await voiceManager.cache.getStats();
    console.log('\n📊 ===== REDIS CACHE STATISTICS =====');
    console.log(`   Hit Rate:    ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`   Hits:        ${stats.hits}`);
    console.log(`   Misses:      ${stats.misses}`);
    console.log(`   Cache Size:  ${stats.size} items`);
    console.log(`   Sets:        ${stats.sets}`);
    console.log(`   Deletes:     ${stats.deletes}`);
    console.log('=====================================\n');
    
    // Alert on low hit rate
    if (stats.hitRate < 0.6 && stats.hits + stats.misses > 100) {
      console.warn('⚠️  Low cache hit rate detected! Consider increasing TTL or checking cache configuration.');
    }
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
  
  // Redis cache management command
  new SlashCommandBuilder()
    .setName('cachestats')
    .setDescription('View Redis cache performance statistics'),
  
  new SlashCommandBuilder()
    .setName('clearcache')
    .setDescription('Clear Redis cache (Admin only)'),
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
      case 'clearcache':
        await handleClearCacheCommand(interaction);
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
// /stats COMMAND (CACHE-AWARE)
// ========================

async function handleStatsCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  // ✅ CACHE-AWARE: Uses Redis cache for ultra-fast response
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
    .setFooter({ text: 'Powered by Redis Cache ⚡' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /leaderboard COMMAND (CACHE-AWARE)
// ========================

async function handleLeaderboardCommand(interaction) {
  const type = interaction.options.getString('type') || 'xp';
  
  // ✅ CACHE-AWARE: Uses Redis cache for instant leaderboard
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, {
    sortBy: type,
    limit: 10
  });
  
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
    .setFooter({ text: 'Data cached in Redis for optimal performance ⚡' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /cachestats COMMAND
// ========================

async function handleCacheStatsCommand(interaction) {
  const stats = await voiceManager.cache.getStats();
  
  // Calculate performance metrics
  const totalRequests = stats.hits + stats.misses;
  const avgResponseTime = stats.hits > 0 
    ? `~${Math.round(5 * (stats.misses / totalRequests))}ms` 
    : 'N/A';
  
  // Calculate memory usage estimate
  const estimatedMemoryKB = Math.round(stats.size * 0.5); // Rough estimate: 0.5KB per item
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📊 Redis Cache Performance')
    .setDescription('Real-time cache performance metrics')
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
        value: `${stats.size} items (~${estimatedMemoryKB}KB)`, 
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
        value: `Avg response: ${avgResponseTime}\n` +
               `Speedup: ${stats.hitRate > 0 ? `~${Math.round(stats.hitRate * 100)}x faster` : 'N/A'}\n` +
               `Status: ${stats.hitRate > 0.8 ? '🟢 Excellent' : stats.hitRate > 0.6 ? '🟡 Good' : '🔴 Poor'}`,
        inline: false
      }
    )
    .setFooter({ text: 'Cache persists across restarts • Shared between bot instances' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /clearcache COMMAND
// ========================

async function handleClearCacheCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    console.log('\n🗑️  ===== CACHE CLEAR INITIATED =====');
    
    const statsBefore = await voiceManager.cache.getStats();
    console.log(`📊 Before clear:`);
    console.log(`   - Size: ${statsBefore.size} items`);
    console.log(`   - Hits: ${statsBefore.hits}`);
    console.log(`   - Misses: ${statsBefore.misses}`);
    console.log(`   - Sets: ${statsBefore.sets}`);
    console.log(`   - Deletes: ${statsBefore.deletes}`);
    
    // Clear the cache
    await voiceManager.cache.clear();
    
    // Wait a moment for Redis to process
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const statsAfter = await voiceManager.cache.getStats();
    console.log(`\n📊 After clear:`);
    console.log(`   - Size: ${statsAfter.size} items`);
    console.log(`   - Hits: ${statsAfter.hits}`);
    console.log(`   - Misses: ${statsAfter.misses}`);
    console.log(`   - Sets: ${statsAfter.sets}`);
    console.log(`   - Deletes: ${statsAfter.deletes}`);
    console.log('=====================================\n');
    
    const itemsCleared = statsBefore.size - statsAfter.size;
    
    await interaction.editReply({
      content: `✅ Redis cache cleared!\n\n` +
               `**Before:**\n` +
               `├ Items: ${statsBefore.size}\n` +
               `├ Hits: ${statsBefore.hits}\n` +
               `└ Misses: ${statsBefore.misses}\n\n` +
               `**After:**\n` +
               `├ Items: ${statsAfter.size}\n` +
               `├ Hits: ${statsAfter.hits}\n` +
               `└ Misses: ${statsAfter.misses}\n\n` +
               `🗑️ **Cleared:** ${itemsCleared} items\n\n` +
               `⚠️ Cache will rebuild automatically as users are active in voice channels.`,
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    await interaction.editReply({
      content: '❌ Failed to clear cache. Check console for details.\n' +
               `Error: ${error.message}`,
    });
  }
}

// ========================
// ADMIN COMMANDS (Same as before)
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
  console.log('\n=====================================');
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('=====================================\n');
  
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
    console.log('✅ Redis cache enabled and connected!');
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
  console.log('\n=====================================');
  console.log('🎙️  Bot ready with Redis Cache!');
  console.log('📊 Database Architecture:');
  console.log('   - your_bot_database: Guild settings');
  console.log('   - voicetracker: Voice tracking data');
  console.log('   - Redis: Persistent cache storage');
  console.log('=====================================\n');
  
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
  console.log('\n⏹️  Shutting down...');
  
  // Stop the stats interval first
  if (cacheStatsInterval) {
    clearInterval(cacheStatsInterval);
  }
  
  // Get stats BEFORE closing anything, but only if connected
  try {
    if (voiceManager.cache && voiceManager.cache.connected) {
      const stats = await voiceManager.cache.getStats();
      console.log('\n📊 Final Redis Cache Statistics:');
      console.log(`   Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`   Total Hits: ${stats.hits}`);
      console.log(`   Total Misses: ${stats.misses}`);
      console.log(`   Cache Size: ${stats.size} items\n`);
    }
  } catch (error) {
    // Ignore stats errors during shutdown
    console.log('📊 Cache stats unavailable during shutdown\n');
  }
  
  // Close everything gracefully
  try {
    await voiceManager.destroy();
  } catch (error) {
    console.error('Error destroying voice manager:', error.message);
  }
  
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error closing mongoose:', error.message);
  }
  
  client.destroy().catch(error => {
    console.error('Error destroying client:', error.message);
  }); 
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

// ========================
// START BOT
// ========================

client.login(process.env.DISCORD_BOT_TOKEN);