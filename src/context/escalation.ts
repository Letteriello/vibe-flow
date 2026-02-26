// Three-Level Escalation - LCM paper pattern implementation
// Guarantees 100% success rate in payload reduction through progressive escalation

import {
  CompactionLimits,
  DEFAULT_COMPACTION_LIMITS,
  calculateTargetTokens,
  estimateTokensFromChars,
  estimateCharsFromTokens,
  getLevelConfig
} from './compaction-limits.js';

/**
 * Message structure for context
 */
export interface EscalationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result';
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * Result of escalation summarization
 */
export interface EscalationResult {
  /** Whether the summarization succeeded */
  success: boolean;
  /** The resulting compressed content */
  content: string;
  /** Number of tokens in result */
  tokenCount: number;
  /** Level at which success was achieved (1, 2, or 3) */
  achievedLevel: number;
  /** Total levels attempted */
  levelsAttempted: number[];
  /** Original content token count */
  originalTokenCount: number;
  /** Reduction ratio achieved (0-1, lower is more compressed) */
  reductionRatio: number;
  /** Error message if failed */
  error?: string;
  /** Strategy used at successful level */
  strategy: string;
}

/**
 * Interface for LLM caller - implement this to connect your LLM
 */
export interface LLMCaller {
  /**
   * Call the LLM with a prompt and return the response
   * @param prompt The prompt to send to the LLM
   * @param maxTokens Maximum tokens in the response
   * @returns The LLM response content
   */
  (prompt: string, maxTokens: number): Promise<string>;
}

/**
 * Interface for logging
 */
