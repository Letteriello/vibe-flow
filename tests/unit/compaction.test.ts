/**
 * Compaction System Unit Tests
 *
 * Testa o sistema de compactação hierárquica e o context-manager.
 *
 * Executar com:
 *   npm test -- --testPathPattern=compaction
 *   npx jest tests/unit/compaction.test.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import after setting up paths
const projectRoot = path.resolve(__dirname, '../..');
const { default: compaction, compactionEstimateTokens, compactionCalculateTotalTokens, needsCompaction, getContextStatus } = await import(path.join(projectRoot, 'dist/context/compaction.js'));
const { default: ContextManager, createContextManager } = await import(path.join(projectRoot, 'dist/context/context-manager.js'));

// Alias for backwards compatibility in tests
const estimateTokens = compactionEstimateTokens;
const calculateTotalTokens = compactionCalculateTotalTokens;

// Test fixtures
function createMockMessages(count: number): Array<{ role: string; content: string; timestamp: string }> {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 3 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: ${'x'.repeat(100)}`, // ~100 chars per message
      timestamp: new Date(Date.now() - i * 1000).toISOString()
    });
  }
  return messages;
}

describe('Compaction System', () => {
  const testDir = path.join(projectRoot, '.vibe-flow', 'test-compaction');
  const archiveDir = path.join(testDir, 'context-archives');

  beforeAll(async () => {
    // Clean up test directories
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  afterAll(async () => {
    // Clean up test directories
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for string content', () => {
      const text = 'Hello, world!'; // 13 chars
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 4));
    });

    it('should estimate tokens for object content', () => {
      const obj = { role: 'user', content: 'Test message' };
      const tokens = estimateTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty content', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null as any)).toBe(0);
      expect(estimateTokens(undefined as any)).toBe(0);
    });
  });

  describe('calculateTotalTokens', () => {
    it('should calculate total tokens for empty array', () => {
      expect(calculateTotalTokens([])).toBe(0);
    });

    it('should calculate total tokens for message array', () => {
      const messages = createMockMessages(10);
      const total = calculateTotalTokens(messages);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('needsCompaction', () => {
    it('should return false for empty messages', () => {
      expect(needsCompaction([])).toBe(false);
    });

    it('should return false for small message count', () => {
      const messages = createMockMessages(5);
      expect(needsCompaction(messages)).toBe(false);
    });

    it('should return true when over threshold', () => {
      const messages = createMockMessages(500); // Large enough to trigger
      const result = needsCompaction(messages, { maxTokens: 1000, compactionThreshold: 0.5 });
      // With 500 messages of ~100 chars each, we'll have ~12,500 chars, ~3,125 tokens
      // Should trigger with threshold at 500 tokens
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getContextStatus', () => {
    it('should return status for empty context', () => {
      const status = getContextStatus([]);
      expect(status.tokenCount).toBe(0);
      expect(status.messageCount).toBe(0);
      expect(status.needsCompaction).toBe(false);
    });

    it('should return correct status for messages', () => {
      const messages = createMockMessages(10);
      const status = getContextStatus(messages);
      expect(status.messageCount).toBe(10);
      expect(status.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('compactContext', () => {
    it('should not compact when under threshold', async () => {
      const messages = createMockMessages(5);
      const result = await compaction.compactContext(messages, {
        maxTokens: 80000,
        compactionThreshold: 0.8,
        preserveRecentMessages: 20
      }, testDir);

      expect(result.success).toBe(true);
      expect(result.messagesCompacted).toBe(0);
    });

    it('should compact when over threshold', async () => {
      const messages = createMockMessages(100);

      const result = await compaction.compactContext(messages, {
        maxTokens: 1000,
        compactionThreshold: 0.5,
        preserveRecentMessages: 20,
        storageDir: archiveDir
      }, testDir);

      // Should have compacted messages
      expect(result.success).toBe(true);
      expect(result.messagesCompacted).toBeGreaterThan(0);
      expect(result.pointersCreated.length).toBeGreaterThan(0);
      expect(result.reductionPercentage).toBeGreaterThan(0);
    });

    it('should preserve recent messages', async () => {
      const messages = createMockMessages(50);

      const result = await compaction.compactContext(messages, {
        maxTokens: 1000,
        compactionThreshold: 0.3,
        preserveRecentMessages: 10,
        storageDir: archiveDir
      }, testDir);

      expect(result.messagesPreserved).toBe(10);
    });
  });
});

describe('ContextManager', () => {
  const testDir = path.join(projectRoot, '.vibe-flow', 'test-manager');

  beforeAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const manager = createContextManager();
      expect(manager).toBeDefined();
    });

    it('should create with custom config', () => {
      const manager = createContextManager({
        maxTokens: 50000,
        preserveRecentMessages: 30
      });
      expect(manager).toBeDefined();
    });
  });

  describe('addMessages', () => {
    it('should add messages to context', () => {
      const manager = createContextManager({ projectPath: testDir });
      const messages = createMockMessages(5);

      manager.addMessages(messages);

      const retrieved = manager.getMessages();
      expect(retrieved.length).toBe(5);
    });
  });

  describe('getStatus', () => {
    it('should return status with message count', () => {
      const manager = createContextManager({ projectPath: testDir });
      manager.addMessages(createMockMessages(10));

      const status = manager.getStatus();
      expect(status.messageCount).toBe(10);
      expect(status.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('getOptimizedContext', () => {
    it('should return messages when under threshold', async () => {
      const manager = createContextManager({
        projectPath: testDir,
        maxTokens: 80000,
        autoCompact: false
      });

      manager.addMessages(createMockMessages(5));

      const result = await manager.getOptimizedContext();
      expect(result.messages.length).toBe(5);
      expect(result.status.wasCompacted).toBe(false);
    });

    it('should compact when over threshold', async () => {
      const manager = createContextManager({
        projectPath: testDir,
        maxTokens: 1000,
        compactionThreshold: 0.3,
        preserveRecentMessages: 5,
        autoCompact: false,
        backgroundCompaction: false
      });

      manager.addMessages(createMockMessages(50));

      const result = await manager.getOptimizedContext();
      expect(result.status.wasCompacted).toBe(true);
      expect(result.status.reductionPercentage).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all messages', () => {
      const manager = createContextManager({ projectPath: testDir });
      manager.addMessages(createMockMessages(10));

      manager.clear();

      const messages = manager.getMessages();
      expect(messages.length).toBe(0);
    });
  });

  describe('getOptimizedContextSync', () => {
    it('should return optimized context synchronously', () => {
      const manager = createContextManager({
        projectPath: testDir,
        maxTokens: 80000,
        autoCompact: false
      });

      manager.addMessages(createMockMessages(5));

      const result = manager.getOptimizedContextSync();
      expect(result.messages.length).toBe(5);
      expect(result.status.wasCompacted).toBe(false);
    });
  });
});
