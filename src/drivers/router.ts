/**
 * Agent Router - Circuit Breaker Pattern
 *
 * Routes agent tasks between drivers with automatic failover.
 * Uses Circuit Breaker pattern: tries primary driver first,
 * falls back to secondary driver on failure (e.g., Rate Limit).
 */

import { AgentDriver, CircuitBreakerState, DriverResult } from './types.js';
import { ClaudeCodeDriver } from './claude-code.js';
import { CodexDriver } from './codex.js';

/**
 * Errors that trigger circuit breaker fallback
 */
const FALLBACK_ERRORS = [
  'Rate Limit',
  'rate limit',
  'RATE_LIMIT',
  '429',
  'Too Many Requests',
];

/**
 * Agent Router with Circuit Breaker pattern
 */
export class AgentRouter {
  private primaryDriver: AgentDriver;
  private fallbackDriver: AgentDriver;
  private circuitState: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private readonly failureThreshold = 3;
  private readonly resetTimeoutMs = 30000; // 30 seconds

  constructor(
    primaryDriver?: AgentDriver,
    fallbackDriver?: AgentDriver
  ) {
    // Use provided drivers or default to ClaudeCode and Codex
    this.primaryDriver = primaryDriver || new ClaudeCodeDriver();
    this.fallbackDriver = fallbackDriver || new CodexDriver();
  }

  /**
   * Execute task with circuit breaker pattern
   * Tries primary driver first, falls back to secondary on failure
   * @param task - The task to execute
   * @returns Promise resolving to DriverResult
   */
  async executeTask(task: string): Promise<DriverResult> {
    // If circuit is OPEN, go directly to fallback
    if (this.circuitState === 'OPEN') {
      return this.executeWithFallback(task);
    }

    // Try primary driver first
    try {
      const result = await this.primaryDriver.executeTask(task);
      this.onSuccess();
      return {
        success: true,
        result,
        driverUsed: this.getDriverName(this.primaryDriver),
      };
    } catch (error) {
      return this.handleFailure(task, error);
    }
  }

  /**
   * Handle failure and decide whether to fallback
   */
  private async handleFailure(task: string, error: unknown): Promise<DriverResult> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error triggers fallback
    if (this.shouldFallback(errorMessage)) {
      console.warn(`[AgentRouter] Primary driver failed (${errorMessage}), falling back to secondary...`);
      return this.executeWithFallback(task);
    }

    // Track failure for circuit breaker
    this.onFailure();

    // Re-throw if not a fallback error
    throw error;
  }

  /**
   * Execute task with fallback driver
   */
  private async executeWithFallback(task: string): Promise<DriverResult> {
    try {
      const result = await this.fallbackDriver.executeTask(task);
      return {
        success: true,
        result,
        driverUsed: this.getDriverName(this.fallbackDriver),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        driverUsed: this.getDriverName(this.fallbackDriver),
      };
    }
  }

  /**
   * Check if error should trigger fallback
   */
  private shouldFallback(errorMessage: string): boolean {
    return FALLBACK_ERRORS.some((err) => errorMessage.includes(err));
  }

  /**
   * Record successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'CLOSED';
      console.log('[AgentRouter] Circuit breaker CLOSED - recovery successful');
    }
  }

  /**
   * Record failure and potentially open circuit
   */
  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      console.warn(`[AgentRouter] Circuit breaker OPEN - ${this.failureCount} failures detected`);

      // Schedule reset after timeout
      setTimeout(() => {
        if (this.circuitState === 'OPEN') {
          this.circuitState = 'HALF_OPEN';
          console.log('[AgentRouter] Circuit breaker HALF_OPEN - testing recovery');
        }
      }, this.resetTimeoutMs);
    }
  }

  /**
   * Get driver name safely
   */
  private getDriverName(driver: AgentDriver): string {
    if ('getDriverName' in driver && typeof driver.getDriverName === 'function') {
      return driver.getDriverName();
    }
    return 'Unknown';
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitState(): CircuitBreakerState {
    return this.circuitState;
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuit(): void {
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    console.log('[AgentRouter] Circuit breaker manually reset');
  }
}
