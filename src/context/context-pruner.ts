// Context Editor - Active History Cleaning for Agent Loop
// Monitors session token size and applies cleaning strategies when limit is exceeded

/**
 * Message structure for agent conversation context
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_invocation' | 'tool_result';
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
 * Configuration for ContextEditor
 */
export interface ContextEditorConfig {
  /** Maximum token limit before triggering cleaning (default: 100000) */
  maxTokens: number;
  /** Warning threshold as percentage (default: 0.8 = 80%) */
  warningThreshold: number;
  /** Percentage of oldest tool results to remove (default: 0.5 = 50%) */
  toolResultRemovalPercentage: number;
  /** Preserve recent N messages from cleaning (default: 10) */
  preserveRecentMessages: number;
  /** Essential tool names that should never be pruned */
  essentialTools: string[];
  /** Enable thinking block clearing */
  enableThinkingClearing: boolean;
  /** Enable tool result clearing */
  enableToolResultClearing: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CONTEXT_EDITOR_CONFIG: ContextEditorConfig = {
  maxTokens: 100000,
  warningThreshold: 0.8,
  toolResultRemovalPercentage: 0.5,
  preserveRecentMessages: 10,
  essentialTools: ['Read', 'Glob', 'Grep'],
  enableThinkingClearing: true,
  enableToolResultClearing: true
};

/**
 * Result of context editing operation
 */
export interface ContextEditResult {
  messages: ContextMessage[];
  originalTokenCount: number;
  newTokenCount: number;
  tokensSaved: number;
  toolResultsCleared: number;
  thinkingBlocksCleared: number;
  strategyApplied: ContextEditStrategy;
  warnings: string[];
}

/**
 * Strategies applied for context cleaning
 */
export type ContextEditStrategy = 'none' | 'thinking_block_clearing' | 'tool_result_clearing' | 'both';

/**
 * Token estimation result
 */
export interface TokenEstimation {
  total: number;
  byRole: Map<string, number>;
  byMessage: Array<{ index: number; tokens: number }>;
}

/**
 * ContextEditor - Active context management for agent loops
 *
 * Monitors session token size and applies cleaning strategies when limit is exceeded:
 * 1. ToolResultClearing: Remove oldest tool invocations and results
 * 2. ThinkingBlockClearing: Remove <thinking>...</thinking> blocks from assistant messages
 */
export class ContextEditor {
  private config: ContextEditorConfig;
  private messageCount: number;
  private lastTokenCount: number;

  constructor(config: Partial<ContextEditorConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_EDITOR_CONFIG, ...config };
    this.messageCount = 0;
    this.lastTokenCount = 0;
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextEditorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(partial: Partial<ContextEditorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Estimate token count for messages
   * Uses simple estimation: ~4 characters per token
   */
  estimateTokens(messages: ContextMessage[]): TokenEstimation {
    const byRole = new Map<string, number>();
    const byMessage: Array<{ index: number; tokens: number }> = [];

    let total = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      // Add tokens for tool calls
      let toolCallTokens = 0;
      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        for (const tc of msg.toolCalls) {
          toolCallTokens += estimateTokenCount(tc.function.name) +
            estimateTokenCount(tc.function.arguments);
        }
      }

      const contentTokens = estimateTokenCount(content);
      const msgTokens = contentTokens + toolCallTokens;

      byMessage.push({ index: i, tokens: msgTokens });
      total += msgTokens;

      // Track by role
      const roleCount = byRole.get(msg.role) || 0;
      byRole.set(msg.role, roleCount + msgTokens);
    }

    return { total, byRole, byMessage };
  }

  /**
   * Check if context needs cleaning
   */
  needsCleaning(messages: ContextMessage[]): boolean {
    const { total } = this.estimateTokens(messages);
    return total > this.config.maxTokens * this.config.warningThreshold;
  }

  /**
   * Check current token status
   */
  getTokenStatus(messages: ContextMessage[]): {
    current: number;
    limit: number;
    percentage: number;
    needsCleaning: boolean;
    warning: boolean;
  } {
    const { total } = this.estimateTokens(messages);
    const percentage = total / this.config.maxTokens;

    return {
      current: total,
      limit: this.config.maxTokens,
      percentage,
      needsCleaning: total > this.config.maxTokens,
      warning: percentage >= this.config.warningThreshold
    };
  }

