// Tests for Rate Limit Handler and WAL Safe Parsing
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import {
  RateLimitHandler,
  isRateLimitError,
  extractRetryAfter,
  calculateBackoff,
  RateLimitType
} from '../../src/error-handler/rate-limit.js';
import {
  parseSafeWAL,
  getLastValidState,
  recoverFromCorruptedWAL,
  retryWithRateLimitBackoff,
  WALFrame,
  CorruptedFrame,
  WALParseResult
} from '../../src/error-handler/recovery.js';
import { WALAction } from '../../src/error-handler/wal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ============================================================
// Rate Limit Handler Tests
// ============================================================

describe('RateLimitHandler', () => {
  let handler: RateLimitHandler;

  beforeEach(() => {
    // Use fast delays for testing
    handler = new RateLimitHandler({
      baseDelayMs: 10,
      maxDelayMs: 100,
      maxRetries: 3,
      jitterFactor: 0.1,
      backoffMultiplier: 2
    });
  });

  describe('detectRateLimitError', () => {
    it('should detect HTTP 429 error', () => {
      const error = { message: '429 Too Many Requests', code: 429 };
      const result = handler.detectRateLimitError(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.errorType).toBe(RateLimitType.HTTP_429);
    });

    it('should detect OpenAI rate limit', () => {
      const error = { message: 'You exceeded your rate limit' };
      const result = handler.detectRateLimitError(error);

      expect(result.isRateLimit).toBe(true);
    });

    it('should detect generic rate limit patterns', () => {
      const error = { message: 'Too many requests' };
      const result = handler.detectRateLimitError(error);

      expect(result.isRateLimit).toBe(true);
    });

    it('should not flag non-rate-limit errors', () => {
      const error = { message: 'File not found', code: 'ENOENT' };
      const result = handler.detectRateLimitError(error);

      expect(result.isRateLimit).toBe(false);
    });

    it('should extract retry-after from headers', () => {
      const error = {
        message: 'Rate limit exceeded',
        headers: { 'retry-after': '30' }
      };
      const result = handler.detectRateLimitError(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryAfterMs).toBe(30000); // 30 seconds
    });
  });

  describe('calculateBackoffWithJitter', () => {
    it('should calculate exponential backoff', () => {
      const delay = handler.calculateBackoffWithJitter(1);

      // Base delay * multiplier^attempt = 10 * 2^1 = 20
      // With jitter (0.1), range is [18, 22]
      expect(delay).toBeGreaterThanOrEqual(18);
      expect(delay).toBeLessThanOrEqual(22);
    });

    it('should cap at max delay', () => {
      const handlerFast = new RateLimitHandler({
        baseDelayMs: 10,
        maxDelayMs: 50,
        jitterFactor: 0.1
      });

      // Attempt 10 would give huge delay, but should cap at maxDelay
      const delay = handlerFast.calculateBackoffWithJitter(10);
      expect(delay).toBeLessThanOrEqual(55); // maxDelay + jitter
    });

    it('should use suggested delay when provided', () => {
      const delay = handler.calculateBackoffWithJitter(1, 50);

      // Should use suggested delay with jitter
      expect(delay).toBeGreaterThanOrEqual(45); // 50 - 10%
      expect(delay).toBeLessThanOrEqual(55); // 50 + 10%
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first try', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        return 'success';
      };

      const result = await handler.executeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(attempts).toBe(1);
    }, 10000);

    it('should retry on rate limit error', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw { message: '429 Too Many Requests', code: 429 };
        }
        return 'success';
      };

      const result = await handler.executeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    }, 10000);

    it('should fail after max retries', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw { message: '429 Too Many Requests', code: 429 };
      };

      const result = await handler.executeWithRetry(operation);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // maxRetries
      expect(result.error?.isRateLimit).toBe(true);
    }, 10000);
  });
});

describe('isRateLimitError', () => {
  it('should return true for rate limit errors', () => {
    expect(isRateLimitError({ message: 'rate limit exceeded' })).toBe(true);
    expect(isRateLimitError({ message: '429 Too Many Requests' })).toBe(true);
  });

  it('should return false for other errors', () => {
    expect(isRateLimitError({ message: 'file not found' })).toBe(false);
    expect(isRateLimitError({ message: 'syntax error' })).toBe(false);
  });
});

