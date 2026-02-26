# BMAD Phases Reference

## Phase Overview

The BMAD methodology guides AI-assisted development through four main phases:

| Phase | Focus | Key Commands |
|-------|-------|--------------|
| 1. Analysis | Understand the problem | `/create-brief`, `/brainstorm-project`, `/market-research` |
| 2. Planning | Define the solution | `/create-prd`, `/create-ux` |
| 3. Solutioning | Design the architecture | `/create-architecture`, `/create-epics-stories`, `/implementation-readiness` |
| 4. Implementation | Build it | `/sprint-planning`, `/create-story` |

---

## Phase 1: Analysis

**Objective:** Understand the problem deeply before defining solutions.

### Activities

- **Product Brief:** Define project vision, goals, and success criteria
- **Market Research:** Analyze competitors, market size, user needs
- **Domain Research:** Understand technical domain and constraints
- **Technical Research:** Explore technology options and feasibility
- **Brainstorming:** Generate and explore ideas

### Commands

```bash
/create-brief      # Create product brief
/brainstorm-project # Run brainstorming session
/market-research   # Research market and competitors
/domain-research  # Research domain
/technical-research # Research technical options
```

### Outputs

- Product Brief (`product-brief.md`)
- Research documents
- Brainstorming notes

---

## Phase 2: Planning

**Objective:** Define the solution with clear requirements.

### Activities

- **PRD Creation:** Define functional and non-functional requirements
- **User Journey Mapping:** Design user experiences
- **Innovation Analysis:** Identify opportunities and differentiators

### Commands

```bash
/create-prd        # Create Product Requirements Document
/validate-prd     # Validate PRD completeness
/edit-prd         # Update existing PRD
```

### Outputs

- Product Requirements Document (PRD)
- User journeys
- Success criteria

---

## Phase 3: Solutioning

**Objective:** Design the technical architecture.

### Activities

- **Architecture Design:** Define technical stack and patterns
- **Epic/Story Breakdown:** Decompose requirements into stories
- **Implementation Readiness:** Verify all prerequisites are met

### Commands

```bash
/create-architecture # Create architecture document
/create-epics-stories # Create epics and stories
/implementation-readiness # Check readiness for implementation
```

### Outputs

- Architecture Decision Document
- Epics and Stories list
- Implementation Readiness Report

---

## Phase 4: Implementation

**Objective:** Build the solution incrementally.

### Activities

- **Sprint Planning:** Plan work for each sprint
- **Story Implementation:** Implement individual stories
- **Code Review:** Review implementation quality
- **Retrospective:** Reflect and improve

### Commands

```bash
/sprint-planning   # Plan sprint work
/create-story     # Create new story for implementation
/dev              # Development mode
/qa               # Quality assurance
/code-review      # Review code
/retrospective    # Sprint retrospective
/sprint-status    # Check sprint status
```

### Outputs

- Working code
- Test coverage
- Sprint reports

---

## vibe-flow Integration

vibe-flow orchestrates the BMAD workflow through:

1. **State Detection:** Automatically detects project phase
2. **Progress Tracking:** Maintains `progress.json` with current state
3. **Context Accumulation:** Builds `project_context.json` incrementally
4. **Step Validation:** Ensures requirements are met before advancing

### Workflow Flow

```
NEW → ANALYSIS → PLANNING → SOLUTIONING → IMPLEMENTATION → COMPLETE
  ↓        ↓          ↓            ↓              ↓
Brief   PRD/UX    Architecture  Epics       Stories
        Research              Readiness
```

---

## Management Commands

| Command | Description |
|---------|-------------|
| `/bmalph-status` | Show current phase, progress |
| `/bmalph-implement` | Transition to implementation |
| `/bmalph-upgrade` | Update bmalph version |
| `/bmalph-doctor` | Check project health |
| `/wrap-up` | Session closure |