  /**
   * Main editing method - applies appropriate cleaning strategy
   */
  editContext(messages: ContextMessage[]): ContextEditResult {
    const originalTokens = this.estimateTokens(messages);
    const originalTokenCount = originalTokens.total;

    const result: ContextEditResult = {
      messages: [...messages],
      originalTokenCount,
      newTokenCount: originalTokenCount,
      tokensSaved: 0,
      toolResultsCleared: 0,
      thinkingBlocksCleared: 0,
      strategyApplied: 'none',
      warnings: []
    };

    // Check if cleaning is needed
    if (originalTokenCount <= this.config.maxTokens * this.config.warningThreshold) {
      result.newTokenCount = originalTokenCount;
      return result;
    }

    let processedMessages = [...messages];
    let strategy: ContextEditStrategy = 'none';

    // Apply thinking block clearing
    if (this.config.enableThinkingClearing) {
      const thinkingResult = this.applyThinkingBlockClearing(processedMessages);
      processedMessages = thinkingResult.messages;
      result.thinkingBlocksCleared = thinkingResult.cleared;
      if (thinkingResult.cleared > 0) {
        strategy = 'thinking_block_clearing';
      }
    }

    // Apply tool result clearing if still over threshold
    const afterThinking = this.estimateTokens(processedMessages);
    if (afterThinking.total > this.config.maxTokens && this.config.enableToolResultClearing) {
      const toolResult = this.applyToolResultClearing(processedMessages);
      processedMessages = toolResult.messages;
      result.toolResultsCleared = toolResult.cleared;

      if (toolResult.cleared > 0) {
        strategy = strategy === 'thinking_block_clearing' ? 'both' : 'tool_result_clearing';
      }
    }

    const finalTokens = this.estimateTokens(processedMessages);

    result.messages = processedMessages;
    result.newTokenCount = finalTokens.total;
    result.tokensSaved = originalTokenCount - finalTokens.total;
    result.strategyApplied = strategy;

    // Add warning if still over limit
    if (result.newTokenCount > this.config.maxTokens) {
      result.warnings.push(`Still over token limit after cleaning: ${result.newTokenCount} > ${this.config.maxTokens}`);
    }

    this.lastTokenCount = result.newTokenCount;
    this.messageCount = messages.length;

    return result;
  }

