// Programmatic Tool Calling - Execute LLM-generated orchestration scripts in isolation
import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

/**
 * Result of programmatic tool execution
 */
export interface ProgrammaticExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  toolCalls: ToolCallRecord[];
  iterations: number;
  tokensSaved: number;
  executionTimeMs: number;
}

/**
 * Record of a tool call made during script execution
 */
export interface ToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  timestamp: string;
  iteration: number;
}

/**
 * Configuration for programmatic tool calling
 */
export interface ProgrammaticCallerConfig {
  timeoutMs: number;
  maxIterations: number;
  maxToolCalls: number;
  enableSandbox: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ProgrammaticCallerConfig = {
  timeoutMs: 30000,
  maxIterations: 100,
  maxToolCalls: 500,
  enableSandbox: true
};

/**
 * Tool executor function type - allows scripts to call MCP tools
 */
type ToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>;

/**
 * Result aggregator for pagination/loop results
 */
interface ResultAggregator {
  items: unknown[];
  metadata: {
    totalIterations: number;
    totalToolCalls: number;
    hasMore: boolean;
    lastCursor?: string;
  };
}

/**
 * Programmatic Tool Calling implementation
 * Executes LLM-generated scripts in isolated sandbox environment
 */
export class ProgrammaticCaller {
  private config: ProgrammaticCallerConfig;
  private toolExecutor: ToolExecutor | null = null;
  private toolCalls: ToolCallRecord[];
  private currentIteration: number;

  constructor(config: Partial<ProgrammaticCallerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.toolCalls = [];
    this.currentIteration = 0;
  }

  /**
   * Set the tool executor function - must be provided before execution
   */
  setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor;
  }

