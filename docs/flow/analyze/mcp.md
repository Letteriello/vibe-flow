# Análise de Domínio: MCP

## Visão Geral
Módulo de Model Context Protocol (MCP) que expõe ferramentas do vibe-flow como servidor MCP oficial e cliente para servidores externos.

## Arquivos (18 arquivos)

| Arquivo | Descrição |
|---------|------------|
| `src/mcp/index.ts` | Servidor MCP principal com tool registry e health tracking |
| `src/mcp/official-server.ts` | Implementação oficial do servidor MCP via SDK |
| `src/mcp/client.ts` | Cliente para conectar a servidores MCP externos |
| `src/mcp/types.ts` | Tipos compartilhados do MCP |
| `src/mcp/permission-guard.ts` |Interceptor de permissões para ferramentas |
| `src/mcp/tools/lcm-tools.ts` | Ferramentas LCM: describe, expand, grep |
| `src/mcp/tools/lcm-schema.ts` | Schemas JSON Schema para tools |
| `src/mcp/router.ts` | Roteamento de requests |
| `src/mcp/fallback.ts` | Fallback behavior |
| `src/mcp/fallback-router.ts` | Router de fallback |
| `src/mcp/status-polling.ts` | Job status polling |
| `src/mcp/telemetry.ts` | Telemetria de tools |
| `src/mcp/adversarial-critic.ts` | Ferramenta de code review adversarial |
| `src/mcp/agentic-map.ts` | Mapeamento agentic |
| `src/mcp/acp-broker.ts` | Broker ACP |
| `src/mcp/programmatic-caller.ts` | Chamadas programáticas |
| `src/mcp/wrap-up-handler.ts` | Handler de wrap-up |
| `src/mcp/mcp-server.test.ts` | Testes |

## Interfaces Públicas

### MCPServer
```typescript
class MCPServer {
  constructor(config?: Partial<DegradationConfig>)
  async initialize(): Promise<void>
  async start(): Promise<void>
  async stop(): Promise<void>
  registerTool(tool: MCPTool): void
  getTool(name: string): MCPTool | undefined
  getToolHealth(name: string): ToolHealth
  listTools(): MCPTool[]
}
```

### Ferramentas Expostas (getLCMTools)
- `lcm_describe` - Descrever arquivo/ID/archive
- `lcm_expand` - Expandir sumário compacto
- `lcm_grep` - Procurar em histórico arquivado
- `adversarial_review` - Code review adversarial

## Padrões Detectados

1. **Tool Registry**: Mapa de ferramentas com health tracking
2. **Graceful Degradation**: Fallback após N falhas consecutivas
3. **Hot Reload**: Recarregamento de ferramentas sem restart
4. **Permission Guard**: Interceptador de permissões por tool
5. **Job Polling**: Status de jobs longos via polling

## Dependências
- `@modelcontextprotocol/sdk` - SDK oficial MCP

## Gargalos
1. **Complexidade**: Múltiplos routers e fallbacks
2. **Testes**: Poucos testes (apenas mcp-server.test.ts)
