/**
 * Agentic-Map Core Implementation
 *
 * Provides task graph management and parallel execution capabilities
 * with context isolation for parallel workflow execution.
 */

import {
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

/**
 * Default configuration
 */
export const DEFAULT_AGENTIC_MAP_CONFIG: AgenticMapConfig = {
  maxTokens: 128000,
  defaultTimeout: 300000, // 5 minutes
  parallel: true,
  failFast: false,
  logDir: '.vibe-flow/agentic-map',
  maxConcurrent: 4
};

/**
 * AgenticMap - Core task graph manager
 */
export class AgenticMap {
  private graph: TaskGraph;
  private config: AgenticMapConfig;
  private taskStatus: Map<string, TaskStatus> = new Map();
  private executionResults: Map<string, ExecutionResult> = new Map();
  private events: TaskEvent[] = [];
  private graphStatus: GraphStatus = 'pending';

  constructor(graph?: Partial<TaskGraph>, config?: Partial<AgenticMapConfig>) {
    this.graph = {
      nodes: graph?.nodes ?? [],
      edges: graph?.edges ?? []
    };
    this.config = { ...DEFAULT_AGENTIC_MAP_CONFIG, ...config };

    // Initialize task status
    for (const node of this.graph.nodes) {
      this.taskStatus.set(node.id, 'pending');
    }
  }

  /**
   * Add a task node to the graph
   */
  addNode(node: TaskNode): void {
    // Check for duplicate
    if (this.graph.nodes.some(n => n.id === node.id)) {
      throw new Error(`Task ${node.id} already exists`);
    }

    this.graph.nodes.push(node);
    this.taskStatus.set(node.id, 'pending');
  }

  /**
   * Add a dependency edge
   */
  addEdge(edge: DependencyEdge): void {
    // Validate nodes exist
    if (!this.graph.nodes.some(n => n.id === edge.from)) {
      throw new Error(`Source task ${edge.from} does not exist`);
    }
    if (!this.graph.nodes.some(n => n.id === edge.to)) {
      throw new Error(`Target task ${edge.to} does not exist`);
    }

    this.graph.edges.push(edge);
  }

  /**
   * Get node by ID
   */
  getNode(taskId: string): TaskNode | undefined {
    return this.graph.nodes.find(n => n.id === taskId);
  }

  /**
   * Get all nodes
   */
  getNodes(): TaskNode[] {
    return [...this.graph.nodes];
  }

  /**
   * Get all edges
   */
  getEdges(): DependencyEdge[] {
    return [...this.graph.edges];
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskStatus.get(taskId);
  }

  /**
   * Get all task statuses
   */
  getAllStatuses(): Map<string, TaskStatus> {
    return new Map(this.taskStatus);
  }

  /**
   * Validate graph structure
   */
  validate(): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty graph
    if (this.graph.nodes.length === 0) {
      warnings.push('Graph has no nodes');
    }

    // Check for orphan edges
    for (const edge of this.graph.edges) {
      const fromExists = this.graph.nodes.some(n => n.id === edge.from);
      const toExists = this.graph.nodes.some(n => n.id === edge.to);

      if (!fromExists) {
        errors.push(`Edge references non-existent source: ${edge.from}`);
      }
      if (!toExists) {
        errors.push(`Edge references non-existent target: ${edge.to}`);
      }
    }

    // Check for cycles
    const cycleResult = this.detectCycles();
    if (cycleResult.hasCycle) {
      errors.push(`Cycle detected: ${cycleResult.cyclePath?.join(' -> ')}`);
    }

    // Check for unreachable nodes
    const sortResult = this.topologicalSort();
    if (sortResult.hasUnreachable) {
      warnings.push(`Unreachable nodes: ${sortResult.unreachable.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Detect cycles in the graph
   */
  detectCycles(): CycleDetectionResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      // Get all tasks that depend on this one
      const dependents = this.graph.edges
        .filter(e => e.from === nodeId)
        .map(e => e.to);

      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          if (dfs(dependent)) {
            return true;
          }
        } else if (recursionStack.has(dependent)) {
          // Found cycle
          const cycleStart = path.indexOf(dependent);
          return {
            hasCycle: true,
            cyclePath: [...path.slice(cycleStart), dependent]
          } as CycleDetectionResult;
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    // Check all nodes
    for (const node of this.graph.nodes) {
      if (!visited.has(node.id)) {
        const result = dfs(node.id);
        if (typeof result === 'object' && result.hasCycle) {
          return result;
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Topological sort of tasks
   */
  topologicalSort(): TopologicalSortResult {
    const inDegree = new Map<string, number>();
    const result: string[] = [];
    const reachable = new Set<string>();

    // Initialize in-degrees
    for (const node of this.graph.nodes) {
      inDegree.set(node.id, 0);
    }

    // Calculate in-degrees
    for (const edge of this.graph.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      reachable.add(nodeId);

      // Find all dependents
      const dependents = this.graph.edges
        .filter(e => e.from === nodeId)
        .map(e => e.to);

      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Find unreachable nodes
    const unreachable: string[] = [];
    for (const node of this.graph.nodes) {
      if (!reachable.has(node.id)) {
        unreachable.push(node.id);
      }
    }

    return {
      sorted: result,
      hasUnreachable: unreachable.length > 0,
      unreachable
    };
  }

  /**
   * Get ready tasks (all dependencies completed)
   */
  getReadyTasks(): TaskNode[] {
    const ready: TaskNode[] = [];

    for (const node of this.graph.nodes) {
      const status = this.taskStatus.get(node.id);

      if (status === 'pending') {
        // Check if all dependencies are completed
        const dependencies = this.graph.edges
          .filter(e => e.to === node.id)
          .map(e => e.from);

        const allDepsCompleted = dependencies.every(
          depId => this.taskStatus.get(depId) === 'completed'
        );

        if (allDepsCompleted) {
          ready.push(node);
        }
      }
    }

    return ready;
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: TaskStatus, error?: string): void {
    this.taskStatus.set(taskId, status);

    this.events.push({
      taskId,
      status,
      timestamp: new Date().toISOString(),
      error
    });
  }

  /**
   * Record execution result
   */
  recordResult(result: ExecutionResult): void {
    this.executionResults.set(result.taskId, result);
    this.updateTaskStatus(
      result.taskId,
      result.success ? 'completed' : 'failed',
      result.error
    );
  }

  /**
   * Get execution result
   */
  getResult(taskId: string): ExecutionResult | undefined {
    return this.executionResults.get(taskId);
  }

  /**
   * Get all results
   */
  getAllResults(): Map<string, ExecutionResult> {
    return new Map(this.executionResults);
  }

  /**
   * Get events
   */
  getEvents(): TaskEvent[] {
    return [...this.events];
  }

  /**
   * Get graph status
   */
  getGraphStatus(): GraphStatus {
    const statuses = Array.from(this.taskStatus.values());

    if (statuses.every(s => s === 'completed')) {
      return 'completed';
    }
    if (statuses.some(s => s === 'failed')) {
      return 'failed';
    }
    if (statuses.some(s => s === 'running')) {
      return 'running';
    }
    if (statuses.some(s => s === 'pending')) {
      return 'running';
    }

    return 'pending';
  }

  /**
   * Get execution metadata
   */
  getExecutionMetadata(): ExecutionMetadata {
    const startTime = this.events.length > 0
      ? this.events[0].timestamp
      : new Date().toISOString();

    const statuses = Array.from(this.taskStatus.values());
    const results = Array.from(this.executionResults.values());

    return {
      startTime,
      endTime: this.getGraphStatus() === 'completed' || this.getGraphStatus() === 'failed'
        ? new Date().toISOString()
        : undefined,
      totalTasks: this.graph.nodes.length,
      completedTasks: statuses.filter(s => s === 'completed').length,
      failedTasks: statuses.filter(s => s === 'failed').length,
      totalTokens: 0, // Would be calculated from context snapshots
      peakTokens: 0
    };
  }

  /**
   * Get configuration
   */
  getConfig(): AgenticMapConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgenticMapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the task graph
   */
  getGraph(): TaskGraph {
    return {
      nodes: [...this.graph.nodes],
      edges: [...this.graph.edges]
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.graph.nodes = [];
    this.graph.edges = [];
    this.taskStatus.clear();
    this.executionResults.clear();
    this.events = [];
    this.graphStatus = 'pending';
  }
}

/**
 * Create AgenticMap instance
 */
export function createAgenticMap(
  graph?: Partial<TaskGraph>,
  config?: Partial<AgenticMapConfig>
): AgenticMap {
  return new AgenticMap(graph, config);
}

/**
 * Create task node helper
 */
export function createTaskNode(
  id: string,
  command: string,
  dependsOn: string[] = [],
  options?: Partial<TaskNode>
): TaskNode {
  return {
    id,
    command,
    dependsOn,
    ...options
  };
}

/**
 * Create dependency edge helper
 */
export function createDependencyEdge(from: string, to: string): DependencyEdge {
  return { from, to };
}

export default AgenticMap;
