// Official MCP Server - Using @modelcontextprotocol/sdk
// This server exposes vibe-flow tools to Claude Code via the Model Context Protocol

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class VibeFlowMCPServer {
  private server: Server;
  private _mcpServer: any = null;
  private _mcpServerPromise: Promise<any> | null = null;

  private async getMcpServer(): Promise<any> {
    if (this._mcpServer) {
      return this._mcpServer;
    }

    if (!this._mcpServerPromise) {
      this._mcpServerPromise = (async () => {
        // Dynamic import to avoid circular dependency
        const mcp = await import('./index.js');
        this._mcpServer = new mcp.MCPServer();
        return this._mcpServer;
      })();
    }

    return this._mcpServerPromise;
  }

  constructor() {
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
  }

  private setupHandlers(): void {
    // List available tools
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

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

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

// Start the server if this file is executed directly
const server = new VibeFlowMCPServer();
server.start().catch(console.error);

export { VibeFlowMCPServer };
