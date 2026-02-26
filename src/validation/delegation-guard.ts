// Delegation Guard - Story 8.x: Structural validation for sub-agent delegation
// AC: Dado uma requisição de criação de subagente,
//     Quando o guard intercepta, Então valida presença de delegated_scope e retained_work,
//     E se retained_work for vazio ou genérico, lança InfiniteDelegationError

/**
 * Palavras genéricas que indicam que o retained_work não foi realmente especificado
 */
const GENERIC_RETAINED_WORK_PATTERNS = [
  'all',
  'everything',
  'all tasks',
  'everything else',
  'todo',
  'to-do',
  'remaining',
  'the rest',
  'other tasks',
  'n/a',
  'none',
  'na',
  '-',
  '',
  'delegate everything',
  'handle everything',
  'manage all',
  'coordination',
  'oversight',
  'general'
];

/**
 * Error thrown when a sub-agent delegation attempt uses generic or empty retained_work
 */
export class InfiniteDelegationError extends Error {
  public readonly code: string;
  public readonly delegatedScope: string;
  public readonly retainedWork: string;
  public readonly suggestion: string;

  constructor(delegatedScope: string, retainedWork: string) {
    super(
      `Infinite delegation detected: retained_work "${retainedWork}" is too generic. ` +
      `The parent agent must retain specific, concrete responsibilities.`
    );
    this.name = 'InfiniteDelegationError';
    this.code = 'INFINITE_DELEGATION';
    this.delegatedScope = delegatedScope;
    this.retainedWork = retainedWork;
    this.suggestion =
      'Specify concrete retained_work such as: "review and approve sub-agent output", ' +
      '"handle error recovery", "manage cross-file dependencies", "final integration testing". ' +
      'Avoid generic terms like "coordination", "oversight", or "everything else".';
  }
}

/**
 * Interface for sub-agent delegation request
 */
export interface DelegationRequest {
  /** What the sub-agent will be responsible for */
  delegated_scope: string;
  /** What the parent agent will retain */
  retained_work: string;
  /** Optional: Maximum depth allowed for nested delegations */
  maxDepth?: number;
  /** Optional: Current delegation depth in the chain */
  currentDepth?: number;
}

/**
 * Result of delegation guard validation
 */
export interface DelegationValidationResult {
  valid: boolean;
  delegatedScope: string;
  retainedWork: string;
  isGeneric: boolean;
  depth: number;
  error?: InfiniteDelegationError;
}

/**
 * Guard that validates sub-agent delegation requests to prevent infinite delegation chains
 */
export class SubAgentDelegationGuard {
  private maxDepth: number;

  constructor(options?: { maxDepth?: number }) {
    this.maxDepth = options?.maxDepth ?? 5;
  }

  /**
   * Validates a delegation request before creating a sub-agent
   * @param request - The delegation request to validate
   * @throws InfiniteDelegationError if retained_work is empty or generic
   */
  validate(request: DelegationRequest): DelegationValidationResult {
    const depth = request.currentDepth ?? 0;

    // Check depth limit
    if (depth >= this.maxDepth) {
      throw new InfiniteDelegationError(
        request.delegated_scope,
        `Maximum delegation depth (${this.maxDepth}) exceeded`
      );
    }

    // Validate required parameters
    if (!request.delegated_scope || request.delegated_scope.trim() === '') {
      throw new InfiniteDelegationError(
        '',
        'delegated_scope is required and cannot be empty'
      );
    }

    if (!request.retained_work || request.retained_work.trim() === '') {
      throw new InfiniteDelegationError(
        request.delegated_scope,
        'retained_work is required and cannot be empty'
      );
    }

    // Check if retained_work is generic
    const normalizedRetainedWork = request.retained_work.toLowerCase().trim();
    const isGeneric = this.isGenericRetainedWork(normalizedRetainedWork);

    if (isGeneric) {
      throw new InfiniteDelegationError(
        request.delegated_scope,
        request.retained_work
      );
    }

    return {
      valid: true,
      delegatedScope: request.delegated_scope,
      retainedWork: request.retained_work,
      isGeneric: false,
      depth
    };
  }

  /**
   * Checks if the retained_work is too generic to prevent real work partitioning
   */
  private isGenericRetainedWork(retainedWork: string): boolean {
    // Check exact matches
    if (GENERIC_RETAINED_WORK_PATTERNS.includes(retainedWork)) {
      return true;
    }

    // Check if it's just a variation of generic patterns
    for (const pattern of GENERIC_RETAINED_WORK_PATTERNS) {
      if (retainedWork.includes(pattern) && retainedWork.length < pattern.length + 5) {
        return true;
      }
    }

    // Check for very short retained_work (likely generic)
    if (retainedWork.length < 10) {
      return true;
    }

    // Check for generic supervision/coordination patterns
    const genericSupervisionPatterns = [
      /^coord/i,
      /^oversight/i,
      /^supervis/i,
      /^manag(e|er|ement)/i,
      /^monitor/i,
      /^handle (all|everything)/i
    ];

    for (const pattern of genericSupervisionPatterns) {
      if (pattern.test(retainedWork)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Intercept method to validate before sub-agent creation
   * @param delegatedScope - What the sub-agent will do
   * @param retainedWork - What the parent keeps
   * @param currentDepth - Current delegation depth
   */
  intercept(delegatedScope: string, retainedWork: string, currentDepth?: number): void {
    const request: DelegationRequest = {
      delegated_scope: delegatedScope,
      retained_work: retainedWork,
      currentDepth
    };
    this.validate(request);
  }
}

/**
 * Utility function to validate delegation in one call
 */
export function validateDelegation(
  delegatedScope: string,
  retainedWork: string,
  options?: { maxDepth?: number; currentDepth?: number }
): DelegationValidationResult {
  const guard = new SubAgentDelegationGuard({ maxDepth: options?.maxDepth });
  const request: DelegationRequest = {
    delegated_scope: delegatedScope,
    retained_work: retainedWork,
    currentDepth: options?.currentDepth
  };
  return guard.validate(request);
}
