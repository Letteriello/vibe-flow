# Tasks: Consolidação da State Machine

## Fase A — Contratos (Serialização Necessária)

### TASK-000: Definir interfaces unificadas

**Fase:** A (Serializada)
**Tipo:** interface
**Prioridade:** P0
**Estimativa:** S (15 min)

**Requisitos PRD:** RF-001, RF-004

### Arquivos sob propriedade (OWNERSHIP)
- `src/consolidated/circuit-breaker.types.ts` (criar)
- `src/consolidated/telemetry.types.ts` (criar)

### Contratos de entrada
- Tipos existentes em `src/error-handler/circuit-breaker.ts`
- Tipos existentes em `src/telemetry/index.ts`, `logger.ts`, `quotaTracker.ts`
- Tipos existentes em `src/state-machine/telemetry.ts`

### Contratos de saída
- `CircuitBreakerConfig` - configuração unificada
- `TelemetryConfig` - configuração unificada
- `UnifiedTelemetryAPI` - interface completa

### Critérios de conclusão
- [ ] Interfaces definidas em TypeScript
- [ ] Compila sem erros
- [ ] Documentação inline

---

## Fase B — Implementação Paralela

### TASK-100: Unificar Circuit Breaker

**Fase:** B (Paralela)
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-001

### Arquivos sob propriedade
- `src/error-handler/circuit-breaker.ts` (manter como canônico)
- `src/drivers/router.ts` (atualizar para usar AgentCircuitBreaker)
- `src/drivers/types.ts` (atualizar imports)

### Contratos de entrada
- `src/consolidated/circuit-breaker.types.ts` (TASK-000)

### Contratos de saída
- `AgentCircuitBreaker` exportado para uso em drivers e MCP

### Critérios de conclusão
- [ ] AgentRouter usa AgentCircuitBreaker internamente
- [ ] FallbackRouter usa AgentCircuitBreaker internamente
- [ ] Testes passam
- [ ] Build compila

---

### TASK-101: Resolver naming conflict

**Fase:** B (Paralela)
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S (15 min)

**Requisitos PRD:** RF-002

### Arquivos sob propriedade
- `src/state-machine/tracker.ts` (renomear CircuitBreakerError → StagnationError)
- `src/state-machine/index.ts` (atualizar exports)

### Contratos de entrada
- Nenhum

### Contratos de saída
- `StagnationError` exportado (novo nome)

### Critérios de conclusão
- [ ] CircuitBreakerError renomeado para StagnationError
- [ ] Exports atualizados
- [ ] Testes passam

---

### TASK-102: Criar UnifiedTelemetry

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** L (90 min)

**Requisitos PRD:** RF-004

### Arquivos sob propriedade
- `src/telemetry/unified.ts` (criar)
- `src/telemetry/index.ts` (atualizar exports)

### Contratos de entrada
- `src/consolidated/telemetry.types.ts` (TASK-000)
- `src/telemetry/index.ts` (TelemetryCollector)
- `src/telemetry/logger.ts` (Logger)
- `src/telemetry/quotaTracker.ts` (QuotaTracker)
- `src/state-machine/telemetry.ts` (StateMachineTelemetry)

### Contratos de saída
- `UnifiedTelemetry` - classe que implementa todas as funcionalidades

### Critérios de conclusão
- [ ] Implementa métodos do TelemetryCollector
- [ ] Implementa métodos do Logger
- [ ] Implementa métodos do QuotaTracker
- [ ] Implementa métodos do StateMachineTelemetry
- [ ] Testes passam

---

### TASK-103: Integrar WALManager com StateMachine

**Fase:** B (Paralela)
**Tipo:** integration
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-003

### Arquivos sob propriedade
- `src/state-machine/wal-integration.ts` (criar)
- `src/state-machine/index.ts` (atualizar)

### Contratos de entrada
- `src/error-handler/wal-recovery.ts` (WALManager existente)
- `src/state-machine/orchestrator.ts` (StateMachine principal)

### Contratos de saída
- Método `recoverFromWAL()` na StateMachine
- Método `persistToWAL()` na StateMachine

### Critérios de conclusão
- [ ] StateMachine integra com WALManager
- [ ] Recovery funciona após crash simulado
- [ ] Testes passam

---

### TASK-104: Implementar persistência otimizada

