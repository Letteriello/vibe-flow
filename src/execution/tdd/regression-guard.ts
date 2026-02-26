/**
 * RegressionGuard - Autonomous Regression Detection System
 *
 * Validates the entire test suite after individual test passes to detect
 * side effects and global regressions before task consolidation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/** Test result from a single test file */
export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  errors?: string[];
}

/** Complete test suite run result */
export interface SuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

/** Regression detection result */
export interface RegressionReport {
  hasRegression: boolean;
  regressionType: RegressionType | null;
  severity: RegressionSeverity;
  affectedAreas: string[];
  currentTaskArea: string;
  unrelatedFailures: UnrelatedFailure[];
  recommendation: RegressionRecommendation;
  fullSuiteResult: SuiteResult;
  timestamp: string;
}

/** Types of regression detected */
export type RegressionType =
  | 'SIDE_EFFECT'
  | 'GLOBAL_BREAKAGE'
  | 'INTEGRATION_FAILURE'
  | 'SILENT_FAILURE';

/** Severity of the regression */
export type RegressionSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL';

/** Information about an unrelated test failure */
export interface UnrelatedFailure {
  testFile: string;
  testName: string;
  error: string;
  isRelatedToCurrentTask: boolean;
}

/** Recommendation for handling the regression */
export type RegressionRecommendation =
  | 'MERGE_SAFE'
  | 'REQUIRES_GIT_RESET'
  | 'REQUIRES_REFACTORING'
  | 'INVESTIGATE_FURTHER';

/** Configuration for RegressionGuard */
export interface RegressionGuardConfig {
  projectRoot: string;
  testCommand: string;
  watchPaths?: string[];
  maxRetries?: number;
  timeout?: number;
}

/** Default configuration */
const DEFAULT_CONFIG: Partial<RegressionGuardConfig> = {
  testCommand: 'npm test',
  maxRetries: 2,
  timeout: 120000, // 2 minutes
};

/**
 * RegressionGuard - Validates global test suite after individual test passes
 *
 * Usage:
 *   const guard = new RegressionGuard({ projectRoot: '/path/to/project' });
 *   const report = await guard.validateAfterTaskCompletion({
 *     taskId: 'implement-feature-x',
 *     taskArea: 'src/context',
 *     modifiedFiles: ['src/context/store.ts', 'tests/unit/store.test.ts']
 *   });
 *
 *   if (report.recommendation === 'REQUIRES_GIT_RESET') {
 *     // Orchestrator will handle git reset
 *   }
 */
export class RegressionGuard {
  private config: RegressionGuardConfig;
  private lastRunResult: SuiteResult | null = null;
  private baselineResults: Map<string, TestResult> = new Map();

  constructor(config: Partial<RegressionGuardConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as RegressionGuardConfig;

    if (!this.config.projectRoot) {
      throw new Error('projectRoot is required for RegressionGuard');
    }
  }

  /**
   * Validates the complete test suite after task completion
   *
   * @param context - Task context including task ID, area, and modified files
   * @returns RegressionReport with detailed findings
   */
  async validateAfterTaskCompletion(context: {
    taskId: string;
    taskArea: string;
    modifiedFiles: string[];
  }): Promise<RegressionReport> {
    const { taskId, taskArea, modifiedFiles } = context;

    console.log(`[RegressionGuard] Validating after task: ${taskId}`);
    console.log(`[RegressionGuard] Task area: ${taskArea}`);
    console.log(`[RegressionGuard] Modified files: ${modifiedFiles.length}`);

    // Run the full test suite
    const suiteResult = await this.runFullTestSuite();
    this.lastRunResult = suiteResult;

    // Detect unrelated failures
    const unrelatedFailures = this.detectUnrelatedFailures(
      suiteResult,
      modifiedFiles,
      taskArea
    );

    // Determine regression type and severity
    const regressionType = this.determineRegressionType(
      suiteResult,
      unrelatedFailures
    );

    const severity = this.calculateSeverity(
      regressionType,
      unrelatedFailures,
      suiteResult
    );

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      regressionType,
      severity,
      unrelatedFailures,
      suiteResult
    );

    // Collect affected areas
    const affectedAreas = this.collectAffectedAreas(suiteResult, taskArea);

    const report: RegressionReport = {
      hasRegression: severity !== 'NONE',
      regressionType,
      severity,
      affectedAreas,
      currentTaskArea: taskArea,
      unrelatedFailures,
      recommendation,
      fullSuiteResult: suiteResult,
      timestamp: new Date().toISOString(),
    };

