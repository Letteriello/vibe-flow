/**
 * LLM Map-Reduce Operators Types
 *
 * Deterministic map-reduce primitives for parallel LLM processing
 * with automatic schema validation and retry logic.
 */

import { z } from 'zod';

/**
 * Input item for LLM processing
 */
export interface LLMMapInput<T = unknown> {
  id: string;
  data: T;
  metadata?: Record<string, unknown>;
}

/**
 * Output item from LLM processing
 */
export interface LLMMapOutput<T = unknown> {
  id: string;
  data: T;
  error?: string;
  attempts?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of map operation with aggregated results
 */
export interface LLMMapResult<T> {
  outputs: LLMMapOutput<T>[];
  successful: number;
  failed: number;
  total: number;
}

/**
 * Options for LLM map operator
 */
export interface LLMMapOptions {
  /** Maximum concurrent LLM calls (default: 5) */
  concurrency?: number;
  /** Maximum number of retries for schema validation errors */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Base prompt template - {item} will be replaced with input data */
  promptTemplate?: string;
}

/**
 * LLM Client interface - implement this to use with any LLM provider
 */
export interface LLMClient {
  /**
   * Execute a single LLM call
   * @param prompt - The prompt to send to the LLM
   * @param schema - Expected output schema for validation
   * @returns Raw response from LLM (string)
   */
  call(prompt: string, schema: z.ZodSchema): Promise<string>;
}

/**
 * Schema validation error with details
 */
export interface SchemaValidationError {
  message: string;
  errors?: Array<{
    path: string;
    message: string;
  }>;
  attempt: number;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (processed: number, total: number) => void;
