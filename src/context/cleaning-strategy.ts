// Unified Cleaning Strategy - Context Noise Reduction
// Provides a unified interface for all cleaning operations in the context pipeline

/**
 * Message structure for context messages
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result' | 'tool_invocation';
  content: string;
  timestamp?: string;
  name?: string;
  tool_call_id?: string;
  toolCalls?: ToolCall[];
  [key: string]: unknown;
}

/**
 * Tool invocation structure (OpenAI-compatible)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Types of cleaning strategies available
 */
export type CleaningStrategyType = 'thought-block' | 'stale-tool' | 'combined';

/**
 * Enum for cleaning patterns - defines what content to remove
 */
export enum CleaningPattern {
  /** <thought>...</thought> block pattern */
  THOUGHT = '<thought>',
  /** <thinking>...</thinking> block pattern */
  THINKING = '<thinking>',
  /** <reflection>...</reflection> block pattern */
  REFLECTION = '<reflection>',
  /** <internal_thought>...</internal_thought> block pattern */
  INTERNAL_THOUGHT = '<internal_thought>',
  /** Tool result pruning */
  STALE_TOOL_RESULT = 'stale_tool_result',
  /** All thought patterns combined */
  ALL = 'all'
}

/**
 * Options for cleaning strategies
 */
export interface CleaningOptions {
  /** Maximum tokens before triggering cleaning (default: 128000) */
  maxTokens?: number;
  /** Warning threshold as percentage (default: 0.8) */
  warningThreshold?: number;
  /** Percentage of oldest tool results to remove (default: 0.5) */
  staleToolRemovalPercentage?: number;
  /** Threshold for stale tool removal (default: 0.8) */
  staleToolRemovalThreshold?: number;
  /** Preserve recent N messages from cleaning (default: 10) */
  preserveRecentMessages?: number;
  /** Essential tool names that should never be pruned */
  essentialTools?: string[];
  /** Keep thought blocks from current turn (default: true) */
  keepCurrentTurnThoughts?: boolean;
  /** Patterns to remove in addition to thought blocks */
  additionalPatterns?: string[];
}

/**
 * Result of a cleaning operation
 */
export interface CleaningResult {
  messages: ContextMessage[];
  /** Number of thought/thinking blocks removed */
  removedThoughtBlocks: number;
  /** Number of tool outputs removed */
  removedToolOutputs: number;
  /** Estimated token reduction */
  tokenReduction: number;
  /** Strategy applied */
  strategyType: CleaningStrategyType;
  /** Whether threshold was exceeded */
  thresholdExceeded: boolean;
}

/**
 * Base interface for all cleaning strategies
 */
export interface CleaningStrategy {
  /** Unique identifier for the strategy */
  readonly type: CleaningStrategyType;
  /** Human-readable name */
  readonly name: string;
  /**
   * Apply the cleaning strategy to messages
   */
  clean(messages: ContextMessage[], options?: CleaningOptions): CleaningResult;
  /**
   * Check if cleaning is needed based on current state
   */
  needsCleaning(messages: ContextMessage[], options?: CleaningOptions): boolean;
}

/**
 * Default cleaning options
 */
export const DEFAULT_CLEANING_OPTIONS: Required<CleaningOptions> = {
  maxTokens: 128000,
  warningThreshold: 0.8,
  staleToolRemovalPercentage: 0.5,
  staleToolRemovalThreshold: 0.8,
  preserveRecentMessages: 10,
  essentialTools: ['Read', 'Glob', 'Grep'],
  keepCurrentTurnThoughts: true,
  additionalPatterns: []
};

/**
 * ThoughtBlockStrategy - Removes thought and thinking blocks from content
 *
 * Removes both `<thought>...</thought>` and `<thinking>...</thinking>` patterns
 * from previous turns while optionally keeping the current turn's thought blocks.
 */
export class ThoughtBlockStrategy implements CleaningStrategy {
  readonly type: CleaningStrategyType = 'thought-block';
  readonly name = 'Thought Block Strategy';

