import { EventEmitter } from 'events';
import { Collection } from 'discord.js';
import { VoiceManager } from './VoiceManager';
import { Guild } from './Guild';
import { Channel } from './Channel';
import { UserData, ChannelData } from '../types';

/**
 * Represents a User with voice tracking data
 */
export class User extends EventEmitter {
  public manager: VoiceManager;
  public guild: Guild;
  public userId: string;
  public guildId: string;
  public totalVoiceTime: number;
  public xp: number;
  public level: number;
  public channels: Collection<string, Channel>;
  public lastSeen: Date;
  public streak: number;
  public totalSessions: number;
  public metadata?: Record<string, any>;

  constructor(manager: VoiceManager, guild: Guild, data: UserData) {
    super();
    
    this.manager = manager;
    this.guild = guild;
    this.userId = data.userId;
    this.guildId = data.guildId;
    this.totalVoiceTime = data.totalVoiceTime;
    this.xp = data.xp;
    this.level = data.level;
    this.lastSeen = data.lastSeen;
    this.streak = data.streak;
    this.totalSessions = data.totalSessions;
    this.metadata = data.metadata;

    // Convert channels array to Collection
    this.channels = new Collection();
    for (const channelData of data.channels) {
      const channel = new Channel(manager, guild, this, channelData);
      this.channels.set(channelData.channelId, channel);
    }
  }

  /**
   * Get the Discord.js GuildMember object
   */
  get member() {
    return this.guild.discordGuild?.members.cache.get(this.userId);
  }

  /**
   * Get raw data for storage
   */
  get data(): UserData {
    return {
      userId: this.userId,
      guildId: this.guildId,
      totalVoiceTime: this.totalVoiceTime,
      xp: this.xp,
      level: this.level,
      channels: this.channels.map(c => c.data),
      lastSeen: this.lastSeen,
      streak: this.streak,
      totalSessions: this.totalSessions,
      metadata: this.metadata,
    };
  }

  /**
   * Add voice time to user
   */
  async addVoiceTime(amount: number, channelId?: string): Promise<void> {
    this.totalVoiceTime += amount;
    
    // Update channel-specific time if provided
    if (channelId) {
      let channel = this.channels.get(channelId);
      
      if (!channel) {
        const channelData: ChannelData = {
          channelId,
          voiceTime: amount,
          sessions: 1,
          lastActivity: new Date(),
        };
        channel = new Channel(this.manager, this.guild, this, channelData);
        this.channels.set(channelId, channel);
      } else {
        await channel.addTime(amount);
      }
    }
    
    this.lastSeen = new Date();
    await this.save();
    
    this.emit('voiceTimeAdd', this, amount);
    this.manager.emit('voiceTimeGained', this, amount);
  }

  /**
   * Add XP and check for level up
   */
  async addXP(amount: number): Promise<boolean> {
    const oldLevel = this.level;
    
    this.xp += amount;
    
    // Calculate new level
    const multiplier = await this.guild.config.getLevelMultiplier();
    const newLevel = Math.floor(multiplier * Math.sqrt(this.xp));
    
    const leveledUp = newLevel > oldLevel;
    
    if (leveledUp) {
      this.level = newLevel;
      this.emit('levelUp', this, oldLevel, newLevel);
      this.manager.emit('levelUp', this, oldLevel, newLevel);
    }
    
    this.lastSeen = new Date();
    await this.save();
    
    this.emit('xpAdd', this, amount);
    this.manager.emit('xpGained', this, amount);
    
    return leveledUp;
  }

  /**
   * Set level directly
   */
  async setLevel(level: number): Promise<void> {
    const oldLevel = this.level;
    this.level = level;
    
    await this.save();
    
    this.emit('levelSet', this, oldLevel, level);
  }

  /**
   * Set XP directly
   */
  async setXP(xp: number): Promise<void> {
    this.xp = xp;
    
    // Recalculate level
    const multiplier = await this.guild.config.getLevelMultiplier();
    this.level = Math.floor(multiplier * Math.sqrt(this.xp));
    
    await this.save();
  }

  /**
   * Reset user data
   */
  async reset(): Promise<void> {
    this.totalVoiceTime = 0;
    this.xp = 0;
    this.level = 0;
    this.channels.clear();
    this.totalSessions = 0;
    this.streak = 0;
    
    await this.save();
    
    this.emit('userReset', this);
  }

  /**
   * Edit user metadata
   */
  async editMetadata(metadata: Record<string, any>): Promise<void> {
    this.metadata = { ...this.metadata, ...metadata };
    await this.save();
  }

  /**
   * Save user to storage
   */
  async save(): Promise<void> {
    await this.manager.storage.saveUser(this.guildId, this.data);
  }

  /**
   * Delete user
   */
  async delete(): Promise<void> {
    await this.manager.storage.deleteUser(this.guildId, this.userId);
    this.guild.users.delete(this.userId);
    
    this.emit('userDelete', this);
    this.manager.emit('userDelete', this);
  }

  /**
   * Get user's rank in guild
   */
  async getRank(sortBy: 'voiceTime' | 'xp' | 'level' = 'xp'): Promise<number | null> {
    const allUsers = await this.manager.storage.getLeaderboard(
      this.guildId,
      sortBy,
      1000, // Get all users
      0
    );
    
    const userEntry = allUsers.find(entry => entry.userId === this.userId);
    return userEntry?.rank || null;
  }
}