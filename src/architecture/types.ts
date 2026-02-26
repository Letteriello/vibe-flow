// Architecture module types - Specification templates and validation

// Architecture specification section
export interface ArchitectureSection {
  title: string;
  content: string;
  required: boolean;
  fields?: string[];
}

// Complete architecture specification
export interface ArchitectureSpec {
  id: string;
  version: string;
  projectName: string;
  overview: ArchitectureSection;
  dataModel: ArchitectureSection;
  api: ArchitectureSection;
  security: ArchitectureSection;
  createdAt: string;
  updatedAt: string;
  author?: string;
}

// Validation error
export interface ValidationError {
  section: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  score: number; // 0-100
}

// Human review decision
export interface ReviewDecision {
  id: string;
  specId: string;
  decision: 'approved' | 'rejected' | 'needs_changes';
  reviewer: string;
  comments?: string;
  timestamp: string;
}

// Specification version
export interface SpecVersion {
  id: string;
  specId: string;
  version: string;
  changelog: string;
  createdAt: string;
  author?: string;
  snapshot: string; // JSON snapshot of the spec
}

// Spec template configuration
export interface SpecTemplateConfig {
  projectName: string;
  includeSections?: string[];
  customFields?: Record<string, string[]>;
}
