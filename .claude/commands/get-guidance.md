# get-guidance

Get workflow guidance based on current project phase using BMAD methodology.

## Usage

```
/get-guidance [phase]
```

## Arguments

- `phase` (optional): Show guidance for specific phase
  - `NEW` - New project guidance
  - `ANALYSIS` - Analysis phase guidance
  - `PLANNING` - Planning phase guidance
  - `SOLUTIONING` - Solutioning phase guidance
  - `IMPLEMENTATION` - Implementation phase guidance
  - `COMPLETE` - Complete phase guidance

## Example

```
/get-guidance
/get-guidance IMPLEMENTATION
```

This will call the MCP tool `get_guidance` to show BMAD workflow guidance.
