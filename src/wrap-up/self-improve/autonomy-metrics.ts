/**
 * Autonomy Metrics Module
 *
 * Tracks and calculates agent autonomy metrics based on diff acceptance rates.
 */

export interface DiffLine {
  readonly lineNumber: number;
  readonly content: string;
  readonly added: boolean;
  readonly removed: boolean;
}

export interface Diff {
  readonly filePath: string;
  readonly lines: DiffLine[];
  readonly totalAdded: number;
  readonly totalRemoved: number;
}

export interface HumanEdit {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly originalContent: string;
  readonly newContent: string;
  readonly timestamp: number;
}

export interface AcceptanceMetrics {
  readonly totalAIGeneratedLines: number;
  readonly acceptedLines: number;
  readonly modifiedLines: number;
  readonly acceptanceRate: number;
  readonly filesProcessed: number;
}

export interface TelemetrySummary {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly metrics: AcceptanceMetrics;
  readonly autonomyLevel: 'high' | 'medium' | 'low';
  readonly recommendation: string;
}

/**
 * Tracks autonomy metrics by comparing AI-generated diffs with human edits.
 * Calculates the acceptance rate of AI-generated code.
 */
export class AutonomyMetricsTracker {
  private sessionId: string;
  private diffs: Diff[] = [];
  private humanEdits: HumanEdit[] = [];
  private metrics: AcceptanceMetrics | null = null;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Record AI-generated diffs for analysis
   */
  addDiffs(diffs: Diff[]): void {
    this.diffs.push(...diffs);
  }

  /**
   * Record human edits for comparison
   */
  addHumanEdits(edits: HumanEdit[]): void {
    this.humanEdits.push(...edits);
  }

  /**
   * Calculate the acceptance rate of AI-generated lines.
   * Returns percentage (0-100) of AI-generated lines that remained unchanged.
   */
  calculateAcceptanceRate(diffs: Diff[], humanEdits: HumanEdit[]): number {
    if (diffs.length === 0) {
      return 100; // No AI output = 100% acceptance (trivially)
    }

    // Build a map of modified line ranges per file
    const modifiedRanges = new Map<string, Array<{ start: number; end: number }>>();

    for (const edit of humanEdits) {
      const ranges = modifiedRanges.get(edit.filePath) || [];
      ranges.push({ start: edit.startLine, end: edit.endLine });
      modifiedRanges.set(edit.filePath, ranges);
    }

    // Count AI-generated lines
    let totalAIGeneratedLines = 0;
    let acceptedLines = 0;

    for (const diff of diffs) {
      const filePath = diff.filePath;
      const fileRanges = modifiedRanges.get(filePath);

      for (const line of diff.lines) {
        if (line.added) {
          totalAIGeneratedLines++;

          // Check if this line was modified by human
          const wasModified = this.isLineModified(
            line.lineNumber,
            fileRanges
          );

          if (!wasModified) {
            acceptedLines++;
          }
        }
      }
    }

    // Calculate acceptance rate
    const acceptanceRate =
      totalAIGeneratedLines > 0
        ? Math.round((acceptedLines / totalAIGeneratedLines) * 100)
        : 100;

    // Store metrics
    this.metrics = {
      totalAIGeneratedLines,
      acceptedLines,
      modifiedLines: totalAIGeneratedLines - acceptedLines,
      acceptanceRate,
      filesProcessed: new Set(diffs.map((d) => d.filePath)).size,
    };

    return acceptanceRate;
  }

  /**
   * Check if a line number falls within any modified range
   */
  private isLineModified(
    lineNumber: number,
    ranges: Array<{ start: number; end: number }> | undefined
  ): boolean {
    if (!ranges || ranges.length === 0) {
      return false;
    }

    for (const range of ranges) {
      if (lineNumber >= range.start && lineNumber <= range.end) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a telemetry summary report
   */
  generateTelemetrySummary(): TelemetrySummary {
    const metrics = this.metrics || {
      totalAIGeneratedLines: 0,
      acceptedLines: 0,
      modifiedLines: 0,
      acceptanceRate: 100,
      filesProcessed: 0,
    };

    let autonomyLevel: 'high' | 'medium' | 'low';
    let recommendation: string;

    if (metrics.acceptanceRate >= 80) {
      autonomyLevel = 'high';
      recommendation =
        'Excellent autonomy. Consider expanding agent capabilities.';
    } else if (metrics.acceptanceRate >= 50) {
      autonomyLevel = 'medium';
      recommendation =
        'Moderate acceptance. Review human edits to identify improvement areas.';
    } else {
      autonomyLevel = 'low';
      recommendation =
        'Low acceptance rate. Consider refining prompt engineering or agent instructions.';
    }

    return {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      metrics,
      autonomyLevel,
      recommendation,
    };
  }

  /**
   * Get the current metrics
   */
  getMetrics(): AcceptanceMetrics | null {
    return this.metrics;
  }

  /**
   * Reset the tracker for a new session
   */
  reset(): void {
    this.diffs = [];
    this.humanEdits = [];
    this.metrics = null;
    this.sessionId = this.generateSessionId();
  }
}
