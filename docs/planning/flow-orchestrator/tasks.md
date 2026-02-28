# Tasks: Flow Orchestrator Implementation

## Overview

| Fase | Tarefas | Paralelismo |
|------|---------|--------------|
| A (Contratos) | 5 tasks | Sequencial |
| B (Implementação) | 18 tasks | Paralelo (até 8) |
| C (Integração) | 6 tasks | Sequencial |

**Total: 29 tasks**

---

## Fase A — Contratos (Sequencial)

### TASK-A-001: Definir tipos do Flow Orchestrator

**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (15 min)

**Descrição:**
Criar `src/flow/types.ts` com todas as interfaces necessárias:
- `PipelineState`, `Phase`, `PhaseStatus`
- `WorkUnit`, `WorkUnitStatus`, `WorkUnitType`
- `Worker`, `WorkerStatus`
- `MergeResult`, `Conflict`, `Resolution`
- `PipelineConfig`, `PipelineReport`

**Arquivos sob propriedade:**
- `src/flow/types.ts` (criar)

**Dependências:** Nenhuma

**Critérios de conclusão:**
- [ ] Todos os tipos definidos
- [ ] TypeScript compila sem erros
- [ ] Usar convenções existentes do projeto

---

### TASK-A-002: Definir configuração padrão

**Tipo:** config
**Prioridade:** P0
**Estimativa:** S (10 min)

**Descrição:**
Criar `src/flow/config/defaults.ts` com valores padrão:
- `DEFAULT_PIPELINE_CONFIG`
- `DEFAULT_WORKER_CONFIG`
- Timeout values
- Paths configuration

**Arquivos sob propriedade:**
- `src/flow/config/defaults.ts` (criar)

**Dependências:** TASK-A-001 (tipos necessários)

**Critérios de conclusão:**
- [ ] Config exportada corretamente
- [ ] Integração com existing ConfigManager

---

### TASK-A-003: Estrutura de diretórios

**Tipo:** config
**Prioridade:** P0
**Estimativa:** S (5 min)

**Descrição:**
Criar estrutura de diretórios `src/flow/`:
- commands/
- config/
- utils/

**Arquivos sob propriedade:**
- `src/flow/index.ts` (exports)
- `src/flow/commands/index.ts` (exports)
- `src/flow/config/index.ts` (exports)
- `src/flow/utils/index.ts` (exports)

**Dependências:** TASK-A-001, TASK-A-002

**Critérios de conclusão:**
- [ ] Estrutura criada
- [ ] Exports barrel functioning

---

### TASK-A-004: Integrar QA verdict ao WrapUpHandler

**Tipo:** integration
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Modificar `src/cli/handlers/WrapUpHandler.ts` para:
1. Importar QualityGateConsolidator
2. Verificar QA verdict antes de executar
3. Block wrap-up se QA não aprovado

**Arquivos sob propriedade:**
- `src/cli/handlers/WrapUpHandler.ts` (modificar)

**Dependências:** TASK-A-001

**Critérios de conclusão:**
- [ ] Wrap-up falha se QA reprovado
- [ ] Mensagem clara de bloqueio
- [ ] Teste unitário passando

---

### TASK-A-005: Integrar SecurityGuard ao QA

**Tipo:** integration
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Integrar SecurityGuard ao QA pipeline:
1. Adicionar SecurityCollector ao QA process
2. Executar scan durante QA phase
3. Reportar vulnerabilidades no QA report

**Arquivos sob propriedade:**
- `src/cli/handlers/QaHandler.ts` (modificar)
- `src/qa/reporter/collectors/security-collector.ts` (modificar se necessário)

**Dependências:** TASK-A-001

**Critérios de conclusão:**
- [ ] SecurityGuard executa no QA
- [ ] Vulnerabilidades reportadas
- [ ] Blocker se vulnerabilidade crítica

---

## Fase B — Implementação (Paralelo)

### TASK-B-001: PipelineManager - Estado

**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Implementar `src/flow/pipeline-manager.ts`:
- `loadState()`: Lê pipeline.json
- `saveState()`: Salva pipeline.json (atomic)
- `createPipeline()`: Cria novo pipeline

**Arquivos sob propriedade:**
- `src/flow/pipeline-manager.ts` (criar)

**Dependências:** TASK-A-001 (tipos)

**Critérios de conclusão:**
- [ ] Load/save working
- [ ] Atomic writes
- [ ] Testes passando

---

### TASK-B-002: PipelineManager - Work Units

