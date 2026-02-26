// Write-Ahead Log (WAL) - Optimized with state snapshots for crash recovery
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const VIBE_FLOW_DIR = '.vibe-flow';
const WAL_DIR = path.join(VIBE_FLOW_DIR, 'wal');
const SNAPSHOTS_DIR = path.join(WAL_DIR, 'snapshots');
const CHECKPOINTS_FILE = path.join(WAL_DIR, 'checkpoints.json');
const WAL_FILE = path.join(WAL_DIR, 'wal.log');

// Interfaces
export interface FileSnapshot {
  path: string;
  content: string;
  hash: string;
  timestamp: number;
  size: number;
}

export interface DirectorySnapshot {
  path: string;
  files: Record<string, string>; // relative path -> hash
  timestamp: number;
}

export interface StateSnapshot {
  id: string;
  taskId: string;
  timestamp: number;
  files: Map<string, FileSnapshot>;
  directories: Map<string, DirectorySnapshot>;
  metadata: Record<string, unknown>;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  startTime: number;
  endTime: number | null;
  status: 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  snapshotId: string;
  operations: WALEntry[];
}

export interface WALEntry {
  id: string;
  checkpointId: string;
  timestamp: number;
  action: WALAction;
  target: string;
  previousState: FileSnapshot | null;
  newState: FileSnapshot | null;
  status: 'pending' | 'applied' | 'rolled_back' | 'failed';
}

export enum WALAction {
  FILE_CREATE = 'FILE_CREATE',
  FILE_MODIFY = 'FILE_MODIFY',
  FILE_DELETE = 'FILE_DELETE',
  DIR_CREATE = 'DIR_CREATE',
  DIR_DELETE = 'DIR_DELETE',
  METADATA_UPDATE = 'METADATA_UPDATE'
}

export interface WALConfig {
  maxSnapshots: number;
  maxCheckpoints: number;
  flushIntervalMs: number;
  enableCompression: boolean;
}

// Default configuration
const DEFAULT_CONFIG: WALConfig = {
  maxSnapshots: 10,
  maxCheckpoints: 5,
  flushIntervalMs: 1000,
  enableCompression: false
};

class WriteAheadLog {
  private config: WALConfig;
  private currentCheckpoint: Checkpoint | null = null;
  private currentSnapshot: StateSnapshot | null = null;
  private pendingEntries: WALEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<WALConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Initialize WAL directories and files
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directories if they don't exist
    await this.ensureDir(WAL_DIR);
    await this.ensureDir(SNAPSHOTS_DIR);

    // Initialize checkpoints file if it doesn't exist
    if (!fs.existsSync(CHECKPOINTS_FILE)) {
      fs.writeFileSync(CHECKPOINTS_FILE, JSON.stringify([], null, 2));
    }

    // Initialize WAL file if it doesn't exist
    if (!fs.existsSync(WAL_FILE)) {
      fs.writeFileSync(WAL_FILE, '');
    }

    this.initialized = true;
    console.log('[WAL] Initialized at', WAL_DIR);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Generate unique ID
  private generateId(): string {
    return crypto.randomUUID();
  }

