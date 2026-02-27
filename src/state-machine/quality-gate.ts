// Quality Gate Interceptor - Architectural quality gate for state machine
// Injected after IMPLEMENTATION phase and before transitioning to WRAP_UP

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Phase, ProjectState, StateDriftDetector, DriftStatus } from './index.js';
import { SpecValidator } from '../architecture/spec-validator.js';
import { SecurityGuard } from './security-guard.js';

// Quality gate status
export enum QualityGateStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  WARNING = 'WARNING',
  SKIPPED = 'SKIPPED'
}

// Quality gate result
export interface QualityGateResult {
  status: QualityGateStatus;
  phase: Phase;
  checks: QualityCheck[];
  refinementsTriggered: RefinementAction[];
  canTransition: boolean;
  errorMessage?: string;
}

// Individual quality check result
export interface QualityCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'error' | 'warning' | 'info';
}

// Refinement action triggered on failure
export interface RefinementAction {
  id: string;
  type: 'reconcile' | 'refine' | 'retry';
  target: string;
  description: string;
  triggeredAt: string;
}

// Architecture validation result
export interface ArchitectureValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

// Drift detection result
export interface DriftCheckResult {
  hasDrift: boolean;
  details: string;
  recoverable: boolean;
}

/**
 * Architecture Guard - Validates architecture specifications
 * Ensures architecture.md and related specs meet quality thresholds
 */
export class ArchitectureGuard {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Run architecture validation
   */
  async validate(): Promise<ArchitectureValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 10;

    try {
      // Check for required architecture artifacts
      const requiredArtifacts = [
        '.bmad/architecture.md',
        '.bmad/prd.md'
      ];

      for (const artifact of requiredArtifacts) {
        const artifactPath = join(this.projectPath, artifact);
        try {
          await fs.access(artifactPath);
          const content = await fs.readFile(artifactPath, 'utf-8');

          // Validate content quality
          if (content.length < 100) {
            warnings.push(`${artifact} is too short (< 100 chars)`);
            score -= 0.5;
          }

          // Check for placeholder content
          if (this.hasPlaceholderContent(content)) {
            errors.push(`${artifact} contains placeholder content`);
            score -= 2;
          }

          // Check for required sections in architecture.md
          if (artifact === '.bmad/architecture.md') {
            const requiredSections = ['#', '##'];
            const hasSections = requiredSections.some(s => content.includes(s));
            if (!hasSections) {
              warnings.push(`${artifact} lacks proper markdown structure`);
              score -= 0.5;
            }
          }
        } catch {
          errors.push(`Required artifact missing: ${artifact}`);
          score -= 3;
        }
      }

      // Validate architecture spec if exists
      const archSpecPath = join(this.projectPath, '.bmad/architecture.md');
      try {
        const content = await fs.readFile(archSpecPath, 'utf-8');
        const validationResult = this.parseAndValidateSpec(content);
        errors.push(...validationResult.errors);
        warnings.push(...validationResult.warnings);
        score = Math.min(score, validationResult.score);
      } catch {
        // File doesn't exist, already handled above
      }

      return {
        valid: errors.length === 0,
        score: Math.max(0, score),
        errors,
        warnings
      };
    } catch (error: any) {
      errors.push(`Architecture validation failed: ${error.message}`);
      return {
        valid: false,
        score: 0,
        errors,
        warnings: []
      };
    }
  }

  /**
   * Check if content has placeholder text
   */
  private hasPlaceholderContent(content: string): boolean {
    const placeholders = [
      /TODO/i,
      /FIXME/i,
      /PLACEHOLDER/i,
      /\[.*\]/,
      /<.*>/
    ];

    return placeholders.some(pattern => pattern.test(content));
  }

  /**
   * Parse and validate architecture spec content
   */
  private parseAndValidateSpec(content: string): ArchitectureValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 10;

    // Check for minimum content
    if (content.length < 500) {
      warnings.push('Architecture specification is brief (< 500 chars)');
      score -= 1;
    }

    // Check for key sections
    const hasOverview = /overview|introduction|summary/i.test(content);
    const hasTech = /technology|tech|stack/i.test(content);
    const hasSecurity = /security|auth/i.test(content);

    if (!hasOverview) {
      warnings.push('Missing overview section');
      score -= 0.5;
    }

    if (!hasTech) {
      warnings.push('Missing technology stack section');
      score -= 0.5;
    }

    if (!hasSecurity) {
      warnings.push('Missing security considerations');
      score -= 0.5;
    }

    return {
      valid: errors.length === 0,
      score: Math.max(0, score),
      errors,
      warnings
    };
  }
}

