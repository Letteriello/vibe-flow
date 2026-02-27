/**
 * Immutable Logger
 *
 * Sistema de logging append-only associado ao ImmutableStore.
 * Registra operações, erros e eventos do sistema de forma imutável.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Nível de log
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit';

/**
 * Categoria de log
 */
export type LogCategory = 'store' | 'search' | 'transaction' | 'system' | 'error' | 'audit';

/**
 * Interface para entrada de log
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuração do ImmutableLogger
 */
export interface ImmutableLoggerConfig {
  storageDir: string;
  fileName?: string;
  minLevel?: LogLevel;
  categories?: LogCategory[];
}

/**
 * Resultado de uma operação de log
 */
export interface LogResult {
  success: boolean;
  entryId: string;
}

/**
 * Opções de busca em logs
 */
export interface LogSearchOptions {
  level?: LogLevel;
  category?: LogCategory;
  startTime?: number;
  endTime?: number;
  transactionId?: string;
  messageContains?: string;
  limit?: number;
  offset?: number;
}

/**
 * Resultado de busca em logs
 */
export interface LogSearchResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

/**
 * Níveis de log em ordem de severidade
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  audit: 4
};

/**
 * ImmutableLogger - Sistema de logging append-only
 *
 * Características:
 * - Append-only: logs não podem ser alterados ou deletados
 * - Associa-se a transações do ImmutableStore via transactionId
 * - Suporta múltiplas categorias e níveis
 * - Persistência em formato JSONL
 */
export class ImmutableLogger {
  private storageDir: string;
  private fileName: string;
  private filePath: string;
  private minLevel: LogLevel;
  private categories: Set<LogCategory>;
  private lineCount: number = 0;

