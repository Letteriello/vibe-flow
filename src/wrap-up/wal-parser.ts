// WAL Parser - Parser assíncrono via Streams para Write-Ahead Logs
// Resolve o problema de event loop blocking em arquivos grandes

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

/**
 * Tipo de ação executada pelo agente (replicado de wal-pruner para evitar dependência de compilação)
 */
export type WALActionType = 'write' | 'edit' | 'delete' | 'read' | 'bash' | 'create' | 'move' | 'copy';

/**
 * Interface para um evento de log do WAL (replicado de wal-pruner)
 */
export interface WALLogEvent {
  id: string;
  timestamp: number;
  action: WALActionType;
  target?: string;
  content?: string;
  previousContent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Opções para o parser de WAL
 */
export interface WALParserOptions {
  /** Tamanho do chunk para processamento (default: 64KB) */
  chunkSize?: number;
  /** Se deve extrair apenas metadados (default: true) */
  metadataOnly?: boolean;
  /** Callback chamado a cada evento processado */
  onProgress?: (processed: number) => void;
}

/**
 * Resultado do parsing de WAL
 */
export interface WALParseResult {
  events: WALLogEvent[];
  totalLines: number;
  parsedEvents: number;
  skippedLines: number;
  errors: string[];
}

/**
 * Metadados extraídos de um evento (versão leve)
 */
export interface WALMetadata {
  id: string;
  timestamp: number;
  action: string;
  target?: string;
}

/**
 * WALParser - Parser assíncrono que usa streams para processar arquivos WAL
 * sem bloquear o event loop
 *
 * Características:
 * - Leitura linha a linha via readline (não carrega tudo em memória)
 * - Extração apenas de metadados (descarta conteúdo)
 * - Suporte a callback de progresso
 * - Tratamento de erros robusto
 */
export class WALParser {
  private options: Required<WALParserOptions>;

  constructor(options: WALParserOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize ?? 65536, // 64KB
      metadataOnly: options.metadataOnly ?? true,
      onProgress: options.onProgress ?? (() => {})
    };
  }

