// Context Compaction - Hierarchical compression system
// Monitors context size and compresses old messages into summaries with disk pointers

import { promises as fs } from 'fs';
import path, { join } from 'path';
import { createHash } from 'crypto';

/**
 * Configuration for compaction system
 */
export interface CompactionConfig {
  maxTokens: number;           // Token limit before compaction (default: 80k)
  compactionThreshold: number;  // Percentage to trigger compaction (default: 0.8 = 80%)
  preserveRecentMessages: number; // Number of recent messages to keep (default: 20)
  summaryStyle: 'concise' | 'detailed'; // Summary format
  storageDir: string;           // Directory for raw data storage
}

/**
 * Pointer to raw data stored on disk
 */
export interface RawDataPointer {
  type: 'pointer';
  pointerId: string;
  filePath: string;
  originalIndex: number;
  messageCount: number;
  timestamp: string;
}

/**
 * Compacted message entry
 */
export interface CompactedMessage {
  role: string;
  content: string | RawDataPointer;
  timestamp: string;
  compacted: boolean;
  summary?: string;
}

/**
 * Compaction result with statistics
 */
export interface CompactionResult {
  success: boolean;
  originalTokenCount: number;
  compactedTokenCount: number;
  messagesCompacted: number;
  messagesPreserved: number;
  reductionPercentage: number;
  pointersCreated: string[];
  summary: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CompactionConfig = {
  maxTokens: 80000,
  compactionThreshold: 0.8,
  preserveRecentMessages: 20,
  summaryStyle: 'concise',
  storageDir: '.vibe-flow/context-archives'
};

/**
 * Estimate token count (approximate: 1 token ≈ 4 characters for English text)
 */
export function compactionEstimateTokens(text: string | unknown): number {
  if (!text) return 0;

  const textContent = typeof text === 'string' ? text : JSON.stringify(text);
  // Rough estimate: average 4 chars per token
  return Math.ceil(textContent.length / 4);
}

/**
 * Calculate total tokens in a message array
 */
export function compactionCalculateTotalTokens(messages: unknown[]): number {
  let total = 0;
  for (const msg of messages) {
    total += compactionEstimateTokens(msg);
  }
  return total;
}

/**
 * Generate unique ID for pointer
 */
function generatePointerId(): string {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Save raw messages to disk and return pointer
 */
async function saveRawMessagesToDisk(
  messages: unknown[],
  storageDir: string,
  pointerId: string
): Promise<{ filePath: string; messageCount: number }> {
  const fileName = `archive_${pointerId}.json`;
  const filePath = join(storageDir, fileName);

  // Ensure directory exists
  await fs.mkdir(storageDir, { recursive: true });

  // Save raw data
  await fs.writeFile(filePath, JSON.stringify({
    archivedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages
  }, null, 2), 'utf-8');

  return { filePath, messageCount: messages.length };
}

/**
 * Create a summary from a group of messages
 */
function createMessageSummary(messages: unknown[], style: 'concise' | 'detailed'): string {
  const toolCalls = messages.filter((m: any) => m?.role === 'tool').length;
  const toolResults = messages.filter((m: any) => m?.role === 'tool_result').length;
  const userMessages = messages.filter((m: any) => m?.role === 'user').length;
  const assistantMessages = messages.filter((m: any) => m?.role === 'assistant').length;

  if (style === 'concise') {
    return `[${messages.length} messages: ${userMessages} user, ${assistantMessages} assistant, ${toolCalls} tool calls, ${toolResults} results]`;
  }

  // Detailed style - include more context
  const firstMsg = messages[0] as any;
  const lastMsg = messages[messages.length - 1] as any;

  return `[${messages.length} messages consolidated:
- User: ${userMessages}, Assistant: ${assistantMessages}
- Tool calls: ${toolCalls}, Results: ${toolResults}
- Span: ${firstMsg?.timestamp || 'unknown'} to ${lastMsg?.timestamp || 'unknown'}
- Content preview: ${JSON.stringify(firstMsg?.content || '').substring(0, 100)}...]`;
}

/**
 * Main compaction function - compresses messages into summaries with pointers
 */
export async function compactContext(
  messages: unknown[],
  config: Partial<CompactionConfig> = {},
  projectPath: string = process.cwd()
): Promise<CompactionResult> {
  const cfg: CompactionConfig = { ...DEFAULT_CONFIG, ...config };
  // Ensure storageDir is properly resolved relative to projectPath
  // Check if it's already an absolute path
  let storageDir: string;
  if (path.isAbsolute(cfg.storageDir)) {
    storageDir = cfg.storageDir;
  } else if (cfg.storageDir.startsWith('.vibe-flow') || cfg.storageDir.startsWith('.') || cfg.storageDir.startsWith('/')) {
    storageDir = join(projectPath, cfg.storageDir);
  } else {
    storageDir = join(projectPath, '.vibe-flow', cfg.storageDir);
  }

  const originalTokenCount = compactionCalculateTotalTokens(messages);
  const threshold = cfg.maxTokens * cfg.compactionThreshold;

  // Check if compaction is needed
  if (originalTokenCount < threshold) {
    return {
      success: true,
      originalTokenCount,
      compactedTokenCount: originalTokenCount,
      messagesCompacted: 0,
      messagesPreserved: messages.length,
      reductionPercentage: 0,
      pointersCreated: [],
      summary: 'No compaction needed - below threshold'
    };
  }

  // Determine which messages to preserve (most recent)
  const preserveCount = Math.min(cfg.preserveRecentMessages, messages.length);
  const messagesToCompact = messages.slice(0, -preserveCount);
  const messagesToPreserve = messages.slice(-preserveCount);

  // Group old messages into chunks for summarization
  const chunkSize = 10; // Group 10 messages per summary
  const chunks: unknown[][] = [];

  for (let i = 0; i < messagesToCompact.length; i += chunkSize) {
    chunks.push(messagesToCompact.slice(i, i + chunkSize));
  }

  const pointersCreated: string[] = [];
  const compactedMessages: CompactedMessage[] = [];

  // Process each chunk
  for (const chunk of chunks) {
    const pointerId = generatePointerId();

    // Save raw data to disk
    const { filePath, messageCount } = await saveRawMessagesToDisk(
      chunk,
      storageDir,
      pointerId
    );

    pointersCreated.push(filePath);

    // Create pointer entry
    const pointer: RawDataPointer = {
      type: 'pointer',
      pointerId,
      filePath,
      originalIndex: chunks.indexOf(chunk),
      messageCount,
      timestamp: new Date().toISOString()
    };

    // Create summary
    const summary = createMessageSummary(chunk, cfg.summaryStyle);

    // Add compacted entry
    compactedMessages.push({
      role: 'system',
      content: pointer,
      timestamp: (chunk[0] as any)?.timestamp || new Date().toISOString(),
      compacted: true,
      summary
    });
  }

  // Combine compacted summaries with preserved messages
  const finalMessages = [...compactedMessages, ...messagesToPreserve];
  const compactedTokenCount = compactionCalculateTotalTokens(finalMessages);

  const reductionPercentage = originalTokenCount > 0
    ? Math.round(((originalTokenCount - compactedTokenCount) / originalTokenCount) * 100)
    : 0;

  return {
    success: true,
    originalTokenCount,
    compactedTokenCount,
    messagesCompacted: messagesToCompact.length,
    messagesPreserved: preserveCount,
    reductionPercentage,
    pointersCreated,
    summary: `Compacted ${messagesToCompact.length} messages into ${chunks.length} summaries, reduced by ${reductionPercentage}%`
  };
}

/**
 * Load raw messages from a pointer
 */
export async function compactionLoadFromPointer(
  pointer: RawDataPointer
): Promise<unknown[]> {
  try {
    const content = await fs.readFile(pointer.filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.messages || [];
  } catch (error) {
    console.error(`Failed to load from pointer ${pointer.pointerId}:`, error);
    return [];
  }
}

/**
 * Expand compacted context back to full context
 */
export async function expandContext(
  compactedMessages: CompactedMessage[]
): Promise<unknown[]> {
  const expanded: unknown[] = [];

  for (const msg of compactedMessages) {
    if (msg.compacted && typeof msg.content === 'object' && (msg.content as any)?.type === 'pointer') {
      // Load from pointer
      const pointer = msg.content as RawDataPointer;
      const rawMessages = await compactionLoadFromPointer(pointer);
      expanded.push(...rawMessages);
    } else {
      // Keep as is
      expanded.push(msg);
    }
  }

  return expanded;
}

/**
 * Check if context needs compaction
 */
export function needsCompaction(
  messages: unknown[],
  config: Partial<CompactionConfig> = {}
): boolean {
  const cfg: CompactionConfig = { ...DEFAULT_CONFIG, ...config };
  const tokenCount = compactionCalculateTotalTokens(messages);
  return tokenCount >= (cfg.maxTokens * cfg.compactionThreshold);
}

/**
 * Get current context status
 */
export function getContextStatus(
  messages: unknown[],
  config: Partial<CompactionConfig> = {}
): {
  tokenCount: number;
  messageCount: number;
  threshold: number;
  needsCompaction: boolean;
  compactionPercentage: number;
} {
  const cfg: CompactionConfig = { ...DEFAULT_CONFIG, ...config };
  const tokenCount = compactionCalculateTotalTokens(messages);
  const threshold = cfg.maxTokens * cfg.compactionThreshold;

  return {
    tokenCount,
    messageCount: messages.length,
    threshold: Math.round(threshold),
    needsCompaction: tokenCount >= threshold,
    compactionPercentage: Math.round((tokenCount / cfg.maxTokens) * 100)
  };
}

export default {
  compactContext,
  expandContext,
  needsCompaction,
  getContextStatus,
  compactionEstimateTokens,
  compactionCalculateTotalTokens,
  compactionLoadFromPointer
};
