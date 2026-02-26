# vibe-flow Architecture

## Executive Summary

**vibe-flow** is a workflow orchestration system for AI development agents using the BMAD methodology.

### Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js >= 18.0.0
- **Package Manager:** npm
- **CLI Framework:** Commander

### 10 Architectural Principles

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

## Core Components

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

### 3. Command Registry (`src/command-registry/`)

Maps BMAD phases to CLI commands with:
- Performance monitoring (<500ms target)
- Correlation ID tracking
- Error handling

### 4. Error Handler (`src/error-handler/`)

Intelligent error recovery:
- Retryable vs Non-retryable classification
- Exponential backoff (max 3 retries)
- Structured error logging

### 5. Validation Framework (`src/validation/`)

Three-level validation:
- Input validation
- Specification validation
- Output validation
- Readiness gates

### 6. Context Management (`src/context/`)
- Context-aware prompts (anchored in previous decisions)
- Context aggregation & summarization
- Memory efficiency (1MB threshold)

---

## Project Structure

```
vibe-flow/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── index.ts               # Main exports
│   ├── types.ts               # TypeScript type definitions
│   ├── config/                # Configuration management
│   ├── context/               # Context management
│   ├── command-registry/      # Command registry
│   ├── decision/              # Decision handling
│   ├── error-handler/         # Error handling & recovery
│   ├── mcp/                   # MCP server implementation
│   ├── state-machine/         # Workflow state machine
│   ├── validation/            # Validation framework
│   └── wrap-up/              # Wrap-up functionality
├── dist/                     # Compiled JavaScript
├── node_modules/
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## State Files

| File | Purpose |
|------|---------|
| `progress.json` | Workflow state tracking |
| `project_context.json` | Accumulated project context |
| `.vibe-flow/config.json` | Runtime configuration |

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Workflow Resume Rate | ≥95% |
| State Detection Accuracy | ≥95% |
| CLI Responsiveness | <500ms for local operations |
| Context Integrity | Atomic writes + validation |

---

*Generated: 2026-02-25*
