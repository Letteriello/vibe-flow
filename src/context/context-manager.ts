// Context Manager - Orchestrates context handling with compaction
// Exposes getOptimizedContext() method for lean context retrieval

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  compactContext,
  expandContext,
  needsCompaction,
  getContextStatus,
  CompactionConfig,
  CompactionResult,
  CompactedMessage
} from './compaction.js';

/**
 * Context Manager configuration
 */
export interface ContextManagerConfig {
  maxTokens: number;
  compactionThreshold: number;
  preserveRecentMessages: number;
  autoCompact: boolean;
  backgroundCompaction: boolean;
  projectPath: string;
}

/**
 * Optimized context result
 */
export interface OptimizedContextResult {
  messages: unknown[];
  status: {
    tokenCount: number;
    messageCount: number;
    wasCompacted: boolean;
    reductionPercentage: number;
    lastCompacted: string | null;
  };
  compactionResult?: CompactionResult;
}

/**
 * Context Manager State
 */
interface ContextManagerState {
  messages: unknown[];
  compactedMessages: CompactedMessage[] | null;
  lastCompacted: string | null;
  isCompacting: boolean;
}

/**
 * Context Manager - Manages session context with hierarchical compaction
 *
 * Features:
 * - Monitors context size in real-time
 * - Automatic compaction when threshold is reached
 * - Background compaction support
 * - getOptimizedContext() returns lean state and triggers background summarization
 */
export class ContextManager extends EventEmitter {
  private config: ContextManagerConfig;
  private state: ContextManagerState;
  private compactionInProgress: boolean = false;
  private pendingCompaction: boolean = false;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    super();

    this.config = {
      maxTokens: config.maxTokens ?? 80000,
      compactionThreshold: config.compactionThreshold ?? 0.8,
      preserveRecentMessages: config.preserveRecentMessages ?? 20,
      autoCompact: config.autoCompact ?? true,
      backgroundCompaction: config.backgroundCompaction ?? true,
      projectPath: config.projectPath ?? process.cwd()
    };

