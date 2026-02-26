// Recovery Logic - Restore environment to exact state before failed task
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { wal, Checkpoint, StateSnapshot, WALEntry, WALAction } from './wal.js';
import { RateLimitHandler, RateLimitError, rateLimitHandler } from './rate-limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const VIBE_FLOW_DIR = '.vibe-flow';
const WAL_DIR = path.join(VIBE_FLOW_DIR, 'wal');
const SNAPSHOTS_DIR = path.join(WAL_DIR, 'snapshots');
const CHECKPOINTS_FILE = path.join(WAL_DIR, 'checkpoints.json');
const RECOVERY_LOG_FILE = path.join(WAL_DIR, 'recovery.log');
const WAL_LOG_FILE = path.join(WAL_DIR, 'wal.log');

// Interfaces para parsing seguro do WAL
export interface WALFrame {
  id: string;
  checkpointId: string;
  timestamp: number;
  action: string;
  target: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  status: string;
}

export interface CorruptedFrame {
  lineNumber: number;
  rawContent: string;
  parseError: string;
}

export interface WALParseResult {
  success: boolean;
  frames: WALFrame[];
  corruptedFrames: CorruptedFrame[];
  totalLines: number;
  validFrames: number;
}

// Recovery Result
export interface RecoveryResult {
  success: boolean;
  checkpointId: string | null;
  restoredFiles: string[];
  rolledBackFiles: string[];
  errors: string[];
  timestamp: number;
  durationMs: number;
}

// Recovery Options
export interface RecoveryOptions {
  dryRun?: boolean;
  force?: boolean;
  targetCheckpointId?: string;
  restoreToStart?: boolean; // If true, restore to exact millisecond of task start
}

class RecoveryManager {
  private walInstance: typeof wal;

  constructor(walInstance: typeof wal) {
    this.walInstance = walInstance;
  }

  // Log recovery action
  private logRecovery(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(RECOVERY_LOG_FILE, logLine);
    console.log(`[Recovery] ${message}`);
  }

  // Check if recovery is needed
  async needsRecovery(): Promise<boolean> {
    return this.walInstance.hasIncompleteCheckpoint();
  }

  // Get available checkpoints for recovery
  async getAvailableCheckpoints(): Promise<Checkpoint[]> {
    return this.walInstance.getCheckpoints();
  }

  // Perform recovery - restore environment to exact start time of task
  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const startTime = Date.now();
    const result: RecoveryResult = {
      success: false,
      checkpointId: null,
      restoredFiles: [],
      rolledBackFiles: [],
      errors: [],
      timestamp: startTime,
      durationMs: 0
    };

