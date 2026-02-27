/**
 * TDD Context Pruner
 *
 * Based on LOCA-bench findings: long and repetitive contexts degrade agent performance.
 * This pruner compresses TDD iteration history to keep context within token limits
 * while preserving the most relevant information for the agent.
 */

export interface TDDHistory {
  iteration: number;
  phase: 'RED' | 'GREEN' | 'REFACTOR';
  testCode?: string;
  implementationCode?: string;
  errorLog?: string;
  testErrors?: string[];
  failureSummary?: string;
  timestamp: number;
}

export interface PrunedIteration {
  iteration: number;
  phase: 'RED' | 'GREEN' | 'REFACTOR';
  type: 'full' | 'summary' | 'pointer';
  content: string;
  tokenCount: number;
}

export interface PruneResult {
  prunedHistory: PrunedIteration[];
  totalTokens: number;
  originalTokens: number;
  compressionRatio: number;
  removedIterations: number;
}

export interface PrunerConfig {
  maxTokens: number;
  keepRecentCount: number;
  summarizationThreshold: number;
  maxSummaryLength: number;
}

/**
 * Default configuration for the pruner
 */
export const DEFAULT_CONFIG: PrunerConfig = {
  maxTokens: 8000,
  keepRecentCount: 3,
  summarizationThreshold: 3,
  maxSummaryLength: 200,
};

/**
 * Estimates token count for a given string.
 * Uses a simple approximation: ~4 characters per token.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Extracts key error information from error logs
 */
function extractErrorPointer(errorLog: string, iteration: number): string {
  if (!errorLog) return `Iteration ${iteration}: No error details`;

  const lines = errorLog.split('\n').filter(line => line.trim());

  // Try to extract error type and location
  const errorMatch = errorLog.match(/(Error|Exception):\s*(.+?)(?:\n|$)/i);
  const lineMatch = errorLog.match(/:(\d+):\d+/);
  const atMatch = errorLog.match(/at\s+(.+?)(?:\n|$)/);

  const errorType = errorMatch?.[2] || 'UnknownError';
  const lineNum = lineMatch?.[1] || '?';
  const location = atMatch?.[1] || 'unknown';

  return `Iter ${iteration}: ${errorType} at ${location}:${lineNum}`;
}

/**
 * Creates a summary from old iteration data
 */
function createIterationSummary(history: TDDHistory): string {
  const parts: string[] = [];

  parts.push(`[Iter ${history.iteration}] ${history.phase}`);

  if (history.failureSummary) {
    parts.push(history.failureSummary);
  } else if (history.errorLog) {
    // Extract first meaningful error line
    const errorLines = history.errorLog.split('\n')
      .filter(line => line.includes('Error') || line.includes('error') || line.includes('Expected'));
    if (errorLines.length > 0) {
      parts.push(errorLines[0].trim().slice(0, 150));
    }
  }

  if (history.testErrors && history.testErrors.length > 0) {
    parts.push(`Errors: ${history.testErrors.slice(0, 3).join('; ')}`);
  }

  return parts.join(' | ');
}

/**
 * TDDContextPruner
 *
 * Compresses TDD iteration history to protect agent context from degradation
 * caused by long and repetitive contexts (per LOCA-bench findings).
 */
export class TDDContextPruner {
  private config: PrunerConfig;

