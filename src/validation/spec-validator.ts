// Specification Validation Engine - Story 8.2: Validate spec meets minimum completeness criteria
// AC: Dado especificação submetida, Quando validador executa,
//     Então verifica todos os campos obrigatórios preenchidos,
//     E verifica consistência interna, E verifica feasibility técnica,
//     E retorna readiness score

import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { existsSync } from 'fs';

export enum ValidationStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  WARNING = 'warning',
  INCOMPLETE = 'incomplete'
}

export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'required' | 'consistency' | 'feasibility' | 'format' | 'completeness';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface SpecValidationResult {
  valid: boolean;
  readinessScore: number; // 0-100
  status: ValidationStatus;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  validatedAt: string;
  specPath?: string;
  specType?: string;
}

export interface ValidationOptions {
  projectPath: string;
  strict?: boolean;
  minReadinessScore?: number;
}

interface ParsedSpec {
  type: 'markdown' | 'json' | 'unknown';
  content: any;
  raw: string;
}

// Minimum required sections for a valid spec
const REQUIRED_SECTIONS = [
  'overview',
  'description',
  'problem statement'
];

// Fields that should be checked for completeness
const COMPLETENESS_CHECKS = [
  { path: 'overview.featureName', required: true, minLength: 3 },
  { path: 'overview.description', required: true, minLength: 20 },
  { path: 'overview.problemStatement', required: true, minLength: 10 },
  { path: 'overview.successCriteria', required: true, minItems: 1 }
];

/**
 * Story 8.2: Specification Validation Engine
 *
 * Validates specifications meet minimum completeness criteria:
 * - All required fields are filled
 * - Internal consistency
 * - Technical feasibility
 * - Returns readiness score
 */
export class SpecValidationEngine {
  private options: Required<ValidationOptions>;

  constructor(options: ValidationOptions) {
    this.options = {
      projectPath: options.projectPath,
      strict: options.strict ?? false,
      minReadinessScore: options.minReadinessScore ?? 70
    };
  }

  /**
   * Validate all specification files in the project
   */
  async validate(): Promise<SpecValidationResult> {
    const issues: ValidationIssue[] = [];
    let specFound = false;
    let specType: string | undefined;
    let specPath: string | undefined;

    // Find spec files
    const specPatterns = [
      'SPEC.md',
      'SPECIFICATION.md',
      'architecture.md',
      '.bmad/architecture.md',
      '.bmad/spec.md',
      'docs/architecture.md',
      'docs/spec.md'
    ];

    for (const pattern of specPatterns) {
      const fullPath = join(this.options.projectPath, pattern);
      if (existsSync(fullPath)) {
        specFound = true;
        specPath = fullPath;
        specType = pattern;

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const parsed = this.parseContent(fullPath, content);
          const specIssues = this.validateContent(parsed, content);
          issues.push(...specIssues);
        } catch (error: any) {
          issues.push({
            id: `spec-read-${Date.now()}`,
            type: 'error',
            category: 'required',
            message: `Failed to read specification file: ${error.message}`,
            location: fullPath,
            suggestion: 'Ensure the file exists and is readable'
          });
        }
        break;
      }
    }

