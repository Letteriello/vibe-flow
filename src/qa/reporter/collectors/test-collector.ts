/**
 * Test Collector
 * Coleta resultado de npm test
 * Feature: FEAT-003 - QA Report
 */

import { execAsync } from '../../../utils/exec-async.js';
import { VerificationResult } from '../types';

const DEFAULT_TIMEOUT = 120000; // 2 minutes

/**
 * TestCollector - Coleta resultado de testes unitarios
 */
export class TestCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Coleta resultado dos testes
   * @param timeout - Timeout em milliseconds (padrao: 120000)
   */
  async collect(timeout?: number): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name: 'Tests',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    const effectiveTimeout = timeout || DEFAULT_TIMEOUT;

    try {
      const { stdout, stderr, exitCode } = await execAsync('npm test', {
        timeout: effectiveTimeout,
        cwd: this.projectPath,
      });

      result.duration = Date.now() - startTime;
      result.exitCode = exitCode || 0;
      result.output = stdout + (stderr ? `\n${stderr}` : '');

      // Parse test results to detect failures
      const output = result.output.toLowerCase();

      // Jest output patterns for failures
      if (exitCode !== 0 || output.includes('fail') || output.includes('failed')) {
        result.status = 'FAIL';

        // Extract failure information
        const failedMatches = result.output.match(/FAIL\s+(.+)/g);
        const errorMatches = result.output.match(/●\s+(.+)/g);

        if (failedMatches) {
          result.issues = failedMatches.map((m) => m.trim());
        } else if (errorMatches) {
          result.issues = errorMatches.map((m) => m.trim());
        } else {
          result.issues = [`Exit code: ${exitCode}`];
        }
      }

      // Check for skipped tests (warning)
      if (output.includes('skipped') || output.includes('skip')) {
        const skippedMatch = result.output.match(/(\d+)\s+skipped/i);
        if (skippedMatch && parseInt(skippedMatch[1]) > 0) {
          if (result.status === 'PASS') {
            result.status = 'WARNING';
            result.issues = [`${skippedMatch[1]} tests skipped`];
          }
        }
      }
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.status = 'FAIL';
      result.exitCode = 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.output = errorMessage;

      // Check if it's a timeout
      if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        result.issues = ['Test execution timed out'];
      } else {
        result.issues = [errorMessage];
      }
    }

    return result;
  }
}
