// State Machine Telemetry - Basic Metrics Export
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Phase, ActionType, TransitionAuditEntry, ProjectState } from './index.js';

// Metric data structure
export interface MetricData {
  duration: number;        // Duration in milliseconds
  tokensApproximated: number; // Approximated token count
  timestamp: string;
  phase?: Phase;
  action?: ActionType;
}

// Session metrics
export interface SessionMetrics {
  sessionId: string;
  startTime: string;
  endTime?: string;
  totalDuration: number;
  tokensApproximated: number;
  transitions: TransitionMetric[];
  phases: PhaseMetrics;
}

// Transition metric
export interface TransitionMetric {
  id: string;
  from: Phase;
  to: Phase;
  action: ActionType;
  duration: number;
  tokensApproximated: number;
  timestamp: string;
  success: boolean;
}

// Phase metrics breakdown
export interface PhaseMetrics {
  [phase: string]: {
    duration: number;
    transitionCount: number;
    tokensApproximated: number;
  };
}

// Telemetry export configuration
interface TelemetryConfig {
  outputDir: string;
  filePrefix: string;
  includeTokens: boolean;
}

// Token estimation constants (approximate)
const TOKENS_PER_CHARACTER = 0.25;
const TOKENS_PER_STEP = 50;

// State machine telemetry collector
export class StateMachineTelemetry {
  private sessionId: string;
  private startTime: Date;
  private transitions: TransitionMetric[] = [];
  private phaseDurations: Record<string, number> = {};
  private phaseTransitionCounts: Record<string, number> = {};
  private currentPhaseStartTime: Date | null = null;
  private currentPhase: Phase | null = null;
  private config: TelemetryConfig;

  constructor(options?: {
    outputDir?: string;
    filePrefix?: string;
    includeTokens?: boolean;
  }) {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.startTime = new Date();

    const stateDir = join(homedir(), '.vibe-flow');
    this.config = {
      outputDir: options?.outputDir || stateDir,
      filePrefix: options?.filePrefix || 'sm-telemetry',
      includeTokens: options?.includeTokens ?? true
    };

    this.ensureOutputDirectory();
  }

  private async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
  }

  // Start tracking a phase
  startPhase(phase: Phase): void {
    this.currentPhase = phase;
    this.currentPhaseStartTime = new Date();
    if (!this.phaseDurations[phase]) {
      this.phaseDurations[phase] = 0;
      this.phaseTransitionCounts[phase] = 0;
    }
  }

  // End tracking current phase
  endPhase(): void {
    if (this.currentPhase && this.currentPhaseStartTime) {
      const duration = Date.now() - this.currentPhaseStartTime.getTime();
      this.phaseDurations[this.currentPhase] += duration;
      this.currentPhaseStartTime = null;
      this.currentPhase = null;
    }
  }

  // Record a transition metric
  recordTransition(
    from: Phase,
    to: Phase,
    action: ActionType,
    duration: number,
    success: boolean = true
  ): void {
    // Estimate tokens for this transition
    const tokensApproximated = this.estimateTokens(from, to, action, duration);

    const metric: TransitionMetric = {
      id: `metric-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      from,
      to,
      action,
      duration,
      tokensApproximated,
      timestamp: new Date().toISOString(),
      success
    };

    this.transitions.push(metric);

    // Update phase transition counts
    if (this.phaseTransitionCounts[from] !== undefined) {
      this.phaseTransitionCounts[from]++;
    }
  }

  // Estimate tokens based on phase, action, and duration
  private estimateTokens(from: Phase, to: Phase, action: ActionType, duration: number): number {
    if (!this.config.includeTokens) {
      return 0;
    }

    // Base tokens per transition type
    const baseTokens = {
      [ActionType.ADVANCE]: 100,
      [ActionType.ROLLBACK]: 80,
      [ActionType.SKIP]: 120,
      [ActionType.OVERRIDE]: 150
    };

    // Phase complexity multipliers
    const phaseMultipliers: Record<Phase, number> = {
      [Phase.NEW]: 1.0,
      [Phase.ANALYSIS]: 1.5,
      [Phase.PLANNING]: 1.8,
      [Phase.SOLUTIONING]: 2.0,
      [Phase.IMPLEMENTATION]: 2.5,
      [Phase.WRAP_UP]: 1.2,
      [Phase.COMPLETE]: 1.0
    };

    const base = baseTokens[action] || 50;
    const multiplier = phaseMultipliers[from] || 1.0;
    const durationFactor = Math.min(duration / 1000, 10); // Cap at 10 seconds equivalent

    return Math.round(base * multiplier * (1 + durationFactor * TOKENS_PER_STEP / 100));
  }

  // Get total approximated tokens
  getTotalTokensApproximated(): number {
    return this.transitions.reduce((sum, t) => sum + t.tokensApproximated, 0);
  }

  // Get total duration in milliseconds
  getTotalDuration(): number {
    return Date.now() - this.startTime.getTime();
  }

  // Get current session metrics
  getSessionMetrics(): SessionMetrics {
    const phaseMetrics: PhaseMetrics = {};

    for (const phase of Object.values(Phase)) {
      if (this.phaseDurations[phase] !== undefined) {
        phaseMetrics[phase] = {
          duration: this.phaseDurations[phase],
          transitionCount: this.phaseTransitionCounts[phase] || 0,
          tokensApproximated: this.transitions
            .filter(t => t.from === phase)
            .reduce((sum, t) => sum + t.tokensApproximated, 0)
        };
      }
    }

    return {
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      endTime: new Date().toISOString(),
      totalDuration: this.getTotalDuration(),
      tokensApproximated: this.getTotalTokensApproximated(),
      transitions: this.transitions,
      phases: phaseMetrics
    };
  }

  // Export metrics to JSON file
  async exportToJson(filePath?: string): Promise<string> {
    const metrics = this.getSessionMetrics();
    const outputPath = filePath ||
      join(this.config.outputDir, `${this.config.filePrefix}-${this.sessionId}.json`);

    await fs.writeFile(outputPath, JSON.stringify(metrics, null, 2), 'utf-8');
    return outputPath;
  }

  // Export metrics as JSON string
  exportToJsonString(): string {
    const metrics = this.getSessionMetrics();
    return JSON.stringify(metrics, null, 2);
  }

  // Get transitions
  getTransitions(): TransitionMetric[] {
    return [...this.transitions];
  }

  // Get session ID
  getSessionId(): string {
    return this.sessionId;
  }

  // Reset telemetry for new session
  reset(): void {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.startTime = new Date();
    this.transitions = [];
    this.phaseDurations = {};
    this.phaseTransitionCounts = {};
    this.currentPhaseStartTime = null;
    this.currentPhase = null;
  }
}

// Singleton instance for global telemetry
let globalTelemetry: StateMachineTelemetry | null = null;

// Get or create global telemetry instance
export function getGlobalTelemetry(): StateMachineTelemetry {
  if (!globalTelemetry) {
    globalTelemetry = new StateMachineTelemetry();
  }
  return globalTelemetry;
}

// Create new telemetry instance
export function createTelemetry(options?: {
  outputDir?: string;
  filePrefix?: string;
  includeTokens?: boolean;
}): StateMachineTelemetry {
  return new StateMachineTelemetry(options);
}

// Helper function to format duration
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Helper to estimate tokens from text input
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHARACTER);
}
