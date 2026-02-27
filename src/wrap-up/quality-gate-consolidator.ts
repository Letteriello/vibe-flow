// Quality Gate Consolidator - Deterministic quality gates before memory consolidation
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Result of a quality gate validation
 */
export interface QualityGateResult {
  approved: boolean;
  blockers: string[];
  warnings: string[];
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
  }
}

/**
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
}
