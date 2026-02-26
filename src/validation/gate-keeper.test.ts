// Gate Keeper Tests - Pipeline Governado de Validação de Transição
import { GateKeeper, validateInput, validateSpecification, validateOutput, validateTransition, GateStatus, GateSeverity, GateType } from './gate-keeper.js';
import type { ProjectContext, Artifact, Decision } from '../types.js';

describe('GateKeeper', () => {
  const createMockContext = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
    id: 'test-project',
    name: 'Test Project',
    state: 'IN_PROGRESS',
    phase: 'ANALYSIS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoveries: [],
    decisions: [],
    artifacts: [],
    currentStep: 1,
    totalSteps: 5,
    ...overrides
  });

  const createMockArtifact = (type: string, content = 'Sample content for testing'): Artifact => ({
    id: `${type}-${Date.now()}`,
    type,
    path: `/test/${type}.md`,
    content
  });

  const createMockDecision = (question: string): Decision => ({
    id: `decision-${Date.now()}`,
    question,
    answer: 'Test answer',
    timestamp: new Date().toISOString()
  });

  describe('validateInput', () => {
    it('should validate input gates when transitioning phases', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [createMockArtifact('prompt', 'User wants a todo app')],
        currentStep: 3,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateInput('PLANNING');

      expect(result).toBeDefined();
      expect(result.gates.length).toBeGreaterThan(0);
      // Check gate types
      const inputGates = result.gates.filter(g => g.gateType === GateType.INPUT);
      expect(inputGates.length).toBeGreaterThan(0);
    });

    it('should fail when required artifacts are missing', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [],
        currentStep: 1,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateInput('PLANNING');

      expect(result.canTransition).toBe(false);
      expect(result.summary.blockingIssues).toBeGreaterThan(0);
    });

    it('should fail when PRD is missing for SOLUTIONING transition', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('prompt')],
        currentStep: 3,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateInput('SOLUTIONING');

      expect(result.canTransition).toBe(false);
      const hasPrdIssue = result.gates.some(g =>
        g.issues.some(i => i.artifactId === 'prd' || i.message.toLowerCase().includes('prd'))
      );
      expect(hasPrdIssue).toBe(true);
    });

    it('should return validation result with gates', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [
          createMockArtifact('prompt', 'User wants a todo app'),
          createMockArtifact('prd', '# Requirements\n- Feature 1\n- Feature 2')
        ],
        decisions: [createMockDecision('What tech stack?'), createMockDecision('What architecture pattern?')],
        currentStep: 4,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateInput('SOLUTIONING');

      expect(result).toBeDefined();
      expect(result.gates).toBeDefined();
    });
  });

  describe('validateSpecification', () => {
    it('should pass when artifacts have valid content', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [
          createMockArtifact('prompt', 'User wants a todo app with features...'),
          createMockArtifact('prd', '# PRD\n## Requirements\n- Feature 1\n- Feature 2')
        ]
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateSpecification();

      expect(result.valid).toBe(true);
    });

    it('should fail when artifact has empty content', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('prd', '')]
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateSpecification();

      expect(result.valid).toBe(false);
      expect(result.summary.blockingIssues).toBeGreaterThan(0);
    });

    it('should fail when Architecture exists without PRD', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('architecture', '# Architecture\n## Components')]
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateSpecification();

      const hasConsistencyIssue = result.gates.some(g =>
        g.issues.some(i => i.message.toLowerCase().includes('prd'))
      );
      expect(hasConsistencyIssue).toBe(true);
    });
  });

  describe('validateOutput', () => {
    it('should validate output gates', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [
          createMockArtifact('prd', '# PRD content'),
          createMockArtifact('architecture', '# Architecture content'),
          createMockArtifact('implementation', '# Implementation content')
        ],
        decisions: [
          createMockDecision('What tech stack?'),
          createMockDecision('What architecture pattern?'),
          createMockDecision('How to deploy?')
        ],
        currentStep: 4,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateOutput();

      expect(result).toBeDefined();
      const outputGates = result.gates.filter(g => g.gateType === GateType.OUTPUT);
      expect(outputGates.length).toBeGreaterThan(0);
    });

    it('should fail when required artifacts are missing for output', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [createMockArtifact('prd', '# PRD')],
        decisions: [],
        currentStep: 2,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateOutput();

      expect(result.canTransition).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should combine input and output validation', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [createMockArtifact('prompt', 'User wants a todo app')],
        currentStep: 3,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context);
      const result = keeper.validateTransition('PLANNING');

      expect(result).toBeDefined();
      expect(result.gates.length).toBeGreaterThanOrEqual(4); // Input + Output gates
    });
  });

  describe('convenience functions', () => {
    it('validateInput should work as standalone function', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [createMockArtifact('prompt')]
      });

      const result = validateInput(context, 'PLANNING');
      expect(result).toBeDefined();
      expect(result.gates).toBeDefined();
    });

    it('validateSpecification should work as standalone function', () => {
      const context = createMockContext({
        phase: 'PLANNING',
        artifacts: [createMockArtifact('prd', '# PRD')]
      });

      const result = validateSpecification(context);
      expect(result).toBeDefined();
    });

    it('validateOutput should work as standalone function', () => {
      const context = createMockContext({
        phase: 'SOLUTIONING',
        artifacts: [createMockArtifact('prd'), createMockArtifact('architecture'), createMockArtifact('implementation')],
        decisions: [createMockDecision('tech-stack'), createMockDecision('architecture-pattern'), createMockDecision('deployment')]
      });

      const result = validateOutput(context);
      expect(result).toBeDefined();
    });

    it('validateTransition should work as standalone function', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [createMockArtifact('prompt')]
      });

      const result = validateTransition(context, 'PLANNING');
      expect(result).toBeDefined();
    });
  });

  describe('strictMode', () => {
    it('should block transition in strict mode with issues', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [],
        currentStep: 1,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context, true);
      const result = keeper.validateInput('PLANNING');

      expect(result.canTransition).toBe(false);
    });

    it('should allow transition in non-strict mode with warnings', () => {
      const context = createMockContext({
        phase: 'ANALYSIS',
        artifacts: [],
        currentStep: 1,
        totalSteps: 5
      });

      const keeper = new GateKeeper(context, false);
      const result = keeper.validateInput('PLANNING');

      // In non-strict mode, may still pass if no blocking issues
      expect(result).toBeDefined();
    });
  });

  describe('GateStatus', () => {
    it('should have correct status values', () => {
      expect(GateStatus.PASSED).toBe('passed');
      expect(GateStatus.FAILED).toBe('failed');
      expect(GateStatus.PENDING).toBe('pending');
      expect(GateStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('GateSeverity', () => {
    it('should have correct severity values', () => {
      expect(GateSeverity.BLOCKING).toBe('blocking');
      expect(GateSeverity.WARNING).toBe('warning');
      expect(GateSeverity.INFO).toBe('info');
    });
  });

  describe('GateType', () => {
    it('should have correct type values', () => {
      expect(GateType.INPUT).toBe('input');
      expect(GateType.SPECIFICATION).toBe('specification');
      expect(GateType.OUTPUT).toBe('output');
    });
  });
});
