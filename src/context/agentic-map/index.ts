/**
 * Agentic-Map Module
 *
 * Provides task graph management and parallel execution capabilities
 * for the vibe-flow workflow system.
 */

export {
  AgenticMapCore,
  createAgenticMapCore,
  createTaskNode,
  createDependencyEdge,
  createTaskGraph,
  DEFAULT_AGENTIC_MAP_CONFIG
} from './core.js';

export {
  ContextIsolation,
  createContextIsolation,
  DEFAULT_ISOLATION_CONFIG
} from './context.js';

export {
  AgenticMapExecutor,
  createExecutor,
  DEFAULT_EXECUTOR_CONFIG
} from './executor.js';

export type {
  TaskNode,
  DependencyEdge,
  TaskGraph,
  ExecutionResult,
  ContextSnapshot,
  AgenticMapConfig,
  GraphStatus,
  TaskStatus,
  TaskEvent,
  ExecutionMetadata,
  GraphValidationResult,
  CycleDetectionResult,
  TopologicalSortResult
} from './types.js';

export type {
  ContextIsolationConfig,
  IsolatedContext
} from './context.js';

export type {
  ExecutorConfig,
  TaskExecutionEvent
} from './executor.js';