    this.state = {
      messages: [],
      compactedMessages: null,
      lastCompacted: null,
      isCompacting: false
    };
  }

  /**
   * Add messages to context
   */
  addMessages(messages: unknown[]): void {
    this.state.messages.push(...messages);

    // Check if compaction is needed
    if (this.config.autoCompact && needsCompaction(this.state.messages, this.config)) {
      if (this.config.backgroundCompaction) {
        this.scheduleCompaction();
      } else {
        this.triggerCompaction();
      }
    }
  }

  /**
   * Get current messages
   */
  getMessages(): unknown[] {
    return [...this.state.messages];
  }

  /**
   * Get context status without compaction
   */
  getStatus(): {
    tokenCount: number;
    messageCount: number;
    needsCompaction: boolean;
    lastCompacted: string | null;
    isCompacting: boolean;
  } {
    const status = getContextStatus(this.state.messages, this.config);

    return {
      tokenCount: status.tokenCount,
      messageCount: status.messageCount,
      needsCompaction: status.needsCompaction,
      lastCompacted: this.state.lastCompacted,
      isCompacting: this.compactionInProgress
    };
  }

  /**
   * Get optimized context - returns lean state and triggers background summarization
   *
   * This is the main method requested - returns:
   * - Compacted/optimized messages for immediate use
   * - Status information about the context
   * - Optionally triggers background compaction
   */
  async getOptimizedContext(): Promise<OptimizedContextResult> {
    const tokenCount = getContextStatus(this.state.messages, this.config).tokenCount;
    const threshold = this.config.maxTokens * this.config.compactionThreshold;

    // If already compacted, return the compacted version
    if (this.state.compactedMessages) {
      return {
        messages: this.state.compactedMessages,
        status: {
          tokenCount: this.getCompactedTokenCount(),
          messageCount: this.state.compactedMessages.length,
          wasCompacted: true,
          reductionPercentage: this.calculateReduction(),
          lastCompacted: this.state.lastCompacted
        }
      };
    }

    // If under threshold, return current messages
    if (tokenCount < threshold) {
      return {
        messages: this.state.messages,
        status: {
          tokenCount,
          messageCount: this.state.messages.length,
          wasCompacted: false,
          reductionPercentage: 0,
          lastCompacted: null
        }
      };
    }

    // Threshold exceeded - need compaction
    const compactionResult = await this.performCompaction();

    if (compactionResult.success) {
      return {
        messages: this.state.compactedMessages || this.state.messages,
        status: {
          tokenCount: compactionResult.compactedTokenCount,
          messageCount: compactionResult.messagesPreserved,
          wasCompacted: true,
          reductionPercentage: compactionResult.reductionPercentage,
          lastCompacted: this.state.lastCompacted
        },
        compactionResult
      };
    }

    // Compaction failed, return original
    return {
      messages: this.state.messages,
      status: {
        tokenCount,
        messageCount: this.state.messages.length,
        wasCompacted: false,
        reductionPercentage: 0,
        lastCompacted: null
      },
      compactionResult
    };
  }

  /**
   * Get optimized context synchronously (no compaction)
   */
  getOptimizedContextSync(): OptimizedContextResult {
    const status = getContextStatus(this.state.messages, this.config);

    return {
      messages: this.state.compactedMessages || this.state.messages,
      status: {
        tokenCount: status.tokenCount,
        messageCount: (this.state.compactedMessages || this.state.messages).length,
        wasCompacted: this.state.compactedMessages !== null,
        reductionPercentage: this.state.compactedMessages ? this.calculateReduction() : 0,
        lastCompacted: this.state.lastCompacted
      }
    };
  }

  /**
   * Force compaction immediately
   */
  async forceCompaction(): Promise<CompactionResult> {
    return this.performCompaction();
  }

  /**
   * Expand compacted context back to full
   */
  async expandContext(): Promise<unknown[]> {
    if (!this.state.compactedMessages) {
      return this.state.messages;
    }

    const expanded = await expandContext(this.state.compactedMessages);
    this.state.messages = expanded;
    this.state.compactedMessages = null;
    this.state.lastCompacted = null;

    return expanded;
  }

  /**
   * Clear all context
   */
  clear(): void {
    this.state.messages = [];
    this.state.compactedMessages = null;
    this.state.lastCompacted = null;
    this.compactionInProgress = false;
    this.pendingCompaction = false;
  }

  /**
   * Schedule compaction to run in background
   */
  private scheduleCompaction(): void {
    if (this.compactionInProgress) {
      this.pendingCompaction = true;
      return;
    }

    // Schedule for next tick (non-blocking)
    setImmediate(() => {
      this.triggerCompaction();
    });
  }

  /**
   * Trigger compaction
   */
  private triggerCompaction(): void {
    if (this.compactionInProgress) {
      return;
    }

    this.performCompaction().catch((err) => {
      this.emit('error', err);
    });
  }

  /**
   * Perform the actual compaction
   */
  private async performCompaction(): Promise<CompactionResult> {
    if (this.compactionInProgress) {
      return {
        success: false,
        originalTokenCount: 0,
        compactedTokenCount: 0,
        messagesCompacted: 0,
        messagesPreserved: 0,
        reductionPercentage: 0,
        pointersCreated: [],
        summary: 'Compaction already in progress'
      };
    }

    this.compactionInProgress = true;
    this.emit('compaction-start');

    try {
      const compactionConfig: Partial<CompactionConfig> = {
        maxTokens: this.config.maxTokens,
        compactionThreshold: this.config.compactionThreshold,
        preserveRecentMessages: this.config.preserveRecentMessages,
        storageDir: join(this.config.projectPath, '.vibe-flow', 'context-archives')
      };

      const result = await compactContext(
        this.state.messages,
        compactionConfig,
        this.config.projectPath
      );

      if (result.success) {
        // Update state with compacted messages
        this.state.compactedMessages = result.pointersCreated.map((filePath, index) => ({
          role: 'system',
          content: {
            type: 'pointer',
            pointerId: `archive_${index}`,
            filePath,
            originalIndex: index,
            messageCount: Math.ceil(this.state.messages.length / 10),
            timestamp: new Date().toISOString()
          } as any,
          timestamp: new Date().toISOString(),
          compacted: true,
          summary: result.summary
        }));

        // Add preserved messages
        const preserveCount = Math.min(
          this.config.preserveRecentMessages,
          this.state.messages.length
        );
        const preserved = this.state.messages.slice(-preserveCount);

        this.state.compactedMessages.push(...preserved.map(msg => ({
          role: (msg as any).role || 'user',
          content: (msg as any).content,
          timestamp: (msg as any).timestamp || new Date().toISOString(),
          compacted: false
        })));

        this.state.lastCompacted = new Date().toISOString();

        // Persist compaction state
        await this.persistCompactionState();

        this.emit('compaction-complete', result);
      }

      return result;
    } catch (error: any) {
      this.emit('error', error);
      return {
        success: false,
        originalTokenCount: 0,
        compactedTokenCount: 0,
        messagesCompacted: 0,
        messagesPreserved: 0,
        reductionPercentage: 0,
        pointersCreated: [],
        summary: `Compaction failed: ${error.message}`
      };
    } finally {
      this.compactionInProgress = false;

      // Check if another compaction was pending
      if (this.pendingCompaction) {
        this.pendingCompaction = false;
        this.scheduleCompaction();
      }
    }
  }

  /**
   * Get token count of compacted messages
   */
  private getCompactedTokenCount(): number {
    if (!this.state.compactedMessages) return 0;

    return this.state.compactedMessages.reduce((total, msg) => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      return total + Math.ceil(content.length / 4);
    }, 0);
  }

  /**
   * Calculate reduction percentage
   */
  private calculateReduction(): number {
    const original = getContextStatus(this.state.messages, this.config).tokenCount;
    const compacted = this.getCompactedTokenCount();

    if (original === 0) return 0;
    return Math.round(((original - compacted) / original) * 100);
  }

  /**
   * Persist compaction state to disk
   */
  private async persistCompactionState(): Promise<void> {
    const stateFile = join(
      this.config.projectPath,
      '.vibe-flow',
      'compaction-state.json'
    );

    const state = {
      lastCompacted: this.state.lastCompacted,
      originalMessageCount: this.state.messages.length,
      compactedMessageCount: this.state.compactedMessages?.length || 0
    };

    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Load compaction state from disk
   */
  async loadState(): Promise<void> {
    try {
      const stateFile = join(
        this.config.projectPath,
        '.vibe-flow',
        'compaction-state.json'
      );

      const content = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(content);

      this.state.lastCompacted = state.lastCompacted || null;
    } catch {
      // No state file exists yet
    }
  }
}

/**
 * Create a ContextManager instance with defaults
 */
export function createContextManager(config?: Partial<ContextManagerConfig>): ContextManager {
  return new ContextManager(config);
}

export default ContextManager;
