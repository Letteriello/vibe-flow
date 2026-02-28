// MCPHandler - Handles MCP server commands
import chalk from 'chalk';
import { MCPServer } from '../../mcp/index.js';

export interface MCPOptions {
  port?: string;
  stdio?: boolean;
}

export class MCPHandler {
  async execute(options: MCPOptions): Promise<void> {
    const port = parseInt(options.port || '3000', 10);

    if (options.stdio) {
      console.log(chalk.blue('🔌 Starting vibe-flow MCP server in STDIO mode...'));
      await this.runStdioMCP();
    } else {
      console.log(chalk.blue(`🔌 Starting vibe-flow MCP server on port ${port}...`));
      await this.runHttpMCP(port);
    }
  }

  private async runStdioMCP(): Promise<void> {
    const mcpServer = new MCPServer();
    const { createInterface } = await import('readline');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line);
        const { method, params, id } = request;

        if (method === 'tools/list') {
          const tools = mcpServer.getTools();
          const response = {
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools.map((t: unknown) => ({
                name: (t as { name: string }).name,
                description: (t as { description: string }).description,
                inputSchema: (t as { inputSchema: unknown }).inputSchema
              }))
            }
          };
          console.log(JSON.stringify(response));
        } else if (method === 'tools/call') {
          const { name, arguments: args } = params;
          const result = await mcpServer.handleTool(name, args);
          const response = { jsonrpc: '2.0', id, result };
          console.log(JSON.stringify(response));
        }
      } catch (error: unknown) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: (error as Error).message }
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    console.log(chalk.green('✅ MCP server running in STDIO mode'));
  }

  private async runHttpMCP(port: number): Promise<void> {
    const http = await import('http');
    const mcpServer = new MCPServer();

    const server = http.default.createServer(async (req: unknown, res: unknown) => {
      const httpReq = req as { url: string; method: string; on: (event: string, cb: (chunk: string) => void) => void };
      const httpRes = res as { setHeader: (key: string, value: string) => void; statusCode: number; end: (data: string) => void };

      httpRes.setHeader('Content-Type', 'application/json');

      if (httpReq.url === '/tools' && httpReq.method === 'GET') {
        const tools = mcpServer.getTools();
        httpRes.end(JSON.stringify({ tools }));
        return;
      }

      if (httpReq.url === '/tools/call' && httpReq.method === 'POST') {
        let body = '';
        httpReq.on('data', (chunk: string) => body += chunk);
        httpReq.on('end', async () => {
          try {
            const { name, arguments: args } = JSON.parse(body);
            const result = await mcpServer.handleTool(name, args);
            httpRes.end(JSON.stringify(result));
          } catch (error: unknown) {
            httpRes.statusCode = 500;
            httpRes.end(JSON.stringify({ error: (error as Error).message }));
          }
        });
        return;
      }

      httpRes.statusCode = 404;
      httpRes.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(port, () => {
      console.log(chalk.green(`✅ MCP server running at http://localhost:${port}`));
      console.log(chalk.gray(`  Tools: GET http://localhost:${port}/tools`));
      console.log(chalk.gray(`  Call: POST http://localhost:${port}/tools/call`));
    });
  }
}
