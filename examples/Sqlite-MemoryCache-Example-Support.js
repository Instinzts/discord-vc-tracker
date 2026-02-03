require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, SQLiteStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');
const mongoose = require('mongoose');

// ========================
// CUSTOM MONGOOSE SCHEMA (Optional - for additional bot features)
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
// SQLITE STORAGE SETUP (ZERO CONFIGURATION! 🎉)
// ========================

// ✅ OPTION 1: Ultra-simple setup (recommended for development)
const storage = new SQLiteStorage();
// That's it! Database will be created at ./data/voice-tracker.db

// ✅ OPTION 2: Custom configuration
/*
const storage = new SQLiteStorage({
  filename: './data/my-bot-voice.db',  // Custom location
  timeout: 5000,                        // Connection timeout
  verbose: console.log,                 // Enable query logging (dev only)
});
*/

// ✅ OPTION 3: Production configuration
/*
const storage = new SQLiteStorage({
  filename: process.env.SQLITE_DB_PATH || './data/voice-tracker.db',
  timeout: 10000,  // Longer timeout for production
  // NO verbose in production
});
*/

// ========================
// CACHE SETUP
// ========================

// ✅ Use MemoryCache for single-instance bots (most SQLite use cases)
const cache = new MemoryCache({
  ttl: 300000,      // 5 minutes
  maxSize: 1000,    // Limit cache size
  enableStats: true // Track performance
});

// ℹ️ NOTE: SQLite is already very fast, so caching provides less benefit
//    than with remote databases like MongoDB/PostgreSQL

const calculator = new XPCalculator();

// ========================
// VOICE MANAGER WITH SQLITE
// ========================

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // Optional - SQLite is fast enough without cache for most bots
  checkInterval: 10000,
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
// CUSTOM STRATEGIES (same as MongoDB example)
// ========================

