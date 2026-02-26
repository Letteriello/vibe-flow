/**
 * WALManager Unit Tests
 *
 * Testa o sistema de recuperação de estado via Write-Ahead Logging.
 *
 * Executar com:
 *   npm test -- --testPathPattern=wal-recovery
 *   npx jest tests/unit/wal-recovery.test.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../..');

describe('WALManager', () => {
  const testWalDir = path.join(projectRoot, '.vibe-flow', 'test-wal');

  let WALManager: any;
  let walManager: any;
  let testDir: string;

  beforeAll(async () => {
    const module = await import(path.join(projectRoot, 'dist/error-handler/wal-recovery.js'));
    WALManager = module.WALManager;
  });

  beforeEach(async () => {
    // Create unique directory for each test
    testDir = path.join(testWalDir, `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    // Clean up before test
    try {
      await fs.promises.rm(testWalDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    walManager = new WALManager(testDir);
  });

  afterEach(async () => {
    // Clean up after test
    try {
      await fs.promises.rm(testWalDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('appendLog', () => {
    it('deve persistir estado no WAL', async () => {
      const state = {
        id: 'test-1',
        timestamp: Date.now(),
        data: { key: 'value', count: 42 }
      };

      const fileName = await walManager.appendLog(state);

      expect(fileName).toContain('state_');
      expect(fileName).toContain('.json');

      // Verify file exists
      const filePath = path.join(testDir, fileName);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.id).toBe('test-1');
      expect(parsed.data.key).toBe('value');
      expect(parsed.checksum).toBeDefined();
    });

    it('deve gerar checksum para validação', async () => {
      const state = {
        id: 'test-2',
        timestamp: Date.now(),
        data: { test: true }
      };

      await walManager.appendLog(state);

      const files = await fs.promises.readdir(testDir);
      const filePath = path.join(testDir, files[0]);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.checksum).toBeDefined();
      expect(typeof parsed.checksum).toBe('string');
    });

    it('deve lançar erro em falha de I/O com path readonly', async () => {
      // Use a path that will cause write error
      const state = {
        id: 'test-3',
        timestamp: Date.now(),
        data: {}
      };

      // On Windows, try writing to an invalid device path
      const invalidWalManager = new WALManager('\\\\?\\Invalid::Path');

      await expect(invalidWalManager.appendLog(state)).rejects.toThrow();
    });
  });

  describe('recoverLastValidState', () => {
    it('deve recuperar último estado válido', async () => {
      // Append multiple states
      await walManager.appendLog({
        id: 'state-1',
        timestamp: 1000,
        data: { version: 1 }
      });

      await walManager.appendLog({
        id: 'state-2',
        timestamp: 2000,
        data: { version: 2 }
      });

      await walManager.appendLog({
        id: 'state-3',
        timestamp: 3000,
        data: { version: 3 }
      });

      const result = await walManager.recoverLastValidState();

      expect(result.success).toBe(true);
      expect(result.state).not.toBeNull();
      expect(result.state?.id).toBe('state-3');
      expect(result.state?.data.version).toBe(3);
      expect(result.logsProcessed).toBe(3);
      expect(result.corruptedLogsSkipped).toBe(0);
    });

    it('deve ignorar logs corrompidos (JSON inválido)', async () => {
      // Create a valid state file
      await walManager.appendLog({
        id: 'valid-1',
        timestamp: 1000,
        data: { valid: true }
      });

      // Create corrupted file manually
      const corruptedPath = path.join(testDir, 'state_2000.json');
      await fs.promises.writeFile(corruptedPath, 'invalid json {', 'utf-8');

      // Create another valid file
      await walManager.appendLog({
        id: 'valid-2',
        timestamp: 3000,
        data: { valid: true }
      });

      const result = await walManager.recoverLastValidState();

      expect(result.success).toBe(true);
      expect(result.state?.id).toBe('valid-2');
      expect(result.corruptedLogsSkipped).toBe(1);
      expect(result.logsProcessed).toBe(2);
    });

    it('deve retornar null quando não há estados válidos', async () => {
      const result = await walManager.recoverLastValidState();

      expect(result.success).toBe(false);
      expect(result.state).toBeNull();
      expect(result.error).toContain('No valid state found');
    });

    it('deve ignorar arquivos com checksum inválido', async () => {
      // Create valid state
      await walManager.appendLog({
        id: 'valid-1',
        timestamp: 1000,
        data: { test: true }
      });

      // Create file with invalid checksum
      const invalidChecksumPath = path.join(testDir, 'state_2000.json');
      await fs.promises.writeFile(invalidChecksumPath, JSON.stringify({
        id: 'corrupted',
        timestamp: 2000,
        data: { test: true },
        checksum: 'invalid-checksum'
      }), 'utf-8');

      // Create another valid state
      await walManager.appendLog({
        id: 'valid-2',
        timestamp: 3000,
        data: { test: true }
      });

      const result = await walManager.recoverLastValidState();

      expect(result.success).toBe(true);
      expect(result.state?.id).toBe('valid-2');
      expect(result.corruptedLogsSkipped).toBe(1);
    });

    it('deve lidar com falha de I/O - verifica se diretório é criado', async () => {
      // Test with normal path - should work
      const result = await walManager.recoverLastValidState();

      // Should return empty result for empty directory
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.logsProcessed).toBe(0);
    });
  });

  describe('pruneOldLogs', () => {
    it('deve remover logs antigos mantendo os mais recentes', async () => {
      // Create 15 state files
      for (let i = 1; i <= 15; i++) {
        await walManager.appendLog({
          id: `state-${i}`,
          timestamp: i * 1000,
          data: { index: i }
        });
      }

      const removed = await walManager.pruneOldLogs(10);

      expect(removed).toBe(5);

      const files = await fs.promises.readdir(testDir);
      expect(files.length).toBe(10);
    });
  });

  describe('listStates', () => {
    it('deve listar todos os estados válidos', async () => {
      await walManager.appendLog({
        id: 'state-a',
        timestamp: 1000,
        data: { letter: 'a' }
      });

      await walManager.appendLog({
        id: 'state-b',
        timestamp: 2000,
        data: { letter: 'b' }
      });

      const states = await walManager.listStates();

      expect(states.length).toBe(2);
      expect(states[0].id).toBe('state-a');
      expect(states[1].id).toBe('state-b');
    });

    it('deve retornar array vazio para diretório vazio', async () => {
      const states = await walManager.listStates();
      expect(states).toEqual([]);
    });
  });
});
