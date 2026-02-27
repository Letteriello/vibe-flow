# Project Structure

## Directory Overview

```
vibe-flow/
├── src/                          # Source code (195 TypeScript files)
│   ├── cli.ts                    # CLI entry point
│   ├── index.ts                  # Main exports
│   ├── types.ts                 # Global TypeScript types
│   │
│   ├── architecture/            # Architecture specs & validation (6 files)
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── spec-template.ts
│   │   ├── spec-validator.ts
│   │   ├── version-manager.ts
│   │   └── human-review-gate.ts
│   │
│   ├── command-registry/        # BMAD phase to CLI mapping (2 files)
│   │
│   ├── config/                  # Configuration management (5 files)
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   ├── config-loader.ts
│   │   ├── cognitive-tiering.ts
│   │   └── fallback-router.ts
│   │
│   ├── context/                 # Context management (26 files)
│   │   ├── index.ts
│   │   ├── context-manager.ts    # Context optimization & summarization
│   │   ├── dag-summary.ts       # DAG-based hierarchical summaries
│   │   ├── worker.ts            # Worker threads for compression
│   │   ├── compression.ts
│   │   ├── compaction.ts
│   │   ├── summarizer.ts
│   │   └── ... (more)
│   │
│   ├── context-engine/          # Context categorization (6 files)
│   │
│   ├── decision/                # Decision handling (3 files)
│   │   ├── index.ts
│   │   ├── state-detector.ts    # Project state detection (NEW/IN_PROGRESS/REVERSE)
│   │   └── ensemble-voting.ts
│   │
│   ├── drivers/                 # Agent driver abstraction (5 files)
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── router.ts            # Circuit breaker routing
│   │   ├── claude-code.ts
│   │   └── codex.ts
│   │
│   ├── error-handler/           # Error handling & recovery (8 files)
│   │   ├── index.ts
│   │   ├── circuit-breaker.ts   # AgentCircuitBreaker pattern
│   │   ├── wal-recovery.ts     # WAL crash recovery
│   │   ├── rate-limit.ts
│   │   ├── recovery.ts
│   │   ├── refiner-loop.ts
│   │   └── wal.ts
│   │
│   ├── execution/
│   │   └── tdd/                 # TDD execution engine (9 files)
│   │       ├── index.ts
│   │       ├── loop-controller.ts      # Red-Green-Refactor state machine
│   │       ├── task-queue.ts           # Markdown checkbox parsing
│   │       ├── prompts.ts              # TDD prompt generation
│   │       ├── failure-analyzer.ts     # Jest/Vitest failure parsing
│   │       ├── regression-guard.ts     # Post-task regression detection
│   │       ├── coverage-tracker.ts
│   │       ├── test-runner.ts
│   │       └── mock-factory.ts         # Test fixture generation
│   │
│   ├── mcp/                     # MCP server & tools (18 files)
│   │   ├── index.ts
│   │   ├── official-server.ts   # MCP server using @modelcontextprotocol/sdk
│   │   ├── client.ts
│   │   ├── permission-guard.ts
│   │   ├── tools/
│   │   │   ├── lcm-tools.ts
│   │   │   └── lcm-schema.ts
│   │   └── ... (more)
│   │
│   ├── memory/                  # SQLite memory storage (1 file)
│   │
│   ├── notifications/          # Notification integrations (2 files)
│   │
│   ├── operators/              # LLM & agentic operators (2 files)
│   │
│   ├── quality/                # Code quality checking (10 files)
│   │   ├── index.ts
│   │   ├── ast-checker.ts      # AST-based syntax checking
│   │   ├── denoiser.ts         # Remove LLM explanatory text
│   │   ├── guardrails.ts
│   │   └── ... (more)
│   │
│   ├── security/               # Security scanning (7 files)
│   │   ├── index.ts
│   │   ├── secret-scanner.ts   # 40+ secret patterns
│   │   ├── scanner.ts
│   │   └── ... (more)
│   │
│   ├── state-machine/           # Workflow state machine (13 files)
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   ├── file-lock.ts         # WorkspaceLockManager
│   │   ├── atomic-persistence.ts
│   │   ├── state-drift-detector.ts
│   │   └── ... (more)
│   │
│   ├── telemetry/              # Usage tracking (3 files)
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   └── quotaTracker.ts
│   │
│   ├── tools/                  # Sandbox & runner (2 files)
│   │
│   ├── validation/              # Validation framework (16 files)
│   │   ├── index.ts
│   │   ├── cross-rule.ts        # Cross-artifact consistency
│   │   ├── drift-detector.ts    # Implementation drift detection
│   │   ├── readiness-gate.ts
│   │   └── ... (more)
│   │
│   ├── wrap-up/                 # Session wrap-up (27 files)
│   │   ├── index.ts
│   │   ├── formatter.ts        # Markdown report generation
│   │   ├── memory.ts
│   │   ├── consolidation.ts
│   │   ├── self-improve/
│   │   │   ├── memory-router.ts  # Route insights to memory levels
│   │   │   └── rule-generator.ts
│   │   └── intelligence/
│   │       ├── knowledge-graph.ts
│   │       ├── rag-metadata.ts
│   │       └── ... (more)
│   │
│   └── help/                   # Help system (1 file)
│
├── tests/                       # Test suite
│   ├── unit/                    # Unit tests (12 files)
│   ├── e2e/                     # End-to-end tests
│   └── fixtures/                # Test fixtures
│
├── docs/architecture/          # Architecture documentation
│   ├── _meta.json
│   ├── overview.md
│   ├── structure.md            # This file
│   ├── file-registry.md
│   ├── data-flows.md
│   ├── diagnostics.md
│   ├── dependency-map.md
│   └── glossary.md
│
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Module Classification

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `src/cli.ts` | CLI entry point | Commander-based CLI |
| `src/execution/tdd/` | T | loop-controller, task-DD loop enginequeue, prompts |
| `src/context/` | Context management | context-manager, dag-summary, worker |
| `src/mcp/` | MCP protocol | official-server, client, permission-guard |
| `src/error-handler/` | Error resilience | circuit-breaker, wal-recovery |
| `src/validation/` | Validation | cross-rule, drift-detector |
| `src/security/` | Security scanning | secret-scanner |
| `src/state-machine/` | Workflow orchestration | orchestrator, file-lock |
| `src/wrap-up/` | Session management | formatter, consolidation |

---

*Generated: 2026-02-26*
