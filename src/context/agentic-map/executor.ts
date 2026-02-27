/**
 * Agentic-Map Executor
 *
 * Provides task execution capabilities for the Agentic-Map system.
 * Handles parallel execution of tasks with proper isolation.
 */

import { randomUUID } from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import {
  TaskNode,
  ExecutionResult,
  TaskStatus,
  TaskGraph
} from './types.js';
import { ContextIsolation, IsolatedContext } from './context.js';

/**
 * Executor Configuration
 */
export interface ExecutorConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  failFast: boolean;
  isolateContexts: boolean;
  logDir: string;
}

/**
 * Default configuration
 */
export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxConcurrent: 4,
  defaultTimeout: 300000, // 5 minutes
  failFast: false,
  isolateContexts: true,
  logDir: '.vibe-flow/agentic-map/executor'
};

/**
 * Task Execution Event
 */
export interface TaskExecutionEvent {
  taskId: string;
  status: TaskStatus;
  timestamp: string;
  duration?: number;
  error?: string;
  contextId?: string;
}

/**
 * Executor - Handles task execution with context isolation
 */
export class AgenticMapExecutor {
  private config: ExecutorConfig;
  private contextIsolation: ContextIsolation;
  private runningTasks: Map<string, ChildProcess> = new Map();
  private eventHandlers: Array<(event: TaskExecutionEvent) => void> = [];

  constructor(
    config?: Partial<ExecutorConfig>,
    contextIsolation?: ContextIsolation
  ) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.contextIsolation = contextIsolation || new ContextIsolation();
  }

  /**
   * Execute a single task
   */
  async execute(
    task: TaskNode,
    graph: TaskGraph,
    dependencyResults?: Map<string, ExecutionResult>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Create isolated context if enabled
    let context: IsolatedContext | undefined;
    if (this.config.isolateContexts) {
      context = this.contextIsolation.createContext(task.id, task, dependencyResults);
      this.emit({
        taskId: task.id,
        status: 'running',
        timestamp: new Date().toISOString(),
        contextId: context.contextId
      });
    }

    try {
      // Execute with timeout
      const timeout = task.timeout ?? this.config.defaultTimeout;

      const result = await this.executeWithTimeout(task, timeout);

      // Record result in context isolation
      if (context) {
        this.contextIsolation.recordExecution(task.id, result);
      }

      this.emit({
        taskId: task.id,
        status: result.success ? 'completed' : 'failed',
        timestamp: new Date().toISOString(),
        duration: result.duration,
        error: result.error,
        contextId: context?.contextId
      });

      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        taskId: task.id,
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        filesModified: [],
        error: error instanceof Error ? error.message : String(error)
      };

      this.emit({
        taskId: task.id,
        status: 'failed',
        timestamp: new Date().toISOString(),
        duration: errorResult.duration,
        error: errorResult.error,
        contextId: context?.contextId
      });

      return errorResult;
    }
  }

  /**
   * Execute multiple tasks in parallel respecting dependencies
   */
  async executeParallel(
    tasks: TaskNode[],
    graph: TaskGraph,
    onProgress?: (taskId: string, status: TaskStatus) => void
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const completed = new Set<string>();
    const running = new Set<string>();

    // Build dependency map
    const dependencies = new Map<string, string[]>();
    for (const task of tasks) {
      dependencies.set(task.id, task.dependsOn || []);
    }

    // Track results
    const resultMap = new Map<string, ExecutionResult>();

    // Execute while there are tasks remaining
    while (completed.size < tasks.length) {
      // Find ready tasks (all dependencies satisfied)
      const readyTasks = tasks.filter(task => {
        if (completed.has(task.id) || running.has(task.id)) {
          return false;
        }
        const deps = dependencies.get(task.id) || [];
        return deps.every(depId => completed.has(depId));
      });

      // Check if we can run more tasks
      const availableSlots = this.config.maxConcurrent - running.size;

      if (readyTasks.length === 0 && running.size === 0) {
        // Deadlock - no tasks can run
        break;
      }

      // Execute ready tasks up to available slots
      const tasksToRun = readyTasks.slice(0, availableSlots);

      const promises = tasksToRun.map(async task => {
        running.add(task.id);
        onProgress?.(task.id, 'running');

        // Get dependency results
        const depResults = new Map<string, ExecutionResult>();
        for (const depId of task.dependsOn || []) {
          const depResult = resultMap.get(depId);
          if (depResult) {
            depResults.set(depId, depResult);
          }
        }

        const result = await this.execute(task, graph, depResults);
        resultMap.set(task.id, result);
        results.push(result);
        completed.add(task.id);
        running.delete(task.id);
        onProgress?.(task.id, result.success ? 'completed' : 'failed');

        // Check fail fast
        if (!result.success && this.config.failFast) {
          return result;
        }

        return result;
      });

      // Wait for at least one to complete
      if (promises.length > 0) {
        await Promise.race(promises);

        // If fail fast and any failed, stop
        if (this.config.failFast) {
          const hasFailure = results.some(r => !r.success);
          if (hasFailure) {
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Cancel a running task
   */
  cancel(taskId: string): boolean {
    const proc = this.runningTasks.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      this.runningTasks.delete(taskId);
      this.emit({
        taskId,
        status: 'cancelled',
        timestamp: new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  /**
   * Cancel all running tasks
   */
  cancelAll(): number {
    let cancelled = 0;
    for (const [taskId, proc] of this.runningTasks) {
      proc.kill('SIGTERM');
      cancelled++;
      this.emit({
        taskId,
        status: 'cancelled',
        timestamp: new Date().toISOString()
      });
    }
    this.runningTasks.clear();
    return cancelled;
  }

  /**
   * Subscribe to execution events
   */
  onEvent(handler: (event: TaskExecutionEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  offEvent(handler: (event: TaskExecutionEvent) => void): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Get running task count
   */
  getRunningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Get configuration
   */
  getConfig(): ExecutorConfig {
    return { ...this.config };
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout(task: TaskNode, timeout: number): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Parse command - handle both simple commands and shell scripts
      const [cmd, ...args] = task.command.split(' ');

      const proc = spawn(cmd, args, {
        cwd: task.workingDir || process.cwd(),
        env: { ...process.env, ...task.env },
        shell: true
      });

      this.runningTasks.set(task.id, proc);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutHandle = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          taskId: task.id,
          success: false,
          exitCode: -1,
          stdout,
          stderr: `Task timed out after ${timeout}ms`,
          duration: Date.now() - startTime,
          filesModified: [],
          error: `Task timed out after ${timeout}ms`
        });
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.runningTasks.delete(task.id);

        resolve({
          taskId: task.id,
          success: code === 0,
          exitCode: code ?? -1,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          filesModified: [] // Would need file watching to track this
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.runningTasks.delete(task.id);

        resolve({
          taskId: task.id,
          success: false,
          exitCode: -1,
          stdout,
          stderr: error.message,
          duration: Date.now() - startTime,
          filesModified: [],
          error: error.message
        });
      });
    });
  }

  /**
   * Emit event to all handlers
   */
  private emit(event: TaskExecutionEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}

/**
 * Create Executor instance
 */
export function createExecutor(
  config?: Partial<ExecutorConfig>,
  contextIsolation?: ContextIsolation
): AgenticMapExecutor {
  return new AgenticMapExecutor(config, contextIsolation);
}

export default AgenticMapExecutor;