  /**
   * Execute a TypeScript or Python script in sandbox
   */
  async executeScript(
    script: string,
    language: 'typescript' | 'python',
    initialContext?: Record<string, unknown>
  ): Promise<ProgrammaticExecutionResult> {
    const startTime = Date.now();
    this.toolCalls = [];
    this.currentIteration = 0;

    if (!this.toolExecutor) {
      return {
        success: false,
        error: 'Tool executor not set. Call setToolExecutor() first.',
        toolCalls: [],
        iterations: 0,
        tokensSaved: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    try {
      let output: unknown;

      if (language === 'typescript') {
        output = await this.executeTypeScript(script, initialContext);
      } else {
        output = await this.executePython(script, initialContext);
      }

      const executionTime = Date.now() - startTime;
      const tokensSaved = this.estimateTokensSaved();

      return {
        success: true,
        output: this.sanitizeOutput(output),
        toolCalls: [...this.toolCalls],
        iterations: this.currentIteration,
        tokensSaved,
        executionTimeMs: executionTime
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        toolCalls: [...this.toolCalls],
        iterations: this.currentIteration,
        tokensSaved: this.estimateTokensSaved(),
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Execute TypeScript script in sandbox
   */
  private async executeTypeScript(
    script: string,
    initialContext?: Record<string, unknown>
  ): Promise<unknown> {
    // Create sandbox context with limited globals
    const sandbox = this.createSandboxContext(initialContext);

    // Wrap script to handle async/await and pagination
    const wrappedScript = this.wrapScriptForExecution(script);

    if (this.config.enableSandbox) {
      // Use Node.js vm for sandboxed execution
      const vmContext = vm.createContext(sandbox, {
        name: 'programmatic-tool-calling-sandbox',
        codeGeneration: {
          strings: false,
          wasm: false
        }
      });

      try {
        const vmScript = new vm.Script(wrappedScript, {
          filename: 'programmatic-script.ts'
        });

        const result = vmScript.runInContext(vmContext, {
          timeout: this.config.timeoutMs
        });

        return await result;
      } catch (error: unknown) {
        // If sandbox fails, try with more permissive context for trusted scripts
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Script execution timed out')) {
          throw new Error(`Script execution timed out after ${this.config.timeoutMs}ms`);
        }
        throw error;
      }
    } else {
      // Direct execution (not recommended for untrusted scripts)
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction(
        'tool', 'context', 'aggregator', 'console',
        wrappedScript
      );
      return await fn(
        sandbox.tool,
        sandbox.context,
        sandbox.aggregator,
        sandbox.console
      );
    }
  }

  /**
   * Execute Python script (requires Python interpreter)
   */
  private async executePython(
    script: string,
    initialContext?: Record<string, unknown>
  ): Promise<unknown> {
    // For Python, we need to write to temp file and execute
    const tempDir = path.join(process.cwd(), '.vibe-flow', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `script_${Date.now()}.py`);

    try {
      // Create Python wrapper that exposes tool calling
      const pythonWrapper = this.createPythonWrapper(script, initialContext);
      await fs.writeFile(tempFile, pythonWrapper, 'utf-8');

      // Execute Python script using child_process
      const execAsync = promisify(exec);
      const command = `python3 "${tempFile}"`;

      let result: { stdout: string; stderr: string };
      try {
        result = await execAsync(command, {
          timeout: this.config.timeoutMs,
          encoding: 'utf-8'
        });
      } catch (error: unknown) {
        const err = error as { stderr?: string; message?: string };
        throw new Error(err.stderr || err.message || 'Python script execution failed');
      }

      // Parse JSON output from Python
      try {
        return JSON.parse(result.stdout || '{}');
      } catch {
        return result.stdout;
      }
    } finally {
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  /**
   * Create sandbox context with tool calling capabilities
   */
  private createSandboxContext(initialContext?: Record<string, unknown>): Record<string, unknown> {
    const aggregator: ResultAggregator = {
      items: [],
      metadata: {
        totalIterations: 0,
        totalToolCalls: 0,
        hasMore: false
      }
    };

    const toolCalls = this.toolCalls;
    const maxIterations = this.config.maxIterations;
    const maxToolCalls = this.config.maxToolCalls;
    let currentIteration = 0;

    return {
      // Context data
      context: initialContext || {},

      // Tool executor function
      tool: async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
        if (toolCalls.length >= maxToolCalls) {
          throw new Error(`Maximum tool calls (${maxToolCalls}) exceeded`);
        }

        currentIteration++;
        if (currentIteration > maxIterations) {
          throw new Error(`Maximum iterations (${maxIterations}) exceeded`);
        }

        this.currentIteration = currentIteration;

        const callRecord: ToolCallRecord = {
          toolName,
          params: { ...params },
          result: null,
          timestamp: new Date().toISOString(),
          iteration: currentIteration
        };

        try {
          const result = await this.toolExecutor!(toolName, params);
          callRecord.result = result;
          toolCalls.push(callRecord);

          // Auto-aggregate array results for pagination
          if (Array.isArray(result)) {
            aggregator.items.push(...result);
          } else if (result && typeof result === 'object') {
            const res = result as Record<string, unknown>;
            if (res.items && Array.isArray(res.items)) {
              aggregator.items.push(...res.items);
            }
            if (res.hasMore !== undefined) {
              aggregator.metadata.hasMore = res.hasMore as boolean;
            }
            if (res.nextCursor !== undefined) {
              aggregator.metadata.lastCursor = res.nextCursor as string;
            }
          }

          return result;
        } catch (error: unknown) {
          callRecord.result = { error: error instanceof Error ? error.message : String(error) };
          toolCalls.push(callRecord);
          throw error;
        }
      },

      // Result aggregator for loops/pagination
      aggregator: {
        getItems: () => [...aggregator.items],
        getMetadata: () => ({ ...aggregator.metadata }),
        clear: () => {
          aggregator.items = [];
          aggregator.metadata = {
            totalIterations: 0,
            totalToolCalls: 0,
            hasMore: false
          };
        },
        hasMore: () => aggregator.metadata.hasMore,
        getLastCursor: () => aggregator.metadata.lastCursor
      },

      // Safe console for debugging
      console: {
        log: (...args: unknown[]) => {
          // Optionally log to parent console (can be disabled in production)
        },
        error: (...args: unknown[]) => {
          console.error('[ProgrammaticScript]', ...args);
        },
        warn: (...args: unknown[]) => {
          console.warn('[ProgrammaticScript]', ...args);
        }
      },

      // Utility functions
      utils: {
        sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
        chunk: <T>(array: T[], size: number): T[][] => {
          const chunks: T[][] = [];
          for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
          }
          return chunks;
        },
        batch: async <T, R>(
          items: T[],
          batchSize: number,
          fn: (item: T) => Promise<R>
        ): Promise<R[]> => {
          const results: R[] = [];
          for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(fn));
            results.push(...batchResults);
          }
          return results;
        }
      }
    };
  }

  /**
   * Wrap script to handle async execution and iteration tracking
   */
  private wrapScriptForExecution(script: string): string {
    return `
      (async function() {
        const { tool, context, aggregator, console, utils } = this;

        ${script}

        // Return aggregated results if available
        const items = aggregator.getItems();
        if (items.length > 0) {
          return {
            items: items,
            metadata: aggregator.getMetadata(),
            iterations: aggregator.getMetadata().totalIterations
          };
        }

        return typeof result !== 'undefined' ? result : null;
      }).call(this);
    `;
  }

  /**
   * Create Python wrapper script
   */
  private createPythonWrapper(
    script: string,
    initialContext?: Record<string, unknown>
  ): string {
    const contextJson = JSON.stringify(initialContext || {});

    return `
import json
import sys
from typing import Any, Dict, List, Optional

# Simple tool executor placeholder - actual implementation requires Python MCP bridge
async def tool(tool_name: str, params: Dict[str, Any]) -> Any:
    """Placeholder for tool execution - requires MCP Python bridge"""
    print(json.dumps({"error": "Python tool execution requires MCP Python bridge"}))
    sys.exit(1)

# Context passed from TypeScript
context = ${contextJson}

# Aggregator for results
class Aggregator:
    def __init__(self):
        self.items = []
        self.metadata = {"totalIterations": 0, "totalToolCalls": 0, "hasMore": False}

    def get_items(self):
        return self.items

    def get_metadata(self):
        return self.metadata

    def clear(self):
        self.items = []
        self.metadata = {"totalIterations": 0, "totalToolCalls": 0, "hasMore": False}

aggregator = Aggregator()

# User script
${script}

# Output result
if aggregator.get_items():
    print(json.dumps({
        "items": aggregator.get_items(),
        "metadata": aggregator.get_metadata()
    }))
elif 'result' in dir():
    print(json.dumps(result))
else:
    print(json.dumps({"success": True}))
`;
  }

  /**
   * Estimate tokens saved by running orchestration in sandbox
   */
  private estimateTokensSaved(): number {
    // Rough estimation: each tool call recorded in main context = ~100 tokens
    // Each iteration in main context = ~200 tokens
    const toolCallTokens = this.toolCalls.length * 100;
    const iterationTokens = this.currentIteration * 200;

    // Base overhead for loop/iteration management
    const overheadTokens = (this.toolCalls.length + this.currentIteration) * 50;

    return toolCallTokens + iterationTokens - overheadTokens;
  }

  /**
   * Sanitize output to remove internal metadata
   */
  private sanitizeOutput(output: unknown): unknown {
    if (output === null || output === undefined) {
      return output;
    }

    if (typeof output === 'object') {
      const obj = output as Record<string, unknown>;

      // Remove internal metadata
      const sanitized: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('_') || key === 'internalMetadata') {
          continue;
        }
        sanitized[key] = value;
      }

      return sanitized;
    }

    return output;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalToolCalls: number;
    currentIteration: number;
    config: ProgrammaticCallerConfig;
  } {
    return {
      totalToolCalls: this.toolCalls.length,
      currentIteration: this.currentIteration,
      config: { ...this.config }
    };
  }

