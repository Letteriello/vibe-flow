/**
 * Context Rot Detector
 * Detects and prevents context degradation over time
 * Implements sliding window and proactive cleaning
 */

import { estimateTokens } from '../utils/token-estimation.js';

/**
 * Context message structure for rot detection
 */
export interface RotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  tokenCount?: number;
}

/**
 * Health assessment result
 */
export interface ContextHealth {
  score: number; // 0-100
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
}

/**
 * Escalation result for rot detection
 */
export interface RotRotEscalationResult {
  success: boolean;
  messagesRemoved: number;
  tokensSaved: number;
  newTokenCount: number;
}

/**
 * Configuration for rot detection
 */
export interface RotDetectorConfig {
  maxTokens: number;
  degradationThreshold: number;
  slidingWindowSize: number;
  pruneThreshold: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RotDetectorConfig = {
  maxTokens: 100000,
  degradationThreshold: 70,
  slidingWindowSize: 50,
  pruneThreshold: 80
};

/**
 * RotDetector class
 */
export class RotDetector {
  private config: RotDetectorConfig;
  private history: RotMessage[] = [];
  private healthScore: number = 100;

  constructor(config: Partial<RotDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add message to history
   */
  addMessage(message: RotMessage): void {
    this.history.push({
      ...message,
      timestamp: message.timestamp || Date.now(),
      tokenCount: message.tokenCount || estimateTokens(message.content)
    });
    this.updateHealthScore();
  }

  /**
   * Detect context rot
   */
  detectContextRot(messages?: RotMessage[]): ContextHealth {
    const msgs = messages || this.history;
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check total token count
    const totalTokens = msgs.reduce((sum, m) => sum + (m.tokenCount || estimateTokens(m.content)), 0);
    if (totalTokens > this.config.maxTokens) {
      issues.push(`Token count (${totalTokens}) exceeds maximum (${this.config.maxTokens})`);
      recommendations.push('Consider aggressive pruning or context escalation');
    }

    // Check for repetitive patterns
    const recentMessages = msgs.slice(-this.config.slidingWindowSize);
    const repetitionScore = this.calculateRepetitionScore(recentMessages);
    if (repetitionScore > this.config.degradationThreshold) {
      issues.push(`High repetition detected (score: ${repetitionScore})`);
      recommendations.push('Remove redundant tool results and thought blocks');
    }

    // Check message density (old vs new)
    const oldMessages = msgs.slice(0, Math.floor(msgs.length * 0.7));
    const newMessages = msgs.slice(Math.floor(msgs.length * 0.7));
    const oldTokens = oldMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    const newTokens = newMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

    if (oldTokens > newTokens * 3 && msgs.length > 20) {
      issues.push('Context is bloated with historical data');
      recommendations.push('Apply sliding window to keep recent context');
    }

    // Check for tool result accumulation
    const toolResults = msgs.filter(m => m.content.includes('tool_use') || m.content.includes('Result:'));
    if (toolResults.length > msgs.length * 0.5 && msgs.length > 30) {
      issues.push('Too many tool results accumulated');
      recommendations.push('Summarize or prune old tool results');
    }

    // Calculate health score
    const score = this.calculateHealthScore(issues);

    return {
      score,
      isHealthy: score >= this.config.degradationThreshold,
      issues,
      recommendations
    };
  }

  /**
   * Calculate repetition score
   */
  private calculateRepetitionScore(messages: RotMessage[]): number {
    if (messages.length < 2) return 0;

    const contentHashes = new Map<string, number>();
    for (const msg of messages) {
      const hash = this.simpleHash(msg.content.slice(0, 100));
      contentHashes.set(hash, (contentHashes.get(hash) || 0) + 1);
    }

    const maxRepetition = Math.max(...Array.from(contentHashes.values()));
    return Math.min(100, (maxRepetition / messages.length) * 100);
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(issues: string[]): number {
    if (issues.length === 0) return 100;
    if (issues.length === 1) return 80;
    if (issues.length === 2) return 60;
    if (issues.length >= 3) return 40;
    return 100;
  }

  /**
   * Update internal health score
   */
  private updateHealthScore(): void {
    const health = this.detectContextRot();
    this.healthScore = health.score;
  }

  /**
   * Check if should prune
   */
  shouldPrune(messages?: RotMessage[]): boolean {
    const msgs = messages || this.history;
    const totalTokens = msgs.reduce((sum, m) => sum + (m.tokenCount || estimateTokens(m.content)), 0);
    const health = this.detectContextRot(msgs);

    return (
      totalTokens > this.config.maxTokens * (this.config.pruneThreshold / 100) ||
      !health.isHealthy
    );
  }

  /**
   * Escalate context - sliding window
   */
  async escalateContext(messages?: RotMessage[]): Promise<RotEscalationResult> {
    const msgs = messages || this.history;

    if (msgs.length <= this.config.slidingWindowSize) {
      return {
        success: true,
        messagesRemoved: 0,
        tokensSaved: 0,
        newTokenCount: msgs.reduce((sum, m) => sum + (m.tokenCount || 0), 0)
      };
    }

    // Keep only the most recent messages
    const keepCount = Math.min(this.config.slidingWindowSize, msgs.length);
    const keptMessages = msgs.slice(-keepCount);
    const removedMessages = msgs.slice(0, msgs.length - keepCount);

    const tokensSaved = removedMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    const newTokenCount = keptMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

    // Update internal history
    if (!messages) {
      this.history = keptMessages;
    }

    return {
      success: true,
      messagesRemoved: removedMessages.length,
      tokensSaved,
      newTokenCount
    };
  }

  /**
   * Get current health score
   */
  getHealthScore(): number {
    return this.healthScore;
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.history.length;
  }

  /**
   * Get total tokens
   */
  getTotalTokens(): number {
    return this.history.reduce((sum, m) => sum + (m.tokenCount || estimateTokens(m.content)), 0);
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.history = [];
    this.healthScore = 100;
  }
}

/**
 * Factory function to create detector
 */
export function createRotDetector(config?: Partial<RotDetectorConfig>): RotDetector {
  return new RotDetector(config);
}

/**
 * Convenience function to detect rot
 */
export function detectContextRot(messages: RotMessage[]): ContextHealth {
  const detector = new RotDetector();
  return detector.detectContextRot(messages);
}

/**
 * Convenience function to check if should prune
 */
export function shouldPrune(messages: RotMessage[]): boolean {
  const detector = new RotDetector();
  return detector.shouldPrune(messages);
}

/**
 * Convenience function to escalate
 */
export async function escalateContext(messages: RotMessage[]): Promise<RotEscalationResult> {
  const detector = new RotDetector();
  return detector.escalateContext(messages);
}
