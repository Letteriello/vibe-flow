// Step Validator - Story 3.1: Three-Level Step Validation Framework
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { ProjectState, Phase } from '../state-machine/index.js';

export enum ValidationLevel {
  INPUT = 'INPUT',
  SPECIFICATION = 'SPECIFICATION',
  OUTPUT = 'OUTPUT'
}

export enum ValidationStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  WARNING = 'WARNING'
}

// Required sections for each artifact type
export const REQUIRED_SECTIONS: Record<string, string[]> = {
  'story': ['Story', 'Acceptance Criteria'],
  'prd': ['Executive Summary', 'Problem Statement'],
  'brief': ['Problem Statement', 'Stakeholders'],
  'architecture': ['Architecture Overview', 'Components'],
  'epic': ['Epic', 'User Stories'],
  'default': ['Acceptance Criteria', 'Implementation Plan']
};

// Artifact types and their corresponding directories
const ARTIFACT_DIRECTORIES: Record<string, string[]> = {
  'implementation-artifacts': ['story', 'default'],
  'planning-artifacts': ['prd', 'brief', 'architecture', 'epic', 'default']
};

export interface ValidationResult {
  level: ValidationLevel;
  status: ValidationStatus;
  message: string;
  details?: string[];
}

export interface StepValidationResult {
  allPassed: boolean;
  validations: ValidationResult[];
  failedLevel?: ValidationLevel;
  failedMessage?: string;
}

/**
 * Story 3.1: Three-Level Step Validation Framework
 * AC:
 * - Given: uma solicitação de avanço de passo
 * - When: o validador intercepta a requisição
 * - Then: executa Validação de Entrada, Especificação e Saída
 * - And: apenas se todas 3 validações passam, permite transição de estado
 */
