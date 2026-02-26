/**
 * Represents an MCP tool call structure
 * This is a local definition matching the MCP protocol structure
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Permission levels for MCP tool execution
 */
export enum PermissionLevel {
  ALLOW = "allow",
  DENY = "deny",
  ASK = "ask",
}

/**
 * Policy definition for a specific tool or tool pattern
 */
export interface PermissionPolicy {
  toolPattern: string;
  permission: PermissionLevel;
  description?: string;
  requiresConfirmation?: boolean;
}

/**
 * Result of permission validation
 */
export interface PermissionResult {
  allowed: boolean;
  permission: PermissionLevel;
  message?: string;
  requiresConfirmation?: boolean;
}

/**
 * Parameters passed to tool execution
 */
export interface ToolParameters {
  [key: string]: unknown;
}

/**
 * MCPPermissionGuard - Intercepts and validates MCP tool calls against policy rules
 *
 * Implements community patterns where critical operations like file manipulation
 * or deletions require explicit directives (allow/deny/ask).
 */
export class MCPPermissionGuard {
  /**
   * Static policy configuration for MCP tools
   * Defines which tools are allowed, denied, or require user confirmation
   */
  private static readonly POLICIES: PermissionPolicy[] = [
    // Read-only operations - always allowed
    {
      toolPattern: "read",
      permission: PermissionLevel.ALLOW,
      description: "Read operations are always permitted",
    },
    {
      toolPattern: "glob",
      permission: PermissionLevel.ALLOW,
      description: "File glob operations are always permitted",
    },
    {
      toolPattern: "grep",
      permission: PermissionLevel.ALLOW,
      description: "Search operations are always permitted",
    },
    {
      toolPattern: "web_fetch",
      permission: PermissionLevel.ALLOW,
      description: "Web fetch operations are always permitted",
    },
    {
      toolPattern: "web_search",
      permission: PermissionLevel.ALLOW,
      description: "Web search operations are always permitted",
    },
    {
      toolPattern: "get_status",
      permission: PermissionLevel.ALLOW,
      description: "Status queries are always permitted",
    },
    {
      toolPattern: "get_guidance",
      permission: PermissionLevel.ALLOW,
      description: "Guidance queries are always permitted",
    },
    {
      toolPattern: "analyze_project",
      permission: PermissionLevel.ALLOW,
      description: "Project analysis is always permitted",
    },
    {
      toolPattern: "lcm_describe",
      permission: PermissionLevel.ALLOW,
      description: "LCM describe operations are always permitted",
    },
    {
      toolPattern: "lcm_expand",
      permission: PermissionLevel.ALLOW,
      description: "LCM expand operations are always permitted",
    },
    {
      toolPattern: "lcm_grep",
      permission: PermissionLevel.ALLOW,
      description: "LCM grep operations are always permitted",
    },

    // Write operations - require confirmation
    {
      toolPattern: "write",
      permission: PermissionLevel.ASK,
      description: "Write operations require user confirmation",
      requiresConfirmation: true,
    },
    {
      toolPattern: "edit",
      permission: PermissionLevel.ASK,
      description: "Edit operations require user confirmation",
      requiresConfirmation: true,
    },

    // Critical/Destructive operations - denied by default
    {
      toolPattern: "delete",
      permission: PermissionLevel.DENY,
      description: "Delete operations are denied by default",
    },
    {
      toolPattern: "remove",
      permission: PermissionLevel.DENY,
      description: "Remove operations are denied by default",
    },
    {
      toolPattern: "reset",
      permission: PermissionLevel.DENY,
      description: "Reset operations are denied by default",
    },
    {
      toolPattern: "rm",
      permission: PermissionLevel.DENY,
      description: "Remove operations are denied by default",
    },
    {
      toolPattern: "rmdir",
      permission: PermissionLevel.DENY,
      description: "Remove directory operations are denied by default",
    },
    {
      toolPattern: "unlink",
      permission: PermissionLevel.DENY,
      description: "Unlink operations are denied by default",
    },

    // System operations - require explicit allowance
    {
      toolPattern: "bash",
      permission: PermissionLevel.ASK,
      description: "Bash commands require user confirmation",
      requiresConfirmation: true,
    },
    {
      toolPattern: "exec",
      permission: PermissionLevel.ASK,
      description: "Execution commands require user confirmation",
      requiresConfirmation: true,
    },
    {
      toolPattern: "shell",
      permission: PermissionLevel.ASK,
      description: "Shell commands require user confirmation",
      requiresConfirmation: true,
    },

    // Default fallback for unknown tools
    {
      toolPattern: "*",
      permission: PermissionLevel.ASK,
      description: "Unknown tools require user confirmation by default",
      requiresConfirmation: true,
    },
  ];

