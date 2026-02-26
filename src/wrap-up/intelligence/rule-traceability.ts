// Rule Traceability - Links generated rules to their source events for auditability
import { EventEmitter } from 'events';

/**
 * Types of events that can justify a rule
 */
export type SourceEventType =
  | 'error'
  | 'warning'
  | 'skill_gap'
  | 'systemic_error'
  | 'friction'
  | 'build_failure'
  | 'test_failure'
  | 'runtime_error'
  | 'type_error'
  | 'lint_error';

/**
 * Represents a single event in the session logs
 */
export interface SessionLogEvent {
  id: string;
  timestamp: string;
  type: SourceEventType;
  message: string;
  context?: string;
  file?: string;
  line?: number;
  stack?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Represents a linked trace between a rule and its source events
 */
export interface TraceableRule {
  rule: string;
  sourceEventIds: string[];
  sourceEvents: SessionLogEvent[];
  justification: string;
  confidence: number;
  linkedAt: string;
  category: string;
}

/**
 * Result of the traceability analysis
 */
export interface TraceabilityResult {
  rules: TraceableRule[];
  unlinkedEvents: SessionLogEvent[];
  auditSummary: AuditSummary;
}

/**
 * Summary of the traceability audit
 */
export interface AuditSummary {
  totalRules: number;
  rulesWithEvidence: number;
  rulesWithoutEvidence: number;
  eventsAnalyzed: number;
  eventsLinked: number;
}

/**
 * Configuration for JustificationLinker
 */
export interface TraceabilityConfig {
  minConfidenceThreshold: number;
  enableFuzzyMatching: boolean;
  categories: Record<string, string[]>;
}

/**
 * Default patterns to detect rule types from rule text
 */
const RULE_PATTERNS: Array<{ pattern: RegExp; category: string; keywords: string[] }> = [
  {
    pattern: /hook|custom.?hook|use[A-Z]/i,
    category: 'react-hooks',
    keywords: ['hook', 'useState', 'useEffect', 'custom hook']
  },
  {
    pattern: /typescript|type.?mismatch|type.?error/i,
    category: 'typescript',
    keywords: ['type', 'TypeScript', 'interface', 'type safety']
  },
  {
    pattern: /import|require|module/i,
    category: 'imports',
    keywords: ['import', 'require', 'ESM', 'CJS']
  },
  {
    pattern: /async|await|promise/i,
    category: 'async-await',
    keywords: ['async', 'await', 'Promise', 'callback']
  },
  {
    pattern: /error|exception|throw|catch/i,
    category: 'error-handling',
    keywords: ['error', 'exception', 'try', 'catch', 'throw']
  },
  {
    pattern: /test|spec|jest|vitest/i,
    category: 'testing',
    keywords: ['test', 'spec', 'jest', 'testing']
  },
  {
    pattern: /path|resolve|import\./i,
    category: 'path-resolution',
    keywords: ['path', 'resolve', 'import']
  },
  {
    pattern: /security|secret|token|key/i,
    category: 'security',
    keywords: ['security', 'secret', 'token', 'API key']
  },
  {
    pattern: /null|undefined|nil/i,
    category: 'null-safety',
    keywords: ['null', 'undefined', 'optional']
  },
  {
    pattern: /build|compile|tsc/i,
    category: 'build',
    keywords: ['build', 'compile', 'tsc', 'compiler']
  }
];

/**
 * Event type keywords for matching
 */
const EVENT_TYPE_KEYWORDS: Record<SourceEventType, string[]> = {
  error: ['error', 'exception', 'failed', 'failure'],
  warning: ['warning', 'warn', 'deprecated'],
  skill_gap: ['skill', 'gap', 'knowledge', 'unknown'],
  systemic_error: ['systemic', 'pattern', 'recurring', 'repeated'],
  friction: ['friction', 'slow', 'difficult', 'hard'],
  build_failure: ['build', 'compile', 'tsc', 'failed to compile'],
  test_failure: ['test', 'spec', 'failed', 'assertion'],
  runtime_error: ['runtime', 'undefined', 'cannot read', 'is not a'],
  type_error: ['type', 'typeerror', 'expected', 'got'],
  lint_error: ['lint', 'eslint', 'prettier', 'format']
};

/**
 * JustificationLinker - Adds traceability to generated rules by linking them
 * to the events in session logs that necessitated their creation
 */
export class JustificationLinker extends EventEmitter {
  private config: TraceabilityConfig;
  private eventCache: Map<string, SessionLogEvent[]> = new Map();

