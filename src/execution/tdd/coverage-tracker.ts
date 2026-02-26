// Coverage Tracker for TDD - Detects empty/placeholder tests written to pass validation
// Reads Istanbul (coverage-final.json) or LCOV format coverage reports

import * as fs from 'fs';
import * as path from 'path';

export interface CoverageThresholds {
  statement: number;  // 0-100 percentage
  branch: number;      // 0-100 percentage
}

export interface CoverageReport {
  file: string;
  isValid: boolean;
  statementCoverage: number;
  branchCoverage: number;
  uncoveredLines: number[];
  partiallyCoveredBranches: number[];
  meetsThreshold: boolean;
  details: string;
}

export interface TestValidityReport {
  targetFile: string;
  coveragePath: string;
  timestamp: string;
  thresholds: CoverageThresholds;
  report: CoverageReport;
  isStructurallyValid: boolean;
  warnings: string[];
}

// Istanbul/Mocha coverage-final.json format
interface IstanbulCoverageData {
  [filePath: string]: {
    path: string;
    statementMap: Record<string, { start: { line: number; column: number }; end: { line: number; column: number } }>;
    fnMap: Record<string, { name: string; decl: { start: { line: number }; end: { line: number } }; loc: { start: { line: number }; end: { line: number } } }>;
    branchMap: Record<string, { type: string; locations: Array<{ start: { line: number }; end: { line: number } }> }>;
    s: Record<string, number>;  // statement hits
    f: Record<string, number>;  // function hits
    b: Record<string, number[]>; // branch hits
  };
}

export const DEFAULT_THRESHOLDS: CoverageThresholds = {
  statement: 80,
  branch: 80,
};

/**
 * Parse Istanbul/Mocha coverage-final.json format
 */
function parseIstanbulCoverage(content: string): IstanbulCoverageData {
  return JSON.parse(content) as IstanbulCoverageData;
}

/**
 * Parse LCOV format
 * Format: SF:/path/to/file
 *         DA:line,hits
 *         BRDA:line,branchId,hits,total
 *         end_of_record
 */
function parseLcovCoverage(content: string): Map<string, { lines: Map<number, number>; branches: Map<number, number[]> }> {
  const coverage = new Map<string, { lines: Map<number, number>; branches: Map<number, number[]> }>();
  const lines = content.split('\n');

  let currentFile: string | null = null;
  let fileData: { lines: Map<number, number>; branches: Map<number, number[]> } | null = null;

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      const filePath = line.substring(3);
      currentFile = filePath;
      fileData = {
        lines: new Map<number, number>(),
        branches: new Map<number, number[]>(),
      };
      coverage.set(filePath, fileData);
    } else if (line.startsWith('DA:') && fileData) {
      const parts = line.substring(3).split(',');
      if (parts.length === 2) {
        const lineNum = parseInt(parts[0], 10);
        const hits = parseInt(parts[1], 10);
        fileData.lines.set(lineNum, hits);
      }
    } else if (line.startsWith('BRDA:') && fileData) {
      const parts = line.substring(5).split(',');
      if (parts.length === 4) {
        const lineNum = parseInt(parts[0], 10);
        const hits = parseInt(parts[2], 10);
        const existing = fileData.branches.get(lineNum) || [];
        existing.push(hits);
        fileData.branches.set(lineNum, existing);
      }
    }
  }

  return coverage;
}

/**
 * Get file coverage from Istanbul format
 */
function getIstanbulFileCoverage(data: IstanbulCoverageData, targetFile: string): IstanbulCoverageData[string] | null {
  const normalizedTarget = path.normalize(targetFile);

  // Try exact match first
  if (data[normalizedTarget]) {
    return data[normalizedTarget];
  }

  // Try with forward slashes
  const forwardSlash = normalizedTarget.replace(/\\/g, '/');
  if (data[forwardSlash]) {
    return data[forwardSlash];
  }

  // Try partial match (relative path)
  const fileName = path.basename(normalizedTarget);
  for (const key of Object.keys(data)) {
    if (key.endsWith(fileName) || key.includes(fileName.replace(/\.(ts|js|tsx|jsx)$/, ''))) {
      return data[key];
    }
  }

  return null;
}

/**
 * Calculate coverage from Istanbul format
 */
