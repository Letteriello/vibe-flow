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
}

/**
 * Configuration for rot detection
 */
export interface RotDetectorConfig {
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
}

/**
 * Default configuration
 */
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
    };
  }

  /**
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
  return detector.detectContextRot(messages);
}

/**
 * Check if pruning is needed
 */
export function shouldPrune(messages: ContextMessage[]): boolean {
  const detector = getGlobalRotDetector();
  return detector.shouldPrune(messages);
}

/**
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
