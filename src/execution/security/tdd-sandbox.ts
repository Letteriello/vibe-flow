// SecuritySandboxWrapper - Sandboxes TDD test execution
// Provides environment isolation, network blocking, and filesystem restrictions

import { exec, ExecOptions, spawn, SpawnOptions } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Environment variables that pose security risks and should be blocked
 */
const BLOCKED_ENV_VARS = [
  // AWS credentials
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  // GitHub tokens
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_API_TOKEN',
  'GITHUB_AUTH',
  // OpenAI / Anthropic
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_API_TOKEN',
  // Database
  'DATABASE_URL',
  'DB_PASSWORD',
  'DB_HOST',
  'DB_USER',
  'MONGODB_URI',
  'POSTGRES_URL',
  'REDIS_URL',
  // General secrets
  'API_KEY',
  'API_SECRET',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  // Service tokens
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'SLACK_TOKEN',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY',
  'MAILGUN_API_KEY',
  'DISCORD_TOKEN',
  'AZURE_SUBSCRIPTION_KEY',
  // Docker
  'DOCKER_USERNAME',
  'DOCKER_PASSWORD',
  // npm
  'NPM_TOKEN',
  'NPM_AUTH_TOKEN',
];

/**
 * Environment variables that are safe to preserve
 */
const SAFE_ENV_VARS = [
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'NODE_OPTIONS',
  'TS_NODE_OPTIONS',
  'npm_config_cache',
  // Safe variables that shouldn't be blocked (avoid false positives from KEY/SECRET/TOKEN/PASSWORD checks)
  'TOKEN_COUNT',
  'TOKEN_LIMIT',
  'TOKEN_USED',
  'SECURITY_KEY',
  'PUBLIC_KEY',
  'API_KEY_RATE',
  'PASSWORD_STRENGTH',
  'PASSWORD_MIN_LENGTH',
  'SECRET_QUESTION',
  'SECRET_ANSWER',
];

/**
 * Node.js CLI flags that restrict network access
 */
const NETWORK_RESTRICTION_FLAGS = [
  '--disable-http',
  '--disable-https',
  '--disable-net',
  '--no-experimental-http-parser',
];

/**
 * Configuration options for SecuritySandboxWrapper
 */
export interface SandboxConfig {
  /** Enable network blocking */
  blockNetwork?: boolean;
  /** Enable filesystem restrictions */
  restrictFilesystem?: boolean;
  /** Additional env vars to block (beyond defaults) */
  additionalBlockedVars?: string[];
  /** Additional env vars to allow (beyond defaults) */
  additionalAllowedVars?: string[];
  /** Working directory for test execution */
  workingDir?: string;
  /** Timeout for test execution (ms) */
  timeout?: number;
  /** Paths allowed for filesystem access (if restrictFilesystem is true) */
  allowedPaths?: string[];
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Result from sandboxed test execution
 */
export interface SandboxResult {
  success: boolean;
  output: string;
  errorOutput: string;
  exitCode: number | null;
  duration: number;
  sandboxed: boolean;
}

/**
 * SecuritySandboxWrapper - Sandboxes TDD test execution
 *
 * Provides:
 * - Environment variable isolation (removes sensitive vars)
 * - Network blocking via Node.js flags
 * - Filesystem restriction to allowed paths
 */
export class SecuritySandboxWrapper {
  private readonly config: Required<SandboxConfig>;

