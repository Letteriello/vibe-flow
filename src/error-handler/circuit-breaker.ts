// Circuit Breaker pattern for LLM/Agent failure handling
// Provides protection against repeated failures and suggests human intervention

/**
 * Circuit Breaker states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures detected, requests are blocked
 * - HALF_OPEN: Testing if recovery is possible after OPEN state
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Error codes specific to Circuit Breaker operations
 */
export enum CircuitBreakerErrorCode {
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  AGENT_FAILURE = 'AGENT_FAILURE',
  HUMAN_INTERVENTION_REQUIRED = 'HUMAN_INTERVENTION_REQUIRED'
}

/**
 * Configuration for AgentCircuitBreaker
 */
export interface CircuitBreakerConfig {
  /** Maximum consecutive failures before opening the circuit (default: 3) */
  maxRetries: number;
  /** Time in ms to wait before attempting to transition from OPEN to HALF_OPEN (default: 30000) */
  resetTimeoutMs: number;
  /** Maximum number of successful calls needed in HALF_OPEN to close the circuit (default: 1) */
  successThreshold: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Result of a circuit breaker operation
 */
export interface CircuitBreakerResult<T> {
  success: boolean;
  result?: T;
  error?: CircuitBreakerError;
  state: CircuitBreakerState;
  attempts: number;
}

/**
 * Custom error for Circuit Breaker operations
 * Includes suggestions for human intervention
 */
export class CircuitBreakerError extends Error {
  public readonly code: CircuitBreakerErrorCode;
  public readonly operation: string;
  public readonly failureCount: number;
  public readonly maxRetries: number;
  public readonly state: CircuitBreakerState;
  public readonly suggestions: string[];

  constructor(
    message: string,
    code: CircuitBreakerErrorCode,
    operation: string,
    failureCount: number,
    maxRetries: number,
    state: CircuitBreakerState,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.code = code;
    this.operation = operation;
    this.failureCount = failureCount;
    this.maxRetries = maxRetries;
    this.state = state;
    this.suggestions = suggestions;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerError);
    }
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxRetries: 3,
  resetTimeoutMs: 30000,
  successThreshold: 1,
  verbose: false
};

/**
 * AgentCircuitBreaker - Circuit Breaker pattern implementation
 * Adapted for LLM/Agent failures with human-in-the-loop suggestions
 */
export class AgentCircuitBreaker {
  private state: CircuitBreakerState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private config: CircuitBreakerConfig;
  private operationHistory: Array<{
    operation: string;
    success: boolean;
    timestamp: number;
    error?: string;
  }>;

