// Incremental Consolidation Module - Processes small batches of WAL logs incrementally
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

export interface InteractionData {
  id: string;
  timestamp: string;
  type: 'tool_call' | 'user_message' | 'assistant_message' | 'error' | 'decision';
  content: string;
  metadata?: Record<string, string>;
  artifacts?: string[];
  errors?: string[];
}

export interface PartialSummary {
  interactionsProcessed: number;
  lastFlushAt: string | null;
  bufferSize: number;
  summaryState: SummaryState;
  progress: number;
}

export interface SummaryState {
  artifacts: Map<string, ArtifactSummary>;
  errors: ErrorSummary[];
  decisions: DecisionSummary[];
  lessons: LessonSummary[];
}

export interface ArtifactSummary {
  path: string;
  type: string;
  operations: string[];
  lastModified: string;
}

export interface ErrorSummary {
  pattern: string;
  count: number;
  lastOccurrence: string;
  suggestedFix?: string;
}

export interface DecisionSummary {
  id: string;
  description: string;
  phase: string;
  timestamp: string;
}

export interface LessonSummary {
  id: string;
  pattern: string;
  lesson: string;
  occurrences: number;
}

export interface FlushResult {
  success: boolean;
  interactionsProcessed: number;
  artifactsUpdated: number;
  errorsEncountered: string[];
}

export interface ConsolidatorOptions {
  batchSize: number;
  stateDir: string;
  walDir: string;
}

const DEFAULT_OPTIONS: ConsolidatorOptions = {
  batchSize: 10,
  stateDir: '.vibe-flow/incremental',
  walDir: '.vibe-flow/wal'
};

export class IncrementalConsolidator {
  private buffer: InteractionData[] = [];
  private options: ConsolidatorOptions;
  private summaryState: SummaryState;
  private interactionsProcessed: number = 0;
  private lastFlushAt: string | null = null;
  private initialized: boolean = false;

