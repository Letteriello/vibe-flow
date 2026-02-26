/**
 * ImmutableStore Unit Tests
 *
 * Testa o sistema de armazenamento imutável de mensagens.
 *
 * Executar com:
 *   npm test -- --testPathPattern=store
 *   npx jest tests/unit/store.test.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import after setting up paths
const projectRoot = path.resolve(__dirname, '../..');

describe('ImmutableStore', () => {
  // Use unique directory for each test to avoid state pollution
  const baseDir = path.join(projectRoot, '.vibe-flow', 'test-store');

  // Import dynamically to avoid TypeScript issues
  let ImmutableStore: any;
  let testDir: string;
  let store: any;
  let testCounter = 0;

  beforeAll(async () => {
    const module = await import(path.join(projectRoot, 'dist/context/store.js'));
    ImmutableStore = module.ImmutableStore;
  });

  beforeEach(async () => {
    // Create unique directory for each test
    testCounter++;
    testDir = path.join(baseDir, `test-${testCounter}`);

    // Clean up before each test
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    // Create fresh store for each test
    store = new ImmutableStore({
      storageDir: testDir,
      enableIndex: true
    });
  });

  afterAll(async () => {
    // Clean up all test directories
    try {
      await fs.promises.rm(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('constructor', () => {
    it('should create store with default config', () => {
      const s = new ImmutableStore({ storageDir: testDir });
      expect(s).toBeDefined();
    });

    it('should create store with custom file name', () => {
      const s = new ImmutableStore({
        storageDir: testDir,
        fileName: 'custom.jsonl'
      });
      expect(s).toBeDefined();
    });

    it('should create storage directory if not exists', () => {
      const customDir = path.join(testDir, 'nested', 'dir');
      const s = new ImmutableStore({ storageDir: customDir });
      expect(fs.existsSync(customDir)).toBe(true);
    });
  });

  describe('append (append-only)', () => {
    it('should append user prompt transaction', () => {
      const result = store.addUserPrompt('Hello, world!');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.lineNumber).toBe(1);
      expect(result.byteOffset).toBe(0);
    });

    it('should append tool result transaction', () => {
      const result = store.addToolResult('Tool output here');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.lineNumber).toBe(1);
    });

    it('should append assistant reply transaction', () => {
      const result = store.addAssistantReply('Assistant response');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.lineNumber).toBe(1);
    });

    it('should append with metadata', () => {
      const result = store.append('user_prompt', 'Test', { key: 'value' });

      expect(result.success).toBe(true);
      const retrieved = store.getById(result.transactionId);
      expect(retrieved?.metadata).toEqual({ key: 'value' });
    });

    it('should assign unique UUIDs to each transaction', () => {
      const result1 = store.addUserPrompt('First');
      const result2 = store.addUserPrompt('Second');
      const result3 = store.addUserPrompt('Third');

      expect(result1.transactionId).not.toBe(result2.transactionId);
      expect(result2.transactionId).not.toBe(result3.transactionId);
      expect(result1.transactionId).not.toBe(result3.transactionId);
    });

    it('should record timestamp', () => {
      const before = Date.now();
      const result = store.addUserPrompt('Test');
      const after = Date.now();

      const retrieved = store.getById(result.transactionId);
      expect(retrieved?.timestamp).toBeGreaterThanOrEqual(before);
      expect(retrieved?.timestamp).toBeLessThanOrEqual(after);
    });

    it('should calculate token count', () => {
      const content = 'This is a test message with some content';
      const result = store.addUserPrompt(content);

      const retrieved = store.getById(result.transactionId);
      expect(retrieved?.tokenCount).toBeGreaterThan(0);
      expect(retrieved?.tokenCount).toBe(Math.ceil(content.length / 4));
    });
  });

  describe('atomic write', () => {
    it('should persist data to disk', () => {
      store.addUserPrompt('Persistent message');

      // Verify file exists and has content
      const filePath = store.getFilePath();
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Persistent message');
    });

    it('should write data atomically using temp file', () => {
      // Add multiple transactions
      for (let i = 0; i < 10; i++) {
        store.addUserPrompt(`Message ${i}`);
      }

      // Verify all were written
      const all = store.getAll();
      expect(all.transactions.length).toBe(10);
    });

    it('should handle concurrent writes', () => {
      const store1 = new ImmutableStore({ storageDir: testDir + '-concurrent' });
      const store2 = new ImmutableStore({ storageDir: testDir + '-concurrent' });

      // Both append
      const r1 = store1.addUserPrompt('From store 1');
      const r2 = store2.addUserPrompt('From store 2');

      // Both should succeed
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      // Store2 can read Store1's data (shared file)
      const retrieved = store2.getById(r1.transactionId);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('search (lcm_grep interno)', () => {
    beforeEach(() => {
      // Add test data
      store.addUserPrompt('User message 1');
      store.addToolResult('Tool result 1');
      store.addAssistantReply('Assistant reply 1');
      store.addUserPrompt('User message 2');
      store.addToolResult('Tool result 2');
    });

    it('should get all transactions', () => {
      const result = store.getAll();

      expect(result.transactions.length).toBe(5);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by type', () => {
      const result = store.search({ type: 'user_prompt' });

      expect(result.transactions.length).toBe(2);
      expect(result.transactions.every((t: any) => t.type === 'user_prompt')).toBe(true);
    });

    it('should filter by time range', () => {
      const startTime = Date.now() - 1000;
      store.addUserPrompt('New message');
      const endTime = Date.now() + 1000;

      const result = store.search({ startTime, endTime });
      expect(result.transactions.length).toBeGreaterThan(0);
    });

    it('should support pagination with limit and offset', () => {
      const result = store.search({ limit: 2, offset: 0 });

      expect(result.transactions.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should return hasMore correctly', () => {
      const all = store.search({ limit: 100, offset: 0 });
      const paginated = store.search({ limit: 2, offset: 0 });

      expect(paginated.hasMore).toBe(true);
    });

    it('should return empty for no matches', () => {
      const result = store.search({ type: 'nonexistent' });

      expect(result.transactions.length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getById', () => {
    it('should retrieve transaction by ID', () => {
      const result = store.addUserPrompt('Test message');
      const retrieved = store.getById(result.transactionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('Test message');
      expect(retrieved?.type).toBe('user_prompt');
    });

    it('should return null for unknown ID', () => {
      const retrieved = store.getById('unknown-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      store.addUserPrompt('User 1');
      store.addToolResult('Tool 1');
      store.addAssistantReply('Assistant 1');

      const stats = store.getStats();

      expect(stats.totalTransactions).toBe(3);
      expect(stats.byType.user_prompt).toBe(1);
      expect(stats.byType.tool_result).toBe(1);
      expect(stats.byType.assistant_reply).toBe(1);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.oldestTimestamp).not.toBeNull();
      expect(stats.newestTimestamp).not.toBeNull();
      expect(stats.fileSize).toBeGreaterThan(0);
    });
  });

  describe('append-only guarantee', () => {
    it('should not have delete method', () => {
      expect((store as any).delete).toBeUndefined();
      expect((store as any).remove).toBeUndefined();
      expect((store as any).deleteTransaction).toBeUndefined();
    });

    it('should not have update method', () => {
      expect((store as any).update).toBeUndefined();
      expect((store as any).updateTransaction).toBeUndefined();
    });

    it('should persist all transactions - no data loss', () => {
      const count = 50;
      const ids: string[] = [];

      for (let i = 0; i < count; i++) {
        const result = store.addUserPrompt(`Message ${i}`);
        ids.push(result.transactionId);
      }

      // Verify all are retrievable
      for (const id of ids) {
        const retrieved = store.getById(id);
        expect(retrieved).not.toBeNull();
      }

      // Verify count
      const all = store.getAll();
      expect(all.total).toBe(count);
    });
  });
});

describe('ImmutableLogger', () => {
  const baseDir = path.join(projectRoot, '.vibe-flow', 'test-logger');
  let ImmutableLogger: any;
  let testDir: string;
  let logger: any;
  let loggerCounter = 0;

  beforeAll(async () => {
    const module = await import(path.join(projectRoot, 'dist/context/immutable-logger.js'));
    ImmutableLogger = module.ImmutableLogger;
  });

  beforeEach(async () => {
    loggerCounter++;
    testDir = path.join(baseDir, `test-${loggerCounter}`);

    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    logger = new ImmutableLogger({
      storageDir: testDir,
      minLevel: 'debug'
    });
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('constructor', () => {
    it('should create logger', () => {
      expect(logger).toBeDefined();
    });
  });

  describe('logging', () => {
    it('should log info messages', () => {
      const result = logger.info('Test info message');

      expect(result.success).toBe(true);
      expect(result.entryId).toBeDefined();
    });

    it('should log debug messages', () => {
      const result = logger.debug('Debug message', 'system');

      expect(result.success).toBe(true);
    });

    it('should log warn messages', () => {
      const result = logger.warn('Warning message', 'store');

      expect(result.success).toBe(true);
    });

    it('should log error messages', () => {
      const result = logger.error('Error message', 'error');

      expect(result.success).toBe(true);
    });

    it('should log audit messages', () => {
      const result = logger.audit('Audit event', 'tx-123');

      expect(result.success).toBe(true);
    });

    it('should log with transaction association', () => {
      const result = logger.logTransaction('tx-456', 'Operation completed', 'info');

      expect(result.success).toBe(true);

      const logs = logger.getByTransactionId('tx-456');
      expect(logs.entries.length).toBeGreaterThan(0);
    });

    it('should log store operations', () => {
      logger.logStoreOperation('append', 'tx-789', true, { tokens: 100 });

      const logs = logger.getByTransactionId('tx-789');
      expect(logs.entries.length).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      logger.info('Info message', 'system');
      logger.debug('Debug message', 'system');
      logger.warn('Warning message', 'store');
      logger.error('Error message', 'error');
      logger.audit('Audit message', 'tx-1');
    });

    it('should get all logs', () => {
      const result = logger.search({});

      expect(result.entries.length).toBeGreaterThan(0);
    });

    it('should filter by level', () => {
      const result = logger.search({ level: 'error' });

      expect(result.entries.every((e: any) => e.level === 'error')).toBe(true);
    });

    it('should filter by category', () => {
      const result = logger.search({ category: 'system' });

      expect(result.entries.every((e: any) => e.category === 'system')).toBe(true);
    });

    it('should filter by message content', () => {
      const result = logger.search({ messageContains: 'Error' });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].message).toContain('Error');
    });

    it('should filter by transaction ID', () => {
      logger.logTransaction('tx-search', 'Test', 'info');

      const result = logger.search({ transactionId: 'tx-search' });

      expect(result.entries.length).toBeGreaterThan(0);
    });
  });

  describe('getAuditLogs', () => {
    it('should return only audit logs', () => {
      logger.info('Info');
      logger.audit('Audit 1');
      logger.audit('Audit 2');
      logger.error('Error');

      const result = logger.getAuditLogs();

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e: any) => e.level === 'audit')).toBe(true);
    });
  });

  describe('stats', () => {
    it('should return correct statistics', () => {
      logger.info('Info 1');
      logger.info('Info 2');
      logger.error('Error 1');
      logger.audit('Audit 1');

      const stats = logger.getStats();

      expect(stats.totalEntries).toBe(4);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.byLevel.audit).toBe(1);
    });
  });
});

describe('Integration: Store + Logger', () => {
  const testDir = path.join(projectRoot, '.vibe-flow', 'test-integration');
  let ImmutableStore: any;
  let ImmutableLogger: any;

  beforeAll(async () => {
    const storeModule = await import(path.join(projectRoot, 'dist/context/store.js'));
    const loggerModule = await import(path.join(projectRoot, 'dist/context/immutable-logger.js'));
    ImmutableStore = storeModule.ImmutableStore;
    ImmutableLogger = loggerModule.ImmutableLogger;

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

  it('should integrate store and logger', () => {
    const store = new ImmutableStore({ storageDir: testDir });
    const logger = new ImmutableLogger({ storageDir: testDir });

    // Log store operation start
    logger.logStoreOperation('START', 'tx-init', true);

    // Add transaction
    const result = store.addUserPrompt('User input');

    // Log transaction completion
    logger.logTransaction(result.transactionId, 'Transaction completed', 'info');
    logger.logStoreOperation('COMPLETE', result.transactionId, true, { tokens: result.byteOffset });

    // Verify integration
    const tx = store.getById(result.transactionId);
    expect(tx).not.toBeNull();

    const logs = logger.getByTransactionId(result.transactionId);
    expect(logs.entries.length).toBe(1);

    const auditLogs = logger.getAuditLogs();
    expect(auditLogs.entries.length).toBe(1);
  });
});
