// Agentic Map Operator - Parallel LLM worker pool for processing lists
import { randomUUID } from 'crypto';

/**
 * JSON Schema for validating worker responses
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * Configuration for AgenticMapOperator
 */
export interface AgenticMapConfig {
  /** Maximum concurrent workers (default: 5) */
  maxConcurrency: number;
  /** Timeout per worker in ms (default: 60000) */
  workerTimeoutMs: number;
  /** Enable validation of responses against schema */
  validateResponses: boolean;
  /** Schema to validate responses against */
  responseSchema?: JSONSchema;
  /** Retry failed workers (default: 2) */
  maxRetries: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelayMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_AGENTIC_MAP_CONFIG: AgenticMapConfig = {
  maxConcurrency: 5,
  workerTimeoutMs: 60000,
  validateResponses: true,
  maxRetries: 2,
  retryDelayMs: 1000
};

/**
 * Input item for map operation
 */
export interface MapInput<T = string> {
  /** Unique identifier for this input */
  id: string;
  /** The input value (e.g., file path) */
  value: T;
  /** Optional metadata for the worker */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a single worker execution
 */
export interface WorkerResult<T = unknown> {
  /** Input ID */
  inputId: string;
  /** Whether the worker succeeded */
  success: boolean;
  /** The processed result */
  result?: T;
  /** Error message if failed */
  error?: string;
  /** Worker execution time in ms */
  executionTimeMs: number;
  /** Number of retries attempted */
  retries: number;
  /** Validation errors if schema validation failed */
  validationErrors?: string[];
}

/**
 * Consolidated result from all workers
 */
export interface MapOperationResult<T = unknown> {
  /** All worker results */
  results: WorkerResult<T>[];
  /** Successfully processed items */
  successful: WorkerResult<T>[];
  /** Failed items */
  failed: WorkerResult<T>[];
  /** Validation errors */
  validationErrors: WorkerResult<T>[];
  /** Total execution time in ms */
  totalExecutionTimeMs: number;
  /** Number of inputs processed */
  totalInputs: number;
  /** Number of successful processing */
  successCount: number;
  /** Number of failed processing */
  failureCount: number;
  /** Whether overall operation succeeded */
  success: boolean;
}

/**
 * LLM Worker interface - simulates isolated LLM session
 */
export interface LLMWorker {
  /** Execute the worker with given input and prompt */
  execute(input: MapInput, prompt: string): Promise<unknown>;
}

/**
 * Mock LLM Worker for simulation (in production, this would be a real LLM call)
 */
export class MockLLMWorker implements LLMWorker {
  private workerId: string;

  constructor(workerId?: string) {
    this.workerId = workerId || randomUUID().slice(0, 8);
  }

  async execute(input: MapInput, prompt: string): Promise<unknown> {
    // Simulate LLM processing time (50-200ms)
    const processingTime = 50 + Math.random() * 150;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error(`Worker ${this.workerId}: Simulated failure for input ${input.id}`);
    }

    // Return mock result based on input
    return {
      workerId: this.workerId,
      inputId: input.id,
      inputValue: input.value,
      processedPrompt: prompt.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Validation result for schema checking
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * JSON Schema validator
 */
export class SchemaValidator {
  /**
   * Validate a value against a JSON Schema
   */
  static validate(value: unknown, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];

    this.validateValue(value, schema, 'root', errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private static validateValue(
    value: unknown,
    schema: JSONSchema,
    path: string,
    errors: string[]
  ): void {
    // Handle null
    if (value === null) {
      if (schema.type !== 'null' && schema.type !== undefined) {
        errors.push(`${path}: expected ${schema.type}, got null`);
      }
      return;
    }

    // Type checking
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (schema.type && schema.type !== actualType) {
      errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
      return;
    }

    // Object validation
    if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      this.validateObject(value as Record<string, unknown>, schema, path, errors);
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
      this.validateArray(value, schema, path, errors);
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${path}: string length ${value.length} < minimum ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${path}: string length ${value.length} > maximum ${schema.maxLength}`);
      }
      if (schema.pattern !== undefined) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push(`${path}: string does not match pattern ${schema.pattern}`);
        }
      }
    }

    // Number validation
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${path}: number ${value} < minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${path}: number ${value} > maximum ${schema.maximum}`);
      }
    }

    // Enum validation
    if (schema.enum !== undefined) {
      if (!schema.enum.includes(value)) {
        errors.push(`${path}: value not in enum [${schema.enum.join(', ')}]`);
      }
    }
  }

