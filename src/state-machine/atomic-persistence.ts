// Atomic Persistence Module - Story 1.3:确保状态永不部分保存或损坏
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';

// Deterministic error codes for persistence operations
export enum PersistenceErrorCode {
  VALIDATION_FAILED = 'PERSISTENCE_VALIDATION_FAILED',
  WRITE_FAILED = 'PERSISTENCE_WRITE_FAILED',
  RENAME_FAILED = 'PERSISTENCE_RENAME_FAILED',
  ATOMICITY_VIOLATED = 'PERSISTENCE_ATOMICITY_VIOLATED',
  CLEANUP_FAILED = 'PERSISTENCE_CLEANUP_FAILED'
}

export interface AtomicWriteOptions {
  validateJson?: boolean;
  createBackup?: boolean;
  maxRetries?: number;
}

export interface AtomicWriteResult {
  success: boolean;
  errorCode?: PersistenceErrorCode;
  errorMessage?: string;
  tempFileCleaned?: boolean;
  backupFile?: string;
}

/**
 * Validate JSON structure before writing
 */
export function validateJsonStructure(data: unknown): { valid: boolean; error?: string } {
  try {
    const jsonString = JSON.stringify(data);
    const parsed = JSON.parse(jsonString);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON structure'
    };
  }
}

/**
 * Atomic file write with temp file + rename pattern
 * Ensures original file is never corrupted by:
 * 1. Writing to temp file first
 * 2. Validating (optional)
 * 3. Atomic rename to target
 * 4. Cleanup temp file on success
 */
export async function atomicWrite(
  targetPath: string,
  data: unknown,
  options: AtomicWriteOptions = {}
): Promise<AtomicWriteResult> {
  const {
    validateJson = true,
    createBackup = false,
    maxRetries = 1
  } = options;

  const targetDir = dirname(targetPath);
  const tempSuffix = randomBytes(8).toString('hex');
  const tempFile = `${targetPath}.tmp.${tempSuffix}`;
  const backupFile = `${targetPath}.backup`;

  // Ensure directory exists
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (error) {
    return {
      success: false,
      errorCode: PersistenceErrorCode.WRITE_FAILED,
      errorMessage: `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }

  // Validate JSON if requested
  if (validateJson) {
    const validation = validateJsonStructure(data);
    if (!validation.valid) {
      return {
        success: false,
        errorCode: PersistenceErrorCode.VALIDATION_FAILED,
        errorMessage: validation.error
      };
    }
  }

  // Create backup if requested (before writing)
  let backupCreated = false;
  if (createBackup) {
    try {
      await fs.copyFile(targetPath, backupFile);
      backupCreated = true;
    } catch {
      // Backup failed - continue without backup
    }
  }

  // Write to temp file
  let tempFileCleaned = false;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const jsonData = JSON.stringify(data, null, 2);
      await fs.writeFile(tempFile, jsonData, 'utf-8');

      // Atomic rename (this is the critical operation)
      try {
        await fs.rename(tempFile, targetPath);
        tempFileCleaned = true;

        // Success - cleanup temp file if rename succeeded but something else failed
        try {
          await fs.unlink(tempFile);
        } catch {
          // Temp file already moved, ignore
        }

        return {
          success: true,
          tempFileCleaned: true,
          backupFile: backupCreated ? backupFile : undefined
        };
      } catch (renameError) {
        // Windows fallback: copy file and delete temp
        const err = renameError as { code?: string };
        if (err.code === 'EXDEV' || err.code === 'ENOENT') {
          try {
            await fs.copyFile(tempFile, targetPath);
            await fs.unlink(tempFile);
            tempFileCleaned = true;
            return {
              success: true,
              tempFileCleaned: true,
              backupFile: backupCreated ? backupFile : undefined
            };
          } catch (copyErr) {
            // Copy also failed, continue to cleanup
          }
        }
        // Rename failed - cleanup temp file
        try {
          await fs.unlink(tempFile);
          tempFileCleaned = true;
        } catch {
          // Cleanup failed - this could leave orphan temp files
          return {
            success: false,
            errorCode: PersistenceErrorCode.ATOMICITY_VIOLATED,
            errorMessage: `Rename failed and cleanup failed: ${renameError instanceof Error ? renameError.message : 'Unknown error'}`,
            tempFileCleaned: false
          };
        }

        // Restore backup if rename failed
        if (backupCreated) {
          try {
            await fs.copyFile(backupFile, targetPath);
          } catch {
            // Backup restore failed - serious issue
            return {
              success: false,
              errorCode: PersistenceErrorCode.ATOMICITY_VIOLATED,
              errorMessage: 'Rename failed and backup restore failed - data may be corrupted',
              tempFileCleaned: true
            };
          }
        }

        return {
          success: false,
          errorCode: PersistenceErrorCode.RENAME_FAILED,
          errorMessage: renameError instanceof Error ? renameError.message : 'Unknown error',
          tempFileCleaned: true
        };
      }
    } catch (writeError) {
      // Write failed - try again if retries left
      if (attempt >= maxRetries) {
        // Restore backup if write failed after creating one
        if (backupCreated) {
          try {
            await fs.copyFile(backupFile, targetPath);
          } catch {
            // Backup restore failed
          }
        }

        return {
          success: false,
          errorCode: PersistenceErrorCode.WRITE_FAILED,
          errorMessage: writeError instanceof Error ? writeError.message : 'Unknown error',
          tempFileCleaned
        };
      }
    }
  }

  return {
    success: false,
    errorCode: PersistenceErrorCode.WRITE_FAILED,
    errorMessage: 'Max retries exceeded'
  };
}

/**
 * Read and parse JSON file with validation
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read JSON file'
    };
  }
}

/**
 * Cleanup orphaned temp files from previous failed writes
 */
export async function cleanupOrphanedTempFiles(targetPath: string): Promise<number> {
  const targetDir = dirname(targetPath);
  const targetName = targetPath.split(/[/\\]/).pop() || '';

  try {
    const entries = await fs.readdir(targetDir);
    let cleaned = 0;

    for (const entry of entries) {
      if (entry.startsWith(targetName) && entry.includes('.tmp.')) {
        try {
          await fs.unlink(join(targetDir, entry));
          cleaned++;
        } catch {
          // Ignore cleanup failures
        }
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
}

export default {
  atomicWrite,
  validateJsonStructure,
  readJsonFile,
  cleanupOrphanedTempFiles,
  PersistenceErrorCode
};
