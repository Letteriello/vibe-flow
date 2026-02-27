/**
 * MCP Permissions - Middleware wrapper for MCP tool execution
 *
 * Intercepts all MCP tool calls and applies policy-based permission checks
 * before allowing execution. Supports allow/deny/ask policies.
 */

import { randomUUID } from 'crypto';
import readline from 'node:readline';
import {
  PolicyAction,
  PolicyConfig,
  PolicyRule,
  PermissionRequest,
  PermissionResult,
  DEFAULT_POLICY,
} from './sudo-policy.js';

/**
 * Tool execution context passed to the middleware
 */
export interface ToolContext {
  /** Unique identifier for this execution */
  executionId: string;
  /** The tool being executed */
  toolName: string;
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Optional metadata about the caller */
  callerId?: string;
  /** Timestamp of the request */
  timestamp: Date;
}

/**
 * Result of tool execution (after permission granted)
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  executionId: string;
  duration: number;
}

/**
 * Callback for executing the actual tool (after permission granted)
 */
export type ToolExecutor<T = unknown> = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<T>;

/**
 * MCP Permission Middleware
 *
 * Wraps MCP tool execution with policy-based permission checks
 */
export class PermissionMiddleware {
  private policy: PolicyConfig;
  private approvedCache: Map<string, { timestamp: Date; approved: boolean }> = new Map();
  private cacheTTL: number; // milliseconds

  constructor(policy: PolicyConfig = DEFAULT_POLICY, cacheTTLMinutes: number = 30) {
    this.policy = policy;
    this.cacheTTL = cacheTTLMinutes * 60 * 1000;
  }

  /**
   * Update the policy configuration
   */
  setPolicy(policy: PolicyConfig): void {
    this.policy = policy;
  }

  /**
   * Get current policy configuration
   */
  getPolicy(): PolicyConfig {
    return this.policy;
  }

  /**
   * Add a rule to the policy
   */
  addRule(rule: PolicyRule): void {
    this.policy.rules.push(rule);
  }

  /**
   * Clear the approval cache
   */
  clearCache(): void {
    this.approvedCache.clear();
  }

  /**
   * Check if a tool matches a pattern (supports wildcards)
   */
  private matchesPattern(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return toolName.endsWith(suffix);
    }
    return toolName === pattern;
  }

  /**
   * Find the matching policy rule for a tool
   */
  private findMatchingRule(toolName: string): PolicyRule | null {
    for (const rule of this.policy.rules) {
      if (this.matchesPattern(toolName, rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Determine the action for a tool based on policy
   */
  private determineAction(toolName: string): PolicyAction {
    const rule = this.findMatchingRule(toolName);
    return rule?.action ?? this.policy.defaultAction;
  }

  /**
   * Create a cache key for approval caching
   */
  private createCacheKey(toolName: string, args: Record<string, unknown>): string {
    const argsStr = JSON.stringify(args);
    return `${toolName}:${argsStr}`;
  }

  /**
   * Check if a request is cached as approved
   */
  private isCachedApproved(toolName: string, args: Record<string, unknown>): boolean {
    const key = this.createCacheKey(toolName, args);
    const cached = this.approvedCache.get(key);

    if (!cached) return false;

    // Check if cache is expired
    if (Date.now() - cached.timestamp.getTime() > this.cacheTTL) {
      this.approvedCache.delete(key);
      return false;
    }

    return cached.approved;
  }

  /**
   * Cache an approval decision
   */
  private cacheApproval(toolName: string, args: Record<string, unknown>, approved: boolean): void {
    const key = this.createCacheKey(toolName, args);
    this.approvedCache.set(key, { timestamp: new Date(), approved });
  }

  /**
   * Prompt user for approval (for 'ask' policy)
   */
  private async promptApproval(request: PermissionRequest): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const question = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  MCP Tool Permission Request
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tool: ${request.toolName}
Arguments: ${JSON.stringify(request.arguments, null, 2)}
Timestamp: ${request.timestamp.toISOString()}
${request.callerId ? `Caller: ${request.callerId}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Allow this tool to execute? [y/N/a (always)]:
`;

      rl.question(question, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();

        if (normalized === 'a' || normalized === 'always') {
          // Cache this approval and future similar requests
          this.cacheApproval(request.toolName, request.arguments, true);
          resolve(true);
        } else if (normalized === 'y' || normalized === 'yes') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Check permission for a tool execution
   */
  async checkPermission(request: PermissionRequest): Promise<PermissionResult> {
    const action = this.determineAction(request.toolName);

    // Check cache for 'ask' actions that were previously approved
    if (action === 'ask' && this.isCachedApproved(request.toolName, request.arguments)) {
      return {
        allowed: true,
        action: 'allow',
        message: 'Previously approved (cached)',
        approvedAt: new Date(),
        approvedBy: 'cache',
      };
    }

    switch (action) {
      case 'allow':
        return {
          allowed: true,
          action: 'allow',
          message: 'Allowed by policy',
        };

      case 'deny':
        return {
          allowed: false,
          action: 'deny',
          message: `Tool '${request.toolName}' is blocked by security policy. This action is not permitted.`,
        };

      case 'ask':
        const approved = await this.promptApproval(request);

        if (approved) {
          return {
            allowed: true,
            action: 'ask',
            message: 'Approved by user',
            approvedAt: new Date(),
            approvedBy: 'human',
          };
        } else {
          return {
            allowed: false,
            action: 'deny',
            message: `Tool '${request.toolName}' was denied by user.`,
          };
        }
    }
  }

  /**
   * Execute a tool with permission checking
   *
   * @param context - Execution context
   * @param executor - Function to execute the actual tool
   * @returns Tool execution result
   */
  async execute<T = unknown>(
    context: ToolContext,
    executor: ToolExecutor<T>
  ): Promise<ToolExecutionResult<T>> {
    const startTime = Date.now();
    const request: PermissionRequest = {
      toolName: context.toolName,
      arguments: context.arguments,
      timestamp: context.timestamp,
      callerId: context.callerId,
    };

    // Check permission
    const permission = await this.checkPermission(request);

    if (!permission.allowed) {
      return {
        success: false,
        error: permission.message,
        executionId: context.executionId,
        duration: Date.now() - startTime,
      };
    }

    // Execute the tool
    try {
      const result = await executor(context.toolName, context.arguments);
      return {
        success: true,
        result,
        executionId: context.executionId,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionId: context.executionId,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Create a middleware function for use with MCP servers
   *
   * This can be integrated into MCP server tool handlers
   */
  createMiddleware(executor: ToolExecutor) {
    return async (toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const context: ToolContext = {
        executionId: randomUUID(),
        toolName,
        arguments: args,
        timestamp: new Date(),
      };

      return this.execute(context, executor);
    };
  }
}

/**
 * Create a permission middleware with default policy
 */
export function createPermissionMiddleware(
  policy?: PolicyConfig,
  cacheTTLMinutes?: number
): PermissionMiddleware {
  return new PermissionMiddleware(policy, cacheTTLMinutes);
}
