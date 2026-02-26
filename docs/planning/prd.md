# Product Requirements Document (Summary)

## Executive Summary

**vibe-flow** is an MCP workflow orchestration product that transforms the bmalph framework from a command-intensive experience into an intuitive, guided workflow. It automatically detects project state, advances workflow steps atomically, and prompts users only at decision points.

### Problem

The current bmalph experience requires users to remember and execute many slash commands (`/bmalph BP`, `/bmalph MR`, etc.), often consulting documentation to proceed correctly.

### Solution

vibe-flow introduces an MCP-focused workflow layer over bmalph with:
- Automatic workflow orchestration via state machine
- Three project state detection (NEW, REVERSE_ENGINEERING, IN_PROGRESS)
- Atomic step execution with context accumulation
- Interaction only at strategic decision points
- Simple APIs: `start_project`, `advance_step`, `get_status`, `analyze_project`

---

## Success Criteria

### User Success

| Metric | MVP Target | Growth Target |
|--------|------------|---------------|
| Cycle completion rate | ≥50% | ≥65% |
| Time reduction vs baseline | ≥40% | ≥40% |
| External documentation queries | Zero | Zero |

### Technical Success

| Metric | Target |
|--------|--------|
| Workflow resume rate | ≥95% |
| State detection accuracy | ≥95% |

---

## Product Scope

| Scope | Definition |
|-------|-----------|
| **MVP** | Workflow Orchestrator, Project Scanner (3 states), State Manager, Command Registry, CLI wrapper, MCP Tools API |
| **Growth** | Context Aggregator, Reverse Engineering, Auto-configuration, Beginner Mode |
| **Vision** | HTTP/SSE remote operation, Advanced observability, Team governance |

---

## Functional Requirements

### Core Requirements

1. **FR-001:** Workflow orchestration via state machine with deterministic transitions
2. **FR-002:** Project state detection (NEW, REVERSE_ENGINEERING, IN_PROGRESS)
3. **FR-003:** Context persistence between sessions via JSON files
4. **FR-004:** MCP Tools API with 4 tools
5. **FR-005:** Command Registry mapping phases to CLI commands
6. **FR-006:** Decision point interaction with human input
7. **FR-007:** Auto-configuration on installation
8. **FR-008:** Error recovery with retry policy
9. **FR-009:** Configuration management
10. **FR-010:** Configuration fallback mechanism
11. **FR-011:** Beginner mode with visual feedback
12. **FR-012:** Analyze project output
13. **FR-013:** State drift detection and recovery
14. **FR-014:** Three-level step validation
15. **FR-015:** Context-based prompting
16. **FR-016:** Controlled workflow override
17. **FR-017:** Specification readiness gate

### Wrap-up Requirements

18. **FR-018:** Session wrap-up trigger
19. **FR-019:** Auto-commit execution
20. **FR-020:** Context persistence between sessions
21. **FR-021:** Memory routing
22. **FR-022:** Human-in-the-loop approval
23. **FR-023:** Self-improvement engine

---

## Non-Functional Requirements

| NFR | Requirement | Target |
|-----|-------------|--------|
| NFR-001 | Workflow resume rate | ≥95% |
| NFR-002 | State detection accuracy | ≥95% |
| NFR-003 | Installation to first workflow | ≤7 days |
| NFR-004 | Time reduction | ≥40% |
| NFR-005 | Context integrity | Atomic writes + validation |
| NFR-006 | CLI responsiveness | <500ms |
| NFR-007 | Memory efficiency | ≤100MB context |
| NFR-008 | Project stagnation detection | >3 days |
| NFR-009 | Open source compliance | MIT/Apache-2.0 |

---

## Personas

| Type | Persona | Description |
|------|---------|-------------|
| Primary | Independent AI Builder | Builds AI-powered applications |
| Primary | Product/Engineering Integrator | Integrates with existing teams |
| Secondary | Team Lead / Tech Lead | Monitors multiple projects |
| Secondary | Community Contributor - Beginner | New to bmalph |
| Secondary | Community Contributor - Reverse Engineering | Analyzes existing projects |

---

## Glossary

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol - standard for AI application communication |
| **CLI Wrapper** | Layer encapsulating existing commands with orchestration |
| **JSON State** | State persistence in JSON format |
| **State Machine** | Design pattern managing state transitions |
| **Checkpoint** | Workflow point where system pauses for human input |
| **Context Drift** | Divergence between persisted state and actual project state |
| **bmalph** | BMAD methodology framework for AI-assisted planning |
| **wrap-up** | Session closure skill with auto-commit and context saving |

---

*Full PRD available in: `_bmad-output/planning-artifacts/prd.md`*
