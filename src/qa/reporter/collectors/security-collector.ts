/**
 * Security Collector
 * Coleta resultado do SecurityScanner
 * Feature: FEAT-003 - QA Report
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SecurityScanner, SecurityFinding } from '../../../security/secret-scanner.js';
import { VerificationResult } from '../types';

/**
 * SecurityCollector - Coleta resultado do security scan
 */
export class SecurityCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Coleta resultado do security scan
   * @param timeout - Timeout em milliseconds (padrao: 60000)
   */
  async collect(timeout?: number): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name: 'Security',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    const effectiveTimeout = timeout || 60000;

    try {
      // Scan source files for security issues
      const sourceFiles = await this.findSourceFiles();

      if (sourceFiles.length === 0) {
        result.duration = Date.now() - startTime;
        result.output = 'No source files found to scan';
        return result;
      }

      const allFindings: SecurityFinding[] = [];

      // Scan each source file with timeout
      const scanPromise = this.scanFiles(sourceFiles);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Security scan timed out')), effectiveTimeout);
      });

      const findings = await Promise.race([scanPromise, timeoutPromise]);
      allFindings.push(...findings);

      result.duration = Date.now() - startTime;

      // Process findings
      const criticalFindings = allFindings.filter(f => f.severity === 'critical');
      const highFindings = allFindings.filter(f => f.severity === 'high');
      const mediumFindings = allFindings.filter(f => f.severity === 'medium');

      if (criticalFindings.length > 0) {
        result.status = 'FAIL';
        result.blocked = true;
        result.issues = criticalFindings.map(f =>
          `[CRITICAL] ${f.category}: ${f.description} (${f.match})`
        );
      } else if (highFindings.length > 0) {
        result.status = 'WARNING';
        result.issues = highFindings.map(f =>
          `[HIGH] ${f.category}: ${f.description}`
        );
      } else if (mediumFindings.length > 0) {
        result.status = 'WARNING';
        result.issues = mediumFindings.map(f =>
          `[MEDIUM] ${f.category}: ${f.description}`
        );
      }

      result.output = `Scanned ${sourceFiles.length} files. ` +
        `Found: ${criticalFindings.length} critical, ${highFindings.length} high, ${mediumFindings.length} medium`;

    } catch (error) {
      result.duration = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('timed out')) {
        result.status = 'WARNING';
        result.output = errorMessage;
        result.issues = ['Security scan did not complete within timeout'];
      } else {
        // Security scan failed but don't block - it's a warning
        result.status = 'WARNING';
        result.output = errorMessage;
        result.issues = ['Security scan unavailable'];
      }
    }

    return result;
  }

  /**
   * Find all TypeScript source files in the project
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
   * Recursively walk directory to find .ts files
   */
  private async walkDir(dir: string, files: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, etc.
        if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
          await this.walkDir(fullPath, files);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Scan multiple files for security issues
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
