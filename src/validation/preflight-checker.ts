// Pre-Flight Check Engine - Story 7.1: Validate implementation readiness before generating code
// AC: Dado projeto prestes a gerar código, Quando Pre-Flight Check executa,
//     Então verifica dependências existentes, testes presentes, documentação atualizada, retorna checklist com status

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export enum PreFlightStatus {
  READY = 'ready',
  MISSING = 'missing',
  NEEDS_REVIEW = 'needs_review',
  SKIPPED = 'skipped'
}

export interface PreFlightCheckItem {
  id: string;
  name: string;
  description: string;
  status: PreFlightStatus;
  path?: string;
  details?: string;
  canSkip?: boolean;
  skipReason?: string;
}

export interface PreFlightResult {
  timestamp: string;
  projectPath: string;
  ready: boolean;
  readinessScore: number; // 0-100
  checks: PreFlightCheckItem[];
  summary: {
    ready: number;
    missing: number;
    needsReview: number;
    skipped: number;
  };
  blockers: string[];
  warnings: string[];
}

export interface PreFlightOptions {
  projectPath: string;
  checkDependencies?: boolean;
  checkTests?: boolean;
  checkDocumentation?: boolean;
  checkPackageJson?: boolean;
  requiredTestPatterns?: string[];
  requiredDocPatterns?: string[];
}

const DEFAULT_TEST_PATTERNS = [
  '*.test.ts',
  '*.spec.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  'test/**/*.js',
  'tests/**/*.js',
  '__tests__/**/*.js'
];

const DEFAULT_DOC_PATTERNS = [
  'README.md',
  'docs/**/*.md',
  '.bmad/**/*.md',
  'SPEC.md',
  'SPECIFICATION.md'
];

/**
 * Story 7.1: Pre-Flight Check Engine
 *
 * Validates that the project is ready for code generation by checking:
 * - Dependencies are installed
 * - Tests exist
 * - Documentation exists
 *
 * Returns a checklist with status for each item.
 */
export class PreFlightChecker {
  private options: Required<PreFlightOptions>;

  constructor(options: PreFlightOptions) {
    this.options = {
      projectPath: options.projectPath,
      checkDependencies: options.checkDependencies ?? true,
      checkTests: options.checkTests ?? true,
      checkDocumentation: options.checkDocumentation ?? true,
      checkPackageJson: options.checkPackageJson ?? true,
      requiredTestPatterns: options.requiredTestPatterns ?? DEFAULT_TEST_PATTERNS,
      requiredDocPatterns: options.requiredDocPatterns ?? DEFAULT_DOC_PATTERNS
    };
  }

