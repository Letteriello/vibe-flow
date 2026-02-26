// StateMachine Tests
import { StateMachine, Phase, ActionType, InvalidTransitionError, ErrorCode, isTransitionValid, getValidTransitions } from './state-machine/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test state file location
const TEST_STATE_FILE = join(tmpdir(), '.vibe-flow-test', 'state.json');

describe('StateMachine', () => {
  let stateMachine: StateMachine;

  beforeEach(async () => {
    stateMachine = new StateMachine();
    // Clean up test state before each test
    try {
      await fs.unlink(TEST_STATE_FILE);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe('Valid Transitions', () => {
    it('should allow advance from NEW to ANALYSIS', () => {
      expect(isTransitionValid(Phase.NEW, ActionType.ADVANCE)).toBe(true);
    });

    it('should allow advance from ANALYSIS to PLANNING', () => {
      expect(isTransitionValid(Phase.ANALYSIS, ActionType.ADVANCE)).toBe(true);
    });

    it('should allow rollback from ANALYSIS to NEW', () => {
      expect(isTransitionValid(Phase.ANALYSIS, ActionType.ROLLBACK)).toBe(true);
    });

    it('should not allow rollback from NEW', () => {
      expect(isTransitionValid(Phase.NEW, ActionType.ROLLBACK)).toBe(false);
    });

    it('should not allow skip from any phase', () => {
      expect(isTransitionValid(Phase.NEW, ActionType.SKIP)).toBe(false);
      expect(isTransitionValid(Phase.ANALYSIS, ActionType.SKIP)).toBe(false);
    });

    it('should get valid transitions for ANALYSIS', () => {
      const valid = getValidTransitions(Phase.ANALYSIS);
      expect(valid).toContain(Phase.PLANNING);  // advance
      expect(valid).toContain(Phase.NEW);      // rollback
    });
  });

  describe('Deterministic Error Handling', () => {
    it('should throw InvalidTransitionError with correct code for invalid rollback from NEW', async () => {
      await stateMachine.initialize('test-project');

      try {
        await stateMachine.rollback();
        fail('Expected InvalidTransitionError');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        if (error instanceof InvalidTransitionError) {
          expect(error.code).toBe(ErrorCode.INVALID_TRANSITION);
          expect(error.from).toBe(Phase.NEW);
          expect(error.action).toBe(ActionType.ROLLBACK);
          expect(error.recovery).toBe('retry_valid_action');
        }
      }
    });

    it('should throw InvalidTransitionError for skip attempt', async () => {
      await stateMachine.initialize('test-project');

      try {
        await stateMachine.transition(ActionType.SKIP);
        fail('Expected InvalidTransitionError');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        if (error instanceof InvalidTransitionError) {
          expect(error.code).toBe(ErrorCode.INVALID_TRANSITION);
        }
      }
    });
  });

  describe('Audit Trail', () => {
    it('should log successful transitions', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance(); // NEW -> ANALYSIS

      const auditLog = stateMachine.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].success).toBe(true);
      expect(auditLog[0].from).toBe(Phase.NEW);
      expect(auditLog[0].to).toBe(Phase.ANALYSIS);
      expect(auditLog[0].correlationId).toBeDefined();
    });

    it('should log failed transitions', async () => {
      await stateMachine.initialize('test-project');

      try {
        await stateMachine.rollback(); // Should fail - can't rollback from NEW
      } catch (error) {
        // Expected
      }

      const auditLog = stateMachine.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].success).toBe(false);
      expect(auditLog[0].errorCode).toBe(ErrorCode.INVALID_TRANSITION);
    });

    it('should include timestamp in audit entries', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance();

      const auditLog = stateMachine.getAuditLog();
      expect(auditLog[0].timestamp).toBeDefined();
      expect(new Date(auditLog[0].timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('initialize', () => {
    it('should initialize a new project with NEW phase', async () => {
      const state = await stateMachine.initialize('test-project');
      expect(state.projectName).toBe('test-project');
      expect(state.phase).toBe(Phase.NEW);
      expect(state.currentStep).toBe(1);
      expect(state.totalSteps).toBe(1);
    });

    it('should reject empty project name', async () => {
      await expect(stateMachine.initialize('')).rejects.toThrow('Project name is required');
    });

    it('should reject whitespace-only project name', async () => {
      await expect(stateMachine.initialize('   ')).rejects.toThrow('Project name is required');
    });

    it('should reject project name longer than 255 characters', async () => {
      const longName = 'a'.repeat(256);
      await expect(stateMachine.initialize(longName)).rejects.toThrow('less than 255 characters');
    });
  });

  describe('advance', () => {
    it('should advance from NEW to ANALYSIS phase', async () => {
      await stateMachine.initialize('test-project');
      const state = await stateMachine.advance();

      expect(state.phase).toBe(Phase.ANALYSIS);
      expect(state.currentStep).toBe(1);
      expect(state.totalSteps).toBe(5);
    });

    it('should advance steps within the same phase', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance(); // Go to ANALYSIS

      const state = await stateMachine.advance();
      expect(state.phase).toBe(Phase.ANALYSIS);
      expect(state.currentStep).toBe(2);
    });
  });

  describe('phase transitions', () => {
    it('should complete all phase transitions correctly', async () => {
      await stateMachine.initialize('test-project');

      // NEW -> ANALYSIS
      let state = await stateMachine.advance();
      expect(state.phase).toBe(Phase.ANALYSIS);

      // ANALYSIS -> PLANNING (after 5 steps)
      for (let i = 0; i < 5; i++) {
        state = await stateMachine.advance();
      }
      expect(state.phase).toBe(Phase.PLANNING);

      // PLANNING -> SOLUTIONING (after 4 steps)
      for (let i = 0; i < 4; i++) {
        state = await stateMachine.advance();
      }
      expect(state.phase).toBe(Phase.SOLUTIONING);
    });
  });

  describe('addDecision', () => {
    it('should add a decision to the state', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addDecision(Phase.NEW, 'Test decision', false);

      const state = await stateMachine.getState();
      expect(state.decisions).toHaveLength(1);
      expect(state.decisions[0].description).toBe('Test decision');
    });
  });

  describe('addError', () => {
    it('should add an error to the state', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addError('Test error', true);

      const state = await stateMachine.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].message).toBe('Test error');
      expect(state.errors[0].retryable).toBe(true);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', async () => {
      await stateMachine.initialize('test-project');

      const progress = stateMachine.getProgress();
      expect(progress.current).toBeGreaterThan(0);
      expect(progress.total).toBeGreaterThan(0);
      expect(progress.percentage).toBeGreaterThanOrEqual(0);
    });
  });
});
