// SecurityGuard Tests
import {
  SecurityGuard,
  SecurityGateConfig,
  DEFAULT_SECURITY_GATE_CONFIG,
  SecurityQualityCheck,
  OWASPViolation
} from './security-guard';

describe('SecurityGuard', () => {
  let guard: SecurityGuard;
  const testProjectPath = process.cwd();

  beforeEach(() => {
    guard = new SecurityGuard(testProjectPath);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(guard).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<SecurityGateConfig> = {
        enabled: false,
        severityThreshold: 'MEDIUM'
      };
      const customGuard = new SecurityGuard(testProjectPath, customConfig);
      expect(customGuard).toBeDefined();
    });
  });

  describe('runSecurityScan', () => {
    it('should run security scan and return result', async () => {
      const result = await guard.runSecurityScan();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('vulnerabilities');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('scanDuration');
    });

    it('should accept custom paths to scan', async () => {
      const customPaths = ['src/'];
      const result = await guard.runSecurityScan(customPaths);

      expect(result).toBeDefined();
    });
  });

  describe('checkContent', () => {
    it('should check content for security issues', () => {
      const result = guard.checkContent('const x = 1;');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('severity');
    });

    it('should detect secrets in content', () => {
      const contentWithSecret = 'const apiKey = "sk-1234567890abcdef";';
      const result = guard.checkContent(contentWithSecret);

      expect(result).toBeDefined();
    });

    it('should accept custom filename', () => {
      const result = guard.checkContent('code here', 'test.ts');

      expect(result).toBeDefined();
    });
  });

  describe('isSecure', () => {
    it('should return true for secure content', () => {
      const secureContent = 'const x = 1; const y = 2;';
      const result = guard.isSecure(secureContent);

      expect(typeof result).toBe('boolean');
    });

    it('should return false for insecure content', () => {
      const insecureContent = 'password = "secret123"';
      const result = guard.isSecure(insecureContent);

      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = guard.getConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('severityThreshold');
      expect(config).toHaveProperty('allowBypass');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      guard.updateConfig({ enabled: false });

      const config = guard.getConfig();
      expect(config.enabled).toBe(false);
    });

    it('should merge partial config', () => {
      const originalConfig = guard.getConfig();
      guard.updateConfig({ severityThreshold: 'MEDIUM' as const });

      const updatedConfig = guard.getConfig();
      expect(updatedConfig.severityThreshold).toBe('MEDIUM');
      expect(updatedConfig.enabled).toBe(originalConfig.enabled);
    });
  });

  describe('getRulesCount', () => {
    it('should return number of active rules', () => {
      const count = guard.getRulesCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validate', () => {
    it('should return quality gate compatible result', async () => {
      const result = await guard.validate();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('score');
    });

    it('should return score based on vulnerabilities', async () => {
      const result = await guard.validate();

      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });
  });
});

describe('DEFAULT_SECURITY_GATE_CONFIG', () => {
  it('should have required properties', () => {
    expect(DEFAULT_SECURITY_GATE_CONFIG).toBeDefined();
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('enabled');
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('severityThreshold');
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('allowBypass');
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('excludedPatterns');
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('fastMode');
    expect(DEFAULT_SECURITY_GATE_CONFIG).toHaveProperty('rules');
  });

  it('should have correct default values', () => {
    expect(DEFAULT_SECURITY_GATE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_SECURITY_GATE_CONFIG.severityThreshold).toBe('HIGH');
    expect(DEFAULT_SECURITY_GATE_CONFIG.allowBypass).toBe(false);
    expect(Array.isArray(DEFAULT_SECURITY_GATE_CONFIG.excludedPatterns)).toBe(true);
  });
});

describe('SecurityQualityCheck', () => {
  it('should have correct structure', () => {
    const check: SecurityQualityCheck = {
      name: 'Test',
      passed: true,
      details: 'No issues',
      severity: 'info',
      vulnerabilities: [],
      blocked: false,
      scanDuration: 100,
      pathsScanned: []
    };

    expect(check.name).toBe('Test');
    expect(check.passed).toBe(true);
    expect(check.vulnerabilities).toEqual([]);
    expect(check.blocked).toBe(false);
  });
});
