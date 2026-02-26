// Quality Guard - Code quality gate for linting and code smells
// Story 7.3: Code Quality Guardrails

import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { QualityIssue, QualityReport } from './types.js';

// Quality issue patterns - basic static analysis
const QUALITY_PATTERNS: Array<{
  pattern: RegExp;
  type: QualityIssue['type'];
  category: QualityIssue['category'];
  message: string;
  suggestion: string;
}> = [
  // Code smells - Console.log in production code
  {
    pattern: /console\.(log|debug|info)\s*\(/g,
    type: 'warning',
    category: 'code-smell',
    message: 'Console statement found in production code',
    suggestion: 'Use a proper logging library or remove console statements'
  },
  // Code smells - TODO without assignee
  {
    pattern: /\/\/\s*TODO\b(?!\s*\()/g,
    type: 'info',
    category: 'code-smell',
    message: 'TODO comment found',
    suggestion: 'Add a description or ticket number to the TODO'
  },
  // Code smells - FIXME comment
  {
    pattern: /\/\/\s*FIXME\b(?!\s*\()/g,
    type: 'warning',
    category: 'code-smell',
    message: 'FIXME comment found - needs to be addressed',
    suggestion: 'Fix the issue before merging'
  },
  // Code smells - Empty catch block
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    type: 'warning',
    category: 'code-smell',
    message: 'Empty catch block - errors are being silently ignored',
    suggestion: 'Add error logging or handling in catch block'
  },
  // Complexity - Nested callbacks
  {
    pattern: /\)\s*\)\s*\)\s*\)/g,
    type: 'warning',
    category: 'complexity',
    message: 'Deeply nested callbacks detected (callback hell)',
    suggestion: 'Refactor using async/await or Promises'
  },
  // Code smells - Magic numbers
  {
    pattern: /(?:timeout|delay|duration|limit|max|min|count)\s*[=:]\s*(\d{3,})/gi,
    type: 'info',
    category: 'code-smell',
    message: 'Magic number detected',
    suggestion: 'Define as a named constant for better readability'
  },
  // Code smells - Long line
  {
    pattern: /.{120,}/g,
    type: 'info',
    category: 'format',
    message: 'Line exceeds 120 characters',
    suggestion: 'Break long lines into multiple lines'
  },
  // Lint - Unused variable
  {
    pattern: /(?:const|let|var)\s+_\w+\s*=/g,
    type: 'info',
    category: 'lint',
    message: 'Variable starting with underscore is unused',
    suggestion: 'Remove unused variable or use it'
  },
  // Duplication - Repeated string
  {
    pattern: /(["'])(?:(?!\1).)*?\1.*?\{[\s\S]*?\1(?:(?!\1).)*?\1/g,
    type: 'info',
    category: 'duplication',
    message: 'Potential duplicated string detected',
    suggestion: 'Extract repeated strings into constants'
  }
];

const SCANNABLE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rb'];

export class QualityGuard {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async runQualityCheck(): Promise<QualityReport> {
    const issues: QualityIssue[] = [];
    const startTime = Date.now();

    // Find and scan all source files
    const files = await this.findSourceFiles();

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileIssues = this.scanFile(file, content);
        issues.push(...fileIssues);
      } catch {
        // Skip unreadable files
      }
    }

    const summary = this.calculateSummary(issues);
    const recommendations = this.generateRecommendations(issues);

    return {
      timestamp: new Date().toISOString(),
      projectPath: this.projectPath,
      issues,
      summary,
      passed: summary.errors === 0,
      recommendations
    };
  }

  private async findSourceFiles(): Promise<string[]> {
    const files: string[] = [];

    const excludeDirs = ['node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'vendor', 'coverage'];

    async function walk(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (excludeDirs.some(d => fullPath.includes(d) || entry.name === d)) {
            continue;
          }

          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (SCANNABLE_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    await walk(this.projectPath);
    return files;
  }

  private scanFile(filePath: string, content: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const lines = content.split('\n');

    for (const rule of QUALITY_PATTERNS) {
      let match;
      rule.pattern.lastIndex = 0;

      while ((match = rule.pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;

        // Avoid duplicates in same line
        const isDuplicate = issues.some(i =>
          i.file === filePath &&
          i.line === lineNumber &&
          i.rule === rule.category
        );

        if (!isDuplicate) {
          issues.push({
            id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: rule.type,
            category: rule.category,
            message: rule.message,
            file: filePath,
            line: lineNumber,
            rule: rule.category,
            suggestion: rule.suggestion
          });
        }
      }
    }

    // Check for long functions
    const functionMatches = content.match(/(?:function|const|let|var)\s+\w+\s*=?\s*(?:async)?\s*\([^)]*\)\s*\{/g);
    if (functionMatches) {
      for (const match of functionMatches) {
        const matchIndex = content.indexOf(match);
        const lineNumber = content.substring(0, matchIndex).split('\n').length;

        // Count braces to find function end
        let braceCount = 0;
        let functionEnd = matchIndex;
        let foundOpen = false;

        for (let i = matchIndex; i < content.length; i++) {
          if (content[i] === '{') {
            foundOpen = true;
            braceCount++;
          } else if (content[i] === '}') {
            braceCount--;
            if (foundOpen && braceCount === 0) {
              functionEnd = i;
              break;
            }
          }
        }

        const functionLines = content.substring(matchIndex, functionEnd).split('\n').length;

        if (functionLines > 50) {
          issues.push({
            id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'warning',
            category: 'complexity',
            message: `Function has ${functionLines} lines - exceeds recommended limit of 50`,
            file: filePath,
            line: lineNumber,
            suggestion: 'Consider breaking this function into smaller, more focused functions'
          });
        }
      }
    }

    return issues;
  }

  private calculateSummary(issues: QualityIssue[]): QualityReport['summary'] {
    return {
      errors: issues.filter(i => i.type === 'error').length,
      warnings: issues.filter(i => i.type === 'warning').length,
      info: issues.filter(i => i.type === 'info').length,
      score: this.calculateScore(issues)
    };
  }

  private calculateScore(issues: QualityIssue[]): number {
    if (issues.length === 0) return 10;

    let deductions = 0;
    for (const issue of issues) {
      switch (issue.type) {
        case 'error':
          deductions += 1;
          break;
        case 'warning':
          deductions += 0.3;
          break;
        case 'info':
          deductions += 0.1;
          break;
      }
    }

    return Math.max(0, Math.min(10, 10 - deductions));
  }

  private generateRecommendations(issues: QualityIssue[]): string[] {
    const recommendations: string[] = [];

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const complexityIssues = issues.filter(i => i.category === 'complexity').length;
    const duplicationIssues = issues.filter(i => i.category === 'duplication').length;

    if (errorCount > 0) {
      recommendations.push(`Fix ${errorCount} error(s) before proceeding with code generation`);
    }

    if (warningCount > 5) {
      recommendations.push(`Address ${warningCount} warnings to improve code quality`);
    }

    if (complexityIssues > 0) {
      recommendations.push('Consider refactoring complex functions for better maintainability');
    }

    if (duplicationIssues > 2) {
      recommendations.push('Extract duplicated code into reusable functions or constants');
    }

    if (recommendations.length === 0) {
      recommendations.push('Code quality looks good! Proceed with code generation.');
    }

    return recommendations;
  }
}
