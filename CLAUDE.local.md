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