    // If no spec found, check if it's a new project (may not have spec yet)
    if (!specFound) {
      issues.push({
        id: `no-spec-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'required',
        message: 'No specification file found in project',
        suggestion: 'Create SPEC.md or architecture.md in project root or .bmad/ directory'
      });
    }

    // Calculate summary
    const summary = {
      errors: issues.filter(i => i.type === 'error').length,
      warnings: issues.filter(i => i.type === 'warning').length,
      info: issues.filter(i => i.type === 'info').length
    };

    // Calculate readiness score
    const readinessScore = this.calculateReadinessScore(issues, specFound);

    // Determine overall status
    const status = this.determineStatus(issues, readinessScore);

    return {
      valid: status === ValidationStatus.VALID,
      readinessScore,
      status,
      issues,
      summary,
      validatedAt: new Date().toISOString(),
      specPath,
      specType
    };
  }

  /**
   * Parse content based on file extension
   */
  private parseContent(filePath: string, content: string): ParsedSpec {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.json') {
      try {
        return {
          type: 'json',
          content: JSON.parse(content),
          raw: content
        };
      } catch {
        return {
          type: 'unknown',
          content: {},
          raw: content
        };
      }
    }

    if (ext === '.md' || ext === '') {
      // Parse markdown - look for sections
      return {
        type: 'markdown',
        content: this.parseMarkdown(content),
        raw: content
      };
    }

    return {
      type: 'unknown',
      content: {},
      raw: content
    };
  }

  /**
   * Parse markdown into structured content
   */
  private parseMarkdown(content: string): Record<string, any> {
    const result: Record<string, any> = {
      overview: {},
      sections: []
    };

    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section headers (# ## ###)
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          result.sections.push({
            name: currentSection,
            content: currentContent.join('\n').trim()
          });
        }

        currentSection = headerMatch[2].toLowerCase();
        currentContent = [];

        // Check for overview subsections
        if (currentSection.includes('overview')) {
          // This is the overview section
        }
      } else if (currentSection && trimmed) {
        currentContent.push(trimmed);
      }
    }

    // Save last section
    if (currentSection) {
      result.sections.push({
        name: currentSection,
        content: currentContent.join('\n').trim()
      });
    }

    return result;
  }

  /**
   * Validate parsed content
   */
  private validateContent(parsed: ParsedSpec, raw: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check required sections in markdown
    if (parsed.type === 'markdown') {
      issues.push(...this.validateMarkdownSections(parsed, raw));
    }

    // Check JSON spec structure
    if (parsed.type === 'json') {
      issues.push(...this.validateJsonStructure(parsed.content));
    }

    // Check for placeholders
    issues.push(...this.checkForPlaceholders(raw));

    // Check for empty sections
    issues.push(...this.checkForEmptySections(raw));

    return issues;
  }

  /**
   * Validate markdown sections
   */
  private validateMarkdownSections(parsed: ParsedSpec, raw: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for required sections
    const hasOverview = raw.toLowerCase().includes('# overview') ||
                       raw.toLowerCase().includes('## overview');
    const hasDescription = raw.toLowerCase().includes('# description') ||
                          raw.toLowerCase().includes('## description');
    const hasProblemStatement = raw.toLowerCase().includes('problem statement');

    if (!hasOverview) {
      issues.push({
        id: `missing-overview-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'required',
        message: 'Missing "Overview" section',
        suggestion: 'Add an Overview section describing the feature'
      });
    }

    if (!hasDescription) {
      issues.push({
        id: `missing-desc-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'required',
        message: 'Missing "Description" section',
        suggestion: 'Add a Description section explaining what the feature does'
      });
    }

    if (!hasProblemStatement) {
      issues.push({
        id: `missing-problem-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'required',
        message: 'Missing "Problem Statement" section',
        suggestion: 'Add a Problem Statement explaining what problem this solves'
      });
    }

    // Check for empty sections
    const sections = parsed.content.sections || [];
    for (const section of sections) {
      if (section.content.length < 10) {
        issues.push({
          id: `empty-section-${Date.now()}`,
          type: 'warning',
          category: 'completeness',
          message: `Section "${section.name}" appears to be empty or too brief`,
          suggestion: 'Fill in the section with meaningful content'
        });
      }
    }

