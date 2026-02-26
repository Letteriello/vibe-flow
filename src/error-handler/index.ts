// Error Handler - Automatic error recovery and classification
import chalk from 'chalk';

export enum ErrorSeverity {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
  FATAL = 'FATAL'
}

export enum VibeFlowErrorCode {
  // Project errors
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_ALREADY_EXISTS = 'PROJECT_ALREADY_EXISTS',
  PROJECT_CORRUPTED = 'PROJECT_CORRUPTED',

  // State machine errors
  TRANSITION_BLOCKED = 'TRANSITION_BLOCKED',
  INVALID_STATE = 'INVALID_STATE',
  STATE_MACHINE_INITIALIZATION_FAILED = 'STATE_MACHINE_INITIALIZATION_FAILED',

  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',

  // Network/API errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_TIMEOUT = 'API_TIMEOUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Execution errors
  COMMAND_FAILED = 'COMMAND_FAILED',
  SCRIPT_ERROR = 'SCRIPT_ERROR',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  TYPE_ERROR = 'TYPE_ERROR',

  // Concurrency errors
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  LOCK_ACQUISITION_FAILED = 'LOCK_ACQUISITION_FAILED',

  // Resource errors
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  DISK_FULL = 'DISK_FULL',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

  // Generic/Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export enum RecoveryAction {
  // Project actions
  RECREATE_PROJECT = 'RECREATE_PROJECT',
  RESTORE_PROJECT_FROM_BACKUP = 'RESTORE_PROJECT_FROM_BACKUP',
  VALIDATE_PROJECT_STRUCTURE = 'VALIDATE_PROJECT_STRUCTURE',

  // State actions
  RESET_TO_KNOWN_STATE = 'RESET_TO_KNOWN_STATE',
  SKIP_TRANSITION = 'SKIP_TRANSITION',
  RETRY_TRANSITION = 'RETRY_TRANSITION',

  // File actions
  CREATE_FILE = 'CREATE_FILE',
  RECREATE_FILE = 'RECREATE_FILE',
  RESTORE_FROM_BACKUP = 'RESTORE_FROM_BACKUP',
  CHECK_PERMISSIONS = 'CHECK_PERMISSIONS',

  // Validation actions
  FIX_INPUT = 'FIX_INPUT',
  PROMPT_USER = 'PROMPT_USER',
  USE_DEFAULT_CONFIG = 'USE_DEFAULT_CONFIG',

  // Network actions
  RETRY_WITH_BACKOFF = 'RETRY_WITH_BACKOFF',
  USE_CACHED_DATA = 'USE_CACHED_DATA',
  SKIP_OPERATION = 'SKIP_OPERATION',

  // Execution actions
  FIX_SCRIPT = 'FIX_SCRIPT',
  UPDATE_DEPENDENCIES = 'UPDATE_DEPENDENCIES',
  CLEAR_CACHE = 'CLEAR_CACHE',

  // Concurrency actions
  ACQUIRE_LOCK = 'ACQUIRE_LOCK',
  WAIT_FOR_RELEASE = 'WAIT_FOR_RELEASE',

  // Resource actions
  FREE_RESOURCES = 'FREE_RESOURCES',
  INCREASE_TIMEOUT = 'INCREASE_TIMEOUT',

  // Generic actions
  NONE = 'NONE',
  ESCALATE = 'ESCALATE',
  RETRY = 'RETRY'
}

export interface SuggestedAction {
  action: RecoveryAction;
  description: string;
  estimatedImpact: 'low' | 'medium' | 'high';
}

export interface VibeFlowError extends Error {
  code: VibeFlowErrorCode;
  suggestedAction: SuggestedAction;
  originalError?: Error;
  context?: Record<string, any>;
}

export interface ErrorClassification {
  severity: ErrorSeverity;
  canRecover: boolean;
  recoveryStrategy?: RecoveryStrategy;
  maxRetries?: number;
}

export enum RecoveryStrategy {
  RETRY = 'RETRY',
  RETRY_WITH_BACKOFF = 'RETRY_WITH_BACKOFF',
  FALLBACK = 'FALLBACK',
  ESCALATE = 'ESCALATE',
  NONE = 'NONE'
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2
};