**Fase:** B (Paralela)
**Tipo:** optimization
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-005

### Arquivos sob propriedade
- `src/state-machine/persistence-strategy.ts` (criar)
- `src/state-machine/index.ts` (atualizar)

### Contratos de entrada
- `src/state-machine/orchestrator.ts`
- `src/state-machine/wal-integration.ts` (TASK-103)

### Contratos de saída
- `PersistenceStrategy` - modo lazy/batch/eager
- Configuração via StateMachine options

### Critérios de conclusão
- [ ] Modo lazy implementado (intervalo de tempo)
- [ ] Modo batch implementado (contagem de transições)
- [ ] Performance validada

---

### TASK-105: Deprecar APIs antigas

**Fase:** B (Paralela)
**Tipo:** deprecation
**Prioridade:** P1
**Estimativa:** S (20 min)

**Requisitos PRD:** RF-007

### Arquivos sob propriedade
- `src/telemetry/logger.ts` (adicionar @deprecated)
- `src/telemetry/quotaTracker.ts` (adicionar @deprecated)
- `src/telemetry/index.ts` (adicionar @deprecated)
- `src/state-machine/telemetry.ts` (adicionar @deprecated)
- `src/drivers/router.ts` (adicionar @deprecated)
- `src/mcp/fallback-router.ts` (adicionar @deprecated)

### Contratos de entrada
- Nenhum

### Contratos de saída
- Warnings de deprecação nas classes antigas

### Critérios de结论
- [ ] Todas as APIs antigas têm @deprecated
- [ ] Mensagem indica usar UnifiedTelemetry ou AgentCircuitBreaker

---

## Fase C — Integração (Serialização Necessária)

### TASK-INT-001: Atualizar dependentes

**Fase:** C (Serializada)
**Tipo:** integration
**Prioridade:** P0
**Estimativa:** M (30 min)

**Requisitos PRD:** RF-006

### Arquivos sob propriedade
- Todos os arquivos que importam das APIs antigas

### Contratos de entrada
- TASK-100, TASK-101, TASK-102, TASK-103, TASK-104

### Critérios de conclusão
- [ ] Dependentes atualizados para usar novas APIs
- [ ] Compatibilidade mantida (deprecated aliases)

---

### TASK-INT-002: Testes de integração

**Fase:** C (Serializada)
**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-001, RF-002, RF-003, RF-004, RF-005

### Arquivos sob propriedade
- `tests/integration/state-machine-consolidation.test.ts` (criar)

### Contratos de entrada
- TASK-100, TASK-101, TASK-102, TASK-103, TASK-104

### Critérios de conclusão
- [ ] Teste de Circuit Breaker unificado
- [ ] Teste de recovery via WAL
- [ ] Teste de persistência lazy
- [ ] Teste de UnifiedTelemetry

---

### TASK-INT-003: Validação de build

**Fase:** C (Serializada)
**Tipo:** validation
**Prioridade:** P0
**Estimativa:** S (15 min)

**Requisitos PRD:** Todas

### Contratos de entrada
- TASK-INT-001, TASK-INT-002

### Critérios de conclusão
- [ ] npm run build passa
- [ ] npm test passa (>95%)
- [ ] 0 erros TypeScript

---

## Mapa de Execução

### Fase A — Contratos (Sequencial, 1 terminal)
TASK-000 → Definição de interfaces
Tempo estimado: ~15 min

### Fase B — Implementação (Paralela, 5 terminais)
```
Rodada 1:
Terminal 1: TASK-100 Circuit Breaker unificado     [M ~45min]
Terminal 2: TASK-101 Naming conflict                [S ~15min]
Terminal 3: TASK-102 UnifiedTelemetry              [L ~90min]
Terminal 4: TASK-103 WAL Integration               [M ~45min]
Terminal 5: TASK-104 Persistência otimizada        [M ~45min]

Rodada 2 (após Rodada 1):
Terminal 1: TASK-105 Deprecation warnings          [S ~20min]

Tempo da rodada 1: ~90 min
```

### Fase C — Integração (Sequencial, 1 terminal)
TASK-INT-001 → TASK-INT-002 → TASK-INT-003
Tempo estimado: ~90 min

### Tempo total estimado: ~195 min
### Paralelismo efetivo: 5 terminais na Fase B
### Speedup vs sequencial: ~2.3x
