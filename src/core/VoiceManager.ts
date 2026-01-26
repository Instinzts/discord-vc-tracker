import { Client, GuildMember, VoiceState, Collection } from 'discord.js';
import { EventEmitter } from 'events';
import {
  VoiceManagerOptions,
  GuildData,
  UserData,
  GuildConfig,
  SessionData,
  LeaderboardEntry,
  UserUpdateOptions,
  LeaderboardOptions,
  XPCalculator,
  VoiceTimeCalculator,
  LevelMultiplierCalculator,
} from '../types';
import { Logger } from '../utils/Logger';
import { XPCalculator as XPCalc } from '../utils/Calculator';
import { Guild } from './Guild';

/**
 * Main Voice Tracking Manager
 */
export class VoiceManager extends EventEmitter {
  public client: Client;
  public storage: VoiceManagerOptions['storage'];
  public guilds: Collection<string, Guild>;
  private checkInterval: number;
  private intervalId?: NodeJS.Timeout;
  public logger: Logger;
  private calculator: XPCalc;
  private activeSessions: Map<string, SessionData>;
  private defaultConfig: Partial<GuildConfig>;
  
  // ✅ NEW: Strategy Registries
  private xpStrategies: Map<string, XPCalculator> = new Map();
  private voiceTimeStrategies: Map<string, VoiceTimeCalculator> = new Map();
  private levelMultiplierStrategies: Map<string, LevelMultiplierCalculator> = new Map();

  constructor(client: Client, options: VoiceManagerOptions) {
    super();
    
    this.client = client;
    this.storage = options.storage;
    this.checkInterval = options.checkInterval || 5000;
    this.logger = new Logger(options.debug || false);
    this.calculator = new XPCalc();
    this.activeSessions = new Map();
    this.defaultConfig = options.defaultConfig || {};
    this.guilds = new Collection();
    
    // ✅ Register built-in strategies
    this.registerBuiltInStrategies();
  }

  /**
   * ✅ NEW: Register built-in strategies
   */
  private registerBuiltInStrategies(): void {
    // ===== XP Strategies =====
    
    // Fixed XP amount
    this.registerXPStrategy('fixed', (_member, config) => {
      return config.xpConfig?.baseAmount || 5;
    });
    
    // Role-based XP
    this.registerXPStrategy('role-based', (member, config) => {
      const roles = config.xpConfig?.roles || {};
      
      for (const [roleId, xp] of Object.entries(roles)) {
        if (member.roles.cache.has(roleId)) {
          return xp as number;
        }
      }
      
      return config.xpConfig?.baseAmount || 5;
    });
    
    // Booster bonus
    this.registerXPStrategy('booster-bonus', (member, config) => {
      const baseXP = config.xpConfig?.baseAmount || 10;
      const boosterMultiplier = config.xpConfig?.boosterMultiplier || 2;
      
      return member.premiumSince ? baseXP * boosterMultiplier : baseXP;
    });
    
    // Random range
    this.registerXPStrategy('random', (_member, config) => {
      const min = config.xpConfig?.minXP || 5;
      const max = config.xpConfig?.maxXP || 15;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    });

    // ===== Voice Time Strategies =====
    
    this.registerVoiceTimeStrategy('fixed', (config) => {
      return config.voiceTimeConfig?.baseAmount || 5000;
    });
    
    this.registerVoiceTimeStrategy('scaled', (config) => {
      const base = config.voiceTimeConfig?.baseAmount || 5000;
      const multiplier = config.voiceTimeConfig?.multiplier || 1;
      return base * multiplier;
    });

    // ===== Level Multiplier Strategies =====
    
    this.registerLevelMultiplierStrategy('standard', (config) => {
      return config.levelMultiplierConfig?.baseMultiplier || 0.1;
    });
    
    this.registerLevelMultiplierStrategy('fast', (_config) => {
      return 0.15; // Faster leveling
    });
    
    this.registerLevelMultiplierStrategy('slow', (_config) => {
      return 0.05; // Slower leveling
    });

    this.logger.debug('Built-in strategies registered');
  }

  /**
   * ✅ NEW: Register a custom XP strategy
   */
  registerXPStrategy(name: string, calculator: XPCalculator): void {
    this.xpStrategies.set(name, calculator);
    this.logger.debug(`Registered XP strategy: ${name}`);
  }

