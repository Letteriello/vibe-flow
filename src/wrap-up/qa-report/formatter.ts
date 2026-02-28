/**
 * QA Report Formatter
 * Feature: FEAT-003 - QA Report
 */

import type {
  QAReportData,
  TestResults,
  BuildResults,
  TypeCheckResults,
  CoverageResults,
  SecurityResults
} from './types.js';

/**
 * ReportFormatter - Formats QA report data
 */
export class ReportFormatter {
  /**
   * Format report as JSON
   */
  formatJson(data: QAReportData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format report as Markdown
   */
  formatMarkdown(data: QAReportData): string {
    const lines: string[] = [];

    // Header
    lines.push('# QA Report');
    lines.push('');
    lines.push(`**Project:** ${data.projectName}`);
    lines.push(`**Date:** ${new Date(data.timestamp).toLocaleString()}`);
    lines.push(`**Verdict:** ${this.formatVerdict(data.summary.verdict)}`);
    lines.push(`**Score:** ${data.summary.score}/100`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Check | Status |');
    lines.push('|-------|--------|');

    if (data.tests) {
      lines.push(`| Tests | ${this.formatTestStatus(data.tests)} |`);
    }
    if (data.build) {
      lines.push(`| Build | ${data.build.success ? 'PASS' : 'FAIL'} |`);
    }
    if (data.types) {
      lines.push(`| Type Check | ${data.types.success ? 'PASS' : 'FAIL'} |`);
    }
    if (data.coverage) {
      lines.push(`| Coverage | ${this.formatCoverageStatus(data.coverage)} |`);
    }
    if (data.security) {
      lines.push(`| Security | ${data.security.passed ? 'PASS' : 'FAIL'} |`);
    }

    lines.push('');

    // Details
    if (data.tests) {
      lines.push('## Tests');
      lines.push('');
      lines.push(`- **Total:** ${data.tests.total}`);
      lines.push(`- **Passed:** ${data.tests.passed}`);
      lines.push(`- **Failed:** ${data.tests.failed}`);
      lines.push(`- **Skipped:** ${data.tests.skipped}`);
      lines.push(`- **Duration:** ${(data.tests.duration / 1000).toFixed(2)}s`);
      lines.push('');
    }

    if (data.build) {
      lines.push('## Build');
      lines.push('');
      lines.push(`- **Status:** ${data.build.success ? 'PASS' : 'FAIL'}`);
      lines.push(`- **Duration:** ${(data.build.duration / 1000).toFixed(2)}s`);
      if (data.build.output) {
        lines.push('');
        lines.push('```');
        lines.push(data.build.output.slice(-2000));
        lines.push('```');
      }
      lines.push('');
    }

    if (data.types) {
      lines.push('## Type Check');
      lines.push('');
      lines.push(`- **Status:** ${data.types.success ? 'PASS' : 'FAIL'}`);
      lines.push(`- **Errors:** ${data.types.errors.length}`);
      lines.push(`- **Duration:** ${(data.types.duration / 1000).toFixed(2)}s`);
      lines.push('');
    }

    if (data.coverage) {
      lines.push('## Coverage');
      lines.push('');
      lines.push(`- **Lines:** ${data.coverage.lines.percentage.toFixed(1)}%`);
      lines.push(`- **Branches:** ${data.coverage.branches.percentage.toFixed(1)}%`);
      lines.push(`- **Functions:** ${data.coverage.functions.percentage.toFixed(1)}%`);
      lines.push(`- **Statements:** ${data.coverage.statements.percentage.toFixed(1)}%`);
      lines.push('');
    }

    if (data.security) {
      lines.push('## Security');
      lines.push('');
      lines.push(`- **Status:** ${data.security.passed ? 'PASS' : 'FAIL'}`);
      lines.push(`- **Vulnerabilities:** ${data.security.vulnerabilities.length}`);

      if (data.security.vulnerabilities.length > 0) {
        lines.push('');
        for (const vuln of data.security.vulnerabilities) {
          const location = vuln.file ? ` (${vuln.file}${vuln.line ? ':' + vuln.line : ''})` : '';
          lines.push(`  - [${vuln.severity.toUpperCase()}] ${vuln.category}: ${vuln.description}${location}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatVerdict(verdict: string): string {
    switch (verdict) {
      case 'APROVADO':
        return '✅ APROVADO';
      case 'RESSALVAS':
        return '⚠️ RESSALVAS';
      case 'REPROVADO':
        return '❌ REPROVADO';
      default:
        return verdict;
    }
  }

  private formatTestStatus(tests: TestResults): string {
    if (tests.failed > 0) {
      return `❌ ${tests.passed}/${tests.total} passed`;
    }
    return `✅ ${tests.passed}/${tests.total} passed`;
  }

  private formatCoverageStatus(coverage: CoverageResults): string {
    const min = Math.min(
      coverage.lines.percentage,
      coverage.branches.percentage,
      coverage.functions.percentage,
      coverage.statements.percentage
    );

    if (min >= 70) {
      return `✅ ${min.toFixed(1)}%`;
    }
    if (min >= 50) {
      return `⚠️ ${min.toFixed(1)}%`;
    }
    return `❌ ${min.toFixed(1)}%`;
  }
}
