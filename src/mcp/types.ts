// MCP Types - Tipos compartilhados para Router e Fallback

/**
 * Requisição de ferramenta MCP
 */
export interface MCPToolRequest {
  toolName: string;
  params?: Record<string, unknown>;
  metadata?: {
    requestId?: string;
    timestamp?: string;
    source?: string;
  };
}

/**
 * Resposta de ferramenta MCP
 */
export interface MCPToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  toolName: string;
  statusCode?: number;
  circuitOpen?: boolean;
  attempts?: number;
  failed?: boolean;
}

/**
 * Resultado de execução de ferramenta
 */
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  usedFallback: boolean;
  attempts: number;
  executionTimeMs: number;
  routerStats?: {
    retries: number;
    backoffDelays: number[];
    circuitState: 'closed' | 'open' | 'half_open';
  };
  fallbackStats?: {
    fallbackAttempted: boolean;
    fallbackSuccess: boolean;
    fallbackUrl?: string;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: unknown) => Promise<MCPToolResponse>;
}
