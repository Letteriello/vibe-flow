// Official MCP Server - Using @modelcontextprotocol/sdk
// This server exposes vibe-flow tools to Claude Code via the Model Context Protocol

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  FallbackRouter,
  FallbackRouterConfig,
  DEFAULT_FALLBACK_CONFIG,
  RoutedToolResult,
  ErrorType,
  CircuitState
} from './fallback-router.js';

// Tools protected by fallback router
const PROTECTED_TOOLS = [
  'start_project',
  'advance_step',
  'get_status',
  'analyze_project',
  'wrap_up_session'
];

class VibeFlowMCPServer {
  private server: Server;
  private _mcpServer: any = null;
  private _mcpServerPromise: Promise<any> | null = null;
  private fallbackRouter: FallbackRouter;
  private routerConfig: FallbackRouterConfig;

  private async getMcpServer(): Promise<any> {
    if (this._mcpServer) {
      return this._mcpServer;
    }

    if (!this._mcpServerPromise) {
      this._mcpServerPromise = (async () => {
        // Dynamic import to avoid circular dependency - lazy load
        const mcp = await import('./index.js');
        this._mcpServer = new mcp.MCPServer();
        return this._mcpServer;
      })();
    }

    return this._mcpServerPromise;
  }

  constructor(config?: { fallbackRouter?: Partial<FallbackRouterConfig> }) {
    // Initialize fallback router with config
    this.routerConfig = { ...DEFAULT_FALLBACK_CONFIG, ...config?.fallbackRouter };
    this.fallbackRouter = new FallbackRouter(this.routerConfig);

    // Register alternative providers for each protected tool
    this.registerAlternativeProviders();

    this.server = new Server(
      {
        name: 'vibe-flow',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();

    console.error('[MCP] FallbackRouter initialized with circuit breaker');
    console.error(`[MCP] Protected tools: ${PROTECTED_TOOLS.join(', ')}`);
  }

  /**
   * Handle protected tool execution with fallback router
   */
  private async handleProtectedTool(toolName: string, args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const mcpServer = await this.getMcpServer();
    const tool = mcpServer.getTool(toolName);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${toolName}` }, null, 2),
          },
        ],
        isError: true,
      };
    }

    try {
      // Execute through fallback router
      const result: RoutedToolResult = await this.fallbackRouter.execute(
        toolName,
        async (params) => {
          return await tool.handler(params);
        },
        args
      );

      // Log detailed routing information
      this.logRoutingInfo(toolName, result);

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.result, null, 2),
            },
          ],
        };
      } else {
        // Build error response with routing details
        const errorDetails: Record<string, unknown> = {
          error: result.error,
          errorType: result.errorType,
          toolUsed: result.toolUsed,
          providerUsed: result.providerUsed,
          circuitState: result.circuitState,
          retryCount: result.retryCount,
          fallbackUsed: result.fallbackUsed,
          executionTimeMs: result.executionTimeMs,
          timestamp: result.timestamp
        };

        if (result.details) {
          if (result.details.originalError) {
            errorDetails.originalError = result.details.originalError;
          }
          if (result.details.alternativeProvider) {
            errorDetails.alternativeProvider = result.details.alternativeProvider;
          }
          if (result.details.delayUsed) {
            errorDetails.delayUsed = result.details.delayUsed;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(errorDetails, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Protected tool "${toolName}" execution error:`, errMsg);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: errMsg,
              toolName,
              circuitBreakerStatus: this.getCircuitBreakerStatus()
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Log routing information for debugging
   */
  private logRoutingInfo(toolName: string, result: RoutedToolResult): void {
    const timestamp = new Date().toISOString();

    if (!result.success) {
      console.error(`[MCP] [${timestamp}] Tool "${toolName}" FAILED:`);
      console.error(`[MCP]   Error: ${result.error}`);
      console.error(`[MCP]   Error Type: ${result.errorType}`);
      console.error(`[MCP]   Circuit State: ${result.circuitState}`);
      console.error(`[MCP]   Retries: ${result.retryCount}`);
      console.error(`[MCP]   Fallback Used: ${result.fallbackUsed}`);
      console.error(`[MCP]   Provider: ${result.providerUsed}`);
      console.error(`[MCP]   Execution Time: ${result.executionTimeMs}ms`);
    } else if (result.retryCount > 0 || result.fallbackUsed) {
      console.warn(`[MCP] [${timestamp}] Tool "${toolName}" succeeded after retries/fallback:`);
      console.warn(`[MCP]   Retries: ${result.retryCount}`);
      console.warn(`[MCP]   Fallback Used: ${result.fallbackUsed}`);
      console.warn(`[MCP]   Provider: ${result.providerUsed}`);
      console.warn(`[MCP]   Execution Time: ${result.executionTimeMs}ms`);
    } else {
      console.log(`[MCP] [${timestamp}] Tool "${toolName}" succeeded (${result.executionTimeMs}ms)`);
    }
  }

  /**
   * Register alternative providers for fallback
   */
  private registerAlternativeProviders(): void {
    // Register fallback for start_project
    this.fallbackRouter.registerAlternativeProvider('start_project', {
      name: 'fallback_start_project',
      toolName: 'start_project',
      handler: async (params: Record<string, unknown>) => {
        const mcpServer = await this.getMcpServer();
        return mcpServer.handleTool('start_project', params);
      },
      priority: 1
    });

    // Register fallback for advance_step
    this.fallbackRouter.registerAlternativeProvider('advance_step', {
      name: 'fallback_advance_step',
      toolName: 'advance_step',
      handler: async (params: Record<string, unknown>) => {
        const mcpServer = await this.getMcpServer();
        return mcpServer.handleTool('advance_step', params);
      },
      priority: 1
    });

    // Register fallback for get_status
    this.fallbackRouter.registerAlternativeProvider('get_status', {
      name: 'fallback_get_status',
      toolName: 'get_status',
      handler: async (params: Record<string, unknown>) => {
        const mcpServer = await this.getMcpServer();
        return mcpServer.handleTool('get_status', params);
      },
      priority: 1
    });

    // Register fallback for analyze_project
    this.fallbackRouter.registerAlternativeProvider('analyze_project', {
      name: 'fallback_analyze_project',
      toolName: 'analyze_project',
      handler: async (params: Record<string, unknown>) => {
        const mcpServer = await this.getMcpServer();
        return mcpServer.handleTool('analyze_project', params);
      },
      priority: 1
    });

    // Register fallback for wrap_up_session
    this.fallbackRouter.registerAlternativeProvider('wrap_up_session', {
      name: 'fallback_wrap_up_session',
      toolName: 'wrap_up_session',
      handler: async (params: Record<string, unknown>) => {
        const mcpServer = await this.getMcpServer();
        return mcpServer.handleTool('wrap_up_session', params);
      },
      priority: 1
    });
  }

  /**
   * Get fallback router instance for external access
   */
  getFallbackRouter(): FallbackRouter {
    return this.fallbackRouter;
  }

  /**
   * Get circuit breaker status for all tools
   */
  getCircuitBreakerStatus(): Record<string, { state: CircuitState; failures: number }> {
    const states = this.fallbackRouter.getAllCircuitStates();
    const status: Record<string, { state: CircuitState; failures: number }> = {};

    for (const tool of PROTECTED_TOOLS) {
      const state = states.find(s => s.toolName === tool);
      status[tool] = {
        state: state?.state || CircuitState.CLOSED,
        failures: state?.failureCount || 0
      };
    }

    return status;
  }

  /**
   * Reset circuit breaker for a specific tool
   */
  resetCircuitBreaker(toolName: string): boolean {
    if (!PROTECTED_TOOLS.includes(toolName)) {
      console.warn(`[MCP] Tool "${toolName}" is not protected by circuit breaker`);
      return false;
    }
    return this.fallbackRouter.resetCircuitBreaker(toolName);
  }

  /**
   * Get routing logs
   */
  getRoutingLogs(limit?: number): unknown[] {
    return this.fallbackRouter.getLogs(limit);
  }

  private setupHandlers(): void {
    // List available tools - lazy load
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const mcpServer = await this.getMcpServer();
      const tools = mcpServer.getTools();

      return {
        tools: tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool calls - lazy load
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const isProtected = PROTECTED_TOOLS.includes(name);

      if (isProtected) {
        // Use fallback router for protected tools
        return this.handleProtectedTool(name, args);
      }

      // Default behavior for non-protected tools
      try {
        const mcpServer = await this.getMcpServer();
        const result = await mcpServer.handleTool(name, args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errMsg }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('VibeFlow MCP Server started on stdio');
  }
}

// Lazy load the server - only create when actually needed
let serverInstance: VibeFlowMCPServer | null = null;

async function getServer(): Promise<VibeFlowMCPServer> {
  if (!serverInstance) {
    serverInstance = new VibeFlowMCPServer();
    await serverInstance.start();
  }
  return serverInstance;
}

// Start the server when this file is loaded - but only if in stdio mode
if (process.env.MCP_SERVER_MODE !== 'manual') {
  getServer().catch(console.error);
}

export { VibeFlowMCPServer, getServer, PROTECTED_TOOLS };
export { FallbackRouter, ErrorType, CircuitState, RoutedToolResult } from './fallback-router.js';
