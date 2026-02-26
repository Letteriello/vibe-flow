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
  private vibeFlowServer: any;
  private _mcpServer: any = null;

  private get mcpServer(): any {
    if (!this._mcpServer) {
      // Lazy import to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MCPServer } = require('./index.js');
      this._mcpServer = new MCPServer();
    }
    return this._mcpServer;
  }

  constructor() {
    // Note: MCPServer will be initialized lazily when needed
    this.vibeFlowServer = null;

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
      const tools = this.mcpServer.getTools();

      return {
        tools: tools.map((tool) => ({
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
        const result = await this.mcpServer.handleTool(name, args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message }, null, 2),
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
