// SecurityGuard - OWASP Security Scanner Wrapper for Quality Gate
// Self-contained version without external security module dependencies

import { promises as fs } from 'fs';
import { join, extname } from 'path';

// ============================================
// Security Severity
// ============================================

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ============================================
// Vulnerability Types
// ============================================

export interface OWASPViolation {
  rule: string;
  severity: SecuritySeverity;
  category: string;
  description: string;
  file: string;
  line: number;
  recommendation?: string;
  cwe?: string;
  owasp?: string;
}

export interface OWASPScanResult {
  pathsScanned: string[];
  violations: OWASPViolation[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  blocked: boolean;
}

// ============================================
// Security Gate Configuration
// ============================================

export interface SecurityGateConfig {
  enabled: boolean;
  severityThreshold: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  allowBypass: boolean;
  excludedPatterns: string[];
  fastMode: {
    enabled: boolean;
    scanStagedOnly: boolean;
  };
  rules: Record<string, boolean>;
}

// Default configuration
export const DEFAULT_SECURITY_GATE_CONFIG: SecurityGateConfig = {
  enabled: true,
  severityThreshold: 'HIGH',
  allowBypass: false,
  excludedPatterns: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**'
  ],
  fastMode: {
    enabled: true,
    scanStagedOnly: true
  },
  rules: {}
};

// ============================================
// Security Scan Result
// ============================================

export interface SecurityQualityCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'error' | 'warning' | 'info';
  vulnerabilities: OWASPViolation[];
  blocked: boolean;
  scanDuration: number;
  pathsScanned: string[];
}

// ============================================
// SecurityGuard Class
// ============================================

export class SecurityGuard {
  private projectPath: string;
  private config: SecurityGateConfig;

  // Simple vulnerability patterns for self-contained scanning
  private readonly VULNERABILITY_PATTERNS = [
    {
      pattern: /process\.env\.[A-Z_]+(?!\s*===)/g,
      severity: 'high' as SecuritySeverity,
      category: 'Hardcoded Secret',
      description: 'Potential hardcoded environment variable access',
      recommendation: 'Use environment variables properly'
    },
    {
      pattern: /password\s*[=:]\s*["'][^"']{8,}["']/gi,
      severity: 'critical' as SecuritySeverity,
      category: 'Hardcoded Secret',
      description: 'Hardcoded password detected',
      recommendation: 'Use environment variables for secrets'
    },
    {
      pattern: /api[_-]?key\s*[=:]\s*["'][^"']{16,}["']/gi,
      severity: 'critical' as SecuritySeverity,
      category: 'Hardcoded Secret',
      description: 'Hardcoded API key detected',
      recommendation: 'Use environment variables for secrets'
    },
    {
      pattern: /eval\s*\(/g,
      severity: 'high' as SecuritySeverity,
      category: 'Code Injection',
      description: 'Use of eval() detected',
      recommendation: 'Avoid eval(), use safer alternatives'
    },
    {
      pattern: /innerHTML\s*=/g,
      severity: 'medium' as SecuritySeverity,
      category: 'XSS',
      description: 'Direct innerHTML assignment - potential XSS',
      recommendation: 'Use textContent or sanitize input'
    },
    {
      pattern: /execute\s*\(\s*["']/g,
      severity: 'high' as SecuritySeverity,
      category: 'Command Injection',
      description: 'Dynamic command execution detected',
      recommendation: 'Avoid dynamic command execution'
    },
    {
      pattern: /SQL\s*injection|sql\s+injection/gi,
      severity: 'high' as SecuritySeverity,
      category: 'SQL Injection',
      description: 'Potential SQL injection vulnerability',
      recommendation: 'Use parameterized queries'
    },
    {
      pattern: /FIXME|TODO|XXX|HACK/gi,
      severity: 'low' as SecuritySeverity,
      category: 'Code Quality',
      description: 'Incomplete code marker found',
      recommendation: 'Complete or remove TODO comments'
    }
  ];

  constructor(projectPath: string = process.cwd(), config?: Partial<SecurityGateConfig>) {
    this.projectPath = projectPath;
    this.config = { ...DEFAULT_SECURITY_GATE_CONFIG, ...config };
  }

  /**
   * Run full security scan on project files
   */
  async runSecurityScan(customPaths?: string[]): Promise<SecurityQualityCheck> {
    const startTime = Date.now();

    try {
      // Get files to scan
      const paths = customPaths || await this.getProjectFiles();

      if (paths.length === 0) {
        return this.createEmptyCheck(startTime, 'No files to scan');
      }

      // Run scan on all files
      const allViolations: OWASPViolation[] = [];
      const scannedPaths: string[] = [];

      for (const filePath of paths) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const violations = this.scanContent(content, filePath);
          allViolations.push(...violations);
          scannedPaths.push(filePath);
        } catch {
          // Skip files that can't be read
        }
      }

      // Determine if should block based on threshold
      const blocked = this.shouldBlockViolations(allViolations);

      // Build details message
      const details = this.buildDetailsMessage(allViolations, scannedPaths.length);

      return {
        name: 'Security Check (OWASP)',
        passed: !blocked,
        details,
        severity: blocked ? 'error' : this.getSeverityFromViolations(allViolations),
        vulnerabilities: allViolations,
        blocked,
        scanDuration: Date.now() - startTime,
        pathsScanned: scannedPaths
      };
    } catch (error: any) {
      return {
        name: 'Security Check (OWASP)',
        passed: false,
        details: `Security scan failed: ${error.message}`,
        severity: 'error',
        vulnerabilities: [],
        blocked: false,
        scanDuration: Date.now() - startTime,
        pathsScanned: []
      };
    }
  }

  /**
   * Scan content for vulnerabilities
   */
  private scanContent(content: string, filePath: string): OWASPViolation[] {
    const violations: OWASPViolation[] = [];
    const lines = content.split('\n');

    for (const pattern of this.VULNERABILITY_PATTERNS) {
      let match;
      // Reset regex state
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        regex.lastIndex = 0;

        if (regex.test(line)) {
          violations.push({
            rule: pattern.category,
            severity: pattern.severity,
            category: pattern.category,
            description: pattern.description,
            file: filePath,
            line: lineNum + 1,
            recommendation: pattern.recommendation
          });
        }
      }
    }

    return violations;
  }

