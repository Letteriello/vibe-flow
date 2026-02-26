// Workspace Lock Manager - In-memory file locking for concurrent access control

/**
 * Error thrown when a file is already locked
 */
export class LockError extends Error {
  filepath: string;
  currentHolder: string | undefined;
  requestedBy: string | undefined;

  constructor(
    message: string,
    filepath: string,
    currentHolder?: string,
    requestedBy?: string
  ) {
    super(message);
    this.name = 'LockError';
    this.filepath = filepath;
    this.currentHolder = currentHolder;
    this.requestedBy = requestedBy;
  }
}

/**
 * Lock entry storing the agent that holds the lock
 */
interface LockEntry {
  agentId: string;
  acquiredAt: Date;
}

/**
 * WorkspaceLockManager - In-memory mutex for file access control
 *
 * Provides thread-safe locking mechanism to prevent concurrent
 * edits to the same file by multiple agents.
 */
export class WorkspaceLockManager {
  private locks: Map<string, LockEntry>;

  constructor() {
    this.locks = new Map();
  }

  /**
   * Acquires a lock for the specified file
   * @param filepath - The path to the file to lock
   * @param agentId - The identifier of the agent requesting the lock
   * @throws LockError if the file is already locked by another agent
   */
  acquireLock(filepath: string, agentId: string): void {
    if (!filepath || filepath.trim().length === 0) {
      throw new LockError('Filepath is required', filepath, undefined, agentId);
    }

    if (!agentId || agentId.trim().length === 0) {
      throw new LockError('Agent ID is required', filepath, undefined, agentId);
    }

    const normalizedPath = this.normalizePath(filepath);

    const existingLock = this.locks.get(normalizedPath);

    if (existingLock) {
      // Allow same agent to re-acquire (idempotent)
      if (existingLock.agentId === agentId) {
        return;
      }

      throw new LockError(
        `File "${filepath}" is already locked by agent "${existingLock.agentId}"`,
        filepath,
        existingLock.agentId,
        agentId
      );
    }

    this.locks.set(normalizedPath, {
      agentId,
      acquiredAt: new Date()
    });
  }

  /**
   * Releases a lock for the specified file
   * @param filepath - The path to the file to unlock
   * @param agentId - The identifier of the agent releasing the lock
   * @throws LockError if the file is not locked or locked by a different agent
   */
  releaseLock(filepath: string, agentId: string): void {
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

    this.locks.delete(normalizedPath);
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

    return count;
  }

  /**
   * Clears all locks (for testing purposes)
   */
  clearAllLocks(): void {
    this.locks.clear();
  }

  /**
   * Gets the number of currently active locks
   */
  getLockCount(): number {
    return this.locks.size;
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
