# advance-step

Advance the workflow to the next step or phase and execute the corresponding bmalph command.

## Usage

```
/advance-step [options]
```

## Options

- `--force` - Skip confirmation prompts
- `--no-execute` - Don't execute the mapped bmalph command (just advance state)

## Example

```
/advance-step
/advance-step --force
```

This will call the MCP tool `advance_step` to progress the project workflow.
