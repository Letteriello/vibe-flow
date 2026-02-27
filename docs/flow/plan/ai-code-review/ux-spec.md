# UX Spec: AI Code Review Feature

## 1. CLI Interface

### Command: `vibe-flow review`

```bash
# Basic usage - review a single file
vibe-flow review src/utils.ts

# Review a directory
vibe-flow review src/

# With output format
vibe-flow review src/utils.ts --format json
vibe-flow review src/utils.ts --format markdown

# Filter by severity
vibe-flow review src/ --severity high
vibe-flow review src/ --severity critical

# Combine options
vibe-flow review src/ --format json --severity medium

# Help
vibe-flow review --help
```

### Output Examples

**JSON Format:**
```json
{
  "file": "src/utils.ts",
  "score": 85,
  "issues": [
    {
      "type": "naming",
      "severity": "medium",
      "line": 15,
      "message": "Generic variable name 'data'",
      "suggestion": "Use 'userData' or 'responsePayload'"
    }
  ],
  "summary": "2 issues found (1 medium, 1 low)",
  "linesOfCode": 150,
  "analyzedAt": "2026-02-28T12:30:00Z"
}
```

**Markdown Format:**
```markdown
# Code Review Report

**File:** src/utils.ts
**Score:** 85/100
**Lines:** 150
**Date:** 2026-02-28

## Issues (2)

| Severity | Type | Line | Message | Suggestion |
|----------|------|------|---------|------------|
| 🔴 Critical | security | 42 | Hardcoded API key | Use environment variable |
| 🟡 Medium | naming | 15 | Generic 'data' name | Use 'userData' |
```

### Help Output
```
vibe-flow review <path> [options]

Review code files for AI-generated patterns and quality issues

Arguments:
  path                  File or directory to review

Options:
  --format <type>      Output format: json, markdown (default: markdown)
  --severity <level>   Minimum severity to report: low, medium, high, critical
  --help               Show this help message

Examples:
  vibe-flow review src/
  vibe-flow review src/utils.ts --format json
  vibe-flow review src/ --severity high
```

## 2. MCP Tool Interface

### Tool: `review_code`

**Input:**
```typescript
{
  code: string,           // Code to review (required)
  language?: string,      // Language: typescript, javascript, python (optional)
  options?: {
    format?: 'json' | 'markdown',
    severity?: 'low' | 'medium' | 'high' | 'critical',
    includeSuggestions?: boolean
  }
}
```

**Output:**
```typescript
{
  success: boolean,
  result: {
    score: number,
    issues: ReviewIssue[],
    summary: string,
    linesOfCode: number
  },
  error?: string
}
```

## 3. User Flows

### Flow 1: CLI Review
1. User runs `vibe-flow review <path>`
2. System scans file/directory for code files (.ts, .js, .tsx, .jsx)
3. For each file: run ai-patterns-detector + ast-checker
4. Calculate score
5. Format and display results
6. Exit with code 0 (success) or 1 (critical issues found)

### Flow 2: MCP Review
1. External tool calls `review_code` MCP tool
2. Tool validates input
3. Runs pattern detection and AST analysis
4. Returns structured ReviewResult
5. Tool returns result to caller

### Flow 3: Pre-flight Integration
1. User runs `vibe-flow preflight`
2. System includes AI code review as part of pre-flight checks
3. If critical issues found, pre-flight fails with warning

## 4. Visual Design

### Score Display
- 90-100: 🟢 Green "Excellent"
- 70-89: 🟡 Yellow "Good"
- 50-69: 🟠 Orange "Needs Improvement"
- 0-49: 🔴 Red "Poor"

### Severity Indicators
- Critical: 🔴 Red badge
- High: 🟠 Orange badge
- Medium: 🟡 Yellow badge
- Low: 🔵 Blue badge

### Summary Output (Terminal)
```
✓ Analyzing src/utils.ts
  Score: 85/100 🟡
  Issues: 2 found (1 medium, 1 low)
  Lines: 150

  Issues:
    [15] 🔵 naming: Generic variable name 'data'
    [42] 🟠 structure: Empty function body
```

## 5. Error Handling

| Error | Message | Action |
|-------|---------|--------|
| File not found | "File not found: {path}" | Exit code 1 |
| Permission denied | "Cannot read: {path}" | Exit code 1 |
| Empty file | "Skipping empty file: {path}" | Skip, continue |
| Invalid path | "Invalid path: {path}" | Exit code 1 |

## 6. Integration Points

| Component | Integration |
|-----------|-------------|
| CLI | New `review` command in cli.ts |
| MCP | New `review_code` tool in tools/ |
| Quality | Reuse ai-patterns-detector, ast-checker |
| Config | Optional: add review config to .vibe-flow/config.json |
