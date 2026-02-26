// Consolidation Module - Analyzes logs and extracts repetitive patterns or corrections
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Memory, getMemory, LearnedLesson } from './memory.js';

export interface ConsolidationResult {
  patternsDetected: number;
  lessonsExtracted: number;
  filesUpdated: string[];
}

interface ErrorPattern {
  pattern: string;
  regex: RegExp;
  lesson: string;
}

// Common error patterns to look for
const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: 'TypeScript version mismatch',
    regex: /(?:TS\d{4}|TypeScript).*?(version|expected|found)/i,
    lesson: 'Always use exact TypeScript versions (e.g., "5.3.3" not "^5.3.3") to avoid breaking changes'
  },
  {
    pattern: 'ESM import issues',
    regex: /(?:Cannot use import|require is not defined|ESM|CJS)/i,
    lesson: 'Use ESM imports with fileURLToPath for __dirname in e2e tests'
  },
  {
    pattern: 'Type mismatch',
    regex: /Type '.*?' is not assignable to type '.*?'/i,
    lesson: 'Ensure interfaces have explicit types for all properties, avoid unknown'
  },
  {
    pattern: 'Missing file/path',
    regex: /(?:ENOENT|cannot find module|no such file)/i,
    lesson: 'Resolve fixture paths from project root using path.resolve(__dirname, "../..")'
  },
  {
    pattern: 'Async/await issues',
    regex: /(?:await has no effect|promise|async)/i,
    lesson: 'Ensure async functions properly await promises'
  },
  {
    pattern: 'Import path resolution',
    regex: /(?:Cannot find module|module not found).*\.(ts|js)/i,
    lesson: 'Check import paths are relative and include file extensions for TypeScript'
  },
  {
    pattern: 'Null/undefined access',
    regex: /(?:Cannot read properties of null|Cannot read property|'undefined'|is not a function)/i,
    lesson: 'Add null checks before accessing properties on potentially undefined values'
  },
  {
    pattern: 'Build/compilation error',
    regex: /(?:compilation error|build failed|failed to compile)/i,
    lesson: 'Run TypeScript compiler to check for type errors before committing'
  }
];

const USAGE_LOG_FILE = join(homedir(), '.vibe-flow', 'usage.log');
const STATE_FILE = join(process.cwd(), '.vibe-flow', 'state.json');

export class Consolidation {
  private memory: Memory;

  constructor(memory?: Memory) {
    this.memory = memory || getMemory();
  }

  /**
   * Main consolidation method - analyzes all available data sources
   */
  async consolidate(projectRoot: string): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      patternsDetected: 0,
      lessonsExtracted: 0,
      filesUpdated: []
    };

    // Analyze errors from state
    const stateErrors = await this.analyzeStateErrors();

    // Analyze usage logs
    const logPatterns = await this.analyzeUsageLogs();

    // Analyze telemetry for patterns
    const telemetryPatterns = await this.analyzeTelemetry();

    // Combine all detected patterns
    const allPatterns = [...stateErrors, ...logPatterns, ...telemetryPatterns];
    result.patternsDetected = allPatterns.length;

    // Store lessons in memory
    for (const pattern of allPatterns) {
      await this.memory.addLesson(
        pattern.pattern,
        pattern.lesson,
        pattern.source
      );
      result.lessonsExtracted++;
    }

    // Export to Claude rules
    const exportedFiles = await this.memory.exportToClaudeRules(projectRoot);
    result.filesUpdated = exportedFiles;

    return result;
  }

  /**
   * Analyze errors from state.json
   */
  private async analyzeStateErrors(): Promise<Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }>> {
    const patterns: Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }> = [];

    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      const state = JSON.parse(content);

      const errors = state.errors || [];
      const decisions = state.decisions || [];

      // Analyze errors
      for (const error of errors) {
        const message = error.message || '';

        for (const errorPattern of ERROR_PATTERNS) {
          if (errorPattern.regex.test(message)) {
            patterns.push({
              pattern: errorPattern.pattern,
              lesson: errorPattern.lesson,
              source: 'error'
            });
          }
        }
      }

      // Analyze decisions for patterns
      for (const decision of decisions) {
        const description = decision.description || '';
        const phase = decision.phase || '';

        // Look for repeated decision patterns
        if (description.includes('fix') || description.includes('bug') || description.includes('error')) {
          patterns.push({
            pattern: `Correction in ${phase}`,
            lesson: description,
            source: 'correction'
          });
        }
      }
    } catch {
      // State file doesn't exist or is unreadable
    }

    return patterns;
  }

  /**
   * Analyze usage logs for patterns
   */
  private async analyzeUsageLogs(): Promise<Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }>> {
    const patterns: Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }> = [];

    try {
      const content = await fs.readFile(USAGE_LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      // Count error occurrences
      const errorCounts = new Map<string, number>();

      for (const line of lines) {
        for (const errorPattern of ERROR_PATTERNS) {
          if (errorPattern.regex.test(line)) {
            errorCounts.set(
              errorPattern.pattern,
              (errorCounts.get(errorPattern.pattern) || 0) + 1
            );
          }
        }
      }

      // Convert to patterns with occurrence count
      for (const [pattern, count] of errorCounts) {
        if (count >= 2) {
          const errorPattern = ERROR_PATTERNS.find(p => p.pattern === pattern);
          if (errorPattern) {
            patterns.push({
              pattern: `${pattern} (${count}x)`,
              lesson: `${errorPattern.lesson} - occurred ${count} times`,
              source: 'pattern'
            });
          }
        }
      }
    } catch {
      // Log file doesn't exist
    }

    return patterns;
  }

  /**
   * Analyze telemetry for performance patterns
   */
  private async analyzeTelemetry(): Promise<Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }>> {
    const patterns: Array<{ pattern: string; lesson: string; source: LearnedLesson['source'] }> = [];

    try {
      const telemetryFile = join(homedir(), '.vibe-flow', 'telemetry.json');
      const content = await fs.readFile(telemetryFile, 'utf-8');
      const events = JSON.parse(content);

      // Look for failed operations
      const failedEvents = events.filter((e: { success: boolean }) => !e.success);

      if (failedEvents.length >= 3) {
        patterns.push({
          pattern: 'Multiple failed operations',
          lesson: `${failedEvents.length} operations failed. Consider reviewing error handling.`,
          source: 'error'
        });
      }

      // Look for slow operations
      const slowEvents = events.filter((e: { durationMs: number }) => e.durationMs > 30000);
      if (slowEvents.length >= 2) {
        patterns.push({
          pattern: 'Slow operations detected',
          lesson: `${slowEvents.length} operations took over 30 seconds. Consider optimization.`,
          source: 'pattern'
        });
      }
    } catch {
      // Telemetry file doesn't exist
    }

    return patterns;
  }

  /**
   * Generate a summary report of extracted lessons
   */
  async generateSummary(): Promise<string> {
    const lessons = await this.memory.getRecentLessons(10);

    if (lessons.length === 0) {
      return 'No patterns detected in this session.';
    }

    const lines = [
      '## Consolidation Summary',
      '',
      `Patterns detected: ${lessons.length}`,
      ''
    ];

    for (const lesson of lessons) {
      lines.push(`- **${lesson.pattern}**: ${lesson.lesson}`);
      lines.push(`  - Occurrences: ${lesson.occurrences}, Source: ${lesson.source}`);
    }

    return lines.join('\n');
  }
}

export function getConsolidation(memory?: Memory): Consolidation {
  return new Consolidation(memory);
}
