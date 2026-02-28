/**
 * Coverage Collector
 *
 * Collects test coverage results from Jest.
 */

import { execAsync } from '../../../utils/exec-async.js';
import type { CoverageResults, CoverageMetric } from '../types.js';

/**
 * CoverageCollector type interface
 */
interface ICoverageCollector {
  collect(): Promise<CoverageResults>;
  validate(): Promise<boolean>;
  getResults(): CoverageResults;
}

/**
 * CoverageCollector - Collects test coverage results
 */
export class CoverageCollector implements ICoverageCollector {
  private results: CoverageResults | null = null;
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Collect coverage results by running tests with coverage
   */
  async collect(): Promise<CoverageResults> {
    try {
      // Try to run tests with coverage
      const { stdout, stderr, exitCode } = await execAsync('npm test -- --coverage --passWithNoTests', {
        cwd: this.projectPath,
        timeout: 300000 // 5 minutes
      });

      const output = stdout + '\n' + stderr;

      // Parse coverage from output
      const coverage = this.parseCoverageOutput(output);

      if (coverage) {
        this.results = coverage;
      } else {
        // Coverage not available but tests passed
        this.results = this.emptyCoverage();
      }

      return this.results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Try to parse partial output
      const coverage = this.parseCoverageOutput(errorMessage);

      if (coverage) {
        this.results = coverage;
      } else {
        this.results = this.emptyCoverage();
      }

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
  getResults(): CoverageResults {
    if (!this.results) {
      throw new Error('No coverage results collected. Call collect() first.');
    }
    return this.results;
  }

  /**
   * Create empty coverage result
   */
  private emptyCoverage(): CoverageResults {
    const empty: CoverageMetric = {
      total: 0,
      covered: 0,
      percentage: 0
    };

    return {
      lines: { ...empty },
      statements: { ...empty },
      functions: { ...empty },
      branches: { ...empty }
    };
  }

  /**
   * Parse coverage output from Jest
   */
  private parseCoverageOutput(output: string): CoverageResults | null {
    // Look for coverage summary table in Jest output
    // Format:
    // |   % Stmts |   % Branch |   % Funcs |   % Lines |
    // |----------|------------|-----------|-----------|
    // |    85.71 |       75   |    66.67 |    85.71 |

    const lines = output.split('\n');
    let summaryLine = '';

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('% Stmts') || lines[i].includes('% Statements')) {
        // Next line after header is the data
        if (i + 1 < lines.length) {
          summaryLine = lines[i + 1];
          break;
        }
      }
    }

    if (!summaryLine) {
      return null;
    }

    // Parse the percentages
    const percentages = summaryLine
      .split('|')
      .slice(1, -1) // Remove first and last empty cells
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n));

    if (percentages.length < 4) {
      return null;
    }

    return {
      statements: {
        total: 100,
        covered: Math.round(percentages[0]),
        percentage: percentages[0]
      },
      branches: {
        total: 100,
        covered: Math.round(percentages[1]),
        percentage: percentages[1]
      },
      functions: {
        total: 100,
        covered: Math.round(percentages[2]),
        percentage: percentages[2]
      },
      lines: {
        total: 100,
        covered: Math.round(percentages[3]),
        percentage: percentages[3]
      }
    };
  }
}

/**
 * Create a CoverageCollector instance
 */
export function createCoverageCollector(projectPath?: string): CoverageCollector {
  return new CoverageCollector(projectPath);
}

export default CoverageCollector;
