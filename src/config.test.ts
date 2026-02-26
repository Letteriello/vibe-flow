// Config Manager Tests - User preferences and configuration
import { ConfigManager, VibeFlowConfig, UserPreferences, WrapUpConfig, ValidationResult } from './config/index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir, homedir } from 'os';

const TEST_CONFIG_DIR = join(tmpdir(), 'vibe-flow-test-config-' + Date.now());

// Mock the config path to use temp directory
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => TEST_CONFIG_DIR
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(async () => {
    await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });
    configManager = new ConfigManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('load', () => {
    it('should load default config when no config exists', async () => {
      const config = await configManager.load();

      expect(config).toBeDefined();
      expect(config.preferences).toEqual({
        language: 'en',
        autoAdvance: false,
        verboseMode: false,
        beginnerMode: false
      });
      // wrapUp is always enabled - no 'enabled' property exists
    });

    it('should load custom config when file exists', async () => {
      const customConfig: VibeFlowConfig = {
        preferences: {
          language: 'pt-BR',
          autoAdvance: true,
          verboseMode: true,
          beginnerMode: true
        },
        wrapUp: {
          trigger: {
            postPhase: true,
            manual: false,
            idle: true,
            idleTimeoutMinutes: 60
          },
          phases: {
            shipIt: { enabled: true, autoCommit: true, autoPush: true },
            rememberIt: { enabled: true, consolidateClaudeMd: true },
            selfImprove: { enabled: true, analyzeErrors: true },
            publishIt: { enabled: true }
          },
          safety: {
            requireTestsPass: true,
            secretDetection: true
          }
        },
        projectPath: '/test/path'
      };

      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      await fs.mkdir(dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(customConfig));

      const config = await configManager.load();

      expect(config.preferences.language).toBe('pt-BR');
      expect(config.preferences.autoAdvance).toBe(true);
      // wrapUp is always enabled - no 'enabled' property exists
      expect(config.wrapUp.phases.shipIt.autoPush).toBe(true);
    });

    it('should handle corrupted JSON gracefully', async () => {
      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      await fs.mkdir(dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, 'invalid json{');

      const config = await configManager.load();

      expect(config.preferences.language).toBe('en');
    });
  });

  describe('save', () => {
    it('should save config to disk', async () => {
      await configManager.load();
      await configManager.save();

      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      const content = await fs.readFile(configPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.preferences).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should validate valid config', () => {
      const result = configManager.validate({
        preferences: { language: 'en', autoAdvance: true, verboseMode: false, beginnerMode: false }
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid language', () => {
      const result = configManager.validate({
        preferences: { language: 'invalid-lang', autoAdvance: false, verboseMode: false, beginnerMode: false }
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid language: invalid-lang. Must be one of: en, pt-BR, pt, es');
    });

    it('should reject invalid idleTimeoutMinutes (too low)', () => {
      const result = configManager.validate({
        wrapUp: {
          enabled: false,
          trigger: {
            postPhase: false,
            manual: true,
            idle: false,
            idleTimeoutMinutes: 0
          },
          phases: {
            shipIt: { enabled: true, autoCommit: true, autoPush: false },
            rememberIt: { enabled: true, consolidateClaudeMd: true },
            selfImprove: { enabled: true, analyzeErrors: true },
            publishIt: { enabled: false }
          },
          safety: {
            dryRunDefault: true,
            requireTestsPass: false,
            secretDetection: true
          }
        } as any
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('idleTimeoutMinutes must be between 1 and 1440 (24 hours)');
    });

    it('should reject invalid idleTimeoutMinutes (too high)', () => {
      const result = configManager.validate({
        wrapUp: {
          enabled: false,
          trigger: {
            postPhase: false,
            manual: true,
            idle: false,
            idleTimeoutMinutes: 2000
          },
          phases: {
            shipIt: { enabled: true, autoCommit: true, autoPush: false },
            rememberIt: { enabled: true, consolidateClaudeMd: true },
            selfImprove: { enabled: true, analyzeErrors: true },
            publishIt: { enabled: false }
          },
          safety: {
            dryRunDefault: true,
            requireTestsPass: false,
            secretDetection: true
          }
        } as any
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('idleTimeoutMinutes must be between 1 and 1440 (24 hours)');
    });

    it('should accept valid idleTimeoutMinutes boundaries', () => {
      const resultMin = configManager.validate({
        wrapUp: {
          enabled: false,
          trigger: {
            postPhase: false,
            manual: true,
            idle: false,
            idleTimeoutMinutes: 1
          },
          phases: {
            shipIt: { enabled: true, autoCommit: true, autoPush: false },
            rememberIt: { enabled: true, consolidateClaudeMd: true },
            selfImprove: { enabled: true, analyzeErrors: true },
            publishIt: { enabled: false }
          },
          safety: {
            dryRunDefault: true,
            requireTestsPass: false,
            secretDetection: true
          }
        } as any
      });

      const resultMax = configManager.validate({
        wrapUp: {
          enabled: false,
          trigger: {
            postPhase: false,
            manual: true,
            idle: false,
            idleTimeoutMinutes: 1440
          },
          phases: {
            shipIt: { enabled: true, autoCommit: true, autoPush: false },
            rememberIt: { enabled: true, consolidateClaudeMd: true },
            selfImprove: { enabled: true, analyzeErrors: true },
            publishIt: { enabled: false }
          },
          safety: {
            dryRunDefault: true,
            requireTestsPass: false,
            secretDetection: true
          }
        } as any
      });

      expect(resultMin.valid).toBe(true);
      expect(resultMax.valid).toBe(true);
    });
  });

  describe('getConfigPath', () => {
    it('should return correct config path', () => {
      const configPath = configManager.getConfigPath();
      expect(configPath).toContain('.vibe-flow');
      expect(configPath).toContain('config.json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty config file', async () => {
      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      await fs.mkdir(dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, '{}');

      const config = await configManager.load();

      expect(config.preferences.language).toBe('en');
    });

    it('should handle config with null values', async () => {
      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      await fs.mkdir(dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({
        preferences: { language: null, autoAdvance: null }
      }));

      const config = await configManager.load();

      expect(config.preferences.language).toBe('en');
    });
  });
});