  constructor(options: Partial<ConsolidatorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.summaryState = {
      artifacts: new Map(),
      errors: [],
      decisions: [],
      lessons: []
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.options.stateDir, { recursive: true });
      await fs.mkdir(this.options.walDir, { recursive: true });

      // Load existing state if available
      const statePath = join(this.options.stateDir, 'summary-state.json');
      try {
        const content = await fs.readFile(statePath, 'utf-8');
        const savedState = JSON.parse(content);

        this.interactionsProcessed = savedState.interactionsProcessed ?? 0;
        this.lastFlushAt = savedState.lastFlushAt ?? null;

        if (savedState.summaryState) {
          this.summaryState = {
            artifacts: new Map(Object.entries(savedState.summaryState.artifacts ?? {})),
            errors: savedState.summaryState.errors ?? [],
            decisions: savedState.summaryState.decisions ?? [],
            lessons: savedState.summaryState.lessons ?? []
          };
        }
      } catch {
        // No existing state, start fresh
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize IncrementalConsolidator: ${error}`);
    }
  }

  /**
   * Buffer an interaction for later processing.
   * When buffer reaches batchSize, automatically flushes.
   */
  async bufferInteraction(data: InteractionData): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Add timestamp if not provided
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    // Generate ID if not provided
    if (!data.id) {
      data.id = this.generateId(data.timestamp + data.content);
    }

    this.buffer.push(data);

    // Auto-flush when buffer reaches batch size
    if (this.buffer.length >= this.options.batchSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Process all buffered interactions and update the summary state.
   */
  async flushBuffer(): Promise<FlushResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result: FlushResult = {
      success: true,
      interactionsProcessed: 0,
      artifactsUpdated: 0,
      errorsEncountered: []
    };

    if (this.buffer.length === 0) {
      return result;
    }

    try {
      // Process each buffered interaction
      for (const interaction of this.buffer) {
        this.processInteraction(interaction);
        result.interactionsProcessed++;
      }

      // Save WAL entry
      await this.saveWalEntry(this.buffer);

      // Clear buffer
      this.buffer = [];
      this.interactionsProcessed += result.interactionsProcessed;
      this.lastFlushAt = new Date().toISOString();

      // Persist state
      await this.persistState();

      // Update summary statistics
      result.artifactsUpdated = this.summaryState.artifacts.size;
    } catch (error) {
      result.success = false;
      result.errorsEncountered.push(String(error));
    }

    return result;
  }

  /**
   * Get the current partial summary without modifying state.
   */
  getPartialSummary(): PartialSummary {
    const progress = this.calculateProgress();

    return {
      interactionsProcessed: this.interactionsProcessed,
      lastFlushAt: this.lastFlushAt,
      bufferSize: this.buffer.length,
      summaryState: {
        artifacts: new Map(this.summaryState.artifacts),
        errors: [...this.summaryState.errors],
        decisions: [...this.summaryState.decisions],
        lessons: [...this.summaryState.lessons]
      },
      progress
    };
  }

  /**
   * Get current buffer contents without processing.
   */
  getBufferContents(): InteractionData[] {
    return [...this.buffer];
  }

  /**
   * Clear all buffered data and reset state.
   */
  async reset(): Promise<void> {
    this.buffer = [];
    this.summaryState = {
      artifacts: new Map(),
      errors: [],
      decisions: [],
      lessons: []
    };
    this.interactionsProcessed = 0;
    this.lastFlushAt = null;

    try {
      await this.persistState();
    } catch {
      // State file may not exist
    }
  }

  private processInteraction(interaction: InteractionData): void {
    switch (interaction.type) {
      case 'tool_call':
        this.processToolCall(interaction);
        break;
      case 'error':
        this.processError(interaction);
        break;
      case 'decision':
        this.processDecision(interaction);
        break;
      case 'assistant_message':
      case 'user_message':
        this.processMessage(interaction);
        break;
    }
  }

  private processToolCall(interaction: InteractionData): void {
    // Extract artifact information from tool calls
    if (interaction.artifacts && interaction.artifacts.length > 0) {
      for (const artifactPath of interaction.artifacts) {
        const existing = this.summaryState.artifacts.get(artifactPath);

        if (existing) {
          existing.operations.push(interaction.content);
          existing.lastModified = interaction.timestamp;
        } else {
          this.summaryState.artifacts.set(artifactPath, {
            path: artifactPath,
            type: this.guessArtifactType(artifactPath),
            operations: [interaction.content],
            lastModified: interaction.timestamp
          });
        }
      }
    }
  }

  private processError(interaction: InteractionData): void {
    if (!interaction.errors || interaction.errors.length === 0) return;

    for (const error of interaction.errors) {
      const existing = this.summaryState.errors.find(e => e.pattern === error);

      if (existing) {
        existing.count++;
        existing.lastOccurrence = interaction.timestamp;
      } else {
        this.summaryState.errors.push({
          pattern: error,
          count: 1,
          lastOccurrence: interaction.timestamp,
          suggestedFix: this.suggestFix(error)
        });
      }
    }
  }

  private processDecision(interaction: InteractionData): void {
    this.summaryState.decisions.push({
      id: interaction.id,
      description: interaction.content,
      phase: interaction.metadata?.['phase'] ?? 'unknown',
      timestamp: interaction.timestamp
    });

    // Also create a lesson from the decision if applicable
    if (interaction.metadata?.['lesson']) {
      const existingLesson = this.summaryState.lessons.find(
        l => l.pattern === interaction.metadata!['lesson']
      );

      if (existingLesson) {
        existingLesson.occurrences++;
      } else {
        this.summaryState.lessons.push({
          id: interaction.id,
          pattern: interaction.metadata['lesson'],
          lesson: interaction.content,
          occurrences: 1
        });
      }
    }
  }

  private processMessage(interaction: InteractionData): void {
    // Extract potential lessons from messages
    const potentialLessons = this.extractLessons(interaction.content);

    for (const lesson of potentialLessons) {
      const existing = this.summaryState.lessons.find(l => l.pattern === lesson.pattern);

      if (existing) {
        existing.occurrences++;
      } else {
        this.summaryState.lessons.push({
          id: this.generateId(lesson.pattern),
          pattern: lesson.pattern,
          lesson: lesson.lesson,
          occurrences: 1
        });
      }
    }
  }

  private async saveWalEntry(interactions: InteractionData[]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wal-${timestamp}.json`;
    const filepath = join(this.options.walDir, filename);

    await fs.writeFile(filepath, JSON.stringify(interactions, null, 2), 'utf-8');
  }

  private async persistState(): Promise<void> {
    const statePath = join(this.options.stateDir, 'summary-state.json');

    const state = {
      interactionsProcessed: this.interactionsProcessed,
      lastFlushAt: this.lastFlushAt,
      summaryState: {
        artifacts: Object.fromEntries(this.summaryState.artifacts),
        errors: this.summaryState.errors,
        decisions: this.summaryState.decisions,
        lessons: this.summaryState.lessons
      }
    };

    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private calculateProgress(): number {
    // Estimate progress based on interactions processed
    // This is a heuristic - actual progress depends on session length
    const estimatedTotalInteractions = 100; // Rough estimate
    return Math.min(100, Math.round((this.interactionsProcessed / estimatedTotalInteractions) * 100));
  }

  private generateId(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private guessArtifactType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();

    const typeMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'json': 'json',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'png': 'image',
      'jpg': 'image',
      'jpeg': 'image',
      'gif': 'image'
    };

    return typeMap[ext ?? ''] ?? 'unknown';
  }

  private suggestFix(error: string): string | undefined {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('type')) {
      return 'Check TypeScript types and ensure explicit types are defined';
    }
    if (errorLower.includes('path') || errorLower.includes('file not found')) {
      return 'Resolve fixture paths from project root using path.resolve(__dirname, "../..")';
    }
    if (errorLower.includes('failed') || errorLower.includes('error')) {
      return 'Review error handling and consider adding fallbacks';
    }

    return undefined;
  }

  private extractLessons(content: string): Array<{ pattern: string; lesson: string }> {
    const lessons: Array<{ pattern: string; lesson: string }> = [];

    // Simple pattern extraction - look for common lesson indicators
    const patterns = [
      { regex: /type mismatch/i, lesson: 'Ensure interfaces have explicit types for all properties, avoid unknown' },
      { regex: /missing.*file.*path/i, lesson: 'Resolve fixture paths from project root using path.resolve(__dirname, "../..")' },
      { regex: /multiple.*failed/i, lesson: 'Consider reviewing error handling' }
    ];

    for (const p of patterns) {
      if (p.regex.test(content)) {
        lessons.push({ pattern: p.regex.source, lesson: p.lesson });
      }
    }

    return lessons;
  }
}

// Helper function to get a singleton instance
let consolidatorInstance: IncrementalConsolidator | null = null;

export function getConsolidator(options?: Partial<ConsolidatorOptions>): IncrementalConsolidator {
  if (!consolidatorInstance) {
    consolidatorInstance = new IncrementalConsolidator(options);
  }
  return consolidatorInstance;
}

export function resetConsolidator(): void {
  consolidatorInstance = null;
}
