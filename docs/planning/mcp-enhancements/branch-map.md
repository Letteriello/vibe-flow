# Branch Map: Melhorias nas MCP Tools

| Task | Branch | Base | Merge Target | Depende De |
|------|--------|------|--------------|------------|
| TASK-A-001 | task/mcp-a1-types | master | task/mcp-integration | - |
| TASK-A-002 | task/mcp-a2-health-types | task/mcp-a1-types | task/mcp-integration | TASK-A-001 |
| TASK-A-003 | task/mcp-a3-mocks | task/mcp-a2-health-types | task/mcp-integration | TASK-A-002 |
| TASK-B-001 | task/mcp-b1-real-llm | task/mcp-a3-mocks | task/mcp-integration | TASK-A-003 |
| TASK-B-002 | task/mcp-b2-health-persistence | task/mcp-a3-mocks | task/mcp-integration | TASK-A-003 |
| TASK-B-003 | task/mcp-b3-fallback-update | task/mcp-b2-health-persistence | task/mcp-integration | TASK-B-002 |
| TASK-B-004 | task/mcp-b4-lcm-graceful | task/mcp-a3-mocks | task/mcp-integration | TASK-A-003 |
| TASK-B-005 | task/mcp-b5-remove-dup | task/mcp-a3-mocks | task/mcp-integration | TASK-A-003 |
| TASK-B-006 | task/mcp-b6-health-tool | task/mcp-b3-fallback-update | task/mcp-integration | TASK-B-003 |
| TASK-C-001 | task/mcp-c1-exports | task/mcp-integration | master | All B |
| TASK-C-002 | task/mcp-c2-integration | task/mcp-c1-exports | master | TASK-C-001 |
| TASK-C-003 | task/mcp-c3-build | task/mcp-c2-integration | master | TASK-C-002 |

## Integração Final

1. Criar branch `task/mcp-integration` a partir de `master`
2. Merge todas as tasks A e B
3. Resolver conflitos
4. Criar PR para `master` com todas as mudanças

## Estratégia de Merge

```
        master
          │
    (create task/mcp-integration)
          │
    merge TASK-A-001, A-002, A-003
          │
    merge TASK-B-001, B-002, B-004, B-005 (parallel)
          │
    merge TASK-B-003, B-006 (after B-002)
          │
    (ready for integration)
          │
    merge to master via PR
```
