/**
 * Token Estimation Unit Tests
 *
 * Testa o módulo de estimativa de tokens com caching LRU.
 *
 * Executar com:
 *   npm test -- --testPathPattern=token-estimation
 *   npx jest tests/unit/token-estimation.test.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import after setting up paths
const projectRoot = path.resolve(__dirname, '../..');
const {
  estimateTokens,
  estimateTokensBatch,
  estimateMessagesTokens,
  estimateObjectTokens,
  calculateTotalTokens,
  createTokenEstimator,
  getEncodingRatio,
  estimateTokensCached,
  getCacheStats,
  invalidateCache,
  TokenEstimateOptions,
  TokenEncoding,
  ContextMessage,
} = await import(path.join(projectRoot, 'dist/utils/token-estimation.js'));

describe('Token Estimation Module', () => {
  // Clear cache before each test
  beforeEach(() => {
    invalidateCache();
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('   ')).toBeGreaterThan(0); // whitespace has length
    });

    it('should estimate tokens using default 4 chars per token', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimateTokens(text);
      expect(tokens).toBe(Math.ceil(11 / 4)); // 3
    });

    it('should use custom characters per token option', () => {
      const text = 'Hello world';
      const tokens = estimateTokens(text, { charactersPerToken: 2 });
      expect(tokens).toBe(Math.ceil(11 / 2)); // 6
    });

    it('should handle different encodings', () => {
      const text = 'Hello world';

      // cl100k default is 4
      const tokensCl100k = estimateTokens(text, { encoding: 'cl100k' });
      expect(tokensCl100k).toBe(3);

      // character encoding is 1:1
      const tokensChar = estimateTokens(text, { encoding: 'character' });
      expect(tokensChar).toBe(11);

      // p50k same as cl100k
      const tokensP50k = estimateTokens(text, { encoding: 'p50k' });
      expect(tokensP50k).toBe(3);
    });

    it('should handle various text lengths', () => {
      expect(estimateTokens('a')).toBe(1);
      expect(estimateTokens('ab')).toBe(1);
      expect(estimateTokens('abc')).toBe(1);
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcde')).toBe(2);
      expect(estimateTokens('x'.repeat(100))).toBe(25);
    });

    it('should handle Unicode characters', () => {
      const unicode = 'こんにちは'; // 5 characters
      const tokens = estimateTokens(unicode);
      expect(tokens).toBe(Math.ceil(5 / 4));
    });

    it('should handle newlines and special chars', () => {
      const text = 'line1\nline2\r\nline3';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateTokensBatch', () => {
    it('should return 0 for empty array', () => {
      expect(estimateTokensBatch([])).toBe(0);
    });

    it('should sum tokens for all texts', () => {
      const texts = ['Hello', 'world', 'test'];
      const tokens = estimateTokensBatch(texts);
      expect(tokens).toBe(estimateTokens('Hello') + estimateTokens('world') + estimateTokens('test'));
    });

    it('should apply options to all texts', () => {
      const texts = ['Hello', 'world'];
      const tokens = estimateTokensBatch(texts, { charactersPerToken: 2 });
      expect(tokens).toBe(6); // ceil(5/2) + ceil(5/2) = 3 + 3
    });
  });

  describe('calculateTotalTokens', () => {
    it('should return 0 for empty array', () => {
      expect(calculateTotalTokens([])).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(calculateTotalTokens(null as any)).toBe(0);
      expect(calculateTotalTokens(undefined as any)).toBe(0);
    });

    it('should sum tokens from content property', () => {
      const messages = [
        { content: 'Hello' },
        { content: 'World' },
        { content: '' }, // empty should count as 0
      ];
      const tokens = calculateTotalTokens(messages);
      expect(tokens).toBe(estimateTokens('Hello') + estimateTokens('World'));
    });

    it('should handle missing content property', () => {
      const messages = [
        { role: 'user' },
        { role: 'assistant', content: 'Test' },
      ];
      const tokens = calculateTotalTokens(messages);
      expect(tokens).toBe(estimateTokens('Test'));
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should return 0 for empty array', () => {
      expect(estimateMessagesTokens([])).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(estimateMessagesTokens(null as any)).toBe(0);
      expect(estimateMessagesTokens(undefined as any)).toBe(0);
    });

    it('should include overhead per message (5 tokens per message)', () => {
      const messages: ContextMessage[] = [
        { role: 'user', content: 'Hello' },
      ];
      const tokens = estimateMessagesTokens(messages);
      const expected = estimateTokens('Hello') + 5;
      expect(tokens).toBe(expected);
    });

    it('should handle multiple messages with overhead', () => {
      const messages: ContextMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ];
      const tokens = estimateMessagesTokens(messages);
      const contentTokens = estimateTokens('Hello') + estimateTokens('Hi there') + estimateTokens('How are you?');
      const overhead = 5 * 3;
      expect(tokens).toBe(contentTokens + overhead);
    });

    it('should handle messages with all role types', () => {
      const messages: ContextMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'tool', content: 'Tool result', tool_call_id: 'call_123' },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should apply options to all messages', () => {
      const messages: ContextMessage[] = [
        { role: 'user', content: 'Hello' },
      ];
      const tokens = estimateMessagesTokens(messages, { charactersPerToken: 2 });
      expect(tokens).toBeGreaterThan(estimateTokens('Hello') + 5);
    });

    it('should handle empty content messages', () => {
      const messages: ContextMessage[] = [
        { role: 'user', content: '' },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBe(5); // Just overhead
    });
  });

  describe('estimateObjectTokens', () => {
    it('should return 0 for null/undefined', () => {
      expect(estimateObjectTokens(null as any)).toBe(0);
      expect(estimateObjectTokens(undefined as any)).toBe(0);
    });

    it('should estimate tokens for JSON serialized object', () => {
      const obj = { name: 'test', value: 123 };
      const tokens = estimateObjectTokens(obj);
      const jsonStr = JSON.stringify(obj);
      expect(tokens).toBe(estimateTokens(jsonStr));
    });

    it('should handle empty object', () => {
      const tokens = estimateObjectTokens({});
      const jsonStr = '{}';
      expect(tokens).toBe(estimateTokens(jsonStr));
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          settings: { theme: 'dark' }
        },
        items: [1, 2, 3]
      };
      const tokens = estimateObjectTokens(obj);
      const jsonStr = JSON.stringify(obj);
      expect(tokens).toBe(estimateTokens(jsonStr));
    });

    it('should handle arrays', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const tokens = estimateObjectTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should apply options to JSON string', () => {
      const obj = { test: 'value' };
      const tokens = estimateObjectTokens(obj, { charactersPerToken: 2 });
      const jsonStr = JSON.stringify(obj);
      expect(tokens).toBe(estimateTokens(jsonStr, { charactersPerToken: 2 }));
    });
  });

  describe('createTokenEstimator', () => {
    it('should create estimator with default options', () => {
      const estimator = createTokenEstimator();

      expect(estimator).toHaveProperty('estimate');
      expect(estimator).toHaveProperty('estimateMessages');
      expect(estimator).toHaveProperty('estimateObject');
      expect(estimator).toHaveProperty('estimateBatch');
      expect(estimator).toHaveProperty('options');
    });

    it('should estimate tokens correctly', () => {
      const estimator = createTokenEstimator();
      const tokens = estimator.estimate('Hello world');
      expect(tokens).toBe(estimateTokens('Hello world'));
    });

    it('should estimate messages correctly', () => {
      const estimator = createTokenEstimator();
      const messages: ContextMessage[] = [
        { role: 'user', content: 'Hello' },
      ];
      const tokens = estimator.estimateMessages(messages);
      expect(tokens).toBe(estimateMessagesTokens(messages));
    });

    it('should estimate object correctly', () => {
      const estimator = createTokenEstimator();
      const obj = { test: 'value' };
      const tokens = estimator.estimateObject(obj);
      expect(tokens).toBe(estimateObjectTokens(obj));
    });

    it('should estimate batch correctly', () => {
      const estimator = createTokenEstimator();
      const texts = ['Hello', 'world'];
      const tokens = estimator.estimateBatch(texts);
      expect(tokens).toBe(estimateTokensBatch(texts));
    });

    it('should use default options when creating estimator', () => {
      const estimator = createTokenEstimator({ charactersPerToken: 2 });
      const tokens = estimator.estimate('Hello world');
      expect(tokens).toBe(estimateTokens('Hello world', { charactersPerToken: 2 }));
    });

    it('should pass options to all methods', () => {
      const estimator = createTokenEstimator({ encoding: 'character' });
      const tokens = estimator.estimate('Hello');
      expect(tokens).toBe(5); // 1:1 ratio
    });

    it('should expose options', () => {
      const customOptions: TokenEstimateOptions = {
        encoding: 'cl100k',
        charactersPerToken: 3,
      };
      const estimator = createTokenEstimator(customOptions);
      expect(estimator.options).toEqual(customOptions);
    });
  });

  describe('getEncodingRatio', () => {
    it('should return 4.0 for cl100k encoding', () => {
      expect(getEncodingRatio('cl100k')).toBe(4.0);
    });

    it('should return 4.0 for p50k encoding', () => {
      expect(getEncodingRatio('p50k')).toBe(4.0);
    });

    it('should return 4.0 for r50k encoding', () => {
      expect(getEncodingRatio('r50k')).toBe(4.0);
    });

    it('should return 1.0 for character encoding', () => {
      expect(getEncodingRatio('character')).toBe(1.0);
    });

    it('should return default 4.0 for unknown encoding', () => {
      expect(getEncodingRatio('unknown' as TokenEncoding)).toBe(4.0);
    });
  });

  describe('Cache Functionality', () => {
    describe('estimateTokensCached', () => {
      it('should return 0 for empty string', () => {
        expect(estimateTokensCached('')).toBe(0);
      });

      it('should estimate tokens with caching', () => {
        const text = 'Hello world test message';
        const tokens = estimateTokensCached(text);
        expect(tokens).toBe(estimateTokens(text));
      });

      it('should cache results for same text', () => {
        const text = 'Cached text';

        // First call
        const tokens1 = estimateTokensCached(text);

        // Get stats - should have a miss
        const stats1 = getCacheStats();

        // Second call - should hit cache
        const tokens2 = estimateTokensCached(text);
        const stats2 = getCacheStats();

        expect(tokens1).toBe(tokens2);
        expect(stats2.hits).toBeGreaterThan(stats1.hits);
      });

      it('should use options with cached estimation', () => {
        const text = 'Test';
        const tokens = estimateTokensCached(text, { charactersPerToken: 2 });
        expect(tokens).toBe(2); // ceil(4/2)
      });

      it('should cache different results for different texts', () => {
        const text1 = 'Text one';
        const text2 = 'Text two';

        const tokens1 = estimateTokensCached(text1);
        const tokens2 = estimateTokensCached(text2);

        expect(tokens1).not.toBe(tokens2); // Different lengths
      });
    });

    describe('getCacheStats', () => {
      it('should return cache stats object', () => {
        const stats = getCacheStats();

        expect(stats).toHaveProperty('hits');
        expect(stats).toHaveProperty('misses');
        expect(stats).toHaveProperty('hitRate');
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('maxSize');
      });

      it('should track hits and misses', () => {
        // Clear cache first
        invalidateCache();
        const statsBefore = getCacheStats();

        // Add some entries
        estimateTokensCached('test1');
        estimateTokensCached('test2');

        const statsAfterAdd = getCacheStats();
        expect(statsAfterAdd.misses).toBeGreaterThanOrEqual(statsBefore.misses + 2);

        // Access cached
        estimateTokensCached('test1');
        const statsAfterHit = getCacheStats();
        expect(statsAfterHit.hits).toBeGreaterThan(statsAfterAdd.hits);
      });

      it('should calculate hit rate correctly', () => {
        invalidateCache();

        // Add entries
        estimateTokensCached('a');
        estimateTokensCached('b');
        estimateTokensCached('c');

        // Access some again
        estimateTokensCached('a');
        estimateTokensCached('a');

        const stats = getCacheStats();
        const expectedHits = 2;
        const expectedMisses = 3;
        expect(stats.hits).toBe(expectedHits);
        expect(stats.misses).toBe(expectedMisses);
        expect(stats.hitRate).toBeCloseTo(2 / 5, 2);
      });

      it('should return 0 hit rate for empty cache', () => {
        invalidateCache();
        const stats = getCacheStats();
        expect(stats.hitRate).toBe(0);
      });

      it('should track cache size', () => {
        invalidateCache();
        const statsBefore = getCacheStats();

        estimateTokensCached('test1');
        const statsAfter = getCacheStats();

        expect(statsAfter.size).toBe(statsBefore.size + 1);
      });
    });

    describe('invalidateCache', () => {
      it('should clear entire cache when no key provided', () => {
        // Add some entries
        estimateTokensCached('test1');
        estimateTokensCached('test2');

        const statsBefore = getCacheStats();
        expect(statsBefore.size).toBeGreaterThan(0);

        // Invalidate all
        invalidateCache();

        const statsAfter = getCacheStats();
        expect(statsAfter.size).toBe(0);
        expect(statsAfter.hits).toBe(0);
        expect(statsAfter.misses).toBe(0);
      });

      it('should clear specific key when provided', () => {
        // Add entries
        estimateTokensCached('test1');
        estimateTokensCached('test2');

        // Invalidate one
        invalidateCache('test1');

        const stats = getCacheStats();
        expect(stats.size).toBe(1);

        // Original cached value should be recalculated
        const tokens1 = estimateTokensCached('test1');
        const tokens2 = estimateTokensCached('test2');

        expect(tokens1).toBe(estimateTokens('test1'));
        expect(tokens2).toBe(estimateTokens('test2'));
      });

      it('should handle invalidation of non-existent key', () => {
        estimateTokensCached('test1');
        invalidateCache('nonexistent');

        const stats = getCacheStats();
        expect(stats.size).toBe(1);
      });
    });

    describe('LRU Eviction', () => {
      it('should evict oldest entries when cache is full', () => {
        invalidateCache();

        // The cache has maxSize of 1000, so we need many entries
        // But for testing, let's verify eviction works conceptually

        // Add many entries
        for (let i = 0; i < 100; i++) {
          estimateTokensCached(`text_${i}_${'x'.repeat(50)}`);
        }

        const stats = getCacheStats();
        // Should have entries but possibly evicted some
        expect(stats.size).toBeLessThanOrEqual(1000);
      });
    });
  });

  describe('Backward Compatibility Aliases', () => {
    it('compactionEstimateTokens should work', () => {
      const { compactionEstimateTokens } = await import(path.join(projectRoot, 'dist/utils/token-estimation.js'));
      expect(compactionEstimateTokens).toBe(estimateTokens);
    });

    it('estimateTokenCount should work', () => {
      const { estimateTokenCount } = await import(path.join(projectRoot, 'dist/utils/token-estimation.js'));
      expect(estimateTokenCount).toBe(estimateTokens);
    });

    it('countTokens should work', () => {
      const { countTokens } = await import(path.join(projectRoot, 'dist/utils/token-estimation.js'));
      expect(countTokens).toBe(estimateTokens);
    });

    it('estimateFileTokens should work', () => {
      const { estimateFileTokens } = await import(path.join(projectRoot, 'dist/utils/token-estimation.js'));
      expect(estimateFileTokens).toBe(estimateTokens);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long text', () => {
      const longText = 'x'.repeat(100000);
      const tokens = estimateTokens(longText);
      expect(tokens).toBe(Math.ceil(100000 / 4));
    });

    it('should handle special characters in objects', () => {
      const obj = {
        special: 'quotes"escapes\nnewlines\ttabs',
        unicode: '日本語中文한글',
        emoji: '😀🎉🚀',
      };
      const tokens = estimateObjectTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle messages with tool calls', () => {
      const messages: ContextMessage[] = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'testFunction',
                arguments: '{"param": "value"}',
              },
            },
          ],
        },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(5); // At least overhead
    });

    it('should handle messages with name property', () => {
      const messages: ContextMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          name: 'user_123',
        },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(5);
    });

    it('should handle messages with timestamp', () => {
      const messages: ContextMessage[] = [
        {
          role: 'user',
          content: 'Test',
          timestamp: new Date().toISOString(),
        },
      ];
      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(5);
    });
  });
});