  constructor(config: Partial<TraceabilityConfig> = {}) {
    super();
    this.config = {
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.5,
      enableFuzzyMatching: config.enableFuzzyMatching ?? true,
      categories: config.categories ?? {}
    };
  }

  /**
   * Main method to link a rule to its source events
   * Analyzes the rule text and searches logs for related events
   */
  linkRuleToSource(rule: string, sessionLogs: SessionLogEvent[]): TraceableRule {
    // Analyze the rule to determine its category
    const category = this.detectRuleCategory(rule);

    // Find matching events in the logs
    const matchingEvents = this.findMatchingEvents(rule, sessionLogs, category);

    // Calculate confidence based on matches
    const confidence = this.calculateConfidence(rule, matchingEvents, sessionLogs.length);

    // Generate justification text
    const justification = this.generateJustification(rule, matchingEvents);

    return {
      rule,
      sourceEventIds: matchingEvents.map(e => e.id),
      sourceEvents: matchingEvents,
      justification,
      confidence,
      linkedAt: new Date().toISOString(),
      category
    };
  }

  /**
   * Process multiple rules and return traceability result
   */
  linkMultipleRules(rules: string[], sessionLogs: SessionLogEvent[]): TraceabilityResult {
    const traceableRules: TraceableRule[] = [];
    const linkedEventIds = new Set<string>();

    for (const rule of rules) {
      const traceable = this.linkRuleToSource(rule, sessionLogs);
      traceableRules.push(traceable);

      // Track which events were linked
      traceable.sourceEventIds.forEach(id => linkedEventIds.add(id));
    }

    // Find unlinked events
    const unlinkedEvents = sessionLogs.filter(
      event => !linkedEventIds.has(event.id)
    );

    // Generate audit summary
    const auditSummary = this.generateAuditSummary(traceableRules, sessionLogs.length, unlinkedEvents.length);

    this.emit('traceability:complete', { rules: traceableRules.length, events: sessionLogs.length });

    return {
      rules: traceableRules,
      unlinkedEvents,
      auditSummary
    };
  }

