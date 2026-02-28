# Contracts: Melhorias nas MCP Tools

## Interfaces para RealLLMWorker (TASK-A-001)

```typescript
// Provedores LLM suportados
export type LLMProvider = 'openai' | 'anthropic';

// Configuração do RealLLMWorker
export interface RealLLMWorkerConfig {
  apiKey: string;
  provider: LLMProvider;
  model: string;
  timeoutMs: number;
}

// Opções de retry
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
```

## Interfaces para Health Persistence (TASK-A-002)

```typescript
// Estado do circuit breaker para persistência
export interface PersistedCircuitBreakerState {
  toolName: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: string | null;
  lastFailureReason: string | null;
  lastFailureType: string | null;
}

// Estatísticas de fallback para persistência
export interface PersistedFallbackStats {
  totalAttempts: number;
  successfulFallbacks: number;
  failedFallbacks: number;
}

// Estado completo de health para persistência
export interface PersistedHealthState {
  version: string;
  circuitBreakers: PersistedCircuitBreakerState[];
  fallbackStats: PersistedFallbackStats;
  lastUpdated: string;
}

// Caminho do arquivo de health
export const DEFAULT_HEALTH_STATE_PATH = '.vibe-flow/health-state.json';
```

## Interfaces para Tool mcp_health_status (TASK-B-006)

```typescript
// Entrada para health status tool
export interface HealthStatusInput {
  includeHistory?: boolean;
}

// Status de um circuit breaker
export interface CircuitBreakerStatus {
  toolName: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: string | null;
  lastFailureReason: string | null;
}

// Estatísticas de fallback
export interface FallbackStatistics {
  totalAttempts: number;
  successfulFallbacks: number;
  failedFallbacks: number;
  successRate: number;
}

// Resultado da health status tool
export interface HealthStatusResult {
  success: boolean;
  circuitBreakers: CircuitBreakerStatus[];
  fallbackStats: FallbackStatistics;
  lastUpdated: string;
}
```

## Schema para MCP Tool Registration

```typescript
// Schema para lcm_describe (atualizado)
export const lcmDescribeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'ID to describe (pointer or file path)' },
    projectPath: { type: 'string', description: 'Optional project path' }
  },
  required: ['id']
};

// Schema para mcp_health_status (novo)
export const mcpHealthStatusSchema = {
  type: 'object',
  properties: {
    includeHistory: { type: 'boolean', description: 'Include recent state changes' }
  }
};
```

## Environment Variables

| Variável | Tipo | Obrigatório | Default |
|----------|------|-------------|---------|
| OPENAI_API_KEY | string | Condicional | - |
| ANTHROPIC_API_KEY | string | Condicional | - |
| LLM_PROVIDER | 'openai' \| 'anthropic' | Não | 'anthropic' |
| LLM_MODEL | string | Não | 'gpt-4' |
| LLM_TIMEOUT_MS | number | Não | 60000 |
| HEALTH_STATE_PATH | string | Não | '.vibe-flow/health-state.json' |
