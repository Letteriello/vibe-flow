# UX Spec: Context Management Lifecycle

## Meta
- **PRD vinculado:** docs/planning/context-management/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28

## 1. Visão Geral

Esta especificação cobre as mudanças internas no sistema de gerenciamento de contexto. Não há UI de usuário, mas os componentes afetados têm as seguintes interfaces.

## 2. Interfaces de Componente

### 2.1 Archive Lifecycle Manager

**Localização:** Novo arquivo `src/context/archive-lifecycle.ts`

```typescript
export interface ArchiveLifecycleConfig {
  retentionDays: number;           // Dias antes de limpar (default: 7)
  maxArchiveSizeMB: number;        // Tamanho maximo total (default: 100)
  archiveDirectories: string[];     // Diretórios para monitorar
  dryRun: boolean;                 // Simular sem deletar (default: false)
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

### 2.2 Token Estimation Unification

**Mudanças em:**
- `src/context/compression.ts` - usar `estimateTokens` de `src/utils/token-estimation.ts`
- `src/context/compaction.ts` - usar `estimateTokens` de `src/utils/token-estimation.ts`
- `src/context/dag-summary.ts` - usar `estimateTokens` de `src/utils/token-estimation.ts`
- `src/context/file-pointers.ts` - usar `estimateTokens` de `src/utils/token-estimation.ts`

**Alertas de breaking changes:**
- `compression.ts:124` - `estimateTokens()` removida, usar import
- `compaction.ts:70` - `compactionEstimateTokens()` removida, usar import
- `dag-summary.ts:62` - `estimateTokens()` interna permanece (escopo local)
- `file-pointers.ts:84` - `estimateFileTokens()` removida, usar import

### 2.3 DAG Persistence

**Mudanças em:** `src/context/dag-summary.ts`

```typescript
// Novas funcoes exportadas
export interface DAGPersistenceConfig {
  storageDir: string;
  autoSave: boolean;
  saveIntervalMs: number;
}

export async function saveDAGState(
  state: DAGState,
  config: DAGPersistenceConfig,
  projectPath: string
): Promise<string>;  // Retorna caminho do arquivo

export async function loadDAGState(
  config: DAGPersistenceConfig,
  projectPath: string
): Promise<DAGState | null>;

export async function getDAGStorageInfo(
  projectPath: string
): Promise<{ exists: boolean; lastSaved: string | null; sizeKB: number }>;
```

**Integração no ContextManager:**
- Adicionar método `loadDAGState()` no startup
- Adicionar auto-save periodico

### 2.4 Pointer Expansion Guard

**Mudanças em:** Adicionar novo `src/context/pointer-guard.ts`

```typescript
export interface PointerExpansionConfig {
  maxConcurrentExpansions: number;  // Maximo simultaneo (default: 5)
  maxQueueSize: number;            // Maximo na fila (default: 20)
  timeoutMs: number;               // Timeout por expansao (default: 30000)
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

### 2.5 WorkerPool Factory

**Mudanças em:** `src/context/worker-pool.ts`

```typescript
// Remover singleton global
// let globalPool: WorkerPool | null = null;

// Nova factory com instance ID
export interface PoolInstance {
  id: string;
  pool: WorkerPool;
}

const poolInstances = new Map<string, PoolInstance>();

export function createPoolInstance(
  instanceId: string,
  config?: WorkerPoolConfig
): PoolInstance;

export function getPoolInstance(instanceId: string): PoolInstance | null;

export function destroyPoolInstance(instanceId: string): Promise<void>;

export function listPoolInstances(): string[];  // Lista IDs

// Manter backward compatibility
export function getGlobalPool(config?: WorkerPoolConfig): WorkerPool {
  // Deprecation warning
  return getPoolInstance('default')?.pool ?? createPoolInstance('default', config).pool;
}
```

## 3. Fluxos de Integração

### 3.1 Startup do ContextManager

```
ContextManager.create()
  -> loadCompressionState()
  -> loadDAGState() [NOVO]
  -> initializePool() [mudanca: usa factory]
```

### 3.2 Cleanup Periódico

```
schedulePeriodicCleanup()
  -> ArchiveLifecycleManager.clean() [NOVO]
  -> schedule next cleanup
```

### 3.3 Expansão de Pointer

```
expandContext() ou expandCompressedLogs()
  -> PointerExpansionGuard.expand()
    -> acquire semaphore
    -> load from disk
    -> release semaphore
```

## 4. Design Tokens & Convenções

Baseado nas convenções existentes do projeto:
- Classes com `PascalCase`
- Funções utilitárias com `camelCase`
- Interfaces com prefixo descritivo (`ArchiveLifecycleConfig`, não `Config`)
- Arquivos com nomes descritivos em kebab-case
- Exports pelo `index.ts` do módulo

## 5. Acessibilidade

Este código é backend/internal. Não há UI. A acessibilidade aqui se refere a:
- APIs devem ser claras e autodocumentadas com JSDoc
- Erros devem ter mensagens descritivas
- Configurações devem ter valores padrão sensatos
