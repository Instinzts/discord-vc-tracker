# Discord Voice Tracker

> 🎙️ A modern, production-ready voice activity tracking system for Discord bots with XP, leveling, and comprehensive statistics.

[![npm version](https://img.shields.io/npm/v/discord-vc-tracker?style=flat-square)](https://www.npmjs.com/package/discord-vc-tracker)
[![npm downloads](https://img.shields.io/npm/dt/discord-vc-tracker?style=flat-square)](https://www.npmjs.com/package/discord-vc-tracker)
[![License](https://img.shields.io/npm/l/discord-vc-tracker?style=flat-square)](LICENSE)
[![Node Version](https://img.shields.io/node/v/discord-vc-tracker?style=flat-square)](https://nodejs.org)

---

## ✨ Features

- 🎯 **Voice Time Tracking** - Track total and per-channel voice activity
- 💫 **XP & Leveling System** - Automatic XP gain and level progression
- 🔥 **Strategy Pattern System** - Secure, flexible XP calculation (no `eval()`)
- 📊 **Statistics & Analytics** - Detailed user stats and session history
- 🏆 **Leaderboards** - Rank users by voice time, XP, or level
- ⚙️ **Highly Configurable** - Customize tracking behavior per guild
- 💾 **Multiple Storage Options** - JSON (built-in) and MongoDB support
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

### **Our Solution: Strategy Pattern**

This package uses a **secure strategy registration system**:
- ✅ **No `eval()`** - Zero runtime code execution
- ✅ **No function serialization** - Strategies registered at startup
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Debuggable** - Clear stack traces
- ✅ **Testable** - Easy to unit test strategies
- ✅ **Async support** - Database queries work perfectly

**How it works:**
```javascript
// ❌ OTHER PACKAGES (Insecure)
config: {
  xpPerCheck: (member) => member.premiumSince ? 20 : 10  // Serialized with eval()
}

// ✅ THIS PACKAGE (Secure)
voiceManager.registerXPStrategy('booster-xp', (member) => {
  return member.premiumSince ? 20 : 10;
});

config: {
  xpStrategy: 'booster-xp'  // Just a string reference
}
```

---

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [How It Works](#-how-it-works)
- [Strategy System Explained](#-strategy-system-explained)
- [Storage Options](#-storage-options)
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

### Step 2: (Optional) Install MongoDB

If you want to use MongoDB instead of JSON storage:

```bash
npm install mongodb mongoose
```

**When to use MongoDB:**
- ✅ Large servers (1000+ members)
- ✅ Multiple guilds
- ✅ Production environments
- ❌ Small bots or testing (use JSON instead)

---

## 🚀 Quick Start

### Basic Setup (5 minutes)
```javascript
const { Client, GatewayIntentBits } = require('discord.js');
const { VoiceManager, JSONStorage } = require('discord-vc-tracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Create storage
const storage = new JSONStorage('./data');

// Create voice manager
const voiceManager = new VoiceManager(client, {
  storage,
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
  console.log('✅ Voice tracking active!');
});

client.login('YOUR_BOT_TOKEN');
```

**Run it:**
```bash
node bot.js
```

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

### **3. Data Flow**
```
Voice Channel → VoiceManager → Strategy → User Data → Storage
                    ↓
                 Events (levelUp, xpGained, etc.)
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
  levelMultiplierStrategy: 'standard'  // 0.1 multiplier
}
```

**2. `'fast'`**
```javascript
defaultConfig: {
  levelMultiplierStrategy: 'fast'  // 0.15 = faster leveling
}
```

**3. `'slow'`**
```javascript
defaultConfig: {
  levelMultiplierStrategy: 'slow'  // 0.05 = slower leveling
}
```

### **Creating Custom Strategies**

#### **Simple Custom Strategy**
```javascript
const voiceManager = new VoiceManager(client, { storage });

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

#### **Complex Multi-Condition Strategy**
```javascript
voiceManager.registerXPStrategy('advanced-xp', async (member, config) => {
  let xp = 10;
  let multiplier = 1;
  
  // 1. Booster bonus
  if (member.premiumSince) multiplier += 0.5;
  
  // 2. Role bonus
  if (member.permissions.has('ADMINISTRATOR')) multiplier += 0.3;
  
  // 3. Time-of-day bonus
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) multiplier += 0.25;
  
  // 4. Database check
  const userData = await CustomDB.findOne({ userId: member.id });
  if (userData?.isPremium) multiplier += 1;
  
  return Math.floor(xp * multiplier);
});
```

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
const { MongoStorage } = require('discord-vc-tracker');

const storage = new MongoStorage(
  'mongodb://localhost:27017',
  'voicetracker'  // Database name
);

const voiceManager = new VoiceManager(client, {
  storage,
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

### **MongoDB Integration with Custom Schemas**

You can integrate with your **own MongoDB schemas**:

```javascript
const mongoose = require('mongoose');

// 1. Your custom schema
const GuildSettings = mongoose.model('GuildSettings', new mongoose.Schema({
  guildId: String,
  vipRoleId: String,
  xpMultiplier: Number,
}));

// 2. Connect to YOUR database
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'your_bot_database'
});

// 3. Voice tracker uses SEPARATE database
const storage = new MongoStorage(
  process.env.MONGODB_URI,
  'voicetracker'  // Different database
);

const voiceManager = new VoiceManager(client, { storage });

// 4. Register strategy using YOUR schema
voiceManager.registerXPStrategy('guild-settings-xp', async (member, config) => {
  const settings = await GuildSettings.findOne({
    guildId: member.guild.id
  });
  
  if (!settings) return 10;
  
  let xp = 10;
  
  if (settings.vipRoleId && member.roles.cache.has(settings.vipRoleId)) {
    xp = 15;
  }
  
  return Math.floor(xp * settings.xpMultiplier);
});

await voiceManager.init();
```

**Complete example:** [examples/mongodb-bot-example.js](https://github.com/Instinzts/discord-vc-tracker/blob/master/examples/mongodb-bot-example.js)

---

## 💬 Slash Commands

### Example: `/stats` Command
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
  
  // Get user data
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
    .setFooter({ text: 'Powered by discord-vc-tracker' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
});
```

---

## ⚙️ Configuration

### Manager Options
```javascript
const voiceManager = new VoiceManager(client, {
  storage: storage,              // Required: JSONStorage or MongoStorage
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
      // Custom logic
      return !member.user.bot;
    },
    
    channelFilter: (channel) => {
      // Custom logic
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

// Get user (legacy method)
const userData = await voiceManager.getUser(guildId, userId);

// Update user
await voiceManager.updateUser(guildId, userId, {
  addVoiceTime: 60000,
  addXp: 100,
  setLevel: 5,
});

// Leaderboard
const leaderboard = await voiceManager.getLeaderboard(guildId, {
  sortBy: 'xp',
  limit: 10,
});

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
  debug: true,
});
```

### TypeError: Cannot read property 'users' of undefined
```javascript
// ❌ Wrong
const userData = await voiceManager.getUser(guildId, userId);

// ✅ Correct
const guild = voiceManager.guilds.get(guildId);
const user = guild?.users.get(userId);
```

### MongoDB Connection Error
```javascript
// Make sure MongoDB is running
mongod

// Or use Atlas connection string
mongodb+srv://...
```

---

## 📖 Documentation

- **[Examples](https://github.com/Instinzts/discord-vc-tracker/tree/master/examples)** - Complete working examples
- **[CHANGELOG](https://github.com/Instinzts/discord-vc-tracker/blob/master/CHANGELOG.md)** - Version history
- **[CONTRIBUTING](https://github.com/Instinzts/discord-vc-tracker/blob/master/CONTRIBUTING.md)** - Contribution guide

---

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](https://github.com/Instinzts/discord-vc-tracker/blob/master/CONTRIBUTING.md)

---

## 📄 License

MIT License - see [LICENSE](https://github.com/Instinzts/discord-vc-tracker/blob/master/LICENSE) file

---

## 🙏 Support

- 📖 [Documentation](https://github.com/Instinzts/discord-vc-tracker)
- 🐛 [Report Issues](https://github.com/Instinzts/discord-vc-tracker/issues)
- 💬 [Discord Server](https://discord.gg/Kf5kC5s8ha)
- ⭐ Star on GitHub if you find this useful!

---

**Made with ❤️ by [Async](https://github.com/Instinzts)**