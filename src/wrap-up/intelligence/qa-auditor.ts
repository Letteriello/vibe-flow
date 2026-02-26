// QA Auditor - Pre-seal quality checks for session wrap-up
import { promises as fs } from 'fs';
import { join } from 'path';

export interface QAAlert {
  type: 'console_log' | 'unfinished_todo' | 'stale_documentation';
  severity: 'warning' | 'error';
  file: string;
  line?: number;
  message: string;
}

export interface QAReport {
  workspacePath: string;
  timestamp: string;
  changedFiles: string[];
  alerts: QAAlert[];
  summary: {
    totalAlerts: number;
    consoleLogCount: number;
    unfinishedTodoCount: number;
    staleDocCount: number;
    passed: boolean;
  };
}

export class FinalQAAuditor {
  private static readonly CONSOLE_PATTERNS = [
    /console\.(log|debug|info|warn|error)\s*\(/gi,
    /console\.table\s*\(/gi,
    /debugger;\s*$/gm,
  ];

  private static readonly TODO_PATTERNS = [
    /\/\/\s*TODO(?!\s*\([\s\d-]+\):)/gi,
    /\/\*\s*TODO(?!\s*\([\s\d-]+\):)\s*\*\//gi,
    /#\s*TODO(?!\s*\([\s\d-]+\):)/gi,
    /\bFIXME\b/gi,
    /\bXXX\b/gi,
    /\bHACK\b/gi,
  ];

  private static readonly DOC_PATTERNS = [
    /\.md$/i,
    /\.mdx$/i,
    /readme/i,
    /changelog/i,
    /history/i,
  ];

  private static readonly CODE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb', '.php',
  ];

  async runPreSealAudit(workspacePath: string, changedFiles: string[]): Promise<QAReport> {
    const alerts: QAAlert[] = [];
    let consoleLogCount = 0;
    let unfinishedTodoCount = 0;
    let staleDocCount = 0;

    for (const file of changedFiles) {
      const filePath = join(workspacePath, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const isCode = FinalQAAuditor.CODE_EXTENSIONS.some(ext => file.endsWith(ext));
        const isDoc = FinalQAAuditor.DOC_PATTERNS.some(pattern => pattern.test(file));

        // Check for residual console.logs in code files
        if (isCode) {
          const consoleAlerts = this.detectConsoleLogs(content, file);
          alerts.push(...consoleAlerts);
          consoleLogCount += consoleAlerts.length;

          // Check for unfinished TODOs
          const todoAlerts = this.detectUnfinishedTodos(content, file);
          alerts.push(...todoAlerts);
          unfinishedTodoCount += todoAlerts.length;
        }

        // Check for potentially stale documentation
        if (isDoc) {
          const docAlerts = this.checkDocumentationFreshness(content, file);
          alerts.push(...docAlerts);
          staleDocCount += docAlerts.length;
        }
      } catch {
        // File might not exist or be unreadable, skip
      }
    }

    const report: QAReport = {
      workspacePath,
      timestamp: new Date().toISOString(),
      changedFiles,
      alerts,
      summary: {
        totalAlerts: alerts.length,
        consoleLogCount,
        unfinishedTodoCount,
        staleDocCount,
        passed: alerts.filter(a => a.severity === 'error').length === 0,
      },
    };

    return report;
  }

  private detectConsoleLogs(content: string, file: string): QAAlert[] {
    const alerts: QAAlert[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip lines that are clearly debugging that should be kept (e.g., in test files)
      const isTestFile = file.includes('.test.') || file.includes('.spec.');

      for (const pattern of FinalQAAuditor.CONSOLE_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(line)) {
          // In test files, only flag console.log in production code
          if (isTestFile && line.includes('describe') || line.includes('it(') || line.includes('test(')) {
            continue;
          }

          alerts.push({
            type: 'console_log',
            severity: 'warning',
            file,
            line: lineNumber,
            message: `Residual console statement found: "${line.trim().substring(0, 50)}..."`,
          });
        }
      }

      // Check for debugger statements
      if (line.trim() === 'debugger') {
        alerts.push({
          type: 'console_log',
          severity: 'error',
          file,
          line: lineNumber,
          message: 'debugger statement found - should be removed before sealing',
        });
      }
    }

    return alerts;
  }

  private detectUnfinishedTodos(content: string, file: string): QAAlert[] {
    const alerts: QAAlert[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const pattern of FinalQAAuditor.TODO_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(line)) {
          // Check if TODO has a date or is marked as completed (e.g., TODO(2024-01-01): or TODO: done)
          const hasDate = /\(\d{4}-\d{2}-\d{2}\)/.test(line);
          const isCompleted = /done|completed|finished|resolved/i.test(line);

          if (!hasDate && !isCompleted) {
            alerts.push({
              type: 'unfinished_todo',
              severity: 'warning',
              file,
              line: lineNumber,
              message: `Unfinished TODO/FIXME: "${line.trim().substring(0, 50)}"`,
            });
          }
        }
      }
    }

    return alerts;
  }

  private checkDocumentationFreshness(content: string, file: string): QAAlert[] {
    const alerts: QAAlert[] = [];

    // Check for outdated version references
    const outdatedPatterns = [
      { pattern: /v\d+\.\d+\.\d+/g, name: 'version numbers' },
      { pattern: /\d{4}-\d{2}/g, name: 'dates (check if still relevant)' },
      { pattern: /deprecated/gi, name: 'deprecated markers' },
      { pattern: /outdated/gi, name: 'outdated markers' },
    ];

    for (const { pattern, name } of outdatedPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Only flag if the documentation doesn't have recent updates mentioned
        const hasRecentMarker = /updated?\s*:?\s*\d{4}/i.test(content) ||
                                /recent|latest|current/i.test(content);

        if (!hasRecentMarker) {
          alerts.push({
            type: 'stale_documentation',
            severity: 'warning',
            file,
            message: `Potentially stale documentation - contains ${name} without recent update markers`,
          });
          break; // Only one doc warning per file
        }
      }
    }

    // Check for TODO in documentation
    if (/TODO|FIXME|XXX/i.test(content)) {
      alerts.push({
        type: 'stale_documentation',
        severity: 'warning',
        file,
        message: 'Documentation contains unfinished markers (TODO/FIXME)',
      });
    }

    return alerts;
  }
}
