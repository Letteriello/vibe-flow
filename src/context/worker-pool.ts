/**
 * Worker Pool for reusing worker threads
 * Reduces overhead of creating new workers for each compression task
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { WorkerData, WorkerResult } from './worker-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration for Worker Pool
 */
export interface WorkerPoolConfig {
  /** Minimum number of workers to keep in pool (default: 2) */
  minWorkers?: number;
  /** Maximum number of workers in pool (default: 4) */
  maxWorkers?: number;
  /** Idle timeout in ms before terminating excess workers (default: 60000) */
  idleTimeout?: number;
  /** Maximum tasks per worker before recycling (default: 50) */
  maxTasksPerWorker?: number;
  /** Default task timeout in ms (default: 30000) */
  taskTimeout?: number;
}

/**
 * Pool status metrics
 */
export interface PoolStatus {
  /** Number of idle workers */
  idleWorkers: number;
  /** Number of busy workers */
  busyWorkers: number;
  /** Total workers in pool */
  totalWorkers: number;
  /** Tasks waiting for available worker */
  queuedTasks: number;
  /** Total tasks completed */
  completedTasks: number;
  /** Total tasks failed */
  failedTasks: number;
  /** Pool is initialized */
  initialized: boolean;
  /** Pool is shutting down */
  shuttingDown: boolean;
}

/**
 * Internal worker state
 */
interface ManagedWorker {
  worker: Worker;
  inUse: boolean;
  taskCount: number;
  createdAt: number;
  lastUsedAt: number;
  idleSince?: number;
}

/**
 * Pending task in queue
 */
interface PendingTask<T = WorkerResult> {
  data: WorkerData;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Worker Pool for managing reusable worker threads
 */
export class WorkerPool {
  private config: Required<WorkerPoolConfig>;
  private workers: Map<number, ManagedWorker> = new Map();
  private idleWorkers: Set<number> = new Set();
  private pendingTasks: PendingTask[] = [];
  private initialized: boolean = false;
  private shuttingDown: boolean = false;
  private stats = {
    completedTasks: 0,
    failedTasks: 0
  };

  // Worker script path
  private readonly workerPath: string;

  constructor(config: WorkerPoolConfig = {}) {
    this.config = {
      minWorkers: config.minWorkers ?? 2,
      maxWorkers: config.maxWorkers ?? 4,
      idleTimeout: config.idleTimeout ?? 60000,
      maxTasksPerWorker: config.maxTasksPerWorker ?? 50,
      taskTimeout: config.taskTimeout ?? 30000
    };

    this.workerPath = join(__dirname, 'worker.js');
  }

