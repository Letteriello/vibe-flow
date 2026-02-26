// SubagentCoordinator - Parallel task coordination for BMAD state machine
// Coordinates execution of isolated tasks during Implementation phase (Phase 4)

import { Phase } from './index.js';

// ============================================================================
// Types - Explicit types for all properties
// ============================================================================

/**
 * Task execution status
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Individual isolated task from Solutioning phase
 */
export interface ParallelTask {
  id: string;
  description: string;
  dependencies: string[];
  priority: number;
  estimatedTokens?: number;
  contextSnapshot?: Record<string, unknown>;
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

/**
 * Overall coordinator result
 */
export interface CoordinatorResult {
  success: boolean;
  taskResults: TaskResult[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  };
  allCompleted: boolean;
}

/**
 * Task execution handler - must be non-blocking
 */
export type TaskExecutor = (task: ParallelTask) => Promise<TaskResult>;

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  maxConcurrent?: number;
  timeoutMs?: number;
  continueOnFailure?: boolean;
  progressCallback?: (status: CoordinatorStatus) => void;
}

/**
 * Real-time coordinator status
 */
export interface CoordinatorStatus {
  phase: Phase;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  progressPercentage: number;
  currentTasks: ParallelTask[];
  isComplete: boolean;
}

/**
 * Phase transition context for parallel tasks
 */
export interface PhaseTransitionContext {
  fromPhase: Phase;
  toPhase: Phase;
  tasks: ParallelTask[];
  correlationId: string;
}

// ============================================================================
// SubagentCoordinator Class
// ============================================================================

/**
 * Coordinates parallel execution of isolated tasks
 * Does not block the main event loop - uses async/await pattern
 */
