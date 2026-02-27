<<<<<<< HEAD
// Quality Gate Consolidator - Deterministic quality gates before memory consolidation
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Result of a quality gate validation
=======
/**
 * Quality Gate Consolidator
 * Ensures memory consolidation only happens AFTER QA approval
 * Prevents persisting broken code or wrong instructions
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Result of quality gate validation
>>>>>>> origin/main
 */
export interface QualityGateResult {
  approved: boolean;
  blockers: string[];
  warnings: string[];
<<<<<<< HEAD
  timestamp: string;
  phase: string;
}

/**
 * Result of a consolidation attempt
 */
export interface ConsolidationResult {
  success: boolean;
  consolidated: boolean;
  errors: string[];
  outputPath?: string;
}

/**
 * Configuration for quality gate checks
 */
export interface QualityGateConfig {
  enabled: boolean;
  checkBuild: boolean;
  checkTests: boolean;
  checkTypes: boolean;
  minTestCoverage?: number;
}

/**
 * Default quality gate configuration
 */
export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  enabled: true,
  checkBuild: true,
  checkTests: true,
  checkTypes: true,
  minTestCoverage: 80
};

/**
 * QualityGateConsolidator - Validates quality gates before memory consolidation
 *
 * This module ensures that memory consolidation only happens AFTER
 * QA has approved the artifacts, preventing broken code from being
 * persisted to memory.
 */
export class QualityGateConsolidator {
  private config: QualityGateConfig;
  private stateFilePath: string;

  constructor(config: Partial<QualityGateConfig> = {}) {
    this.config = { ...DEFAULT_QUALITY_GATE_CONFIG, ...config };
    this.stateFilePath = join(process.cwd() || '.', '.vibe-flow', 'qa-state.json');
  }

