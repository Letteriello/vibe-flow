# Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for vibe-flow, decomposing requirements into implementable stories.

## Requirements Coverage

- **Functional Requirements:** 17 (FR-001 to FR-017)
- **Non-Functional Requirements:** 9 (NFR-001 to NFR-009)
- **Total Stories:** 24

---

## Epic 1: Nucleus & State Machine

**Objective:** Build the deterministic foundation of the flow with state management, atomic persistence, and drift detection.

### Stories

| Story | Description |
|-------|-------------|
| 1.1 | Deterministic Workflow State Machine |
| 1.2 | Project State Classification |
| 1.3 | Atomic State Persistence |
| 1.4 | State Drift Detection & Recovery |

**FRs covered:** FR1, FR2, FR3, FR13

---

## Epic 2: Runtime & Execution Layer

**Objective:** Deliver the operational execution layer with MCP tools, command registry, strategic pauses, and error recovery.

### Stories

| Story | Description |
|-------|-------------|
| 2.1 | MCP Tools Registration |
| 2.2 | Tool - start_project |
| 2.3 | Tool - advance_step |
| 2.4 | Tool - get_status |
| 2.5 | Tool - analyze_project |
| 2.6 | Command Registry & CLI Wrapper Integration |
| 2.7 | Intelligent Error Recovery with Retry Policy |
| 2.8 | Strategic Human Pauses (Hit-Pause) |

**FRs covered:** FR4, FR5, FR6, FR8

---

## Epic 3: Context & Quality Gates

**Objective:** Deliver decision quality and consistency through three-level validation, contextual prompting, and readiness gating.

### Stories

| Story | Description |
|-------|-------------|
| 3.1 | Three-Level Step Validation Framework |
| 3.2 | Context-Aware Prompt Generation |
| 3.3 | Specification Readiness Gate |
| 3.4 | Context Aggregation & Summarization |

**FRs covered:** FR14, FR15, FR17

---

## Epic 4: Non-Functional Reliability

**Objective:** Deliver cross-cutting reliability with explicit performance, resume, integrity, stagnation, memory, and compliance goals.

### Stories

| Story | Description |
|-------|-------------|
| 4.1 | Workflow Resume Rate Testing |
| 4.2 | State Detection Accuracy Testing |
| 4.3 | Time-to-First-Workflow Measurement |
| 4.4 | Context Integrity & Atomic Writes |
| 4.5 | CLI Responsiveness Optimization |
| 4.6 | Memory Efficiency & Context Compaction |
| 4.7 | Project Stagnation Detection |
| 4.8 | Open Source Compliance |

**NFRs covered:** NFR1, NFR2, NFR3, NFR4, NFR5, NFR6, NFR7, NFR8, NFR9

---

## Epic 5: UX, Setup & Configuration

**Objective:** Deliver frictionless onboarding, adaptive configuration, beginner experience, and advanced control.

### Stories

| Story | Description |
|-------|-------------|
| 5.1 | Smart Installation & Auto-Configuration |
| 5.2 | Configuration Fallback Mechanism |
| 5.3 | Beginner Mode Explicitness |
| 5.4 | Controlled Workflow Override with Audit Trail |
| 5.5 | Global Preferences Management |
| 5.6 | analyze_project Structured Output |

**FRs covered:** FR7, FR9, FR10, FR11, FR12, FR16

---

## Summary

| Epic | Focus | Stories |
|------|-------|---------|
| Epic 1 | Foundation | 4 |
| Epic 2 | Runtime | 8 |
| Epic 3 | Quality | 4 |
| Epic 4 | Reliability | 8 |
| Epic 5 | UX/Setup | 6 |

**Total:** 5 Epics, 24 Stories

---

*Full Epics document available in: `_bmad-output/planning-artifacts/epics.md`*
