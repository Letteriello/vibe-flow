# wrap_up_session

Execute a wrap-up session to organize the project, consolidate learnings, and generate content.

## Usage

```
/wrap_up_session [mode]
```

## Arguments

- `mode` (optional): Execution mode
  - `full` - Execute all phases (ship-it, remember-it, self-improve, publish-it)
  - `ship-it` - Prepare and commit changes
  - `remember-it` - Update CLAUDE.md with learnings
  - `self-improve` - Update agent configuration
  - `publish-it` - Publish changes

## Examples

```
/wrap_up_session
/wrap_up_session remember-it
/wrap_up_session ship-it
/wrap_up_session full
```

This will call the MCP tool `wrap_up_session` with the specified mode. Wrap-up always executes definitively - no dry-run or bypass options are available via API.
