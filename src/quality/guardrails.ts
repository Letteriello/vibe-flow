// Guardrails - ESLint/Prettier wrapper for programmatic code validation
// Story 7.2: AI Code Validation Guardrails

import { Linter } from 'eslint';
import * as prettier from 'prettier';
import type { QualityIssue } from './types.js';

export interface GuardrailsConfig {
  /**
   * Maximum line length (default: 100)
   */
  maxLineLength?: number;

  /**
   * Maximum cyclomatic complexity allowed (default: 10)
   */
  maxComplexity?: number;

  /**
   * Maximum function length in lines (default: 30)
   * Functions exceeding this will be flagged
   */
  maxFunctionLength?: number;

  /**
   * Whether to run ESLint (default: true)
   */
  runESLint?: boolean;

  /**
   * Whether to run Prettier check (default: true)
   */
  runPrettier?: boolean;

  /**
   * Custom ESLint rules to override defaults
   */
  customESLintRules?: Record<string, 'error' | 'warn' | 'off'>;
}

export interface GuardrailsResult {
  passed: boolean;
  issues: QualityIssue[];
  formattedCode?: string;
  errors: number;
  warnings: number;
}

/**
 * Default ESLint configuration for JavaScript
 * Note: For TypeScript, use the Linter class for better AST analysis
 */
const DEFAULT_ESLINT_CONFIG: Linter.Config = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true
      }
    }
  },
  rules: {
    // Error rules
    'no-debugger': 'error',
    'no-unused-vars': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-inner-declarations': 'error',

    // Warning rules
    'no-console': 'warn',
    'no-alert': 'warn',
    'no-eval': 'warn',
    'prefer-template': 'warn',
    'no-multiple-empty-lines': 'warn',
    'no-trailing-spaces': 'warn',
    'eol-last': 'warn',

    // Complexity rules
    'max-lines-per-function': ['warn', { max: 30, skipBlankLines: true, skipComments: true }],
    'max-depth': ['warn', 3],
    'max-nested-callbacks': ['warn', 2],
    'complexity': ['warn', 10]
  }
};

/**
 * Enhanced ESLint config for AI-generated code with stricter rules
 */
const AI_STRICT_ESLINT_CONFIG: Linter.Config = {
  ...DEFAULT_ESLINT_CONFIG,
  rules: {
    ...DEFAULT_ESLINT_CONFIG.rules,
    // Stricter AI code rules
    'max-len': ['warn', { code: 100, tabWidth: 2, ignoreStrings: true, ignoreTemplateLiterals: true }],
    'no-magic-numbers': ['warn', { ignore: [0, 1, -1, 10, 100, 1000] }],
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'no-case-declarations': 'warn',
    'require-await': 'warn',
    'no-return-await': 'warn'
  }
};

export class Guardrails {
  private linter: Linter;
  private config: GuardrailsConfig;
  private eslintConfig: Linter.Config;

  constructor(config: GuardrailsConfig = {}) {
    this.linter = new Linter();
    this.config = config;

    // Build ESLint config based on custom rules
    const customRules = config.customESLintRules || {};

    this.eslintConfig = {
      ...AI_STRICT_ESLINT_CONFIG,
      rules: {
        ...AI_STRICT_ESLINT_CONFIG.rules,
        ...customRules
      }
    };

    // Define custom rules for function length detection
    this.linter.defineRule('max-function-length', {
      create(context) {
        const maxLength = config.maxFunctionLength || 30;

        return {
          FunctionDeclaration(node) {
            const functionNode = node as unknown as { body: { loc: { start: { line: number }; end: { line: number } } } };
            const lines = functionNode.body.loc.end.line - functionNode.body.loc.start.line + 1;

            if (lines > maxLength) {
              context.report({
                node,
                message: `Function has ${lines} lines, which exceeds the maximum of ${maxLength}. Consider refactoring into smaller functions.`
              });
            }
          },
          FunctionExpression(node) {
            const functionNode = node as unknown as { body: { loc: { start: { line: number }; end: { line: number } } } };
            const lines = functionNode.body.loc.end.line - functionNode.body.loc.start.line + 1;

            if (lines > maxLength) {
              context.report({
                node,
                message: `Function has ${lines} lines, which exceeds the maximum of ${maxLength}. Consider refactoring into smaller functions.`
              });
            }
          },
          ArrowFunctionExpression(node) {
            const functionNode = node as unknown as { body: { loc?: { start: { line: number }; end: { line: number } } } };
            if ('body' in functionNode.body && functionNode.body.loc) {
              const lines = functionNode.body.loc.end.line - functionNode.body.loc.start.line + 1;

              if (lines > maxLength) {
                context.report({
                  node,
                  message: `Arrow function has ${lines} lines, which exceeds the maximum of ${maxLength}. Consider refactoring into smaller functions.`
                });
              }
            }
          }
        };
      }
    });
  }

