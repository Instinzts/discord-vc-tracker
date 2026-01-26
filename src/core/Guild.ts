import { EventEmitter } from 'events';
import { Collection } from 'discord.js';
import { VoiceManager } from './VoiceManager';
import { User } from './User';
import { Config } from './Config';
import { GuildData, UserData } from '../types';

/**
 * Represents a Guild with voice tracking data
 */
export class Guild extends EventEmitter {
  public manager: VoiceManager;
  public guildId: string;
  public users: Collection<string, User>;
  public config: Config;
  public extraData: Record<string, any>;
  private lastUpdated: Date;

  constructor(manager: VoiceManager, data: GuildData) {
    super();
    
    this.manager = manager;
    this.guildId = data.guildId;
    this.extraData = data.extraData || {};
    this.lastUpdated = data.lastUpdated;

    // Convert Map to Discord.js Collection and create User instances
    this.users = new Collection();
    if (data.users instanceof Map) {
      for (const [userId, userData] of data.users) {
        this.users.set(userId, new User(manager, this, userData));
      }
    }

    // Create Config instance
    this.config = new Config(manager, this, data.config);
  }

  /**
   * Get the Discord.js Guild object
   */
  get discordGuild() {
    return this.manager.client.guilds.cache.get(this.guildId);
  }

  /**
   * Get raw data for storage
   */
  get data(): GuildData {
    const usersMap = new Map<string, UserData>();
    for (const [userId, user] of this.users) {
      usersMap.set(userId, user.data);
    }

    return {
      guildId: this.guildId,
      config: this.config.data,
      users: usersMap,
      lastUpdated: this.lastUpdated,
      extraData: this.extraData,
    };
  }

  /**
   * Edit guild settings
   */
  async edit(options: {
    extraData?: Record<string, any>;
  }): Promise<Guild> {
    if (options.extraData) {
      this.extraData = { ...this.extraData, ...options.extraData };
    }

    this.lastUpdated = new Date();
    await this.save();
    
    this.emit('guildUpdate', this);
    return this;
  }

  /**
   * Save guild to storage
   */
  async save(): Promise<void> {
    await this.manager.storage.saveGuild(this.data);
  }

  /**
   * Delete guild and all its data
   */
  async delete(): Promise<void> {
    await this.manager.storage.deleteGuild(this.guildId);
    this.manager.guilds.delete(this.guildId);
    this.emit('guildDelete', this);
  }

  /**
   * Get or create a user
   */
  async getOrCreateUser(userId: string): Promise<User> {
    let user = this.users.get(userId);
    
    if (!user) {
      const userData: UserData = {
        userId,
        guildId: this.guildId,
        totalVoiceTime: 0,
        xp: 0,
        level: 0,
        channels: [],
        lastSeen: new Date(),
        streak: 0,
        totalSessions: 0,
      };
      
      user = new User(this.manager, this, userData);
      this.users.set(userId, user);
      await user.save();
      
      this.emit('userCreate', user);
    }
    
    return user;
  }

  /**
   * Get leaderboard for this guild
   */
  async getLeaderboard(
    sortBy: 'voiceTime' | 'xp' | 'level' = 'xp',
    limit: number = 10
  ) {
    return await this.manager.storage.getLeaderboard(
      this.guildId,
      sortBy,
      limit,
      0
    );
  }
}