**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Adicionar métodos ao PipelineManager:
- `getNextWorkUnit(phase?)`: Próxima work unit disponível
- `claimWorkUnit(workerId, unitId)`: Claim atômico
- `updateWorkUnit(unitId, updates)`: Atualiza status

**Arquivos sob propriedade:**
- `src/flow/pipeline-manager.ts` (modificar)

**Dependências:** TASK-B-001

**Critérios de conclusão:**
- [ ] Claim atômico (race condition safe)
- [ ] Dependências respeitadas

---

### TASK-B-003: MergeGate - Analyze

**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Implementar `src/flow/merge-gate.ts`:
- `mergeAnalyze()`: Consolida análise por domínio
- Gera `docs/flow/analyze/_merged.md`

**Arquivos sob propriedade:**
- `src/flow/merge-gate.ts` (criar método mergeAnalyze)

**Dependências:** TASK-B-002

**Critérios de conclusão:**
- [ ] Gera _merged.md válido
- [ ] Consolida gargalos

---

### TASK-B-004: MergeGate - Plan

**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Adicionar ao MergeGate:
- `mergePlan()`: Consolida PRDs, UX specs, tasks
- Detecta conflitos de ownership

**Arquivos sob propriedade:**
- `src/flow/merge-gate.ts` (modificar)

**Dependências:** TASK-B-003

**Critérios de conclusão:**
- [ ] Gera master-prd.md
- [ ] Detecta conflitos

---

### TASK-B-005: MergeGate - Dev/QA

**Tipo:** service
**Prioridade:** P1
**Estimativa:** S (20 min)

**Descrição:**
Adicionar:
- `mergeDev()`: Consolida output dev
- `mergeQA()`: Consolida QA verdict

**Arquivos sob propriedade:**
- `src/flow/merge-gate.ts` (modificar)

**Dependências:** TASK-B-004

**Critérios de conclusão:**
- [ ] QA verdict consolidado

---

### TASK-B-006: FlowWorker - Lifecycle

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Implementar `src/flow/worker.ts`:
- Constructor com workerId
- `start()`: Inicia loop de trabalho
- `stop()`: Para graciosamente

**Arquivos sob propriedade:**
- `src/flow/worker.ts` (criar)

**Dependências:** TASK-B-002

**Critérios de conclusão:**
- [ ] Worker inicia/para
- [ ] Heartbeat working

---

### TASK-B-007: FlowWorker - Process Work Unit

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Adicionar ao Worker:
- `processWorkUnit(unit)`: Executa work unit
- Tipos de executor por fase:
  - ANA → Analyst logic
  - PLAN → Planner logic
  - DEV → Dev logic
  - QA → QA logic

**Arquivos sob propriedade:**
- `src/flow/worker.ts` (modificar)

**Dependências:** TASK-B-006

**Critérios de conclusão:**
- [ ] Executa ANA/PLAN/DEV/QA
- [ ] Reporta progresso

---

### TASK-B-008: FlowOrchestrator - Initialize

**Tipo:** orchestrator
**Prioridade:** P0
**Estimativa:** M (45 min)

**Descrição:**
Implementar `src/flow/orchestrator.ts`:
- `initialize(objective)`: Cria pipeline.json
- Detecta domínios do projeto
- Popula work units de análise

**Arquivos sob propriedade:**
- `src/flow/orchestrator.ts` (criar método initialize)

**Dependências:** TASK-B-001, TASK-B-002

**Critérios de conclusão:**
- [ ] Cria pipeline.json válido
- [ ] Detecta domínios automaticamente

---

### TASK-B-009: FlowOrchestrator - Start Workers

**Tipo:** orchestrator
**Prioridade:** P0
**Estimativa:** S (20 min)

**Descrição:**
Adicionar:
- `startWorkers(options)`: Inicia workers
- Worker loop padrão

**Arquivos sob propriedade:**
- `src/flow/orchestrator.ts` (modificar)

**Dependências:** TASK-B-008, TASK-B-006

**Critérios de conclusão:**
- [ ] Workers iniciam

---

### TASK-B-010: CLI /flow full

**Tipo:** cli-command
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Criar `src/flow/commands/full.ts`:
- Parse objetivo
- Chama orchestrator.initialize()
- Output de inicialização

**Arquivos sob propriedade:**
- `src/flow/commands/full.ts` (criar)

**Dependências:** TASK-B-008

**Critérios de conclusão:**
- [ ] `vibe-flow flow full "objective"` funciona

---

### TASK-B-011: CLI /flow worker

**Tipo:** cli-command
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Criar `src/flow/commands/worker.ts`:
- Inicia FlowWorker
- Options: --phase, --streaming

**Arquivos sob propriedade:**
- `src/flow/commands/worker.ts` (criar)