  /**
   * ✅ NEW: Register a custom voice time strategy
   */
  registerVoiceTimeStrategy(name: string, calculator: VoiceTimeCalculator): void {
    this.voiceTimeStrategies.set(name, calculator);
    this.logger.debug(`Registered voice time strategy: ${name}`);
  }

  /**
   * ✅ NEW: Register a custom level multiplier strategy
   */
  registerLevelMultiplierStrategy(name: string, calculator: LevelMultiplierCalculator): void {
    this.levelMultiplierStrategies.set(name, calculator);
    this.logger.debug(`Registered level multiplier strategy: ${name}`);
  }

  /**
   * ✅ NEW: Get XP strategy (internal use)
   */
  getXPStrategy(strategyName: string): XPCalculator {
    const strategy = this.xpStrategies.get(strategyName);
    
    if (!strategy) {
      this.logger.warn(`Unknown XP strategy: ${strategyName}, using 'fixed'`);
      return this.xpStrategies.get('fixed')!;
    }
    
    return strategy;
  }

  /**
   * ✅ NEW: Get voice time strategy (internal use)
   */
  getVoiceTimeStrategy(strategyName: string): VoiceTimeCalculator {
    const strategy = this.voiceTimeStrategies.get(strategyName);
    
    if (!strategy) {
      this.logger.warn(`Unknown voice time strategy: ${strategyName}, using 'fixed'`);
      return this.voiceTimeStrategies.get('fixed')!;
    }
    
    return strategy;
  }

  /**
   * ✅ NEW: Get level multiplier strategy (internal use)
   */
  getLevelMultiplierStrategy(strategyName: string): LevelMultiplierCalculator {
    const strategy = this.levelMultiplierStrategies.get(strategyName);
    
    if (!strategy) {
      this.logger.warn(`Unknown level multiplier strategy: ${strategyName}, using 'standard'`);
      return this.levelMultiplierStrategies.get('standard')!;
    }
    
    return strategy;
  }

  /**
   * Initialize the manager
   */
  async init(): Promise<void> {
    try {
      this.logger.debug('Initializing VoiceManager...');
      
      // Initialize storage
      await this.storage.init();
      this.logger.debug('Storage initialized');
      
      // Wait for client to be ready
      if (!this.client.isReady()) {
        await new Promise<void>((resolve) => {
          this.client.once('ready', () => resolve());
        });
      }
      
      // Load guilds into memory
      await this.loadGuilds();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start tracking interval
      this.startTracking();
      
      this.logger.debug('VoiceManager initialized successfully');
      this.emit('debug', 'VoiceManager ready');
    } catch (error) {
      this.logger.error('Failed to initialize VoiceManager', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Load guilds from storage into memory
   */
  private async loadGuilds(): Promise<void> {
    try {
      const allGuildData = await this.storage.getAllGuilds();
      
      for (const guildData of allGuildData) {
        const guild = new Guild(this, guildData);
        this.guilds.set(guildData.guildId, guild);
      }
      
      this.logger.debug(`Loaded ${this.guilds.size} guilds into memory`);
    } catch (error) {
      this.logger.error('Error loading guilds', error);
      throw error;
    }
  }

  /**
   * Get default guild configuration
   */
  private getDefaultConfig(): GuildConfig {
    return {
      guildId: '',
      trackBots: false,
      trackAllChannels: true,
      channelIds: [],
      trackMuted: true,
      trackDeafened: true,
      minUsersToTrack: 0,
      maxUsersToTrack: 0,
      exemptPermissions: [],
      xpStrategy: 'fixed',
      xpConfig: { baseAmount: 5 },
      voiceTimeStrategy: 'fixed',
      voiceTimeConfig: { baseAmount: 5000 },
      levelMultiplierStrategy: 'standard',
      levelMultiplierConfig: { baseMultiplier: 0.1 },
      enableLeveling: true,
      enableVoiceTime: true,
    };
  }

  /**
   * Set up Discord event listeners
   */
  private setupEventListeners(): void {
    this.client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState).catch((error) => {
        this.logger.error('Error handling voice state update', error);
        this.emit('error', error);
      });
    });

    this.logger.debug('Event listeners registered');
  }