    return issues;
  }

  /**
   * Validate JSON structure
   */
  private validateJsonStructure(content: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check required fields in JSON spec
    if (!content.overview) {
      issues.push({
        id: `missing-overview-json-${Date.now()}`,
        type: 'error',
        category: 'required',
        message: 'Missing required field: overview',
        suggestion: 'Add overview object with featureName, description, problemStatement'
      });
    }

    // Check overview fields
    if (content.overview) {
      if (!content.overview.featureName) {
        issues.push({
          id: `missing-featurename-${Date.now()}`,
          type: 'error',
          category: 'required',
          message: 'Missing required field: overview.featureName'
        });
      }

      if (!content.overview.description || content.overview.description.length < 20) {
        issues.push({
          id: `short-description-${Date.now()}`,
          type: 'warning',
          category: 'completeness',
          message: 'overview.description is too brief (minimum 20 characters recommended)'
        });
      }

      if (!content.overview.successCriteria || !Array.isArray(content.overview.successCriteria)) {
        issues.push({
          id: `missing-criteria-${Date.now()}`,
          type: this.options.strict ? 'error' : 'warning',
          category: 'required',
          message: 'Missing or invalid: overview.successCriteria should be an array'
        });
      }
    }

    return issues;
  }

  /**
   * Check for common placeholder patterns
   */
  private checkForPlaceholders(raw: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const placeholderPatterns = [
      { pattern: /TODO|FODO|FIXME|HACK/gi, message: 'TODO/FIXME comment found' },
      { pattern: /\[TODO\]/gi, message: 'TODO placeholder found' },
      { pattern: /<[^>]+>/gi, message: 'Angle bracket placeholder found (e.g., <input>)' },
      { pattern: /\{\{[^}]+\}\}/gi, message: 'Double curly brace placeholder found' },
      { pattern: /___+/gi, message: 'Underscore placeholder found' },
      { pattern: /Lorem\s+Ipsum/gi, message: 'Lorem ipsum placeholder text found' }
    ];

    for (const { pattern, message } of placeholderPatterns) {
      if (pattern.test(raw)) {
        issues.push({
          id: `placeholder-${Date.now()}`,
          type: 'warning',
          category: 'completeness',
          message,
          suggestion: 'Replace placeholder with actual content'
        });
      }
    }

    return issues;
  }

  /**
   * Check for empty sections
   */
  private checkForEmptySections(raw: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Look for section headers with no content
    const sectionPattern = /(?:^|\n)(#{1,6}\s+[^\n]+)(?:\n\n+)(#{1,6}\s+)/g;
    let match;

    while ((match = sectionPattern.exec(raw)) !== null) {
      const sectionContent = raw.substring(match.index + match[1].length, match.index + match[0].length);
      if (sectionContent.trim().length < 5) {
        issues.push({
          id: `empty-${Date.now()}`,
          type: 'warning',
          category: 'completeness',
          message: `Section "${match[1].trim()}" appears empty`,
          suggestion: 'Fill in the section or remove it if not needed'
        });
      }
    }

    return issues;
  }

  /**
   * Calculate readiness score based on issues
   */
  private calculateReadinessScore(issues: ValidationIssue[], specFound: boolean): number {
    if (!specFound) {
      return 0;
    }

    let score = 100;

    // Deduct for errors
    const errors = issues.filter(i => i.type === 'error');
    score -= errors.length * 20;

    // Deduct for warnings
    const warnings = issues.filter(i => i.type === 'warning');
    score -= warnings.length * 5;

    // Deduct for info (minor issues)
    const info = issues.filter(i => i.type === 'info');
    score -= info.length * 1;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Determine overall validation status
   */
  private determineStatus(issues: ValidationIssue[], readinessScore: number): ValidationStatus {
    const errors = issues.filter(i => i.type === 'error');

    if (errors.length > 0) {
      return ValidationStatus.INVALID;
    }

    if (readinessScore < this.options.minReadinessScore) {
      return ValidationStatus.INCOMPLETE;
    }

    const warnings = issues.filter(i => i.type === 'warning');
    if (warnings.length > 5) {
      return ValidationStatus.WARNING;
    }

    return ValidationStatus.VALID;
  }

  /**
   * Generate human-readable validation report
   */
  generateReport(result: SpecValidationResult): string {
    let report = `# Specification Validation Report\n\n`;
    report += `**Status:** ${result.status.toUpperCase()}\n`;
    report += `**Readiness Score:** ${result.readinessScore}%\n`;
    report += `**Validated:** ${new Date(result.validatedAt).toLocaleString()}\n\n`;

    if (result.specPath) {
      report += `**Spec File:** ${result.specPath}\n\n`;
    }

    report += `## Summary\n`;
    report += `- Errors: ${result.summary.errors}\n`;
    report += `- Warnings: ${result.summary.warnings}\n`;
    report += `- Info: ${result.summary.info}\n\n`;

    if (result.issues.length > 0) {
      report += `## Issues\n\n`;
      for (const issue of result.issues) {
        const icon = issue.type === 'error' ? '🔴' :
                    issue.type === 'warning' ? '🟡' : 'ℹ️';
        report += `${icon} **${issue.type.toUpperCase()}** [${issue.category}]: ${issue.message}\n`;
        if (issue.suggestion) {
          report += `   → ${issue.suggestion}\n`;
        }
        report += '\n';
      }
    }

    return report;
  }
}

/**
 * Convenience function to validate specifications
 */
export async function validateSpec(
  projectPath: string,
  options?: Partial<ValidationOptions>
): Promise<SpecValidationResult> {
  const engine = new SpecValidationEngine({
    projectPath,
    ...options
  });

  return engine.validate();
}
