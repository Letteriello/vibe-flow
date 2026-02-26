// Secrets Detector - Detect API keys, passwords, tokens
// Story 6.3: Secrets Detection
// AC: Dado código com string suspeita de segredo, Quando o detector executa, Então identifica padrões de API keys, senhas, tokens

import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { SecretFinding, VulnerabilitySeverity } from './types.js';

// ============================================
// SANITIZATION PATTERNS - Forred regex patterns to mask secrets
// Used before sending payloads to .bmad-output or claude-wrapper
// ============================================

const SANITIZE_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
  // AWS Access Key ID (20 characters, starts with AKIA)
  {
    name: 'AWS Access Key ID',
    pattern: /\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  // AWS Secret Access Key (40 characters)
  {
    name: 'AWS Secret Access Key',
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
    replacement: '[REDACTED_AWS_SECRET]'
  },
  // AWS Session Token
  {
    name: 'AWS Session Token',
    pattern: /\bAwsSessionToken\s*[=:]\s*["']?([A-Za-z0-9/+=]{200,})["']?/gi,
    replacement: '[REDACTED_AWS_TOKEN]'
  },
  // GitHub Tokens (classic: ghp_, gho_, ghu_, ghs_, ghr_)
  {
    name: 'GitHub Token (Classic)',
    pattern: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  // GitHub Fine-grained tokens
  {
    name: 'GitHub Fine-grained Token',
    pattern: /\bgho_[a-zA-Z0-9]{36,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  // GitHub App tokens
  {
    name: 'GitHub App Token',
    pattern: /\bgithub_pat_[a-zA-Z0-9_]{22,}\b/g,
    replacement: '[REDACTED_GITHUB_APP_TOKEN]'
  },
  // Anthropic API Key (sk-ant-...)
  {
    name: 'Anthropic API Key',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/gi,
    replacement: '[REDACTED_ANTHROPIC_KEY]'
  },
  // Anthropic API Key (legacy sk-...)
  {
    name: 'Anthropic Legacy Key',
    pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]'
  },
  // OpenAI API Key (sk-...)
  {
    name: 'OpenAI API Key',
    pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_OPENAI_KEY]'
  },
  // OpenAI Organization Key
  {
    name: 'OpenAI Organization',
    pattern: /\borg-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_OPENAI_ORG]'
  },
  // Azure OpenAI
  {
    name: 'Azure OpenAI Key',
    pattern: /\b[a-zA-Z0-9]{32,}\b/g,
    replacement: '[REDACTED_AZURE_KEY]'
  },
  // Generic Bearer tokens
  {
    name: 'Bearer Token',
    pattern: /(?:Bearer\s+|bearer\s+|authorization\s*[=:]\s*["']?)(\S{20,})/gi,
    replacement: '[REDACTED_BEARER_TOKEN]'
  },
  // Authorization headers with tokens
  {
    name: 'Authorization Header',
    pattern: /(?:Authorization|authorization)\s*:\s*["']?(?:Bearer\s+)?([a-zA-Z0-9_\-\.]{20,})["']?/gi,
    replacement: '[REDACTED_AUTH_HEADER]'
  }
];

// ============================================
// DETECTION PATTERNS - For finding secrets in code
// ============================================

const SECRET_PATTERNS: Array<{
  pattern: RegExp;
  type: SecretFinding['type'];
  severity: VulnerabilitySeverity;
  recommendation: string;
}> = [
  // Generic API key patterns
  {
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*["']([a-zA-Z0-9_\-]{20,})["']/gi,
    type: 'api_key',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Move API keys to environment variables (process.env.API_KEY)'
  },
  // AWS keys
  {
    pattern: /(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)\s*[=:]\s*["']([A-Z0-9]{20,})["']/gi,
    type: 'api_key',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Use AWS IAM roles instead of hardcoded credentials'
  },
  // Generic tokens
  {
    pattern: /(?:access[_-]?token|bearer[_-]?token|auth[_-]?token)\s*[=:]\s*["']([a-zA-Z0-9_\-\.]{20,})["']/gi,
    type: 'token',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Use secure token storage and environment variables'
  },
  // Passwords in config
  {
    pattern: /(?:password|passwd|pwd|pass)\s*[=:]\s*["']([^"'\s]{8,})["']/gi,
    type: 'password',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Use environment variables or secure secret management'
  },
  // Private keys
  {
    pattern: /(?:private[_-]?key|rsa[_-]?key|ssh[_-]?key)\s*[=:]\s*["']-----BEGIN [A-Z ]+ PRIVATE KEY-----/gi,
    type: 'private_key',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Store private keys in secure secret management systems'
  },
  // Database connection strings
  {
    pattern: /(?:mongodb|mysql|postgresql|postgres|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi,
    type: 'credentials',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Use environment variables for database credentials'
  },
  // GitHub tokens
  {
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/gi,
    type: 'token',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Revoke this token immediately and use GitHub Actions secrets'
  },
  // JWT tokens
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    type: 'token',
    severity: VulnerabilitySeverity.HIGH,
    recommendation: 'JWT tokens should be generated server-side, not hardcoded'
  },
  // Slack tokens
  {
    pattern: /xox[baprs]-[0-9a-zA-Z-]+/g,
    type: 'token',
    severity: VulnerabilitySeverity.CRITICAL,
    recommendation: 'Use Slack app tokens stored in secure secret management'
  },
  // Generic secret patterns
  {
    pattern: /(?:secret|client[_-]?secret)\s*[=:]\s*["']([a-zA-Z0-9_\-]{16,})["']/gi,
    type: 'credentials',
    severity: VulnerabilitySeverity.HIGH,
    recommendation: 'Use environment variables for secrets'
  }
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.json', '.yml', '.yaml', '.env', '.xml', '.ini', '.cfg', '.conf'];

// Default exclusion patterns
const DEFAULT_EXCLUDE = ['node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'vendor', 'coverage'];

export class SecretsDetector {
  private projectPath: string;
  private excludePatterns: string[];

  constructor(projectPath: string, excludePatterns: string[] = DEFAULT_EXCLUDE) {
    this.projectPath = projectPath;
    this.excludePatterns = excludePatterns;
  }

  async detect(): Promise<SecretFinding[]> {
    const findings: SecretFinding[] = [];
    const files = await this.findFiles(this.projectPath);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const fileFindings = this.scanFile(file, content);
        findings.push(...fileFindings);
      } catch (error) {
        // Skip unreadable files
      }
    }

    return findings;
  }

  private async findFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);

          // Check exclusions
          if (DEFAULT_EXCLUDE.some(pattern => fullPath.includes(pattern) || entry.name === pattern)) {
            continue;
          }

          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (SCANNABLE_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    await walk(dir);
    return files;
  }

  private scanFile(filePath: string, content: string): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const lines = content.split('\n');

    for (const rule of SECRET_PATTERNS) {
      let match;
      rule.pattern.lastIndex = 0;

      while ((match = rule.pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;

        // Avoid duplicates
        const isDuplicate = findings.some(f =>
          f.file === filePath && f.line === lineNumber && f.type === rule.type
        );

        if (!isDuplicate) {
          findings.push({
            id: `secret-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: rule.type,
            file: filePath,
            line: lineNumber,
            matchedPattern: this.getMatchedPattern(match[0]),
            severity: rule.severity,
            recommendation: rule.recommendation
          });
        }
      }
    }

    return findings;
  }

  private getMatchedPattern(fullMatch: string): string {
    // Truncate long matches for display
    if (fullMatch.length > 40) {
      return fullMatch.substring(0, 40) + '...';
    }
    return fullMatch;
  }
}
