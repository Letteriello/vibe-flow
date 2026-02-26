// Compaction Limits - Configuration for Three-Level Escalation system
// Based on LCM paper: Three-Level Escalation pattern for guaranteed payload reduction

/**
 * Configuration for each escalation level
 */
export interface EscalationLevelConfig {
  /** Level identifier (1, 2, or 3) */
  level: number;
  /** Human-readable name */
  name: string;
  /** Target token multiplier relative to requested target */
  targetMultiplier: number;
  /** Description of the strategy */
  strategy: 'llm_preserve_details' | 'llm_bullet_points' | 'deterministic_truncate';
  /** Whether this level uses LLM */
  usesLLM: boolean;
  /** Max retries for LLM calls at this level */
  maxRetries: number;
}

/**
 * Compaction limits configuration
 */
export interface CompactionLimits {
  /** Maximum original message size in characters */
  maxOriginalChars: number;
  /** Minimum target tokens to aim for */
  minTargetTokens: number;
  /** Maximum target tokens */
  maxTargetTokens: number;
  /** Token to character ratio (default: 4 chars per token) */
  charsPerToken: number;
  /** Configuration for each escalation level */
  levels: EscalationLevelConfig[];
  /** Timeout for LLM calls in ms */
  llmTimeoutMs: number;
}

/**
 * Default compaction limits configuration
 */
export const DEFAULT_COMPACTION_LIMITS: CompactionLimits = {
  maxOriginalChars: 500000,
  minTargetTokens: 100,
  maxTargetTokens: 100000,
  charsPerToken: 4,
  llmTimeoutMs: 30000,
  levels: [
    {
      level: 1,
      name: 'LLM Preserve Details',
      targetMultiplier: 1.0,
      strategy: 'llm_preserve_details',
      usesLLM: true,
      maxRetries: 2
    },
    {
      level: 2,
      name: 'LLM Bullet Points',
      targetMultiplier: 0.5,
      strategy: 'llm_bullet_points',
      usesLLM: true,
      maxRetries: 2
    },
    {
      level: 3,
      name: 'Deterministic Truncation',
      targetMultiplier: 0.25,
      strategy: 'deterministic_truncate',
      usesLLM: false,
      maxRetries: 0
    }
  ]
};

/**
 * Get configuration for a specific level
 */
export function getLevelConfig(level: number, limits: CompactionLimits = DEFAULT_COMPACTION_LIMITS): EscalationLevelConfig {
  const config = limits.levels.find(l => l.level === level);
  if (!config) {
    throw new Error(`Invalid escalation level: ${level}. Valid levels: 1, 2, 3`);
  }
  return config;
}

/**
 * Calculate target tokens for a given level
 */
export function calculateTargetTokens(
  baseTarget: number,
  level: number,
  limits: CompactionLimits = DEFAULT_COMPACTION_LIMITS
): number {
  const levelConfig = getLevelConfig(level, limits);
  const target = Math.floor(baseTarget * levelConfig.targetMultiplier);
  return Math.max(limits.minTargetTokens, Math.min(target, limits.maxTargetTokens));
}

/**
 * Estimate token count from character count
 */
export function estimateTokensFromChars(charCount: number, limits: CompactionLimits = DEFAULT_COMPACTION_LIMITS): number {
  return Math.ceil(charCount / limits.charsPerToken);
}

/**
 * Estimate character count from token count
 */
export function estimateCharsFromTokens(tokenCount: number, limits: CompactionLimits = DEFAULT_COMPACTION_LIMITS): number {
  return tokenCount * limits.charsPerToken;
}

export default DEFAULT_COMPACTION_LIMITS;
