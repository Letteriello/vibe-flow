# CLAUDE.local.md

Auto-generated lessons from vibe-flow sessions



## Auto-Learned Lessons

## Auto-Learned Lessons

## Auto-Learned Lessons
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.
- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")
- Multiple failed operations: 3 operations failed. Consider reviewing error handling.

- Type mismatch: Ensure interfaces have explicit types for all properties, avoid unknown
- Missing file/path: Resolve fixture paths from project root using path.resolve(__dirname, "../..")

## Session Notes (2026-02-27)
- Implemented hierarchical DAG summary system for context management:
  - Created src/context/summary-types.ts: LeafSummary, CondensedSummary, MessagePointer, SummaryPointer, DAGState types
  - Created src/context/dag-summary.ts: DAG management with provenance tracking
  - buildActiveContext() combines recent messages with DAG summaries
  - getProvenance() tracks all original message IDs through the DAG hierarchy
  - validateDAG() ensures DAG consistency
