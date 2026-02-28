/**
 * Agentic-Map Context Isolation
 *
 * Provides isolated context management for parallel task execution.
 * Each task gets a clean context snapshot without pollution from other tasks.
 */

import { randomUUID } from 'crypto';
import { TaskNode, ContextSnapshot, ExecutionResult } from './types.js';

/**
 * Context Isolation Configuration
 */
export interface ContextIsolationConfig {
  maxTokens: number;
  includeCompletedResults: boolean;
  includeErrors: boolean;
  maxHistoryEntries: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ISOLATION_CONFIG: ContextIsolationConfig = {
  maxTokens: 128000,
  includeCompletedResults: true,
  includeErrors: false,
  maxHistoryEntries: 10
};

/**
 * ContextSnapshot with isolation metadata
 */
export interface IsolatedContext extends ContextSnapshot {
  /** Unique ID for this context */
  contextId: string;
  /** Timestamp when context was created */
  createdAt: string;
  /** Task IDs this context depends on */
  dependencyIds: string[];
  /** Whether context was truncated */
  wasTruncated: boolean;
  /** Isolation level */
  isolationLevel: 'strict' | 'moderate' | 'loose';
}

/**
 * ContextIsolation - Manages isolated contexts for task execution
 */
export class ContextIsolation {
  private config: ContextIsolationConfig;
  private snapshots: Map<string, IsolatedContext> = new Map();
  private executionHistory: Map<string, ExecutionResult[]> = new Map();

  constructor(config?: Partial<ContextIsolationConfig>) {
    this.config = { ...DEFAULT_ISOLATION_CONFIG, ...config };
  }

  /**
   * Create an isolated context for a task
   */
  createContext(
    taskId: string,
    task: TaskNode,
    dependencyResults?: Map<string, ExecutionResult>
  ): IsolatedContext {
    const contextId = randomUUID();
    const createdAt = new Date().toISOString();

    // Build dependency IDs
    const dependencyIds = task.dependsOn || [];

    // Calculate base token estimate (rough)
    const baseTokens = this.estimateBaseTokens(task);

    // Determine if truncation is needed
    const wasTruncated = baseTokens > this.config.maxTokens;

    // Build context data based on configuration
    const contextData: Record<string, unknown> = {
      taskId,
      taskCommand: task.command,
      workingDir: task.workingDir,
      environment: task.env,
      createdAt
    };

    // Include dependency results if configured
    if (this.config.includeCompletedResults && dependencyResults) {
      const completedResults: Record<string, unknown> = {};

      for (const [depId, result] of dependencyResults) {
        if (result.success || this.config.includeErrors) {
          completedResults[depId] = {
            success: result.success,
            exitCode: result.exitCode,
            duration: result.duration,
            filesModified: result.filesModified,
            ...(result.error && this.config.includeErrors ? { error: result.error } : {})
          };
        }
      }

      contextData.dependencies = completedResults;
    }

    // Add recent history if available
    const history = this.executionHistory.get(taskId);
    if (history && history.length > 0) {
      const recentHistory = history.slice(-this.config.maxHistoryEntries);
      contextData.executionHistory = recentHistory.map(h => ({
        taskId: h.taskId,
        success: h.success,
        duration: h.duration,
        timestamp: createdAt
      }));
    }

    const context: IsolatedContext = {
      contextId,
      taskId,
      baseTokens,
      maxTokens: this.config.maxTokens,
      truncated: wasTruncated,
      wasTruncated,
      contextData,
      dependencyIds,
      isolationLevel: this.determineIsolationLevel(task),
      summary: wasTruncated
        ? `Context truncated from ${baseTokens} to ${this.config.maxTokens} tokens. Isolation: ${this.determineIsolationLevel(task)}`
        : undefined,
      createdAt
    };

    // Store snapshot
    this.snapshots.set(contextId, context);

    return context;
  }

  /**
   * Get context by ID
   */
  getContext(contextId: string): IsolatedContext | undefined {
    return this.snapshots.get(contextId);
  }

  /**
   * Get context by task ID
   */
  getContextByTaskId(taskId: string): IsolatedContext | undefined {
    for (const context of this.snapshots.values()) {
      if (context.taskId === taskId) {
        return context;
      }
    }
    return undefined;
  }

  /**
   * Record execution result for history
   */
  recordExecution(taskId: string, result: ExecutionResult): void {
    const history = this.executionHistory.get(taskId) || [];
    history.push(result);

    // Keep only recent history
    if (history.length > this.config.maxHistoryEntries * 2) {
      history.splice(0, history.length - this.config.maxHistoryEntries);
    }

    this.executionHistory.set(taskId, history);
  }

  /**
   * Get execution history for a task
   */
  getHistory(taskId: string): ExecutionResult[] {
    return this.executionHistory.get(taskId) || [];
  }

  /**
   * Clear context for a task
   */
  clearContext(taskId: string): void {
    // Find and remove context by task ID
    for (const [contextId, context] of this.snapshots) {
      if (context.taskId === taskId) {
        this.snapshots.delete(contextId);
        break;
      }
    }
  }

  /**
   * Clear all contexts
   */
  clearAll(): void {
    this.snapshots.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): ContextIsolationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextIsolationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Estimate base tokens for a task
   */
  private estimateBaseTokens(task: TaskNode): number {
    // Rough estimation based on command length
    const commandLength = task.command.length;
    const envLength = task.env ? JSON.stringify(task.env).length : 0;
    const workingDirLength = task.workingDir?.length || 0;

    // Rough: 1 token ≈ 4 characters
    return Math.floor((commandLength + envLength + workingDirLength) / 4) + 1000;
  }

  /**
   * Determine isolation level based on task
   */
  private determineIsolationLevel(task: TaskNode): 'strict' | 'moderate' | 'loose' {
    // High priority tasks get strict isolation
    if ((task.priority ?? 0) >= 10) {
      return 'strict';
    }

    // Tasks with many dependencies get loose isolation (share more context)
    if ((task.dependsOn?.length ?? 0) > 3) {
      return 'loose';
    }

    return 'moderate';
  }

  /**
   * Get isolation statistics
   */
  getStats(): {
    totalContexts: number;
    truncatedContexts: number;
    averageTokens: number;
    isolationLevels: Record<string, number>;
  } {
    const contexts = Array.from(this.snapshots.values());

    const truncatedCount = contexts.filter(c => c.wasTruncated).length;
    const totalTokens = contexts.reduce((sum, c) => sum + c.baseTokens, 0);

    const isolationLevels: Record<string, number> = {
      strict: 0,
      moderate: 0,
      loose: 0
    };

    for (const context of contexts) {
      isolationLevels[context.isolationLevel]++;
    }

    return {
      totalContexts: contexts.length,
      truncatedContexts: truncatedCount,
      averageTokens: contexts.length > 0 ? Math.floor(totalTokens / contexts.length) : 0,
      isolationLevels
    };
  }
}

/**
 * Create ContextIsolation instance
 */
export function createContextIsolation(
  config?: Partial<ContextIsolationConfig>
): ContextIsolation {
  return new ContextIsolation(config);
}

export default ContextIsolation;
