// State Drift Detector Tests - Story 1.4
import { StateDriftDetector, DriftStatus } from './state-drift-detector.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_PROJECT_DIR = join(tmpdir(), 'vibe-flow-test-drift');

describe('StateDriftDetector', () => {
  let detector: StateDriftDetector;

  beforeEach(async () => {
    // Create clean test directory
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
    await fs.mkdir(join(TEST_PROJECT_DIR, '.vibe-flow'), { recursive: true });
    detector = new StateDriftDetector(TEST_PROJECT_DIR);
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('AC #1: Drift Detection', () => {
    it('should return CONSISTENT when no state file exists', async () => {
      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.CONSISTENT);
      expect(result.driftDetails).toHaveLength(0);
    });

    it('should detect missing required artifacts', async () => {
      // Create state file with ANALYSIS phase
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.DETECTED);
      expect(result.driftDetails.length).toBeGreaterThan(0);
      expect(result.driftDetails[0].type).toBe('missing_file');
    });

    it('should present 3 recovery options when drift detected', async () => {
      // Create state file with ANALYSIS phase
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.DETECTED);
      expect(result.recoveryOptions).toHaveLength(3);
      expect(result.recoveryOptions.map(o => o.action)).toContain('reconcile');
      expect(result.recoveryOptions.map(o => o.action)).toContain('manual');
      expect(result.recoveryOptions.map(o => o.action)).toContain('rollback');
    });

    it('should mark as STATE_DRIFT_DETECTED when artifacts missing', async () => {
      // Create state file with PLANNING phase - requires .bmad/brief.md
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'PLANNING', projectName: 'test' })
      );

      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.DETECTED);
    });
  });

  describe('AC #2: Auto Reconciliation', () => {
    it('should return success when no drift detected', async () => {
      const result = await detector.reconcile();

      expect(result.success).toBe(true);
    });

    it('should reconcile when drift detected', async () => {
      // Create state file with ANALYSIS phase (missing .bmad/brief.md)
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.reconcile();

      expect(result.success).toBe(true);
    });

    it('should update state with drift info after reconciliation', async () => {
      // Create state file with ANALYSIS phase
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      await detector.reconcile();

      // Verify state was updated with drift info
      const content = await fs.readFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        'utf-8'
      );
      const state = JSON.parse(content);

      expect(state.driftDetected).toBe(true);
      expect(state.lastDriftCheck).toBeDefined();
    });

    it('should preserve valid progress during reconciliation', async () => {
      // Create state with some progress
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({
          phase: 'ANALYSIS',
          projectName: 'test',
          currentStep: 3,
          decisions: [{ id: '1', phase: 'ANALYSIS', description: 'Test', timestamp: '2024-01-01' }]
        })
      );

      await detector.reconcile();

      // Verify progress is preserved
      const content = await fs.readFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        'utf-8'
      );
      const state = JSON.parse(content);

      expect(state.projectName).toBe('test');
      expect(state.currentStep).toBe(3);
      expect(state.decisions).toHaveLength(1);
    });
  });

  describe('Recovery Options', () => {
    it('should have low risk for auto-reconcile', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();
      const autoReconcile = result.recoveryOptions.find(o => o.action === 'reconcile');

      expect(autoReconcile?.risk).toBe('low');
    });

    it('should have medium risk for manual correction', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();
      const manual = result.recoveryOptions.find(o => o.action === 'manual');

      expect(manual?.risk).toBe('medium');
    });

    it('should have high risk for rollback', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();
      const rollback = result.recoveryOptions.find(o => o.action === 'rollback');

      expect(rollback?.risk).toBe('high');
    });
  });

  describe('Phase-specific artifacts', () => {
    it('should check ANALYSIS required artifacts', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );

      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.DETECTED);
    });

    it('should check PLANNING required artifacts', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'PLANNING', projectName: 'test' })
      );

      const result = await detector.detectDrift();

      expect(result.status).toBe(DriftStatus.DETECTED);
    });

    it('should require more artifacts for later phases', async () => {
      // ANALYSIS phase - 1 required artifact
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', projectName: 'test' })
      );
      const analysisResult = await detector.detectDrift();
      const analysisDriftCount = analysisResult.driftDetails.length;

      // IMPLEMENTATION phase - 4 required artifacts
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'IMPLEMENTATION', projectName: 'test' })
      );
      const implResult = await detector.detectDrift();
      const implDriftCount = implResult.driftDetails.length;

      expect(implDriftCount).toBeGreaterThan(analysisDriftCount);
    });
  });
});