function calculateIstanbulCoverage(fileData: IstanbulCoverageData[string]): { statement: number; branch: number; uncoveredLines: number[]; partiallyCoveredBranches: number[] } {
  const statements = fileData.s;
  const branches = fileData.b;

  let totalStatements = 0;
  let coveredStatements = 0;
  const uncoveredLinesSet = new Set<number>();

  // Count statements
  for (const [key, hits] of Object.entries(statements)) {
    totalStatements++;
    if (hits > 0) {
      coveredStatements++;
    } else {
      const stmt = fileData.statementMap[key];
      if (stmt) {
        uncoveredLinesSet.add(stmt.start.line);
      }
    }
  }

  // Count branches
  let totalBranches = 0;
  let coveredBranches = 0;
  const partialBranches: number[] = [];

  for (const [key, hits] of Object.entries(branches)) {
    const branchData = fileData.branchMap[key];
    if (!branchData || branchData.type === 'default') continue;

    const locations = branchData.locations;
    let branchCovered = 0;
    let branchTotal = 0;

    for (let i = 0; i < locations.length; i++) {
      branchTotal++;
      if (hits[i] > 0) {
        branchCovered++;
      }
    }

    totalBranches += branchTotal;
    coveredBranches += branchCovered;

    // Partial branch coverage (some branches hit, some not)
    if (branchCovered > 0 && branchCovered < branchTotal) {
      partialBranches.push(locations[0].start.line);
    }
  }

  const statementCoverage = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;
  const branchCoverage = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0;

  return {
    statement: Math.round(statementCoverage * 100) / 100,
    branch: Math.round(branchCoverage * 100) / 100,
    uncoveredLines: Array.from(uncoveredLinesSet).sort((a, b) => a - b),
    partiallyCoveredBranches: partialBranches,
  };
}

/**
 * Calculate coverage from LCOV format
 */
function calculateLcovCoverage(fileData: { lines: Map<number, number>; branches: Map<number, number[]> }): { statement: number; branch: number; uncoveredLines: number[]; partiallyCoveredBranches: number[] } {
  const lines = fileData.lines;
  const branches = fileData.branches;

  let totalStatements = 0;
  let coveredStatements = 0;
  const uncoveredLinesSet = new Set<number>();

  for (const [lineNum, hits] of Array.from(lines)) {
    totalStatements++;
    if (hits > 0) {
      coveredStatements++;
    } else {
      uncoveredLinesSet.add(lineNum);
    }
  }

  let totalBranches = 0;
  let coveredBranches = 0;
  const partialBranches: number[] = [];

  for (const [lineNum, hits] of Array.from(branches)) {
    const branchHits = hits.filter(h => h > 0).length;
    totalBranches += hits.length;
    coveredBranches += branchHits;

    if (branchHits > 0 && branchHits < hits.length) {
      partialBranches.push(lineNum);
    }
  }

  const statementCoverage = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;
  const branchCoverage = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0;

  return {
    statement: Math.round(statementCoverage * 100) / 100,
    branch: Math.round(branchCoverage * 100) / 100,
    uncoveredLines: Array.from(uncoveredLinesSet).sort((a, b) => a - b),
    partiallyCoveredBranches: partialBranches,
  };
}

/**
 * Detect empty/placeholder tests by analyzing coverage patterns
 */
function detectPlaceholderTest(coverage: { statement: number; branch: number; uncoveredLines: number[] }): string[] {
  const warnings: string[] = [];

  // Very low coverage suggests empty test
  if (coverage.statement < 10) {
    warnings.push('Extremely low statement coverage (<10%) - test may be empty or placeholder');
  }

  // All lines uncovered in a small file suggests no real test
  if (coverage.uncoveredLines.length > 0 && coverage.statement === 0) {
    warnings.push('Zero statement coverage - test file has no executable assertions');
  }

  // Single line with all coverage might indicate trivial test
  if (coverage.uncoveredLines.length > 0 && coverage.uncoveredLines.length < 3) {
    warnings.push('Very few covered lines - test may not be exercising target functionality');
  }

  return warnings;
}

/**
 * Verify test coverage for a target file
 * Reads coverage report (Istanbul or LCOV) and verifies coverage thresholds
 */
