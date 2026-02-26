// WAL Recovery - Recuperação de estado a partir de Write-Ahead Logging
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';

// Configuração do diretório WAL
const VIBE_FLOW_DIR = '.vibe-flow';
const WAL_DIR = path.join(VIBE_FLOW_DIR, 'wal');

// Interfaces
export interface WALState {
  id: string;
  timestamp: number;
  data: Record<string, unknown>;
  checksum?: string;
}

export interface RecoveryResult {
  success: boolean;
  state: WALState | null;
  error?: string;
  logsProcessed: number;
  corruptedLogsSkipped: number;
}

/**
 * WALManager - Gerenciador de Write-Ahead Logging para recuperação de estado
 *
 * Responsável por:
 * - Persistir estados em arquivos .json no diretório .vibe-flow/wal/
 * - Ignorar logs corrompidos (JSON inválido)
 * - Recuperar o último estado válido conhecido em caso de falha
 */
export class WALManager {
  private walDir: string;
  private initialized: boolean;

  constructor(walDir: string = WAL_DIR) {
    this.walDir = walDir;
    this.initialized = false;
  }

  /**
   * Inicializa o diretório WAL se necessário
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(this.walDir)) {
        mkdirSync(this.walDir, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize WAL directory: ${message}`);
    }
  }

  /**
   * Gera um nome de arquivo de log baseado no timestamp
   */
  private generateLogFileName(timestamp: number): string {
    return `state_${timestamp}.json`;
  }

  /**
   * Gera um checksum simples para validação de integridade
   */
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * AppendLog - Persiste um estado no WAL
   *
   * @param state - Estado a ser persistido
   * @throws Error se houver falha de I/O
   */
  async appendLog(state: WALState): Promise<string> {
    await this.ensureInitialized();

    // Adiciona checksum para validação posterior
    const stateWithChecksum: WALState = {
      ...state,
      checksum: this.generateChecksum(JSON.stringify(state.data))
    };

    const fileName = this.generateLogFileName(state.timestamp);
    const filePath = path.join(this.walDir, fileName);

    try {
      await fs.writeFile(filePath, JSON.stringify(stateWithChecksum, null, 2), 'utf-8');
      return fileName;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write WAL log: ${message}`);
    }
  }

  /**
   * RecoverLastValidState - Recupera o último estado válido do WAL
   *
   * Escaneia todos os arquivos .json no diretório WAL, ignora logs corrompidos
   * e retorna o estado com o timestamp mais recente.
   *
   * @returns RecoveryResult com o último estado válido ou null se não houver
   */
  async recoverLastValidState(): Promise<RecoveryResult> {
    await this.ensureInitialized();

    let lastValidState: WALState | null = null;
    let logsProcessed = 0;
    let corruptedLogsSkipped = 0;

    try {
      // Lista todos os arquivos no diretório WAL
      const files = await fs.readdir(this.walDir);

      // Filtra apenas arquivos .json
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Ordena por timestamp (mais recente por último)
      jsonFiles.sort((a, b) => {
        const timeA = parseInt(a.replace('state_', '').replace('.json', ''), 10);
        const timeB = parseInt(b.replace('state_', '').replace('.json', ''), 10);
        return timeA - timeB;
      });

      // Processa cada arquivo
      for (const fileName of jsonFiles) {
        const filePath = path.join(this.walDir, fileName);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(content) as WALState;

          // Valida estrutura mínima do estado
          if (!this.isValidState(parsed)) {
            corruptedLogsSkipped++;
            continue;
          }

          // Valida checksum se existir
          if (parsed.checksum) {
            const dataStr = JSON.stringify(parsed.data);
            const expectedChecksum = this.generateChecksum(dataStr);
            if (parsed.checksum !== expectedChecksum) {
              corruptedLogsSkipped++;
              continue;
            }
          }

          // Atualiza o último válido (como está ordenado, o último será o mais recente)
          lastValidState = parsed;
          logsProcessed++;
        } catch (parseError) {
          // JSON inválido - ignora e continua
          corruptedLogsSkipped++;
          continue;
        }
      }

      return {
        success: lastValidState !== null,
        state: lastValidState,
        error: lastValidState === null ? 'No valid state found in WAL' : undefined,
        logsProcessed,
        corruptedLogsSkipped
      };
    } catch (error) {
      // Falha de I/O - retorna erro mas mantém contagem
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        state: lastValidState,
        error: `I/O error during recovery: ${message}`,
        logsProcessed,
        corruptedLogsSkipped
      };
    }
  }

  /**
   * Valida se o objeto possui a estrutura mínima de um WALState
   */
  private isValidState(obj: unknown): obj is WALState {
    if (typeof obj !== 'object' || obj === null) return false;

    const state = obj as Record<string, unknown>;

    return (
      typeof state.id === 'string' &&
      typeof state.timestamp === 'number' &&
      typeof state.data === 'object' &&
      state.data !== null
    );
  }

  /**
   * Remove arquivos de log antigos, mantendo apenas os N mais recentes
   *
   * @param keepCount - Número de arquivos a manter
   */
  async pruneOldLogs(keepCount: number = 10): Promise<number> {
    await this.ensureInitialized();

    try {
      const files = await fs.readdir(this.walDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Ordena por timestamp (mais antigo primeiro)
      jsonFiles.sort((a, b) => {
        const timeA = parseInt(a.replace('state_', '').replace('.json', ''), 10);
        const timeB = parseInt(b.replace('state_', '').replace('.json', ''), 10);
        return timeA - timeB;
      });

      // Remove arquivos antigos
      const toRemove = jsonFiles.slice(0, Math.max(0, jsonFiles.length - keepCount));
      for (const fileName of toRemove) {
        const filePath = path.join(this.walDir, fileName);
        await fs.unlink(filePath);
      }

      return toRemove.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to prune old logs: ${message}`);
    }
  }

  /**
   * Lista todos os estados disponíveis no WAL (para debugging)
   */
  async listStates(): Promise<WALState[]> {
    await this.ensureInitialized();

    const states: WALState[] = [];

    try {
      const files = await fs.readdir(this.walDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const fileName of jsonFiles) {
        try {
          const filePath = path.join(this.walDir, fileName);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(content) as WALState;

          if (this.isValidState(parsed)) {
            states.push(parsed);
          }
        } catch {
          // Ignora arquivos inválidos
          continue;
        }
      }

      // Ordena por timestamp
      states.sort((a, b) => a.timestamp - b.timestamp);

      return states;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list states: ${message}`);
    }
  }
}

// Exporta instância singleton
export const walManager = new WALManager();
