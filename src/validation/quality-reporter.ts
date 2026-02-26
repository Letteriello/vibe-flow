// Quality Report Generator - Story 7.5: Generate quality reports for pull requests
// AC: Dado PR criado, Quando Quality Report gera,
//     Então inclui score geral (1-10), lista issues, compara com média do projeto, sugere prioridades

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { QualityResult, QualityIssue, runQualityCheck, QualityLevel } from './code-quality-guard.js';

export interface PRQualityReport {
  id: string;
  timestamp: string;
  prNumber?: number;
  branch: string;
  baseBranch: string;
  qualityScore: number; // 1-10 scale
  qualityLevel: QualityLevel;
  filesChanged: number;
  issuesBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  issuesByCategory: {
    lint: number;
    format: number;
    smell: number;
    security: number;
    performance: number;
  };
  topIssues: QualityIssueSummary[];
  autoFixableCount: number;
  comparisonWithBaseline?: {
    scoreDelta: number;
    issuesDelta: number;
    trend: 'improving' | 'degrading' | 'stable';
  };
  recommendedActions: string[];
  canMerge: boolean;
  blockers: string[];
}

export interface QualityIssueSummary {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  file: string;
  line?: number;
  autoFixable: boolean;
}

export interface QualityReportOptions {
  projectPath: string;
  prNumber?: number;
  branch?: string;
  baseBranch?: string;
  baselineReport?: PRQualityReport;
  severityThreshold?: 'error' | 'warning' | 'info';
}

const SEVERITY_POINTS = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
  info: 0.5
};

/**
 * Story 7.5: Quality Reporting per PR
 *
 * Generates quality reports suitable for PR comments and CI/CD integration.
 */
export class QualityReportGenerator {
  private options: Required<QualityReportOptions>;

  constructor(options: QualityReportOptions) {
    this.options = {
      projectPath: options.projectPath,
      prNumber: options.prNumber,
      branch: options.branch || 'feature-branch',
      baseBranch: options.baseBranch || 'main',
      baselineReport: options.baselineReport,
      severityThreshold: options.severityThreshold || 'warning'
    };
  }

  /**
   * Generate a quality report for the PR
   */
  async generate(): Promise<PRQualityReport> {
    // Run quality check
    const qualityResult = await runQualityCheck(this.options.projectPath, {
      severityThreshold: this.options.severityThreshold
    });

    // Transform to PR report format
    const report = this.transformToPRReport(qualityResult);

    return report;
  }

