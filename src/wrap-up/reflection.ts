// Reflection Module - Extracts and consolidates lessons learned from the current session
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface SessionAttempt {
  action: string;
  target?: string;
  result: 'success' | 'failure' | 'partial';
  timestamp: string;
  details?: string;
}

export interface CommonError {
  category: string;
  message: string;
  occurrences: number;
  resolution?: string;
}

export interface EstablishedConvention {
  rule: string;
  context: string;
  rationale?: string;
}

export interface ReflectionSummary {
  sessionDate: string;
  attempts: SessionAttempt[];
  errors: CommonError[];
  conventions: EstablishedConvention[];
  metadata?: Record<string, unknown>;
}

export interface ReflectionResult {
  success: boolean;
  summary: ReflectionSummary;
  lessonsLearned: string[];
  outputPath?: string;
  errors: string[];
}

// File paths
const STATE_FILE = join(process.cwd(), '.vibe-flow', 'state.json');
const USAGE_LOG_FILE = join(homedir(), '.vibe-flow', 'usage.log');
const TELEMETRY_FILE = join(homedir(), '.vibe-flow', 'telemetry.json');
const LESSONS_HISTORY_FILE = join(process.cwd(), '.claude', 'rules', 'auto-generated-lessons.md');

/**
 * SessionReflector - Analyzes the current session and extracts lessons learned
 */
export class SessionReflector {
  /**
   * Extract reflection data from all available sources
   */
  async extractReflection(): Promise<ReflectionSummary> {
    const summary: ReflectionSummary = {
      sessionDate: new Date().toISOString(),
      attempts: [],
      errors: [],
      conventions: []
    };

    // Extract from state.json
    const stateData = await this.extractFromState();
    summary.attempts.push(...stateData.attempts);
    summary.errors.push(...stateData.errors);
    summary.conventions.push(...stateData.conventions);

    // Extract from telemetry
    const telemetryData = await this.extractFromTelemetry();
    summary.attempts.push(...telemetryData.attempts);
    summary.errors.push(...telemetryData.errors);

    // Extract from usage logs
    const usageData = await this.extractFromUsageLogs();
    summary.attempts.push(...usageData.attempts);

    // Extract conventions from decisions
    const conventionData = await this.extractConventions();
    summary.conventions.push(...conventionData);

    return summary;
  }

  /**
   * Extract data from state.json
   */
  private async extractFromState(): Promise<{
    attempts: SessionAttempt[];
    errors: CommonError[];
    conventions: EstablishedConvention[];
  }> {
    const attempts: SessionAttempt[] = [];
    const errors: CommonError[] = [];
    const conventions: EstablishedConvention[] = [];

    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      const state = JSON.parse(content);

      // Extract decisions (attempts made)
      const decisions = state.decisions || [];
      for (const decision of decisions) {
        attempts.push({
          action: decision.description || 'Unknown action',
          target: decision.target,
          result: decision.result || 'success',
          timestamp: decision.timestamp || state.lastUpdated || new Date().toISOString(),
          details: decision.rationale
        });
      }

      // Extract errors
      const stateErrors = state.errors || [];
      const errorCounts = new Map<string, number>();

      for (const error of stateErrors) {
        const category = this.categorizeError(error.message || '');
        errorCounts.set(category, (errorCounts.get(category) || 0) + 1);

        if (!errors.find(e => e.category === category)) {
          errors.push({
            category,
            message: error.message || '',
            occurrences: errorCounts.get(category) || 1,
            resolution: error.resolution
          });
        }
      }

      // Extract conventions from state patterns
      const patterns = state.patterns || [];
      for (const pattern of patterns) {
        if (pattern.type === 'convention') {
          conventions.push({
            rule: pattern.rule || '',
            context: pattern.context || '',
            rationale: pattern.rationale
          });
        }
      }
    } catch {
      // State file doesn't exist or is unreadable
    }

