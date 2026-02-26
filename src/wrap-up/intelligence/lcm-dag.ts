// Lossless Context Management (LCM) - DAG-based Context Manager
// Provides hierarchical summarization while maintaining pointers to original immutable events

import {
  MessageId,
  SummaryId,
  MessagePointer,
  SummaryPointer,
  DAGPointer,
  LeafSummary,
  CondensedSummary,
  SummaryNode,
  DAGState,
  DAGSummaryConfig,
} from '../../context/summary-types';

/**
 * Raw log entry from session transcript
 */
export interface RawLogEntry {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete DAG Summary structure
 */
export interface DAGSummary {
  version: string;
  createdAt: string;
  config: DAGSummaryConfig;
  rawLogCount: number;
  totalTokens: number;
  state: DAGState;
  rootSummaryId: SummaryId | null;
  provenanceIndex: Map<SummaryId, DAGPointer[]>;
}

/**
 * LCM Configuration defaults
 */
const DEFAULT_CONFIG: DAGSummaryConfig = {
  maxLeafMessages: 10,
  maxCondensedChildren: 5,
  maxLevels: 3,
  preserveRecentMessages: 20,
};

/**
 * ContextDAGManager - Lossless Context Management DAG Builder
 *
 * Receives raw session transcripts and builds a hierarchical DAG of summaries.
 * Each Summary Node maintains pointers (IDs) to original immutable events in the log.
 * LLMs can read the compact DAG and expand pointers when exact detail is needed.
 */
export class ContextDAGManager {
  private config: DAGSummaryConfig;
  private rawLogs: RawLogEntry[] = [];
  private summaries: Map<SummaryId, SummaryNode> = new Map();
  private levels: Map<number, SummaryId[]> = new Map();
  private provenanceIndex: Map<SummaryId, DAGPointer[]> = new Map();

