// Memory Consolidator - Generates structured memory deltas for CLAUDE.md
// Maps session insights into deduplicated Markdown format

/**
 * Categories of discoveries that can be extracted from session insights
 */
export type InsightCategory =
  | 'compilation-error'
  | 'type-error'
  | 'pattern-recurrence'
  | 'configuration-fix'
  | 'dependency-issue'
  | 'test-improvement'
  | 'architecture-insight'
  | 'best-practice';

/**
 * Source of the insight
 */
export type InsightSource = 'error' | 'decision' | 'correction' | 'pattern' | 'telemetry';

/**
 * Individual insight discovered during a session
 */
export interface SessionInsight {
  id: string;
  category: InsightCategory;
  source: InsightSource;
  pattern: string;
  description: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  metadata?: Record<string, string>;
}

/**
 * Input for memory delta generation
 */
export interface SessionInsights {
  insights: SessionInsight[];
  sessionDate: string;
  projectName?: string;
}

/**
 * Output from generating memory delta
 */
export interface MemoryDelta {
  markdown: string;
  uniquePatterns: number;
  categories: Record<InsightCategory, number>;
  deduplicatedCount: number;
}

/**
 * Deduplication result
 */
interface DeduplicatedInsight {
  pattern: string;
  description: string;
  category: InsightCategory;
  source: InsightSource;
  occurrences: number;
  lastSeen: string;
}

/**
 * Maps categories to human-readable labels for Markdown
 */
const CATEGORY_LABELS: Record<InsightCategory, string> = {
  'compilation-error': 'Compilation Errors',
  'type-error': 'Type Errors',
  'pattern-recurrence': 'Recurring Patterns',
  'configuration-fix': 'Configuration Fixes',
  'dependency-issue': 'Dependency Issues',
  'test-improvement': 'Test Improvements',
  'architecture-insight': 'Architecture Insights',
  'best-practice': 'Best Practices'
};

/**
 * Maps categories to bullet point labels
 */
const CATEGORY_BULLETS: Record<InsightCategory, string> = {
  'compilation-error': 'compilation error',
  'type-error': 'type mismatch',
  'pattern-recurrence': 'recurrence',
  'configuration-fix': 'config fix',
  'dependency-issue': 'dependency issue',
  'test-improvement': 'test improvement',
  'architecture-insight': 'architecture insight',
  'best-practice': 'best practice'
};

/**
 * Basic text deduplication using normalize and hash approach
 */
