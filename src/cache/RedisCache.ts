import { CacheAdapter, CacheConfig, CacheStats } from '../types';
import { createClient, RedisClientType } from 'redis';

/**
 * Redis cache adapter with persistence and multi-instance support
 * 
 * Features:
 * - Persistent cache storage (survives restarts)
 * - Multi-instance support (shared cache between bot instances)
 * - Automatic connection handling
 * - Comprehensive error handling
 * - TTL-based expiration
 * - Batch operations
 * 
 * @example
 * ```typescript
 * const cache = new RedisCache({
 *   url: 'redis://localhost:6379',
 *   ttl: 300000,        // 5 minutes
 *   keyPrefix: 'voice:' // Optional namespace
 * });
 * ```
 */
export class RedisCache implements CacheAdapter {
  private client: RedisClientType;
  private config: Required<CacheConfig> & { url?: string; keyPrefix?: string };
  private stats: CacheStats;
  private connected: boolean;
  private connecting: Promise<void> | null;

  constructor(config: CacheConfig & { url?: string; keyPrefix?: string } = {}) {
    this.config = {
      ttl: config.ttl || 300000,       // 5 minutes default
      maxSize: config.maxSize || 0,    // Unlimited for Redis
      enableStats: config.enableStats !== false,
      url: config.url || 'redis://localhost:6379',
      keyPrefix: config.keyPrefix || 'dvt:',  // discord-vc-tracker prefix
    };

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      hitRate: 0,
    };

    this.connected = false;
    this.connecting = null;

    // Create Redis client
    this.client = createClient({
      url: this.config.url,
      socket: {
        reconnectStrategy: (retries) => {
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 3000ms
          const delay = Math.min(100 * Math.pow(2, retries), 3000);
          console.log(`[RedisCache] Reconnecting in ${delay}ms (attempt ${retries + 1})`);
          return delay;
        },
      },
    });

    // Setup error handlers
    this.client.on('error', (error) => {
      console.error('[RedisCache] Error:', error.message);
    });

    this.client.on('connect', () => {
      console.log('[RedisCache] Connected to Redis');
    });

    this.client.on('reconnecting', () => {
      console.log('[RedisCache] Reconnecting to Redis...');
    });

    this.client.on('ready', () => {
      console.log('[RedisCache] Redis client ready');
      this.connected = true;
    });
  }

  /**
   * Initialize Redis connection
   */
  async init(): Promise<void> {
    // Prevent multiple simultaneous connection attempts
    if (this.connecting) {
      await this.connecting;
      return;
    }

    if (this.connected) {
      return;
    }

    this.connecting = (async () => {
      try {
        await this.client.connect();
        this.connected = true;
        console.log('[RedisCache] Initialized successfully');
      } catch (error) {
        this.connected = false;
        console.error('[RedisCache] Failed to initialize:', error);
        throw error;
      } finally {
        this.connecting = null;
      }
    })();

    await this.connecting;
  }

  /**
   * Ensure connection is ready
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.init();
    }
  }

  /**
   * Generate full cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      await this.ensureConnected();

      const fullKey = this.getKey(key);
      const value = await this.client.get(fullKey);

      if (!value) {
        if (this.config.enableStats) {
          this.stats.misses++;
          this.updateHitRate();
        }
        return null;
      }

      if (this.config.enableStats) {
        this.stats.hits++;
        this.updateHitRate();
      }

      // Parse JSON
      try {
        return JSON.parse(value) as T;
      } catch {
        // If not JSON, return as-is
        return value as T;
      }
    } catch (error) {
      console.error('[RedisCache] Get error:', error);
      
      if (this.config.enableStats) {
        this.stats.misses++;
        this.updateHitRate();
      }
      
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.ensureConnected();

      const fullKey = this.getKey(key);
      const ttlSeconds = Math.floor((ttl || this.config.ttl) / 1000);
      
      // Serialize value
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      // Set with expiration
      await this.client.setEx(fullKey, ttlSeconds, serialized);

      if (this.config.enableStats) {
        this.stats.sets++;
      }
    } catch (error) {
      console.error('[RedisCache] Set error:', error);
      // Don't throw - cache failures shouldn't break the bot
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.ensureConnected();

      const fullKey = this.getKey(key);
      await this.client.del(fullKey);

      if (this.config.enableStats) {
        this.stats.deletes++;
      }
    } catch (error) {
      console.error('[RedisCache] Delete error:', error);
    }
  }


  /**
 * Clear all keys with prefix (automatic TTL-based expiration preferred)
 * Manual clearing disabled - Redis handles expiration automatically
 */
