// Security Headers Validator - Validate security headers in web projects
// Story 6.4: Security Header Validation
// AC: Dado projeto web, Quando validação de headers executa, Então verifica CSP, X-Frame-Options, X-Content-Type-Options

import { promises as fs } from 'fs';
import { join } from 'path';
import { HeaderFinding, VulnerabilitySeverity } from './types.js';

// Required security headers
const REQUIRED_HEADERS: Array<{
  header: string;
  expectedValues?: string[];
  severity: VulnerabilitySeverity;
  recommendation: string;
}> = [
  {
    header: 'Content-Security-Policy',
    severity: VulnerabilitySeverity.HIGH,
    recommendation: 'Add Content-Security-Policy header to prevent XSS and data injection attacks'
  },
  {
    header: 'X-Frame-Options',
    expectedValues: ['DENY', 'SAMEORIGIN'],
    severity: VulnerabilitySeverity.MEDIUM,
    recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking'
  },
  {
    header: 'X-Content-Type-Options',
    expectedValues: ['nosniff'],
    severity: VulnerabilitySeverity.MEDIUM,
    recommendation: 'Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing'
  },
  {
    header: 'Strict-Transport-Security',
    expectedValues: ['max-age'],
    severity: VulnerabilitySeverity.HIGH,
    recommendation: 'Add Strict-Transport-Security header to enforce HTTPS'
  },
  {
    header: 'X-XSS-Protection',
    expectedValues: ['1; mode=block'],
    severity: VulnerabilitySeverity.LOW,
    recommendation: 'Add X-XSS-Protection header for legacy browser support'
  },
  {
    header: 'Referrer-Policy',
    expectedValues: ['no-referrer', 'same-origin', 'strict-origin-when-cross-origin'],
    severity: VulnerabilitySeverity.LOW,
    recommendation: 'Add Referrer-Policy to control referrer information'
  },
  {
    header: 'Permissions-Policy',
    severity: VulnerabilitySeverity.LOW,
    recommendation: 'Add Permissions-Policy to control browser features'
  }
];

// Files to check for header configuration
const CONFIG_FILES = [
  'package.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.ts',
  'nuxt.config.ts',
  'express.ts',
  'express.js',
  'app.ts',
  'app.js',
  'server.ts',
  'server.js',
  'http-server.config.js',
  'helmet.config.js',
  'helmet.config.ts'
];

export class SecurityHeadersValidator {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async validate(): Promise<HeaderFinding[]> {
    const findings: HeaderFinding[] = [];

    // Check for package.json to identify the framework
    const packageJson = await this.findPackageJson();

    if (packageJson) {
      // Check if helmet is used
      const usesHelmet = await this.checkHelmetUsage(packageJson);

      if (usesHelmet) {
        // Helmet is being used - check configuration
        const helmetConfig = await this.findHelmetConfig();
        if (helmetConfig) {
          const configFindings = await this.analyzeHelmetConfig(helmetConfig);
          findings.push(...configFindings);
        }
      } else {
        // Helmet not used - report missing headers
        for (const header of REQUIRED_HEADERS) {
          findings.push({
            header: header.header,
            severity: header.severity,
            recommendation: header.recommendation
          });
        }
      }
    }

    return findings;
  }

  private async findPackageJson(): Promise<{ path: string; content: any } | null> {
    const packagePath = join(this.projectPath, 'package.json');

    try {
      const content = await fs.readFile(packagePath, 'utf-8');
      return { path: packagePath, content: JSON.parse(content) };
    } catch {
      return null;
    }
  }

  private async checkHelmetUsage(packageJson: { path: string; content: any }): Promise<boolean> {
    const deps = {
      ...packageJson.content.dependencies,
      ...packageJson.content.devDependencies
    };

    return 'helmet' in deps;
  }

  private async findHelmetConfig(): Promise<string | null> {
    for (const configFile of CONFIG_FILES) {
      const configPath = join(this.projectPath, configFile);
      try {
        await fs.access(configPath);
        const content = await fs.readFile(configPath, 'utf-8');

        // Check if file contains helmet configuration
        if (content.includes('helmet')) {
          return configPath;
        }
      } catch {
        // File doesn't exist, continue to next
      }
    }

    return null;
  }

  private async analyzeHelmetConfig(configPath: string): Promise<HeaderFinding[]> {
    const findings: HeaderFinding[] = [];
    const content = await fs.readFile(configPath, 'utf-8');

    for (const header of REQUIRED_HEADERS) {
      // Check if header is configured
      const headerConfigured = content.includes(header.header) ||
        this.getShortHeaderName(header.header) + '(';

      if (!headerConfigured) {
        findings.push({
          header: header.header,
          severity: header.severity,
          recommendation: header.recommendation
        });
      } else if (header.expectedValues) {
        // Check if header has proper value
        const hasProperValue = header.expectedValues.some(value =>
          content.includes(value)
        );

        if (!hasProperValue) {
          findings.push({
            header: header.header,
            expected: header.expectedValues.join(' or '),
            severity: VulnerabilitySeverity.LOW,
            recommendation: `Configure ${header.header} with recommended value: ${header.expectedValues[0]}`
          });
        }
      }
    }

    return findings;
  }

  private getShortHeaderName(header: string): string {
    // Convert header name to camelCase for JS config
    return header
      .toLowerCase()
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
