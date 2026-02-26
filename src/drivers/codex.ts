/**
 * Codex Driver - Mock Implementation
 *
 * Mock implementation of the Codex (OpenAI) agent driver.
 * Simulates execution of tasks via Codex CLI.
 */

import { AgentDriver } from './types.js';

export class CodexDriver implements AgentDriver {
  private readonly name = 'Codex';

  /**
   * Execute a task using Codex
   * @param task - The task description to execute
   * @returns Promise resolving to the task result
   */
  async executeTask(task: string): Promise<string> {
    // Mock implementation - simulates Codex execution
    console.log(`[${this.name}] Executing task: ${task}`);

    // Simulate async execution
    await this.simulateExecution();

    // Mock successful response
    return `Codex completed: ${task}`;
  }

  /**
   * Simulates execution delay
   */
  private async simulateExecution(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Get driver name
   */
  getDriverName(): string {
    return this.name;
  }
}