  constructor(config: Partial<DAGSummaryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a unique summary ID
   */
  private generateSummaryId(prefix: string = 'sum'): SummaryId {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(index: number): MessageId {
    return `msg_${index}_${Date.now()}`;
  }

  /**
   * Calculate approximate token count for content
   */
  private estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Create a LeafSummary from a group of raw log entries
   */
  private createLeafSummary(entries: RawLogEntry[], startIndex: number): LeafSummary {
    const id = this.generateSummaryId('leaf');
    const summaryText = this.generateLeafSummary(entries);
    const tokenCount = this.estimateTokens(summaryText);

    const pointers: MessagePointer[] = entries.map((entry, idx) => ({
      type: 'message',
      messageId: this.generateMessageId(startIndex + idx),
      index: startIndex + idx,
      timestamp: entry.timestamp,
    }));

    const leafSummary: LeafSummary = {
      id,
      type: 'leaf',
      summary: summaryText,
      pointers,
      createdAt: new Date().toISOString(),
      tokenCount,
      messageCount: entries.length,
    };

    this.summaries.set(id, leafSummary);
    this.provenanceIndex.set(id, pointers);

    // Add to level 1
    const level1 = this.levels.get(1) || [];
    level1.push(id);
    this.levels.set(1, level1);

    return leafSummary;
  }

  /**
   * Generate summary text from raw entries
   */
  private generateLeafSummary(entries: RawLogEntry[]): string {
    const roleCounts = { user: 0, assistant: 0, system: 0, tool: 0 };
    const toolNames = new Set<string>();
    const totalContent = entries.reduce((acc, e) => {
      roleCounts[e.role]++;
      if (e.toolName) toolNames.add(e.toolName);
      return acc + e.content.length;
    }, 0);

    const tools = Array.from(toolNames).join(', ') || 'none';
    const roles = Object.entries(roleCounts)
      .filter(([, count]) => count > 0)
      .map(([role, count]) => `${role}:${count}`)
      .join(', ');

    return `[${roles}] Tools:[${tools}] Tokens:${Math.ceil(totalContent / 4)} - ${entries.length} messages condensed`;
  }

  /**
   * Create a CondensedSummary from child summaries
   */
  private createCondensedSummary(childIds: SummaryId[], level: number): CondensedSummary {
    const id = this.generateSummaryId(`cond_l${level}`);
    const childSummaries = childIds
      .map((cid) => this.summaries.get(cid))
      .filter((s): s is SummaryNode => s !== undefined);

    const summaryText = this.generateCondensedSummary(childSummaries);
    const tokenCount = this.estimateTokens(summaryText);

    const pointers: SummaryPointer[] = childIds.map((cid) => {
      const child = this.summaries.get(cid);
      return {
        type: 'summary',
        summaryId: cid,
        level: level - 1,
        timestamp: child?.createdAt || new Date().toISOString(),
      };
    });

    const condensedSummary: CondensedSummary = {
      id,
      type: 'condensed',
      summary: summaryText,
      pointers,
      level,
      createdAt: new Date().toISOString(),
      tokenCount,
      childCount: childIds.length,
    };

    this.summaries.set(id, condensedSummary);
    this.provenanceIndex.set(id, pointers);

    // Add to appropriate level
    const levelArray = this.levels.get(level) || [];
    levelArray.push(id);
    this.levels.set(level, levelArray);

    return condensedSummary;
  }

  /**
   * Generate summary text from child summaries
   */
  private generateCondensedSummary(children: SummaryNode[]): string {
    const leafCount = children.filter((c) => c.type === 'leaf').length;
    const condensedCount = children.filter((c) => c.type === 'condensed').length;
    const totalTokens = children.reduce((acc, c) => acc + c.tokenCount, 0);
    const totalMessages = children.reduce((acc, c) => acc + (c.type === 'leaf' ? c.messageCount : c.childCount), 0);

    return `[Level ${children[0]?.type === 'leaf' ? 1 : (children[0] as CondensedSummary).level + 1}] Leaves:${leafCount} Condensed:${condensedCount} TotalTokens:${totalTokens} Messages:${totalMessages}`;
  }

  /**
   * Group raw logs into leaf summaries
   */
  private buildLeafSummaries(): void {
    const preserved = this.rawLogs.slice(0, this.config.preserveRecentMessages);
    const toSummarize = this.rawLogs.slice(this.config.preserveRecentMessages);

    // Create leaf summaries from grouped entries
    const groupSize = this.config.maxLeafMessages;
    for (let i = 0; i < toSummarize.length; i += groupSize) {
      const group = toSummarize.slice(i, i + groupSize);
      const startIndex = this.config.preserveRecentMessages + i;
      this.createLeafSummary(group, startIndex);
    }

    // Preserve recent messages as ungrouped entries (they become implicit leaves)
    if (preserved.length > 0) {
      const id = this.generateSummaryId('recent');
      const pointers: MessagePointer[] = preserved.map((entry, idx) => ({
        type: 'message',
        messageId: this.generateMessageId(idx),
        index: idx,
        timestamp: entry.timestamp,
      }));

      const leafSummary: LeafSummary = {
        id,
        type: 'leaf',
        summary: `[RECENT] ${preserved.length} recent messages preserved`,
        pointers,
        createdAt: new Date().toISOString(),
        tokenCount: this.estimateTokens(preserved.map((e) => e.content).join('\n')),
        messageCount: preserved.length,
      };

      this.summaries.set(id, leafSummary);
      this.provenanceIndex.set(id, pointers);

      const level0 = this.levels.get(0) || [];
      level0.push(id);
      this.levels.set(0, level0);
    }
  }

  /**
   * Build condensed summaries recursively
   */
  private buildCondensedSummaries(): void {
    let currentLevel = 1;
    let currentIds = this.levels.get(currentLevel) || [];

    while (
      currentIds.length > 1 &&
      currentLevel < this.config.maxLevels
    ) {
      const childIds: SummaryId[] = [];
      const groupSize = this.config.maxCondensedChildren;

      for (let i = 0; i < currentIds.length; i += groupSize) {
        const group = currentIds.slice(i, i + groupSize);
        const condensed = this.createCondensedSummary(group, currentLevel + 1);
        childIds.push(condensed.id);
      }

      currentLevel++;
      currentIds = childIds;
    }
  }

  /**
   * Build the compact DAG from raw logs
   * @param rawLogs Array of raw log entries from session transcript
   * @returns DAGSummary with hierarchical summaries and provenance tracking
   */
  public buildCompactDAG(rawLogs: RawLogEntry[]): DAGSummary {
    // Reset state
    this.rawLogs = rawLogs;
    this.summaries = new Map();
    this.levels = new Map();
    this.provenanceIndex = new Map();

    // Build leaf summaries from raw logs
    this.buildLeafSummaries();

    // Build condensed summaries
    this.buildCondensedSummaries();

    // Find root summary (highest level)
    const maxLevel = Math.max(...Array.from(this.levels.keys()));
    const rootIds = this.levels.get(maxLevel) || [];
    const rootSummaryId = rootIds.length > 0 ? rootIds[0] : null;

    // Calculate total tokens
    const totalTokens = Array.from(this.summaries.values()).reduce(
      (acc, s) => acc + s.tokenCount,
      0
    );

    const state: DAGState = {
      summaries: this.summaries,
      latestSummaryId: rootSummaryId,
      levels: this.levels,
    };

    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      config: this.config,
      rawLogCount: rawLogs.length,
      totalTokens,
      state,
      rootSummaryId,
      provenanceIndex: this.provenanceIndex,
    };
  }

  /**
   * Expand a summary node to get original message pointers
   * @param summaryId ID of the summary to expand
   * @returns Array of DAGPointers to original messages
   */
  public expandSummary(summaryId: SummaryId): DAGPointer[] {
    return this.provenanceIndex.get(summaryId) || [];
  }

  /**
   * Get all original message IDs from a DAGSummary
   * @param dagSummary The DAG summary to trace
   * @returns Array of all original message IDs
   */
  public getAllProvenanceMessages(dagSummary: DAGSummary): MessageId[] {
    const messageIds: MessageId[] = [];

    for (const pointers of Array.from(dagSummary.provenanceIndex.values())) {
      for (const pointer of pointers) {
        if (pointer.type === 'message') {
          messageIds.push(pointer.messageId);
        } else if (pointer.type === 'summary') {
          // Recursively get messages from child summaries
          const childPointers = this.provenanceIndex.get(pointer.summaryId) || [];
          for (const childPointer of Array.from(childPointers)) {
            if (childPointer.type === 'message') {
              messageIds.push(childPointer.messageId);
            }
          }
        }
      }
    }

    return Array.from(new Set(messageIds));
  }

  /**
   * Get the root summary for reading
   * @param dagSummary The DAG summary
   * @returns The root summary node or null
   */
  public getRootSummary(dagSummary: DAGSummary): SummaryNode | null {
    if (!dagSummary.rootSummaryId) return null;
    return dagSummary.state.summaries.get(dagSummary.rootSummaryId) || null;
  }

  /**
   * Get summary by ID
   * @param summaryId ID of the summary
   * @returns The summary node or undefined
   */
  public getSummary(summaryId: SummaryId): SummaryNode | undefined {
    return this.summaries.get(summaryId);
  }

  /**
   * Get configuration
   */
  public getConfig(): DAGSummaryConfig {
    return { ...this.config };
  }
}

export default ContextDAGManager;
