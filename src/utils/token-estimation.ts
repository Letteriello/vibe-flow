/**
 * Token Estimation Module
 * Provides character-based token estimation for OpenAI models
 */

export interface TokenEstimateOptions {
  encoding?: TokenEncoding;
  model?: TokenModel;
  charactersPerToken?: number;
}

export type TokenEncoding = 'cl100k' | 'p50k' | 'r50k' | 'character';
export type TokenModel = 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-35-turbo' | 'custom';

export interface TokenEstimateResult {
  tokens: number;
  characters: number;
  encoding: TokenEncoding;
}

/**
 * Context message structure (OpenAI-compatible)
 */
export interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_invocation' | 'tool_result';
  content: string;
  timestamp?: string;
  name?: string;
  tool_call_id?: string;
  toolCalls?: ToolCall[];
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Estimates token count for given text using character-based method
 * Default: Math.ceil(text.length / 4) - approximates cl100k_base encoding
 *
 * @param text - Input text to estimate tokens for
 * @param options - Optional configuration for estimation method
 * @returns Estimated token count
 */
export function estimateTokens(text: string, options?: TokenEstimateOptions): number {
  if (!text || text.length === 0) {
    return 0;
  }

  const charsPerToken = options?.charactersPerToken ?? 4;

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimates tokens for multiple texts (e.g., messages array)
 *
 * @param texts - Array of text strings
 * @param options - Optional configuration for estimation
 * @returns Total estimated token count
 */
export function estimateTokensBatch(texts: string[], options?: TokenEstimateOptions): number {
  return texts.reduce((total, text) => total + estimateTokens(text, options), 0);
}

/**
 * Calculates total tokens for an array of messages with content property
 *
 * @param messages - Array of messages with optional content property
 * @returns Total estimated token count
 */
export function calculateTotalTokens(messages: { content?: string }[]): number {
  if (!messages || messages.length === 0) {
    return 0;
  }

  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content || '');
  }, 0);
}

/**
 * Estimates token count for an array of context messages
 * Includes role prefix overhead for OpenAI message format
 *
 * @param messages - Array of context messages
 * @param options - Optional configuration for estimation
 * @returns Total estimated token count
 */
export function estimateMessagesTokens(messages: ContextMessage[], options?: TokenEstimateOptions): number {
  if (!messages || messages.length === 0) {
    return 0;
  }

  // Overhead per message: role prefix (~4 tokens) + newline (~1 token)
  const overheadPerMessage = 5;

  return messages.reduce((total, msg) => {
    const contentTokens = estimateTokens(msg.content, options);
    return total + contentTokens + overheadPerMessage;
  }, 0);
}

/**
 * Estimates token count for an object (serialized as JSON)
 *
 * @param obj - Object to estimate tokens for
 * @param options - Optional configuration for estimation
 * @returns Estimated token count
 */
export function estimateObjectTokens(obj: Record<string, unknown>, options?: TokenEstimateOptions): number {
  if (!obj) {
    return 0;
  }

  const jsonString = JSON.stringify(obj);
  return estimateTokens(jsonString, options);
}

/**
 * Token Estimator interface for factory-created instances
 */
export interface TokenEstimator {
  estimate: (text: string) => number;
  estimateMessages: (messages: ContextMessage[]) => number;
  estimateObject: (obj: Record<string, unknown>) => number;
  estimateBatch: (texts: string[]) => number;
  options: TokenEstimateOptions;
}

/**
 * Factory function to create a TokenEstimator with default options
 *
 * @param defaultOptions - Default options for estimation
 * @returns TokenEstimator instance with bound options
 */
export function createTokenEstimator(defaultOptions?: TokenEstimateOptions): TokenEstimator {
  const options: TokenEstimateOptions = defaultOptions ?? {};

  return {
    estimate: (text: string): number => estimateTokens(text, options),
    estimateMessages: (messages: ContextMessage[]): number => estimateMessagesTokens(messages, options),
    estimateObject: (obj: Record<string, unknown>): number => estimateObjectTokens(obj, options),
    estimateBatch: (texts: string[]): number => estimateTokensBatch(texts, options),
    options,
  };
}

/**
 * Get encoding-specific characters per token ratio
 *
 * @param encoding - Token encoding type
 * @returns Characters per token ratio
 */
export function getEncodingRatio(encoding: TokenEncoding): number {
  const ratios: Record<TokenEncoding, number> = {
    'cl100k': 4.0,      // OpenAI's cl100k_base
    'p50k': 4.0,        // GPT-3.5 encoding
    'r50k': 4.0,        // GPT-2 encoding
    'character': 1.0,   // 1:1 character ratio
  };

  return ratios[encoding] ?? 4.0;
}

// Backward compatibility aliases for existing implementations
export const compactionEstimateTokens = estimateTokens;
export const estimateTokenCount = estimateTokens;
export const countTokens = estimateTokens;
export const estimateFileTokens = estimateTokens;

// ============================================================
// CACHE IMPLEMENTATION (DEV-TASK-004)
// ============================================================

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

/**
 * Simple hash function for cache keys (non-cryptographic)
 * Uses djb2-like algorithm for fast hashing
 */
function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash & 0xFFFFFFFF; // Keep within 32-bit integer
  }
  return hash.toString(36);
}

/**
 * LRU Cache implementation with fixed size limit
 */
class LRUCache {
  private cache: Map<string, number> = new Map();
  private accessOrder: string[] = [];
  private hits = 0;
  private misses = 0;
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): number | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, value: number): void {
    // If key exists, update and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      return;
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    } else {
      this.cache.clear();
      this.accessOrder = [];
      this.hits = 0;
      this.misses = 0;
    }
  }
}

// Global cache instance
const tokenCache = new LRUCache(1000);

/**
 * Estimates token count with caching for improved performance
 * Uses LRU cache with 1000 entry limit and text hash as key
 *
 * @param text - Input text to estimate tokens for
 * @param options - Optional configuration for estimation method
 * @returns Estimated token count (cached if available)
 */
export function estimateTokensCached(text: string, options?: TokenEstimateOptions): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Generate cache key from text hash
  const cacheKey = hashText(text);

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Compute and cache result
  const result = estimateTokens(text, options);
  tokenCache.set(cacheKey, result);

  return result;
}

/**
 * Returns cache statistics (hits, misses, hit rate, size)
 *
 * @returns CacheStats object with cache performance metrics
 */
export function getCacheStats(): CacheStats {
  return tokenCache.getStats();
}

/**
 * Invalidates the token estimation cache
 *
 * @param key - Optional specific key to invalidate. If omitted, clears entire cache.
 */
export function invalidateCache(key?: string): void {
  tokenCache.clear(key);
}

// Type exports for test compatibility
// Note: ContextMessage, ToolCall, TokenEstimateOptions, TokenEstimateResult, TokenEncoding, TokenModel already exported above
