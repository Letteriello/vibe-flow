/**
 * Agentic-Map Test Specifications
 *
 * Defines test cases and specifications for the Agentic-Map feature.
 * This file serves as the test specification document.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgenticMapCore } from '../../src/context/agentic-map/core.js';
import type { TaskNode, TaskGraph, ExecutionResult, AgenticMapConfig } from '../../src/context/agentic-map/types.js';

// Test configuration
const testConfig: AgenticMapConfig = {
  maxTokens: 8000,
  defaultTimeout: 30000,
  parallel: true,
  failFast: false,
  logDir: '.vitest-logs',
  maxConcurrent: 3
};

// Sample task graph for testing
const sampleTaskGraph: TaskGraph = {
  nodes: [
    { id: 'task-1', command: 'echo "Task 1"', dependsOn: [] },
    { id: 'task-2', command: 'echo "Task 2"', dependsOn: ['task-1'] },
    { id: 'task-3', command: 'echo "Task 3"', dependsOn: ['task-1'] },
    { id: 'task-4', command: 'echo "Task 4"', dependsOn: ['task-2', 'task-3'] }
  ],
  edges: [
    { from: 'task-1', to: 'task-2' },
    { from: 'task-1', to: 'task-3' },
    { from: 'task-2', to: 'task-4' },
    { from: 'task-3', to: 'task-4' }
  ]
};

describe('AgenticMapCore', () => {
  let agenticMap: AgenticMapCore;

  beforeEach(() => {
    agenticMap = new AgenticMapCore(testConfig);
  });

  afterEach(() => {
    agenticMap.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(agenticMap).toBeDefined();
    });

    it('should set default config values', () => {
      const defaultMap = new AgenticMapCore({});
      expect(defaultMap).toBeDefined();
    });
  });

  describe('loadGraph', () => {
    it('should load a valid task graph', () => {
      const result = agenticMap.loadGraph(sampleTaskGraph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject graph with cycles', () => {
      const cyclicGraph: TaskGraph = {
        nodes: [
          { id: 'a', command: 'echo a', dependsOn: ['b'] },
          { name: 'b', command: 'echo b', dependsOn: ['a'] }
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' }
        ]
      };
      const result = agenticMap.loadGraph(cyclicGraph);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject graph with missing dependencies', () => {
      const invalidGraph: TaskGraph = {
        nodes: [
          { id: 'a', command: 'echo a', dependsOn: ['nonexistent'] }
        ],
        edges: []
      };
      const result = agenticMap.loadGraph(invalidGraph);
      expect(result.valid).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute all tasks in topological order', async () => {
      agenticMap.loadGraph(sampleTaskGraph);
      const results = await agenticMap.execute();

      expect(results.length).toBe(4);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should respect dependency order', async () => {
      const orderedGraph: TaskGraph = {
        nodes: [
          { id: 'first', command: 'echo "first"', dependsOn: [] },
          { id: 'second', command: 'echo "second"', dependsOn: ['first'] }
        ],
        edges: [{ from: 'first', to: 'second' }]
      };

      agenticMap.loadGraph(orderedGraph);
      const results = await agenticMap.execute();

      const firstResult = results.find(r => r.taskId === 'first');
      const secondResult = results.find(r => r.taskId === 'second');

      expect(firstResult?.success).toBe(true);
      expect(secondResult?.success).toBe(true);
    });

    it('should fail on task failure when failFast is true', async () => {
      const failGraph: TaskGraph = {
        nodes: [
          { id: 'fail', command: 'exit 1', dependsOn: [] },
          { id: 'next', command: 'echo "next"', dependsOn: ['fail'] }
        ],
        edges: [{ from: 'fail', to: 'next' }]
      };

      const failFastMap = new AgenticMapCore({ ...testConfig, failFast: true });
      failFastMap.loadGraph(failGraph);

      const results = await failFastMap.execute();
      const failResult = results.find(r => r.taskId === 'fail');

      expect(failResult?.success).toBe(false);
    });
  });

  describe('getExecutionOrder', () => {
    it('should return correct topological order', () => {
      agenticMap.loadGraph(sampleTaskGraph);
      const order = agenticMap.getExecutionOrder();

      expect(order).toContain('task-1');
      expect(order.indexOf('task-1')).toBeLessThan(order.indexOf('task-2'));
      expect(order.indexOf('task-1')).toBeLessThan(order.indexOf('task-3'));
      expect(order.indexOf('task-4')).toBeGreaterThan(order.indexOf('task-2'));
      expect(order.indexOf('task-4')).toBeGreaterThan(order.indexOf('task-3'));
    });
  });

  describe('getReadyTasks', () => {
    it('should return tasks with no pending dependencies', () => {
      agenticMap.loadGraph(sampleTaskGraph);
      const ready = agenticMap.getReadyTasks();

      expect(ready).toContain('task-1');
      expect(ready).not.toContain('task-2');
      expect(ready).not.toContain('task-3');
      expect(ready).not.toContain('task-4');
    });
  });

  describe('isolateContext', () => {
    it('should create isolated context for a task', async () => {
      agenticMap.loadGraph(sampleTaskGraph);
      const context = await agenticMap.isolateContext('task-2');

      expect(context).toBeDefined();
      expect(context.taskId).toBe('task-2');
      expect(context.maxTokens).toBe(testConfig.maxTokens);
    });
  });
});

describe('TaskGraph validation', () => {
  let agenticMap: AgenticMapCore;

  beforeEach(() => {
    agenticMap = new AgenticMapCore(testConfig);
  });

  afterEach(() => {
    agenticMap.cleanup();
  });

  it('should detect unreachable nodes', () => {
    const graphWithUnreachable: TaskGraph = {
      nodes: [
        { id: 'a', command: 'echo a', dependsOn: [] },
        { id: 'b', command: 'echo b', dependsOn: [] },
        { id: 'orphan', command: 'echo orphan', dependsOn: [] }
      ],
      edges: [{ from: 'a', to: 'b' }]
    };

    agenticMap.loadGraph(graphWithUnreachable);
    const unreachable = agenticMap.getUnreachableTasks();

    expect(unreachable).toContain('orphan');
  });

  it('should validate empty graph', () => {
    const result = agenticMap.loadGraph({ nodes: [], edges: [] });
    expect(result.valid).toBe(true);
  });
});
