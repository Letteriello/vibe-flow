// Decision History Logger - Story 9.4: Log architectural decisions with context
// AC: Dado decisão arquitetural tomada, Quando logger registra, Então inclui: decisão, justificativa,
//     alternativas consideradas, data, E armazena em formato pesquisável, E permite consulta por tema/data/responsável

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { DecisionRecord } from './types.js';

/**
 * Story 9.4: Decision History Logger
 *
 * Provides logging of architectural decisions:
 * - Records decision, justification, alternatives, date
 * - Stores in searchable format
 * - Allows querying by theme/date/author
 */
export class DecisionLogger {
  private projectPath: string;
  private decisionsPath: string;
  private decisions: DecisionRecord[] = [];

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.decisionsPath = join(projectPath, '.bmad', 'context', 'decisions.json');
  }

  /**
   * Load decisions from disk
   */
  async load(): Promise<DecisionRecord[]> {
    try {
      if (existsSync(this.decisionsPath)) {
        const content = await fs.readFile(this.decisionsPath, 'utf-8');
        this.decisions = JSON.parse(content);
        console.log(`[DecisionLogger] Loaded ${this.decisions.length} decisions`);
        return this.decisions;
      }
    } catch (error) {
      console.error(`[DecisionLogger] Failed to load decisions:`, error);
    }

    this.decisions = [];
    return this.decisions;
  }

  /**
   * Save decisions to disk
   */
  private async save(): Promise<void> {
    try {
      await fs.mkdir(dirname(this.decisionsPath), { recursive: true });
      await fs.writeFile(this.decisionsPath, JSON.stringify(this.decisions, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[DecisionLogger] Failed to save decisions:`, error);
      throw error;
    }
  }

  /**
   * Log a new decision
   */
  async logDecision(decision: Omit<DecisionRecord, 'id' | 'timestamp'>): Promise<DecisionRecord> {
    const record: DecisionRecord = {
      ...decision,
      id: `adr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    this.decisions.push(record);
    await this.save();

    return record;
  }

  /**
   * Get all decisions
   */
  getAllDecisions(): DecisionRecord[] {
    return [...this.decisions];
  }

  /**
   * Get decision by ID
   */
  getDecision(id: string): DecisionRecord | undefined {
    return this.decisions.find(d => d.id === id);
  }

  /**
   * Search decisions by content
   */
  search(query: string): DecisionRecord[] {
    const lowerQuery = query.toLowerCase();
    return this.decisions.filter(d =>
      d.decision.toLowerCase().includes(lowerQuery) ||
      d.justification.toLowerCase().includes(lowerQuery) ||
      d.context.toLowerCase().includes(lowerQuery) ||
      d.alternatives.some(a => a.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get decisions by author
   */
  getByAuthor(author: string): DecisionRecord[] {
    return this.decisions.filter(d => d.author === author);
  }

  /**
   * Get decisions by date range
   */
  getByDateRange(startDate: Date, endDate: Date): DecisionRecord[] {
    return this.decisions.filter(d => {
      const date = new Date(d.timestamp);
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Get recent decisions
   */
  getRecent(limit: number = 10): DecisionRecord[] {
    return [...this.decisions]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get decision statistics
   */
  getStatistics(): {
    totalDecisions: number;
    byAuthor: Record<string, number>;
    dateRange: { earliest: string; latest: string } | null;
  } {
    const byAuthor: Record<string, number> = {};
    let earliest: string | null = null;
    let latest: string | null = null;

    for (const decision of this.decisions) {
      if (decision.author) {
        byAuthor[decision.author] = (byAuthor[decision.author] || 0) + 1;
      }

      if (!earliest || decision.timestamp < earliest) {
        earliest = decision.timestamp;
      }
      if (!latest || decision.timestamp > latest) {
        latest = decision.timestamp;
      }
    }

    return {
      totalDecisions: this.decisions.length,
      byAuthor,
      dateRange: earliest && latest ? { earliest, latest } : null
    };
  }

  /**
   * Export decisions in ADR format
   */
  async exportAsADR(): Promise<string> {
    let output = '# Architectural Decision Records\n\n';

    for (const decision of this.decisions) {
      output += `## ${decision.id}\n`;
      output += `**Date:** ${new Date(decision.timestamp).toLocaleDateString()}\n`;
      if (decision.author) {
        output += `**Author:** ${decision.author}\n`;
      }
      output += `\n### Decision\n${decision.decision}\n\n`;
      output += `### Justification\n${decision.justification}\n\n`;
      output += `### Alternatives Considered\n`;
      for (const alt of decision.alternatives) {
        output += `- ${alt}\n`;
      }
      output += `\n### Context\n${decision.context}\n\n`;
      output += `---\n\n`;
    }

    return output;
  }
}

/**
 * Convenience function to log a decision
 */
export async function logDecision(
  projectPath: string,
  decision: Omit<DecisionRecord, 'id' | 'timestamp'>
): Promise<DecisionRecord> {
  const logger = new DecisionLogger(projectPath);
  await logger.load();
  return logger.logDecision(decision);
}

/**
 * Convenience function to search decisions
 */
export function searchDecisions(
  decisions: DecisionRecord[],
  query: string
): DecisionRecord[] {
  const lowerQuery = query.toLowerCase();
  return decisions.filter(d =>
    d.decision.toLowerCase().includes(lowerQuery) ||
    d.justification.toLowerCase().includes(lowerQuery)
  );
}