  clean(messages: ContextMessage[], options?: CleaningOptions): CleaningResult {
    const opts = { ...DEFAULT_CLEANING_OPTIONS, ...options };
    const result: CleaningResult = {
      messages: [],
      removedThoughtBlocks: 0,
      removedToolOutputs: 0,
      tokenReduction: 0,
      strategyType: this.type,
      thresholdExceeded: false
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      result.messages = messages;
      return result;
    }

    // Find the most recent assistant message (current turn)
    let currentTurnIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        currentTurnIndex = i;
        break;
      }
    }

    // Process messages
    const processed: ContextMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isCurrentTurn = i === currentTurnIndex;

      if (isCurrentTurn && opts.keepCurrentTurnThoughts) {
        // Keep current turn as-is
        processed.push({ ...msg });
      } else {
        // Remove thought blocks from previous turns
        const originalLength = typeof msg.content === 'string' ? msg.content.length : 0;
        const cleaned = this.removeThoughtBlocks(msg.content, opts.additionalPatterns);
        const newLength = cleaned.length;

        if (newLength < originalLength) {
          result.removedThoughtBlocks++;
          result.tokenReduction += originalLength - newLength;
        }

        processed.push({
          ...msg,
          content: cleaned
        });
      }
    }

    result.messages = processed;
    return result;
  }

  needsCleaning(messages: ContextMessage[], options?: CleaningOptions): boolean {
    const opts = { ...DEFAULT_CLEANING_OPTIONS, ...options };
    const tokens = this.estimateTokens(messages);
    return tokens >= opts.maxTokens * opts.warningThreshold;
  }

  /**
   * Remove thought and thinking blocks from content
   */
  private removeThoughtBlocks(content: unknown, additionalPatterns: string[] = []): string {
    if (typeof content !== 'string') {
      return String(content);
    }

    let result = content;

    // Remove <thought>...</thought> blocks
    const thoughtRegex = /<thought>[\s\S]*?<\/thought>/gi;
    result = result.replace(thoughtRegex, '');

    // Remove <thinking>...</thinking> blocks
    const thinkingRegex = /<thinking>[\s\S]*?<\/thinking>/gi;
    result = result.replace(thinkingRegex, '');

    // Remove additional patterns
    for (const pattern of additionalPatterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        result = result.replace(regex, '');
      } catch {
        // Invalid regex, skip
      }
    }

    return result.trim();
  }

  /**
   * Estimate token count
   */
  private estimateTokens(messages: ContextMessage[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + Math.ceil(content.length / 4);
    }, 0);
  }
}

/**
 * StaleToolStrategy - Removes stale tool results when context approaches limit
 *
 * Removes a percentage of the oldest tool results while preserving essential tools.
 */
export class StaleToolStrategy implements CleaningStrategy {
  readonly type: CleaningStrategyType = 'stale-tool';
  readonly name = 'Stale Tool Strategy';

