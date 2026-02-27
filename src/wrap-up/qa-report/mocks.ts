/**
 * QA Report Mocks
 *
 * Mock data for testing QA Report Generator components.
 */

import type {
  TestResults,
  BuildResults,
  TypeCheckResults,
  CoverageResults,
  SecurityResults,
  QAReportData,
  QAReportSummary
} from './types.js';

// Mock test results
export const mockTestResults: TestResults = {
  total: 150,
  passed: 145,
  failed: 3,
  skipped: 2,
  duration: 45000,
  suites: [
    {
      name: 'src/context',
      tests: 45,
      passed: 44,
      failed: 1,
      duration: 12000
    },
    {
      name: 'src/execution',
      tests: 38,
      passed: 38,
      failed: 0,
      duration: 8000
    },
    {
      name: 'src/security',
      tests: 32,
      passed: 30,
      failed: 2,
      duration: 15000
    },
    {
      name: 'src/validation',
      tests: 35,
      passed: 33,
      failed: 0,
      duration: 10000
    }
  ]
};

// Mock build results - success
export const mockBuildResultsSuccess: BuildResults = {
  success: true,
  duration: 25000,
  errors: [],
  warnings: [
    {
      file: 'src/utils/helper.ts',
      line: 42,
      column: 10,
      code: 'TS6133',
      message: 'Unused variable: unusedVar'
    }
  ],
  output: 'Build completed successfully'
};

// Mock build results - failure
export const mockBuildResultsFailure: BuildResults = {
  success: false,
  duration: 8000,
  errors: [
    {
      file: 'src/context/context-manager.ts',
      line: 87,
      column: 20,
      code: 'TS2322',
      message: "Type 'string | undefined' is not assignable to type 'string'"
    }
  ],
  warnings: [],
  output: 'Build failed with errors'
};

// Mock type check results
export const mockTypeCheckResultsSuccess: TypeCheckResults = {
  success: true,
  errors: [],
  duration: 12000
};

export const mockTypeCheckResultsFailure: TypeCheckResults = {
  success: false,
  errors: [
    {
      file: 'src/context/dag-summary.ts',
      line: 42,
      column: 15,
      code: 'TS2322',
      message: "Type 'Summary[]' is not assignable to type 'CondensedSummary[]'"
    },
    {
      file: 'src/security/secret-scanner.ts',
      line: 156,
      column: 30,
      code: 'TS2339',
      message: "Property 'match' does not exist on type 'RegExpExecArray | null'"
    }
  ],
  duration: 8000
};

// Mock coverage results
export const mockCoverageResults: CoverageResults = {
  lines: { total: 5000, covered: 4250, percentage: 85.0 },
  statements: { total: 4800, covered: 4080, percentage: 85.0 },
  functions: { total: 650, covered: 585, percentage: 90.0 },
  branches: { total: 1200, covered: 960, percentage: 80.0 }
};

// Mock security results - pass
export const mockSecurityResultsPass: SecurityResults = {
  passed: true,
  vulnerabilities: [],
  scanDuration: 5000
};

// Mock security results - with findings
export const mockSecurityResultsWithFindings: SecurityResults = {
  passed: false,
  vulnerabilities: [
    {
      severity: 'high',
      category: 'A02:2021-Cryptographic Failures',
      title: 'Hardcoded API Key',
      file: 'src/config/secrets.ts',
      line: 15,
      description: 'Hardcoded API key detected in source code',
      remediation: 'Use environment variables instead of hardcoded secrets'
    },
    {
      severity: 'medium',
      category: 'A03:2021-Injection',
      title: 'Potential SQL Injection',
      file: 'src/db/query.ts',
      line: 42,
      description: 'Unparameterized query could lead to SQL injection',
      remediation: 'Use parameterized queries or an ORM'
    }
  ],
  scanDuration: 8000
};

// Mock QA report data
export const mockQAReportData: QAReportData = {
  projectName: 'vibe-flow',
  projectPath: '/home/user/vibe-flow',
  timestamp: '2026-02-28T15:30:00.000Z',
  tests: mockTestResults,
  build: mockBuildResultsSuccess,
  types: mockTypeCheckResultsSuccess,
  coverage: mockCoverageResults,
  security: mockSecurityResultsPass,
  summary: {
    overall: 'pass',
    totalTests: 150,
    passedTests: 145,
    buildSuccess: true,
    typeCheckSuccess: true,
    coveragePercentage: 85.0,
    securityPassed: true,
    score: 95,
    verdict: 'APROVADO'
  }
};

// Mock QA report data with failures
export const mockQAReportDataWithFailures: QAReportData = {
  ...mockQAReportData,
  tests: {
    ...mockTestResults,
    failed: 3
  },
  build: mockBuildResultsFailure,
  security: mockSecurityResultsWithFindings,
  summary: {
    overall: 'fail',
    totalTests: 150,
    passedTests: 147,
    buildSuccess: false,
    typeCheckSuccess: true,
    coveragePercentage: 85.0,
    securityPassed: false,
    score: 72,
    verdict: 'REPROVADO'
  }
};

// Mock summary with warning
export const mockQAReportDataWarning: QAReportData = {
  ...mockQAReportData,
  tests: {
    ...mockTestResults,
    failed: 1
  },
  summary: {
    overall: 'warning',
    totalTests: 150,
    passedTests: 149,
    buildSuccess: true,
    typeCheckSuccess: true,
    coveragePercentage: 75.0,
    securityPassed: true,
    score: 88,
    verdict: 'RESSALVAS'
  }
};

// Create custom mock data
export function createMockTestResults(overrides: Partial<TestResults> = {}): TestResults {
  return { ...mockTestResults, ...overrides };
}

export function createMockBuildResults(overrides: Partial<BuildResults> = {}): BuildResults {
  return { ...mockBuildResultsSuccess, ...overrides };
}

export function createMockCoverageResults(overrides: Partial<CoverageResults> = {}): CoverageResults {
  return { ...mockCoverageResults, ...overrides };
}