// Error code to suggested action mapping
const ERROR_ACTION_MAP: Record<VibeFlowErrorCode, SuggestedAction> = {
  [VibeFlowErrorCode.PROJECT_NOT_FOUND]: {
    action: RecoveryAction.RECREATE_PROJECT,
    description: 'The project directory does not exist. Try creating a new project.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.PROJECT_ALREADY_EXISTS]: {
    action: RecoveryAction.NONE,
    description: 'Project already exists. Use existing project or specify different name.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.PROJECT_CORRUPTED]: {
    action: RecoveryAction.RESTORE_PROJECT_FROM_BACKUP,
    description: 'Project state is corrupted. Attempt to restore from backup.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.TRANSITION_BLOCKED]: {
    action: RecoveryAction.RETRY_TRANSITION,
    description: 'State transition blocked. Check prerequisites and retry.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.INVALID_STATE]: {
    action: RecoveryAction.RESET_TO_KNOWN_STATE,
    description: 'Invalid state detected. Reset to a known good state.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.STATE_MACHINE_INITIALIZATION_FAILED]: {
    action: RecoveryAction.RESET_TO_KNOWN_STATE,
    description: 'State machine failed to initialize. Try resetting state.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.FILE_NOT_FOUND]: {
    action: RecoveryAction.CREATE_FILE,
    description: 'Required file not found. Create the missing file.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.FILE_CORRUPTED]: {
    action: RecoveryAction.RESTORE_FROM_BACKUP,
    description: 'File content is corrupted. Restore from backup.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.PERMISSION_DENIED]: {
    action: RecoveryAction.CHECK_PERMISSIONS,
    description: 'Permission denied. Check file/directory permissions.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.DIRECTORY_NOT_FOUND]: {
    action: RecoveryAction.CREATE_FILE,
    description: 'Directory not found. Create the required directory structure.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.VALIDATION_FAILED]: {
    action: RecoveryAction.FIX_INPUT,
    description: 'Validation failed. Fix input data and retry.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.INVALID_INPUT]: {
    action: RecoveryAction.FIX_INPUT,
    description: 'Invalid input provided. Correct the input and retry.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.MISSING_REQUIRED_FIELD]: {
    action: RecoveryAction.PROMPT_USER,
    description: 'Required field is missing. Prompt user for the missing value.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.INVALID_CONFIGURATION]: {
    action: RecoveryAction.USE_DEFAULT_CONFIG,
    description: 'Configuration is invalid. Use default configuration.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.NETWORK_ERROR]: {
    action: RecoveryAction.RETRY_WITH_BACKOFF,
    description: 'Network error occurred. Retry with exponential backoff.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.API_TIMEOUT]: {
    action: RecoveryAction.RETRY,
    description: 'API request timed out. Retry the request.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.RATE_LIMIT_EXCEEDED]: {
    action: RecoveryAction.RETRY_WITH_BACKOFF,
    description: 'Rate limit exceeded. Wait and retry with backoff.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.COMMAND_FAILED]: {
    action: RecoveryAction.RETRY,
    description: 'Command execution failed. Retry the command.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.SCRIPT_ERROR]: {
    action: RecoveryAction.FIX_SCRIPT,
    description: 'Script error occurred. Fix the script and retry.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.SYNTAX_ERROR]: {
    action: RecoveryAction.FIX_SCRIPT,
    description: 'Syntax error in script. Fix syntax and retry.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.TYPE_ERROR]: {
    action: RecoveryAction.FIX_SCRIPT,
    description: 'Type error detected. Fix type issues in the script.',
    estimatedImpact: 'low'
  },
  [VibeFlowErrorCode.CONCURRENT_MODIFICATION]: {
    action: RecoveryAction.WAIT_FOR_RELEASE,
    description: 'Concurrent modification detected. Wait and retry.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.LOCK_ACQUISITION_FAILED]: {
    action: RecoveryAction.WAIT_FOR_RELEASE,
    description: 'Failed to acquire lock. Wait for resource release.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.OUT_OF_MEMORY]: {
    action: RecoveryAction.FREE_RESOURCES,
    description: 'Out of memory. Free resources and retry.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.DISK_FULL]: {
    action: RecoveryAction.FREE_RESOURCES,
    description: 'Disk is full. Free disk space.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.RESOURCE_NOT_FOUND]: {
    action: RecoveryAction.RECREATE_PROJECT,
    description: 'Required resource not found. Recreate the resource.',
    estimatedImpact: 'medium'
  },
  [VibeFlowErrorCode.UNKNOWN_ERROR]: {
    action: RecoveryAction.ESCALATE,
    description: 'Unknown error occurred. Escalate for manual investigation.',
    estimatedImpact: 'high'
  },
  [VibeFlowErrorCode.INTERNAL_ERROR]: {
    action: RecoveryAction.ESCALATE,
    description: 'Internal error occurred. Escalate for manual investigation.',
    estimatedImpact: 'high'
  }
};

