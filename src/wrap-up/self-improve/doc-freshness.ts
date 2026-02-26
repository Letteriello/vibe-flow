// DocFreshnessValidator - Validates documentation consistency with code changes
import { extname, basename } from 'path';

export interface DocFreshnessResult {
  doc: string;
  isOutdated: boolean;
  reason: string;
  relatedCodeChanges: string[];
}

export interface DocRule {
  docPattern: RegExp;
  codePatterns: Array<{
    pattern: RegExp;
    reason: string;
  }>;
}

// Mapping rules: documentation files that should be updated when certain code patterns change
const DOC_RULES: DocRule[] = [
  {
    docPattern: /schema\.md$/i,
    codePatterns: [
      { pattern: /database|db|migration|schema|model|entity/i, reason: 'Database model changes' },
      { pattern: /\.sql$/i, reason: 'SQL file changes' },
      { pattern: /prisma|mongoose|sequelize|typeorm/i, reason: 'ORM configuration changes' },
      { pattern: /schema|table|column|index/i, reason: 'Database schema changes' }
    ]
  },
  {
    docPattern: /readme\.md$/i,
    codePatterns: [
      { pattern: /package\.json$/i, reason: 'Package dependencies changed' },
      { pattern: /tsconfig|webpack|vite|esbuild/i, reason: 'Build configuration changes' },
      { pattern: /dockerfile|docker-compose|\.dockerfile/i, reason: 'Container configuration changed' }
    ]
  },
  {
    docPattern: /api\.md$|api-doc.*\.md$/i,
    codePatterns: [
      { pattern: /route|endpoint|controller|handler/i, reason: 'API endpoint changes' },
      { pattern: /openapi|swagger|graphql|schema/i, reason: 'API schema changes' },
      { pattern: /\/api\//i, reason: 'API path changes' }
    ]
  },
  {
    docPattern: /architecture|arch\.md$/i,
    codePatterns: [
      { pattern: /src\/.*\.ts$/i, reason: 'Core architecture changes' },
      { pattern: /interface|type\s+\w+/i, reason: 'Interface/type changes' },
      { pattern: /class\s+\w+/i, reason: 'Class structure changes' }
    ]
  },
  {
    docPattern: /changelog|history\.md$/i,
    codePatterns: [
      { pattern: /.*\.ts$|.*\.js$/i, reason: 'Code changes need changelog entry' },
      { pattern: /package\.json$/i, reason: 'Version changes need changelog' }
    ]
  },
  {
    docPattern: /security|security\.md$/i,
    codePatterns: [
      { pattern: /auth|jwt|oauth|password|credential|secret/i, reason: 'Authentication changes' },
      { pattern: /permission|role|acl|policy/i, reason: 'Authorization changes' },
      { pattern: /encrypt|decrypt|hash|salt/i, reason: 'Encryption changes' }
    ]
  },
  {
    docPattern: /deploy|deployment|ops\.md$/i,
    codePatterns: [
      { pattern: /dockerfile|docker-compose|kubernetes|k8s/i, reason: 'Deployment config changes' },
      { pattern: /github.*action|gitlab.*ci|jenkins|ci\.yml/i, reason: 'CI/CD changes' },
      { pattern: /env|environment|config/i, reason: 'Environment configuration changes' }
    ]
  },
  {
    docPattern: /testing|test\.md$/i,
    codePatterns: [
      { pattern: /src\/.*\.test\.|src\/.*\.spec\./i, reason: 'Test file changes' },
      { pattern: /jest|vitest|mocha|cypress|playwright/i, reason: 'Testing framework changes' },
      { pattern: /mock|stub|fixture/i, reason: 'Test fixtures changed' }
    ]
  },
  {
    docPattern: /contrib|contributing|develop\.md$/i,
    codePatterns: [
      { pattern: /package\.json$/i, reason: 'Development dependencies changed' },
      { pattern: /tsconfig|eslint|prettier/i, reason: 'Dev tooling changes' }
    ]
  },
  {
    docPattern: /migration|upgrade\.md$/i,
    codePatterns: [
      { pattern: /migration|upgrade|migrate/i, reason: 'Migration script changes' },
      { pattern: /package\.json$/i, reason: 'Dependency version changes' }
    ]
  }
];

// Extension to documentation mapping
const EXT_TO_DOC: Record<string, string[]> = {
  '.ts': ['architecture.md', 'api.md', 'readme.md'],
  '.js': ['readme.md', 'architecture.md'],
  '.sql': ['schema.md', 'database.md'],
  '.json': ['readme.md', 'config.md'],
  '.yml': ['deployment.md', 'config.md', 'readme.md'],
  '.yaml': ['deployment.md', 'config.md'],
  '.md': ['readme.md'],
  '.go': ['architecture.md', 'readme.md'],
  '.py': ['readme.md', 'architecture.md'],
  '.java': ['readme.md', 'architecture.md'],
  '.rs': ['readme.md', 'architecture.md'],
  '.css': ['style.md', 'design.md'],
  '.scss': ['style.md', 'design.md'],
  '.html': ['docs.md'],
  '.graphql': ['api.md', 'schema.md']
};

export class DocFreshnessValidator {
  private rules: DocRule[];

  constructor(customRules?: DocRule[]) {
    this.rules = customRules || DOC_RULES;
  }

  /**
   * Checks for outdated documentation based on changed files
   * @param changedFiles - List of files that were modified in the session
   * @param docsList - List of documentation files in the project
   * @returns Array of warning messages for outdated documents
   */
  checkOutdatedDocs(changedFiles: string[], docsList: string[]): string[] {
    const warnings: string[] = [];

    // Filter to only code files (not docs themselves)
    const codeFiles = changedFiles.filter(
      file => !this.isDocumentationFile(file)
    );

    // If no code files changed, no warnings needed
    if (codeFiles.length === 0) {
      return warnings;
    }

    // For each documentation file, check if it should be updated
    for (const docFile of docsList) {
      if (this.isDocumentationFile(docFile)) {
        // Skip if doc file was actually modified
        if (this.wasDocModified(docFile, changedFiles)) {
          continue;
        }

        // Check if related code files changed
        const relatedChanges = this.findRelatedCodeChanges(docFile, codeFiles);

        if (relatedChanges.length > 0) {
          const warning = this.formatWarning(docFile, relatedChanges);
          warnings.push(warning);
        }
      }
    }

    return warnings;
  }

  /**
   * Checks if a file is a documentation file
   */
  private isDocumentationFile(file: string): boolean {
    const ext = extname(file).toLowerCase();
    const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
    if (docExtensions.includes(ext)) {
      return true;
    }

    // Check for common doc filenames
    const docNames = ['readme', 'changelog', 'contributing', 'license', 'history', 'api', 'architecture'];
    const base = basename(file).toLowerCase();
    return docNames.some(name => base.includes(name));
  }

  /**
   * Checks if a documentation file was modified in the session
   */
  private wasDocModified(docFile: string, changedFiles: string[]): boolean {
    const docBasename = basename(docFile).toLowerCase();
    return changedFiles.some(
      changed => basename(changed).toLowerCase() === docBasename
    );
  }

  /**
   * Finds code files that are related to a documentation file
   */
  private findRelatedCodeChanges(docFile: string, codeFiles: string[]): string[] {
    const relatedChanges: string[] = [];

    // Find matching rule for this doc file
    const matchingRule = this.rules.find(rule =>
      rule.docPattern.test(docFile)
    );

    if (matchingRule) {
      // Check each code file against the rule's patterns
      for (const codeFile of codeFiles) {
        for (const codePattern of matchingRule.codePatterns) {
          if (codePattern.pattern.test(codeFile)) {
            relatedChanges.push(codeFile);
            break;
          }
        }
      }
    } else {
      // Fallback: use extension-based mapping
      const ext = extname(docFile).toLowerCase();
      const relevantExts = this.getRelevantExtensions(docFile);

      for (const codeFile of codeFiles) {
        const codeExt = extname(codeFile).toLowerCase();
        if (relevantExts.includes(codeExt)) {
          relatedChanges.push(codeFile);
        }
      }
    }

    return relatedChanges;
  }

  /**
   * Gets relevant code extensions for a documentation file
   */
  private getRelevantExtensions(docFile: string): string[] {
    const docBasename = basename(docFile).toLowerCase();
    const extensions: string[] = [];

    // Check extension mapping
    for (const [ext, docs] of Object.entries(EXT_TO_DOC)) {
      if (docs.some(doc => docBasename.includes(doc.replace('.md', '')))) {
        extensions.push(ext);
      }
    }

    return extensions.length > 0 ? extensions : ['.ts', '.js', '.json'];
  }

  /**
   * Formats a warning message for outdated documentation
   */
  private formatWarning(docFile: string, relatedChanges: string[]): string {
    const changeSummary = relatedChanges.length === 1
      ? basename(relatedChanges[0])
      : `${relatedChanges.length} related files`;

    return `Warning: Outdated Document - ${docFile} (related code changes: ${changeSummary})`;
  }

  /**
   * Provides detailed results about documentation freshness
   */
  analyzeFreshness(changedFiles: string[], docsList: string[]): DocFreshnessResult[] {
    const results: DocFreshnessResult[] = [];

    const codeFiles = changedFiles.filter(
      file => !this.isDocumentationFile(file)
    );

    for (const docFile of docsList) {
      if (!this.isDocumentationFile(docFile)) continue;

      const wasModified = this.wasDocModified(docFile, changedFiles);
      const relatedChanges = this.findRelatedCodeChanges(docFile, codeFiles);

      // Find the reason for the relationship
      let reason = '';
      const matchingRule = this.rules.find(rule =>
        rule.docPattern.test(docFile)
      );

      if (matchingRule && relatedChanges.length > 0) {
        for (const codePattern of matchingRule.codePatterns) {
          const matchedFile = relatedChanges.find(f => codePattern.pattern.test(f));
          if (matchedFile) {
            reason = codePattern.reason;
            break;
          }
        }
      }

      results.push({
        doc: docFile,
        isOutdated: !wasModified && relatedChanges.length > 0,
        reason: wasModified ? 'Document was updated' : (reason || 'No related changes detected'),
        relatedCodeChanges: relatedChanges
      });
    }

    return results;
  }

  /**
   * Adds custom validation rules
   */
  addCustomRule(rule: DocRule): void {
    this.rules.push(rule);
  }
}
