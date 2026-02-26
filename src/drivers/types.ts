/**
 * Agent Driver Types
 *
 * Common interfaces for agent driver implementations.
 */

/**
 * Base interface for all agent drivers
 */
export interface AgentDriver {
  /**
   * Execute a task using the agent driver
   * @param task - The task description to execute
   * @returns Promise resolving to the task result as string
   */
  executeTask(task: string): Promise<string>;
}

/**
 * Driver execution result
 */
export interface DriverResult {
  success: boolean;
  result?: string;
  error?: string;
  driverUsed: string;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
