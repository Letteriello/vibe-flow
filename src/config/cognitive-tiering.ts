// Cognitive Tiering - Model Router for optimizing cost and cognitive capacity
// Selects appropriate model tier based on task type

/**
 * Types of tasks that require different cognitive capabilities
 */
export enum TaskType {
  PLANNING = 'PLANNING',
  BUILDING = 'BUILDING',
  REVIEWING = 'REVIEWING',
  DENOISING = 'DENOISING'
}

/**
 * Configuration for a model tier
 */
export interface ModelConfig {
  tierId: string;
  tierName: string;
  modelName: string;
  maxTokens: number;
  estimatedCostPer1kTokens: number;
  capabilities: ModelCapability[];
  recommendedFor: TaskType[];
  description: string;
}

/**
 * Capabilities that a model tier may possess
 */
export enum ModelCapability {
  REASONING = 'reasoning',
  CODE_GENERATION = 'code_generation',
  CODE_REVIEW = 'code_review',
  FAST_ITERATION = 'fast_iteration',
  LOW_LATENCY = 'low_latency',
  HIGH_ACCURACY = 'high_accuracy',
  COST_OPTIMIZED = 'cost_optimized'
}

/**
 * Predefined model tier configurations
 */
const MODEL_TIERS: Record<string, ModelConfig> = {
  'tier-1-reasoning': {
    tierId: 'tier-1-reasoning',
    tierName: 'Tier 1 - Reasoning',
    modelName: 'o1',
    maxTokens: 200000,
    estimatedCostPer1kTokens: 0.015,
    capabilities: [
      ModelCapability.REASONING,
      ModelCapability.HIGH_ACCURACY
    ],
    recommendedFor: [TaskType.PLANNING],
    description: 'High-capability reasoning model for complex planning and architectural decisions'
  },
  'tier-2-fast-coder': {
    tierId: 'tier-2-fast-coder',
    tierName: 'Tier 2 - Fast Coder',
    modelName: 'claude-3-5-sonnet',
    maxTokens: 200000,
    estimatedCostPer1kTokens: 0.003,
    capabilities: [
      ModelCapability.CODE_GENERATION,
      ModelCapability.FAST_ITERATION
    ],
    recommendedFor: [TaskType.BUILDING, TaskType.DENOISING],
    description: 'Balanced model for code generation and implementation tasks'
  },
  'tier-3-cheap-reviewer': {
    tierId: 'tier-3-cheap-reviewer',
    tierName: 'Tier 3 - Cheap Reviewer',
    modelName: 'claude-3-haiku',
    maxTokens: 200000,
    estimatedCostPer1kTokens: 0.00025,
    capabilities: [
      ModelCapability.CODE_REVIEW,
      ModelCapability.COST_OPTIMIZED,
      ModelCapability.LOW_LATENCY
    ],
    recommendedFor: [TaskType.REVIEWING],
    description: 'Cost-optimized model for code review and lightweight validation'
  }
};

/**
 * Mapping of task types to recommended model tiers
 */
const TASK_TO_TIER_MAP: Record<TaskType, string> = {
  [TaskType.PLANNING]: 'tier-1-reasoning',
  [TaskType.BUILDING]: 'tier-2-fast-coder',
  [TaskType.REVIEWING]: 'tier-3-cheap-reviewer',
  [TaskType.DENOISING]: 'tier-2-fast-coder'
};

/**
 * Static router for selecting optimal model configuration based on task type
 */
export class ModelRouter {
  /**
   * Get the recommended model configuration for a given task type
   * @param taskType - The type of task to be performed
   * @returns ModelConfig for the recommended model tier
   */
  static getRecommendedModel(taskType: TaskType): ModelConfig {
    const tierId = TASK_TO_TIER_MAP[taskType];
    if (!tierId) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    const config = MODEL_TIERS[tierId];
    if (!config) {
      throw new Error(`Model tier not found: ${tierId}`);
    }

    return config;
  }

  /**
   * Get all available model tiers
   * @returns Array of all ModelConfig objects
   */
  static getAllTiers(): ModelConfig[] {
    return Object.values(MODEL_TIERS);
  }

  /**
   * Get a specific tier by its ID
   * @param tierId - The tier identifier (e.g., 'tier-1-reasoning')
   * @returns ModelConfig for the specified tier
   */
  static getTier(tierId: string): ModelConfig | undefined {
    return MODEL_TIERS[tierId];
  }

  /**
   * Estimate cost for a given task based on estimated token usage
   * @param taskType - The type of task
   * @param estimatedTokens - Estimated number of tokens for the task
   * @returns Estimated cost in USD
   */
  static estimateCost(taskType: TaskType, estimatedTokens: number): number {
    const config = ModelRouter.getRecommendedModel(taskType);
    return (estimatedTokens / 1000) * config.estimatedCostPer1kTokens;
  }

  /**
   * Get the most cost-effective tier that supports a given capability
   * @param capability - The required capability
   * @returns ModelConfig for the most cost-effective tier with that capability
   */
  static getCheapestTierWithCapability(capability: ModelCapability): ModelConfig {
    const tiersWithCapability = Object.values(MODEL_TIERS)
      .filter(tier => tier.capabilities.includes(capability))
      .sort((a, b) => a.estimatedCostPer1kTokens - b.estimatedCostPer1kTokens);

    if (tiersWithCapability.length === 0) {
      throw new Error(`No tier found with capability: ${capability}`);
    }

    return tiersWithCapability[0];
  }

  /**
   * Check if a task type is supported
   * @param taskType - The task type to check
   * @returns True if the task type is supported
   */
  static isSupported(taskType: string): boolean {
    return taskType in TaskType;
  }
}
