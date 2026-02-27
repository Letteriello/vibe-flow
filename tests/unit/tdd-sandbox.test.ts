// Unit tests for SecuritySandboxWrapper

import { SecuritySandboxWrapper, SandboxConfig, SandboxResult } from '../../src/execution/security/tdd-sandbox';

describe('SecuritySandboxWrapper', () => {
  let sandbox: SecuritySandboxWrapper;

  beforeEach(() => {
    sandbox = new SecuritySandboxWrapper({ verbose: false });
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const wrapper = new SecuritySandboxWrapper();
      expect(wrapper).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: SandboxConfig = {
        blockNetwork: true,
        restrictFilesystem: false,
        workingDir: '/test',
        timeout: 30000,
      };
      const wrapper = new SecuritySandboxWrapper(config);
      expect(wrapper).toBeDefined();
    });
  });

  describe('createSanitizedEnv', () => {
    it('should remove AWS credentials', () => {
      // Set test environment variables
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      const env = sandbox.getSanitizedEnv();

      expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();

      // Clean up
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    });

    it('should remove GitHub tokens', () => {
      process.env.GITHUB_TOKEN = 'ghp_test';

      const env = sandbox.getSanitizedEnv();

      expect(env.GITHUB_TOKEN).toBeUndefined();

      delete process.env.GITHUB_TOKEN;
    });

    it('should remove OpenAI keys', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const env = sandbox.getSanitizedEnv();

      expect(env.OPENAI_API_KEY).toBeUndefined();

      delete process.env.OPENAI_API_KEY;
    });

    it('should preserve PATH variable', () => {
      process.env.PATH = '/usr/bin:/bin';

      const env = sandbox.getSanitizedEnv();

      expect(env.PATH).toBe('/usr/bin:/bin');

      delete process.env.PATH;
    });

    it('should preserve NODE_ENV', () => {
      delete process.env.NODE_ENV;

      const env = sandbox.getSanitizedEnv();

      expect(env.NODE_ENV).toBe('test');
    });

    it('should remove database URLs', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/db';

      const env = sandbox.getSanitizedEnv();

      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.MONGODB_URI).toBeUndefined();

      delete process.env.DATABASE_URL;
      delete process.env.MONGODB_URI;
    });

    it('should remove Anthropic API keys', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const env = sandbox.getSanitizedEnv();

      expect(env.ANTHROPIC_API_KEY).toBeUndefined();

      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should remove Stripe keys', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const env = sandbox.getSanitizedEnv();

      expect(env.STRIPE_SECRET_KEY).toBeUndefined();

      delete process.env.STRIPE_SECRET_KEY;
    });
  });

  describe('isCommandAllowed', () => {
    it('should allow Jest command', () => {
      const result = sandbox.isCommandAllowed('npx jest tests/unit/test.ts');
      expect(result.allowed).toBe(true);
    });

    it('should allow Vitest command', () => {
      const result = sandbox.isCommandAllowed('npx vitest run');
      expect(result.allowed).toBe(true);
    });

    it('should allow npm test', () => {
      const result = sandbox.isCommandAllowed('npm test');
      expect(result.allowed).toBe(true);
    });

    it('should block curl http commands', () => {
      const result = sandbox.isCommandAllowed('curl http://evil.com');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked pattern');
    });

    it('should block wget commands', () => {
      const result = sandbox.isCommandAllowed('wget http://example.com');
      expect(result.allowed).toBe(false);
    });

    it('should block eval', () => {
      const result = sandbox.isCommandAllowed('eval("malicious")');
      expect(result.allowed).toBe(false);
    });

    it('should block exec with process.env', () => {
      const result = sandbox.isCommandAllowed('exec(process.env.AWS_SECRET)');
      expect(result.allowed).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute a simple echo command', async () => {
      const result = await sandbox.execute('echo "test"');
      expect(result.sandboxed).toBe(true);
      expect(result.output).toContain('test');
    }, 10000);

    it('should handle command timeout', async () => {
      const quickSandbox = new SecuritySandboxWrapper({ timeout: 100 });
      const result = await quickSandbox.execute(process.platform === 'win32' ? 'ping -n 10 127.0.0.1' : 'sleep 5 && echo done');
      expect(result.exitCode).not.toBe(0);
    }, 15000);
  });

  describe('runJestSandboxed', () => {
    it('should execute Jest with sandbox', async () => {
      const result = await sandbox.runJestSandboxed('tests/unit/failure-analyzer.test.ts');
      expect(result.sandboxed).toBe(true);
      // Jest may not be configured in test env, but sandbox wrapper should work
      expect(result).toHaveProperty('exitCode');
    }, 30000);
  });

  describe('runVitestSandboxed', () => {
    it('should execute Vitest with sandbox', async () => {
      const result = await sandbox.runVitestSandboxed('tests/unit/failure-analyzer.test.ts');
      expect(result.sandboxed).toBe(true);
      expect(result).toHaveProperty('exitCode');
    }, 30000);
  });
});