  /**
   * Strategy 1: ToolResultClearing
   * Removes oldest tool invocations and results, preserving essential tools
   */
  applyToolResultClearing(messages: ContextMessage[]): {
    messages: ContextMessage[];
    cleared: number;
  } {
    if (messages.length <= this.config.preserveRecentMessages) {
      return { messages, cleared: 0 };
    }

    // Identify indices of tool-related messages
    const toolMessages: Array<{
      index: number;
      message: ContextMessage;
      isEssential: boolean;
    }> = [];

    for (let i = 0; i < messages.length - this.config.preserveRecentMessages; i++) {
      const msg = messages[i];

      // Check for tool role or tool_calls
      if (msg.role === 'tool' || msg.role === 'tool_result' || msg.role === 'tool_invocation') {
        // Check if this is an essential tool
        let isEssential = false;

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (this.config.essentialTools.includes(tc.function.name)) {
              isEssential = true;
              break;
            }
          }
        }

        if (msg.name && this.config.essentialTools.includes(msg.name)) {
          isEssential = true;
        }

        toolMessages.push({ index: i, message: msg, isEssential });
      }
    }

    // Separate essential and non-essential
    const nonEssential = toolMessages.filter(t => !t.isEssential);
    const essential = toolMessages.filter(t => t.isEssential);

    // Calculate how many to remove
    const removeCount = Math.floor(nonEssential.length * this.config.toolResultRemovalPercentage);

    // Get indices to remove (oldest non-essential)
    const indicesToRemove = new Set(
      nonEssential
        .slice(0, removeCount)
        .map(t => t.index)
    );

    // Build result
    const result: ContextMessage[] = [];
    let cleared = 0;

    for (let i = 0; i < messages.length; i++) {
      if (indicesToRemove.has(i)) {
        // Replace with placeholder
        result.push({
          ...messages[i],
          content: '[Tool output pruned]',
          pruned: true
        });
        cleared++;
      } else {
        result.push(messages[i]);
      }
    }

    return { messages: result, cleared };
  }

  /**
   * Strategy 2: ThinkingBlockClearing
   * Removes <thinking>...</thinking> blocks from assistant messages
   */
  applyThinkingBlockClearing(messages: ContextMessage[]): {
    messages: ContextMessage[];
    cleared: number;
  } {
    let totalCleared = 0;

    const result = messages.map((msg, index) => {
      if (msg.role !== 'assistant' || typeof msg.content !== 'string') {
        return msg;
      }

      const originalLength = msg.content.length;
      const cleanedContent = removeThinkingBlocks(msg.content);
      const newLength = cleanedContent.length;

      if (newLength < originalLength) {
        totalCleared++;
        return {
          ...msg,
          content: cleanedContent,
          thinkingRemoved: true
        };
      }

      return msg;
    });

    return { messages: result, cleared: totalCleared };
  }

  /**
   * Get statistics about current context
   */
  getStatistics(messages: ContextMessage[]): {
    messageCount: number;
    tokenCount: number;
    byRole: Record<string, number>;
    oldestTimestamp?: string;
    newestTimestamp?: string;
  } {
    const estimation = this.estimateTokens(messages);

    const byRole: Record<string, number> = {};
    estimation.byRole.forEach((value, key) => {
      byRole[key] = value;
    });

    let oldestTimestamp: string | undefined;
    let newestTimestamp: string | undefined;

    for (const msg of messages) {
      if (msg.timestamp) {
        if (!oldestTimestamp || msg.timestamp < oldestTimestamp) {
          oldestTimestamp = msg.timestamp;
        }
        if (!newestTimestamp || msg.timestamp > newestTimestamp) {
          newestTimestamp = msg.timestamp;
        }
      }
    }

    return {
      messageCount: messages.length,
      tokenCount: estimation.total,
      byRole,
      oldestTimestamp,
      newestTimestamp
    };
  }

  /**
   * Reset editor state
   */
  reset(): void {
    this.messageCount = 0;
    this.lastTokenCount = 0;
  }
}

/**
 * Remove <thinking>...</thinking> blocks from content
 */
function removeThinkingBlocks(content: string): string {
  // Match <thinking>...</thinking> blocks (case insensitive, multiline)
  const thinkingRegex = /<thinking>[\s\S]*?<\/thinking>/gi;
  return content.replace(thinkingRegex, '').trim();
}

/**
 * Estimate token count for a string
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Pure function version - edit context with default config
 */
export function editContext(
  messages: ContextMessage[],
  config?: Partial<ContextEditorConfig>
): ContextEditResult {
  const editor = new ContextEditor(config);
  return editor.editContext(messages);
}

/**
 * Pure function - apply thinking block clearing
 */
export function clearThinkingBlocks(messages: ContextMessage[]): ContextMessage[] {
  const editor = new ContextEditor();
  return editor.applyThinkingBlockClearing(messages).messages;
}

/**
 * Pure function - apply tool result clearing
 */
export function clearToolResults(
  messages: ContextMessage[],
  config?: Partial<ContextEditorConfig>
): ContextMessage[] {
  const editor = new ContextEditor(config);
  return editor.applyToolResultClearing(messages).messages;
}

/**
 * Pure function - check if context needs cleaning
 */
export function needsContextCleaning(
  messages: ContextMessage[],
  maxTokens: number = DEFAULT_CONTEXT_EDITOR_CONFIG.maxTokens,
  warningThreshold: number = DEFAULT_CONTEXT_EDITOR_CONFIG.warningThreshold
): boolean {
  const editor = new ContextEditor({ maxTokens, warningThreshold });
  return editor.needsCleaning(messages);
}

export default ContextEditor;
