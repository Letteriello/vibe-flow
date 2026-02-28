# Branch Map: Integracao TDD

## Estrutura de Branches

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-001 | task/tdd-types | master | integration/tdd |
| TASK-002 | task/tdd-types | task/tdd-types | integration/tdd |
| TASK-003 | task/tdd-types | task/tdd-types | integration/tdd |
| TASK-010 | task/tdd-integration-prompts | integration/tdd | integration/tdd |
| TASK-011 | task/tdd-integration-failure | integration/tdd | integration/tdd |
| TASK-012 | task/tdd-integration-coverage | integration/tdd | integration/tdd |
| TASK-013 | task/tdd-integration-regression | integration/tdd | integration/tdd |
| TASK-014 | task/tdd-coordinator-delegation | integration/tdd | integration/tdd |
| TASK-015 | task/tdd-exports | integration/tdd | integration/tdd |
| TASK-020 | task/tdd-build-validate | integration/tdd | integration/tdd |
| TASK-021 | task/tdd-test-validate | integration/tdd | integration/tdd |
| TASK-022 | task/tdd-integration-test | integration/tdd | integration/tdd |

## Fluxo de Merge

```
master
  │
  ├── task/tdd-types ─────────────┐
  │                               │
  ├── task/tdd-integration-prompts ─┤
  ├── task/tdd-integration-failure ──┤
  ├── task/tdd-integration-coverage ──│──► integration/tdd ──► master
  ├── task/tdd-integration-regression ┤
  ├── task/tdd-coordinator-delegation  │
  ├── task/tdd-exports                 │
  ├── task/tdd-build-validate          │
  ├── task/tdd-test-validate          │
  └── task/tdd-integration-test ───────┘
```

## Integracao Final

1. Criar branch `integration/tdd` a partir de `master`
2. Merge de todas as tasks da Fase B
3. Validacao na Fase C
4. PR de `integration/tdd` para `master`