  /**
   * Parseia um arquivo WAL usando streams
   *
   * @param filePath - Caminho do arquivo WAL
   * @returns Array de eventos parseados
   */
  async parseFile(filePath: string): Promise<WALParseResult> {
    const result: WALParseResult = {
      events: [],
      totalLines: 0,
      parsedEvents: 0,
      skippedLines: 0,
      errors: []
    };

    // Verifica se o arquivo existe
    if (!fs.existsSync(filePath)) {
      result.errors.push(`File not found: ${filePath}`);
      return result;
    }

    // Cria stream de leitura
    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: this.options.chunkSize,
      encoding: 'utf-8'
    });

    // Cria interface readline
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    // Processa cada linha
    for await (const line of rl) {
      result.totalLines++;

      // Ignora linhas vazias
      if (!line.trim()) {
        result.skippedLines++;
        continue;
      }

      // Tenta parsear a linha como JSON
      try {
        const parsed = JSON.parse(line);

        // Se metadataOnly, extrai apenas metadados
        if (this.options.metadataOnly) {
          const metadata = this.extractMetadata(parsed);
          if (metadata) {
            result.events.push({
              id: metadata.id,
              timestamp: metadata.timestamp,
              action: metadata.action as WALLogEvent['action'],
              target: metadata.target,
              // Remove conteúdo para economizar memória
              content: undefined,
              previousContent: undefined,
              metadata: parsed.metadata
            });
            result.parsedEvents++;
          } else {
            result.skippedLines++;
          }
        } else {
          // Parseia evento completo
          if (this.isValidWALEvent(parsed)) {
            result.events.push(parsed);
            result.parsedEvents++;
          } else {
            result.skippedLines++;
          }
        }
      } catch (parseError) {
        // Linha não é JSON válido - ignora
        result.skippedLines++;
      }

      // Callback de progresso
      if (result.totalLines % 100 === 0) {
        this.options.onProgress(result.parsedEvents);
      }
    }

    // Callback final
    this.options.onProgress(result.parsedEvents);

    return result;
  }

  /**
   * Cria um generator para iterar sobre eventos sem cargar tudo em memória
   * Útil para arquivos muito grandes
   *
   * @param filePath - Caminho do arquivo WAL
   * @yields Eventos WAL um a um
   */
  async *parseFileGenerator(filePath: string): AsyncGenerator<WALLogEvent> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: this.options.chunkSize,
      encoding: 'utf-8'
    });

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);

        if (this.options.metadataOnly) {
          const metadata = this.extractMetadata(parsed);
          if (metadata) {
            yield {
              id: metadata.id,
              timestamp: metadata.timestamp,
              action: metadata.action as WALLogEvent['action'],
              target: metadata.target,
              content: undefined,
              previousContent: undefined,
              metadata: parsed.metadata
            };
          }
        } else {
          if (this.isValidWALEvent(parsed)) {
            yield parsed;
          }
        }
      } catch {
        // Ignora linhas inválidas
      }
    }
  }

  /**
   * Processa múltiplos arquivos WAL
   *
   * @param directory - Diretório contendo arquivos WAL
   * @param pattern - Pattern para filtrar arquivos (default: *.json)
   * @returns Array de todos os eventos
   */
  async parseDirectory(directory: string, pattern: string = '*.json'): Promise<WALParseResult> {
    const result: WALParseResult = {
      events: [],
      totalLines: 0,
      parsedEvents: 0,
      skippedLines: 0,
      errors: []
    };

    // Lê arquivos do diretório
    let files: string[];
    try {
      files = await fs.promises.readdir(directory);
    } catch (error) {
      result.errors.push(`Cannot read directory: ${directory}`);
      return result;
    }

    // Filtra arquivos pelo pattern simples (suporta *.json)
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    const walFiles = files.filter(f => regex.test(f));

    // Processa cada arquivo
    for (const file of walFiles) {
      const filePath = path.join(directory, file);

      try {
        const fileResult = await this.parseFile(filePath);
        result.events.push(...fileResult.events);
        result.totalLines += fileResult.totalLines;
        result.parsedEvents += fileResult.parsedEvents;
        result.skippedLines += fileResult.skippedLines;
        result.errors.push(...fileResult.errors);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Error parsing ${file}: ${message}`);
      }
    }

    return result;
  }

  /**
   * Extrai metadados de um objeto JSON
   * Descarta conteúdo para manter footprint baixo
   */
  private extractMetadata(obj: Record<string, unknown>): WALMetadata | null {
    // Valida campos obrigatórios
    const id = obj.id;
    const timestamp = obj.timestamp;
    const action = obj.action;

    if (typeof id !== 'string') return null;
    if (typeof timestamp !== 'number') return null;
    if (typeof action !== 'string') return null;

    return {
      id,
      timestamp,
      action,
      target: typeof obj.target === 'string' ? obj.target : undefined
    };
  }

  /**
   * Valida se o objeto é um evento WAL válido
   */
  private isValidWALEvent(obj: unknown): obj is WALLogEvent {
    if (typeof obj !== 'object' || obj === null) return false;

    const event = obj as Record<string, unknown>;

    return (
      typeof event.id === 'string' &&
      typeof event.timestamp === 'number' &&
      typeof event.action === 'string'
    );
  }
}

/**
 * Cria um parser com opções padrão
 */
export function createWALParser(options?: WALParserOptions): WALParser {
  return new WALParser(options);
}

/**
 * Parseia um arquivo WAL de forma simples (conveniência)
 *
 * @param filePath - Caminho do arquivo
 * @returns Array de eventos
 */
export async function parseWALFile(filePath: string): Promise<WALLogEvent[]> {
  const parser = new WALParser({ metadataOnly: true });
  const result = await parser.parseFile(filePath);
  return result.events;
}

/**
 * Parseia todos os arquivos WAL em um diretório
 *
 * @param directory - Diretório contendo arquivos WAL
 * @param pattern - Pattern para filtrar arquivos
 * @returns Array de eventos
 */
export async function parseWALDirectory(
  directory: string,
  pattern: string = '*.json'
): Promise<WALLogEvent[]> {
  const parser = new WALParser({ metadataOnly: true });
  const result = await parser.parseDirectory(directory, pattern);
  return result.events;
}

/**
 * Itera sobre eventos de um arquivo WAL sem carregar tudo em memória
 *
 * @param filePath - Caminho do arquivo
 * @param callback - Função chamada para cada evento
 */
export async function forEachWALEvent(
  filePath: string,
  callback: (event: WALLogEvent) => void | Promise<void>
): Promise<number> {
  const parser = new WALParser({ metadataOnly: true });
  let count = 0;

  for await (const event of parser.parseFileGenerator(filePath)) {
    await callback(event);
    count++;
  }

  return count;
}