**Dependências:** TASK-B-006

**Critérios de conclusão:**
- [ ] `vibe-flow flow worker` funciona
- [ ] Options --phase, --streaming

---

### TASK-B-012: CLI /flow status

**Tipo:** cli-command
**Prioridade:** P0
**Estimativa:** S (20 min)

**Descrição:**
Criar `src/flow/commands/status.ts`:
- Lê pipeline.json
- Formata output em tabela
- Cores ANSI

**Arquivos sob propriedade:**
- `src/flow/commands/status.ts` (criar)

**Dependências:** TASK-B-001

**Critérios de conclusão:**
- [ ] Output formatado conforme UX spec

---

### TASK-B-013: CLI /flow analyze

**Tipo:** cli-command
**Prioridade:** P1
**Estimativa:** S (15 min)

**Descrição:**
Criar `src/flow/commands/analyze.ts`:
- Inicia pipeline em modo análise
- Limita fases

**Arquivos sob propriedade:**
- `src/flow/commands/analyze.ts` (criar)

**Dependências:** TASK-B-010

**Critérios de conclusão:**
- [ ] Funciona

---

### TASK-B-014: CLI /flow plan

**Tipo:** cli-command
**Prioridade:** P1
**Estimativa:** S (15 min)

**Descrição:**
Criar `src/flow/commands/plan.ts`:
- Inicia pipeline em modo planejamento

**Arquivos sob propriedade:**
- `src/flow/commands/plan.ts` (criar)

**Dependências:** TASK-B-010

**Critérios de conclusão:**
- [ ] Funciona

---

### TASK-B-015: CLI /flow dev

**Tipo:** cli-command
**Prioridade:** P1
**Estimativa:** S (15 min)

**Descrição:**
Criar `src/flow/commands/dev.ts`:
- Inicia pipeline em modo dev

**Arquivos sob propriedade:**
- `src/flow/commands/dev.ts` (criar)

**Dependências:** TASK-B-011

**Critérios de conclusão:**
- [ ] Funciona

---

### TASK-B-016: CLI /flow qa

**Tipo:** cli-command
**Prioridade:** P1
**Estimativa:** S (15 min)

**Descrição:**
Criar `src/flow/commands/qa.ts`:
- Inicia pipeline em modo QA

**Arquivos sob propriedade:**
- `src/flow/commands/qa.ts` (criar)

**Dependências:** TASK-B-012

**Critérios de conclusão:**
- [ ] Funciona

---

### TASK-B-017: CLI /flow fix

**Tipo:** cli-command
**Prioridade:** P1
**Estimativa:** S (20 min)

**Descrição:**
Criar `src/flow/commands/fix.ts`:
- Detecta TASK-FIX-*
- Executa em modo dev

**Arquivos sob propriedade:**
- `src/flow/commands/fix.ts` (criar)

**Dependências:** TASK-B-011

**Critérios de conclusão:**
- [ ] Funciona

---

### TASK-B-018: CLI command registration

**Tipo:** cli-integration
**Prioridade:** P0
**Estimativa:** S (15 min)

**Descrição:**
Registrar comandos no CLI:
- Adicionar ao cli.ts
- Subcommand 'flow'

**Arquivos sob propriedade:**
- `src/cli.ts` (modificar)

**Dependências:** TASK-B-010 ao TASK-B-017

**Critérios de conclusão:**
- [ ] `vibe-flow flow --help` funciona

---

## Fase C — Integração (Sequencial)

### TASK-C-001: Build validation

**Tipo:** validation
**Prioridade:** P0
**Estimativa:** S (10 min)

**Descrição:**
Verificar que o build compila:
```bash
npm run build
```

**Dependências:** TASK-B-018

**Critérios de conclusão:**
- [ ] 0 TypeScript errors

---

### TASK-C-002: Unit tests - core

**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Criar testes unitários:
- pipeline-manager.test.ts
- worker.test.ts
- merge-gate.test.ts

**Arquivos sob propriedade:**
- `tests/unit/flow/pipeline-manager.test.ts` (criar)
- `tests/unit/flow/worker.test.ts` (criar)
- `tests/unit/flow/merge-gate.test.ts` (criar)

**Dependências:** TASK-C-001

**Critérios de conclusão:**
- [ ] >90% coverage
- [ ] All tests passing

---

### TASK-C-003: Integration test - /flow full

**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Teste end-to-end:
- `vibe-flow flow full "test"`
- Verifica pipeline.json criado

**Dependências:** TASK-C-002

**Critérios de conclusão:**
- [ ] Test passing

---

