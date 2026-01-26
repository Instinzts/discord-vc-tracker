/**
 * XP and Level calculation utility
 */
export class XPCalculator {
  /**
   * Calculate level from XP
   * Formula: level = multiplier * sqrt(xp)
   */
  calculateLevel(xp: number, multiplier: number = 0.1): number {
    return Math.floor(multiplier * Math.sqrt(xp));
  }

  /**
   * Calculate XP needed for a specific level
   */
  calculateXPForLevel(level: number, multiplier: number = 0.1): number {
    return Math.pow(level / multiplier, 2);
  }

  /**
   * Calculate XP needed to reach next level
   */
  calculateXPToNextLevel(currentXP: number, multiplier: number = 0.1): number {
    const currentLevel = this.calculateLevel(currentXP, multiplier);
    const nextLevelXP = this.calculateXPForLevel(currentLevel + 1, multiplier);
    return nextLevelXP - currentXP;
  }

  /**
   * Calculate progress percentage to next level
   */
  calculateLevelProgress(currentXP: number, multiplier: number = 0.1): number {
    const currentLevel = this.calculateLevel(currentXP, multiplier);
    const currentLevelXP = this.calculateXPForLevel(currentLevel, multiplier);
    const nextLevelXP = this.calculateXPForLevel(currentLevel + 1, multiplier);
    
    const progress = (currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
    return Math.round(progress * 100);
  }

  /**
   * Format voice time to readable string
   */
  formatVoiceTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Calculate average session duration
   */
  calculateAverageSessionDuration(
    totalVoiceTime: number,
    totalSessions: number
  ): number {
    if (totalSessions === 0) return 0;
    return totalVoiceTime / totalSessions;
  }
}
