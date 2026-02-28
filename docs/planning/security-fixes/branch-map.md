# Branch Map: Correções de Segurança Críticas

| Task | Branch | Base | Merge Target |
|------|--------|------|-------------|
| TASK-001 | task/sec-001-interfaces | main | task/sec-002-tests |
| TASK-002 | task/sec-002-tests | task/sec-001-interfaces | task/sec-100-cache |
| TASK-100 | task/sec-100-regex-cache | task/sec-002-tests | integration/security-fixes |
| TASK-101 | task/sec-101-symlink-guard | task/sec-002-tests | integration/security-fixes |
| TASK-102 | task/sec-102-perf-optimizer | task/sec-002-tests | integration/security-fixes |
| TASK-200 | task/sec-200-owasp-a01 | integration/security-fixes | integration/security-fixes |
| TASK-201 | task/sec-201-owasp-a04 | integration/security-fixes | integration/security-fixes |
| TASK-202 | task.sec-202-owasp-a06 | integration/security-fixes | integration/security-fixes |
| TASK-203 | task/sec-203-owasp-a07 | integration/security-fixes | integration/security-fixes |
| TASK-204 | task/sec-204-owasp-a09 | integration/security-fixes | integration/security-fixes |
| TASK-300 | task/sec-300-xss-rules | integration/security-fixes | integration/security-fixes |
| TASK-301 | task/sec-301-sqli-rules | integration/security-fixes | integration/security-fixes |
| TASK-302 | task/sec-302-cmd-rules | integration/security-fixes | integration/security-fixes |
| TASK-400 | task/sec-400-cache-integration | integration/security-fixes | integration/security-fixes |
| TASK-401 | task/sec-401-symlink-integration | integration/security-fixes | integration/security-fixes |
| TASK-402 | task/sec-402-early-termination | integration/security-fixes | integration/security-fixes |
| TASK-403 | task/sec-403-fast-mode | integration/security-fixes | integration/security-fixes |
| TASK-INT-001 | integration/security-fixes | main | main |
| TASK-INT-002 | integration/security-fixes | main | main |
| TASK-INT-003 | integration/security-fixes | main | main |
| TASK-INT-004 | integration/security-fixes | main | main |

---

## Fluxo de Merge

```
main
  │
  ├── task/sec-001-interfaces ──► task/sec-002-tests
  │                                    │
  │     ┌──────────────────────────────┼──────────────────────────┐
  │     │                              │                          │
  │     ▼                              ▼                          ▼
  │ task/sec-100-regex-cache    task/sec-101-symlink-guard  task/sec-102-perf-optimizer
  │     │                              │                          │
  │     └──────────────────────────────┼──────────────────────────┘
  │                                    │
  │                           integration/security-fixes
  │                                    │
  │     ┌────────────┬────────────┬───┴───┬────────────┬────────────┐
  │     ▼            ▼            ▼       ▼            ▼            ▼
  │ TASK-200   TASK-201    TASK-202  TASK-203   TASK-204   TASK-300-303
  │            ...todos os arquivos vao para integration/security-fixes
  │                                    │
  └────────────────────────────────────┼────────────────────────────────►
                                       ▼
                               main (via PR)
```

---

## Convenções de Nomenclatura

- **Feature Branch:** `task/sec-{XXX}-{description}`
- **Integration Branch:** `integration/security-fixes`
- **Commit Messages:**
  - `fix(sec-{id}): {description}`
  - `feat(sec-{id}): {description}`
  - `test(sec-{id}): {description}`
