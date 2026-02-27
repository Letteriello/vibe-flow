# CLAUDE.local.md

Auto-generated lessons from vibe-flow sessions

## Auto-Learned Lessons

- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.

## Session Notes (2026-02-27)
- Implemented hierarchical DAG summary system for context management:
  - Created src/context/summary-types.ts: LeafSummary, CondensedSummary, MessagePointer, SummaryPointer, DAGState types
  - Created src/context/dag-summary.ts: DAG management with provenance tracking
  - buildActiveContext() combines recent messages with DAG summaries
  - getProvenance() tracks all original message IDs through the DAG hierarchy
  - validateDAG() ensures DAG consistency

## Session Notes (2026-02-27)
- Created TDDLoopController in src/execution/tdd/loop-controller.ts:
  - TDDPhase enum: IDLE, RED, GREEN, REFACTOR, COMPLETED, FAILED
  - runTask(taskDescription): async method orchestrating TDD phases
  - RED: generates test via TestGenerator, validates it fails
  - GREEN: generates implementation until tests pass
  - REFACTOR: optional code improvement (keeps original if tests fail)
  - Uses dependency injection: TestGenerator, ImplementationGenerator, TestRunner
  - maxIterationsPerPhase: 5, maxTotalIterations: 15 (configurable)

## Session Notes (2026-02-27)
- Created SemanticQualityChecker in src/quality/ast-checker.ts:
  - hasOrphanedImports(code): detects unused imports via regex analysis
  - hasSyntaxAnomalies(code): detects structural issues
  - checkCode(code, sanitize): full quality check with optional sanitization
  - Detects markdown_prefix, orphaned_import, unclosed_brace/paren/bracket, invalid_string, trailing_code
  - sanitizeMarkdownPrefix() removes LLM explanatory text and extracts pure code
  - Exported via src/quality/index.ts with SyntaxAnomaly and QualityCheckResult types

## Session Notes (2026-02-27)
- Implemented SecurityScanner class in src/security/secret-scanner.ts:
  - SecurityFinding, SecurityReport, ScanResult interfaces
  - Static methods: scanPayload(), scanForSecrets(), scanForPromptInjection()
  - hasPromptInjection(), hasSecrets(), getSecretDetails()
  - 40+ secret patterns (AWS, JWT, OpenAI, GitHub, Stripe, private keys)
  - 11 prompt injection patterns ("ignore previous", jailbreak, XML injection)
  - Fixed Set iteration: use Array.from(new Set()) for ES5 compatibility

## Session Notes (2026-02-26)
- Implemented CrossRuleValidator in src/validation/cross-rule.ts:
  - validateConsistency(artifactA, artifactB) compares two specification artifacts
  - Detects missing keys (present in A but not in B) and extra keys
  - Compares arrays, objects, and primitive values
  - Reports type mismatches and value discrepancies
  - Exports: CrossRuleValidator, validateCrossRule, CrossRuleStatus enum
  - Types: ValidationResult, CrossRuleOptions, CrossRuleIssue
  - Added exports to src/validation/index.ts

## Session Notes (2026-02-27)
- Created WALPruner in src/wrap-up/wal-pruner.ts:
  - WALPruner class with static prune(logs: WALLogEvent[]): WALLogEvent[] method
  - WALActionType: write, edit, delete, read, bash, create, move, copy
  - WALLogEvent interface with id, timestamp, action, target, content, metadata
  - Algorithm: sorts by timestamp, removes exact duplicates, keeps latest version per target
  - If last action is delete, removes file from final result (write + delete = removed)
  - pruneWithStats() returns detailed PruneResult with counts
  - Strong TypeScript typing throughout
  - Build compiles successfully

## Session Notes (2026-02-27)
- Created TDD FailureAnalyzer in src/execution/tdd/failure-analyzer.ts:
  - parseTestFailure(rawError: string): FailureContext
  - Extracts test name from Jest (●) and Vitest (FAIL >) patterns
  - Expected/Received via Regex extraction
  - Stack trace parsing for file:line
  - FailureContext: testName, file, line, expected, received, errorType, summary
  - isRetryableFailure() - filters Syntax/Reference/TypeError
  - serializeFailureContext() - minimal string for LLM context

