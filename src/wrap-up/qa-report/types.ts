/**
 * QA Report Types
 *
 * Defines the core types and interfaces for the QA Report Generator.
 */

// Test results summary
export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites?: TestSuite[];
}

export interface TestSuite {
  name: string;
  tests: number;
  passed: number;
  failed: number;
  duration: number;
}

// Build results
export interface BuildResults {
  success: boolean;
  duration: number;
  errors: BuildError[];
  warnings: BuildWarning[];
  output?: string;
}

export interface BuildError {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
}

export interface BuildWarning {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
}

// TypeScript/Type checking results
export interface TypeCheckResults {
  success: boolean;
  errors: TypeError[];
  duration: number;
}

export interface TypeError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

// Coverage results
export interface CoverageResults {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

// Security scan results
export interface SecurityResults {
  passed: boolean;
  vulnerabilities: SecurityFinding[];
  scanDuration: number;
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  file?: string;
  line?: number;
  description: string;
  remediation?: string;
}

// QA Report configuration
export interface QAReportConfig {
  includeTests: boolean;
  includeBuild: boolean;
  includeTypes: boolean;
  includeCoverage: boolean;
  includeSecurity: boolean;
  outputFormat: 'json' | 'markdown' | 'html';
  outputPath?: string;
}

// QA Report data
export interface QAReportData {
  projectName: string;
  projectPath: string;
  timestamp: string;
  tests?: TestResults;
  build?: BuildResults;
  types?: TypeCheckResults;
  coverage?: CoverageResults;
  security?: SecurityResults;
  summary: QAReportSummary;
}

export interface QAReportSummary {
  overall: 'pass' | 'fail' | 'warning';
  totalTests: number;
  passedTests: number;
  buildSuccess: boolean;
  typeCheckSuccess: boolean;
  coveragePercentage?: number;
  securityPassed: boolean;
  score: number;
  verdict: string;
}

// Collector types
export interface DataCollector {
  collect(): Promise<unknown>;
  validate(): Promise<boolean>;
}

export interface TestCollector extends DataCollector {
  getResults(): TestResults;
}

export interface BuildCollector extends DataCollector {
  getResults(): BuildResults;
}

export interface TypesCollector extends DataCollector {
  getResults(): TypeCheckResults;
}

export interface CoverageCollector extends DataCollector {
  getResults(): CoverageResults;
}

export interface SecurityCollector extends DataCollector {
  getResults(): SecurityResults;
}

// Report formatter
export interface ReportFormatter {
  format(data: QAReportData): string;
  formatJson(data: QAReportData): string;
  formatMarkdown(data: QAReportData): string;
}

// Quality gate result
export interface QualityGateResult {
  passed: boolean;
  checks: QualityCheck[];
  blocked: boolean;
  message: string;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  details: string;
  blocked: boolean;
}