function deduplicateInsights(insights: SessionInsight[]): DeduplicatedInsight[] {
  const seen = new Map<string, DeduplicatedInsight>();

  for (const insight of insights) {
    // Normalize pattern for deduplication (lowercase, trim, remove extra spaces)
    const normalizedKey = insight.pattern
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    const existing = seen.get(normalizedKey);

    if (existing) {
      // Update occurrences and keep latest
      existing.occurrences += insight.occurrences;
      if (new Date(insight.lastSeen) > new Date(existing.lastSeen)) {
        existing.lastSeen = insight.lastSeen;
        existing.description = insight.description;
      }
    } else {
      // Add new entry
      seen.set(normalizedKey, {
        pattern: insight.pattern,
        description: insight.description,
        category: insight.category,
        source: insight.source,
        occurrences: insight.occurrences,
        lastSeen: insight.lastSeen
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Groups insights by category
 */
function groupByCategory(insights: DeduplicatedInsight[]): Map<InsightCategory, DeduplicatedInsight[]> {
  const groups = new Map<InsightCategory, DeduplicatedInsight[]>();

  for (const insight of insights) {
    const existing = groups.get(insight.category) || [];
    existing.push(insight);
    groups.set(insight.category, existing);
  }

  return groups;
}

/**
 * Validates session insights input
 */
function validateInsights(insights: SessionInsights): void {
  if (!Array.isArray(insights.insights)) {
    throw new Error('Insights must be an array');
  }

  if (!insights.sessionDate) {
    throw new Error('Session date is required');
  }

  // Validate each insight
  for (const insight of insights.insights) {
    if (!insight.pattern || typeof insight.pattern !== 'string') {
      throw new Error('Each insight must have a valid pattern string');
    }

    if (!insight.category || !CATEGORY_LABELS[insight.category]) {
      throw new Error(`Invalid category: ${insight.category}`);
    }

    if (!insight.source || !['error', 'decision', 'correction', 'pattern', 'telemetry'].includes(insight.source)) {
      throw new Error(`Invalid source: ${insight.source}`);
    }
  }
}

/**
 * Generates a Markdown-formatted delta for CLAUDE.md
 * Maps categories of discoveries into structured format ready to append
 *
 * @param sessionInsights - Collection of insights from the current session
 * @returns MemoryDelta with formatted markdown and statistics
 */
export function generateMemoryDelta(sessionInsights: SessionInsights): MemoryDelta {
  // Validate input
  validateInsights(sessionInsights);

  // Deduplicate insights
  const deduplicated = deduplicateInsights(sessionInsights.insights);

  // Group by category
  const grouped = groupByCategory(deduplicated);

  // Build category counts
  const categories: Record<InsightCategory, number> = {
    'compilation-error': 0,
    'type-error': 0,
    'pattern-recurrence': 0,
    'configuration-fix': 0,
    'dependency-issue': 0,
    'test-improvement': 0,
    'architecture-insight': 0,
    'best-practice': 0
  };

  for (const entry of Array.from(grouped.values())) {
    if (entry.length > 0) {
      categories[entry[0].category] = entry.length;
    }
  }

  // Generate Markdown sections
  const markdownParts: string[] = [];

  // Header with session info
  markdownParts.push(`## Session Notes (${sessionInsights.sessionDate})`);

  if (sessionInsights.projectName) {
    markdownParts.push(`- **Project:** ${sessionInsights.projectName}`);
  }

  // Group and format by category
  const sortedCategories: InsightCategory[] = [
    'compilation-error',
    'type-error',
    'pattern-recurrence',
    'configuration-fix',
    'dependency-issue',
    'test-improvement',
    'architecture-insight',
    'best-practice'
  ];

  const lines: string[] = [];

  for (const category of sortedCategories) {
    const categoryInsights = grouped.get(category);
    if (!categoryInsights || categoryInsights.length === 0) continue;

    for (const insight of categoryInsights) {
      const bullet = CATEGORY_BULLETS[category];
      let line = `- ${bullet}: ${insight.pattern}`;

      // Add description if significantly different from pattern
      if (insight.description && insight.description !== insight.pattern) {
        line += ` - ${insight.description}`;
      }

      // Add occurrence count if more than 1
      if (insight.occurrences > 1) {
        line += ` (${insight.occurrences}x)`;
      }

      lines.push(line);
    }
  }

  // If no categorized insights, add a simple marker
  if (lines.length === 0) {
    lines.push('- Wrap-up session executed');
  }

  markdownParts.push(lines.join('\n'));

  return {
    markdown: markdownParts.join('\n\n'),
    uniquePatterns: deduplicated.length,
    categories,
    deduplicatedCount: sessionInsights.insights.length - deduplicated.length
  };
}

/**
 * Generates a rule section for CLAUDE.md from insights
 * Used when insights are significant enough to become project rules
 *
 * @param insights - Deduplicated insights to convert to rules
 * @returns Formatted Markdown for Project Rules section
 */
export function generateRulesMarkdown(insights: DeduplicatedInsight[]): string {
  if (insights.length === 0) {
    return '';
  }

  const lines = [
    '## Project Rules',
    ''
  ];

  for (const insight of insights) {
    // Only convert to rules if occurrences >= 2
    if (insight.occurrences >= 2) {
      lines.push(`- ${insight.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Checks if an insight should be promoted to a rule
 * (i.e., has occurred multiple times)
 */
export function shouldPromoteToRule(insight: DeduplicatedInsight): boolean {
  return insight.occurrences >= 2;
}
