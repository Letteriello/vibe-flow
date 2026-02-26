/**
 * Refiner Loop - Self-Healing Mechanism
 *
 * Orchestrates code correction by receiving adversarial review reports
 * from the Critic and transforming them into corrective tasks that can
 * be re-executed by the main engine.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Severity levels for issues found by the Critic
 */
export enum IssueSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

/**
 * Categories of issues that can be refined
 */
export enum IssueCategory {
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  TYPE_ERROR = 'TYPE_ERROR',
  LOGIC_ERROR = 'LOGIC_ERROR',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  CODE_QUALITY = 'CODE_QUALITY',
  MISSING_IMPLEMENTATION = 'MISSING_IMPLEMENTATION',
  TEST_FAILURE = 'TEST_FAILURE',
  DOCUMENTATION = 'DOCUMENTATION',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Status of a refinement task
 */
export enum RefinementTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED'
}

/**
 * Individual issue found by the Critic
 */
export interface CriticIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestedFix?: string;
  context?: string;
}

/**
 * Report from the adversarial review (Critic)
 */
export interface CriticReport {
  sessionId: string;
  timestamp: string;
  overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  issues: CriticIssue[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<IssueCategory, number>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * A corrective task generated from a CriticIssue
 */
export interface RefinementTask {
  id: string;
  sourceIssueId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  description: string;
  file?: string;
  line?: number;
  suggestedFix: string;
  status: RefinementTaskStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
}

/**
 * Result of applying refinements
 */
export interface RefinementStatus {
  success: boolean;
  totalTasks: number;
  completed: number;
  failed: number;
  skipped: number;
  tasks: RefinementTask[];
  executionTimeMs: number;
  errors: string[];
}

/**
 * Configuration for the RefinerManager
 */
export interface RefinerConfig {
  maxAttemptsPerTask: number;
  autoApply: boolean;
  createBackup: boolean;
  backupDir: string;
  parallelExecution: boolean;
}

/**
 * Default configuration for the RefinerManager
 */
const DEFAULT_CONFIG: RefinerConfig = {
  maxAttemptsPerTask: 3,
  autoApply: false, // Prepare refinements but don't auto-apply by default
  createBackup: true,
  backupDir: '.vibe-flow/backups',
  parallelExecution: false
};

/**
 * RefinerManager - Orchestrates code correction from Critic reports
 *
 * This is the Self-Healing mechanism that:
 * 1. Receives adversarial review reports from the Critic
 * 2. Transforms issues into corrective tasks
 * 3. Prepares refinements for re-execution by the main engine
 */
export class RefinerManager {
  private config: RefinerConfig;
  private tasks: Map<string, RefinementTask> = new Map();
  private history: RefinementStatus[] = [];

  constructor(config: Partial<RefinerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse a Critic report and transform it into refinement tasks
   */
  parseCriticReport(criticReport: CriticReport): RefinementTask[] {
    const tasks: RefinementTask[] = [];

    for (const issue of criticReport.issues) {
      const task: RefinementTask = {
        id: `refinement-${issue.id}-${Date.now()}`,
        sourceIssueId: issue.id,
        category: issue.category,
        severity: issue.severity,
        description: issue.message,
        file: issue.file,
        line: issue.line,
        suggestedFix: issue.suggestedFix || this.generateDefaultFix(issue),
        status: RefinementTaskStatus.PENDING,
        attempts: 0,
        maxAttempts: this.config.maxAttemptsPerTask
      };

      tasks.push(task);
      this.tasks.set(task.id, task);
    }

    return tasks;
  }

  /**
   * Generate a default fix based on issue category
   */
  private generateDefaultFix(issue: CriticIssue): string {
    switch (issue.category) {
      case IssueCategory.SYNTAX_ERROR:
        return `Fix syntax error in ${issue.file || 'the file'}${issue.line ? ` at line ${issue.line}` : ''}`;
      case IssueCategory.TYPE_ERROR:
        return `Fix type error: ${issue.message}`;
      case IssueCategory.LOGIC_ERROR:
        return `Fix logic error: ${issue.message}`;
      case IssueCategory.SECURITY:
        return `Address security issue: ${issue.message}`;
      case IssueCategory.PERFORMANCE:
        return `Optimize performance: ${issue.message}`;
      case IssueCategory.CODE_QUALITY:
        return `Improve code quality: ${issue.message}`;
      case IssueCategory.MISSING_IMPLEMENTATION:
        return `Implement missing feature: ${issue.message}`;
      case IssueCategory.TEST_FAILURE:
        return `Fix failing test: ${issue.message}`;
      case IssueCategory.DOCUMENTATION:
        return `Update documentation: ${issue.message}`;
      default:
        return `Address issue: ${issue.message}`;
    }
  }

  /**
   * Apply refinements to source files based on Critic report
   *
   * @param criticReport The adversarial review report from Critic
   * @param sourceFiles List of source files to refine
   * @returns RefinementStatus with results
   */
  async applyRefinements(
    criticReport: CriticReport,
    sourceFiles: string[]
  ): Promise<RefinementStatus> {
    const startTime = Date.now();
    const errors: string[] = [];
    const tasks = this.parseCriticReport(criticReport);

    let completed = 0;
    let failed = 0;
    let skipped = 0;

    // Ensure backup directory exists
    if (this.config.createBackup) {
      await this.ensureBackupDir();
    }

    // Filter tasks to only include files in sourceFiles
    const relevantTasks = tasks.filter(task =>
      !task.file || sourceFiles.some(f => task.file!.endsWith(f) || f.endsWith(task.file!))
    );

    // Process tasks
    for (const task of relevantTasks) {
      try {
        task.status = RefinementTaskStatus.IN_PROGRESS;
        task.attempts++;

        // If autoApply is enabled, attempt to apply the fix
        if (this.config.autoApply && task.file) {
          await this.applyTaskFix(task);
          task.status = RefinementTaskStatus.COMPLETED;
          completed++;
        } else {
          // Just mark as completed (prepared for re-execution)
          task.status = RefinementTaskStatus.COMPLETED;
          completed++;
        }
      } catch (error) {
        task.status = RefinementTaskStatus.FAILED;
        task.error = error instanceof Error ? error.message : String(error);
        errors.push(`Task ${task.id} failed: ${task.error}`);

        if (task.attempts < task.maxAttempts) {
          // Could implement retry logic here
          task.status = RefinementTaskStatus.PENDING;
        } else {
          failed++;
        }
      }
    }

    // Count skipped (tasks with no applicable file)
    skipped = tasks.length - relevantTasks.length;

    const executionTimeMs = Date.now() - startTime;

    const status: RefinementStatus = {
      success: failed === 0 && skipped < tasks.length,
      totalTasks: tasks.length,
      completed,
      failed,
      skipped,
      tasks: Array.from(this.tasks.values()),
      executionTimeMs,
      errors
    };

    this.history.push(status);
    return status;
  }

  /**
   * Apply a single task's fix to the file
   */
  private async applyTaskFix(task: RefinementTask): Promise<void> {
    if (!task.file) {
      throw new Error('Cannot apply fix: no file specified');
    }

    const filePath = path.resolve(task.file);

    // Create backup if enabled
    if (this.config.createBackup) {
      await this.createBackup(filePath);
    }

    // Read current content
    const content = await fs.readFile(filePath, 'utf-8');

    // For now, we prepare the fix but don't auto-apply
    // The main engine will handle the actual fix application
    // This is a placeholder for more sophisticated fix application

    // Log the prepared fix
    console.log(`[Refiner] Prepared fix for ${task.file}: ${task.suggestedFix}`);
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
  }

  /**
   * Create a backup of a file before modification
   */
  private async createBackup(filePath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(filePath);
    const backupPath = path.join(this.config.backupDir, `${fileName}.${timestamp}.bak`);

    try {
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      console.warn(`[Refiner] Failed to create backup for ${filePath}:`, error);
    }
  }

  /**
   * Get all pending refinement tasks
   */
  getPendingTasks(): RefinementTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === RefinementTaskStatus.PENDING
    );
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: RefinementTaskStatus): RefinementTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === status
    );
  }

  /**
   * Get all tasks
   */
  getAllTasks(): RefinementTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get refinement history
   */
  getHistory(): RefinementStatus[] {
    return [...this.history];
  }

  /**
   * Get tasks prepared for re-execution by the main engine
   */
  getReexecutionPayload(): RefinementTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === RefinementTaskStatus.COMPLETED &&
              task.sourceIssueId // Has a source issue
    );
  }

  /**
   * Clear all tasks
   */
  clearTasks(): void {
    this.tasks.clear();
  }

  /**
   * Get summary of current refinement state
   */
  getSummary(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    byCategory: Record<IssueCategory, number>;
    bySeverity: Record<IssueSeverity, number>;
  } {
    const tasks = Array.from(this.tasks.values());

    const byCategory: Record<IssueCategory, number> = {} as Record<IssueCategory, number>;
    const bySeverity: Record<IssueSeverity, number> = {} as Record<IssueSeverity, number>;

    for (const task of tasks) {
      byCategory[task.category] = (byCategory[task.category] || 0) + 1;
      bySeverity[task.severity] = (bySeverity[task.severity] || 0) + 1;
    }

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === RefinementTaskStatus.PENDING).length,
      inProgress: tasks.filter(t => t.status === RefinementTaskStatus.IN_PROGRESS).length,
      completed: tasks.filter(t => t.status === RefinementTaskStatus.COMPLETED).length,
      failed: tasks.filter(t => t.status === RefinementTaskStatus.FAILED).length,
      byCategory,
      bySeverity
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RefinerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RefinerConfig {
    return { ...this.config };
  }
}

/**
 * Utility function to create a RefinerManager with default settings
 */
export function createRefinerManager(config?: Partial<RefinerConfig>): RefinerManager {
  return new RefinerManager(config);
}

/**
 * Utility to check if a CriticReport has actionable issues
 */
export function hasActionableIssues(criticReport: CriticReport): boolean {
  return criticReport.issues.some(
    issue => issue.severity === IssueSeverity.CRITICAL ||
             issue.severity === IssueSeverity.HIGH
  );
}

/**
 * Utility to filter issues by severity threshold
 */
export function filterIssuesBySeverity(
  criticReport: CriticReport,
  threshold: IssueSeverity
): CriticIssue[] {
  const severityOrder = [IssueSeverity.LOW, IssueSeverity.MEDIUM, IssueSeverity.HIGH, IssueSeverity.CRITICAL];
  const thresholdIndex = severityOrder.indexOf(threshold);

  return criticReport.issues.filter(issue => {
    const issueIndex = severityOrder.indexOf(issue.severity);
    return issueIndex >= thresholdIndex;
  });
}