  /**
   * Reset internal state
   */
  reset(): void {
    this.toolCalls = [];
    this.currentIteration = 0;
  }
}

/**
 * Factory function to create programmatic caller with MCP tool executor
 */
export function createProgrammaticCaller(
  mcpServer: {
    handleTool: (name: string, params: unknown) => Promise<unknown>;
  },
  config?: Partial<ProgrammaticCallerConfig>
): ProgrammaticCaller {
  const caller = new ProgrammaticCaller(config);

  caller.setToolExecutor(async (toolName: string, params: Record<string, unknown>) => {
    return await mcpServer.handleTool(toolName, params);
  });

  return caller;
}

/**
 * MCP Tool definition for programmatic_tool_calling
 */
export const programmaticToolCallingTool = {
  name: 'programmatic_tool_calling',
  description: 'Execute LLM-generated orchestration scripts (TypeScript/Python) in an isolated sandbox. The script can call other MCP tools in loops for pagination, returning only the final clean result to save context tokens.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      script: {
        type: 'string',
        description: 'The orchestration script to execute. Can be TypeScript or Python.'
      },
      language: {
        type: 'string',
        enum: ['typescript', 'python'],
        default: 'typescript',
        description: 'Programming language of the script'
      },
      context: {
        type: 'object',
        description: 'Initial context/data to pass to the script'
      },
      config: {
        type: 'object',
        properties: {
          timeoutMs: { type: 'number', default: 30000 },
          maxIterations: { type: 'number', default: 100 },
          maxToolCalls: { type: 'number', default: 500 },
          enableSandbox: { type: 'boolean', default: true }
        },
        description: 'Execution configuration options'
      }
    },
    required: ['script', 'language']
  }
};

/**
 * Handler function for programmatic_tool_calling MCP tool
 */
export function createProgrammaticToolHandler(
  getProgrammaticCaller: () => ProgrammaticCaller | null
): (params: {
  script: string;
  language: 'typescript' | 'python';
  context?: Record<string, unknown>;
  config?: Partial<ProgrammaticCallerConfig>;
}) => Promise<ProgrammaticExecutionResult> {
  return async (params: {
    script: string;
    language: 'typescript' | 'python';
    context?: Record<string, unknown>;
    config?: Partial<ProgrammaticCallerConfig>;
  }): Promise<ProgrammaticExecutionResult> => {
    const caller = getProgrammaticCaller();

    if (!caller) {
      return {
        success: false,
        error: 'Programmatic caller not initialized',
        toolCalls: [],
        iterations: 0,
        tokensSaved: 0,
        executionTimeMs: 0
      };
    }

    return await caller.executeScript(
      params.script,
      params.language,
      params.context
    );
  };
}
