/**
 * Agentic Map Operator
 *
 * Parallel sub-agent spawning with concurrency limit of 5.
 * Uses streaming JSONL for memory-efficient I/O.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

/**
 * Input record for agentic processing
 */
export interface AgenticInput {
  id: string;
  task: string;
  context?: Record<string, unknown>;
  agentType?: string;
}

/**
 * Output record from agentic processing
 */
export interface AgenticOutput {
  id: string;
  result: string;
  agentType?: string;
  error?: string;
  context?: Record<string, unknown>;
}

/**
 * Result of agentic map operation with typed results
 */
export interface AgenticMapResult<TInput extends AgenticInput, TOutput extends AgenticOutput> {
  outputs: TOutput[];
  successful: number;
  failed: number;
  total: number;
}

/**
 * Options for agentic map operator
 */
export interface AgenticMapOptions {
  concurrency?: number;
  maxConcurrency?: number;
}

/**
 * Sub-agent spawner function type
 */
export type AgentSpawner<TInput extends AgenticInput, TOutput extends AgenticOutput> = (
  input: TInput,
  task: string
) => Promise<TOutput>;

/**
 * Agent configuration
 */
export interface AgentConfig {
  type: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Reads JSONL file as a stream
 */
async function* readJsonlStream(filePath: string): AsyncGenerator<AgenticInput> {
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as AgenticInput;
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
 * Processes inputs by spawning sub-agents in parallel with limited concurrency
 *
 * @param inputs - Array of input records to process
 * @param baseTask - Base task description for all agents
 * @param spawner - Function to spawn sub-agent for each input
 * @param options - Options including concurrency limit
 * @returns Promise resolving to AgenticMapResult with all outputs
 */
export async function agenticMap<TInput extends AgenticInput, TOutput extends AgenticOutput>(
  inputs: TInput[],
  baseTask: string,
  spawner: AgentSpawner<TInput, TOutput>,
  options: AgenticMapOptions = {}
): Promise<AgenticMapResult<TInput, TOutput>> {
  const maxConcurrency = options.maxConcurrency ?? options.concurrency ?? 5;

  if (maxConcurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  const limiter = createConcurrencyLimiter(maxConcurrency);

  const tasks = inputs.map((input) =>
    limiter(async () => {
      try {
        // Combine base task with input-specific task
        const fullTask = `${baseTask}\n\nInput: ${input.task}`;
        return await spawner(input, fullTask);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          agentType: input.agentType,
          error: errorMessage,
          context: input.context,
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
 * Processes a JSONL file with streaming input/output for sub-agent tasks
 *
 * @param inputPath - Path to input JSONL file
 * @param outputPath - Path to output JSONL file
 * @param baseTask - Base task description for all agents
 * @param spawner - Function to spawn sub-agent for each input
 * @param options - Options including concurrency limit
 * @returns Promise resolving to AgenticMapResult
 */
export async function agenticMapFile<
  TInput extends AgenticInput,
  TOutput extends AgenticOutput
>(
  inputPath: string,
  outputPath: string,
  baseTask: string,
  spawner: AgentSpawner<TInput, TOutput>,
  options: AgenticMapOptions = {}
): Promise<AgenticMapResult<TInput, TOutput>> {
  const maxConcurrency = options.maxConcurrency ?? options.concurrency ?? 5;
  const limiter = createConcurrencyLimiter(maxConcurrency);

  // Collect all inputs from the file
  const inputs: TInput[] = [];
  for await (const input of readJsonlStream(inputPath)) {
    inputs.push(input as TInput);
  }

  // Process with concurrency limit
  const tasks = inputs.map((input) =>
    limiter(async () => {
      try {
        const fullTask = `${baseTask}\n\nInput: ${input.task}`;
        return await spawner(input, fullTask);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          agentType: input.agentType,
          error: errorMessage,
          context: input.context,
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
 * Reduces multiple agentic outputs into a single result
 * Type-safe reducer function
 */
export interface AgenticReduceOptions<TOutput extends AgenticOutput, TResult> {
  initialValue: TResult;
  reducer: (acc: TResult, output: TOutput) => TResult;
}

export function agenticReduce<TOutput extends AgenticOutput, TResult>(
  outputs: TOutput[],
  options: AgenticReduceOptions<TOutput, TResult>
): TResult {
  return outputs.reduce(options.reducer, options.initialValue);
}

/**
 * Streaming version that processes and writes incrementally
 * Most memory-efficient for large files with sub-agent spawning
 */
export async function agenticMapStream<
  TInput extends AgenticInput,
  TOutput extends AgenticOutput
>(
  inputPath: string,
  outputPath: string,
  baseTask: string,
  spawner: AgentSpawner<TInput, TOutput>,
  options: AgenticMapOptions = {}
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
      const outputs = await processBatch(batch, baseTask, spawner, limiter);

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
    const outputs = await processBatch(batch, baseTask, spawner, limiter);

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

async function processBatch<TInput extends AgenticInput, TOutput extends AgenticOutput>(
  batch: TInput[],
  baseTask: string,
  spawner: AgentSpawner<TInput, TOutput>,
  limiter: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<TOutput[]> {
  const tasks = batch.map((input) =>
    limiter(async () => {
      try {
        const fullTask = `${baseTask}\n\nInput: ${input.task}`;
        return await spawner(input, fullTask);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: input.id,
          result: '',
          agentType: input.agentType,
          error: errorMessage,
          context: input.context,
        } as TOutput;
      }
    })
  );

  return Promise.all(tasks);
}

/**
 * Create a sub-agent spawner with common configuration
 */
export function createAgentSpawner<TInput extends AgenticInput, TOutput extends AgenticOutput>(
  agentConfig: AgentConfig,
  spawnFn: (task: string, config: AgentConfig) => Promise<string>
): AgentSpawner<TInput, TOutput> {
  return async (input: TInput, task: string): Promise<TOutput> => {
    const result = await spawnFn(task, agentConfig);
    const output: AgenticOutput = {
      id: input.id,
      result,
      agentType: agentConfig.type,
      context: input.context,
    };
    return output as TOutput;
  };
}
