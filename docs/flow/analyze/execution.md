# Análise de Domínio: Execution (Motor de Execução)

## Arquivos (24)

| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| TDD | loop-controller.ts, coverage-tracker.ts, prompts.ts, task-queue.ts, test-runner.ts, failure-analyzer.ts, regression-guard.ts, mock-factory.ts | Motor TDD com Red-Green-Refactor |
| Agents | refactor-agent.ts | Agente de refatoração |
| Orchestration | tdd-coordinator.ts | Coordenador TDD |
| Context | tdd-pruner.ts | Poda de contexto para sessões longas TDD |
| Security | tdd-sandbox.ts | Sandbox de segurança para TDD |
| Telemetry | tdd-metrics.ts | Métricas TDD |

## Padrões Detectados

### TDDLoopController
- Máquina de estados: IDLE → RED → GREEN → REFACTOR → COMPLETED/FAILED
- Injeção de dependência: TestGenerator, ImplementationGenerator, TestRunner
- Limites configuráveis: maxIterationsPerPhase (5), maxTotalIterations (15)

### Error Handling
- CircuitBreaker: CLOSED → OPEN → HALF_OPEN com maxRetries (3)
- Rate limiting integrado
- WAL (Write-Ahead Log) para recuperação

### Drivers
- AgentRouter com fallback automático (ClaudeCode → Codex)
- DriverResult com status, driverUsed, result, error
- Circuit breaker integrado para rate limits

## Interfaces Públicas

```typescript
// TDD
TDDPhase, TestResult, TDDIterationResult, TDDRunResult
TestGenerator, ImplementationGenerator, TestRunner

// Error Handler
CircuitBreakerState, CircuitBreakerError, CircuitBreakerConfig
AgentCircuitBreaker, rateLimitRetry, withRetry

// Drivers
AgentDriver, DriverResult, ClaudeCodeDriver, CodexDriver
AgentRouter, selectBestDriver()
```

## Dependências Externas

- Node.js: fs, path, child_process, worker_threads
- Nenhum package.json externo (zero-dependency pattern)

## Gargalos

| Severidade | Item | Descrição |
|------------|------|----------|
| Nenhum | - | Módulos bem estruturados |
| Baixa | TestRunner | Mock implementação - precisa de LLM real |
| Baixa | Agent drivers | ClaudeCodeDriver/CodexDriver são mocks |

## Recomendação para Auth System

Para implementar sistema de autenticação:
- Usar TDDLoopController para desenvolvimento test-first
- Implementar TestRunner real com Jest/Vitest
- Reutilizar circuit-breaker para rate limiting de login
- Criar drivers de autenticação (OAuth, JWT)
