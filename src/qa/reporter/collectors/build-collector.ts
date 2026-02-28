/**
 * Build Collector
 * Coleta resultado de npm run build
 * Feature: FEAT-003 - QA Report
 */

import { execAsync } from '../../../utils/exec-async.js';
import { VerificationResult } from '../types';

const DEFAULT_TIMEOUT = 180000; // 3 minutes

/**
 * BuildCollector - Coleta resultado do build TypeScript
 */
export class BuildCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Coleta resultado do build
   * @param timeout - Timeout em milliseconds (padrao: 180000)
   */
  async collect(timeout?: number): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name: 'Build',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    const effectiveTimeout = timeout || DEFAULT_TIMEOUT;

    try {
      const { stdout, stderr, exitCode } = await execAsync('npm run build', {
        timeout: effectiveTimeout,
        cwd: this.projectPath,
      });

      result.duration = Date.now() - startTime;
      result.exitCode = exitCode || 0;
      result.output = stdout + (stderr ? `\n${stderr}` : '');

      if (exitCode !== 0) {
        result.status = 'FAIL';

        // Extract meaningful error messages
        const errorLines: string[] = [];
        const lines = result.output.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();

          // TypeScript error patterns
          if (line.includes('error ts') || line.includes('error:')) {
            // Include the error line and context
            const errorLine = lines[i].trim();
            if (errorLine) {
              errorLines.push(errorLine);
            }
            // Also include next line if it has file:line info
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (nextLine && (nextLine.includes(':') || nextLine.includes('^'))) {
                errorLines.push(nextLine);
              }
            }
          }
        }

        if (errorLines.length > 0) {
          result.issues = errorLines.slice(0, 20); // Limit to 20 errors
        } else {
          result.issues = [`Build failed with exit code: ${exitCode}`];
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
        result.issues = ['Build execution timed out'];
      } else {
        result.issues = [errorMessage];
      }
    }

    return result;
  }
}
