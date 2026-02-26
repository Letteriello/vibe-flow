# vibe-flow Project Build and Run Instructions

## Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

## Installation

```bash
cd vibe-flow
npm install
```

## Building

```bash
npm run build
```

## Running

### CLI Commands

```bash
# Start a new project
node dist/cli.js start my-project

# Advance workflow
node dist/cli.js advance

# Show status
node dist/cli.js status

# Show workflow guidance
node dist/cli.js help
node dist/cli.js help --phase planning

# Analyze project
node dist/cli.js analyze

# Wrap-up session
node dist/cli.js wrap-up --mode full
node dist/cli.js wrap-up --dry-run
```

### MCP Tools

The MCP server exposes 5 tools:
- `start_project` - Initialize a new project
- `advance_step` - Move to next step/phase
- `get_status` - Get current project status
- `analyze_project` - Generate project analysis report
- `wrap_up_session` - Execute wrap-up session

## Testing

```bash
npm test
```

## Configuration

Configuration is stored at `~/.vibe-flow/config.json`. Default configuration is created on first run.

## Development

```bash
# Watch mode
npm run dev

# Run tests with coverage
npm test -- --coverage
```

## BMAD Integration

vibe-flow integrates with the BMAD-METHOD framework. The `help` command reads from `_bmad/_config/bmad-help.csv` to provide contextual workflow guidance based on your current project phase:

- **NEW**: Start a new project
- **ANALYSIS**: Brainstorm, research, create brief
- **PLANNING**: Create PRD, UX, architecture
- **SOLUTIONING**: Epics, stories, readiness checks
- **IMPLEMENTATION**: Sprint planning, development, QA
