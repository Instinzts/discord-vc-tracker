import { promises as fs } from 'fs';
import { join } from 'path';
import {
  StorageAdapter,
  GuildData,
  UserData,
  SessionData,
  LeaderboardEntry,
} from '../types';

/**
 * JSON file-based storage adapter
 */
export class JSONStorage implements StorageAdapter {
  private dataDir: string;
  private guildsFile: string;
  private sessionsFile: string;
  private cache: Map<string, GuildData>;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.guildsFile = join(dataDir, 'guilds.json');
    this.sessionsFile = join(dataDir, 'sessions.json');
    this.cache = new Map();
  }

  async init(): Promise<void> {
    // Create data directory if it doesn't exist
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch {
      // Directory already exists
    }

    // Initialize files
    await this.ensureFile(this.guildsFile, '{}');
    await this.ensureFile(this.sessionsFile, '[]');

    // Load data into cache
    await this.loadCache();
  }

  private async ensureFile(path: string, defaultContent: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.writeFile(path, defaultContent, 'utf-8');
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.guildsFile, 'utf-8');
      const guilds = JSON.parse(data, this.dateReviver);
      
      for (const [guildId, guildData] of Object.entries(guilds)) {
        this.cache.set(guildId, this.deserializeGuild(guildData as any));
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
  }

  private async saveCache(): Promise<void> {
    const guilds: Record<string, any> = {};
    
    for (const [guildId, guildData] of this.cache) {
      guilds[guildId] = this.serializeGuild(guildData);
    }

    await fs.writeFile(
      this.guildsFile,
      JSON.stringify(guilds, null, 2),
      'utf-8'
    );
  }

  private dateReviver(_key: string, value: any): any {
    if (typeof value === 'string') {
      const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      if (datePattern.test(value)) {
        return new Date(value);
      }
    }
    return value;
  }

  private serializeGuild(guildData: GuildData): any {
    return {
      guildId: guildData.guildId,
      config: guildData.config,
      users: Array.from(guildData.users.values()),
      lastUpdated: guildData.lastUpdated,
      extraData: guildData.extraData || {}, // Add extraData
    };
  }

  private deserializeGuild(data: any): GuildData {
    const users = new Map<string, UserData>();
    
    if (Array.isArray(data.users)) {
      for (const user of data.users) {
        users.set(user.userId, user);
      }
    }

    return {
      guildId: data.guildId,
      config: data.config,
      users,
      lastUpdated: new Date(data.lastUpdated),
      extraData: data.extraData || {}, // Add extraData
    };
  }

  async getGuild(guildId: string): Promise<GuildData | null> {
    return this.cache.get(guildId) || null;
  }

  async saveGuild(guildData: GuildData): Promise<void> {
    this.cache.set(guildData.guildId, guildData);
    await this.saveCache();
  }

  async deleteGuild(guildId: string): Promise<void> {
    this.cache.delete(guildId);
    await this.saveCache();
  }

  async getUser(guildId: string, userId: string): Promise<UserData | null> {
    const guild = this.cache.get(guildId);
    if (!guild) return null;
    
    return guild.users.get(userId) || null;
  }

  async saveUser(guildId: string, userData: UserData): Promise<void> {
    let guild = this.cache.get(guildId);
    
    if (!guild) {
      // Create guild if it doesn't exist
      guild = {
        guildId,
        config: {} as any, // Will be set properly when config is saved
        users: new Map(),
        lastUpdated: new Date(),
        extraData: {}, // Add extraData
      };
      this.cache.set(guildId, guild);
    }

    guild.users.set(userData.userId, userData);
    guild.lastUpdated = new Date();
    
    await this.saveCache();
  }

  async deleteUser(guildId: string, userId: string): Promise<void> {
    const guild = this.cache.get(guildId);
    if (guild) {
      guild.users.delete(userId);
      guild.lastUpdated = new Date();
      await this.saveCache();
    }
  }

  async getAllGuilds(): Promise<GuildData[]> {
    return Array.from(this.cache.values());
  }

  async getLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]> {
    const guild = this.cache.get(guildId);
    if (!guild) return [];

    const users = Array.from(guild.users.values());

    // Sort users
    users.sort((a, b) => {
      switch (sortBy) {
        case 'voiceTime':
          return b.totalVoiceTime - a.totalVoiceTime;
        case 'xp':
          return b.xp - a.xp;
        case 'level':
          return b.level - a.level || b.xp - a.xp; // Secondary sort by XP
        default:
          return 0;
      }
    });

    // Apply pagination
    const paginated = users.slice(offset, offset + limit);

    // Create leaderboard entries with ranks
    return paginated.map((user, index) => ({
      userId: user.userId,
      guildId: user.guildId,
      voiceTime: user.totalVoiceTime,
      xp: user.xp,
      level: user.level,
      rank: offset + index + 1,
    }));
  }

  async saveSession(session: SessionData): Promise<void> {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf-8');
      const sessions = JSON.parse(data);
      
      sessions.push(session);
      
      // Keep only last 10000 sessions
      if (sessions.length > 10000) {
        sessions.splice(0, sessions.length - 10000);
      }

      await fs.writeFile(
        this.sessionsFile,
        JSON.stringify(sessions, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  async getSessions(
    guildId: string,
    userId: string,
    limit: number = 50
  ): Promise<SessionData[]> {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf-8');
      const sessions: SessionData[] = JSON.parse(data, this.dateReviver);
      
      return sessions
        .filter((s) => s.guildId === guildId && s.userId === userId)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting sessions:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    await this.saveCache();
    this.cache.clear();
  }
}