    // Log critical findings
    if (report.hasRegression) {
      this.logRegressionWarning(report);
    }

    return report;
  }

  /**
   * Runs the complete test suite and returns results
   */
  private async runFullTestSuite(): Promise<SuiteResult> {
    const startTime = Date.now();
    const projectRoot = this.config.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(this.config.testCommand, {
        cwd: projectRoot,
        timeout: this.config.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const duration = Date.now() - startTime;
      return this.parseTestOutput(stdout + stderr, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Even if tests fail, parse what we can
      const partialResult = this.parseTestOutput(errorMessage, duration);

      // Check if it's a Jest output
      if (partialResult.totalTests === 0) {
        // Try to extract test count from error
        const match = errorMessage.match(/(\d+)\s+tests?/);
        if (match) {
          partialResult.totalTests = parseInt(match[1], 10);
        }
      }

      return partialResult;
    }
  }

  /**
   * Parses Jest test output into structured results
   */
  private parseTestOutput(output: string, duration: number): SuiteResult {
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalTests = 0;

    // Parse Jest JSON output if available
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const jestOutput = JSON.parse(jsonMatch[0]);
        if (jestOutput.testResults) {
          for (const fileResult of jestOutput.testResults) {
            for (const test of fileResult.assertionResults || []) {
              results.push({
                name: test.fullName || test.name,
                status: test.status === 'passed' ? 'pass' :
                       test.status === 'pending' ? 'skip' : 'fail',
                duration: test.duration || 0,
                errors: test.failureMessages,
              });

              if (test.status === 'passed') passed++;
              else if (test.status === 'pending') skipped++;
              else failed++;
            }
          }
          totalTests = passed + failed + skipped;
        }
      } catch {
        // Fall back to text parsing
      }
    }

    // Parse text output if JSON parsing failed
    if (results.length === 0) {
      // Match patterns like: "  ✓ should do something (5ms)"
      const passMatches = output.match(/✓[^\n]+/g) || [];
      const failMatches = output.match(/✕[^\n]+/g) || [];
      const skipMatches = output.match(/○[^\n]+/g) || [];

      passed = passMatches.length;
      failed = failMatches.length;
      skipped = skipMatches.length;
      totalTests = passed + failed + skipped;

      // Extract test names
      for (const match of passMatches) {
        const nameMatch = match.match(/[✓✕○]\s+(.+?)(?:\s+\(|$)/);
        results.push({
          name: nameMatch ? nameMatch[1] : match.trim(),
          status: 'pass',
          duration: 0,
        });
      }

      for (const match of failMatches) {
        const nameMatch = match.match(/[✓✕○]\s+(.+?)(?:\s+\(|$)/);
        results.push({
          name: nameMatch ? nameMatch[1] : match.trim(),
          status: 'fail',
          duration: 0,
          errors: [match],
        });
      }
    }

    // Extract summary line if present
    const summaryMatch = output.match(
      /Tests:\s+(?:(\d+)\s+passed,\s+)?(\d+)\s+failed,\s+(\d+)\s+total/
    );
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1] || '0', 10);
      failed = parseInt(summaryMatch[2], 10);
      totalTests = parseInt(summaryMatch[3], 10);
    }

    return {
      totalTests,
      passed,
      failed,
      skipped,
      duration,
      results,
    };
  }

  /**
   * Detects failures unrelated to the current task
   */
  private detectUnrelatedFailures(
    suiteResult: SuiteResult,
    modifiedFiles: string[],
    taskArea: string
  ): UnrelatedFailure[] {
    const unrelatedFailures: UnrelatedFailure[] = [];

    // Build set of modified file paths
    const modifiedSet = new Set(modifiedFiles.map(f => path.normalize(f)));

    // Extract task area modules
    const taskModules = this.extractModulesFromArea(taskArea);

    for (const testResult of suiteResult.results) {
      if (testResult.status !== 'fail') continue;

      // Check if test is related to modified files
      const isRelated = this.isTestRelatedToFiles(
        testResult.name,
        modifiedSet,
        taskModules
      );

      if (!isRelated) {
        unrelatedFailures.push({
          testFile: this.extractTestFile(testResult.name),
          testName: testResult.name,
          error: testResult.errors?.join('; ') || 'Unknown error',
          isRelatedToCurrentTask: false,
        });
      }
    }

    return unrelatedFailures;
  }

  /**
   * Extracts module names from a task area path
   */
  private extractModulesFromArea(area: string): string[] {
    const parts = area.split('/');
    return parts.filter(p => p && p !== 'src' && p !== 'tests');
  }

  /**
   * Determines if a test is related to the modified files
   */
  private isTestRelatedToFiles(
    testName: string,
    modifiedFiles: Set<string>,
    taskModules: string[]
  ): boolean {
    const testNameLower = testName.toLowerCase();

    // Check if test name contains any modified file name
    for (const file of modifiedFiles) {
      const fileName = path.basename(file, path.extname(file)).toLowerCase();
      if (testNameLower.includes(fileName)) {
        return true;
      }
    }

    // Check if test is in the same module area
    for (const module of taskModules) {
      if (testNameLower.includes(module.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts the test file path from a test name
   */
  private extractTestFile(testName: string): string {
    // Try to extract file path from test output
    const match = testName.match(/\(([^)]+\.test\.[jt]s?):\d+:\d+\)/);
    if (match) {
      return match[1];
    }
    return 'unknown';
  }

  /**
   * Determines the type of regression detected
   */
  private determineRegressionType(
    suiteResult: SuiteResult,
    unrelatedFailures: UnrelatedFailure[]
  ): RegressionType | null {
    if (unrelatedFailures.length === 0 && suiteResult.failed === 0) {
      return null;
    }

    if (unrelatedFailures.length > 0) {
      // Multiple unrelated failures indicate side effects
      if (unrelatedFailures.length >= 3) {
        return 'GLOBAL_BREAKAGE';
      }

      // Check for integration failures
      const hasIntegration = unrelatedFailures.some(f =>
        f.testFile.includes('integration') || f.testFile.includes('e2e')
      );

      if (hasIntegration) {
        return 'INTEGRATION_FAILURE';
      }

      return 'SIDE_EFFECT';
    }

    // Failures in the same area but not in modified tests
    if (suiteResult.failed > 0) {
      return 'SILENT_FAILURE';
    }

    return null;
  }

  /**
   * Calculates the severity of the regression
   */
  private calculateSeverity(
    regressionType: RegressionType | null,
    unrelatedFailures: UnrelatedFailure[],
    suiteResult: SuiteResult
  ): RegressionSeverity {
    if (!regressionType || unrelatedFailures.length === 0) {
      return 'NONE';
    }

    const failureRate = suiteResult.totalTests > 0
      ? suiteResult.failed / suiteResult.totalTests
      : 0;

    switch (regressionType) {
      case 'GLOBAL_BREAKAGE':
        return 'CRITICAL';

      case 'INTEGRATION_FAILURE':
        return failureRate > 0.1 ? 'CRITICAL' : 'MEDIUM';

      case 'SIDE_EFFECT':
        if (unrelatedFailures.length >= 5) return 'CRITICAL';
        if (unrelatedFailures.length >= 2) return 'MEDIUM';
        return 'LOW';

      case 'SILENT_FAILURE':
        return failureRate > 0.2 ? 'CRITICAL' : 'MEDIUM';

      default:
        return 'NONE';
    }
  }

  /**
   * Generates a recommendation based on the regression analysis
   */
  private generateRecommendation(
    regressionType: RegressionType | null,
    severity: RegressionSeverity,
    unrelatedFailures: UnrelatedFailure[],
    suiteResult: SuiteResult
  ): RegressionRecommendation {
    if (severity === 'NONE') {
      return 'MERGE_SAFE';
    }

    if (severity === 'CRITICAL') {
      // For global breakage, recommend git reset
      if (regressionType === 'GLOBAL_BREAKAGE') {
        return 'REQUIRES_GIT_RESET';
      }
      return 'REQUIRES_REFACTORING';
    }

    if (severity === 'MEDIUM') {
      // If failures are easily reversible, suggest refactoring
      if (unrelatedFailures.length <= 2) {
        return 'INVESTIGATE_FURTHER';
      }
      return 'REQUIRES_REFACTORING';
    }

    return 'INVESTIGATE_FURTHER';
  }

  /**
   * Collects all areas affected by failures
   */
  private collectAffectedAreas(
    suiteResult: SuiteResult,
    taskArea: string
  ): string[] {
    const areas = new Set<string>([taskArea]);

    for (const result of suiteResult.results) {
      if (result.status !== 'fail') continue;

      // Extract module from test file path
      const testFile = this.extractTestFile(result.name);
      const parts = testFile.split('/');

      // Find the src module
      const srcIndex = parts.indexOf('src');
      if (srcIndex >= 0 && srcIndex + 1 < parts.length) {
        areas.add(parts.slice(0, srcIndex + 2).join('/'));
      }
    }

    return Array.from(areas);
  }

  /**
   * Logs regression warnings
   */
  private logRegressionWarning(report: RegressionReport): void {
    console.error('\n========================================');
    console.error('[REGRESSION GUARD] CRITICAL REGRESSION DETECTED');
    console.error('========================================');
    console.error(`Type: ${report.regressionType}`);
    console.error(`Severity: ${report.severity}`);
    console.error(`Recommendation: ${report.recommendation}`);
    console.error(`\nAffected Areas:`);
    for (const area of report.affectedAreas) {
      console.error(`  - ${area}`);
    }
    console.error(`\nUnrelated Failures (${report.unrelatedFailures.length}):`);
    for (const failure of report.unrelatedFailures.slice(0, 5)) {
      console.error(`  - ${failure.testName}`);
      console.error(`    Error: ${failure.error.substring(0, 100)}...`);
    }
    console.error('========================================\n');

    // Write regression log
    this.writeRegressionLog(report);
  }

  /**
   * Writes regression log to file for audit
   */
  private async writeRegressionLog(report: RegressionReport): Promise<void> {
    const logDir = path.join(this.config.projectRoot, '.vibe-flow');
    const logFile = path.join(logDir, 'regression-log.json');

    try {
      await fs.mkdir(logDir, { recursive: true });

      let logs: RegressionReport[] = [];
      try {
        const existing = await fs.readFile(logFile, 'utf-8');
        logs = JSON.parse(existing);
      } catch {
        // File doesn't exist yet
      }

      logs.push(report);

      // Keep only last 50 entries
      if (logs.length > 50) {
        logs = logs.slice(-50);
      }

      await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('[RegressionGuard] Failed to write regression log:', error);
    }
  }

  /**
   * Returns the last test suite result
   */
  getLastResult(): SuiteResult | null {
    return this.lastRunResult;
  }

  /**
   * Clears the cached baseline results
   */
  clearBaseline(): void {
    this.baselineResults.clear();
  }

  /**
   * Sets a baseline for comparison
   */
  async setBaseline(): Promise<void> {
    const result = await this.runFullTestSuite();
    this.baselineResults.clear();

    for (const testResult of result.results) {
      this.baselineResults.set(testResult.name, testResult);
    }
  }

  /**
   * Compares current results against baseline
   */
  compareWithBaseline(): {
    newFailures: string[];
    fixedTests: string[];
    regressions: string[];
  } {
    const newFailures: string[] = [];
    const fixedTests: string[] = [];
    const regressions: string[] = [];

    if (!this.lastRunResult) {
      return { newFailures, fixedTests, regressions };
    }

    const currentResults = new Map<string, TestResult>();
    for (const result of this.lastRunResult.results) {
      currentResults.set(result.name, result);
    }

    // Find new failures and fixed tests
    for (const [name, baselineResult] of this.baselineResults) {
      const currentResult = currentResults.get(name);

      if (!currentResult) {
        // Test disappeared
        if (baselineResult.status === 'fail') {
          fixedTests.push(name);
        }
      } else if (baselineResult.status === 'pass' && currentResult.status === 'fail') {
        regressions.push(name);
      } else if (baselineResult.status === 'fail' && currentResult.status === 'pass') {
        fixedTests.push(name);
      }
    }

    // Find new tests that failed
    for (const [name, currentResult] of currentResults) {
      if (!this.baselineResults.has(name) && currentResult.status === 'fail') {
        newFailures.push(name);
      }
    }

    return { newFailures, fixedTests, regressions };
  }
}

/**
 * Convenience function for quick regression check
 */
export async function checkForRegression(config: {
  projectRoot: string;
  taskArea: string;
  modifiedFiles: string[];
}): Promise<RegressionReport> {
  const guard = new RegressionGuard(config);
  return guard.validateAfterTaskCompletion({
    taskId: `task-${Date.now()}`,
    taskArea: config.taskArea,
    modifiedFiles: config.modifiedFiles,
  });
}
