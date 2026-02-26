// Compression Module - Lossless Context Management
// Monitors payload size and compresses old logs while preserving reasoning pointers

import { promises as fs } from 'fs';
import path, { join, resolve } from 'path';
import { createHash } from 'crypto';

/**
 * Payload size statistics
 */
export interface PayloadStats {
  tokenCount: number;
  charCount: number;
  messageCount: number;
  estimatedSize: number;
  threshold: number;
  percentage: number;
}

/**
 * Compression configuration
 */
export interface CompressionConfig {
  maxPayloadSize: number;          // Max payload size in bytes (default: 500KB)
  tokenLimit: number;              // Token limit (default: 80000)
  thresholdPercentage: number;      // Trigger compression at X% (default: 0.8 = 80%)
  preserveRecentMessages: number;   // Keep recent N messages intact (default: 20)
  archiveDirectory: string;         // Where to store archived logs
  enableLosslessMode: boolean;      // Preserve all reasoning traces
}

/**
 * Default compression configuration
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxPayloadSize: 500 * 1024,       // 500KB
  tokenLimit: 80000,
  thresholdPercentage: 0.8,
  preserveRecentMessages: 20,
  archiveDirectory: '.vibe-flow/compressed-archives',
  enableLosslessMode: true
};

/**
 * Pointer to archived log data
 */
export interface LogPointer {
  type: 'log-pointer';
  pointerId: string;
  archivePath: string;
  originalMessageCount: number;
  compressedAt: string;
  metadata: LogMetadata;
}

/**
 * Metadata preserved for lossless compression
 */
export interface LogMetadata {
  startIndex: number;
  endIndex: number;
  totalTokens: number;
  toolCallCount: number;
  toolResultCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  keyDecisions: string[];
  fileReferences: string[];
}

/**
 * Compressed log entry
 */
export interface CompressedLogEntry {
  role: string;
  content: string | LogPointer;
  timestamp: string;
  compressed: boolean;
  reasoning?: string;
}

/**
 * Compression result
 */
export interface CompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  messagesArchived: number;
  messagesPreserved: number;
  pointersCreated: string[];
  metadata: LogMetadata[];
  summary: string;
}

/**
 * Compression status
 */
export interface CompressionStatus {
  needsCompression: boolean;
  currentSize: number;
  threshold: number;
  percentage: number;
  lastCompressed: string | null;
  pointerCount: number;
}

/**
 * Generate unique pointer ID
 */
function generatePointerId(): string {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 12);
}

/**
 * Calculate token estimate from text
 */
export function estimateTokens(text: string | unknown): number {
  if (!text) return 0;
  const content = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(content.length / 4);
}

/**
 * Calculate total tokens in messages
 */
export function calculateTotalTokens(messages: unknown[]): number {
  return messages.reduce<number>((total, msg) => total + estimateTokens(msg), 0);
}

/**
 * Calculate payload size in bytes
 */
export function calculatePayloadSize(messages: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8');
}

/**
 * Extract metadata from message group (lossless mode)
 */
function extractMetadata(messages: unknown[]): LogMetadata {
  const msgs = messages as Array<{ role?: string; content?: string; timestamp?: string }>;

  const toolCallCount = msgs.filter(m => m.role === 'tool').length;
  const toolResultCount = msgs.filter(m => m.role === 'tool_result').length;
  const userMessageCount = msgs.filter(m => m.role === 'user').length;
  const assistantMessageCount = msgs.filter(m => m.role === 'assistant').length;

  // Extract key decisions and file references from content
  const keyDecisions: string[] = [];
  const fileReferences: string[] = [];

  for (const msg of msgs) {
    const content = typeof msg.content === 'string' ? msg.content : '';

    // Look for decision patterns
    const decisionMatch = content.match(/(?:decided|chose|selected|opted|implemented|created|added|fixed)\s+([^.]+)/gi);
    if (decisionMatch) {
      keyDecisions.push(...decisionMatch.slice(0, 3));
    }

    // Look for file references
    const fileMatches = content.match(/[a-zA-Z0-9_\-/]+\.[a-zA-Z]{1,10}/g);
    if (fileMatches) {
      const uniqueFiles = [...new Set(fileMatches)].slice(0, 5);
      fileReferences.push(...uniqueFiles);
    }
  }

  return {
    startIndex: 0,
    endIndex: messages.length - 1,
    totalTokens: calculateTotalTokens(messages),
    toolCallCount,
    toolResultCount,
    userMessageCount,
    assistantMessageCount,
    firstTimestamp: msgs[0]?.timestamp || new Date().toISOString(),
    lastTimestamp: msgs[msgs.length - 1]?.timestamp || new Date().toISOString(),
    keyDecisions: [...new Set(keyDecisions)],
    fileReferences: [...new Set(fileReferences)]
  };
}

