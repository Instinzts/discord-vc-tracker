# Discord Voice Tracker - Caching Guide

## Table of Contents
* [Overview](#overview)
* [Why Use Caching?](#why-use-caching)
* [API Methods Comparison](#api-methods-comparison)
* [MongoDB + Caching Examples](#mongodb--caching-examples)
* [MongoDB + RedisCache Examples](#mongodb--rediscache-examples) ⭐ NEW
* [MongoDB WITHOUT Caching Examples](#mongodb-without-caching-examples)
* [SQLite + Caching Examples](#sqlite--caching-examples) ⭐ NEW
* [SQLite WITHOUT Caching Examples](#sqlite-without-caching-examples) ⭐ NEW
* [JSON Storage + Caching Examples](#json-storage--caching-examples)
* [JSON Storage WITHOUT Caching Examples](#json-storage-without-caching-examples)
* [Performance Impact](#performance-impact)
* [Best Practices](#best-practices)
* [Migration Guide](#migration-guide)
* [Environment Variables](#environment-variables) ⭐ NEW
* [Troubleshooting](#troubleshooting) ⭐ NEW

---

## Overview

The caching system in `discord-vc-tracker` sits between your bot commands and your storage backend (MongoDB, SQLite, or JSON files). When enabled, frequently accessed data — like user stats and leaderboards — is stored in a fast cache layer, drastically reducing direct database queries.

Two cache implementations are available:

- **MemoryCache** — In-process memory cache. Zero dependencies, fastest possible reads. Best for single-instance bots using any storage backend.
- **RedisCache** — Redis-backed persistent cache. Best for production bots that run multiple instances or need cache data to survive restarts.

### Choosing Your Setup

| Storage | Best For | Cache Recommendation |
|---|---|---|
| **JSON** | < 10 guilds, < 1000 users, simple setup, no external database | MemoryCache |
| **SQLite** | Small-to-medium bots, single server, need backups & zero-config DB | MemoryCache |
| **MongoDB + MemoryCache** | 10+ guilds, 1000+ users, single instance, custom schemas | MemoryCache |
| **MongoDB + RedisCache** | Production, multi-instance, need persistent cache across restarts | RedisCache |

---

## Why Use Caching?

Without caching, every `/stats` or `/leaderboard` command hits your storage directly. For small bots this is fine, but as your server grows, response times degrade and storage load increases.

Caching solves this by:

- Storing hot data in fast memory (MemoryCache) or a shared Redis instance (RedisCache)
- Automatically expiring stale entries via a configurable TTL
- Reducing database/file reads by up to **95%**
- Making user queries **40–200x faster**
- Making leaderboard queries **100–400x faster**

---

## API Methods Comparison

Using the correct API methods is critical for cache performance. The cache-aware top-level methods (`voiceManager.getUser()`, `voiceManager.getLeaderboard()`) check the cache first automatically. The guild-level methods bypass it entirely.

### ✅ Cache-Aware (RECOMMENDED)

```javascript
// Checks cache first, falls back to storage on a miss
const userData = await voiceManager.getUser(guildId, userId);
const leaderboard = await voiceManager.getLeaderboard(guildId, { sortBy: 'xp', limit: 10 });
```

### ❌ Non-Cache-Aware (bypasses cache entirely)

```javascript
// Goes directly to storage every time — no cache benefit
const guild = voiceManager.guilds.get(guildId);
const user = guild.users.get(userId);
const leaderboard = await guild.getLeaderboard('xp', 10);
```

> 💡 Always use the cache-aware methods in your slash commands. The guild-level methods are shown in the "WITHOUT Caching" sections below only for comparison.

---

## MongoDB + Caching Examples

This example uses `MongoStorage` paired with `MemoryCache` — the recommended setup for production MongoDB bots running a single instance.

### Setup

```javascript
const { VoiceManager, MongoStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');
const mongoose = require('mongoose');

const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'  // Dedicated database for voice tracking data
);

// ✅ MemoryCache — recommended for single-instance production bots
const cache = new MemoryCache({
  ttl: 300000,      // 5 minutes cache lifetime
  maxSize: 1000,    // Max 1000 cached items
  enableStats: true // Track cache hit/miss performance
});

const calculator = new XPCalculator();

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ✅ Enable caching for 10-100x performance boost
  checkInterval: 10000,
  debug: true,

  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    enableLeveling: true,
    enableVoiceTime: true,
    xpStrategy: 'guild-settings-xp',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    xpConfig: { baseAmount: 10 },
    voiceTimeConfig: { baseAmount: 5000 },
  },
});
```

### Custom Mongoose Schema

You can extend the tracker with your own Mongoose models for guild-level settings like VIP roles, bonus channels, and custom level-up messages:

```javascript
const GuildSettingsSchema = new mongoose.Schema({
  guildId:        { type: String, required: true, unique: true },
  vipRoleId:      String,
  boosterRoleId:  String,
  xpMultiplier:   { type: Number, default: 1 },
  bonusChannels:  [String],
  customMessage:  String,
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now },
});

GuildSettingsSchema.index({ guildId: 1 }); // Index for fast lookups
const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);
```

### Database-Driven XP Strategy

Register a custom strategy that reads from your Mongoose schema to apply role-based and channel-based XP bonuses:

```javascript
// ⚠️ Must be registered BEFORE voiceManager.init()
voiceManager.registerXPStrategy('guild-settings-xp', async (member, config) => {
  try {
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    if (!settings) return 10; // Default XP fallback

    let xp = 10;

    // Role-based bonuses
    if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId))         xp = 15;
    if (settings.boosterRoleId && member.roles.cache.has(settings.boosterRoleId)) xp = 20;

    // Bonus channel multiplier
    const channel = member.voice.channel;
    if (channel && settings.bonusChannels.includes(channel.id)) xp *= 1.5;

    // Guild-wide XP multiplier
    return Math.floor(xp * settings.xpMultiplier);
  } catch (error) {
    console.error('Error in guild-settings-xp strategy:', error);
    return 10; // Fallback on error
  }
});
```

### Cache-Aware `/stats` Command

```javascript
async function handleStatsCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  // ✅ Cache-aware — 40-200x faster than direct DB query
  const userData = await voiceManager.getUser(interaction.guildId, targetUser.id);
  if (!userData) {
    return interaction.reply({ content: `${targetUser.username} has no voice activity yet!`, ephemeral: true });
  }

  const guild      = voiceManager.guilds.get(interaction.guildId);
  const multiplier = await guild.config.getLevelMultiplier();
  const progress   = calculator.calculateLevelProgress(userData.xp, multiplier);
  const xpToNext   = calculator.calculateXPToNextLevel(userData.xp, multiplier);

  // ✅ Rank via cached leaderboard — 100-400x faster
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, { sortBy: 'xp', limit: 1000 });
  const rank = leaderboard.find(entry => entry.userId === targetUser.id)?.rank || null;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Voice Stats for ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '⏱️ Voice Time', value: calculator.formatVoiceTime(userData.totalVoiceTime), inline: true },
      { name: '⭐ Level',      value: `${userData.level}`,                                  inline: true },
      { name: '💫 XP',         value: `${userData.xp.toLocaleString()}`,                    inline: true },
      { name: '📈 Progress',   value: `${progress}% → Level ${userData.level + 1}`,        inline: true },
      { name: '🎯 XP Needed',  value: `${xpToNext.toLocaleString()}`,                      inline: true },
      { name: '🏆 Rank',       value: rank ? `#${rank}` : 'Unranked',                      inline: true },
    )
    .setFooter({ text: 'Powered by discord-vc-tracker with CACHING!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
```

### Cache-Aware `/leaderboard` Command

```javascript
async function handleLeaderboardCommand(interaction) {
  const type = interaction.options.getString('type') || 'xp';

  // ✅ Cache-aware leaderboard
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, { sortBy: type, limit: 10 });

  if (leaderboard.length === 0) {
    return interaction.reply({ content: 'No leaderboard data available yet!', ephemeral: true });
  }

  const description = await Promise.all(
    leaderboard.map(async (entry, index) => {
      const member   = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      const username = member ? member.user.username : 'Unknown User';

      let value;
      if (type === 'voiceTime') value = calculator.formatVoiceTime(entry.voiceTime || entry.totalVoiceTime);
      else if (type === 'level') value = `Level ${entry.level}`;
      else                       value = `${entry.xp.toLocaleString()} XP`;

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
```

### `/cachestats` Command

Monitor live cache performance directly from Discord:

```javascript
async function handleCacheStatsCommand(interaction) {
  if (!voiceManager.cache) {
    return interaction.reply({ content: '❌ Cache is not enabled.', ephemeral: true });
  }

  const stats = await voiceManager.cache.getStats();
  const totalRequests = stats.hits + stats.misses;
  const avgResponseTime = stats.hits > 0 ? `~${Math.round(5 * (stats.misses / totalRequests))}ms` : 'N/A';

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📊 Cache Performance Statistics')
    .addFields(
      { name: '🎯 Hit Rate',    value: `${(stats.hitRate * 100).toFixed(2)}%`,  inline: true },
      { name: '✅ Hits',        value: `${stats.hits.toLocaleString()}`,        inline: true },
      { name: '❌ Misses',      value: `${stats.misses.toLocaleString()}`,      inline: true },
      { name: '📦 Cache Size',  value: `${stats.size} items`,                  inline: true },
      { name: '➕ Sets',        value: `${stats.sets.toLocaleString()}`,       inline: true },
      { name: '➖ Deletes',     value: `${stats.deletes.toLocaleString()}`,    inline: true },
      { name: '⚡ Performance', value: `Avg response: ${avgResponseTime}\nEst. speedup: ${stats.hitRate > 0 ? `${Math.round(stats.hitRate * 100)}x` : 'N/A'}` },
    )
    .setFooter({ text: 'Cache stats reset on bot restart' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
```

### Cache Monitoring (Console)

```javascript
setInterval(async () => {
  const stats = await voiceManager.cache.getStats();
  console.log('📊 ===== CACHE STATISTICS =====');
  console.log(`   Hit Rate:   ${(stats.hitRate * 100).toFixed(2)}%`);
  console.log(`   Hits:       ${stats.hits}`);
  console.log(`   Misses:     ${stats.misses}`);
  console.log(`   Size:       ${stats.size} items`);
  console.log('==============================');
}, 60000); // Every 60 seconds
```

### Level-Up Event with Custom Messages

```javascript
voiceManager.on('levelUp', async (user, oldLevel, newLevel) => {
  const guild    = user.guild.discordGuild;
  const member   = await guild.members.fetch(user.userId);
  const settings = await GuildSettings.findOne({ guildId: guild.id });
  const channel  = guild.channels.cache.find(ch => ch.name === 'general' || ch.name === 'chat');

  if (channel) {
    const message = settings?.customMessage
      ? settings.customMessage.replace('{user}', member.toString()).replace('{level}', newLevel)
      : `${member} just reached **Level ${newLevel}**!`;

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎉 Level Up!')
      .setDescription(message)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }
});
```

> 📄 **Full example:** `Mongodb-MemoryCache-Example-Support.js`

---

## MongoDB + RedisCache Examples ⭐ NEW

`RedisCache` is a drop-in replacement for `MemoryCache` that persists across bot restarts and is shared between multiple bot instances. Use this for production deployments running more than one process.

### Setup

```javascript
const { VoiceManager, MongoStorage, RedisCache, XPCalculator } = require('discord-vc-tracker');
const mongoose = require('mongoose');

const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'
);

// ✅ RedisCache — persistent, shared across instances
const cache = new RedisCache({
  url:          process.env.REDIS_URL || 'redis://localhost:6379',
  ttl:          300000,       // 5 minutes cache lifetime
  keyPrefix:    'voice:',     // Namespaces all keys (important if sharing a Redis instance)
  enableStats:  true          // Track cache performance
});

const calculator = new XPCalculator();

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // RedisCache works as a drop-in replacement for MemoryCache
  checkInterval: 10000,
  debug: true,

  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    enableLeveling: true,
    enableVoiceTime: true,
    xpStrategy: 'guild-settings-xp',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    xpConfig: { baseAmount: 10 },
    voiceTimeConfig: { baseAmount: 5000 },
  },
});
```

### MemoryCache vs RedisCache — At a Glance

| Feature | MemoryCache | RedisCache |
|---|---|---|
| Persistence | Lost on restart | ✅ Survives restarts |
| Multi-instance | Each process has its own cache | ✅ Shared across all processes |
| External dependency | None | Requires a Redis server |
| Raw read speed | Fastest (in-process) | Very fast (local network) |
| Best for | Single-instance bots | Production / scaled deployments |

### `/cachestats` with Redis Metrics

The Redis version includes an additional memory estimate and a status indicator:

```javascript
async function handleCacheStatsCommand(interaction) {
  const stats = await voiceManager.cache.getStats();
  const totalRequests    = stats.hits + stats.misses;
  const avgResponseTime  = stats.hits > 0 ? `~${Math.round(5 * (stats.misses / totalRequests))}ms` : 'N/A';
  const estimatedMemKB   = Math.round(stats.size * 0.5); // ~0.5 KB per cached item

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📊 Redis Cache Performance')
    .addFields(
      { name: '🎯 Hit Rate',   value: `${(stats.hitRate * 100).toFixed(2)}%`,               inline: true },
      { name: '✅ Hits',       value: `${stats.hits.toLocaleString()}`,                     inline: true },
      { name: '❌ Misses',     value: `${stats.misses.toLocaleString()}`,                   inline: true },
      { name: '📦 Size',       value: `${stats.size} items (~${estimatedMemKB} KB)`,        inline: true },
      { name: '➕ Sets',       value: `${stats.sets.toLocaleString()}`,                     inline: true },
      { name: '➖ Deletes',    value: `${stats.deletes.toLocaleString()}`,                  inline: true },
      {
        name: '⚡ Performance',
        value: `Avg response: ${avgResponseTime}\n` +
               `Speedup: ${stats.hitRate > 0 ? `~${Math.round(stats.hitRate * 100)}x faster` : 'N/A'}\n` +
               `Status: ${stats.hitRate > 0.8 ? '🟢 Excellent' : stats.hitRate > 0.6 ? '🟡 Good' : '🔴 Poor'}`,
      },
    )
    .setFooter({ text: 'Cache persists across restarts • Shared between bot instances' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
```

### ~~`/clearcache` Command (Redis-Only)~~ — Deprecated

> [!CAUTION]
> **Deprecated — Removed in v1.1.0**
> This command has been removed. Clearing the cache while active voice sessions were writing caused race conditions that led to XP and voice-time data desyncing until affected users disconnected and reconnected. Rather than risk silent data loss, the command was pulled entirely.
>
> **If you need to force a fresh cache:** simply restart the bot. The cache rebuilds automatically within 1–2 minutes of user activity.

The code below is kept for reference only and **should not be used**:

```javascript
async function handleClearCacheCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const statsBefore = await voiceManager.cache.getStats();
  await voiceManager.cache.clear();
  await new Promise(resolve => setTimeout(resolve, 100)); // Let Redis process
  const statsAfter  = await voiceManager.cache.getStats();

  const itemsCleared = statsBefore.size - statsAfter.size;

  await interaction.editReply({
    content: `✅ Redis cache cleared!\n\n` +
             `**Before:** ${statsBefore.size} items | **After:** ${statsAfter.size} items\n` +
             `🗑️ **Cleared:** ${itemsCleared} items\n\n` +
             `⚠️ Cache will rebuild automatically as users are active in voice channels.`,
  });
}
```

### Low Hit-Rate Alert

Add an automatic warning to catch degraded cache performance early:

```javascript
setInterval(async () => {
  const stats = await voiceManager.cache.getStats();
  console.log(`📊 Redis — Hit Rate: ${(stats.hitRate * 100).toFixed(2)}% | Size: ${stats.size}`);

  if (stats.hitRate < 0.6 && (stats.hits + stats.misses) > 100) {
    console.warn('⚠️  Low cache hit rate detected! Consider increasing TTL or checking cache configuration.');
  }
}, 60000);
```

### Graceful Shutdown with Final Stats

Because Redis is an external connection, the shutdown handler checks connectivity before reading stats:

```javascript
process.on('SIGINT', async () => {
  if (cacheStatsInterval) clearInterval(cacheStatsInterval);

  try {
    if (voiceManager.cache && voiceManager.cache.connected) {
      const stats = await voiceManager.cache.getStats();
      console.log('📊 Final Redis Cache Stats:');
      console.log(`   Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`   Hits: ${stats.hits} | Misses: ${stats.misses} | Size: ${stats.size}`);
    }
  } catch (error) {
    console.log('📊 Cache stats unavailable during shutdown');
  }

  await voiceManager.destroy();
  await mongoose.connection.close();
  client.destroy();
  process.exit(0);
});
```

> 📄 **Full example:** `Mongodb-RedisCache-Example-Support.js`

---

## MongoDB WITHOUT Caching Examples

To run MongoDB without any cache, simply omit the `cache` option:

```javascript
const voiceManager = new VoiceManager(client, {
  storage,          // MongoStorage — still required
  // cache: null,   // ❌ No cache — every query hits MongoDB directly
  checkInterval: 10000,
});
```

### `/stats` Without Cache

```javascript
// ❌ Every call queries MongoDB directly
const guild = voiceManager.guilds.get(interaction.guildId);
const user  = guild?.users.get(targetUser.id);

const multiplier = await guild.config.getLevelMultiplier();
const progress   = calculator.calculateLevelProgress(user.xp, multiplier);
const xpToNext   = calculator.calculateXPToNextLevel(user.xp, multiplier);
const rank       = await user.getRank('xp'); // Direct database query every time
```

> ⚠️ This is **not recommended** for production. It works for local development or very small bots with fewer than 10 active users.

---

## SQLite + Caching Examples ⭐ NEW

`SQLiteStorage` is a zero-configuration file-based database — it creates and manages the `.db` file automatically. Pairing it with `MemoryCache` adds a fast in-process cache on top of an already-fast local database.

### Setup

```javascript
const { VoiceManager, SQLiteStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');

// ✅ Option 1: Zero-config (creates ./data/voice-tracker.db automatically)
const storage = new SQLiteStorage();

// ✅ Option 2: Custom file path
// const storage = new SQLiteStorage({ filename: './data/my-bot-voice.db' });

// ✅ Option 3: Production (env-driven path, longer timeout)
// const storage = new SQLiteStorage({
//   filename: process.env.SQLITE_DB_PATH || './data/voice-tracker.db',
//   timeout:  10000,
// });

const cache = new MemoryCache({
  ttl:         300000,  // 5 minutes
  maxSize:     1000,
  enableStats: true
});

const calculator = new XPCalculator();

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // Optional — SQLite is already fast, but cache still helps under load
  checkInterval: 10000,
  debug: true,

  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    trackMuted: true,
    trackDeafened: true,
    enableLeveling: true,
    enableVoiceTime: true,
    xpStrategy: 'guild-settings-xp',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    xpConfig: { baseAmount: 10 },
    voiceTimeConfig: { baseAmount: 5000 },
  },
});
```

> ℹ️ SQLite is already very fast for local reads, so caching provides less dramatic speedup than with remote databases like MongoDB. It still helps noticeably when many users query stats simultaneously.

### Automatic Backups

SQLite supports safe backups with built-in integrity verification. If the database is corrupted, `safeBackup()` returns `false` and does **not** overwrite existing backups:

```javascript
let backupInterval;

function startAutomaticBackups() {
  backupInterval = setInterval(async () => {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/voice-tracker-${timestamp}.db`;

    console.log('💾 Creating automatic backup...');
    const success = await storage.safeBackup(backupPath);

    if (success) {
      console.log(`✅ Backup created: ${backupPath}`);
      await cleanOldBackups(7); // Keep only the last 7 days
    } else {
      console.error('❌ BACKUP FAILED: Database integrity check failed!');
      console.error('⚠️  Existing backups are preserved.');
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours
}

async function cleanOldBackups(daysToKeep) {
  const fs   = require('fs').promises;
  const path = require('path');
  const backupDir = './data/backups';
  const maxAge    = daysToKeep * 24 * 60 * 60 * 1000;

  try {
    const files = await fs.readdir(backupDir);
    for (const file of files) {
      if (!file.startsWith('voice-tracker-')) continue;
      const stats = await fs.stat(path.join(backupDir, file));
      if (Date.now() - stats.mtimeMs > maxAge) {
        await fs.unlink(path.join(backupDir, file));
        console.log(`🗑️  Deleted old backup: ${file}`);
      }
    }
  } catch (error) { /* directory may not exist yet */ }
}
```

### Database Optimization (VACUUM)

SQLite can accumulate unused space over time. Running `VACUUM` periodically reclaims it:

```javascript
let optimizeInterval;

function startDatabaseOptimization() {
  optimizeInterval = setInterval(async () => {
    try {
      console.log('🔧 Optimizing database...');
      await storage.optimize(); // Runs VACUUM
      console.log('✅ Database optimized');
    } catch (error) {
      console.error('❌ Optimization failed:', error);
    }
  }, 24 * 60 * 60 * 1000); // Every 24 hours
}
```

### `/dbstats` Command

View real-time database metrics directly in Discord:

```javascript
async function handleDbStatsCommand(interaction) {
  const stats = storage.getStats();
  // stats: { guilds, users, sessions, databaseSize, filename }

  if (!stats) {
    return interaction.reply({ content: '❌ Failed to get database statistics.', ephemeral: true });
  }

  const sizeMB          = (stats.databaseSize / 1024 / 1024).toFixed(2);
  const avgBytesPerUser = stats.users > 0 ? (stats.databaseSize / stats.users).toFixed(0) : 0;
  const sessionsPerUser = stats.users > 0 ? (stats.sessions / stats.users).toFixed(1) : 0;

  const embed = new EmbedBuilder()
    .setColor('#00AA00')
    .setTitle('📊 SQLite Database Statistics')
    .addFields(
      { name: '🏛️ Guilds',          value: `${stats.guilds}`,                    inline: true },
      { name: '👥 Users',           value: `${stats.users.toLocaleString()}`,     inline: true },
      { name: '📝 Sessions',        value: `${stats.sessions.toLocaleString()}`,  inline: true },
      { name: '💾 Database Size',   value: `${sizeMB} MB`,                       inline: true },
      { name: '📏 Avg per User',    value: `${avgBytesPerUser} bytes`,           inline: true },
      { name: '📊 Sessions/User',   value: `${sessionsPerUser}`,                 inline: true },
      { name: '📂 File',            value: `\`${stats.filename}\`` },
      {
        name:  '💡 Tips',
        value: '• Run `/optimize` monthly\n• Use `/backup` before major changes\n• Auto-backups run every 6 hours',
      },
    )
    .setFooter({ text: 'WAL mode enabled • ACID compliant' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
```

### `/backup` Command (Manual)

```javascript
async function handleBackupCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const timestamp  = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupPath = `./data/backups/manual-backup-${timestamp}.db`;

  const success = await storage.safeBackup(backupPath);

  if (!success) {
    return await interaction.editReply({
      content: `❌ **Backup failed — database integrity check did not pass.**\n\n` +
               `⚠️ Existing backups are safe and were not overwritten.\n` +
               `**Action:** Stop the bot, restore from a recent backup, and investigate.`,
    });
  }

  const fs    = require('fs');
  const sizeKB = (fs.statSync(backupPath).size / 1024).toFixed(2);

  await interaction.editReply({
    content: `✅ **Backup created successfully!**\n\n` +
             `**File:** \`${backupPath}\`\n` +
             `**Size:** ${sizeKB} KB\n` +
             `**Integrity:** Verified ✅`,
  });
}
```

### `/optimize` Command (Manual VACUUM)

```javascript
async function handleOptimizeCommand(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const sizeBefore = storage.getStats()?.databaseSize || 0;
  const startTime  = Date.now();
  await storage.optimize();
  const duration   = Date.now() - startTime;
  const sizeAfter  = storage.getStats()?.databaseSize || 0;
  const saved      = ((sizeBefore - sizeAfter) / 1024).toFixed(2);

  await interaction.editReply({
    content: `✅ Database optimized!\n\n` +
             `**Duration:** ${duration}ms\n` +
             `**Before:** ${(sizeBefore / 1024 / 1024).toFixed(2)} MB\n` +
             `**After:**  ${(sizeAfter  / 1024 / 1024).toFixed(2)} MB\n` +
             `**Saved:**  ${saved} KB\n\n` +
             `💡 Optimization also runs automatically every 24 hours.`,
  });
}
```

### Shutdown Backup

Create a final backup every time the bot shuts down cleanly:

```javascript
process.on('SIGINT', async () => {
  // Stop all intervals
  if (backupInterval)   clearInterval(backupInterval);
  if (optimizeInterval) clearInterval(optimizeInterval);
  if (statsInterval)    clearInterval(statsInterval);

  // Final backup
  try {
    const timestamp  = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/shutdown-backup-${timestamp}.db`;
    const success    = await storage.safeBackup(backupPath);
    console.log(success ? `✅ Shutdown backup: ${backupPath}` : '⚠️  Shutdown backup skipped (integrity check failed)');
  } catch (error) {
    console.error('⚠️  Shutdown backup failed:', error.message);
  }

  await voiceManager.destroy();
  client.destroy();
  process.exit(0);
});
```

> 📄 **Full example:** `Sqlite-MemoryCache-Example-Support.js`

---

## SQLite WITHOUT Caching Examples ⭐ NEW

SQLite is fast enough to run without a cache for most small-to-medium bots:

```javascript
const voiceManager = new VoiceManager(client, {
  storage,  // SQLiteStorage
  // No cache — queries go directly to the local .db file
  checkInterval: 10000,
});
```

> 💡 Backups and optimization (`safeBackup()`, `optimize()`, `getStats()`) are features of `SQLiteStorage` itself, not the cache layer. They work the same whether or not a cache is enabled.

---

## JSON Storage + Caching Examples

JSON file storage is the simplest option — no database or extra dependencies required. `MemoryCache` boosts it significantly by avoiding repeated disk reads.

### Setup

```javascript
const { VoiceManager, JSONStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');

const storage    = new JSONStorage('./data');      // Stores data as JSON files in ./data
const cache      = new MemoryCache({ ttl: 300000, maxSize: 1000 });
const calculator = new XPCalculator();

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ✅ Eliminates repeated disk reads
  checkInterval: 5000,
  debug: true,

  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    enableLeveling: true,
    enableVoiceTime: true,
    xpStrategy: 'channel-bonus',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
  },
});
```

### Channel-Based XP Strategy

```javascript
voiceManager.registerXPStrategy('channel-bonus', (member) => {
  const channel = member.voice.channel;
  if (!channel)                                          return 10;
  if (channel.name.toLowerCase().includes('study'))      return 20;
  if (channel.name.toLowerCase().includes('game'))       return 15;
  return 10;
});
```

### `/stats` Command

```javascript
const user = await voiceManager.getUser(interaction.guildId, interaction.user.id);
if (!user) return interaction.reply({ content: 'No data yet!', ephemeral: true });

const multiplier = await voiceManager.guilds.get(interaction.guildId)?.config.getLevelMultiplier();
const progress   = calculator.calculateLevelProgress(user.xp, multiplier);
const xpToNext   = calculator.calculateXPToNextLevel(user.xp, multiplier);
const rank       = await user.getRank('xp');

await interaction.reply({
  embeds: [
    new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Stats`)
      .addFields(
        { name: 'Level',      value: `${user.level}`,                             inline: true },
        { name: 'XP',         value: `${user.xp}`,                               inline: true },
        { name: 'Progress',   value: `${progress}% → Level ${user.level + 1}`,   inline: true },
        { name: 'XP to Next', value: `${xpToNext}`,                             inline: true },
        { name: 'Rank',       value: rank ? `#${rank}` : 'Unranked',            inline: true },
      )
  ]
});
```

> 📄 **Full example:** `Json-MemoryCache-Example-Support.js`

---

## JSON Storage WITHOUT Caching Examples

```javascript
const voiceManager = new VoiceManager(client, {
  storage,  // JSONStorage
  // No cache — reads JSON files from disk on every query
  checkInterval: 5000,
});
```

> ⚠️ Without caching, every query reads from disk. This is fine for fewer than 100 users but performance degrades quickly beyond that.

---

## Performance Impact

### Response Time Comparison

| Operation | No Cache | MemoryCache | RedisCache |
|---|---|---|---|
| User query (`/stats`) | 50–200ms (storage hit) | ~1–5ms | ~2–8ms |
| Leaderboard (`/leaderboard`) | 100–500ms | ~1–5ms | ~2–10ms |
| Storage queries saved | — | ~95% | ~95% |
| Approximate speedup | — | **40–200x** | **20–100x** |
| Cache survives restart | — | ❌ | ✅ |
| Shared across instances | — | ❌ | ✅ |

### Per-Storage Notes

- **MongoDB** — Largest benefit from caching because every uncached query is a network round-trip to a remote database. MemoryCache is a massive win here.
- **SQLite** — Already fast (local file, WAL mode). Caching still helps when many users hit `/stats` or `/leaderboard` at the same time.
- **JSON** — Moderate benefit. File I/O is the bottleneck; cache eliminates it entirely for repeated reads.

---

## Best Practices

### Cache Configuration

- Set `ttl` to **300000** (5 min) as a starting point. Increase to **600000** (10 min) for read-heavy bots where data changes infrequently.
- Set `maxSize` to at least **2× your expected concurrent active users**.
- Always set `enableStats: true` so you can monitor performance with `/cachestats`.

### Target Hit Rate

Aim for a **70–85% cache hit rate**. If it's lower:

- Make sure all your commands use cache-aware methods (`voiceManager.getUser()`, `voiceManager.getLeaderboard()`).
- Wait **2–5 minutes** after restart for the cache to warm up — hit rate will be low initially.
- Consider increasing TTL if data isn't changing frequently.

### Redis-Specific

- Always set `keyPrefix` if you're sharing a Redis instance with other services or bots.
- Use the `/clearcache` admin command after data migrations to force a fresh cache rebuild.
- Add the low hit-rate alert (see the RedisCache examples above) to catch problems early in production.

### SQLite-Specific

- Enable **automatic backups every 6 hours** via `safeBackup()`.
- Enable **automatic optimization every 24 hours** via `optimize()` (VACUUM).
- Use `safeBackup()` instead of manually copying the `.db` file — it verifies database integrity before writing.
- Add a size alert (e.g., warn at 100 MB) via `storage.getStats()`.
- Create a **shutdown backup** in your `SIGINT` handler so you never lose data on a clean exit.

### General

- Register all custom XP strategies **before** calling `voiceManager.init()`.
- Listen for the `debug` event and filter for `Cache` messages during development to see hits and misses in real time.
- Always handle the case where `voiceManager.cache` is `null` — this lets your commands work (slower) even if caching is accidentally disabled.

---

## Migration Guide

### Adding MemoryCache to an Existing Bot

No new packages are needed — `MemoryCache` ships with `discord-vc-tracker`.

**Step 1 — Create the cache:**

```javascript
const { MemoryCache } = require('discord-vc-tracker');

const cache = new MemoryCache({
  ttl:         300000,
  maxSize:     1000,
  enableStats: true
});
```

**Step 2 — Pass it to VoiceManager:**

```javascript
const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ← add this line
});
```

**Step 3 — Update your commands:**

```javascript
// ❌ Before (bypasses cache)
const guild = voiceManager.guilds.get(guildId);
const user  = guild.users.get(userId);

// ✅ After (cache-aware)
const user = await voiceManager.getUser(guildId, userId);
```

That's it. The cache is now active.

---

### Switching from MemoryCache to RedisCache

**Step 1 — Make sure you have a Redis server running** (locally or via a managed service like Redis Cloud).

**Step 2 — Swap the cache instance:**

```javascript
// ❌ Before
const { MemoryCache } = require('discord-vc-tracker');
const cache = new MemoryCache({ ttl: 300000, maxSize: 1000 });

// ✅ After
const { RedisCache } = require('discord-vc-tracker');
const cache = new RedisCache({
  url:         process.env.REDIS_URL || 'redis://localhost:6379',
  ttl:         300000,
  keyPrefix:   'voice:',
  enableStats: true
});
```

**Step 3 — Add `REDIS_URL` to your `.env`:**

```env
REDIS_URL=redis://localhost:6379
```

No other code changes are needed. `RedisCache` is a drop-in replacement.

---

### Migrating from JSON Storage to SQLite

**Step 1 — Swap the storage class:**

```javascript
// ❌ Before
const { JSONStorage } = require('discord-vc-tracker');
const storage = new JSONStorage('./data');

// ✅ After
const { SQLiteStorage } = require('discord-vc-tracker');
const storage = new SQLiteStorage(); // Auto-creates ./data/voice-tracker.db
```

**Step 2 — Create the backup directory:**

```javascript
const fs = require('fs');
if (!fs.existsSync('./data/backups')) {
  fs.mkdirSync('./data/backups', { recursive: true });
}
```

**Step 3 — Start the automatic backup and optimization routines** (see the SQLite + Caching section above).

> 💡 SQLite creates the database and all required tables on first run. No manual schema setup is needed. Note that existing JSON data is **not** automatically migrated — run both storages in parallel for one cycle if you need to carry over data.

---

## Environment Variables ⭐ NEW

All examples use `dotenv` to load configuration from a `.env` file in your project root. Here is the full reference:

```env
# ─── Required by all examples ───────────────────────────
DISCORD_BOT_TOKEN=your_bot_token_here

# ─── MongoDB examples ───────────────────────────────────
MONGODB_URI=mongodb://localhost:27017
# MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

# ─── Redis cache example ────────────────────────────────
REDIS_URL=redis://localhost:6379
# Redis Cloud / managed Redis:
# REDIS_URL=rediss://user:password@host:port

# ─── SQLite example (optional — has a sensible default) ─
SQLITE_DB_PATH=./data/voice-tracker.db
```

### Install Commands by Setup

```bash
# JSON + MemoryCache (no extra dependencies)
npm install discord.js discord-vc-tracker dotenv

# MongoDB + MemoryCache
npm install discord.js discord-vc-tracker dotenv mongodb mongoose

# MongoDB + RedisCache
npm install discord.js discord-vc-tracker dotenv mongodb mongoose

# SQLite + MemoryCache
npm install discord.js discord-vc-tracker dotenv
```

---

## Troubleshooting ⭐ NEW

### Cache Not Working?

Check the console for cache activity messages:

```
🗄️  Cache MISS: user:123:456
🗄️  Cache HIT:  user:123:456  ← you should start seeing these after a few seconds
```

If you only see `MISS`:

- Confirm that `cache` is being passed to `VoiceManager` in your config.
- Make sure your commands are calling `voiceManager.getUser()` and `voiceManager.getLeaderboard()` instead of the guild-level methods.
- Wait **1–2 minutes** for the cache to warm up. The first request for each key will always be a miss.

### Low Hit Rate?

```javascript
const stats = await voiceManager.cache.getStats();
console.log(stats.hitRate); // Target: 0.70 – 0.85
```

If hit rate stays low after the cache has warmed up:

- **Increase TTL:** `new MemoryCache({ ttl: 600000 })` gives the cache 10 minutes instead of 5.
- **Check your commands:** Any command that reads user or leaderboard data should use the cache-aware methods.
- **Monitor longer:** Run the bot for 30+ minutes before judging hit rate. Early numbers are skewed by cold-cache misses.

### Redis Connection Issues?

- Verify that your Redis server is running and accessible from the bot process.
- Check that `REDIS_URL` in your `.env` matches your Redis server address.
- If using a managed Redis service, make sure TLS is enabled and the URL starts with `rediss://` (note the double `s`).
- Check the bot console for `❌ VoiceManager error` messages immediately after startup — a connection failure will show up there.

### SQLite Database Locked?

- SQLite uses WAL mode by default, which handles concurrent reads well. Locking usually only occurs during heavy writes.
- If you see `SQLITE_BUSY` errors, try increasing the `timeout` option: `new SQLiteStorage({ timeout: 10000 })`.
- Run `/optimize` (VACUUM) — a fragmented database can increase lock contention.

---

📖 **Learn More**
- **Main Documentation**: [../README.md](../readme.md)
- **Changelog**: [../CHANGELOG.md](../CHANGELOG.md)
- **GitHub**: [https://github.com/Instinzts/discord-vc-tracker](https://github.com/Instinzts/discord-vc-tracker)

🙏 **Support**
- 🐛 [Report Issues](https://github.com/Instinzts/discord-vc-tracker/issues)
- 💬 [Discord Server](https://discord.gg/Kf5kC5s8ha)
- ⭐ Star the repo if helpful!

---

**Made with ❤️ by [Async](https://github.com/Instinzts)**