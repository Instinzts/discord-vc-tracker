import { MongoClient, Db, Collection } from 'mongodb';
import {
  StorageAdapter,
  GuildData,
  UserData,
  SessionData,
  LeaderboardEntry,
} from '../types';

interface MongoGuildData {
  _id: string;
  guildId: string;
  config: any;
  lastUpdated: Date;
  extraData?: Record<string, any>; // Add extraData
}

interface MongoUserData extends UserData {
  _id?: string;
}

interface MongoSessionData extends SessionData {
  _id?: string;
}

/**
 * MongoDB storage adapter
 */
export class MongoStorage implements StorageAdapter {
  private client: MongoClient;
  private db!: Db;
  private guildsCollection!: Collection<MongoGuildData>;
  private usersCollection!: Collection<MongoUserData>;
  private sessionsCollection!: Collection<MongoSessionData>;
  private dbName: string;

  constructor(connectionString: string, dbName: string = 'voicetracker') {
    this.dbName = dbName;
    this.client = new MongoClient(connectionString);
  }

  async init(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      
      this.guildsCollection = this.db.collection('guilds');
      this.usersCollection = this.db.collection('users');
      this.sessionsCollection = this.db.collection('sessions');

      // Create indexes for better performance
      await this.createIndexes();
      
      console.warn('✅ MongoDB connected successfully');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    // Guild indexes
    await this.guildsCollection.createIndex({ guildId: 1 }, { unique: true });

    // User indexes
    await this.usersCollection.createIndex({ guildId: 1, userId: 1 }, { unique: true });
    await this.usersCollection.createIndex({ guildId: 1, xp: -1 });
    await this.usersCollection.createIndex({ guildId: 1, level: -1 });
    await this.usersCollection.createIndex({ guildId: 1, totalVoiceTime: -1 });

    // Session indexes
    await this.sessionsCollection.createIndex({ guildId: 1, userId: 1 });
    await this.sessionsCollection.createIndex({ startTime: -1 });
  }

  async getGuild(guildId: string): Promise<GuildData | null> {
    try {
      const guildDoc = await this.guildsCollection.findOne({ guildId });
      if (!guildDoc) return null;

      // Get all users for this guild
      const users = await this.usersCollection.find({ guildId }).toArray();
      const userMap = new Map<string, UserData>();
      
      for (const user of users) {
        const { _id, ...userData } = user;
        userMap.set(user.userId, userData as UserData);
      }

      return {
        guildId: guildDoc.guildId,
        config: guildDoc.config,
        users: userMap,
        lastUpdated: guildDoc.lastUpdated,
        extraData: guildDoc.extraData || {}, // Add extraData
      };
    } catch (error) {
      console.error('Error getting guild:', error);
      return null;
    }
  }

  async saveGuild(guildData: GuildData): Promise<void> {
    try {
      // Save guild config
      await this.guildsCollection.updateOne(
        { guildId: guildData.guildId },
        {
          $set: {
            guildId: guildData.guildId,
            config: guildData.config,
            lastUpdated: guildData.lastUpdated,
            extraData: guildData.extraData || {}, // Add extraData
          },
        },
        { upsert: true }
      );

      // Save all users
      const bulkOps = Array.from(guildData.users.values()).map((user) => ({
        updateOne: {
          filter: { guildId: user.guildId, userId: user.userId },
          update: { $set: user },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await this.usersCollection.bulkWrite(bulkOps);
      }
    } catch (error) {
      console.error('Error saving guild:', error);
      throw error;
    }
  }

  async deleteGuild(guildId: string): Promise<void> {
    try {
      await this.guildsCollection.deleteOne({ guildId });
      await this.usersCollection.deleteMany({ guildId });
      await this.sessionsCollection.deleteMany({ guildId });
    } catch (error) {
      console.error('Error deleting guild:', error);
      throw error;
    }
  }

  async getUser(guildId: string, userId: string): Promise<UserData | null> {
    try {
      const userDoc = await this.usersCollection.findOne({ guildId, userId });
      if (!userDoc) return null;

      const { _id, ...userData } = userDoc;
      return userData as UserData;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async saveUser(guildId: string, userData: UserData): Promise<void> {
    try {
      await this.usersCollection.updateOne(
        { guildId, userId: userData.userId },
        { $set: userData },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  async deleteUser(guildId: string, userId: string): Promise<void> {
    try {
      await this.usersCollection.deleteOne({ guildId, userId });
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getAllGuilds(): Promise<GuildData[]> {
    try {
      const guildDocs = await this.guildsCollection.find().toArray();
      const guilds: GuildData[] = [];

      for (const guildDoc of guildDocs) {
        const users = await this.usersCollection.find({ guildId: guildDoc.guildId }).toArray();
        const userMap = new Map<string, UserData>();
        
        for (const user of users) {
          const { _id, ...userData } = user;
          userMap.set(user.userId, userData as UserData);
        }

        guilds.push({
          guildId: guildDoc.guildId,
          config: guildDoc.config,
          users: userMap,
          lastUpdated: guildDoc.lastUpdated,
          extraData: guildDoc.extraData || {}, // Add extraData
        });
      }

      return guilds;
    } catch (error) {
      console.error('Error getting all guilds:', error);
      return [];
    }
  }

  async getLeaderboard(
    guildId: string,
    sortBy: 'voiceTime' | 'xp' | 'level',
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]> {
    try {
      const sortField = sortBy === 'voiceTime' ? 'totalVoiceTime' : sortBy;
      
      const users = await this.usersCollection
        .find({ guildId })
        .sort({ [sortField]: -1, xp: -1 }) // Secondary sort by XP
        .skip(offset)
        .limit(limit)
        .toArray();

      return users.map((user, index) => ({
        userId: user.userId,
        guildId: user.guildId,
        voiceTime: user.totalVoiceTime,
        xp: user.xp,
        level: user.level,
        rank: offset + index + 1,
      }));
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    try {
      await this.sessionsCollection.insertOne(session as MongoSessionData);
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
      const sessions = await this.sessionsCollection
        .find({ guildId, userId })
        .sort({ startTime: -1 })
        .limit(limit)
        .toArray();

      return sessions.map((session) => {
        const { _id, ...sessionData } = session;
        return sessionData as SessionData;
      });
    } catch (error) {
      console.error('Error getting sessions:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    await this.client.close();
    console.warn('✅ MongoDB connection closed');
  }
}