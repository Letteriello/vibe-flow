/**
 * QA Report Generator
 * Feature: FEAT-003 - Geração Automatizada de qa-report.md
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { execAsync } from '../../utils/exec-async.js';
import {
  QAReport,
  QAReportConfig,
  VerificationResult,
  QASummary,
  Verdict,
  VerificationStatus,
} from './types.js';
import { generateMarkdownReport, formatSummaryLine } from './template.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<QAReportConfig> = {
  outputDir: 'docs/planning',
  outputFilename: 'qa-report.md',
  blockOnFail: true,
  includeDetails: true,
  validationTimeout: 60000, // 60 seconds
};

/**
 * QA Report Generator Class
 * Generates comprehensive QA reports consolidating multiple validation results
 */
export class QAReportGenerator {
  private config: QAReportConfig;
  private verifications: VerificationResult[] = [];

  constructor(config: Partial<QAReportConfig> & { projectPath: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as QAReportConfig;
  }

  /**
   * Generate a unique report ID
   */
  private generateId(): string {
    return `qa-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Calculate verdict based on verification results
   */
  private calculateVerdict(): Verdict {
    const hasFailed = this.verifications.some((v) => v.status === 'FAIL');
    const hasBlocked = this.verifications.some((v) => v.blocked === true);
    const hasWarnings = this.verifications.some((v) => v.status === 'WARNING');

    if (hasFailed || hasBlocked) {
      return 'FAIL';
    }
    if (hasWarnings) {
      return 'WARNING';
    }
    return 'PASS';
  }

  /**
   * Generate summary from verifications
   */
  private generateSummary(): QASummary {
    const summary: QASummary = {
      total: this.verifications.length,
      passed: 0,
      failed: 0,
      warnings: 0,
      blocked: 0,
    };

    for (const v of this.verifications) {
      switch (v.status) {
        case 'PASS':
          summary.passed++;
          break;
        case 'FAIL':
          summary.failed++;
          break;
        case 'WARNING':
          summary.warnings++;
          break;
        case 'SKIPPED':
          // Skipped doesn't count as failed
          break;
      }
      if (v.blocked) {
        summary.blocked++;
      }
    }

    return summary;
  }

  /**
   * Generate recommendations based on verification results
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    const failed = this.verifications.filter((v) => v.status === 'FAIL');
    const warnings = this.verifications.filter((v) => v.status === 'WARNING');

    if (failed.length > 0) {
      recommendations.push(
        `Revisar ${failed.length} verificação(ões) que falharam: ${failed.map((v) => v.name).join(', ')}`
      );
    }

    if (warnings.length > 0) {
      recommendations.push(
        `Considerar addressar ${warnings.length} warning(s): ${warnings.map((v) => v.name).join(', ')}`
      );
    }

    const buildResult = this.verifications.find((v) => v.name === 'Build');
    if (buildResult?.status === 'FAIL') {
      recommendations.push('Executar "npm run build" localmente para verificar erros de compilação');
    }

    const testResult = this.verifications.find((v) => v.name === 'Tests');
    if (testResult?.status === 'FAIL') {
      recommendations.push('Executar "npm test" para ver detalhes dos testes falidos');
    }

    if (this.verifications.length === 0) {
      recommendations.push('Nenhuma verificação executada. Configure collectors.');
    }

    return recommendations;
  }

  /**
   * Execute a validation command and capture result
   */
  private async runValidation(
    name: string,
    command: string,
    timeout?: number
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name,
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    try {
      const { stdout, stderr, exitCode } = await execAsync(command, {
        timeout: timeout || this.config.validationTimeout,
        cwd: this.config.projectPath,
      });

      result.duration = Date.now() - startTime;
      result.exitCode = exitCode;
      result.output = stdout + (stderr ? `\n${stderr}` : '');

      if (exitCode !== 0) {
        result.status = 'FAIL';
        result.issues = [stderr || `Exit code: ${exitCode}`];
      }
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.status = 'FAIL';
      result.exitCode = 1;
      result.output = error instanceof Error ? error.message : String(error);
      result.issues = [result.output];
    }

    return result;
  }

  /**
   * Run npm test validation
   */
  async runTestValidation(): Promise<VerificationResult> {
    return this.runValidation('Tests', 'npm test', this.config.validationTimeout);
  }

  /**
   * Run npm build validation
   */
  async runBuildValidation(): Promise<VerificationResult> {
    return this.runValidation('Build', 'npm run build', this.config.validationTimeout);
  }

  /**
   * Run TypeScript type checking
   */
  async runTypesValidation(): Promise<VerificationResult> {
    return this.runValidation('Types', 'npx tsc --noEmit', this.config.validationTimeout);
  }

  /**
   * Run lint validation
   */
  async runLintValidation(): Promise<VerificationResult> {
    // Try eslint first, fall back to npm run lint if available
    return this.runValidation('Lint', 'npx eslint src --ext .ts,.tsx', this.config.validationTimeout);
  }

  /**
   * Run security validation using SecurityGuard
   */
  async runSecurityValidation(): Promise<VerificationResult> {
    const startTime = Date.now();
    const result: VerificationResult = {
      name: 'Security',
      status: 'PASS',
      duration: 0,
      issues: [],
    };

    try {
      // Dynamic import to avoid circular dependencies
      const { SecurityGuard } = await import('../../state-machine/security-guard');
      const guard = new SecurityGuard(this.config.projectPath);
      const securityResult = await guard.runSecurityScan();

      result.duration = Date.now() - startTime;
      result.output = securityResult.details;

      if (securityResult.blocked) {
        result.status = 'FAIL';
        result.blocked = true;
        result.issues = securityResult.vulnerabilities.map(
          v => `[${v.severity}] ${v.category}: ${v.description} (${v.file}:${v.line})`
        );
      } else if (securityResult.vulnerabilities.length > 0) {
        result.status = 'WARNING';
        result.issues = securityResult.vulnerabilities.map(
          v => `[${v.severity}] ${v.category}: ${v.description}`
        );
      }
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.status = 'WARNING';
      result.output = error instanceof Error ? error.message : String(error);
      result.issues = ['Security scan unavailable'];
    }

    return result;
  }

  /**
   * Add a verification result manually
   */
  addVerification(result: VerificationResult): void {
    this.verifications.push(result);
  }

  /**
   * Clear all verifications
   */
  clearVerifications(): void {
    this.verifications = [];
  }

  /**
   * Generate the QA report
   */
  async generate(): Promise<QAReport> {
    const verdict = this.calculateVerdict();
    const summary = this.generateSummary();
    const recommendations = this.generateRecommendations();

    const report: QAReport = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      projectPath: this.config.projectPath,
      pipeline: this.config.pipeline,
      verdict,
      verifications: this.verifications,
      summary,
      recommendations,
    };

    return report;
  }

  /**
   * Save report to file
   */
  async save(report: QAReport): Promise<string> {
    // Ensure output directory exists
    const outputDir = path.resolve(this.config.projectPath, this.config.outputDir || 'docs/planning');
    await fs.mkdir(outputDir, { recursive: true });

    // Generate filename - use fixed name for main report, timestamp for archive
    const filename = this.config.outputFilename || 'qa-report.md';
    const filepath = path.join(outputDir, filename);

    // Generate markdown content
    const markdown = generateMarkdownReport(report);

    // Write to file
    await fs.writeFile(filepath, markdown, 'utf-8');

    // Update report with path
    report.reportPath = filepath;

    return filepath;
  }

  /**
   * Generate and save report in one call
   */
  async generateAndSave(): Promise<QAReport> {
    const report = await this.generate();
    await this.save(report);
    return report;
  }

  /**
   * Get summary line for CLI output
   */
  async getSummaryLine(): Promise<string> {
    const report = await this.generate();
    return formatSummaryLine(report);
  }

  /**
   * Run all standard validations (test, build, types)
   */
  async runAllValidations(): Promise<void> {
    // Run all validations in parallel (as per RF-001)
    const [testResult, buildResult, typesResult, lintResult, securityResult] = await Promise.all([
      this.runTestValidation(),
      this.runBuildValidation(),
      this.runTypesValidation(),
      this.runLintValidation(),
      this.runSecurityValidation(),
    ]);

    this.verifications.push(testResult, buildResult, typesResult, lintResult, securityResult);
  }
}

/**
 * Create a QA report generator with default configuration
 */
export function createQAReportGenerator(
  projectPath: string,
  options?: Partial<QAReportConfig>
): QAReportGenerator {
  return new QAReportGenerator({
    projectPath,
    ...options,
  });
}
