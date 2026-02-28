# Tasks: Context Management Lifecycle

## Fase A — Contratos (Serializada)

### TASK-000: Definir interfaces do Archive Lifecycle Manager

**Fase:** A
**Tipo:** type | test
**Prioridade:** P0
**Estimativa:** S

**Requisitos PRD:** RF-001, RF-002

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/archive-lifecycle.ts` (criar)
- `src/context/archive-lifecycle.test.ts` (criar)
- `src/context/index.ts` (atualizar exports)

### Contratos de entrada
- Nenhuma dependência externa

### Contratos de saída
- Exporta: `ArchiveLifecycleManager`, `ArchiveLifecycleConfig`, `ArchiveStats`, `CleanupResult`

### Critérios de conclusão
- [ ] Interface definida conforme UX Spec
- [ ] Testes básicos passando
- [ ] Exports atualizados

---

### TASK-001: Unificar token estimation em compression.ts

**Fase:** A
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S

**Requisitos PRD:** RF-003

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/compression.ts` (modificar)

### Contratos de entrada
- `src/utils/token-estimation.ts` -> `estimateTokens()`

### Contratos de saída
- `compression.ts` usa import externo, não função interna

### Critérios de conclusão
- [ ] Import de `src/utils/token-estimation.ts` adicionado
- [ ] Função local `estimateTokens` removida
- [ ] Build compila
- [ ] Testes existentes passam

---

### TASK-002: Unificar token estimation em compaction.ts

**Fase:** A
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S

**Requisitos PRD:** RF-004

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/compaction.ts` (modificar)

### Contratos de entrada
- `src/utils/token-estimation.ts` -> `estimateTokens()`

### Contratos de saída
- `compaction.ts` usa import externo, não função interna

### Critérios de conclusão
- [ ] Import de `src/utils/token-estimation.ts` adicionado
- [ ] Função `compactionEstimateTokens` removida (manter alias se necessário)
- [ ] Build compila
- [ ] Testes existentes passam

---

### TASK-003: Unificar token estimation em file-pointers.ts

**Fase:** A
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S

**Requisitos PRD:** RF-006

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/file-pointers.ts` (modificar)

### Contratos de entrada
- `src/utils/token-estimation.ts` -> `estimateTokens()`

### Contratos de saída
- `file-pointers.ts` usa import externo

### Critérios de conclusão
- [ ] Import de `src/utils/token-estimation.ts` adicionado
- [ ] Função `estimateFileTokens` removida (manter alias se necessário)
- [ ] Build compila
- [ ] Testes existentes passam

---

## Fase B — Implementação (Paralela)

### TASK-100: Implementar Archive Lifecycle Manager

**Fase:** B
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M

**Requisitos PRD:** RF-001, RF-002

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/archive-lifecycle.ts` (implementar)
- `src/context/archive-lifecycle.test.ts` (implementar)

### Contratos de entrada
- TASK-000 definido interfaces
- `fs` (Node.js)

### Contratos de saída
- Exporta: `ArchiveLifecycleManager` com métodos estáticos
- Integração: `ContextManagerConfig` para retentionDays

### Critérios de conclusão
- [ ] clean() deleta arquivos mais antigos que retentionDays
- [ ] getStats() retorna estatísticas por diretório
- [ ] Suporta dry-run mode
- [ ] Testes passando

---

### TASK-101: Implementar persistência DAG

**Fase:** B
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M

**Requisitos PRD:** RF-007, RF-008, RF-009

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/dag-summary.ts` (adicionar funções)
- `src/context/context-manager.ts` (integrar)

### Contratos de entrada
- `DAGState` de `dag-summary.ts`
- `fs` (Node.js)

### Contratos de saída
- `saveDAGState()`, `loadDAGState()`, `getDAGStorageInfo()`

### Critérios de conclusão
- [ ] saveDAGState persiste para JSON
- [ ] loadDAGState reconstruction estado
- [ ] ContextManager integra no startup
- [ ] Build compila

---

### TASK-102: Implementar Pointer Expansion Guard

**Fase:** B
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M

**Requisitos PRD:** RF-010, RF-011

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/pointer-guard.ts` (criar)
- `src/context/pointer-guard.test.ts` (criar)

### Contratos de entrada
- Interfaces de pointer (FilePointer, LogPointer, RawDataPointer)

### Contratos de saída
- `PointerExpansionGuard` com semaphore

### Critérios de conclusão
- [ ] Semaphore limita expansões concorrentes
- [ ] Stats tracking (active, queued, completed, failed)
- [ ] Timeout implementado
- [ ] Testes passando

---

### TASK-103: Refatorar WorkerPool Factory

**Fase:** B
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S

**Requisitos PRD:** RF-012, RF-013

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/worker-pool.ts` (modificar)
- `src/context/index.ts` (atualizar exports)

### Contratos de entrada
- `WorkerPoolConfig` existente

### Contratos de saída
- Factory functions: `createPoolInstance()`, `getPoolInstance()`, `destroyPoolInstance()`

### Critérios de conclusão
- [ ] Singleton global removido
- [ ] Factory com instance ID funcionando
- [ ] Backward compatibility mantida
- [ ] Testes passando

---

## Fase C — Integração (Serializada)

### TASK-INT-001: Integrar Archive Lifecycle no ContextManager

**Fase:** C
**Tipo:** integration
**Prioridade:** P0
**Estimativa:** S

### Arquivos sob propriedade (OWNERSHIP)
- `src/context/context-manager.ts` (adicionar integração)
- `src/context/index.ts` (atualizar)

### Contratos de entrada
- TASK-100 ArchiveLifecycleManager
- ContextManagerConfig existente

### Contratos de saída
- ContextManager com cleanup automático

### Critérios de conclusão
- [ ] schedulePeriodicCleanup() integrado
- [ ] Configuração de retention via ContextManagerConfig
- [ ] Build compila

---

### TASK-INT-002: Integração completa de token estimation

**Fase:** C
**Tipo:** integration
**Prioridade:** P0
**Estimativa:** S

### Arquivos sob propriedade (OWNERSHIP)
- Revisão de todos os arquivos modificados

### Contratos de entrada
- TASK-001, TASK-002, TASK-003 completados

### Contratos de saída
- Build completo com testes

### Critérios de conclusão
- [ ] npm run build compila sem erros
- [ ] npm test passa
- [ ] Verificar que todos os módulos usam src/utils/token-estimation.ts

---

### TASK-INT-003: Validar Pipeline

**Fase:** C
**Tipo:** qa
**Prioridade:** P0
**Estimativa:** S

### Critérios de conclusão
- [ ] TypeScript build compila
- [ ] Testes unitários passam
- [ ] Verificação de regressão

---

## Mapa de Execução

### Fase A — Contratos (Sequencial, 1 terminal)
TASK-000 -> TASK-001 -> TASK-002 -> TASK-003
Tempo estimado: ~30 min

### Fase B — Implementação (Paralela, até 4 terminais)
```
Terminal 1: TASK-100 ArchiveLifecycle [M ~45min]
Terminal 2: TASK-101 DAG Persistence [M ~45min]
Terminal 3: TASK-102 Pointer Guard [M ~45min]
Terminal 4: TASK-103 WorkerPool Factory [S ~20min]
```
Tempo da rodada: ~45 min

### Fase C — Integração (Sequencial, 1 terminal)
TASK-INT-001 -> TASK-INT-002 -> TASK-INT-003
Tempo estimado: ~20 min

### Tempo total estimado: ~95 min
### Paralelismo efetivo: 4 terminais na Fase B
### Speedup vs sequencial: ~1.8x