    try {
      // Find checkpoint to recover
      let checkpoint: Checkpoint | null = null;

      if (options.targetCheckpointId) {
        const checkpoints = await this.walInstance.getCheckpoints();
        checkpoint = checkpoints.find(c => c.id === options.targetCheckpointId) || null;
      } else {
        checkpoint = await this.walInstance.getLastCheckpoint();
      }

      if (!checkpoint) {
        result.errors.push('No checkpoint found for recovery');
        result.durationMs = Date.now() - startTime;
        return result;
      }

      result.checkpointId = checkpoint.id;
      this.logRecovery(`Starting recovery for checkpoint ${checkpoint.id}`);

      // Get snapshot at task start
      const snapshot = await this.walInstance.getSnapshot(checkpoint.snapshotId);
      if (!snapshot) {
        result.errors.push(`Snapshot ${checkpoint.snapshotId} not found`);
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Get WAL entries for this checkpoint
      const entries = await this.walInstance.getEntriesForCheckpoint(checkpoint.id);

      if (options.dryRun) {
        this.logRecovery('[DRY RUN] Would restore the following:');
        for (const entry of entries) {
          if (entry.previousState) {
            this.logRecovery(`  - Restore: ${entry.target} (${entry.action})`);
          }
        }
        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Restore files to their pre-action state
      // Process in reverse order to undo changes correctly
      const sortedEntries = [...entries].sort((a, b) => b.timestamp - a.timestamp);

      for (const entry of sortedEntries) {
        try {
          if (entry.action === WALAction.FILE_CREATE) {
            // Undo file creation - delete the file
            if (fs.existsSync(entry.target)) {
              fs.unlinkSync(entry.target);
              result.rolledBackFiles.push(entry.target);
              this.logRecovery(`Rolled back: Deleted ${entry.target}`);
            }
          } else if (entry.action === WALAction.FILE_MODIFY && entry.previousState) {
            // Restore file to previous content
            fs.writeFileSync(entry.target, entry.previousState.content, 'utf-8');
            result.restoredFiles.push(entry.target);
            this.logRecovery(`Restored: ${entry.target} to previous state`);
          } else if (entry.action === WALAction.FILE_DELETE && entry.previousState) {
            // Restore deleted file
            const dir = path.dirname(entry.target);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(entry.target, entry.previousState.content, 'utf-8');
            result.restoredFiles.push(entry.target);
            this.logRecovery(`Restored: ${entry.target} (was deleted)`);
          } else if (entry.action === WALAction.DIR_CREATE) {
            // Undo directory creation - remove directory if empty
            if (fs.existsSync(entry.target)) {
              try {
                fs.rmdirSync(entry.target);
                result.rolledBackFiles.push(entry.target);
                this.logRecovery(`Rolled back: Removed directory ${entry.target}`);
              } catch (e) {
                // Directory not empty, cannot remove
                result.errors.push(`Cannot remove non-empty directory: ${entry.target}`);
              }
            }
          }
        } catch (error) {
          const errorMsg = `Failed to restore ${entry.target}: ${error}`;
          result.errors.push(errorMsg);
          this.logRecovery(`ERROR: ${errorMsg}`);
        }
      }

      // Mark checkpoint as rolled back
      await this.walInstance.finalizeCheckpoint('rolled_back');

      result.success = result.errors.length === 0;
      this.logRecovery(`Recovery completed. Restored ${result.restoredFiles.length} files, rolled back ${result.rolledBackFiles.length} files`);

    } catch (error) {
      const errorMsg = `Recovery failed: ${error}`;
      result.errors.push(errorMsg);
      this.logRecovery(`ERROR: ${errorMsg}`);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Restore to exact start time of task (most precise recovery)
  async restoreToExactStart(): Promise<RecoveryResult> {
    const lastCheckpoint = await this.walInstance.getLastCheckpoint();

    if (!lastCheckpoint) {
      return {
        success: false,
        checkpointId: null,
        restoredFiles: [],
        rolledBackFiles: [],
        errors: ['No checkpoint found'],
        timestamp: Date.now(),
        durationMs: 0
      };
    }

    // Get the snapshot from task start
    const snapshot = await this.walInstance.getSnapshot(lastCheckpoint.snapshotId);

    if (!snapshot) {
      return {
        success: false,
        checkpointId: lastCheckpoint.id,
        restoredFiles: [],
        rolledBackFiles: [],
        errors: ['Snapshot not found'],
        timestamp: Date.now(),
        durationMs: 0
      };
    }

    this.logRecovery(`Restoring to exact start time: ${new Date(snapshot.timestamp).toISOString()}`);

    // Restore all files from snapshot
    const result: RecoveryResult = {
      success: true,
      checkpointId: lastCheckpoint.id,
      restoredFiles: [],
      rolledBackFiles: [],
      errors: [],
      timestamp: Date.now(),
      durationMs: 0
    };

    const startTime = Date.now();

    // Restore each file from snapshot
    for (const [filePath, fileSnapshot] of snapshot.files.entries()) {
      try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, fileSnapshot.content, 'utf-8');
        result.restoredFiles.push(filePath);
      } catch (error) {
        const errorMsg = `Failed to restore ${filePath}: ${error}`;
        result.errors.push(errorMsg);
        result.success = false;
      }
    }

    result.durationMs = Date.now() - startTime;
    await this.walInstance.finalizeCheckpoint('rolled_back');

    this.logRecovery(`Exact restore completed in ${result.durationMs}ms`);

    return result;
  }

  // Verify recovery - check if files match snapshot
  async verifyRecovery(checkpointId: string): Promise<{ valid: boolean; differences: string[] }> {
    const checkpoint = (await this.walInstance.getCheckpoints()).find(c => c.id === checkpointId);

    if (!checkpoint) {
      return { valid: false, differences: ['Checkpoint not found'] };
    }

    const snapshot = await this.walInstance.getSnapshot(checkpoint.snapshotId);
    if (!snapshot) {
      return { valid: false, differences: ['Snapshot not found'] };
    }

    const differences: string[] = [];

    // Check each file in snapshot
    for (const [filePath, fileSnapshot] of snapshot.files.entries()) {
      try {
        if (!fs.existsSync(filePath)) {
          differences.push(`Missing: ${filePath}`);
          continue;
        }

        const currentContent = fs.readFileSync(filePath, 'utf-8');
        if (currentContent !== fileSnapshot.content) {
          differences.push(`Modified: ${filePath}`);
        }
      } catch (error) {
        differences.push(`Error checking ${filePath}: ${error}`);
      }
    }

    return {
      valid: differences.length === 0,
      differences
    };
  }

  // Auto-recovery - called on startup if incomplete checkpoint exists
  async autoRecover(): Promise<RecoveryResult> {
    const needsRecovery = await this.needsRecovery();

    if (!needsRecovery) {
      return {
        success: true,
        checkpointId: null,
        restoredFiles: [],
        rolledBackFiles: [],
        errors: [],
        timestamp: Date.now(),
        durationMs: 0
      };
    }

    this.logRecovery('Found incomplete checkpoint, starting auto-recovery...');
    return this.recover({ restoreToStart: true });
  }

  // Get recovery log
  getRecoveryLog(): string {
    try {
      if (fs.existsSync(RECOVERY_LOG_FILE)) {
        return fs.readFileSync(RECOVERY_LOG_FILE, 'utf-8');
      }
      return '';
    } catch (error) {
      return `Error reading recovery log: ${error}`;
    }
  }

  // Clear recovery log
  clearRecoveryLog(): void {
    try {
      if (fs.existsSync(RECOVERY_LOG_FILE)) {
        fs.unlinkSync(RECOVERY_LOG_FILE);
      }
    } catch (error) {
      console.error('[Recovery] Error clearing log:', error);
    }
  }
}

// ============================================================
// WAL Safe Parsing - Parsing seguro do Write-Ahead Log
// ============================================================

/**
 * Valida se um frame WAL tem a estrutura mínima necessária
 */
function isValidWALFrame(obj: unknown): obj is WALFrame {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const frame = obj as Record<string, unknown>;

  return (
    typeof frame.id === 'string' &&
    typeof frame.checkpointId === 'string' &&
    typeof frame.timestamp === 'number' &&
    typeof frame.action === 'string' &&
    typeof frame.target === 'string' &&
    (frame.status === 'pending' ||
      frame.status === 'applied' ||
      frame.status === 'rolled_back' ||
      frame.status === 'failed')
  );
}

/**
 * Gera checksum para validar integridade do frame
 */
function generateFrameChecksum(frame: WALFrame): string {
  const content = JSON.stringify({
    id: frame.id,
    checkpointId: frame.checkpointId,
    timestamp: frame.timestamp,
    action: frame.action,
    target: frame.target
  });
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * ParseSafeWAL - Faz parsing seguro do arquivo WAL, descartando frames corrompidos
 *
 * @param walFilePath - Caminho para o arquivo WAL (padrão: .vibe-flow/wal/wal.log)
 * @returns WALParseResult com frames válidos e informações sobre frames corrompidos
 */
export function parseSafeWAL(walFilePath: string = WAL_LOG_FILE): WALParseResult {
  const result: WALParseResult = {
    success: false,
    frames: [],
    corruptedFrames: [],
    totalLines: 0,
    validFrames: 0
  };

  try {
    if (!fs.existsSync(walFilePath)) {
      console.log('[Recovery] WAL file not found, starting fresh');
      result.success = true;
      return result;
    }

    const content = fs.readFileSync(walFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    result.totalLines = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const rawContent = lines[i];

      try {
        const parsed = JSON.parse(rawContent);

        // Valida estrutura do frame
        if (!isValidWALFrame(parsed)) {
          result.corruptedFrames.push({
            lineNumber,
            rawContent: rawContent.substring(0, 200), // Limita tamanho para log
            parseError: 'Invalid frame structure - missing required fields'
          });
          continue;
        }

        // Valida campos extras/incorretos
        const validActions = [
          WALAction.FILE_CREATE,
          WALAction.FILE_MODIFY,
          WALAction.FILE_DELETE,
          WALAction.DIR_CREATE,
          WALAction.DIR_DELETE,
          WALAction.METADATA_UPDATE
        ];

        if (!validActions.includes(parsed.action as WALAction)) {
          result.corruptedFrames.push({
            lineNumber,
            rawContent: rawContent.substring(0, 200),
            parseError: `Invalid action type: ${parsed.action}`
          });
          continue;
        }

        // Valida timestamp razoável (não muito antigo nem futuro)
        const now = Date.now();
        const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
        if (parsed.timestamp < oneYearAgo || parsed.timestamp > now + 60000) {
          result.corruptedFrames.push({
            lineNumber,
            rawContent: rawContent.substring(0, 200),
            parseError: `Invalid timestamp: ${parsed.timestamp}`
          });
          continue;
        }

        // Frame válido - adiciona à lista
        result.frames.push({
          id: parsed.id,
          checkpointId: parsed.checkpointId,
          timestamp: parsed.timestamp,
          action: parsed.action,
          target: parsed.target,
          previousState: parsed.previousState as Record<string, unknown> | null,
          newState: parsed.newState as Record<string, unknown> | null,
          status: parsed.status
        });
        result.validFrames++;

      } catch (parseError) {
        const errorMessage = parseError instanceof Error
          ? parseError.message
          : 'Unknown parse error';

        result.corruptedFrames.push({
          lineNumber,
          rawContent: rawContent.substring(0, 200),
          parseError: errorMessage
        });
      }
    }

    result.success = result.frames.length > 0 || result.corruptedFrames.length === 0;

    // Log do resultado
    if (result.corruptedFrames.length > 0) {
      console.log(
        `[Recovery] WAL parsing: ${result.validFrames} valid, ` +
        `${result.corruptedFrames.length} corrupted frames`
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Recovery] Error parsing WAL: ${errorMessage}`);
  }

  return result;
}

/**
 * GetLastValidState - Recupera o último estado válido do WAL
 *
 * @param walFilePath - Caminho para o arquivo WAL
 * @returns Último frame válido ou null
 */
export function getLastValidState(walFilePath: string = WAL_LOG_FILE): WALFrame | null {
  const parseResult = parseSafeWAL(walFilePath);

  if (parseResult.frames.length === 0) {
    return null;
  }

  // Retorna o frame mais recente (maior timestamp)
  return parseResult.frames.reduce((latest, frame) => {
    return frame.timestamp > latest.timestamp ? frame : latest;
  }, parseResult.frames[0]);
}

/**
 * GetFramesForCheckpoint - Retorna todos os frames de um checkpoint específico
 */
export function getFramesForCheckpoint(
  checkpointId: string,
  walFilePath: string = WAL_LOG_FILE
): WALFrame[] {
  const parseResult = parseSafeWAL(walFilePath);
  return parseResult.frames.filter(frame => frame.checkpointId === checkpointId);
}

/**
 * RecoverFromCorruptedWAL - Tenta recuperar de um WAL corrompido
 *
 * Remove linhas corrompidas e cria um WAL limpo
 */
export function recoverFromCorruptedWAL(
  walFilePath: string = WAL_LOG_FILE,
  backupPath?: string
): { success: boolean; linesRemoved: number; error?: string } {
  try {
    const parseResult = parseSafeWAL(walFilePath);

    if (parseResult.corruptedFrames.length === 0) {
      return { success: true, linesRemoved: 0 };
    }

    // Cria backup antes de modificar
    const backup = backupPath || walFilePath + '.backup';
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(walFilePath, backup);
      console.log(`[Recovery] Created backup at ${backup}`);
    }

    // Reconstrui o WAL apenas com frames válidos
    const content = fs.readFileSync(walFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const validLines: string[] = [];
    let currentLine = 0;

    for (const frame of parseResult.frames) {
      // Encontra a linha correspondente ao frame
      currentLine++;
      const originalLine = lines[currentLine - 1];

      if (originalLine) {
        validLines.push(originalLine);
      }
    }

    // Escreve WAL limpo
    fs.writeFileSync(walFilePath, validLines.join('\n') + '\n', 'utf-8');

    console.log(
      `[Recovery] Recovered WAL: removed ${parseResult.corruptedFrames.length} corrupted frames`
    );

    return {
      success: true,
      linesRemoved: parseResult.corruptedFrames.length
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, linesRemoved: 0, error: errorMessage };
  }
}

// ============================================================
// Rate Limit Retry Integration
// ============================================================

/**
 * RetryWithRateLimitBackoff - Executa operação com retry usando backoff exponencial
 *
 * @param operation - Função a ser executada
 * @param maxRetries - Número máximo de tentativas
 * @returns Resultado da operação
 */
export async function retryWithRateLimitBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5
): Promise<{
  success: boolean;
  result?: T;
  error?: RateLimitError;
  attempts: number;
  totalDelayMs: number;
}> {
  const handler = new RateLimitHandler({
    maxRetries,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterFactor: 0.3,
    backoffMultiplier: 2
  });

  return handler.executeWithRetry(operation);
}

// ============================================================
// Enhanced Recovery Manager
// ============================================================

class EnhancedRecoveryManager extends RecoveryManager {
  /**
   * Verifica integridade do WAL antes de recovery
   */
  async validateWALIntegrity(): Promise<{
    valid: boolean;
    issues: CorruptedFrame[];
    lastValidFrame: WALFrame | null;
  }> {
    const parseResult = parseSafeWAL();

    return {
      valid: parseResult.corruptedFrames.length === 0,
      issues: parseResult.corruptedFrames,
      lastValidFrame: parseResult.frames.length > 0
        ? parseResult.frames.reduce((latest, frame) =>
            frame.timestamp > latest.timestamp ? frame : latest
          )
        : null
    };
  }

  /**
   * Recovery com validação de integridade do WAL
   */
  async recoverWithWALValidation(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    // Primeiro, valida o WAL
    const walValidation = await this.validateWALIntegrity();

    if (!walValidation.valid && walValidation.issues.length > 0) {
      console.log(
        `[Recovery] WAL has ${walValidation.issues.length} corrupted frames. ` +
        'Attempting auto-repair...'
      );

      const repairResult = recoverFromCorruptedWAL();

      if (!repairResult.success) {
        console.error(`[Recovery] WAL repair failed: ${repairResult.error}`);
      }
    }

    // Executa recovery normal
    return this.recover(options);
  }
}

// Export singleton instance
export const recovery = new RecoveryManager(wal);

// Export class for testing
export { RecoveryManager };

// Helper function for quick recovery
export async function performRecovery(options?: RecoveryOptions): Promise<RecoveryResult> {
  await wal.initialize();
  return recovery.recover(options);
}

// Helper function for auto-recovery on startup
export async function performAutoRecovery(): Promise<RecoveryResult> {
  await wal.initialize();
  return recovery.autoRecover();
}
