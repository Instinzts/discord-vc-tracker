import Database from 'better-sqlite3';
import {
  StorageAdapter,
  GuildData,
  UserData,
  SessionData,
  LeaderboardEntry,
  GuildConfig,
} from '../types';

/**
 * SQLite storage adapter with better-sqlite3
 * 
 * Features:
 * - Zero configuration - no server needed
 * - Extremely fast in-process database
 * - ACID compliance with transactions
 * - Single file database
 * - Perfect for development and small-medium bots
 * - Synchronous API (no async overhead)
 * - Automatic backups support
 * 
 * Best for:
 * - Development environments
 * - Small to medium bots (<10k users)
 * - Single instance deployments
 * - Quick prototyping
 * 
 * NOT suitable for:
 * - Multi-instance bot deployments
 * - Horizontal scaling
 * - High concurrency (>1000 req/s)
 * 
 * @example
 * ```typescript
 * const storage = new SQLiteStorage({
 *   filename: './data/voice-tracker.db',
 *   // Optional
 *   readonly: false,
 *   fileMustExist: false,
 *   timeout: 5000,
 *   verbose: console.log,
 * });
 * ```
 */
export class SQLiteStorage implements StorageAdapter {
  private db: Database.Database;
  private config: {
    filename: string;
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (...args: any[]) => void;
  };

  // Prepared statements (cached for performance)
  private statements: {
    getGuild?: Database.Statement;
    insertGuild?: Database.Statement;
    updateGuild?: Database.Statement;
    deleteGuild?: Database.Statement;
    getUser?: Database.Statement;
    insertUser?: Database.Statement;
    updateUser?: Database.Statement;
    deleteUser?: Database.Statement;
    getUsersByGuild?: Database.Statement;
    getAllGuilds?: Database.Statement;
    getLeaderboard?: Database.Statement;
    insertSession?: Database.Statement;
    getSessions?: Database.Statement;
  } = {};

