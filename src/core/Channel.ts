import { EventEmitter } from 'events';
import { VoiceManager } from './VoiceManager';
import { Guild } from './Guild';
import { User } from './User';
import { ChannelData } from '../types';

/**
 * Represents a voice channel's tracking data for a specific user
 */
export class Channel extends EventEmitter {
  public manager: VoiceManager;
  public guild: Guild;
  public user: User;
  public channelId: string;
  public voiceTime: number;
  public sessions: number;
  public lastActivity: Date;

  constructor(
    manager: VoiceManager,
    guild: Guild,
    user: User,
    data: ChannelData
  ) {
    super();
    
    this.manager = manager;
    this.guild = guild;
    this.user = user;
    this.channelId = data.channelId;
    this.voiceTime = data.voiceTime;
    this.sessions = data.sessions;
    this.lastActivity = data.lastActivity;
  }

  /**
   * Get the Discord.js VoiceChannel object
   */
  get discordChannel() {
    return this.guild.discordGuild?.channels.cache.get(this.channelId);
  }

  /**
   * Get raw data for storage
   */
  get data(): ChannelData {
    return {
      channelId: this.channelId,
      voiceTime: this.voiceTime,
      sessions: this.sessions,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Add time to this channel
   */
  async addTime(amount: number): Promise<void> {
    this.voiceTime += amount;
    this.lastActivity = new Date();
    
    await this.user.save();
    
    this.emit('channelTimeAdd', this, amount);
  }

  /**
   * Increment session count
   */
  async incrementSessions(): Promise<void> {
    this.sessions++;
    this.lastActivity = new Date();
    
    // Also increment user's total sessions
    this.user.totalSessions++;
    await this.user.save();
    
    this.emit('channelSessionIncrement', this);
  }

  /**
   * Reset channel data
   */
  async reset(): Promise<void> {
    this.voiceTime = 0;
    this.sessions = 0;
    
    await this.user.save();
    
    this.emit('channelReset', this);
  }

  /**
   * Delete this channel from user's data
   */
  async delete(): Promise<void> {
    this.user.channels.delete(this.channelId);
    await this.user.save();
    
    this.emit('channelDelete', this);
  }
}