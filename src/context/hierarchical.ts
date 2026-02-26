/**
 * Hierarchical Context Manager
 *
 * Gerenciamento hierárquico de contexto com compactação automática.
 * Monitora o tamanho das mensagens e compacta mensagens antigas em
 * "Summary Nodes" quando o limite configurável é ultrapassado.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tipo de entrada no contexto
 */
export type HierarchicalEntryType = 'user' | 'tool' | 'assistant' | 'system';

/**
 * Entrada individual do contexto
 */
export interface HierarchicalEntry {
  id: string;
  type: HierarchicalEntryType;
  content: string;
  timestamp: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Summary Node - representa mensagens compactadas
 */
export interface HierarchicalSummaryNode {
  id: string;
  type: 'summary';
  summary: string;
  originalIds: string[];
  tokenCount: number;
  createdAt: number;
  level: number;
  childSummaryIds?: string[];
}

/**
 * Estado hierárquico persistido em JSON
 */
export interface HierarchicalState {
  version: string;
  entries: HierarchicalEntry[];
  summaryNodes: HierarchicalSummaryNode[];
  activeIds: string[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    totalTokens: number;
    compactionCount: number;
  };
}

/**
 * Configuração do HierarchicalContextManager
 */
export interface HierarchicalConfig {
  storagePath: string;
  maxTokens: number;
  summaryThreshold: number;
  maxEntriesInMemory: number;
}

/**
 * Resultado da operação de compactação
 */
export interface HierarchicalCompactionResult {
  success: boolean;
  previousTokens: number;
  currentTokens: number;
  entriesCompacted: number;
  summaryNodeId: string;
  error?: string;
}

/**
 * Resultado do contexto compactado
 */
export interface HierarchicalCompactedContextResult {
  entries: (HierarchicalEntry | HierarchicalSummaryNode)[];
  totalTokens: number;
  needsCompaction: boolean;
  summaryCount: number;
}

/**
 * Resultado da expansão de nó
 */
export interface HierarchicalExpandNodeResult {
  success: boolean;
  expandedEntries: HierarchicalEntry[];
  error?: string;
}

/**
 * Erros personalizados do HierarchicalContextManager
 */
export class HierarchicalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HierarchicalError';
  }
}

/**
 * HierarchicalContextManager
 *
 * Gerencia o estado do projeto de forma hierárquica com compactação
 * automática de mensagens antigas em Summary Nodes.
 */
export class HierarchicalContextManager {
  private config: HierarchicalConfig;
  private state: HierarchicalState;
  private storePath: string;

  /**
   * Construtor - inicializa o manager com configuração
   */
  constructor(config: HierarchicalConfig) {
    this.config = {
      maxTokens: config.maxTokens || 100000,
      summaryThreshold: config.summaryThreshold || 0.8,
      maxEntriesInMemory: config.maxEntriesInMemory || 500,
      storagePath: config.storagePath
    };

    this.storePath = path.join(this.config.storagePath, 'hierarchical-state.json');
    this.state = this.loadState();
  }

