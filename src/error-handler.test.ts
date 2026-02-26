// Error Handler Tests
import {
  ErrorHandler,
  VibeFlowErrorCode,
  RecoveryAction,
  createVibeFlowError,
  ErrorSeverity,
  RecoveryStrategy
} from './error-handler/index.js';

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('createVibeFlowError', () => {
    it('should create error with PROJECT_NOT_FOUND code', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.PROJECT_NOT_FOUND,
        'Project not found at path /test'
      );

      expect(error.code).toBe(VibeFlowErrorCode.PROJECT_NOT_FOUND);
      expect(error.message).toBe('Project not found at path /test');
      expect(error.suggestedAction.action).toBe(RecoveryAction.RECREATE_PROJECT);
      expect(error.suggestedAction.description).toContain('creating');
    });

    it('should create error with TRANSITION_BLOCKED code', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.TRANSITION_BLOCKED,
        'Cannot transition from state A to state B'
      );

      expect(error.code).toBe(VibeFlowErrorCode.TRANSITION_BLOCKED);
      expect(error.suggestedAction.action).toBe(RecoveryAction.RETRY_TRANSITION);
    });

    it('should create error with FILE_NOT_FOUND code', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.FILE_NOT_FOUND,
        'config.json not found'
      );

      expect(error.code).toBe(VibeFlowErrorCode.FILE_NOT_FOUND);
      expect(error.suggestedAction.action).toBe(RecoveryAction.CREATE_FILE);
    });

    it('should create error with SYNTAX_ERROR code', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.SYNTAX_ERROR,
        'Unexpected token at line 5'
      );

      expect(error.code).toBe(VibeFlowErrorCode.SYNTAX_ERROR);
      expect(error.suggestedAction.action).toBe(RecoveryAction.FIX_SCRIPT);
    });
  });

  describe('mapToErrorCode', () => {
    it('should map "project not found" to PROJECT_NOT_FOUND', () => {
      const error = new Error('Project not found at /path');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.PROJECT_NOT_FOUND);
    });

    it('should map "transition blocked" to TRANSITION_BLOCKED', () => {
      const error = new Error('Transition blocked: invalid state');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.TRANSITION_BLOCKED);
    });

    it('should map "file not found" to FILE_NOT_FOUND', () => {
      const error = new Error('ENOENT: file not found');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.FILE_NOT_FOUND);
    });

    it('should map "syntax error" to SYNTAX_ERROR', () => {
      const error = new Error('Syntax error: unexpected token');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.SYNTAX_ERROR);
    });

    it('should map "permission denied" to PERMISSION_DENIED', () => {
      const error = new Error('EACCES: permission denied');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.PERMISSION_DENIED);
    });

    it('should map "timeout" to API_TIMEOUT', () => {
      const error = new Error('timeout');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.API_TIMEOUT);
    });

    it('should map unknown errors to UNKNOWN_ERROR', () => {
      const error = new Error('Some random error');
      const code = handler.mapToErrorCode(error);
      expect(code).toBe(VibeFlowErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('classifyError', () => {
    it('should classify VibeFlowError with ESCALATE action as FATAL', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.INTERNAL_ERROR,
        'Internal error'
      );

      const classification = handler.classifyError(error);
      expect(classification.severity).toBe(ErrorSeverity.FATAL);
      expect(classification.canRecover).toBe(false);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.ESCALATE);
    });

    it('should classify VibeFlowError with RETRY action as RETRYABLE', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.API_TIMEOUT,
        'Request timed out'
      );

      const classification = handler.classifyError(error);
      expect(classification.severity).toBe(ErrorSeverity.RETRYABLE);
      expect(classification.canRecover).toBe(true);
    });

    it('should classify VibeFlowError with NONE action as NON_RETRYABLE', () => {
      const error = createVibeFlowError(
        VibeFlowErrorCode.PROJECT_ALREADY_EXISTS,
        'Project already exists'
      );

      const classification = handler.classifyError(error);
      expect(classification.severity).toBe(ErrorSeverity.NON_RETRYABLE);
      expect(classification.canRecover).toBe(false);
    });
  });

  describe('toVibeFlowError', () => {
    it('should convert regular error to VibeFlowError', () => {
      const regularError = new Error('Project not found at /test');
      const vibeError = handler.toVibeFlowError(regularError);

      expect(vibeError.code).toBe(VibeFlowErrorCode.PROJECT_NOT_FOUND);
      expect(vibeError.suggestedAction).toBeDefined();
    });
  });

  describe('attemptRecovery', () => {
    it('should log error with specific error code', async () => {
      let caughtError: any;
      const operation = async () => {
        throw new Error('Project not found');
      };

      const result = await handler.attemptRecovery(operation);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // maxRetries

      const errorLog = handler.getErrorLog();
      expect(errorLog.length).toBe(3); // 3 attempts = 3 error logs
      expect(errorLog[0].code).toBe(VibeFlowErrorCode.PROJECT_NOT_FOUND);
    });

    it('should succeed on first attempt', async () => {
      const operation = async () => 'success';

      const result = await handler.attemptRecovery(operation);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.recovered).toBe(false);
    });
  });
});
