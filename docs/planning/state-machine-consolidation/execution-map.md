# Execution Map: State Machine Consolidation

## Visão Geral

Este documento descreve o plano de execução paralela para a consolidação da State Machine.

## Dependências entre Tasks

```
TASK-000 (Contratos)
    │
    ├── TASK-100 (Circuit Breaker)
    │
    ├── TASK-101 (Naming Conflict)
    │
    ├── TASK-102 (UnifiedTelemetry)
    │       │
    │       └── TASK-105 (Deprecation) [ após TASK-102 ]
    │
    ├── TASK-103 (WAL Integration)
    │
    └── TASK-104 (Persistência)
            │
            └── TASK-INT-001 (Dependentes) [ após TASK-103+104 ]

TASK-INT-002 (Testes)
TASK-INT-003 (Build)
```

## Paralelização

### Fase B - Round 1 (Paralelo)
| Terminal | Task | Estimativa |
|----------|------|------------|
| 1 | TASK-100: Circuit Breaker unificado | 45 min |
| 2 | TASK-101: Naming conflict | 15 min |
| 3 | TASK-102: UnifiedTelemetry | 90 min |
| 4 | TASK-103: WAL Integration | 45 min |
| 5 | TASK-104: Persistência otimizada | 45 min |

### Fase B - Round 2 (Paralelo, depende Round 1)
| Terminal | Task | Estimativa |
|----------|------|------------|
| 1 | TASK-105: Deprecation warnings | 20 min |

### Fase C (Serializado)
| Task | Estimativa |
|------|------------|
| TASK-INT-001: Atualizar dependentes | 30 min |
| TASK-INT-002: Testes de integração | 45 min |
| TASK-INT-003: Validação build | 15 min |

## Instruções para Dev Agents

### TASK-100 (Circuit Breaker)
```
Modificar src/drivers/router.ts:
- Substituir circuit breaker interno por AgentCircuitBreaker
- Manter interface pública unchanged

Modificar src/mcp/fallback-router.ts:
- Substituir FallbackRouter internals por AgentCircuitBreaker
- Manter interface RoutedToolResult unchanged
```

### TASK-101 (Naming Conflict)
```
Modificar src/state-machine/tracker.ts:
- Renomear class CircuitBreakerError para StagnationError
- Atualizar throw new CircuitBreakerError → throw new StagnationError

Modificar src/state-machine/index.ts:
- Exportar StagnationError
```

### TASK-102 (UnifiedTelemetry)
```
Criar src/telemetry/unified.ts:
- Implementar classe que estende/agrega:
  - TelemetryCollector (métricas)
  - Logger (logs)
  - QuotaTracker (quota)
  - StateMachineTelemetry (transições)
- Manter compatibilidade com APIs antigas

Atualizar src/telemetry/index.ts:
- Exportar UnifiedTelemetry
- Deprecar classes antigas
```

### TASK-103 (WAL Integration)
```
Criar src/state-machine/wal-integration.ts:
- Adicionar método recoverFromWAL()
- Adicionar método persistToWAL()
- Integrar com StateMachineOrchestrator

Atualizar src/state-machine/orchestrator.ts:
- Importar e usar WALManager
- Configuração via options.enableWAL
```

### TASK-104 (Persistência)
```
Criar src/state-machine/persistence-strategy.ts:
- Implementar LazyPersistence (intervalo de tempo)
- Implementar BatchPersistence (contagem)
- Implementar EagerPersistence (padrão atual)

Atualizar StateMachineOrchestrator:
- Configuração via options.persistence.mode
```

## Critérios de Conclusão por Fase

### Fase A (Concluída quando)
- TASK-000: Interfaces definidas e compilando

### Fase B (Concluída quando)
- TASK-100: AgentRouter e FallbackRouter usam AgentCircuitBreaker
- TASK-101: StagnationError exportado
- TASK-102: UnifiedTelemetry substitui 4 sistemas
- TASK-103: StateMachine faz recovery via WAL
- TASK-104: Persistência lazy/batch funciona
- TASK-105: APIs antigas com @deprecated

### Fase C (Concluída quando)
- TASK-INT-001: Dependentes atualizados
- TASK-INT-002: Testes de integração passando
- TASK-INT-003: Build compila com 0 erros
