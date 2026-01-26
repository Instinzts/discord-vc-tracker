import { GuildConfig } from '../types';

/**
 * Validate guild configuration
 */
export class Validator {
  /**
   * Validate guild config
   */
  static validateGuildConfig(config: Partial<GuildConfig>): string[] {
    const errors: string[] = [];

    // Validate booleans
    if (config.trackBots !== undefined && typeof config.trackBots !== 'boolean') {
      errors.push('trackBots must be a boolean');
    }

    if (config.trackAllChannels !== undefined && typeof config.trackAllChannels !== 'boolean') {
      errors.push('trackAllChannels must be a boolean');
    }

    if (config.trackMuted !== undefined && typeof config.trackMuted !== 'boolean') {
      errors.push('trackMuted must be a boolean');
    }

    if (config.trackDeafened !== undefined && typeof config.trackDeafened !== 'boolean') {
      errors.push('trackDeafened must be a boolean');
    }

    // ✅ NEW: Validate strategy names
    if (config.xpStrategy !== undefined) {
      if (typeof config.xpStrategy !== 'string') {
        errors.push('xpStrategy must be a string');
      }
    }

    if (config.voiceTimeStrategy !== undefined) {
      if (typeof config.voiceTimeStrategy !== 'string') {
        errors.push('voiceTimeStrategy must be a string');
      }
    }

    if (config.levelMultiplierStrategy !== undefined) {
      if (typeof config.levelMultiplierStrategy !== 'string') {
        errors.push('levelMultiplierStrategy must be a string');
      }
    }

    // ✅ NEW: Validate strategy configs
    if (config.xpConfig !== undefined) {
      if (typeof config.xpConfig !== 'object' || config.xpConfig === null) {
        errors.push('xpConfig must be an object');
      }
    }

    if (config.voiceTimeConfig !== undefined) {
      if (typeof config.voiceTimeConfig !== 'object' || config.voiceTimeConfig === null) {
        errors.push('voiceTimeConfig must be an object');
      }
    }

    if (config.levelMultiplierConfig !== undefined) {
      if (typeof config.levelMultiplierConfig !== 'object' || config.levelMultiplierConfig === null) {
        errors.push('levelMultiplierConfig must be an object');
      }
    }

    // Validate numbers
    if (config.minUsersToTrack !== undefined) {
      if (typeof config.minUsersToTrack !== 'number' || config.minUsersToTrack < 0) {
        errors.push('minUsersToTrack must be a non-negative number');
      }
    }

    if (config.maxUsersToTrack !== undefined) {
      if (typeof config.maxUsersToTrack !== 'number' || config.maxUsersToTrack < 0) {
        errors.push('maxUsersToTrack must be a non-negative number');
      }
    }

    // Validate arrays
    if (config.channelIds !== undefined) {
      if (!Array.isArray(config.channelIds)) {
        errors.push('channelIds must be an array');
      } else if (!config.channelIds.every((id) => typeof id === 'string')) {
        errors.push('channelIds must contain only strings');
      }
    }

    if (config.exemptPermissions !== undefined) {
      if (!Array.isArray(config.exemptPermissions)) {
        errors.push('exemptPermissions must be an array');
      }
    }

    // Validate functions (runtime only, not serialized)
    if (config.memberFilter !== undefined && typeof config.memberFilter !== 'function') {
      errors.push('memberFilter must be a function');
    }

    if (config.channelFilter !== undefined && typeof config.channelFilter !== 'function') {
      errors.push('channelFilter must be a function');
    }

    return errors;
  }
}