# Contracts: Flow Orchestrator

## Tipos Principais (TASK-A-001)

### Pipeline State

```typescript
export type PipelineStatus = 'initialized' | 'running' | 'paused' | 'complete' | 'failed';
export type Phase = 'analyze' | 'plan' | 'dev' | 'qa' | 'wrap-up';
export type PhaseStatus = 'pending' | 'ready' | 'in_progress' | 'done' | 'blocked_by';

export interface PipelineState {
  pipeline_id: string;
  created_at: string;
  objective: string;
  current_phase: Phase;
  status: PipelineStatus;
  previous_pipeline?: string;
  previous_status?: PipelineStatus;
  phases: {
    [key in Phase]: PhaseState;
  };
  workers: Record<string, Worker>;
  circuit_breakers: Record<string, CircuitBreaker>;
  config: PipelineConfig;
  features: Feature[];
}
```

### Work Unit

```typescript
export type WorkUnitStatus = 'pending' | 'claimed' | 'working' | 'done' | 'failed' | 'blocked';
export type WorkUnitType = 'analyze' | 'plan-prd' | 'plan-ux' | 'plan-tasks' | 'dev' | 'qa' | 'merge';

export interface WorkUnit {
  id: string;
  type: WorkUnitType;
  phase: Phase;
  scope: string;
  description: string;
  feature?: string;
  work_status: WorkUnitStatus;
  worker: string | null;
  output: string | null;
  dependencies: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}
```

### Worker

```typescript
export type WorkerStatus = 'idle' | 'working' | 'paused' | 'dead';

export interface Worker {
  worker_id: string;
  status: WorkerStatus;
  current_unit: string | null;
  current_phase: Phase | null;
  owned_files: string[];
  started_at: string;
  last_heartbeat: string;
  completed_units: string[];
  total_units_completed: number;
  circuit_breaks: number;
}
```

### Config

```typescript
export interface PipelineConfig {
  max_retries_per_unit: number;
  heartbeat_timeout_minutes: number;
  auto_advance_phases: boolean;
  streaming_enabled: boolean;
  max_concurrent_workers: number;
}

export interface WorkerConfig {
  workerId: string;
  phase?: Phase;
  streaming: boolean;
  pollIntervalMs: number;
}
```

### Merge Result

```typescript
export interface MergeResult {
  phase: Phase;
  success: boolean;
  output_path: string;
  conflicts: Conflict[];
  stats: {
    units_processed: number;
    duration_ms: number;
  };
}

export interface Conflict {
  type: 'ownership' | 'dependency' | 'naming';
  severity: 'error' | 'warning';
  description: string;
  affected_units: string[];
  files: string[];
}

export interface Resolution {
  conflict_id: string;
  resolution: 'auto' | 'manual';
  action: string;
  assigned_to: string;
}
```

### Pipeline Report

```typescript
export interface PipelineReport {
  pipeline_id: string;
  objective: string;
  status: PipelineStatus;
  verdict: 'approved' | 'failed' | 'warnings';
  metrics: {
    total_duration_ms: number;
    total_work_units: number;
    completed_work_units: number;
    failed_work_units: number;
    workers_used: number;
    peak_concurrent_workers: number;
    speedup_factor: number;
  };
  phases: {
    [key in Phase]: PhaseReport;
  };
  incidents: {
    circuit_breaks: number;
    conflicts: number;
    retries: number;
  };
  next_step: string;
}
```

---

## Contratos de Entrada/Saída

### PipelineManager

| Método | Entrada | Saída |
|--------|---------|-------|
| `loadState()` | - | `Promise<PipelineState>` |
| `saveState(state)` | `PipelineState` | `Promise<void>` |
| `createPipeline(objective)` | `string` | `Promise<PipelineState>` |
| `getNextWorkUnit(phase?)` | `Phase?` | `Promise<WorkUnit \| null>` |
| `claimWorkUnit(workerId, unitId)` | `string, string` | `Promise<boolean>` |
| `updateWorkUnit(unitId, updates)` | `string, Partial<WorkUnit>` | `Promise<void>` |

### FlowWorker

| Método | Entrada | Saída |
|--------|---------|-------|
| `constructor(workerId)` | `string` | `FlowWorker` |
| `start()` | - | `Promise<void>` |
| `stop()` | - | `Promise<void>` |
| `processWorkUnit(unit)` | `WorkUnit` | `Promise<WorkResult>` |

### FlowOrchestrator

| Método | Entrada | Saída |
|--------|---------|-------|
| `initialize(objective)` | `string` | `Promise<PipelineState>` |
| `startWorkers(options)` | `WorkerOptions` | `Promise<void>` |
| `pause()` | - | `Promise<void>` |
| `resume()` | - | `Promise<void>` |
| `abort()` | - | `Promise<void>` |
| `getReport()` | - | `Promise<PipelineReport>` |

### MergeGate

| Método | Entrada | Saída |
|--------|---------|-------|
| `mergeAnalyze()` | - | `Promise<MergeResult>` |
| `mergePlan()` | - | `Promise<MergeResult>` |
| `mergeDev()` | - | `Promise<MergeResult>` |
| `mergeQA()` | - | `Promise<MergeResult>` |
| `detectConflicts(units)` | `WorkUnit[]` | `Conflict[]` |

---

## Contratos de Integração

### WrapUpHandler Integration (TASK-A-004)

```typescript
// Novo método no WrapUpHandler
async checkQAApproval(): Promise<{
  approved: boolean;
  verdict: 'approved' | 'failed' | 'warnings';
  blockers: string[];
  lastQAReport: string;
}>
```

### QaHandler Integration (TASK-A-005)

```typescript
// Nova opção no QAConfig
interface QAConfig {
  // ...existing
  includeSecurity: boolean;
  securitySeverityThreshold: 'critical' | 'high' | 'medium';
}
```

---

## Constantes

```typescript
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  max_retries_per_unit: 3,
  heartbeat_timeout_minutes: 30,
  auto_advance_phases: true,
  streaming_enabled: false, // Default off
  max_concurrent_workers: 8
};

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  workerId: generateWorkerId(),
  phase: undefined, // Any phase
  streaming: false,
  pollIntervalMs: 5000
};
```