export interface EscalationLogger {
  (message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

/**
 * Options for escalatedSummarize
 */
export interface EscalationOptions {
  /** Custom compaction limits */
  limits?: CompactionLimits;
  /** Custom LLM caller function */
  llmCaller?: LLMCaller;
  /** Custom logger */
  logger?: EscalationLogger;
  /** Callback when starting a new level */
  onLevelStart?: (level: number, strategy: string, targetTokens: number) => void;
  /** Callback when a level completes */
  onLevelComplete?: (level: number, success: boolean, tokenCount: number) => void;
}

/**
 * Default no-op logger
 */
const defaultLogger: EscalationLogger = () => {};

/**
 * Check if content needs reduction
 */
function needsReduction(originalTokenCount: number, targetTokens: number): boolean {
  return originalTokenCount > targetTokens;
}

/**
 * Level 1: LLM with "preserve details" instruction
 */
async function level1LLMPreserveDetails(
  messages: EscalationMessage[],
  targetTokens: number,
  llmCaller: LLMCaller,
  logger: EscalationLogger,
  onLevelStart?: EscalationOptions['onLevelStart'],
  onLevelComplete?: EscalationOptions['onLevelComplete']
): Promise<{ success: boolean; content: string; tokenCount: number }> {
  const level = 1;
  const levelConfig = getLevelConfig(level);

  onLevelStart?.(level, levelConfig.strategy, targetTokens);
  logger(`[Escalation Level ${level}] Attempting: Preserve details (target: ${targetTokens} tokens)`);

  const prompt = buildSummarizationPrompt(messages, targetTokens, 'preserve_details');

  try {
    const result = await llmCaller(prompt, targetTokens);
    const tokenCount = estimateTokensFromChars(result.length);

    onLevelComplete?.(level, true, tokenCount);
    logger(`[Escalation Level ${level}] Success: ${result.length} chars, ~${tokenCount} tokens`);

    return { success: true, content: result, tokenCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(`[Escalation Level ${level}] Failed: ${errorMsg}`);
    onLevelComplete?.(level, false, 0);
    return { success: false, content: '', tokenCount: 0 };
  }
}

/**
 * Level 2: LLM with "bullet points" instruction (half target tokens)
 */
async function level2LLMBulletPoints(
  messages: EscalationMessage[],
  targetTokens: number,
  llmCaller: LLMCaller,
  logger: EscalationLogger,
  onLevelStart?: EscalationOptions['onLevelStart'],
  onLevelComplete?: EscalationOptions['onLevelComplete']
): Promise<{ success: boolean; content: string; tokenCount: number }> {
  const level = 2;
  const levelConfig = getLevelConfig(level);

  // Use half the target tokens for more aggressive summarization
  const aggressiveTarget = Math.floor(targetTokens * 0.5);

  onLevelStart?.(level, levelConfig.strategy, aggressiveTarget);
  logger(`[Escalation Level ${level}] Attempting: Bullet points (target: ${aggressiveTarget} tokens)`);

  const prompt = buildSummarizationPrompt(messages, aggressiveTarget, 'bullet_points');

  try {
    const result = await llmCaller(prompt, aggressiveTarget);
    const tokenCount = estimateTokensFromChars(result.length);

    onLevelComplete?.(level, true, tokenCount);
    logger(`[Escalation Level ${level}] Success: ${result.length} chars, ~${tokenCount} tokens`);

    return { success: true, content: result, tokenCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(`[Escalation Level ${level}] Failed: ${errorMsg}`);
    onLevelComplete?.(level, false, 0);
    return { success: false, content: '', tokenCount: 0 };
  }
}

/**
 * Level 3: Deterministic truncation (fallback - no LLM)
 */
async function level3DeterministicTruncate(
  messages: EscalationMessage[],
  targetTokens: number,
  logger: EscalationLogger,
  onLevelStart?: EscalationOptions['onLevelStart'],
  onLevelComplete?: EscalationOptions['onLevelComplete']
): Promise<{ success: boolean; content: string; tokenCount: number }> {
  const level = 3;
  const levelConfig = getLevelConfig(level);

  // Use quarter of target for very aggressive truncation
  const aggressiveTarget = Math.floor(targetTokens * 0.25);

  onLevelStart?.(level, levelConfig.strategy, aggressiveTarget);
  logger(`[Escalation Level ${level}] Attempting: Deterministic truncation (target: ${aggressiveTarget} tokens)`);

  try {
    const result = deterministicTruncate(messages, aggressiveTarget);
    const tokenCount = estimateTokensFromChars(result.length);

    onLevelComplete?.(level, true, tokenCount);
    logger(`[Escalation Level ${level}] Success: ${result.length} chars, ~${tokenCount} tokens`);

    return { success: true, content: result, tokenCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger(`[Escalation Level ${level}] Failed: ${errorMsg}`);
    onLevelComplete?.(level, false, 0);
    return { success: false, content: '', tokenCount: 0 };
  }
}

/**
 * Build the prompt for LLM summarization
 */
function buildSummarizationPrompt(
  messages: EscalationMessage[],
  targetTokens: number,
  style: 'preserve_details' | 'bullet_points'
): string {
  const styleInstruction = style === 'preserve_details'
    ? 'Preserve all important details, code snippets, and technical information.'
    : 'Convert to concise bullet points. Focus on key actions, decisions, and outcomes.';

  // Format messages for the prompt
  const formattedMessages = messages.map(m => {
    const role = m.role === 'tool_result' ? 'tool_result' : m.role;
    const content = m.content.substring(0, 2000); // Truncate long content for prompt
    return `[${role}]: ${content}`;
  }).join('\n\n');

  return `Summarize the following conversation context to approximately ${targetTokens} tokens.

${styleInstruction}

IMPORTANT: Your response must be significantly shorter than the original. If you cannot reduce the size effectively, still provide the most important information.

Conversation:
${formattedMessages}

Summary (must be under ${targetTokens * 4} characters):`;
}

/**
 * Deterministic truncation fallback - no LLM required
 * Preserves essential headers and truncates content intelligently
 */
function deterministicTruncate(messages: EscalationMessage[], targetTokens: number): string {
  const maxChars = estimateCharsFromTokens(targetTokens);
  const sections: string[] = [];

  // Add header
  sections.push(`# Context Summary (Truncated)`);
  sections.push(`Original message count: ${messages.length}`);
  sections.push('');

  // Calculate budget per message
  const headerChars = sections.join('\n').length;
  const availableChars = Math.max(100, maxChars - headerChars);
  const budgetPerMessage = Math.floor(availableChars / Math.min(messages.length, 20));

  // Process messages, keeping essential info
  let currentLength = headerChars;

  for (let i = 0; i < messages.length && currentLength < maxChars; i++) {
    const msg = messages[i];
    const role = msg.role === 'tool_result' ? 'tool_result' : msg.role;

    // Extract essential parts
    let content = msg.content;

    // Keep first part of each message (usually contains intent/header)
    if (content.length > budgetPerMessage) {
      content = content.substring(0, budgetPerMessage - 20) + '...';
    }

    const entry = `[${role}]: ${content}`;

    if (currentLength + entry.length + 1 <= maxChars) {
      sections.push(entry);
      currentLength += entry.length + 1;
    } else {
      // Add truncation notice and exit
      sections.push(`... [${messages.length - i} more messages truncated]`);
      break;
    }
  }

  // Add token estimate
  sections.push('');
  sections.push(`[Deterministic truncation: ${messages.length} messages → ~${estimateTokensFromChars(sections.join('\n').length)} tokens]`);

  return sections.join('\n');
}

/**
 * Check if the result is smaller than the original
 */
function isResultSmaller(originalMessages: EscalationMessage[], result: string): boolean {
  const originalChars = originalMessages.reduce((sum, m) => sum + m.content.length, 0);
  return result.length < originalChars * 0.9; // Must be at least 10% smaller
}

/**
 * Main function: Three-Level Escalation Summarization
 *
 * This function guarantees 100% success in reducing payload size through
 * three sequential escalation levels:
 * - Level 1: LLM with "preserve details" instruction
 * - Level 2: LLM with "bullet points" instruction (more aggressive)
 * - Level 3: Deterministic truncation (no LLM - guaranteed to work)
 *
 * @param messages - Array of messages to compress
 * @param targetTokens - Target token count for the result
 * @param options - Configuration options
 * @returns EscalationResult with compressed content
 */
export async function escalatedSummarize(
  messages: EscalationMessage[],
  targetTokens: number,
  options: EscalationOptions = {}
): Promise<EscalationResult> {
  const limits = options.limits ?? DEFAULT_COMPACTION_LIMITS;
  const llmCaller = options.llmCaller;
  const logger = options.logger ?? defaultLogger;
  const onLevelStart = options.onLevelStart;
  const onLevelComplete = options.onLevelComplete;

  // Calculate original token count
  const originalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const originalTokenCount = estimateTokensFromChars(originalChars, limits);

  // Validate input
  if (!messages || messages.length === 0) {
    return {
      success: true,
      content: '',
      tokenCount: 0,
      achievedLevel: 0,
      levelsAttempted: [],
      originalTokenCount: 0,
      reductionRatio: 1,
      strategy: 'empty_input'
    };
  }

  // If already under target, no reduction needed
  if (!needsReduction(originalTokenCount, targetTokens)) {
    const combinedContent = messages.map(m => m.content).join('\n');
    return {
      success: true,
      content: combinedContent,
      tokenCount: originalTokenCount,
      achievedLevel: 0,
      levelsAttempted: [],
      originalTokenCount,
      reductionRatio: 1,
      strategy: 'no_reduction_needed'
    };
  }

  // Track levels attempted
  const levelsAttempted: number[] = [];

  // LEVEL 1: LLM with preserve details
  if (llmCaller) {
    levelsAttempted.push(1);
    const level1Result = await level1LLMPreserveDetails(
      messages,
      targetTokens,
      llmCaller,
      logger,
      onLevelStart,
      onLevelComplete
    );

    if (level1Result.success && isResultSmaller(messages, level1Result.content)) {
      const reductionRatio = level1Result.content.length / originalChars;
      return {
        success: true,
        content: level1Result.content,
        tokenCount: level1Result.tokenCount,
        achievedLevel: 1,
        levelsAttempted,
        originalTokenCount,
        reductionRatio,
        strategy: 'llm_preserve_details'
      };
    }

    logger.warn?.(`[Escalation] Level 1 did not achieve sufficient reduction (ratio: ${level1Result.content.length / originalChars})`);
  }

  // LEVEL 2: LLM with bullet points (more aggressive)
  if (llmCaller) {
    levelsAttempted.push(2);
    const level2Result = await level2LLMBulletPoints(
      messages,
      targetTokens,
      llmCaller,
      logger,
      onLevelStart,
      onLevelComplete
    );

    if (level2Result.success && isResultSmaller(messages, level2Result.content)) {
      const reductionRatio = level2Result.content.length / originalChars;
      return {
        success: true,
        content: level2Result.content,
        tokenCount: level2Result.tokenCount,
        achievedLevel: 2,
        levelsAttempted,
        originalTokenCount,
        reductionRatio,
        strategy: 'llm_bullet_points'
      };
    }

    logger.warn?.(`[Escalation] Level 2 did not achieve sufficient reduction`);
  }

  // LEVEL 3: Deterministic truncation (guaranteed to work)
  levelsAttempted.push(3);
  const level3Result = await level3DeterministicTruncate(
    messages,
    targetTokens,
    logger,
    onLevelStart,
    onLevelComplete
  );

  // Level 3 should ALWAYS succeed (no external dependencies)
  if (level3Result.success) {
    const reductionRatio = level3Result.content.length / originalChars;
    return {
      success: true,
      content: level3Result.content,
      tokenCount: level3Result.tokenCount,
      achievedLevel: 3,
      levelsAttempted,
      originalTokenCount,
      reductionRatio,
      strategy: 'deterministic_truncate'
    };
  }

  // This should never happen - Level 3 has no external dependencies
  return {
    success: false,
    content: '',
    tokenCount: 0,
    achievedLevel: 3,
    levelsAttempted,
    originalTokenCount,
    reductionRatio: 1,
    error: 'Level 3 (deterministic) failed unexpectedly',
    strategy: 'deterministic_truncate'
  };
}

/**
 * Simple wrapper for when you don't have an LLM caller
 * Uses only deterministic truncation
 */
export async function deterministicEscalate(
  messages: EscalationMessage[],
  targetTokens: number,
  options: Omit<EscalationOptions, 'llmCaller'> = {}
): Promise<EscalationResult> {
  return escalatedSummarize(messages, targetTokens, { ...options, llmCaller: undefined });
}

export default escalatedSummarize;
