// Context Optimizer - Truncation and filtering of message objects for long loops
// Removes stale tool outputs and thinking blocks from older turns when threshold exceeded

import { ContextMessage } from './pruning';

/**
 * Configuration for ContextOptimizer
 */
export interface OptimizerConfig {
  /** Number of recent turns to preserve completely (default: 3) */
  preserveRecentTurns: number;
  /** Maximum number of tokens before pruning (default: 40000) */
  maxThreshold: number;
  /** Estimate of tokens per character (default: 0.25) */
  tokensPerChar: number;
}

/**
 * Result of optimization operation
 */
export interface OptimizationResult {
  originalLength: number;
  optimizedLength: number;
  removedToolResults: number;
  removedThinkingBlocks: number;
  preservedSystem: boolean;
  preservedRecentTurns: number;
}

/**
 * ContextOptimizer - Applies context editing techniques to reduce token usage
 * in long conversation loops while preserving critical information.
 *
 * Maintains the first system instruction intact and preserves the N most recent turns.
 */
export class ContextOptimizer {
  private config: OptimizerConfig;

  constructor(config: Partial<OptimizerConfig> = {}) {
    this.config = {
      preserveRecentTurns: config.preserveRecentTurns ?? 3,
      maxThreshold: config.maxThreshold ?? 40000,
      tokensPerChar: config.tokensPerChar ?? 0.25,
    };
  }

  /**
   * Estimates token count for a message array
   */
  private estimateTokens(messages: ContextMessage[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + content.length * this.config.tokensPerChar;
    }, 0);
  }

  /**
   * Checks if a message is a thinking block
   */
  private isThinkingBlock(content: string): boolean {
    return content.includes('<thinking>') || content.includes('</thinking>');
  }

  /**
   * Checks if a message is a tool result/output
   */
  private isToolMessage(role: string): boolean {
    return role === 'tool' || role === 'tool_result';
  }

  /**
   * Strips thinking blocks from content while preserving the rest
   */
  private stripThinkingBlocks(content: string): string {
    return content
      .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
      .replace(/<thinking>[\s\S]*$/g, '')
      .trim();
  }

  /**
   * Checks if message has tool output that can be stripped
   */
  private hasToolOutput(msg: ContextMessage): boolean {
    if (this.isToolMessage(msg.role)) {
      return true;
    }
    // Check for tool-related content in content field
    const content = typeof msg.content === 'string' ? msg.content : '';
    return content.includes('tool_call_id') || content.includes('tool_use');
  }

  /**
   * Counts the number of tool result blocks in content
   */
  private countToolResults(content: string): number {
    const toolResultRegex = /<tool_result>|<tool_results>|tool_output/gi;
    const matches = content.match(toolResultRegex);
    return matches ? matches.length : 0;
  }

  /**
   * Gets the index of the first recent turn (excluding system)
   */
  private getFirstRecentTurnIndex(messages: ContextMessage[]): number {
    // Skip system message (index 0 if present)
    const startIdx = messages.length > 0 && messages[0].role === 'system' ? 1 : 0;

    // Find the index where recent turns begin
    const recentTurns: ContextMessage[] = [];
    for (let i = messages.length - 1; i >= startIdx; i--) {
      const msg = messages[i];
      if (msg.role === 'user' || msg.role === 'assistant') {
        recentTurns.unshift(msg);
        if (recentTurns.length >= this.config.preserveRecentTurns) {
          break;
        }
      }
    }

    if (recentTurns.length === 0) {
      return messages.length;
    }

    // Find the index of the first message in recent turns
    const firstRecentMsg = recentTurns[0];
    return messages.indexOf(firstRecentMsg);
  }

  /**
   * Prunes stale tool results and thinking blocks from older turns
   *
   * @param history - Array of LLM messages (conversation history)
   * @param maxThreshold - Maximum token threshold before pruning activates
   * @returns Optimized history with stale content removed
   */
  pruneStaleToolResults(history: ContextMessage[], maxThreshold?: number): ContextMessage[] {
    const threshold = maxThreshold ?? this.config.maxThreshold;

    if (!Array.isArray(history) || history.length === 0) {
      return history;
    }

    const estimatedTokens = this.estimateTokens(history);

    // If under threshold, return as-is
    if (estimatedTokens <= threshold) {
      return [...history];
    }

    // Create a copy to avoid mutating original
    const result: ContextMessage[] = [];

    // Always preserve first system message
    if (history.length > 0 && history[0].role === 'system') {
      result.push({ ...history[0] });
    }

    // Find where recent turns start (to preserve them)
    const firstRecentTurnIdx = this.getFirstRecentTurnIndex(history);

    // Process middle messages (between system and recent turns)
    for (let i = 1; i < firstRecentTurnIdx; i++) {
      const msg = history[i];
      const processedMsg = this.processMessage(msg);
      result.push(processedMsg);
    }

    // Preserve recent turns completely intact
    for (let i = firstRecentTurnIdx; i < history.length; i++) {
      result.push({ ...history[i] });
    }

    return result;
  }

  /**
   * Processes a single message by removing thinking blocks and tool outputs
   */
  private processMessage(msg: ContextMessage): ContextMessage {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

    // Strip thinking blocks
    const cleanedContent = this.stripThinkingBlocks(content);

    // If it's a tool message, we can remove it entirely or truncate it
    if (this.isToolMessage(msg.role)) {
      return {
        ...msg,
        content: '[tool result pruned for context optimization]',
      };
    }

    // Return message with cleaned content
    return {
      ...msg,
      content: cleanedContent,
    };
  }

  /**
   * Get detailed optimization result with statistics
   */
  getOptimizationResult(history: ContextMessage[], maxThreshold?: number): OptimizationResult {
    const threshold = maxThreshold ?? this.config.maxThreshold;

    if (!Array.isArray(history) || history.length === 0) {
      return {
        originalLength: 0,
        optimizedLength: 0,
        removedToolResults: 0,
        removedThinkingBlocks: 0,
        preservedSystem: false,
        preservedRecentTurns: 0,
      };
    }

    const originalLength = history.length;
    const optimized = this.pruneStaleToolResults(history, threshold);
    const optimizedLength = optimized.length;

    // Count removed items
    let removedToolResults = 0;
    let removedThinkingBlocks = 0;

    for (let i = 1; i < originalLength; i++) {
      const msg = history[i];
      const firstRecentIdx = this.getFirstRecentTurnIndex(history);

      // Only count removals from non-recent turns
      if (i >= firstRecentIdx) {
        continue;
      }

      if (this.isToolMessage(msg.role)) {
        removedToolResults++;
      }
      if (this.isThinkingBlock(typeof msg.content === 'string' ? msg.content : '')) {
        removedThinkingBlocks++;
      }
    }

    return {
      originalLength,
      optimizedLength,
      removedToolResults,
      removedThinkingBlocks,
      preservedSystem: history.length > 0 && history[0].role === 'system',
      preservedRecentTurns: this.config.preserveRecentTurns,
    };
  }

  /**
   * Static convenience method for quick optimization
   */
  static optimize(history: ContextMessage[], maxThreshold?: number): ContextMessage[] {
    const optimizer = new ContextOptimizer();
    return optimizer.pruneStaleToolResults(history, maxThreshold);
  }
}
