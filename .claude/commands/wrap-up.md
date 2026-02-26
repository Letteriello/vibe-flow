# wrap-up

Execute a wrap-up session to organize the project, consolidate learnings, and generate content.

## Usage

```
/wrap-up [mode] [options]
```

## Arguments

- `mode` (optional): Execution mode
  - `full` - Execute all phases (ship-it, remember-it, self-improve, publish-it)
  - `ship-it` - Prepare and commit changes
  - `remember-it` - Update CLAUDE.md with learnings
  - `self-improve` - Update agent configuration
  - `publish-it` - Publish changes

## Options

- `--dry-run` - Show what would be done without executing
- `--force` - Skip confirmations and execute directly

## Examples

```
/wrap-up
/wrap-up full --dry-run
/wrap-up remember-it --force
/wrap-up ship-it
```

This will call the MCP tool `wrap_up_session` with the specified mode and options.