  /**
   * Detect the category of a rule based on its text
   */
  private detectRuleCategory(rule: string): string {
    // Check custom categories first
    for (const [category, keywords] of Object.entries(this.config.categories)) {
      if (keywords.some(keyword => rule.toLowerCase().includes(keyword.toLowerCase()))) {
        return category;
      }
    }

    // Check built-in patterns
    for (const { pattern, category } of RULE_PATTERNS) {
      if (pattern.test(rule)) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Find events in logs that match the rule
   */
  private findMatchingEvents(
    rule: string,
    sessionLogs: SessionLogEvent[],
    category: string
  ): SessionLogEvent[] {
    const matches: SessionLogEvent[] = [];
    const ruleLower = rule.toLowerCase();

    // Get keywords for the category
    const categoryKeywords = this.getKeywordsForCategory(category);

    for (const event of sessionLogs) {
      let score = 0;

      // Check event type matches rule category
      if (this.isEventTypeRelevant(event.type, category)) {
        score += 2;
      }

      // Check keyword matches in event message
      const messageLower = event.message.toLowerCase();
      for (const keyword of categoryKeywords) {
        if (messageLower.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Check direct rule keywords in event
      for (const { keywords } of RULE_PATTERNS) {
        for (const keyword of keywords) {
          if (messageLower.includes(keyword.toLowerCase()) && ruleLower.includes(keyword.toLowerCase())) {
            score += 1.5;
          }
        }
      }

      // Check file/line context matches
      if (event.file && ruleLower.includes(event.file.toLowerCase())) {
        score += 2;
      }

      // Include if score meets threshold
      if (score >= this.config.minConfidenceThreshold * 10) {
        matches.push(event);
      }
    }

    // Sort by relevance score (highest first)
    return matches.sort((a, b) => {
      const scoreA = this.getEventRelevanceScore(a, category);
      const scoreB = this.getEventRelevanceScore(b, category);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate confidence that rule has proper justification
   */
  private calculateConfidence(rule: string, matches: SessionLogEvent[], totalEvents: number): number {
    if (matches.length === 0) {
      return 0;
    }

    // Base confidence from number of matching events
    const matchRatio = Math.min(matches.length / 3, 1); // Cap at 3 events for max score

    // Boost for specific file/line references
    const hasSpecificLocation = matches.some(e => e.file && e.line);
    const locationBoost = hasSpecificLocation ? 0.2 : 0;

    // Boost for multiple event types supporting the rule
    const uniqueTypes = new Set(matches.map(e => e.type)).size;
    const typeBoost = Math.min(uniqueTypes * 0.1, 0.3);

    // Calculate final confidence
    const confidence = Math.min(
      0.3 + (matchRatio * 0.5) + locationBoost + typeBoost,
      1.0
    );

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Generate human-readable justification
   */
  private generateJustification(rule: string, matchingEvents: SessionLogEvent[]): string {
    if (matchingEvents.length === 0) {
      return `Rule created without detectable algorithmic evidence. Rule: "${rule.substring(0, 50)}..."`;
    }

    const uniqueTypes = Array.from(new Set(matchingEvents.map(e => e.type)));
    const files = matchingEvents
      .filter(e => e.file)
      .map(e => `${e.file}:${e.line || '?'}`)
      .filter((v, i, a) => a.indexOf(v) === i);

    const parts: string[] = [];

    // Add event type summary
    if (uniqueTypes.length === 1) {
      parts.push(`Based on ${matchingEvents.length} ${uniqueTypes[0]} event(s)`);
    } else {
      parts.push(`Based on ${matchingEvents.length} events of types: ${uniqueTypes.join(', ')}`);
    }

    // Add file context if available
    if (files.length > 0) {
      parts.push(`affecting files: ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`);
    }

    // Add specific error excerpts
    if (matchingEvents[0].message) {
      const excerpt = matchingEvents[0].message.substring(0, 100);
      parts.push(`Sample: "${excerpt}${excerpt.length === 100 ? '...' : ''}"`);
    }

    return parts.join('. ');
  }

  /**
   * Check if event type is relevant to category
   */
  private isEventTypeRelevant(eventType: SourceEventType, category: string): boolean {
    const categoryEventTypes: Record<string, SourceEventType[]> = {
      'react-hooks': ['error', 'runtime_error'],
      'typescript': ['type_error', 'build_failure'],
      'imports': ['error', 'lint_error'],
      'async-await': ['error', 'runtime_error'],
      'error-handling': ['error', 'runtime_error'],
      'testing': ['test_failure'],
      'path-resolution': ['error', 'build_failure'],
      'security': ['error', 'warning'],
      'null-safety': ['runtime_error', 'type_error'],
      'build': ['build_failure', 'lint_error']
    };

    const relevantTypes = categoryEventTypes[category] || [];
    return relevantTypes.includes(eventType);
  }

  /**
   * Get keywords for a category
   */
  private getKeywordsForCategory(category: string): string[] {
    const pattern = RULE_PATTERNS.find(p => p.category === category);
    return pattern?.keywords || [];
  }

  /**
   * Get relevance score for an event
   */
  private getEventRelevanceScore(event: SessionLogEvent, category: string): number {
    let score = 0;

    // Event type relevance
    if (this.isEventTypeRelevant(event.type, category)) {
      score += 3;
    }

    // File/line presence
    if (event.file) score += 2;
    if (event.line) score += 1;

    // Stack trace presence (indicates detailed error)
    if (event.stack) score += 1;

    // Metadata presence
    if (event.metadata && Object.keys(event.metadata).length > 0) {
      score += 1;
    }

    return score;
  }

  /**
   * Generate audit summary
   */
  private generateAuditSummary(
    rules: TraceableRule[],
    totalEvents: number,
    unlinkedCount: number
  ): AuditSummary {
    const rulesWithEvidence = rules.filter(r => r.confidence >= this.config.minConfidenceThreshold);
    const rulesWithoutEvidence = rules.filter(r => r.confidence < this.config.minConfidenceThreshold);

    const eventsLinked = new Set(
      rules.flatMap(r => r.sourceEventIds)
    ).size;

    return {
      totalRules: rules.length,
      rulesWithEvidence: rulesWithEvidence.length,
      rulesWithoutEvidence: rulesWithoutEvidence.length,
      eventsAnalyzed: totalEvents,
      eventsLinked
    };
  }

  /**
   * Validate that a rule has sufficient traceability
   */
  validateTraceability(rule: TraceableRule): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (rule.sourceEventIds.length === 0) {
      reasons.push('No source events linked to rule');
    }

    if (rule.confidence < this.config.minConfidenceThreshold) {
      reasons.push(`Confidence (${rule.confidence}) below threshold (${this.config.minConfidenceThreshold})`);
    }

    if (!rule.justification || rule.justification.length < 20) {
      reasons.push('Justification text is insufficient');
    }

    return {
      valid: reasons.length === 0,
      reasons
    };
  }

  /**
   * Export traceability report as JSON
   */
  exportTraceabilityReport(result: TraceabilityResult): string {
    return JSON.stringify(result, null, 2);
  }
}

export default JustificationLinker;