  /**
   * Creates a new AgentCircuitBreaker instance
   * @param config Optional configuration overrides
   */
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.operationHistory = [];
  }

  /**
   * Gets the current state of the circuit breaker
   */
  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Gets the current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Gets the operation history
   */
  getHistory(): ReadonlyArray<{
    operation: string;
    success: boolean;
    timestamp: number;
    error?: string;
  }> {
    return [...this.operationHistory];
  }

  /**
   * Executes an operation with circuit breaker protection
   * @param operation The async operation to execute
   * @param operationName Identifier for the operation (for logging)
   * @returns Promise<CircuitBreakerResult<T>>
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'unknown'
  ): Promise<CircuitBreakerResult<T>> {
    // Check if circuit should transition states
    this.checkStateTransition();

    // If circuit is OPEN, reject immediately
    if (this.state === CircuitBreakerState.OPEN) {
      const suggestions = this.generateHumanInterventionSuggestions();
      const error = new CircuitBreakerError(
        `Circuit breaker is OPEN for operation "${operationName}". Maximum retries (${this.config.maxRetries}) exceeded.`,
        CircuitBreakerErrorCode.CIRCUIT_OPEN,
        operationName,
        this.failureCount,
        this.config.maxRetries,
        this.state,
        suggestions
      );

      this.log(`Circuit OPEN - rejecting operation "${operationName}"`);

      return {
        success: false,
        error,
        state: this.state,
        attempts: this.failureCount
      };
    }

    // Attempt to execute the operation
    try {
      this.log(`Executing operation "${operationName}" (state: ${this.state})`);
      const result = await operation();

      // Success handling
      this.handleSuccess(operationName);

      return {
        success: true,
        result,
        state: this.getState(),
        attempts: 1
      };
    } catch (error) {
      // Failure handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleFailure(operationName, errorMessage);

      const suggestions = this.generateHumanInterventionSuggestions();

      // Determine if circuit should open
      if (this.failureCount >= this.config.maxRetries) {
        this.transitionToOpen();
        const circuitError = new CircuitBreakerError(
          `Operation "${operationName}" failed ${this.failureCount} times. Circuit breaker opening to prevent further damage.`,
          CircuitBreakerErrorCode.MAX_RETRIES_EXCEEDED,
          operationName,
          this.failureCount,
          this.config.maxRetries,
          this.state,
          suggestions
        );

        return {
          success: false,
          error: circuitError,
          state: this.state,
          attempts: this.failureCount
        };
      }

      const failureError = new CircuitBreakerError(
        `Operation "${operationName}" failed: ${errorMessage}. Attempt ${this.failureCount}/${this.config.maxRetries}.`,
        CircuitBreakerErrorCode.AGENT_FAILURE,
        operationName,
        this.failureCount,
        this.config.maxRetries,
        this.state,
        suggestions
      );

      return {
        success: false,
        error: failureError,
        state: this.getState(),
        attempts: this.failureCount
      };
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   * Should be called after human intervention
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.log('Circuit breaker manually reset to CLOSED');
  }

  /**
   * Check if state transition should occur based on timeout
   */
  private checkStateTransition(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.OPEN) {
      if (now - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.transitionToHalfOpen();
      }
    }
  }

  /**
   * Handle successful operation
   */
  private handleSuccess(operationName: string): void {
    this.operationHistory.push({
      operation: operationName,
      success: true,
      timestamp: Date.now()
    });

    // In HALF_OPEN state, count successes
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      this.log(`Success in HALF_OPEN: ${this.successCount}/${this.config.successThreshold}`);

      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else {
      // In CLOSED state, reset failure count on success
      this.failureCount = 0;
    }

    // Keep history limited
    this.pruneHistory();

    this.log(`Operation "${operationName}" succeeded (state: ${this.state})`);
  }

  /**
   * Handle failed operation
   */
  private handleFailure(operationName: string, errorMessage: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.operationHistory.push({
      operation: operationName,
      success: false,
      timestamp: this.lastFailureTime,
      error: errorMessage
    });

    // In HALF_OPEN, any failure goes back to OPEN
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
    }

    // Keep history limited
    this.pruneHistory();

    this.log(`Operation "${operationName}" failed: ${errorMessage} (failures: ${this.failureCount})`);
  }

  /**
   * Transition to CLOSED state (normal operation)
   */
  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.log('Circuit breaker transitioned to CLOSED');
  }

  /**
   * Transition to OPEN state (blocking requests)
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.successCount = 0;
    this.log('Circuit breaker transitioned to OPEN');
  }

  /**
   * Transition to HALF_OPEN state (testing recovery)
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.successCount = 0;
    this.log('Circuit breaker transitioned to HALF_OPEN (testing recovery)');
  }

  /**
   * Generate human intervention suggestions based on failure patterns
   */
  private generateHumanInterventionSuggestions(): string[] {
    const suggestions: string[] = [
      'Review recent code changes that may have introduced the failure',
      'Check external dependencies or API status',
      'Consider running tests manually to diagnose the issue',
      'Analyze logs for patterns in the failures'
    ];

    // Analyze recent errors for specific suggestions
    const recentErrors = this.operationHistory
      .filter(entry => !entry.success)
      .slice(-5);

    const errorPatterns = recentErrors
      .map(entry => entry.error?.toLowerCase() || '')
      .join(' ');

    if (/compil|tsc|typescript|syntax/i.test(errorPatterns)) {
      suggestions.unshift('TypeScript compilation errors detected - consider running `tsc --noEmit` to identify issues');
    }

    if (/test|jest|vitest|mocha/i.test(errorPatterns)) {
      suggestions.unshift('Test failures detected - run tests manually to see detailed error output');
    }

    if (/lint|eslint/i.test(errorPatterns)) {
      suggestions.unshift('Linting errors detected - run `npm run lint` for detailed feedback');
    }

    if (/rate.*limit|429|too many request/i.test(errorPatterns)) {
      suggestions.unshift('Rate limiting detected - wait for cooldown period or check API quota');
    }

    if (/timeout|etimedout/i.test(errorPatterns)) {
      suggestions.unshift('Timeout errors detected - consider increasing timeout values or checking network');
    }

    if (/network|connection|econnrefused/i.test(errorPatterns)) {
      suggestions.unshift('Network issues detected - check internet connection and service availability');
    }

    // Add final suggestion about human-in-the-loop
    suggestions.push('Consider enabling Human-in-the-Loop mode for critical operations');

    return suggestions;
  }

  /**
   * Prune operation history to prevent memory issues
   */
  private pruneHistory(): void {
    if (this.operationHistory.length > 100) {
      this.operationHistory = this.operationHistory.slice(-50);
    }
  }

  /**
   * Conditional logging based on verbose config
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[CircuitBreaker] ${message}`);
    }
  }
}

/**
 * Creates a pre-configured circuit breaker for build operations
 */
export function createBuildCircuitBreaker(): AgentCircuitBreaker {
  return new AgentCircuitBreaker({
    maxRetries: 3,
    resetTimeoutMs: 30000,
    verbose: false
  });
}

/**
 * Creates a pre-configured circuit breaker for test operations
 */
export function createTestCircuitBreaker(): AgentCircuitBreaker {
  return new AgentCircuitBreaker({
    maxRetries: 3,
    resetTimeoutMs: 60000,
    verbose: false
  });
}

/**
 * Creates a pre-configured circuit breaker for LLM/Agent operations
 */
export function createAgentCircuitBreaker(): AgentCircuitBreaker {
  return new AgentCircuitBreaker({
    maxRetries: 3,
    resetTimeoutMs: 45000,
    verbose: true
  });
}
