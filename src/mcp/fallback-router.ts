// Fallback Router with Circuit Breaker for MCP Tools
// Provides resilience for MCP tool calls with retry, fallback, and circuit breaker patterns

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',    // Normal operation, requests pass through
  OPEN = 'OPEN',        // Failing, requests are rejected immediately
  HALF_OPEN = 'HALF_OPEN'  // Testing if service recovered
}

/**
 * Error types that trigger circuit breaker
 */
export enum ErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Configuration for fallback router
 */
export interface FallbackRouterConfig {
  /** Maximum consecutive failures before opening circuit */
  maxRetries: number;
  /** Base delay for exponential backoff in ms */
  baseDelayMs: number;
  /** Maximum delay for exponential backoff in ms */
  maxDelayMs: number;
  /** Timeout for each tool execution in ms */
  timeoutMs: number;
  /** Enable circuit breaker */
  enableCircuitBreaker: boolean;
  /** Time to wait before trying HALF_OPEN state in ms */
  circuitResetTimeoutMs: number;
  /** Enable fallback to alternative providers */
  enableFallback: boolean;
  /** Enable detailed logging */
  verboseLogging: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackRouterConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 60000,
  enableCircuitBreaker: true,
  circuitResetTimeoutMs: 30000,
  enableFallback: true,
  verboseLogging: true
};

/**
 * Alternative provider for fallback
 */
export interface AlternativeProvider {
  name: string;
  toolName: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  priority: number;
}

/**
 * Circuit breaker state for a specific tool
 */
export interface CircuitBreakerState {
  toolName: string;
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  lastFailureReason: string | null;
  lastFailureType: ErrorType | null;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

/**
 * Result of a routed tool execution
 */
export interface RoutedToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  errorType?: ErrorType;
  toolUsed: string;
  providerUsed: string;
  circuitState: CircuitState;
  retryCount: number;
  fallbackUsed: boolean;
  executionTimeMs: number;
  timestamp: string;
  details?: {
    delayUsed?: number;
    originalError?: string;
    alternativeProvider?: string;
    retryAfter?: number;
  };
}

/**
 * Log entry for routing operations
 */
export interface RoutingLogEntry {
  id: string;
  timestamp: string;
  toolName: string;
  action: 'REQUEST' | 'RETRY' | 'FALLBACK' | 'SUCCESS' | 'FAILURE' | 'CIRCUIT_OPEN' | 'CIRCUIT_CLOSE' | 'CIRCUIT_HALF_OPEN' | 'INFO';
  provider: string;
  details: string;
  executionTimeMs: number;
  retryCount: number;
  circuitState: CircuitState;
}

/**
 * Custom error types for fallback router
 */
export class CircuitBreakerOpenError extends Error {
  public readonly toolName: string;
  public readonly circuitState: CircuitState;
  public readonly lastFailureReason: string | null;
  public readonly retryAfter: number;

  constructor(
    toolName: string,
    circuitState: CircuitState,
    lastFailureReason: string | null,
    retryAfter: number
  ) {
    super(`Circuit breaker is OPEN for tool "${toolName}". Retry after ${retryAfter}ms`);
    this.name = 'CircuitBreakerOpenError';
    this.toolName = toolName;
    this.circuitState = circuitState;
    this.lastFailureReason = lastFailureReason;
    this.retryAfter = retryAfter;
  }
}

export class FallbackExhaustedError extends Error {
  public readonly toolName: string;
  public readonly errors: Array<{ provider: string; error: string }>;

  constructor(
    toolName: string,
    errors: Array<{ provider: string; error: string }>
  ) {
    super(`All fallback providers exhausted for tool "${toolName}": ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);
    this.name = 'FallbackExhaustedError';
    this.toolName = toolName;
    this.errors = errors;
  }
}

export class TimeoutError extends Error {
  public readonly toolName: string;
  public readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
  }
}

export class RateLimitError extends Error {
  public readonly toolName: string;
  public readonly retryAfterMs: number;
  public readonly httpStatus: number;

  constructor(toolName: string, retryAfterMs: number, httpStatus: number = 429) {
    super(`Rate limit exceeded for tool "${toolName}". Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
    this.toolName = toolName;
    this.retryAfterMs = retryAfterMs;
    this.httpStatus = httpStatus;
  }
}

/**
 * Main Fallback Router class
 */
export class FallbackRouter {
  private config: FallbackRouterConfig;
  private circuitBreakers: Map<string, CircuitBreakerState>;
  private alternativeProviders: Map<string, AlternativeProvider[]>;
  private logs: RoutingLogEntry[];
  private logIdCounter: number;

