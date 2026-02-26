// Quota Tracker - Monitors CLI usage and alerts at 80% threshold
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { getLogger } from './logger.js';

const QUOTA_STATE_FILE = join(homedir(), '.vibe-flow', 'quota-state.json');

export interface QuotaConfig {
  /** Total token limit (default: 50,000) */
  limit: number;
  /** Safety threshold percentage (default: 0.8 = 80%) */
  threshold: number;
}

export interface QuotaState {
  used: number;
  callCount: number;
  lastReset: string;
}

const DEFAULT_CONFIG: QuotaConfig = {
  limit: 50000,
  threshold: 0.8
};

export class QuotaTracker {
  private used: number = 0;
  private callCount: number = 0;
  private config: QuotaConfig;
  private hasWarned: boolean = false;
  private initialized: boolean = false;
  private logger = getLogger();

  constructor(config: Partial<QuotaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureQuotaDirectory();
  }

  private async ensureQuotaDirectory(): Promise<void> {
    const quotaDir = dirname(QUOTA_STATE_FILE);
    try {
      await fs.mkdir(quotaDir, { recursive: true });
    } catch (error) {
      console.error('[QuotaTracker] Failed to create quota directory:', error);
    }
  }

  /**
   * Load existing quota state from disk
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(QUOTA_STATE_FILE, 'utf-8');
      const state: QuotaState = JSON.parse(content);
      this.used = state.used;
      this.callCount = state.callCount;
      this.initialized = true;
    } catch (error) {
      // File doesn't exist yet - start fresh
      this.used = 0;
      this.callCount = 0;
      this.initialized = true;
    }
  }

  /**
   * Persist current quota state to disk
   */
  private async persist(): Promise<void> {
    const state: QuotaState = {
      used: this.used,
      callCount: this.callCount,
      lastReset: new Date().toISOString()
    };

    try {
      const tempFile = QUOTA_STATE_FILE + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      await fs.rename(tempFile, QUOTA_STATE_FILE);
    } catch (error) {
      console.error('[QuotaTracker] Failed to persist quota state:', error);
    }
  }

  /**
   * Record a CLI call (simulates token usage)
   * @param estimatedTokens - Estimated tokens used for this call (default: 1)
   */
  async recordCall(estimatedTokens: number = 1): Promise<void> {
    if (!this.initialized) {
      await this.load();
    }

    this.used += estimatedTokens;
    this.callCount += 1;

    await this.persist();
    await this.checkThreshold();
  }

  /**
   * Check if usage has exceeded the safety threshold
   */
  private async checkThreshold(): Promise<void> {
    const thresholdAmount = this.config.limit * this.config.threshold;

    if (this.used >= thresholdAmount && !this.hasWarned) {
      const percentage = Math.round((this.used / this.config.limit) * 100);
      const warningMessage = `[QuotaTracker] WARNING: Usage at ${percentage}% of limit (${this.used}/${this.config.limit} tokens). Consider reviewing usage to avoid API blocking.`;

      // Console warning
      console.warn(warningMessage);

      // Log to file
      await this.logger.warn(warningMessage);

      this.hasWarned = true;
    }

    // Alert if exceeded limit
    if (this.used >= this.config.limit) {
      const errorMessage = `[QuotaTracker] CRITICAL: Usage exceeded limit (${this.used}/${this.config.limit} tokens). API may be blocked.`;

      console.error(errorMessage);
      await this.logger.error(errorMessage);
    }
  }

  /**
   * Get current usage count
   */
  getUsed(): number {
    return this.used;
  }

  /**
   * Get total call count
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get the configured limit
   */
  getLimit(): number {
    return this.config.limit;
  }

  /**
   * Get current usage percentage
   */
  getUsagePercentage(): number {
    return Math.round((this.used / this.config.limit) * 100);
  }

  /**
   * Check if usage is above safety threshold
   */
  isAboveThreshold(): boolean {
    return this.used >= (this.config.limit * this.config.threshold);
  }

  /**
   * Check if usage has exceeded the limit
   */
  isExceeded(): boolean {
    return this.used >= this.config.limit;
  }

  /**
   * Reset the quota counter
   */
  async reset(): Promise<void> {
    this.used = 0;
    this.callCount = 0;
    this.hasWarned = false;
    await this.persist();
    await this.logger.info('[QuotaTracker] Quota reset');
  }

  /**
   * Get current quota state
   */
  getState(): QuotaState {
    return {
      used: this.used,
      callCount: this.callCount,
      lastReset: new Date().toISOString()
    };
  }
}

// Singleton instance
let quotaTracker: QuotaTracker | null = null;

export function getQuotaTracker(config?: Partial<QuotaConfig>): QuotaTracker {
  if (!quotaTracker) {
    quotaTracker = new QuotaTracker(config);
  }
  return quotaTracker;
}
