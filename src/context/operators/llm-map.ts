/**
 * LLM Map Operator
 *
 * Deterministic parallel batch processing with concurrency control.
 * Does not pollute parent agent context - returns only aggregated JSON results.
 */

import { z } from 'zod';
import {
  LLMMapInput,
  LLMMapOutput,
  LLMMapResult,
  LLMMapOptions,
  LLMClient,
  SchemaValidationError,
  ProgressCallback,
} from './types.js';

/**
 * Default options for LLM map
 */
const DEFAULT_OPTIONS: Required<LLMMapOptions> = {
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  promptTemplate: 'Process the following item: {item}',
};

/**
 * Creates a concurrency-limited executor using semaphore pattern
 */
function createConcurrencyLimiter(maxConcurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    while (running < maxConcurrency && queue.length > 0) {
      const fn = queue.shift();
      if (fn) {
        running++;
        fn();
      }
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          running--;
          next();
        }
      };

      if (running < maxConcurrency) {
        running++;
        execute();
      } else {
        queue.push(execute);
      }
    });
  };
}

/**
 * Validates and parses LLM response against schema
 * Returns parsed data or throws validation error
 */
function validateResponse<T>(
  response: string,
  schema: z.ZodSchema<T>
): T {
  try {
    // First try to parse as JSON
    const parsed = JSON.parse(response);
    // Then validate against schema
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError: SchemaValidationError = {
        message: 'Schema validation failed',
        errors: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
        attempt: 0,
      };
      throw validationError;
    }
    // JSON parse error
    throw {
      message: `Failed to parse LLM response as JSON: ${response.slice(0, 200)}`,
      attempt: 0,
    } as SchemaValidationError;
  }
}

/**
 * Executes LLM call with automatic retry on schema validation errors
 */
async function executeWithRetry<T>(
  client: LLMClient,
  prompt: string,
  schema: z.ZodSchema<T>,
  maxRetries: number,
  retryDelay: number
): Promise<{ data: T; attempts: number }> {
  let lastError: SchemaValidationError | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;

    try {
      const rawResponse = await client.call(prompt, schema);
      const data = validateResponse(rawResponse, schema);
      return { data, attempts: attempt };
    } catch (error) {
      lastError = error as SchemaValidationError;
      lastError.attempt = attempt;

      // Only retry on schema validation errors
      const isSchemaError =
        lastError.message.includes('Schema validation failed') ||
        lastError.message.includes('Failed to parse');

      if (isSchemaError && attempt <= maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        continue;
      }

      // Non-retryable error or max retries reached
      break;
    }
  }

  throw lastError;
}

/**
 * Processes a single input item through LLM
 */
async function processItem<TInput, TOutput>(
  item: LLMMapInput<TInput>,
  client: LLMClient,
  prompt: string,
  schema: z.ZodSchema<TOutput>,
  options: Required<LLMMapOptions>
): Promise<LLMMapOutput<TOutput>> {
  try {
    const { data, attempts } = await executeWithRetry(
      client,
      prompt,
      schema,
      options.maxRetries,
      options.retryDelay
    );

    return {
      id: item.id,
      data,
      attempts,
      metadata: item.metadata,
    };
  } catch (error) {
    const err = error as SchemaValidationError;
    return {
      id: item.id,
      data: null as TOutput,
      error: err.message,
      attempts: err.attempt || 1,
      metadata: item.metadata,
    };
  }
}

/**
 * Main LLM Map function
 *
 * Processes an array of inputs in parallel with LLM calls,
 * validates outputs against schema, and returns aggregated results.
 *
 * @param inputArray - Array of inputs to process
 * @param prompt - Prompt template (use {item} or {data} placeholder)
 * @param outputSchema - Zod schema for output validation
 * @param client - LLM client implementation
 * @param options - Configuration options
 * @returns Promise resolving to LLMMapResult with validated outputs
 *
 * @example
 * ```typescript
 * const results = await llmMap(
 *   [{ id: '1', data: { text: 'hello' } }],
 *   'Classify this: {item}',
 *   z.object({ sentiment: z.enum(['positive', 'negative']) }),
 *   myLlmClient,
 *   { concurrency: 5 }
 * );
 * ```
 */
export async function llmMap<TInput, TOutput>(
  inputArray: LLMMapInput<TInput>[],
  prompt: string,
  outputSchema: z.ZodSchema<TOutput>,
  client: LLMClient,
  options: LLMMapOptions = {}
): Promise<LLMMapResult<TOutput>> {
  // Merge with defaults
  const opts: Required<LLMMapOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (inputArray.length === 0) {
    return {
      outputs: [],
      successful: 0,
      failed: 0,
      total: 0,
    };
  }

  if (opts.concurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  const limiter = createConcurrencyLimiter(opts.concurrency);

  // Build the actual prompt for each item
  const buildPrompt = (item: LLMMapInput<TInput>): string => {
    const itemJson = JSON.stringify(item.data);
    return prompt.replace(/\{item\}|\{data\}/g, itemJson);
  };

  // Process all items in parallel with concurrency limit
  const tasks = inputArray.map((item) =>
    limiter(async () => {
      const itemPrompt = buildPrompt(item);
      return processItem(item, client, itemPrompt, outputSchema, opts);
    })
  );

  const outputs = await Promise.all(tasks);

  // Aggregate results
  const successful = outputs.filter((o) => !o.error).length;
  const failed = outputs.filter((o) => o.error).length;

  return {
    outputs,
    successful,
    failed,
    total: inputArray.length,
  };
}

/**
 * Simple reduce function to aggregate outputs
 */
export function llmReduce<TOutput, TResult>(
  outputs: LLMMapOutput<TOutput>[],
  reducer: (acc: TResult, item: LLMMapOutput<TOutput>) => TResult,
  initialValue: TResult
): TResult {
  return outputs.reduce(reducer, initialValue);
}

/**
 * Utility to extract only successful results
 */
export function getSuccessfulOutputs<T>(result: LLMMapResult<T>): LLMMapOutput<T>[] {
  return result.outputs.filter((o) => !o.error);
}

/**
 * Utility to extract only failed results
 */
export function getFailedOutputs<T>(result: LLMMapResult<T>): LLMMapOutput<T>[] {
  return result.outputs.filter((o) => o.error);
}

/**
 * Utility to extract just the data array (for further processing)
 */
export function extractData<T>(result: LLMMapResult<T>): T[] {
  return result.outputs
    .filter((o) => !o.error)
    .map((o) => o.data);
}
