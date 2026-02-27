<<<<<<< HEAD
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
export interface RotEscalationResult {
  success: boolean;
  messagesRemoved: number;
  tokensSaved: number;
  newTokenCount: number;
=======
// Context Rot Detector - Detects and prevents context degradation
// Monitors context health and triggers proactive cleaning/escalation

import {
  ContextMessage,
  cleanMessages,
  CleaningStrategyType,
  CleaningOptions,
  DEFAULT_CLEANING_OPTIONS
} from './cleaning-strategy.js';
import { escalatedSummarize, EscalationResult } from './escalation.js';

/**
 * Context health assessment result
 */
export interface ContextHealth {
  score: number;       // 0-100 (higher is healthier)
  isHealthy: boolean;
  issues: string[];
  metrics: ContextMetrics;
}

/**
 * Detailed context metrics
 */
export interface ContextMetrics {
  totalTokens: number;
  messageCount: number;
  thoughtBlockCount: number;
  staleToolResultCount: number;
  avgMessageLength: number;
  tokenDensity: number;
  degradationIndicators: DegradationIndicator[];
}

/**
 * Degradation indicators that contribute to rot detection
 */
export interface DegradationIndicator {
  type: 'thought_blocks' | 'stale_tools' | 'redundancy' | 'length_growth' | 'token_bloat';
  severity: 'low' | 'medium' | 'high';
  description: string;
  count: number;
}

/**
 * Escalation result from context rotation
 */
export interface RotationEscalationResult {
  success: boolean;
  method: 'cleaning' | 'escalation' | 'none';
  result: EscalationResult | null;
  previousHealth: ContextHealth;
  newHealth: ContextHealth;
  messagesPruned?: number;
>>>>>>> origin/main
}

/**
 * Configuration for rot detection
 */
export interface RotDetectorConfig {
<<<<<<< HEAD
  maxTokens: number;
  degradationThreshold: number;
  slidingWindowSize: number;
  pruneThreshold: number;
=======
  /** Token threshold for considering context bloated (default: 100000) */
  tokenThreshold: number;
  /** Health score below this is considered unhealthy (default: 50) */
  healthScoreThreshold: number;
  /** Percentage of stale tools to trigger cleaning (default: 0.3) */
  staleToolThreshold: number;
  /** Max average message length before flagging as bloated (default: 5000) */
  maxAvgMessageLength: number;
  /** Enable automatic escalation on severe rot (default: true) */
  autoEscalate: boolean;
  /** Target tokens after escalation (default: 8000) */
  targetTokens: number;
>>>>>>> origin/main
}

/**
 * Default configuration
 */
<<<<<<< HEAD
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
=======
export const DEFAULT_ROT_CONFIG: RotDetectorConfig = {
  tokenThreshold: 100000,
  healthScoreThreshold: 50,
  staleToolThreshold: 0.3,
  maxAvgMessageLength: 5000,
  autoEscalate: true,
  targetTokens: 8000
};

/**
 * Count thought blocks in messages
 */
function countThoughtBlocks(messages: ContextMessage[]): number {
  let count = 0;
  const patterns = [
    /<thought>[\s\S]*?<\/thought>/gi,
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /<reflection>[\s\S]*?<\/reflection>/gi,
    /<internal_thought>[\s\S]*?<\/internal_thought>/gi
  ];

  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;
    for (const pattern of patterns) {
      const matches = msg.content.match(pattern);
      if (matches) count += matches.length;
    }
  }

  return count;
}

/**
 * Count stale tool results
 */
function countStaleToolResults(messages: ContextMessage[]): number {
  return messages.filter(m => m.role === 'tool_result').length;
}

/**
 * Calculate token estimate (simple approximation)
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Calculate context health score
 */
