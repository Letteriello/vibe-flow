// Intelligent Context Categorizer - Story 9.6: Smart Sliding Window
// AC: Dado conteúdo, Quando categorização executa, Então identifica o tipo automaticamente,
//     E atribui prioridade correta, E preserva decisões BMAD, E resume logs/bash/erros

import { ContextEntryType, EntryPriority } from './types.js';

// Keywords that identify content type
const TYPE_PATTERNS: Record<ContextEntryType, RegExp[]> = {
  bmad: [
    /BMAD|Phase \d|Decision|Architectural/i,
    /story|epic|PRDs?/i,
    /architecture|technical design/i,
    /PRD|Product Requirement/i
  ],
  decision: [
    /decision|choice|option|alternative/i,
    /chose|selected|chosen/i,
    /justification|because|reason/i
  ],
  artifact: [
    /# \w+|## \w+/m,  // Markdown headers
    /specification?|documentation|docs?/i,
    /draft|proposal|plan/i
  ],
  bash: [
    /^\$\s+/m,           // Command prompt
    /\[.*\]\s*(error|warn|info|debug)/i,
    /node|npm|yarn|pnpm/i,
    /git (status|commit|push|pull|branch)/i,
    /running|executed|completed/i
  ],
  error: [
    /error|exception|failed|failure/i,
    /stack trace|at line \d+|at Function/i,
    /ENOENT|EADDRINUSE|ECONNREFUSED/i,
    /TypeError|ReferenceError|SyntaxError/i,
    /\[ERROR\]|\[FATAL\]/i
  ],
  code: [
    /(function|const|let|var|class|import|export)\s+\w+/,
    /\{[\s\S]*\}|if\s*\(|for\s*\(|while\s*\(/,
    /=>|->|::|\.\.\./
  ],
  userInput: [
    /^(user|human|you):/im,
    /please |can you |could you /i,
    /help me|i need|i want/i
  ],
  file: [
    /^\/[a-z]:|^\/|~/,
    /\.(ts|js|json|md|yaml|yml|toml|xml|html|css)$/i,
    /file path|directory|folder/i
  ],
  summary: [
    /summary|compressed|truncated/i,
    /was summarized|older entries/i
  ]
};

// Default priorities by type
const DEFAULT_PRIORITIES: Record<ContextEntryType, EntryPriority> = {
  bmad: EntryPriority.CRITICAL,
  decision: EntryPriority.HIGH,
  artifact: EntryPriority.HIGH,
  code: EntryPriority.MEDIUM,
  userInput: EntryPriority.MEDIUM,
  file: EntryPriority.MEDIUM,
  bash: EntryPriority.LOW,
  error: EntryPriority.LOW,
  summary: EntryPriority.LOW  // Summaries are already compressed
};

/**
 * Story 9.6: Intelligent Sliding Window Categorizer
 *
 * Automatically categorizes context entries and assigns priorities:
 * - BMAD decisions: CRITICAL - never summarize
 * - Decisions/Artifacts: HIGH - summarize last
 * - Code/User-input: MEDIUM - normal handling
 * - Bash/Errors: LOW - aggressive summarization
 */
export class ContextCategorizer {
  /**
   * Categorize content and return entry type
   */
  static categorize(content: string, metadata: Record<string, any> = {}): ContextEntryType {
    // Check metadata first (explicit override)
    if (metadata.explicitType && TYPE_PATTERNS[metadata.explicitType]) {
      return metadata.explicitType;
    }

    // Check for BMAD-specific markers
    if (metadata.isBMAD || this.hasBMADMarkers(content)) {
      return 'bmad';
    }

    // Score each type based on pattern matches
    const scores = this.scoreTypes(content);

    // Get highest scoring type
    const type = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0][0] as ContextEntryType;

    return type;
  }

  /**
   * Check for BMAD-specific markers in content
   */
  private static hasBMADMarkers(content: string): boolean {
    const bmadMarkers = [
      /Phase \d/,
      /Story \d+-\d+/,
      /Epic/,
      /sprint/i,
      /acceptance criteria/i,
      /BMAD/i,
      /Architect/i,
      /technical specification/i
    ];

    return bmadMarkers.some(regex => regex.test(content));
  }

  /**
   * Score content against all type patterns
   */
  private static scoreTypes(content: string): Record<ContextEntryType, number> {
    const scores: Record<ContextEntryType, number> = {
      bmad: 0,
      decision: 0,
      artifact: 0,
      bash: 0,
      error: 0,
      code: 0,
      userInput: 0,
      file: 0,
      summary: 0
    } as Record<ContextEntryType, number>;

    for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          scores[type as ContextEntryType] += 1;
        }
      }
    }

    // Boost BMAD score if content is marked as BMAD in metadata context
    if (/BMAD|Phase \d|Decision/i.test(content)) {
      scores.bmad += 2;
    }

    return scores;
  }

  /**
   * Get priority for a given type
   */
  static getPriority(type: ContextEntryType, metadata: Record<string, any> = {}): EntryPriority {
    // Explicit priority in metadata overrides default
    if (metadata.priority !== undefined) {
      return metadata.priority as EntryPriority;
    }
    return DEFAULT_PRIORITIES[type] ?? EntryPriority.MEDIUM;
  }

  /**
   * Estimate token count for content
   * Rough estimate: ~4 characters per token
   */
  static estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Check if entry should be summarized based on type
   */
  static shouldSummarize(
    type: ContextEntryType,
    config?: { neverSummarizeTypes?: ContextEntryType[] }
  ): boolean {
    const neverTypes = config?.neverSummarizeTypes ?? ['bmad', 'decision'];
    return !neverTypes.includes(type);
  }

  /**
   * Get compression ratio for a type
   * Higher ratio = more aggressive summarization
   */
  static getCompressionRatio(type: ContextEntryType): number {
    const ratios: Record<ContextEntryType, number> = {
      bmad: 1.0,      // Never compress
      decision: 0.8,  // Keep 80% - high fidelity
      artifact: 0.7,  // Keep 70%
      code: 0.5,      // Keep 50%
      userInput: 0.6, // Keep 60%
      file: 0.4,     // Keep 40%
      bash: 0.15,    // Keep only 15% - aggressive
      error: 0.2,    // Keep 20% - keep error type but summarize
      summary: 1.0   // Already compressed
    };
    return ratios[type] ?? 0.5;
  }
}

/**
 * Categorize and create entry metadata
 */
export function categorizeEntry(
  content: string,
  metadata: Record<string, any> = {}
): { type: ContextEntryType; priority: EntryPriority; tokens: number } {
  const type = ContextCategorizer.categorize(content, metadata);
  const priority = ContextCategorizer.getPriority(type, metadata);
  const tokens = ContextCategorizer.estimateTokens(content);

  return { type, priority, tokens };
}
