// Structural Check Tests - Verificações Estruturais Profundas
import { StructuralChecker, checkArtifactStructure, validatePhaseStructure, generateStructuralReport, ARTIFACT_STRUCTURES, PHASE_STRUCTURAL_RULES } from './structural-check.js';
import type { ProjectContext, Artifact } from '../types.js';

describe('StructuralChecker', () => {
  const createMockContext = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
    id: 'test-project',
    name: 'Test Project',
    state: 'IN_PROGRESS',
    phase: 'PLANNING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoveries: [],
    decisions: [],
    artifacts: [],
    currentStep: 1,
    totalSteps: 5,
    ...overrides
  });

  const createMockArtifact = (type: string, content = 'Sample content'): Artifact => ({
    id: `${type}-${Date.now()}`,
    type,
    path: `/test/${type}.md`,
    content
  });

  describe('checkArtifactStructure', () => {
    it('should validate PRD structure', () => {
      const artifact = createMockArtifact('prd', `
# Overview
This is a todo app

## Requirements
- Feature 1
- Feature 2

## Features
- Create task
- Delete task
      `);

      const result = checkArtifactStructure(artifact);

      expect(result.artifactType).toBe('prd');
      expect(result.valid).toBe(true);
      expect(result.sectionChecks.length).toBeGreaterThan(0);
    });

    it('should fail PRD without required sections', () => {
      const artifact = createMockArtifact('prd', '# Only Overview');

      const result = checkArtifactStructure(artifact);

      expect(result.valid).toBe(false);
      const missingRequired = result.sectionChecks.filter(s => s.required && !s.present);
      expect(missingRequired.length).toBeGreaterThan(0);
    });

    it('should validate Architecture structure', () => {
      const artifact = createMockArtifact('architecture', `
# Overview
System overview

## Components
- Frontend
- Backend
- Database

## Technology Stack
- React
- Node.js
- PostgreSQL
      `);

      const result = checkArtifactStructure(artifact);

      expect(result.artifactType).toBe('architecture');
      expect(result.valid).toBe(true);
    });

    it('should fail Architecture without technology stack', () => {
      const artifact = createMockArtifact('architecture', `
# Overview
System overview

## Components
- Frontend
- Backend
      `);

      const result = checkArtifactStructure(artifact);

      expect(result.valid).toBe(false);
    });

    it('should validate Plan structure', () => {
      const artifact = createMockArtifact('plan', `
# Phases
1. Phase 1
2. Phase 2

# Timeline
- Week 1-2

# Deliverables
- MVP
- Documentation
      `);

      const result = checkArtifactStructure(artifact);

      expect(result.artifactType).toBe('plan');
      expect(result.valid).toBe(true);
    });

    it('should validate Implementation structure', () => {
      const artifact = createMockArtifact('implementation', `
# Files
- src/index.ts
- src/app.ts

# Code
function hello() { return "hello"; }
      `);

      const result = checkArtifactStructure(artifact);

      expect(result.artifactType).toBe('implementation');
      expect(result.valid).toBe(true);
    });

    it('should handle unknown artifact types gracefully', () => {
      const artifact = createMockArtifact('unknown-type', 'Some content');

      const result = checkArtifactStructure(artifact);

      expect(result.valid).toBe(true);
    });

    it('should check length constraints', () => {
      const artifact = createMockArtifact('prd', 'Short');

      const result = checkArtifactStructure(artifact);

      expect(result.lengthCheck.valid).toBe(false);
      expect(result.lengthCheck.actual).toBe(5);
    });
  });

  describe('validatePhaseStructure', () => {
    it('should pass for PLANNING phase with valid artifacts', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [
          createMockArtifact('prompt', 'User wants a todo app'),
          createMockArtifact('prd', `
# Overview
Project overview

## Requirements
- Feature 1

## Features
- Feature 1
          `)
        ]
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();

      expect(result.valid).toBe(true);
      expect(result.canTransition).toBe(true);
    });

    it('should fail for SOLUTIONING phase without required artifacts', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [createMockArtifact('prd', '# PRD')]
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();

      expect(result.canTransition).toBe(false);
    });

    it('should check artifact count limits', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: Array(10).fill(null).map((_, i) => createMockArtifact(`artifact-${i}`))
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();

      // Should have warning about too many artifacts
      const countGate = result.gates.find(g => g.gateName === 'Artifact Count Gate');
      expect(countGate).toBeDefined();
    });

    it('should validate artifact order', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [
          createMockArtifact('plan', '# Plan'),
          createMockArtifact('architecture', '# Architecture'),
          createMockArtifact('prd', '# PRD')
        ]
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();

      const orderGate = result.gates.find(g => g.gateName === 'Validation Order Gate');
      expect(orderGate?.status).toBe('failed');
    });

    it('should pass with correct artifact order', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [
          createMockArtifact('prd', '# PRD\n## Requirements\n- Feature'),
          createMockArtifact('architecture', '# Architecture\n## Components\n- App'),
          createMockArtifact('plan', '# Plan\n## Phases\n- Phase 1')
        ]
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();

      const orderGate = result.gates.find(g => g.gateName === 'Validation Order Gate');
      expect(orderGate?.status).toBe('passed');
    });
  });

  describe('generateStructuralReport', () => {
    it('should generate readable report', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('prd', '# PRD\n## Requirements\n- Feature')]
      });

      const checker = new StructuralChecker(context);
      const result = checker.validatePhaseStructure();
      const report = checker.generateStructuralReport(result);

      expect(report).toContain('Structural Validation Report');
      expect(report).toContain('Phase: PLANNING');
      expect(report).toContain('Summary');
    });
  });

  describe('ARTIFACT_STRUCTURES', () => {
    it('should have PRD structure defined', () => {
      expect(ARTIFACT_STRUCTURES.prd).toBeDefined();
      expect(ARTIFACT_STRUCTURES.prd.requiredSections).toContain('requirements');
    });

    it('should have Architecture structure defined', () => {
      expect(ARTIFACT_STRUCTURES.architecture).toBeDefined();
      expect(ARTIFACT_STRUCTURES.architecture.requiredSections).toContain('components');
    });

    it('should have Plan structure defined', () => {
      expect(ARTIFACT_STRUCTURES.plan).toBeDefined();
      expect(ARTIFACT_STRUCTURES.plan.requiredSections).toContain('phases');
    });

    it('should have Implementation structure defined', () => {
      expect(ARTIFACT_STRUCTURES.implementation).toBeDefined();
      expect(ARTIFACT_STRUCTURES.implementation.requiredSections).toContain('code');
    });
  });

  describe('PHASE_STRUCTURAL_RULES', () => {
    it('should have rules for ANALYSIS phase', () => {
      expect(PHASE_STRUCTURAL_RULES.ANALYSIS).toBeDefined();
      expect(PHASE_STRUCTURAL_RULES.ANALYSIS.expectedArtifactTypes).toContain('prompt');
    });

    it('should have rules for PLANNING phase', () => {
      expect(PHASE_STRUCTURAL_RULES.PLANNING).toBeDefined();
      expect(PHASE_STRUCTURAL_RULES.PLANNING.expectedArtifactTypes).toContain('prd');
    });

    it('should have rules for SOLUTIONING phase', () => {
      expect(PHASE_STRUCTURAL_RULES.SOLUTIONING).toBeDefined();
      expect(PHASE_STRUCTURAL_RULES.SOLUTIONING.expectedArtifactTypes).toContain('architecture');
    });

    it('should have rules for COMPLETE phase', () => {
      expect(PHASE_STRUCTURAL_RULES.COMPLETE).toBeDefined();
    });

    it('should require approval for SOLUTIONING and COMPLETE', () => {
      expect(PHASE_STRUCTURAL_RULES.SOLUTIONING.requireApproval).toBe(true);
      expect(PHASE_STRUCTURAL_RULES.COMPLETE.requireApproval).toBe(true);
    });
  });

  describe('convenience functions', () => {
    it('validatePhaseStructure should work as standalone function', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('prd', '# PRD\n## Requirements\n- Feature')]
      });

      const result = validatePhaseStructure(context);
      expect(result).toBeDefined();
      expect(result.phase).toBe('PLANNING');
    });

    it('generateStructuralReport should work as standalone function', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [createMockArtifact('prompt', 'Test prompt')]
      });

      const result = validatePhaseStructure(context);
      const report = generateStructuralReport(result);

      expect(report).toContain('ANALYSIS');
    });
  });
});