/**
 * Refiner Manager - Handles refinement actions on quality gate failure
 * Provides automatic or guided remediation
 */
export class RefinerManager {
  private projectPath: string;
  private refinements: RefinementAction[] = [];

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Trigger refinement based on failed checks
   */
  async refine(failedChecks: QualityCheck[]): Promise<RefinementAction[]> {
    const refinements: RefinementAction[] = [];

    for (const check of failedChecks) {
      if (check.severity === 'error') {
        const action = await this.createRefinementAction(check);
        refinements.push(action);
      }
    }

    this.refinements = refinements;
    return refinements;
  }

  /**
   * Create a specific refinement action
   */
  private async createRefinementAction(check: QualityCheck): Promise<RefinementAction> {
    const action: RefinementAction = {
      id: `refine-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'refine',
      target: check.name,
      description: check.details,
      triggeredAt: new Date().toISOString()
    };

    // Determine refinement type based on check name
    if (check.name.toLowerCase().includes('drift')) {
      action.type = 'reconcile';
    } else if (check.name.toLowerCase().includes('architecture')) {
      action.type = 'refine';
    }

    return action;
  }

  /**
   * Get all triggered refinements
   */
  getRefinements(): RefinementAction[] {
    return [...this.refinements];
  }

  /**
   * Clear refinement history
   */
  clear(): void {
    this.refinements = [];
  }
}

/**
 * Quality Gate Interceptor
 * Enforces quality checks between IMPLEMENTATION and WRAP_UP phases
 */
export class QualityGateInterceptor {
  private projectPath: string;
  private driftDetector: StateDriftDetector;
  private architectureGuard: ArchitectureGuard;
  private refinerManager: RefinerManager;
  private securityGuard: SecurityGuard;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.driftDetector = new StateDriftDetector(projectPath);
    this.architectureGuard = new ArchitectureGuard(projectPath);
    this.refinerManager = new RefinerManager(projectPath);
    this.securityGuard = new SecurityGuard(projectPath);
  }

  /**
   * Verify quality gate - runs all quality checks
   * Called after IMPLEMENTATION phase and before transitioning to WRAP_UP
   */
  async verifyQualityGate(state: ProjectState): Promise<QualityGateResult> {
    const checks: QualityCheck[] = [];
    let allPassed = true;

    // Verify we are in the correct phase context (should be after IMPLEMENTATION)
    const currentPhase = state?.phase || Phase.IMPLEMENTATION;

    // Check 1: State Drift Detection
    const driftCheck = await this.runDriftCheck();
    checks.push(driftCheck);
    if (!driftCheck.passed) {
      allPassed = false;
    }

    // Check 2: Architecture Validation
    const archCheck = await this.runArchitectureCheck();
    checks.push(archCheck);
    if (!archCheck.passed) {
      allPassed = false;
    }

    // Check 3: Security Validation (OWASP)
    const securityCheck = await this.runSecurityCheck();
    checks.push(securityCheck);
    if (!securityCheck.passed) {
      allPassed = false;
    }

    // Determine overall status
    let status: QualityGateStatus;
    let canTransition = true;
    let errorMessage: string;

    if (allPassed) {
      status = QualityGateStatus.PASSED;
      errorMessage = undefined;
    } else {
      // Check if any errors (not warnings) failed
      const hasErrors = checks.some(c => c.severity === 'error' && !c.passed);

      if (hasErrors) {
        status = QualityGateStatus.FAILED;
        canTransition = false;
        errorMessage = 'Quality gate failed - errors must be resolved before transitioning to WRAP_UP';
      } else {
        status = QualityGateStatus.WARNING;
        canTransition = true;
        errorMessage = 'Quality gate passed with warnings';
      }
    }

    // Trigger refinements if failed
    const refinementsTriggered: RefinementAction[] = [];
    if (!allPassed) {
      const failedChecks = checks.filter(c => !c.passed && c.severity === 'error');
      if (failedChecks.length > 0) {
        refinementsTriggered.push(...await this.refinerManager.refine(failedChecks));
      }
    }

    return {
      status,
      phase: currentPhase,
      checks,
      refinementsTriggered,
      canTransition,
      errorMessage
    };
  }

  /**
   * Run drift detection check
   */
  private async runDriftCheck(): Promise<QualityCheck> {
    try {
      const driftResult = await this.driftDetector.checkDirectoryDrift();

      return {
        name: 'State Drift Detection',
        passed: !driftResult.hasDrift,
        details: driftResult.hasDrift
          ? driftResult.driftMessage
          : 'No state drift detected - directory is consistent',
        severity: driftResult.hasDrift ? 'error' : 'info'
      };
    } catch (error: any) {
      return {
        name: 'State Drift Detection',
        passed: false,
        details: `Drift check failed: ${error.message}`,
        severity: 'error'
      };
    }
  }

  /**
   * Run architecture validation check
   */
  private async runArchitectureCheck(): Promise<QualityCheck> {
    try {
      const validationResult = await this.architectureGuard.validate();

      const passed = validationResult.valid;
      const details = validationResult.errors.length > 0
        ? validationResult.errors.join('; ')
        : validationResult.warnings.length > 0
          ? validationResult.warnings.join('; ')
          : 'Architecture validation passed';

      return {
        name: 'Architecture Validation',
        passed,
        details,
        severity: passed ? 'info' : 'error'
      };
    } catch (error: any) {
      return {
        name: 'Architecture Validation',
        passed: false,
        details: `Architecture check failed: ${error.message}`,
        severity: 'error'
      };
    }
  }

  /**
   * Run security validation check (OWASP)
   */
  private async runSecurityCheck(): Promise<QualityCheck> {
    try {
      const validationResult = await this.securityGuard.validate();

      const details = validationResult.errors.length > 0
        ? validationResult.errors.join('; ')
        : validationResult.warnings.length > 0
          ? validationResult.warnings.join('; ')
          : 'Security validation passed - no critical issues found';

      return {
        name: 'Security Validation (OWASP)',
        passed: validationResult.passed,
        details,
        severity: validationResult.passed ? 'info' : 'error'
      };
    } catch (error: any) {
      return {
        name: 'Security Validation (OWASP)',
        passed: false,
        details: `Security check failed: ${error.message}`,
        severity: 'error'
      };
    }
  }

  /**
   * Check if quality gate can be bypassed (for override scenarios)
   */
  canBypass(): boolean {
    return false; // Quality gate cannot be bypassed - enforces unbroken progression
  }

  /**
   * Get quality gate configuration
   */
  getConfig(): { enabledChecks: string[] } {
    return {
      enabledChecks: [
        'StateDriftDetector',
        'ArchitectureGuard',
        'SecurityGuard'
      ]
    };
  }
}

/**
 * Create a quality gate interceptor instance
 */
export function createQualityGate(projectPath?: string): QualityGateInterceptor {
  return new QualityGateInterceptor(projectPath);
}

/**
 * Get singleton quality gate instance
 */
let globalQualityGate: QualityGateInterceptor | null = null;

export function getGlobalQualityGate(projectPath: string = process.cwd()): QualityGateInterceptor {
  if (!globalQualityGate) {
    globalQualityGate = new QualityGateInterceptor(projectPath);
  }
  return globalQualityGate;
}

/**
 * Reset global quality gate (for testing)
 */
export function resetGlobalQualityGate(): void {
  globalQualityGate = null;
}

export default QualityGateInterceptor;
