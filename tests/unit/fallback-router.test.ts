// Test for FallbackRouter with Circuit Breaker
import { FallbackRouter, CircuitState, ErrorType } from '../../src/mcp/fallback-router.js';

describe('FallbackRouter', () => {
  let router: FallbackRouter;

  beforeEach(() => {
    router = new FallbackRouter({
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 5000,
      enableCircuitBreaker: true,
      circuitResetTimeoutMs: 5000,
      enableFallback: true,
      verboseLogging: false
    });
  });

  describe('Circuit Breaker', () => {
    it('should create circuit state on first execution', async () => {
      const successHandler = async () => ({ result: 'success' });
      await router.execute('test_tool', successHandler, {});

      const state = router.getCircuitState('test_tool');
      expect(state?.state).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after max retries', async () => {
      const failingHandler = async () => {
        throw new Error('Simulated failure');
      };

      // Execute 4 times - fallback is tried after 1st retry, so need more attempts
      // to trigger circuit breaker (maxRetries = 3)
      for (let i = 0; i < 4; i++) {
        await router.execute('test_tool_2', failingHandler, {});
      }

      const state = router.getCircuitState('test_tool_2');
      expect(state?.state).toBe(CircuitState.OPEN);
    });

    it('should remain CLOSED after successful execution', async () => {
      const successHandler = async () => ({ result: 'success' });

      await router.execute('test_tool', successHandler, {});

      const state = router.getCircuitState('test_tool');
      expect(state?.state).toBe(CircuitState.CLOSED);
      expect(state?.successfulRequests).toBe(1);
    });
  });

  describe('Error categorization', () => {
    it('should categorize timeout errors', async () => {
      const timeoutHandler = async () => {
        throw new Error('timeout error');
      };

      const result = await router.execute('test_tool', timeoutHandler, {});

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorType.TIMEOUT);
    });

    it('should categorize rate limit errors (429)', async () => {
      const rateLimitHandler = async () => {
        throw new Error('HTTP 429: Rate limit exceeded');
      };

      const result = await router.execute('test_tool', rateLimitHandler, {});

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorType.RATE_LIMIT);
    });

    it('should categorize network errors', async () => {
      const networkHandler = async () => {
        throw new Error('ECONNREFUSED: Connection refused');
      };

      const result = await router.execute('test_tool', networkHandler, {});

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorType.NETWORK);
    });
  });

  describe('Fallback providers', () => {
    it('should execute fallback on primary failure', async () => {
      let primaryCalled = false;
      let fallbackCalled = false;

      const primaryHandler = async () => {
        primaryCalled = true;
        throw new Error('Primary failed');
      };

      router.registerAlternativeProvider('test_tool', {
        name: 'fallback_1',
        toolName: 'test_tool',
        handler: async () => {
          fallbackCalled = true;
          return { fallback: 'success' };
        },
        priority: 1
      });

      const result = await router.execute('test_tool', primaryHandler, {});

      expect(primaryCalled).toBe(true);
      expect(fallbackCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.providerUsed).toBe('fallback_1');
    });
  });

  describe('Retry logic', () => {
    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const handler = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Timeout - retry me');
        }
        return { success: true, attempts };
      };

      const result = await router.execute('test_tool', handler, {});

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });
  });

  describe('Logging', () => {
    it('should track logs when verbose logging is enabled', async () => {
      const verboseRouter = new FallbackRouter({
        verboseLogging: true,
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 100,
        timeoutMs: 1000,
        enableCircuitBreaker: false,
        circuitResetTimeoutMs: 1000,
        enableFallback: false
      });

      const handler = async () => ({ result: 'ok' });

      await verboseRouter.execute('test_tool', handler, {});

      const logs = verboseRouter.getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Manual circuit control', () => {
    it('should manually reset circuit breaker', () => {
      router.openCircuitBreaker('test_tool', 'Manual open');
      let state = router.getCircuitState('test_tool');
      expect(state?.state).toBe(CircuitState.OPEN);

      const reset = router.resetCircuitBreaker('test_tool');
      expect(reset).toBe(true);

      state = router.getCircuitState('test_tool');
      expect(state?.state).toBe(CircuitState.CLOSED);
    });

    it('should return false when resetting non-existent circuit', () => {
      const reset = router.resetCircuitBreaker('non_existent');
      expect(reset).toBe(false);
    });
  });
});
