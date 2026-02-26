// ArchitectureGuard - Vibe Coding Protocol (VCP) architectural boundary enforcement
// Validates that code changes do not violate global architectural conventions

export interface GuardViolation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  blockedPattern: string;
  suggestion: string;
}

export interface GuardResult {
  approved: boolean;
  violations: GuardViolation[];
  summary: {
    errors: number;
    warnings: number;
    checkedRules: number;
  };
  timestamp: string;
}

export interface ArchitectureRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  appliesToFiles?: string[];
  excludePatterns?: RegExp[];
}

// Default VCP architectural rules
const DEFAULT_ARCHITECTURE_RULES: ArchitectureRule[] = [
  // Rule 1: UI components cannot directly import database queries
  {
    id: 'ui-no-db-queries',
    name: 'UI-DB Isolation',
    description: 'UI components must not import database query logic directly',
    pattern: /(?:import|require)\s*\(?['"](?:\.\.?\/)*(?:db|database|queries?|sql|prisma| knex | mongoose)[\/'`](?:\?.*)?(?!\.css)/gi,
    severity: 'error',
    message: 'UI component imports database query layer - violates layer isolation',
    suggestion: 'Move database logic to a service/repository layer and import from there'
  },

  // Rule 2: Components cannot import directly from infrastructure
  {
    id: 'ui-no-infra',
    name: 'UI-Infrastructure Isolation',
    description: 'UI components must not import infrastructure code directly',
    pattern: /(?:import|require)\s*\(?['"](?:\.\.?\/)*(?:infra|infrastructure|config\/|utils\/(?:db|aws|s3|redis|email))/gi,
    severity: 'error',
    message: 'UI component imports infrastructure code - violates architectural boundaries',
    suggestion: 'Create a service layer abstraction between UI and infrastructure'
  },

  // Rule 3: Domain layer cannot access presentation layer
  {
    id: 'domain-no-presentation',
    name: 'Domain-Presentation Isolation',
    description: 'Domain logic must not reference presentation components',
    pattern: /(?:import|require)\s*\(?['"](?:\.\.?\/)*(?:components?|pages?|views?|screens?|ui\/(?!styles|theme)|hooks\/(?:use|use[A-Z]))/gi,
    severity: 'error',
    message: 'Domain layer imports presentation code - violates layered architecture',
    suggestion: 'Domain layer should be presentation-agnostic'
  },

  // Rule 4: No direct database connections in API handlers
  {
    id: 'api-no-direct-db',
    name: 'API-DB Abstraction',
    description: 'API route handlers must use repository pattern for database access',
    pattern: /(?:import|require)\s*\(?['"](?:\.\.?\/)*(?:db|database|prisma\.client|mongoose|knex)['"`]/gi,
    severity: 'warning',
    message: 'API handler directly imports database client - use repository pattern',
    suggestion: 'Inject database access through a service/repository layer'
  },

  // Rule 5: Business logic cannot contain inline SQL
  {
    id: 'no-inline-sql',
    name: 'No Inline SQL',
    description: 'Business logic should not contain inline SQL queries',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\s+/gi,
    severity: 'warning',
    message: 'Inline SQL detected in code - use repository pattern',
    suggestion: 'Move SQL queries to dedicated repository/data access layer'
  },

  // Rule 6: Environment variables must not be accessed in components
  {
    id: 'no-process-env-in-components',
    name: 'Env Abstraction',
    description: 'UI components must not access process.env directly',
    pattern: /process\.env\.(?:REACT_APP_|NEXT_PUBLIC_|VITE_)?[A-Z_]+/gi,
    severity: 'warning',
    message: 'Component accesses process.env directly - use config abstraction',
    suggestion: 'Create a config module that wraps environment variable access'
  },

  // Rule 7: No business logic in API routes (thin controllers)
  {
    id: 'api-thin-controllers',
    name: 'Thin API Controllers',
    description: 'API routes should delegate to service layer, not contain business logic',
    pattern: /export\s+(?:async\s+)?function\s+\w+\s*\(.*?\)\s*\{[^}]{200,}/gi,
    severity: 'warning',
    message: 'Large function in API route - business logic should be in services',
    suggestion: 'Extract business logic to a service module'
  },

  // Rule 8: No direct file system access in API routes
  {
    id: 'api-no-fs',
    name: 'API FileSystem Isolation',
    description: 'API routes must not directly access file system',
    pattern: /(?:import|require)\s*(?:\(\s*)?['"](?:\.\.?\/)*fs['"]/gi,
    severity: 'warning',
    message: 'API route imports fs module - use dedicated file service',
    suggestion: 'Create a file service abstraction for file operations'
  },

  // Rule 9: Services must have index exports for clean imports
  {
    id: 'service-index-export',
    name: 'Service Index Pattern',
    description: 'Service modules should have index files for clean imports',
    pattern: /import\s+.*?\s+from\s+['"]\.\/services\/[a-z]+['"]/gi,
    severity: 'info',
    message: 'Importing directly from service file - consider index export',
    suggestion: 'Create an index.ts that re-exports service members'
  },

  // Rule 10: Hooks cannot have side effects at module level
  {
    id: 'hooks-no-side-effects',
    name: 'Hook Purity',
    description: 'React hooks must not have side effects at module level',
    pattern: /^[^]*?(?:import\s+.*?from\s+['"]|\buse[A-Z]\w*\s*\()[^]*?(?:console\.(?:log|warn|error)|fetch\(|axios\(|localStorage|sessionStorage)[^]*$/gim,
    severity: 'warning',
    message: 'Potential side effect detected in hook - ensure proper hook rules',
    suggestion: 'Move side effects inside useEffect with proper dependencies'
  }
];

/**
 * ArchitectureGuard - Validates code changes against VCP architectural rules
 */
export class ArchitectureGuard {
  private static rules: ArchitectureRule[] = DEFAULT_ARCHITECTURE_RULES;

  /**
   * Validate diff against architectural rules
   * @param diffString - The git diff or code changes to validate
   * @param rulesContext - JSON string containing additional context/rules
   * @returns GuardResult with approval status and violations
   */
  static validateGlobalRules(diffString: string, rulesContext: string): GuardResult {
    const violations: GuardViolation[] = [];
    let customRules: ArchitectureRule[] = [];

    // Parse custom rules from context if provided
    if (rulesContext && rulesContext.trim().length > 0) {
      try {
        const parsed = JSON.parse(rulesContext);
        if (parsed.rules && Array.isArray(parsed.rules)) {
          customRules = parsed.rules.map((rule: Record<string, unknown>) => ({
            id: rule.id as string || `custom-${Date.now()}`,
            name: rule.name as string || 'Custom Rule',
            description: rule.description as string || '',
            pattern: new RegExp(rule.pattern as string, 'gi'),
            severity: (rule.severity as 'error' | 'warning' | 'info') || 'warning',
            message: rule.message as string || 'Custom rule violation',
            suggestion: rule.suggestion as string || 'Review the code pattern',
            appliesToFiles: rule.appliesToFiles as string[] | undefined,
            excludePatterns: rule.excludePatterns
              ? (rule.excludePatterns as string[]).map((p: string) => new RegExp(p, 'gi'))
              : undefined
          }));
        }
      } catch {
        // If parsing fails, use default rules only
        console.warn('[ArchitectureGuard] Failed to parse rulesContext, using defaults');
      }
    }

    const allRules = [...this.rules, ...customRules];
    const checkedRules = new Set<string>();

    for (const rule of allRules) {
      checkedRules.add(rule.id);

      // Find all matches in the diff
      const matches = diffString.match(rule.pattern);

      if (matches && matches.length > 0) {
        for (const match of matches) {
          // Try to extract file and line information
          const locationInfo = this.extractLocationInfo(diffString, match);

          // Check exclude patterns
          let shouldExclude = false;
          if (rule.excludePatterns) {
            for (const excludePattern of rule.excludePatterns) {
              if (excludePattern.test(match)) {
                shouldExclude = true;
                break;
              }
            }
          }

          if (!shouldExclude) {
            // Check file filter if specified
            if (rule.appliesToFiles && locationInfo.file) {
              const fileMatches = rule.appliesToFiles.some((pattern: string) =>
                new RegExp(pattern, 'i').test(locationInfo.file || '')
              );
              if (!fileMatches) {
                continue;
              }
            }

            violations.push({
              rule: rule.id,
              severity: rule.severity,
              message: rule.message,
              file: locationInfo.file,
              line: locationInfo.line,
              blockedPattern: this.truncatePattern(match),
              suggestion: rule.suggestion
            });
          }
        }
      }
    }

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    return {
      approved: errorCount === 0,
      violations,
      summary: {
        errors: errorCount,
        warnings: warningCount,
        checkedRules: checkedRules.size
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract file and line information from diff context
   */
  private static extractLocationInfo(
    diffString: string,
    match: string
  ): { file?: string; line?: number } {
    const result: { file?: string; line?: number } = {};

    // Find the line number of the match
    const matchIndex = diffString.indexOf(match);
    if (matchIndex >= 0) {
      const prefix = diffString.substring(0, matchIndex);
      const lineMatches = prefix.match(/\n/g);
      result.line = lineMatches ? lineMatches.length + 1 : 1;
    }

    // Try to find the file path from diff headers
    const diffLines = diffString.split('\n');
    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      // Match diff header: +++ b/src/path/to/file.ts
      const fileMatch = line.match(/^\+\+\+\s+[ab]\/(.+)$/);
      if (fileMatch) {
        // Check if this is before our match
        const lineIndex = diffString.substring(0, matchIndex).split('\n').length;
        if (i <= lineIndex) {
          result.file = fileMatch[1];
        }
      }
    }

    return result;
  }

  /**
   * Truncate pattern for display
   */
  private static truncatePattern(pattern: string, maxLength: number = 80): string {
    if (pattern.length <= maxLength) {
      return pattern;
    }
    return pattern.substring(0, maxLength) + '...';
  }

  /**
   * Add custom architectural rules
   */
  static addCustomRule(rule: ArchitectureRule): void {
    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * Remove a custom rule by ID
   */
  static removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all active rules
   */
  static getRules(): ArchitectureRule[] {
    return [...this.rules];
  }

  /**
   * Reset to default rules
   */
  static resetRules(): void {
    this.rules = [...DEFAULT_ARCHITECTURE_RULES];
  }

  /**
   * Validate a specific file path against rules
   */
  static validateFile(filePath: string, content: string, rulesContext?: string): GuardResult {
    // Create a synthetic diff-like string for single file validation
    const syntheticDiff = `+++ b/${filePath}\n${content}`;
    return this.validateGlobalRules(syntheticDiff, rulesContext || '');
  }

  /**
   * Quick validation - returns true if no errors
   */
  static quickCheck(diffString: string): boolean {
    const result = this.validateGlobalRules(diffString, '');
    return result.approved;
  }
}

export default ArchitectureGuard;
