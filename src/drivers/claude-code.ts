/**
 * Claude Code Driver - Mock Implementation
 *
 * Mock implementation of the Claude Code agent driver.
 * Simulates execution of tasks via Claude Code CLI.
 */

import { AgentDriver } from './types.js';

export class ClaudeCodeDriver implements AgentDriver {
  private readonly name = 'ClaudeCode';

  /**
   * Execute a task using Claude Code
   * @param task - The task description to execute
   * @returns Promise resolving to the task result
   */
  async executeTask(task: string): Promise<string> {
    // Mock implementation - simulates Claude Code execution
    console.log(`[${this.name}] Executing task: ${task}`);

    // Simulate async execution
    await this.simulateExecution();

    // Mock successful response
    return `Claude Code completed: ${task}`;
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
