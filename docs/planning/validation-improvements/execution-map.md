# Execution Map: Validation Improvements

## Fase A — Contratos (Sequencial)

```
┌─────────────────────────────────────────────────────────┐
│  TASK-000: semantic-types.ts                            │
│  TASK-001: drift-types.ts                               │
│  TASK-002: fallback-policy-types.ts                     │
│                                                         │
│  Saída → Contratos para Fase B                         │
└─────────────────────────────────────────────────────────┘
```

## Fase B — Implementação (Paralela)

```
┌─────────────────────────────────────────────────────────┐
│  Rodada 1 (independentes):                              │
│                                                         │
│  [TASK-100] SemanticCrossRuleValidator                 │
│  [TASK-101] EnhancedDriftDetector                      │
│  [TASK-102] FallbackPolicy                             │
│  [TASK-103] EnhancedAgentRouter                        │
│  [TASK-104] ClaudeCodeDriver Real                      │
│  [TASK-105] CodexDriver Real                           │
│                                                         │
│  Todas produzem → Ready for integration                │
└─────────────────────────────────────────────────────────┘
```

## Fase C — Integração (Sequencial)

```
┌─────────────────────────────────────────────────────────┐
│  TASK-INT-001: validation/index.ts exports             │
│         ↓                                              │
│  TASK-INT-002: drivers/index.ts exports                │
│         ↓                                              │
│  TASK-INT-003: cross-rule.ts + semantic               │
│         ↓                                              │
│  TASK-INT-004: drift-detector.ts + enhanced           │
│         ↓                                              │
│  TASK-INT-005: router.ts + enhanced                   │
│         ↓                                              │
│  TASK-INT-006: Integration tests                       │
│                                                         │
│  Saída → Módulos validados e integrados               │
└─────────────────────────────────────────────────────────┘
```

## Dependency Graph

```
TASK-000 ──┬──→ TASK-100 ──┬──→ TASK-INT-003
TASK-001 ──┤               │
           │               └──→ TASK-INT-004
TASK-002 ──┼──→ TASK-102 ──┬──→ TASK-103 ──→ TASK-INT-005
           │               │
           ├──→ TASK-104 ──┤
           │               │
           └──→ TASK-105 ──┘
                      │
                      └──→ TASK-INT-002

TASK-INT-001 ──→ TASK-INT-006 (final)
TASK-INT-005 ──↗
```

## Parallel Execution Matrix

| Task | Dependencies | Can Run In Parallel With |
|------|-------------|------------------------|
| TASK-100 | TASK-000 | TASK-101, TASK-102, TASK-103, TASK-104, TASK-105 |
| TASK-101 | TASK-001 | TASK-100, TASK-102, TASK-103, TASK-104, TASK-105 |
| TASK-102 | TASK-002 | TASK-100, TASK-101, TASK-103, TASK-104, TASK-105 |
| TASK-103 | TASK-102 | TASK-100, TASK-101, TASK-102, TASK-104, TASK-105 |
| TASK-104 | TASK-002 | TASK-100, TASK-101, TASK-102, TASK-103, TASK-105 |
| TASK-105 | TASK-002 | TASK-100, TASK-101, TASK-102, TASK-103, TASK-104 |

## Execution Time Estimate

- Fase A: 3 tasks × 15-20min = ~50 min (sequencial)
- Fase B: 6 tasks × 45min = ~45 min (paralelo, 6 terminais)
- Fase C: 6 tasks × 15min = ~95 min (sequencial)

**Total:** ~190 min (~3h10) vs ~380 min (sequencial) = **2x speedup**
