// Cross-Rule Validation - Story 8.x: Inter-rule validation for specification artifacts
// AC: Dado dois artefatos gerados pelo agente (ex: PRD e Documento de Arquitetura),
//     Quando validador executa, Então compara chaves primárias e entidades entre artefatos,
//     E detecta discrepâncias, E retorna resultado com issues encontradas

export enum CrossRuleStatus {
  CONSISTENT = 'consistent',
  INCONSISTENT = 'inconsistent',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface CrossRuleIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'missing_key' | 'type_mismatch' | 'value_mismatch' | 'extra_key' | 'entity_mismatch';
  message: string;
  sourceArtifact: string;
  targetArtifact?: string;
  key?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  status: CrossRuleStatus;
  issues: CrossRuleIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    missingKeys: string[];
    extraKeys: string[];
    typeMismatches: string[];
  };
  validatedAt: string;
  artifactAName?: string;
  artifactBName?: string;
}

export interface CrossRuleOptions {
  artifactAName?: string;
  artifactBName?: string;
  primaryKeyFields?: string[];
  strict?: boolean;
  ignoreFields?: string[];
}

/**
 * Story 8.x: Cross-Rule Validator
 *
 * Validates consistency between two specification artifacts:
 * - Compares primary keys between artifacts
 * - Detects missing entities in either direction
 * - Validates type consistency for shared keys
 * - Returns detailed discrepancy report
 */
export class CrossRuleValidator {
  private options: Required<CrossRuleOptions>;

  // Default primary key field names to look for
  private static readonly DEFAULT_PRIMARY_KEYS = [
    'entities',
    'services',
    'modules',
    'components',
    'apis',
    'endpoints',
    'models',
    'schemas',
    'tables',
    'collections',
    'features',
    'requirements'
  ];

  constructor(options: CrossRuleOptions = {}) {
    this.options = {
      artifactAName: options.artifactAName ?? 'Artifact A',
      artifactBName: options.artifactBName ?? 'Artifact B',
      primaryKeyFields: options.primaryKeyFields ?? CrossRuleValidator.DEFAULT_PRIMARY_KEYS,
      strict: options.strict ?? false,
      ignoreFields: options.ignoreFields ?? ['version', 'createdAt', 'updatedAt', 'author', 'description']
    };
  }

