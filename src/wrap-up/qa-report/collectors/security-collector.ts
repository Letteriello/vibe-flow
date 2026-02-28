/**
 * Security Collector
 *
 * Collects security scan results.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SecurityScanner, SecurityFinding } from '../../../security/secret-scanner.js';
import type { SecurityResults, SecurityFinding as SecurityFindingType } from '../types.js';

/**
 * SecurityCollector type interface
 */
interface ISecurityCollector {
  collect(): Promise<SecurityResults>;
  validate(): Promise<boolean>;
  getResults(): SecurityResults;
}

/**
 * SecurityCollector - Collects security scan results
 */
export class SecurityCollector implements ISecurityCollector {
  private results: SecurityResults | null = null;
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Collect security scan results
   */
  async collect(): Promise<SecurityResults> {
    const startTime = Date.now();

    try {
      // Find source files
      const sourceFiles = await this.findSourceFiles();

      if (sourceFiles.length === 0) {
        this.results = {
          passed: true,
          vulnerabilities: [],
          scanDuration: Date.now() - startTime
        };
        return this.results;
      }

      // Scan files
      const findings = await this.scanFiles(sourceFiles);

      // Convert findings to our format
      const vulnerabilities: SecurityFindingType[] = findings.map(f => ({
        severity: f.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        category: f.category,
        title: f.description,
        description: f.description,
        file: undefined,
        line: undefined
      }));

      this.results = {
        passed: vulnerabilities.length === 0,
        vulnerabilities,
        scanDuration: Date.now() - startTime
      };

      return this.results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.results = {
        passed: false,
        vulnerabilities: [{
          severity: 'high',
          category: 'Scan Error',
          title: 'Security scan failed',
          description: errorMessage
        }],
        scanDuration: Date.now() - startTime
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
  getResults(): SecurityResults {
    if (!this.results) {
      throw new Error('No security results collected. Call collect() first.');
    }
    return this.results;
  }

  /**
   * Find all TypeScript source files
   */
  private async findSourceFiles(): Promise<string[]> {
    const srcDir = path.join(this.projectPath, 'src');
    const files: string[] = [];

    try {
      await this.walkDir(srcDir, files);
    } catch {
      // src directory doesn't exist
    }

    return files;
  }

  /**
   * Recursively walk directory
   */
  private async walkDir(dir: string, files: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
          await this.walkDir(fullPath, files);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Scan files for security issues
   */
  private async scanFiles(files: string[]): Promise<SecurityFinding[]> {
    const allFindings: SecurityFinding[] = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const report = SecurityScanner.scanPayload(content);

        allFindings.push(...report.findings);
      } catch {
        // Skip files that can't be read
      }
    }

    return allFindings;
  }
}

/**
 * Create a SecurityCollector instance
 */
export function createSecurityCollector(projectPath?: string): SecurityCollector {
  return new SecurityCollector(projectPath);
}

export default SecurityCollector;
