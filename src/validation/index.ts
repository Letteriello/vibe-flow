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
export { SubAgentDelegationGuard, validateDelegation, InfiniteDelegationError } from './delegation-guard.js';
export type { DelegationRequest, DelegationValidationResult } from './delegation-guard.js';
export { ImplementationDriftDetector, detectDrift, DriftType, DriftSeverity } from './drift-detector.js';
export type { DriftReport, DriftItem, DriftDetectorOptions } from './drift-detector.js';

// Gate Keeper - Pipeline Governado de Validação de Transição
export { GateKeeper, validateInput, validateSpecification, validateOutput, validateTransition, GateStatus, GateSeverity, GateType } from './gate-keeper.js';
export type { GateIssue, GateResult, ValidationResult as GateValidationResult, PhasePrerequisites, ArtifactRequirement } from './gate-keeper.js';

// Structural Check - Verificações Estruturais Profundas
export { StructuralChecker, checkArtifactStructure, validatePhaseStructure, generateStructuralReport, ARTIFACT_STRUCTURES, PHASE_STRUCTURAL_RULES } from './structural-check.js';
export type { StructureRule, ValidationPattern, StructuralPhaseRule, StructuralCheckResult, SectionCheck, PatternCheck, LengthCheck, StructuralIssue } from './structural-check.js';
