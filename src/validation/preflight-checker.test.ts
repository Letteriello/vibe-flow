// Pre-Flight Checker Tests - Story 7.1
import { PreFlightChecker, PreFlightStatus, runPreFlightChecks } from './preflight-checker.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Use a temp directory for tests
const TEST_PROJECT = join(tmpdir(), 'vibe-flow-preflight-test');

describe('PreFlightChecker', () => {
  let testProjectPath: string;

  beforeEach(async () => {
    // Create test project directory
    testProjectPath = join(TEST_PROJECT, `test-${Date.now()}`);
    await fs.mkdir(testProjectPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('checkPackageJson', () => {
    it('should return MISSING when package.json does not exist', async () => {
      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkDependencies: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const pkgCheck = result.checks.find(c => c.id === 'package-json');
      expect(pkgCheck?.status).toBe(PreFlightStatus.MISSING);
    });

    it('should return READY when package.json is valid', async () => {
      // Create a valid package.json
      const pkg = {
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          test: 'jest'
        }
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkDependencies: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const pkgCheck = result.checks.find(c => c.id === 'package-json');
      expect(pkgCheck?.status).toBe(PreFlightStatus.READY);
      expect(pkgCheck?.details).toBe('test-project@1.0.0');
    });

    it('should return NEEDS_REVIEW when package.json is incomplete', async () => {
      // Create incomplete package.json (missing scripts)
      const pkg = {
        name: 'test-project',
        version: '1.0.0'
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkDependencies: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const pkgCheck = result.checks.find(c => c.id === 'package-json');
      expect(pkgCheck?.status).toBe(PreFlightStatus.NEEDS_REVIEW);
    });
  });

  describe('checkDependencies', () => {
    it('should return SKIPPED when no dependencies are defined', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const depCheck = result.checks.find(c => c.id === 'dependencies');
      expect(depCheck?.status).toBe(PreFlightStatus.SKIPPED);
    });

    it('should return MISSING when dependencies defined but node_modules absent', async () => {
      const pkg = {
        name: 'test-project',
        dependencies: { express: '^4.18.0' }
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const depCheck = result.checks.find(c => c.id === 'dependencies');
      expect(depCheck?.status).toBe(PreFlightStatus.MISSING);
    });

    it('should return READY when dependencies defined and node_modules exists', async () => {
      const pkg = {
        name: 'test-project',
        dependencies: { express: '^4.18.0' }
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );
      // Create node_modules directory
      await fs.mkdir(join(testProjectPath, 'node_modules'), { recursive: true });

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkTests: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const depCheck = result.checks.find(c => c.id === 'dependencies');
      expect(depCheck?.status).toBe(PreFlightStatus.READY);
    });
  });

  describe('checkTests', () => {
    it('should return MISSING when no test files exist', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkDependencies: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const testCheck = result.checks.find(c => c.id === 'tests');
      expect(testCheck?.status).toBe(PreFlightStatus.MISSING);
    });

    it('should return READY when test files exist in test/ directory', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      // Create test directory with test file
      await fs.mkdir(join(testProjectPath, 'test'), { recursive: true });
      await fs.writeFile(
        join(testProjectPath, 'test', 'example.test.ts'),
        'describe("test", () => { it("works", () => {}); });'
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkDependencies: false,
        checkDocumentation: false
      });

      const result = await checker.check();

      const testCheck = result.checks.find(c => c.id === 'tests');
      expect(testCheck?.status).toBe(PreFlightStatus.READY);
    });
  });

  describe('checkDocumentation', () => {
    it('should return MISSING when no documentation exists', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkDependencies: false,
        checkTests: false
      });

      const result = await checker.check();

      const docCheck = result.checks.find(c => c.id === 'documentation');
      expect(docCheck?.status).toBe(PreFlightStatus.MISSING);
    });

    it('should return READY when README.md exists', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );
      await fs.writeFile(
        join(testProjectPath, 'README.md'),
        '# Test Project\n\nThis is a test.'
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkDependencies: false,
        checkTests: false
      });

      const result = await checker.check();

      const docCheck = result.checks.find(c => c.id === 'documentation');
      expect(docCheck?.status).toBe(PreFlightStatus.READY);
    });

    it('should return READY when .bmad directory exists', async () => {
      const pkg = { name: 'test-project' };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );
      // Create .bmad directory with some files
      await fs.mkdir(join(testProjectPath, '.bmad'), { recursive: true });
      await fs.writeFile(join(testProjectPath, '.bmad', 'prd.md'), '# PRD');

      const checker = new PreFlightChecker({
        projectPath: testProjectPath,
        checkPackageJson: false,
        checkDependencies: false,
        checkTests: false
      });

      const result = await checker.check();

      const docCheck = result.checks.find(c => c.id === 'documentation');
      expect(docCheck?.status).toBe(PreFlightStatus.READY);
    });
  });

  describe('overall readiness', () => {
    it('should calculate correct readiness score', async () => {
      // Create a fully ready project
      const pkg = {
        name: 'test-project',
        version: '1.0.0',
        scripts: { test: 'jest' },
        dependencies: { express: '^4.18.0' }
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );
      await fs.mkdir(join(testProjectPath, 'node_modules'), { recursive: true });
      await fs.mkdir(join(testProjectPath, 'test'), { recursive: true });
      await fs.writeFile(
        join(testProjectPath, 'test', 'example.test.ts'),
        'describe("test", () => { it("works", () => {}); });'
      );
      await fs.writeFile(
        join(testProjectPath, 'README.md'),
        '# Test Project'
      );

      const checker = new PreFlightChecker({
        projectPath: testProjectPath
      });

      const result = await checker.check();

      expect(result.ready).toBe(true);
      expect(result.readinessScore).toBe(100);
      expect(result.blockers).toHaveLength(0);
    });

    it('should identify blockers when critical items missing', async () => {
      // Empty project - no package.json
      const checker = new PreFlightChecker({
        projectPath: testProjectPath
      });

      const result = await checker.check();

      expect(result.ready).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('runPreFlightChecks convenience function', () => {
    it('should work as a convenience function', async () => {
      const pkg = {
        name: 'test-project',
        version: '1.0.0',
        scripts: { test: 'jest' }
      };
      await fs.writeFile(
        join(testProjectPath, 'package.json'),
        JSON.stringify(pkg, null, 2)
      );

      const result = await runPreFlightChecks(testProjectPath);

      expect(result.checks).toBeDefined();
      expect(result.projectPath).toBe(testProjectPath);
    });
  });
});
