// Security types - Vulnerability definitions and scan results

// OWASP Top 10 vulnerability categories
export enum VulnerabilityCategory {
  INJECTION = 'Injection',
  BROKEN_AUTH = 'Broken Authentication',
  SENSITIVE_DATA = 'Sensitive Data Exposure',
  XML_EXTERNAL_ENTITIES = 'XML External Entities',
  BROKEN_ACCESS = 'Broken Access Control',
  SECURITY_MISCONFIGURATION = 'Security Misconfiguration',
  XSS = 'Cross-Site Scripting (XSS)',
  INSECURE_DESERIALIZATION = 'Insecure Deserialization',
  USING_COMPONENTS = 'Using Components with Known Vulnerabilities',
  INSUFFICIENT_LOGGING = 'Insufficient Logging & Monitoring'
}

// Severity levels
export enum VulnerabilitySeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
  INFO = 'Info'
}

// A single vulnerability finding
export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  file: string;
  line?: number;
  code?: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}

// Secret finding from secrets detection
export interface SecretFinding {
  id: string;
  type: 'api_key' | 'password' | 'token' | 'private_key' | 'credentials' | 'other';
  file: string;
  line?: number;
  matchedPattern: string;
  severity: VulnerabilitySeverity;
  recommendation: string;
}

// Security header finding
export interface HeaderFinding {
  header: string;
  expected?: string;
  found?: string;
  severity: VulnerabilitySeverity;
  recommendation: string;
}

// Complete security scan result
export interface SecurityScanResult {
  timestamp: string;
  projectPath: string;
  filesScanned: number;
  vulnerabilities: Vulnerability[];
  secretsFound: SecretFinding[];
  headersFindings: HeaderFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  scanDuration: number; // milliseconds
}

// Security scan options
export interface ScanOptions {
  projectPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  scanSecrets?: boolean;
  scanHeaders?: boolean;
  severityThreshold?: VulnerabilitySeverity;
}
