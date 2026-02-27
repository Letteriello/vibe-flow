/**
 * Build Collector
 *
 * Collects build results from TypeScript compilation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { BuildResults, BuildError, BuildWarning } from '../types.js';

const execAsync = promisify(exec);

/**
 * BuildCollector type interface
 */
interface IBuildCollector {
  collect(): Promise<BuildResults>;
  validate(): Promise<boolean>;
  getResults(): BuildResults;
}

/**
 * BuildCollector - Collects build results from TypeScript compiler
 */
export class BuildCollector implements IBuildCollector {
  private results: BuildResults | null = null;
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Collect build results by running the build command
   */
  async collect(): Promise<BuildResults> {
    const startTime = Date.now();

    try {
      const { stdout, stderr, code } = await execAsync('npm run build', {
        cwd: this.projectPath,
        timeout: 300000 // 5 minutes
      });

      const duration = Date.now() - startTime;
      const output = stdout + '\n' + stderr;

      // Parse build output for errors and warnings
      const { errors, warnings } = this.parseBuildOutput(output);

      this.results = {
        success: code === 0 && errors.length === 0,
        duration,
        errors,
        warnings,
        output
      };

      return this.results;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.results = {
        success: false,
        duration,
        errors: [{ message: errorMessage }],
        warnings: [],
        output: errorMessage
      };

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
  getResults(): BuildResults {
    if (!this.results) {
      throw new Error('No build results collected. Call collect() first.');
    }
    return this.results;
  }

  /**
   * Parse build output for errors and warnings
   */
  private parseBuildOutput(output: string): { errors: BuildError[]; warnings: BuildWarning[] } {
    const errors: BuildError[] = [];
    const warnings: BuildWarning[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      // TypeScript error format: src/file.ts(10,5): error TS1234: Message
      const errorMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(\w+):\s*(.+)$/);
      if (errorMatch) {
        errors.push({
          file: errorMatch[1],
          line: parseInt(errorMatch[2], 10),
          column: parseInt(errorMatch[3], 10),
          code: errorMatch[4],
          message: errorMatch[5]
        });
        continue;
      }

      // Simple error format: error: message
      const simpleErrorMatch = line.match(/^error:\s*(.+)$/i);
      if (simpleErrorMatch && errors.length > 0) {
        errors[errors.length - 1].message += ' ' + simpleErrorMatch[1];
      }

      // TypeScript warning format
      const warningMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s*warning\s+(\w+):\s*(.+)$/);
      if (warningMatch) {
        warnings.push({
          file: warningMatch[1],
          line: parseInt(warningMatch[2], 10),
          column: parseInt(warningMatch[3], 10),
          code: warningMatch[4],
          message: warningMatch[5]
        });
      }
    }

    return { errors, warnings };
  }
}

/**
 * Create a BuildCollector instance
 */
export function createBuildCollector(projectPath?: string): BuildCollector {
  return new BuildCollector(projectPath);
}

export default BuildCollector;
