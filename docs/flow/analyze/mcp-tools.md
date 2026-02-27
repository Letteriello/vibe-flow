# Análise de Domínio: mcp-tools

## Visão Geral

Ferramentas MCP (Model Context Protocol) disponíveis no projeto vibe-flow.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/mcp/index.ts` | Barrel exports |
| `src/mcp/registry.ts` | Registro de ferramentas |
| `src/mcp/types.ts` | Tipos MCP |
| `src/mcp/permissions.ts` | Sistema de permissões |
| `src/mcp/mcp-server.ts` | Servidor MCP oficial |

## Ferramentas Disponíveis

- `start_project` - Iniciar novo projeto
- `advance_step` - Avançar fase
- `get_status` - Obter status
- `analyze_project` - Analisar projeto
- `wrap_up_session` - Executar wrap-up
- `get_guidance` - Obter orientação
- `adversarial_review` - Revisão adversarial

## Interfaces

```typescript
export interface MCPTool {
  name: string
  description: string
  inputSchema: object
  handler: Function
}
```

---

*Analisado em: 2026-02-28*
