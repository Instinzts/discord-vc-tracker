import { CacheAdapter, GuildData, UserData } from '../types';

/**
 * Cache manager with automatic key generation
 * Wraps any CacheAdapter and provides convenience methods
 */
export class CacheManager {
  private cache: CacheAdapter;
  private enabled: boolean;

  constructor(cache?: CacheAdapter) {
    this.cache = cache || null as any;
    this.enabled = !!cache;
  }

  async init(): Promise<void> {
    if (this.enabled && this.cache) {
      await this.cache.init();
    }
  }

  /**
   * Generate cache key for guild
   */
  private getGuildKey(guildId: string): string {
    return `guild:${guildId}`;
  }

  /**
   * Generate cache key for user
   */
  private getUserKey(guildId: string, userId: string): string {
    return `user:${guildId}:${userId}`;
  }

  /**
   * Generate cache key for leaderboard
   */
  private getLeaderboardKey(
    guildId: string,
    sortBy: string,
    limit: number,
    offset: number
  ): string {
    return `leaderboard:${guildId}:${sortBy}:${limit}:${offset}`;
  }

  /**
   * Get cached guild (with Map deserialization)
   */
  async getGuild(guildId: string): Promise<GuildData | null> {
    if (!this.enabled) return null;

    try {
      const data = await this.cache.get<any>(this.getGuildKey(guildId));
      if (!data) return null;

      // Convert users object back to Map
      const users = new Map<string, UserData>();
      if (data.users && typeof data.users === 'object') {
        for (const [userId, userData] of Object.entries(data.users)) {
          users.set(userId, userData as UserData);
        }
      }

      return {
        ...data,
        users,
        lastUpdated: new Date(data.lastUpdated),
      };
    } catch (error) {
      console.error('Cache getGuild error:', error);
      return null;
    }
  }

  /**
   * Cache guild (with Map serialization)
   */
  async setGuild(guildData: GuildData, ttl?: number): Promise<void> {
    if (!this.enabled) return;

    try {
      // Convert Map to plain object for serialization
      const users: Record<string, UserData> = {};
      for (const [userId, userData] of guildData.users) {
        users[userId] = userData;
      }

      const cacheData = {
        ...guildData,
        users,
      };

      await this.cache.set(this.getGuildKey(guildData.guildId), cacheData, ttl);
    } catch (error) {
      console.error('Cache setGuild error:', error);
    }
  }

  /**
   * Invalidate guild cache
   */
  async invalidateGuild(guildId: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.cache.delete(this.getGuildKey(guildId));
    } catch (error) {
      console.error('Cache invalidateGuild error:', error);
    }
  }

  /**
   * Get cached user
   */
  async getUser(guildId: string, userId: string): Promise<UserData | null> {
    if (!this.enabled) return null;

    try {
      const data = await this.cache.get<UserData>(this.getUserKey(guildId, userId));
      
      if (!data) return null;

      return {
        ...data,
        lastSeen: new Date(data.lastSeen),
      };
    } catch (error) {
      console.error('Cache getUser error:', error);
      return null;
    }
  }

  /**
   * Cache user
   */
  async setUser(userData: UserData, ttl?: number): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.cache.set(
        this.getUserKey(userData.guildId, userData.userId),
        userData,
        ttl
      );
    } catch (error) {
      console.error('Cache setUser error:', error);
    }
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(guildId: string, userId: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.cache.delete(this.getUserKey(guildId, userId));
    } catch (error) {
      console.error('Cache invalidateUser error:', error);
    }
  }

  /**
   * Get cached leaderboard
   */
  async getLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number
  ): Promise<any[] | null> {
    if (!this.enabled) return null;

    try {
      return await this.cache.get(
        this.getLeaderboardKey(guildId, sortBy, limit, offset)
      );
    } catch (error) {
      console.error('Cache getLeaderboard error:', error);
      return null;
    }
  }

  /**
   * Cache leaderboard
   */
  async setLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number,
    data: any[],
    ttl?: number
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.cache.set(
        this.getLeaderboardKey(guildId, sortBy, limit, offset),
        data,
        ttl || 60000 // 1 minute default for leaderboards
      );
    } catch (error) {
      console.error('Cache setLeaderboard error:', error);
    }
  }

  /**
   * Invalidate all leaderboards for a guild
   */
  async invalidateLeaderboards(guildId: string): Promise<void> {
    if (!this.enabled) return;

    // Delete common leaderboard permutations
    const sortBys = ['voiceTime', 'xp', 'level'];
    const limits = [10, 25, 50, 100];
    const offsets = [0];

    for (const sortBy of sortBys) {
      for (const limit of limits) {
        for (const offset of offsets) {
          try {
            await this.cache.delete(
              this.getLeaderboardKey(guildId, sortBy, limit, offset)
            );
          } catch {
            // Ignore errors
          }
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled || !this.cache.getStats) {
      return null;
    }

    return await this.cache.getStats();
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (!this.enabled) return;
    await this.cache.clear();
  }

  /**
   * Close cache connection
   */
  async close(): Promise<void> {
    if (!this.enabled) return;
    await this.cache.close();
  }
}