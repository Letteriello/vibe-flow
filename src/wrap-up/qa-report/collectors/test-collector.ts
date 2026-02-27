/**
 * Test Collector
 *
 * Collects test results from the test suite.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TestResults, TestSuite } from '../types.js';

const execAsync = promisify(exec);

/**
 * TestCollector type interface
 */
interface ITestCollector {
  collect(): Promise<TestResults>;
  validate(): Promise<boolean>;
  getResults(): TestResults;
}

/**
 * TestCollector - Collects test results from various test runners
 */
export class TestCollector implements ITestCollector {
  private results: TestResults | null = null;
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Collect test results by running the test suite
   */
  async collect(): Promise<TestResults> {
    try {
      const { stdout, stderr } = await execAsync('npm test -- --reporter=json', {
        cwd: this.projectPath,
        timeout: 300000 // 5 minutes
      });

      this.results = this.parseJestOutput(stdout + stderr);
      return this.results;
    } catch (error) {
      // Even on test failure, we can parse results
      const errorMessage = error instanceof Error ? error.message : String(error);
      const { stdout, stderr } = await execAsync('npm test -- --reporter=json 2>&1 || true', {
        cwd: this.projectPath,
        timeout: 300000
      }).catch(() => ({ stdout: '', stderr: errorMessage }));

      this.results = this.parseJestOutput(stdout + stderr);
      return this.results;
    }
  }

  /**
   * Validate that we have results
   */
  async validate(): Promise<boolean> {
    if (!this.results) {
      await this.collect();
    }
    return this.results !== null;
  }

  /**
   * Get collected results
   */
  getResults(): TestResults {
    if (!this.results) {
      throw new Error('No test results collected. Call collect() first.');
    }
    return this.results;
  }

  /**
   * Parse Jest JSON output
   */
  private parseJestOutput(output: string): TestResults {
    try {
      // Try to find JSON in output
      const jsonMatch = output.match(/\{[\s\S]*"success"[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        return this.convertJestJson(json);
      }
    } catch {
      // Fall through to regex parsing
    }

    return this.parseJestTextOutput(output);
  }

  /**
   * Parse Jest JSON format
   */
  private convertJestJson(json: Record<string, unknown>): TestResults {
    const numTotalTests = (json.numTotalTests as number) || 0;
    const numPassedTests = (json.numPassedTests as number) || 0;
    const numFailedTests = (json.numFailedTests as number) || 0;
    const numPendingTests = (json.numPendingTests as number) || 0;
    const testResults = (json.testResults as Array<Record<string, unknown>>) || [];

    const suites: TestSuite[] = testResults.map((suite) => ({
      name: (suite.name as string) || 'unknown',
      tests: (suite.assertionResults as Array<Record<string, unknown>>)?.length || 0,
      passed: (suite.assertionResults as Array<Record<string, unknown>>)?.filter(
        (r) => r.status === 'passed'
      ).length || 0,
      failed: (suite.assertionResults as Array<Record<string, unknown>>)?.filter(
        (r) => r.status === 'failed'
      ).length || 0,
      duration: ((suite.perfStats as Record<string, number>)?.end || 0) - ((suite.perfStats as Record<string, number>)?.start || 0)
    }));

    return {
      total: numTotalTests,
      passed: numPassedTests,
      failed: numFailedTests,
      skipped: numPendingTests,
      duration: suites.reduce((acc, s) => acc + s.duration, 0),
      suites
    };
  }

  /**
   * Parse Jest text output (fallback)
   */
  private parseJestTextOutput(output: string): TestResults {
    const totalMatch = output.match(/Tests:\s+(?:(\d+)\s+passed,\s+)?(\d+)\s+total/);
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);
    const durationMatch = output.match(/Time:\s+([\d.]+)s/);

    return {
      total: totalMatch ? parseInt(totalMatch[2], 10) : 0,
      passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
      duration: durationMatch ? Math.round(parseFloat(durationMatch[1]) * 1000) : 0,
      suites: []
    };
  }
}

/**
 * Create a TestCollector instance
 */
export function createTestCollector(projectPath?: string): TestCollector {
  return new TestCollector(projectPath);
}

export default TestCollector;
