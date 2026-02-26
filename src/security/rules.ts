// Security Rules - Pattern definitions for vulnerability detection
// Story 6.1: Security Scanner Engine

import { VulnerabilityCategory, VulnerabilitySeverity } from './types.js';

// ============================================
// HARDCODED SECRETS PATTERNS
// ============================================

export const SECRET_PATTERNS = [
  // Stripe Test Keys (sk_test_...)
  {
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    type: 'api_key' as const,
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
    type: 'api_key' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Stripe Live API Key Detected',
    description: 'Hardcoded Stripe live key found in source code. This could lead to financial loss.',
    recommendation: 'Immediately revoke this key and use environment variables',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // JWT Tokens in plaintext (eyJ...)
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'token' as const,
    severity: VulnerabilitySeverity.HIGH,
    title: 'JWT Token in Plaintext',
    description: 'Hardcoded JWT token found in source code. Tokens should be generated server-side.',
    recommendation: 'Remove the token and implement proper JWT generation',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Generic API Keys
  {
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*["']([a-zA-Z0-9_\-]{16,})["']/gi,
    type: 'api_key' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Hardcoded API Key',
    description: 'Hardcoded API key found in source code.',
    recommendation: 'Move API keys to environment variables (process.env.API_KEY)',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Generic Secret Keys
  {
    pattern: /(?:secret[_-]?key|client[_-]?secret)\s*[=:]\s*["']([a-zA-Z0-9_\-]{16,})["']/gi,
    type: 'credentials' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Hardcoded Secret Key',
    description: 'Hardcoded secret key found in source code.',
    recommendation: 'Use environment variables or secure secret management',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Passwords
  {
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']([^"'\s]{6,})["']/gi,
    type: 'password' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Hardcoded Password',
    description: 'Hardcoded password found in source code.',
    recommendation: 'Use environment variables or secure secret management',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Database Connection Strings with credentials
  {
    pattern: /(?:mongodb|mysql|postgresql|postgres|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi,
    type: 'credentials' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Database Connection String with Credentials',
    description: 'Database connection string with embedded credentials found.',
    recommendation: 'Use environment variables for database credentials',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // AWS Access Key ID
  {
    pattern: /(?:aws[_-]?access[_-]?key[_-]?id|AKIA|ASIA|ABIA|ACCA)[=:]\s*["']?[A-Z0-9]{20}["']?/gi,
    type: 'api_key' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'AWS Access Key ID',
    description: 'AWS access key ID found in source code.',
    recommendation: 'Use AWS IAM roles instead of hardcoded credentials',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // GitHub Tokens
  {
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/g,
    type: 'token' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'GitHub Token',
    description: 'GitHub token found in source code.',
    recommendation: 'Revoke this token immediately and use GitHub Actions secrets',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Slack Tokens
  {
    pattern: /xox[baprs]-[0-9a-zA-Z-]+/g,
    type: 'token' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Slack Token',
    description: 'Slack token found in source code.',
    recommendation: 'Use Slack app tokens stored in secure secret management',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  },
  // Bearer Tokens in headers
  {
    pattern: /(?:Bearer\s+|bearer\s+|authorization\s*[=:]\s*["']?)["']?([a-zA-Z0-9_\-\.]{20,})["']?/gi,
    type: 'token' as const,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Bearer Token',
    description: 'Bearer token found in source code.',
    recommendation: 'Use secure token storage and environment variables',
    cwe: 'CWE-798',
    owasp: 'A02:2021'
  }
] as const;

// ============================================
// MISSING CONFIGURATION PATTERNS
// ============================================

export const CONFIG_PATTERNS = [
  // Missing Content Security Policy (CSP)
  {
    pattern: /(?:helmet\s*\(\s*\{?\s*contentSecurityPolicy\s*:\s*false|contentSecurityPolicy\s*:\s*false)/gi,
    type: 'disabled_security' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Content Security Policy Disabled',
    description: 'CSP is explicitly disabled in the application.',
    recommendation: 'Enable CSP to prevent XSS and data injection attacks',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // Missing CSP header in helmet config
  {
    pattern: /helmet\s*\(\s*\{[^}]*\}/gi,
    checkMissing: 'contentSecurityPolicy' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Missing Content Security Policy Configuration',
    description: 'Helmet is used but CSP is not configured.',
    recommendation: 'Configure Content-Security-Policy header in helmet',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // CORS wildcard (overly permissive)
  {
    pattern: /cors\s*\(\s*\{?\s*origin\s*:\s*["']\*["']/gi,
    type: 'misconfiguration' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Overly Permissive CORS Configuration',
    description: 'CORS is configured to allow all origins (*).',
    recommendation: 'Restrict CORS to specific trusted origins',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // Insecure cookie configuration (missing Secure flag)
  {
    pattern: /(?:cookie|cookies|res\.cookie|setCookie)\s*\([^)]*(?:httpOnly\s*:\s*(?!true)|secure\s*:\s*(?!true))/gi,
    type: 'misconfiguration' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Insecure Cookie Configuration',
    description: 'Cookie is set without proper security flags (Secure, httpOnly).',
    recommendation: 'Add Secure and httpOnly flags to cookies',
    cwe: 'CWE-614',
    owasp: 'A05:2021'
  },
  // Cookie without Secure flag specifically
  {
    pattern: /(?:cookie|res\.cookie)\s*\([^)]*\{[^}]*\}\s*,?\s*(?:\{[^}]*\})?/gi,
    checkMissing: 'secure' as const,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Cookie Missing Secure Flag',
    description: 'Cookie is set without the Secure flag.',
    recommendation: 'Add Secure: true to cookie configuration',
    cwe: 'CWE-614',
    owasp: 'A05:2021'
  },
  // Cookie without httpOnly flag
  {
    pattern: /(?:cookie|res\.cookie)\s*\([^)]*\{[^}]*\}\s*,?\s*(?:\{[^}]*\})?/gi,
    checkMissing: 'httpOnly' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Cookie Missing httpOnly Flag',
    description: 'Cookie is set without the httpOnly flag, allowing JavaScript access.',
    recommendation: 'Add httpOnly: true to prevent XSS cookie theft',
    cwe: 'CWE-614',
    owasp: 'A05:2021'
  },
  // Missing X-Frame-Options
  {
    pattern: /helmet/gi,
    checkMissing: 'xFrameOptions' as const,
    severity: VulnerabilitySeverity.LOW,
    title: 'Missing X-Frame-Options Header',
    description: 'X-Frame-Options header is not configured.',
    recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // Missing Strict-Transport-Security (HSTS)
  {
    pattern: /helmet/gi,
    checkMissing: 'hsts' as const,
    severity: VulnerabilitySeverity.MEDIUM,
    title: 'Missing HSTS Header',
    description: 'Strict-Transport-Security header is not configured.',
    recommendation: 'Add HSTS header to enforce HTTPS connections',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  },
  // eval() usage - dangerous
  {
    pattern: /\beval\s*\(/g,
    type: 'dangerous_function' as const,
    severity: VulnerabilitySeverity.HIGH,
    title: 'Dangerous eval() Usage',
    description: 'eval() executes arbitrary code and is a major security risk.',
    recommendation: 'Avoid eval() and use safer alternatives like JSON.parse()',
    cwe: 'CWE-95',
    owasp: 'A03:2021'
  },
  // disabledhelmet entirely
  {
    pattern: /helmet\s*\(\s*false\s*\)/gi,
    type: 'disabled_security' as const,
    severity: VulnerabilitySeverity.CRITICAL,
    title: 'Helmet Security Disabled',
    description: 'Helmet is completely disabled, removing all security headers.',
    recommendation: 'Enable helmet() or configure individual security headers',
    cwe: 'CWE-346',
    owasp: 'A05:2021'
  }
] as const;

// ============================================
// RULE INTERFACES
// ============================================

export type SecretPatternType = typeof SECRET_PATTERNS[number]['type'];
export type ConfigPatternType = 'disabled_security' | 'misconfiguration' | 'dangerous_function';

export interface SecretRule {
  pattern: RegExp;
  type: SecretPatternType;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}

export interface ConfigRule {
  pattern: RegExp;
  type?: ConfigPatternType;
  checkMissing?: string;
  severity: VulnerabilitySeverity;
  title: string;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}

// ============================================
// RULE EXPORTS
// ============================================

export const RULES = {
  secrets: SECRET_PATTERNS as unknown as SecretRule[],
  configs: CONFIG_PATTERNS as unknown as ConfigRule[]
};

// ============================================
// SEVERITY CHECK
// ============================================

export function isCritical(severity: VulnerabilitySeverity): boolean {
  return severity === VulnerabilitySeverity.CRITICAL;
}

export function shouldStopOnSeverity(severity: VulnerabilitySeverity): boolean {
  return severity === VulnerabilitySeverity.CRITICAL;
}
