// Architecture Module - Architecture-first enforcement
// Epic 8: Architecture-First Enforcement

export { ArchitectureSpecTemplate } from './spec-template.js';
export type { ArchitectureSpec, ArchitectureSection } from './types.js';

export { SpecValidator } from './spec-validator.js';
export type { ValidationResult, ValidationError } from './types.js';

export { HumanReviewGate } from './human-review-gate.js';
export type { ReviewDecision } from './types.js';

// TODO: Implement SpecVersionManager
// export { SpecVersionManager } from './version-manager.js';
// export type { SpecVersion } from './types.js';
