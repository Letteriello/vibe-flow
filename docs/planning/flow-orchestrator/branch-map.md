# Branch Map: Flow Orchestrator

## Visão Geral

Este documento define a estratégia de branches para implementação do Flow Orchestrator.

## Estrutura de Branches

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-A-001 | task/flow-types | main | task/flow-contracts |
| TASK-A-002 | task/flow-config | task/flow-contracts | task/flow-contracts |
| TASK-A-003 | task/flow-structure | task/flow-contracts | task/flow-contracts |
| TASK-A-004 | task/flow-qa-block | main | task/flow-integration |
| TASK-A-005 | task/flow-security-qa | main | task/flow-integration |

## Fase B - Implementação

### Rodada 1: Core Services

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-B-001 | task/flow-pipeline-manager | task/flow-contracts | task/flow-core |
| TASK-B-002 | task/flow-work-units | task/flow-pipeline-manager | task/flow-core |
| TASK-B-003 | task/flow-merge-analyze | task/flow-work-units | task/flow-core |
| TASK-B-004 | task/flow-merge-plan | task/flow-merge-analyze | task/flow-core |
| TASK-B-005 | task/flow-merge-dev-qa | task/flow-merge-plan | task/flow-core |
| TASK-B-006 | task/flow-worker-lifecycle | task/flow-work-units | task/flow-core |
| TASK-B-007 | task/flow-worker-process | task/flow-worker-lifecycle | task/flow-core |
| TASK-B-008 | task/flow-orch-init | task/flow-merge-dev-qa | task/flow-core |
| TASK-B-009 | task/flow-orch-workers | task/flow-orch-init | task/flow-core |

### Rodada 2: CLI Commands

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-B-010 | task/flow-cli-full | task/flow-core | task/flow-cli |
| TASK-B-011 | task/flow-cli-worker | task/flow-core | task/flow-cli |
| TASK-B-012 | task/flow-cli-status | task/flow-core | task/flow-cli |
| TASK-B-013 | task/flow-cli-analyze | task/flow-cli-full | task/flow-cli |
| TASK-B-014 | task/flow-cli-plan | task/flow-cli-full | task/flow-cli |
| TASK-B-015 | task/flow-cli-dev | task/flow-cli-worker | task/flow-cli |
| TASK-B-016 | task/flow-cli-qa | task/flow-cli-status | task/flow-cli |
| TASK-B-017 | task/flow-cli-fix | task/flow-cli-worker | task/flow-cli |
| TASK-B-018 | task/flow-cli-register | task/flow-cli | task/flow-integration |

## Fase C - Integração

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-C-001 | task/flow-build-validate | task/flow-integration | main |
| TASK-C-002 | task/flow-unit-tests | task/flow-build-validate | main |
| TASK-C-003 | task/flow-e2e-full | task/flow-unit-tests | main |
| TASK-C-004 | task/flow-e2e-parallel | task/flow-e2e-full | main |
| TASK-C-005 | task/flow-qa-block-test | task/flow-build-validate | main |
| TASK-C-006 | task/flow-docs-update | task/flow-e2e-parallel | main |

## Fluxo de Integração

```
main
  │
  ├── task/flow-contracts (TASK-A-001, A-002, A-003)
  │       │
  │       └── task/flow-core (TASK-B-001 a B-009)
  │               │
  │               └── task/flow-cli (TASK-B-010 a B-017)
  │                       │
  │                       └── task/flow-integration (B-018, A-004, A-005)
  │
  └── task/flow-integration (TASK-A-004, A-005)
          │
          └── main (TASK-C-001 a C-006)
```

## Estratégia de Merge

1. **Fase A**: Trabalhar em task/flow-contracts, merge para main quando completa
2. **Fase B**:
   - Rodada 1: Trabalhar em task/flow-core, merge para main
   - Rodada 2: Trabalhar em task/flow-cli, merge para main
3. **Fase C**: Trabalhar em task/flow-integration, merge para main

## Nomenclatura de Branches

- `task/flow-*` - Feature branches
- `feature/*` - Features completas prontas para review
- `main` - Branch principal com código testado

## Notas

- TASK-A-004 e TASK-A-005 podem ser desenvolvidas em paralelo com a Fase B
- Branches de CLI (B-010 a B-017) podem ter dependências cíclicas - resolver via merge order
- TASK-C-* são tasks de validação - podem ser executadas em paralelo com outras branches de integração