  /**
   * Validate code in memory without saving to disk
   * @param code - The code to validate
   * @param fileName - The file name for context (for error messages)
   * @returns GuardrailsResult with validation status and issues
   */
  async validateInMemory(code: string, fileName: string = 'generated.ts'): Promise<GuardrailsResult> {
    const issues: QualityIssue[] = [];
    let errors = 0;
    let warnings = 0;
    let formattedCode: string | undefined;

    // Run ESLint validation
    if (this.config.runESLint !== false) {
      const eslintIssues = this.runESLint(code, fileName);
      issues.push(...eslintIssues);
      errors += eslintIssues.filter(i => i.type === 'error').length;
      warnings += eslintIssues.filter(i => i.type === 'warning').length;
    }

    // Run Prettier check
    if (this.config.runPrettier !== false) {
      const prettierIssues = await this.runPrettierCheck(code, fileName);
      issues.push(...prettierIssues);
      // Prettier issues are treated as warnings
      warnings += prettierIssues.length;

      // Also get formatted code
      try {
        formattedCode = await this.formatWithPrettier(code);
      } catch {
        // If formatting fails, use original code
        formattedCode = code;
      }
    }

    return {
      passed: errors === 0,
      issues,
      formattedCode,
      errors,
      warnings
    };
  }

  /**
   * Validate code and block save if it fails quality gates
   * @param code - The code to validate
   * @param fileName - The file name for context
   * @returns Result with canSave flag
   */
  async validateAndBlock(code: string, fileName: string = 'generated.ts'): Promise<GuardrailsResult & { canSave: boolean }> {
    const result = await this.validateInMemory(code, fileName);

    return {
      ...result,
      canSave: result.passed
    };
  }

  /**
   * Run ESLint on code in memory
   */
  private runESLint(code: string, fileName: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    try {
      const messages = this.linter.verify(code, this.eslintConfig, {
        filename: fileName
      });

      for (const msg of messages) {
        issues.push({
          id: `eslint-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: msg.severity === 2 ? 'error' : 'warning',
          category: 'lint',
          message: msg.message,
          file: fileName,
          line: msg.line,
          column: msg.column,
          rule: msg.ruleId || undefined,
          suggestion: msg.suggestions?.[0]?.desc || undefined
        });
      }
    } catch (err) {
      // If ESLint fails to parse, report as error
      issues.push({
        id: `eslint-parse-${Date.now()}`,
        type: 'error',
        category: 'lint',
        message: `ESLint parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        file: fileName,
        rule: 'parsing'
      });
    }

    return issues;
  }

  /**
   * Run Prettier check without modifying code
   */
  private async runPrettierCheck(code: string, fileName: string): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];

    // Determine parser based on file extension
    const parser = this.getParserFromFileName(fileName);

    try {
      const isFormatted = await prettier.formatWithCursor(code, {
        parser,
        cursorOffset: 0,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5',
        printWidth: this.config.maxLineLength || 100
      });

      // If formatted code differs from original, it's not formatted
      if (isFormatted.formatted !== code) {
        issues.push({
          id: `prettier-${Date.now()}`,
          type: 'warning',
          category: 'format',
          message: 'Code is not formatted according to Prettier rules',
          file: fileName,
          suggestion: 'Run Prettier to format the code'
        });
      }
    } catch (err) {
      issues.push({
        id: `prettier-parse-${Date.now()}`,
        type: 'error',
        category: 'format',
        message: `Prettier parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        file: fileName,
        rule: 'prettier'
      });
    }

    return issues;
  }

  /**
   * Format code with Prettier
   */
  async formatWithPrettier(code: string, fileName: string = 'generated.ts'): Promise<string> {
    const parser = this.getParserFromFileName(fileName);

    return prettier.format(code, {
      parser,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'es5',
      printWidth: this.config.maxLineLength || 100
    });
  }

  /**
   * Get Prettier parser based on file extension
   */
  private getParserFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts':
      case 'mts':
      case 'cts':
        return 'typescript';
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'babel';
      case 'jsx':
        return 'babel';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'css':
        return 'css';
      case 'scss':
        return 'scss';
      case 'html':
        return 'html';
      default:
        return 'typescript'; // Default to TypeScript
    }
  }

  /**
   * Create Guardrails instance with default configuration
   */
  static createDefault(): Guardrails {
    return new Guardrails({
      maxLineLength: 100,
      maxComplexity: 10,
      maxFunctionLength: 30,
      runESLint: true,
      runPrettier: true
    });
  }

  /**
   * Create Guardrails instance with strict AI configuration
   */
  static createStrict(): Guardrails {
    return new Guardrails({
      maxLineLength: 80,
      maxComplexity: 8,
      maxFunctionLength: 20,
      runESLint: true,
      runPrettier: true,
      customESLintRules: {
        'no-console': 'error'
      }
    });
  }
}