export class StepValidator {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || join(process.cwd(), '_bmad-output');
  }

  /**
   * Validate step transition through all three levels
   * Story 3.1 AC:
   * - Input Validation: context accumulated, clear summary
   * - Specification Validation: requirements met, ACs present
   * - Output Validation: artifact generated is valid and compatible
   */
  async validateStep(state: ProjectState): Promise<StepValidationResult> {
    const validations: ValidationResult[] = [];

    // Level 1: Input Validation
    const inputValidation = await this.validateInput(state);
    validations.push(inputValidation);

    // Level 2: Specification Validation
    const specValidation = await this.validateSpecification(state);
    validations.push(specValidation);

    // Level 3: Output Validation
    const outputValidation = await this.validateOutput(state);
    validations.push(outputValidation);

    // Check if all passed
    const allPassed = validations.every(v => v.status === ValidationStatus.PASSED);
    const failed = validations.find(v => v.status === ValidationStatus.FAILED);

    return {
      allPassed,
      validations,
      failedLevel: failed?.level,
      failedMessage: failed?.message
    };
  }

  /**
   * Validates that the artifact from the previous step has required sections
   * This is called during advance to ensure artifact completeness
   */
  async validateArtifactCompleteness(state: ProjectState): Promise<ValidationResult> {
    try {
      // Determine which directory to look in based on current phase
      const artifactDir = this.getArtifactDirectory(state.phase);
      if (!artifactDir) {
        // No artifact validation needed for this phase
        return {
          level: ValidationLevel.OUTPUT,
          status: ValidationStatus.PASSED,
          message: 'No artifact validation required for this phase'
        };
      }

      const fullPath = join(this.outputDir, artifactDir);

      // Check if directory exists
      try {
        await fs.access(fullPath);
      } catch {
        return {
          level: ValidationLevel.OUTPUT,
          status: ValidationStatus.WARNING,
          message: `Artifact directory not found: ${artifactDir}`,
          details: ['No _bmad-output directory found', 'Skipping artifact validation']
        };
      }

      // Find the latest artifact file for the current phase
      const artifactFile = await this.findLatestArtifact(fullPath, state.phase);
      if (!artifactFile) {
        return {
          level: ValidationLevel.OUTPUT,
          status: ValidationStatus.FAILED,
          message: `No artifact found for current phase: ${state.phase}`,
          details: [`Expected artifact in: ${artifactDir}`, 'Artifact is required to advance']
        };
      }

      // Read and validate the artifact content
      const content = await fs.readFile(artifactFile, 'utf-8');
      const validation = this.validateArtifactSections(content, artifactFile);

      return validation;
    } catch (error) {
      return {
        level: ValidationLevel.OUTPUT,
        status: ValidationStatus.FAILED,
        message: `Artifact validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: ['Failed to validate artifact sections']
      };
    }
  }

  /**
   * Get the artifact directory based on the current phase
   */
  private getArtifactDirectory(phase: Phase): string | null {
    const phaseToDir: Record<Phase, string | null> = {
      [Phase.NEW]: null,
      [Phase.ANALYSIS]: 'planning-artifacts',
      [Phase.PLANNING]: 'planning-artifacts',
      [Phase.SOLUTIONING]: 'planning-artifacts',
      [Phase.IMPLEMENTATION]: 'implementation-artifacts',
      [Phase.COMPLETE]: null
    };
    return phaseToDir[phase];
  }

  /**
   * Find the latest artifact file in the given directory
   */
  private async findLatestArtifact(dirPath: string, phase: Phase): Promise<string | null> {
    try {
      const files = await fs.readdir(dirPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length === 0) return null;

      // Sort by modification time, newest first
      const fileStats = await Promise.all(
        mdFiles.map(async (file) => {
          const stats = await fs.stat(join(dirPath, file));
          return { file, mtime: stats.mtime };
        })
      );

      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Return the newest file
      return join(dirPath, fileStats[0].file);
    } catch {
      return null;
    }
  }

  /**
   * Validate that the artifact has all required sections
   */
  private validateArtifactSections(content: string, filePath: string): ValidationResult {
    const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';

    // Determine artifact type from filename
    let requiredSections: string[];
    if (fileName.includes('story')) {
      requiredSections = REQUIRED_SECTIONS['story'];
    } else if (fileName.includes('prd')) {
      requiredSections = REQUIRED_SECTIONS['prd'];
    } else if (fileName.includes('brief')) {
      requiredSections = REQUIRED_SECTIONS['brief'];
    } else if (fileName.includes('architecture')) {
      requiredSections = REQUIRED_SECTIONS['architecture'];
    } else if (fileName.includes('epic')) {
      requiredSections = REQUIRED_SECTIONS['epic'];
    } else {
      requiredSections = REQUIRED_SECTIONS['default'];
    }

    // Check each required section
    const missingSections: string[] = [];
    for (const section of requiredSections) {
      // Match section header (## Section Name or # Section Name)
      const sectionPattern = new RegExp(`^#{1,6}\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'mi');
      if (!sectionPattern.test(content)) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      return {
        level: ValidationLevel.OUTPUT,
        status: ValidationStatus.FAILED,
        message: `Artifact incomplete: missing required sections`,
        details: [
          `Missing sections: ${missingSections.join(', ')}`,
          `Required for: ${requiredSections.join(', ')}`,
          `File: ${filePath.split(/[/\\]/).pop()}`
        ]
      };
    }

    return {
      level: ValidationLevel.OUTPUT,
      status: ValidationStatus.PASSED,
      message: `Artifact validation passed`,
      details: [`All required sections present in ${filePath.split(/[/\\]/).pop()}`]
    };
  }

  /**
   * Level 1: Input Validation
   * Verifies: context accumulated, clear summary exists
   */
  private async validateInput(state: ProjectState): Promise<ValidationResult> {
    // Check if context is accumulated
    const contextKeys = Object.keys(state.context || {});
    const hasContext = contextKeys.length > 0;

    // Check for decisions (accumulated context indicator)
    const hasDecisions = state.decisions && state.decisions.length > 0;

    // Check for summary in context
    const hasSummary = state.context?.summary !== undefined;

    if (!hasContext && !hasDecisions) {
      return {
        level: ValidationLevel.INPUT,
        status: ValidationStatus.FAILED,
        message: 'Input validation failed: No context accumulated',
        details: ['No decisions recorded', 'No context available']
      };
    }

    if (!hasSummary && state.decisions.length < 2) {
      return {
        level: ValidationLevel.INPUT,
        status: ValidationStatus.WARNING,
        message: 'Input validation warning: Limited context accumulated',
        details: ['Consider accumulating more context before advancing']
      };
    }

    return {
      level: ValidationLevel.INPUT,
      status: ValidationStatus.PASSED,
      message: 'Input validation passed',
      details: [`${contextKeys} context keys`, `${state.decisions.length} decisions`]
    };
  }

  /**
   * Level 2: Specification Validation
   * Verifies: requirements met, Acceptance Criteria present, artifact has required sections
   */
  private async validateSpecification(state: ProjectState): Promise<ValidationResult> {
    // Check if phase has required elements based on current phase
    const phaseRequirements = this.getPhaseRequirements(state.phase);

    // For now, basic check - in real implementation would check for specific artifacts
    const requirementsMet = phaseRequirements.every(req => {
      // Check if requirement is documented in context or decisions
      const contextStr = JSON.stringify(state.context);
      const decisionsStr = JSON.stringify(state.decisions);
      return contextStr.includes(req) || decisionsStr.includes(req);
    });

    if (!requirementsMet && phaseRequirements.length > 0) {
      return {
        level: ValidationLevel.SPECIFICATION,
        status: ValidationStatus.WARNING,
        message: 'Specification validation warning: Some requirements may not be fully documented',
        details: phaseRequirements
      };
    }

    // Validate artifact completeness (required sections)
    const artifactValidation = await this.validateArtifactCompleteness(state);

    // If artifact validation failed, propagate the failure
    if (artifactValidation.status === ValidationStatus.FAILED) {
      return artifactValidation;
    }

    return {
      level: ValidationLevel.SPECIFICATION,
      status: ValidationStatus.PASSED,
      message: 'Specification validation passed',
      details: artifactValidation.details
    };
  }

  /**
   * Level 3: Output Validation
   * Verifies: artifact generated is valid and compatible
   */
  private async validateOutput(state: ProjectState): Promise<ValidationResult> {
    // Check for errors that might indicate invalid output
    const unresolvedErrors = state.errors?.filter(e => !e.resolved) || [];

    if (unresolvedErrors.length > 0) {
      return {
        level: ValidationLevel.OUTPUT,
        status: ValidationStatus.FAILED,
        message: 'Output validation failed: Unresolved errors present',
        details: unresolvedErrors.map(e => e.message)
      };
    }

    // Check if decisions are recorded (indicates outputs were generated)
    if (state.decisions.length === 0) {
      return {
        level: ValidationLevel.OUTPUT,
        status: ValidationStatus.WARNING,
        message: 'Output validation warning: No decisions recorded, outputs may be missing'
      };
    }

    return {
      level: ValidationLevel.OUTPUT,
      status: ValidationStatus.PASSED,
      message: 'Output validation passed'
    };
  }

  /**
   * Get requirements for each phase
   */
  private getPhaseRequirements(phase: string): string[] {
    const requirements: Record<string, string[]> = {
      ANALYSIS: ['problem', 'stakeholder', 'research'],
      PLANNING: ['requirement', 'user_story', 'acceptance'],
      SOLUTIONING: ['architecture', 'technical', 'design'],
      IMPLEMENTATION: ['code', 'test', 'feature']
    };

    return requirements[phase] || [];
  }

  /**
   * Quick check if can advance (for decision points)
   */
  canAdvance(state: ProjectState): boolean {
    // Basic check - all errors resolved
    const hasUnresolvedErrors = state.errors?.some(e => !e.resolved) || false;
    return !hasUnresolvedErrors;
  }
}

export default StepValidator;
