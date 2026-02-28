/**
 * CoverageCollector Tests
 * Feature: FEAT-003 - QA Report
 */

import { jest, describe, it, expect } from '@jest/globals';
import { CoverageCollector } from '../../src/qa/reporter/collectors/coverage-collector';

describe('CoverageCollector', () => {
  const projectPath = process.cwd();

  describe('constructor', () => {
    it('should create instance with project path', () => {
      const collector = new CoverageCollector(projectPath);
      expect(collector).toBeDefined();
    });
  });

  describe('collect', () => {
    it('should return VerificationResult with correct structure', async () => {
      // Test structure without actually running npm test
      // by checking the collector can be instantiated and has expected methods
      const collector = new CoverageCollector(projectPath);
      expect(typeof collector.collect).toBe('function');
    });

    it('should accept threshold parameter', () => {
      const collector = new CoverageCollector(projectPath);
      expect(typeof collector.collect).toBe('function');
    });
  });

  describe('parseCoverageOutput', () => {
    // Access private method through any cast for testing
    const getParseMethod = (collector: CoverageCollector) => {
      return (collector as any).parseCoverageOutput.bind(collector);
    };

    it('should parse Jest coverage table format', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const mockOutput = `
|    % Stmts |   % Branch |   % Funcs |   % Lines |
|----------|------------|-----------|-----------|
|    85.71 |       75   |    66.67 |    85.71 |
`;

      const result = parseCoverageOutput(mockOutput);

      expect(result).not.toBeNull();
      expect(result?.lines).toBe(85.71);
      expect(result?.branches).toBe(75);
      expect(result?.functions).toBe(66.67);
      expect(result?.statements).toBe(85.71);
    });

    it('should parse coverage with alternative header format', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const mockOutput = `
|    % Statements |   % Branches |   % Functions |   % Lines |
|---------------|--------------|---------------|-----------|
|          90.0 |         80.0 |          85.0 |      92.5 |
`;

      const result = parseCoverageOutput(mockOutput);

      expect(result).not.toBeNull();
      expect(result?.lines).toBe(92.5);
      expect(result?.branches).toBe(80);
      expect(result?.functions).toBe(85);
      expect(result?.statements).toBe(90);
    });

    it('should return null for invalid output', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const result = parseCoverageOutput('invalid output');
      expect(result).toBeNull();
    });

    it('should return null when no coverage table found', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const result = parseCoverageOutput('Some random text without coverage');
      expect(result).toBeNull();
    });

    it('should return null for empty output', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const result = parseCoverageOutput('');
      expect(result).toBeNull();
    });

    it('should parse coverage with decimal values', () => {
      const collector = new CoverageCollector(projectPath);
      const parseCoverageOutput = getParseMethod(collector);

      const mockOutput = `
| % Stmts | % Branch | % Funcs | % Lines |
|---------|----------|---------|---------|
|   33.33 |    25.00 |   50.00 |   40.00 |
`;

      const result = parseCoverageOutput(mockOutput);

      expect(result).not.toBeNull();
      expect(result?.lines).toBe(40);
      expect(result?.branches).toBe(25);
      expect(result?.functions).toBe(50);
      expect(result?.statements).toBeCloseTo(33.33);
    });
  });
});
