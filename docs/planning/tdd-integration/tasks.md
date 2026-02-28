# Tasks: Integracao TDD

## Mapa de Execucao

### Fase A - Contratos (Serializada, 1 terminal)

| Task | Descricao | Dependencias |
|------|-----------|--------------|
| TASK-001 | Criar TDDTypes com interface TestResult unificada | - |
| TASK-002 | Atualizar loop-controller.ts para usar tipos unificados | TASK-001 |
| TASK-003 | Criar TDDIntegrator - facade unificada | TASK-001, TASK-002 |

### Fase B - Implementacao (Paralela, ate 4 terminais)

| Task | Descricao | Dependencias |
|------|-----------|--------------|
| TASK-010 | Integrar prompts.ts ao TDDLoopController | TASK-003 |
| TASK-011 | Integrar failure-analyzer.ts ao TDDLoopController | TASK-003 |
| TASK-012 | Integrar coverage-tracker.ts ao TDDLoopController | TASK-003 |
| TASK-013 | Integrar regression-guard.ts ao TDDLoopController | TASK-003 |
| TASK-014 | Modificar TDDCoordinator para delegar ao LoopController | TASK-010, TASK-011, TASK-012, TASK-013 |
| TASK-015 | Atualizar exports em index.ts | TASK-014 |

### Fase C - Validacao (Serializada, 1 terminal)

| Task | Descricao | Dependencias |
|------|-----------|--------------|
| TASK-020 | Executar build TypeScript | TASK-015 |
| TASK-021 | Executar testes unitarios | TASK-020 |
| TASK-022 | Criar teste de integracao do fluxo | TASK-021 |

---

## TASK-001: Criar TDDTypes com interface TestResult unificada