describe('extractRetryAfter', () => {
  it('should extract retry-after from headers', () => {
    const error = {
      message: 'rate limit',
      headers: { 'retry-after': '60' }
    };

    expect(extractRetryAfter(error)).toBe(60000);
  });

  it('should return undefined for errors without retry-after', () => {
    const error = { message: 'rate limit' };
    expect(extractRetryAfter(error)).toBeUndefined();
  });
});

describe('calculateBackoff', () => {
  it('should calculate backoff with default config', () => {
    const delay = calculateBackoff(1);

    // 1000 * 2^1 = 2000 ± 30%
    expect(delay).toBeGreaterThanOrEqual(1400);
    expect(delay).toBeLessThanOrEqual(2600);
  });

  it('should respect custom config', () => {
    const delay = calculateBackoff(1, 500, 10000, 0.1);

    // 500 * 2^1 = 1000 ± 10%
    expect(delay).toBeGreaterThanOrEqual(900);
    expect(delay).toBeLessThanOrEqual(1100);
  });
});

// ============================================================
// WAL Safe Parsing Tests
// ============================================================

describe('parseSafeWAL', () => {
  const testWalPath = path.join(PROJECT_ROOT, '.vibe-flow', 'wal', 'test-wal.log');

  beforeEach(() => {
    // Clean up test file
    if (fs.existsSync(testWalPath)) {
      fs.unlinkSync(testWalPath);
    }
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testWalPath)) {
      fs.unlinkSync(testWalPath);
    }
  });

  it('should return empty result for missing file', () => {
    const result = parseSafeWAL('/nonexistent/path.log');

    expect(result.success).toBe(true);
    expect(result.frames).toHaveLength(0);
    expect(result.corruptedFrames).toHaveLength(0);
  });

  it('should parse valid WAL frames', () => {
    const validFrame = {
      id: 'test-1',
      checkpointId: 'cp-1',
      timestamp: Date.now(),
      action: WALAction.FILE_CREATE,
      target: '/test/file.txt',
      previousState: null,
      newState: { path: '/test/file.txt', content: 'test' },
      status: 'applied'
    };

    fs.writeFileSync(testWalPath, JSON.stringify(validFrame) + '\n', 'utf-8');

    const result = parseSafeWAL(testWalPath);

    expect(result.success).toBe(true);
    expect(result.frames).toHaveLength(1);
    expect(result.corruptedFrames).toHaveLength(0);
    expect(result.frames[0].id).toBe('test-1');
  });

  it('should skip corrupted JSON frames', () => {
    const lines = [
      JSON.stringify({ id: 'test-1', checkpointId: 'cp-1', timestamp: Date.now(), action: 'FILE_CREATE', target: '/test', previousState: null, newState: null, status: 'applied' }),
      'invalid json line {{{',
      JSON.stringify({ id: 'test-2', checkpointId: 'cp-1', timestamp: Date.now(), action: 'FILE_MODIFY', target: '/test2', previousState: null, newState: null, status: 'pending' })
    ];

    fs.writeFileSync(testWalPath, lines.join('\n') + '\n', 'utf-8');

    const result = parseSafeWAL(testWalPath);

    expect(result.frames).toHaveLength(2);
    expect(result.corruptedFrames).toHaveLength(1);
    expect(result.corruptedFrames[0].lineNumber).toBe(2);
  });

  it('should validate frame structure', () => {
    // Missing required fields
    const invalidFrame = {
      id: 'test-1'
      // Missing checkpointId, timestamp, action, target, status
    };

    fs.writeFileSync(testWalPath, JSON.stringify(invalidFrame) + '\n', 'utf-8');

    const result = parseSafeWAL(testWalPath);

    expect(result.frames).toHaveLength(0);
    expect(result.corruptedFrames).toHaveLength(1);
  });

  it('should validate action types', () => {
    const invalidActionFrame = {
      id: 'test-1',
      checkpointId: 'cp-1',
      timestamp: Date.now(),
      action: 'INVALID_ACTION',
      target: '/test',
      previousState: null,
      newState: null,
      status: 'applied'
    };

    fs.writeFileSync(testWalPath, JSON.stringify(invalidActionFrame) + '\n', 'utf-8');

    const result = parseSafeWAL(testWalPath);

    expect(result.frames).toHaveLength(0);
    expect(result.corruptedFrames[0].parseError).toContain('Invalid action type');
  });
});

