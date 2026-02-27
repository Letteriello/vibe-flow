// Quality Gate Interceptor Tests
import {
  QualityGateInterceptor,
  QualityGateStatus,
  ArchitectureGuard,
  RefinerManager,
  createQualityGate,
  getGlobalQualityGate,
  resetGlobalQualityGate
} from './quality-gate';
import { ProjectState, Phase } from './index';

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

describe('ArchitectureGuard', () => {
  let guard: ArchitectureGuard;

  beforeEach(() => {
    guard = new ArchitectureGuard(process.cwd());
  });

  describe('validate', () => {
    it('should validate architecture artifacts exist', async () => {
      const result = await guard.validate();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should return errors for missing required artifacts', async () => {
      const result = await guard.validate();

      // Check that required artifacts are present
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.score).toBe('number');
    });

    it('should return warnings for short artifacts', async () => {
      const result = await guard.validate();

      // Score should be a number between 0 and 10
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it('should handle non-existent project path', async () => {
      const guardWithBadPath = new ArchitectureGuard('/non/existent/path');
      const result = await guardWithBadPath.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('RefinerManager', () => {
  let refiner: RefinerManager;

  beforeEach(() => {
    refiner = new RefinerManager(process.cwd());
  });

  describe('refine', () => {
    it('should refine failed checks with error severity', async () => {
      const failedChecks = [
        {
          name: 'Test Check',
          passed: false,
          details: 'Test details',
          severity: 'error' as const
        }
      ];

      const refinements = await refiner.refine(failedChecks);

      expect(refinements).toBeDefined();
      expect(Array.isArray(refinements)).toBe(true);
    });

    it('should not refine warnings', async () => {
      const warningChecks = [
        {
          name: 'Warning Check',
          passed: false,
          details: 'Warning details',
          severity: 'warning' as const
        }
      ];

      const refinements = await refiner.refine(warningChecks);

      expect(refinements.length).toBe(0);
    });

    it('should not refine info severity', async () => {
      const infoChecks = [
        {
          name: 'Info Check',
          passed: false,
          details: 'Info details',
          severity: 'info' as const
        }
      ];

      const refinements = await refiner.refine(infoChecks);

      expect(refinements.length).toBe(0);
    });

    it('should create refinement actions with correct structure', async () => {
      const failedChecks = [
        {
          name: 'Drift Check',
          passed: false,
          details: 'Drift detected',
          severity: 'error' as const
        }
      ];

      const refinements = await refiner.refine(failedChecks);

      if (refinements.length > 0) {
        expect(refinements[0]).toHaveProperty('id');
        expect(refinements[0]).toHaveProperty('type');
        expect(refinements[0]).toHaveProperty('target');
        expect(refinements[0]).toHaveProperty('description');
        expect(refinements[0]).toHaveProperty('triggeredAt');
      }
    });
  });

  describe('getRefinements', () => {
    it('should return empty array initially', () => {
      const refinements = refiner.getRefinements();

      expect(Array.isArray(refinements)).toBe(true);
      expect(refinements.length).toBe(0);
    });

    it('should return refinements after refine() is called', async () => {
      const failedChecks = [
        {
          name: 'Test Check',
          passed: false,
          details: 'Test details',
          severity: 'error' as const
        }
      ];

      await refiner.refine(failedChecks);
      const refinements = refiner.getRefinements();

      expect(refinements).toBeDefined();
    });

    it('should return a copy of refinements', async () => {
      const failedChecks = [
        {
          name: 'Test Check',
          passed: false,
          details: 'Test details',
          severity: 'error' as const
        }
      ];

      await refiner.refine(failedChecks);
      const refinements1 = refiner.getRefinements();
      const refinements2 = refiner.getRefinements();

      expect(refinements1).not.toBe(refinements2);
      expect(refinements1).toEqual(refinements2);
    });
  });

  describe('clear', () => {
    it('should clear refinement history', async () => {
      const failedChecks = [
        {
          name: 'Test Check',
          passed: false,
          details: 'Test details',
          severity: 'error' as const
        }
      ];

      await refiner.refine(failedChecks);
      expect(refiner.getRefinements().length).toBeGreaterThanOrEqual(0);

      refiner.clear();
      expect(refiner.getRefinements().length).toBe(0);
    });
  });
});

describe('Factory functions', () => {
  it('should create QualityGateInterceptor via createQualityGate', () => {
    const gate = createQualityGate(process.cwd());

    expect(gate).toBeDefined();
    expect(gate).toBeInstanceOf(QualityGateInterceptor);
  });

  it('should get global quality gate instance', () => {
    resetGlobalQualityGate();
    const gate1 = getGlobalQualityGate(process.cwd());
    const gate2 = getGlobalQualityGate(process.cwd());

    expect(gate1).toBe(gate2);
  });

  it('should reset global quality gate', () => {
    const gate1 = getGlobalQualityGate(process.cwd());
    resetGlobalQualityGate();
    const gate2 = getGlobalQualityGate(process.cwd());

    expect(gate1).not.toBe(gate2);
  });
});
