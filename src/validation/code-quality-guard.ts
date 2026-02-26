// Code Quality Guardrails - Story 7.3: Apply quality checks to AI-generated code
// AC: Dado código gerado, Quando Quality Gate executa,
//     Então aplica ESLint rules, aplica Prettier formatting,
//     detecta code smells, sugere auto-fixes quando possível
//     E executa validação estática leve com tsc para detectar erros de sintaxe graves

import { promises as fs } from 'fs';
import { join, extname, dirname } from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export enum QualityLevel {
  PERFECT = 'perfect',
  GOOD = 'good',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface QualityIssue {
  id: string;
  type: 'lint' | 'format' | 'smell' | 'security' | 'performance';
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line?: number;
  column?: number;
  rule?: string;
  autoFixable: boolean;
  suggestion?: string;
}

export interface QualityResult {
  timestamp: string;
  projectPath: string;
  filesScanned: number;
  issues: QualityIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    autoFixable: number;
  };
  qualityScore: number; // 0-100
  level: QualityLevel;
  suggestions: string[];
}

export interface QualityOptions {
  projectPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  checkFormatting?: boolean;
  checkLinting?: boolean;
  checkSmells?: boolean;
  autoFix?: boolean;
  severityThreshold?: 'error' | 'warning' | 'info';
}

const DEFAULT_EXCLUDE = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage'
];

