# Execution Map: Context Management Lifecycle

## Fase A — Contratos (Sequencial)

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE A: Contratos                                             │
│                                                                 │
│  [TASK-000] Interfaces Archive Lifecycle Manager                │
│     │                                                          │
│     ▼                                                          │
│  [TASK-001] Unificar compression.ts                            │
│     │                                                          │
│     ▼                                                          │
│  [TASK-002] Unificar compaction.ts                            │
│     │                                                          │
│     ▼                                                          │
│  [TASK-003] Unificar file-pointers.ts                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Fase B — Implementação (Paralela)

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE B: Implementação                                         │
│                                                                 │
│  [TASK-100] Archive Lifecycle Manager           [M ~45min]     │
│       │                                                        │
│       ├────────────────────────────────────┐                   │
│       │                                    │                   │
│       ▼                                    ▼                   │
│  [TASK-101] DAG Persistence      [TASK-103] WorkerPool         │
│       │                                    Factory              │
│       │                                                        │
│       │                                    │                   │
│       ▼                                    │                   │
│  [TASK-102] Pointer Guard ◄────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Fase C — Integração (Sequencial)

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE C: Integração                                             │
│                                                                 │
│  [TASK-INT-001] Integrar Archive Lifecycle                     │
│       │                                                        │
│       ▼                                                        │
│  [TASK-INT-002] Validar token estimation unificada            │
│       │                                                        │
│       ▼                                                        │
│  [TASK-INT-003] Validar Pipeline (build + tests)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Branch Map

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-000 | task/context-000-archive-interfaces | main | main |
| TASK-001 | task/context-001-compression-unify | main | main |
| TASK-002 | task/context-002-compaction-unify | main | main |
| TASK-003 | task/context-003-filepointers-unify | main | main |
| TASK-100 | task/context-100-archive-lifecycle | main (após TASK-000) | main |
| TASK-101 | task/context-101-dag-persistence | main (após TASK-000) | main |
| TASK-102 | task/context-102-pointer-guard | main (após TASK-000) | main |
| TASK-103 | task/context-103-workerpool-factory | main | main |
| TASK-INT | integration/context-lifecycle | main (após tasks acima) | main |

## Dependências entre Tasks

```
TASK-000 (P0) ──┬──► TASK-100 ──► TASK-INT-001 ──► TASK-INT-003
                ├──► TASK-101 ──► TASK-INT-002 ──► TASK-INT-003
                ├──► TASK-102 ──► TASK-INT-002 ──► TASK-INT-003
                └──► TASK-103 ──► TASK-INT-002 ──► TASK-INT-003

TASK-001 ──┐
TASK-002 ──┼──► TASK-INT-002 ──► TASK-INT-003
TASK-003 ──┘
```

## Arquivos Planejados (Novos)

| Arquivo | Descrição | Task |
|---------|-----------|------|
| `src/context/archive-lifecycle.ts` | Sistema de limpeza de archives | TASK-100 |
| `src/context/archive-lifecycle.test.ts` | Testes do lifecycle manager | TASK-100 |
| `src/context/pointer-guard.ts` | Semaphore para expansão de pointers | TASK-102 |
| `src/context/pointer-guard.test.ts` | Testes do guard | TASK-102 |

## Arquivos Modificados

| Arquivo | Modificação | Task |
|---------|-------------|------|
| `src/context/compression.ts` | Usa token-estimation.ts | TASK-001 |
| `src/context/compaction.ts` | Usa token-estimation.ts | TASK-002 |
| `src/context/file-pointers.ts` | Usa token-estimation.ts | TASK-003 |
| `src/context/dag-summary.ts` | Adiciona persistência | TASK-101 |
| `src/context/context-manager.ts` | Integra lifecycle | TASK-INT-001 |
| `src/context/worker-pool.ts` | Remove singleton | TASK-103 |
| `src/context/index.ts` | Exports atualizados | todas |
