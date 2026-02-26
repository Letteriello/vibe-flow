# vibe-flow

[![CI](https://github.com/Letteriello/vibe-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/Letteriello/vibe-flow/actions/workflows/ci.yml)
[![Test Coverage](https://img.shields.io/badge/coverage-80%25-yellow)](https://github.com/Letteriello/vibe-flow)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Letteriello/vibe-flow/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green)](https://nodejs.org copiloto que previne fogo em código AI" —)

> "O Workflow orchestration system for AI development agents

**vibe-flow** is a CLI tool that transforms the BMAD framework from a command-intensive experience into an intuitive, guided workflow. It automatically detects project state, advances workflow steps atomically, and prompts users only at decision points.

## Why vibe-flow?

| Problem | Solution |
|---------|----------|
| Too many commands to remember | Single command: `vibe-flow advance` |
| Lost context between sessions | Automatic context persistence |
| Insecure AI-generated code | Built-in security scanner |
| Unmaintainable code | Architecture-first enforcement |
| No quality gates | Pre-flight checks & quality guardrails |

## Features

- **Workflow Orchestration** - Automatic state machine controlling BMAD phase progression
- **Project State Detection** - Automatically classifies projects as NEW, REVERSE_ENGINEERING, or IN_PROGRESS
- **MCP Tools API** - Exposes 5 core tools: `start_project`, `advance_step`, `get_status`, `analyze_project`, `wrap_up_session`
- **Context Persistence** - Maintains state between sessions via JSON files
- **Error Recovery** - Intelligent retry with exponential backoff + WAL (Write-Ahead Logging)
- **Three-Level Validation** - Input, Specification, and Output validation gates
- **Wrap-up Integration** - Automatic session closure with memory consolidation
- **Security Scanner** - OWASP Top 10 vulnerability detection
- **Code Quality Guardrails** - ESLint/Prettier integration
- **Pre-Flight Checks** - Implementation readiness validation

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/Letteriello/vibe-flow.git
cd vibe-flow

# Install dependencies
npm install

# Build the project
npm run build
```

### First Run

```bash
# Start a new project
npm start -- start --name my-project

# Advance to next workflow step
npm start -- advance

# Check current status
npm start -- status

# Analyze existing project
npm start -- analyze ./my-existing-project
```

### Install Globally (Optional)

```bash
# Build first, then link
npm run build
npm link

# Now you can use vibe-flow from anywhere
vibe-flow start --name my-project
vibe-flow advance
vibe-flow status
```

## CLI Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `vibe-flow start` | `vibe-flow init` | Initialize a new project |
| `vibe-flow advance` | `vibe-flow next` | Move to next workflow step |
| `vibe-flow status` | `vibe-flow st` | Show current project status |
| `vibe-flow analyze` | `vibe-flow scan` | Analyze existing project |
| `vibe-flow wrap-up` | `vibe-flow end` | Close session with summary |
| `vibe-flow config` | - | Manage configuration |
| `vibe-flow --help` | `vibe-flow -h` | Show help |

## Configuration

Configuration is stored in `.vibe-flow/config.json`:

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `language` | string | "en" | Language (en, pt, etc.) |
| `verboseMode` | boolean | false | Show detailed logs |
| `autoAdvance` | boolean | false | Auto-advance without prompts |
| `beginnerMode` | boolean | false | Show expanded explanations |

## BMAD Phases

The workflow follows the BMAD methodology:

```
┌─────────────┐
│  1. Analysis │  ← Understand the problem
└──────┬──────┘
       │
┌──────▼──────┐
│  2. Planning │  ← Define the solution
└──────┬──────┘
       │
┌──────▼──────┐
│3. Solutioning│ ← Design the architecture
└──────┬──────┘
       │
┌──────▼──────┐
│4.Implementation│ ← Build it
└─────────────┘
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

### wrap_up_session

Close session with automatic memory consolidation.

```json
{
  "tool": "wrap_up_session",
  "parameters": {
    "projectPath": "./my-project"
  }
}
```

## Integration with Claude Code

### Ralph Autonomous Loop

For autonomous development using Claude Code:

```bash
# Run Ralph autonomous loop (foreground)
bash .ralph/ralph_loop.sh

# Or in background
nohup bash .ralph/ralph_loop.sh > .ralph/logs/ralph.log 2>&1 &
```

For detailed information about running Ralph, MCP tool integration, and log interpretation, see the [Ralph Reference Guide](docs/RALPH-REFERENCE.md).

### Wrap-up Session

For automatic session closure:

```bash
# Run wrap-up (dry-run mode)
bash .ralph/lib/wrap-up/wrap_up.sh .

# Run wrap-up with execution
bash .ralph/lib/wrap-up/wrap_up.sh . --execute
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Watch tests during development
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Run CLI directly
npm start
```

### Development Workflow

1. Make changes in `src/`
2. Run `npm run build` to compile
3. Run `npm test` to verify tests pass
4. Run `npm run lint` to check code style

## Project Structure

```
vibe-flow/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── index.ts               # Main exports
│   ├── types.ts               # TypeScript types
│   ├── config/                # Configuration management
│   ├── context/               # Context persistence
│   ├── command-registry/      # Command registry
│   ├── decision/              # Decision handling
│   ├── error-handler/         # Error recovery & WAL
│   ├── mcp/                   # MCP server & tools
│   ├── state-machine/         # Workflow state machine
│   ├── validation/            # Validation gates
│   ├── security/              # Security scanner
│   ├── quality/               # Code quality gates
│   └── wrap-up/               # Session wrap-up
├── dist/                      # Compiled JavaScript
├── .ralph/                    # Ralph orchestrator
├── .claude/                   # Claude Code settings
├── jest.config.js            # Jest configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

## Requirements

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

## License

MIT

## Related

- [BMAD Framework](https://github.com/Letteriello/bmad) - AI-assisted planning methodology
- [Claude Code](https://claude.com/claude-code) - AI coding assistant
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io) - Protocol for AI tool integration