  /**
   * Run all pre-flight checks
   */
  async check(): Promise<PreFlightResult> {
    const checks: PreFlightCheckItem[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Run checks in order of importance
    if (this.options.checkPackageJson) {
      checks.push(await this.checkPackageJson());
    }

    if (this.options.checkDependencies) {
      checks.push(await this.checkDependencies());
    }

    if (this.options.checkTests) {
      checks.push(await this.checkTests());
    }

    if (this.options.checkDocumentation) {
      checks.push(await this.checkDocumentation());
    }

    // Calculate summary
    const summary = {
      ready: checks.filter(c => c.status === PreFlightStatus.READY).length,
      missing: checks.filter(c => c.status === PreFlightStatus.MISSING).length,
      needsReview: checks.filter(c => c.status === PreFlightStatus.NEEDS_REVIEW).length,
      skipped: checks.filter(c => c.status === PreFlightStatus.SKIPPED).length
    };

    // Calculate readiness score (100 - penalties for missing/needs review)
    const totalCheckable = checks.filter(c => c.status !== PreFlightStatus.SKIPPED).length;
    const readinessScore = totalCheckable > 0
      ? Math.round(((summary.ready) / totalCheckable) * 100)
      : 100;

    // Determine blockers
    checks
      .filter(c => c.status === PreFlightStatus.MISSING && c.canSkip !== true)
      .forEach(c => blockers.push(`${c.name}: ${c.description}`));

    // Warnings for needs review
    checks
      .filter(c => c.status === PreFlightStatus.NEEDS_REVIEW)
      .forEach(c => warnings.push(`${c.name}: ${c.details || 'needs review'}`));

    const ready = blockers.length === 0 && summary.ready > 0;

    return {
      timestamp: new Date().toISOString(),
      projectPath: this.options.projectPath,
      ready,
      readinessScore,
      checks,
      summary,
      blockers,
      warnings
    };
  }

  /**
   * Check if package.json exists and is valid
   */
  private async checkPackageJson(): Promise<PreFlightCheckItem> {
    const packageJsonPath = join(this.options.projectPath, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      // Check for required fields
      const hasName = pkg.name && typeof pkg.name === 'string';
      const hasVersion = pkg.version && typeof pkg.version === 'string';
      const hasScripts = pkg.scripts && typeof pkg.scripts === 'object';

      if (hasName && hasVersion && hasScripts) {
        return {
          id: 'package-json',
          name: 'Package Configuration',
          description: 'Valid package.json with name, version, and scripts',
          status: PreFlightStatus.READY,
          path: packageJsonPath,
          details: `${pkg.name}@${pkg.version}`
        };
      } else {
        return {
          id: 'package-json',
          name: 'Package Configuration',
          description: 'package.json is incomplete',
          status: PreFlightStatus.NEEDS_REVIEW,
          path: packageJsonPath,
          details: 'Missing required fields'
        };
      }
    } catch {
      return {
        id: 'package-json',
        name: 'Package Configuration',
        description: 'package.json must exist for npm projects',
        status: PreFlightStatus.MISSING,
        path: packageJsonPath,
        canSkip: false
      };
    }
  }

  /**
   * Check if dependencies are installed (node_modules exists)
   */
  private async checkDependencies(): Promise<PreFlightCheckItem> {
    const nodeModulesPath = join(this.options.projectPath, 'node_modules');

    // Check if package.json has dependencies or devDependencies
    const packageJsonPath = join(this.options.projectPath, 'package.json');
    let hasDependencies = false;

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      hasDependencies = Boolean(
        (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
        (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)
      );
    } catch {
      // No package.json or invalid - skip this check
    }

    if (!hasDependencies) {
      return {
        id: 'dependencies',
        name: 'Dependencies',
        description: 'No npm dependencies defined',
        status: PreFlightStatus.SKIPPED,
        details: 'No dependencies to check'
      };
    }

    const installed = existsSync(nodeModulesPath);

    return {
      id: 'dependencies',
      name: 'Dependencies Installed',
      description: 'node_modules directory exists with installed packages',
      status: installed ? PreFlightStatus.READY : PreFlightStatus.MISSING,
      path: nodeModulesPath,
      details: installed ? 'All dependencies installed' : 'Run npm install',
      canSkip: true
    };
  }

  /**
   * Check if test files exist
   */
  private async checkTests(): Promise<PreFlightCheckItem> {
    const testDirs = ['test', 'tests', '__tests__'];
    const testPatterns = ['*.test.ts', '*.spec.ts', '*.test.js', '*.spec.js'];
    let testFilesFound = false;

    // Check common test directories
    for (const dir of testDirs) {
      const dirPath = join(this.options.projectPath, dir);
      if (existsSync(dirPath)) {
        try {
          const files = await fs.readdir(dirPath, { withFileTypes: true });
          const hasTestFiles = files.some(f =>
            f.isFile() && (f.name.endsWith('.test.ts') ||
                          f.name.endsWith('.spec.ts') ||
                          f.name.endsWith('.test.js') ||
                          f.name.endsWith('.spec.js'))
          );
          if (hasTestFiles) {
            testFilesFound = true;
            break;
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    }

    // Also check root and src directories for test files
    if (!testFilesFound) {
      const rootFiles = await fs.readdir(this.options.projectPath);
      testFilesFound = rootFiles.some(f =>
        f.endsWith('.test.ts') || f.endsWith('.spec.ts')
      );
    }

    // Check src directory
    if (!testFilesFound) {
      const srcPath = join(this.options.projectPath, 'src');
      if (existsSync(srcPath)) {
        try {
          const files = await fs.readdir(srcPath, { withFileTypes: true });
          testFilesFound = files.some(f =>
            f.isFile() && (f.name.endsWith('.test.ts') || f.name.endsWith('.spec.ts'))
          );
        } catch {
          // Skip errors
        }
      }
    }

    return {
      id: 'tests',
      name: 'Test Files',
      description: 'Test files exist for the project',
      status: testFilesFound ? PreFlightStatus.READY : PreFlightStatus.MISSING,
      details: testFilesFound
        ? 'Test files found in test/, tests/, or alongside source files'
        : 'No test files found',
      canSkip: true
    };
  }

  /**
   * Check if documentation exists
   */
  private async checkDocumentation(): Promise<PreFlightCheckItem> {
    const docPaths = [
      'README.md',
      'docs',
      'SPEC.md',
      'SPECIFICATION.md',
      '.bmad'
    ];

    let docFound = false;
    let foundDoc: string | undefined;

    for (const docPath of docPaths) {
      const fullPath = join(this.options.projectPath, docPath);
      if (existsSync(fullPath)) {
        docFound = true;
        foundDoc = docPath;
        break;
      }
    }

    // Check for .bmad directory with docs
    if (!docFound) {
      const bmadPath = join(this.options.projectPath, '.bmad');
      if (existsSync(bmadPath)) {
        try {
          const files = await fs.readdir(bmadPath);
          if (files.length > 0) {
            docFound = true;
            foundDoc = '.bmad/';
          }
        } catch {
          // Skip errors
        }
      }
    }

    return {
      id: 'documentation',
      name: 'Documentation',
      description: 'Project has documentation (README, SPEC, or .bmad folder)',
      status: docFound ? PreFlightStatus.READY : PreFlightStatus.MISSING,
      path: foundDoc ? join(this.options.projectPath, foundDoc) : undefined,
      details: docFound ? `Found: ${foundDoc}` : 'No documentation found',
      canSkip: true
    };
  }

  /**
   * Mark a check as skipped with a reason
   */
  async skipCheck(checkId: string, reason: string): Promise<void> {
    // This would update state if needed - currently not persisted
    console.log(`[PreFlight] Skipping ${checkId}: ${reason}`);
  }
}

/**
 * Convenience function to run pre-flight checks
 */
export async function runPreFlightChecks(
  projectPath: string,
  options?: Partial<PreFlightOptions>
): Promise<PreFlightResult> {
  const checker = new PreFlightChecker({
    projectPath,
    ...options
  });

  return checker.check();
}
