import { CacheAdapter, CacheConfig, CacheStats } from '../types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory cache with LRU eviction
 * No external dependencies - uses native JavaScript Map
 */
export class MemoryCache implements CacheAdapter {
  private cache: Map<string, CacheEntry<any>>;
  private accessOrder: Map<string, number>;
  private config: CacheConfig;
  private stats: CacheStats;
  private accessCounter: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig = {}) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.config = {
      ttl: config.ttl || 300000, // 5 minutes default
      maxSize: config.maxSize || 1000,
      enableStats: config.enableStats !== false,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      hitRate: 0,
    };
    this.accessCounter = 0;
  }

  async init(): Promise<void> {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.misses++;
        this.updateHitRate();
      }
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
        this.stats.size = this.cache.size;
        this.updateHitRate();
      }
      return null;
    }

    // Update access order (for LRU)
    this.accessOrder.set(key, this.accessCounter++);

    if (this.config.enableStats) {
      this.stats.hits++;
      this.updateHitRate();
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = Date.now() + (ttl || this.config.ttl!);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.config.maxSize! && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, { value, expiresAt });
    this.accessOrder.set(key, this.accessCounter++);

    if (this.config.enableStats) {
      this.stats.sets++;
      this.stats.size = this.cache.size;
    }
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.accessOrder.delete(key);

    if (this.config.enableStats) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;

    if (this.config.enableStats) {
      this.stats.size = 0;
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  async mset<T>(entries: Array<[string, T]>, ttl?: number): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, ttl);
    }
  }

  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, access] of this.accessOrder) {
      if (access < oldestAccess) {
        oldestAccess = access;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    if (this.config.enableStats) {
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Update hit rate percentage
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}