# Contracts: Context Management Lifecycle

## Interfaces para Task 000 - Archive Lifecycle Manager

```typescript
export interface ArchiveLifecycleConfig {
  retentionDays: number;
  maxArchiveSizeMB: number;
  archiveDirectories: string[];
  dryRun: boolean;
}

export interface ArchiveStats {
  directory: string;
  fileCount: number;
  totalSizeMB: number;
  oldestFile: string | null;
  newestFile: string | null;
  toDeleteCount: number;
  toDeleteSizeMB: number;
}

export interface CleanupResult {
  deletedFiles: string[];
  freedSpaceMB: number;
  errors: string[];
}

export class ArchiveLifecycleManager {
  static clean(config: ArchiveLifecycleConfig): Promise<CleanupResult>;
  static getStats(directories: string[]): Promise<ArchiveStats[]>;
  static schedulePeriodicCleanup(config: ArchiveLifecycleConfig): void;
}
```

## Interfaces para Task 101 - DAG Persistence

```typescript
export interface DAGPersistenceConfig {
  storageDir: string;
  autoSave: boolean;
  saveIntervalMs: number;
}

export async function saveDAGState(
  state: DAGState,
  config: DAGPersistenceConfig,
  projectPath: string
): Promise<string>;

export async function loadDAGState(
  config: DAGPersistenceConfig,
  projectPath: string
): Promise<DAGState | null>;

export async function getDAGStorageInfo(
  projectPath: string
): Promise<{ exists: boolean; lastSaved: string | null; sizeKB: number }>;
```

## Interfaces para Task 102 - Pointer Expansion Guard

```typescript
export interface PointerExpansionConfig {
  maxConcurrentExpansions: number;
  maxQueueSize: number;
  timeoutMs: number;
}

export class PointerExpansionGuard {
  constructor(config: PointerExpansionConfig);

  async expand<T>(
    pointer: FilePointer | LogPointer | RawDataPointer,
    loader: () => Promise<T>
  ): Promise<T>;

  getStats(): {
    active: number;
    queued: number;
    completed: number;
    failed: number;
  };

  close(): void;
}
```

## Interfaces para Task 103 - WorkerPool Factory

```typescript
export interface PoolInstance {
  id: string;
  pool: WorkerPool;
}

export function createPoolInstance(
  instanceId: string,
  config?: WorkerPoolConfig
): PoolInstance;

export function getPoolInstance(instanceId: string): PoolInstance | null;

export function destroyPoolInstance(instanceId: string): Promise<void>;

export function listPoolInstances(): string[];
```

## Configurações Extendidas

### ContextManagerConfig (extend)

```typescript
export interface ContextManagerConfig {
  // ... existentes ...

  // Novos campos para Archive Lifecycle
  retentionDays?: number;           // Default: 7
  maxArchiveSizeMB?: number;        // Default: 100
  archiveDirectories?: string[];    // Default: ['.vibe-flow/compressed-archives', '.vibe-flow/context-archives', '.vibe-flow/file-archives']

  // Novos campos para Pointer Guard
  maxConcurrentExpansions?: number; // Default: 5
}
```
