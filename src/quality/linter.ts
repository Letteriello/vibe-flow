// Linter - In-memory code quality linter with complexity analysis
// Story 7.2: AI Code Validation Linter

import { extname } from 'path';
import type { QualityIssue } from './types.js';

export interface LinterConfig {
  /**
   * Maximum function length in lines (default: 30)
   * Functions exceeding this will cause validation failure
   */
  maxFunctionLength?: number;

  /**
   * Maximum cyclomatic complexity (default: 10)
   */
  maxComplexity?: number;

  /**
   * Maximum nesting depth (default: 4)
   */
  maxNestingDepth?: number;

  /**
   * Maximum lines per file (default: 500)
   */
  maxFileLines?: number;

  /**
   * Whether to fail on function length (strict mode)
   * If true, long functions cause validation failure
   * If false, they cause warnings
   */
  strictFunctionLength?: boolean;

  /**
   * File extensions to lint
   */
  extensions?: string[];
}

export interface LinterResult {
  passed: boolean;
  issues: QualityIssue[];
  canSave: boolean;
  metrics: {
    totalFunctions: number;
    avgFunctionLength: number;
    maxFunctionLength: number;
    cyclomaticComplexity: number;
    nestingDepth: number;
    totalLines: number;
  };
}

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  length: number;
  complexity: number;
  nestingDepth: number;
}

/**
 * Text-based linter for detecting complex AI-generated code
 * Uses regex patterns to analyze code structure
 */
export class Linter {
  private config: LinterConfig;
  private defaultConfig: LinterConfig = {
    maxFunctionLength: 30,
    maxComplexity: 10,
    maxNestingDepth: 4,
    maxFileLines: 500,
    strictFunctionLength: true,
    extensions: ['.ts', '.js', '.tsx', '.jsx']
  };

