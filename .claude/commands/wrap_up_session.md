# wrap_up_session

Execute a wrap-up session to organize the project, consolidate learnings, and generate content.

## Usage

```
/wrap_up_session [mode] [options]
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
/wrap_up_session
/wrap_up_session full --dry-run
/wrap_up_session remember-it --force
/wrap_up_session ship-it
```

This will call the MCP tool `wrap_up_session` with the specified mode and options.
