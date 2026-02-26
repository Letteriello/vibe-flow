/**
 * Worker Thread wrapper for async context compression
 * Offloads CPU-intensive operations to worker threads
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  CompressContextOptions,
  CompressContextResult,
  WorkerResult
} from './worker-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Compress context using Worker Threads
 * @param data - The context payload to compress
 * @param options - Compression options
 * @returns Promise with compressed result and metadata
 */
export async function compressContextAsync(
  data: unknown,
  options: CompressContextOptions = {}
): Promise<CompressContextResult> {
  return new Promise((resolve, reject) => {
    // Create worker from current file path
    const workerPath = join(__dirname, 'worker.js');

    const worker = new Worker(workerPath, {
      workerData: {
        payload: data,
        options
      }
    });

    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        worker.terminate();
      }
    };

    // Set timeout for worker execution
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Worker thread timeout - compression took too long'));
    }, 60000); // 60 second timeout

    worker.on('message', (result: WorkerResult) => {
      clearTimeout(timeout);
      cleanup();

      if (result.success && result.compressed) {
        resolve({
          compressed: result.compressed,
          metadata: result.metadata
        });
      } else {
        reject(new Error(result.error || 'Compression failed'));
      }
    });

    worker.on('error', (error) => {
      clearTimeout(timeout);
      cleanup();
      reject(error);
    });

    worker.on('exit', (code) => {
      clearTimeout(timeout);
      cleanup();

      if (code !== 0 && !resolved) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

export type { CompressContextOptions, CompressContextResult } from './worker-types.js';
