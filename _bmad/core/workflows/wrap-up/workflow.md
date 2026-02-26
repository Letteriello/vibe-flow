# Wrap-up Workflow

## Overview
Automated session closure that organizes the project, consolidates learning, self-improves the AI, and generates shareable content.

## Phases

### Step 01: Configuration & Validation
- Load user preferences
- Load wrap-up configuration
- Validate required tools (git, jq)
- Present configuration summary

### Step 02: Ship It
- Run git status
- Auto-commit with Conventional Commits
- File organization
- Push (optional)

### Step 03: Remember It
- Analyze session context
- Route learnings to memory hierarchy
- Update CLAUDE.md, .claude/rules/, CLAUDE.local.md

### Step 04: Self Improve
- Detect error patterns
- Generate rules
- Auto-apply improvements

### Step 05: Publish It (optional)
- Analyze session for content
- Generate platform-specific drafts
- Save for review

## Usage
```bash
.ralph/lib/wrap-up/config.sh
.ralph/lib/wrap-up/ship_it.sh
.ralph/lib/wrap-up/memory_router.sh
.ralph/lib/wrap-up/self_improver.sh
.ralph/lib/wrap-up/content_generator.sh
```
