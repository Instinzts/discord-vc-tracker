# Discord Voice Tracker

> 🎙️ A modern, production-ready voice activity tracking system for Discord bots with XP, leveling, comprehensive statistics, and **high-performance caching**.

[![npm version](https://img.shields.io/npm/v/discord-vc-tracker?style=flat-square)](https://www.npmjs.com/package/discord-vc-tracker)
[![npm downloads](https://img.shields.io/npm/dt/discord-vc-tracker?style=flat-square)](https://www.npmjs.com/package/discord-vc-tracker)
[![License](https://img.shields.io/npm/l/discord-vc-tracker?style=flat-square)](LICENSE)
[![Node Version](https://img.shields.io/node/v/discord-vc-tracker?style=flat-square)](https://nodejs.org)

---

## ✨ Features

- 🎯 **Voice Time Tracking** - Track total and per-channel voice activity
- 💫 **XP & Leveling System** - Automatic XP gain and level progression
- 🔥 **Strategy Pattern System** - Secure, flexible XP calculation (no `eval()`)
- ⚡ **High-Performance Caching** - **NEW!** 10-100x faster with in-memory caching
- 📊 **Statistics & Analytics** - Detailed user stats and session history
- 🏆 **Leaderboards** - Rank users by voice time, XP, or level
- ⚙️ **Highly Configurable** - Customize tracking behavior per guild
- 💾 **Multiple Storage Options** - JSON (built-in), SQLite (built-in), and MongoDB support
- 🗄️ **SQLite Storage** - Zero-config file-based database with backups & VACUUM ⭐ NEW
- 🔄 **RedisCache** - Persistent, multi-instance caching that survives restarts ⭐ NEW
- 🐳 **Docker Ready** - Production Dockerfile + compose presets for every setup ⭐ NEW
- 🗄️ **MongoDB Schema Integration** - Use your own database schemas for custom logic
- 🔒 **Secure by Design** - No eval(), no code injection vulnerabilities
- 📝 **TypeScript Support** - Full type definitions included
- 🚀 **Production Ready** - Optimized performance with caching
- 📦 **Easy Integration** - Simple setup with sensible defaults

---

## 🔥 Why This Package?

### **The Problem with Other Packages**

Most Discord voice tracking packages have serious security issues:
- ❌ Use `eval()` to execute dynamic code
- ❌ Serialize functions to strings and execute them at runtime
- ❌ Vulnerable to code injection attacks
- ❌ Difficult to debug and maintain
- ❌ Poor performance at scale

### **Our Solution: Strategy Pattern + Caching**

This package uses a **secure strategy registration system** with **high-performance caching**:
- ✅ **No `eval()`** - Zero runtime code execution
- ✅ **No function serialization** - Strategies registered at startup
- ✅ **10-100x faster** - In-memory caching for read operations
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Debuggable** - Clear stack traces
- ✅ **Testable** - Easy to unit test strategies
- ✅ **Async support** - Database queries work perfectly
- ✅ **Production-grade** - Battle-tested caching system

**How it works:**
```javascript
// ❌ OTHER PACKAGES (Insecure & Slow)
config: {
  xpPerCheck: (member) => member.premiumSince ? 20 : 10  // Serialized with eval()
}
// Every data access = slow database query

// ✅ THIS PACKAGE (Secure & Fast)
voiceManager.registerXPStrategy('booster-xp', (member) => {
  return member.premiumSince ? 20 : 10;
});
config: {
  xpStrategy: 'booster-xp',  // Just a string reference
  cache: new MemoryCache()   // 10-100x faster reads
}
```

---

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Caching System](#-caching-system-new) ⭐ **NEW!**
  - [MemoryCache](#memorycache)
  - [RedisCache](#rediscache-new) ⭐ **NEW!**
- [How It Works](#-how-it-works)
- [Strategy System](#-strategy-system-explained)
  - [Built-in Strategies](#built-in-strategies)
  - [Custom Strategies](#creating-custom-strategies)
  - [Advanced Strategy Examples](#advanced-strategy-examples)
- [Storage Options](#-storage-options)
  - [JSON Storage](#json-storage-default)
  - [SQLite Storage](#sqlite-storage-new) ⭐ **NEW!**
  - [MongoDB Storage](#mongodb-storage)
  - [MongoDB Custom Schema Integration](#mongodb-custom-schema-integration) 🆕
- [Docker Deployment](#-docker-deployment-new) ⭐ **NEW!**
- [Slash Commands](#-slash-commands)
- [Configuration](#-configuration)
- [Events](#-events)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)

---

## 📦 Installation

### Prerequisites

- **Node.js 18.0.0 or higher** - [Download here](https://nodejs.org/)
- **A Discord Bot** - [Create one here](https://discord.com/developers/applications)

### Step 1: Install the Package

```bash
npm install discord-vc-tracker discord.js
```

**What this does:**
- Installs `discord-vc-tracker` (this package)
- Installs `discord.js` (required peer dependency)

> 💡 **JSON and SQLite storage are built-in** — no extra packages needed for either one.

### Step 2: (Optional) Install MongoDB

If you want to use MongoDB instead of JSON/SQLite storage:

```bash
npm install mongodb mongoose
```

**When to use MongoDB:**
- ✅ Large servers (1000+ members)
- ✅ Multiple guilds
- ✅ Production environments
- ❌ Small bots or testing (use JSON or SQLite instead)

### Step 3: (Optional) Install Redis

If you want persistent, multi-instance caching with **RedisCache**:

```bash
npm install redis
```

**When to use RedisCache:**
- ✅ Production bots running multiple instances
- ✅ You need cache data to survive restarts
- ✅ Sharding or scaled deployments
- ❌ Single-instance bots (use MemoryCache instead — it's free)

---

## 🚀 Quick Start

### Basic Setup with Caching (5 minutes) ⭐ **Recommended**
```javascript
const { Client, GatewayIntentBits } = require('discord.js');
const { VoiceManager, JSONStorage, MemoryCache } = require('discord-vc-tracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Create storage
const storage = new JSONStorage('./data');

// ⭐ Create cache (NEW!)
const cache = new MemoryCache({
  ttl: 300000,      // 5 minutes cache lifetime
  maxSize: 1000,    // Max 1000 cached items
  enableStats: true // Track cache performance
});

// Create voice manager with caching
const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ⭐ Enable caching for 10-100x performance boost
  checkInterval: 5000,
  debug: true,
  
  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    
    // Use strategy names
    xpStrategy: 'fixed',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard',
    
    // Strategy configurations
    xpConfig: { baseAmount: 10 },
    voiceTimeConfig: { baseAmount: 5000 },
  },
});

// Listen for level ups
voiceManager.on('levelUp', (user, oldLevel, newLevel) => {
  console.log(`🎉 ${user.userId} leveled up to ${newLevel}!`);
});

// Initialize
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await voiceManager.init();
  console.log('✅ Voice tracking active with caching!');
});

client.login('YOUR_BOT_TOKEN');
```

**Run it:**
```bash
node bot.js
```

---

## ⚡ Caching System (NEW!)

### 🎯 **What is Caching?**

Caching stores frequently accessed data in memory, dramatically reducing database queries and improving performance.

**Without Caching:**
```
User runs /stats → Query Database (50-200ms) → Return data
User runs /stats → Query Database (50-200ms) → Return data
User runs /stats → Query Database (50-200ms) → Return data
```

**With Caching:**
```
User runs /stats → Query Database (50-200ms) → Cache data → Return
User runs /stats → Return from Cache (1-5ms) ⚡
User runs /stats → Return from Cache (1-5ms) ⚡
```

### 📊 **Performance Comparison**

| Operation | Without Cache | With Cache | Improvement |
|-----------|--------------|------------|-------------|
| Get User | 50-200ms | 1-5ms | **40-200x faster** |
| Leaderboard (100 users) | 500-2000ms | 5-20ms | **100-400x faster** |
| Guild Config | 50-200ms | 1-5ms | **40-200x faster** |
| **1000 Requests** | **~60 seconds** | **~3 seconds** | **20x faster** |

### 🚀 **Quick Setup**

#### **Step 1: Create Cache**
```javascript
const { MemoryCache } = require('discord-vc-tracker');

const cache = new MemoryCache({
  ttl: 300000,      // 5 minutes (how long data stays cached)
  maxSize: 1000,    // Max 1000 items (prevents memory bloat)
  enableStats: true // Track cache hit/miss rates
});
```

#### **Step 2: Enable in VoiceManager**
```javascript
const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ⭐ Add this line
  // ... other options
});
```

#### **Step 3: Use Cache-Aware Methods**
```javascript
// ✅ RECOMMENDED (cache-aware)
const userData = await voiceManager.getUser(guildId, userId);
const leaderboard = await voiceManager.getLeaderboard(guildId, { sortBy: 'xp' });

// ⚠️ OLD (still works, but bypasses cache)
const guild = voiceManager.guilds.get(guildId);
const user = guild.users.get(userId);
```

### 📈 **Monitoring Cache Performance**

```javascript
// Get cache statistics
const stats = await voiceManager.cache.getStats();
console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Cache Hits: ${stats.hits}`);
console.log(`Cache Misses: ${stats.misses}`);
```

**Example `/cachestats` command:**
```javascript
voiceManager.on('ready', () => {
  // Display cache stats every 60 seconds
  setInterval(async () => {
    const stats = await voiceManager.cache.getStats();
    console.log('\n📊 Cache Stats:');
    console.log(`   Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`   Size: ${stats.size} items\n`);
  }, 60000);
});
```

### 🎯 **Expected Hit Rates**

After 10-30 minutes of usage:
- **User data**: 80-95%
- **Leaderboards**: 70-85%
- **Guild config**: 95-99%

### ⚙️ **Cache Configuration Options**

```javascript
new MemoryCache({
  ttl: 300000,        // Time-to-live in milliseconds
  maxSize: 1000,      // Maximum cached items (LRU eviction)
  enableStats: true   // Track performance statistics
})
```

**TTL Recommendations:**
- Small bots (< 10 guilds): `ttl: 600000` (10 minutes)
- Medium bots (10-100 guilds): `ttl: 300000` (5 minutes) ← **Default**
- Large bots (100+ guilds): `ttl: 180000` (3 minutes)

**MaxSize Recommendations:**
- Small bots: `maxSize: 500`
- Medium bots: `maxSize: 1000` ← **Default**
- Large bots: `maxSize: 2000-5000`

### 🔄 **Cache Lifecycle**

1. **First Request** → Query database → Cache result
2. **Subsequent Requests** → Return from cache (fast!)
3. **After TTL** → Cache expires → Next request queries database
4. **When Full** → Oldest item evicted (LRU)
5. **On Update** → Cache invalidated automatically

**Automatic Invalidation:**
- User cache invalidated when user gains XP/voice time
- Leaderboard cache invalidated when any user gains XP
- Guild config cache invalidated when config changes

### 💡 **Best Practices**

**1. Always use cache-aware methods in commands:**
```javascript
// ✅ Good
async function statsCommand(interaction) {
  const userData = await voiceManager.getUser(guildId, userId);
  // ... use userData
}

// ❌ Avoid
async function statsCommand(interaction) {
  const guild = voiceManager.guilds.get(guildId);
  const user = guild.users.get(userId);  // Bypasses cache
}
```

**2. Monitor cache performance:**
```javascript
// Log cache stats periodically
setInterval(async () => {
  const stats = await voiceManager.cache.getStats();
  if (stats.hitRate < 0.7) {
    console.warn('⚠️ Low cache hit rate:', stats.hitRate);
  }
}, 300000); // Every 5 minutes
```

**3. Adjust TTL based on your use case:**
- Frequently changing data → Lower TTL (1-3 minutes)
- Stable data → Higher TTL (5-10 minutes)

### 🐛 **Troubleshooting**

**Low hit rate (<70%)?**
- Increase TTL (cache expires too quickly)
- Check that commands use `voiceManager.getUser()` (not `guild.users.get()`)

**High memory usage?**
- Reduce `maxSize`
- Reduce `ttl`

**Stale data issues?**
- Cache automatically invalidates on updates
- Verify cache is enabled and configured correctly

### 📚 **Learn More**

- **Examples**: All examples in `/examples` folder show caching
- **Migration Guide**: See `CHANGELOG.md` v1.3.0

---

### 🔄 RedisCache (NEW!) ⭐

`RedisCache` is a **drop-in replacement** for `MemoryCache`. The API is identical — the only difference is where the data lives. Everything cached in Redis **persists across restarts** and is **shared between every bot process** on the same Redis instance.

#### **MemoryCache vs RedisCache — At a Glance**

| Feature | MemoryCache | RedisCache |
|---|---|---|
| Persistence | Lost on restart | ✅ Survives restarts |
| Multi-instance | Each process has its own cache | ✅ Shared across all processes |
| External dependency | None | Requires a Redis server |
| Raw read speed | Fastest (in-process) | Very fast (local network) |
| Best for | Single-instance bots | Production / scaled deployments |

#### **Setup**

```javascript
const { VoiceManager, MongoStorage, RedisCache } = require('discord-vc-tracker');

const storage = new MongoStorage(process.env.MONGODB_URI, 'voicetracker');

// ✅ RedisCache — persistent, shared across instances
const cache = new RedisCache({
  url:         process.env.REDIS_URL || 'redis://localhost:6379',
  ttl:         300000,      // 5 minutes cache lifetime
  keyPrefix:   'voice:',    // Namespaces all keys (important if sharing a Redis instance)
  enableStats: true         // Track cache performance
});

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // RedisCache works as a drop-in replacement for MemoryCache
  checkInterval: 10000,
});
```

#### **Configuration Options**

```typescript
interface RedisCacheOptions {
  url?: string;           // Redis URL (default: 'redis://localhost:6379')
  ttl?: number;           // Time-to-live in ms (default: 300000 = 5min)
  keyPrefix?: string;     // Namespace prefix for all keys (default: 'voice:')
  enableStats?: boolean;  // Track statistics (default: true)
}
```

#### **Switching from MemoryCache → RedisCache (2 lines)**

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

No other code changes needed. Every command that already uses `voiceManager.getUser()` or `voiceManager.getLeaderboard()` automatically benefits.

#### **Low Hit-Rate Alert**

```javascript
setInterval(async () => {
  const stats = await voiceManager.cache.getStats();
  console.log(`📊 Redis — Hit Rate: ${(stats.hitRate * 100).toFixed(2)}% | Size: ${stats.size}`);

  if (stats.hitRate < 0.6 && (stats.hits + stats.misses) > 100) {
    console.warn('⚠️  Low cache hit rate! Consider increasing TTL or checking cache configuration.');
  }
}, 60000);
```

#### **Graceful Shutdown with Final Stats**

```javascript
process.on('SIGINT', async () => {
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
  client.destroy();
  process.exit(0);
});
```

> 📄 **Full example:** `Mongodb-RedisCache-Example-Support.js`

---

## 🧠 How It Works

### **1. Voice State Tracking**
The bot monitors Discord's voice state events:
- User joins voice channel → Session starts
- User in voice channel → XP/time added every 5 seconds
- User leaves voice channel → Session ends, data saved

### **2. Strategy System**
Instead of storing functions in the database, you **register strategies at startup**:

```javascript
// Register at startup (before init)
voiceManager.registerXPStrategy('my-strategy', (member, config) => {
  // Your custom logic
  return 10;
});

// Use in configuration
await guild.config.edit({
  xpStrategy: 'my-strategy'
});
```

### **3. Caching Layer**
```
Voice Channel → VoiceManager → Strategy → User Data → Cache → Storage
                    ↓                                    ↓
                 Events                           Auto-invalidation
```

---

## 🔥 Strategy System Explained

### **What is a Strategy?**

A strategy is a **named function** that calculates values dynamically. Instead of storing the function in the database, you register it once and reference it by name.

### **Built-in Strategies**

#### **XP Strategies**

**1. `'fixed'` (Default)**
```javascript
// Everyone gets the same XP
defaultConfig: {
  xpStrategy: 'fixed',
  xpConfig: { baseAmount: 10 }
}
```

**2. `'role-based'`**
```javascript
// Different XP for different roles
defaultConfig: {
  xpStrategy: 'role-based',
  xpConfig: {
    baseAmount: 5,
    roles: {
      '123456789': 15,  // VIP role ID → 15 XP
      '987654321': 20,  // Premium role ID → 20 XP
    }
  }
}
```

**3. `'booster-bonus'`**
```javascript
// Server boosters get 2x XP
defaultConfig: {
  xpStrategy: 'booster-bonus',
  xpConfig: {
    baseAmount: 10,
    boosterMultiplier: 2
  }
}
```

**4. `'random'`**
```javascript
// Random XP in range
defaultConfig: {
  xpStrategy: 'random',
  xpConfig: {
    minXP: 5,
    maxXP: 15
  }
}
```

#### **Voice Time Strategies**

**1. `'fixed'` (Default)**
```javascript
defaultConfig: {
  voiceTimeStrategy: 'fixed',
  voiceTimeConfig: { baseAmount: 5000 }  // 5 seconds per check
}
```

**2. `'scaled'`**
```javascript
defaultConfig: {
  voiceTimeStrategy: 'scaled',
  voiceTimeConfig: {
    baseAmount: 5000,
    multiplier: 1.5  // 7.5 seconds per check
  }
}
```

#### **Level Multiplier Strategies**

**1. `'standard'` (Default)**
```javascript
defaultConfig: {
  levelMultiplierStrategy: 'standard',  // 0.1 multiplier
  levelMultiplierConfig: {
    baseMultiplier: 0.1
  }
}
```

**2. `'fast'`**
```javascript
defaultConfig: {
  levelMultiplierStrategy: 'fast',  // 0.15 = faster leveling
  levelMultiplierConfig: {
    baseMultiplier: 0.15
  }
}
```

**3. `'slow'`**
```javascript
defaultConfig: {
  levelMultiplierStrategy: 'slow',  // 0.05 = slower leveling
  levelMultiplierConfig: {
    baseMultiplier: 0.05
  }
}
```

---

### **Creating Custom Strategies**

#### **Simple Custom Strategy**
```javascript
const voiceManager = new VoiceManager(client, { storage, cache });

// Register BEFORE init()
voiceManager.registerXPStrategy('time-based', (member, config) => {
  const hour = new Date().getHours();
  
  // Night bonus (10pm - 6am)
  if (hour >= 22 || hour < 6) return 15;
  
  // Peak hours (6pm - 10pm)
  if (hour >= 18 && hour < 22) return 12;
  
  return 10;
});

// Initialize
await voiceManager.init();

// Use the strategy
const guild = voiceManager.guilds.get(guildId);
await guild.config.edit({
  xpStrategy: 'time-based'
});
```

#### **Async Strategy with Database**
```javascript
voiceManager.registerXPStrategy('database-xp', async (member, config) => {
  // Query external database
  const settings = await YourDatabase.findOne({
    guildId: member.guild.id
  });
  
  if (!settings) return 10;
  
  // Apply custom logic
  if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId)) {
    return 20;
  }
  
  return 10;
});
```

---

### **Advanced Strategy Examples**

This section contains advanced, real-world strategy examples for complex use cases.

#### **Multi-Condition Strategy**

This strategy combines multiple conditions to calculate XP dynamically:

```javascript
voiceManager.registerXPStrategy('advanced-xp', async (member, config) => {
  let xp = 10;  // Base XP
  let multiplier = 1;
  
  // 1. Booster bonus
  if (member.premiumSince) {
    multiplier += 0.5;  // +50% for boosters
  }
  
  // 2. Role-based bonus
  if (member.permissions.has('ADMINISTRATOR')) {
    multiplier += 0.3;  // +30% for admins
  }
  
  // 3. Time-of-day bonus
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    multiplier += 0.25;  // +25% for night owls
  }
  
  // 4. Database check for premium members
  const userData = await CustomDB.findOne({ userId: member.id });
  if (userData?.isPremium) {
    multiplier += 1;  // +100% for premium
  }
  
  // 5. Channel-specific bonuses
  const voiceChannel = member.voice.channel;
  if (voiceChannel?.name.includes('study')) {
    multiplier += 0.2;  // +20% in study channels
  }
  
  return Math.floor(xp * multiplier);
});
```

**Use Case:** Perfect for bots with premium tiers, role-based rewards, and time-sensitive bonuses.

---

#### **Activity-Based Strategy**

Reward users based on their total activity:

```javascript
voiceManager.registerXPStrategy('activity-based', async (member, config) => {
  const guild = voiceManager.guilds.get(member.guild.id);
  const user = guild.users.get(member.id);
  
  if (!user) return 10;
  
  // Calculate based on total voice time
  const hours = user.totalVoiceTime / (1000 * 60 * 60);
  
  if (hours > 100) return 20;      // Veterans get 20 XP
  if (hours > 50) return 15;       // Active users get 15 XP
  if (hours > 10) return 12;       // Regular users get 12 XP
  
  return 10;  // New users get 10 XP
});
```

**Use Case:** Reward long-term, active community members.

---

#### **Dynamic Scaling Strategy**

Scale XP based on channel size to prevent farming:

```javascript
voiceManager.registerXPStrategy('anti-farm', (member, config) => {
  const channel = member.voice.channel;
  if (!channel) return 0;
  
  const memberCount = channel.members.size;
  
  // Penalize solo farming
  if (memberCount === 1) return 2;
  
  // Reward social interaction
  if (memberCount >= 2 && memberCount <= 5) return 15;
  
  // Scale down for very large channels
  if (memberCount > 10) return 8;
  
  return 10;
});
```

**Use Case:** Prevent users from AFK farming in empty channels.

---

#### **Streak-Based Strategy**

Reward consistent daily activity:

```javascript
// Track streaks in your own database
const StreakDB = require('./models/Streak');

voiceManager.registerXPStrategy('streak-bonus', async (member, config) => {
  const streak = await StreakDB.findOne({ userId: member.id });
  
  if (!streak) return 10;
  
  let baseXP = 10;
  let bonus = 0;
  
  // Streak milestones
  if (streak.days >= 30) bonus = 10;      // +10 XP for 30-day streak
  else if (streak.days >= 14) bonus = 6;  // +6 XP for 14-day streak
  else if (streak.days >= 7) bonus = 3;   // +3 XP for 7-day streak
  
  return baseXP + bonus;
});
```

**Use Case:** Encourage daily engagement and community building.

---

#### **Competitive Leaderboard Strategy**

Give bonus XP based on current rank:

```javascript
voiceManager.registerXPStrategy('competitive', async (member, config) => {
  const guild = voiceManager.guilds.get(member.guild.id);
  const user = guild.users.get(member.id);
  
  if (!user) return 10;
  
  const rank = await user.getRank('xp');
  
  // Top players get less XP (balance)
  if (rank <= 3) return 8;
  if (rank <= 10) return 10;
  if (rank <= 50) return 12;
  
  // Lower ranks get catch-up XP
  return 15;
});
```

**Use Case:** Competitive servers where you want to balance the playing field.

---

#### **Event-Based Strategy**

Apply bonuses during special events:

```javascript
voiceManager.registerXPStrategy('event-bonus', async (member, config) => {
  const now = new Date();
  let baseXP = 10;
  let multiplier = 1;
  
  // Weekend bonus (Saturday & Sunday)
  const day = now.getDay();
  if (day === 0 || day === 6) {
    multiplier += 0.5;  // +50% on weekends
  }
  
  // Holiday events
  const month = now.getMonth();
  const date = now.getDate();
  
  // Halloween (October 31)
  if (month === 9 && date === 31) {
    multiplier += 1;  // +100% on Halloween
  }
  
  // Christmas week
  if (month === 11 && date >= 24 && date <= 31) {
    multiplier += 0.75;  // +75% during Christmas
  }
  
  // Check custom events from database
  const activeEvent = await EventDB.findOne({
    guildId: member.guild.id,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
  
  if (activeEvent) {
    multiplier += activeEvent.xpMultiplier;
  }
  
  return Math.floor(baseXP * multiplier);
});
```

**Use Case:** Create excitement during special events and holidays.

---

#### **Voice Time Strategy - Dynamic Recording**

Adjust voice time tracking based on activity:

```javascript
voiceManager.registerVoiceTimeStrategy('smart-tracking', async (member, config) => {
  const channel = member.voice.channel;
  if (!channel) return 0;
  
  // Don't track if user is muted/deafened and alone
  if ((member.voice.mute || member.voice.deaf) && channel.members.size === 1) {
    return 0;
  }
  
  // Normal tracking
  let baseTime = 5000;  // 5 seconds
  
  // Bonus time for active channels
  if (channel.members.size >= 5) {
    baseTime *= 1.2;  // +20% for populated channels
  }
  
  return baseTime;
});
```

**Use Case:** Only track meaningful voice activity.

---

#### **Level Multiplier Strategy - Difficulty Scaling**

Make leveling progressively harder:

```javascript
voiceManager.registerLevelMultiplierStrategy('exponential', async (member, config) => {
  const guild = voiceManager.guilds.get(member.guild.id);
  const user = guild.users.get(member.id);
  
  if (!user) return 0.1;
  
  const level = user.level;
  
  // Exponential difficulty increase
  if (level < 10) return 0.1;       // Fast early levels
  if (level < 25) return 0.12;      // Slightly harder
  if (level < 50) return 0.15;      // Harder
  if (level < 100) return 0.18;     // Very hard
  
  return 0.2;  // Maximum difficulty
});
```

**Use Case:** Keep high-level progression challenging and rewarding.

---

## 💾 Storage Options

### **JSON Storage (Default)**

Perfect for small to medium bots (<1000 users per guild).

```javascript
const { JSONStorage } = require('discord-vc-tracker');
const storage = new JSONStorage('./data');
```

**Pros:**
- ✅ No dependencies
- ✅ Easy to inspect files
- ✅ Simple backups (just copy folder)
- ✅ Good for development

**Cons:**
- ❌ Not scalable for large bots
- ❌ Slower for 1000+ users
- ❌ File locking issues with concurrent writes

**File Structure:**
```
data/
├── guilds.json      # Guild configs and user data
└── sessions.json    # Voice session history
```

---

### **SQLite Storage (NEW!)** ⭐

A zero-configuration file-based **relational** database. Creates and manages the `.db` file automatically — no server, no setup, no extra packages to install. Great middle ground between JSON and MongoDB.

```javascript
const { SQLiteStorage } = require('discord-vc-tracker');

// ✅ Option 1: Zero-config (creates ./data/voice-tracker.db automatically)
const storage = new SQLiteStorage();

// ✅ Option 2: Custom file path
const storage = new SQLiteStorage({ filename: './data/my-bot-voice.db' });

// ✅ Option 3: Production (env-driven path, longer timeout)
const storage = new SQLiteStorage({
  filename: process.env.SQLITE_DB_PATH || './data/voice-tracker.db',
  timeout:  10000,
});
```

#### **Configuration Options**

```typescript
interface SQLiteStorageOptions {
  filename?: string;      // Path to .db file (default: './data/voice-tracker.db')
  timeout?: number;       // Connection timeout in ms (default: 5000)
  verbose?: Function;     // Query logger — dev only, do not enable in production
}
```

**Pros:**
- ✅ Zero external dependencies — built into the package
- ✅ WAL mode enabled by default (fast concurrent reads)
- ✅ ACID compliant — data is never half-written
- ✅ Integrity-verified backups via `safeBackup()`
- ✅ Auto-creates database and tables on first run
- ✅ Much faster than JSON for 500+ users
- ✅ Single file — easy to back up or move

**Cons:**
- ❌ Single-writer only (don't point two bot processes at the same `.db`)
- ❌ Not designed for multi-instance deployments (use MongoDB + RedisCache for that)

#### **Automatic Backups**

`safeBackup()` verifies database integrity **before** writing. If the DB is corrupted, it returns `false` and never overwrites an existing backup:

```javascript
let backupInterval;

function startAutomaticBackups() {
  backupInterval = setInterval(async () => {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./data/backups/voice-tracker-${timestamp}.db`;

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

#### **Database Optimization (VACUUM)**

SQLite can accumulate unused space over time. `optimize()` runs VACUUM to reclaim it:

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

#### **Live Database Stats**

```javascript
const stats = storage.getStats();
// Returns: { guilds, users, sessions, databaseSize, filename }

console.log(`Guilds: ${stats.guilds}`);
console.log(`Users: ${stats.users}`);
console.log(`Size:  ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`);
```

#### **Shutdown Backup**

Create a final backup every time the bot shuts down cleanly:

```javascript
process.on('SIGINT', async () => {
  if (backupInterval)   clearInterval(backupInterval);
  if (optimizeInterval) clearInterval(optimizeInterval);

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

### **MongoDB Storage**

Perfect for production bots with many users.

#### **Setup Guide**

**1. Install MongoDB**
```bash
npm install mongodb
```

**2. Start MongoDB Server**
```bash
# Local installation
mongod

# Or use MongoDB Atlas (cloud)
# https://www.mongodb.com/cloud/atlas
```

**3. Use MongoStorage**
```javascript
const { MongoStorage, MemoryCache } = require('discord-vc-tracker');

const storage = new MongoStorage(
  'mongodb://localhost:27017',
  'voicetracker'  // Database name
);

const cache = new MemoryCache({ ttl: 300000, maxSize: 1000 });

const voiceManager = new VoiceManager(client, {
  storage,
  cache,  // ⭐ Caching especially important with MongoDB
  // ... other options
});
```

**4. MongoDB Atlas (Cloud)**
```javascript
const storage = new MongoStorage(
  'mongodb+srv://username:password@cluster.mongodb.net',
  'voicetracker'
);
```

**Pros:**
- ✅ Scales to millions of users
- ✅ Fast queries with indexes
- ✅ Handles concurrent writes
- ✅ Production-ready
- ✅ **10-100x faster with caching**

**Cons:**
- ❌ Requires MongoDB server
- ❌ More complex setup

**Collections Created:**
```
voicetracker (database)
├── guilds      # Guild configurations
├── users       # User voice data
└── sessions    # Session history
```

---

### **MongoDB Custom Schema Integration**

One of the most powerful features of this package is the ability to integrate with your **own MongoDB schemas**. This allows you to leverage existing bot data in your strategies without duplicating information.

#### **Why Use Custom Schemas?**

**Benefits:**
- ✅ Use existing guild/user settings in XP calculations
- ✅ No data duplication between systems
- ✅ Leverage your existing database structure
- ✅ Seamless integration with your bot's ecosystem
- ✅ Keep voice tracking data separate but accessible

**Use Cases:**
- Premium membership systems
- Custom role configurations
- Guild-specific multipliers
- User subscription tiers
- Event management
- Custom permission systems

---

#### **Architecture Overview**

```
Your Bot Database (your_bot_database)
├── guilds          ← Your existing guild settings
├── users           ← Your existing user data
├── premiums        ← Your premium system
└── events          ← Your event system

Voice Tracker Database (voicetracker)
├── guilds          ← Voice tracking guild config
├── users           ← Voice tracking user data
└── sessions        ← Voice session history

Strategy Layer
├── Queries both databases
├── Combines data for calculations
└── Returns dynamic XP/multipliers
```

---

#### **Basic Setup**

**Step 1: Connect Your Database**
```javascript
const mongoose = require('mongoose');

// Connect to YOUR existing database
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'your_bot_database'  // Your existing database
});
```

**Step 2: Create Voice Tracker Storage**
```javascript
const { MongoStorage, MemoryCache } = require('discord-vc-tracker');

// Voice tracker uses SEPARATE database
const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'  // Different database for voice data
);

const cache = new MemoryCache({ ttl: 300000, maxSize: 1000 });
```

**Step 3: Initialize Voice Manager**
```javascript
const voiceManager = new VoiceManager(client, {
  storage,
  cache,
  // ... other options
});
```

---

#### **Example 1: Premium Membership System**

**Your Existing Schema:**
```javascript
// models/User.js (Your existing schema)
const UserSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  isPremium: Boolean,
  premiumTier: Number,  // 1, 2, or 3
  premiumExpiry: Date
});

const User = mongoose.model('User', UserSchema);
module.exports = User;
```

**Strategy Using Your Schema:**
```javascript
const User = require('./models/User');

voiceManager.registerXPStrategy('premium-system', async (member, config) => {
  // Query YOUR database
  const userData = await User.findOne({
    userId: member.id,
    guildId: member.guild.id
  });
  
  let baseXP = 10;
  let multiplier = 1;
  
  if (userData?.isPremium) {
    // Check if premium is still active
    if (userData.premiumExpiry > new Date()) {
      // Apply tier-based multipliers
      switch (userData.premiumTier) {
        case 1:
          multiplier = 1.5;  // Tier 1: +50%
          break;
        case 2:
          multiplier = 2.0;  // Tier 2: +100%
          break;
        case 3:
          multiplier = 3.0;  // Tier 3: +200%
          break;
      }
    }
  }
  
  return Math.floor(baseXP * multiplier);
});

await voiceManager.init();
```

---

#### **Example 2: Guild Settings Integration**

**Your Existing Schema:**
```javascript
// models/GuildSettings.js (Your existing schema)
const GuildSettingsSchema = new mongoose.Schema({
  guildId: String,
  vipRoleId: String,
  moderatorRoleId: String,
  xpMultiplier: { type: Number, default: 1 },
  enableDoubleXP: Boolean,
  doubleXPChannels: [String]
});

const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);
module.exports = GuildSettings;
```

**Strategy Using Your Schema:**
```javascript
const GuildSettings = require('./models/GuildSettings');

voiceManager.registerXPStrategy('guild-settings-xp', async (member, config) => {
  // Get guild settings from YOUR database
  const settings = await GuildSettings.findOne({
    guildId: member.guild.id
  });
  
  if (!settings) return 10;
  
  let xp = 10;
  let multiplier = settings.xpMultiplier || 1;
  
  // VIP role bonus
  if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId)) {
    multiplier += 0.5;  // +50% for VIPs
  }
  
  // Moderator bonus
  if (settings.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId)) {
    multiplier += 0.3;  // +30% for mods
  }
  
  // Double XP in specific channels
  if (settings.enableDoubleXP) {
    const channelId = member.voice.channel?.id;
    if (channelId && settings.doubleXPChannels.includes(channelId)) {
      multiplier *= 2;  // 2x XP in designated channels
    }
  }
  
  return Math.floor(xp * multiplier);
});
```

---

#### **Example 3: Event System Integration**

**Your Existing Schema:**
```javascript
// models/Event.js (Your existing schema)
const EventSchema = new mongoose.Schema({
  guildId: String,
  name: String,
  type: String,  // 'double_xp', 'triple_xp', 'special'
  active: Boolean,
  startDate: Date,
  endDate: Date,
  xpBonus: Number,
  channelIds: [String]
});

const Event = mongoose.model('Event', EventSchema);
module.exports = Event;
```

**Strategy Using Your Schema:**
```javascript
const Event = require('./models/Event');

voiceManager.registerXPStrategy('event-system', async (member, config) => {
  const now = new Date();
  
  // Find active events in this guild
  const activeEvent = await Event.findOne({
    guildId: member.guild.id,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
  
  let baseXP = 10;
  
  if (!activeEvent) return baseXP;
  
  // Check if user is in event channel
  const userChannel = member.voice.channel?.id;
  const isInEventChannel = !activeEvent.channelIds.length || 
                          activeEvent.channelIds.includes(userChannel);
  
  if (!isInEventChannel) return baseXP;
  
  // Apply event bonuses
  switch (activeEvent.type) {
    case 'double_xp':
      return baseXP * 2;
    case 'triple_xp':
      return baseXP * 3;
    case 'special':
      return baseXP + activeEvent.xpBonus;
    default:
      return baseXP;
  }
});
```

---

#### **Example 4: Complete Integration Example**

This example shows how to combine multiple schemas:

```javascript
const mongoose = require('mongoose');
const { VoiceManager, MongoStorage, MemoryCache } = require('discord-vc-tracker');

// Import your existing schemas
const User = require('./models/User');
const GuildSettings = require('./models/GuildSettings');
const Event = require('./models/Event');

// Connect to your database
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'your_bot_database'
});

// Create voice tracker storage (separate database)
const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'
);

const cache = new MemoryCache({ ttl: 300000, maxSize: 1000 });

const voiceManager = new VoiceManager(client, { storage, cache });

// Register comprehensive strategy
voiceManager.registerXPStrategy('complete-integration', async (member, config) => {
  let baseXP = 10;
  let multiplier = 1;
  
  // 1. Get user data from YOUR database
  const userData = await User.findOne({
    userId: member.id,
    guildId: member.guild.id
  });
  
  // 2. Get guild settings from YOUR database
  const guildSettings = await GuildSettings.findOne({
    guildId: member.guild.id
  });
  
  // 3. Check for active events from YOUR database
  const activeEvent = await Event.findOne({
    guildId: member.guild.id,
    active: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  });
  
  // 4. Apply premium bonuses
  if (userData?.isPremium && userData.premiumExpiry > new Date()) {
    multiplier += (userData.premiumTier || 1) * 0.5;
  }
  
  // 5. Apply guild multiplier
  if (guildSettings?.xpMultiplier) {
    multiplier *= guildSettings.xpMultiplier;
  }
  
  // 6. Apply role bonuses
  if (guildSettings?.vipRoleId && member.roles.cache.has(guildSettings.vipRoleId)) {
    multiplier += 0.5;
  }
  
  // 7. Apply event bonuses
  if (activeEvent) {
    const userChannel = member.voice.channel?.id;
    const isInEventChannel = !activeEvent.channelIds.length || 
                            activeEvent.channelIds.includes(userChannel);
    
    if (isInEventChannel) {
      multiplier += (activeEvent.xpBonus || 0);
    }
  }
  
  return Math.floor(baseXP * multiplier);
});

// Initialize
await voiceManager.init();

// Use the strategy
const guild = voiceManager.guilds.get(guildId);
await guild.config.edit({
  xpStrategy: 'complete-integration'
});
```

---

#### **Performance Considerations**

When using custom schemas with strategies:

**1. Use Caching**
```javascript
// Cache database queries within strategies
const schemaCache = new Map();

voiceManager.registerXPStrategy('cached-strategy', async (member, config) => {
  const cacheKey = `settings:${member.guild.id}`;
  
  let settings = schemaCache.get(cacheKey);
  
  if (!settings) {
    settings = await GuildSettings.findOne({ guildId: member.guild.id });
    schemaCache.set(cacheKey, settings);
    
    // Clear cache after 5 minutes
    setTimeout(() => schemaCache.delete(cacheKey), 300000);
  }
  
  // Use cached settings
  return settings?.xpMultiplier * 10 || 10;
});
```

**2. Use Indexes**
```javascript
// In your schema files
GuildSettingsSchema.index({ guildId: 1 });
UserSchema.index({ userId: 1, guildId: 1 });
EventSchema.index({ guildId: 1, active: 1, startDate: 1, endDate: 1 });
```

**3. Batch Queries**
```javascript
voiceManager.registerXPStrategy('batch-strategy', async (member, config) => {
  // Get all data in parallel
  const [userData, guildSettings, activeEvent] = await Promise.all([
    User.findOne({ userId: member.id, guildId: member.guild.id }),
    GuildSettings.findOne({ guildId: member.guild.id }),
    Event.findOne({ guildId: member.guild.id, active: true })
  ]);
  
  // Process data...
  return 10;
});
```

---

#### **Complete Working Example**

See a complete example at: [examples/Mongodb-MemoryCache-Example-Support.js](https://github.com/Instinzts/discord-vc-tracker/tree/main/examples/Mongodb-MemoryCache-Example-Support.js)

**What it includes:**
- Full mongoose setup
- Multiple schema definitions
- Complex strategy integration
- Caching implementation
- Error handling
- Performance optimization

---

## 🐳 Docker Deployment (NEW!) ⭐

Docker lets you run the bot and all its backing services (MongoDB, Redis) as a single stack with one command. The configs below mirror every storage + cache combination this package supports.

### **Prerequisites**

- [Docker Desktop](https://docs.docker.com/get-docker/) (includes `docker compose`)
- A copy of your project with a valid `.env` file

### **Dockerfile**

This single `Dockerfile` works for **every** storage/cache combo. The only thing that changes between setups is `docker-compose.yml` and your `.env`.

```dockerfile
# ---------------------------------------------------------------------------
# Stage 1 — install production dependencies only
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 — final image
# ---------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Copy dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Expose nothing externally — the bot connects out, not in
EXPOSE 0

# Health-check: verify the Node process is alive
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Run the bot
CMD ["node", "bot.js"]
```

> 💡 Place this `Dockerfile` in the **root** of your project alongside `package.json`.

---

### **Setup A — MongoDB + RedisCache (Full Production Stack)**

Use this when you want persistent, multi-instance caching with a full database backend.

**`docker-compose.yml`:**
```yaml
version: '3.8'

services:
  # ─── MongoDB ─────────────────────────────────────────────
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: changeme          # ⚠️ change in production
    ports:
      - "27017:27017"                               # remove in production
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand({ping:1})"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Redis ───────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"                                 # remove in production
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Discord Bot ─────────────────────────────────────────
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./data:/app/data

volumes:
  mongo_data:
  redis_data:
```

**`.env`:**
```env
DISCORD_BOT_TOKEN=your_bot_token_here

# Docker-internal hostnames — do NOT use localhost here
MONGODB_URI=mongodb://admin:changeme@mongo:27017
REDIS_URL=redis://redis:6379
```

> ⚠️ Inside a Docker network the services talk to each other by **service name** (`mongo`, `redis`), not `localhost`.

---

### **Setup B — MongoDB + MemoryCache**

Same as Setup A but without Redis. Remove the `redis` service and update `.env`:

```yaml
version: '3.8'

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: changeme
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand({ping:1})"]
      interval: 10s
      timeout: 5s
      retries: 5

  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    depends_on:
      mongo:
        condition: service_healthy
    volumes:
      - ./data:/app/data

volumes:
  mongo_data:
```

```env
DISCORD_BOT_TOKEN=your_bot_token_here
MONGODB_URI=mongodb://admin:changeme@mongo:27017
# No REDIS_URL — MemoryCache needs no external service
```

---

### **Setup C — SQLite + MemoryCache**

SQLite is a single file, so no extra services are needed. The only container is the bot:

```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      # Mount ./data on the host so the .db file and backups survive container restarts
      - ./data:/app/data
```

```env
DISCORD_BOT_TOKEN=your_bot_token_here
SQLITE_DB_PATH=./data/voice-tracker.db
# No MONGODB_URI, no REDIS_URL
```

> 💡 The `./data` volume mount is **critical** for SQLite. Without it the database file lives inside the container and is lost every time the container is recreated.

---

### **Setup D — JSON + MemoryCache**

Identical structure to Setup C. JSON files are also stored in `./data`:

```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
```

```env
DISCORD_BOT_TOKEN=your_bot_token_here
# No extra variables — JSONStorage writes to ./data automatically
```

---

### **Common Docker Commands**

```bash
# Start the full stack (builds the image on first run)
docker compose up -d --build

# View bot logs in real time
docker compose logs -f bot

# Restart only the bot (handy after a code change)
docker compose restart bot

# Stop everything (containers stay, data persists)
docker compose down

# Stop everything AND delete all stored data (⚠️ destructive)
docker compose down -v

# Open a shell inside the running bot container (debugging)
docker compose exec bot sh
```

### **Production Checklist**

- Change the MongoDB root password and, ideally, create a dedicated user for the tracker.
- Remove the `ports` mappings from `mongo` and `redis` — they only need to be reachable inside the Docker network.
- If you run multiple bot instances for sharding, point all of them at the **same** Redis and MongoDB services and use `RedisCache` (Setup A).
- Use a secrets manager or a `.env` file that is **not** committed to version control for tokens and passwords.

---

## 💬 Slash Commands

### Example: `/stats` Command (Cache-Aware)
```javascript
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { XPCalculator } = require('discord-vc-tracker');

const calculator = new XPCalculator();

const statsCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View voice activity statistics')
  .addUserOption(option =>
    option.setName('user').setDescription('User to check').setRequired(false)
  );

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'stats') return;

  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  // ✅ Use cache-aware method
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
  
  // Get rank from cached leaderboard
  const leaderboard = await voiceManager.getLeaderboard(interaction.guildId, {
    sortBy: 'xp',
    limit: 1000
  });
  const userEntry = leaderboard.find(entry => entry.userId === targetUser.id);
  const rank = userEntry?.rank || null;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Voice Stats for ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '⏱️ Voice Time', value: calculator.formatVoiceTime(userData.totalVoiceTime), inline: true },
      { name: '⭐ Level', value: `${userData.level}`, inline: true },
      { name: '💫 XP', value: `${userData.xp.toLocaleString()}`, inline: true },
      { name: '📈 Progress', value: `${progress}% → Level ${userData.level + 1}`, inline: true },
      { name: '🎯 XP Needed', value: `${xpToNext.toLocaleString()}`, inline: true },
      { name: '🏆 Rank', value: rank ? `#${rank}` : 'Unranked', inline: true }
    )
    .setFooter({ text: 'Powered by discord-vc-tracker' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
});
```

### Example: `/cachestats` Command
```javascript
const cacheStatsCommand = new SlashCommandBuilder()
  .setName('cachestats')
  .setDescription('View cache performance statistics');

client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName !== 'cachestats') return;
  
  if (!voiceManager.cache) {
    return interaction.reply({
      content: '❌ Cache is not enabled!',
      ephemeral: true
    });
  }
  
  const stats = await voiceManager.cache.getStats();
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📊 Cache Performance')
    .addFields(
      { name: '🎯 Hit Rate', value: `${(stats.hitRate * 100).toFixed(2)}%`, inline: true },
      { name: '✅ Hits', value: `${stats.hits.toLocaleString()}`, inline: true },
      { name: '❌ Misses', value: `${stats.misses.toLocaleString()}`, inline: true },
      { name: '📦 Size', value: `${stats.size} items`, inline: true }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
});
```

### Example: `/dbstats` Command (SQLite) ⭐ NEW
```javascript
const dbStatsCommand = new SlashCommandBuilder()
  .setName('dbstats')
  .setDescription('View SQLite database statistics');

client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName !== 'dbstats') return;

  const stats = storage.getStats();
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
      { name: '🏛️ Guilds',        value: `${stats.guilds}`,                    inline: true },
      { name: '👥 Users',         value: `${stats.users.toLocaleString()}`,     inline: true },
      { name: '📝 Sessions',      value: `${stats.sessions.toLocaleString()}`,  inline: true },
      { name: '💾 Database Size', value: `${sizeMB} MB`,                       inline: true },
      { name: '📏 Avg per User',  value: `${avgBytesPerUser} bytes`,           inline: true },
      { name: '📊 Sessions/User', value: `${sessionsPerUser}`,                 inline: true },
      { name: '📂 File',          value: `\`${stats.filename}\`` },
      {
        name:  '💡 Tips',
        value: '• Run `/optimize` monthly\n• Use `/backup` before major changes\n• Auto-backups run every 6 hours',
      },
    )
    .setFooter({ text: 'WAL mode enabled • ACID compliant' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
});
```

### Example: `/backup` Command (SQLite) ⭐ NEW
```javascript
const backupCommand = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Create a manual database backup (Admin only)');

client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName !== 'backup') return;
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const timestamp  = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupPath = `./data/backups/manual-backup-${timestamp}.db`;
  const success    = await storage.safeBackup(backupPath);

  if (!success) {
    return await interaction.editReply({
      content: `❌ **Backup failed — database integrity check did not pass.**\n\n` +
               `⚠️ Existing backups are safe and were not overwritten.\n` +
               `**Action:** Stop the bot, restore from a recent backup, and investigate.`,
    });
  }

  const fs     = require('fs');
  const sizeKB = (fs.statSync(backupPath).size / 1024).toFixed(2);

  await interaction.editReply({
    content: `✅ **Backup created successfully!**\n\n` +
             `**File:** \`${backupPath}\`\n` +
             `**Size:** ${sizeKB} KB\n` +
             `**Integrity:** Verified ✅`,
  });
});
```

### Example: `/optimize` Command (SQLite) ⭐ NEW
```javascript
const optimizeCommand = new SlashCommandBuilder()
  .setName('optimize')
  .setDescription('Optimize database (VACUUM) (Admin only)');

client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName !== 'optimize') return;
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
});
```

---

## ⚙️ Configuration

### Manager Options
```javascript
const voiceManager = new VoiceManager(client, {
  storage: storage,              // Required: JSONStorage, SQLiteStorage, or MongoStorage
  cache: cache,                  // ⭐ MemoryCache or RedisCache for 10-100x performance
  checkInterval: 5000,           // Check every 5 seconds
  debug: false,                  // Enable debug logging
  
  defaultConfig: {
    // === TRACKING OPTIONS ===
    trackBots: false,            // Track bots?
    trackAllChannels: true,      // Track all channels?
    trackMuted: true,            // Track muted users?
    trackDeafened: true,         // Track deafened users?
    
    // === FILTERS ===
    channelIds: [],              // Specific channel IDs (if trackAllChannels = false)
    minUsersToTrack: 0,          // Min users in channel to start tracking
    maxUsersToTrack: 0,          // Max users (0 = unlimited)
    exemptPermissions: [],       // Permissions that exempt from tracking
    
    // === STRATEGIES ===
    xpStrategy: 'fixed',
    xpConfig: {
      baseAmount: 10,
    },
    
    voiceTimeStrategy: 'fixed',
    voiceTimeConfig: {
      baseAmount: 5000,
    },
    
    levelMultiplierStrategy: 'standard',
    levelMultiplierConfig: {
      baseMultiplier: 0.1,
    },
    
    // === RUNTIME FILTERS (not saved to database) ===
    memberFilter: (member) => {
      return !member.user.bot;
    },
    
    channelFilter: (channel) => {
      return channel.name.includes('voice');
    },
    
    // === MODULES ===
    enableLeveling: true,
    enableVoiceTime: true,
  },
});
```

### Per-Guild Configuration
```javascript
const guild = voiceManager.guilds.get(guildId);

// Edit config
await guild.config.edit({
  trackBots: true,
  xpStrategy: 'booster-bonus',
  xpConfig: {
    baseAmount: 15,
    boosterMultiplier: 2
  },
  levelMultiplierStrategy: 'fast',
  levelMultiplierConfig: {
    baseMultiplier: 0.15
  }
});

// Get dynamic values
const xp = await guild.config.getXpToAdd(member);
const voiceTime = await guild.config.getVoiceTimeToAdd();
const multiplier = await guild.config.getLevelMultiplier();
```

---

## 🎯 Events
```javascript
// Level up
voiceManager.on('levelUp', (user, oldLevel, newLevel) => {
  console.log(`User ${user.userId} leveled up: ${oldLevel} → ${newLevel}`);
});

// XP gained
voiceManager.on('xpGained', (user, amount) => {
  console.log(`User ${user.userId} gained ${amount} XP`);
});

// Voice time gained
voiceManager.on('voiceTimeGained', (user, amount) => {
  console.log(`User ${user.userId} gained ${amount}ms voice time`);
});

// Session events
voiceManager.on('sessionStart', (session) => {
  console.log(`Session started: ${session.userId} in ${session.channelId}`);
});

voiceManager.on('sessionEnd', (session) => {
  console.log(`Session ended: ${session.duration}ms`);
});

// Config updated
voiceManager.on('configUpdated', (guildId, config) => {
  console.log(`Config updated for guild ${guildId}`);
});

// Cache events (NEW!)
voiceManager.on('debug', (message) => {
  if (message.includes('Cache')) {
    console.log(`🗄️ ${message}`);
  }
});

// Errors
voiceManager.on('error', (error) => {
  console.error('VoiceManager error:', error);
});
```

---

## 📚 API Reference

### VoiceManager
```javascript
// Initialize
await voiceManager.init();

// Register strategies (BEFORE init)
voiceManager.registerXPStrategy(name, calculator);
voiceManager.registerVoiceTimeStrategy(name, calculator);
voiceManager.registerLevelMultiplierStrategy(name, calculator);

// Get guild
const guild = voiceManager.guilds.get(guildId);

// ⭐ Cache-aware methods (RECOMMENDED)
const userData = await voiceManager.getUser(guildId, userId);
const leaderboard = await voiceManager.getLeaderboard(guildId, options);

// Update user
await voiceManager.updateUser(guildId, userId, {
  addVoiceTime: 60000,
  addXp: 100,
  setLevel: 5,
});

// ⭐ Cache statistics (NEW)
const stats = await voiceManager.cache.getStats();

// Destroy
await voiceManager.destroy();
```

### Guild Class
```javascript
const guild = voiceManager.guilds.get(guildId);

// Get or create user
const user = await guild.getOrCreateUser(userId);

// Get leaderboard
const leaderboard = await guild.getLeaderboard('xp', 10);

// Edit config
await guild.config.edit({
  xpStrategy: 'custom-xp',
  xpConfig: { baseAmount: 15 }
});

// Save
await guild.save();
```

### User Class
```javascript
const user = guild.users.get(userId);

// Add XP
await user.addXP(100);

// Add voice time
await user.addVoiceTime(60000, channelId);

// Set level
await user.setLevel(10);

// Get rank
const rank = await user.getRank('xp');

// Reset
await user.reset();
```

### Config Class
```javascript
const config = guild.config;

// Get dynamic values
const xp = await config.getXpToAdd(member);
const voiceTime = await config.getVoiceTimeToAdd();
const multiplier = await config.getLevelMultiplier();

// Check filters
const shouldTrack = await config.checkMember(member);
const shouldTrackChannel = await config.checkChannel(channel);

// Edit
await config.edit({
  xpStrategy: 'new-strategy',
  xpConfig: { baseAmount: 20 }
});
```

### XPCalculator
```javascript
const { XPCalculator } = require('discord-vc-tracker');
const calculator = new XPCalculator();

calculator.calculateLevel(1000, 0.1);              // → 10
calculator.calculateXPForLevel(10, 0.1);           // → 1000
calculator.calculateXPToNextLevel(1500, 0.1);      // → 610
calculator.calculateLevelProgress(1500, 0.1);      // → 22
calculator.formatVoiceTime(3661000);               // → "1h 1m 1s"
```

### SQLiteStorage ⭐ NEW
```javascript
const { SQLiteStorage } = require('discord-vc-tracker');
const storage = new SQLiteStorage({ filename: './data/voice-tracker.db' });

// Integrity-verified backup (returns false if DB is corrupt)
const success = await storage.safeBackup('./data/backups/backup.db');

// Run VACUUM to reclaim unused space
await storage.optimize();

// Live stats: { guilds, users, sessions, databaseSize, filename }
const stats = storage.getStats();
```

### RedisCache ⭐ NEW
```javascript
const { RedisCache } = require('discord-vc-tracker');

const cache = new RedisCache({
  url:         'redis://localhost:6379',
  ttl:         300000,
  keyPrefix:   'voice:',
  enableStats: true
});

// Same stats API as MemoryCache
const stats = await cache.getStats();
// Returns: { hits, misses, hitRate, size, sets, deletes }

// Check if Redis connection is live
console.log(cache.connected); // true | false
```

---

## 🛠️ Troubleshooting

### "Strategy not found" Error
```javascript
// ❌ Error: Strategy 'my-xp' not found
defaultConfig: {
  xpStrategy: 'my-xp'  // Not registered!
}

// ✅ Fix: Register before using
voiceManager.registerXPStrategy('my-xp', (member) => 10);
```

---

### Voice Tracking Not Working

**Checklist:**
1. ✅ Correct intents: `Guilds`, `GuildVoiceStates`
2. ✅ Called `await voiceManager.init()`
3. ✅ User is in voice channel
4. ✅ Wait 5-10 seconds for first check

**Enable debug:**
```javascript
const voiceManager = new VoiceManager(client, {
  storage,
  cache,
  debug: true,  // ← Enable debug logs
});
```

---

### TypeError: Cannot read property 'users' of undefined

This error occurs when trying to access guild data before it's loaded or when using incorrect methods.

**❌ Common Mistakes:**
```javascript
// Mistake 1: Not waiting for init
const guild = voiceManager.guilds.get(guildId);
const user = guild.users.get(userId);  // guild might be undefined!

// Mistake 2: Using wrong method signature
const userData = await voiceManager.getUser(guildId, userId);  // Returns plain object
const user = userData.users.get(userId);  // ERROR: userData is not a Guild instance
```

**✅ Correct Solutions:**
```javascript
// Solution 1: Use cache-aware methods (RECOMMENDED)
const userData = await voiceManager.getUser(guildId, userId);
// userData is a plain object with user data, not a Guild instance

// Solution 2: Access Guild instance correctly
const guild = voiceManager.guilds.get(guildId);
if (guild) {
  const user = guild.users.get(userId);
  // Now safely access user
}

// Solution 3: Wait for initialization
await voiceManager.init();
// Now guilds are loaded
const guild = voiceManager.guilds.get(guildId);
```

**When to use each method:**

| Method | Use Case | Returns |
|--------|----------|---------|
| `voiceManager.getUser(guildId, userId)` | Commands, cache-aware access | Plain object with user data |
| `guild.users.get(userId)` | Direct access, internal operations | User class instance |
| `guild.getOrCreateUser(userId)` | Ensure user exists | User class instance |

---

### Low Cache Hit Rate (<70%)

**Solutions:**
- Increase TTL: `new MemoryCache({ ttl: 600000 })`
- Update commands to use `voiceManager.getUser()` (not `guild.users.get()`)
- Check that cache is enabled
- Monitor for 30+ minutes (cache needs warmup time)

---

### High Memory Usage

**Solutions:**
- Reduce maxSize: `new MemoryCache({ maxSize: 500 })`
- Reduce TTL: `new MemoryCache({ ttl: 180000 })`
- Monitor cache stats: `await voiceManager.cache.getStats()`

---

### MongoDB Connection Error

```javascript
// Make sure MongoDB is running
mongod

// Or use Atlas connection string
mongodb+srv://...

// Check connection
const storage = new MongoStorage(uri, dbName);
// Connection happens automatically when needed
```

---

### Custom Schema Queries Not Working

**Common Issues:**

**1. Wrong Database Connection**
```javascript
// ❌ Wrong - Both using same database
await mongoose.connect(uri, { dbName: 'voicetracker' });
const storage = new MongoStorage(uri, 'voicetracker');

// ✅ Correct - Separate databases
await mongoose.connect(uri, { dbName: 'your_bot_database' });
const storage = new MongoStorage(uri, 'voicetracker');
```

**2. Async Strategy Not Awaited**
```javascript
// ❌ Wrong - Missing await
voiceManager.registerXPStrategy('db-xp', async (member, config) => {
  const user = User.findOne({ userId: member.id });  // Missing await!
  return user?.xpMultiplier * 10 || 10;
});

// ✅ Correct
voiceManager.registerXPStrategy('db-xp', async (member, config) => {
  const user = await User.findOne({ userId: member.id });
  return user?.xpMultiplier * 10 || 10;
});
```

**3. Missing Indexes**
```javascript
// Add indexes for better performance
UserSchema.index({ userId: 1, guildId: 1 });
GuildSettingsSchema.index({ guildId: 1 });
```

---

### Redis Connection Issues? ⭐ NEW

- Verify that your Redis server is running and accessible from the bot process.
- Check that `REDIS_URL` in your `.env` matches your Redis server address.
- If using a managed Redis service, make sure TLS is enabled and the URL starts with `rediss://` (note the double `s`).
- Check the bot console for `❌ VoiceManager error` messages immediately after startup — a connection failure will show up there.
- **In Docker:** use the service name (`redis`), not `localhost`, in your `.env`.

---

### SQLite Database Locked? ⭐ NEW

- SQLite uses WAL mode by default, which handles concurrent reads well. Locking usually only occurs during heavy writes.
- If you see `SQLITE_BUSY` errors, increase the `timeout` option: `new SQLiteStorage({ timeout: 10000 })`.
- Run `/optimize` (VACUUM) — a fragmented database can increase lock contention.
- **Do not** point two bot processes at the same `.db` file. Use MongoDB + RedisCache for multi-instance deployments.

---

### Docker Issues? ⭐ NEW

**Bot exits immediately after starting:**
- Run `docker compose logs bot` and look at the last few lines. The most common causes are a missing `DISCORD_BOT_TOKEN` in `.env` or a failed connection to Mongo/Redis.
- Make sure your `.env` file is in the same directory as `docker-compose.yml`.

**"Connection refused" to MongoDB or Redis:**
- The bot container may start before Mongo/Redis are actually ready. The `depends_on` + `healthcheck` combo in the compose files above prevents this — make sure both services have `healthcheck` entries and `depends_on` uses `condition: service_healthy`.
- Double-check that you're using the **service name** (`mongo`, `redis`) in your `.env`, not `localhost`.

**SQLite "database is locked" inside Docker:**
- Make sure only **one** container is writing to the same `.db` file. SQLite is not designed for concurrent writers from separate processes.
- Increase the timeout: `new SQLiteStorage({ timeout: 10000 })`.

**Data disappears after `docker compose down`:**
- Volumes persist by default with `docker compose down`. If data is still gone, you may have run `docker compose down -v` which deletes named volumes.
- For SQLite and JSON, confirm that the `./data` bind-mount is present in your compose file.

---

## 📖 Documentation

- **[Examples](https://github.com/Instinzts/discord-vc-tracker/tree/main/examples)** - Complete working examples
- **[CHANGELOG](https://github.com/Instinzts/discord-vc-tracker/tree/main/CHANGELOG.md)** - Version history
- **[CONTRIBUTING](https://github.com/Instinzts/discord-vc-tracker/tree/main/CONTRIBUTING.md)** - Contribution guide

---

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](https://github.com/Instinzts/discord-vc-tracker/tree/main/CONTRIBUTING.md)

---

## 📄 License

MIT License - see [LICENSE](https://github.com/Instinzts/discord-vc-tracker/tree/main/LICENSE) file

---

## 🙏 Support

- 📖 [Documentation](https://github.com/Instinzts/discord-vc-tracker)
- 🐛 [Report Issues](https://github.com/Instinzts/discord-vc-tracker/issues)
- 💬 [Discord Server](https://discord.gg/Kf5kC5s8ha)
- ⭐ Star on GitHub if you find this useful!

---

**Made with ❤️ by [Async](https://github.com/Instinzts)**