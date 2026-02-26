// Specification Validation Engine
// Story 8.2: Specification Validation Engine

import { ArchitectureSpec, ValidationResult, ValidationError } from './types.js';

// Minimum content length for required sections
const MIN_CONTENT_LENGTH = 50;

// Warning threshold
const WARNING_THRESHOLD = 30;

export class SpecValidator {
  /**
   * Validate an architecture specification
   */
  static validate(spec: ArchitectureSpec): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate required fields
    errors.push(...this.validateRequiredFields(spec));

    // Validate content quality
    errors.push(...this.validateContentQuality(spec));

    // Check for placeholder content
    warnings.push(...this.checkPlaceholders(spec));

    // Calculate score
    const score = this.calculateScore(spec, errors, warnings);

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
      score
    };
  }

  /**
   * Validate required fields are present and non-empty
   */
  private static validateRequiredFields(spec: ArchitectureSpec): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check project name
    if (!spec.projectName || spec.projectName.trim().length === 0) {
      errors.push({
        section: 'metadata',
        message: 'Project name is required',
        severity: 'error'
      });
    }

    // Check required sections
    const sections = ['overview', 'dataModel', 'api', 'security'] as const;

    for (const section of sections) {
      const sectionData = spec[section];

      if (!sectionData) {
        errors.push({
          section,
          message: `${section} section is missing`,
          severity: 'error'
        });
      } else if (!sectionData.content || sectionData.content.trim().length === 0) {
        errors.push({
          section,
          message: `${section} section is empty`,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Validate content quality
   */
  private static validateContentQuality(spec: ArchitectureSpec): ValidationError[] {
    const errors: ValidationError[] = [];

    const sections = ['overview', 'dataModel', 'api', 'security'] as const;

    for (const section of sections) {
      const sectionData = spec[section];
      if (!sectionData?.content) continue;

      const content = sectionData.content.trim();

      // Check minimum length
      if (content.length < MIN_CONTENT_LENGTH) {
        errors.push({
          section,
          message: `${section} content is too short (minimum ${MIN_CONTENT_LENGTH} characters)`,
          severity: 'error'
        });
      }

      // Check required fields for each section
      if (sectionData.fields) {
        for (const field of sectionData.fields) {
          const fieldPattern = new RegExp(field.replace(/_/g, '[-_]'), 'i');
          if (!fieldPattern.test(content)) {
            errors.push({
              section,
              field,
              message: `${section} is missing required field: ${field}`,
              severity: 'error'
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Check for placeholder content
   */
  private static checkPlaceholders(spec: ArchitectureSpec): ValidationError[] {
    const warnings: ValidationError[] = [];

    const placeholderPatterns = [
      /\btodo\b/i,
      /\btbd\b/i,
      /\btodo\s*:/i,
      /\[.*?\]/g,  // Placeholders in brackets
      /<.*?>/g     // Placeholders in angle brackets
    ];

    const sections = ['overview', 'dataModel', 'api', 'security'] as const;

    for (const section of sections) {
      const sectionData = spec[section];
      if (!sectionData?.content) continue;

      for (const pattern of placeholderPatterns) {
        const matches = sectionData.content.match(pattern);
        if (matches && matches.length > 0) {
          warnings.push({
            section,
            message: `Found ${matches.length} placeholder(s) in ${section}: ${matches.slice(0, 3).join(', ')}`,
            severity: 'warning'
          });
          break;
        }
      }
    }

    return warnings;
  }

  /**
   * Calculate overall score
   */
  private static calculateScore(spec: ArchitectureSpec, errors: ValidationError[], warnings: ValidationError[]): number {
    let score = 100;

    // Deduct for errors
    const errorCount = errors.filter(e => e.severity === 'error').length;
    score -= errorCount * 20;

    // Deduct for warnings
    const warningCount = warnings.length;
    score -= warningCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Quick validation - returns just valid/invalid
   */
  static isValid(spec: ArchitectureSpec): boolean {
    const result = this.validate(spec);
    return result.valid;
  }

  /**
   * Get validation summary
   */
  static getSummary(spec: ArchitectureSpec): string {
    const result = this.validate(spec);

    let summary = `Validation Score: ${result.score}/100\n`;
    summary += result.valid ? '✅ Specification is valid\n' : '❌ Specification has errors\n';

    if (result.errors.length > 0) {
      summary += `\nErrors (${result.errors.length}):\n`;
      for (const error of result.errors) {
        summary += `  - [${error.section}] ${error.message}\n`;
      }
    }

    if (result.warnings.length > 0) {
      summary += `\nWarnings (${result.warnings.length}):\n`;
      for (const warning of result.warnings) {
        summary += `  - [${warning.section}] ${warning.message}\n`;
      }
    }

    return summary;
  }
}