  /**
   * Quick check for buffer content
   */
  checkContent(content: string, fileName: string = 'buffer'): SecurityQualityCheck {
    const startTime = Date.now();
    const violations = this.scanContent(content, fileName);
    const hasBlocking = this.hasBlockingViolations(violations);

    return {
      name: 'Security Check (OWASP)',
      passed: !hasBlocking,
      details: violations.length > 0
        ? `Found ${violations.length} vulnerability(ies)`
        : 'No security violations detected',
      severity: hasBlocking ? 'error' : 'info',
      vulnerabilities: violations,
      blocked: hasBlocking,
      scanDuration: Date.now() - startTime,
      pathsScanned: [fileName]
    };
  }

  /**
   * Quick validation - returns boolean only
   */
  isSecure(content: string): boolean {
    const violations = this.scanContent(content, 'buffer');
    return !this.hasBlockingViolations(violations);
  }

  /**
   * Check if there are blocking violations
   */
  private hasBlockingViolations(violations: OWASPViolation[]): boolean {
    for (const v of violations) {
      if (this.isBlockingSeverity(v.severity)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Determine if severity should block
   */
  private shouldBlockViolations(violations: OWASPViolation[]): boolean {
    for (const v of violations) {
      if (this.isBlockingSeverity(v.severity)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if severity is blocking
   */
  private isBlockingSeverity(severity: SecuritySeverity): boolean {
    switch (this.config.severityThreshold) {
      case 'CRITICAL':
        return severity === 'critical';
      case 'HIGH':
        return severity === 'critical' || severity === 'high';
      case 'MEDIUM':
        return severity !== 'low' && severity !== 'info';
      default:
        return severity === 'critical' || severity === 'high';
    }
  }

  /**
   * Get severity level from violations
   */
  private getSeverityFromViolations(violations: OWASPViolation[]): 'error' | 'warning' | 'info' {
    const hasBlocking = violations.some(v => this.isBlockingSeverity(v.severity));
    if (hasBlocking) return 'error';

    const hasMedium = violations.some(v => v.severity === 'medium');
    if (hasMedium) return 'warning';

    return 'info';
  }

  /**
   * Build details message from violations
   */
  private buildDetailsMessage(violations: OWASPViolation[], filesScanned: number): string {
    if (violations.length === 0) {
      return `Scanned ${filesScanned} file(s) - No vulnerabilities found`;
    }

    const summary = {
      critical: violations.filter(v => v.severity === 'critical').length,
      high: violations.filter(v => v.severity === 'high').length,
      medium: violations.filter(v => v.severity === 'medium').length,
      low: violations.filter(v => v.severity === 'low').length
    };

    const parts: string[] = [];
    if (summary.critical > 0) parts.push(`${summary.critical} CRITICAL`);
    if (summary.high > 0) parts.push(`${summary.high} HIGH`);
    if (summary.medium > 0) parts.push(`${summary.medium} MEDIUM`);
    if (summary.low > 0) parts.push(`${summary.low} LOW`);

    return `Scanned ${filesScanned} file(s) - Found: ${parts.join(', ')}`;
  }

  /**
   * Get all project TypeScript/JavaScript files
   */
  private async getProjectFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.scanDirectory(this.projectPath, files);
    return files.filter(f => this.shouldScan(f));
  }

  /**
   * Recursively scan directory for files
   */
  private async scanDirectory(dir: string, files: string[]): Promise<void> {
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip excluded patterns
        if (this.isExcluded(fullPath)) continue;

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, files);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (codeExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  /**
   * Check if path should be excluded
   */
  private isExcluded(path: string): boolean {
    const relativePath = path.replace(this.projectPath, '').replace(/\\/g, '/');

    for (const pattern of this.config.excludedPatterns) {
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');

      if (new RegExp(`^${regexPattern}$`).test(relativePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file should be scanned
   */
  private shouldScan(filePath: string): boolean {
    return !this.isExcluded(filePath);
  }

  /**
   * Create empty check result
   */
  private createEmptyCheck(startTime: number, message: string): SecurityQualityCheck {
    return {
      name: 'Security Check (OWASP)',
      passed: true,
      details: message,
      severity: 'info',
      vulnerabilities: [],
      blocked: false,
      scanDuration: Date.now() - startTime,
      pathsScanned: []
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityGateConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SecurityGateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get vulnerability patterns count
   */
  getRulesCount(): number {
    return this.VULNERABILITY_PATTERNS.length;
  }

  /**
   * Validate - returns quality gate compatible result
   * Used by QualityGateInterceptor
   */
  async validate(): Promise<{
    valid: boolean;
    passed: boolean;
    errors: string[];
    warnings: string[];
    score: number;
    vulnerabilities: OWASPViolation[];
    details: string;
  }> {
    const result = await this.runSecurityScan();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Categorize violations
    for (const v of result.vulnerabilities) {
      if (v.severity === 'critical' || v.severity === 'high') {
        errors.push(`[${v.severity.toUpperCase()}] ${v.category}: ${v.description} (${v.file}:${v.line})`);
      } else if (v.severity === 'medium') {
        warnings.push(`[MEDIUM] ${v.category}: ${v.description} (${v.file}:${v.line})`);
      }
    }

    // Calculate score
    const blockingCount = result.vulnerabilities.filter(v =>
      v.severity === 'critical' || v.severity === 'high'
    ).length;
    const score = blockingCount === 0 ? 10 : Math.max(0, 10 - blockingCount);

    return {
      valid: !result.blocked,
      passed: !result.blocked,
      errors,
      warnings,
      score,
      vulnerabilities: result.vulnerabilities,
      details: result.details
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create SecurityGuard instance
 */
export function createSecurityGuard(
  projectPath?: string,
  config?: Partial<SecurityGateConfig>
): SecurityGuard {
  return new SecurityGuard(projectPath, config);
}

/**
 * Get global SecurityGuard singleton
 */
let globalSecurityGuard: SecurityGuard | null = null;

export function getGlobalSecurityGuard(
  projectPath: string = process.cwd()
): SecurityGuard {
  if (!globalSecurityGuard) {
    globalSecurityGuard = new SecurityGuard(projectPath);
  }
  return globalSecurityGuard;
}

/**
 * Reset global SecurityGuard (for testing)
 */
export function resetGlobalSecurityGuard(): void {
  globalSecurityGuard = null;
}

export default SecurityGuard;