  constructor(config: Partial<PrunerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Prunes TDD iteration history to fit within token limit.
   *
   * Strategy:
   * 1. Keep most recent iterations (keepRecentCount) as full diffs
   * 2. Summarize iterations beyond threshold as short summaries
   * 3. Convert very old iterations (>summarizationThreshold) to error pointers
   * 4. If still over limit, apply sliding window compression
   *
   * @param history - Array of TDD iteration attempts
   * @returns Pruned history within token limit
   */
  pruneIterationHistory(history: TDDHistory[]): PruneResult {
    if (!history || history.length === 0) {
      return {
        prunedHistory: [],
        totalTokens: 0,
        originalTokens: 0,
        compressionRatio: 1,
        removedIterations: 0,
      };
    }

    // Sort by iteration (should already be sorted, but ensure)
    const sorted = [...history].sort((a, b) => a.iteration - b.iteration);

    const originalTokens = this.calculateTotalTokens(sorted);
    const pruned: PrunedIteration[] = [];

    // First pass: categorize iterations
    for (const item of sorted) {
      const iterationAge = sorted.length - item.iteration;

      if (iterationAge < this.config.keepRecentCount) {
        // Keep recent iterations as full content
        const content = this.buildFullContent(item);
        pruned.push({
          iteration: item.iteration,
          phase: item.phase,
          type: 'full',
          content,
          tokenCount: estimateTokens(content),
        });
      } else if (iterationAge < this.config.summarizationThreshold) {
        // Summarize middle iterations
        const summary = createIterationSummary(item);
        const truncated = summary.slice(0, this.config.maxSummaryLength);
        pruned.push({
          iteration: item.iteration,
          phase: item.phase,
          type: 'summary',
          content: truncated,
          tokenCount: estimateTokens(truncated),
        });
      } else {
        // Very old iterations become pointers
        const pointer = item.errorLog
          ? extractErrorPointer(item.errorLog, item.iteration)
          : `Iteration ${item.iteration}: ${item.phase} phase - ${item.failureSummary || 'completed'}`;
        pruned.push({
          iteration: item.iteration,
          phase: item.phase,
          type: 'pointer',
          content: pointer,
          tokenCount: estimateTokens(pointer),
        });
      }
    }

    // Second pass: apply sliding window if over token limit
    let totalTokens = pruned.reduce((sum, p) => sum + p.tokenCount, 0);

    if (totalTokens > this.config.maxTokens) {
      const compressed = this.applySlidingWindowCompression(pruned);
      return {
        prunedHistory: compressed.history,
        totalTokens: compressed.tokens,
        originalTokens,
        compressionRatio: compressed.tokens / originalTokens,
        removedIterations: history.length - compressed.history.length,
      };
    }

    return {
      prunedHistory: pruned,
      totalTokens,
      originalTokens,
      compressionRatio: totalTokens / originalTokens,
      removedIterations: 0,
    };
  }

  /**
   * Builds full content string from TDD history item
   */
  private buildFullContent(item: TDDHistory): string {
    const parts: string[] = [];

    parts.push(`=== Iteration ${item.iteration} (${item.phase}) ===`);

    if (item.testCode) {
      parts.push(`--- Test Code ---\n${item.testCode}`);
    }

    if (item.implementationCode) {
      parts.push(`--- Implementation ---\n${item.implementationCode}`);
    }

    if (item.errorLog) {
      parts.push(`--- Error Log ---\n${item.errorLog}`);
    }

    if (item.testErrors && item.testErrors.length > 0) {
      parts.push(`--- Test Errors ---\n${item.testErrors.join('\n')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Calculates total estimated tokens for history
   */
  private calculateTotalTokens(history: TDDHistory[]): number {
    return history.reduce((sum, item) => {
      let content = '';
      if (item.testCode) content += item.testCode + '\n';
      if (item.implementationCode) content += item.implementationCode + '\n';
      if (item.errorLog) content += item.errorLog + '\n';
      if (item.testErrors) content += item.testErrors.join('\n') + '\n';
      return sum + estimateTokens(content);
    }, 0);
  }

  /**
   * Applies sliding window compression when token limit exceeded
   */
  private applySlidingWindowCompression(
    pruned: PrunedIteration[]
  ): { history: PrunedIteration[]; tokens: number } {
    // Start from most recent and work backwards
    const result: PrunedIteration[] = [];
    let tokens = 0;

    for (let i = pruned.length - 1; i >= 0; i--) {
      const item = pruned[i];

      if (tokens + item.tokenCount <= this.config.maxTokens) {
        result.unshift(item);
        tokens += item.tokenCount;
      } else if (item.type === 'full') {
        // Convert full to summary if needed
        const summary = createIterationSummary({
          iteration: item.iteration,
          phase: item.phase,
          timestamp: 0,
          failureSummary: item.content.slice(0, 100),
        });
        const summaryTokenCount = estimateTokens(summary);
        if (tokens + summaryTokenCount <= this.config.maxTokens) {
          result.unshift({
            ...item,
            type: 'summary',
            content: summary,
            tokenCount: summaryTokenCount,
          });
          tokens += summaryTokenCount;
        }
      }
      // Skip older items if still over limit
    }

    return { history: result, tokens };
  }

  /**
   * Gets the configuration being used
   */
  getConfig(): PrunerConfig {
    return { ...this.config };
  }

  /**
   * Updates configuration
   */
  setConfig(config: Partial<PrunerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