  clean(messages: ContextMessage[], options?: CleaningOptions): CleaningResult {
    const opts = { ...DEFAULT_CLEANING_OPTIONS, ...options };
    const result: CleaningResult = {
      messages: [],
      removedThoughtBlocks: 0,
      removedToolOutputs: 0,
      tokenReduction: 0,
      strategyType: this.type,
      thresholdExceeded: false
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      result.messages = messages;
      return result;
    }

    // Calculate current token count
    const currentTokens = this.estimateTokens(messages);
    const threshold = opts.maxTokens * opts.staleToolRemovalThreshold;
    result.thresholdExceeded = currentTokens >= threshold;

    // If below threshold, return as-is
    if (!result.thresholdExceeded) {
      result.messages = messages;
      return result;
    }

    // Collect tool_result messages with their indices
    const toolResults: Array<{ index: number; message: ContextMessage; tokens: number }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'tool_result') {
        const tokens = this.estimateMessageTokens(msg);
        toolResults.push({ index: i, message: msg, tokens });
      }
    }

    // If no tool results, return as-is
    if (toolResults.length === 0) {
      result.messages = messages;
      return result;
    }

    // Filter out essential tools
    const nonEssential = toolResults.filter(tr => {
      const toolName = tr.message.name;
      return !toolName || !opts.essentialTools.includes(toolName);
    });

    // Calculate how many to remove (oldest ones)
    const removeCount = Math.floor(nonEssential.length * opts.staleToolRemovalPercentage);
    const removeIndices = new Set(
      nonEssential
        .slice(0, removeCount)
        .map(t => t.index)
    );

    // Build result with pruned tool results
    const finalMessages: ContextMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'tool_result' && removeIndices.has(i)) {
        finalMessages.push({
          ...msg,
          content: '[Tool output pruned]',
          pruned: true
        });
        result.removedToolOutputs++;
        result.tokenReduction += toolResults.find(t => t.index === i)?.tokens || 0;
      } else {
        finalMessages.push(msg);
      }
    }

    result.messages = finalMessages;
    return result;
  }

  needsCleaning(messages: ContextMessage[], options?: CleaningOptions): boolean {
    const opts = { ...DEFAULT_CLEANING_OPTIONS, ...options };
    const tokens = this.estimateTokens(messages);
    return tokens >= opts.maxTokens * opts.staleToolRemovalThreshold;
  }

  /**
   * Estimate tokens for a message
   */
  private estimateMessageTokens(msg: ContextMessage): number {
    let tokens = Math.ceil(String(msg.content).length / 4);

    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        tokens += Math.ceil(tc.function.name.length / 4);
        tokens += Math.ceil(tc.function.arguments.length / 4);
      }
    }

    return tokens;
  }

  /**
   * Estimate token count for messages
   */
  private estimateTokens(messages: ContextMessage[]): number {
    return messages.reduce((total, msg) => {
      return total + this.estimateMessageTokens(msg);
    }, 0);
  }
}

/**
 * CombinedStrategy - Applies both thought block and stale tool cleaning
 *
 * First applies thought block cleaning, then applies stale tool cleaning
 * if the context is still over the threshold.
 */
export class CombinedStrategy implements CleaningStrategy {
  readonly type: CleaningStrategyType = 'combined';
  readonly name = 'Combined Cleaning Strategy';

  private thoughtStrategy: ThoughtBlockStrategy;
  private toolStrategy: StaleToolStrategy;

  constructor() {
    this.thoughtStrategy = new ThoughtBlockStrategy();
    this.toolStrategy = new StaleToolStrategy();
  }

  clean(messages: ContextMessage[], options?: CleaningOptions): CleaningResult {
    const opts = { ...DEFAULT_CLEANING_OPTIONS, ...options };

    // First, apply thought block cleaning
    const thoughtResult = this.thoughtStrategy.clean(messages, opts);

    // Then, apply stale tool cleaning if still needed
    const toolResult = this.toolStrategy.clean(thoughtResult.messages, opts);

    // Combine results
    const result: CleaningResult = {
      messages: toolResult.messages,
      removedThoughtBlocks: thoughtResult.removedThoughtBlocks,
      removedToolOutputs: toolResult.removedToolOutputs,
      tokenReduction: thoughtResult.tokenReduction + toolResult.tokenReduction,
      strategyType: this.type,
      thresholdExceeded: toolResult.thresholdExceeded
    };

    return result;
  }

  needsCleaning(messages: ContextMessage[], options?: CleaningOptions): boolean {
    // Check if either strategy needs cleaning
    return this.thoughtStrategy.needsCleaning(messages, options) ||
           this.toolStrategy.needsCleaning(messages, options);
  }
}

