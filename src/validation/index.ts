export { CrossRuleValidator, validateCrossRule, CrossRuleStatus } from './cross-rule.js';
export type { ValidationResult, CrossRuleOptions, CrossRuleIssue } from './cross-rule.js';

// Validation module exports
export { StepValidator, ValidationLevel, ValidationStatus } from './step-validator.js';
export { SpecificationReadinessGate, ReadinessResult } from './readiness-gate.js';
export { PreFlightChecker, PreFlightStatus, runPreFlightChecks } from './preflight-checker.js';
export type { PreFlightCheckItem, PreFlightResult, PreFlightOptions } from './preflight-checker.js';
export { PreFlightChecklistUI, renderPreFlightChecklist, renderPreFlightCompact } from './preflight-ui.js';
export type { ChecklistUIOptions } from './preflight-ui.js';
export { CodeQualityGuard, runQualityCheck, QualityLevel } from './code-quality-guard.js';
export type { QualityIssue, QualityResult, QualityOptions } from './code-quality-guard.js';
export { QualityReportGenerator, generatePRQualityReport } from './quality-reporter.js';
export type { PRQualityReport, QualityIssueSummary, QualityReportOptions } from './quality-reporter.js';
export { ArchitectureSpecTemplateGenerator, generateArchitectureTemplate, generateArchitectureMarkdown } from './architecture-spec-template.js';
export type { ArchitectureSpecTemplate, TemplateOptions } from './architecture-spec-template.js';
export { SpecValidationEngine, validateSpec } from './spec-validator.js';
export type { ValidationIssue, SpecValidationResult, ValidationOptions } from './spec-validator.js';
export { HumanReviewGate, ReviewDecision, requestHumanReview } from './human-review-gate.js';
export type { ReviewComment, HumanReviewRequest, ReviewGateOptions, ReviewGateResult } from './human-review-gate.js';
export { SpecVersioning, createSpecVersion, compareSpecVersions, rollbackSpecVersion } from './spec-versioning.js';
export type { SpecVersion, SpecVersionHistory, VersionComparison, VersionChange, SpecVersioningOptions } from './spec-versioning.js';
