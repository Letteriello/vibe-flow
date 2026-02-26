/**
 * Worker Thread for CPU-intensive context compression
 * Uses native Node.js worker_threads module
 */

import { parentPort, workerData } from 'worker_threads';
import type { WorkerData, WorkerResult } from './worker-types.js';

// Token estimation constants
const CHARS_PER_TOKEN = 4;
const TOKEN_ESTIMATE = 2000;

/**
 * Sanitize a string by removing control characters and normalizing whitespace
 */
function sanitizeString(input: string): string {
  // Remove control characters except newlines and tabs
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize multiple whitespace to single space
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Count estimated tokens in a string
 * Uses character-based estimation: ~4 characters per token
 */
function countTokens(text: string): number {
  const chars = text.length;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Compress a single message by sanitizing and reducing redundancy
 */
function compressMessage(message: Record<string, unknown>): Record<string, unknown> {
  const compressed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(message)) {
    if (typeof value === 'string') {
      // Sanitize string values
      compressed[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      // Recursively compress array elements
      compressed[key] = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return compressMessage(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively compress nested objects
      compressed[key] = compressMessage(value as Record<string, unknown>);
    } else {
      // Keep primitives as-is
      compressed[key] = value;
    }
  }

  return compressed;
}

/**
 * Extract content from various message formats
 */
function extractContent(message: Record<string, unknown>): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null && 'text' in item) {
        return String((item as Record<string, unknown>).text);
      }
      return '';
    }).join(' ');
  }

  return '';
}

/**
 * Calculate total tokens in context payload
 */
function calculateContextTokens(context: unknown): number {
  if (typeof context === 'string') {
    return countTokens(context);
  }

  if (Array.isArray(context)) {
    let total = 0;
    for (const item of context) {
      if (typeof item === 'string') {
        total += countTokens(item);
      } else if (typeof item === 'object' && item !== null) {
        const content = extractContent(item as Record<string, unknown>);
        total += countTokens(content);
      }
    }
    return total;
  }

  if (typeof context === 'object' && context !== null) {
    const content = extractContent(context as Record<string, unknown>);
    return countTokens(content);
  }

  return 0;
}

/**
 * Main compression logic - runs in worker thread
 */
function compressContext(data: WorkerData): WorkerResult {
  const startTime = Date.now();

  try {
    // Step 1: Parse JSON if string
    let parsed: unknown;
    if (typeof data.payload === 'string') {
      parsed = JSON.parse(data.payload);
    } else {
      parsed = data.payload;
    }

    // Step 2: Calculate original token count
    const originalTokens = calculateContextTokens(parsed);

    // Step 3: Compress based on configuration
    let compressed: unknown;

    if (Array.isArray(parsed)) {
      // Compress array of messages
      compressed = parsed.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const compressedItem = compressMessage(item as Record<string, unknown>);

          // Add metadata
          (compressedItem as Record<string, unknown>).__index__ = index;
          (compressedItem as Record<string, unknown>).__original_tokens__ = calculateContextTokens(item);

          return compressedItem;
        }
        return item;
      });
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Compress object
      compressed = compressMessage(parsed as Record<string, unknown>);
    } else {
      compressed = parsed;
    }

    // Step 4: Calculate compressed token count
    const compressedTokens = calculateContextTokens(compressed);

    // Step 5: Generate summary metadata
    const reductionPercent = originalTokens > 0
      ? Math.round((1 - compressedTokens / originalTokens) * 100)
      : 0;

    const result: WorkerResult = {
      success: true,
      compressed: JSON.stringify(compressed),
      metadata: {
        originalTokens,
        compressedTokens,
        reductionPercent,
        processingTime: Date.now() - startTime,
        messageCount: Array.isArray(parsed) ? parsed.length : 1
      }
    };

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during compression',
      metadata: {
        originalTokens: 0,
        compressedTokens: 0,
        reductionPercent: 0,
        processingTime: Date.now() - startTime,
        messageCount: 0
      }
    };
  }
}

// Execute compression and send result back to main thread
if (parentPort) {
  const result = compressContext(workerData as WorkerData);
  parentPort.postMessage(result);
}
