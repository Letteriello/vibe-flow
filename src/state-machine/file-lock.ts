// Workspace Lock Manager - In-memory file locking for concurrent access control

/**
 * Types of locks supported
 * - read: Multiple readers can hold locks simultaneously
 * - write: Exclusive lock, only one writer allowed
 */
export type LockType = 'read' | 'write';

/**
 * Error thrown when a file is already locked
 */
export class LockError extends Error {
  filepath: string;
  currentHolder: string | undefined;
  requestedBy: string | undefined;
  lockType: LockType | undefined;

  constructor(
    message: string,
    filepath: string,
    currentHolder?: string,
    requestedBy?: string,
    lockType?: LockType
  ) {
    super(message);
    this.name = 'LockError';
    this.filepath = filepath;
    this.currentHolder = currentHolder;
    this.requestedBy = requestedBy;
    this.lockType = lockType;
  }
}

/**
 * Lock entry storing the agent that holds the lock
 */
interface LockEntry {
  agentId: string;
  acquiredAt: Date;
  lockType: LockType;
  readCount?: number; // For tracking multiple concurrent read locks
}

/**
 * Bypass read entry for tracking safe read operations
 */
interface BypassReadEntry {
  agentId: string;
  token: string;
  acquiredAt: Date;
}

/**
 * WorkspaceLockManager - In-memory mutex for file access control
 *
 * Provides thread-safe locking mechanism to prevent concurrent
 * edits to the same file by multiple agents.
 *
 * Supports read-write locking:
 * - Multiple read locks can be held simultaneously (for wrap-up, backups, etc.)
 * - Write locks are exclusive (for editing operations)
 * - Bypass mechanism allows safe reading even when write locks exist
 */
export class WorkspaceLockManager {
  private locks: Map<string, LockEntry>;
  private bypassReads: Map<string, BypassReadEntry[]>;

  constructor() {
    this.locks = new Map();
    this.bypassReads = new Map();
  }

  /**
   * Acquires a lock for the specified file
   * @param filepath - The path to the file to lock
   * @param agentId - The identifier of the agent requesting the lock
   * @param lockType - The type of lock: 'read' allows multiple concurrent readers, 'write' is exclusive
   * @throws LockError if the file is already locked by another agent (for write locks)
   */
  acquireLock(filepath: string, agentId: string, lockType: LockType = 'write'): void {
    if (!filepath || filepath.trim().length === 0) {
      throw new LockError('Filepath is required', filepath, undefined, agentId);
    }

    if (!agentId || agentId.trim().length === 0) {
      throw new LockError('Agent ID is required', filepath, undefined, agentId);
    }

    const normalizedPath = this.normalizePath(filepath);
    const existingLock = this.locks.get(normalizedPath);

    if (existingLock) {
      // Same agent re-acquiring - handle based on lock type
      if (existingLock.agentId === agentId) {
        // Same agent can upgrade from read to write
        if (lockType === 'write' && existingLock.lockType === 'read') {
          // Upgrade: convert read lock to write lock (becomes exclusive)
          this.locks.set(normalizedPath, {
            agentId,
            acquiredAt: existingLock.acquiredAt, // Keep original time
            lockType: 'write',
            readCount: undefined
          });
          return;
        }
        // Same agent re-acquiring same type - idempotent
        return;
      }

      // Different agent: check lock compatibility
      if (lockType === 'read') {
        // Read lock: allowed if existing is also a read lock (multiple readers)
        if (existingLock.lockType === 'read') {
          // Increment read count for multiple readers
          this.locks.set(normalizedPath, {
            ...existingLock,
            readCount: (existingLock.readCount || 1) + 1
          });
          return;
        }
        // Existing is a write lock - read is not allowed, throw error
        throw new LockError(
          `File "${filepath}" has an active write lock by agent "${existingLock.agentId}"`,
          filepath,
          existingLock.agentId,
          agentId,
          existingLock.lockType
        );
      } else {
        // Write lock: exclusive, cannot acquire if anyone holds any lock
        throw new LockError(
          `File "${filepath}" is already locked by agent "${existingLock.agentId}"`,
          filepath,
          existingLock.agentId,
          agentId,
          existingLock.lockType
        );
      }
    }

    // No existing lock - create new one
    if (lockType === 'read') {
      this.locks.set(normalizedPath, {
        agentId,
        acquiredAt: new Date(),
        lockType: 'read',
        readCount: 1
      });
    } else {
      this.locks.set(normalizedPath, {
        agentId,
        acquiredAt: new Date(),
        lockType: 'write'
      });
    }
  }