  constructor(config: {
    filename?: string;
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (...args: any[]) => void;
  } = {}) {
    this.config = {
      filename: config.filename || './data/voice-tracker.db',
      readonly: config.readonly || false,
      fileMustExist: config.fileMustExist || false,
      timeout: config.timeout || 5000,
      verbose: config.verbose,
    };

    // Ensure directory exists
    const dir = this.config.filename.substring(
      0,
      this.config.filename.lastIndexOf('/')
    );
    if (dir) {
      const fs = require('fs');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(this.config.filename, {
      readonly: this.config.readonly,
      fileMustExist: this.config.fileMustExist,
      timeout: this.config.timeout,
      verbose: this.config.verbose,
    });

    console.log(`[SQLiteStorage] Database opened: ${this.config.filename}`);
  }

  /**
   * Initialize SQLite database and create schema
   */
  async init(): Promise<void> {
    try {
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Optimize for performance
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache
      this.db.pragma('temp_store = MEMORY');

      // Create schema
      this.createSchema();

      // Prepare statements
      this.prepareStatements();

      console.log('[SQLiteStorage] Initialized successfully');
    } catch (error) {
      console.error('[SQLiteStorage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    // Guilds table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        guild_id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        last_updated INTEGER NOT NULL,
        extra_data TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        total_voice_time INTEGER NOT NULL DEFAULT 0,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        channels TEXT NOT NULL DEFAULT '[]',
        last_seen INTEGER NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0,
        total_sessions INTEGER NOT NULL DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        xp_earned INTEGER NOT NULL DEFAULT 0,
        was_muted INTEGER NOT NULL DEFAULT 0,
        was_deafened INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_guild_xp 
      ON users (guild_id, xp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_users_guild_level 
      ON users (guild_id, level DESC, xp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_users_guild_voice_time 
      ON users (guild_id, total_voice_time DESC);
      
      CREATE INDEX IF NOT EXISTS idx_users_last_seen 
      ON users (last_seen);
      
      CREATE INDEX IF NOT EXISTS idx_sessions_guild_user 
      ON sessions (guild_id, user_id, start_time DESC);
      
      CREATE INDEX IF NOT EXISTS idx_sessions_start_time 
      ON sessions (start_time DESC);
    `);

    console.log('[SQLiteStorage] Schema created successfully');
  }

  /**
   * Prepare SQL statements for better performance
   */
  private prepareStatements(): void {
    // Guild statements
    this.statements.getGuild = this.db.prepare(
      'SELECT * FROM guilds WHERE guild_id = ?'
    );

    this.statements.insertGuild = this.db.prepare(
      `INSERT OR REPLACE INTO guilds (guild_id, config, last_updated, extra_data)
       VALUES (?, ?, ?, ?)`
    );

    this.statements.deleteGuild = this.db.prepare(
      'DELETE FROM guilds WHERE guild_id = ?'
    );

    // User statements
    this.statements.getUser = this.db.prepare(
      'SELECT * FROM users WHERE guild_id = ? AND user_id = ?'
    );

    this.statements.insertUser = this.db.prepare(
      `INSERT OR REPLACE INTO users (
        user_id, guild_id, total_voice_time, xp, level,
        channels, last_seen, streak, total_sessions, metadata, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`
    );

    this.statements.deleteUser = this.db.prepare(
      'DELETE FROM users WHERE guild_id = ? AND user_id = ?'
    );

    this.statements.getUsersByGuild = this.db.prepare(
      'SELECT * FROM users WHERE guild_id = ?'
    );

    this.statements.getAllGuilds = this.db.prepare('SELECT * FROM guilds');

    // Session statements
    this.statements.insertSession = this.db.prepare(
      `INSERT INTO sessions (
        session_id, user_id, guild_id, channel_id,
        start_time, end_time, duration, xp_earned,
        was_muted, was_deafened
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    this.statements.getSessions = this.db.prepare(
      `SELECT * FROM sessions
       WHERE guild_id = ? AND user_id = ?
       ORDER BY start_time DESC
       LIMIT ?`
    );
  }

  /**
   * Get guild data
   */
  async getGuild(guildId: string): Promise<GuildData | null> {
    try {
      const guildRow = this.statements.getGuild!.get(guildId) as any;

      if (!guildRow) {
        return null;
      }

      const userRows = this.statements.getUsersByGuild!.all(guildId) as any[];
      const userMap = new Map<string, UserData>();

      for (const userRow of userRows) {
        userMap.set(userRow.user_id, this.rowToUserData(userRow));
      }

      return {
        guildId: guildRow.guild_id,
        config: JSON.parse(guildRow.config) as GuildConfig,
        users: userMap,
        lastUpdated: new Date(guildRow.last_updated * 1000),
        extraData: JSON.parse(guildRow.extra_data || '{}'),
      };
    } catch (error) {
      console.error('[SQLiteStorage] Error getting guild:', error);
      return null;
    }
  }

  /**
   * Save guild data
   */
  async saveGuild(guildData: GuildData): Promise<void> {
    const saveTransaction = this.db.transaction(() => {
      // Save guild config
      this.statements.insertGuild!.run(
        guildData.guildId,
        JSON.stringify(guildData.config),
        Math.floor(guildData.lastUpdated.getTime() / 1000),
        JSON.stringify(guildData.extraData || {})
      );

      // Save all users
      for (const [, userData] of guildData.users) {
        this.saveUserInternal(guildData.guildId, userData);
      }
    });

    try {
      saveTransaction();
    } catch (error) {
      console.error('[SQLiteStorage] Error saving guild:', error);
      throw error;
    }
  }

  /**
   * Delete guild and all associated data
   */
  async deleteGuild(guildId: string): Promise<void> {
    try {
      // CASCADE will handle users and sessions
      this.statements.deleteGuild!.run(guildId);
      console.log(`[SQLiteStorage] Deleted guild: ${guildId}`);
    } catch (error) {
      console.error('[SQLiteStorage] Error deleting guild:', error);
      throw error;
    }
  }

  /**
   * Get user data
   */
  async getUser(guildId: string, userId: string): Promise<UserData | null> {
    try {
      const userRow = this.statements.getUser!.get(guildId, userId) as any;

      if (!userRow) {
        return null;
      }

      return this.rowToUserData(userRow);
    } catch (error) {
      console.error('[SQLiteStorage] Error getting user:', error);
      return null;
    }
  }

  /**
   * Save user data
   */
  async saveUser(guildId: string, userData: UserData): Promise<void> {
    try {
      this.saveUserInternal(guildId, userData);
    } catch (error) {
      console.error('[SQLiteStorage] Error saving user:', error);
      throw error;
    }
  }

  /**
   * Internal method to save user (for use within transactions)
   */
  private saveUserInternal(guildId: string, userData: UserData): void {
    this.statements.insertUser!.run(
      userData.userId,
      guildId,
      userData.totalVoiceTime,
      userData.xp,
      userData.level,
      JSON.stringify(userData.channels),
      Math.floor(userData.lastSeen.getTime() / 1000),
      userData.streak,
      userData.totalSessions,
      JSON.stringify(userData.metadata || {})
    );
  }

  /**
   * Delete user data
   */
  async deleteUser(guildId: string, userId: string): Promise<void> {
    try {
      this.statements.deleteUser!.run(guildId, userId);
      console.log(`[SQLiteStorage] Deleted user: ${userId} from guild: ${guildId}`);
    } catch (error) {
      console.error('[SQLiteStorage] Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Get all guilds
   */
  async getAllGuilds(): Promise<GuildData[]> {
    try {
      const guildRows = this.statements.getAllGuilds!.all() as any[];
      const guilds: GuildData[] = [];

      for (const guildRow of guildRows) {
        const userRows = this.statements.getUsersByGuild!.all(
          guildRow.guild_id
        ) as any[];
        const userMap = new Map<string, UserData>();

        for (const userRow of userRows) {
          userMap.set(userRow.user_id, this.rowToUserData(userRow));
        }

        guilds.push({
          guildId: guildRow.guild_id,
          config: JSON.parse(guildRow.config) as GuildConfig,
          users: userMap,
          lastUpdated: new Date(guildRow.last_updated * 1000),
          extraData: JSON.parse(guildRow.extra_data || '{}'),
        });
      }

      return guilds;
    } catch (error) {
      console.error('[SQLiteStorage] Error getting all guilds:', error);
      return [];
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]> {
    try {
      const sortField =
        sortBy === 'voiceTime' ? 'total_voice_time' : sortBy;
      const secondarySort = sortBy === 'level' ? ', xp DESC' : ', xp DESC';

      const query = `
        SELECT 
          user_id,
          guild_id,
          total_voice_time as voice_time,
          xp,
          level,
          ROW_NUMBER() OVER (ORDER BY ${sortField} DESC${secondarySort}) as rank
        FROM users
        WHERE guild_id = ?
        ORDER BY ${sortField} DESC${secondarySort}
        LIMIT ? OFFSET ?
      `;

      const stmt = this.db.prepare(query);
      const rows = stmt.all(guildId, limit, offset) as any[];

      return rows.map((row) => ({
        userId: row.user_id,
        guildId: row.guild_id,
        voiceTime: row.voice_time,
        xp: row.xp,
        level: row.level,
        rank: row.rank,
      }));
    } catch (error) {
      console.error('[SQLiteStorage] Error getting leaderboard:', error);
      return [];
    }
  }

  /**
   * Save session
   */
  async saveSession(session: SessionData): Promise<void> {
    try {
      this.statements.insertSession!.run(
        session.sessionId,
        session.userId,
        session.guildId,
        session.channelId,
        Math.floor(session.startTime.getTime() / 1000),
        session.endTime ? Math.floor(session.endTime.getTime() / 1000) : null,
        session.duration || null,
        session.xpEarned,
        session.wasMuted ? 1 : 0,
        session.wasDeafened ? 1 : 0
      );
    } catch (error) {
      console.error('[SQLiteStorage] Error saving session:', error);
    }
  }

  /**
   * Get user sessions
   */
  async getSessions(
    guildId: string,
    userId: string,
    limit: number = 50
  ): Promise<SessionData[]> {
    try {
      const rows = this.statements.getSessions!.all(
        guildId,
        userId,
        limit
      ) as any[];

      return rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        startTime: new Date(row.start_time * 1000),
        endTime: row.end_time ? new Date(row.end_time * 1000) : undefined,
        duration: row.duration || undefined,
        xpEarned: row.xp_earned,
        wasMuted: row.was_muted === 1,
        wasDeafened: row.was_deafened === 1,
      }));
    } catch (error) {
      console.error('[SQLiteStorage] Error getting sessions:', error);
      return [];
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      this.db.close();
      console.log('[SQLiteStorage] Database closed');
    } catch (error) {
      console.error('[SQLiteStorage] Error closing database:', error);
      throw error;
    }
  }

  /**
   * Convert database row to UserData
   */
  private rowToUserData(row: any): UserData {
    return {
      userId: row.user_id,
      guildId: row.guild_id,
      totalVoiceTime: row.total_voice_time,
      xp: row.xp,
      level: row.level,
      channels: JSON.parse(row.channels || '[]'),
      lastSeen: new Date(row.last_seen * 1000),
      streak: row.streak,
      totalSessions: row.total_sessions,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  /**
   * Create a backup of the database
   */
  async backup(backupPath: string): Promise<void> {
    try {
      await this.db.backup(backupPath);
      console.log(`[SQLiteStorage] Backup created: ${backupPath}`);
    } catch (error) {
      console.error('[SQLiteStorage] Error creating backup:', error);
      throw error;
    }
  }

  /**
   * Optimize database (VACUUM)
   */
  async optimize(): Promise<void> {
    try {
      this.db.exec('VACUUM');
      console.log('[SQLiteStorage] Database optimized');
    } catch (error) {
      console.error('[SQLiteStorage] Error optimizing database:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    try {
      const stats = this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM guilds) as guilds,
          (SELECT COUNT(*) FROM users) as users,
          (SELECT COUNT(*) FROM sessions) as sessions,
          (SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()) as database_size
      `).get() as any;

      return {
        guilds: stats.guilds,
        users: stats.users,
        sessions: stats.sessions,
        databaseSize: stats.database_size,
        filename: this.config.filename,
      };
    } catch (error) {
      console.error('[SQLiteStorage] Error getting stats:', error);
      return null;
    }
  }


/**
 * Verify database integrity
 */
async verifyIntegrity(): Promise<boolean> {
  try {
    // SQLite PRAGMA integrity_check
    const result = this.db.prepare('PRAGMA integrity_check').get() as any;
    
    if (result.integrity_check === 'ok') {
      console.log('[SQLiteStorage] ✅ Database integrity check PASSED');
      return true;
    } else {
      console.error('[SQLiteStorage] ❌ Database integrity check FAILED:', result);
      return false;
    }
  } catch (error) {
    console.error('[SQLiteStorage] ❌ Integrity check error:', error);
    return false;
  }
}

/**
 * Create a backup with integrity verification
 * This prevents corrupted databases from being backed up
 */
async safeBackup(backupPath: string): Promise<boolean> {
  try {
    // STEP 1: Check if current database is healthy
    const isHealthy = await this.verifyIntegrity();
    
    if (!isHealthy) {
      console.error('[SQLiteStorage] ❌ BACKUP ABORTED: Database is corrupted!');
      console.error('[SQLiteStorage] ⚠️  DO NOT OVERWRITE GOOD BACKUPS WITH CORRUPTED DATA');
      return false;
    }
    
    // STEP 2: Checkpoint WAL to consolidate all changes into main DB
    console.log('[SQLiteStorage] 🔄 Checkpointing WAL...');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    
    // STEP 3: Create backup (only if database is healthy)
    console.log('[SQLiteStorage] ✅ Database is healthy, creating backup...');
    await this.db.backup(backupPath);
    console.log(`[SQLiteStorage] ✅ Safe backup created: ${backupPath}`);
    
    // STEP 4: Verify the backup itself
    const Database = require('better-sqlite3');
    const backupDb = new Database(backupPath, { readonly: true });
    const backupCheck = backupDb.prepare('PRAGMA integrity_check').get() as any;
    backupDb.close();
    
    if (backupCheck.integrity_check === 'ok') {
      console.log('[SQLiteStorage] ✅ Backup integrity verified');
      
      // STEP 5: Clean up WAL/SHM files for the backup (they're not needed)
      this.cleanupBackupWalFiles(backupPath);
      
      return true;
    } else {
      console.error('[SQLiteStorage] ❌ Backup verification failed!');
      // Delete the bad backup and its WAL files
      this.deleteBackupFiles(backupPath);
      return false;
    }
    
  } catch (error) {
    console.error('[SQLiteStorage] ❌ Safe backup failed:', error);
    // Clean up any partial backup files
    try {
      this.deleteBackupFiles(backupPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Clean up WAL and SHM files for a backup
 */
private cleanupBackupWalFiles(backupPath: string): void {
  try {
    const fs = require('fs');
    const walPath = `${backupPath}-wal`;
    const shmPath = `${backupPath}-shm`;
    
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
      console.log('[SQLiteStorage] 🗑️  Cleaned up WAL file');
    }
    
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
      console.log('[SQLiteStorage] 🗑️  Cleaned up SHM file');
    }
  } catch (error) {
    console.error('[SQLiteStorage] ⚠️  Failed to clean up WAL files:', error);
  }
}

/**
 * Delete backup files (including WAL and SHM)
 */
private deleteBackupFiles(backupPath: string): void {
  const fs = require('fs');
  
  try {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    
    const walPath = `${backupPath}-wal`;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    
    const shmPath = `${backupPath}-shm`;
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
    
    console.log('[SQLiteStorage] 🗑️  Deleted failed backup files');
  } catch (error) {
    console.error('[SQLiteStorage] ⚠️  Failed to delete backup files:', error);
  }
}

/**
 * Restore database from backup
 * WARNING: This will close the database, replace it, and reinitialize
 */
async restore(backupPath: string): Promise<void> {
  try {
    console.log(`[SQLiteStorage] Restoring from: ${backupPath}`);
    
    // Verify the backup is healthy before restoring
    const Database = require('better-sqlite3');
    const backupDb = new Database(backupPath, { readonly: true });
    const backupCheck = backupDb.prepare('PRAGMA integrity_check').get() as any;
    backupDb.close();
    
    if (backupCheck.integrity_check !== 'ok') {
      throw new Error('Backup file is corrupted! Cannot restore.');
    }
    
    console.log('[SQLiteStorage] ✅ Backup file verified');
    
    // Checkpoint current database before closing
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      console.warn('[SQLiteStorage] ⚠️  Could not checkpoint before restore:', error);
    }
    
    // Close current database
    this.db.close();
    
    // Copy backup to main database location
    const fs = require('fs');
    fs.copyFileSync(backupPath, this.config.filename);
    
    // Clean up any existing WAL/SHM files from the old database
    const walPath = `${this.config.filename}-wal`;
    const shmPath = `${this.config.filename}-shm`;
    
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
    
    // Reopen database
    this.db = new Database(this.config.filename, {
      readonly: this.config.readonly,
      fileMustExist: false,
      timeout: this.config.timeout,
      verbose: this.config.verbose,
    });
    
    // Reinitialize
    await this.init();
    
    console.log(`[SQLiteStorage] ✅ Restore complete: ${backupPath}`);
  } catch (error) {
    console.error('[SQLiteStorage] ❌ Restore failed:', error);
    throw error;
  }
}

}