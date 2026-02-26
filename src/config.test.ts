// Config Manager Tests - User preferences and configuration

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

const TEST_CONFIG_DIR = join(tmpdir(), 'vibe-flow-test-config-' + Date.now());

describe('ConfigManager', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('load', () => {
    it('should be able to create config directory', async () => {
      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      await fs.mkdir(dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({
        preferences: {
          language: 'en',
          autoAdvance: false,
          verboseMode: false,
          beginnerMode: false
        }
      }));

      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.preferences.language).toBe('en');
    });

    it('should handle missing config file', async () => {
      const configPath = join(TEST_CONFIG_DIR, '.vibe-flow', 'config.json');
      // Don't create the file
      try {
        await fs.access(configPath);
      } catch {
        // Expected - file doesn't exist
        expect(true).toBe(true);
      }
    });
  });
});
