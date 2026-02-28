# UX Spec: Flow Orchestrator

## Meta
- **PRD vinculado:** docs/planning/flow-orchestrator/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28

---

## 1. Interfaces de Comando CLI

### 1.1 `/flow full <objective>`

**Descrição:** Inicia pipeline completo com todas as fases

**Uso:**
```bash
vibe-flow flow full "Implementar sistema de autenticação"
```

**Fluxo:**
1. Parser extrai objetivo do usuário
2. Cria diretórios `docs/flow/{analyze,plan,dev,qa}`
3. Gera `pipeline.json` com work units de análise
4. Inicia primeiro worker (loop blocking)

**Output:**
```
⚡ Starting pipeline: flow-20260228-XXXXXX
Objective: Implementar sistema de autenticação

✅ Pipeline initialized
📊 Run `vibe-flow flow` (no arguments) in each terminal to start workers

Or use streaming mode:
  Terminal 1: vibe-flow flow worker --phase analyze
  Terminal 2: vibe-flow flow worker --phase plan
```

### 1.2 `/flow worker`

**Descrição:** Inicia worker universal que processa work units

**Uso:**
```bash
# Modo padrão - pega qualquer work unit disponível
vibe-flow flow worker

# Modo fase específica
vibe-flow flow worker --phase analyze
vibe-flow flow worker --phase plan

# Modo streaming
vibe-flow flow worker --streaming
```

**Fluxo:**
1. Lê `pipeline.json`
2. Identifica próxima work unit disponível (status: pending, dependências satisfeitas)
3. Faz claim atômico
4. Executa work unit
5. Atualiza status para done
6. Repete

**Output por work unit:**
```
[Worker-001] Claimed ANA-001 (frontend)
[Worker-001] Processing...
[Worker-001] ✅ Completed ANA-001 (3min)
[Worker-001] Claimed ANA-002 (backend)
...
```

### 1.3 `/flow status`

**Descrição:** Exibe estado atual do pipeline

**Uso:**
```bash
vibe-flow flow status
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                  ⚡ FLOW PIPELINE STATUS                      ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Pipeline: flow-20260228-143022                              ║
║  Objetivo: Implementar sistema de autenticação              ║
║                                                               ║
║  ┌─ 🔬 ANALYZE ─────────────────────────────────────────┐    ║
║  │  ANA-001 frontend    ✅ done (worker-001)  3min      │    ║
║  │  ANA-002 backend     ✅ done (worker-002)  4min      │    ║
║  │  ANA-003 database    🔄 working (worker-003)         │    ║
║  │  ANA-004 infra       ⏳ pending                       │    ║
║  │  MERGE               ⏳ waiting (3/5 done)            │    ║
║  └───────────────────────────────────────────────────────┘    ║
║                            ↓                                  ║
║  ┌─ 🎯 PLAN ────────────────────────────────────────────┐    ║
║  │  blocked_by: analyze (streaming: 2/5 ready)          │    ║
║  └───────────────────────────────────────────────────────┘    ║
║                            ↓                                  ║
║  ┌─ 🛠️  DEV ─────────────────────────────────────────────┐    ║
║  │  blocked_by: plan                                     │    ║
║  └───────────────────────────────────────────────────────┘    ║
║                            ↓                                  ║
║  ┌─ 🧪 QA ──────────────────────────────────────────────┐    ║
║  │  blocked_by: dev                                      │    ║
║  └───────────────────────────────────────────────────────┘    ║
║                                                               ║
║  👷 Workers ativos: 3                                         ║
║  ⏱️  Tempo decorrido: 7min                                    ║
║  📊 Work units: 2/5 done (analyze)                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### 1.4 `/flow analyze`

**Descrição:** Executa apenas fase de análise

**Uso:**
```bash
vibe-flow flow analyze
```

### 1.5 `/flow plan`

**Descrição:** Executa apenas fase de planejamento

**Uso:**
```bash
vibe-flow flow plan "Feature: Login"
```

### 1.6 `/flow dev`

**Descrição:** Entra no loop de desenvolvimento (atalho para worker focado em DEV)

**Uso:**
```bash
vibe-flow flow dev
```

### 1.7 `/flow qa`

**Descrição:** Executa apenas fase de QA

**Uso:**
```bash
vibe-flow flow qa
vibe-flow flow qa --verbose
```

### 1.8 `/flow fix`

**Descrição:** Processa tasks de correção geradas pelo QA

**Uso:**
```bash
vibe-flow flow fix
```

---

## 2. Estados de Work Unit

### Diagrama de Estados

```
[CREATED] → [PENDING] ←→ [CLAIMED] → [WORKING] → [DONE]
                ↑              |              |
                |              ↓              ↓
                |           [FAILED] ←---- [BLOCKED]
                |              |
                └──────────────┘
                     (retry)
