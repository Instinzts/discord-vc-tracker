import { GuildMember, VoiceBasedChannel, PermissionResolvable } from 'discord.js';

/**
 * Configuration options for the VoiceManager
 */
export interface VoiceManagerOptions {
  /** Storage adapter to use */
  storage: StorageAdapter;
  
  /** Check interval in milliseconds (default: 5000) */
  checkInterval?: number;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Default configuration for new guilds */
  defaultConfig?: Partial<GuildConfig>;
}

/**
 * XP Calculator function type
 */
export type XPCalculator = (
  member: GuildMember,
  config: GuildConfig
) => number | Promise<number>;

/**
 * Voice Time Calculator function type
 */
export type VoiceTimeCalculator = (
  config: GuildConfig
) => number | Promise<number>;

/**
 * Level Multiplier Calculator function type
 */
export type LevelMultiplierCalculator = (
  config: GuildConfig
) => number | Promise<number>;

/**
 * Guild-specific configuration
 */
export interface GuildConfig {
  /** Guild ID */
  guildId: string;
  
  /** Track bots */
  trackBots: boolean;
  
  /** Track all voice channels */
  trackAllChannels: boolean;
  
  /** Specific channel IDs to track (if trackAllChannels is false) */
  channelIds: string[];
  
  /** Track muted users */
  trackMuted: boolean;
  
  /** Track deafened users */
  trackDeafened: boolean;
  
  /** Minimum users in channel to start tracking */
  minUsersToTrack: number;
  
  /** Maximum users in channel to track (0 = unlimited) */
  maxUsersToTrack: number;
  
  /** Permissions that exempt users from tracking */
  exemptPermissions: PermissionResolvable[];
  
  /** XP strategy name (registered with voiceManager.registerXPStrategy) */
  xpStrategy: string;
  
  /** Configuration data for the XP strategy */
  xpConfig?: {
    baseAmount?: number;
    [key: string]: any;
  };
  
  /** Voice time strategy name */
  voiceTimeStrategy: string;
  
  /** Configuration data for voice time strategy */
  voiceTimeConfig?: {
    baseAmount?: number;
    [key: string]: any;
  };
  
  /** Level multiplier strategy name */
  levelMultiplierStrategy: string;
  
  /** Configuration data for level multiplier */
  levelMultiplierConfig?: {
    baseMultiplier?: number;
    [key: string]: any;
  };
  
  /** Enable XP/leveling system */
  enableLeveling: boolean;
  
  /** Enable voice time tracking */
  enableVoiceTime: boolean;
  
  /** Custom channel filter function (runtime only, not serialized) */
  channelFilter?: (channel: VoiceBasedChannel) => boolean | Promise<boolean>;
  
  /** Custom member filter function (runtime only, not serialized) */
  memberFilter?: (member: GuildMember) => boolean | Promise<boolean>;
}

/**
 * User voice data
 */
export interface UserData {
  /** User ID */
  userId: string;
  
  /** Guild ID */
  guildId: string;
  
  /** Total voice time in milliseconds */
  totalVoiceTime: number;
  
  /** Current XP */
  xp: number;
  
  /** Current level */
  level: number;
  
  /** Voice time per channel */
  channels: ChannelData[];
  
  /** Last seen timestamp */
  lastSeen: Date;
  
  /** Current streak (consecutive days) */
  streak: number;
  
  /** Total sessions */
  totalSessions: number;
  
  /** Custom user data */
  metadata?: Record<string, any>;
}

/**
 * Channel-specific voice data
 */
export interface ChannelData {
  /** Channel ID */
  channelId: string;
  
  /** Voice time in this channel (milliseconds) */
  voiceTime: number;
  
  /** Number of sessions in this channel */
  sessions: number;
  
  /** Last activity timestamp */
  lastActivity: Date;
}

/**
 * Voice session data
 */
export interface SessionData {
  /** Session ID */
  sessionId: string;
  
  /** User ID */
  userId: string;
  
  /** Guild ID */
  guildId: string;
  
  /** Channel ID */
  channelId: string;
  
  /** Session start time */
  startTime: Date;
  
  /** Session end time */
  endTime?: Date;
  
  /** Duration in milliseconds */
  duration?: number;
  
