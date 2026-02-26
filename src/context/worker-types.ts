/**
 * Types for Worker Thread context compression
 */

export interface WorkerData {
  payload: string | unknown;
  options?: WorkerOptions;
}

export interface WorkerOptions {
  sanitizeStrings?: boolean;
  removeDuplicates?: boolean;
  aggressive?: boolean;
}

export interface CompressionMetadata {
  originalTokens: number;
  compressedTokens: number;
  reductionPercent: number;
  processingTime: number;
  messageCount: number;
}

export interface WorkerResult {
  success: boolean;
  compressed?: string;
  error?: string;
  metadata: CompressionMetadata;
}

export interface CompressContextOptions {
  sanitizeStrings?: boolean;
  removeDuplicates?: boolean;
  aggressive?: boolean;
}

export interface CompressContextResult {
  compressed: string;
  metadata: CompressionMetadata;
}
