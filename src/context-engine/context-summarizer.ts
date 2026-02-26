// Context Summarizer - Story 9.5: Summarize context when it gets too large
// Story 9.6: Intelligent Sliding Window for BMAD preservation
// AC: Dado contexto atinge tamanho limite, Quando summarization executa,
//     Então gera resumo das seções mais antigas, E mantém detalhes das seções recentes,
//     E permite expandir sob demanda, E mantém índice para navegação
//     E preserva decisões BMAD, E resume agressivamente logs/bash/erros

import { ContextEntry, Summary, ContextEntryType, SlidingWindowConfig, EntryPriority } from './types.js';
import { ContextCategorizer } from './context-categorizer.js';

const DEFAULT_COMPRESSION_RATIO = 0.3; // Keep 30% of content when summarizing

/**
 * Story 9.5: Context Summarization
 * Story 9.6: Intelligent Sliding Window
 *
 * Provides context summarization when it gets too large:
 * - Generates summaries of older sections
 * - Keeps details of recent sections
 * - Allows expansion on demand
 * - Maintains index for navigation
 * - PRESERVES BMAD decisions (never summarize)
 * - Aggressively summarizes bash logs and errors
 */
export class ContextSummarizer {
  private maxEntries: number;
  private compressionRatio: number;
  private config: SlidingWindowConfig;

  // Default sliding window config
  private static readonly DEFAULT_CONFIG: SlidingWindowConfig = {
    maxTotalTokens: 100000,  // ~400k chars
    maxEntries: 100,
    keepRecentByType: {
      bmad: 50,       // Keep many BMAD entries
      decision: 30,  // Keep recent decisions
      artifact: 20,
      code: 15,
      userInput: 20,
      file: 10,
      bash: 5,        // Only keep recent bash
      error: 5,       // Only keep recent errors
      summary: 10
    },
    compressionRatios: {
      bmad: 1.0,      // Never compress
      decision: 0.8,
      artifact: 0.7,
      code: 0.5,
      userInput: 0.6,
      file: 0.4,
      bash: 0.15,     // Aggressive
      error: 0.2,    // Keep error type but compress
      summary: 1.0
    },
    neverSummarizeTypes: ['bmad', 'decision']
  };

  constructor(
    maxEntries: number = 100,
    compressionRatio: number = DEFAULT_COMPRESSION_RATIO,
    config?: Partial<SlidingWindowConfig>
  ) {
    this.maxEntries = maxEntries;
    this.compressionRatio = compressionRatio;
    this.config = { ...ContextSummarizer.DEFAULT_CONFIG, ...config };
  }

  /**
   * Get entry priority for sorting
   */
  private getEntryPriority(entry: ContextEntry): { priority: number; timestamp: number } {
    const type = entry.type as ContextEntryType;
    const priority = ContextCategorizer.getPriority(type, entry.metadata);

    // Higher priority = smaller sort value (comes first)
    // For same priority, newer entries come first
    return {
      priority: -priority,  // Negate so higher priority sorts first
      timestamp: -new Date(entry.createdAt).getTime()
    };
  }

  /**
   * Check if entry is BMAD-related and should never be summarized
   */
  private isCriticalEntry(entry: ContextEntry): boolean {
    const type = entry.type as ContextEntryType;
    return type === 'bmad' || ContextCategorizer.shouldSummarize(type, this.config) === false;
  }

  /**
   * Determine if summarization is needed based on tokens
   */
  needsSummarization(entries: ContextEntry[]): boolean {
    const totalTokens = entries.reduce((sum, e) =>
      sum + (e.tokens ?? ContextCategorizer.estimateTokens(e.content)), 0
    );
    return totalTokens > this.config.maxTotalTokens || entries.length > this.maxEntries;
  }

