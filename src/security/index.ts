// Security Scanner - Vulnerability detection for AI-generated code
// Story 6.1: Security Scanner Engine
// AC: Dado código gerado por IA, Quando o Security Scanner executa, Então detecta OWASP Top 10 vulnerabilities

export { SecurityScanner } from './scanner.js';
export { scanFiles, scanBuffer, hasCriticalIssues } from './scanner.js';
export type {
  Vulnerability,
  SecretFinding,
  HeaderFinding,
  SecurityScanResult,
  ScanOptions
} from './types.js';
export { VulnerabilityCategory, VulnerabilitySeverity } from './types.js';

export { SecretsDetector } from './secrets-detector.js';

export { SecurityHeadersValidator } from './headers-validator.js';

export {
  SECRET_PATTERNS,
  CONFIG_PATTERNS,
  RULES,
  isCritical,
  shouldStopOnSeverity
} from './rules.js';

// Export from secret-scanner.ts (static methods for payload scanning)
export { scanDiffForSecrets } from './secret-scanner.js';
export { SecurityScanner as PayloadSecurityScanner } from './secret-scanner.js';
export type {
  SecurityFinding,
  SecurityReport,
  ScanResult
} from './secret-scanner.js';

// Export from owasp-rules.ts (OWASP validation rules)
export {
  scanFiles as owaspScanFiles,
  scanBuffer as owaspScanBuffer,
  hasViolations,
  getOWASPRules
} from './owasp-rules.js';
export type {
  OWASPRule,
  OWASPScanResult,
  OWASPViolation
} from './owasp-rules.js';