export function verifyTestCoverage(
  coverageJsonPath: string,
  targetFile: string,
  thresholds: CoverageThresholds = DEFAULT_THRESHOLDS
): TestValidityReport {
  const warnings: string[] = [];
  let coverageReport: CoverageReport;

  // Check if file exists
  if (!fs.existsSync(coverageJsonPath)) {
    return {
      targetFile,
      coveragePath: coverageJsonPath,
      timestamp: new Date().toISOString(),
      thresholds,
      report: {
        file: targetFile,
        isValid: false,
        statementCoverage: 0,
        branchCoverage: 0,
        uncoveredLines: [],
        partiallyCoveredBranches: [],
        meetsThreshold: false,
        details: `Coverage report not found: ${coverageJsonPath}`,
      },
      isStructurallyValid: false,
      warnings: ['Coverage report file does not exist'],
    };
  }

  const content = fs.readFileSync(coverageJsonPath, 'utf-8');
  const ext = path.extname(coverageJsonPath).toLowerCase();

  let statementCoverage = 0;
  let branchCoverage = 0;
  let uncoveredLines: number[] = [];
  let partialBranches: number[] = [];

  try {
    if (ext === '.json' || !ext) {
      // Assume Istanbul format
      const istanbulData = parseIstanbulCoverage(content);
      const fileData = getIstanbulFileCoverage(istanbulData, targetFile);

      if (!fileData) {
        return {
          targetFile,
          coveragePath: coverageJsonPath,
          timestamp: new Date().toISOString(),
          thresholds,
          report: {
            file: targetFile,
            isValid: false,
            statementCoverage: 0,
            branchCoverage: 0,
            uncoveredLines: [],
            partiallyCoveredBranches: [],
            meetsThreshold: false,
            details: `Target file not found in coverage report: ${targetFile}`,
          },
          isStructurallyValid: false,
          warnings: ['Target file not found in coverage report'],
        };
      }

      const coverage = calculateIstanbulCoverage(fileData);
      statementCoverage = coverage.statement;
      branchCoverage = coverage.branch;
      uncoveredLines = coverage.uncoveredLines;
      partialBranches = coverage.partiallyCoveredBranches;
    } else if (ext === '.lcov' || ext === '.info') {
      // LCOV format
      const lcovData = parseLcovCoverage(content);
      const normalizedTarget = path.normalize(targetFile);

      let fileData = lcovData.get(normalizedTarget);

      // Try partial match for LCOV
      if (!fileData) {
        const fileName = path.basename(normalizedTarget);
        for (const [key, value] of Array.from(lcovData)) {
          if (key.includes(fileName)) {
            fileData = value;
            break;
          }
        }
      }

      if (!fileData) {
        return {
          targetFile,
          coveragePath: coverageJsonPath,
          timestamp: new Date().toISOString(),
          thresholds,
          report: {
            file: targetFile,
            isValid: false,
            statementCoverage: 0,
            branchCoverage: 0,
            uncoveredLines: [],
            partiallyCoveredBranches: [],
            meetsThreshold: false,
            details: `Target file not found in LCOV report: ${targetFile}`,
          },
          isStructurallyValid: false,
          warnings: ['Target file not found in LCOV report'],
        };
      }

      const coverage = calculateLcovCoverage(fileData);
      statementCoverage = coverage.statement;
      branchCoverage = coverage.branch;
      uncoveredLines = coverage.uncoveredLines;
      partialBranches = coverage.partiallyCoveredBranches;
    } else {
      return {
        targetFile,
        coveragePath: coverageJsonPath,
        timestamp: new Date().toISOString(),
        thresholds,
        report: {
          file: targetFile,
          isValid: false,
          statementCoverage: 0,
          branchCoverage: 0,
          uncoveredLines: [],
          partiallyCoveredBranches: [],
          meetsThreshold: false,
          details: `Unsupported coverage format: ${ext}`,
        },
        isStructurallyValid: false,
        warnings: ['Unsupported coverage report format'],
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      targetFile,
      coveragePath: coverageJsonPath,
      timestamp: new Date().toISOString(),
      thresholds,
      report: {
        file: targetFile,
        isValid: false,
        statementCoverage: 0,
        branchCoverage: 0,
        uncoveredLines: [],
        partiallyCoveredBranches: [],
        meetsThreshold: false,
        details: `Failed to parse coverage report: ${errorMessage}`,
      },
      isStructurallyValid: false,
      warnings: [`Parse error: ${errorMessage}`],
    };
  }

  // Check thresholds
  const statementPass = statementCoverage >= thresholds.statement;
  const branchPass = branchCoverage >= thresholds.branch;
  const meetsThreshold = statementPass && branchPass;

  // Detect potential placeholder tests
  warnings.push(...detectPlaceholderTest({ statement: statementCoverage, branch: branchCoverage, uncoveredLines }));

  // Build report details
  let details = `Statement: ${statementCoverage.toFixed(2)}% (threshold: ${thresholds.statement}%)`;
  details += ` | Branch: ${branchCoverage.toFixed(2)}% (threshold: ${thresholds.branch}%)`;

  if (uncoveredLines.length > 0) {
    details += ` | Uncovered lines: ${uncoveredLines.slice(0, 10).join(', ')}${uncoveredLines.length > 10 ? '...' : ''}`;
  }

  coverageReport = {
    file: targetFile,
    isValid: meetsThreshold,
    statementCoverage,
    branchCoverage,
    uncoveredLines,
    partiallyCoveredBranches: partialBranches,
    meetsThreshold,
    details,
  };

  // Determine structural validity
  // Test is structurally valid if it meets thresholds AND doesn't appear to be a placeholder
  const isStructurallyValid = meetsThreshold && warnings.filter(w => w.includes('empty') || w.includes('Zero')).length === 0;

  return {
    targetFile,
    coveragePath: coverageJsonPath,
    timestamp: new Date().toISOString(),
    thresholds,
    report: coverageReport,
    isStructurallyValid,
    warnings,
  };
}

/**
 * Verify coverage for multiple files
 */
export function verifyMultipleTestCoverages(
  coverageJsonPath: string,
  targetFiles: string[],
  thresholds: CoverageThresholds = DEFAULT_THRESHOLDS
): TestValidityReport[] {
  return targetFiles.map(targetFile => verifyTestCoverage(coverageJsonPath, targetFile, thresholds));
}

export default verifyTestCoverage;
