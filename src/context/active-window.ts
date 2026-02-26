// Active Window Middleware - Filters provider payload for noise reduction
// This is the Active Context layer that sits between the Immutable Store and provider

import {
  ContextMessage,
  ActiveWindowConfig,
  CleaningResult,
  thinkingBlockClearing,
  staleToolClearing,
  needsAggressiveCleaning
} from './pruning.js';

/**
 * Default configuration for active window
 */
export const DEFAULT_ACTIVE_WINDOW_CONFIG: ActiveWindowConfig = {
  maxTokens: 128000, // Default context window size
  warningThreshold: 0.8, // 80% of max tokens triggers warnings
  staleToolRemovalThreshold: 0.8, // 80% of max tokens triggers tool pruning
  staleToolRemovalPercentage: 0.5 // Remove 50% of oldest tool outputs
};

/**
 * Active Window State
 */
interface ActiveWindowState {
  config: ActiveWindowConfig;
  lastCleaningResult: CleaningResult | null;
  cleaningHistory: CleaningResult[];
}

/**
 * Provider payload structure
 */
export interface ProviderPayload {
  messages: ContextMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

/**
 * ActiveWindowMiddleware - Filters context for noise reduction
 *
 * This middleware sits between the Immutable Store and the LLM provider,
 * applying aggressive cleaning to reduce noise while preserving essential context.
 *
 * Features:
 * - Removes thought blocks from previous turns (keeps current turn)
 * - Prunes stale tool outputs when context exceeds threshold
 * - Maintains cleaning history for debugging
 * - Configurable thresholds
 */
export class ActiveWindowMiddleware {
  private state: ActiveWindowState;

  constructor(config: Partial<ActiveWindowConfig> = {}) {
    this.state = {
      config: {
        ...DEFAULT_ACTIVE_WINDOW_CONFIG,
        ...config
      },
      lastCleaningResult: null,
      cleaningHistory: []
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ActiveWindowConfig>): void {
    this.state.config = {
      ...this.state.config,
      ...config
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ActiveWindowConfig {
    return { ...this.state.config };
  }

  /**
   * Get last cleaning result
   */
  getLastCleaningResult(): CleaningResult | null {
    return this.state.lastCleaningResult;
  }

  /**
   * Get cleaning history
   */
  getCleaningHistory(): CleaningResult[] {
    return [...this.state.cleaningHistory];
  }

  /**
   * Middleware function - filters provider payload
   *
   * This is the main entry point that transforms the payload
   * before sending to the LLM provider.
   *
   * @param payload - Original provider payload
   * @returns Filtered payload with noise removed
   */
  filter(payload: ProviderPayload): ProviderPayload {
    const { messages, ...rest } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
      return payload;
    }

    // Check if aggressive cleaning is needed
    if (!needsAggressiveCleaning(messages, this.state.config)) {
      // Only apply light cleaning (thought blocks)
      const cleaned = thinkingBlockClearing(messages as ContextMessage[]);

      this.state.lastCleaningResult = {
        messages: cleaned,
        removedThoughtBlocks: 0, // Would need to track this
        removedToolOutputs: 0,
        tokenReduction: 0
      };

      return {
        messages: cleaned,
        ...rest
      };
    }

    // Apply aggressive cleaning (thought blocks + stale tools)
    const result = staleToolClearing(messages as ContextMessage[], this.state.config);

    // Store result
    this.state.lastCleaningResult = result;
    this.state.cleaningHistory.push(result);

    // Keep history manageable (last 10 cleanings)
    if (this.state.cleaningHistory.length > 10) {
      this.state.cleaningHistory = this.state.cleaningHistory.slice(-10);
    }

    return {
      messages: result.messages,
      ...rest
    };
  }

  /**
   * Check if current payload needs cleaning (for pre-flight check)
   */
  needsCleaning(payload: ProviderPayload): boolean {
    const messages = payload.messages as ContextMessage[];
    if (!Array.isArray(messages)) {
      return false;
    }
    return needsAggressiveCleaning(messages, this.state.config);
  }

  /**
   * Get statistics about current context
   */
  getContextStats(messages: ContextMessage[]): {
    estimatedTokens: number;
    maxTokens: number;
    usagePercentage: number;
    messageCount: number;
    toolResultCount: number;
  } {
    let totalTokens = 0;
    let toolResultCount = 0;

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      totalTokens += Math.ceil(content.length / 4);
      if (msg.role === 'tool_result') {
        toolResultCount++;
      }
    }

    return {
      estimatedTokens: totalTokens,
      maxTokens: this.state.config.maxTokens,
      usagePercentage: Math.round((totalTokens / this.state.config.maxTokens) * 100),
      messageCount: messages.length,
      toolResultCount
    };
  }

  /**
   * Reset middleware state
   */
  reset(): void {
    this.state.lastCleaningResult = null;
    this.state.cleaningHistory = [];
  }
}

/**
 * Create middleware instance with defaults
 */
export function createActiveWindowMiddleware(
  config?: Partial<ActiveWindowConfig>
): ActiveWindowMiddleware {
  return new ActiveWindowMiddleware(config);
}

/**
 * Convenience function - create middleware and filter in one step
 */
export function filterProviderPayload(
  payload: ProviderPayload,
  config?: Partial<ActiveWindowConfig>
): ProviderPayload {
  const middleware = new ActiveWindowMiddleware(config);
  return middleware.filter(payload);
}

export default ActiveWindowMiddleware;
