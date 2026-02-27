/**
 * Coverage Collector
 * Coleta resultado de coverage
 * Feature: FEAT-003 - QA Report
 */

import { execAsync } from '../../../utils/exec-async.js';
import { VerificationResult } from '../types';

const DEFAULT_TIMEOUT = 180000; // 3 minutes
const DEFAULT_THRESHOLD = 70; // 70% minimum coverage

/**
 * CoverageCollector - Coleta resultado de coverage dos testes
 */
export class CoverageCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Coleta resultado de coverage
   * @param threshold - Porcentagem minima de coverage (padrao: 70)
   */
  async collect(threshold?: number): Promise<VerificationResult> {
    const startTime = Date.now();
    const effectiveThreshold = threshold || DEFAULT_THRESHOLD;

    const result: VerificationResult = {
      name: 'Coverage',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    try {
      // Try to run jest with coverage
      const { stdout, stderr, exitCode } = await execAsync(
        'npm test -- --coverage --passWithNoTests',
        {
          timeout: DEFAULT_TIMEOUT,
          cwd: this.projectPath,
        }
      );

      result.duration = Date.now() - startTime;
      result.exitCode = exitCode || 0;
      result.output = stdout + (stderr ? `\n${stderr}` : '');

      // Parse coverage output
      const coverageData = this.parseCoverageOutput(result.output);

      if (coverageData) {
        const { lines, branches, functions, statements } = coverageData;

        // Check if coverage meets threshold
        const minCoverage = Math.min(lines, branches, functions, statements);

        if (minCoverage < effectiveThreshold) {
          result.status = 'FAIL';
          result.issues = [
            `Coverage below threshold: lines ${lines.toFixed(1)}%, branches ${branches.toFixed(1)}%, functions ${functions.toFixed(1)}%, statements ${statements.toFixed(1)}%`,
            `Required: ${effectiveThreshold}%`,
          ];
        } else if (minCoverage < effectiveThreshold + 10) {
          // Warning if close to threshold
          result.status = 'WARNING';
          result.issues = [
            `Coverage near threshold: ${minCoverage.toFixed(1)}% (threshold: ${effectiveThreshold}%)`,
          ];
        }

        result.output = `Lines: ${lines.toFixed(1)}% | Branches: ${branches.toFixed(1)}% | Functions: ${functions.toFixed(1)}% | Statements: ${statements.toFixed(1)}%`;
      } else if (exitCode !== 0) {
        // Tests failed, coverage not available
        result.status = 'FAIL';
        result.issues = ['Tests failed, coverage not available'];
      } else {
        // Coverage output not found, but tests passed
        result.status = 'WARNING';
        result.output = 'Coverage report not available';
        result.issues = ['Could not parse coverage output'];
      }
    } catch (error) {
      result.duration = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
        result.status = 'WARNING';
        result.output = errorMessage;
        result.issues = ['Coverage collection timed out'];
      } else if (errorMessage.includes('coverage') || errorMessage.includes('not configured')) {
        result.status = 'WARNING';
        result.output = 'Coverage not configured';
        result.issues = ['Coverage is not configured for this project'];
      } else {
        result.status = 'WARNING';
        result.output = errorMessage;
        result.issues = ['Coverage collection failed'];
      }
    }

    return result;
  }

  /**
   * Parse Jest coverage output to extract percentages
   */
  private parseCoverageOutput(output: string): {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  } | null {
    // Look for coverage summary in Jest output
    // Common format:
    // |   % Stmts |   % Branch |   % Funcs |   % Lines |
    // |----------|------------|-----------|-----------|
    // |    85.71 75   |       |    66.67 |    85.71 |

    const lines = output.split('\n');

    // Find the summary table
    let summaryIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('% Stmts') || lines[i].includes('% Statements')) {
        summaryIndex = i;
        break;
      }
    }

    if (summaryIndex === -1) {
      return null;
    }

    // Skip header and get lines the values
    const dataLine = lines[summaryIndex + 2]?.trim();

    if (!dataLine) {
      return null;
    }

    // Parse the numbers from the table format
    // Format: |    85.71 |       75   |    66.67 |    85.71 |
    const percentages = dataLine
      .split('|')
      .map(s => s.trim())
      .filter(s => s)
      .map(s => parseFloat(s));

    if (percentages.length < 4) {
      return null;
    }

    return {
      lines: Number(percentages[3]) || Number(percentages[0]),
      branches: Number(percentages[1]),
      functions: Number(percentages[2]),
      statements: Number(percentages[0]),
    };
  }
}