  /**
   * Validate consistency between two artifacts
   */
  validateConsistency(artifactA: Record<string, any>, artifactB: Record<string, any>): ValidationResult {
    const issues: CrossRuleIssue[] = [];

    // Extract primary keys (entity lists) from both artifacts
    const keysA = this.extractPrimaryKeys(artifactA);
    const keysB = this.extractPrimaryKeys(artifactB);

    // Find missing keys in artifact B (keys present in A but not in B)
    const missingKeys = keysA.filter(key => !keysB.includes(key));

    // Find extra keys in artifact B (keys present in B but not in A)
    const extraKeys = keysB.filter(key => !keysA.includes(key));

    // Check for missing keys and create issues
    for (const key of missingKeys) {
      issues.push({
        id: `missing-key-${key}-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'missing_key',
        message: `Primary key "${key}" exists in ${this.options.artifactAName} but is missing in ${this.options.artifactBName}`,
        sourceArtifact: this.options.artifactAName,
        targetArtifact: this.options.artifactBName,
        key: key,
        suggestion: `Add "${key}" to ${this.options.artifactBName} or remove from ${this.options.artifactAName}`
      });
    }

    // Check for extra keys and create issues
    for (const key of extraKeys) {
      issues.push({
        id: `extra-key-${key}-${Date.now()}`,
        type: 'info',
        category: 'extra_key',
        message: `Primary key "${key}" exists in ${this.options.artifactBName} but not in ${this.options.artifactAName}`,
        sourceArtifact: this.options.artifactBName,
        targetArtifact: this.options.artifactAName,
        key: key,
        suggestion: `Consider adding "${key}" to ${this.options.artifactAName} if it should be present`
      });
    }

    // Compare values for common keys
    const commonKeys = keysA.filter(key => keysB.includes(key));
    for (const key of commonKeys) {
      const valueA = this.getValueByKey(artifactA, key);
      const valueB = this.getValueByKey(artifactB, key);

      if (valueA && valueB) {
        // Compare arrays (lists of entities)
        if (Array.isArray(valueA) && Array.isArray(valueB)) {
          const arrayIssues = this.compareArrays(key, valueA, valueB);
          issues.push(...arrayIssues);
        }
        // Compare objects
        else if (typeof valueA === 'object' && typeof valueB === 'object') {
          const objectIssues = this.compareObjects(key, valueA, valueB);
          issues.push(...objectIssues);
        }
        // Compare primitives
        else if (valueA !== valueB) {
          issues.push({
            id: `value-mismatch-${key}-${Date.now()}`,
            type: 'warning',
            category: 'value_mismatch',
            message: `Value mismatch for key "${key}": "${valueA}" vs "${valueB}"`,
            sourceArtifact: this.options.artifactAName,
            targetArtifact: this.options.artifactBName,
            key: key,
            expectedValue: valueA,
            actualValue: valueB,
            suggestion: 'Verify both artifacts have consistent values for this key'
          });
        }
      }
    }

    // Determine overall status
    const status = this.determineStatus(issues);

    return {
      valid: status === CrossRuleStatus.CONSISTENT,
      status,
      issues,
      summary: {
        errors: issues.filter(i => i.type === 'error').length,
        warnings: issues.filter(i => i.type === 'warning').length,
        info: issues.filter(i => i.type === 'info').length,
        missingKeys,
        extraKeys,
        typeMismatches: issues.filter(i => i.category === 'type_mismatch').map(i => i.key ?? '')
      },
      validatedAt: new Date().toISOString(),
      artifactAName: this.options.artifactAName,
      artifactBName: this.options.artifactBName
    };
  }

  /**
   * Extract primary keys from an artifact
   */
  private extractPrimaryKeys(artifact: Record<string, any>): string[] {
    const keys: string[] = [];

    for (const field of this.options.primaryKeyFields) {
      if (artifact[field] !== undefined) {
        keys.push(field);

        // If it's an array or object, also extract nested keys
        if (Array.isArray(artifact[field])) {
          // For arrays of objects, extract id/name fields
          for (const item of artifact[field]) {
            if (typeof item === 'object' && item !== null) {
              const idField = item.id ?? item.name ?? item.key ?? item.code;
              if (idField && typeof idField === 'string') {
                keys.push(`${field}:${idField}`);
              }
            } else if (typeof item === 'string') {
              keys.push(`${field}:${item}`);
            }
          }
        } else if (typeof artifact[field] === 'object' && artifact[field] !== null) {
          // For objects, extract top-level keys
          const nestedKeys = Object.keys(artifact[field]);
          for (const nestedKey of nestedKeys) {
            if (!this.options.ignoreFields.includes(nestedKey)) {
              keys.push(`${field}.${nestedKey}`);
            }
          }
        }
      }
    }

    return keys;
  }

  /**
   * Get value by key path (supports dot notation)
   */
  private getValueByKey(artifact: Record<string, any>, key: string): unknown {
    // Handle compound keys like "entities:User"
    if (key.includes(':')) {
      const [field, subKey] = key.split(':');
      const fieldValue = artifact[field];
      if (Array.isArray(fieldValue)) {
        return fieldValue.find((item: unknown) => {
          if (typeof item === 'object' && item !== null) {
            const itemId = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).name;
            return itemId === subKey;
          }
          return item === subKey;
        });
      }
      return undefined;
    }

    // Handle dot notation like "entities.properties"
    if (key.includes('.')) {
      const parts = key.split('.');
      let value: unknown = artifact;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
      return value;
    }

    return artifact[key];
  }

  /**
   * Compare arrays and find discrepancies
   */
  private compareArrays(key: string, arrA: unknown[], arrB: unknown[]): CrossRuleIssue[] {
    const issues: CrossRuleIssue[] = [];

    // Convert to string for comparison if simple arrays
    const isSimpleArray = arrA.every(item => typeof item !== 'object') &&
                          arrB.every(item => typeof item !== 'object');

    if (isSimpleArray) {
      const itemsA = arrA.map(String);
      const itemsB = arrB.map(String);

      const missingInB = itemsA.filter(item => !itemsB.includes(item));
      const missingInA = itemsB.filter(item => !itemsA.includes(item));

      for (const item of missingInB) {
        issues.push({
          id: `array-missing-${key}-${item}-${Date.now()}`,
          type: this.options.strict ? 'error' : 'warning',
          category: 'missing_key',
          message: `Item "${item}" in ${key} exists in ${this.options.artifactAName} but missing in ${this.options.artifactBName}`,
          sourceArtifact: this.options.artifactAName,
          targetArtifact: this.options.artifactBName,
          key: key,
          expectedValue: item,
          suggestion: `Add "${item}" to ${key} in ${this.options.artifactBName}`
        });
      }

      for (const item of missingInA) {
        issues.push({
          id: `array-extra-${key}-${item}-${Date.now()}`,
          type: 'info',
          category: 'extra_key',
          message: `Item "${item}" in ${key} exists in ${this.options.artifactBName} but not in ${this.options.artifactAName}`,
          sourceArtifact: this.options.artifactBName,
          targetArtifact: this.options.artifactAName,
          key: key,
          actualValue: item,
          suggestion: `Consider adding "${item}" to ${key} in ${this.options.artifactAName}`
        });
      }
    } else {
      // Complex array of objects - compare by id/name
      const getIds = (arr: unknown[]): string[] => {
        return arr.map((item: unknown) => {
          if (typeof item === 'object' && item !== null) {
            return String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).name ?? JSON.stringify(item));
          }
          return String(item);
        });
      };

      const idsA = getIds(arrA);
      const idsB = getIds(arrB);

      const missingInB = idsA.filter(id => !idsB.includes(id));
      const missingInA = idsB.filter(id => !idsA.includes(id));

      for (const id of missingInB) {
        issues.push({
          id: `entity-missing-${key}-${id}-${Date.now()}`,
          type: this.options.strict ? 'error' : 'warning',
          category: 'entity_mismatch',
          message: `Entity "${id}" in ${key} exists in ${this.options.artifactAName} but missing in ${this.options.artifactBName}`,
          sourceArtifact: this.options.artifactAName,
          targetArtifact: this.options.artifactBName,
          key: key,
          expectedValue: id,
          suggestion: `Add entity "${id}" to ${key} in ${this.options.artifactBName}`
        });
      }

      for (const id of missingInA) {
        issues.push({
          id: `entity-extra-${key}-${id}-${Date.now()}`,
          type: 'info',
          category: 'entity_mismatch',
          message: `Entity "${id}" in ${key} exists in ${this.options.artifactBName} but not in ${this.options.artifactAName}`,
          sourceArtifact: this.options.artifactBName,
          targetArtifact: this.options.artifactAName,
          key: key,
          actualValue: id,
          suggestion: `Consider adding entity "${id}" to ${key} in ${this.options.artifactAName}`
        });
      }
    }

    return issues;
  }

  /**
   * Compare objects and find discrepancies
   */
  private compareObjects(key: string, objA: unknown, objB: unknown): CrossRuleIssue[] {
    const issues: CrossRuleIssue[] = [];

    if (typeof objA !== 'object' || typeof objB !== 'object' ||
        objA === null || objB === null) {
      return issues;
    }

    const recordA = objA as Record<string, unknown>;
    const recordB = objB as Record<string, unknown>;

    const keysA = Object.keys(recordA).filter(k => !this.options.ignoreFields.includes(k));
    const keysB = Object.keys(recordB).filter(k => !this.options.ignoreFields.includes(k));

    const missingInB = keysA.filter(k => !keysB.includes(k));
    const missingInA = keysB.filter(k => !keysA.includes(k));
    const commonKeys = keysA.filter(k => keysB.includes(k));

    for (const k of missingInB) {
      issues.push({
        id: `obj-missing-${key}-${k}-${Date.now()}`,
        type: this.options.strict ? 'error' : 'warning',
        category: 'missing_key',
        message: `Property "${k}" in ${key} exists in ${this.options.artifactAName} but missing in ${this.options.artifactBName}`,
        sourceArtifact: this.options.artifactAName,
        targetArtifact: this.options.artifactBName,
        key: `${key}.${k}`,
        suggestion: `Add property "${k}" to ${key} in ${this.options.artifactBName}`
      });
    }

    for (const k of missingInA) {
      issues.push({
        id: `obj-extra-${key}-${k}-${Date.now()}`,
        type: 'info',
        category: 'extra_key',
        message: `Property "${k}" in ${key} exists in ${this.options.artifactBName} but not in ${this.options.artifactAName}`,
        sourceArtifact: this.options.artifactBName,
        targetArtifact: this.options.artifactAName,
        key: `${key}.${k}`,
        suggestion: `Consider adding property "${k}" to ${key} in ${this.options.artifactAName}`
      });
    }

    // Compare values for common keys
    for (const k of commonKeys) {
      const valA = recordA[k];
      const valB = recordB[k];

      if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        // Check for type mismatch
        if (typeof valA !== typeof valB) {
          issues.push({
            id: `type-mismatch-${key}-${k}-${Date.now()}`,
            type: 'error',
            category: 'type_mismatch',
            message: `Type mismatch for "${k}" in ${key}: ${typeof valA} vs ${typeof valB}`,
            sourceArtifact: this.options.artifactAName,
            targetArtifact: this.options.artifactBName,
            key: `${key}.${k}`,
            expectedValue: typeof valA,
            actualValue: typeof valB,
            suggestion: `Ensure consistent types for property "${k}"`
          });
        } else {
          issues.push({
            id: `value-mismatch-${key}-${k}-${Date.now()}`,
            type: 'warning',
            category: 'value_mismatch',
            message: `Value mismatch for "${k}" in ${key}`,
            sourceArtifact: this.options.artifactAName,
            targetArtifact: this.options.artifactBName,
            key: `${key}.${k}`,
            expectedValue: valA,
            actualValue: valB,
            suggestion: 'Verify both artifacts have consistent values'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Determine overall validation status
   */
  private determineStatus(issues: CrossRuleIssue[]): CrossRuleStatus {
    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');

    if (errors.length > 0) {
      return CrossRuleStatus.INCONSISTENT;
    }

    if (warnings.length > 0) {
      return CrossRuleStatus.WARNING;
    }

    return CrossRuleStatus.CONSISTENT;
  }

  /**
   * Generate human-readable validation report
   */
  generateReport(result: ValidationResult): string {
    let report = `# Cross-Rule Validation Report\n\n`;
    report += `**Status:** ${result.status.toUpperCase()}\n`;
    report += `**Validated:** ${new Date(result.validatedAt).toLocaleString()}\n\n`;

    if (result.artifactAName && result.artifactBName) {
      report += `**Artifacts Compared:**\n`;
      report += `- ${result.artifactAName}\n`;
      report += `- ${result.artifactBName}\n\n`;
    }

    report += `## Summary\n`;
    report += `- Errors: ${result.summary.errors}\n`;
    report += `- Warnings: ${result.summary.warnings}\n`;
    report += `- Info: ${result.summary.info}\n`;
    report += `- Missing Keys: ${result.summary.missingKeys.length}\n`;
    report += `- Extra Keys: ${result.summary.extraKeys.length}\n\n`;

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
 * Convenience function to validate consistency between two artifacts
 */
export function validateCrossRule(
  artifactA: Record<string, any>,
  artifactB: Record<string, any>,
  options?: CrossRuleOptions
): ValidationResult {
  const validator = new CrossRuleValidator(options);
  return validator.validateConsistency(artifactA, artifactB);
}
