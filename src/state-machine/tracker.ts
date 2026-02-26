// State Machine Tracker - Stagnation Detection & Transition Tracking
import { Phase, ActionType, TransitionAuditEntry, ProjectState } from './index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Configuration
const DEFAULT_STAGNATION_THRESHOLD = 5;
const DEFAULT_ARTIFACT_CHECK_ENABLED = true;

// Circuit Breaker Error for stagnation detection
export class CircuitBreakerError extends Error {
  code: string;
  stagnationCount: number;
  transition: { from: Phase; to: Phase };
  recovery: string;

  constructor(
    message: string,
    code: string,
    stagnationCount: number,
    from: Phase,
    to: Phase,
    recovery: string
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.code = code;
    this.stagnationCount = stagnationCount;
    this.transition = { from, to };
    this.recovery = recovery;
  }
}

// Transition record for tracking
export interface TransitionRecord {
  id: string;
  from: Phase;
  to: Phase;
  action: ActionType;
  timestamp: string;
  artifactHash?: string;
  step: number;
}

// Artifact snapshot for change detection
export interface ArtifactSnapshot {
  hash: string;
  files: string[];
  timestamp: string;
}

// Stagnation detection result
export interface StagnationResult {
  isStagnant: boolean;
  transitionCount: number;
  lastArtifactHash?: string;
  hasArtifactChange: boolean;
}

// Tracker state persisted to disk
interface TrackerState {
  transitions: TransitionRecord[];
  artifactSnapshots: ArtifactSnapshot[];
  stagnationCounts: Record<string, number>;
  lastArtifactHash: string | null;
}

// Track transitions and detect stagnation
export class StateMachineTracker {
  private transitions: TransitionRecord[] = [];
  private artifactSnapshots: ArtifactSnapshot[] = [];
  private stagnationCounts: Record<string, number> = {};
  private lastArtifactHash: string | null = null;
  private stagnationThreshold: number;
  private artifactCheckEnabled: boolean;
  private stateFile: string;

  constructor(options?: {
    stagnationThreshold?: number;
    artifactCheckEnabled?: boolean;
  }) {
    this.stagnationThreshold = options?.stagnationThreshold ?? DEFAULT_STAGNATION_THRESHOLD;
    this.artifactCheckEnabled = options?.artifactCheckEnabled ?? DEFAULT_ARTIFACT_CHECK_ENABLED;
    this.stateFile = join(homedir(), '.vibe-flow', 'tracker-state.json');
    this.ensureStateDirectory();
  }

  private async ensureStateDirectory(): Promise<void> {
    const stateDir = dirname(this.stateFile);
    try {
      await fs.mkdir(stateDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
  }

  // Record a transition
  recordTransition(
    from: Phase,
    to: Phase,
    action: ActionType,
    step: number,
    artifactHash?: string
  ): TransitionRecord {
    const record: TransitionRecord = {
      id: `trans-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      from,
      to,
      action,
      timestamp: new Date().toISOString(),
      artifactHash,
      step
    };

    this.transitions.push(record);
    this.checkStagnation(record);

    // Update stagnation count for this transition pattern
    const transitionKey = `${from}:${to}`;
    this.stagnationCounts[transitionKey] = (this.stagnationCounts[transitionKey] || 0) + 1;

    // Update artifact hash tracking
    if (artifactHash) {
      this.lastArtifactHash = artifactHash;
      this.artifactSnapshots.push({
        hash: artifactHash,
        files: [],
        timestamp: new Date().toISOString()
      });
    }

    return record;
  }

  // Check for stagnation (same transition repeated without artifact change)
  private checkStagnation(record: TransitionRecord): void {
    const transitionKey = `${record.from}:${record.to}`;
    const count = this.stagnationCounts[transitionKey] || 0;

    if (count >= this.stagnationThreshold) {
      // Check if artifacts have changed
      const hasArtifactChange = this.artifactCheckEnabled
        ? this.hasArtifactChangedSinceLastSnapshot(record.artifactHash)
        : true;

      if (!hasArtifactChange) {
        throw new CircuitBreakerError(
          `Circuit Breaker: Stagnation detected - transition ${transitionKey} repeated ${count} times without artifact changes`,
          'STAGNATION_DETECTED',
          count,
          record.from,
          record.to,
          'analyze_project'
        );
      }
    }
  }

  // Check if artifacts have changed since last snapshot
  private hasArtifactChangedSinceLastSnapshot(currentHash?: string): boolean {
    if (!this.lastArtifactHash || !currentHash) {
      return true; // No previous data, assume change
    }
    return this.lastArtifactHash !== currentHash;
  }

  // Get stagnation status for a specific transition
  getStagnationStatus(from: Phase, to: Phase): StagnationResult {
    const transitionKey = `${from}:${to}`;
    const count = this.stagnationCounts[transitionKey] || 0;

    return {
      isStagnant: count >= this.stagnationThreshold,
      transitionCount: count,
      lastArtifactHash: this.lastArtifactHash ?? undefined,
      hasArtifactChange: this.artifactCheckEnabled
    };
  }

  // Get all transitions
  getTransitions(): TransitionRecord[] {
    return [...this.transitions];
  }

  // Get transition count by phase pair
  getTransitionCount(from: Phase, to: Phase): number {
    return this.stagnationCounts[`${from}:${to}`] || 0;
  }

  // Get total transition count
  getTotalTransitionCount(): number {
    return this.transitions.length;
  }

  // Update artifact hash manually
  updateArtifactHash(hash: string, files: string[] = []): void {
    this.lastArtifactHash = hash;
    this.artifactSnapshots.push({
      hash,
      files,
      timestamp: new Date().toISOString()
    });
  }

  // Get current artifact hash
  getCurrentArtifactHash(): string | null {
    return this.lastArtifactHash;
  }

  // Get artifact snapshots
  getArtifactSnapshots(): ArtifactSnapshot[] {
    return [...this.artifactSnapshots];
  }

  // Get all stagnation counts
  getStagnationCounts(): Record<string, number> {
    return { ...this.stagnationCounts };
  }

  // Reset stagnation counter for a specific transition
  resetStagnation(from: Phase, to: Phase): void {
    const transitionKey = `${from}:${to}`;
    delete this.stagnationCounts[transitionKey];
  }

  // Reset all trackers
  reset(): void {
    this.transitions = [];
    this.artifactSnapshots = [];
    this.stagnationCounts = {};
    this.lastArtifactHash = null;
  }

  // Persist tracker state
  async persist(): Promise<void> {
    const state: TrackerState = {
      transitions: this.transitions.slice(-100), // Keep last 100 transitions
      artifactSnapshots: this.artifactSnapshots.slice(-50),
      stagnationCounts: this.stagnationCounts,
      lastArtifactHash: this.lastArtifactHash
    };

    const tempFile = this.stateFile + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tempFile, this.stateFile);
  }

  // Load tracker state
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.stateFile, 'utf-8');
      const state: TrackerState = JSON.parse(content);

      this.transitions = state.transitions || [];
      this.artifactSnapshots = state.artifactSnapshots || [];
      this.stagnationCounts = state.stagnationCounts || {};
      this.lastArtifactHash = state.lastArtifactHash || null;
    } catch (error) {
      // State file doesn't exist yet, start fresh
    }
  }
}
