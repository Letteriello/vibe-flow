/**
 * QA Report Wrap-up Integration
 * Feature: FEAT-003 - Integration with Wrap-up system
 *
 * This module provides integration between QAReportGenerator and the wrap-up system.
 */

import { QAReportGenerator, createQAReportGenerator, QAReport, QAReportConfig } from './reporter';

/**
 * Run QA validation during wrap-up
 * Generates a QA report and returns the result
 *
 * @param projectPath - Path to the project
 * @param options - Optional configuration
 * @returns QAReport with verdict
 */
export async function runQAReportForWrapUp(
  projectPath: string,
  options?: Partial<QAReportConfig>
): Promise<QAReport> {
  const generator = createQAReportGenerator(projectPath, {
    ...options,
    pipeline: 'wrap-up'
  });

  // Run all validations (tests, build, types, lint, security)
  await generator.runAllValidations();

  // Generate and save the report
  const report = await generator.generateAndSave();

  return report;
}

/**
 * Check if wrap-up should be blocked based on QA report verdict
 *
 * @param report - QAReport to check
 * @param force - Whether to force wrap-up regardless of verdict
 * @returns Object with blocked status and reason
 */
export function shouldBlockWrapUp(report: QAReport, force: boolean = false): {
  blocked: boolean;
  reason?: string;
} {
  if (force) {
    return { blocked: false, reason: 'Force flag enabled' };
  }

  if (report.verdict === 'FAIL') {
    return {
      blocked: true,
      reason: `QA verification failed: ${report.summary.failed} failed, ${report.summary.blocked} blocked`
    };
  }

  if (report.verdict === 'WARNING') {
    return {
      blocked: false,
      reason: `QA verification passed with warnings: ${report.summary.warnings} warnings`
    };
  }

  return { blocked: false };
}

export { QAReportGenerator, createQAReportGenerator, QAReport, QAReportConfig };
