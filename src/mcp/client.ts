// MCP Client - Connect to external MCP servers from vibe-flow
// This allows vibe-flow to call external services via the Model Context Protocol

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPClientConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPToolResult {
  success: boolean;
  content?: string;
  error?: string;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: MCPClientConfig;
  private connected: boolean = false;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args || [],
      env: this.config.env || {},
    });

    this.client = new Client(
      {
        name: `vibe-flow-client-${this.config.name}`,
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
    this.connected = true;
    console.log(`[MCP Client] Connected to ${this.config.name}`);
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    await this.client.close();
    this.connected = false;
    console.log(`[MCP Client] Disconnected from ${this.config.name}`);
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    if (!this.connected || !this.client) {
      throw new Error('Client not connected');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await (this.client as any).request(
      { method: 'tools/list' },
      {}
    );

    return response.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.connected || !this.client) {
      throw new Error('Client not connected');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await (this.client as any).request(
        { method: 'tools/call' },
        { name: toolName, arguments: args }
      );

      const content = response.content?.[0]?.text || '';

      return {
        success: !response.isError,
        content,
        error: response.isError ? content : undefined,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.config.name;
  }
}

// Client manager for multiple MCP servers
export class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();

  addClient(config: MCPClientConfig): MCPClient {
    const client = new MCPClient(config);
    this.clients.set(config.name, client);
    return client;
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  removeClient(name: string): void {
    this.clients.delete(name);
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
  }

  listClients(): string[] {
    return Array.from(this.clients.keys());
  }
}
