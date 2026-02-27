/**
 * Agentic-Map Types and Interfaces
 *
 * This module defines the core types for the Agentic-Map feature,
 * which provides task graph management and parallel execution capabilities.
 */

// TaskNode - Represents a task in the execution graph
export interface TaskNode {
  id: string;
  command: string;
  workingDir?: string;
  dependsOn: string[];
  timeout?: number;
  env?: Record<string, string>;
  priority?: number;
}

// DependencyEdge - Edge connecting dependent tasks
export interface DependencyEdge {
  from: string;
  to: string;
}

// TaskGraph - Complete task dependency graph
export interface TaskGraph {
  nodes: TaskNode[];
  edges: DependencyEdge[];
}

// ExecutionResult - Result of a task execution
export interface ExecutionResult {
  taskId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  filesModified: string[];
  error?: string;
}

// ContextSnapshot - Isolated context snapshot for a task
export interface ContextSnapshot {
  taskId: string;
  baseTokens: number;
  maxTokens: number;
  truncated: boolean;
  summary?: string;
  contextData: Record<string, unknown>;
}

// AgenticMapConfig - Configuration for Agentic-Map execution
export interface AgenticMapConfig {
  maxTokens: number;
  defaultTimeout: number;
  parallel: boolean;
  failFast: boolean;
  logDir: string;
  maxConcurrent: number;
}

// Graph traversal status
export type GraphStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// Task execution status
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// Task execution event for monitoring
export interface TaskEvent {
  taskId: string;
  status: TaskStatus;
  timestamp: string;
  message?: string;
  duration?: number;
  error?: string;
}

// Graph execution metadata
export interface ExecutionMetadata {
  startTime: string;
  endTime?: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTokens: number;
  peakTokens: number;
}

// Validation result for graph structure
export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Cycle detection result
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath?: string[];
}

// Topological sort result
export interface TopologicalSortResult {
  sorted: string[];
  hasUnreachable: boolean;
  unreachable: string[];
}