  constructor(config: LinterConfig = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Lint code in memory without saving to disk
   * @param code - The code to lint
   * @param fileName - The file name for context
   * @returns LinterResult with validation status and metrics
   */
  async lintInMemory(code: string, fileName: string = 'generated.ts'): Promise<LinterResult> {
    const issues: QualityIssue[] = [];

    // Extract functions from code using pattern matching
    const functions = this.extractFunctions(code);
    const metrics = this.calculateMetrics(functions, code);
    const nestingDepth = this.calculateMaxNestingDepth(code);

    // Check for complex functions (typical of AI-generated code)
    const functionLengthIssues = this.checkFunctionLengths(functions, fileName);
    issues.push(...functionLengthIssues);

    // Check cyclomatic complexity
    const complexityIssues = this.checkComplexity(functions, fileName);
    issues.push(...complexityIssues);

    // Check nesting depth
    const nestingIssues = this.checkNestingDepth(nestingDepth, fileName);
    issues.push(...nestingIssues);

    // Check file size
    const fileSizeIssues = this.checkFileSize(code, fileName);
    issues.push(...fileSizeIssues);

    // Check for AI-generated code patterns
    const aiPatternIssues = this.checkAIGeneratedPatterns(code, fileName);
    issues.push(...aiPatternIssues);

    const hasErrors = issues.some(i => i.type === 'error');
    const hasFunctionWarnings = functionLengthIssues.length > 0;

    // Determine if code can be saved
    // If strictFunctionLength is true, function length warnings become errors
    const canSave = !hasErrors && !(this.config.strictFunctionLength && hasFunctionWarnings);

    return {
      passed: !hasErrors,
      issues,
      canSave,
      metrics
    };
  }

  /**
   * Validate code and block save if it fails quality gates
   */
  async validateAndBlock(code: string, fileName: string = 'generated.ts'): Promise<LinterResult> {
    const result = await this.lintInMemory(code, fileName);
    return result;
  }

  /**
   * Extract all functions from code using regex patterns
   */
  private extractFunctions(code: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');

    // Function patterns
    const patterns = [
      // function name() {}
      /function\s+(\w+)\s*\([^)]*\)\s*\{/g,
      // const name = () => {}
      /const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      // const name = function() {}
      /const\s+(\w+)\s*=\s*(?:async\s*)?function\s*\([^)]*\)\s*\{/g,
      // let name = () => {}
      /let\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      // var name = () => {}
      /var\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      // class methods
      /(\w+)\s*\([^)]*\)\s*\{/g
    ];

    // Find all function-like patterns and calculate their length
    const functionMatches: Array<{ name: string; startIndex: number; endIndex: number }> = [];

    // Find function declarations
    let match;
    const funcDeclPattern = /(?:function|const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|\([^)]*\)\s*\{)/g;

    while ((match = funcDeclPattern.exec(code)) !== null) {
      const name = match[1];
      const startIndex = match.index;
      const endIndex = this.findFunctionEnd(code, startIndex);
      functionMatches.push({ name, startIndex, endIndex });
    }

    // Find traditional function declarations
    const tradFuncPattern = /function\s+(\w+)\s*\(/g;
    while ((match = tradFuncPattern.exec(code)) !== null) {
      const name = match[1];
      const startIndex = match.index;
      const endIndex = this.findFunctionEnd(code, startIndex);

      // Check if we already have this function
      const exists = functionMatches.some(f => f.startIndex === startIndex);
      if (!exists) {
        functionMatches.push({ name, startIndex, endIndex });
      }
    }

    // Process each function match
    for (const func of functionMatches) {
      const startLine = code.substring(0, func.startIndex).split('\n').length;
      const endLine = code.substring(0, func.endIndex).split('\n').length;
      const length = endLine - startLine + 1;

      // Calculate complexity for this function's body
      const funcBody = code.substring(func.startIndex, func.endIndex);
      const complexity = this.calculateCyclomaticComplexity(funcBody);

      // Calculate nesting depth for this function
      const nestingDepth = this.calculateMaxNestingDepth(funcBody);

      functions.push({
        name: func.name || 'anonymous',
        startLine,
        endLine,
        length,
        complexity,
        nestingDepth
      });
    }

    return functions;
  }

  /**
   * Find the end index of a function by matching braces
   */
  private findFunctionEnd(code: string, startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    let i = startIndex;

    // Find the opening brace
    while (i < code.length) {
      if (code[i] === '{') {
        foundOpen = true;
        braceCount = 1;
        i++;
        break;
      }
      i++;
    }

    if (!foundOpen) return code.length;

    // Count braces to find the matching closing brace
    while (i < code.length && braceCount > 0) {
      if (code[i] === '{') braceCount++;
      else if (code[i] === '}') braceCount--;
      i++;
    }

    return i;
  }

  /**
   * Calculate cyclomatic complexity for code snippet
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1;

    // Decision points that increase complexity
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s*\{/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?[^:]+:/g,  // ternary operator
      /&&/g,
      /\|\|/g
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateMaxNestingDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Calculate metrics from functions
   */
  private calculateMetrics(functions: FunctionInfo[], code: string): LinterResult['metrics'] {
    const lines = code.split('\n');
    const totalLines = lines.length;

    if (functions.length === 0) {
      return {
        totalFunctions: 0,
        avgFunctionLength: 0,
        maxFunctionLength: 0,
        cyclomaticComplexity: 0,
        nestingDepth: 0,
        totalLines
      };
    }

    const lengths = functions.map(f => f.length);
    const maxLength = Math.max(...lengths);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const maxComplexity = Math.max(...functions.map(f => f.complexity));
    const maxNesting = Math.max(...functions.map(f => f.nestingDepth));

    return {
      totalFunctions: functions.length,
      avgFunctionLength: Math.round(avgLength),
      maxFunctionLength: maxLength,
      cyclomaticComplexity: maxComplexity,
      nestingDepth: maxNesting,
      totalLines
    };
  }

  /**
   * Check for functions that exceed length threshold
   */
  private checkFunctionLengths(functions: FunctionInfo[], fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const maxLength = this.config.maxFunctionLength || 30;

    for (const func of functions) {
      if (func.length > maxLength) {
        const severity = this.config.strictFunctionLength ? 'error' : 'warning';

        issues.push({
          id: `func-length-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: severity as 'error' | 'warning',
          category: 'complexity',
          message: `Function "${func.name}" has ${func.length} lines, exceeding limit of ${maxLength}. This is typical of indiscriminately generated AI code.`,
          file: fileName,
          line: func.startLine,
          suggestion: `Refactor into smaller, focused functions. Break this ${func.length}-line function into multiple functions with single responsibilities.`
        });
      }
    }

    return issues;
  }

  /**
   * Check cyclomatic complexity
   */
  private checkComplexity(functions: FunctionInfo[], fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const maxComplexity = this.config.maxComplexity || 10;

    for (const func of functions) {
      if (func.complexity > maxComplexity) {
        issues.push({
          id: `complexity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: 'warning',
          category: 'complexity',
          message: `Function "${func.name}" has cyclomatic complexity of ${func.complexity}, exceeding limit of ${maxComplexity}`,
          file: fileName,
          line: func.startLine,
          suggestion: 'Simplify the function by extracting conditional logic into separate functions'
        });
      }
    }

    return issues;
  }

  /**
   * Check nesting depth
   */
  private checkNestingDepth(maxDepth: number, fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const maxNesting = this.config.maxNestingDepth || 4;

    if (maxDepth > maxNesting) {
      issues.push({
        id: `nesting-${Date.now()}`,
        type: 'warning',
        category: 'complexity',
        message: `Code has ${maxDepth} levels of nesting, exceeding limit of ${maxNesting}`,
        file: fileName,
        suggestion: 'Reduce nesting by extracting inner logic into separate functions or using early returns'
      });
    }

    return issues;
  }

  /**
   * Check file size
   */
  private checkFileSize(code: string, fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const maxLines = this.config.maxFileLines || 500;
    const lines = code.split('\n').length;

    if (lines > maxLines) {
      issues.push({
        id: `file-size-${Date.now()}`,
        type: 'warning',
        category: 'complexity',
        message: `File has ${lines} lines, exceeding limit of ${maxLines}. Consider splitting into multiple files.`,
        file: fileName,
        suggestion: 'Split large files into smaller, focused modules'
      });
    }

    return issues;
  }

  /**
   * Check for patterns typical of AI-generated code
   */
  private checkAIGeneratedPatterns(code: string, fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const lines = code.split('\n');

    // Pattern 1: Very long lines (AI tends to generate long lines)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 150) {
        issues.push({
          id: `long-line-${Date.now()}-${i}`,
          type: 'info',
          category: 'format',
          message: `Line ${i + 1} is unusually long (${lines[i].length} characters)`,
          file: fileName,
          line: i + 1,
          suggestion: 'Break long lines for better readability'
        });
      }
    }

    // Pattern 2: Many empty lines at start or end
    let emptyStart = 0;
    for (const line of lines) {
      if (line.trim() === '') emptyStart++;
      else break;
    }

    if (emptyStart > 2) {
      issues.push({
        id: `empty-start-${Date.now()}`,
        type: 'info',
        category: 'format',
        message: `File has ${emptyStart} empty lines at the start`,
        file: fileName,
        suggestion: 'Remove unnecessary empty lines at the start of the file'
      });
    }

    // Pattern 3: Check for TODO comments without detail (common in AI code)
    const todoPattern = /\/\/\s*TODO\s*$/gm;
    let match;
    while ((match = todoPattern.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      issues.push({
        id: `todo-${Date.now()}-${lineNumber}`,
        type: 'info',
        category: 'code-smell',
        message: 'TODO comment without description found',
        file: fileName,
        line: lineNumber,
        suggestion: 'Add a detailed description or ticket number to the TODO'
      });
    }

    // Pattern 4: Check for very repetitive code (common in AI-generated code)
    const repetitivePattern = /(\b\w+\b).*\1.*\1/g;
    let lineNumber = 0;
    let previousLine = '';
    let repeatCount = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === previousLine.trim() && lines[i].trim() !== '') {
        repeatCount++;
      } else {
        if (repeatCount > 2) {
          issues.push({
            id: `repeat-${Date.now()}-${i}`,
            type: 'info',
            category: 'duplication',
            message: `Found ${repeatCount} consecutive repeated lines`,
            file: fileName,
            line: i - repeatCount,
            suggestion: 'Extract repeated code into a function'
          });
        }
        repeatCount = 0;
      }
      previousLine = lines[i];
    }

    return issues;
  }

  /**
   * Check if file extension is supported
   */
  private isSupported(fileName: string): boolean {
    const ext = extname(fileName).toLowerCase();
    return (this.config.extensions || ['.ts', '.js', '.tsx', '.jsx']).includes(ext);
  }

  /**
   * Create Linter instance with default configuration
   */
  static createDefault(): Linter {
    return new Linter({
      maxFunctionLength: 30,
      maxComplexity: 10,
      maxNestingDepth: 4,
      maxFileLines: 500,
      strictFunctionLength: true
    });
  }

  /**
   * Create Linter instance with strict AI configuration
   */
  static createStrict(): Linter {
    return new Linter({
      maxFunctionLength: 20,
      maxComplexity: 8,
      maxNestingDepth: 3,
      maxFileLines: 300,
      strictFunctionLength: true
    });
  }
}