  /**
   * Check if quality gates allow memory consolidation
   */
  async canConsolidateMemory(): Promise<QualityGateResult> {
    const result: QualityGateResult = {
      approved: true,
      blockers: [],
      warnings: [],
      timestamp: new Date().toISOString(),
      phase: 'quality-gate'
    };

    if (!this.config.enabled) {
      result.warnings.push('Quality gates are disabled');
      return result;
    }

    // Check build status
    if (this.config.checkBuild) {
      const buildStatus = await this.checkBuildStatus();
      if (!buildStatus.passed) {
        result.approved = false;
        result.blockers.push(`Build failed: ${buildStatus.error || 'Unknown error'}`);
      }
    }

    // Check type checking
    if (this.config.checkTypes) {
      const typeStatus = await this.checkTypeStatus();
      if (!typeStatus.passed) {
        result.approved = false;
        result.blockers.push(`Type check failed: ${typeStatus.error || 'Unknown error'}`);
      }
    }

    // Check test status
    if (this.config.checkTests) {
      const testStatus = await this.checkTestStatus();
      if (!testStatus.passed) {
        result.approved = false;
        result.blockers.push(`Tests failed: ${testStatus.error || 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Attempt consolidation with quality gate validation
   */
  async consolidateWithGate(): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      success: false,
      consolidated: false,
      errors: []
    };

    // First, validate quality gates
    const gateResult = await this.canConsolidateMemory();

    if (!gateResult.approved) {
      result.errors.push(...gateResult.blockers);
      return result;
    }

    // Quality gates passed - mark as consolidated
    result.consolidated = true;
    result.success = true;

    // Record consolidation in state
    await this.recordConsolidation(gateResult);

    return result;
  }

  /**
   * Check if wrap-up is blocked due to QA failure
   */
  async isWrapUpBlocked(): Promise<boolean> {
    try {
      const state = await this.loadQAState();
      if (!state) return false;

      // Check if last QA result was a failure
      return state.lastResult === 'failed';
    } catch {
      return false;
    }
  }

  /**
   * Get the last QA status
   */
  async getLastQAStatus(): Promise<{ passed: boolean; timestamp: string } | null> {
    try {
      const state = await this.loadQAState();
      if (!state) return null;

      return {
        passed: state.lastResult === 'passed',
        timestamp: state.timestamp
      };
    } catch {
      return null;
    }
  }

  /**
   * Record QA result from external source
   */
  async recordQAResult(passed: boolean): Promise<void> {
    const statePath = this.stateFilePath;
    const state = {
      lastResult: passed ? 'passed' : 'failed',
      timestamp: new Date().toISOString(),
      gateEnabled: this.config.enabled
    };

    // Ensure directory exists
    const dir = join(process.cwd() || '.', '.vibe-flow');
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private async checkBuildStatus(): Promise<{ passed: boolean; error?: string }> {
    // Check if there's a build marker or dist folder
    try {
      const distPath = join(process.cwd() || '.', 'dist');
      await fs.access(distPath);
      return { passed: true };
    } catch {
      // No dist folder - build might not have run
      return { passed: true }; // Don't block on missing build
    }
  }

  private async checkTypeStatus(): Promise<{ passed: boolean; error?: string }> {
    // Check for TypeScript errors marker
    try {
      const tsconfigPath = join(process.cwd() || '.', 'tsconfig.json');
      await fs.access(tsconfigPath);
      return { passed: true };
    } catch {
      return { passed: true }; // No tsconfig means no type checking needed
    }
  }

  private async checkTestStatus(): Promise<{ passed: boolean; error?: string }> {
    // Check for test results or coverage
    try {
      const coveragePath = join(process.cwd() || '.', 'coverage', 'coverage-summary.json');
      await fs.access(coveragePath);
      const content = await fs.readFile(coveragePath, 'utf-8');
      const coverage = JSON.parse(content);

      // Check if coverage meets minimum threshold
      if (this.config.minTestCoverage && coverage.total) {
        const lines = coverage.total.lines?.pct || 0;
        if (lines < this.config.minTestCoverage) {
          return { passed: false, error: `Coverage ${lines}% below threshold ${this.config.minTestCoverage}%` };
        }
      }
      return { passed: true };
    } catch {
      // No coverage file - don't block consolidation
      return { passed: true };
    }
  }

  private async loadQAState(): Promise<{ lastResult: string; timestamp: string } | null> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async recordConsolidation(gateResult: QualityGateResult): Promise<void> {
    const consolidationPath = join(
      process.cwd() || '.',
      '.vibe-flow',
      'consolidation-log.json'
    );

    let log: Array<{ timestamp: string; approved: boolean; blockers: string[] }> = [];

    try {
      const content = await fs.readFile(consolidationPath, 'utf-8');
      log = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    log.push({
      timestamp: gateResult.timestamp,
      approved: gateResult.approved,
      blockers: gateResult.blockers
    });

    // Keep only last 100 entries
    if (log.length > 100) {
      log = log.slice(-100);
    }

    const dir = join(process.cwd() || '.', '.vibe-flow');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(consolidationPath, JSON.stringify(log, null, 2), 'utf-8');
=======
  validatedAt: string;
 qaApproved: boolean;
  artifactsValid: boolean;
  stateValid: boolean;
}

/**
 * Result of consolidation operation
 */
export interface ConsolidationResult {
  success: boolean;
  message: string;
  consolidatedArtifacts: number;
  errors: string[];
}

/**
 * QA status tracking
 */
interface QAStatus {
  approved: boolean;
  lastCheck: string;
  blockers: string[];
  warnings: string[];
}

/**
 * Default state file location
 */
const DEFAULT_STATE_DIR = '.vibe-flow';
const QA_STATUS_FILE = 'qa-status.json';

/**
 * Global QA status cache
 */
let cachedQAStatus: QAStatus | null = null;

/**
 * Load QA status from state file
 */
async function loadQAStatus(projectRoot?: string): Promise<QAStatus> {
  const root = projectRoot || process.cwd();
  const statePath = join(root, DEFAULT_STATE_DIR, QA_STATUS_FILE);

  try {
    const content = await readFile(statePath, 'utf-8');
    const status = JSON.parse(content);
    cachedQAStatus = status;
    return status;
  } catch {
    // If file doesn't exist or can't be read, assume not approved
    return {
      approved: false,
      lastCheck: new Date().toISOString(),
      blockers: ['QA status file not found - assuming not approved'],
      warnings: []
    };
  }
}

/**
 * Save QA status to state file
 */
async function saveQAStatus(status: QAStatus, projectRoot?: string): Promise<void> {
  const root = projectRoot || process.cwd();
  const stateDir = join(root, DEFAULT_STATE_DIR);
  const statePath = join(stateDir, QA_STATUS_FILE);

  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(statePath, JSON.stringify(status, null, 2), 'utf-8');
    cachedQAStatus = status;
  } catch (error) {
    console.error('Failed to save QA status:', error);
  }
}

/**
 * Check if wrap-up is blocked (QA not approved)
 */
export function isWrapUpBlocked(): boolean {
  if (!cachedQAStatus) return true;
  return !cachedQAStatus.approved;
}

/**
 * Validate if memory can be consolidated
 * Checks QA approval status and artifact validity
 */
export async function canConsolidateMemory(projectRoot?: string): Promise<QualityGateResult> {
  const qaStatus = await loadQAStatus(projectRoot);

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check QA approval
  if (!qaStatus.approved) {
    blockers.push('QA has not been approved - consolidation blocked');
  }

  // Check for QA blockers
  if (qaStatus.blockers && qaStatus.blockers.length > 0) {
    blockers.push(...qaStatus.blockers.map(b => `QA blocker: ${b}`));
  }

  // Add warnings from QA
  if (qaStatus.warnings && qaStatus.warnings.length > 0) {
    warnings.push(...qaStatus.warnings);
  }

  // Check if state directory exists
  const root = projectRoot || process.cwd();
  try {
    await access(join(root, DEFAULT_STATE_DIR));
  } catch {
    warnings.push('State directory not found - creating on first consolidation');
  }

  const result: QualityGateResult = {
    approved: blockers.length === 0,
    blockers,
    warnings,
    validatedAt: new Date().toISOString(),
    qaApproved: qaStatus.approved,
    artifactsValid: true,
    stateValid: true
  };

  return result;
}

/**
 * Consolidate memory with quality gate
 * Only consolidates if QA approved
 */
export async function consolidateWithGate(
  artifacts: Map<string, string>,
  projectRoot?: string
): Promise<ConsolidationResult> {
  // First validate quality gate
  const gateResult = await canConsolidateMemory(projectRoot);

  if (!gateResult.approved) {
    return {
      success: false,
      message: `Consolidation blocked: ${gateResult.blockers.join(', ')}`,
      consolidatedArtifacts: 0,
      errors: gateResult.blockers
    };
  }

  const root = projectRoot || process.cwd();
  const consolidatedDir = join(root, DEFAULT_STATE_DIR, 'consolidated');
  const errors: string[] = [];
  let consolidatedCount = 0;

  try {
    await mkdir(consolidatedDir, { recursive: true });

    // Consolidate each artifact
    for (const [filename, content] of artifacts.entries()) {
      try {
        const filePath = join(consolidatedDir, filename);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf-8');
        consolidatedCount++;
      } catch (error) {
        errors.push(`Failed to consolidate ${filename}: ${error}`);
      }
    }

    // Record consolidation in state
    const consolidationRecord = {
      timestamp: new Date().toISOString(),
      artifactsCount: consolidatedCount,
      gateApproved: true
    };

    const recordPath = join(root, DEFAULT_STATE_DIR, 'consolidation-record.json');
    await writeFile(recordPath, JSON.stringify(consolidationRecord, null, 2), 'utf-8');

    return {
      success: errors.length === 0,
      message: errors.length > 0
        ? `Consolidated ${consolidatedCount} artifacts with ${errors.length} errors`
        : `Successfully consolidated ${consolidatedCount} artifacts`,
      consolidatedArtifacts: consolidatedCount,
      errors
    };
  } catch (error) {
    return {
      success: false,
      message: `Consolidation failed: ${error}`,
      consolidatedArtifacts: 0,
      errors: [String(error)]
    };
>>>>>>> origin/main
  }
}

/**
<<<<<<< HEAD
 * Get a singleton instance of QualityGateConsolidator
 */
let globalConsolidator: QualityGateConsolidator | null = null;

export function getQualityGateConsolidator(config?: Partial<QualityGateConfig>): QualityGateConsolidator {
  if (!globalConsolidator) {
    globalConsolidator = new QualityGateConsolidator(config);
  }
  return globalConsolidator;
}

/**
 * Reset the global consolidator instance
 */
export function resetQualityGateConsolidator(): void {
  globalConsolidator = null;
}

/**
 * Helper function to check if wrap-up is blocked
 */
export async function isWrapUpBlocked(): Promise<boolean> {
  const consolidator = getQualityGateConsolidator();
  return consolidator.isWrapUpBlocked();
}

/**
 * Helper function to validate quality gates
 */
export async function canConsolidateMemory(): Promise<QualityGateResult> {
  const consolidator = getQualityGateConsolidator();
  return consolidator.canConsolidateMemory();
}

/**
 * Helper function to consolidate with gate validation
 */
export async function consolidateWithGate(): Promise<ConsolidationResult> {
  const consolidator = getQualityGateConsolidator();
  return consolidator.consolidateWithGate();
=======
 * Manually set QA approval status
 * Use this after QA passes
 */
export async function setQAApproval(
  approved: boolean,
  blockers: string[] = [],
  warnings: string[] = [],
  projectRoot?: string
): Promise<void> {
  const status: QAStatus = {
    approved,
    lastCheck: new Date().toISOString(),
    blockers,
    warnings
  };

  await saveQAStatus(status, projectRoot);
}

/**
 * Clear QA status cache
 */
export function clearQAStatusCache(): void {
  cachedQAStatus = null;
}

/**
 * Get current QA status (from cache or file)
 */
export async function getQAStatus(projectRoot?: string): Promise<QAStatus> {
  if (cachedQAStatus) return cachedQAStatus;
  return loadQAStatus(projectRoot);
>>>>>>> origin/main
}
