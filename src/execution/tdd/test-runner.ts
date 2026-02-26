// TDD Test Runner - Executes test commands and returns structured results

import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestResult {
  passed: boolean;
  failedTests: string[];
  errorOutput: string;
}

export interface TestRunnerOptions {
  timeout?: number; // in milliseconds
  workingDir?: string;
  verbose?: boolean;
}

interface JestJsonResult {
  success: boolean;
  testResults?: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    assertionErrors?: Array<{ message?: string }>;
  }>;
  message?: string;
}

export class TestRunner {
  private readonly timeout: number;
  private readonly workingDir: string;
  private readonly verbose: boolean;

  constructor(options: TestRunnerOptions = {}) {
    this.timeout = options.timeout ?? 60000;
    this.workingDir = options.workingDir ?? process.cwd();
    this.verbose = options.verbose ?? false;
  }

  /**
   * Run a test command and return structured result
   * @param command - Test command to execute (e.g., "npx jest path/to/test.ts --json")
   * @returns TestResult with passed status, failed test names, and error output
   */
  async run(command: string): Promise<TestResult> {
    const execOptions: ExecOptions = {
      cwd: this.workingDir,
      timeout: this.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    };

    if (this.verbose) {
      console.log(`[TestRunner] Executing: ${command}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      const output = (stdout || stderr || '').toString();

      if (this.verbose) {
        console.log(`[TestRunner] Output length: ${output.length}`);
      }

      // Try to parse JSON output (Jest --json)
      const parsed = this.tryParseJson(output);
      if (parsed) {
        return this.parseJestJsonResult(parsed, output);
      }

      // Fallback: parse stdout/stderr directly
      return this.parseTextOutput(output);
    } catch (error) {
      // Handle execAsync error which may have stdout/stderr as Buffer
      let errorMessage: string;
      if (error && typeof error === 'object') {
        const err = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
        const stdoutStr = err.stdout ? String(err.stdout) : '';
        const stderrStr = err.stderr ? String(err.stderr) : '';
        const msg = err.message ? String(err.message) : '';
        errorMessage = msg || stdoutStr || stderrStr || String(error);
      } else {
        errorMessage = String(error);
      }

      if (this.verbose) {
        console.log(`[TestRunner] Error: ${errorMessage}`);
      }

      // Check if it's a Jest JSON error result
      if (errorMessage.includes('{') && errorMessage.includes('"success"')) {
        const parsed = this.tryParseJson(errorMessage);
        if (parsed) {
          return this.parseJestJsonResult(parsed, errorMessage);
        }
      }

      return {
        passed: false,
        failedTests: [],
        errorOutput: errorMessage,
      };
    }
  }

  /**
   * Run Jest tests for a specific file
   */
  async runJest(filePath: string): Promise<TestResult> {
    return this.run(`npx jest ${filePath} --json`);
  }

  /**
   * Run Vitest tests for a specific file
   */
  async runVitest(filePath: string): Promise<TestResult> {
    return this.run(`npx vitest run ${filePath} --reporter=json`);
  }

  /**
   * Run a npm test script
   */
  async runNpmTest(): Promise<TestResult> {
    return this.run('npm test');
  }

  /**
   * Try to parse JSON from string
   */
  private tryParseJson(output: string): JestJsonResult | null {
    // Find JSON start and end
    const startIdx = output.indexOf('{');
    const endIdx = output.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }

    const jsonStr = output.substring(startIdx, endIdx + 1);

    try {
      return JSON.parse(jsonStr) as JestJsonResult;
    } catch {
      return null;
    }
  }

  /**
   * Parse Jest JSON output
   */
  private parseJestJsonResult(parsed: JestJsonResult, rawOutput: string): TestResult {
    const failedTests: string[] = [];

    if (parsed.testResults && Array.isArray(parsed.testResults)) {
      for (const result of parsed.testResults) {
        if (result.status === 'failed') {
          failedTests.push(result.name);
        }
      }
    }

    const passed = parsed.success === true && failedTests.length === 0;

    // If tests failed but no failedTests detected, try to extract from message
    if (!passed && failedTests.length === 0 && parsed.message) {
      failedTests.push('Test execution failed');
    }

    return {
      passed,
      failedTests,
      errorOutput: passed ? '' : rawOutput,
    };
  }

  /**
   * Parse text output when JSON parsing fails
   */
  private parseTextOutput(output: string): TestResult {
    const lines = output.split('\n');
    const failedTests: string[] = [];
    let hasFailure = false;

    // Common patterns for test failures
    const failurePatterns = [
      /FAIL\s+(.+)/i,
      /✕\s+(.+)/i,
      /FAILED\s+(.+)/i,
      /^(.+?)\s+FAILED$/im,
    ];

    for (const line of lines) {
      for (const pattern of failurePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const testName = match[1].trim();
          if (!failedTests.includes(testName)) {
            failedTests.push(testName);
          }
          hasFailure = true;
        }
      }

      // Check for pass indicators
      if (/PASS\s+/i.test(line) || /✓|✔|PASSED/i.test(line)) {
        hasFailure = false;
      }
    }

    // If we see error indicators but no specific tests, mark as failed
    if (!hasFailure && (output.includes('Error:') || output.includes('error:'))) {
      hasFailure = true;
    }

    return {
      passed: !hasFailure,
      failedTests,
      errorOutput: hasFailure ? output : '',
    };
  }
}

export default TestRunner;