    return { attempts, errors, conventions };
  }

  /**
   * Extract data from telemetry
   */
  private async extractFromTelemetry(): Promise<{
    attempts: SessionAttempt[];
    errors: CommonError[];
  }> {
    const attempts: SessionAttempt[] = [];
    const errors: CommonError[] = [];

    try {
      const content = await fs.readFile(TELEMETRY_FILE, 'utf-8');
      const events = JSON.parse(content);

      const recentEvents = events.slice(-20); // Last 20 events

      for (const event of recentEvents) {
        const timestamp = event.timestamp || new Date().toISOString();

        if (event.success === false) {
          errors.push({
            category: event.phase || 'Unknown',
            message: event.error?.message || 'Operation failed',
            occurrences: 1
          });
        }

        attempts.push({
          action: event.phase || 'Unknown operation',
          result: event.success ? 'success' : 'failure',
          timestamp,
          details: event.durationMs ? `Duration: ${event.durationMs}ms` : undefined
        });
      }
    } catch {
      // Telemetry file doesn't exist
    }

    return { attempts, errors };
  }

  /**
   * Extract data from usage logs
   */
  private async extractFromUsageLogs(): Promise<{
    attempts: SessionAttempt[];
  }> {
    const attempts: SessionAttempt[] = [];

    try {
      const content = await fs.readFile(USAGE_LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      // Get last 50 lines
      const recentLines = lines.slice(-50);

      for (const line of recentLines) {
        try {
          const entry = JSON.parse(line);
          if (entry.tool || entry.command) {
            attempts.push({
              action: entry.tool || entry.command || 'Unknown',
              result: entry.error ? 'failure' : 'success',
              timestamp: entry.timestamp || new Date().toISOString(),
              details: entry.error
            });
          }
        } catch {
          // Not JSON, skip
        }
      }
    } catch {
      // Usage log doesn't exist
    }

    return { attempts };
  }

  /**
   * Extract established conventions from the session
   */
  private async extractConventions(): Promise<EstablishedConvention[]> {
    const conventions: EstablishedConvention[] = [];

    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      const state = JSON.parse(content);

      // Extract conventions from decisions
      const decisions = state.decisions || [];
      for (const decision of decisions) {
        if (decision.type === 'convention' || decision.rule) {
          conventions.push({
            rule: decision.rule || decision.description,
            context: decision.context || decision.phase,
            rationale: decision.rationale
          });
        }
      }

      // Look for convention patterns in code
      const projectFiles = state.recentFiles || [];
      for (const file of projectFiles) {
        if (file.includes('CLAUDE.md') || file.includes('.claude/rules')) {
          conventions.push({
            rule: 'Project rule updated',
            context: file,
            rationale: 'Rule or convention established during session'
          });
        }
      }
    } catch {
      // State file doesn't exist
    }

    return conventions;
  }

  /**
   * Categorize error messages into common categories
   */
  private categorizeError(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('type') && lowerMessage.includes('assignable')) {
      return 'Type mismatch';
    }
    if (lowerMessage.includes('enoent') || lowerMessage.includes('not found')) {
      return 'Missing file/path';
    }
    if (lowerMessage.includes('import') || lowerMessage.includes('require')) {
      return 'Module resolution';
    }
    if (lowerMessage.includes('async') || lowerMessage.includes('await')) {
      return 'Async handling';
    }
    if (lowerMessage.includes('null') || lowerMessage.includes('undefined')) {
      return 'Null/undefined access';
    }
    if (lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
      return 'Permission error';
    }
    if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout')) {
      return 'Timeout';
    }

    return 'General error';
  }

  /**
   * Generate a human-readable summary prompt for the reflection
   */
  generateReflectionPrompt(summary: ReflectionSummary): string {
    const sections: string[] = [];

    // Header
    sections.push(`# Session Reflection - ${summary.sessionDate}`);
    sections.push('');

    // Attempts section
    if (summary.attempts.length > 0) {
      sections.push('## What Was Attempted');
      sections.push('');
      const uniqueAttempts = this.deduplicateAttempts(summary.attempts);
      for (const attempt of uniqueAttempts.slice(0, 10)) {
        const status = attempt.result === 'success' ? '✓' : attempt.result === 'partial' ? '◐' : '✗';
        sections.push(`- ${status} ${attempt.action}${attempt.target ? ` (${attempt.target})` : ''}`);
        if (attempt.details) {
          sections.push(`  - ${attempt.details}`);
        }
      }
      sections.push('');
    }

    // Errors section
    if (summary.errors.length > 0) {
      sections.push('## Common Errors');
      sections.push('');
      for (const error of summary.errors) {
        sections.push(`- **${error.category}** (${error.occurrences}x): ${error.message}`);
        if (error.resolution) {
          sections.push(`  - Resolution: ${error.resolution}`);
        }
      }
      sections.push('');
    }

    // Conventions section
    if (summary.conventions.length > 0) {
      sections.push('## Established Conventions');
      sections.push('');
      for (const convention of summary.conventions) {
        sections.push(`- **${convention.rule}**`);
        if (convention.context) {
          sections.push(`  - Context: ${convention.context}`);
        }
        if (convention.rationale) {
          sections.push(`  - Rationale: ${convention.rationale}`);
        }
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Deduplicate attempts by action
   */
  private deduplicateAttempts(attempts: SessionAttempt[]): SessionAttempt[] {
    const seen = new Map<string, SessionAttempt>();

    for (const attempt of attempts) {
      const key = attempt.action + (attempt.target || '');
      if (!seen.has(key)) {
        seen.set(key, attempt);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Format lessons for long-term storage
   */
  formatLessonsForStorage(summary: ReflectionSummary): string[] {
    const lessons: string[] = [];

    // Add error-based lessons
    for (const error of summary.errors) {
      if (error.occurrences >= 1) {
        lessons.push(this.generateErrorLesson(error));
      }
    }

    // Add convention lessons
    for (const convention of summary.conventions) {
      lessons.push(this.generateConventionLesson(convention));
    }

    return lessons;
  }

  /**
   * Generate a lesson string from an error
   */
  private generateErrorLesson(error: CommonError): string {
    const lessonMap: Record<string, string> = {
      'Type mismatch': 'Ensure interfaces have explicit types for all properties, avoid unknown',
      'Missing file/path': 'Resolve fixture paths from project root using path.resolve(__dirname, "../..")',
      'Module resolution': 'Use correct import paths with file extensions for TypeScript',
      'Async handling': 'Ensure async functions properly await promises',
      'Null/undefined access': 'Add null checks before accessing properties on potentially undefined values',
      'Permission error': 'Check file permissions and access rights',
      'Timeout': 'Consider increasing timeout values or optimizing the operation'
    };

    return lessonMap[error.category] || `${error.category}: ${error.message}`;
  }

  /**
   * Generate a lesson string from a convention
   */
  private generateConventionLesson(convention: EstablishedConvention): string {
    return `${convention.rule}: ${convention.rationale || convention.context}`;
  }

  /**
   * Save reflection to long-term storage
   */
  async saveReflection(summary: ReflectionSummary): Promise<ReflectionResult> {
    const result: ReflectionResult = {
      success: true,
      summary,
      lessonsLearned: [],
      errors: []
    };

    try {
      // Format lessons
      result.lessonsLearned = this.formatLessonsForStorage(summary);

      // Ensure directory exists
      const rulesDir = join(process.cwd(), '.claude', 'rules');
      await fs.mkdir(rulesDir, { recursive: true });

      // Generate markdown content
      const content = this.generateReflectionPrompt(summary);

      // Append to history file
      try {
        const existing = await fs.readFile(LESSONS_HISTORY_FILE, 'utf-8');
        const updated = existing + '\n\n---\n\n' + content;
        await fs.writeFile(LESSONS_HISTORY_FILE, updated, 'utf-8');
      } catch {
        // File doesn't exist, create it
        const header = '# Auto-Generated Lessons\n\nGenerated: ' + new Date().toISOString() + '\n\n## Learned Patterns\n\n';
        await fs.writeFile(LESSONS_HISTORY_FILE, header + content, 'utf-8');
      }

      result.outputPath = LESSONS_HISTORY_FILE;
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Execute full reflection cycle
   */
  async execute(): Promise<ReflectionResult> {
    const summary = await this.extractReflection();
    return this.saveReflection(summary);
  }
}

/**
 * Create a new SessionReflector instance
 */
export function createReflector(): SessionReflector {
  return new SessionReflector();
}

/**
 * Quick reflection helper - extracts and saves in one call
 */
export async function reflect(): Promise<ReflectionResult> {
  const reflector = new SessionReflector();
  return reflector.execute();
}
