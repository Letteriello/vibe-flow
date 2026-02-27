# vibe-flow Architecture

## Executive Summary

**vibe-flow** is a sophisticated workflow orchestration system for AI development agents implementing the BMAD (Build-Measure-Analyze-Decide) methodology. It provides state machine-driven project lifecycle management, TDD execution engines, context management, and MCP server integration.

### Technology Stack

- **Language:** TypeScript 5.3.3 (exact version pinned)
- **Runtime:** Node.js >= 18.0.0
- **Package Manager:** npm
- **CLI Framework:** Commander
- **Testing:** Jest with ts-jest
- **Protocol:** MCP (Model Context Protocol) for AI agent communication

---

## 10 Architectural Principles

1. **Interface is contract** — Every interaction between components has explicit contract
2. **Hybrid approach** — CLI-first with MCP as bridge
3. **Atomic writes** — Prevent state corruption with write-ahead log
4. **Adapter Interface** — Abstract Git, MCP, future integrations
5. **Preview mandatory** — dry-run before destructive operations
6. **Human-in-loop** — Auto-suggest, not auto-commit
7. **Multi-project support** — Prefix per project
8. **Metrics tracking** — Light dashboard for PM
9. **Simplification** — Occam's Razor approach
10. **Ship MVP** — Learn fast, iterate

---

## Core Modules

### 1. State Machine (`src/state-machine/`)
Manages workflow progression through BMAD phases:
- **Phases:** NEW → ANALYSIS → PLANNING → SOLUTIONING → IMPLEMENTATION → COMPLETE
- **Features:** Deterministic transitions, atomic state persistence, drift detection

### 2. MCP Server (`src/mcp/`)
Model Context Protocol server exposing tools:
- `start_project` - Initialize new project
- `advance_step` - Progress workflow
- `get_status` - Query current status
- `analyze_project` - Analyze existing projects

### 3. TDD Execution (`src/execution/tdd/`)
Full Test-Driven Development loop implementation:
- **TDDLoopController** - Red-Green-Refactor state machine
- **TaskIngestor** - Markdown checkbox parsing and queue management
- **RegressionGuard** - Post-task regression detection
- **FailureAnalyzer** - Parse test failures (Jest/Vitest)
- **MockFactory** - Generate test fixtures from TypeScript interfaces

### 4. Context Management (`src/context/`)
- Context-aware prompts, aggregation & summarization
- DAG-based hierarchical summaries with provenance tracking
- Worker threads for CPU-intensive compression

### 5. Error Handler (`src/error-handler/`)
- Intelligent error classification (retryable vs non-retryable)
- Circuit Breaker pattern with HALF_OPEN state
- WAL (Write-Ahead Log) for crash recovery
- Rate limiting with exponential backoff

### 6. Validation Framework (`src/validation/`)
- Cross-rule consistency validation between artifacts
- Implementation drift detection (FORGOTTEN, PARTIAL, FEATURE_CREEP)
- Readiness gates and human review triggers

### 7. Security (`src/security/`)
- Secret scanning (40+ patterns: AWS keys, JWT, PEM, etc.)
- Prompt injection detection (11 patterns)
- OWASP security rules

### 8. Quality (`src/quality/`)
- AST-based code quality checking
- Linting and formatting hooks
- Architecture guardrails

### 9. Wrap-Up (`src/wrap-up/`)
- Session consolidation and documentation
- Memory routing (CLAUDE.md, rules, auto-memory)
- WAL pruning and audit logging
- RAG-based knowledge management

---

## Project Structure

```
vibe-flow/
├── src/
│   ├── cli.ts                 # CLI entry point (Commander)
│   ├── index.ts               # Main exports
│   ├── types.ts               # TypeScript type definitions
│   ├── architecture/          # Architecture specification & validation
│   ├── command-registry/      # BMAD phase to CLI command mapping
│   ├── config/                # Configuration management
│   ├── context/               # Context management & compression
│   ├── context-engine/        # Context categorization & summarization
│   ├── decision/              # State detection & ensemble voting
│   ├── drivers/               # Agent driver abstraction (Claude Code, Codex)
│   ├── error-handler/         # Error recovery & circuit breaker
│   ├── execution/
│   │                # TDD └── tdd/ loop controller & related modules
│   ├── mcp/                   # MCP server & client implementation
│   ├── memory/                # SQLite-based memory storage
│   ├── notifications/         # Notification integrations (Pantalk)
│   ├── operators/             # LLM & agentic map operators
│   ├── quality/               # Code quality & AST checking
│   ├── security/              # Secret scanning & OWASP rules
│   ├── state-machine/         # Workflow state machine
│   ├── telemetry/             # Usage tracking & quota management
│   ├── tools/                 # Sandbox & programmatic runner
│   ├── validation/            # Validation framework & drift detection
│   └── wrap-up/               # Session wrap-up & memory consolidation
├── tests/
│   ├── unit/                  # Unit tests (Jest)
│   ├── e2e/                   # End-to-end tests
│   └── fixtures/              # Test fixtures
├── docs/architecture/         # This documentation
├── dist/                      # Compiled JavaScript
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Key Interfaces & Types

### TDD Types
- `TDDPhase`: IDLE | RED | GREEN | REFACTOR | COMPLETED | FAILED
- `TDDTaskStatus`: PENDING | IN_PROGRESS | FAILED | COMPLETED
- `RegressionType`: SIDE_EFFECT | GLOBAL_BREAKAGE | INTEGRATION_FAILURE | SILENT_FAILURE
- `FailureContext`: testName, file, line, expected, received, errorType, summary

### Workflow Types
- `ProjectPhase`: NEW | ANALYSIS | PLANNING | SOLUTIONING | IMPLEMENTATION | COMPLETE
- `ProjectState`: NEW | IN_PROGRESS | REVERSE_ENGINEERING
- `CircuitBreakerState`: CLOSED | OPEN | HALF_OPEN

### Security Types
- `SecurityFinding`: pattern, severity, location
- `ScanResult`: hasSecrets, findings array
- Prompt injection patterns (11 types)

---

## State Files

| File | Purpose |
|------|---------|
| `.vibe-flow/state.json` | Workflow state tracking |
| `.vibe-flow/progress.json` | Phase progress |
| `.vibe-flow/telemetry.json` | Usage metrics |
| `.vibe-flow/quota-state.json` | Quota tracking |
| `.vibe-flow/wal/` | Write-ahead log directory |

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Workflow Resume Rate | >=95% |
| State Detection Accuracy | >=95% |
| CLI Responsiveness | <500ms for local operations |
| Context Integrity | Atomic writes + validation |
| Test Coverage | Growing via TDD |

---

## Running the Project

```bash
# Build TypeScript
npm run build

# Run CLI
npm start

# Run MCP Server
npm run mcp

# Run Tests
npm test

# Development mode
npm run dev
```

---

*Generated: 2026-02-26*
*Analysis Version: 1.0*
