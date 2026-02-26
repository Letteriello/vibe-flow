/**
 * Immutable Message Store
 *
 * Armazenamento append-only para transações de mensagens.
 * Cada transação é salva com UUID único, timestamp e contagem de tokens.
 * Formato de persistência: JSONL (JSON Lines).
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tipo de transação possível no store
 */
export type TransactionType = 'user_prompt' | 'tool_result' | 'assistant_reply';

/**
 * Interface para uma transação imutável
 */
export interface ImmutableTransaction {
  id: string;           // UUID único
  type: TransactionType;
  timestamp: number;    // Unix timestamp em ms
  tokenCount: number;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuração do ImmutableStore
 */
export interface ImmutableStoreConfig {
  storageDir: string;
  fileName?: string;
  enableIndex?: boolean;
}

/**
 * Resultado de uma transação bem-sucedida
 */
export interface TransactionResult {
  success: boolean;
  transactionId: string;
  byteOffset: number;
  lineNumber: number;
}

/**
 * Opções de busca
 */
export interface SearchOptions {
  type?: TransactionType;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

/**
 * Resultado de busca
 */
export interface SearchResult {
  transactions: ImmutableTransaction[];
  total: number;
  hasMore: boolean;
}

/**
 * Index para buscas rápidas
 */
interface IndexEntry {
  id: string;
  lineNumber: number;
  type: TransactionType;
  timestamp: number;
}

/**
 * ImmutableStore - Armazenamento append-only de transações
 *
 * Princípios:
 * - Append-only: nenhuma mensagem pode ser deletada ou alterada
 * - Atomicidade: cada transação é escrita de forma atômica
 * - Persistência: dados salvos em formato JSONL
 * - Indexação: índice para buscas eficientes
 */
export class ImmutableStore {
  private storageDir: string;
  private fileName: string;
  private filePath: string;
  private indexPath: string;
  private index: IndexEntry[] = [];
  private enableIndex: boolean;
  private lineCount: number = 0;
  private writeStream: fs.WriteStream | null = null;

  constructor(config: ImmutableStoreConfig) {
    this.storageDir = config.storageDir;
    this.fileName = config.fileName || 'transactions.jsonl';
    this.filePath = path.join(this.storageDir, this.fileName);
    this.indexPath = path.join(this.storageDir, 'index.json');
    this.enableIndex = config.enableIndex ?? true;

    this.ensureStorageDir();
    this.loadIndex();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Carrega o índice do disco
   */
  private loadIndex(): void {
    if (!this.enableIndex) return;

    try {
      if (fs.existsSync(this.indexPath)) {
        const indexData = fs.readFileSync(this.indexPath, 'utf-8');
        this.index = JSON.parse(indexData);
        this.lineCount = this.index.length;
      }
    } catch {
      // Se falhar, cria novo índice vazio
      this.index = [];
      this.lineCount = 0;
    }
  }

  /**
   * Salva o índice no disco
   */
  private saveIndex(): void {
    if (!this.enableIndex) return;

    const tempPath = this.indexPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(this.index), 'utf-8');

    // atomic rename
    fs.renameSync(tempPath, this.indexPath);
  }

  /**
   * Estima o número de tokens em um conteúdo
   * Estimativa simplificada: ~4 caracteres por token
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Adiciona uma nova transação (append-only)
   *
   * @param type Tipo da transação
   * @param content Conteúdo da mensagem
   * @param metadata Metadados adicionais
   * @returns Resultado da transação
   */
  public append(
    type: TransactionType,
    content: string,
    metadata?: Record<string, unknown>
  ): TransactionResult {
    const id = uuidv4();
    const timestamp = Date.now();
    const tokenCount = this.estimateTokens(content);

    const transaction: ImmutableTransaction = {
      id,
      type,
      timestamp,
      tokenCount,
      content,
      metadata
    };

    // Serializar para JSONL (uma linha por transação)
    const line = JSON.stringify(transaction) + '\n';

    // Obter offset atual antes de escrever
    const currentSize = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;

    // Append direto ao arquivo (append-only)
    fs.appendFileSync(this.filePath, line, 'utf-8');

    // Atualizar índice
    this.lineCount++;
    if (this.enableIndex) {
      this.index.push({
        id,
        lineNumber: this.lineCount,
        type,
        timestamp
      });
      this.saveIndex();
    }

    return {
      success: true,
      transactionId: id,
      byteOffset: currentSize,
      lineNumber: this.lineCount
    };
  }

  /**
   * Adiciona transação de user prompt
   */
  public addUserPrompt(content: string, metadata?: Record<string, unknown>): TransactionResult {
    return this.append('user_prompt', content, metadata);
  }