const CODE_SMELL_PATTERNS = [
  {
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}\}/g,
    type: 'smell' as const,
    severity: 'warning' as const,
    message: 'Function too long (>500 chars). Consider breaking into smaller functions.',
    suggestion: 'Extract logical sections into helper functions'
  },
  {
    pattern: /if\s*\([^)]+\)\s*\{[\s\S]*?if\s*\([^)]+\)/g,
    type: 'smell' as const,
    severity: 'warning' as const,
    message: 'Nested if statements detected. Consider refactoring.',
    suggestion: 'Use early returns or extract conditions'
  },
  {
    pattern: /var\s+\w+\s*=\s*[^;]+;\s*var\s+\w+\s*=\s*[^;]+;/g,
    type: 'smell' as const,
    severity: 'info' as const,
    message: 'Multiple var declarations. Consider using const/let.',
    suggestion: 'Use const by default, let for reassignment'
  },
  {
    pattern: /console\.(log|debug|info)\s*\(/g,
    type: 'smell' as const,
    severity: 'info' as const,
    message: 'Console statement found. Consider removing for production.',
    suggestion: 'Use a proper logging library or remove debug statements'
  },
  {
    pattern: /TODO|FIXME|HACK|XXX|BUG:/g,
    type: 'smell' as const,
    severity: 'info' as const,
    message: 'TODO/FIXME comment found.',
    suggestion: 'Address this comment or create a tracking issue'
  },
  {
    pattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/g,
    type: 'smell' as const,
    severity: 'warning' as const,
    message: 'Empty catch block. Errors are being silently ignored.',
    suggestion: 'Add error handling or logging in catch block'
  },
  {
    pattern: /==(?!=)/g,
    type: 'lint' as const,
    severity: 'warning' as const,
    message: 'Using == instead of ===. Prefer strict equality.',
    suggestion: 'Use === for comparison'
  },
  {
    pattern: /new\s+Array\s*\(/g,
    type: 'smell' as const,
    severity: 'info' as const,
    message: 'Using Array constructor. Prefer array literal notation.',
    suggestion: 'Use [] instead of new Array()'
  },
  {
    pattern: /typeof\s+\w+\s*==\s*['"]function['"]/g,
    type: 'smell' as const,
    severity: 'warning' as const,
    message: 'Using typeof for function check. Consider a different approach.',
    suggestion: 'Use instanceof Function or check callable property'
  },
  {
    pattern: /\.\s*slice\s*\(\s*\)\s*\)/g,
    type: 'performance' as const,
    severity: 'info' as const,
    message: 'Array.prototype.slice() called on array-like object.',
    suggestion: 'Consider using Array.from() or spread operator [...]'
  }
];

const FORMATTING_PATTERNS = [
  {
    pattern: /\t/g,
    severity: 'error' as const,
    message: 'Tab character found. Use spaces for indentation.',
    suggestion: 'Replace tabs with 2 or 4 spaces'
  },
  {
    pattern: /;\s*$/gm,
    severity: 'info' as const,
    message: 'Semicolon at end of line.',
    suggestion: 'Consistent with project style (optional)'
  },
  {
    pattern: /\{[\s\n\r]*\}/g,
    severity: 'warning' as const,
    message: 'Empty block statement.',
    suggestion: 'Add comment explaining why block is empty or remove'
  },
  {
    pattern: /\s+$/gm,
    severity: 'info' as const,
    message: 'Trailing whitespace found.',
    suggestion: 'Remove trailing whitespace'
  }
];

/**
 * Story 7.3: Code Quality Guardrails
 *
 * Applies quality checks to code including:
 * - Linting rules
 * - Formatting checks
 * - Code smell detection
 * - Auto-fix suggestions
 */
export class CodeQualityGuard {
  private options: Required<QualityOptions>;

  constructor(options: QualityOptions) {
    this.options = {
      projectPath: options.projectPath,
      includePatterns: options.includePatterns ?? ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      excludePatterns: options.excludePatterns ?? DEFAULT_EXCLUDE,
      checkFormatting: options.checkFormatting ?? true,
      checkLinting: options.checkLinting ?? true,
      checkSmells: options.checkSmells ?? true,
      autoFix: options.autoFix ?? false,
      severityThreshold: options.severityThreshold ?? 'info'
    };
  }

  /**
   * Run quality checks on the project
   */
  async check(): Promise<QualityResult> {
    const issues: QualityIssue[] = [];
    let filesScanned = 0;

    // Find all scannable files
    const files = await this.findScannableFiles(this.options.projectPath);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileIssues = this.checkFile(file, content);
        issues.push(...fileIssues);
        filesScanned++;
      } catch (error) {
        // Skip files that can't be read
      }
    }

    // Apply auto-fixes if enabled
    if (this.options.autoFix && issues.some(i => i.autoFixable)) {
      await this.applyAutoFixes(issues);
    }

    const summary = this.calculateSummary(issues);
    const qualityScore = this.calculateQualityScore(summary);
    const level = this.determineLevel(qualityScore);
    const suggestions = this.generateSuggestions(issues, summary);

    return {
      timestamp: new Date().toISOString(),
      projectPath: this.options.projectPath,
      filesScanned,
      issues,
      summary,
      qualityScore,
      level,
      suggestions
    };
  }

  /**
   * Find all files that should be checked
   */
  private async findScannableFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'];

    async function walk(currentDir: string, excludePatterns: string[]): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);

          // Check exclusion patterns
          if (excludePatterns.some(pattern =>
            fullPath.includes(pattern) || entry.name === pattern
          )) {
            continue;
          }

          if (entry.isDirectory()) {
            await walk(fullPath, excludePatterns);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    }

    await walk(dir, this.options.excludePatterns);
    return files;
  }

  /**
   * Check a single file for quality issues
   */
  private checkFile(filePath: string, content: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const lines = content.split('\n');

    // Check formatting
    if (this.options.checkFormatting) {
      for (const rule of FORMATTING_PATTERNS) {
        let match;
        rule.pattern.lastIndex = 0;

        while ((match = rule.pattern.exec(content)) !== null) {
          const lineNumber = this.findLineNumber(content, match.index);
          issues.push({
            id: `fmt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'format',
            severity: rule.severity,
            message: rule.message,
            file: filePath,
            line: lineNumber,
            autoFixable: true,
            suggestion: rule.suggestion
          });
        }
      }
    }

    // Check code smells
    if (this.options.checkSmells) {
      for (const rule of CODE_SMELL_PATTERNS) {
        let match;
        rule.pattern.lastIndex = 0;

        while ((match = rule.pattern.exec(content)) !== null) {
          const lineNumber = this.findLineNumber(content, match.index);

          // Skip if below severity threshold
          if (!this.meetsThreshold(rule.severity)) {
            continue;
          }

          issues.push({
            id: `smell-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: rule.type,
            severity: rule.severity,
            message: rule.message,
            file: filePath,
            line: lineNumber,
            autoFixable: false,
            suggestion: rule.suggestion
          });
        }
      }
    }

    // Check for common TypeScript-specific issues
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      issues.push(...this.checkTypeScript(content, filePath));
    }

    return issues;
  }

  /**
   * TypeScript-specific checks
   */
  private checkTypeScript(content: string, filePath: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check for any type
    const anyTypePattern = /:\s*any\b/g;
    let match;
    while ((match = anyTypePattern.exec(content)) !== null) {
      const lineNumber = this.findLineNumber(content, match.index);
      issues.push({
        id: `ts-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'lint',
        severity: 'warning',
        message: 'Using "any" type. Consider using a more specific type.',
        file: filePath,
        line: lineNumber,
        rule: '@typescript-eslint/no-explicit-any',
        autoFixable: false,
        suggestion: 'Define a proper type or use unknown'
      });
    }

    // Check for @ts-ignore
    const tsIgnorePattern = /@ts-ignore/g;
    while ((match = tsIgnorePattern.exec(content)) !== null) {
      const lineNumber = this.findLineNumber(content, match.index);
      issues.push({
        id: `ts-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'lint',
        severity: 'warning',
        message: '@ts-ignore found. Consider fixing the underlying issue.',
        file: filePath,
        line: lineNumber,
        rule: '@typescript-eslint/ban-ts-comment',
        autoFixable: false,
        suggestion: 'Fix the TypeScript error or use @ts-expect-error'
      });
    }

    return issues;
  }

  /**
   * Find line number from character index
   */
  private findLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  /**
   * Calculate issue summary
   */
  private calculateSummary(issues: QualityIssue[]) {
    return {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
      autoFixable: issues.filter(i => i.autoFixable).length
    };
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateQualityScore(summary: QualityResult['summary']): number {
    // Start with 100 and deduct points
    let score = 100;

    // Deduct for errors
    score -= summary.errors * 10;

    // Deduct for warnings
    score -= summary.warnings * 3;

    // Deduct for info
    score -= summary.info * 0.5;

    return Math.max(0, Math.round(score));
  }

  /**
   * Determine quality level
   */
  private determineLevel(score: number): QualityLevel {
    if (score >= 95) return QualityLevel.PERFECT;
    if (score >= 80) return QualityLevel.GOOD;
    if (score >= 60) return QualityLevel.WARNING;
    return QualityLevel.ERROR;
  }

  /**
   * Generate suggestions based on issues
   */
  private generateSuggestions(issues: QualityIssue[], summary: QualityResult['summary']): string[] {
    const suggestions: string[] = [];

    if (summary.errors > 0) {
      suggestions.push(`Fix ${summary.errors} error(s) before proceeding`);
    }

    if (summary.autoFixable > 0) {
      suggestions.push(`Run with --auto-fix to automatically fix ${summary.autoFixable} issue(s)`);
    }

    if (issues.some(i => i.type === 'smell')) {
      suggestions.push('Review code smell warnings for maintainability improvements');
    }

    if (summary.warnings > 10) {
      suggestions.push('Consider addressing warnings to improve code quality');
    }

    if (suggestions.length === 0) {
      suggestions.push('Code quality is excellent! No issues found.');
    }

    return suggestions;
  }

  /**
   * Apply auto-fixes to files
   */
  private async applyAutoFixes(issues: QualityIssue[]): Promise<void> {
    const fixableIssues = issues.filter(i => i.autoFixable);

    // Group by file
    const byFile = new Map<string, QualityIssue[]>();
    for (const issue of fixableIssues) {
      const existing = byFile.get(issue.file) || [];
      existing.push(issue);
      byFile.set(issue.file, existing);
    }

    // Apply fixes file by file
    for (const [filePath, fileIssues] of byFile) {
      try {
        let content = await fs.readFile(filePath, 'utf-8');

        for (const issue of fileIssues) {
          // Simple fixes that can be applied
          if (issue.message.includes('Tab character')) {
            content = content.replace(/\t/g, '  ');
          }

          if (issue.message.includes('Trailing whitespace')) {
            content = content.replace(/[ \t]+$/gm, '');
          }

          if (issue.message.includes('Semicolon at end')) {
            // Don't auto-fix semicolons as it's style preference
          }

          if (issue.message.includes('Empty block')) {
            // Don't auto-fix empty blocks
          }
        }

        await fs.writeFile(filePath, content);
      } catch (error) {
        console.error(`[CodeQuality] Could not fix file ${filePath}:`, error);
      }
    }
  }

  /**
   * Check if severity meets threshold
   */
  private meetsThreshold(severity: 'error' | 'warning' | 'info'): boolean {
    const levels = ['error', 'warning', 'info'];
    const thresholdIndex = levels.indexOf(this.options.severityThreshold);
    const severityIndex = levels.indexOf(severity);
    return severityIndex <= thresholdIndex;
  }
}

/**
 * Convenience function to run quality checks
 */
export async function runQualityCheck(
  projectPath: string,
  options?: Partial<QualityOptions>
): Promise<QualityResult> {
  const guard = new CodeQualityGuard({
    projectPath,
    ...options
  });

  return guard.check();
}
