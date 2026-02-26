// Quality Module - Code quality checks and pre-flight validation
// Epic 7: Code Quality & Pre-Flight

export { PreFlightChecker } from './preflight-checker.js';
export type { PreFlightResult, PreFlightCheck } from './types.js';

export { QualityGuard } from './quality-guard.js';
export type { QualityIssue, QualityReport } from './types.js';

export { AICodePatternsDetector } from './ai-patterns-detector.js';
export type { AIQualityIssue } from './types.js';

export { Guardrails } from './guardrails.js';
export type { GuardrailsConfig, GuardrailsResult } from './guardrails.js';

export { Linter } from './linter.js';
export type { LinterConfig, LinterResult } from './linter.js';

export { runFormattingGuardrails, checkFileFormatting, formatDiagnosticSummary } from './formatter-hook.js';
export type { FormatterDiagnostic, FormatterHookConfig, FormattedIssue } from './formatter-hook.js';

export { SemanticQualityChecker, createSemanticChecker } from './ast-checker.js';
export type { SyntaxAnomaly, QualityCheckResult } from './ast-checker.js';
