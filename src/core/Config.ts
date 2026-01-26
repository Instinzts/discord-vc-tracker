import { EventEmitter } from 'events';
import { GuildMember, VoiceBasedChannel, PermissionResolvable } from 'discord.js';
import { VoiceManager } from './VoiceManager';
import { Guild } from './Guild';
import { GuildConfig } from '../types';

/**
 * Guild configuration manager (NO EVAL - uses strategy pattern)
 */
export class Config extends EventEmitter {
  public manager: VoiceManager;
  public guild: Guild;
  private _data: GuildConfig;

  constructor(manager: VoiceManager, guild: Guild, config: GuildConfig) {
    super();
    
    this.manager = manager;
    this.guild = guild;
    this._data = config;
  }

  /**
   * Get raw data for storage
   */
  get data(): GuildConfig {
    return {
      guildId: this._data.guildId,
      trackBots: this._data.trackBots,
      trackAllChannels: this._data.trackAllChannels,
      channelIds: this._data.channelIds,
      trackMuted: this._data.trackMuted,
      trackDeafened: this._data.trackDeafened,
      minUsersToTrack: this._data.minUsersToTrack,
      maxUsersToTrack: this._data.maxUsersToTrack,
      exemptPermissions: this._data.exemptPermissions,
      xpStrategy: this._data.xpStrategy,
      xpConfig: this._data.xpConfig,
      voiceTimeStrategy: this._data.voiceTimeStrategy,
      voiceTimeConfig: this._data.voiceTimeConfig,
      levelMultiplierStrategy: this._data.levelMultiplierStrategy,
      levelMultiplierConfig: this._data.levelMultiplierConfig,
      enableLeveling: this._data.enableLeveling,
      enableVoiceTime: this._data.enableVoiceTime,
      // ✅ NOTE: channelFilter and memberFilter are NOT saved to database
    };
  }

  // ===== GETTERS =====

  get guildId(): string {
    return this._data.guildId;
  }

  get trackBots(): boolean {
    return this._data.trackBots;
  }

  get trackAllChannels(): boolean {
    return this._data.trackAllChannels;
  }

  get channelIds(): string[] {
    return this._data.channelIds;
  }

  get trackMuted(): boolean {
    return this._data.trackMuted;
  }

  get trackDeafened(): boolean {
    return this._data.trackDeafened;
  }

  get minUsersToTrack(): number {
    return this._data.minUsersToTrack;
  }

  get maxUsersToTrack(): number {
    return this._data.maxUsersToTrack;
  }

  get exemptPermissions(): PermissionResolvable[] {
    return this._data.exemptPermissions;
  }

  get enableLeveling(): boolean {
    return this._data.enableLeveling;
  }

  get enableVoiceTime(): boolean {
    return this._data.enableVoiceTime;
  }

  // ===== STRATEGY EXECUTORS =====

  /**
   * Get XP amount to add for a member
   */
  async getXpToAdd(member: GuildMember): Promise<number> {
    const strategyName = this._data.xpStrategy || 'fixed';
    const calculator = this.manager.getXPStrategy(strategyName);
    
    try {
      const xp = await calculator(member, this._data);
      return typeof xp === 'number' && xp >= 0 ? xp : 5;
    } catch (error) {
      this.manager.logger.error(`Error in XP strategy "${strategyName}":`, error);
      return 5; // Fallback
    }
  }

  /**
   * Get voice time to add
   */
  async getVoiceTimeToAdd(): Promise<number> {
    const strategyName = this._data.voiceTimeStrategy || 'fixed';
    const calculator = this.manager.getVoiceTimeStrategy(strategyName);
    
    try {
      const time = await calculator(this._data);
      return typeof time === 'number' && time >= 0 ? time : 5000;
    } catch (error) {
      this.manager.logger.error(`Error in voice time strategy "${strategyName}":`, error);
      return 5000; // Fallback
    }
  }

  /**
   * Get level multiplier
   */
  async getLevelMultiplier(): Promise<number> {
    const strategyName = this._data.levelMultiplierStrategy || 'standard';
    const calculator = this.manager.getLevelMultiplierStrategy(strategyName);
    
    try {
      const multiplier = await calculator(this._data);
      return typeof multiplier === 'number' && multiplier > 0 ? multiplier : 0.1;
    } catch (error) {
      this.manager.logger.error(`Error in level multiplier strategy "${strategyName}":`, error);
      return 0.1; // Fallback
    }
  }

  /**
   * Check if channel should be tracked
   */
  async checkChannel(channel: VoiceBasedChannel): Promise<boolean> {
    if (!this._data.channelFilter) {
      return true;
    }

    try {
      const result = await this._data.channelFilter(channel);
      return result;
    } catch (error) {
      console.error('Error in channelFilter:', error);
      return true;
    }
  }

  /**
   * Check if member should be tracked
   */
  async checkMember(member: GuildMember): Promise<boolean> {
    if (!this._data.memberFilter) {
      return true;
    }

    try {
      const result = await this._data.memberFilter(member);
      return result;
    } catch (error) {
      console.error('Error in memberFilter:', error);
      return true;
    }
  }

  /**
   * Edit configuration
   */
  async edit(options: Partial<GuildConfig>): Promise<Config> {
    const oldConfig = { ...this._data };

    // Update simple properties
    if (options.trackBots !== undefined) this._data.trackBots = options.trackBots;
    if (options.trackAllChannels !== undefined) this._data.trackAllChannels = options.trackAllChannels;
    if (options.channelIds !== undefined) this._data.channelIds = options.channelIds;
    if (options.trackMuted !== undefined) this._data.trackMuted = options.trackMuted;
    if (options.trackDeafened !== undefined) this._data.trackDeafened = options.trackDeafened;
    if (options.minUsersToTrack !== undefined) this._data.minUsersToTrack = options.minUsersToTrack;
    if (options.maxUsersToTrack !== undefined) this._data.maxUsersToTrack = options.maxUsersToTrack;
    if (options.exemptPermissions !== undefined) this._data.exemptPermissions = options.exemptPermissions;
    if (options.enableLeveling !== undefined) this._data.enableLeveling = options.enableLeveling;
    if (options.enableVoiceTime !== undefined) this._data.enableVoiceTime = options.enableVoiceTime;

    // ✅ Update strategy names and configs
    if (options.xpStrategy !== undefined) this._data.xpStrategy = options.xpStrategy;
    if (options.xpConfig !== undefined) this._data.xpConfig = { ...this._data.xpConfig, ...options.xpConfig };
    if (options.voiceTimeStrategy !== undefined) this._data.voiceTimeStrategy = options.voiceTimeStrategy;
    if (options.voiceTimeConfig !== undefined) this._data.voiceTimeConfig = { ...this._data.voiceTimeConfig, ...options.voiceTimeConfig };
    if (options.levelMultiplierStrategy !== undefined) this._data.levelMultiplierStrategy = options.levelMultiplierStrategy;
    if (options.levelMultiplierConfig !== undefined) this._data.levelMultiplierConfig = { ...this._data.levelMultiplierConfig, ...options.levelMultiplierConfig };

    // ✅ Update runtime filters (not saved)
    if (options.channelFilter !== undefined) this._data.channelFilter = options.channelFilter;
    if (options.memberFilter !== undefined) this._data.memberFilter = options.memberFilter;

    // Save to storage
    await this.guild.save();
    
    this.emit('configUpdate', this, oldConfig);
    this.manager.emit('configUpdated', this.guild.guildId, this);
    
    return this;
  }
}