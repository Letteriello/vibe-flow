// Pre-Flight Check Engine - Validate project readiness before code generation
// Story 7.1: Pre-Flight Check Engine

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { PreFlightCheck, PreFlightResult, CheckStatus } from './types.js';

export class PreFlightChecker {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async runChecks(): Promise<PreFlightResult> {
    const checks: PreFlightCheck[] = [];

    // Run all check categories
    checks.push(...await this.checkDependencies());
    checks.push(...await this.checkTests());
    checks.push(...await this.checkDocumentation());
    checks.push(...await this.checkConfiguration());
    checks.push(...await this.checkSecurity());

    const summary = this.calculateSummary(checks);
    const overallScore = this.calculateScore(checks);

    return {
      timestamp: new Date().toISOString(),
      projectPath: this.projectPath,
      checks,
      summary,
      overallScore,
      canProceed: overallScore >= 70
    };
  }

  private async checkDependencies(): Promise<PreFlightCheck[]> {
    const checks: PreFlightCheck[] = [];

    // Check for package.json
    try {
      const packagePath = join(this.projectPath, 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      checks.push({
        id: 'deps-package-json',
        name: 'package.json exists',
        description: 'Project has a package.json file',
        status: CheckStatus.READY,
        category: 'dependencies',
        details: `Found package.json with ${Object.keys(pkg.dependencies || {}).length} dependencies`
      });

      // Check for node_modules
      const modulesPath = join(this.projectPath, 'node_modules');
      try {
        await fs.access(modulesPath);
        checks.push({
          id: 'deps-modules',
          name: 'Dependencies installed',
          description: 'node_modules directory exists',
          status: CheckStatus.READY,
          category: 'dependencies',
          details: 'All dependencies are installed'
        });
      } catch {
        checks.push({
          id: 'deps-modules',
          name: 'Dependencies installed',
          description: 'node_modules directory exists',
          status: CheckStatus.MISSING,
          category: 'dependencies',
          details: 'Run npm install to install dependencies',
          recommendation: 'npm install'
        });
      }

      // Check for lock file
      const lockPath = join(this.projectPath, 'package-lock.json');
      try {
        await fs.access(lockPath);
        checks.push({
          id: 'deps-lock',
          name: 'Lock file present',
          description: 'Package lock file exists for reproducible builds',
          status: CheckStatus.READY,
          category: 'dependencies'
        });
      } catch {
        checks.push({
          id: 'deps-lock',
          name: 'Lock file present',
          description: 'Package lock file exists for reproducible builds',
          status: CheckStatus.WARNING,
          category: 'dependencies',
          recommendation: 'Run npm install to create package-lock.json'
        });
      }
    } catch {
      checks.push({
        id: 'deps-package-json',
        name: 'package.json exists',
        description: 'Project has a package.json file',
        status: CheckStatus.MISSING,
        category: 'dependencies',
        recommendation: 'Initialize project with npm init'
      });
    }

    return checks;
  }

  private async checkTests(): Promise<PreFlightCheck[]> {
    const checks: PreFlightCheck[] = [];

    // Check for test configuration
    const hasJest = await this.hasTestFramework('jest');
    const hasMocha = await this.hasTestFramework('mocha');
    const hasVitest = await this.hasTestFramework('vitest');

    if (hasJest || hasMocha || hasVitest) {
      const framework = hasJest ? 'Jest' : hasMocha ? 'Mocha' : 'Vitest';
      checks.push({
        id: 'test-framework',
        name: 'Test framework configured',
        description: `Project has ${framework} configured`,
        status: CheckStatus.READY,
        category: 'tests'
      });

      // Check for test directory
      const testDirs = ['tests', 'test', '__tests__', 'spec'];
      let foundTestDir = false;
      for (const dir of testDirs) {
        const testPath = join(this.projectPath, dir);
        try {
          const stat = await fs.stat(testPath);
          if (stat.isDirectory()) {
            foundTestDir = true;
            checks.push({
              id: 'test-directory',
              name: 'Test directory exists',
              description: `Found ${dir} directory`,
              status: CheckStatus.READY,
              category: 'tests',
              details: `${dir}/`
            });
            break;
          }
        } catch {
          // Directory doesn't exist
        }
      }

      if (!foundTestDir) {
        checks.push({
          id: 'test-directory',
          name: 'Test directory exists',
          description: 'Project has a test directory',
          status: CheckStatus.NEEDS_REVIEW,
          category: 'tests',
          recommendation: 'Consider adding a tests/ or __tests__/ directory'
        });
      }
    } else {
      checks.push({
        id: 'test-framework',
        name: 'Test framework configured',
        description: 'Project has a test framework configured',
        status: CheckStatus.MISSING,
        category: 'tests',
        recommendation: 'Add Jest, Mocha, or Vitest for testing'
      });
    }

    return checks;
  }

  private async hasTestFramework(framework: string): Promise<boolean> {
    try {
      const packagePath = join(this.projectPath, 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return framework in deps;
    } catch {
      return false;
    }
  }

  private async checkDocumentation(): Promise<PreFlightCheck[]> {
    const checks: PreFlightCheck[] = [];

    // Check for README
    const readmeFiles = ['README.md', 'README.txt', 'README'];
    let hasReadme = false;
    for (const file of readmeFiles) {
      const readmePath = join(this.projectPath, file);
      try {
        await fs.access(readmePath);
        hasReadme = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    checks.push({
      id: 'docs-readme',
      name: 'README documentation',
      description: 'Project has a README file',
      status: hasReadme ? CheckStatus.READY : CheckStatus.MISSING,
      category: 'documentation',
      recommendation: hasReadme ? undefined : 'Create README.md with project documentation'
    });

    // Check for LICENSE
    const licensePath = join(this.projectPath, 'LICENSE');
    try {
      await fs.access(licensePath);
      checks.push({
        id: 'docs-license',
        name: 'License file',
        description: 'Project has a LICENSE file',
        status: CheckStatus.READY,
        category: 'documentation'
      });
    } catch {
      checks.push({
        id: 'docs-license',
        name: 'License file',
        description: 'Project has a LICENSE file',
        status: CheckStatus.WARNING,
        category: 'documentation',
        recommendation: 'Add a LICENSE file'
      });
    }

    // Check for tsconfig or jsconfig
    const configFiles = ['tsconfig.json', 'jsconfig.json'];
    let hasConfig = false;
    for (const file of configFiles) {
      const configPath = join(this.projectPath, file);
      try {
        await fs.access(configPath);
        hasConfig = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    checks.push({
      id: 'docs-config',
      name: 'TypeScript/JavaScript config',
      description: 'Project has a tsconfig.json or jsconfig.json',
      status: hasConfig ? CheckStatus.READY : CheckStatus.WARNING,
      category: 'documentation',
      recommendation: hasConfig ? undefined : 'Create tsconfig.json for TypeScript or jsconfig.json for JavaScript'
    });

    return checks;
  }

  private async checkConfiguration(): Promise<PreFlightCheck[]> {
    const checks: PreFlightCheck[] = [];

    // Check for .gitignore
    const gitignorePath = join(this.projectPath, '.gitignore');
    try {
      await fs.access(gitignorePath);
      checks.push({
        id: 'config-gitignore',
        name: '.gitignore configured',
        description: 'Project has a .gitignore file',
        status: CheckStatus.READY,
        category: 'configuration'
      });
    } catch {
      checks.push({
        id: 'config-gitignore',
        name: '.gitignore configured',
        description: 'Project has a .gitignore file',
        status: CheckStatus.WARNING,
        category: 'configuration',
        recommendation: 'Create .gitignore to exclude node_modules, dist, etc.'
      });
    }

    // Check for eslint config
    const eslintFiles = ['.eslintrc', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js'];
    let hasEslint = false;
    for (const file of eslintFiles) {
      const eslintPath = join(this.projectPath, file);
      try {
        await fs.access(eslintPath);
        hasEslint = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    checks.push({
      id: 'config-eslint',
      name: 'ESLint configured',
      description: 'Project has ESLint configuration',
      status: hasEslint ? CheckStatus.READY : CheckStatus.WARNING,
      category: 'configuration',
      recommendation: hasEslint ? undefined : 'Add ESLint for code quality'
    });

    // Check for prettier config
    const prettierFiles = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];
    let hasPrettier = false;
    for (const file of prettierFiles) {
      const prettierPath = join(this.projectPath, file);
      try {
        await fs.access(prettierPath);
        hasPrettier = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    checks.push({
      id: 'config-prettier',
      name: 'Prettier configured',
      description: 'Project has Prettier configuration',
      status: hasPrettier ? CheckStatus.READY : CheckStatus.WARNING,
      category: 'configuration',
      recommendation: hasPrettier ? undefined : 'Add Prettier for code formatting'
    });

    return checks;
  }

  private async checkSecurity(): Promise<PreFlightCheck[]> {
    const checks: PreFlightCheck[] = [];

    // Check for security policy
    const securityFiles = ['SECURITY.md', 'security.md'];
    let hasSecurityPolicy = false;
    for (const file of securityFiles) {
      const securityPath = join(this.projectPath, file);
      try {
        await fs.access(securityPath);
        hasSecurityPolicy = true;
        break;
      } catch {
        // File doesn't exist
      }
    }

    checks.push({
      id: 'security-policy',
      name: 'Security policy',
      description: 'Project has a SECURITY.md file',
      status: hasSecurityPolicy ? CheckStatus.READY : CheckStatus.WARNING,
      category: 'security',
      recommendation: hasSecurityPolicy ? undefined : 'Create SECURITY.md with vulnerability reporting instructions'
    });

    // Check for .npmrc with proper settings
    const npmrcPath = join(this.projectPath, '.npmrc');
    try {
      const content = await fs.readFile(npmrcPath, 'utf-8');
      const hasAuditFund = content.includes('audit=true') || content.includes('fund=true');
      checks.push({
        id: 'security-npmrc',
        name: '.npmrc configured',
        description: 'Project has .npmrc configuration',
        status: CheckStatus.READY,
        category: 'security'
      });
    } catch {
      // No .npmrc - just a warning
      checks.push({
        id: 'security-npmrc',
        name: '.npmrc configured',
        description: 'Project has .npmrc configuration',
        status: CheckStatus.WARNING,
        category: 'security',
        recommendation: 'Consider adding .npmrc for audit and fund settings'
      });
    }

    return checks;
  }

  private calculateSummary(checks: PreFlightCheck[]): PreFlightResult['summary'] {
    return {
      total: checks.length,
      ready: checks.filter(c => c.status === CheckStatus.READY).length,
      missing: checks.filter(c => c.status === CheckStatus.MISSING).length,
      needsReview: checks.filter(c => c.status === CheckStatus.NEEDS_REVIEW).length,
      warning: checks.filter(c => c.status === CheckStatus.WARNING).length
    };
  }

  private calculateScore(checks: PreFlightCheck[]): number {
    if (checks.length === 0) return 0;

    let score = 0;
    for (const check of checks) {
      switch (check.status) {
        case CheckStatus.READY:
          score += 10;
          break;
        case CheckStatus.WARNING:
          score += 5;
          break;
        case CheckStatus.NEEDS_REVIEW:
          score += 3;
          break;
        case CheckStatus.MISSING:
          score += 0;
          break;
      }
    }

    return Math.round((score / (checks.length * 10)) * 100);
  }
}