// Create a typed VibeFlowError
export function createVibeFlowError(
  code: VibeFlowErrorCode,
  message: string,
  originalError?: Error,
  context?: Record<string, any>
): VibeFlowError {
  const error = new Error(message) as VibeFlowError;
  error.code = code;
  error.suggestedAction = ERROR_ACTION_MAP[code];
  error.originalError = originalError;
  error.context = context;
  return error;
}

// Get suggested action for a VibeFlowError
export function getSuggestedAction(error: VibeFlowError): SuggestedAction {
  return error.suggestedAction;
}

// Try to recover automatically based on suggested action
export async function tryAutoRecovery<T>(
  operation: () => Promise<T>,
  suggestedAction: SuggestedAction
): Promise<{ success: boolean; result?: T; action: RecoveryAction }> {
  switch (suggestedAction.action) {
    case RecoveryAction.RETRY:
    case RecoveryAction.RETRY_WITH_BACKOFF:
    case RecoveryAction.RETRY_TRANSITION:
      return operation()
        .then(result => ({ success: true, result, action: suggestedAction.action }))
        .catch(() => ({ success: false, action: suggestedAction.action }));

    case RecoveryAction.USE_DEFAULT_CONFIG:
    case RecoveryAction.USE_CACHED_DATA:
    case RecoveryAction.SKIP_OPERATION:
      return { success: false, action: suggestedAction.action };

    default:
      return { success: false, action: suggestedAction.action };
  }
}

export class ErrorHandler {
  private retryConfig: RetryConfig;
  private errorLog: ErrorLogEntry[] = [];

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  // FR-008: Classify errors as retryable vs non-retryable
  classifyError(error: any): ErrorClassification {
    // If it's already a VibeFlowError, use its suggested action
    if (error.code && error.suggestedAction) {
      const suggestedAction = error.suggestedAction;

      if (suggestedAction.action === RecoveryAction.ESCALATE) {
        return {
          severity: ErrorSeverity.FATAL,
          canRecover: false,
          recoveryStrategy: RecoveryStrategy.ESCALATE
        };
      }

      if (suggestedAction.action === RecoveryAction.NONE ||
          suggestedAction.action === RecoveryAction.PROMPT_USER) {
        return {
          severity: ErrorSeverity.NON_RETRYABLE,
          canRecover: false,
          recoveryStrategy: RecoveryStrategy.NONE
        };
      }

      return {
        severity: ErrorSeverity.RETRYABLE,
        canRecover: true,
        recoveryStrategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
        maxRetries: this.retryConfig.maxRetries
      };
    }

    const errorMessage = error.message || String(error);
    const errorCode = error.code || error.name || 'UNKNOWN';

    // Non-retryable errors (permanent failures)
    if (this.isNonRetryable(errorMessage, errorCode)) {
      return {
        severity: ErrorSeverity.NON_RETRYABLE,
        canRecover: false,
        recoveryStrategy: RecoveryStrategy.NONE
      };
    }

    // Fatal errors (system-level failures)
    if (this.isFatal(errorMessage, errorCode)) {
      return {
        severity: ErrorSeverity.FATAL,
        canRecover: false,
        recoveryStrategy: RecoveryStrategy.ESCALATE
      };
    }

    // Retryable errors (temporary failures)
    return {
      severity: ErrorSeverity.RETRYABLE,
      canRecover: true,
      recoveryStrategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
      maxRetries: this.retryConfig.maxRetries
    };
  }

