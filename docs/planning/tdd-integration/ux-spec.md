# UX Spec: Integracao TDD

## Meta
- **PRD vinculado:** docs/planning/tdd-integration/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28

## 1. Fluxo de Integracao

### Fluxo Principal (Apos Integracao)

```
[TaskIngestor]
       │
       ▼
[TDDCoordinator]
       │
       │ (delega)
       ▼
[TDDLoopController]
       │
       ├─► [prompts.ts] ──► contexto para LLM
       │
       ├─► [TestRunner] ──► executa teste
       │
       ├─► [failure-analyzer.ts] ──► processa falha
       │
       ├─► [coverage-tracker.ts] (apos GREEN)
       │
       └─► [regression-guard.ts] (apos COMPLETED)

```

## 2. Mudancas de Interface

### 2.1 TDDLoopController

**Entrada:**
- `taskDescription: string` - descricao da tarefa

**Processamento interno:**
1. Usa `buildTestGenerationPrompt(task)` para contexto RED
2. Usa `buildImplementationPrompt(task, testCode, errors)` para contexto GREEN
3. Aplica `parseTestFailure(output)` para processar falhas
4. Aplica `isRetryableFailure()` para decidir retry
5. Aplica `verifyTestCoverage()` apos GREEN
6. Aplica `RegressionGuard.validateAfterTaskCompletion()` apos COMPLETED

**Saida:**
- `TDDRunResult` com iteracoes, duracao, fase final

### 2.2 TDDCoordinator (Delegacao)

**Mudanca:** Ao inves de executar RED/GREEN diretamente, cria `TDDLoopController` e chama `runTask()`.

**Antes:**
```
executeRedPhase() → TesterAgent → runTest()
executeGreenPhase() → CoderAgent → runTest()
```

**Depois:**
```
loopController = createTDDLoopController({...})
result = await loopController.runTask(task.description)
```

### 2.3 Contratos de Interface

#### TestResult Unificado (novo tipo em types.ts)

```typescript
interface TDDTestResult {
  success: boolean;
  output: string;
  duration: number;
  error?: string;
  failedTests?: string[];
}
```

#### IntegrationConfig (extensao do TDDLoopConfig)

```typescript
interface TDDLoopConfig {
  // ... existentes
  usePrompts?: boolean;           // NEW: usar prompts.ts
  useFailureAnalyzer?: boolean;   // NEW: usar failure-analyzer.ts
  coveragePath?: string;          // NEW: path para coverage.json
  coverageThresholds?: CoverageThresholds;
  enableRegressionGuard?: boolean;
  regressionConfig?: RegressionGuardConfig;
}
```

## 3. Mapa de Navegacao (Fluxo de Dados)

```
┌─────────────────────────────────────────────────────────────────┐
│                        TaskIngestor                             │
│                   (fila de tarefas TDD)                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TDDCoordinator                              │
│  - Consome TaskIngestor                                         │
│  - Cria TDDLoopController                                       │
│  - Delegacao: loopController.runTask()                         │
│  - Mantem eventos (tdd:task:started, etc)                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ (delegation)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TDDLoopController                            │
│                                                                  │
│  [RED PHASE]                                                    │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ TestGenerator│───►│ prompts.ts   │───►│ buildTestPrompt  │  │
│  │             │    │              │    │ (TDDTask)        │  │
│  └─────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ TestRunner  │───►│ failure-     │───►│ parseTestFailure │  │
│  │             │    │ analyzer.ts  │    │ + isRetryable    │  │
│  └─────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
│  [GREEN PHASE]                                                  │
│  ┌─────────────────┐    ┌────────────────┐                    │
│  │ Implementation  │───►│ prompts.ts     │                    │
│  │ Generator      │    │ buildImplPrompt│                    │
│  └─────────────────┘    └────────────────┘                    │
│                                                                  │
│  [POST-GREEN]                                                   │
│  ┌─────────────────┐    ┌────────────────┐                    │
│  │ TestRunner      │───►│ coverage-      │                    │
│  │ (same test)     │    │ tracker.ts     │                    │
│  └─────────────────┘    └────────────────┘                    │
│                                                                  │
│  [POST-COMPLETED]                                               │
│  ┌─────────────────┐    ┌────────────────┐                    │
│  │ RegressionGuard│───►│ validateAfter  │                    │
│  │                │    │ TaskCompletion  │                    │
│  └─────────────────┘    └────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Estados do Fluxo

| Fase | Modulo Responsavel | Acoes |
|------|-------------------|-------|
| IDLE | TDDCoordinator | Consome tarefa do TaskIngestor |
| RED | TDDLoopController | Gera teste via prompts.ts + TestGenerator |
| GREEN | TDDLoopController | Gera implementacao via prompts.ts + ImplementationGenerator |
| POST-GREEN | TDDLoopController | Valida cobertura via coverage-tracker.ts |
| COMPLETED | TDDLoopController | Valida regressao via regression-guard.ts |

## 5. Design Tokens e Convencoes

- Arquivos modificados devem seguir convencoes existentes:
  - `src/execution/tdd/types.ts` - novo arquivo para tipos canonicos
  - Interfaces com prefixo `TDD` para evitar conflitos (ex: `TDTestResult`)
  - Funcoes de factory com prefixo `create` (ex: `createTDDLoopController`)
- Manter retrocompatibilidade total com API publica do TDDCoordinator

## 6. Acessibilidade

N/A - Esta task e de integracao de codigo, sem impacto em UI/UX.
