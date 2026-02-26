# Implementation Patterns

## Naming Conventions

### CLI Commands (wrap-up skill)

| Pattern | Rule | Example |
|---------|-------|---------|
| Verb-noun | `<action>-<resource>` in kebab-case | `save-context`, `generate-commit` |
| Subcommands | Hierarchy with `:` | `wrap:commit`, `wrap:memory` |
| Flags | Two forms accepted | `--verbose` or `-v` |

### MCP Tools (vibe-flow)

| Pattern | Rule | Example |
|---------|-------|---------|
| Tool names | snake_case | `start_project`, `advance_step` |
| Parameters | camelCase | `projectPath`, `stepName` |
| Return format | Object with `success/error` | `{success: true, data: {...}}` |

### State Files

| Pattern | Rule | Example |
|---------|-------|---------|
| Progress | `progress.json` | Workflow state |
| Context | `project_context.json` | Accumulated context |
| Memory | `memory/<type>.json` | `memory/short.json`, `memory/long.json` |

---

## Error Handling Hierarchy

```
1. TRY: Normal operation
   ↓ (if fails)
2. RETRY: With exponential backoff (max 3x)
   ↓ (if fails)
3. FALLBACK: Alternative operation or user prompt
   ↓ (if fails)
4. FAIL: Log + return structured error
```

### Error Contract

```bash
# All errors must follow this format
ERROR_CODE="RETRYABLE_NETWORK_FAILURE"
ERROR_MESSAGE="Failed to connect to GitHub API"
ERROR_RECOVERY="retry_with_backoff"
ERROR_DATA="{...json...}"
```

---

## State Validation Contract

```bash
# Validate state BEFORE any operation
validate_state() {
  local state_file="$1"
  # 1. Check valid JSON
  # 2. Check checksum
  # 3. Check valid transitions
}
```

---

## Atomic Writes Pattern

```bash
# Write to temp file, validate, then atomic rename
write_state() {
  local state_file="$1"
  local data="$2"
  local temp_file="${state_file}.tmp"

  # Write to temp
  echo "$data" > "$temp_file"

  # Validate JSON
  if ! jq empty "$temp_file" 2>/dev/null; then
    rm "$temp_file"
    return 1
  fi

  # Atomic rename
  mv "$temp_file" "$state_file"
}
```

---

## Pattern Examples

### ✅ Correct Usage

```bash
# Verb-noun in kebab-case
wrap-up save-context --project ./my-project

# MCP tool in snake_case
{"tool":"advance_step","parameters":{"stepName":"create-architecture"}}

# State with checksum
{"version":"1.0","checksum":"sha256:abc123...","data":{...}}
```

### ❌ Anti-Patterns

```bash
# Wrong - PascalCase in CLI
Wrap-Up SaveContext

# Wrong - camelCase in tool names
startProject -> should be start_project

# Wrong - No state validation
write_state "$file" "$data"  # without validating first
```

---

## Enforcement Guidelines

All AI agents MUST:

- ✅ Use consistent naming as defined above
- ✅ Follow specified directory structure
- ✅ Return errors in standardized format with severity
- ✅ Log with consistent level and format
- ✅ Validate state before modifications
- ✅ Maintain atomicity in writes
- ✅ Implement preview/dry-run before destructive operations
- ✅ Validate destination before writes
- ✅ Sanitize credentials before logging
- ✅ Maintain action log for audit
- ✅ Version patterns as they evolve
- ✅ Confirm branch before git operations
- ✅ Implement size limits + compaction
- ✅ Use file locking for concurrent safety
- ✅ Design abstraction layer for external APIs
- ✅ Opt-in for memory features
- ✅ Implement 2-step approval for critical operations
- ✅ Track metrics for PM
- ✅ Maintain override with audit trail
- ✅ Implement atomic writes with write-ahead log
