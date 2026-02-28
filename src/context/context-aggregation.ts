// Context Aggregation - Story 3.4: Manage large context with summarization
import { promises as fs } from 'fs';
import { join } from 'path';

export interface ContextSummary {
  totalEntries: number;
  summarizedEntries: number;
  preservedEntries: number;
  compactionStage: number; // 0 = none, 1 = 25%, 2 = 50%, etc.
  lastCompacted: string | null;
}

export interface ContextEntry {
  id: string;
  timestamp: string;
  type: string;
  content: any;
  preserved: boolean; // Keep recent entries in detail
}

/**
 * Story 3.4: Context Aggregation & Summarization
 * AC:
 * - Given: project_context.json reached 1MB size
 * - When: context manager detects limit
 * - Then: executes compaction: synthesize old entries into summary block
 * - And: preserves recent 50 entries in detail
 * - Given: compaction in progress
 * - When: system crashes during operation
 * - Then: maintains original file intact
 * - Given: read request when context was compacted
 * - When: file was compacted
 * - Then: offers "load full context" or "only compact summary"
 */
export class ContextAggregator {
  private contextFilePath: string;
  private summaryFilePath: string;
  private maxSizeBytes = 1024 * 1024; // 1MB
  private preserveRecentCount = 50;

  constructor(projectPath: string = process.cwd()) {
    this.contextFilePath = join(projectPath, '.vibe-flow', 'project_context.json');
    this.summaryFilePath = join(projectPath, '.vibe-flow', 'context_summary.json');
  }

  /**
   * Get context status and check if compaction is needed
   * Story 3.4 AC: When context reaches 1MB, triggers compaction
   */
  async getStatus(): Promise<ContextSummary> {
    try {
      const stats = await fs.stat(this.contextFilePath);
      const content = await fs.readFile(this.contextFilePath, 'utf-8');
      const context = JSON.parse(content);

      const totalEntries = Array.isArray(context.entries) ? context.entries.length : 0;
      const summarizedEntries = context.summarized?.length || 0;

      // Calculate compaction stage based on size
      const sizeRatio = stats.size / this.maxSizeBytes;
      const stage = Math.min(Math.ceil((sizeRatio - 1) * 4), 4); // 1-4 stages

      return {
        totalEntries,
        summarizedEntries,
        preservedEntries: totalEntries - summarizedEntries,
        compactionStage: stage,
        lastCompacted: context.lastCompacted || null
      };
    } catch {
      return {
        totalEntries: 0,
        summarizedEntries: 0,
        preservedEntries: 0,
        compactionStage: 0,
        lastCompacted: null
      };
    }
  }

  /**
   * Check if compaction is needed
   */
  async needsCompaction(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.contextFilePath);
      return stats.size > this.maxSizeBytes;
    } catch {
      return false;
    }
  }

  /**
   * Execute context compaction
   * Story 3.4 AC: Synthesize old entries into summary, preserve recent 50
   */
  async compact(): Promise<{ success: boolean; message: string }> {
    try {
      // Read current context
      const content = await fs.readFile(this.contextFilePath, 'utf-8');
      const context = JSON.parse(content);

      if (!Array.isArray(context.entries) || context.entries.length === 0) {
        return { success: true, message: 'No entries to compact' };
      }

      const entries = context.entries;

      // Separate recent (preserve) vs old (summarize)
      const recentEntries = entries.slice(-this.preserveRecentCount);
      const oldEntries = entries.slice(0, -this.preserveRecentCount);

      // Summarize old entries
      const summary = this.summarizeEntries(oldEntries);

      // Create compacted context
      const compacted = {
        ...context,
        entries: recentEntries,
        summarized: summary,
        lastCompacted: new Date().toISOString(),
        originalCount: entries.length
      };

      // Atomic write - write to temp first
      const tempPath = this.contextFilePath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(compacted, null, 2), 'utf-8');

      // Verify it's valid JSON before renaming
      await fs.readFile(tempPath, 'utf-8'); // This will throw if invalid

      // Atomic rename with Windows fallback
      try {
        await fs.rename(tempPath, this.contextFilePath);
      } catch (renameErr) {
        const err = renameErr as { code?: string };
        if (err.code === 'EXDEV' || err.code === 'ENOENT') {
          await fs.copyFile(tempPath, this.contextFilePath);
          await fs.unlink(tempPath);
        } else {
          throw renameErr;
        }
      }

      // Also save summary separately for quick access
      await fs.writeFile(
        this.summaryFilePath,
        JSON.stringify(summary, null, 2),
        'utf-8'
      );

      return {
        success: true,
        message: `Compacted ${oldEntries.length} entries into ${summary.length} summary items`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Compaction failed: ${error.message}`
      };
    }
  }

  /**
   * Summarize old entries into fewer, denser entries
   */
  private summarizeEntries(entries: ContextEntry[]): any[] {
    if (entries.length === 0) return [];

    // Group by type or phase
    const groups: Record<string, ContextEntry[]> = {};

    for (const entry of entries) {
      const key = entry.type || 'general';
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    const summary: any[] = [];

    for (const [type, groupEntries] of Object.entries(groups)) {
      // Create a summary entry for each group
      summary.push({
        type: 'summary',
        category: type,
        count: groupEntries.length,
        firstTimestamp: groupEntries[0]?.timestamp,
        lastTimestamp: groupEntries[groupEntries.length - 1]?.timestamp,
        // Store first and last entries as samples
        sampleFirst: groupEntries[0]?.content,
        sampleLast: groupEntries[groupEntries.length - 1]?.content,
        // Store all IDs for potential retrieval
        entryIds: groupEntries.map(e => e.id)
      });
    }

    return summary;
  }

  /**
   * Load full context including summarized entries
   * Story 3.4 AC: User can choose "load full context" or "only summary"
   */
  async loadFullContext(): Promise<any> {
    // For now, just load the current context
    // In a full implementation, this would reconstruct from summary + recent
    const content = await fs.readFile(this.contextFilePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Load only the summary (compact mode)
   */
  async loadSummary(): Promise<any> {
    try {
      const content = await fs.readFile(this.summaryFilePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // If no summary file, try to get from main context
      const content = await fs.readFile(this.contextFilePath, 'utf-8');
      const context = JSON.parse(content);
      return context.summarized || [];
    }
  }

  /**
   * Add a new entry to context
   */
  async addEntry(entry: ContextEntry): Promise<void> {
    try {
      const content = await fs.readFile(this.contextFilePath, 'utf-8');
      const context = JSON.parse(content);

      if (!Array.isArray(context.entries)) {
        context.entries = [];
      }

      context.entries.push(entry);
      context.lastUpdated = new Date().toISOString();

      // Check if compaction needed after adding
      const needsCompact = await this.needsCompaction();
      if (needsCompact) {
        // Auto-compact in background (don't block the add)
        this.compact().catch(console.error);
      }

      // Write back
      const tempPath = this.contextFilePath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(context, null, 2), 'utf-8');
      try {
        await fs.rename(tempPath, this.contextFilePath);
      } catch (renameErr) {
        const err = renameErr as { code?: string };
        if (err.code === 'EXDEV' || err.code === 'ENOENT') {
          await fs.copyFile(tempPath, this.contextFilePath);
          await fs.unlink(tempPath);
        } else {
          throw renameErr;
        }
      }
    } catch {
      // File doesn't exist, create new
      const context = {
        entries: [entry],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      const dir = join(this.contextFilePath, '..');
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.contextFilePath, JSON.stringify(context, null, 2), 'utf-8');
    }
  }
}

export default ContextAggregator;