  /**
   * Releases a lock for the specified file
   * @param filepath - The path to the file to unlock
   * @param agentId - The identifier of the agent releasing the lock
   * @param forceRelease - If true, releases even if other readers hold the lock
   * @throws LockError if the file is not locked or locked by a different agent
   */
  releaseLock(filepath: string, agentId: string, forceRelease: boolean = false): void {
    if (!filepath || filepath.trim().length === 0) {
      throw new LockError('Filepath is required', filepath, undefined, agentId);
    }

    if (!agentId || agentId.trim().length === 0) {
      throw new LockError('Agent ID is required', filepath, undefined, agentId);
    }

    const normalizedPath = this.normalizePath(filepath);
    const existingLock = this.locks.get(normalizedPath);

    if (!existingLock) {
      throw new LockError(
        `File "${filepath}" is not currently locked`,
        filepath,
        undefined,
        agentId
      );
    }

    if (existingLock.agentId !== agentId) {
      throw new LockError(
        `Cannot release lock: file "${filepath}" is locked by agent "${existingLock.agentId}", not "${agentId}"`,
        filepath,
        existingLock.agentId,
        agentId
      );
    }

    // Handle read lock with multiple readers
    if (existingLock.lockType === 'read' && existingLock.readCount && existingLock.readCount > 1) {
      if (forceRelease) {
        // Release all read locks
        this.locks.delete(normalizedPath);
      } else {
        // Decrement read count
        this.locks.set(normalizedPath, {
          ...existingLock,
          readCount: existingLock.readCount - 1
        });
      }
    } else {
      this.locks.delete(normalizedPath);
    }
  }

  /**
   * Checks if a file is currently locked
   * @param filepath - The path to check
   * @returns true if the file is locked, false otherwise
   */
  isLocked(filepath: string): boolean {
    if (!filepath || filepath.trim().length === 0) {
      return false;
    }

    const normalizedPath = this.normalizePath(filepath);
    return this.locks.has(normalizedPath);
  }

  /**
   * Gets the agent ID that currently holds the lock for a file
   * @param filepath - The path to check
   * @returns The agent ID if locked, undefined otherwise
   */
  getLockHolder(filepath: string): string | undefined {
    const normalizedPath = this.normalizePath(filepath);
    return this.locks.get(normalizedPath)?.agentId;
  }

  /**
   * Gets the type of lock held on a file
   * @param filepath - The path to check
   * @returns The lock type if locked, undefined otherwise
   */
  getLockType(filepath: string): LockType | undefined {
    const normalizedPath = this.normalizePath(filepath);
    return this.locks.get(normalizedPath)?.lockType;
  }

  /**
   * Checks if a file has an active write lock (blocks readers)
   * @param filepath - The path to check
   * @returns true if file has a write lock, false otherwise
   */
  isWriteLocked(filepath: string): boolean {
    const normalizedPath = this.normalizePath(filepath);
    const lock = this.locks.get(normalizedPath);
    return lock?.lockType === 'write';
  }

  /**
   * Checks if a read lock can be acquired (no write lock exists)
   * @param filepath - The path to check
   * @returns true if read lock can be acquired, false if blocked by write lock
   */
  canAcquireReadLock(filepath: string): boolean {
    const normalizedPath = this.normalizePath(filepath);
    const lock = this.locks.get(normalizedPath);

    if (!lock) return true; // No locks at all
    if (lock.lockType === 'read') return true; // Read locks allow concurrent readers

    return false; // Blocked by write lock
  }