async clear(): Promise<void> {
  console.log('[RedisCache] Manual clear disabled - cache uses automatic TTL-based expiration');
  console.log(`[RedisCache] Keys expire automatically after ${this.config.ttl / 1000} seconds`);
  
  // Reset stats only
  if (this.config.enableStats) {
    this.stats.size = 0;
  }
}

  // /**
  //  * Clear all keys with prefix
  //  */
  // async clear(): Promise<void> {
  //   try {
  //     await this.ensureConnected();

  //     // Use SCAN to find all keys with our prefix
  //     const pattern = `${this.config.keyPrefix}*`;
  //     const keys: string[] = [];

  //     // Explicitly type the key to avoid TypeScript inference issues
  //     for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 }) as AsyncIterable<string>) {
  //       keys.push(key);
  //     }

  //     if (keys.length > 0) {
  //       // Use UNLINK for async deletion (faster and non-blocking)
  //       await this.client.unlink(keys);
        
  //       if (this.config.enableStats) {
  //         this.stats.deletes += keys.length;
  //       }
  //     }

  //     if (this.config.enableStats) {
  //       this.stats.size = 0;
  //     }
  //   } catch (error) {
  //     console.error('[RedisCache] Clear error:', error);
  //   }
  // }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      await this.ensureConnected();

      const fullKey = this.getKey(key);
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error) {
      console.error('[RedisCache] Has error:', error);
      return false;
    }
  }

  /**
   * Get multiple keys at once (batch operation)
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      await this.ensureConnected();

      const fullKeys = keys.map(k => this.getKey(k));
      const values = await this.client.mGet(fullKeys);

      return values.map(value => {
        if (!value) return null;
        
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      console.error('[RedisCache] MGet error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once (batch operation)
   */
  async mset<T>(entries: Array<[string, T]>, ttl?: number): Promise<void> {
    try {
      await this.ensureConnected();

      // Use pipeline for batch operations
      const pipeline = this.client.multi();
      const ttlSeconds = Math.floor((ttl || this.config.ttl) / 1000);

      for (const [key, value] of entries) {
        const fullKey = this.getKey(key);
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.setEx(fullKey, ttlSeconds, serialized);
      }

      await pipeline.exec();

      if (this.config.enableStats) {
        this.stats.sets += entries.length;
      }
    } catch (error) {
      console.error('[RedisCache] MSet error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      if (this.config.enableStats) {
        // Update size from Redis
        await this.updateSize();
      }
    } catch (error) {
      console.error('[RedisCache] GetStats error:', error);
    }

    return { ...this.stats };
  }

  /**
   * Update cache size from Redis
   */
  private async updateSize(): Promise<void> {
    try {
      await this.ensureConnected();

      // Count keys with our prefix
      const pattern = `${this.config.keyPrefix}*`;
      let count = 0;

      // Explicitly type the iterator to avoid TypeScript issues
      for await (const _ of this.client.scanIterator({ MATCH: pattern, COUNT: 100 }) as AsyncIterable<string>) {
        count++;
      }

      this.stats.size = count;
    } catch (error) {
      console.error('[RedisCache] UpdateSize error:', error);
    }
  }

  /**
   * Update hit rate percentage
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      if (this.connected) {
        await this.client.quit();
        this.connected = false;
        console.log('[RedisCache] Connection closed');
      }
    } catch (error) {
      console.error('[RedisCache] Close error:', error);
      // Force disconnect
      await this.client.disconnect();
      this.connected = false;
    }
  }

  /**
   * Get Redis client for advanced operations (use with caution)
   */
  getClient(): RedisClientType {
    return this.client;
  }
}