  /**
   * Transform QualityResult to PRQualityReport
   */
  private transformToPRReport(qualityResult: QualityResult): PRQualityReport {
    const issuesBySeverity = this.categorizeBySeverity(qualityResult.issues);
    const issuesByCategory = this.categorizeByCategory(qualityResult.issues);
    const topIssues = this.selectTopIssues(qualityResult.issues, 10);
    const qualityScore = this.calculatePRScore(qualityResult);
    const canMerge = this.canMergeWithIssues(issuesBySeverity);
    const recommendedActions = this.generateRecommendedActions(
      qualityResult,
      issuesBySeverity,
      issuesByCategory
    );

    let comparisonWithBaseline: PRQualityReport['comparisonWithBaseline'];

    if (this.options.baselineReport) {
      comparisonWithBaseline = {
        scoreDelta: qualityScore - this.options.baselineReport.qualityScore,
        issuesDelta: qualityResult.issues.length - this.options.baselineReport.issuesBySeverity.critical,
        trend: this.determineTrend(
          qualityScore,
          this.options.baselineReport.qualityScore
        )
      };
    }

    const blockers = this.determineBlockers(issuesBySeverity);

    return {
      id: `pr-quality-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      prNumber: this.options.prNumber,
      branch: this.options.branch,
      baseBranch: this.options.baseBranch,
      qualityScore,
      qualityLevel: qualityResult.level,
      filesChanged: qualityResult.filesScanned,
      issuesBySeverity,
      issuesByCategory,
      topIssues,
      autoFixableCount: qualityResult.summary.autoFixable,
      comparisonWithBaseline,
      recommendedActions,
      canMerge,
      blockers
    };
  }

  /**
   * Categorize issues by severity
   */
  private categorizeBySeverity(
    issues: QualityIssue[]
  ): PRQualityReport['issuesBySeverity'] {
    const severitySummary = {
      critical: issues.filter(i => (i.severity as string) === 'error').length,
      high: 0,
      medium: issues.filter(i => (i.severity as string) === 'warning').length,
      low: 0,
      info: issues.filter(i => (i.severity as string) === 'info').length
    };
    return severitySummary as PRQualityReport['issuesBySeverity'];
  }

  /**
   * Categorize issues by category
   */
  private categorizeByCategory(
    issues: QualityIssue[]
  ): PRQualityReport['issuesByCategory'] {
    return {
      lint: issues.filter(i => i.type === 'lint').length,
      format: issues.filter(i => i.type === 'format').length,
      smell: issues.filter(i => i.type === 'smell').length,
      security: issues.filter(i => i.type === 'security').length,
      performance: issues.filter(i => i.type === 'performance').length
    };
  }

  /**
   * Select top issues to display
   */
  private selectTopIssues(
    issues: QualityIssue[],
    limit: number
  ): QualityIssueSummary[] {
    // Sort by severity (errors first) then by type
    const sorted = [...issues].sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.type.localeCompare(b.type);
    });

    return sorted.slice(0, limit).map(issue => ({
      type: issue.type,
      severity: issue.severity as QualityIssueSummary['severity'],
      message: issue.message,
      file: issue.file,
      line: issue.line,
      autoFixable: issue.autoFixable
    }));
  }

  /**
   * Calculate PR quality score (1-10 scale)
   */
  private calculatePRScore(qualityResult: QualityResult): number {
    // Start at 10 and deduct points based on issues
    let score = 10;

    // Deduct for errors
    score -= qualityResult.summary.errors * 1.5;

    // Deduct for warnings
    score -= qualityResult.summary.warnings * 0.1;

    // Deduct for info
    score -= qualityResult.summary.info * 0.02;

    // Bonus for auto-fixable issues (easy to fix)
    if (qualityResult.summary.autoFixable > 0) {
      score += Math.min(0.5, qualityResult.summary.autoFixable * 0.01);
    }

    return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  }

  /**
   * Determine if can merge based on issue severity
   */
  private canMergeWithIssues(
    issuesBySeverity: PRQualityReport['issuesBySeverity']
  ): boolean {
    // Can merge if no critical errors
    return issuesBySeverity.critical === 0;
  }

  /**
   * Generate recommended actions based on issues
   */
  private generateRecommendedActions(
    qualityResult: QualityResult,
    issuesBySeverity: PRQualityReport['issuesBySeverity'],
    issuesByCategory: PRQualityReport['issuesByCategory']
  ): string[] {
    const actions: string[] = [];

    // Critical issues
    if (issuesBySeverity.critical > 0) {
      actions.push(
        `🔴 Fix ${issuesBySeverity.critical} critical issue(s) before merging`
      );
    }

    // Auto-fixable
    if (qualityResult.summary.autoFixable > 0) {
      actions.push(
        `⚡ Run quality check with --auto-fix to resolve ${qualityResult.summary.autoFixable} auto-fixable issue(s)`
      );
    }

    // Code smells
    if (issuesByCategory.smell > 0) {
      actions.push(
        `💡 Address ${issuesByCategory.smell} code smell(s) for better maintainability`
      );
    }

    // Security issues
    if (issuesByCategory.security > 0) {
      actions.push(
        `🔒 Review ${issuesByCategory.security} security-related issue(s)`
      );
    }

    // Performance
    if (issuesByCategory.performance > 0) {
      actions.push(
        `⚡ Optimize ${issuesByCategory.performance} performance issue(s)`
      );
    }

    // If no issues
    if (actions.length === 0) {
      actions.push('✅ No quality issues found. Ready to merge!');
    }

    return actions;
  }

  /**
   * Determine trend compared to baseline
   */
  private determineTrend(current: number, baseline: number): 'improving' | 'degrading' | 'stable' {
    const diff = current - baseline;
    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'degrading';
    return 'stable';
  }

  /**
   * Determine blockers for merging
   */
  private determineBlockers(
    issuesBySeverity: PRQualityReport['issuesBySeverity']
  ): string[] {
    const blockers: string[] = [];

    if (issuesBySeverity.critical > 0) {
      blockers.push(
        `${issuesBySeverity.critical} critical issue(s) must be fixed`
      );
    }

    return blockers;
  }

  /**
   * Generate Markdown report for PR comment
   */
  generateMarkdown(report: PRQualityReport): string {
    const scoreEmoji = report.qualityScore >= 8 ? '🟢' :
                       report.qualityScore >= 6 ? '🟡' :
                       report.qualityScore >= 4 ? '🟠' : '🔴';

    let markdown = `## 📊 Code Quality Report\n\n`;
    markdown += `${scoreEmoji} **Score: ${report.qualityScore}/10** `;
    markdown += `(${report.qualityLevel})\n\n`;

    // Summary
    markdown += `### Summary\n`;
    markdown += `- Files scanned: ${report.filesChanged}\n`;
    markdown += `- Issues: ${Object.values(report.issuesBySeverity).reduce((a, b) => a + b, 0)}\n`;
    markdown += `- Auto-fixable: ${report.autoFixableCount}\n`;
    markdown += `- Can merge: ${report.canMerge ? '✅ Yes' : '❌ No'}\n\n`;

    // Issues by severity
    markdown += `### Issues by Severity\n`;
    markdown += `- 🔴 Critical: ${report.issuesBySeverity.critical}\n`;
    markdown += `- 🟠 High: ${report.issuesBySeverity.high}\n`;
    markdown += `- 🟡 Medium: ${report.issuesBySeverity.medium}\n`;
    markdown += `- 🔵 Low: ${report.issuesBySeverity.low}\n`;
    markdown += `- ℹ️ Info: ${report.issuesBySeverity.info}\n\n`;

    // Top issues
    if (report.topIssues.length > 0) {
      markdown += `### Top Issues\n`;
      for (const issue of report.topIssues.slice(0, 5)) {
        const severityIcon = issue.severity === 'critical' || issue.severity === 'high' ? '🔴' :
                            issue.severity === 'medium' ? '🟡' : 'ℹ️';
        markdown += `${severityIcon} **${issue.type}**: ${issue.message}\n`;
        markdown += `   - File: ${issue.file}${issue.line ? `:${issue.line}` : ''}\n`;
        if (issue.autoFixable) {
          markdown += `   - ⚡ Auto-fix available\n`;
        }
        markdown += '\n';
      }
    }

    // Recommended actions
    markdown += `### Recommended Actions\n`;
    for (const action of report.recommendedActions) {
      markdown += `- ${action}\n`;
    }
    markdown += '\n';

    // Blockers
    if (report.blockers.length > 0) {
      markdown += `### 🚫 Blockers\n`;
      for (const blocker of report.blockers) {
        markdown += `- ${blocker}\n`;
      }
    }

    return markdown;
  }

  /**
   * Generate JSON report for CI/CD
   */
  generateJSON(report: PRQualityReport): string {
    return JSON.stringify(report, null, 2);
  }
}

/**
 * Convenience function to generate a PR quality report
 */
export async function generatePRQualityReport(
  projectPath: string,
  options?: Partial<QualityReportOptions>
): Promise<PRQualityReport> {
  const generator = new QualityReportGenerator({
    projectPath,
    ...options
  });

  return generator.generate();
}