/**
 * Save compressed logs to disk
 */
async function saveCompressedLogs(
  messages: unknown[],
  archiveDir: string,
  pointerId: string,
  metadata: LogMetadata
): Promise<string> {
  await fs.mkdir(archiveDir, { recursive: true });

  const archivePath = join(archiveDir, `log_${pointerId}.json`);

  await fs.writeFile(archivePath, JSON.stringify({
    archivedAt: new Date().toISOString(),
    pointerId,
    metadata,
    messages
  }, null, 2), 'utf8');

  return archivePath;
}

/**
 * Create a reasoning summary for compressed logs
 */
function createReasoningSummary(messages: unknown[], metadata: LogMetadata): string {
  const parts: string[] = [];

  if (metadata.keyDecisions.length > 0) {
    parts.push(`Decisions: ${metadata.keyDecisions.join('; ')}`);
  }

  if (metadata.fileReferences.length > 0) {
    parts.push(`Files: ${metadata.fileReferences.join(', ')}`);
  }

  parts.push(`Messages: ${metadata.userMessageCount} user, ${metadata.assistantMessageCount} assistant, ${metadata.toolCallCount} tools, ${metadata.toolResultCount} results`);

  return `[ARCHIVED] ${parts.join(' | ')} | Span: ${metadata.firstTimestamp} to ${metadata.lastTimestamp}`;
}

/**
 * Compress old logs while preserving reasoning (Lossless Context Management)
 */
export async function compressOldLogs(
  messages: unknown[],
  config: Partial<CompressionConfig> = {},
  projectPath: string = process.cwd()
): Promise<CompressionResult> {
  const cfg: CompressionConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };

  // Resolve archive directory
  const archiveDir = path.isAbsolute(cfg.archiveDirectory)
    ? cfg.archiveDirectory
    : resolve(projectPath, cfg.archiveDirectory);

  const originalSize = calculatePayloadSize(messages);
  const originalTokenCount = calculateTotalTokens(messages);
  const threshold = cfg.tokenLimit * cfg.thresholdPercentage;

  // Check if compression is needed
  if (originalTokenCount < threshold) {
    return {
      success: true,
      originalSize,
      compressedSize: originalSize,
      reductionPercentage: 0,
      messagesArchived: 0,
      messagesPreserved: messages.length,
      pointersCreated: [],
      metadata: [],
      summary: 'No compression needed - below threshold'
    };
  }

  // Determine messages to preserve (most recent)
  const preserveCount = Math.min(cfg.preserveRecentMessages, messages.length);
  const messagesToArchive = messages.slice(0, -preserveCount);
  const messagesToPreserve = messages.slice(-preserveCount);

  // Group old messages into chunks
  const chunkSize = 10;
  const chunks: unknown[][] = [];

  for (let i = 0; i < messagesToArchive.length; i += chunkSize) {
    chunks.push(messagesToArchive.slice(i, i + chunkSize));
  }

  const pointersCreated: string[] = [];
  const compressedEntries: CompressedLogEntry[] = [];
  const metadataList: LogMetadata[] = [];

  // Process each chunk
  for (const chunk of chunks) {
    const pointerId = generatePointerId();
    const metadata = extractMetadata(chunk);

    // Save to disk
    const archivePath = await saveCompressedLogs(chunk, archiveDir, pointerId, metadata);
    pointersCreated.push(archivePath);
    metadataList.push(metadata);

    // Create pointer
    const pointer: LogPointer = {
      type: 'log-pointer',
      pointerId,
      archivePath,
      originalMessageCount: chunk.length,
      compressedAt: new Date().toISOString(),
      metadata
    };

    // Create reasoning summary
    const reasoning = cfg.enableLosslessMode
      ? createReasoningSummary(chunk, metadata)
      : `[${chunk.length} messages archived]`;

    // Add compressed entry
    compressedEntries.push({
      role: 'system',
      content: pointer,
      timestamp: metadata.lastTimestamp,
      compressed: true,
      reasoning
    });
  }

  // Combine compressed with preserved
  const finalEntries = [...compressedEntries, ...messagesToPreserve.map(msg => ({
    role: (msg as any).role || 'user',
    content: (msg as any).content,
    timestamp: (msg as any).timestamp || new Date().toISOString(),
    compressed: false
  }))];

  const compressedSize = Buffer.byteLength(JSON.stringify(finalEntries), 'utf8');
  const reductionPercentage = originalSize > 0
    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
    : 0;

  return {
    success: true,
    originalSize,
    compressedSize,
    reductionPercentage,
    messagesArchived: messagesToArchive.length,
    messagesPreserved: preserveCount,
    pointersCreated,
    metadata: metadataList,
    summary: `Compressed ${messagesToArchive.length} messages into ${chunks.length} pointers, reduced by ${reductionPercentage}%`
  };
}

