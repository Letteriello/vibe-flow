/**
 * Utility for executing shell commands asynchronously
 */

import { exec as nodeExec, ExecException, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execAsyncNative = promisify(nodeExec);

/**
 * Result of command execution
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Extended options for command execution
 */
export interface ExtendedExecOptions extends ExecOptions {
  timeout?: number;
  cwd?: string;
}

/**
 * Execute a shell command asynchronously with timeout support
 */
export async function execAsync(
  command: string,
  options: ExtendedExecOptions = {}
): Promise<ExecResult> {
  const { timeout = 60000, cwd = process.cwd(), ...execOptions } = options;

  try {
    const raw = await execAsyncNative(command, {
      ...execOptions,
      cwd,
      timeout,
    }) as { stdout: string | Buffer; stderr: string | Buffer };

    const stdoutStr = (raw.stdout instanceof Buffer)
      ? raw.stdout.toString('utf-8')
      : raw.stdout;
    const stderrStr = (raw.stderr instanceof Buffer)
      ? raw.stderr.toString('utf-8')
      : raw.stderr;

    return {
      stdout: stdoutStr,
      stderr: stderrStr,
      exitCode: 0,
    };
  } catch (error) {
    const execError = error as ExecException & { code?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    // Capture stdout/stderr from the error object when command fails
    const stdoutStr = execError.stdout
      ? (execError.stdout instanceof Buffer ? execError.stdout.toString('utf-8') : execError.stdout)
      : '';
    const stderrStr = execError.stderr
      ? (execError.stderr instanceof Buffer ? execError.stderr.toString('utf-8') : execError.stderr)
      : execError.message || String(error);
    return {
      stdout: stdoutStr,
      stderr: stderrStr,
      exitCode: execError.code ?? 1,
    };
  }
}
