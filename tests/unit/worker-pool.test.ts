/**
 * Worker Pool Unit Tests
 *
 * Testa o WorkerPool e o método getStatus().
 *
 * Executar com:
 *   npm test -- --testPathPattern=worker-pool
 *   npx jest tests/unit/worker-pool.test.ts
 */

import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import after setting up paths
const projectRoot = path.resolve(__dirname, '../..');
const workerPoolModule = await import(path.join(projectRoot, 'dist/context/worker-pool.js'));
const WorkerPool = workerPoolModule.WorkerPool;

describe('WorkerPool', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool: any;

  beforeEach(() => {
    pool = new WorkerPool({
      minWorkers: 1,
      maxWorkers: 2,
      idleTimeout: 5000,
      taskTimeout: 5000
    });
  });

  afterEach(async () => {
    await pool.terminateAll();
  });

  describe('getStatus()', () => {
    it('should return correct PoolStats structure', async () => {
      await pool.initialize();

      const stats = pool.getStatus();

      // Verify all required fields exist
      expect(stats).toHaveProperty('idleWorkers');
      expect(stats).toHaveProperty('busyWorkers');
      expect(stats).toHaveProperty('totalWorkers');
      expect(stats).toHaveProperty('queuedTasks');
      expect(stats).toHaveProperty('completedTasks');
      expect(stats).toHaveProperty('failedTasks');

      // Verify types
      expect(typeof stats.idleWorkers).toBe('number');
      expect(typeof stats.busyWorkers).toBe('number');
      expect(typeof stats.totalWorkers).toBe('number');
      expect(typeof stats.queuedTasks).toBe('number');
      expect(typeof stats.completedTasks).toBe('number');
      expect(typeof stats.failedTasks).toBe('number');
    });

    it('should return zero for completed and failed tasks initially', async () => {
      await pool.initialize();

      const stats = pool.getStatus();

      expect(stats.completedTasks).toBe(0);
      expect(stats.failedTasks).toBe(0);
    });

    it('should return zero queued tasks initially', async () => {
      await pool.initialize();

      const stats = pool.getStatus();

      expect(stats.queuedTasks).toBe(0);
    });

    it('should track total workers based on minWorkers', async () => {
      const pool2Workers = new WorkerPool({
        minWorkers: 2,
        maxWorkers: 4
      });
      await pool2Workers.initialize();

      const stats = pool2Workers.getStatus();

      expect(stats.totalWorkers).toBe(2);
      expect(stats.idleWorkers).toBeGreaterThanOrEqual(0);

      await pool2Workers.terminateAll();
    });

    it('should return idleWorkers + busyWorkers = totalWorkers', async () => {
      await pool.initialize();

      const stats = pool.getStatus();

      expect(stats.idleWorkers + stats.busyWorkers).toBe(stats.totalWorkers);
    });
  });

  describe('PoolStats interface', () => {
    it('should have all required properties', () => {
      const stats = {
        idleWorkers: 1,
        busyWorkers: 2,
        totalWorkers: 3,
        queuedTasks: 4,
        completedTasks: 5,
        failedTasks: 6,
        initialized: true,
        shuttingDown: false
      };

      expect(stats.idleWorkers).toBe(1);
      expect(stats.busyWorkers).toBe(2);
      expect(stats.totalWorkers).toBe(3);
      expect(stats.queuedTasks).toBe(4);
      expect(stats.completedTasks).toBe(5);
      expect(stats.failedTasks).toBe(6);
    });
  });

  describe('shutdown()', () => {
    it('should complete shutdown gracefully', async () => {
      await pool.initialize();

      // Shutdown should complete even without tasks
      await pool.shutdown();

      // Pool should no longer be initialized
      const status = pool.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.shuttingDown).toBe(false);
    });

    it('should reject new tasks after shutdown is initiated', async () => {
      await pool.initialize();

      // Start shutdown
      const shutdownPromise = pool.shutdown();

      // Try to submit task after shutdown started - should throw
      await expect(
        pool.execute({ type: 'compress', payload: 'test' })
      ).rejects.toThrow('shutting down');

      await shutdownPromise;
    });

    it('should clear all workers after shutdown', async () => {
      await pool.initialize();

      const statusBefore = pool.getStatus();
      expect(statusBefore.totalWorkers).toBeGreaterThan(0);

      await pool.shutdown();

      const statusAfter = pool.getStatus();
      expect(statusAfter.totalWorkers).toBe(0);
    });
  });

  describe('terminate()', () => {
    it('should immediately terminate all workers', async () => {
      await pool.initialize();

      const statusBefore = pool.getStatus();
      expect(statusBefore.totalWorkers).toBeGreaterThan(0);

      await pool.terminate();

      const statusAfter = pool.getStatus();
      expect(statusAfter.totalWorkers).toBe(0);
      expect(statusAfter.idleWorkers).toBe(0);
      expect(statusAfter.busyWorkers).toBe(0);
    });

    it('should reset initialized flag after terminate', async () => {
      await pool.initialize();

      await pool.terminate();

      const status = pool.getStatus();
      expect(status.initialized).toBe(false);
    });
  });

  describe('terminateAll()', () => {
    it('should work as alias for terminate()', async () => {
      await pool.initialize();

      const statusBefore = pool.getStatus();
      expect(statusBefore.totalWorkers).toBeGreaterThan(0);

      await pool.terminateAll();

      const statusAfter = pool.getStatus();
      expect(statusAfter.totalWorkers).toBe(0);
    });
  });
});