  /**
   * Handle voice state updates
   */
  private async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState
  ): Promise<void> {
    const member = newState.member;
    if (!member) return;

    const guildId = newState.guild.id;
    const userId = member.id;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      await this.startSession(member, newState.channel.id);
    }
    
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
      await this.endSession(guildId, userId);
    }
    
    // User switched channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      await this.endSession(guildId, userId);
      await this.startSession(member, newState.channel.id);
    }
  }

  /**
   * Start a voice session
   */
  private async startSession(member: GuildMember, channelId: string): Promise<void> {
    const sessionKey = `${member.guild.id}-${member.id}`;
    
    const session: SessionData = {
      sessionId: `${Date.now()}-${member.id}`,
      userId: member.id,
      guildId: member.guild.id,
      channelId,
      startTime: new Date(),
      xpEarned: 0,
      wasMuted: member.voice.mute || false,
      wasDeafened: member.voice.deaf || false,
    };

    this.activeSessions.set(sessionKey, session);
    
    // Update user's total sessions
    const guild = this.guilds.get(member.guild.id);
    if (guild) {
      const user = await guild.getOrCreateUser(member.id);
      user.totalSessions++;
      await user.save();
    }

    this.emit('sessionStart', session);
    this.logger.debug(`Session started: ${member.user.tag} in ${channelId}`);
  }

  /**
   * End a voice session
   */
  private async endSession(guildId: string, userId: string): Promise<void> {
    const sessionKey = `${guildId}-${userId}`;
    const session = this.activeSessions.get(sessionKey);

    if (session) {
      session.endTime = new Date();
      session.duration = session.endTime.getTime() - session.startTime.getTime();
      
      await this.storage.saveSession(session);
      this.activeSessions.delete(sessionKey);
      this.emit('sessionEnd', session);
      
      this.logger.debug(`Session ended: ${userId}, duration: ${session.duration}ms`);
    }
  }

  /**
   * Start tracking voice activity
   */
  private startTracking(): void {
    this.intervalId = setInterval(() => {
      this.trackVoiceActivity().catch((error) => {
        this.logger.error('Error tracking voice activity', error);
        this.emit('error', error);
      });
    }, this.checkInterval);

    this.logger.debug(`Tracking started with ${this.checkInterval}ms interval`);
  }

  /**
   * Track voice activity for all guilds
   */
  private async trackVoiceActivity(): Promise<void> {
    for (const [guildId, discordGuild] of this.client.guilds.cache) {
      try {
        // Get or create guild
        let guild = this.guilds.get(guildId);
        if (!guild) {
          const config = await this.getGuildConfig(guildId);
          const guildData: GuildData = {
            guildId,
            config,
            users: new Map(),
            lastUpdated: new Date(),
            extraData: {},
          };
          guild = new Guild(this, guildData);
          this.guilds.set(guildId, guild);
          await guild.save();
        }
        
        // Get all members in voice channels
        const membersInVoice = discordGuild.members.cache.filter((member) => 
          member.voice.channel !== null
        );

        for (const [_, member] of membersInVoice) {
          await this.processMember(member, guild);
        }
      } catch (error) {
        this.logger.error(`Error tracking guild ${guildId}`, error);
      }
    }
  }

  /**
   * Process a single member's voice activity
   */
  private async processMember(member: GuildMember, guild: Guild): Promise<void> {
    const channel = member.voice.channel;
    if (!channel) return;

    // Check if member should be tracked
    if (!(await this.shouldTrackMember(member, guild.config))) return;
    if (!(await this.shouldTrackChannel(channel, guild.config))) return;

    // Get or create user
    const user = await guild.getOrCreateUser(member.id);

    // Add voice time using strategy
    if (guild.config.enableVoiceTime) {
      const voiceTimeToAdd = await guild.config.getVoiceTimeToAdd();
      await user.addVoiceTime(voiceTimeToAdd, channel.id);
    }

    // Add XP using strategy
    if (guild.config.enableLeveling) {
      const xpToAdd = await guild.config.getXpToAdd(member);
      await user.addXP(xpToAdd);
      
      // Update session XP
      const sessionKey = `${member.guild.id}-${member.id}`;
      const session = this.activeSessions.get(sessionKey);
      if (session) {
        session.xpEarned += xpToAdd;
      }
    }
  }

  /**
   * Check if member should be tracked
   */
  private async shouldTrackMember(
    member: GuildMember,
    config: any
  ): Promise<boolean> {
    // Don't track bots if disabled
    if (!config.trackBots && member.user.bot) return false;

    // Check exempt permissions
    if (config.exemptPermissions.length > 0) {
      const hasExemptPermission = config.exemptPermissions.some((perm: any) =>
        member.permissions.has(perm)
      );
      if (hasExemptPermission) return false;
    }

    // Check mute/deafen
    if (!config.trackMuted && member.voice.mute) return false;
    if (!config.trackDeafened && member.voice.deaf) return false;

    // Use Config class method
    return await config.checkMember(member);
  }

  /**
   * Check if channel should be tracked
   */
  private async shouldTrackChannel(
    channel: any,
    config: any
  ): Promise<boolean> {
    // Check if all channels tracked or specific channel
    if (!config.trackAllChannels && !config.channelIds.includes(channel.id)) {
      return false;
    }

    // Check user count
    const memberCount = channel.members.size;
    if (config.minUsersToTrack > 0 && memberCount < config.minUsersToTrack) {
      return false;
    }
    if (config.maxUsersToTrack > 0 && memberCount > config.maxUsersToTrack) {
      return false;
    }

    // Use Config class method
    return await config.checkChannel(channel);
  }

  /**
   * Get guild configuration
   */
  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    const guildData = await this.storage.getGuild(guildId);
    
    if (guildData) {
      return guildData.config;
    }

    // Create default config
    const config: GuildConfig = {
      ...this.getDefaultConfig(),
      ...this.defaultConfig,
      guildId,
    };

    await this.saveGuildConfig(guildId, config);
    return config;
  }

  /**
   * Save guild configuration
   */
  async saveGuildConfig(guildId: string, config: GuildConfig): Promise<void> {
    const existingGuild = await this.storage.getGuild(guildId);
    
    const guildData: GuildData = {
      guildId,
      config,
      users: existingGuild?.users || new Map(),
      lastUpdated: new Date(),
      extraData: existingGuild?.extraData || {},
    };

    await this.storage.saveGuild(guildData);
    this.emit('configUpdated', guildId, config);
  }

  /**
   * Create a new user (legacy method for backward compatibility)
   */
  private async createUser(guildId: string, userId: string): Promise<UserData> {
    const userData: UserData = {
      userId,
      guildId,
      totalVoiceTime: 0,
      xp: 0,
      level: 0,
      channels: [],
      lastSeen: new Date(),
      streak: 0,
      totalSessions: 0,
    };

    await this.storage.saveUser(guildId, userData);
    return userData;
  }

  /**
   * Get user data
   */
  async getUser(guildId: string, userId: string): Promise<UserData | null> {
    return await this.storage.getUser(guildId, userId);
  }

  /**
   * Update user data
   */
  async updateUser(
    guildId: string,
    userId: string,
    options: UserUpdateOptions
  ): Promise<UserData> {
    let userData = await this.storage.getUser(guildId, userId);
    
    if (!userData) {
      userData = await this.createUser(guildId, userId);
    }

    if (options.addVoiceTime) {
      userData.totalVoiceTime += options.addVoiceTime;
    }
    
    if (options.addXp) {
      userData.xp += options.addXp;
      
      const guild = this.guilds.get(guildId);
      if (guild) {
        const multiplier = await guild.config.getLevelMultiplier();
        const newLevel = this.calculator.calculateLevel(userData.xp, multiplier);
        
        if (newLevel > userData.level) {
          const oldLevel = userData.level;
          userData.level = newLevel;
          this.emit('levelUp', userData, oldLevel, newLevel);
        }
      }
    }
    
    if (options.setLevel !== undefined) {
      userData.level = options.setLevel;
    }
    
    if (options.metadata) {
      userData.metadata = { ...userData.metadata, ...options.metadata };
    }

    await this.storage.saveUser(guildId, userData);
    return userData;
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    guildId: string,
    options: LeaderboardOptions = {}
  ): Promise<LeaderboardEntry[]> {
    return await this.storage.getLeaderboard(
      guildId,
      options.sortBy || 'xp',
      options.limit || 10,
      options.offset || 0
    );
  }

  /**
   * Delete guild data
   */
  async deleteGuild(guildId: string): Promise<void> {
    await this.storage.deleteGuild(guildId);
    this.guilds.delete(guildId);
  }

  /**
   * Delete user data
   */
  async deleteUser(guildId: string, userId: string): Promise<void> {
    await this.storage.deleteUser(guildId, userId);
  }

  /**
   * Destroy the manager
   */
  async destroy(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    await this.storage.close();
    this.logger.debug('VoiceManager destroyed');
  }
}