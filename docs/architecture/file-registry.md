# File Registry

## Overview

This registry tracks all TypeScript source files in the `src/` directory.

## Summary Statistics

- **Total TypeScript files:** 205
- **Test files:** 27
- **Build status:** Compiles successfully

---

## Core Files

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/cli.ts` | CLI Entry | Commander-based CLI with all BMAD commands | Active |
| `src/index.ts` | Module | Main exports for the library | Active |
| `src/types.ts` | Types | Global TypeScript interfaces | Active |

---

## Execution - TDD Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/execution/tdd/loop-controller.ts` | Class | TDDLoopController - Red-Green-Refactor state machine | Active |
| `src/execution/tdd/task-queue.ts` | Class | TaskIngestor - Markdown checkbox parsing | Active |
| `src/execution/tdd/prompts.ts` | Module | buildTestGenerationPrompt, buildImplementationPrompt | Active |
| `src/execution/tdd/failure-analyzer.ts` | Class | FailureAnalyzer - Jest/Vitest failure parsing | Active |
| `src/execution/tdd/regression-guard.ts` | Class | RegressionGuard - Post-task regression detection | Active |
| `src/execution/tdd/mock-factory.ts` | Class | MockFactory - Fixture generation from TypeScript | Active |
| `src/execution/tdd/coverage | Class | Coverage-tracker.ts`Tracker - Code coverage tracking | Active |
| `src/execution/tdd/test-runner.ts` | Interface | TestRunner interface for TDD | Active |
| `src/execution/tdd/index.ts` | Exports | Module exports | Active |

---

## Execution - Agents Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/execution/agents/refactor-agent.ts` | Class | RefactorAgent - Automated refactoring | Active |
| `src/execution/agents/index.ts` | Exports | Module exports | Active |

## Execution - Orchestration Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/execution/orchestration/tdd-coordinator.ts` | Class | TDDCoordinator - Agent coordination | Active |
| `src/execution/orchestration/index.ts` | Exports | Module exports | Active |

## Execution - Security Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/execution/security/tdd-sandbox.ts` | Class | SecuritySandboxWrapper - Safe TDD execution | Active |
| `src/execution/security/index.ts` | Exports | Module exports | Active |

## Execution - Telemetry Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/execution/telemetry/tdd-metrics.ts` | Module | TDDMetrics - Execution telemetry | Active |
| `src/execution/telemetry/index.ts` | Exports | Module exports | Active |

---

## Context Management Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/context/context-manager.ts` | Class | ContextManager - Context optimization | Active |
| `src/context/dag-summary.ts` | Class | DAG-based hierarchical summaries | Active |
| `src/context/worker.ts` | Module | Worker threads for CPU-intensive tasks | Active |
| `src/context/summarizer.ts` | Module | Context summarization | Active |
| `src/context/compression.ts` | Module | Context compression algorithms | Active |
| `src/context/compaction.ts` | Module | Context compaction | Active |

---

## MCP Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/mcp/official-server.ts` | Server | MCP server using @modelcontextprotocol/sdk | Active |
| `src/mcp/client.ts` | Client | MCP client for external servers | Active |
| `src/mcp/permission-guard.ts` | Class | MCPPermissionGuard - Tool permission interceptor | Active |
| `src/mcp/tools/lcm-tools.ts` | Module | LCM tools implementation | Active |

---

## Error Handler Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/error-handler/circuit-breaker.ts` | Class | AgentCircuitBreaker - Circuit breaker pattern | Active |
| `src/error-handler/wal-recovery.ts` | Class | WALManager - Write-ahead log recovery | Active |
| `src/error-handler/rate-limit.ts` | Module | Rate limiting utilities | Active |

---

## Validation Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/validation/cross-rule.ts` | Class | CrossRuleValidator - Cross-artifact consistency | Active |
| `src/validation/drift-detector.ts` | Class | ImplementationDriftDetector | Active |
| `src/validation/readiness-gate.ts` | Class | Readiness gate for phases | Active |

---

## Security Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/security/secret-scanner.ts` | Class | SecurityScanner - 40+ secret patterns | Active |
| `src/security/scanner.ts` | Module | PayloadSecurityScanner | Active |

---

## State Machine Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/state-machine/orchestrator.ts` | Class | State machine orchestrator | Active |
| `src/state-machine/file-lock.ts` | Class | WorkspaceLockManager | Active |
| `src/state-machine/atomic-persistence.ts` | Module | Atomic state persistence | Active |
| `src/state-machine/state-drift-detector.ts` | Class | Directory hash drift detection | Active |

---

## Wrap-Up Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/wrap-up/formatter.ts` | Class | FastMarkdownFormatter - Report generation | Active |
| `src/wrap-up/memory.ts` | Module | Memory consolidation | Active |
| `src/wrap-up/consolidation.ts` | Module | Session consolidation | Active |
| `src/wrap-up/self-improve/memory-router.ts` | Class | Route insights to memory levels | Active |

---

## Decision Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/decision/state-detector.ts` | Class | ProjectState detection (NEW/IN_PROGRESS/REVERSE) | Active |
| `src/decision/ensemble-voting.ts` | Module | Ensemble voting for decisions | Active |
| `src/decision/hit-pause.ts` | Class | HitPauseManager - Strategic human pauses | Active |

---

## Quality Module

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `src/quality/ast-checker.ts` | Class | SemanticQualityChecker - AST analysis | Active |
| `src/quality/denoiser.ts` | Module | Remove LLM explanatory text | Active |

---

## Test Files

| File | Type | Tests |
|------|------|-------|
| `tests/unit/failure-analyzer.test.ts` | Jest | 14 tests |
| `tests/unit/wal-recovery.test.ts` | Jest | 11 tests |
| `tests/unit/drift-detector.test.ts` | Jest | Multiple |
| `tests/unit/compaction.test.ts` | Jest | Context compaction |
| `tests/unit/compression.test.ts` | Jest | Context compression |
| `tests/unit/eval.test.ts` | Jest | 7 tests (e2e) |

---

## Notes

- All TypeScript files compile successfully
- Tests require Jest with ESM support
- Windows compatibility verified (path handling, EXDEV fallback)

---

*Generated: 2026-02-26*