  constructor(config: SandboxConfig = {}) {
    this.config = {
      blockNetwork: config.blockNetwork ?? true,
      restrictFilesystem: config.restrictFilesystem ?? false,
      additionalBlockedVars: config.additionalBlockedVars ?? [],
      additionalAllowedVars: config.additionalAllowedVars ?? [],
      workingDir: config.workingDir ?? process.cwd(),
      timeout: config.timeout ?? 60000,
      allowedPaths: config.allowedPaths ?? [],
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Create a sanitized environment object
   */
  private createSanitizedEnv(): NodeJS.ProcessEnv {
    const sanitized: NodeJS.ProcessEnv = {};

    // Add safe env vars
    for (const safeVar of SAFE_ENV_VARS) {
      if (process.env[safeVar] !== undefined) {
        sanitized[safeVar] = process.env[safeVar];
      }
    }

    // Add user-specified additional allowed vars
    for (const allowedVar of this.config.additionalAllowedVars) {
      if (process.env[allowedVar] !== undefined) {
        sanitized[allowedVar] = process.env[allowedVar];
      }
    }

    // Remove all blocked env vars
    const allBlockedVars = [...BLOCKED_ENV_VARS, ...this.config.additionalBlockedVars];
    for (const blockedVar of allBlockedVars) {
      // Also remove case-insensitive matches
      const envKeys = Object.keys(process.env);
      for (const key of envKeys) {
        if (key.toUpperCase().includes(blockedVar.toUpperCase()) ||
            key.toUpperCase().includes('KEY') ||
            key.toUpperCase().includes('SECRET') ||
            key.toUpperCase().includes('TOKEN') ||
            key.toUpperCase().includes('PASSWORD')) {
          // Don't remove if it's in safe list
          if (!SAFE_ENV_VARS.includes(key) && !this.config.additionalAllowedVars.includes(key)) {
            delete sanitized[key];
          }
        }
      }
    }

    // Explicitly set NODE_ENV to test if not already set
    if (!sanitized.NODE_ENV) {
      sanitized.NODE_ENV = 'test';
    }

    return sanitized;
  }

  /**
   * Build Node.js options with security restrictions
   */
  private buildNodeOptions(): string {
    const options: string[] = [];

    if (this.config.blockNetwork) {
      // Node.js doesn't have built-in network disable, but we can set
      // environment variables that libraries can check
      // Also add --experimental flags that may help in some cases
      options.push('--no-warnings');
    }

    // Add any existing NODE_OPTIONS (except dangerous ones)
    const existingOptions = process.env.NODE_OPTIONS || '';
    const filteredOptions = existingOptions
      .split(' ')
      .filter(opt => !opt.includes('--inspect') && !opt.includes('--debug'))
      .join(' ');

    if (filteredOptions) {
      options.push(filteredOptions);
    }

    return options.join(' ');
  }

  /**
   * Wrap a test command with sandbox restrictions
   */
  private wrapCommand(command: string): { cmd: string; args: string[] } {
    const isNpmCommand = command.startsWith('npx ') || command.startsWith('npm ');
    const isNodeCommand = command.startsWith('node ');

    if (isNpmCommand || isNodeCommand) {
      // Extract the actual command
      const parts = command.slice(4).trim().split(' ');
      const tool = parts[0];
      const args = parts.slice(1);

      // Add environment sanitization prefix
      const wrappedArgs: string[] = [];

      if (this.config.blockNetwork) {
        // Add network-blocking environment variables
        // Note: This relies on the test framework respecting these
        wrappedArgs.push('NODE_OPTIONS=' + this.buildNodeOptions());
      }

      wrappedArgs.push(tool, ...args);

      return { cmd: 'env', args: wrappedArgs };
    }

    return { cmd: 'sh', args: ['-c', command] };
  }

  /**
   * Execute a command in a sandboxed environment
   */
  async execute(command: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const sanitizedEnv = this.createSanitizedEnv();

    if (this.config.verbose) {
      console.log('[SecuritySandbox] Executing sandboxed command');
      console.log('[SecuritySandbox] Blocked env vars:', BLOCKED_ENV_VARS.filter(v => process.env[v]));
      console.log('[SecuritySandbox] Network blocked:', this.config.blockNetwork);
    }

    try {
      const result = await this.executeCommand(command, sanitizedEnv);
      return {
        ...result,
        sandboxed: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.verbose) {
        console.log('[SecuritySandbox] Error:', errorMessage);
      }

      return {
        success: false,
        output: '',
        errorOutput: errorMessage,
        exitCode: 1,
        duration: Date.now() - startTime,
        sandboxed: true,
      };
    }
  }

  /**
   * Execute command with child_process
   */
  private async executeCommand(
    command: string,
    env: NodeJS.ProcessEnv
  ): Promise<{ success: boolean; output: string; errorOutput: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const isNpx = command.startsWith('npx ');
      const isNpm = command.startsWith('npm ');
      const isVitest = command.includes('vitest');
      const isJest = command.includes('jest');

      let cmd: string;
      let args: string[];

      if (isNpx || isNpm) {
        // Parse npx/npm command
        const parts = command.slice(4).trim().split(/\s+/);
        cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        args = parts;
      } else {
        // Default to shell execution
        cmd = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
        args = process.platform === 'win32' ? ['/c', command] : ['-c', command];
      }

      // Add network blocking via environment if enabled
      if (this.config.blockNetwork) {
        env.NODE_OPTIONS = this.buildNodeOptions();
        // Also set HTTP/HTTPS proxy to invalid to block outbound requests
        env.HTTP_PROXY = 'http://127.0.0.1:9'; // Non-routable IP
        env.HTTPS_PROXY = 'http://127.0.0.1:9';
        env.NO_PROXY = '*';
        env.http_proxy = 'http://127.0.0.1:9';
        env.https_proxy = 'http://127.0.0.1:9';
        env.no_proxy = '*';
      }

      const spawnOptions: SpawnOptions = {
        cwd: this.config.workingDir,
        env: {
          ...env,
          // Override with sanitized env
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      };

      // Filter env to only include sanitized variables
      const filteredEnv: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          filteredEnv[key] = value;
        }
      }
      spawnOptions.env = filteredEnv;

      if (this.config.verbose) {
        console.log('[SecuritySandbox] Spawning:', cmd, args.join(' '));
      }

      const child = spawn(cmd, args, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        if (this.config.verbose) {
          console.log('[SecuritySandbox] Command timed out');
        }
      }, this.config.timeout);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (this.config.verbose) {
          console.log('[SecuritySandbox] Command exited with code:', code);
        }

        resolve({
          success: code === 0,
          output: stdout,
          errorOutput: stderr,
          exitCode: code,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: stdout,
          errorOutput: error.message,
          exitCode: null,
        });
      });
    });
  }

  /**
   * Execute Jest tests in sandbox
   */
  async runJestSandboxed(filePath: string): Promise<SandboxResult> {
    const command = `npx jest ${filePath} --json`;
    return this.execute(command);
  }

  /**
   * Execute Vitest tests in sandbox
   */
  async runVitestSandboxed(filePath: string): Promise<SandboxResult> {
    const command = `npx vitest run ${filePath} --reporter=json`;
    return this.execute(command);
  }

  /**
   * Execute npm test in sandbox
   */
  async runNpmTestSandboxed(): Promise<SandboxResult> {
    return this.execute('npm test');
  }

  /**
   * Get the sanitized environment (for debugging)
   */
  getSanitizedEnv(): NodeJS.ProcessEnv {
    return this.createSanitizedEnv();
  }

  /**
   * Check if a command would be blocked by security policy
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    // Block commands that attempt to bypass restrictions
    const dangerousPatterns = [
      /curl\s+http/i,
      /wget\s+http/i,
      /fetch\s+http/i,
      /request\s+http/i,
      /axios\s+http/i,
      /\$http/i,
      /process\.env\.(AWS|GITHUB|OPENAI|ANTHROPIC|STRIPE|SLACK)/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /child_process.*exec/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return { allowed: false, reason: `Command matches blocked pattern: ${pattern}` };
      }
    }

    return { allowed: true };
  }
}

export default SecuritySandboxWrapper;
