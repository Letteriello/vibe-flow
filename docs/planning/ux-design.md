# UX Design Specification (Summary)

## Core Experience

The central experience of vibe-flow is guiding the user automatically through the BMAD methodological flow, guaranteeing clear specification before implementation.

### Defining Experience

> "The AI that remembers what you did"

The product transforms a manual process (continuous command memorization and typing) into an MCP-assisted journey with intelligent interaction, clear questions, and progressive documentation building useful for AI coding.

### User Emotional States

| State | Emotion | Need |
|-------|---------|------|
| Exploration | Curiosity → Cautionary optimism | Clarity about product |
| Engagement | Growing confidence | Competence, transparency |
| Flow | Absorption | Clear, predictable progression |
| Continuity | Relief | Nothing was lost |

---

## UX Principles

1. **Guided flow over manual commands** - System leads, user decides
2. **Three-level validation** - Input, Specification, Output
3. **Absolute operational clarity** - No ambiguity
4. **Multi-platform consistency** - Claude Code, VS Code, Cursor
5. **Context as specification** - Each interaction builds FRs and project spec
6. **State recovery is a feature** - Automatic resume with complete context
7. **Transparent progression** - Always show current state and next step

---

## Validation Framework

### Level 1: Step Input Validation
- Present current context summary
- Show current and proposed step
- Request explicit user confirmation

### Level 2: Specification Validation
- Generate complete operational spec (FRs)
- Validate project specification
- Ensure ≥80% completeness

### Level 3: Step Output Validation
- Validate result consistency
- Detect anomalies
- Provide clear feedback

---

## Design System (CLI)

### Color Palette (ANSI)

| Color | Usage | Code |
|-------|-------|------|
| Red | Errors | `\x1b[31m` |
| Green | Success | `\x1b[32m` |
| Yellow | Warnings | `\x1b[33m` |
| Blue | Info | `\x1b[34m` |
| Magenta | Headers | `\x1b[35m` |
| Gray | Muted | `\x1b[90m` |

### Symbol Set

| Symbol | Meaning |
|--------|---------|
| ✓ | Success/Done |
| ✗ | Error/Failed |
| ⚠ | Warning |
| ✨ | Milestone |
| 📋 | Todo/List |
| 💾 | Save/Commit |

---

## CLI Layout

```
=== TITLE ===
---
✓ item / ✗ item
[████████░░] 75%
---
```

---

## Feature Flags

| Flag | Description |
|------|-------------|
| `--no-color` | Disable colors |
| `--json` | JSON output (for pipes) |
| `--plain` | Plain output |
| `--dry-run` | Preview without executing |
| `--verbose` | Stack traces |

---

## Key Interactions

| Interaction | Behavior |
|-------------|----------|
| Auto-trigger | When phase ends, suggests wrap-up |
| Preview | Shows diff + commit message |
| Approval | approve / deny / edit message |
| Memory | Saves to appropriate location |

---

## Experience Moments

**Success Moments:**
- User advances full flow **without knowing which command to use**
- User completes a cycle **with all context organized for implementation**
- User returns after days **and context is perfectly restored**
- Error is recovered **automatically and user is notified**

**Failure Moments:**
- BMAD order is **incorrect** for specific project with no override
- Context is **lost between sessions** without possible recovery
- System **generates ambiguous specification** contradicting existing context

---

*Full UX Spec available in: `_bmad-output/planning-artifacts/ux-design-specification.md`*