export class SubagentCoordinator {
  private tasks: Map<string, ParallelTask> = new Map();
  private taskResults: Map<string, TaskResult> = new Map();
  private taskStatus: Map<string, TaskStatus> = new Map();
  private config: Required<CoordinatorConfig>;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config: CoordinatorConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      timeoutMs: config.timeoutMs ?? 300000,
      continueOnFailure: config.continueOnFailure ?? true,
      progressCallback: config.progressCallback ?? (() => {})
    };
  }

  /**
   * Initialize coordinator with tasks from Solutioning phase
   * Resolves dependencies and sets initial status
   */
  initialize(tasks: ParallelTask[]): void {
    // Clear previous state
    this.tasks.clear();
    this.taskResults.clear();
    this.taskStatus.clear();
    this.isRunning = false;

    // Register tasks with dependency resolution
    for (const task of tasks) {
      this.tasks.set(task.id, task);
      this.taskStatus.set(task.id, TaskStatus.PENDING);

      // Validate dependencies exist
      for (const depId of task.dependencies) {
        if (!this.tasks.has(depId)) {
          console.warn(`] Task ${task.id} has unknown[SubagentCoordinator dependency: ${depId}`);
        }
      }
    }

    console.log(`[SubagentCoordinator] Initialized with ${tasks.length} tasks`);
  }

  /**
   * Execute all tasks in parallel with controlled concurrency
   * Non-blocking - returns Promise that resolves when all complete
   */
  async executeAll(executor: TaskExecutor): Promise<CoordinatorResult> {
    if (this.tasks.size === 0) {
      return this.buildResult(true);
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const pendingTasks = Array.from(this.tasks.values())
      .sort((a, b) => b.priority - a.priority);

    const executing: Promise<void>[] = [];
    let currentIndex = 0;

    // Control concurrency without blocking event loop
    const executeNext = async (): Promise<void> => {
      while (currentIndex < pendingTasks.length && !this.abortController?.signal.aborted) {
        const task = pendingTasks[currentIndex++];

        // Check if dependencies are met
        if (!this.areDependenciesMet(task)) {
          continue;
        }

        // Check max concurrent limit
        const runningCount = this.getStatusCount(TaskStatus.RUNNING);
        if (runningCount >= this.config.maxConcurrent) {
          // Wait for a slot to open
          await this.waitForSlot();
        }

        // Execute task if not aborted
        if (!this.abortController?.signal.aborted) {
          await this.executeTask(task, executor);
        }
      }
    };

    // Start concurrent executors (non-blocking)
    const numWorkers = Math.min(this.config.maxConcurrent, pendingTasks.length);
    for (let i = 0; i < numWorkers; i++) {
      executing.push(executeNext());
    }

    // Wait for all to complete
    await Promise.all(executing);

    this.isRunning = false;
    this.emitProgress();

    return this.buildResult(this.config.continueOnFailure
      ? this.getStatusCount(TaskStatus.FAILED) === 0
      : this.getStatusCount(TaskStatus.COMPLETED) === this.tasks.size);
  }

  /**
   * Execute a single task with timeout
   */
  private async executeTask(task: ParallelTask, executor: TaskExecutor): Promise<void> {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    // Update status to running
    this.taskStatus.set(task.id, TaskStatus.RUNNING);
    this.taskResults.set(task.id, {
      taskId: task.id,
      status: TaskStatus.RUNNING,
      startedAt
    });

    this.emitProgress();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(task, executor);

      // Update result
      this.taskResults.set(task.id, result);
      this.taskStatus.set(task.id, result.status);

      console.log(`[SubagentCoordinator] Task ${task.id} ${result.status}: ${result.durationMs}ms`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.taskResults.set(task.id, {
        taskId: task.id,
        status: TaskStatus.FAILED,
        error: errorMessage,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      });
      this.taskStatus.set(task.id, TaskStatus.FAILED);

      console.error(`[SubagentCoordinator] Task ${task.id} failed:`, errorMessage);
    }

    this.emitProgress();
  }

  /**
   * Execute task with configurable timeout
   */
  private async executeWithTimeout(task: ParallelTask, executor: TaskExecutor): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      executor(task)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Check if all dependencies for a task are completed
   */
  private areDependenciesMet(task: ParallelTask): boolean {
    for (const depId of task.dependencies) {
      const depStatus = this.taskStatus.get(depId);
      if (depStatus !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Wait for a concurrent slot to open
   */
  private waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const runningCount = this.getStatusCount(TaskStatus.RUNNING);
        if (runningCount < this.config.maxConcurrent) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Get count of tasks with specific status
   */
  getStatusCount(status: TaskStatus): number {
    let count = 0;
    for (const s of Array.from(this.taskStatus.values())) {
      if (s === status) count++;
    }
    return count;
  }

  /**
   * Get current status snapshot
   */
  getStatus(): CoordinatorStatus {
    const currentTasks: ParallelTask[] = [];
    for (const [id, status] of Array.from(this.taskStatus.entries())) {
      if (status === TaskStatus.RUNNING) {
        const task = this.tasks.get(id);
        if (task) currentTasks.push(task);
      }
    }

    const total = this.tasks.size;
    const completed = this.getStatusCount(TaskStatus.COMPLETED);
    const failed = this.getStatusCount(TaskStatus.FAILED);
    const running = this.getStatusCount(TaskStatus.RUNNING);
    const pending = this.getStatusCount(TaskStatus.PENDING);

    return {
      phase: Phase.IMPLEMENTATION,
      totalTasks: total,
      completedTasks: completed,
      failedTasks: failed,
      runningTasks: running,
      pendingTasks: pending,
      progressPercentage: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
      currentTasks,
      isComplete: completed + failed === total && total > 0
    };
  }

  /**
   * Get result for a specific task
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.taskResults.get(taskId);
  }

  /**
   * Get all results
   */
  getAllResults(): TaskResult[] {
    return Array.from(this.taskResults.values());
  }

  /**
   * Cancel all running tasks
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;

    // Mark pending/running as cancelled
    for (const [id, status] of this.taskStatus.entries()) {
      if (status === TaskStatus.PENDING || status === TaskStatus.RUNNING) {
        this.taskStatus.set(id, TaskStatus.CANCELLED);
        this.taskResults.set(id, {
          taskId: id,
          status: TaskStatus.CANCELLED,
          error: 'Cancelled by user'
        });
      }
    }

    this.emitProgress();
  }

  /**
   * Check if all tasks are complete (for phase transition)
   */
  allComplete(): boolean {
    if (this.tasks.size === 0) return true;

    for (const status of Array.from(this.taskStatus.values())) {
      if (status !== TaskStatus.COMPLETED && status !== TaskStatus.FAILED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Build final coordinator result
   */
  private buildResult(success: boolean): CoordinatorResult {
    const taskResults = this.getAllResults();
    return {
      success,
      taskResults,
      summary: {
        total: this.tasks.size,
        completed: this.getStatusCount(TaskStatus.COMPLETED),
        failed: this.getStatusCount(TaskStatus.FAILED),
        pending: this.getStatusCount(TaskStatus.PENDING),
        running: this.getStatusCount(TaskStatus.RUNNING)
      },
      allCompleted: this.allComplete()
    };
  }

  /**
   * Emit progress update
   */
  private emitProgress(): void {
    const status = this.getStatus();
    this.config.progressCallback(status);
  }

  /**
   * Reset coordinator state
   */
  reset(): void {
    this.tasks.clear();
    this.taskResults.clear();
    this.taskStatus.clear();
    this.isRunning = false;
    this.abortController = null;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ParallelTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ParallelTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Check if coordinator is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Check if ready to transition to Implementation phase (Phase 4)
 * Consolidates task status before phase advancement
 */
export function canTransitionToImplementation(
  coordinator: SubagentCoordinator | null
): boolean {
  if (!coordinator) {
    // No parallel tasks - ready to transition
    return true;
  }

  // All tasks must be complete or failed (depending on config)
  return coordinator.allComplete();
}

/**
 * Extract tasks from Solutioning phase output
 * Parses the solutioning context to build parallel tasks
 */
export function extractParallelTasks(solutioningContext: Record<string, unknown>): ParallelTask[] {
  const tasks: ParallelTask[] = [];

  // Extract tasks from context if available
  const contextTasks = solutioningContext.tasks as ParallelTask[] | undefined;
  if (contextTasks && Array.isArray(contextTasks)) {
    return contextTasks;
  }

  // Otherwise create single task from context
  const description = solutioningContext.solution as string | undefined;
  if (description) {
    tasks.push({
      id: `impl-${Date.now()}`,
      description: String(description),
      dependencies: [],
      priority: 1
    });
  }

  return tasks;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSubagentCoordinator(config?: CoordinatorConfig): SubagentCoordinator {
  return new SubagentCoordinator(config);
}

export function createCoordinatorWithDefaults(): SubagentCoordinator {
  return new SubagentCoordinator({
    maxConcurrent: 5,
    timeoutMs: 300000,
    continueOnFailure: false
  });
}