  // Map error to VibeFlowErrorCode
  mapToErrorCode(error: any): VibeFlowErrorCode {
    const message = error.message || String(error);
    const code = error.code || error.name || '';

    // Project errors
    if (/project.*not found/i.test(message) || /ENOENT.*project/i.test(message)) {
      return VibeFlowErrorCode.PROJECT_NOT_FOUND;
    }
    if (/project.*already exists/i.test(message)) {
      return VibeFlowErrorCode.PROJECT_ALREADY_EXISTS;
    }
    if (/project.*corrupt/i.test(message) || /invalid.*project.*state/i.test(message)) {
      return VibeFlowErrorCode.PROJECT_CORRUPTED;
    }

    // State machine errors
    if (/transition.*block/i.test(message) || /cannot transition/i.test(message)) {
      return VibeFlowErrorCode.TRANSITION_BLOCKED;
    }
    if (/invalid.*state/i.test(message)) {
      return VibeFlowErrorCode.INVALID_STATE;
    }
    if (/state.*machine.*init/i.test(message) || /state.*init/i.test(message)) {
      return VibeFlowErrorCode.STATE_MACHINE_INITIALIZATION_FAILED;
    }

    // File system errors
    if (/file.*not found/i.test(message) || /ENOENT/i.test(code)) {
      return VibeFlowErrorCode.FILE_NOT_FOUND;
    }
    if (/file.*corrupt/i.test(message) || /invalid.*file/i.test(message)) {
      return VibeFlowErrorCode.FILE_CORRUPTED;
    }
    if (/permission denied|EACCES|EPERM/i.test(message) || /permission/i.test(code)) {
      return VibeFlowErrorCode.PERMISSION_DENIED;
    }
    if (/directory.*not found|ENOTDIR/i.test(message)) {
      return VibeFlowErrorCode.DIRECTORY_NOT_FOUND;
    }

    // Validation errors
    if (/validation.*fail/i.test(message)) {
      return VibeFlowErrorCode.VALIDATION_FAILED;
    }
    if (/invalid.*input|invalid.*argument/i.test(message)) {
      return VibeFlowErrorCode.INVALID_INPUT;
    }
    if (/missing.*required|required.*field/i.test(message)) {
      return VibeFlowErrorCode.MISSING_REQUIRED_FIELD;
    }
    if (/invalid.*configuration|invalid.*config/i.test(message)) {
      return VibeFlowErrorCode.INVALID_CONFIGURATION;
    }

    // Network errors
    if (/network.*error|ECONNREFUSED|ECONNRESET/i.test(message)) {
      return VibeFlowErrorCode.NETWORK_ERROR;
    }
    if (/timeout|ETIMEDOUT/i.test(message) || /timeout/i.test(code)) {
      return VibeFlowErrorCode.API_TIMEOUT;
    }
    if (/rate.*limit|429/i.test(message)) {
      return VibeFlowErrorCode.RATE_LIMIT_EXCEEDED;
    }

    // Execution errors
    if (/command.*fail|spawn.*fail/i.test(message) || /non-zero.*status/i.test(message)) {
      return VibeFlowErrorCode.COMMAND_FAILED;
    }
    if (/script.*error/i.test(message)) {
      return VibeFlowErrorCode.SCRIPT_ERROR;
    }
    if (/syntax.*error|parse.*error/i.test(message)) {
      return VibeFlowErrorCode.SYNTAX_ERROR;
    }
    if (/type.*error/i.test(message) || /TS\d+/i.test(code)) {
      return VibeFlowErrorCode.TYPE_ERROR;
    }

    // Concurrency errors
    if (/concurrent.*modification|concurrent.*access/i.test(message)) {
      return VibeFlowErrorCode.CONCURRENT_MODIFICATION;
    }
    if (/lock.*fail/i.test(message)) {
      return VibeFlowErrorCode.LOCK_ACQUISITION_FAILED;
    }

    // Resource errors
    if (/out of memory|heap.*space|ENOMEM/i.test(message)) {
      return VibeFlowErrorCode.OUT_OF_MEMORY;
    }
    if (/disk.*full|no.*space.*left|ENOSPC/i.test(message)) {
      return VibeFlowErrorCode.DISK_FULL;
    }

    return VibeFlowErrorCode.UNKNOWN_ERROR;
  }