function calculateHealthScore(metrics: ContextMetrics, config: RotDetectorConfig): number {
  let score = 100;

  // Deduct for thought blocks
  if (metrics.thoughtBlockCount > 0) {
    score -= Math.min(30, metrics.thoughtBlockCount * 5);
  }

  // Deduct for stale tools
  const staleRatio = metrics.messageCount > 0
    ? metrics.staleToolResultCount / metrics.messageCount
    : 0;
  if (staleRatio > config.staleToolThreshold) {
    score -= 20;
  }

  // Deduct for high average message length
  if (metrics.avgMessageLength > config.maxAvgMessageLength) {
    score -= Math.min(20, Math.floor((metrics.avgMessageLength - config.maxAvgMessageLength) / 500));
  }

  // Deduct for token bloat
  if (metrics.totalTokens > config.tokenThreshold) {
    score -= Math.min(30, Math.floor((metrics.totalTokens - config.tokenThreshold) / 5000));
  }

  return Math.max(0, score);
}

/**
 * Context Rot Detector - Monitors and prevents context degradation
 */
export class ContextRotDetector {
  private config: RotDetectorConfig;

  constructor(config: Partial<RotDetectorConfig> = {}) {
    this.config = { ...DEFAULT_ROT_CONFIG, ...config };
  }