```

### Status Values

| Status | Significado |Próximo possível |
|--------|-------------|-----------------|
| `pending` | Disponível para claim | claimed, streaming_ready |
| `claimed` | Work unit reservada | working, failed |
| `working` | Em execução | done, failed, blocked |
| `done` | Concluída | (terminal) |
| `failed` | Falhou | pending (retry), blocked |
| `blocked` | Bloqueada por dependência | pending (quando dependências resolvidas) |

---

## 3. Fluxos de Usuário

### Fluxo 1: Pipeline Completo (Full)

```
┌─────────────────────────────────────────────────────────────────┐
│ Terminal 1 (iniciador)                                          │
├─────────────────────────────────────────────────────────────────┤
│ $ vibe-flow flow full "Criar sistema de login"                │
│                                                                  │
│ ⚡ Starting pipeline: flow-20260228-XXXXXX                       │
│ ✅ pipeline.json created                                        │
│ 👷 Waiting for workers...                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Terminal 2-8 (workers)                                          │
├─────────────────────────────────────────────────────────────────┤
│ $ vibe-flow flow worker                                         │
│                                                                  │
│ [Worker-001] Found 5 pending work units                         │
│ [Worker-001] Claimed ANA-001 (frontend)                        │
│ [Worker-001] Processing...                                      │
│ [Worker-001] ✅ Done (3min)                                     │
│ [Worker-001] Claimed ANA-002 (backend)                         │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo 2: Resume Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ $ vibe-flow flow full                                          │
│                                                                  │
│ ⚠️  Existing pipeline detected: flow-20260227-XXXXXX            │
│ 📊 Status: 3/5 analyze done, 0/9 plan done                     │
│                                                                  │
│ Resume from where you left off? (Y/n)                          │
│                                                                  │
│ Y                                                                 │
│ ✅ Resuming pipeline                                            │
│ 👷 Workers can now connect                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo 3: Wrap-up com QA Block

```
┌─────────────────────────────────────────────────────────────────┐
│ $ vibe-flow wrap-up                                            │
│                                                                  │
│ 🔍 Checking QA status...                                        │
│                                                                  │
│ ❌ WRAP-UP BLOCKED                                              │
│                                                                  │
│ Last QA run: flow-20260227-quality-gates                        │
│ Result: 🔴 REPROVADO                                            │
│                                                                  │
│ Blockers:                                                       │
│   - RF-001 CLI Command: NOT implemented                         │
│   - RF-005 Scoring: NOT implemented                            │
│                                                                  │
│ Run `/flow fix` to address issues, then retry wrap-up            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Design Tokens e Estilos

### Cores (ANSI/Console)

|Token|Valor|Uso|
|-----|-----|---|
| `primary` | cyan | Headers, status |
| `success` | green | Done, passed |
| `warning` | yellow | Warnings, pending |
| `error` | red | Failed, blocked |
| `info` | gray | Timestamps, metadata |

### Símbolos de Status

|Símbolo|Status|
|-------|------|
| ✅ | Done, passed |
| 🔄 | Working |
| ⏳ | Pending |
| ❌ | Failed |
| ⛔ | Blocked |

### Estrutura de Tabela (status)

```
╔═══════════════════════════════════════════════════════════╗
║  {phase_header:16} │ {unit_id:12} │ {status:8} │ {time}  ║
╠═══════════════════════════════════════════════════════════╣
║  ANALYZE          │ ANA-001      │ ✅ done   │ 3min    ║
║  ANALYZE          │ ANA-002      │ 🔄 working│ —       ║
```

---

## 5. Arquitetura de Módulos

### 5.1 src/flow/orchestrator.ts

```typescript
export class FlowOrchestrator {
  // Core methods
  async initialize(objective: string): Promise<PipelineState>
  async startWorkers(options: WorkerOptions): Promise<void>
  async waitForCompletion(): Promise<PipelineReport>

