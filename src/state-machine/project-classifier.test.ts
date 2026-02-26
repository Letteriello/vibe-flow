// Project State Classifier Tests - Story 1.2
import { ProjectStateClassifier, ProjectClassification } from './project-classifier.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_PROJECT_DIR = join(tmpdir(), 'vibe-flow-test-project');

describe('ProjectStateClassifier', () => {
  let classifier: ProjectStateClassifier;

  beforeEach(async () => {
    // Create clean test directory
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }
    await fs.mkdir(TEST_PROJECT_DIR, { recursive: true });
    classifier = new ProjectStateClassifier(TEST_PROJECT_DIR);
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('AC #1: NEW classification', () => {
    it('should classify as NEW when no artifacts exist', async () => {
      const result = await classifier.classify();

      expect(result.classification).toBe(ProjectClassification.NEW);
      expect(result.confidence).toBe(1.0);
      expect(result.recommendedPhase).toBe('ANALYSIS');
    });

    it('should suggest initial workflow for NEW projects', async () => {
      const result = await classifier.classify();

      expect(result.artifactsMissing).toContain('.vibe-flow/ state directory');
      expect(result.artifactsMissing).toContain('progress.json');
    });
  });

  describe('AC #2: REVERSE_ENGINEERING classification', () => {
    it('should classify as REVERSE_ENGINEERING when code exists but no artifacts', async () => {
      // Create source code directory
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src', 'index.ts'), 'console.log("test")');

      const result = await classifier.classify();

      expect(result.classification).toBe(ProjectClassification.REVERSE_ENGINEERING);
      expect(result.confidence).toBe(0.85);
    });

    it('should prepare for analyze_project for reverse engineering', async () => {
      // Create source code directory
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src', 'index.js'), 'console.log("test")');

      const result = await classifier.classify();

      expect(result.recommendedPhase).toBe('ANALYSIS');
      expect(result.artifactsMissing).toContain('.vibe-flow/ state directory');
    });
  });

  describe('AC #3: IN_PROGRESS classification', () => {
    it('should classify as IN_PROGRESS when .vibe-flow exists', async () => {
      // Create vibe-flow directory with state
      await fs.mkdir(join(TEST_PROJECT_DIR, '.vibe-flow'), { recursive: true });
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'ANALYSIS', currentStep: 1 })
      );

      const result = await classifier.classify();

      expect(result.classification).toBe(ProjectClassification.IN_PROGRESS);
      expect(result.confidence).toBe(0.95);
    });

    it('should point to next resumable step for IN_PROGRESS', async () => {
      // Create vibe-flow directory with state
      await fs.mkdir(join(TEST_PROJECT_DIR, '.vibe-flow'), { recursive: true });
      await fs.writeFile(
        join(TEST_PROJECT_DIR, '.vibe-flow', 'state.json'),
        JSON.stringify({ phase: 'PLANNING', currentStep: 3 })
      );

      const result = await classifier.classify();

      expect(result.recommendedPhase).toBeDefined();
    });

    it('should detect IN_PROGRESS when progress.json exists', async () => {
      await fs.writeFile(
        join(TEST_PROJECT_DIR, 'progress.json'),
        JSON.stringify({ phase: 'IMPLEMENTATION' })
      );

      const result = await classifier.classify();

      expect(result.classification).toBe(ProjectClassification.IN_PROGRESS);
      expect(result.artifactsFound).toContain('progress.json');
    });
  });

  describe('Quick check methods', () => {
    it('isNew should return true for new project', async () => {
      expect(await classifier.isNew()).toBe(true);
    });

    it('isInProgress should return false for new project', async () => {
      expect(await classifier.isInProgress()).toBe(false);
    });

    it('needsReverseEngineering should return false for new project', async () => {
      expect(await classifier.needsReverseEngineering()).toBe(false);
    });

    it('isInProgress should return true when artifacts exist', async () => {
      await fs.mkdir(join(TEST_PROJECT_DIR, '.vibe-flow'), { recursive: true });

      expect(await classifier.isInProgress()).toBe(true);
    });
  });

  describe('Source code detection', () => {
    it('should detect TypeScript source code', async () => {
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src', 'main.ts'), 'const x = 1;');

      const result = await classifier.classify();

      expect(result.indicators).toContain('source code detected');
    });

    it('should detect JavaScript source code', async () => {
      await fs.writeFile(join(TEST_PROJECT_DIR, 'app.js'), 'const x = 1;');

      const result = await classifier.classify();

      expect(result.indicators).toContain('source code detected');
    });

    it('should detect Python source code', async () => {
      await fs.mkdir(join(TEST_PROJECT_DIR, 'lib'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'lib', 'main.py'), 'x = 1');

      const result = await classifier.classify();

      expect(result.indicators).toContain('source code detected');
    });

    it('should detect Go source code', async () => {
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src', 'main.go'), 'package main');

      const result = await classifier.classify();

      expect(result.indicators).toContain('source code detected');
    });
  });
});
