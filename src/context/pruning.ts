// Aggressive Context Noise Cleaning - Active Context Layer
// Remove thought blocks from previous turns and prune stale tool outputs

/**
 * Message structure for context messages
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result';
  content: string;
  timestamp?: string;
  name?: string;
  tool_call_id?: string;
  [key: string]: unknown;
}

/**
 * Active Window Configuration
 */
export interface ActiveWindowConfig {
  maxTokens: number;
  warningThreshold: number;
  staleToolRemovalThreshold: number;
  staleToolRemovalPercentage: number;
}

/**
 * Result of cleaning operation
 */
export interface CleaningResult {
  messages: ContextMessage[];
  removedThoughtBlocks: number;
  removedToolOutputs: number;
  tokenReduction: number;
}

/**
 * thinkingBlockClearing - Remove thought blocks from previous turns
 *
 * Keeps only the <thought> block from the current turn (most recent assistant message)
 * and removes all <thought> blocks from previous turns in the active context.
 *
 * This helps reduce noise from reasoning traces while preserving the latest thinking.
 *
 * @param messages - Array of context messages
 * @returns New array with thought blocks removed from previous turns
 */
export function thinkingBlockClearing(messages: ContextMessage[]): ContextMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  // Find the most recent assistant message (current turn)
  let currentTurnIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].content) {
      currentTurnIndex = i;
      break;
    }
  }

  // If no assistant message found, remove all thought blocks
  if (currentTurnIndex === -1) {
    return messages.map(msg => ({
      ...msg,
      content: removeThoughtBlock(msg.content)
    }));
  }

  // Process messages: keep thought block only for current turn
  const result: ContextMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (i === currentTurnIndex) {
      // Keep the current turn as-is (with thought block)
      result.push({ ...msg });
    } else {
      // Remove thought blocks from previous turns
      result.push({
        ...msg,
        content: removeThoughtBlock(msg.content)
      });
    }
  }

  return result;
}

/**
 * Remove <thought>...</thought> block from content
 */
function removeThoughtBlock(content: unknown): string {
  if (typeof content !== 'string') {
    return String(content);
  }

  // Match <thought>...</thought> block (case insensitive, multiline)
  // This regex removes the entire thought block including the tags
  const thoughtRegex = /<thought>[\s\S]*?<\/thought>/gi;

  return content.replace(thoughtRegex, '').trim();
}

/**
 * staleToolClearing - Remove stale tool outputs when context approaches limit
 *
 * When context window reaches the specified threshold (default: 80%),
 * removes a percentage of the oldest tool results (default: 50%).
 *
 * This is a more aggressive cleaning than pruneStaleTools as it:
 * - Uses percentage-based removal
 * - Triggers based on actual token threshold
 * - Removes even more aggressively at high context usage
 *
 * @param messages - Array of context messages
 * @param config - Configuration for when to trigger cleaning
 * @returns Cleaned messages if threshold reached, original messages otherwise
 */
export function staleToolClearing(
  messages: ContextMessage[],
  config: ActiveWindowConfig
): CleaningResult {
  const result: CleaningResult = {
    messages: [],
    removedThoughtBlocks: 0,
    removedToolOutputs: 0,
    tokenReduction: 0
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    result.messages = messages;
    return result;
  }

  // Calculate current token count
  const currentTokens = calculateTokenCount(messages);
  const threshold = config.maxTokens * config.staleToolRemovalThreshold;

  // If below threshold, return messages as-is
  if (currentTokens < threshold) {
    result.messages = messages;
    return result;
  }

  // First, apply thought block clearing
  const thoughtCleaned = thinkingBlockClearing(messages);
  result.removedThoughtBlocks = countRemovedThoughtBlocks(messages, thoughtCleaned);

  // Now handle stale tool outputs
  // Collect tool_result messages with their indices
  const toolResults: Array<{ index: number; message: ContextMessage; tokens: number }> = [];

  for (let i = 0; i < thoughtCleaned.length; i++) {
    const msg = thoughtCleaned[i];
    if (msg.role === 'tool_result') {
      const tokens = estimateTokens(typeof msg.content === 'string' ? msg.content : String(msg.content));
      toolResults.push({ index: i, message: msg, tokens });
    }
  }

  // If no tool results, return as-is
  if (toolResults.length === 0) {
    result.messages = thoughtCleaned;
    return result;
  }

  // Calculate how many to remove (oldest ones)
  const removeCount = Math.floor(toolResults.length * config.staleToolRemovalPercentage);
  const removeIndices = new Set(
    toolResults
      .slice(0, removeCount)
      .map(t => t.index)
  );

  // Build result with pruned tool results
  const finalMessages: ContextMessage[] = [];

  for (let i = 0; i < thoughtCleaned.length; i++) {
    const msg = thoughtCleaned[i];

    if (msg.role === 'tool_result' && removeIndices.has(i)) {
      // Replace with pruned placeholder
      finalMessages.push({
        ...msg,
        content: '[Tool output pruned - older result]',
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

/**
 * Calculate estimated token count for messages
 */
function calculateTokenCount(messages: ContextMessage[]): number {
  return messages.reduce((total, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return total + estimateTokens(content);
  }, 0);
}

/**
 * Simple token estimation (roughly 4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Count how many thought blocks were removed
 */
function countRemovedThoughtBlocks(original: ContextMessage[], cleaned: ContextMessage[]): number {
  let count = 0;

  for (let i = 0; i < original.length; i++) {
    const origContent = typeof original[i].content === 'string' ? original[i].content : '';
    const cleanContent = typeof cleaned[i].content === 'string' ? cleaned[i].content : '';

    const origThoughts = (origContent.match(/<thought>[\s\S]*?<\/thought>/gi) || []).length;
    const cleanThoughts = (cleanContent.match(/<thought>[\s\S]*?<\/thought>/gi) || []).length;

    count += Math.max(0, origThoughts - cleanThoughts);
  }

  return count;
}

/**
 * Check if context needs aggressive cleaning
 */
export function needsAggressiveCleaning(
  messages: ContextMessage[],
  config: ActiveWindowConfig
): boolean {
  const tokens = calculateTokenCount(messages);
  return tokens >= config.maxTokens * config.staleToolRemovalThreshold;
}

export default {
  thinkingBlockClearing,
  staleToolClearing,
  needsAggressiveCleaning
};
