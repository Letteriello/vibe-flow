# Execution Map: Integracao TDD

## Resumo de Execucao

### Fase A - Contratos (Sequencial, 1 terminal)

| Task | Nome | Tempo Est. |
|------|------|-----------|
| TASK-001 | Criar TDDTypes | ~20 min |
| TASK-002 | Atualizar loop-controller.ts | ~20 min |
| TASK-003 | Criar TDDIntegrator | ~30 min |

**Tempo Fase A:** ~70 min

### Fase B - Implementacao (Paralela, ate 4 terminais)

| Task | Nome | Tempo Est. | Terminal |
|------|------|-----------|----------|
| TASK-010 | Integrar prompts.ts | ~30 min | 1 |
| TASK-011 | Integrar failure-analyzer.ts | ~30 min | 2 |
| TASK-012 | Integrar coverage-tracker.ts | ~30 min | 3 |
| TASK-013 | Integrar regression-guard.ts | ~30 min | 4 |
| TASK-014 | Delegar TDDCoordinator | ~45 min | 1 |
| TASK-015 | Atualizar exports | ~10 min | 2 |

**Tempo Fase B:** ~75 min (paralelo) vs ~180 min (sequencial)

### Fase C - Validacao (Sequencial, 1 terminal)

| Task | Nome | Tempo Est. |
|------|------|-----------|
| TASK-020 | Build TypeScript | ~2 min |
| TASK-021 | Testes unitarios | ~2 min |
| TASK-022 | Teste integracao | ~30 min |

**Tempo Fase C:** ~34 min

---

## Tempo Total

| Modo | Tempo |
|------|-------|
| Sequencial | ~284 min (~4.7h) |
| Com paralelismo | ~179 min (~3h) |
| **Speedup** | **~1.6x** |

---

## Dependencias Entre Tasks

```
TASK-001 ──┬──► TASK-002 ──► TASK-003 ──┬──► TASK-010
           │                            │
           │                            ├──► TASK-011
           │                            │
           │                            ├──► TASK-012
           │                            │
           │                            ├──► TASK-013
           │                            │
           └──► (independente)         │
                                        ├──► TASK-014 ──► TASK-015 ──► TASK-020 ──► TASK-021 ──► TASK-022
```

---

## Arquivos a Modificar

| Arquivo | Tasks | Acao |
|---------|-------|------|
| `src/execution/tdd/types.ts` | TASK-001 | Criar |
| `src/execution/tdd/loop-controller.ts` | TASK-002 | Modificar |
| `src/execution/tdd/tdd-integrator.ts` | TASK-003, TASK-010, TASK-011, TASK-012, TASK-013 | Criar/Modificar |
| `src/execution/orchestration/tdd-coordinator.ts` | TASK-014 | Modificar |
| `src/execution/tdd/index.ts` | TASK-015 | Modificar |
| `tests/unit/tdd-integration.test.ts` | TASK-022 | Criar |

---

## Proximos Passos

1. **Fase A (1 terminal):** Executar TASK-001 -> TASK-002 -> TASK-003
2. **Fase B (4 terminais):**
   - Terminal 1: TASK-010 -> TASK-014
   - Terminal 2: TASK-011 -> TASK-015
   - Terminal 3: TASK-012
   - Terminal 4: TASK-013
3. **Fase C (1 terminal):** TASK-020 -> TASK-021 -> TASK-022
