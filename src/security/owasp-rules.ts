// OWASP Security Rules - Strict static analysis rules for vulnerability detection
// Focus: Hardcoded secrets, SQL injection, and missing sanitization

import { Vulnerability, VulnerabilityCategory, VulnerabilitySeverity, SecurityScanResult } from './types.js';

// ============================================
// OWASP Rule Interfaces
// ============================================

export interface OWASPRule {
  id: string;
  name: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  pattern: RegExp;
  description: string;
  recommendation: string;
  cwe: string;
  owasp: string;
}

export interface OWASPScanResult {
  timestamp: string;
  pathsScanned: string[];
  violations: OWASPViolation[];
  blocked: boolean;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface OWASPViolation {
  ruleId: string;
  ruleName: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  file: string;
  line: number;
  code: string;
  description: string;
  recommendation: string;
  cwe: string;
  owasp: string;
}

// ============================================
// Hardcoded Secrets Detection Rules
// ============================================

const HARDCODED_SECRET_RULES: OWASPRule[] = [
  // AWS Keys
  {
    id: 'OWASP-HC-001',
    name: 'AWS Access Key ID',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/,
    description: 'AWS Access Key ID hardcoded in source code',
    recommendation: 'Use environment variables: process.env.AWS_ACCESS_KEY_ID',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  {
    id: 'OWASP-HC-002',
    name: 'AWS Secret Key',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:aws[_-]?secret[_-]?(?:access[_-]?key)?|AWS_SECRET)\s*[=:]\s*["'][A-Za-z0-9\/+=]{40}["']/,
    description: 'AWS Secret Access Key hardcoded in source code',
    recommendation: 'Use environment variables: process.env.AWS_SECRET_ACCESS_KEY',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Generic Password
  {
    id: 'OWASP-HC-003',
    name: 'Hardcoded Password',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:password|passwd|pwd|pass)\s*[=:]\s*["'][^"'\s]{4,}["']/i,
    description: 'Hardcoded password detected in source code',
    recommendation: 'Use environment variables or secure secret management (AWS Secrets Manager, HashiCorp Vault)',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // API Keys
  {
    id: 'OWASP-HC-004',
    name: 'Hardcoded API Key',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*["'][a-zA-Z0-9_-]{16,}["']/i,
    description: 'API key or secret hardcoded in source code',
    recommendation: 'Use environment variables: process.env.API_KEY',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Private Keys
  {
    id: 'OWASP-HC-005',
    name: 'Private Key (PEM)',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
    description: 'Private key in PEM format hardcoded in source code',
    recommendation: 'Store private keys in secure secret management systems, never commit to source control',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // JWT Tokens
  {
    id: 'OWASP-HC-006',
    name: 'JWT Token',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.HIGH,
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/,
    description: 'JWT token hardcoded in source code',
    recommendation: 'Generate tokens server-side, never store in source code',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Database Connection Strings with credentials
  {
    id: 'OWASP-HC-007',
    name: 'Database Connection String',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:mongodb|mysql|postgresql|postgres|redis|mariadb):\/\/[^\s"']+:[^\s"']+@[^\s"']+/,
    description: 'Database connection string with embedded credentials',
    recommendation: 'Use environment variables: process.env.DATABASE_URL',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Generic Secret
  {
    id: 'OWASP-HC-008',
    name: 'Hardcoded Secret',
    category: VulnerabilityCategory.SENSITIVE_DATA,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:secret|client[_-]?secret|access[_-]?token)\s*[=:]\s*["'][a-zA-Z0-9_-]{12,}["']/i,
    description: 'Generic secret or access token hardcoded',
    recommendation: 'Use environment variables or secure secret management',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  }
];

// ============================================
// SQL Injection Detection Rules
// ============================================

const SQL_INJECTION_RULES: OWASPRule[] = [
  // String concatenation in SQL queries
  {
    id: 'OWASP-SQL-001',
    name: 'SQL String Concatenation',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\s+.*?["'`]\s*\+\s*(?:req\.|request\.|params\.|body\.|query\.|form\.)/gi,
    description: 'User input concatenated directly into SQL query',
    recommendation: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId])',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // Template literal with user input in SQL
  {
    id: 'OWASP-SQL-002',
    name: 'SQL Template Literal Injection',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|UNION)\s+.*?`.*?\$\{.*?(?:req\.|request\.|params\.|body\.|query\.)\w+/g,
    description: 'User input in template literal used in SQL query',
    recommendation: 'Use parameterized queries with placeholders',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // String interpolation in ORM queries
  {
    id: 'OWASP-SQL-003',
    name: 'ORM Query Injection',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:where|find|findOne|findAll|filter)\s*\(\s*\{.*?(?:\$where|\$regex|\$\w+:.*?(?:req\.|params\.|body\.))/g,
    description: 'User input used in ORM query without sanitization',
    recommendation: 'Use parameterized queries or ORM query builders with bound parameters',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // Raw SQL execution with string formatting
  {
    id: 'OWASP-SQL-004',
    name: 'Raw SQL Execution',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:execute|exec|query|raw)\s*\(\s*(?:`.*?\$\{|["'`].*?\%s.*?["'`]\s*\%|format\s*\(\s*["'"].*?\%.*?["']\))/g,
    description: 'Raw SQL execution with string formatting detected',
    recommendation: 'Use parameterized queries or prepared statements',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // String concatenation in LIKE clause
  {
    id: 'OWASP-SQL-005',
    name: 'SQL LIKE Injection',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.HIGH,
    pattern: /LIKE\s+["'](?:.*?|\%.*?)\s*\+\s*(?:req\.|request\.|params\.|body\.)/g,
    description: 'User input concatenated in SQL LIKE clause',
    recommendation: 'Use parameterized queries and sanitize wildcard characters (%)',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  }
];

// ============================================
// Missing Input Sanitization Rules
// ============================================

const SANITIZATION_RULES: OWASPRule[] = [
  // XSS - innerHTML assignment without sanitization
  {
    id: 'OWASP-SAN-001',
    name: 'XSS - innerHTML Assignment',
    category: VulnerabilityCategory.XSS,
    severity: VulnerabilitySeverity.HIGH,
    pattern: /\.innerHTML\s*=\s*(?:req\.|request\.|params\.|body\.|userInput|input|data|response)/gi,
    description: 'User input assigned to innerHTML without sanitization',
    recommendation: 'Use textContent instead, or sanitize with DOMPurify/bleach',
    cwe: 'CWE-79',
    owasp: 'A03:2021'
  },
  // XSS - dangerouslySetInnerHTML (React)
  {
    id: 'OWASP-SAN-002',
    name: 'XSS - React dangerouslySetInnerHTML',
    category: VulnerabilityCategory.XSS,
    severity: VulnerabilitySeverity.HIGH,
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*__html\s*:\s*(?:req\.|request\.|params\.|body\.)/gi,
    description: 'React dangerouslySetInnerHTML with user input',
    recommendation: 'Sanitize HTML with DOMPurify before setting innerHTML',
    cwe: 'CWE-79',
    owasp: 'A03:2021'
  },
  // eval() with user input
  {
    id: 'OWASP-SAN-003',
    name: 'Dangerous eval() Usage',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /eval\s*\(\s*(?:req\.|request\.|params\.|body\.|userInput|input)/g,
    description: 'User input passed to eval() - code injection risk',
    recommendation: 'Avoid eval(), use JSON.parse() for data parsing',
    cwe: 'CWE-95',
    owasp: 'A03:2021'
  },
  // Command injection
  {
    id: 'OWASP-SAN-004',
    name: 'Command Injection',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:exec|spawn|execSync|system|popen|execFile)\s*\(\s*(?:["'`].*?(?:req\.|params\.|body\.)\w+|.*?\+|`.*?\$\{.*?(?:req\.|params\.|body\.)\w+)/g,
    description: 'User input used in shell command without sanitization',
    recommendation: 'Use allow-lists, avoid shell commands with user input, use child_process with array arguments',
    cwe: 'CWE-78',
    owasp: 'A03:2021'
  },
  // Path traversal
  {
    id: 'OWASP-SAN-005',
    name: 'Path Traversal',
    category: VulnerabilityCategory.BROKEN_ACCESS,
    severity: VulnerabilitySeverity.HIGH,
    pattern: /(?:readFile|readFileSync|open|createReadStream|readdir|stat)\s*\(\s*(?:req\.|request\.|params\.|filename\.|path\.)\w*\s*(?:\+|\$\{)/g,
    description: 'File path constructed from user input without validation',
    recommendation: 'Validate paths with path.normalize(), use allow-lists for permitted directories',
    cwe: 'CWE-22',
    owasp: 'A01:2021'
  },
  // Template injection (Server-Side)
  {
    id: 'OWASP-SAN-006',
    name: 'Template Injection',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:render|renderToString|compile|execute)\s*\(\s*(?:req\.|request\.|params\.|body\.).*?(?:\$|{{|#|for|if)/g,
    description: 'User input in template engine without sanitization',
    recommendation: 'Sandbox templates, use auto-escaping, avoid user input in templates',
    cwe: 'CWE-94',
    owasp: 'A03:2021'
  },
  // No input validation decorator
  {
    id: 'OWASP-SAN-007',
    name: 'Missing Input Validation',
    category: VulnerabilityCategory.BROKEN_ACCESS,
    severity: VulnerabilitySeverity.MEDIUM,
    pattern: /(?:router\.(?:get|post|put|delete|patch)\s*\(\s*["']\/[^\s*]+["']\s*,\s*(?!.*(?:validate|sanitize|check|verify|middleware)))/g,
    description: 'Route handler without apparent input validation',
    recommendation: 'Add input validation middleware (e.g., Joi, express-validator, Zod)',
    cwe: 'CWE-20',
    owasp: 'A01:2021'
  },
  // SQL query without parameterized approach
  {
    id: 'OWASP-SAN-008',
    name: 'Unparameterized SQL Query',
    category: VulnerabilityCategory.INJECTION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:connection\.query|db\.query|cursor\.execute)\s*\(\s*["'].*?(?:\+|\$\{|%|format).*?(?:req\.|params\.|body\.)/gi,
    description: 'SQL query using string formatting instead of parameters',
    recommendation: 'Use parameterized queries: query("SELECT * FROM users WHERE id = $1", [id])',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  // Missing HTML encoding in output
  {
    id: 'OWASP-SAN-009',
    name: 'Missing HTML Encoding',
    category: VulnerabilityCategory.XSS,
    severity: VulnerabilitySeverity.MEDIUM,
    pattern: /(?:res\.(?:send|html|render))\s*\(\s*(?:req\.|request\.|params\.|body\.).*?(?:,|\))/gi,
    description: 'User input rendered without HTML encoding',
    recommendation: 'Use template engines with auto-escaping or manually encode with a library',
    cwe: 'CWE-79',
    owasp: 'A03:2021'
  },
  // Insecure deserialization
  {
    id: 'OWASP-SAN-010',
    name: 'Insecure Deserialization',
    category: VulnerabilityCategory.INSECURE_DESERIALIZATION,
    severity: VulnerabilitySeverity.CRITICAL,
    pattern: /(?:unserialize|pickle\.loads|yaml\.load)\s*\(\s*(?:req\.|request\.|body\.|params\.|cookie\.)/gi,
    description: 'User input directly deserialized - potential code execution',
    recommendation: 'Use JSON.parse() for data exchange, validate input before deserialization',
    cwe: 'CWE-502',
    owasp: 'A08:2021'
  }
];

// ============================================
// Combined Rules
// ============================================

export const OWASP_RULES: OWASPRule[] = [
  ...HARDCODED_SECRET_RULES,
  ...SQL_INJECTION_RULES,
  ...SANITIZATION_RULES
];

// ============================================
// Scanner Function
// ============================================

/**
 * Scan file content for OWASP violations
 */
function scanContentForViolations(content: string, filePath: string): OWASPViolation[] {
  const violations: OWASPViolation[] = [];
  const lines = content.split('\n');
  const maxViolationsPerRule = 50; // Prevent infinite loops
  const seenViolations = new Set<string>(); // Deduplication

  for (const rule of OWASP_RULES) {
    // Reset regex state
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    let matchCount = 0;
    while ((match = rule.pattern.exec(content)) !== null && matchCount < maxViolationsPerRule) {
      // Skip empty matches to prevent infinite loops
      if (match[0].length === 0) {
        rule.pattern.lastIndex++;
        continue;
      }

      const lineNumber = content.substring(0, match.index).split('\n').length;

      // Deduplication key: ruleId-file-line
      const dedupKey = `${rule.id}-${filePath}-${lineNumber}`;
      if (seenViolations.has(dedupKey)) {
        matchCount++;
        continue;
      }
      seenViolations.add(dedupKey);

      // Get code context (3 lines before and after)
      const codeContext = getCodeContext(lines, lineNumber);

      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
        file: filePath,
        line: lineNumber,
        code: codeContext,
        description: rule.description,
        recommendation: rule.recommendation,
        cwe: rule.cwe,
        owasp: rule.owasp
      });

      matchCount++;
    }
  }

  return violations;
}

/**
 * Get code context around a specific line
 */
function getCodeContext(lines: string[], lineNumber: number): string {
  const context: string[] = [];
  const start = Math.max(0, lineNumber - 3);
  const end = Math.min(lines.length, lineNumber + 2);

  for (let i = start; i < end; i++) {
    const prefix = i === lineNumber - 1 ? '>' : ' ';
    context.push(`${prefix}${i + 1}: ${lines[i]}`);
  }

  return context.join('\n');
}

/**
 * Calculate summary from violations
 */
function calculateSummary(violations: OWASPViolation[]): OWASPScanResult['summary'] {
  return {
    critical: violations.filter(v => v.severity === VulnerabilitySeverity.CRITICAL).length,
    high: violations.filter(v => v.severity === VulnerabilitySeverity.HIGH).length,
    medium: violations.filter(v => v.severity === VulnerabilitySeverity.MEDIUM).length,
    low: violations.filter(v => v.severity === VulnerabilitySeverity.LOW).length
  };
}

// ============================================
// Main Export: scanFiles
// ============================================

/**
 * Scan files for OWASP security violations.
 * Blocks workflow if CRITICAL or HIGH severity violations are found.
 *
 * @param paths - Array of file paths to scan
 * @returns OWASPScanResult with violations and blocked status
 */
export async function scanFiles(paths: string[]): Promise<OWASPScanResult> {
  const { promises: fs } = await import('fs');
  const violations: OWASPViolation[] = [];
  const scannedPaths: string[] = [];

  for (const filePath of paths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      scannedPaths.push(filePath);

      const fileViolations = scanContentForViolations(content, filePath);
      violations.push(...fileViolations);
    } catch (error) {
      // Skip files that can't be read
      console.error(`[OWASP] Could not read file ${filePath}:`, error);
    }
  }

  const summary = calculateSummary(violations);
  const blocked = summary.critical > 0 || summary.high > 0;

  return {
    timestamp: new Date().toISOString(),
    pathsScanned: scannedPaths,
    violations,
    blocked,
    summary
  };
}

/**
 * Scan a single buffer/string for OWASP violations.
 * Useful for scanning code snippets or staged files.
 *
 * @param content - The text content to scan
 * @param fileName - Optional filename for reporting
 * @returns Array of violations found
 */
export function scanBuffer(content: string, fileName: string = 'buffer'): OWASPViolation[] {
  return scanContentForViolations(content, fileName);
}

/**
 * Check if content has any security violations (for quick validation).
 *
 * @param content - The text content to check
 * @returns true if CRITICAL or HIGH severity violations found
 */
export function hasViolations(content: string): boolean {
  for (const rule of OWASP_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) {
      if (rule.severity === VulnerabilitySeverity.CRITICAL || rule.severity === VulnerabilitySeverity.HIGH) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get all OWASP rules for documentation or custom scanning
 */
export function getOWASPRules(): OWASPRule[] {
  return OWASP_RULES;
}
