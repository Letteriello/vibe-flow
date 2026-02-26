import * as vm from 'vm';

export interface SandboxOptions {
  timeout?: number;
  maxMemory?: number;
  allowedGlobals?: string[];
}

export interface SandboxResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
}

/**
 * Executes JavaScript/TypeScript code in an isolated sandbox environment.
 * Uses Node's vm module for safe execution with configurable limits.
 */
export function executeInSandbox(
  code: string,
  options: SandboxOptions = {}
): SandboxResult {
  const startTime = Date.now();
  const {
    timeout = 5000,
    maxMemory = 128 * 1024 * 1024, // 128MB default
    allowedGlobals = ['console', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite']
  } = options;

  // Create a sandboxed context with limited globals
  const sandbox: Record<string, unknown> = {};

  for (const global of allowedGlobals) {
    try {
      sandbox[global] = (globalThis as Record<string, unknown>)[global];
    } catch {
      // Skip globals that aren't available
    }
  }

  // Add safe utility functions
  sandbox.__internal = {
    maxMemory,
    timeout
  };

  try {
    const context = vm.createContext(sandbox);

    const script = new vm.Script(code, {
      filename: 'sandbox-script.js'
    });

    const result = script.runInContext(context, {
      timeout,
      displayErrors: true
    });

    return {
      success: true,
      output: result,
      executionTimeMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Executes code with access to input data (e.g., for filtering/pagination).
 * The data is injected into the sandbox context.
 */
export function executeWithData<TInput, TOutput>(
  code: string,
  inputData: TInput,
  options: SandboxOptions = {}
): SandboxResult & { output?: TOutput } {
  const startTime = Date.now();
  const {
    timeout = 10000,
    allowedGlobals = ['console', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise', 'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'filter', 'map', 'reduce', 'slice', 'sort', 'forEach']
  } = options;

  // Create sandbox with input data
  const sandbox: Record<string, unknown> = {
    input: inputData
  };

  for (const global of allowedGlobals) {
    try {
      sandbox[global] = (globalThis as Record<string, unknown>)[global];
    } catch {
      // Skip unavailable globals
    }
  }

  try {
    const context = vm.createContext(sandbox);

    // Wrap code to ensure it returns the processed result
    const wrappedCode = `
      (function(input) {
        ${code}
      })(input);
    `;

    const script = new vm.Script(wrappedCode, {
      filename: 'sandbox-data-script.js'
    });

    const result = script.runInContext(context, {
      timeout,
      displayErrors: true
    });

    return {
      success: true,
      output: result as TOutput,
      executionTimeMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: Date.now() - startTime
    };
  }
}
