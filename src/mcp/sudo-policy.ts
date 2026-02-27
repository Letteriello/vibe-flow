/**
 * MCP Sudo Policy - Permission Policy Configuration
 *
 * Defines the policy rules for MCP tool execution permissions.
 */

import { randomUUID } from 'crypto';

/**
 * Policy action types
 */
export type PolicyAction = 'allow' | 'deny' | 'ask';

/**
 * Policy rule definition
 */
export interface PolicyRule {
  /** Glob pattern to match tool names */
  pattern: string;
  /** Action to take when pattern matches */
  action: PolicyAction;
  /** Optional description */
  description?: string;
}

/**
 * Policy configuration
 */
export interface PolicyConfig {
  /** Default action for tools not matching any rule */
  defaultAction: PolicyAction;
  /** List of policy rules */
  rules: PolicyRule[];
}

/**
 * Permission request
 */
export interface PermissionRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: Date;
  callerId?: string;
}

/**
 * Permission result
 */
export interface PermissionResult {
  allowed: boolean;
  action: PolicyAction;
  message: string;
  approvedAt?: Date;
  approvedBy?: string;
}

/**
 * Default policy configuration
 */
export const DEFAULT_POLICY: PolicyConfig = {
  defaultAction: 'ask',
  rules: [
    // Allow read-only operations
    { pattern: 'read', action: 'allow', description: 'Read operations are allowed' },
    { pattern: 'glob', action: 'allow', description: 'File search is allowed' },
    { pattern: 'grep', action: 'allow', description: 'Content search is allowed' },
    { pattern: 'web_fetch', action: 'allow', description: 'Web fetching is allowed' },
    { pattern: 'web_search', action: 'allow', description: 'Web search is allowed' },

    // Ask for write operations
    { pattern: 'write', action: 'ask', description: 'Write operations require confirmation' },
    { pattern: 'edit', action: 'ask', description: 'Edit operations require confirmation' },
    { pattern: 'bash', action: 'ask', description: 'Shell commands require confirmation' },

    // Deny destructive operations
    { pattern: 'delete', action: 'deny', description: 'Delete operations are denied' },
    { pattern: 'remove', action: 'deny', description: 'Remove operations are denied' },
    { pattern: 'unlink', action: 'deny', description: 'Unlink operations are denied' },
  ]
};

/**
 * Create a custom policy configuration
 */
export function createPolicy(
  defaultAction: PolicyAction = 'ask',
  rules: PolicyRule[] = []
): PolicyConfig {
  return {
    defaultAction,
    rules: [...DEFAULT_POLICY.rules, ...rules]
  };
}

/**
 * Create a strict policy (deny by default)
 */
export function createStrictPolicy(): PolicyConfig {
  return {
    defaultAction: 'deny',
    rules: [
      { pattern: 'read', action: 'allow' },
      { pattern: 'glob', action: 'allow' },
      { pattern: 'grep', action: 'allow' },
    ]
  };
}

/**
 * Create a permissive policy (allow by default)
 */
export function createPermissivePolicy(): PolicyConfig {
  return {
    defaultAction: 'allow',
    rules: []
  };
}

export default DEFAULT_POLICY;