### TASK-C-004: Integration test - worker parallel

**Tipo:** test
**Prioridade:** P1
**Estimativa:** L (60 min)

**Descrição:**
Testar paralelismo:
- Iniciar 2 workers
- Verificar claim sem duplicação

**Dependências:** TASK-C-003

**Critérios de conclusão:**
- [ ] Sem race conditions

---

### TASK-C-005: QA block integration test

**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (30 min)

**Descrição:**
Testar que wrap-up é bloqueado:
- Simular QA fail
- Executar wrap-up
- Verificar que falha

**Arquivos sob propriedade:**
- `tests/integration/flow/qa-block.test.ts` (criar)

**Dependências:** TASK-C-001

**Critérios de conclusão:**
- [ ] Test passing

---

### TASK-C-006: Update file-registry.md

**Tipo:** docs
**Prioridade:** P2
**Estimativa:** S (10 min)

**Descrição:**
Atualizar docs/architecture/file-registry.md com novos arquivos

**Dependências:** TASK-C-001

**Critérios de conclusão:**
- [ ] Arquivos documentados

---

## Mapa de Execução

### Fase A — Contratos (Sequencial, 1 terminal)
```
TASK-A-001 → TASK-A-002 → TASK-A-003 → TASK-A-004 → TASK-A-005
Tempo estimado: ~90 min
```

### Fase B — Implementação (Paralela, até 8 terminais)

```
Rodada 1 (TASK-B-001 ao TASK-B-009):
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: TASK-B-001 PipelineManager-state   [M 45min]   │
│ Terminal 2: TASK-B-002 PipelineManager-work    [M 45min]   │
│ Terminal 3: TASK-B-003 MergeGate-analyze      [M 45min]   │
│ Terminal 4: TASK-B-004 MergeGate-plan          [M 45min]   │
│ Terminal 5: TASK-B-005 MergeGate-dev-qa        [S 20min]   │
│ Terminal 6: TASK-B-006 Worker-lifecycle         [M 45min]   │
│ Terminal 7: TASK-B-007 Worker-process          [M 45min]   │
│ Terminal 8: TASK-B-008 Orchestrator-init       [M 45min]   │
└─────────────────────────────────────────────────────────────┘
Tempo da rodada: ~45 min

Rodada 2 (TASK-B-009 ao TASK-B-018):
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: TASK-B-009 Orchestrator-workers [S 20min]     │
│ Terminal 2: TASK-B-010 CLI-full              [M 30min]     │
│ Terminal 3: TASK-B-011 CLI-worker            [M 30min]     │
│ Terminal 4: TASK-B-012 CLI-status            [S 20min]     │
│ Terminal 5: TASK-B-013 CLI-analyze           [S 15min]     │
│ Terminal 6: TASK-B-014 CLI-plan              [S 15min]     │
│ Terminal 7: TASK-B-015 CLI-dev               [S 15min]     │
│ Terminal 8: TASK-B-016 CLI-qa                [S 15min]     │
│ Terminal 9: TASK-B-017 CLI-fix               [S 20min]     │
│ Terminal 10: TASK-B-018 CLI-registration     [S 15min]    │
└─────────────────────────────────────────────────────────────┘
Tempo da rodada: ~30 min
```

### Fase C — Integração (Sequencial, 1 terminal)
```
TASK-C-001 → TASK-C-002 → TASK-C-003 → TASK-C-004 → TASK-C-005 → TASK-C-006
Tempo estimado: ~140 min
```

### Tempo Total Estimado

- Fase A: ~90 min (sequencial)
- Fase B: ~75 min (paralelo, 2 rodadas)
- Fase C: ~140 min (maioria testes)
- **Total: ~305 min (~5 horas)**

### Paralelismo Efetivo

- Fase A: 1 terminal
- Fase B: até 10 terminais simultaneos
- Fase C: 1 terminal
- **Speedup estimado vs sequencial: ~3-4x**

---

## Conflitos de Arquivos

Verificar que nenhuma task paralela modifica o mesmo arquivo:

| Arquivo | Tasks | Veredicto |
|---------|-------|-----------|
| src/flow/pipeline-manager.ts | B-001, B-002 | OK - sequência |
| src/flow/merge-gate.ts | B-003, B-004, B-005 | OK - sequência |
| src/flow/worker.ts | B-006, B-007 | OK - sequência |
| src/flow/orchestrator.ts | B-008, B-009 | OK - sequência |
| src/cli.ts | B-018 | Única |
| src/cli/handlers/WrapUpHandler.ts | A-004 | Única |
| src/cli/handlers/QaHandler.ts | A-005 | Única |