  /**
   * Safe read lock acquisition with bypass for wrap-up operations
   * If a write lock exists, this method returns a bypass token instead of throwing
   * @param filepath - The path to the file to lock
   * @param agentId - The identifier of the agent requesting the lock
   * @returns Object with success status and optional bypass token or error
   */
  tryAcquireReadWithBypass(filepath: string, agentId: string): { success: boolean; bypassToken?: string; error?: LockError } {
    if (!filepath || filepath.trim().length === 0) {
      return {
        success: false,
        error: new LockError('Filepath is required', filepath, undefined, agentId)
      };
    }

    if (!agentId || agentId.trim().length === 0) {
      return {
        success: false,
        error: new LockError('Agent ID is required', filepath, undefined, agentId)
      };
    }

    const normalizedPath = this.normalizePath(filepath);
    const existingLock = this.locks.get(normalizedPath);

    // No existing lock - acquire read lock normally
    if (!existingLock) {
      this.acquireLock(filepath, agentId, 'read');
      return { success: true };
    }

    // Existing read lock - allow (multiple readers)
    if (existingLock.lockType === 'read') {
      this.acquireLock(filepath, agentId, 'read');
      return { success: true };
    }

    // Existing write lock - return bypass token for safe read
    // This allows wrap-up to read files even when the agent has a write lock
    const bypassToken = `bypass:${normalizedPath}:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;

    // Register the bypass read (non-blocking)
    if (!this.bypassReads.has(normalizedPath)) {
      this.bypassReads.set(normalizedPath, []);
    }
    this.bypassReads.get(normalizedPath)!.push({
      agentId,
      token: bypassToken,
      acquiredAt: new Date()
    });

    return {
      success: true,
      bypassToken
    };
  }

  /**
   * Releases a bypass read token
   * @param filepath - The file path
   * @param bypassToken - The bypass token to release
   */
  releaseBypassRead(filepath: string, bypassToken: string): void {
    const normalizedPath = this.normalizePath(filepath);
    const bypassList = this.bypassReads.get(normalizedPath);

    if (bypassList) {
      const index = bypassList.findIndex(b => b.token === bypassToken);
      if (index !== -1) {
        bypassList.splice(index, 1);
      }

      if (bypassList.length === 0) {
        this.bypassReads.delete(normalizedPath);
      }
    }
  }

  /**
   * Checks if a bypass read is active for a file
   * @param filepath - The file path to check
   * @returns true if bypass reads are active
   */
  hasBypassRead(filepath: string): boolean {
    const normalizedPath = this.normalizePath(filepath);
    const bypassList = this.bypassReads.get(normalizedPath);
    return bypassList !== undefined && bypassList.length > 0;
  }

  /**
   * Gets all bypass tokens for a file
   * @param filepath - The file path
   * @returns Array of bypass tokens
   */
  getBypassReads(filepath: string): string[] {
    const normalizedPath = this.normalizePath(filepath);
    const bypassList = this.bypassReads.get(normalizedPath);
    return bypassList ? bypassList.map(b => b.token) : [];
  }

  /**
   * Clears all bypass reads for a file (useful for emergency cleanup)
   * @param filepath - The file path
   */
  clearBypassReads(filepath: string): void {
    const normalizedPath = this.normalizePath(filepath);
    this.bypassReads.delete(normalizedPath);
  }

  /**
   * Gets all currently locked files
   * @returns Array of locked file paths
   */
  getLockedFiles(): string[] {
    return Array.from(this.locks.keys());
  }

  /**
   * Gets all locks held by a specific agent
   * @param agentId - The agent ID to query
   * @returns Array of file paths locked by the agent
   */
  getLocksByAgent(agentId: string): string[] {
    const result: string[] = [];
    const entries = Array.from(this.locks.entries());
    for (const [filepath, entry] of entries) {
      if (entry.agentId === agentId) {
        result.push(filepath);
      }
    }
    return result;
  }

  /**
   * Releases all locks held by a specific agent
   * @param agentId - The agent ID whose locks should be released
   * @returns Number of locks released
   */
  releaseAllLocksByAgent(agentId: string): number {
    let count = 0;
    const pathsToDelete: string[] = [];

    const entries = Array.from(this.locks.entries());
    for (const [filepath, entry] of entries) {
      if (entry.agentId === agentId) {
        pathsToDelete.push(filepath);
        count++;
      }
    }

    for (const path of pathsToDelete) {
      this.locks.delete(path);
    }

    // Also clear bypass reads for this agent
    const bypassEntries = Array.from(this.bypassReads.entries());
    for (const [filepath, bypassList] of bypassEntries) {
      const filtered = bypassList.filter(b => b.agentId === agentId);
      if (filtered.length > 0) {
        count += filtered.length;
        if (filtered.length === bypassList.length) {
          this.bypassReads.delete(filepath);
        } else {
          this.bypassReads.set(filepath, bypassList.filter(b => b.agentId !== agentId));
        }
      }
    }

    return count;
  }

  /**
   * Clears all locks (for testing purposes)
   */
  clearAllLocks(): void {
    this.locks.clear();
    this.bypassReads.clear();
  }

  /**
   * Gets the number of currently active locks
   */
  getLockCount(): number {
    return this.locks.size;
  }

  /**
   * Gets detailed lock information for a file
   * @param filepath - The path to check
   * @returns Object with lock details or undefined if not locked
   */
  getLockInfo(filepath: string): { agentId: string; lockType: LockType; acquiredAt: Date; readCount?: number } | undefined {
    const normalizedPath = this.normalizePath(filepath);
    const lock = this.locks.get(normalizedPath);
    if (!lock) return undefined;

    return {
      agentId: lock.agentId,
      lockType: lock.lockType,
      acquiredAt: lock.acquiredAt,
      readCount: lock.readCount
    };
  }

  /**
   * Gets statistics about locks and bypass reads
   * @returns Object with lock statistics
   */
  getLockStats(): { totalLocks: number; readLocks: number; writeLocks: number; bypassReads: number } {
    let readLocks = 0;
    let writeLocks = 0;

    for (const entry of this.locks.values()) {
      if (entry.lockType === 'read') {
        readLocks += 1;
      } else {
        writeLocks += 1;
      }
    }

    let bypassCount = 0;
    for (const bypassList of this.bypassReads.values()) {
      bypassCount += bypassList.length;
    }

    return {
      totalLocks: this.locks.size,
      readLocks,
      writeLocks,
      bypassReads: bypassCount
    };
  }

  /**
   * Normalizes file path for consistent comparison
   */
  private normalizePath(filepath: string): string {
    // Normalize path separators and remove trailing slashes
    return filepath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }
}

// Singleton instance for global access
let globalLockManager: WorkspaceLockManager | null = null;

/**
 * Gets the global WorkspaceLockManager instance
 */
export function getGlobalLockManager(): WorkspaceLockManager {
  if (!globalLockManager) {
    globalLockManager = new WorkspaceLockManager();
  }
  return globalLockManager;
}

/**
 * Resets the global lock manager (primarily for testing)
 */
export function resetGlobalLockManager(): void {
  globalLockManager = null;
}