voiceManager.registerXPStrategy('guild-settings-xp', async (member, config) => {
  try {
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    
    if (!settings) {
      return 10;
    }
    
    let xp = 10;
    
    if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId)) {
      xp = 15;
    }
    
    if (settings.boosterRoleId && member.roles.cache.has(settings.boosterRoleId)) {
      xp = 20;
    }
    
    const channel = member.voice.channel;
    if (channel && settings.bonusChannels.includes(channel.id)) {
      xp *= 1.5;
    }
    
    xp = Math.floor(xp * settings.xpMultiplier);
    
    return xp;
  } catch (error) {
    console.error('Error in guild-settings-xp strategy:', error);
    return 10;
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

voiceManager.on('debug', (message) => {
  if (message.includes('Cache') || message.includes('SQLite')) {
    console.log(`🗄️  ${message}`);
  }
});

voiceManager.on('error', (error) => {
  console.error('❌ VoiceManager error:', error);
});

// ========================
// SQLITE-SPECIFIC: AUTOMATIC BACKUPS
// ========================

let backupInterval;

function startAutomaticBackups() {
  // Create backup every 6 hours
  backupInterval = setInterval(async () => {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/voice-tracker-${timestamp}.db`;
    
    try {
      console.log('\n💾 Creating automatic backup...');
      
      // ✅ USE SAFE BACKUP (with integrity verification)
      const success = await storage.safeBackup(backupPath);
      
      if (success) {
        console.log(`✅ Backup created: ${backupPath}\n`);
        
        // Optional: Clean up old backups (keep last 7 days)
        await cleanOldBackups(7);
      } else {
        console.error('❌ BACKUP FAILED: Database may be corrupted!');
        console.error('⚠️  ALERT: Please check database integrity immediately!');
        console.error('⚠️  Good backups are preserved.\n');
      }
      
    } catch (error) {
      console.error('❌ Backup failed:', error);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
}

async function cleanOldBackups(daysToKeep) {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const backupDir = './data/backups';
    const files = await fs.readdir(backupDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      if (!file.startsWith('voice-tracker-')) continue;
      
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        console.log(`🗑️  Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    // Ignore errors (directory might not exist yet)
  }
}

// ========================
// SQLITE-SPECIFIC: DATABASE OPTIMIZATION
// ========================

let optimizeInterval;

function startDatabaseOptimization() {
  // Optimize database every 24 hours
  optimizeInterval = setInterval(async () => {
    try {
      console.log('\n🔧 Optimizing database...');
      await storage.optimize(); // Runs VACUUM
      console.log('✅ Database optimized\n');
    } catch (error) {
      console.error('❌ Optimization failed:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
}

// ========================
// SQLITE-SPECIFIC: STATISTICS MONITORING
// ========================

let statsInterval;

function startStatsMonitoring() {
  statsInterval = setInterval(() => {
    const stats = storage.getStats();
    
    if (stats) {
      console.log('\n📊 ===== SQLITE DATABASE STATISTICS =====');
      console.log(`   Guilds:        ${stats.guilds}`);
      console.log(`   Users:         ${stats.users}`);
      console.log(`   Sessions:      ${stats.sessions}`);
      console.log(`   Database Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   File:          ${stats.filename}`);
      console.log('=========================================\n');
      
      // Alert if database is getting large
      const sizeMB = stats.databaseSize / 1024 / 1024;
      if (sizeMB > 100) {
        console.warn('⚠️  Database is getting large (>100MB). Consider optimizing or archiving old data.');
      }
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
  
  // Admin commands
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
  
  // SQLite-specific commands
  new SlashCommandBuilder()
    .setName('dbstats')
    .setDescription('View SQLite database statistics'),
  
  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Create a manual database backup (Admin only)'),
  
  new SlashCommandBuilder()
    .setName('optimize')
    .setDescription('Optimize database (VACUUM) (Admin only)'),
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
      case 'dbstats':
        await handleDbStatsCommand(interaction);
        break;
      case 'backup':
        await handleBackupCommand(interaction);
        break;
      case 'optimize':
        await handleOptimizeCommand(interaction);
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
  
  const userData = await voiceManager.getUser(interaction.guildId, targetUser.id);
  
  if (!userData) {
    return interaction.reply({
      content: `${targetUser.username} has no voice activity yet!`,
      ephemeral: true,
    });
  }
  
  const guild = voiceManager.guilds.get(interaction.guildId);
  const multiplier = await guild.config.getLevelMultiplier();
  const progress = calculator.calculateLevelProgress(userData.xp, multiplier);
  const xpToNext = calculator.calculateXPToNextLevel(userData.xp, multiplier);
  
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
    .setFooter({ text: 'Powered by SQLite 🗄️' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /leaderboard COMMAND
// ========================

async function handleLeaderboardCommand(interaction) {
  const type = interaction.options.getString('type') || 'xp';
  
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
    .setTitle(`🏆 ${type.toUpperCase()} Leaderboard`)
    .setDescription(description.join('\n'))
    .setFooter({ text: 'Lightning-fast SQLite queries ⚡' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /dbstats COMMAND (SQLite-specific)
// ========================

async function handleDbStatsCommand(interaction) {
  const stats = storage.getStats();
  
  if (!stats) {
    return interaction.reply({
      content: '❌ Failed to get database statistics.',
      ephemeral: true,
    });
  }
  
  const sizeMB = (stats.databaseSize / 1024 / 1024).toFixed(2);
  const sizeKB = (stats.databaseSize / 1024).toFixed(2);
  
  // Calculate average data per user
  const avgBytesPerUser = stats.users > 0 
    ? (stats.databaseSize / stats.users).toFixed(0)
    : 0;
  
  // Estimate sessions per user
  const sessionsPerUser = stats.users > 0
    ? (stats.sessions / stats.users).toFixed(1)
    : 0;
  
  const embed = new EmbedBuilder()
    .setColor('#00AA00')
    .setTitle('📊 SQLite Database Statistics')
    .setDescription('Real-time database metrics')
    .addFields(
      { 
        name: '🏛️ Guilds', 
        value: `${stats.guilds} server${stats.guilds !== 1 ? 's' : ''}`, 
        inline: true 
      },
      { 
        name: '👥 Users', 
        value: `${stats.users.toLocaleString()}`, 
        inline: true 
      },
      { 
        name: '📝 Sessions', 
        value: `${stats.sessions.toLocaleString()}`, 
        inline: true 
      },
      { 
        name: '💾 Database Size', 
        value: `${sizeMB} MB (${sizeKB} KB)`, 
        inline: true 
      },
      { 
        name: '📏 Avg per User', 
        value: `${avgBytesPerUser} bytes`, 
        inline: true 
      },
      { 
        name: '📊 Sessions/User', 
        value: `${sessionsPerUser}`, 
        inline: true 
      },
      {
        name: '📂 Database File',
        value: `\`${stats.filename}\``,
        inline: false
      },
      {
        name: '💡 Performance Tips',
        value: '• Run `/optimize` monthly\n' +
               '• Use `/backup` before major changes\n' +
               '• Database is backed up automatically every 6 hours',
        inline: false
      }
    )
    .setFooter({ text: 'WAL mode enabled • ACID compliant' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

// ========================
// /backup COMMAND (SQLite-specific)
// ========================

async function handleBackupCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/manual-backup-${timestamp}.db`;
    
    console.log(`\n💾 Creating manual backup...`);
    
    // ✅ USE SAFE BACKUP (with integrity verification)
    const success = await storage.safeBackup(backupPath);
    
    if (!success) {
      return await interaction.editReply({
        content: `❌ **BACKUP FAILED: Database is corrupted!**\n\n` +
                 `⚠️ Your database has integrity issues.\n` +
                 `⚠️ Existing backups are safe and not overwritten.\n\n` +
                 `**Action Required:**\n` +
                 `1. Stop the bot\n` +
                 `2. Restore from a recent backup\n` +
                 `3. Contact support if issue persists\n\n` +
                 `💡 Use \`/listbackups\` to see available backups.`,
      });
    }
    
    // Get file size
    const fs = require('fs');
    const stats = fs.statSync(backupPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    await interaction.editReply({
      content: `✅ **Database backup created successfully!**\n\n` +
               `**File:** \`${backupPath}\`\n` +
               `**Size:** ${sizeKB} KB\n` +
               `**Time:** ${new Date().toLocaleString()}\n` +
               `**Status:** Database integrity verified ✅\n\n` +
               `💡 Backups are also created automatically every 6 hours.`,
    });
  } catch (error) {
    console.error('Backup error:', error);
    await interaction.editReply({
      content: `❌ Failed to create backup.\n` +
               `Error: ${error.message}`,
    });
  }
}

// ========================
// /optimize COMMAND (SQLite-specific)
// ========================

async function handleOptimizeCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const statsBefore = storage.getStats();
    const sizeBefore = statsBefore ? statsBefore.databaseSize : 0;
    
    console.log('\n🔧 Optimizing database (VACUUM)...');
    const startTime = Date.now();
    await storage.optimize();
    const duration = Date.now() - startTime;
    console.log(`✅ Optimization complete in ${duration}ms\n`);
    
    const statsAfter = storage.getStats();
    const sizeAfter = statsAfter ? statsAfter.databaseSize : 0;
    const reduction = sizeBefore - sizeAfter;
    const reductionPercent = sizeBefore > 0 
      ? ((reduction / sizeBefore) * 100).toFixed(2)
      : 0;
    
    await interaction.editReply({
      content: `✅ Database optimized successfully!\n\n` +
               `**Duration:** ${duration}ms\n` +
               `**Before:** ${(sizeBefore / 1024 / 1024).toFixed(2)} MB\n` +
               `**After:** ${(sizeAfter / 1024 / 1024).toFixed(2)} MB\n` +
               `**Saved:** ${(reduction / 1024).toFixed(2)} KB (${reductionPercent}%)\n\n` +
               `💡 Optimization runs automatically every 24 hours.`,
    });
  } catch (error) {
    console.error('Optimize error:', error);
    await interaction.editReply({
      content: `❌ Failed to optimize database.\n` +
               `Error: ${error.message}`,
    });
  }
}

// ========================
// ADMIN COMMANDS (same as MongoDB example)
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
  
  // Connect to Mongoose (optional - for guild settings)
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        dbName: 'your_bot_database',
      });
      console.log('✅ Mongoose connected (guild settings database)');
    } catch (error) {
      console.warn('⚠️  Mongoose connection failed (guild settings disabled):', error.message);
    }
  } else {
    console.log('ℹ️  MongoDB not configured (guild settings disabled)');
  }
  
  // Initialize voice manager (uses SQLite)
  try {
    await voiceManager.init();
    console.log('✅ Voice Manager initialized (SQLite database)');
    console.log('✅ MemoryCache enabled!');
  } catch (error) {
    console.error('❌ Failed to initialize Voice Manager:', error);
    process.exit(1);
  }
  
  // Ensure backup directory exists
  const fs = require('fs');
  if (!fs.existsSync('./data/backups')) {
    fs.mkdirSync('./data/backups', { recursive: true });
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
  console.log('🎙️  Bot ready with SQLite!');
  console.log('📊 Database Architecture:');
  if (process.env.MONGODB_URI) {
    console.log('   - MongoDB: Guild settings (optional)');
  }
  console.log('   - SQLite: Voice tracking data');
  console.log('   - MemoryCache: In-process cache');
  console.log('=====================================\n');
  
  // Start SQLite-specific features
  startAutomaticBackups();
  startDatabaseOptimization();
  startStatsMonitoring();
  
  console.log('🔄 Automatic backups enabled (every 6 hours)');
  console.log('🔧 Automatic optimization enabled (every 24 hours)');
  console.log('📊 Statistics monitoring enabled (every 60 seconds)\n');
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
  
  // Stop intervals
  if (backupInterval) clearInterval(backupInterval);
  if (optimizeInterval) clearInterval(optimizeInterval);
  if (statsInterval) clearInterval(statsInterval);
  
  // Create final backup before shutdown
    try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/shutdown-backup-${timestamp}.db`;
    console.log('💾 Creating shutdown backup...');
    
    // ✅ USE SAFE BACKUP
    const success = await storage.safeBackup(backupPath);
    
    if (success) {
        console.log(`✅ Shutdown backup created: ${backupPath}`);
    } else {
        console.warn('⚠️  Shutdown backup skipped: Database integrity check failed');
    }
    } catch (error) {
    console.error('⚠️  Failed to create shutdown backup:', error.message);
    }
  
  // Get final stats
  const finalStats = storage.getStats();
  if (finalStats) {
    console.log('\n📊 Final Database Statistics:');
    console.log(`   Guilds: ${finalStats.guilds}`);
    console.log(`   Users: ${finalStats.users}`);
    console.log(`   Sessions: ${finalStats.sessions}`);
    console.log(`   Size: ${(finalStats.databaseSize / 1024 / 1024).toFixed(2)} MB\n`);
  }
  
  // Close everything gracefully
  try {
    await voiceManager.destroy();
  } catch (error) {
    console.error('Error destroying voice manager:', error.message);
  }
  
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.close();
    } catch (error) {
      console.error('Error closing mongoose:', error.message);
    }
  }
  
  client.destroy();
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

// ========================
// START BOT
// ========================

client.login(process.env.DISCORD_BOT_TOKEN);