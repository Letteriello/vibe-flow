/**
 * Compression Module Unit Tests
 *
 * Testa o sistema de compressão lossless de contexto.
 *
 * Executar com:
 *   npm test -- --testPathPattern=compression
 *   npx jest tests/unit/compression.test.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import after setting up paths
const projectRoot = path.resolve(__dirname, '../..');
const compression = await import(path.join(projectRoot, 'dist/context/compression.js'));
const {
  compressOldLogs,
  needsCompression,
  getPayloadStatus,
  PayloadSizeMonitor,
  estimateTokens,
  calculateTotalTokens,
  calculatePayloadSize,
  DEFAULT_COMPRESSION_CONFIG
} = compression;

// Test fixtures
function createMockMessages(count: number): Array<{ role: string; content: string; timestamp: string }> {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'tool',
      content: `Message ${i}: ${'x'.repeat(100)} Tool result ${i}: reading file test.ts`,
      timestamp: new Date(Date.now() - i * 1000).toISOString()
    });
  }
  return messages;
}

function createLargeMessages(count: number): Array<{ role: string; content: string; timestamp: string }> {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'tool',
      content: `Message ${i}: ${'content '.repeat(500)} file:src/test${i % 10}.ts decision:implemented feature ${i}`,
      timestamp: new Date(Date.now() - i * 1000).toISOString()
    });
  }
  return messages;
}

describe('Compression Module', () => {
  const testDir = path.join(projectRoot, '.vibe-flow', 'test-compression');
  const archiveDir = path.join(testDir, 'compressed-archives');

  beforeAll(async () => {
    // Clean up test directories
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  afterAll(async () => {
    // Clean up after tests
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Token Estimation', () => {
    test('estimateTokens calculates correctly for string', () => {
      const text = 'Hello world'; // 11 chars -> ~3 tokens
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 4));
    });

    test('estimateTokens calculates correctly for object', () => {
      const obj = { role: 'user', content: 'Test message' };
      const tokens = estimateTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });

    test('estimateTokens returns 0 for empty input', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null as any)).toBe(0);
      expect(estimateTokens(undefined as any)).toBe(0);
    });

    test('calculateTotalTokens sums multiple messages', () => {
      const messages = createMockMessages(10);
      const total = calculateTotalTokens(messages);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('Payload Size Calculation', () => {
    test('calculatePayloadSize returns bytes', () => {
      const messages = createMockMessages(5);
      const size = calculatePayloadSize(messages);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    test('larger messages have larger payload', () => {
      const small = createMockMessages(5);
      const large = createMockMessages(20);
      expect(calculatePayloadSize(large)).toBeGreaterThan(calculatePayloadSize(small));
    });
  });

  describe('needsCompression', () => {
    test('returns false when under threshold', () => {
      const messages = createMockMessages(5);
      const result = needsCompression(messages, {
        tokenLimit: 80000,
        thresholdPercentage: 0.8
      });
      expect(result).toBe(false);
    });

    test('returns true when over threshold', () => {
      const messages = createLargeMessages(100);
      const result = needsCompression(messages, {
        tokenLimit: 1000,
        thresholdPercentage: 0.5
      });
      expect(result).toBe(true);
    });

    test('uses default config', () => {
      const messages = createMockMessages(5);
      // Default threshold is 80% of 80k = 64k tokens
      expect(needsCompression(messages)).toBe(false);
    });
  });

  describe('getPayloadStatus', () => {
    test('returns correct payload stats', () => {
      const messages = createMockMessages(10);
      const status = getPayloadStatus(messages, {
        tokenLimit: 80000,
        thresholdPercentage: 0.8,
        maxPayloadSize: 500 * 1024,
        preserveRecentMessages: 20
      });

      expect(status.tokenCount).toBeGreaterThan(0);
      expect(status.messageCount).toBe(10);
      expect(status.charCount).toBeGreaterThan(0);
      expect(status.estimatedSize).toBeGreaterThan(0);
      expect(status.percentage).toBeGreaterThan(0);
      expect(status.threshold).toBe(64000); // 80% of 80k
    });
  });

  describe('PayloadSizeMonitor', () => {
    test('creates monitor with default config', () => {
      const monitor = new PayloadSizeMonitor();
      const config = monitor.getConfig();
      expect(config.tokenLimit).toBe(DEFAULT_COMPRESSION_CONFIG.tokenLimit);
      expect(config.thresholdPercentage).toBe(DEFAULT_COMPRESSION_CONFIG.thresholdPercentage);
    });

    test('creates monitor with custom config', () => {
      const monitor = new PayloadSizeMonitor({
        tokenLimit: 50000,
        thresholdPercentage: 0.7
      });
      const config = monitor.getConfig();
      expect(config.tokenLimit).toBe(50000);
      expect(config.thresholdPercentage).toBe(0.7);
    });

    test('shouldCompress detects threshold', () => {
      const monitor = new PayloadSizeMonitor({
        tokenLimit: 1000,
        thresholdPercentage: 0.5
      });

      const smallMessages = createMockMessages(5);
      expect(monitor.shouldCompress(smallMessages)).toBe(false);

      const largeMessages = createLargeMessages(100);
      expect(monitor.shouldCompress(largeMessages)).toBe(true);
    });

    test('getStatus returns correct status', () => {
      const monitor = new PayloadSizeMonitor({
        tokenLimit: 80000,
        thresholdPercentage: 0.8,
        maxPayloadSize: 500 * 1024
      });

      const messages = createMockMessages(10);
      const status = monitor.getStatus(messages);

      expect(status.needsCompression).toBe(false);
      expect(status.currentSize).toBeGreaterThan(0);
      expect(status.threshold).toBe(500 * 1024); // maxPayloadSize
      expect(status.percentage).toBeGreaterThan(0);
    });

    test('markCompressed updates state', () => {
      const monitor = new PayloadSizeMonitor();
      monitor.markCompressed(5);

      const messages = createMockMessages(10);
      const status = monitor.getStatus(messages);

      expect(status.pointerCount).toBe(5);
      expect(status.lastCompressed).not.toBeNull();
    });

    test('updateConfig updates configuration', () => {
      const monitor = new PayloadSizeMonitor();
      monitor.updateConfig({ tokenLimit: 40000 });

      const config = monitor.getConfig();
      expect(config.tokenLimit).toBe(40000);
    });
  });

  describe('compressOldLogs', () => {
    test('returns success when under threshold', async () => {
      const messages = createMockMessages(5);
      const result = await compressOldLogs(messages, {
        tokenLimit: 80000,
        thresholdPercentage: 0.8,
        archiveDirectory: archiveDir
      }, projectRoot);

      expect(result.success).toBe(true);
      expect(result.messagesArchived).toBe(0);
      expect(result.reductionPercentage).toBe(0);
    });

    test('compresses messages when over threshold', async () => {
      const messages = createLargeMessages(50);
      const result = await compressOldLogs(messages, {
        tokenLimit: 5000,
        thresholdPercentage: 0.5,
        preserveRecentMessages: 10,
        archiveDirectory: archiveDir,
        enableLosslessMode: true
      }, projectRoot);

      expect(result.success).toBe(true);
      expect(result.messagesArchived).toBeGreaterThan(0);
      expect(result.messagesPreserved).toBe(10);
      expect(result.pointersCreated.length).toBeGreaterThan(0);
      expect(result.metadata.length).toBeGreaterThan(0);
      expect(result.reductionPercentage).toBeGreaterThan(0);
    });

    test('preserves metadata in lossless mode', async () => {
      const messages = createLargeMessages(30);
      const result = await compressOldLogs(messages, {
        tokenLimit: 1000,
        thresholdPercentage: 0.5,
        archiveDirectory: archiveDir,
        enableLosslessMode: true
      }, projectRoot);

      expect(result.success).toBe(true);
      expect(result.metadata.length).toBeGreaterThan(0);

      // Check metadata contains expected fields
      const firstMeta = result.metadata[0];
      expect(firstMeta).toHaveProperty('startIndex');
      expect(firstMeta).toHaveProperty('endIndex');
      expect(firstMeta).toHaveProperty('totalTokens');
      expect(firstMeta).toHaveProperty('toolCallCount');
      expect(firstMeta).toHaveProperty('keyDecisions');
      expect(firstMeta).toHaveProperty('fileReferences');
    });

    test('creates archive files', async () => {
      const messages = createLargeMessages(30);
      const result = await compressOldLogs(messages, {
        tokenLimit: 1000,
        thresholdPercentage: 0.5,
        archiveDirectory: archiveDir,
        enableLosslessMode: true
      }, projectRoot);

      // Check that archive files exist
      for (const archivePath of result.pointersCreated) {
        const exists = await fs.promises.access(archivePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    test('summary describes compression', async () => {
      const messages = createLargeMessages(50);
      const result = await compressOldLogs(messages, {
        tokenLimit: 5000,
        thresholdPercentage: 0.5,
        archiveDirectory: archiveDir
      }, projectRoot);

      expect(result.summary).toContain('Compressed');
      expect(result.summary).toContain('messages');
      expect(result.summary).toContain('pointers');
    });
  });

  describe('Default Configuration', () => {
    test('DEFAULT_COMPRESSION_CONFIG has all required fields', () => {
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('maxPayloadSize');
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('tokenLimit');
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('thresholdPercentage');
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('preserveRecentMessages');
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('archiveDirectory');
      expect(DEFAULT_COMPRESSION_CONFIG).toHaveProperty('enableLosslessMode');
    });

    test('default values are sensible', () => {
      expect(DEFAULT_COMPRESSION_CONFIG.tokenLimit).toBe(80000);
      expect(DEFAULT_COMPRESSION_CONFIG.thresholdPercentage).toBe(0.8);
      expect(DEFAULT_COMPRESSION_CONFIG.preserveRecentMessages).toBe(20);
      expect(DEFAULT_COMPRESSION_CONFIG.enableLosslessMode).toBe(true);
    });
  });
});