  // Convert any error to a VibeFlowError
  toVibeFlowError(error: any, context?: Record<string, any>): VibeFlowError {
    if (error.code && error.suggestedAction) {
      return error as VibeFlowError;
    }

    const errorCode = this.mapToErrorCode(error);
    return createVibeFlowError(
      errorCode,
      error.message || String(error),
      error instanceof Error ? error : undefined,
      context
    );
  }

  private isNonRetryable(message: string, code: string): boolean {
    const nonRetryablePatterns = [
      /not found/i,
      /invalid.*input/i,
      /permission denied/i,
      /unauthorized/i,
      /not permitted/i,
      /already exists/i,
      /duplicate/i,
      /conflict/i,
      /bad request/i,
      /validation failed/i,
      /invalid configuration/i,
      /missing required/i,
      /syntax error/i,
      /type error/i
    ];

    return nonRetryablePatterns.some(pattern =>
      pattern.test(message) || pattern.test(code)
    );
  }

  private isFatal(message: string, code: string): boolean {
    const fatalPatterns = [
      /out of memory/i,
      /heap space/i,
      /fatal/i,
      /crash/i,
      /segmentation fault/i,
      /SIGKILL/i,
      /ENOENT.*system/i,
      /system error/i,
      /disk full/i,
      /no space left/i
    ];

    return fatalPatterns.some(pattern =>
      pattern.test(message) || pattern.test(code)
    );
  }

  // Automatic recovery attempts
  async attemptRecovery<T>(
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<RecoveryResult<T>> {
    let attempt = 0;
    let lastError: any;

    while (attempt < this.retryConfig.maxRetries) {
      try {
        const result = await operation();

        if (attempt > 0) {
          console.log(chalk.green(`✅ Recovery successful on attempt ${attempt + 1}`));
        }

        return {
          success: true,
          result,
          attempts: attempt + 1,
          recovered: attempt > 0
        };
      } catch (error) {
        lastError = error;
        attempt++;

        // Convert to VibeFlowError for better handling
        const vibeFlowError = this.toVibeFlowError(error, context);
        console.log(chalk.yellow(`[${vibeFlowError.code}] ${vibeFlowError.message}`));
        console.log(chalk.gray(`  Suggested action: ${vibeFlowError.suggestedAction.action} - ${vibeFlowError.suggestedAction.description}`));

        const classification = this.classifyError(vibeFlowError);

        // Log the error
        this.logError(vibeFlowError, classification, context);

        if (!classification.canRecover) {
          console.log(chalk.red(`❌ Non-retryable error: ${error}`));
          break;
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoff(attempt);
          console.log(chalk.yellow(`⚠️ Attempt ${attempt} failed. Retrying in ${delay}ms...`));
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attempt,
      recovered: false
    };
  }

  private calculateBackoff(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logError(error: any, classification: ErrorClassification, context?: Record<string, any>): void {
    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      code: error.code,
      classification,
      context
    };
    this.errorLog.push(entry);

    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }

  getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  getRetryableErrorCount(): number {
    return this.errorLog.filter(e => e.classification.severity === ErrorSeverity.RETRYABLE).length;
  }

  getNonRetryableErrorCount(): number {
    return this.errorLog.filter(e => e.classification.severity === ErrorSeverity.NON_RETRYABLE).length;
  }

  clearErrorLog(): void {
    this.errorLog = [];
  }
}

export interface ErrorLogEntry {
  timestamp: string;
  message: string;
  code?: string;
  classification: ErrorClassification;
  context?: Record<string, any>;
}

export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: number;
  recovered: boolean;
}
