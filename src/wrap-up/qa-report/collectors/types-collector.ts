/**
 * Types Collector
 *
 * Collects TypeScript type checking results.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { TypeCheckResults, TypeError } from '../types.js';

const execAsync = promisify(exec);

/**
 * TypesCollector type interface
 */
interface ITypesCollector {
  collect(): Promise<TypeCheckResults>;
  validate(): Promise<boolean>;
  getResults(): TypeCheckResults;
}

/**
 * TypesCollector - Collects TypeScript type checking results
 */
export class TypesCollector implements ITypesCollector {
  private results: TypeCheckResults | null = null;
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Collect type checking results by running tsc
   */
  async collect(): Promise<TypeCheckResults> {
    const startTime = Date.now();

    try {
      const { stdout, stderr, code } = await execAsync('npx tsc --noEmit', {
        cwd: this.projectPath,
        timeout: 300000 // 5 minutes
      });

      const duration = Date.now() - startTime;
      const output = stdout + '\n' + stderr;

      // Parse TypeScript errors
      const errors = this.parseTypeErrors(output);

      this.results = {
        success: code === 0 && errors.length === 0,
        duration,
        errors
      };

      return this.results;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if there were actual type errors
      const errors = this.parseTypeErrors(errorMessage);

      this.results = {
        success: errors.length === 0,
        duration,
        errors
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
  getResults(): TypeCheckResults {
    if (!this.results) {
      throw new Error('No type check results collected. Call collect() first.');
    }
    return this.results;
  }

  /**
   * Parse TypeScript errors from output
   */
  private parseTypeErrors(output: string): TypeError[] {
    const errors: TypeError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // TypeScript error format: src/file.ts(10,5): error TS1234: Message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);

      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[4],
          message: match[5]
        });
      }
    }

    return errors;
  }
}

/**
 * Create a TypesCollector instance
 */
export function createTypesCollector(projectPath?: string): TypesCollector {
  return new TypesCollector(projectPath);
}

export default TypesCollector;