  /**
   * Adiciona transação de tool result
   */
  public addToolResult(content: string, metadata?: Record<string, unknown>): TransactionResult {
    return this.append('tool_result', content, metadata);
  }

  /**
   * Adiciona transação de assistant reply
   */
  public addAssistantReply(content: string, metadata?: Record<string, unknown>): TransactionResult {
    return this.append('assistant_reply', content, metadata);
  }

  /**
   * Busca transações por critérios (lcm_grep interno)
   *
   * @param options Opções de busca
   * @returns Resultado da busca
   */
  public search(options: SearchOptions = {}): SearchResult {
    const { type, startTime, endTime, limit = 100, offset = 0 } = options;

    let transactions: ImmutableTransaction[] = [];

    // Se tem índice, usa-o para filtrar primeiro
    if (this.enableIndex && this.index.length > 0) {
      // Filtrar pelo índice
      let filteredIndexes = this.index;

      if (type) {
        filteredIndexes = filteredIndexes.filter(entry => entry.type === type);
      }

      if (startTime !== undefined) {
        filteredIndexes = filteredIndexes.filter(entry => entry.timestamp >= startTime);
      }

      if (endTime !== undefined) {
        filteredIndexes = filteredIndexes.filter(entry => entry.timestamp <= endTime);
      }

      const total = filteredIndexes.length;

      // Aplicar offset e limit nos índices
      const paginatedIndexes = filteredIndexes.slice(offset, offset + limit);

      // Ler apenas as linhas necessárias
      for (const entry of paginatedIndexes) {
        const transaction = this.getById(entry.id);
        if (transaction) {
          transactions.push(transaction);
        }
      }

      return {
        transactions,
        total,
        hasMore: offset + limit < total
      };
    }

    // Sem índice, ler todo o arquivo
    if (!fs.existsSync(this.filePath)) {
      return { transactions: [], total: 0, hasMore: false };
    }

    const fileContent = fs.readFileSync(this.filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    let filteredLines = lines;

    // Filtrar manualmente se não tiver índice
    if (type || startTime !== undefined || endTime !== undefined) {
      filteredLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          if (type && entry.type !== type) return false;
          if (startTime !== undefined && entry.timestamp < startTime) return false;
          if (endTime !== undefined && entry.timestamp > endTime) return false;
          return true;
        } catch {
          return false;
        }
      });
    }

    const total = filteredLines.length;
    const paginatedLines = filteredLines.slice(offset, offset + limit);

    transactions = paginatedLines
      .map(line => {
        try {
          return JSON.parse(line) as ImmutableTransaction;
        } catch {
          return null;
        }
      })
      .filter((t): t is ImmutableTransaction => t !== null);

    return {
      transactions,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Obtém uma transação pelo ID
   */
  public getById(id: string): ImmutableTransaction | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(this.filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const transaction = JSON.parse(line) as ImmutableTransaction;
        if (transaction.id === id) {
          return transaction;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Obtém todas as transações
   */
  public getAll(limit?: number, offset?: number): SearchResult {
    return this.search({ limit, offset });
  }

  /**
   * Obtém estatísticas do store
   */
  public getStats(): {
    totalTransactions: number;
    totalTokens: number;
    byType: Record<TransactionType, number>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    fileSize: number;
  } {
    const transactions = this.search({ limit: 100000 }).transactions;

    const byType: Record<TransactionType, number> = {
      user_prompt: 0,
      tool_result: 0,
      assistant_reply: 0
    };

    let totalTokens = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const tx of transactions) {
      totalTokens += tx.tokenCount;
      byType[tx.type]++;

      if (oldestTimestamp === null || tx.timestamp < oldestTimestamp) {
        oldestTimestamp = tx.timestamp;
      }
      if (newestTimestamp === null || tx.timestamp > newestTimestamp) {
        newestTimestamp = tx.timestamp;
      }
    }

    let fileSize = 0;
    if (fs.existsSync(this.filePath)) {
      fileSize = fs.statSync(this.filePath).size;
    }

    return {
      totalTransactions: transactions.length,
      totalTokens,
      byType,
      oldestTimestamp,
      newestTimestamp,
      fileSize
    };
  }

  /**
   * Retorna o caminho do arquivo de armazenamento
   */
  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Fecha o store (fecha streams abertas)
   */
  public close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  /**
   * Cria uma instância de ImmutableStore
   */
  public static create(config: ImmutableStoreConfig): ImmutableStore {
    return new ImmutableStore(config);
  }
}

export default ImmutableStore;