  /**
   * Carrega o estado do disco ou cria novo
   */
  private loadState(): HierarchicalState {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf-8');
        const parsed = JSON.parse(data) as HierarchicalState;

        // Validar estrutura básica
        if (!this.isValidState(parsed)) {
          throw new HierarchicalError(
            'Estado inválido encontrado, criando novo',
            'INVALID_STATE'
          );
        }

        return parsed;
      }
    } catch (error) {
      if (error instanceof HierarchicalError) {
        // Re-lança erros de validação
        throw error;
      }
      // Erro de leitura, cria novo estado
    }

    return this.createInitialState();
  }

  /**
   * Valida a estrutura do estado
   */
  private isValidState(state: unknown): state is HierarchicalState {
    if (typeof state !== 'object' || state === null) return false;

    const s = state as Partial<HierarchicalState>;
    return (
      typeof s.version === 'string' &&
      Array.isArray(s.entries) &&
      Array.isArray(s.summaryNodes) &&
      Array.isArray(s.activeIds) &&
      typeof s.metadata === 'object'
    );
  }

  /**
   * Cria estado inicial
   */
  private createInitialState(): HierarchicalState {
    return {
      version: '1.0.0',
      entries: [],
      summaryNodes: [],
      activeIds: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalTokens: 0,
        compactionCount: 0
      }
    };
  }

  /**
   * Salva o estado no disco
   */
  private saveState(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.state.metadata.updatedAt = Date.now();

      const tempPath = this.storePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.storePath);
    } catch (error) {
      throw new HierarchicalError(
        `Falha ao salvar estado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        'SAVE_ERROR',
        error
      );
    }
  }

  /**
   * Estima tokens a partir do conteúdo
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Calcula o total de tokens no contexto atual
   */
  private calculateTotalTokens(): number {
    let total = 0;

    // Tokens das entradas ativas
    for (const id of this.state.activeIds) {
      const entry = this.state.entries.find(e => e.id === id);
      if (entry) {
        total += entry.tokenCount;
      } else {
        const summary = this.state.summaryNodes.find(s => s.id === id);
        if (summary) {
          total += summary.tokenCount;
        }
      }
    }

    return total;
  }

  /**
   * Adiciona uma nova entrada ao contexto
   *
   * @param type Tipo da entrada
   * @param content Conteúdo da mensagem
   * @param metadata Metadados adicionais
   * @returns ID da entrada criada
   */
  public addEntry(
    type: HierarchicalEntryType,
    content: string,
    metadata?: Record<string, unknown>
  ): string {
    const id = uuidv4();
    const tokenCount = this.estimateTokens(content);

    const entry: HierarchicalEntry = {
      id,
      type,
      content,
      timestamp: Date.now(),
      tokenCount,
      metadata
    };

    this.state.entries.push(entry);
    this.state.activeIds.push(id);
    this.state.metadata.totalTokens = this.calculateTotalTokens();

    // Verificar se precisa de compactação
    if (this.state.metadata.totalTokens > this.config.maxTokens) {
      this.compact();
    }

    this.saveState();
    return id;
  }

  /**
   * Realiza a compactação das mensagens mais antigas
   */
  private compact(): HierarchicalCompactionResult {
    const currentTokens = this.calculateTotalTokens();
    const targetTokens = Math.floor(this.config.maxTokens * this.config.summaryThreshold);

    // Identificar entradas que podem ser compactadas (excluir as mais recentes)
    const entriesToCompact: HierarchicalEntry[] = [];
    const summaryIds = this.state.summaryNodes.map(s => s.id);

    // Primeiro, coletar summaries de nível 0 (mais antigos) que ainda estão ativos
    const compactableSummaries = this.state.activeIds
      .filter(id => summaryIds.includes(id))
      .map(id => this.state.summaryNodes.find(s => s.id === id))
      .filter((s): s is HierarchicalSummaryNode => s !== undefined && s.level === 0);

    // Se não há summaries, pegar entradas antigas
    if (compactableSummaries.length === 0) {
      const entryIds = this.state.activeIds
        .filter(id => !summaryIds.includes(id))
        .slice(0, -10); // Manter as 10 mais recentes

      for (const id of entryIds) {
        const entry = this.state.entries.find(e => e.id === id);
        if (entry) {
          entriesToCompact.push(entry);
        }
      }
    } else {
      // Usar summaries existentes para criar um nível superior
      for (const summary of compactableSummaries.slice(0, 5)) {
        const existingSummary = this.state.summaryNodes.find(s => s.id === summary.id);
        if (existingSummary) {
          entriesToCompact.push({
            id: existingSummary.id,
            type: 'system' as HierarchicalEntryType,
            content: existingSummary.summary,
            timestamp: existingSummary.createdAt,
            tokenCount: existingSummary.tokenCount
          });
        }
      }
    }

    if (entriesToCompact.length === 0) {
      return {
        success: false,
        previousTokens: currentTokens,
        currentTokens,
        entriesCompacted: 0,
        summaryNodeId: '',
        error: 'Nenhuma entrada para compactar'
      };
    }

    // Criar summary node
    const summaryText = this.generateSummaryText(entriesToCompact);
    const summaryId = uuidv4();

    const summaryNode: HierarchicalSummaryNode = {
      id: summaryId,
      type: 'summary',
      summary: summaryText,
      originalIds: entriesToCompact.map(e => e.id),
      tokenCount: this.estimateTokens(summaryText),
      createdAt: Date.now(),
      level: 1,
      childSummaryIds: entriesToCompact
        .map(e => {
          const existing = this.state.summaryNodes.find(s => s.id === e.id);
          return existing?.id;
        })
        .filter((id): id is string => id !== undefined)
    };

    this.state.summaryNodes.push(summaryNode);

    // Remover entradas antigas dos IDs ativos e adicionar summary
    const compactableIds = new Set(entriesToCompact.map(e => e.id));
    this.state.activeIds = [
      ...this.state.activeIds.filter(id => !compactableIds.has(id)),
      summaryId
    ];

    this.state.metadata.compactionCount++;
    this.state.metadata.totalTokens = this.calculateTotalTokens();

    this.saveState();

    return {
      success: true,
      previousTokens: currentTokens,
      currentTokens: this.state.metadata.totalTokens,
      entriesCompacted: entriesToCompact.length,
      summaryNodeId: summaryId
    };
  }

  /**
   * Gera texto de resumo para as entradas
   */
  private generateSummaryText(entries: HierarchicalEntry[]): string {
    const summaries = entries.map(entry => {
      const typeLabel = entry.type.toUpperCase();
      const preview = entry.content.slice(0, 200);
      return `[${typeLabel}] ${preview}${entry.content.length > 200 ? '...' : ''}`;
    });

    return `=== Resumo de ${entries.length} mensagens ===\n${summaries.join('\n')}\n=== Fim do Resumo ===`;
  }

  /**
   * Retorna o contexto compactado (ativamente usado)
   *
   * @returns Contexto com entradas e summary nodes ativos
   */
  public getCompactedContext(): HierarchicalCompactedContextResult {
    const result: (HierarchicalEntry | HierarchicalSummaryNode)[] = [];
    let totalTokens = 0;
    let summaryCount = 0;

    for (const id of this.state.activeIds) {
      const entry = this.state.entries.find(e => e.id === id);
      if (entry) {
        result.push(entry);
        totalTokens += entry.tokenCount;
      } else {
        const summary = this.state.summaryNodes.find(s => s.id === id);
        if (summary) {
          result.push(summary);
          totalTokens += summary.tokenCount;
          summaryCount++;
        }
      }
    }

    return {
      entries: result,
      totalTokens,
      needsCompaction: totalTokens > this.config.maxTokens,
      summaryCount
    };
  }

  /**
   * Expande um Summary Node para revelar suas entradas originais
   *
   * @param summaryId ID do summary node para expandir
   * @returns Entradas originais recuperadas
   */
  public expandNode(summaryId: string): HierarchicalExpandNodeResult {
    const summary = this.state.summaryNodes.find(s => s.id === summaryId);

    if (!summary) {
      return {
        success: false,
        expandedEntries: [],
        error: `Summary node não encontrado: ${summaryId}`
      };
    }

    // Tentar recuperar entradas originais do store de entries
    const expandedEntries: HierarchicalEntry[] = [];

    for (const originalId of summary.originalIds) {
      const entry = this.state.entries.find(e => e.id === originalId);
      if (entry) {
        expandedEntries.push(entry);
      } else {
        // Tentar encontrar em child summaries
        const childSummary = this.state.summaryNodes.find(s => s.id === originalId);
        if (childSummary) {
          // Recursivamente buscar entradas filhas
          const childEntries = this.expandChildSummary(childSummary);
          expandedEntries.push(...childEntries);
        }
      }
    }

    // Atualizar IDs ativos para incluir as entradas recuperadas
    const summaryIndex = this.state.activeIds.indexOf(summaryId);
    if (summaryIndex !== -1) {
      const newIds = [
        ...this.state.activeIds.slice(0, summaryIndex),
        ...expandedEntries.map(e => e.id),
        ...this.state.activeIds.slice(summaryIndex + 1)
      ];
      this.state.activeIds = newIds;
      this.state.metadata.totalTokens = this.calculateTotalTokens();
      this.saveState();
    }

    return {
      success: true,
      expandedEntries
    };
  }

  /**
   * Expande um summary filho recursivamente
   */
  private expandChildSummary(summary: HierarchicalSummaryNode): HierarchicalEntry[] {
    const entries: HierarchicalEntry[] = [];

    for (const childId of summary.originalIds) {
      const entry = this.state.entries.find(e => e.id === childId);
      if (entry) {
        entries.push(entry);
      } else {
        const childSummary = this.state.summaryNodes.find(s => s.id === childId);
        if (childSummary) {
          entries.push(...this.expandChildSummary(childSummary));
        }
      }
    }

    return entries;
  }

  /**
   * Obtém estatísticas do manager
   */
  public getStats(): {
    totalEntries: number;
    totalSummaries: number;
    activeIds: number;
    totalTokens: number;
    compactionCount: number;
    createdAt: number;
    updatedAt: number;
  } {
    return {
      totalEntries: this.state.entries.length,
      totalSummaries: this.state.summaryNodes.length,
      activeIds: this.state.activeIds.length,
      totalTokens: this.state.metadata.totalTokens,
      compactionCount: this.state.metadata.compactionCount,
      createdAt: this.state.metadata.createdAt,
      updatedAt: this.state.metadata.updatedAt
    };
  }

  /**
   * Obtém um summary node pelo ID
   */
  public getSummaryById(id: string): HierarchicalSummaryNode | null {
    return this.state.summaryNodes.find(s => s.id === id) || null;
  }

  /**
   * Obtém uma entrada pelo ID
   */
  public getEntryById(id: string): HierarchicalEntry | null {
    return this.state.entries.find(e => e.id === id) || null;
  }

  /**
   * Limpa todos os dados (reset)
   */
  public clear(): void {
    this.state = this.createInitialState();
    this.saveState();
  }

  /**
   * Force compactação manual
   */
  public forceCompaction(): HierarchicalCompactionResult {
    return this.compact();
  }

  /**
   * Retorna o caminho do arquivo de estado
   */
  public getStorePath(): string {
    return this.storePath;
  }
}

/**
 * Factory function para criar HierarchicalContextManager
 */
export function createHierarchicalContextManager(
  config: HierarchicalConfig
): HierarchicalContextManager {
  return new HierarchicalContextManager(config);
}

export default HierarchicalContextManager;
