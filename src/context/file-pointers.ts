// File Pointers - Intelligent file injection system
// Detects large files and converts them to lightweight Exploration Summaries

import { promises as fs } from 'fs';
import * as path from 'path';
import { join, isAbsolute, extname } from 'path';
import { createHash } from 'crypto';
import { analyzeFileStructure, analyzeTextPreview, FileType } from './file-analyzer.js';

/**
 * Soft token limit before converting to pointer (20k tokens ≈ 80k chars)
 */
export const SOFT_TOKEN_LIMIT = 20000;

/**
 * Pointer to file content stored on disk
 */
export interface FilePointer {
  type: 'file_pointer';
  fileId: string;
  filePath: string;
  originalSize: number;
  tokenCount: number;
  storedAt: string;
}

/**
 * Exploration Summary - lightweight representation for API payload
 */
export interface ExplorationSummary {
  type: 'exploration_summary';
  file_id: string;
  path: string;
  summary: string;
  file_type: FileType;
  original_size: number;
  token_count: number;
  stored_at: string;
}

/**
 * Result of file injection operation
 */
export interface FileInjectionResult {
  success: boolean;
  wasConverted: boolean;
  payload: string | ExplorationSummary;
  tokenCount: number;
  originalSize: number;
  reducedSize: number;
  reductionPercentage: number;
}

/**
 * Configuration for file pointer system
 */
export interface FilePointerConfig {
  softTokenLimit: number;
  storageDir: string;
  projectPath: string;
  maxPreviewChars: number;
}

const DEFAULT_CONFIG: FilePointerConfig = {
  softTokenLimit: SOFT_TOKEN_LIMIT,
  storageDir: '.vibe-flow/file-archives',
  projectPath: process.cwd(),
  maxPreviewChars: 500
};

/**
 * Generate unique file ID
 */
function generateFileId(): string {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Estimate token count for content
 */
export function estimateFileTokens(content: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(content.length / 4);
}

/**
 * Detect if content exceeds soft token limit
 */
export function detectLargeFile(content: string): boolean {
  const tokenCount = estimateFileTokens(content);
  return tokenCount > SOFT_TOKEN_LIMIT;
}

/**
 * Store file content to disk and return pointer
 */
export async function storeFileContent(
  content: string,
  filePath: string,
  config: Partial<FilePointerConfig> = {}
): Promise<FilePointer> {
  const cfg: FilePointerConfig = { ...DEFAULT_CONFIG, ...config };

  // Resolve storage directory
  let storageDir: string;
  if (isAbsolute(cfg.storageDir)) {
    storageDir = cfg.storageDir;
  } else if (cfg.storageDir.startsWith('.vibe-flow') || cfg.storageDir.startsWith('.')) {
    storageDir = join(cfg.projectPath, cfg.storageDir);
  } else {
    storageDir = join(cfg.projectPath, '.vibe-flow', cfg.storageDir);
  }

  const fileId = generateFileId();
  const fileName = `file_${fileId}.txt`;
  const storedPath = join(storageDir, fileName);
  const tokenCount = estimateFileTokens(content);

  // Ensure directory exists
  await fs.mkdir(storageDir, { recursive: true });

  // Store raw content
  await fs.writeFile(storedPath, content, 'utf-8');

  return {
    type: 'file_pointer',
    fileId,
    filePath,
    originalSize: content.length,
    tokenCount,
    storedAt: new Date().toISOString()
  };
}

/**
 * Create Exploration Summary from stored file
 */
export async function createExplorationSummary(
  content: string,
  filePath: string,
  config: Partial<FilePointerConfig> = {}
): Promise<ExplorationSummary> {
  const cfg: FilePointerConfig = { ...DEFAULT_CONFIG, ...config };

  const tokenCount = estimateFileTokens(content);
  const fileId = generateFileId();

  // Analyze file type and generate appropriate summary
  let summary: string;
  let fileType: FileType;

  // Detect file type from extension
  const ext = extname(filePath).toLowerCase();
  const codeExtensions = ['.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt'];
  const textExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss', '.sql', '.sh', '.bash'];

  if (codeExtensions.includes(ext)) {
    fileType = 'code';
    summary = analyzeFileStructure(content, filePath);
  } else if (textExtensions.includes(ext)) {
    fileType = 'text';
    summary = analyzeTextPreview(content, cfg.maxPreviewChars);
  } else {
    // Try to detect by content
    if (content.includes('function') || content.includes('class ') || content.includes('const ') || content.includes('import ')) {
      fileType = 'code';
      summary = analyzeFileStructure(content, filePath);
    } else {
      fileType = 'text';
      summary = analyzeTextPreview(content, cfg.maxPreviewChars);
    }
  }

  return {
    type: 'exploration_summary',
    file_id: fileId,
    path: filePath,
    summary,
    file_type: fileType,
    original_size: content.length,
    token_count: tokenCount,
    stored_at: new Date().toISOString()
  };
}

/**
 * Main function: inject file content with intelligent conversion
 *
 * If content exceeds SOFT_TOKEN_LIMIT:
 * - Store content to disk
 * - Return Exploration Summary (lightweight JSON)
 *
 * Otherwise:
 * - Return original content
 */
export async function injectFilePointer(
  content: string,
  filePath: string,
  config: Partial<FilePointerConfig> = {}
): Promise<FileInjectionResult> {
  const cfg: FilePointerConfig = { ...DEFAULT_CONFIG, ...config };
  const tokenCount = estimateFileTokens(content);
  const originalSize = content.length;

  // Check if conversion is needed
  if (tokenCount <= cfg.softTokenLimit) {
    return {
      success: true,
      wasConverted: false,
      payload: content,
      tokenCount,
      originalSize,
      reducedSize: originalSize,
      reductionPercentage: 0
    };
  }

  // Store file and create exploration summary
  await storeFileContent(content, filePath, config);
  const summary = await createExplorationSummary(content, filePath, config);

  // Calculate reduction (summary is much smaller than original)
  const summarySize = JSON.stringify(summary).length;
  const reductionPercentage = Math.round(((originalSize - summarySize) / originalSize) * 100);

  return {
    success: true,
    wasConverted: true,
    payload: summary,
    tokenCount,
    originalSize,
    reducedSize: summarySize,
    reductionPercentage
  };
}

/**
 * Load original content from a file pointer
 */
export async function loadFromFilePointer(
  storedPath: string
): Promise<string> {
  try {
    return await fs.readFile(storedPath, 'utf-8');
  } catch (error) {
    console.error(`Failed to load from file pointer: ${storedPath}`, error);
    return '';
  }
}

export default {
  SOFT_TOKEN_LIMIT,
  detectLargeFile,
  injectFilePointer,
  createExplorationSummary,
  storeFileContent,
  estimateFileTokens,
  loadFromFilePointer
};