  // Control
  async pause(): Promise<void>
  async resume(): Promise<void>
  async abort(): Promise<void>
}
```

### 5.2 src/flow/pipeline-manager.ts

```typescript
export class PipelineManager {
  // State management
  async loadState(): Promise<PipelineState>
  async saveState(state: PipelineState): Promise<void>

  // Work unit operations
  async claimWorkUnit(workerId: string, phase?: string): Promise<WorkUnit | null>
  async updateWorkUnit(unitId: string, updates: WorkUnitUpdate): Promise<void>

  // Merge operations
  async executeMergeGate(phase: string): Promise<MergeResult>
}
```

### 5.3 src/flow/worker.ts

```typescript
export class FlowWorker {
  // Lifecycle
  constructor(workerId: string)
  async start(): Promise<void>
  async stop(): Promise<void>

  // Work processing
  async processWorkUnit(unit: WorkUnit): Promise<WorkResult>

  // Heartbeat
  async sendHeartbeat(): Promise<void>
}
```

### 5.4 src/flow/merge-gate.ts

```typescript
export class MergeGate {
  // Phase-specific mergers
  async mergeAnalyze(): Promise<AnalyzeMergedResult>
  async mergePlan(): Promise<PlanMergedResult>
  async mergeDev(): Promise<DevMergedResult>
  async mergeQA(): Promise<QAMergedResult>

  // Conflict detection
  detectConflicts(units: WorkUnit[]): Conflict[]
  resolveConflict(conflict: Conflict): Resolution
}
```

---

## 6. Estrutura de Arquivos

```
src/flow/
├── index.ts                    # Exports
├── orchestrator.ts             # Main orchestrator class
├── pipeline-manager.ts         # Pipeline.json management
├── worker.ts                   # Worker implementation
├── merge-gate.ts               # Merge gate logic
├── types.ts                    # All interfaces
├── commands/
│   ├── flow.ts                 # CLI command definition
│   ├── full.ts                 # /flow full handler
│   ├── worker.ts               # /flow worker handler
│   ├── status.ts               # /flow status handler
│   ├── analyze.ts              # /flow analyze handler
│   ├── plan.ts                 # /flow plan handler
│   ├── dev.ts                  # /flow dev handler
│   ├── qa.ts                   # /flow qa handler
│   └── fix.ts                  # /flow fix handler
├── config/
│   └── defaults.ts             # Default config values
└── utils/
    ├── formatters.ts           # Console output formatting
    └── validators.ts           # Input validation
```

---

## 7. Casos de Erro

### Caso 1: Pipeline.json corrompido

```
❌ Invalid pipeline.json: Unexpected token
Run `vibe-flow flow init` to create new pipeline
```

### Caso 2: Nenhuma work unit disponível

```
[Worker-001] No work units available
[Worker-001] Waiting for merge gate or new units... (polling 30s)
```

### Caso 3: Merge gate conflito

```
⚠️  CONFLICT DETECTED
Feature A and Feature B both claim ownership of:
  - src/services/AuthService.ts
  - src/types/auth.ts

Resolution: Assign to Feature A
```

### Caso 4: Worker timeout

```
⚠️  Worker-003 (ANA-003) timeout (30min)
Circuit breaker triggered
Reassigning work unit to available worker
```

### Caso 5: QA reprovado

```
❌ QA VERDICT: REPROVADO

Blockers:
  - RF-001: CLI Command NOT implemented
  - RF-005: Scoring NOT implemented

Run `vibe-flow flow fix` to address issues
```
