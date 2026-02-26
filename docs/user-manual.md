# vibe-flow User Manual

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Install Steps

```bash
# Clone the repository
git clone https://github.com/Letteriello/vibe-flow.git
cd vibe-flow

# Install dependencies
npm install

# Build the project
npm run build
```

## CLI Commands

### Start a New Project

```bash
node dist/cli.js start my-project
```

Creates a new project with workflow foundation.

### Advance Workflow

```bash
node dist/cli.js advance
```

Moves to the next atomic workflow task.

### Show Status

```bash
node dist/cli.js status
```

Displays current project phase, progress, and next steps.

### Analyze Project

```bash
node dist/cli.js analyze
```

Analyzes an existing project and generates BMAD documentation.

### Wrap-up Session

```bash
# Dry-run mode (preview only)
node dist/cli.js wrap-up --dry-run

# Full execution
node dist/cli.js wrap-up --mode full
```

Executes session closure with context consolidation and auto-commit.

## Configuration

Configuration is stored at `~/.vibe-flow/config.json`. Default configuration is created on first run.

### Configuration Options

```json
{
  "project": {
    "name": "my-project",
    "phase": "analysis"
  },
  "preferences": {
    "language": "en",
    "verboseMode": false,
    "autoAdvance": false,
    "beginnerMode": false
  }
}
```

## MCP Tools

When used as an MCP server, vibe-flow exposes:

### start_project

Initialize a new project with workflow foundation.

```json
{
  "tool": "start_project",
  "parameters": {
    "projectName": "my-project",
    "projectPath": "./projects/my-project"
  }
}
```

### advance_step

Progress to the next atomic workflow task.

```json
{
  "tool": "advance_step",
  "parameters": {
    "projectPath": "./my-project"
  }
}
```

### get_status

Query current project status and detect stagnation.

```json
{
  "tool": "get_status",
  "parameters": {
    "projectPath": "./my-project"
  }
}
```

### analyze_project

Analyze existing project and generate BMAD documentation.

```json
{
  "tool": "analyze_project",
  "parameters": {
    "projectPath": "./legacy-project"
  }
}
```

## Development Commands

```bash
# Watch mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Lint
npm run lint

# Format code
npm run format
```

## Integration with Claude Code

### Ralph Loop

For autonomous development:

```bash
# Run Ralph autonomous loop
bash .ralph/ralph_loop.sh

# Or in background
nohup bash .ralph/ralph_loop.sh > .ralph/logs/ralph.log 2>&1 &
```

### Wrap-up Session

For automatic session closure:

```bash
# Run wrap-up (dry-run)
bash .ralph/lib/wrap-up/wrap_up.sh .

# Run wrap-up with execution
bash .ralph/lib/wrap-up/wrap_up.sh . --execute
```
