/**
 * LLM Map Operator
 *
 * Parallel batch processing with concurrency limit of 5.
 * Uses streaming JSONL for memory-efficient I/O.
 */

import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Input record for LLM processing
 */
export interface LLMInput {
  id: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Output record from LLM processing
 */
export interface LLMOutput {
  id: string;
  result: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of map operation with typed results
 */
export interface MapResult<TInput extends LLMInput, TOutput extends LLMOutput> {
  outputs: TOutput[];
  successful: number;
  failed: number;
  total: number;
}

/**
 * Options for LLM map operator
 */
export interface LLMMapOptions {
  concurrency?: number;
  maxConcurrency?: number;
}

/**
 * LLM processor function type
 */
export type LLMProcessor<TInput extends LLMInput, TOutput extends LLMOutput> = (
  input: TInput,
  basePrompt: string
) => Promise<TOutput>;

/**
 * Reads JSONL file as a stream
 */
async function* readJsonlStream(filePath: string): AsyncGenerator<LLMInput> {
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as LLMInput;
      yield parsed;
    } catch (error) {
      console.warn(`Warning: Failed to parse line ${lineNumber}: ${line}`);
    }
  }
}

/**
 * Creates a limited concurrency executor
 * Uses a semaphore pattern to limit parallel executions
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
 * Processes inputs in parallel with limited concurrency
 *
 * @param inputs - Array of input records to process
 * @param basePrompt - Base prompt to prepend to each input's prompt
 * @param processor - Function to process each input
 * @param options - Options including concurrency limit
 * @returns Promise resolving to MapResult with all outputs
 */
export async function llmMap<TInput extends LLMInput, TOutput extends LLMOutput>(
  inputs: TInput[],
  basePrompt: string,
  processor: LLMProcessor<TInput, TOutput>,
  options: LLMMapOptions = {}
): Promise<MapResult<TInput, TOutput>> {
  const maxConcurrency = options.maxConcurrency ?? options.concurrency ?? 5;

  if (maxConcurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  const limiter = createConcurrencyLimiter(maxConcurrency);

  const tasks = inputs.map((input) =>
    limiter(async () => {
      try {
        return await processor(input, basePrompt);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          error: errorMessage,
          metadata: input.metadata,
        } as TOutput;
      }
    })
  );

  const outputs = await Promise.all(tasks);

  const successful = outputs.filter((o) => !o.error).length;
  const failed = outputs.filter((o) => o.error).length;

  return {
    outputs,
    successful,
    failed,
    total: inputs.length,
  };
}

/**
 * Processes a JSONL file with streaming input/output
 *
 * @param inputPath - Path to input JSONL file
 * @param outputPath - Path to output JSONL file
 * @param basePrompt - Base prompt for processing
 * @param processor - Function to process each input
 * @param options - Options including concurrency limit
 * @returns Promise resolving to MapResult
 */
export async function llmMapFile<
  TInput extends LLMInput,
  TOutput extends LLMOutput
>(
  inputPath: string,
  outputPath: string,
  basePrompt: string,
  processor: LLMProcessor<TInput, TOutput>,
  options: LLMMapOptions = {}
): Promise<MapResult<TInput, TOutput>> {
  const maxConcurrency = options.maxConcurrency ?? options.concurrency ?? 5;
  const limiter = createConcurrencyLimiter(maxConcurrency);

  // First, collect all inputs from the file
  const inputs: TInput[] = [];
  for await (const input of readJsonlStream(inputPath)) {
    inputs.push(input as TInput);
  }

  // Process with concurrency limit
  const tasks = inputs.map((input) =>
    limiter(async () => {
      try {
        return await processor(input, basePrompt);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          error: errorMessage,
          metadata: input.metadata,
        } as TOutput;
      }
    })
  );

  const outputs = await Promise.all(tasks);

  // Write outputs to JSONL file
  const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
  for (const output of outputs) {
    writeStream.write(JSON.stringify(output) + '\n');
  }
  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  const successful = outputs.filter((o) => !o.error).length;
  const failed = outputs.filter((o) => o.error).length;

  return {
    outputs,
    successful,
    failed,
    total: inputs.length,
  };
}

/**
 * Reduces multiple outputs into a single result
 * Type-safe reducer function
 */
export interface ReduceOptions<TOutput extends LLMOutput, TResult> {
  initialValue: TResult;
  reducer: (acc: TResult, output: TOutput) => TResult;
}

export function llmReduce<TOutput extends LLMOutput, TResult>(
  outputs: TOutput[],
  options: ReduceOptions<TOutput, TResult>
): TResult {
  return outputs.reduce(options.reducer, options.initialValue);
}

/**
 * Streaming version that processes and writes incrementally
 * Most memory-efficient for large files
 */
export async function llmMapStream<TInput extends LLMInput, TOutput extends LLMOutput>(
  inputPath: string,
  outputPath: string,
  basePrompt: string,
  processor: LLMProcessor<TInput, TOutput>,
  options: LLMMapOptions = {}
): Promise<{ processed: number; successful: number; failed: number }> {
  const maxConcurrency = options.maxConcurrency ?? options.concurrency ?? 5;
  const limiter = createConcurrencyLimiter(maxConcurrency);

  const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

  let processed = 0;
  let successful = 0;
  let failed = 0;

  // Process in batches to avoid memory issues with large files
  const batchSize = maxConcurrency * 2;
  const inputStream = Readable.from(readJsonlStream(inputPath));

  const batch: TInput[] = [];

  for await (const input of inputStream) {
    batch.push(input as TInput);

    if (batch.length >= batchSize) {
      const outputs = await processBatch(batch, basePrompt, processor, limiter);

      for (const output of outputs) {
        writeStream.write(JSON.stringify(output) + '\n');
        processed++;
        if (output.error) {
          failed++;
        } else {
          successful++;
        }
      }

      batch.length = 0;
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    const outputs = await processBatch(batch, basePrompt, processor, limiter);

    for (const output of outputs) {
      writeStream.write(JSON.stringify(output) + '\n');
      processed++;
      if (output.error) {
        failed++;
      } else {
        successful++;
      }
    }
  }

  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { processed, successful, failed };
}

async function processBatch<TInput extends LLMInput, TOutput extends LLMOutput>(
  batch: TInput[],
  basePrompt: string,
  processor: LLMProcessor<TInput, TOutput>,
  limiter: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<TOutput[]> {
  const tasks = batch.map((input) =>
    limiter(async () => {
      try {
        return await processor(input, basePrompt);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          error: errorMessage,
          metadata: input.metadata,
        } as TOutput;
      }
    })
  );

  return Promise.all(tasks);
}
