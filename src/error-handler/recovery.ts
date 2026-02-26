// Recovery Logic - Restore environment to exact state before failed task
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { wal, Checkpoint, StateSnapshot, WALEntry, WALAction } from './wal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const VIBE_FLOW_DIR = '.vibe-flow';
const WAL_DIR = path.join(VIBE_FLOW_DIR, 'wal');
const SNAPSHOTS_DIR = path.join(WAL_DIR, 'snapshots');
const CHECKPOINTS_FILE = path.join(WAL_DIR, 'checkpoints.json');
const RECOVERY_LOG_FILE = path.join(WAL_DIR, 'recovery.log');

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
