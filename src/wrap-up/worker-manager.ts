/**
 * Worker Manager for Wrap-up Operations
 * Manages Worker threads with timeout control to prevent runaway processes
 */

import { Worker } from 'worker_threads';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface TimeoutControllerOptions {
  /** Timeout in milliseconds (default: 60000 = 60 seconds) */
  timeoutMs?: number;
  /** Path to error log file */
  errorLogPath?: string;
  /** Callback fired on timeout */
  onTimeout?: (worker: Worker) => void;
}

export interface WorkerExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  timedOut: boolean;
  duration: number;
}

/**
 * TimeoutController for Worker thread wrap-up operations
 * Ensures no wrap-up runs forever by terminating zombie processes after timeout
 */
export class TimeoutController {
  private timeoutMs: number;
  private errorLogPath: string;
  private onTimeout?: (worker: Worker) => void;
  private activeWorker: Worker | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;

  constructor(options: TimeoutControllerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60000; // Default 60 seconds
    this.errorLogPath = options.errorLogPath ?? join(tmpdir(), 'vibe-flow-timeout-error.log');
    this.onTimeout = options.onTimeout;
  }

  /**
   * Execute a worker with timeout protection
   */
  async executeWithTimeout<T>(
    workerFactory: () => Worker,
    cleanup?: () => void | Promise<void>
  ): Promise<WorkerExecutionResult<T>> {
    const startTime = Date.now();
    let resolved = false;

    // Create the worker
    const worker = workerFactory();
    this.activeWorker = worker;
    this.startTime = Date.now();

    // Set up timeout
    this.timeoutHandle = setTimeout(async () => {
      await this.handleTimeout(worker, cleanup);
    }, this.timeoutMs);

    try {
      const result = await this.waitForWorker<T>(worker);
      const duration = Date.now() - startTime;

      // Clear timeout since worker completed
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      // Clean up worker
      await this.cleanupWorker(worker, cleanup);
      resolved = true;

      return {
        success: true,
        result,
        timedOut: false,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Clear timeout
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      // Clean up worker if not already done
      if (!resolved) {
        await this.cleanupWorker(worker, cleanup);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: errorMessage,
        timedOut: false,
        duration
      };
    }
  }

  /**
   * Wait for worker to complete with a promise
   */
  private waitForWorker<T>(worker: Worker): Promise<T> {
    return new Promise((resolve, reject) => {
      worker.once('message', (message) => {
        resolve(message as T);
      });

      worker.once('error', (error) => {
        reject(error);
      });

      worker.once('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Handle timeout - terminate worker and log error
   */
  private async handleTimeout(
    worker: Worker,
    cleanup?: () => void | Promise<void>
  ): Promise<void> {
    const elapsed = Date.now() - this.startTime;

    // Force terminate the worker
    await this.cleanupWorker(worker, cleanup);

    // Log timeout error to temporary file
    await this.logTimeoutError(elapsed);

    // Fire callback if provided
    if (this.onTimeout) {
      this.onTimeout(worker);
    }
  }

  /**
   * Log timeout error to error file
   */
  private async logTimeoutError(elapsedMs: number): Promise<void> {
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] Wrap-up Timeout Exceeded\n` +
      `  Elapsed time: ${elapsedMs}ms\n` +
      `  Timeout configured: ${this.timeoutMs}ms\n` +
      `  Process terminated to prevent zombie worker\n\n`;

    try {
      await fs.appendFile(this.errorLogPath, errorMessage, 'utf-8');
    } catch {
      // Silently fail if we can't write to error log
      // (don't let logging failure mask the timeout)
    }
  }

  /**
   * Clean up worker and release resources
   */
  private async cleanupWorker(
    worker: Worker,
    cleanup?: () => void | Promise<void>
  ): Promise<void> {
    // Call custom cleanup if provided
    if (cleanup) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Force terminate the worker
    try {
      await worker.terminate();
    } catch {
      // Worker may already be terminated
    }

    this.activeWorker = null;
  }

  /**
   * Manually terminate current worker (if any)
   */
  async terminate(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    if (this.activeWorker) {
      await this.cleanupWorker(this.activeWorker);
    }
  }

  /**
   * Check if a worker is currently running
   */
  isRunning(): boolean {
    return this.activeWorker !== null;
  }

  /**
   * Get elapsed time since worker started
   */
  getElapsedTime(): number {
    if (this.startTime === 0) return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Get configured timeout
   */
  getTimeout(): number {
    return this.timeoutMs;
  }

  /**
   * Update timeout dynamically
   */
  setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Create a TimeoutController with default settings
 */
export function createTimeoutController(options?: TimeoutControllerOptions): TimeoutController {
  return new TimeoutController(options);
}

/**
 * Execute wrap-up in worker with timeout protection
 * This is the main entry point for running wrap-up operations with timeout
 */
export async function executeWrapUpWithTimeout<T>(
  workerPath: string,
  workerData: unknown,
  options: TimeoutControllerOptions = {}
): Promise<WorkerExecutionResult<T>> {
  const controller = new TimeoutController(options);

  return controller.executeWithTimeout<T>(
    () => new Worker(workerPath, { workerData })
  );
}