**Fase:** A (Serializada)
**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (~20 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/types.ts` (criar)

**Contratos de entrada:**
- Interfaces TestResult existentes em:
  - `loop-controller.ts`: `{ success: boolean; output: string; error?: string; duration: number }`
  - `test-runner.ts`: `{ passed: boolean; failedTests: string[]; errorOutput: string }`
  - `regression-guard.ts`: `{ name: string; status: 'pass'|'fail'|'skip'; duration: number; errors?: string[] }`

**Contratos de saida:**
- Novo arquivo `src/execution/tdd/types.ts` com:
  - `TDDTestResult` - interface canonica unificada
  - `TDDTestRunnerConfig` - configuracao para test runner
  - `TDDLoopConfigExtended` - configuracao estendida com opcoes de integracao

**Criterios de conclusao:**
- [ ] Arquivo types.ts criado com interfaces unificadas
- [ ] Compatible com todos os usos existentes
- [ ] Build compila sem erros

---

## TASK-002: Atualizar loop-controller.ts para usar tipos unificados

**Fase:** A (Serializada)
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S (~20 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/loop-controller.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/types.ts` (criado em TASK-001)

**Contratos de saida:**
- LoopController usa `TDDTestResult` de types.ts
- Mantem compatibilidade com interface TestGenerator/ImplementationGenerator existente

**Criterios de conclusao:**
- [ ] Importa TDDTestResult de types.ts
- [ ] Mantem interfaces TestGenerator/ImplementationGenerator existentes
- [ ] Build compila sem erros
- [ ] Testes existentes passam

---

## TASK-003: Criar TDDIntegrator - facade unificada

**Fase:** A (Serializada)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/tdd-integrator.ts` (criar)

**Contratos de entrada:**
- `src/execution/tdd/types.ts`
- `src/execution/tdd/loop-controller.ts`
- `src/execution/tdd/prompts.ts`
- `src/execution/tdd/failure-analyzer.ts`
- `src/execution/tdd/coverage-tracker.ts`
- `src/execution/tdd/regression-guard.ts`

**Contratos de saida:**
- Facade que encapsula toda a logica de integracao
- Metodo principal: `createIntegratedLoopController(config): TDDLoopController`
- Configuracao estendida com opcoes de integracao

**Criterios de conclusao:**
- [ ] Cria TDDLoopConfigExtended com opcoes de integracao
- [ ] Cria factory que configura LoopController com todos os modulos
- [ ] Build compila sem erros

---

## TASK-010: Integrar prompts.ts ao TDDLoopController

**Fase:** B (Paralela)
**Tipo:** feature
**Prioridade:** P0
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/tdd-integrator.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/prompts.ts` - `buildTestGenerationPrompt`, `buildImplementationPrompt`
- `src/execution/tdd/types.ts`

**Contratos de saida:**
- TestGenerator usa prompts.ts para gerar contexto
- ImplementationGenerator usa prompts.ts para gerar contexto

**Criterios de conclusao:**
- [ ] Implementacao usa buildTestGenerationPrompt para RED
- [ ] Implementacao usa buildImplementationPrompt para GREEN
- [ ] Contexto de falha passado corretamente para buildImplementationPrompt

---

## TASK-011: Integrar failure-analyzer.ts ao TDDLoopController

**Fase:** B (Paralela)
**Tipo:** feature
**Prioridade:** P0
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/tdd-integrator.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/failure-analyzer.ts` - `parseTestFailure`, `isRetryableFailure`, `serializeFailureContext`
- `src/execution/tdd/types.ts`

**Contratos de saida:**
- Falhas processadas antes de alimentar ImplementationGenerator
- Contexto cirurgico pasado ao LLM

**Criterios de conclusao:**
- [ ] Executa parseTestFailure no output do teste
- [ ] isRetryableFailure usado para decidir retry
- [ ] serializeFailureContext passado ao LLM

---

## TASK-012: Integrar coverage-tracker.ts ao TDDLoopController

**Fase:** B (Paralela)
**Tipo:** feature
**Prioridade:** P1
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/tdd-integrator.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/coverage-tracker.ts` - `verifyTestCoverage`, `DEFAULT_THRESHOLDS`

**Contratos de saida:**
- Coverage validado apos GREEN
- Resultado de coverage disponivel no TDDRunResult

**Criterios de conclusao:**
- [ ] verifyTestCoverage executado apos GREEN
- [ ] Thresholds configuraveis
- [ ] Coverage report incluido no resultado

---

## TASK-013: Integrar regression-guard.ts ao TDDLoopController

**Fase:** B (Paralela)
**Tipo:** feature
**Prioridade:** P1
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/tdd-integrator.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/regression-guard.ts` - `RegressionGuard`, `RegressionReport`

**Contratos de saida:**
- Suite completa executada apos COMPLETED
- Report de regressao disponivel

**Criterios de conclusao:**
- [ ] RegressionGuard.validateAfterTaskCompletion executado
- [ ] Report incluido no resultado
- [ ] Recomendacao de regressao exposta

---

## TASK-014: Modificar TDDCoordinator para delegar ao LoopController

**Fase:** B (Paralela)
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** L (~45 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/orchestration/tdd-coordinator.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/tdd-integrator.ts`
- `src/execution/tdd/types.ts`

**Contratos de saida:**
- TDDCoordinator cria TDDLoopController via TDDIntegrator
- Mantem eventos existentes (tdd:task:started, etc)
- Mantem interfaces publicas

**Criterios de conclusao:**
- [ ] processTask delega 100% ao LoopController
- [ ] Eventos mantidos
- [ ] Callbacks (onTaskStart, onTaskComplete, onTaskFail) mantidos
- [ ] API publica inalterada
- [ ] Build compila sem erros
- [ ] Testes existentes passam

---

## TASK-015: Atualizar exports em index.ts

**Fase:** B (Paralela)
**Tipo:** config
**Prioridade:** P0
**Estimativa:** S (~10 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `src/execution/tdd/index.ts` (modificar)

**Contratos de entrada:**
- `src/execution/tdd/types.ts`
- `src/execution/tdd/tdd-integrator.ts`

**Contratos de saida:**
- Exports atualizados com novos modulos

**Criterios de conclusao:**
- [ ] Exporta TDDTestResult e tipos de types.ts
- [ ] Exporta TDDIntegrator
- [ ] Build compila

---

## TASK-020: Executar build TypeScript

**Fase:** C (Serializada)
**Tipo:** validation
**Prioridade:** P0
**Estimativa:** S (~2 min)

**Arquivos sob propriedade (OWNERSHIP):**
- Nenhum (apenas validacao)

**Contratos de entrada:**
- Todos os arquivos modificados

**Criterios de conclusao:**
- [ ] tsc --noEmit passa
- [ ] 0 erros TypeScript

---

## TASK-021: Executar testes unitarios

**Fase:** C (Serializada)
**Tipo:** validation
**Prioridade:** P0
**Estimativa:** S (~2 min)

**Arquivos sob propriedade (OWNERSHIP):**
- Nenhum (apenas validacao)

**Criterios de conclusao:**
- [ ] npm test passa
- [ ] Testes existentes nao quebraram

---

## TASK-022: Criar teste de integracao do fluxo

**Fase:** C (Serializada)
**Tipo:** test
**Prioridade:** P1
**Estimativa:** M (~30 min)

**Arquivos sob propriedade (OWNERSHIP):**
- `tests/unit/tdd-integration.test.ts` (criar)

**Contratos de entrada:**
- `src/execution/tdd/tdd-integrator.ts`
- `src/execution/tdd/types.ts`

**Criterios de conclusao:**
- [ ] Teste cria TDDIntegrator com todas as opcoes
- [ ] Teste executa runTask com mock
- [ ] Teste verifica que prompts foram chamados
- [ ] Teste verifica que failure-analyzer foi chamado

---

## Mapa de Execucao Visual

### Fase A - Contratos (Sequencial, 1 terminal)

```
TASK-001 (20min) ──► TASK-002 (20min) ──► TASK-003 (30min)
                         │
                    (importa types)
                                        │
                                        ▼
                        Tempo estimado: ~70 min
```

### Fase B - Implementacao (Paralela, 4 terminais)

```
┌─────────────────────────────────────────────────────────────┐
│  Rodada 1 (sem dependencias entre si):                     │
│                                                             │
│  Terminal 1: TASK-010 prompts        [M ~30min]            │
│  Terminal 2: TASK-011 failure-analyzer [M ~30min]          │
│  Terminal 3: TASK-012 coverage-tracker [M ~30min]          │
│  Terminal 4: TASK-013 regression-guard [M ~30min]          │
│                                                             │
│  Tempo da rodada: ~30 min (maior task)                     │
├─────────────────────────────────────────────────────────────┤
│  Rodada 2 (depende da Rodada 1):                           │
│                                                             │
│  Terminal 1: TASK-014 coordinator   [L ~45min]             │
│  Terminal 2: TASK-015 exports      [S ~10min]              │
│                                                             │
│  Tempo da rodada: ~45 min                                   │
└─────────────────────────────────────────────────────────────┘
```

### Fase C - Validacao (Sequencial, 1 terminal)

```
TASK-020 (2min) ──► TASK-021 (2min) ──► TASK-022 (30min)
                           │
                    (build OK)
                                         │
                                         ▼
                         Tempo estimado: ~34 min
```

### Tempo total estimado: ~70 + 75 + 34 = ~179 min (~3 horas)
### Paralelismo efetivo: 4 terminais na Fase B
### Speedup vs sequencial: ~2.5x
