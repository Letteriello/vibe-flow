import { executeInSandbox, executeWithData, SandboxOptions, SandboxResult } from './sandbox.js';

export interface ProgrammaticRunnerOptions extends SandboxOptions {
  /**
   * Description of what the script should do.
   * Used for generating the code if not provided directly.
   */
  description?: string;

  /**
   * Expected output format (e.g., 'json', 'text', 'array').
   */
  outputFormat?: 'json' | 'text' | 'array' | 'raw';

  /**
   * Whether to pretty-print JSON output.
   */
  prettyPrint?: boolean;
}

export interface ProgrammaticRunnerResult {
  success: boolean;
  output?: unknown;
  formattedOutput?: string;
  error?: string;
  executionTimeMs: number;
  metadata?: {
    outputFormat: string;
    codeLength: number;
  };
}

/**
 * Formats the output based on the specified format.
 */
function formatOutput(output: unknown, format: string, prettyPrint: boolean): string {
  switch (format) {
    case 'json':
      return prettyPrint ? JSON.stringify(output, null, 2) : JSON.stringify(output);
    case 'array':
      if (Array.isArray(output)) {
        return output.map((item, i) => `[${i}] ${JSON.stringify(item, null, 2)}`).join('\n');
      }
      return String(output);
    case 'text':
      return String(output);
    case 'raw':
    default:
      if (typeof output === 'object' && output !== null) {
        return JSON.stringify(output, null, 2);
      }
      return String(output);
  }
}

/**
 * Runs a programmatic script to process data locally.
 * This allows the LLM to filter/paginate large datasets without sending them to the API.
 *
 * @param code - JavaScript code to execute
 * @param inputData - Optional input data to process (e.g., array of items)
 * @param options - Configuration options
 */
export function runProgrammaticScript<TInput = unknown, TOutput = unknown>(
  code: string,
  inputData?: TInput,
  options: ProgrammaticRunnerOptions = {}
): ProgrammaticRunnerResult {
  const {
    outputFormat = 'raw',
    prettyPrint = true,
    ...sandboxOptions
  } = options;

  // If input data is provided, use executeWithData
  const result = inputData !== undefined
    ? executeWithData<TInput, TOutput>(code, inputData, sandboxOptions)
    : executeInSandbox(code, sandboxOptions);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
      metadata: {
        outputFormat,
        codeLength: code.length
      }
    };
  }

  const formattedOutput = formatOutput(result.output, outputFormat, prettyPrint);

  return {
    success: true,
    output: result.output,
    formattedOutput,
    executionTimeMs: result.executionTimeMs,
    metadata: {
      outputFormat,
      codeLength: code.length
    }
  };
}

/**
 * Tool wrapper for LLM invocation.
 * The LLM sends code to filter/paginate data, and this returns the processed result.
 */
export function programmaticTool(
  code: string,
  inputData?: unknown,
  options: ProgrammaticRunnerOptions = {}
): ProgrammaticRunnerResult {
  return runProgrammaticScript(code, inputData, options);
}

// Export types for consumers
export type { SandboxOptions, SandboxResult };