  /**
   * Initialize the worker pool with minimum workers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create initial workers
    const initPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minWorkers; i++) {
      initPromises.push(this.createWorker().then(() => undefined));
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Create a new worker and add to pool
   */
  private async createWorker(): Promise<ManagedWorker> {
    const worker = new Worker(this.workerPath);

    const managedWorker: ManagedWorker = {
      worker,
      inUse: false,
      taskCount: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    this.workers.set(worker.threadId, managedWorker);
    this.idleWorkers.add(worker.threadId);

    // Handle worker exit - remove from pool
    worker.on('exit', (code) => {
      this.handleWorkerExit(worker.threadId, code);
    });

    // Handle worker errors
    worker.on('error', (error) => {
      console.error(`[WorkerPool] Worker ${worker.threadId} error:`, error.message);
    });

    return managedWorker;
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(threadId: number, code: number): void {
    const managedWorker = this.workers.get(threadId);
    if (!managedWorker) return;

    this.idleWorkers.delete(threadId);
    this.workers.delete(threadId);

    // If worker crashed, mark as failed task
    if (code !== 0) {
      this.stats.failedTasks++;
    }

    // If below minimum, create replacement
    if (this.workers.size < this.config.minWorkers && !this.shuttingDown) {
      this.createWorker().catch(err => {
        console.error('[WorkerPool] Failed to create replacement worker:', err);
      });
    }
  }

  /**
   * Calculate dynamic timeout based on payload size
   * Base: 5s for small payloads, scales with size
   * @param payloadSize - Approximate size in bytes
   */
  calculateTimeout(payloadSize: number): number {
    // Base timeout: 5 seconds
    const baseTimeout = 5000;

    // Add 1 second per 10KB
    const sizeOverhead = Math.floor(payloadSize / 10240) * 1000;

    // Cap at max task timeout
    return Math.min(baseTimeout + sizeOverhead, this.config.taskTimeout);
  }

  /**
   * Execute task using a worker from the pool
   */
  async execute<T = WorkerResult>(data: WorkerData): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.shuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    // Calculate dynamic timeout based on payload size
    const payloadSize = typeof data.payload === 'string'
      ? data.payload.length
      : JSON.stringify(data.payload).length;

    const timeout = this.calculateTimeout(payloadSize);

    return new Promise((resolve, reject) => {
      const taskTimeout = setTimeout(() => {
        reject(new Error(`Worker pool task timeout after ${timeout}ms`));
      }, timeout);

      const pendingTask: PendingTask = {
        data,
        resolve: resolve as (value: WorkerResult) => void,
        reject,
        timeout: taskTimeout
      };

      this.pendingTasks.push(pendingTask);
      this.processQueue();
    });
  }

  /**
   * Process pending tasks in queue
   */
  private async processQueue(): Promise<void> {
    if (this.pendingTasks.length === 0) {
      return;
    }

    // Find available worker
    const workerId = this.getAvailableWorker();
    if (!workerId) {
      // Need to create more workers if under max
      if (this.workers.size < this.config.maxWorkers) {
        await this.createWorker();
        const newWorkerId = Array.from(this.idleWorkers)[0];
        if (newWorkerId) {
          this.processWithWorker(newWorkerId);
        }
      }
      return;
    }

    this.processWithWorker(workerId);
  }

  /**
   * Get an available worker from pool
   */
  private getAvailableWorker(): number | null {
    // Try to get idle worker
    for (const workerId of this.idleWorkers) {
      const managedWorker = this.workers.get(workerId);
      if (managedWorker && !managedWorker.inUse) {
        return workerId;
      }
    }
    return null;
  }

  /**
   * Process task with specific worker
   */
  private processWithWorker<T = WorkerResult>(workerId: number): void {
    const managedWorker = this.workers.get(workerId);
    if (!managedWorker || managedWorker.inUse) {
      // Worker not available, try another
      const newWorkerId = this.getAvailableWorker();
      if (newWorkerId) {
        this.processWithWorker(newWorkerId);
      }
      return;
    }

    const pendingTask = this.pendingTasks.shift();
    if (!pendingTask) {
      return;
    }

    // Mark worker as in use
    managedWorker.inUse = true;
    managedWorker.lastUsedAt = Date.now();
    this.idleWorkers.delete(workerId);

    // Check if worker needs recycling
    if (managedWorker.taskCount >= this.config.maxTasksPerWorker) {
      this.recycleWorker(workerId);
      return;
    }

    // Execute task
    const worker = managedWorker.worker;
    let resolved = false;

    worker.once('message', (result: WorkerResult) => {
      resolved = true;
      clearTimeout(pendingTask.timeout);
      managedWorker.taskCount++;
      managedWorker.inUse = false;
      managedWorker.idleSince = Date.now();

      if (result.success) {
        this.stats.completedTasks++;
        // Type assertion needed since worker always returns WorkerResult
        // and T is only for API compatibility
        pendingTask.resolve(result as T);
      } else {
        this.stats.failedTasks++;
        pendingTask.reject(new Error(result.error || 'Task failed'));
      }

      // Return worker to idle pool
      this.idleWorkers.add(workerId);

      // Schedule idle cleanup
      this.scheduleIdleCleanup();

      // Process next task
      this.processQueue();
    });

    worker.once('error', (error) => {
      if (!resolved) {
        clearTimeout(pendingTask.timeout);
        managedWorker.inUse = false;
        this.stats.failedTasks++;
        pendingTask.reject(error);
        this.idleWorkers.add(workerId);
        this.processQueue();
      }
    });

    // Post task to worker
    worker.postMessage(pendingTask.data);
  }

  /**
   * Recycle a worker (terminate and create new)
   */
  private async recycleWorker(workerId: number): Promise<void> {
    const managedWorker = this.workers.get(workerId);
    if (!managedWorker) return;

    // Remove from tracking
    this.idleWorkers.delete(workerId);
    this.workers.delete(workerId);

    // Terminate old worker
    try {
      await managedWorker.worker.terminate();
    } catch (e) {
      // Ignore termination errors
    }

    // Create new worker
    await this.createWorker();

    // Process next task
    this.processQueue();
  }

  /**
   * Schedule cleanup of idle workers
   */
  private scheduleIdleCleanup(): void {
    setTimeout(() => {
      this.cleanupIdleWorkers();
    }, this.config.idleTimeout);
  }

  /**
   * Clean up excess idle workers
   */
  private cleanupIdleWorkers(): void {
    if (this.shuttingDown) return;

    const now = Date.now();
    const toTerminate: number[] = [];

    // Find workers idle too long and above minimum
    for (const workerId of this.idleWorkers) {
      const managedWorker = this.workers.get(workerId);
      if (!managedWorker || managedWorker.inUse) continue;

      const idleTime = managedWorker.idleSince
        ? now - managedWorker.idleSince
        : now - managedWorker.lastUsedAt;

      // Terminate if idle beyond timeout AND above minimum
      if (idleTime >= this.config.idleTimeout && this.workers.size > this.config.minWorkers) {
        toTerminate.push(workerId);
      }
    }

    // Terminate excess workers
    for (const workerId of toTerminate) {
      const managedWorker = this.workers.get(workerId);
      if (managedWorker) {
        this.idleWorkers.delete(workerId);
        this.workers.delete(workerId);
        managedWorker.worker.terminate().catch(() => {});
      }
    }
  }

  /**
   * Get current pool status
   */
  getStatus(): PoolStatus {
    let busyWorkers = 0;
    for (const managedWorker of this.workers.values()) {
      if (managedWorker.inUse) {
        busyWorkers++;
      }
    }

    return {
      idleWorkers: this.idleWorkers.size,
      busyWorkers,
      totalWorkers: this.workers.size,
      queuedTasks: this.pendingTasks.length,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      initialized: this.initialized,
      shuttingDown: this.shuttingDown
    };
  }

  /**
   * Graceful shutdown - wait for pending tasks
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;

    // Wait for pending tasks with timeout
    const shutdownTimeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 10000); // 10 second max wait
    });

    // Wait for queue to drain
    while (this.pendingTasks.length > 0 || this.idleWorkers.size < this.workers.size) {
      await Promise.race([
        new Promise<void>(r => setTimeout(r, 100)),
        shutdownTimeout
      ]);

      if (this.pendingTasks.length === 0) break;
    }

    // Reject remaining pending tasks
    for (const task of this.pendingTasks) {
      clearTimeout(task.timeout);
      task.reject(new Error('Worker pool shutting down'));
    }
    this.pendingTasks = [];

    // Terminate all workers
    await this.terminate();
    this.initialized = false;
    this.shuttingDown = false;
  }

  /**
   * Force terminate all workers
   */
  async terminate(): Promise<void> {
    const terminatePromises: Promise<void>[] = [];

    for (const [_, managedWorker] of this.workers) {
      terminatePromises.push(
        managedWorker.worker.terminate().then(() => {}).catch(() => {})
      );
    }

    await Promise.all(terminatePromises);

    this.workers.clear();
    this.idleWorkers.clear();
    this.initialized = false;
    this.shuttingDown = false;
  }

  /**
   * Alias for terminate() - terminates all workers immediately
   */
  async terminateAll(): Promise<void> {
    return this.terminate();
  }
}

/**
 * Global worker pool instance (lazy initialization)
 */
let globalPool: WorkerPool | null = null;

/**
 * Get or create the global worker pool
 */
export function getGlobalPool(config?: WorkerPoolConfig): WorkerPool {
  if (!globalPool) {
    globalPool = new WorkerPool(config);
  }
  return globalPool;
}

/**
 * Initialize the global worker pool
 */
export async function initializePool(config?: WorkerPoolConfig): Promise<void> {
  const pool = getGlobalPool(config);
  await pool.initialize();
}

/**
 * Shutdown the global worker pool
 */
export async function shutdownPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
}
