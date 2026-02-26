// Quality Gate Interceptor Tests
import { QualityGateInterceptor, QualityGateStatus, Phase } from './quality-gate';
import { ProjectState } from './index';

describe('QualityGateInterceptor', () => {
  let interceptor: QualityGateInterceptor;

  beforeEach(() => {
    interceptor = new QualityGateInterceptor(process.cwd());
  });

  describe('verifyQualityGate', () => {
    it('should run quality gate checks', async () => {
      const mockState: ProjectState = {
        projectName: 'test-project',
        phase: Phase.IMPLEMENTATION,
        currentStep: 1,
        totalSteps: 10,
        lastUpdated: new Date().toISOString(),
        decisions: [],
        errors: [],
        context: {},
        auditLog: []
      };

      const result = await interceptor.verifyQualityGate(mockState);

      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.phase).toBe(Phase.IMPLEMENTATION);
    });

    it('should include drift detection check', async () => {
      const mockState: ProjectState = {
        projectName: 'test-project',
        phase: Phase.IMPLEMENTATION,
        currentStep: 1,
        totalSteps: 10,
        lastUpdated: new Date().toISOString(),
        decisions: [],
        errors: [],
        context: {},
        auditLog: []
      };

      const result = await interceptor.verifyQualityGate(mockState);

      const driftCheck = result.checks.find(c => c.name === 'State Drift Detection');
      expect(driftCheck).toBeDefined();
      expect(driftCheck).toHaveProperty('passed');
      expect(driftCheck).toHaveProperty('details');
    });

    it('should include architecture validation check', async () => {
      const mockState: ProjectState = {
        projectName: 'test-project',
        phase: Phase.IMPLEMENTATION,
        currentStep: 1,
        totalSteps: 10,
        lastUpdated: new Date().toISOString(),
        decisions: [],
        errors: [],
        context: {},
        auditLog: []
      };

      const result = await interceptor.verifyQualityGate(mockState);

      const archCheck = result.checks.find(c => c.name === 'Architecture Validation');
      expect(archCheck).toBeDefined();
      expect(archCheck).toHaveProperty('passed');
      expect(archCheck).toHaveProperty('details');
    });

    it('should return proper status structure', async () => {
      const mockState: ProjectState = {
        projectName: 'test-project',
        phase: Phase.IMPLEMENTATION,
        currentStep: 1,
        totalSteps: 10,
        lastUpdated: new Date().toISOString(),
        decisions: [],
        errors: [],
        context: {},
        auditLog: []
      };

      const result = await interceptor.verifyQualityGate(mockState);

      expect(Object.values(QualityGateStatus)).toContain(result.status);
      expect(result).toHaveProperty('canTransition');
      expect(typeof result.canTransition).toBe('boolean');
    });
  });

  describe('getConfig', () => {
    it('should return enabled checks', () => {
      const config = interceptor.getConfig();

      expect(config).toBeDefined();
      expect(config.enabledChecks).toContain('StateDriftDetector');
      expect(config.enabledChecks).toContain('ArchitectureGuard');
    });
  });

  describe('canBypass', () => {
    it('should not allow bypass', () => {
      expect(interceptor.canBypass()).toBe(false);
    });
  });
});

describe('QualityGateStatus', () => {
  it('should have all expected status values', () => {
    expect(QualityGateStatus.PASSED).toBe('PASSED');
    expect(QualityGateStatus.FAILED).toBe('FAILED');
    expect(QualityGateStatus.WARNING).toBe('WARNING');
    expect(QualityGateStatus.SKIPPED).toBe('SKIPPED');
  });
});