/**
 * Factory function to create cleaning strategies
 *
 * @param type - Type of strategy to create
 * @param options - Optional configuration
 * @returns CleaningStrategy instance
 *
 * @example
 * ```typescript
 * // Create thought block strategy
 * const thoughtStrategy = createCleaningStrategy('thought-block');
 *
 * // Create stale tool strategy with custom options
 * const toolStrategy = createCleaningStrategy('stale-tool', {
 *   staleToolRemovalPercentage: 0.3,
 *   essentialTools: ['Read', 'Glob', 'Grep', 'Edit']
 * });
 *
 * // Create combined strategy
 * const combined = createCleaningStrategy('combined');
 * ```
 */
export function createCleaningStrategy(
  type: CleaningStrategyType,
  options?: CleaningOptions
): CleaningStrategy {
  switch (type) {
    case 'thought-block':
      return new ThoughtBlockStrategy();
    case 'stale-tool':
      return new StaleToolStrategy();
    case 'combined':
      return new CombinedStrategy();
    default:
      throw new Error(`Unknown cleaning strategy type: ${type}`);
  }
}

/**
 * Convenience function to clean messages with default options
 *
 * @param messages - Messages to clean
 * @param type - Strategy type (default: 'combined')
 * @param options - Optional configuration
 * @returns CleaningResult
 */
export function cleanMessages(
  messages: ContextMessage[],
  type: CleaningStrategyType = 'combined',
  options?: CleaningOptions
): CleaningResult {
  const strategy = createCleaningStrategy(type, options);
  return strategy.clean(messages, options);
}

/**
 * Estimate token count for messages
 */
export function estimateCleaningTokens(messages: ContextMessage[]): number {
  return messages.reduce((total, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    let tokens = Math.ceil(content.length / 4);

    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        tokens += Math.ceil(tc.function.name.length / 4);
        tokens += Math.ceil(tc.function.arguments.length / 4);
      }
    }

    return total + tokens;
  }, 0);
}

// Aliases for backward compatibility with existing exports
export type CleaningType = CleaningStrategyType;
export type CleaningConfig = CleaningOptions;
export const DEFAULT_CLEANING_CONFIG = DEFAULT_CLEANING_OPTIONS;

// Aliases for strategy classes
export type ThoughtBlockCleaning = ThoughtBlockStrategy;
export type ToolResultCleaning = StaleToolStrategy;
export type CompositeCleaningStrategy = CombinedStrategy;

// Alias for clean function
export const cleanContext = cleanMessages;

/**
 * ContextCleaner - Unified cleaner supporting multiple patterns
 *
 * Provides a simple interface for cleaning context with multiple patterns.
 * Supports all CleaningPattern enum values and custom patterns.
 */
export class ContextCleaner {
  private patterns: CleaningPattern[];
  private options: CleaningOptions;

  constructor(
    patterns: CleaningPattern[] = [CleaningPattern.THOUGHT, CleaningPattern.THINKING],
    options: Partial<CleaningOptions> = {}
  ) {
    this.patterns = patterns;
    this.options = { ...DEFAULT_CLEANING_OPTIONS, ...options };
  }

  /**
   * Clean messages by removing specified patterns
   */
  clean(messages: ContextMessage[]): ContextMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
      return messages;
    }

    let result = [...messages];

    // Apply each pattern
    for (const pattern of this.patterns) {
      result = this.applyPattern(result, pattern);
    }

    return result;
  }

  /**
   * Apply a specific cleaning pattern to messages
   */
  private applyPattern(messages: ContextMessage[], pattern: CleaningPattern): ContextMessage[] {
    return messages.map(msg => {
      if (typeof msg.content !== 'string') {
        return msg;
      }

      let content = msg.content;

      switch (pattern) {
        case CleaningPattern.THOUGHT:
          content = content.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
          break;
        case CleaningPattern.THINKING:
          content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
          break;
        case CleaningPattern.REFLECTION:
          content = content.replace(/<reflection>[\s\S]*?<\/reflection>/gi, '').trim();
          break;
        case CleaningPattern.INTERNAL_THOUGHT:
          content = content.replace(/<internal_thought>[\s\S]*?<\/internal_thought>/gi, '').trim();
          break;
        case CleaningPattern.STALE_TOOL_RESULT:
          // Handled separately via StaleToolStrategy
          break;
        case CleaningPattern.ALL:
          content = content
            .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
            .replace(/<internal_thought>[\s\S]*?<\/internal_thought>/gi, '')
            .trim();
          break;
      }

      return { ...msg, content };
    });
  }

  /**
   * Update patterns dynamically
   */
  setPatterns(patterns: CleaningPattern[]): void {
    this.patterns = patterns;
  }

  /**
   * Update options
   */
  setOptions(options: Partial<CleaningOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): CleaningOptions {
    return { ...this.options };
  }

  /**
   * Get current patterns
   */
  getPatterns(): CleaningPattern[] {
    return [...this.patterns];
  }
}