  constructor(config: Partial<FallbackRouterConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.circuitBreakers = new Map();
    this.alternativeProviders = new Map();
    this.logs = [];
    this.logIdCounter = 0;

    this.log('INFO', 'FallbackRouter initialized', 'SYSTEM', `Config: ${JSON.stringify(this.config)}`, 0, CircuitState.CLOSED);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FallbackRouterConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('INFO', 'Config updated', 'SYSTEM', `New config: ${JSON.stringify(this.config)}`, 0, CircuitState.CLOSED);
  }

  /**
   * Register an alternative provider for a tool
   */
  registerAlternativeProvider(toolName: string, provider: AlternativeProvider): void {
    const providers = this.alternativeProviders.get(toolName) || [];
    providers.push(provider);
    providers.sort((a, b) => a.priority - b.priority);
    this.alternativeProviders.set(toolName, providers);

    this.log('INFO', 'Provider registered', toolName, `Provider: ${provider.name}`, 0, CircuitState.CLOSED);
  }

  /**
   * Get circuit breaker state for a tool
   */
  getCircuitState(toolName: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(toolName);
  }

  /**
   * Get all circuit breaker states
   */
  getAllCircuitStates(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }

  /**
   * Get routing logs
   */
  getLogs(limit: number = 100): RoutingLogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.logIdCounter = 0;
  }

  /**
   * Manually reset circuit breaker for a tool
   */
  resetCircuitBreaker(toolName: string): boolean {
    const cb = this.circuitBreakers.get(toolName);
    if (cb) {
      cb.state = CircuitState.CLOSED;
      cb.failureCount = 0;
      this.log('INFO', 'Circuit breaker manually reset', toolName, 'Manual reset', 0, CircuitState.CLOSED);
      return true;
    }
    return false;
  }

  /**
   * Manually open circuit breaker for a tool
   */
  openCircuitBreaker(toolName: string, reason: string): boolean {
    let cb = this.circuitBreakers.get(toolName);
    if (!cb) {
      cb = this.createCircuitBreakerState(toolName);
    }

    cb.state = CircuitState.OPEN;
    cb.failureCount = this.config.maxRetries;
    cb.lastFailureTime = Date.now();
    cb.lastFailureReason = reason;
    cb.lastFailureType = ErrorType.UNKNOWN;

    this.circuitBreakers.set(toolName, cb);
    this.log('FAILURE', 'Circuit breaker manually opened', toolName, reason, 0, CircuitState.OPEN);

    return true;
  }

