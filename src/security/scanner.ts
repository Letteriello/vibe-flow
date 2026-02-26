// Security Scanner Engine - Core vulnerability detection
// Story 6.1: Security Scanner Engine

import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { Vulnerability, VulnerabilityCategory, VulnerabilitySeverity, SecurityScanResult, ScanOptions, SecretFinding, HeaderFinding } from './types.js';
import { SecretsDetector } from './secrets-detector.js';
import { SecurityHeadersValidator } from './headers-validator.js';
import { SECRET_PATTERNS, CONFIG_PATTERNS, shouldStopOnSeverity } from './rules.js';
import { scanFiles as owaspScanFiles, scanBuffer as owaspScanBuffer, hasViolations as owaspHasViolations } from './owasp-rules.js';

// Default patterns for OWASP Top 10 detection
const VULNERABILITY_PATTERNS: Array<{
  pattern: RegExp;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}> = [
  // SQL Injection
  {
    pattern: /(?:execute|query|cursor\.execute)\s*\(\s*["'`](?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION).*?\$\{|['"`]\s*\+\s*(?:req\.body|req\.query|req\.params|request\.|params\.|query\.)/gi,
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'SQL Injection vulnerability',
    description: 'User input is directly concatenated into SQL queries without proper parameterization',
    recommendation: 'Use parameterized queries or prepared statements instead of string concatenation',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // Command Injection
  {
    pattern: /(?:exec|spawn|execSync|system|popen|child_process)\s*\(.*?(?:req\.|request\.|params\.|body\.|query\.)/gi,
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Command Injection vulnerability',
    description: 'User input is used in shell commands without sanitization',
    recommendation: 'Avoid using user input in shell commands, or use allow-lists for input validation',
    cwe: 'CWE-78',
    owasp: 'A03:2021'
  },
  // Path Traversal
  {
    pattern: /(?:readFile|readFileSync|open|createReadStream|readdir)\s*\(.*?(?:req\.|request\.|params\.|filename\.|path\.).*?\+/gi,
    category: VulnerabilityCategory.BROKEN_ACCESS,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Path Traversal vulnerability',
    description: 'File path is constructed from user input without validation',
    recommendation: 'Validate and sanitize file paths, use allow-lists for permitted paths',
    cwe: 'CWE-22',
    owasp: 'A01:2021'
  },
  // Hardcoded credentials
  {
    pattern: /(?:password|passwd|pwd|secret|apiKey|apiSecret|accessToken)\s*[=:]\s*["'][^"'\s]{8,}["']/gi,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Hardcoded credentials detected',
    description: 'Sensitive credentials are hardcoded in source code',
    recommendation: 'Move sensitive data to environment variables or secure secret management systems',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Weak crypto
  {
    pattern: /(?:md5|sha1|des|crypt)\s*\(.*?\)/gi,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Weak cryptographic algorithm',
    description: 'Using weak hashing or encryption algorithms',
    recommendation: 'Use strong cryptographic algorithms like SHA-256, bcrypt, or Argon2',
    cwe: 'CWE-327',
    owasp: 'A02:2021'
  },
  // eval() usage
  {
    pattern: /\beval\s*\(/g,
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Dangerous use of eval()',
    description: 'eval() executes arbitrary code and is a major security risk',
    recommendation: 'Avoid eval() and use safer alternatives like JSON.parse()',
    cwe: 'CWE-95',
    owasp: 'A03:2021'
  },
  // Insecure random
  {
    pattern: /Math\.random\s*\(\s*\)/g,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Insecure random number generation',
    description: 'Math.random() is not cryptographically secure',
    recommendation: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive operations',
    cwe: 'CWE-338',
    owasp: 'A02:2021'
  },
  // XSS - innerHTML assignment
  {
    pattern: /\.innerHTML\s*=\s*(?:req\.|request\.|params\.|body\.|userInput|input)/gi,
    category: VulnerabilityCategory.XSS,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Cross-Site Scripting (XSS) vulnerability',
    description: 'User-controlled data is directly assigned to innerHTML without sanitization',
    recommendation: 'Use textContent instead of innerHTML, or sanitize user input with a library like DOMPurify',
    cwe: 'CWE-79',
    owasp: 'A03:2021'
  },
  // Express.js - disabled security headers
  {
    pattern: /helmet\s*\(\s*\{?\s*contentSecurityPolicy\s*:\s*false/gi,
    category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Security header disabled',
    description: 'Content Security Policy is disabled',
    recommendation: 'Enable CSP headers to prevent XSS and data injection attacks',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // Express.js - CORS wildcard
  {
    pattern: /cors\s*\(\s*\{?\s*origin\s*:\s*["']\*["']/gi,
    category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Overly permissive CORS configuration',
    description: 'CORS is set to allow all origins',
    recommendation: 'Restrict CORS to specific trusted origins instead of using wildcard',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // XML external entities
  {
    pattern: /(?:xmldom|xmlparser|DOMParser)\s*\(\s*\{?\s*(?:externalEntityEn|entityEx|disallowDocTypeDecl)\s*:\s*false/gi,
    category: VulnerabilityCategory.XML_EXTERNAL_ENTITIES,
    severity: VulnerabilitySeverity.HIGH,
    title: 'XML External Entity (XXE) vulnerability',
    description: 'XML parser is configured to allow external entity processing',
    recommendation: 'Disable external entity processing in XML parsers',
    cwe: 'CWE-611',
    owasp: 'A04:2021'
  },
  // Insecure deserialization
  {
    pattern: /(?:pickle\.loads|unserialize|yaml\.load)\s*\(\s*(?:req\.|request\.|body\.|params\.)/gi,
    category: VulnerabilityCategory.INSECURE_DESERIALIZATION,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Insecure deserialization',
    description: 'User input is directly deserialized without validation',
    recommendation: 'Use safe serialization formats like JSON, and validate all input data',
    cwe: 'CWE-502',
    owasp: 'A08:2021'
  },
  // Missing authentication
  {
    pattern: /(?:app\.(?:get|post|put|delete|patch)\s*\(\s*["']\/[^"']*["']\s*,\s*(?!.*(?:auth|verify|check|middleware)))/gi,
    category: VulnerabilityCategory.BROKEN_AUTH,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Potential missing authentication',
    description: 'Route may not have authentication middleware',
    recommendation: 'Ensure all sensitive routes have appropriate authentication',
    cwe: 'CWE-306',
    owasp: 'A07:2021'
  },
  // JWT - weak secret
  {
    pattern: /jwt(?:Sign|SignSync)\s*\(\s*\{?\s*secret\s*:\s*["'][^"'\s]{1,20}["']/gi,
    category: VulnerabilityCategory.BROKEN_AUTH,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Weak JWT secret',
    description: 'JWT is signed with a weak secret',
    recommendation: 'Use a strong, random secret of at least 256 bits',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Stripe Test Keys (sk_test_...)
  {
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Stripe Test API Key Detected',
    description: 'Hardcoded Stripe test key found in source code. Test keys should never be committed.',
    recommendation: 'Remove the key and use environment variables (process.env.STRIPE_TEST_KEY)',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Stripe Live Keys (sk_live_...)
  {
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Stripe Live API Key Detected',
    description: 'Hardcoded Stripe live key found in source code. This could lead to financial loss.',
    recommendation: 'Immediately revoke this key and use environment variables',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // JWT Tokens in plaintext
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.HIGH,
    title: 'JWT Token in Plaintext',
    description: 'Hardcoded JWT token found in source code. Tokens should be generated server-side.',
    recommendation: 'Remove the token and implement proper JWT generation',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Cookie without Secure flag
  {
    pattern: /(?:cookie|res\.cookie)\s*\([^)]*(?:secure\s*:\s*(?!true))/gi,
    category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Cookie Missing Secure Flag',
    description: 'Cookie is set without the Secure flag.',
    recommendation: 'Add Secure: true to cookie configuration',
    cwe: 'CWE-614',
    owasp: 'A05:2021'
  },
  // Cookie without httpOnly flag
  {
    pattern: /(?:cookie|res\.cookie)\s*\([^)]*(?:httpOnly\s*:\s*(?!true))/gi,
    category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Cookie Missing httpOnly Flag',
    description: 'Cookie is set without the httpOnly flag, allowing JavaScript access.',
    recommendation: 'Add httpOnly: true to prevent XSS cookie theft',
    cwe: 'CWE-614',
    owasp: 'A05:2021'
  },
  // Helmet completely disabled
  {
    pattern: /helmet\s*\(\s*false\s*\)/gi,
    category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Helmet Security Disabled',
    description: 'Helmet is completely disabled, removing all security headers.',
    recommendation: 'Enable helmet() or configure individual security headers',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  }
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.cs'];

// Default exclusion patterns
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'vendor'
];

export class SecurityScanner {
  private options: Required<ScanOptions>;
  private stopOnCritical: boolean;

  constructor(options: ScanOptions) {
    this.options = {
      projectPath: options.projectPath,
      includePatterns: options.includePatterns || ['**/*'],
      excludePatterns: options.excludePatterns || DEFAULT_EXCLUDE_PATTERNS,
      scanSecrets: options.scanSecrets ?? true,
      scanHeaders: options.scanHeaders ?? false,
      severityThreshold: options.severityThreshold || VulnerabilitySeverity.INFO
    };
    this.stopOnCritical = true; // Default: stop on CRITICAL findings
  }

  /**
   * Run full security scan including vulnerability patterns, secrets detection,
   * and security header validation.
   * Stops early if CRITICAL findings are detected (configurable).
   */
  async scan(): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    const secretsFound: SecretFinding[] = [];
    const headersFindings: HeaderFinding[] = [];
    let filesScanned = 0;

    // Find all scannable files
    const files = await this.findScannableFiles(this.options.projectPath);

    // Phase 1: Scan for vulnerabilities (includes hardcoded secrets patterns)
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileVulns = this.scanFileContent(file, content);
        vulnerabilities.push(...fileVulns);
        filesScanned++;

        // Check if we should stop on CRITICAL findings
        if (this.stopOnCritical) {
          const hasCritical = fileVulns.some(v => v.severity === VulnerabilitySeverity.CRITICAL);
          if (hasCritical) {
            console.warn('[SecurityScanner] CRITICAL vulnerability found. Stopping early.');
            break;
          }
        }
      } catch (error) {
        // Skip files that can't be read
        console.error(`[SecurityScanner] Could not read file ${file}:`, error);
      }
    }

    // Phase 2: Deep secrets detection (if enabled and not stopped early)
    if (this.options.scanSecrets && (!this.stopOnCritical || !vulnerabilities.some(v => v.severity === VulnerabilitySeverity.CRITICAL))) {
      try {
        const secretsDetector = new SecretsDetector(this.options.projectPath, this.options.excludePatterns);
        const detectedSecrets = await secretsDetector.detect();
        secretsFound.push(...detectedSecrets);

        // Add secrets as vulnerabilities
        for (const secret of detectedSecrets) {
          vulnerabilities.push({
            id: secret.id,
            title: `Hardcoded ${secret.type}`,
            description: secret.matchedPattern.substring(0, 50) + '...',
            category: VulnerabilityCategory.SENSITIVE_DATA,
            severity: secret.severity,
            file: secret.file,
            line: secret.line,
            recommendation: secret.recommendation,
            cwe: 'CWE-798',
            owasp: 'A02:2021'
          });
        }
      } catch (error) {
        console.error('[SecurityScanner] Secrets detection failed:', error);
      }
    }

    // Phase 3: Security headers validation (if enabled and not stopped early)
    if (this.options.scanHeaders && (!this.stopOnCritical || !vulnerabilities.some(v => v.severity === VulnerabilitySeverity.CRITICAL))) {
      try {
        const headersValidator = new SecurityHeadersValidator(this.options.projectPath);
        const headerResults = await headersValidator.validate();
        headersFindings.push(...headerResults);

        // Add missing headers as vulnerabilities
        for (const header of headerResults) {
          vulnerabilities.push({
            id: `header-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            title: `Missing Security Header: ${header.header}`,
            description: header.recommendation,
            category: VulnerabilityCategory.SECURITY_MISCONFIGURATION,
            severity: header.severity,
            file: this.options.projectPath,
            recommendation: header.recommendation,
            cwe: 'CWE-346',
            owasp: 'A05:2021'
          });
        }
      } catch (error) {
        console.error('[SecurityScanner] Headers validation failed:', error);
      }
    }

    const severityCounts = this.countSeverities(vulnerabilities);
    const scanDuration = Date.now() - startTime;

    // Determine overall severity level
    const overallSeverity = this.determineOverallSeverity(severityCounts);

    return {
      timestamp: new Date().toISOString(),
      projectPath: this.options.projectPath,
      filesScanned,
      vulnerabilities,
      secretsFound,
      headersFindings,
      summary: severityCounts,
      scanDuration,
      blocked: overallSeverity === VulnerabilitySeverity.CRITICAL
    };
  }

  /**
   * Determine if the scan should be blocked based on findings
   */
  shouldBlock(): boolean {
    return this.stopOnCritical;
  }

  /**
   * Set whether to stop scanning on CRITICAL findings
   */
  setStopOnCritical(stop: boolean): void {
    this.stopOnCritical = stop;
  }

  /**
   * Scan a single file or string content for vulnerabilities
   * Useful for pre-commit hooks scanning staged files
   */
  async scanContent(content: string, filePath: string = 'stdin'): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const vulnerabilities = this.scanFileContent(filePath, content);

    const severityCounts = this.countSeverities(vulnerabilities);
    const scanDuration = Date.now() - startTime;
    const overallSeverity = this.determineOverallSeverity(severityCounts);

    return {
      timestamp: new Date().toISOString(),
      projectPath: filePath,
      filesScanned: 1,
      vulnerabilities,
      secretsFound: [],
      headersFindings: [],
      summary: severityCounts,
      scanDuration,
      blocked: overallSeverity === VulnerabilitySeverity.CRITICAL
    };
  }

  private determineOverallSeverity(severityCounts: SecurityScanResult['summary']): VulnerabilitySeverity {
    if (severityCounts.critical > 0) {
      return VulnerabilitySeverity.CRITICAL;
    }
    if (severityCounts.high > 0) {
      return VulnerabilitySeverity.HIGH;
    }
    if (severityCounts.medium > 0) {
      return VulnerabilitySeverity.MEDIUM;
    }
    if (severityCounts.low > 0) {
      return VulnerabilitySeverity.LOW;
    }
    return VulnerabilitySeverity.INFO;
  }

  private async findScannableFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(currentDir: string, excludePatterns: string[]): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);

          // Check exclusion patterns
          if (excludePatterns.some(pattern =>
            fullPath.includes(pattern) || entry.name === pattern
          )) {
            continue;
          }

          if (entry.isDirectory()) {
            await walk(fullPath, excludePatterns);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (SCANNABLE_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    }

    await walk(dir, this.options.excludePatterns);
    return files;
  }

  private scanFileContent(filePath: string, content: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const lines = content.split('\n');

    for (const rule of VULNERABILITY_PATTERNS) {
      let match;
      // Reset regex state
      rule.pattern.lastIndex = 0;

      // Search in entire content
      while ((match = rule.pattern.exec(content)) !== null) {
        // Find line number
        const lineNumber = this.findLineNumber(content, match.index);

        // Check if severity meets threshold
        if (!this.meetsSeverityThreshold(rule.severity)) {
          continue;
        }

        const vulnerability: Vulnerability = {
          id: `vuln-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: rule.title,
          description: rule.description,
          category: rule.category,
          severity: rule.severity,
          file: filePath,
          line: lineNumber,
          code: this.getCodeContext(lines, lineNumber),
          recommendation: rule.recommendation,
          cwe: rule.cwe,
          owasp: rule.owasp
        };

        // Avoid duplicates
        if (!this.isDuplicate(vulnerabilities, vulnerability)) {
          vulnerabilities.push(vulnerability);
        }
      }
    }

    return vulnerabilities;
  }

  private findLineNumber(content: string, index: number): number {
    const beforeMatch = content.substring(0, index);
    return beforeMatch.split('\n').length;
  }

  private getCodeContext(lines: string[], lineNumber: number): string {
    const context: string[] = [];
    const start = Math.max(0, lineNumber - 2);
    const end = Math.min(lines.length, lineNumber + 1);

    for (let i = start; i < end; i++) {
      const prefix = i === lineNumber - 1 ? '>' : ' ';
      context.push(`${prefix}${i + 1}: ${lines[i]}`);
    }

    return context.join('\n');
  }

  private isDuplicate(existing: Vulnerability[], candidate: Vulnerability): boolean {
    return existing.some(v =>
      v.file === candidate.file &&
      v.line === candidate.line &&
      v.title === candidate.title
    );
  }

  private countSeverities(vulnerabilities: Vulnerability[]): SecurityScanResult['summary'] {
    return {
      critical: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL).length,
      high: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.HIGH).length,
      medium: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.MEDIUM).length,
      low: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.LOW).length,
      info: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.INFO).length
    };
  }

  private meetsSeverityThreshold(severity: VulnerabilitySeverity): boolean {
    const levels = [
      VulnerabilitySeverity.INFO,
      VulnerabilitySeverity.LOW,
      VulnerabilitySeverity.MEDIUM,
      VulnerabilitySeverity.HIGH,
      VulnerabilitySeverity.CRITICAL
    ];

    const severityLevel = levels.indexOf(severity);
    const thresholdLevel = levels.indexOf(this.options.severityThreshold);

    return severityLevel >= thresholdLevel;
  }
}

// ============================================
// Export Wrapper Functions (OWASP Integration)
// ============================================

/**
 * Scan specified file paths for security vulnerabilities.
 * Blocks workflow advancement if CRITICAL or HIGH severity issues are detected.
 *
 * @param paths - Array of file paths to scan
 * @returns SecurityReport with vulnerabilities and blocked status
 */
export async function scanFiles(paths: string[]): Promise<SecurityScanResult> {
  const startTime = Date.now();
  const vulnerabilities: Vulnerability[] = [];
  let filesScanned = 0;

  // Scan each file using OWASP rules
  const owaspResult = await owaspScanFiles(paths);

  // Convert OWASP violations to Vulnerability format with deduplication
  const seenVulnerabilities = new Set<string>();
  for (const violation of owaspResult.violations) {
    // Deduplicate by file-line-ruleName
    const dedupKey = `${violation.file}:${violation.line}:${violation.ruleName}`;
    if (seenVulnerabilities.has(dedupKey)) {
      continue;
    }
    seenVulnerabilities.add(dedupKey);

    vulnerabilities.push({
      id: violation.ruleId,
      title: violation.ruleName,
      description: violation.description,
      category: violation.category,
      severity: violation.severity,
      file: violation.file,
      line: violation.line,
      code: violation.code,
      recommendation: violation.recommendation,
      cwe: violation.cwe,
      owasp: violation.owasp
    });
  }

  filesScanned = owaspResult.pathsScanned.length;

  const severityCounts = {
    critical: owaspResult.summary.critical,
    high: owaspResult.summary.high,
    medium: owaspResult.summary.medium,
    low: owaspResult.summary.low,
    info: 0
  };

  const scanDuration = Date.now() - startTime;

  // Determine overall severity
  let overallSeverity = VulnerabilitySeverity.INFO;
  if (owaspResult.summary.critical > 0) {
    overallSeverity = VulnerabilitySeverity.CRITICAL;
  } else if (owaspResult.summary.high > 0) {
    overallSeverity = VulnerabilitySeverity.HIGH;
  } else if (owaspResult.summary.medium > 0) {
    overallSeverity = VulnerabilitySeverity.MEDIUM;
  } else if (owaspResult.summary.low > 0) {
    overallSeverity = VulnerabilitySeverity.LOW;
  }

  // Block if CRITICAL or HIGH severity violations found
  const blocked = owaspResult.blocked;

  if (blocked) {
    console.warn('[SecurityScanner] BLOCKED: CRITICAL or HIGH severity vulnerabilities detected.');
    console.warn('[SecurityScanner] Fix the following issues before proceeding:');
    for (const v of vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL || v.severity === VulnerabilitySeverity.HIGH)) {
      console.warn(`  - [${v.severity}] ${v.title} in ${v.file}:${v.line}`);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectPath: paths.join(', '),
    filesScanned,
    vulnerabilities,
    secretsFound: [],
    headersFindings: [],
    summary: severityCounts,
    scanDuration,
    blocked
  };
}

/**
 * Scan buffer content for security vulnerabilities.
 * Quick validation function for code snippets or staged files.
 *
 * @param content - Buffer or string content to scan
 * @param filePath - Optional file path for reporting
 * @returns SecurityReport with scan results
 */
export function scanBuffer(content: string | Buffer, filePath: string = 'buffer'): SecurityScanResult {
  const startTime = Date.now();
  const contentStr = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

  const violations = owaspScanBuffer(contentStr, filePath);

  const vulnerabilities: Vulnerability[] = violations.map(v => ({
    id: v.ruleId,
    title: v.ruleName,
    description: v.description,
    category: v.category,
    severity: v.severity,
    file: v.file,
    line: v.line,
    code: v.code,
    recommendation: v.recommendation,
    cwe: v.cwe,
    owasp: v.owasp
  }));

  const severityCounts = {
    critical: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL).length,
    high: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.HIGH).length,
    medium: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.MEDIUM).length,
    low: vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.LOW).length,
    info: 0
  };

  const scanDuration = Date.now() - startTime;

  let overallSeverity = VulnerabilitySeverity.INFO;
  if (severityCounts.critical > 0) {
    overallSeverity = VulnerabilitySeverity.CRITICAL;
  } else if (severityCounts.high > 0) {
    overallSeverity = VulnerabilitySeverity.HIGH;
  } else if (severityCounts.medium > 0) {
    overallSeverity = VulnerabilitySeverity.MEDIUM;
  } else if (severityCounts.low > 0) {
    overallSeverity = VulnerabilitySeverity.LOW;
  }

  const blocked = severityCounts.critical > 0 || severityCounts.high > 0;

  return {
    timestamp: new Date().toISOString(),
    projectPath: filePath,
    filesScanned: 1,
    vulnerabilities,
    secretsFound: [],
    headersFindings: [],
    summary: severityCounts,
    scanDuration,
    blocked
  };
}

/**
 * Quick check if content has critical security issues.
 *
 * @param content - Buffer or string content to check
 * @returns true if CRITICAL or HIGH severity issues detected
 */
export function hasCriticalIssues(content: string | Buffer): boolean {
  const contentStr = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
  return owaspHasViolations(contentStr);
}
