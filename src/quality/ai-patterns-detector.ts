// AI Code Patterns Detector - Detect common AI-generated code issues
// Story 7.4: Custom Quality Rules for AI Code

import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { AIQualityIssue } from './types.js';

// Patterns common in AI-generated code that should be flagged
const AI_PATTERNS: Array<{
  pattern: RegExp;
  type: AIQualityIssue['type'];
  severity: AIQualityIssue['severity'];
  message: string;
  suggestion: string;
}> = [
  // Excessive comments that explain obvious code
  {
    pattern: /\/\/.*(?:This function|This method|This class|This variable|does|performs|performs the)/gi,
    type: 'comment',
    severity: 'low',
    message: 'Overly explanatory comment - code should be self-documenting',
    suggestion: 'Remove redundant comments or make them more concise'
  },
  // TODO followed by vague description
  {
    pattern: /\/\/\s*TODO\s*[:|-]?\s*(?:implement|add|create|fix)\s*$/gim,
    type: 'comment',
    severity: 'medium',
    message: 'Vague TODO without specific implementation details',
    suggestion: 'Add specific details about what needs to be implemented'
  },
  // Boilerplate-heavy code with many empty lines
  {
    pattern: /\{\s*\n\s*\n\s*\n\s*\}/g,
    type: 'structure',
    severity: 'low',
    message: 'Empty function or block with excessive whitespace',
    suggestion: 'Remove unnecessary empty lines'
  },
  // Generic variable names
  {
    pattern: /(?:const|let|var)\s+(?:data|result|value|item|obj|dataObj|responseData)\s*=/gi,
    type: 'naming',
    severity: 'medium',
    message: 'Generic variable name that doesn\'t describe the content',
    suggestion: 'Use more descriptive variable names that reflect the data'
  },
  // Overly complex one-liners
  {
    pattern: /^.+\..+\..+\..+\..+\..+\(.+\).+$/g,
    type: 'structure',
    severity: 'medium',
    message: 'Overly chained expression - consider breaking into steps',
    suggestion: 'Break complex chains into intermediate variables for readability'
  },
  // Magic strings that should be constants
  {
    pattern: /(?:status|state|type|role|permission)\s*[=:]\s*["'](?:active|inactive|pending|admin|user|guest)["']/gi,
    type: 'naming',
    severity: 'low',
    message: 'String literal that could be an enum or constant',
    suggestion: 'Define as an enum or constant for type safety'
  },
  // Duplicate code blocks - similar structure
  // Note: Backreference regex - simplified pattern for TS compatibility
  {
    pattern: /(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{/g,
    type: 'duplication',
    severity: 'high',
    message: 'Potential code duplication detected',
    suggestion: 'Extract duplicated logic into a reusable function'
  },
  // Inconsistent naming (camelCase vs snake_case)
  {
    pattern: /(?:const|let|var|function)\s+[a-z]+[A-Z][a-z]+\s*[=:]/g,
    type: 'naming',
    severity: 'medium',
    message: 'Inconsistent naming - mix of camelCase and other styles',
    suggestion: 'Stick to consistent naming convention (camelCase recommended)'
  },
  // Missing error handling
  {
    pattern: /(?:fetch|axios|request|http)\s*\([^)]*\)\s*\.then\s*\(\s*(?!\s*(?:error|catch))/g,
    type: 'structure',
    severity: 'high',
    message: 'Async call without explicit error handling',
    suggestion: 'Add .catch() or try/catch for error handling'
  },
  // Hardcoded URLs in code
  {
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"')]+/g,
    type: 'structure',
    severity: 'low',
    message: 'Hardcoded URL found',
    suggestion: 'Move URLs to environment variables or configuration'
  },
  // Console.log left in code
  {
    pattern: /console\.(log|debug|info)\s*\([^)]*(?:\+|req\.|res\.|request\.|response\.)/g,
    type: 'structure',
    severity: 'medium',
    message: 'Console statement with request/response data - potential data leak',
    suggestion: 'Remove console statements or use secure logging'
  },
  // Function with too many parameters
  {
    pattern: /function\s+\w+\s*\([^,]{30,}(?:,[^,]{30,}){5,}\)/g,
    type: 'structure',
    severity: 'medium',
    message: 'Function has many parameters',
    suggestion: 'Consider using an options object instead'
  }
];

const SCANNABLE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rb', '.php'];

export class AICodePatternsDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async detect(): Promise<AIQualityIssue[]> {
    const issues: AIQualityIssue[] = [];
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

    return issues;
  }

  private async findSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'vendor'];

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

  private scanFile(filePath: string, content: string): AIQualityIssue[] {
    const issues: AIQualityIssue[] = [];
    const lines = content.split('\n');

    for (const rule of AI_PATTERNS) {
      let match;
      rule.pattern.lastIndex = 0;

      while ((match = rule.pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const code = lines[lineNumber - 1]?.trim() || '';

        // Avoid duplicates
        const isDuplicate = issues.some(i =>
          i.file === filePath &&
          i.line === lineNumber &&
          i.type === rule.type
        );

        if (!isDuplicate) {
          issues.push({
            id: `ai-issue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: rule.type,
            severity: rule.severity,
            message: rule.message,
            file: filePath,
            line: lineNumber,
            code,
            suggestion: rule.suggestion
          });
        }
      }
    }

    return issues;
  }
}
