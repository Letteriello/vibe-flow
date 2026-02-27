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
    const { stdout, stderr } = await execAsyncNative(command, {
      ...execOptions,
      cwd,
      timeout,
    });

    return {
      stdout: typeof stdout === 'string' ? stdout : stdout.toString('utf-8'),
      stderr: typeof stderr === 'string' ? stderr : stderr.toString('utf-8'),
      exitCode: 0,
    };
  } catch (error) {
    const execError = error as ExecException & { code?: number; stderr?: string };
    return {
      stdout: '',
      stderr: execError.message || String(error),
      exitCode: execError.code ?? 1,
    };
  }
}
