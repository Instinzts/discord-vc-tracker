# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-25

### 🎉 Initial Release

#### ✨ Core Features

**Voice Activity Tracking**
- Real-time voice channel presence tracking
- Per-channel voice time statistics
- Total voice time accumulation
- Session history tracking
- Automatic session management (start/end)

**XP & Leveling System**
- Automatic XP gain while in voice channels
- Level progression based on XP
- Customizable XP rates
- Level-up events and notifications
- XP calculation utilities

**Strategy Pattern System**
- Secure strategy registration (no `eval()` usage)
- Built-in strategies for common use cases
- Custom strategy support
- Async strategy support for database queries
- Strategy-based configuration system

**Statistics & Analytics**
- Detailed user statistics
- Leaderboards (XP, level, voice time)
- Rank tracking
- Progress tracking
- Session analytics

#### 🎨 Built-in Strategies

**XP Strategies:**
- `'fixed'` - Fixed XP amount (default: 10)
- `'role-based'` - Different XP for different roles
- `'booster-bonus'` - Bonus XP for server boosters (2x multiplier)
- `'random'` - Random XP within specified range

**Voice Time Strategies:**
- `'fixed'` - Fixed time increment (default: 5000ms)
- `'scaled'` - Scaled time by multiplier

**Level Multiplier Strategies:**
- `'standard'` - Standard progression (0.1 multiplier)
- `'fast'` - Faster leveling (0.15 multiplier)
- `'slow'` - Slower leveling (0.05 multiplier)

#### 💾 Storage Options

**JSON Storage** (Built-in)
- File-based storage
- No external dependencies
- Simple backup and migration
- Suitable for small to medium bots

**MongoDB Storage**
- Scalable database storage
- Fast queries and indexing
- Concurrent write support
- Production-ready for large bots

#### ⚙️ Configuration Options

**Tracking Configuration:**
- Track/ignore bots
- Track all channels or specific channels
- Track muted/deafened users
- Minimum/maximum users to track
- Exempt permissions
- Custom member filters
- Custom channel filters

**Strategy Configuration:**
- XP strategy selection
- Voice time strategy selection
- Level multiplier strategy selection
- Strategy-specific configurations (`xpConfig`, `voiceTimeConfig`, etc.)

**Module Toggles:**
- Enable/disable leveling system
- Enable/disable voice time tracking

#### 🎯 Events System

**User Events:**
- `levelUp` - When a user levels up
- `xpGained` - When a user gains XP
- `voiceTimeGained` - When voice time is added

**Session Events:**
- `sessionStart` - When a voice session starts
- `sessionEnd` - When a voice session ends

**System Events:**
- `configUpdated` - When guild config changes
- `ready` - When voice manager is initialized
- `error` - When an error occurs

#### 📚 API Methods

**VoiceManager:**
- `init()` - Initialize the voice manager
- `registerXPStrategy()` - Register custom XP strategy
- `registerVoiceTimeStrategy()` - Register custom voice time strategy
- `registerLevelMultiplierStrategy()` - Register custom level multiplier strategy
- `getUser()` - Get user data (legacy)
- `updateUser()` - Update user data
- `getLeaderboard()` - Get guild leaderboard
- `destroy()` - Cleanup and shutdown

**Guild Class:**
- `getOrCreateUser()` - Get or create user instance
- `getLeaderboard()` - Get leaderboard for guild
- `config.edit()` - Edit guild configuration
- `save()` - Save guild data

**User Class:**
- `addXP()` - Add XP to user
- `addVoiceTime()` - Add voice time to user
- `setLevel()` - Set user level
- `getRank()` - Get user rank
- `reset()` - Reset user data

**Config Class:**
- `getXpToAdd()` - Calculate XP to add
- `getVoiceTimeToAdd()` - Calculate voice time to add
- `getLevelMultiplier()` - Get level multiplier
- `checkMember()` - Check if member should be tracked
- `checkChannel()` - Check if channel should be tracked
- `edit()` - Edit configuration

**XPCalculator:**
- `calculateLevel()` - Calculate level from XP
- `calculateXPForLevel()` - Calculate XP needed for level
- `calculateXPToNextLevel()` - Calculate XP to next level
- `calculateLevelProgress()` - Calculate progress percentage
- `formatVoiceTime()` - Format milliseconds to readable time

#### 🔒 Security Features

- No `eval()` usage
- No runtime code execution
- No function serialization
- Strategy validation
- Error handling and fallbacks
- Safe configuration storage

#### 📝 TypeScript Support

- Full type definitions included
- Exported interfaces and types
- IntelliSense support
- Type-safe configuration

#### 🚀 Performance

- Efficient voice state tracking
- Cached guild and user data
- Optimized database queries
- Minimal memory footprint
- Configurable check intervals

#### 📖 Documentation

- Comprehensive README
- Quick start guide
- Strategy examples
- MongoDB integration guide
- API reference
- Troubleshooting guide
- Example bot implementations

#### 🔧 Development Tools

- Debug logging mode
- Error event handling
- Validation helpers
- Development examples

#### 📦 Dependencies

**Required:**
- `discord.js` ^14.0.0
- Node.js 18.0.0+

**Optional:**
- `mongodb` ^6.0.0 (for MongoDB storage)
- `mongoose` ^8.0.0 (for custom schemas)

#### 🎁 Examples Included

- Basic bot setup
- Custom strategies
- MongoDB integration
- Slash commands
- Leaderboard implementation
- Statistics display

---

## Future Releases

### Planned Features
- Additional built-in strategies
- More storage adapters
- Advanced analytics
- Web dashboard integration
- Voice channel categories
- Role rewards system
- Achievements system

---

[1.0.0]: https://github.com/Instinzts/discord-vc-tracker/releases/tag/v1.0.0