  /**
   * Detect context rot by analyzing message health
   */
  detectContextRot(messages: ContextMessage[]): ContextHealth {
    if (!messages || messages.length === 0) {
      return {
        score: 100,
        isHealthy: true,
        issues: [],
        metrics: {
          totalTokens: 0,
          messageCount: 0,
          thoughtBlockCount: 0,
          staleToolResultCount: 0,
          avgMessageLength: 0,
          tokenDensity: 0,
          degradationIndicators: []
        }
      };
    }

    // Collect metrics
    const totalTokens = messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return sum + estimateTokens(content);
    }, 0);

    const messageCount = messages.length;
    const thoughtBlockCount = countThoughtBlocks(messages);
    const staleToolResultCount = countStaleToolResults(messages);
    const totalContentLength = messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return sum + content.length;
    }, 0);
    const avgMessageLength = messageCount > 0 ? totalContentLength / messageCount : 0;
    const tokenDensity = totalContentLength > 0 ? totalTokens / totalContentLength : 0;

    // Identify degradation indicators
    const degradationIndicators: DegradationIndicator[] = [];

    if (thoughtBlockCount > 0) {
      degradationIndicators.push({
        type: 'thought_blocks',
        severity: thoughtBlockCount > 10 ? 'high' : thoughtBlockCount > 5 ? 'medium' : 'low',
        description: `${thoughtBlockCount} thought/thinking blocks detected`,
        count: thoughtBlockCount
      });
    }

    const staleRatio = messageCount > 0 ? staleToolResultCount / messageCount : 0;
    if (staleRatio > this.config.staleToolThreshold) {
      degradationIndicators.push({
        type: 'stale_tools',
        severity: staleRatio > 0.5 ? 'high' : staleRatio > 0.3 ? 'medium' : 'low',
        description: `${Math.round(staleRatio * 100)}% of messages are stale tool results`,
        count: staleToolResultCount
      });
    }

    if (avgMessageLength > this.config.maxAvgMessageLength) {
      degradationIndicators.push({
        type: 'token_bloat',
        severity: avgMessageLength > 10000 ? 'high' : avgMessageLength > 7000 ? 'medium' : 'low',
        description: `Average message length (${Math.round(avgMessageLength)} chars) exceeds threshold`,
        count: Math.floor(avgMessageLength / 1000)
      });
    }

    if (totalTokens > this.config.tokenThreshold) {
      degradationIndicators.push({
        type: 'length_growth',
        severity: totalTokens > 150000 ? 'high' : totalTokens > 120000 ? 'medium' : 'low',
        description: `Context size (${totalTokens} tokens) exceeds threshold`,
        count: Math.floor(totalTokens / 10000)
      });
    }

    const metrics: ContextMetrics = {
      totalTokens,
      messageCount,
      thoughtBlockCount,
      staleToolResultCount,
      avgMessageLength,
      tokenDensity,
      degradationIndicators
    };

    const score = calculateHealthScore(metrics, this.config);

    // Generate issues list
    const issues = degradationIndicators.map(d => d.description);

    return {
      score,
      isHealthy: score >= this.config.healthScoreThreshold,
      issues,
      metrics
>>>>>>> origin/main
    };
  }

  /**
<<<<<<< HEAD
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
=======
   * Determine if context should be pruned
   */
  shouldPrune(messages: ContextMessage[]): boolean {
    const health = this.detectContextRot(messages);

    // Prune if unhealthy
    if (!health.isHealthy) {
      return true;
    }

    // Prune if any high severity indicators
    const hasHighSeverity = health.metrics.degradationIndicators.some(
      d => d.severity === 'high'
    );
    if (hasHighSeverity) {
      return true;
    }

    // Prune if approaching threshold
    if (health.metrics.totalTokens > this.config.tokenThreshold * 0.8) {
      return true;
    }

    return false;
  }

  /**
   * Escalate context - apply cleaning and/or summarization
   */
  async escalateContext(
    messages: ContextMessage[],
    options?: { forceCleaning?: boolean; forceEscalation?: boolean }
  ): Promise<RotationEscalationResult> {
    const forceCleaning = options?.forceCleaning ?? false;
    const forceEscalation = options?.forceEscalation ?? false;

    const previousHealth = this.detectContextRot(messages);
    let currentMessages = [...messages];
    let method: 'cleaning' | 'escalation' | 'none' = 'none';
    let escalationResult: EscalationResult | null = null;
    let messagesPruned = 0;

    // Step 1: Try cleaning first (lightweight)
    if (forceCleaning || previousHealth.metrics.thoughtBlockCount > 0 || previousHealth.metrics.staleToolResultCount > 0) {
      const cleaningOptions: CleaningOptions = {
        ...DEFAULT_CLEANING_OPTIONS,
        staleToolRemovalPercentage: 0.5,
        staleToolRemovalThreshold: 0.7
      };

      const cleanResult = cleanMessages(currentMessages, 'combined', cleaningOptions);
      currentMessages = cleanResult.messages;
      messagesPruned = cleanResult.removedThoughtBlocks + cleanResult.removedToolOutputs;
      method = 'cleaning';
    }

    // Step 2: Check if escalation is still needed
    const healthAfterCleaning = this.detectContextRot(currentMessages);

    // Escalate if still unhealthy or forced
    if (forceEscalation || !healthAfterCleaning.isHealthy || healthAfterCleaning.metrics.totalTokens > this.config.tokenThreshold) {
      if (this.config.autoEscalate) {
        try {
          escalationResult = await escalatedSummarize(
            currentMessages as any,
            this.config.targetTokens
          );

          if (escalationResult.success) {
            method = 'escalation';
          }
        } catch {
          // Escalation failed, fall back to cleaned messages
        }
      }
    }

    const newHealth = this.detectContextRot(
      escalationResult?.content
        ? [{ role: 'system' as const, content: escalationResult.content }]
        : currentMessages
    );

    return {
      success: newHealth.isHealthy,
      method,
      result: escalationResult,
      previousHealth,
      newHealth,
      messagesPruned
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RotDetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RotDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let globalDetector: ContextRotDetector | null = null;

/**
 * Get global detector instance
 */
export function getGlobalRotDetector(config?: Partial<RotDetectorConfig>): ContextRotDetector {
  if (!globalDetector) {
    globalDetector = new ContextRotDetector(config);
  }
  return globalDetector;
}

/**
 * Detect context rot
 */
export function detectContextRot(messages: ContextMessage[]): ContextHealth {
  const detector = getGlobalRotDetector();
>>>>>>> origin/main
  return detector.detectContextRot(messages);
}

/**
<<<<<<< HEAD
 * Convenience function to check if should prune
 */
export function shouldPrune(messages: RotMessage[]): boolean {
  const detector = new RotDetector();
=======
 * Check if pruning is needed
 */
export function shouldPrune(messages: ContextMessage[]): boolean {
  const detector = getGlobalRotDetector();
>>>>>>> origin/main
  return detector.shouldPrune(messages);
}

/**
<<<<<<< HEAD
 * Convenience function to escalate
 */
export async function escalateContext(messages: RotMessage[]): Promise<RotEscalationResult> {
  const detector = new RotDetector();
  return detector.escalateContext(messages);
}
=======
 * Escalate context
 */
export async function escalateContext(
  messages: ContextMessage[],
  options?: { forceCleaning?: boolean; forceEscalation?: boolean }
): Promise<RotationEscalationResult> {
  const detector = getGlobalRotDetector();
  return detector.escalateContext(messages, options);
}

export default ContextRotDetector;
>>>>>>> origin/main