  // Calculate file hash
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Capture snapshot of a file
  async captureFileSnapshot(filePath: string): Promise<FileSnapshot | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);

      return {
        path: filePath,
        content,
        hash: this.calculateHash(content),
        timestamp: Date.now(),
        size: stats.size
      };
    } catch (error) {
      console.error('[WAL] Error capturing file snapshot:', error);
      return null;
    }
  }

  // Capture snapshot of a directory
  async captureDirectorySnapshot(dirPath: string): Promise<DirectorySnapshot | null> {
    try {
      if (!fs.existsSync(dirPath)) {
        return null;
      }

      const files: Record<string, string> = {};
      const walkDir = (currentPath: string, relativePath: string = ''): void => {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory()) {
            walkDir(fullPath, relPath);
          } else if (entry.isFile()) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files[relPath] = this.calculateHash(content);
          }
        }
      };

      walkDir(dirPath);

      return {
        path: dirPath,
        files,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[WAL] Error capturing directory snapshot:', error);
      return null;
    }
  }

  // Start a new checkpoint (before critical action)
  async startCheckpoint(taskId: string): Promise<string> {
    await this.initialize();

    // If there's an existing checkpoint, finalize it first
    if (this.currentCheckpoint) {
      await this.finalizeCheckpoint('failed');
    }

    const snapshotId = this.generateId();
    const checkpointId = this.generateId();

    // Capture state snapshot
    this.currentSnapshot = {
      id: snapshotId,
      taskId,
      timestamp: Date.now(),
      files: new Map(),
      directories: new Map(),
      metadata: {}
    };

    // Create checkpoint
    this.currentCheckpoint = {
      id: checkpointId,
      taskId,
      startTime: Date.now(),
      endTime: null,
      status: 'in_progress',
      snapshotId,
      operations: []
    };

    this.pendingEntries = [];
    console.log(`[WAL] Started checkpoint ${checkpointId} for task ${taskId}`);

    return checkpointId;
  }

  // Register a file before modification (capture pre-state)
  async registerFileAction(
    action: WALAction,
    targetPath: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (!this.currentCheckpoint || !this.currentSnapshot) {
      console.warn('[WAL] No active checkpoint, skipping registration');
      return;
    }

    // Capture previous state for the file
    const previousState = await this.captureFileSnapshot(targetPath);

    // Store in snapshot if not already captured
    if (previousState && !this.currentSnapshot.files.has(targetPath)) {
      this.currentSnapshot.files.set(targetPath, previousState);
    }

    // Create WAL entry
    const entry: WALEntry = {
      id: this.generateId(),
      checkpointId: this.currentCheckpoint.id,
      timestamp: Date.now(),
      action,
      target: targetPath,
      previousState,
      newState: null,
      status: 'pending'
    };

    this.pendingEntries.push(entry);

    // Persist entry immediately (WAL principle)
    await this.persistEntry(entry);

    console.log(`[WAL] Registered ${action} for ${targetPath}`);
  }

  // Mark entry as applied after successful operation
  async markApplied(entryId: string): Promise<void> {
    const entry = this.pendingEntries.find(e => e.id === entryId);
    if (entry) {
      entry.status = 'applied';

      // Capture new state
      const newState = await this.captureFileSnapshot(entry.target);
      if (newState) {
        entry.newState = newState;
      }

      await this.persistEntry(entry);
    }
  }

  // Persist a single WAL entry
  private async persistEntry(entry: WALEntry): Promise<void> {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(WAL_FILE, line, 'utf-8');
    } catch (error) {
      console.error('[WAL] Error persisting entry:', error);
    }
  }

  // Save current snapshot to disk
  async saveSnapshot(): Promise<string | null> {
    if (!this.currentSnapshot || !this.currentCheckpoint) {
      return null;
    }

    const snapshotData = {
      id: this.currentSnapshot.id,
      taskId: this.currentSnapshot.taskId,
      timestamp: this.currentSnapshot.timestamp,
      files: Array.from(this.currentSnapshot.files.entries()),
      directories: Array.from(this.currentSnapshot.directories.entries()),
      metadata: this.currentSnapshot.metadata
    };

    const snapshotPath = path.join(SNAPSHOTS_DIR, `${this.currentSnapshot.id}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData, null, 2));

    console.log(`[WAL] Saved snapshot ${this.currentSnapshot.id}`);

    // Cleanup old snapshots
    await this.cleanupSnapshots();

    return this.currentSnapshot.id;
  }

  // Finalize checkpoint
  async finalizeCheckpoint(status: Checkpoint['status']): Promise<void> {
    if (!this.currentCheckpoint) {
      return;
    }

    // Save final snapshot
    await this.saveSnapshot();

    this.currentCheckpoint.endTime = Date.now();
    this.currentCheckpoint.status = status;
    this.currentCheckpoint.operations = [...this.pendingEntries];

    // Save checkpoint to checkpoints.json
    await this.saveCheckpoint(this.currentCheckpoint);

    console.log(`[WAL] Finalized checkpoint ${this.currentCheckpoint.id} with status ${status}`);

    // Cleanup old checkpoints
    await this.cleanupCheckpoints();

    this.currentCheckpoint = null;
    this.currentSnapshot = null;
    this.pendingEntries = [];
  }

  // Save checkpoint to disk
  private async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    try {
      const checkpoints = JSON.parse(fs.readFileSync(CHECKPOINTS_FILE, 'utf-8')) as Checkpoint[];
      checkpoints.push(checkpoint);
      fs.writeFileSync(CHECKPOINTS_FILE, JSON.stringify(checkpoints, null, 2));
    } catch (error) {
      console.error('[WAL] Error saving checkpoint:', error);
    }
  }

  // Get all checkpoints
  async getCheckpoints(): Promise<Checkpoint[]> {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINTS_FILE, 'utf-8')) as Checkpoint[];
    } catch (error) {
      console.error('[WAL] Error reading checkpoints:', error);
      return [];
    }
  }

  // Get last checkpoint
  async getLastCheckpoint(): Promise<Checkpoint | null> {
    const checkpoints = await this.getCheckpoints();
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  }

  // Get snapshot by ID
  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    try {
      const snapshotPath = path.join(SNAPSHOTS_DIR, `${snapshotId}.json`);
      if (!fs.existsSync(snapshotPath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
      return {
        ...data,
        files: new Map(data.files),
        directories: new Map(data.directories)
      };
    } catch (error) {
      console.error('[WAL] Error reading snapshot:', error);
      return null;
    }
  }

  // Read WAL entries for a checkpoint
  async getEntriesForCheckpoint(checkpointId: string): Promise<WALEntry[]> {
    try {
      const lines = fs.readFileSync(WAL_FILE, 'utf-8').split('\n').filter(Boolean);
      const entries: WALEntry[] = [];

      for (const line of lines) {
        const entry = JSON.parse(line) as WALEntry;
        if (entry.checkpointId === checkpointId) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
      console.error('[WAL] Error reading WAL entries:', error);
      return [];
    }
  }

  // Cleanup old snapshots
  private async cleanupSnapshots(): Promise<void> {
    try {
      const files = fs.readdirSync(SNAPSHOTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(SNAPSHOTS_DIR, f),
          time: fs.statSync(path.join(SNAPSHOTS_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Remove old snapshots beyond max
      for (let i = this.config.maxSnapshots; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
      }
    } catch (error) {
      console.error('[WAL] Error cleaning up snapshots:', error);
    }
  }

  // Cleanup old checkpoints
  private async cleanupCheckpoints(): Promise<void> {
    try {
      const checkpoints = JSON.parse(fs.readFileSync(CHECKPOINTS_FILE, 'utf-8')) as Checkpoint[];

      if (checkpoints.length > this.config.maxCheckpoints) {
        const toRemove = checkpoints.slice(0, checkpoints.length - this.config.maxCheckpoints);
        const remaining = checkpoints.slice(-this.config.maxCheckpoints);

        // Remove old snapshot files
        for (const cp of toRemove) {
          const snapshotPath = path.join(SNAPSHOTS_DIR, `${cp.snapshotId}.json`);
          if (fs.existsSync(snapshotPath)) {
            fs.unlinkSync(snapshotPath);
          }
        }

        fs.writeFileSync(CHECKPOINTS_FILE, JSON.stringify(remaining, null, 2));
      }
    } catch (error) {
      console.error('[WAL] Error cleaning up checkpoints:', error);
    }
  }

  // Check if there's an incomplete checkpoint (for recovery)
  async hasIncompleteCheckpoint(): Promise<boolean> {
    const lastCheckpoint = await this.getLastCheckpoint();
    return lastCheckpoint !== null && lastCheckpoint.status === 'in_progress';
  }

  // Get current checkpoint status
  getCurrentCheckpoint(): Checkpoint | null {
    return this.currentCheckpoint;
  }

  // Get current snapshot
  getCurrentSnapshot(): StateSnapshot | null {
    return this.currentSnapshot;
  }

  // Flush pending entries
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    // Entries are already persisted immediately, so flush is a no-op
    console.log('[WAL] Flush called');
  }

  // Close WAL
  async close(): Promise<void> {
    await this.flush();
    this.initialized = false;
    console.log('[WAL] Closed');
  }
}

// Export singleton instance
export const wal = new WriteAheadLog();

// Export class for testing
export { WriteAheadLog };
