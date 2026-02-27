/**
 * Worker Thread wrapper for async context compression
 * Offloads CPU-intensive operations to worker threads
 * Uses WorkerPool for efficient worker reuse
 */

import type {
  CompressContextOptions,
  CompressContextResult
} from './worker-types.js';
import { getGlobalPool } from './worker-pool.js';

/**
 * Compress context using Worker Threads via WorkerPool
 * @param data - The context payload to compress
 * @param options - Compression options
 * @returns Promise with compressed result and metadata
 */
export async function compressContextAsync(
  data: unknown,
  options: CompressContextOptions = {}
): Promise<CompressContextResult> {
  // Get the global worker pool (lazy initialized)
  const pool = getGlobalPool();

  // Prepare worker data
  const workerData = {
    payload: data,
    options: {
      sanitizeStrings: options.sanitizeStrings,
      removeDuplicates: options.removeDuplicates,
      aggressive: options.aggressive
    }
  };

  // Execute via pool - worker is reused across calls
  const result = await pool.execute(workerData);

  if (result.success && result.compressed) {
    return {
      compressed: result.compressed,
      metadata: result.metadata
    };
  } else {
    throw new Error(result.error || 'Compression failed');
  }
}

export type { CompressContextOptions, CompressContextResult } from './worker-types.js';