  /**
   * Execute a tool with circuit breaker, retry with exponential backoff, and fallback
   */
  async execute<T>(
    toolName: string,
    primaryHandler: (params: Record<string, unknown>) => Promise<T>,
    params: Record<string, unknown> = {}
  ): Promise<RoutedToolResult> {
    const startTime = Date.now();
    const executionId = this.generateId();

    // Ensure circuit breaker state exists
    let cb = this.circuitBreakers.get(toolName);
    if (!cb) {
      cb = this.createCircuitBreakerState(toolName);
      this.circuitBreakers.set(toolName, cb);
    }

    // Check if circuit is OPEN
    if (cb.state === CircuitState.OPEN) {
      const retryAfter = this.calculateRetryAfter(cb);
      if (Date.now() - (cb.lastFailureTime || 0) < this.config.circuitResetTimeoutMs) {
        this.log('CIRCUIT_OPEN', 'Circuit open - rejecting request', toolName,
          `Failure count: ${cb.failureCount}, Last failure: ${cb.lastFailureReason}`, 0, CircuitState.OPEN);

        return {
          success: false,
          error: `Circuit breaker is OPEN for tool "${toolName}". Try again after ${retryAfter}ms`,
          errorType: ErrorType.SERVER_ERROR,
          toolUsed: toolName,
          providerUsed: 'primary',
          circuitState: CircuitState.OPEN,
          retryCount: 0,
          fallbackUsed: false,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          details: {
            retryAfter
          }
        };
      } else {
        // Transition to HALF_OPEN
        cb.state = CircuitState.HALF_OPEN;
        this.log('CIRCUIT_HALF_OPEN', 'Circuit transitioning to HALF_OPEN', toolName,
          'Timeout elapsed, allowing test request', 0, CircuitState.HALF_OPEN);
      }
    }

    // Execute with retry logic
    let lastError: Error | null = null;
    let retryCount = 0;
    let usedFallback = false;
    let alternativeProviderName: string | undefined;

    // Try primary handler with retries
    while (retryCount < this.config.maxRetries) {
      try {
        const result = await this.executeWithTimeout(toolName, primaryHandler, params);

        // Success - update circuit breaker
        this.handleSuccess(cb, toolName, Date.now() - startTime);

        this.log('SUCCESS', 'Tool executed successfully', toolName,
          `Provider: primary, Time: ${Date.now() - startTime}ms`, retryCount, cb.state);

        return {
          success: true,
          result,
          toolUsed: toolName,
          providerUsed: 'primary',
          circuitState: cb.state,
          retryCount,
          fallbackUsed: false,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorType = this.categorizeError(lastError);

        this.log('RETRY', `Attempt ${retryCount + 1} failed`, toolName,
          `Error: ${lastError.message}, Type: ${errorType}`, retryCount, cb.state);

        // Check if error is retryable
        if (!this.isRetryableError(errorType)) {
          this.handleFailure(cb, toolName, lastError.message, errorType);
          break;
        }

        // Check if we should try fallback
        if (this.config.enableFallback && retryCount >= 1) {
          const fallbackResult = await this.tryFallback(
            toolName, params, startTime, cb, executionId
          );
          if (fallbackResult) {
            return fallbackResult;
          }
          usedFallback = true;
        }

        // Wait with exponential backoff before retry
        if (retryCount < this.config.maxRetries - 1) {
          const delay = this.calculateBackoffDelay(retryCount, errorType);
          this.log('RETRY', `Waiting ${delay}ms before retry`, toolName,
            `Delay: ${delay}ms, Error type: ${errorType}`, retryCount, cb.state);
          await this.sleep(delay);
        }

        retryCount++;
      }
    }

    // All retries failed - handle final failure
    this.handleFailure(cb, toolName, lastError?.message || 'Unknown error',
      this.categorizeError(lastError || new Error('Unknown error')));

    // Try fallback as last resort
    if (this.config.enableFallback && !usedFallback) {
      const fallbackResult = await this.tryFallback(toolName, params, startTime, cb, executionId);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    // Return failure result
    const errorType = this.categorizeError(lastError || new Error('Unknown error'));

    this.log('FAILURE', 'All attempts exhausted', toolName,
      `Error: ${lastError?.message}, Fallback used: ${usedFallback}`, retryCount, cb.state);

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      errorType,
      toolUsed: toolName,
      providerUsed: usedFallback ? (alternativeProviderName || 'fallback') : 'primary',
      circuitState: cb.state,
      retryCount,
      fallbackUsed: usedFallback,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      details: {
        originalError: lastError?.message,
        alternativeProvider: alternativeProviderName
      }
    };
  }

  /**
   * Try fallback providers
   */
  private async tryFallback<T>(
    toolName: string,
    params: Record<string, unknown>,
    startTime: number,
    cb: CircuitBreakerState,
    executionId: string
  ): Promise<RoutedToolResult | null> {
    const providers = this.alternativeProviders.get(toolName);
    if (!providers || providers.length === 0) {
      return null;
    }

    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of providers) {
      this.log('FALLBACK', `Trying fallback provider: ${provider.name}`, toolName,
        `Provider: ${provider.name}, Tool: ${provider.toolName}`, cb.failureCount, cb.state);

      try {
        const result = await this.executeWithTimeout(
          toolName,
          provider.handler as (params: Record<string, unknown>) => Promise<T>,
          params
        );

        // Reset circuit breaker on successful fallback
        cb.state = CircuitState.CLOSED;
        cb.failureCount = 0;

        this.log('SUCCESS', 'Fallback provider succeeded', toolName,
          `Provider: ${provider.name}, Time: ${Date.now() - startTime}ms`, cb.failureCount, cb.state);

        return {
          success: true,
          result,
          toolUsed: toolName,
          providerUsed: provider.name,
          circuitState: cb.state,
          retryCount: cb.failureCount,
          fallbackUsed: true,
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          details: {
            alternativeProvider: provider.name
          }
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ provider: provider.name, error: errorMsg });

        this.log('FALLBACK', `Fallback provider failed: ${provider.name}`, toolName,
          `Error: ${errorMsg}`, cb.failureCount, cb.state);
      }
    }

