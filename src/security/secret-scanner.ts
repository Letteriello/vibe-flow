// Security Scanner - Scan payloads for secrets and prompt injection
// Uses robust RegEx patterns to detect common credential patterns and prompt injection

// ============================================
// SecurityReport Interface
// ============================================

export interface SecurityFinding {
  type: 'secret' | 'prompt_injection' | 'suspicious_pattern';
  category: string;
  pattern: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  match: string;
}

export interface SecurityReport {
  isSecure: boolean;
  findings: SecurityFinding[];
  secretsFound: string[];
  promptInjectionDetected: boolean;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ============================================
// ScanResult Interface (legacy compatibility)
// ============================================

export interface ScanResult {
  hasSecrets: boolean;
  findings: string[];
}

// ============================================
// Secret Detection Patterns
// ============================================

interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Access Key ID (20 characters, starts with AKIA, ASIA, ABIA, or ACCA)
  {
    name: 'AWS Access Key ID',
    pattern: /\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    description: 'AWS Access Key ID detected'
  },
  // AWS Secret Access Key (40 characters, base64-like)
  {
    name: 'AWS Secret Access Key',
    pattern: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    description: 'AWS Secret Access Key detected'
  },
  // AWS Session Token
  {
    name: 'AWS Session Token',
    pattern: /(?:aws[_-]?session[_-]?token|AwsSessionToken)\s*[=:]\s*["']?[A-Za-z0-9/+=]{200,}["']?/gi,
    description: 'AWS Session Token detected'
  },
  // OpenAI API Key (sk-...)
  {
    name: 'OpenAI API Key',
    pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
    description: 'OpenAI API Key detected'
  },
  // OpenAI Organization Key
  {
    name: 'OpenAI Organization',
    pattern: /\borg-[a-zA-Z0-9_-]{20,}\b/g,
    description: 'OpenAI Organization Key detected'
  },
  // Anthropic API Key (sk-ant-...)
  {
    name: 'Anthropic API Key',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/gi,
    description: 'Anthropic API Key detected'
  },
  // JWT (JSON Web Token) - three base64url parts separated by dots
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    description: 'JWT Token detected'
  },
  // Private Key (PEM format)
  {
    name: 'Private Key (PEM)',
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/g,
    description: 'Private Key (PEM) detected'
  },
  // RSA Private Key
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    description: 'RSA Private Key detected'
  },
  // OpenSSH Private Key
  {
    name: 'OpenSSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    description: 'OpenSSH Private Key detected'
  },
  // GitHub Classic Token (ghp_, gho_, ghu_, ghs_, ghr_)
  {
    name: 'GitHub Token (Classic)',
    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    description: 'GitHub Token (Classic) detected'
  },
  // GitHub App Token
  {
    name: 'GitHub App Token',
    pattern: /\bgithub_pat_[a-zA-Z0-9_]{22,}\b/g,
    description: 'GitHub App Token detected'
  },
  // Slack Token
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9a-zA-Z-]+/g,
    description: 'Slack Token detected'
  },
  // Stripe API Key (sk_live_, sk_test_)
  {
    name: 'Stripe API Key',
    pattern: /\bsk_(live|test)_[a-zA-Z0-9]{24,}\b/g,
    description: 'Stripe API Key detected'
  },
  // Stripe Publishable Key (pk_live_, pk_test_)
  {
    name: 'Stripe Publishable Key',
    pattern: /\bpk_(live|test)_[a-zA-Z0-9]{24,}\b/g,
    description: 'Stripe Publishable Key detected'
  },
  // Google API Key
  {
    name: 'Google API Key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    description: 'Google API Key detected'
  },
  // Google OAuth Token
  {
    name: 'Google OAuth Token',
    pattern: /ya29\.[0-9A-Za-z_-]+/g,
    description: 'Google OAuth Token detected'
  },
  // Twilio Account SID
  {
    name: 'Twilio Account SID',
    pattern: /\bAC[a-z0-9]{32}\b/gi,
    description: 'Twilio Account SID detected'
  },
  // Twilio Auth Token
  {
    name: 'Twilio Auth Token',
    pattern: /(?:twilio[_-]?auth[_-]?token)\s*[=:]\s*["']?[a-z0-9]{32}["']?/gi,
    description: 'Twilio Auth Token detected'
  },
  // SendGrid API Key
  {
    name: 'SendGrid API Key',
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    description: 'SendGrid API Key detected'
  },
  // Mailgun API Key
  {
    name: 'Mailgun API Key',
    pattern: /\bkey-[0-9a-zA-Z]{32}\b/g,
    description: 'Mailgun API Key detected'
  },
  // NPM Token
  {
    name: 'NPM Token',
    pattern: /\bnpm_[A-Za-z0-9]{36,}\b/g,
    description: 'NPM Token detected'
  },
  // Heroku API Key
  {
    name: 'Heroku API Key',
    pattern: /\b[hH]eroku[_-]?[aA][pP][iI][_-]?[kK][eE][yY]\s*[=:]\s*["']?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}["']?/g,
    description: 'Heroku API Key detected'
  },
  // Password in URL (user:pass@host)
  {
    name: 'Password in URL',
    pattern: /:\/\/[^:]+:[^@]+@/g,
    description: 'Password embedded in URL detected'
  },
  // Generic Bearer Token
  {
    name: 'Bearer Token',
    pattern: /(?:Bearer\s+|bearer\s+|Authorization\s*[:=]\s*["']?Bearer\s+)([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/gi,
    description: 'Bearer Token detected'
  },
  // Generic API Key assignment
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*["']([a-zA-Z0-9_-]{20,})["']/gi,
    description: 'Generic API Key detected'
  },
  // Generic Secret assignment
  {
    name: 'Generic Secret',
    pattern: /(?:secret|client[_-]?secret)\s*[=:]\s*["']([a-zA-Z0-9_-]{16,})["']/gi,
    description: 'Generic Secret detected'
  },
  // Database Connection String with credentials
  {
    name: 'Database Connection String',
    pattern: /(?:mongodb|mysql|postgresql|postgres|redis|mariadb):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi,
    description: 'Database Connection String with credentials detected'
  },
  // Facebook Access Token
  {
    name: 'Facebook Access Token',
    pattern: /\bEAACEdEose0cBA[0-9A-Za-z]+/g,
    description: 'Facebook Access Token detected'
  },
  // Discord Bot Token
  {
    name: 'Discord Bot Token',
    pattern: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
    description: 'Discord Bot Token detected'
  },
  // Azure Subscription Key
  {
    name: 'Azure Subscription Key',
    pattern: /(?:azure[_-]?subscription[_-]?key|azure[_-]?key)\s*[=:]\s*["']?[a-zA-Z0-9+/=]{43}["']?/gi,
    description: 'Azure Subscription Key detected'
  },
  // Square Access Token
  {
    name: 'Square Access Token',
    pattern: /\bq0[a-z0-9-]{42,}\b/gi,
    description: 'Square Access Token detected'
  },
  // Shopify Access Token
  {
    name: 'Shopify Access Token',
    pattern: /shpat_[a-f0-9]{32}/g,
    description: 'Shopify Access Token detected'
  },
  // PyPI Token
  {
    name: 'PyPI Token',
    pattern: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g,
    description: 'PyPI Token detected'
  },
  // Default Passwords
  {
    name: 'Default Password',
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']?(?:admin|root|123456|password|default|letmein|welcome|qwerty)["']?/gi,
    description: 'Default or common password detected'
  }
];

// ============================================
// Prompt Injection Patterns
// ============================================

interface InjectionPattern {
  name: string;
  pattern: RegExp;
  description: string;
  severity: 'critical' | 'high' | 'medium';
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Classic "ignore previous instructions"
  {
    name: 'Ignore Previous Instructions',
    pattern: /(?:ignore\s+(?:all\s+)?(?:previous|prior|earlier)\s+(?:instructions?|commands?|directives?|requests?))/gi,
    description: 'Attempt to override previous system instructions',
    severity: 'critical'
  },
  // "Ignore all" commands
  {
    name: 'Ignore All Command',
    pattern: /(?:ignore\s+all\b|disregard\s+all|forget\s+(?:everything|all\s+previous))/gi,
    description: 'Attempt to make model forget context',
    severity: 'critical'
  },
  // "System prompt" extraction attempts
  {
    name: 'System Prompt Extraction',
    pattern: /(?:(?:reveal|show|tell|give|extract)\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|system)|what\s+(?:are|is)\s+your\s+(?:system\s+)?instructions)/gi,
    description: 'Attempt to extract system prompt',
    severity: 'critical'
  },
  // "You are now" / role playing overrides
  {
    name: 'Role Override',
    pattern: /(?:you\s+(?:are\s+now|have\s+become|will\s+be)|act\s+as\s+(?:if|though)|pretend\s+(?:to\s+be|you\s+are)|roleplay\s+(?:as|being))/gi,
    description: 'Attempt to override system role',
    severity: 'high'
  },
  // Jailbreak prompts
  {
    name: 'Jailbreak Prompt',
    pattern: /(?:DAN\s+mode|do\s+anything\s+now|developer\s+mode|bypass\s+(?:ethics|restrictions?)|jailbreak)/gi,
    description: 'Known jailbreak attempt detected',
    severity: 'critical'
  },
  // "New instructions" override
  {
    name: 'Instruction Override',
    pattern: /(?:instead\s+of\s+(?:what|that)|new\s+instructions?|overriding|replace\s+(?:your|these))/gi,
    description: 'Attempt to provide new conflicting instructions',
    severity: 'high'
  },
  // XML/JSON tag injection
  {
    name: 'XML Tag Injection',
    pattern: /<\/?(?:system|instructions|prompt|override)>/gi,
    description: 'XML-style instruction injection attempt',
    severity: 'high'
  },
  // Base64 encoded instructions
  {
    name: 'Encoded Instructions',
    pattern: /(?:base64|decode|encoded)\s*(?:instructions?|payload|command)/gi,
    description: 'Attempt to hide instructions in encoding',
    severity: 'medium'
  },
  // "Forget safety" patterns
  {
    name: 'Safety Override',
    pattern: /(?:ignore\s+(?:safety|ethical|content\s+policy)|bypass\s+(?:safety|filter|restriction)|disable\s+(?:safety|filter))/gi,
    description: 'Attempt to disable safety measures',
    severity: 'critical'
  },
  // "Confidential" / "Not for reproduction"
  {
    name: 'Confidential Injection',
    pattern: /(?:this\s+is\s+(?:confidential|secret|private)|do\s+not\s+(?:share|repeat|output)|strictly\s+confidential)/gi,
    description: 'Attempt to hide malicious instructions as confidential',
    severity: 'medium'
  },
  // "Previous message was corrupted"
  {
    name: 'Corruption Claim',
    pattern: /(?:previous\s+(?:message|response|output)\s+(?:was\s+)?(?:corrupted|malformed|truncated)|message\s+corruption)/gi,
    description: 'Claim of message corruption to override context',
    severity: 'medium'
  }
];

// ============================================
// SecurityScanner Class
// ============================================

/**
 * SecurityScanner - Static methods for scanning payloads (AI-generated code)
 * for hardcoded secrets and prompt injection attempts.
 */
export class SecurityScanner {
  /**
   * Main method to scan a payload for security issues.
   * Detects hardcoded secrets (JWT, AWS keys, passwords) and prompt injection patterns.
   *
   * @param payload - The string content to scan (e.g., AI-generated code)
   * @returns SecurityReport with findings and summary
   */
  static scanPayload(payload: string): SecurityReport {
    const findings: SecurityFinding[] = [];
    const secretsFound: string[] = [];
    let promptInjectionDetected = false;

    if (!payload || typeof payload !== 'string') {
      return {
        isSecure: true,
        findings: [],
        secretsFound: [],
        promptInjectionDetected: false,
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      };
    }

    // Scan for secrets
    for (const secretPattern of SECRET_PATTERNS) {
      secretPattern.pattern.lastIndex = 0;
      const matches = payload.match(secretPattern.pattern);

      if (matches && matches.length > 0) {
        const uniqueMatches = Array.from(new Set(matches));

        for (const match of uniqueMatches) {
          findings.push({
            type: 'secret',
            category: secretPattern.name,
            pattern: secretPattern.name,
            severity: 'critical',
            description: secretPattern.description,
            match: match.substring(0, 50)
          });

          if (!secretsFound.includes(secretPattern.name)) {
            secretsFound.push(secretPattern.name);
          }
        }
      }
    }

    // Scan for prompt injection
    for (const injectionPattern of INJECTION_PATTERNS) {
      injectionPattern.pattern.lastIndex = 0;
      const matches = payload.match(injectionPattern.pattern);

      if (matches && matches.length > 0) {
        promptInjectionDetected = true;
        const uniqueMatches = Array.from(new Set(matches));

        for (const match of uniqueMatches) {
          findings.push({
            type: 'prompt_injection',
            category: injectionPattern.name,
            pattern: injectionPattern.name,
            severity: injectionPattern.severity,
            description: injectionPattern.description,
            match: match.substring(0, 100)
          });
        }
      }
    }

    // Calculate summary
    const summary = {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length
    };

    return {
      isSecure: findings.length === 0,
      findings,
      secretsFound,
      promptInjectionDetected,
      summary
    };
  }

  /**
   * Scan only for hardcoded secrets in a payload.
   *
   * @param payload - The string content to scan
   * @returns ScanResult with hasSecrets boolean and findings array
   */
  static scanForSecrets(payload: string): ScanResult {
    return scanDiffForSecrets(payload);
  }

  /**
   * Scan only for prompt injection patterns in a payload.
   *
   * @param payload - The string content to scan
   * @returns Array of injection findings
   */
  static scanForPromptInjection(payload: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (!payload || typeof payload !== 'string') {
      return findings;
    }

    for (const injectionPattern of INJECTION_PATTERNS) {
      injectionPattern.pattern.lastIndex = 0;
      const matches = payload.match(injectionPattern.pattern);

      if (matches && matches.length > 0) {
        const uniqueMatches = Array.from(new Set(matches));

        for (const match of uniqueMatches) {
          findings.push({
            type: 'prompt_injection',
            category: injectionPattern.name,
            pattern: injectionPattern.name,
            severity: injectionPattern.severity,
            description: injectionPattern.description,
            match: match.substring(0, 100)
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check if a payload contains any prompt injection patterns.
   *
   * @param payload - The string content to check
   * @returns true if prompt injection detected
   */
  static hasPromptInjection(payload: string): boolean {
    if (!payload || typeof payload !== 'string') {
      return false;
    }

    for (const injectionPattern of INJECTION_PATTERNS) {
      injectionPattern.pattern.lastIndex = 0;
      if (injectionPattern.pattern.test(payload)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a payload contains hardcoded secrets.
   *
   * @param payload - The string content to check
   * @returns true if secrets detected
   */
  static hasSecrets(payload: string): boolean {
    if (!payload || typeof payload !== 'string') {
      return false;
    }

    for (const secretPattern of SECRET_PATTERNS) {
      secretPattern.pattern.lastIndex = 0;
      if (secretPattern.pattern.test(payload)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get a detailed report of all detected secrets.
   *
   * @param payload - The string content to analyze
   * @returns Array of secret findings with details
   */
  static getSecretDetails(payload: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (!payload || typeof payload !== 'string') {
      return findings;
    }

    for (const secretPattern of SECRET_PATTERNS) {
      secretPattern.pattern.lastIndex = 0;
      const matches = payload.match(secretPattern.pattern);

      if (matches && matches.length > 0) {
        const uniqueMatches = Array.from(new Set(matches));

        for (const match of uniqueMatches) {
          findings.push({
            type: 'secret',
            category: secretPattern.name,
            pattern: secretPattern.name,
            severity: 'critical',
            description: secretPattern.description,
            match: match.substring(0, 50)
          });
        }
      }
    }

    return findings;
  }
}

/**
 * Scans a diff text for exposed secrets using robust RegEx patterns.
 * Detects common credential patterns like AWS keys, OpenAI tokens,
 * JWTs, private keys, and other popular API tokens.
 *
 * @param diffText - The diff text to scan for secrets
 * @returns ScanResult with hasSecrets boolean and array of finding descriptions
 */
export function scanDiffForSecrets(diffText: string): ScanResult {
  const findings: string[] = [];
  const foundPatterns = new Set<string>(); // Avoid duplicate findings

  if (!diffText || typeof diffText !== 'string') {
    return {
      hasSecrets: false,
      findings: []
    };
  }

  for (const secretPattern of SECRET_PATTERNS) {
    // Reset regex lastIndex for global patterns
    secretPattern.pattern.lastIndex = 0;

    const matches = diffText.match(secretPattern.pattern);

    if (matches && matches.length > 0) {
      // Add finding only once per pattern type
      if (!foundPatterns.has(secretPattern.name)) {
        findings.push(secretPattern.description);
        foundPatterns.add(secretPattern.name);
      }
    }
  }

  return {
    hasSecrets: findings.length > 0,
    findings
  };
}