## Session Notes (2026-02-27)
- Created TaskIngestor in src/execution/tdd/task-queue.ts:
  - TDDTaskStatus enum: PENDING, IN_PROGRESS, FAILED, COMPLETED
  - TDDTask interface with id, description, status, priority, metadata
  - TaskIngestor class parses Markdown checkboxes [ ] and [x]
  - getNextTask() - extracts next incomplete item ordered by priority (indent level)
  - markInProgress/markFailed/markCompleted/resetTask - state transitions
  - getStats() - returns queue statistics (total, pending, inProgress, failed, completed)
  - saveToFile/loadFromFile - JSON persistence
  - Feeds TDDLoopController for execution loop

## Session Notes (2026-02-27)
- Created tests/unit/failure-analyzer.test.ts with 14 tests
  - Tests Jest/Vitest patterns, snapshots, timeouts, error types
  - Fixed vitest pattern parsing (remove "describe >" prefix)
  - Fixed timeout detection (prioritize isTimeout flag over extractErrorType)

## Session Notes (2026-02-27)
- Fixed TypeScript errors in TDD modules:
  - Fixed partiallyCoveredBranches property name in coverage-tracker.ts
  - Fixed Set iteration with Array.from() for ES5 compatibility
  - Added src/execution/tdd/index.ts export for coverage-tracker

## Session Notes (2026-02-27)
- Fixed Windows test failures (369 tests now passing):
  - Added fs.mkdir with recursive:true before atomic writes in state-machine, telemetry
  - Added Windows fallback: fs.rename fails if dest doesn't exist (EXDEV/ENOENT)
  - Fallback uses fs.copyFile + fs.unlink instead of rename
  - Fixed ImmutableLogger and ImmutableStore file write issues

## Session Notes (2026-02-27)
- Fixed TypeScript parser in mock-factory.ts:
  - Two-pass interface parsing: first collect names, then parse properties
  - Prevents "undefined" references when interfaces reference each other
  - Added format inference from property names (id→uuid, email→email, phone→phone, etc.)

## Session Notes (2026-02-27)
- Executed QA validation (/qa):
  - 390 tests passing, 0 failures
  - TypeScript build compiles successfully
  - All 23 PRD requirements validated
  - Created docs/planning/qa-report.md with full validation report
  - Verdict: ✅ APROVADO

## Session Notes (2026-02-27)
- Executed wrap-up (/wrap-up):
  - Committed 14 new files to main
  - Pushed to origin/main
  - Added execution modules: agents, orchestration, security, telemetry
  - Added CLI commands: analyze, dev, plan, qa

## Session Notes (2026-02-28)
- Created TDDContextPruner in src/execution/context/tdd-pruner.ts:
  - TDDContextPruner class with pruneIterationHistory(history: TDDHistory[])
  - Implements sliding window + summarization for long TDD histories
  - Strategy: keeps 3 most recent diffs intact, compresses older to summaries
  - Very old iterations (>3) become error pointers (e.g., "Iter X failed by SyntaxError at Y:Z")
  - Configurable token limit (default 8k) to prevent context degradation
  - Based on LOCA-bench findings about repetitive contexts degrading agent performance
  - Interfaces: TDDHistory, PrunedIteration, PruneResult, PrunerConfig
  - Methods: extractErrorPointer(), createIterationSummary(), applySlidingWindowCompression()

## Session Notes (2026-02-28)
- Ran analyze-project: Project has 195 TypeScript files, 187 unit tests passing
- Ran npm test: 368 tests passed, 1 test failed (EPERM - Windows file permission issue in state-machine.test.ts)
- Updated docs/architecture/_meta.json with latest analysis

## Session Notes (2026-02-28)
- Executed QA validation (/qa) - tested all MCP tools:
  - Verified 11 MCP tools: start_project, advance_step, get_status, analyze_project, wrap_up_session, get_wrapup_status, get_guidance, lcm_describe, lcm_expand, lcm_grep, adversarial_review
  - Build: PASS
  - TypeScript: 0 errors
  - Verdict: ✅ APROVADO
- Executed wrap-up (/wrap-up):
  - Committed 3 batches of changes to main
  - Added flow command (.claude/commands/flow.md)
  - Added docs/flow/ pipeline documentation
  - Updated .gitignore with docs/flow/.workers/
  - Pushed to origin/main

## Session Notes (2026-02-28)
- Executed /flow pipeline: AI Code Review feature
  - Analyze: 5 work units completed
  - Plan: PRD + UX + Tasks completed
  - Dev: 3 tasks (adversarial_review, security, quality)
  - QA: Requirements + Build validation passed
  - Pipeline status: COMPLETE