/**
 * Load archived messages from pointer
 */
export async function loadFromPointer(pointer: LogPointer): Promise<unknown[]> {
  try {
    const content = await fs.readFile(pointer.archivePath, 'utf8');
    const data = JSON.parse(content);
    return data.messages || [];
  } catch (error) {
    console.error(`Failed to load from pointer ${pointer.pointerId}:`, error);
    return [];
  }
}

/**
 * Expand compressed logs back to full context
 */
export async function expandCompressedLogs(
  compressedEntries: CompressedLogEntry[]
): Promise<unknown[]> {
  const expanded: unknown[] = [];

  for (const entry of compressedEntries) {
    if (entry.compressed && typeof entry.content === 'object' && (entry.content as LogPointer)?.type === 'log-pointer') {
      const pointer = entry.content as LogPointer;
      const rawMessages = await loadFromPointer(pointer);
      expanded.push(...rawMessages);
    } else {
      expanded.push({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp
      });
    }
  }

  return expanded;
}

/**
 * Check if payload needs compression
 */
export function needsCompression(
  messages: unknown[],
  config: Partial<CompressionConfig> = {}
): boolean {
  const cfg: CompressionConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  const tokenCount = calculateTotalTokens(messages);
  const threshold = cfg.tokenLimit * cfg.thresholdPercentage;
  return tokenCount >= threshold;
}

/**
 * Get current payload status
 */
export function getPayloadStatus(
  messages: unknown[],
  config: Partial<CompressionConfig> = {}
): PayloadStats {
  const cfg: CompressionConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };

  const tokenCount = calculateTotalTokens(messages);
  const charCount = JSON.stringify(messages).length;
  const estimatedSize = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  const threshold = cfg.tokenLimit * cfg.thresholdPercentage;
  const percentage = (tokenCount / cfg.tokenLimit) * 100;

  return {
    tokenCount,
    charCount,
    messageCount: messages.length,
    estimatedSize,
    threshold: Math.round(threshold),
    percentage: Math.round(percentage)
  };
}

/**
 * PayloadSizeMonitor class - Monitors payload size and triggers compression
 */
export class PayloadSizeMonitor {
  private config: CompressionConfig;
  private lastCompressed: string | null = null;
  private pointerCount: number = 0;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }

  /**
   * Check if compression is needed
   */
  shouldCompress(messages: unknown[]): boolean {
    return needsCompression(messages, this.config);
  }

  /**
   * Get current status
   */
  getStatus(messages: unknown[]): CompressionStatus {
    const stats = getPayloadStatus(messages, this.config);

    return {
      needsCompression: stats.percentage >= (this.config.thresholdPercentage * 100),
      currentSize: stats.estimatedSize,
      threshold: this.config.maxPayloadSize,
      percentage: stats.percentage,
      lastCompressed: this.lastCompressed,
      pointerCount: this.pointerCount
    };
  }

  /**
   * Update last compressed timestamp
   */
  markCompressed(pointerCount: number): void {
    this.lastCompressed = new Date().toISOString();
    this.pointerCount = pointerCount;
  }

  /**
   * Get configuration
   */
  getConfig(): CompressionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a compression result with statistics
 */
export function createCompressionResult(
  originalMessages: unknown[],
  compressedEntries: CompressedLogEntry[],
  pointersCreated: string[]
): {
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  originalMessageCount: number;
  compressedMessageCount: number;
} {
  const originalSize = Buffer.byteLength(JSON.stringify(originalMessages), 'utf8');
  const compressedSize = Buffer.byteLength(JSON.stringify(compressedEntries), 'utf8');

  return {
    originalSize,
    compressedSize,
    reductionPercentage: originalSize > 0
      ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
      : 0,
    originalMessageCount: originalMessages.length,
    compressedMessageCount: compressedEntries.length
  };
}

export default {
  compressOldLogs,
  loadFromPointer,
  expandCompressedLogs,
  needsCompression,
  getPayloadStatus,
  PayloadSizeMonitor,
  estimateTokens,
  calculateTotalTokens,
  calculatePayloadSize,
  DEFAULT_COMPRESSION_CONFIG
};