  /**
   * Intelligent sliding window summarization
   * Preserves BMAD decisions, summarizes bash/error aggressively
   */
  summarize(entries: ContextEntry[], keepRecent: number = 20): {
    summarized: Summary[];
    recentEntries: ContextEntry[];
    criticalEntries: ContextEntry[];  // BMAD and critical - never summarized
  } {
    if (!this.needsSummarization(entries)) {
      return {
        summarized: [],
        recentEntries: entries,
        criticalEntries: []
      };
    }

    // Separate critical entries (BMAD, decisions) from summarizable ones
    const criticalEntries: ContextEntry[] = [];
    const summarizableEntries: ContextEntry[] = [];

    for (const entry of entries) {
      if (this.isCriticalEntry(entry)) {
        criticalEntries.push(entry);
      } else {
        summarizableEntries.push(entry);
      }
    }

    // Sort summarizable by priority (higher priority = newer/more important)
    summarizableEntries.sort((a, b) => {
      const pa = this.getEntryPriority(a);
      const pb = this.getEntryPriority(b);
      return pa.priority - pb.priority || pa.timestamp - pb.timestamp;
    });

    // Apply sliding window per type
    const recentByType: ContextEntry[] = [];
    const toSummarize: ContextEntry[] = [];

    // Process each type separately
    const types = Object.keys(this.config.keepRecentByType) as ContextEntryType[];
    for (const type of types) {
      const typeEntries = summarizableEntries.filter(e => e.type === type);
      const keepCount = this.config.keepRecentByType[type] ?? 5;

      // Keep recent N entries of this type
      const recent = typeEntries.slice(-keepCount);
      const older = typeEntries.slice(0, -keepCount);

      recentByType.push(...recent);
      toSummarize.push(...older);
    }

    // Generate summaries for older entries, grouped by type
    const summaries: Summary[] = [];
    if (toSummarize.length > 0) {
      const summaryContent = this.generateSummary(toSummarize);
      const compressedContent = this.compressContentWithConfig(summaryContent, 'bash'); // Use most aggressive

      summaries.push({
        id: `summary-${Date.now()}`,
        projectId: entries[0]?.metadata?.projectId || 'unknown',
        content: compressedContent,
        sections: this.extractSections(summaryContent),
        originalEntries: toSummarize.map(e => e.id),
        compressionRatio: compressedContent.length / Math.max(summaryContent.length, 1),
        createdAt: new Date().toISOString()
      });
    }

    // Combine: critical + recent by type
    const recentEntries = [...criticalEntries, ...recentByType]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      summarized: summaries,
      recentEntries,
      criticalEntries
    };
  }

  /**
   * Legacy summarize method for backward compatibility
   */
  summarizeLegacy(entries: ContextEntry[], keepRecent: number = 20): {
    summarized: Summary;
    recentEntries: ContextEntry[];
  } {
    const result = this.summarize(entries, keepRecent);
    return {
      summarized: result.summarized[0] ?? this.createEmptySummary(entries),
      recentEntries: result.recentEntries
    };
  }

  /**
   * Create empty summary
   */
  private createEmptySummary(entries: ContextEntry[]): Summary {
    return {
      id: `summary-${Date.now()}`,
      projectId: entries[0]?.metadata?.projectId || 'unknown',
      content: '',
      sections: [],
      originalEntries: [],
      compressionRatio: 1,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Generate summary from entries
   */
  private generateSummary(entries: ContextEntry[]): string {
    const sections: Record<string, string[]> = {};

    // Group by type
    for (const entry of entries) {
      if (!sections[entry.type]) {
        sections[entry.type] = [];
      }

      // Extract key information from each entry
      const keyPoints = this.extractKeyPoints(entry.content);
      sections[entry.type].push(...keyPoints);
    }

    // Generate summary text
    let summary = '# Context Summary\n\n';

    for (const [type, points] of Object.entries(sections)) {
      summary += `## ${type}\n`;
      for (const point of points.slice(0, 5)) { // Keep top 5 per type
        summary += `- ${point}\n`;
      }
      summary += '\n';
    }

    return summary;
  }

  /**
   * Extract key points from content
   */
  private extractKeyPoints(content: string): string[] {
    const points: string[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    // Take first few meaningful lines as key points
    for (const line of lines.slice(0, 3)) {
      if (line.length > 10 && line.length < 200) {
        points.push(line.trim());
      }
    }

    return points;
  }

  /**
   * Compress content with type-specific ratio
   */
  private compressContentWithConfig(content: string, type: ContextEntryType): string {
    const ratio = this.config.compressionRatios[type] ?? this.compressionRatio;
    const maxLength = Math.floor(content.length * ratio);

    if (ratio >= 1.0) return content; // No compression needed

    const lines = content.split('\n');
    const compressed: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      if (currentLength >= maxLength) continue;

      // Truncate long lines proportionally
      const maxLineLength = Math.floor(maxLength / lines.length);
      let processedLine = line;

      if (line.length > maxLineLength) {
        processedLine = line.substring(0, maxLineLength - 3) + '...';
      }

      compressed.push(processedLine);
      currentLength += processedLine.length;
    }

    const result = compressed.join('\n');

    // Add summary note if truncated
    if (result.length < content.length * ratio * 0.9) {
      return result + `\n\n[${type} entries summarized: ${content.length} → ${result.length} chars]`;
    }

    return result;
  }

  /**
   * Compress content (legacy)
   */
  private compressContent(content: string): string {
    const lines = content.split('\n');
    const compressed: string[] = [];

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Skip very long lines
      if (line.length > 500) {
        compressed.push(line.substring(0, 500) + '...');
        continue;
      }

      compressed.push(line);
    }

    // If still too long, truncate
    const result = compressed.join('\n');
    if (result.length > 5000) {
      return result.substring(0, 5000) + '\n...[truncated]';
    }

    return result;
  }

  /**
   * Extract sections from content
   */
  private extractSections(content: string): string[] {
    const sections: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('## ')) {
        sections.push(line.replace('## ', '').trim());
      }
    }

    return sections;
  }

  /**
   * Expand a summary back to full content
   */
  async expandSummary(
    summary: Summary,
    originalEntries: Map<string, ContextEntry>
  ): Promise<ContextEntry[]> {
    const entries: ContextEntry[] = [];

    for (const id of summary.originalEntries) {
      const entry = originalEntries.get(id);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Get summary statistics
   */
  getStatistics(entries: ContextEntry[]): {
    totalEntries: number;
    wouldSummarize: boolean;
    estimatedCompression: number;
    entriesToKeep: number;
    entriesToSummarize: number;
  } {
    const wouldSummarize = this.needsSummarization(entries);
    const entriesToSummarize = wouldSummarize ? entries.length - 20 : 0;

    return {
      totalEntries: entries.length,
      wouldSummarize,
      estimatedCompression: this.compressionRatio,
      entriesToKeep: Math.min(20, entries.length),
      entriesToSummarize
    };
  }
}

/**
 * Convenience function to summarize context
 */
export function summarizeContext(
  entries: ContextEntry[],
  maxEntries: number = 100
): { summarized: Summary[]; recentEntries: ContextEntry[]; criticalEntries: ContextEntry[] } {
  const summarizer = new ContextSummarizer(maxEntries);
  return summarizer.summarize(entries);
}

/**
 * Convenience function to check if summarization is needed
 */
export function needsSummarization(
  entries: ContextEntry[],
  maxEntries: number = 100
): boolean {
  return entries.length > maxEntries;
}