  /**
   * Custom policies that can be added at runtime
   */
  private customPolicies: PermissionPolicy[] = [];

  /**
   * Flag to enable/disable the guard
   */
  private enabled: boolean = true;

  /**
   * Creates a new MCPPermissionGuard instance
   */
  constructor() {
    this.customPolicies = [];
    this.enabled = true;
  }

  /**
   * Validates execution of an MCP tool against configured policies
   *
   * @param toolName - The name of the tool being executed
   * @param parameters - The parameters passed to the tool
   * @returns PermissionResult indicating whether the tool can proceed
   * @throws MCPPermissionError if validation fails critically
   */
  public validateExecution(
    toolName: string,
    parameters: ToolParameters
  ): PermissionResult {
    // Guard: Check if guard is enabled
    if (!this.enabled) {
      return {
        allowed: true,
        permission: PermissionLevel.ALLOW,
        message: "Permission guard is disabled",
      };
    }

    // Guard: Validate toolName parameter
    if (!this.isValidToolName(toolName)) {
      return this.createDenyResult(
        "Invalid tool name provided",
        "Tool name must be a non-empty string"
      );
    }

    // Guard: Validate parameters
    if (!this.isValidParameters(parameters)) {
      return this.createDenyResult(
        "Invalid parameters provided",
        "Parameters must be a valid object"
      );
    }

    try {
      // Find matching policy (custom policies take precedence)
      const policy = this.findMatchingPolicy(toolName);

      if (!policy) {
        // Fallback to wildcard policy if no match found
        const wildcardPolicy = MCPPermissionGuard.POLICIES.find(
          (p) => p.toolPattern === "*"
        );
        return this.evaluatePolicy(
          wildcardPolicy!,
          toolName,
          parameters
        );
      }

      return this.evaluatePolicy(policy, toolName, parameters);
    } catch (error) {
      // On any unexpected error, deny by default (fail-secure)
      return this.createDenyResult(
        "Permission validation error",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }

  /**
   * Validates a complete MCP tool call structure
   *
   * @param toolCall - The MCP tool call object
   * @returns PermissionResult indicating whether the tool can proceed
   */
  public validateToolCall(toolCall: ToolCall): PermissionResult {
    if (!toolCall || typeof toolCall !== "object") {
      return this.createDenyResult(
        "Invalid tool call",
        "Tool call must be a valid object"
      );
    }

    const toolName = toolCall.name;
    const parameters = toolCall.arguments as ToolParameters;

    return this.validateExecution(toolName, parameters);
  }

  /**
   * Adds a custom policy to the guard
   *
   * @param policy - The policy to add
   * @throws MCPPermissionError if policy is invalid
   */
  public addCustomPolicy(policy: PermissionPolicy): void {
    if (!this.isValidPolicy(policy)) {
      throw new MCPPermissionGuardError(
        "Invalid policy configuration",
        "Policy must have valid toolPattern and permission"
      );
    }

    this.customPolicies.push(policy);
  }

  /**
   * Removes a custom policy by tool pattern
   *
   * @param toolPattern - The tool pattern to remove
   */
  public removeCustomPolicy(toolPattern: string): boolean {
    const initialLength = this.customPolicies.length;
    this.customPolicies = this.customPolicies.filter(
      (p) => p.toolPattern !== toolPattern
    );
    return this.customPolicies.length < initialLength;
  }

  /**
   * Enables the permission guard
   */
  public enable(): void {
    this.enabled = true;
  }

  /**
   * Disables the permission guard
   */
  public disable(): void {
    this.enabled = false;
  }

  /**
   * Checks if the guard is currently enabled
   *
   * @returns True if enabled, false otherwise
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gets all currently active policies
   *
   * @returns Array of active policies
   */
  public getActivePolicies(): PermissionPolicy[] {
    return [...MCPPermissionGuard.POLICIES, ...this.customPolicies];
  }

  /**
   * Finds the matching policy for a given tool name
   *
   * @param toolName - The tool name to match
   * @returns The matching policy or undefined
   */
  private findMatchingPolicy(toolName: string): PermissionPolicy | undefined {
    // First check custom policies (they take precedence)
    const customMatch = this.customPolicies.find((policy) =>
      this.matchesToolPattern(toolName, policy.toolPattern)
    );

    if (customMatch) {
      return customMatch;
    }

    // Then check default policies
    return MCPPermissionGuard.POLICIES.find((policy) =>
      this.matchesToolPattern(toolName, policy.toolPattern)
    );
  }

  /**
   * Checks if a tool name matches a tool pattern
   *
   * @param toolName - The tool name
   * @param pattern - The pattern to match against
   * @returns True if matches, false otherwise
   */
  private matchesToolPattern(toolName: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    // Exact match
    if (toolName === pattern) {
      return true;
    }

    // Prefix match (e.g., "file_" matches "file_read")
    if (toolName.startsWith(pattern)) {
      return true;
    }

    // Suffix match (e.g., "read" matches "file_read")
    if (toolName.endsWith(pattern)) {
      return true;
    }

    // Contains match
    if (toolName.includes(pattern)) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates a policy and returns the permission result
   *
   * @param policy - The policy to evaluate
   * @param toolName - The tool name
   * @param parameters - The tool parameters
   * @returns PermissionResult
   */
  private evaluatePolicy(
    policy: PermissionPolicy,
    toolName: string,
    parameters: ToolParameters
  ): PermissionResult {
    switch (policy.permission) {
      case PermissionLevel.ALLOW:
        return {
          allowed: true,
          permission: PermissionLevel.ALLOW,
          message: policy.description || `Tool '${toolName}' is allowed`,
        };

      case PermissionLevel.DENY:
        return {
          allowed: false,
          permission: PermissionLevel.DENY,
          message: policy.description || `Tool '${toolName}' is denied`,
          requiresConfirmation: false,
        };

      case PermissionLevel.ASK:
        return {
          allowed: false,
          permission: PermissionLevel.ASK,
          message: policy.description || `Tool '${toolName}' requires confirmation`,
          requiresConfirmation: policy.requiresConfirmation ?? true,
        };

      default:
        return this.createDenyResult(
          "Unknown permission level",
          `Unexpected permission: ${policy.permission}`
        );
    }
  }

  /**
   * Creates a deny result with the given message
   */
  private createDenyResult(
    title: string,
    details: string
  ): PermissionResult {
    return {
      allowed: false,
      permission: PermissionLevel.DENY,
      message: `${title}: ${details}`,
      requiresConfirmation: false,
    };
  }

  /**
   * Validates a tool name
   */
  private isValidToolName(toolName: unknown): toolName is string {
    return (
      typeof toolName === "string" &&
      toolName.length > 0 &&
      toolName.trim().length > 0
    );
  }

  /**
   * Validates parameters
   */
  private isValidParameters(parameters: unknown): parameters is ToolParameters {
    return (
      parameters !== null &&
      typeof parameters === "object" &&
      !Array.isArray(parameters)
    );
  }

  /**
   * Validates a policy object
   */
  private isValidPolicy(policy: unknown): policy is PermissionPolicy {
    if (!policy || typeof policy !== "object") {
      return false;
    }

    const p = policy as Partial<PermissionPolicy>;
    return (
      typeof p.toolPattern === "string" &&
      p.toolPattern.length > 0 &&
      Object.values(PermissionLevel).includes(p.permission as PermissionLevel)
    );
  }
}

/**
 * Custom error class for permission guard errors
 */
export class MCPPermissionGuardError extends Error {
  public readonly code: string;
  public readonly details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = "MCPPermissionGuardError";
    this.code = "PERMISSION_GUARD_ERROR";
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPPermissionGuardError);
    }
  }
}

export default MCPPermissionGuard;
