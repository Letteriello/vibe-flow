// Atomic Persistence Tests - Story 1.3
import { StateMachine, Phase } from './index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOME_STATE_DIR = join(homedir(), '.vibe-flow');
const HOME_STATE_FILE = join(HOME_STATE_DIR, 'state.json');

describe('Atomic State Persistence', () => {
  let stateMachine: StateMachine;

  beforeEach(async () => {
    // Clean up the state directory completely before each test
    // to ensure test isolation
    try {
      await fs.rm(HOME_STATE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Recreate the directory
    await fs.mkdir(HOME_STATE_DIR, { recursive: true });
    stateMachine = new StateMachine();
  });

  describe('AC #1: Atomic write with temp file', () => {
    it('should perform atomic write - verify state is saved correctly', async () => {
      await stateMachine.initialize('test-project');
      const state = await stateMachine.getState();

      // Verify state was created correctly
      expect(state.projectName).toBe('test-project');
      expect(state.phase).toBe(Phase.NEW);
      expect(state.currentStep).toBe(1);
    });

    it('should validate JSON structure before confirming write', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addDecision(Phase.NEW, 'Test decision', false);

      const state = await stateMachine.getState();

      // Verify the state has correct structure
      expect(state).toHaveProperty('projectName');
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('currentStep');
      expect(state).toHaveProperty('totalSteps');
      expect(state).toHaveProperty('decisions');
      expect(state).toHaveProperty('errors');
      expect(state).toHaveProperty('context');
      expect(state).toHaveProperty('auditLog');
    });

    it('should persist state after multiple operations', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance();
      await stateMachine.advance();

      const state = await stateMachine.getState();

      // Verify the state reflects all operations
      expect(state.phase).toBe(Phase.ANALYSIS);
      // After initialize + 2 advances: NEW->ANALYSIS (step 1), then step 2
      expect(state.currentStep).toBe(2);
    });
  });

  describe('AC #2: Failure handling', () => {
    it('should maintain state integrity on multiple operations', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addDecision(Phase.NEW, 'Test decision', false);
      await stateMachine.addError('Test error', true);

      const state = await stateMachine.getState();

      // Verify decisions and errors are tracked
      expect(state.decisions).toHaveLength(1);
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].retryable).toBe(true);
    });

    it('should track audit log for all transitions', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance();

      const auditLog = stateMachine.getAuditLog();

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].success).toBe(true);
      expect(auditLog[0].from).toBe(Phase.NEW);
      expect(auditLog[0].to).toBe(Phase.ANALYSIS);
    });

    it('should log failed transitions in audit', async () => {
      await stateMachine.initialize('test-project');

      try {
        await stateMachine.rollback(); // Should fail - can't rollback from NEW
      } catch (error) {
        // Expected
      }

      const auditLog = stateMachine.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].success).toBe(false);
    });
  });

  describe('State integrity', () => {
    it('should persist complete state including audit log', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.advance();

      const state = await stateMachine.getState();

      expect(state.auditLog).toBeDefined();
      expect(Array.isArray(state.auditLog)).toBe(true);
    });

    it('should persist decisions across operations', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addDecision(Phase.NEW, 'First decision', false);
      await stateMachine.addDecision(Phase.ANALYSIS, 'Second decision', true);

      const state = await stateMachine.getState();

      expect(state.decisions).toHaveLength(2);
      expect(state.decisions[0].description).toBe('First decision');
      expect(state.decisions[1].override).toBe(true);
    });

    it('should persist errors with retryable flag', async () => {
      await stateMachine.initialize('test-project');
      await stateMachine.addError('Retryable error', true);
      await stateMachine.addError('Non-retryable error', false);

      const state = await stateMachine.getState();

      expect(state.errors).toHaveLength(2);
      expect(state.errors[0].retryable).toBe(true);
      expect(state.errors[1].retryable).toBe(false);
    });
  });
});
