/**
 * QA Report Generator Types
 * Feature: FEAT-003 - Geração Automatizada de qa-report.md
 */

export type VerificationStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export type Verdict = 'PASS' | 'WARNING' | 'FAIL';

/**
 * Resultado de uma verificação individual
 */
export interface VerificationResult {
  name: string;
  status: VerificationStatus;
  exitCode?: number;
  duration: number;
  output?: string;
  issues?: string[];
  blocked?: boolean;
}

/**
 * Resumo estatístico do QA
 */
export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  blocked: number;
}

/**
 * Configuração do QA Report Generator
 */
export interface QAReportConfig {
  projectPath: string;
  pipeline?: string;
  outputDir?: string;
  outputFilename?: string;
  blockOnFail?: boolean;
  includeDetails?: boolean;
  validationTimeout?: number;
}

/**
 * Relatório completo de QA
 */
export interface QAReport {
  id: string;
  timestamp: string;
  projectPath: string;
  pipeline?: string;
  verdict: Verdict;
  verifications: VerificationResult[];
  summary: QASummary;
  recommendations: string[];
  reportPath?: string;
}

/**
 * Resultado de uma coleta de validação
 */
export interface CollectorResult {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
  error?: string;
}
