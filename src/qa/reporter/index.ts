/**
 * QA Reporter Module
 * Feature: FEAT-003 - Geração Automatizada de qa-report.md
 */

// Types
export type {
  VerificationStatus,
  Verdict,
  VerificationResult,
  QASummary,
  QAReportConfig,
  QAReport,
  CollectorResult,
} from './types';

// Report Generator
export { QAReportGenerator, createQAReportGenerator } from './report-generator';

// Template
export { generateMarkdownReport, formatSummaryLine } from './template';