// ============================================================================
// Backward Compatibility Functions - Bridge to existing modules
// ============================================================================

/**
 * Compatibility function for pruning.ts (ContextEditor)
 * Removes thinking blocks and tool results
 *
 * @param messages - Messages to clean
 * @param options - Optional configuration
 * @returns Cleaned messages
 */
export function pruneContext(
  messages: ContextMessage[],
  options?: Partial<CleaningOptions>
): ContextMessage[] {
  const cleaner = new ContextCleaner(
    [CleaningPattern.THOUGHT, CleaningPattern.THINKING, CleaningPattern.STALE_TOOL_RESULT],
    options
  );
  return cleaner.clean(messages);
}

/**
 * Compatibility function for context-pruner.ts (thinkingBlockClearing)
 * Removes thought blocks from previous turns
 *
 * @param messages - Messages to clean
 * @returns Cleaned messages
 */
export function removeThoughtBlocks(messages: ContextMessage[]): ContextMessage[] {
  const cleaner = new ContextCleaner([CleaningPattern.THOUGHT]);
  return cleaner.clean(messages);
}

/**
 * Compatibility function for pruner.ts (pruneStaleTools)
 * Removes stale tool results
 *
 * @param history - History to prune
 * @param maxRecentIterations - Maximum recent iterations to keep
 * @returns Pruned history
 */
export function pruneStaleTools(
  history: ContextMessage[],
  maxRecentIterations: number = 10
): ContextMessage[] {
  const result: ContextMessage[] = [];
  let iterationCount = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];

    if (message.role === 'tool') {
      iterationCount++;
    }

    if (message.role === 'tool_result') {
      let toolResultIteration = 0;
      for (let j = i; j < history.length; j++) {
        if (history[j].role === 'tool') {
          toolResultIteration++;
        }
      }

      if (toolResultIteration > maxRecentIterations) {
        result.unshift({
          ...message,
          role: 'tool_result',
          content: '[Tool output pruned]'
        });
        continue;
      }
    }

    result.unshift(message);
  }

  return result;
}

/**
 * Get regex pattern for a CleaningPattern
 */
export function getPatternRegex(pattern: CleaningPattern): RegExp {
  switch (pattern) {
    case CleaningPattern.THOUGHT:
      return /<thought>[\s\S]*?<\/thought>/gi;
    case CleaningPattern.THINKING:
      return /<thinking>[\s\S]*?<\/thinking>/gi;
    case CleaningPattern.REFLECTION:
      return /<reflection>[\s\S]*?<\/reflection>/gi;
    case CleaningPattern.INTERNAL_THOUGHT:
      return /<internal_thought>[\s\S]*?<\/internal_thought>/gi;
    case CleaningPattern.ALL:
    default:
      return /<(?:thought|thinking|reflection|internal_thought)>[\s\S]*?<\/(?:thought|thinking|reflection|internal_thought)>/gi;
  }
}

/**
 * Check if content contains a specific pattern
 */
export function hasPattern(content: string, pattern: CleaningPattern): boolean {
  const regex = getPatternRegex(pattern);
  return regex.test(content);
}

/**
 * Count occurrences of a pattern in content
 */
export function countPatternOccurrences(content: string, pattern: CleaningPattern): number {
  const regex = getPatternRegex(pattern);
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}