  /** XP earned in this session */
  xpEarned: number;
  
  /** Was user muted */
  wasMuted: boolean;
  
  /** Was user deafened */
  wasDeafened: boolean;
}

/**
 * Guild data container
 */
export interface GuildData {
  /** Guild ID */
  guildId: string;
  
  /** Guild configuration */
  config: GuildConfig;
  
  /** All users in this guild */
  users: Map<string, UserData>;
  
  /** Last updated timestamp */
  lastUpdated: Date;
  
  /** Custom guild data */
  extraData?: Record<string, any>;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  /** User ID */
  userId: string;
  
  /** Guild ID */
  guildId: string;
  
  /** Total voice time */
  voiceTime: number;
  
  /** XP */
  xp: number;
  
  /** Level */
  level: number;
  
  /** Rank */
  rank: number;
}

/**
 * Statistics for a user or guild
 */
export interface Statistics {
  /** Total voice time */
  totalVoiceTime: number;
  
  /** Total XP */
  totalXp: number;
  
  /** Average session duration */
  avgSessionDuration: number;
  
  /** Total sessions */
  totalSessions: number;
  
  /** Most active channel */
  mostActiveChannel?: string;
  
  /** Daily breakdown */
  dailyStats: DailyStats[];
}

/**
 * Daily statistics
 */
export interface DailyStats {
  /** Date */
  date: string;
  
  /** Voice time that day */
  voiceTime: number;
  
  /** XP earned that day */
  xp: number;
  
  /** Sessions that day */
  sessions: number;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  /** Initialize the storage */
  init(): Promise<void>;
  
  /** Get guild data */
  getGuild(guildId: string): Promise<GuildData | null>;
  
  /** Save guild data */
  saveGuild(guildData: GuildData): Promise<void>;
  
  /** Delete guild data */
  deleteGuild(guildId: string): Promise<void>;
  
  /** Get user data */
  getUser(guildId: string, userId: string): Promise<UserData | null>;
  
  /** Save user data */
  saveUser(guildId: string, userData: UserData): Promise<void>;
  
  /** Delete user data */
  deleteUser(guildId: string, userId: string): Promise<void>;
  
  /** Get all guilds */
  getAllGuilds(): Promise<GuildData[]>;
  
  /** Get leaderboard */
  getLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]>;
  
  /** Save session */
  saveSession(session: SessionData): Promise<void>;
  
  /** Get user sessions */
  getSessions(
    guildId: string,
    userId: string,
    limit?: number
  ): Promise<SessionData[]>;
  
  /** Close storage connection */
  close(): Promise<void>;
}

/**
 * Event types
 */
export interface VoiceEvents {
  /** User gained voice time */
  voiceTimeGained: (userData: UserData, gained: number) => void;
  
  /** User gained XP */
  xpGained: (userData: UserData, gained: number) => void;
  
  /** User leveled up */
  levelUp: (userData: UserData, oldLevel: number, newLevel: number) => void;
  
  /** User started voice session */
  sessionStart: (session: SessionData) => void;
  
  /** User ended voice session */
  sessionEnd: (session: SessionData) => void;
  
  /** Guild configuration updated */
  configUpdated: (guildId: string, config: GuildConfig) => void;
  
  /** Error occurred */
  error: (error: Error) => void;
  
  /** Debug message */
  debug: (message: string) => void;
}

/**
 * Update options for user data
 */
export interface UserUpdateOptions {
  /** Add voice time */
  addVoiceTime?: number;
  
  /** Add XP */
  addXp?: number;
  
  /** Set level */
  setLevel?: number;
  
  /** Update metadata */
  metadata?: Record<string, any>;
}

/**
 * Query options for leaderboard
 */
export interface LeaderboardOptions {
  /** Sort by field */
  sortBy?: 'voiceTime' | 'xp' | 'level';
  
  /** Limit results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Filter by minimum level */
  minLevel?: number;
  
  /** Filter by minimum XP */
  minXp?: number;
}

/**
 * Migration data structure
 */
export interface MigrationData {
  /** Version migrating from */
  fromVersion: string;
  
  /** Version migrating to */
  toVersion: string;
  
  /** Guild data to migrate */
  guilds: any[];
  
  /** Timestamp */
  timestamp: Date;
}