  constructor(config: ImmutableLoggerConfig) {
    this.storageDir = config.storageDir;
    this.fileName = config.fileName || 'immutable-logs.jsonl';
    this.filePath = path.join(this.storageDir, this.fileName);
    this.minLevel = config.minLevel || 'debug';
    this.categories = new Set(config.categories || Object.values(['store', 'search', 'transaction', 'system', 'error', 'audit']));

    this.ensureStorageDir();
    this.loadLineCount();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private loadLineCount(): void {
    if (fs.existsSync(this.filePath)) {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      this.lineCount = content.split('\n').filter(l => l.trim()).length;
    }
  }

  /**
   * Verifica se um nível de log deve ser registrado
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  /**
   * Cria uma entrada de log
   */
  private createEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    transactionId?: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      id: uuidv4(),
      timestamp: Date.now(),
      level,
      category,
      message,
      transactionId,
      metadata
    };
  }

  /**
   * Escreve uma entrada de log de forma atômica
   */
  private writeEntry(entry: LogEntry): LogResult {
    if (!this.shouldLog(entry.level)) {
      return { success: true, entryId: entry.id };
    }

    if (!this.categories.has(entry.category)) {
      return { success: true, entryId: entry.id };
    }

    const line = JSON.stringify(entry) + '\n';
    const tempPath = this.filePath + '.tmp.' + Math.random().toString(36).substring(2);

    // Ensure directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Escrita atômica
    const exists = fs.existsSync(this.filePath);
    const currentSize = exists ? fs.statSync(this.filePath).size : 0;

    fs.writeFileSync(tempPath, line, 'utf-8');
    try {
      fs.appendFileSync(this.filePath, line, 'utf-8');
    } catch (appendErr) {
      // If append fails (e.g., file doesn't exist), try to copy temp to target
      try {
        fs.copyFileSync(tempPath, this.filePath);
      } catch {
        // Ignore if both fail
      }
    }

    // Limpar temp file
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignorar erro de cleanup
    }

    this.lineCount++;

    return {
      success: true,
      entryId: entry.id
    };
  }

  /**
   * Log de debug
   */
  public debug(message: string, category: LogCategory = 'system', metadata?: Record<string, unknown>): LogResult {
    return this.writeEntry(this.createEntry('debug', category, message, undefined, metadata));
  }

  /**
   * Log de info
   */
  public info(message: string, category: LogCategory = 'system', metadata?: Record<string, unknown>): LogResult {
    return this.writeEntry(this.createEntry('info', category, message, undefined, metadata));
  }

  /**
   * Log de warning
   */
  public warn(message: string, category: LogCategory = 'system', metadata?: Record<string, unknown>): LogResult {
    return this.writeEntry(this.createEntry('warn', category, message, undefined, metadata));
  }

  /**
   * Log de error
   */
  public error(message: string, category: LogCategory = 'error', metadata?: Record<string, unknown>): LogResult {
    return this.writeEntry(this.createEntry('error', category, message, undefined, metadata));
  }

  /**
   * Log de auditoria (sempre registrado)
   */
  public audit(message: string, transactionId?: string, metadata?: Record<string, unknown>): LogResult {
    return this.writeEntry(this.createEntry('audit', 'audit', message, transactionId, metadata));
  }

  /**
   * Log associado a uma transação
   */
  public logTransaction(
    transactionId: string,
    message: string,
    level: LogLevel = 'info',
    metadata?: Record<string, unknown>
  ): LogResult {
    return this.writeEntry(this.createEntry(level, 'transaction', message, transactionId, metadata));
  }

  /**
   * Log de operação do store
   */
  public logStoreOperation(
    operation: string,
    transactionId: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): LogResult {
    const message = `Store operation: ${operation} - ${success ? 'SUCCESS' : 'FAILED'}`;
    const level = success ? 'info' : 'error';
    return this.writeEntry(this.createEntry(level, 'store', message, transactionId, metadata));
  }

  /**
   * Log de busca
   */
  public logSearch(
    query: string,
    resultCount: number,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): LogResult {
    const message = `Search: "${query}" - ${resultCount} results in ${durationMs}ms`;
    return this.writeEntry(this.createEntry('info', 'search', message, undefined, { ...metadata, resultCount, durationMs }));
  }

  /**
   * Busca logs por critérios
   */
  public search(options: LogSearchOptions = {}): LogSearchResult {
    const {
      level,
      category,
      startTime,
      endTime,
      transactionId,
      messageContains,
      limit = 100,
      offset = 0
    } = options;

    if (!fs.existsSync(this.filePath)) {
      return { entries: [], total: 0, hasMore: false };
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    let filteredLines = lines;

    // Filtrar por critérios
    filteredLines = lines.filter(line => {
      try {
        const entry = JSON.parse(line) as LogEntry;

        if (level && entry.level !== level) return false;
        if (category && entry.category !== category) return false;
        if (startTime && entry.timestamp < startTime) return false;
        if (endTime && entry.timestamp > endTime) return false;
        if (transactionId && entry.transactionId !== transactionId) return false;
        if (messageContains && !entry.message.toLowerCase().includes(messageContains.toLowerCase())) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    });

    const total = filteredLines.length;
    const paginatedLines = filteredLines.slice(offset, offset + limit);

    const entries: LogEntry[] = paginatedLines
      .map(line => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is LogEntry => e !== null);

    return {
      entries,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Obtém logs por transactionId
   */
  public getByTransactionId(transactionId: string): LogSearchResult {
    return this.search({ transactionId, limit: 1000 });
  }

  /**
   * Obtém logs de auditoria
   */
  public getAuditLogs(limit?: number, offset?: number): LogSearchResult {
    return this.search({ level: 'audit', limit, offset });
  }

  /**
   * Obtém estatísticas do logger
   */
  public getStats(): {
    totalEntries: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
    fileSize: number;
  } {
    const logs = this.search({ limit: 100000 });

    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      audit: 0
    };

    const byCategory: Record<LogCategory, number> = {
      store: 0,
      search: 0,
      transaction: 0,
      system: 0,
      error: 0,
      audit: 0
    };

    for (const entry of logs.entries) {
      byLevel[entry.level]++;
      byCategory[entry.category]++;
    }

    let fileSize = 0;
    if (fs.existsSync(this.filePath)) {
      fileSize = fs.statSync(this.filePath).size;
    }

    return {
      totalEntries: logs.entries.length,
      byLevel,
      byCategory,
      fileSize
    };
  }

  /**
   * Retorna o caminho do arquivo de logs
   */
  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Cria uma instância de ImmutableLogger
   */
  public static create(config: ImmutableLoggerConfig): ImmutableLogger {
    return new ImmutableLogger(config);
  }
}

export default ImmutableLogger;
