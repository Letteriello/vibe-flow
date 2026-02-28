/**
 * Type Collector
 * Coleta resultado de tsc --noEmit
 * Feature: FEAT-003 - QA Report
 */

import { execAsync } from '../../../utils/exec-async.js';
import { VerificationResult } from '../types';

const DEFAULT_TIMEOUT = 120000; // 2 minutes

/**
 * TypeCollector - Coleta resultado do TypeScript type checking
 */
export class TypeCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Coleta resultado do type checking
   * @param timeout - Timeout em milliseconds (padrao: 120000)
   */
  async collect(timeout?: number): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name: 'Types',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    const effectiveTimeout = timeout || DEFAULT_TIMEOUT;

    try {
      const { stdout, stderr, exitCode } = await execAsync('npx tsc --noEmit', {
        timeout: effectiveTimeout,
        cwd: this.projectPath,
      });

      result.duration = Date.now() - startTime;
      result.exitCode = exitCode || 0;
      result.output = stdout + (stderr ? `\n${stderr}` : '');

      if (exitCode !== 0) {
        result.status = 'FAIL';

        // Extract TypeScript errors
        const errorLines: string[] = [];
        const lines = result.output.split('\n');

        for (const line of lines) {
          // TypeScript error format: file.ts(line,col): error TS1234: message
          if (line.includes('error TS') || line.includes(': error TS')) {
            const trimmed = line.trim();
            if (trimmed) {
              errorLines.push(trimmed);
            }
          }
        }

        if (errorLines.length > 0) {
          result.issues = errorLines.slice(0, 30); // Limit to 30 errors
        } else {
          result.issues = ['TypeScript compilation failed'];
        }
      }
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.status = 'FAIL';
      result.exitCode = 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.output = errorMessage;

      // Check if it's a timeout
      if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
        result.issues = ['TypeScript type checking timed out'];
      } else {
        result.issues = [errorMessage];
      }
    }

    return result;
  }
}