  private static validateObject(
    value: Record<string, unknown>,
    schema: JSONSchema,
    path: string,
    errors: string[]
  ): void {
    // Check required properties
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in value)) {
          errors.push(`${path}.${required}: required property missing`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          this.validateValue(value[key], propSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  private static validateArray(
    value: unknown[],
    schema: JSONSchema,
    path: string,
    errors: string[]
  ): void {
    if (schema.items) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }
}

/**
 * Worker pool for parallel LLM processing
 */
export class AgenticMapOperator {
  private config: AgenticMapConfig;
  private workerFactory: () => LLMWorker;

  /**
   * Create a new AgenticMapOperator
   * @param config Configuration options
   * @param workerFactory Factory function to create LLM workers (for testing or real LLM integration)
   */
  constructor(
    config?: Partial<AgenticMapConfig>,
    workerFactory?: () => LLMWorker
  ) {
    this.config = { ...DEFAULT_AGENTIC_MAP_CONFIG, ...config };
    this.workerFactory = workerFactory || (() => new MockLLMWorker());
  }

  /**
   * Map an array of inputs through parallel LLM workers
   * @param inputs Array of inputs to process
   * @param prompt Prompt to send to each worker
   * @returns Consolidated results from all workers
   */
  async map<T = unknown>(
    inputs: MapInput[] | string[],
    prompt: string
  ): Promise<MapOperationResult<T>> {
    const startTime = Date.now();
    const totalInputs = inputs.length;

    // Normalize inputs to MapInput format
    const normalizedInputs: MapInput[] = inputs.map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `input-${index}-${randomUUID().slice(0, 8)}`,
          value: item
        };
      }
      return item as MapInput;
    });

    // Create semaphore for concurrency control
    const semaphore = this.createSemaphore(this.config.maxConcurrency);
    const results: WorkerResult<T>[] = [];

    // Process all inputs with controlled concurrency
    const workerPromises = normalizedInputs.map(async (input) => {
      return semaphore(async () => {
        return this.executeWorker<T>(input, prompt);
      });
    });

    // Wait for all workers to complete
    const workerResults = await Promise.all(workerPromises);
    results.push(...workerResults);

    const totalExecutionTimeMs = Date.now() - startTime;

    // Categorize results
    const successful = results.filter(r => r.success && !r.validationErrors?.length);
    const failed = results.filter(r => !r.success);
    const validationErrors = results.filter(r => r.success && r.validationErrors && r.validationErrors.length > 0);

    return {
      results,
      successful: successful as WorkerResult<T>[],
      failed: failed as WorkerResult<T>[],
      validationErrors: validationErrors as WorkerResult<T>[],
      totalExecutionTimeMs,
      totalInputs,
      successCount: successful.length,
      failureCount: failed.length + validationErrors.length,
      success: failed.length === 0 && validationErrors.length === 0
    };
  }

  /**
   * Execute a single worker with retry logic
   */
  private async executeWorker<T>(
    input: MapInput,
    prompt: string,
    retries: number = 0
  ): Promise<WorkerResult<T>> {
    const worker = this.workerFactory();
    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(
        worker.execute(input, prompt),
        this.config.workerTimeoutMs
      );

      const executionTimeMs = Date.now() - startTime;

      // Validate against schema if enabled
      let validationErrors: string[] | undefined;

      if (this.config.validateResponses && this.config.responseSchema) {
        const validation = SchemaValidator.validate(result, this.config.responseSchema);
        if (!validation.valid) {
          validationErrors = validation.errors;
        }
      }

      return {
        inputId: input.id,
        success: !validationErrors || validationErrors.length === 0,
        result: result as T,
        executionTimeMs,
        retries,
        validationErrors
      };
    } catch (error: unknown) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Retry if allowed
      if (retries < this.config.maxRetries) {
        await this.delay(this.config.retryDelayMs);
        return this.executeWorker<T>(input, prompt, retries + 1);
      }

      return {
        inputId: input.id,
        success: false,
        error: errorMessage,
        executionTimeMs,
        retries
      };
    }
  }

  /**
   * Create a semaphore for concurrency control
   */
  private createSemaphore(maxConcurrent: number): <T>(fn: () => Promise<T>) => Promise<T> {
    let running = 0;
    const queue: Array<() => void> = [];

    return async <T>(fn: () => Promise<T>): Promise<T> => {
      return new Promise(async (resolve) => {
        const execute = async () => {
          running++;
          try {
            const result = await fn();
            resolve(result);
          } finally {
            running--;
            if (queue.length > 0) {
              const next = queue.shift();
              if (next) next();
            }
          }
        };

        if (running < maxConcurrent) {
          await execute();
        } else {
          queue.push(execute);
        }
      });
    };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgenticMapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getMapConfig(): AgenticMapConfig {
    return { ...this.config };
  }
}

/**
 * Convenience function for quick map operations
 */
export async function agenticMap<T = unknown>(
  inputs: MapInput[] | string[],
  prompt: string,
  config?: Partial<AgenticMapConfig>
): Promise<MapOperationResult<T>> {
  const operator = new AgenticMapOperator(config);
  return operator.map<T>(inputs, prompt);
}
