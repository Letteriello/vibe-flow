# vibe-flow Documentation

> Workflow orchestration system for AI development agents

## Overview

**vibe-flow** is a CLI tool that transforms the BMAD framework from a command-intensive experience into an intuitive, guided workflow. It automatically detects project state, advances workflow steps atomically, and prompts users only at decision points.

## Documentation Structure

```
docs/
├── index.md               # This file - project overview
├── user-manual.md         # User guide and CLI commands
├── architecture/          # Technical architecture
│   ├── overview.md
│   └── patterns.md
├── planning/              # Planning artifacts
│   ├── prd.md
│   ├── ux-design.md
│   ├── epics.md
│   └── research/
├── implementation/        # Implementation stories
│   └── stories.md
└── reference/             # Reference materials
    └── bmad-phases.md
```

## Quick Links

| Document | Description |
|----------|-------------|
| [User Manual](user-manual.md) | Installation, CLI commands, configuration |
| [Architecture](architecture/overview.md) | Technical design and decisions |
| [PRD](planning/prd.md) | Product Requirements Document |
| [Epics](planning/epics.md) | Epic and story breakdown |
| [UX Design](planning/ux-design.md) | UX specification |

## Getting Started

```bash
# Install
cd vibe-flow && npm install

# Build
npm run build

# Start a new project
node dist/cli.js start my-project

# Advance workflow
node dist/cli.js advance

# Check status
node dist/cli.js status
```

## BMAD Phases

The workflow follows the BMAD methodology:

1. **Analysis** - Understand the problem
2. **Planning** - Define the solution
3. **Solutioning** - Design the architecture
4. **Implementation** - Build it

## Project Status

- **Phase:** IMPLEMENTATION
- **Stories Completed:** 2/24
- **Technology:** TypeScript + Node.js

---

*Generated: 2026-02-25*
