# UX Spec: Melhorias nas MCP Tools

## Meta

- **PRD vinculado:** docs/planning/mcp-enhancements/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28

## 1. Visão Geral das Mudanças

As melhorias não alteram a interface do usuário (CLI), mas impactam o comportamento interno das MCP tools.

## 2. Comportamentos Esperados

### 2.1 RealLLMWorker

```
Configuração (via environment):
- OPENAI_API_KEY ou ANTHROPIC_API_KEY
- LLM_PROVIDER=openai|anthropic (default: anthropic)
- LLM_MODEL=gpt-4|claude-3-opus (default: gpt-4)
```

**Fluxo de uso:**
1. Usuário configura API key no environment
2. Passa factory `() => new RealLLMWorker()` para AgenticMapOperator
3. Operador usa LLM real para processar inputs

**Estados de erro:**
- API key missing → Log warning, usa MockLLMWorker como fallback
- API error (rate limit, timeout) → Retry com backoff
- Invalid response → Retorna erro, não valida contra schema

### 2.2 Health Persistence

```
Arquivo: .vibe-flow/health-state.json

Estrutura:
{
  "circuitBreakers": {
    "toolName": {
      "state": "CLOSED|OPEN|HALF_OPEN",
      "failureCount": 0,
      "lastFailureTime": "ISO timestamp",
      "lastFailureReason": "string"
    }
  },
  "fallbackStats": {
    "totalAttempts": 0,
    "successfulFallbacks": 0,
    "failedFallbacks": 0
  },
  "lastUpdated": "ISO timestamp"
}
```

**Fluxo de carregamento:**
1. Ao iniciar FallbackRouter, tenta ler health-state.json
2. Se existir e for válido, restaura estados de circuit breaker
3. Se não existir ou corrompido, usa estados padrão

**Fluxo de salvamento:**
- Após cada mudança de estado de circuit breaker
- Debounce: salva no máximo 1x por segundo
- Async: não bloqueia execução

### 2.3 LCM Graceful Degradation

```
Cenário: Arquivo .vibe-flow/context-archives/ não existe

Comportamento esperado:
- lcm_describe → { success: false, error: "Archives not configured" }
- lcm_expand → { success: false, error: "Archives not configured" }
- lcm_grep → { success: true, matches: [], message: "No archives found" }
```

## 3. Interface de Configuração

### 3.1 Environment Variables

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| OPENAI_API_KEY | Condicional | - | API key para OpenAI |
| ANTHROPIC_API_KEY | Condicional | - | API key para Anthropic |
| LLM_PROVIDER | Não | anthropic | Provedor: openai ou anthropic |
| LLM_MODEL | Não | gpt-4 | Modelo específico |
| LLM_TIMEOUT_MS | Não | 60000 | Timeout por requisição |
| HEALTH_STATE_PATH | Não | .vibe-flow/health-state.json | Caminho do arquivo de estado |

### 3.2 MCP Tools Novas/Atualizadas

**Nova tool: `mcp_health_status`**
```json
{
  "name": "mcp_health_status",
  "description": "Get health status of MCP tools including circuit breaker states",
  "inputSchema": {
    "type": "object",
    "properties": {
      "includeHistory": {
        "type": "boolean",
        "description": "Include recent state changes history"
      }
    }
  }
}
```

Resposta:
```json
{
  "circuitBreakers": [
    {
      "toolName": "start_project",
      "state": "CLOSED",
      "failureCount": 0,
      "lastFailureTime": null
    }
  ],
  "fallbackStats": {
    "totalAttempts": 0,
    "successRate": 100
  }
}
```

## 4. Sequência de Execução

### 4.1 Inicialização do MCP Server

```
1. Carrega configurações de environment
2. Carrega health state de arquivo (se existir)
3. Inicializa FallbackRouter com estados restaurados
4. Registra tools
5. Pronto para servir requisições
```

### 4.2 Processedo de Fallback (corrigido)

```
1. Tentativa com provider primário
2. Se falhar e enableFallback=true:
   a. Verifica se há fallbacks registrados (não o mesmo handler!)
   b. Se não há, retorna erro diretamente
   c. Se há, tenta próximo provider
3. Salva novo estado de circuit breaker
```

## 5. Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    official-server.ts                       │
│                  (MCP Server Principal)                    │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ FallbackRouter │  │  MCPRouter     │  │  Fallback       │
│ (circuit break)│  │ (backoff only) │  │ (API secondary) │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Health State Persistence                       │
│              (.vibe-flow/health-state.json)                │
└─────────────────────────────────────────────────────────────┘
```

## 6. Casos de Teste

### TC-001: Integração LLM Real
- Given: OPENAI_API_KEY configurado
- When: AgenticMapOperator.map() chamado com factory RealLLMWorker
- Then: Requisições enviadas para OpenAI API

### TC-002: Fallback para Mock
- Given: API key não configurada
- When: AgenticMapOperator.map() chamado
- Then: Usa MockLLMWorker com warning log

### TC-003: Persistência de Circuit Breaker
- Given: Circuit breaker em estado OPEN
- When: Servidor reiniciado
- Then: Estado OPEN restaurado, requisições rejeitadas

### TC-004: Graceful Degradation LCM
- Given: Diretório archives não existe
- When: lcm_grep() chamado
- Then: Retorna { success: true, matches: [], message: "..." }

### TC-005: Fallbacks Não Redundantes
- Given: FallbackProvider registrado
- When: Primary handler falha
- Then: Fallback handler diferente é executado (não o mesmo)
