# wrap-up

Execute a wrap-up session to organize the project, consolidate learnings, and generate content.

## Usage

```
/wrap-up [mode]
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
/wrap-up
/wrap-up remember-it
/wrap-up ship-it
/wrap-up full
```

This will call the MCP tool `wrap_up_session` with the specified mode. Wrap-up always executes definitively - no dry-run or bypass options are available via API.