    // All fallbacks exhausted
    return null;
  }

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout<T>(
    toolName: string,
    handler: (params: Record<string, unknown>) => Promise<T>,
    params: Record<string, unknown>
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(toolName, this.config.timeoutMs));
      }, this.config.timeoutMs);

      try {
        const result = await handler(params);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Create initial circuit breaker state
   */
  private createCircuitBreakerState(toolName: string): CircuitBreakerState {
    return {
      toolName,
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      lastFailureReason: null,
      lastFailureType: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * Handle successful execution
   */
  private handleSuccess(cb: CircuitBreakerState, toolName: string, executionTimeMs: number): void {
    cb.totalRequests++;
    cb.successfulRequests++;

    // If HALF_OPEN and success, close the circuit
    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.CLOSED;
      cb.failureCount = 0;
      this.log('CIRCUIT_CLOSE', 'Circuit closed after successful request', toolName,
        `Success rate: ${((cb.successfulRequests / cb.totalRequests) * 100).toFixed(1)}%`,
        cb.failureCount, CircuitState.CLOSED);
    }
  }

  /**
   * Handle failed execution
   */
  private handleFailure(
    cb: CircuitBreakerState,
    toolName: string,
    reason: string,
    errorType: ErrorType
  ): void {
    cb.totalRequests++;
    cb.failedRequests++;
    cb.failureCount++;
    cb.lastFailureTime = Date.now();
    cb.lastFailureReason = reason;
    cb.lastFailureType = errorType;

    // Open circuit if max failures reached
    if (cb.failureCount >= this.config.maxRetries) {
      cb.state = CircuitState.OPEN;
      this.log('FAILURE', 'Circuit opened due to failures', toolName,
        `Failure count: ${cb.failureCount}, Reason: ${reason}`, cb.failureCount, CircuitState.OPEN);
    }
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('network') || message.includes('econnrefused') ||
        message.includes('econnreset') || message.includes('enotfound')) {
      return ErrorType.NETWORK;
    }
    if (message.includes('500') || message.includes('502') || message.includes('503') ||
        message.includes('internal server') || message.includes('bad gateway')) {
      return ErrorType.SERVER_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(errorType: ErrorType): boolean {
    return errorType === ErrorType.TIMEOUT ||
           errorType === ErrorType.RATE_LIMIT ||
           errorType === ErrorType.NETWORK;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number, errorType: ErrorType): number {
    // Add extra delay for rate limiting
    let multiplier = errorType === ErrorType.RATE_LIMIT ? 2 : 1;
    let delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, retryCount) * multiplier,
      this.config.maxDelayMs
    );

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    delay = Math.floor(delay + jitter);

    return delay;
  }

  /**
   * Calculate retry after time for circuit breaker
   */
  private calculateRetryAfter(cb: CircuitBreakerState): number {
    if (!cb.lastFailureTime) {
      return this.config.circuitResetTimeoutMs;
    }
    const elapsed = Date.now() - cb.lastFailureTime;
    return Math.max(0, this.config.circuitResetTimeoutMs - elapsed);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `log_${Date.now()}_${++this.logIdCounter}`;
  }

  /**
   * Internal logging
   */
  private log(
    action: RoutingLogEntry['action'],
    details: string,
    toolName: string,
    detailMessage: string,
    retryCount: number,
    circuitState: CircuitState
  ): void {
    if (!this.config.verboseLogging) return;

    const entry: RoutingLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      toolName,
      action,
      provider: 'system',
      details: `${action}: ${detailMessage}`,
      executionTimeMs: 0,
      retryCount,
      circuitState
    };

    this.logs.push(entry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    // Console output based on action type
    const prefix = `[FallbackRouter:${action}]`;
    switch (action) {
      case 'SUCCESS':
        console.log(`${prefix} ${toolName}: ${detailMessage}`);
        break;
      case 'FAILURE':
      case 'CIRCUIT_OPEN':
        console.error(`${prefix} ${toolName}: ${detailMessage}`);
        break;
      case 'RETRY':
      case 'FALLBACK':
      case 'CIRCUIT_HALF_OPEN':
        console.warn(`${prefix} ${toolName}: ${detailMessage}`);
        break;
      default:
        if (this.config.verboseLogging) {
          console.log(`${prefix} ${toolName}: ${detailMessage}`);
        }
    }
  }
}

/**
 * Factory function to create a FallbackRouter
 */
export function createFallbackRouter(config?: Partial<FallbackRouterConfig>): FallbackRouter {
  return new FallbackRouter(config);
}