describe('getLastValidState', () => {
  const testWalPath = path.join(PROJECT_ROOT, '.vibe-flow', 'wal', 'test-wal2.log');

  beforeEach(() => {
    if (fs.existsSync(testWalPath)) {
      fs.unlinkSync(testWalPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testWalPath)) {
      fs.unlinkSync(testWalPath);
    }
  });

  it('should return null for empty WAL', () => {
    const result = getLastValidState(testWalPath);
    expect(result).toBeNull();
  });

  it('should return the most recent frame', () => {
    const now = Date.now();
    const frames = [
      { id: 'frame-1', checkpointId: 'cp-1', timestamp: now - 1000, action: WALAction.FILE_CREATE, target: '/old', previousState: null, newState: null, status: 'applied' },
      { id: 'frame-2', checkpointId: 'cp-1', timestamp: now, action: WALAction.FILE_MODIFY, target: '/new', previousState: null, newState: null, status: 'applied' }
    ];

    fs.writeFileSync(testWalPath, frames.map(f => JSON.stringify(f)).join('\n') + '\n', 'utf-8');

    const result = getLastValidState(testWalPath);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('frame-2');
  });
});

describe('recoverFromCorruptedWAL', () => {
  const testWalPath = path.join(PROJECT_ROOT, '.vibe-flow', 'wal', 'test-wal3.log');
  const backupPath = testWalPath + '.backup';

  beforeEach(() => {
    if (fs.existsSync(testWalPath)) fs.unlinkSync(testWalPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  });

  afterEach(() => {
    if (fs.existsSync(testWalPath)) fs.unlinkSync(testWalPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  });

  it('should return success for clean WAL', () => {
    const frame = {
      id: 'test-1',
      checkpointId: 'cp-1',
      timestamp: Date.now(),
      action: WALAction.FILE_CREATE,
      target: '/test',
      previousState: null,
      newState: null,
      status: 'applied'
    };

    fs.writeFileSync(testWalPath, JSON.stringify(frame) + '\n', 'utf-8');

    const result = recoverFromCorruptedWAL(testWalPath);

    expect(result.success).toBe(true);
    expect(result.linesRemoved).toBe(0);
  });

  it('should remove corrupted lines and create backup', () => {
    const lines = [
      JSON.stringify({ id: 'test-1', checkpointId: 'cp-1', timestamp: Date.now(), action: 'FILE_CREATE', target: '/test', previousState: null, newState: null, status: 'applied' }),
      'invalid json',
      JSON.stringify({ id: 'test-2', checkpointId: 'cp-1', timestamp: Date.now(), action: 'FILE_MODIFY', target: '/test2', previousState: null, newState: null, status: 'applied' })
    ];

    fs.writeFileSync(testWalPath, lines.join('\n') + '\n', 'utf-8');

    const result = recoverFromCorruptedWAL(testWalPath);

    expect(result.success).toBe(true);
    expect(result.linesRemoved).toBe(1);
    expect(fs.existsSync(backupPath)).toBe(true);
  });
});

describe('retryWithRateLimitBackoff', () => {
  it('should retry on transient errors', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw { message: '429 Too Many Requests' };
      }
      return 'success';
    };

    const result = await retryWithRateLimitBackoff(operation, 3);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  }, 10000);

  it('should propagate non-rate-limit errors', async () => {
    const operation = async () => {
      throw new Error('File not found');
    };

    const result = await retryWithRateLimitBackoff(operation, 3);

    expect(result.success).toBe(false);
  }, 10000);
});
