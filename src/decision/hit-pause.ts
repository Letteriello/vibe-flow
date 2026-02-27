// Hit-Pause: Strategic Human Pauses for Workflow - Epic 2 Story 2.8
// Provides strategic pause points for human intervention during workflow execution
import { Phase } from '../state-machine/index.js';

/**
 * Hit-Pause Trigger Types
 * Defines when the workflow should pause for human input
 */
export enum HitPauseTrigger {
  /** Pause before entering a new phase */
  PHASE_ENTRY = 'PHASE_ENTRY',
  /** Pause after completing a phase */
  PHASE_EXIT = 'PHASE_EXIT',
  /** Pause before critical operations */
  PRE_CRITICAL = 'PRE_CRITICAL',
  /** Pause after critical operations */
  POST_CRITICAL = 'POST_CRITICAL',
  /** Pause on error occurrence */
  ON_ERROR = 'ON_ERROR',
  /** Pause after N iterations */
  ITERATION_THRESHOLD = 'ITERATION_THRESHOLD',
  /** Pause after N minutes of execution */
  TIME_THRESHOLD = 'TIME_THRESHOLD',
  /** Manual pause requested by user */
  MANUAL = 'MANUAL'
}

/**
 * Hit-Pause Severity
 * Classifies the importance of the pause
 */
export enum HitPauseSeverity {
  /** Optional pause - workflow can continue */
  OPTIONAL = 'OPTIONAL',
  /** Recommended pause - user should review before continuing */
  RECOMMENDED = 'RECOMMENDED',
  /** Required pause - user must acknowledge before continuing */
  REQUIRED = 'REQUIRED',
  /** Blocking pause - workflow cannot proceed without user action */
  BLOCKING = 'BLOCKING'
}

/**
 * Hit-Pause Status
 * Current state of a pause
 */
export enum HitPauseStatus {
  /** Pause is active and waiting for user */
  ACTIVE = 'ACTIVE',
  /** Pause has been acknowledged */
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  /** Pause was skipped */
  SKIPPED = 'SKIPPED',
  /** Pause was cancelled */
  CANCELLED = 'CANCELLED',
  /** Pause expired */
  EXPIRED = 'EXPIRED'
}

/**
 * Hit-Pause Configuration
 * Defines where and how the workflow should pause
 */
export interface HitPauseConfig {
  /** Enable/disable Hit-Pause globally */
  enabled: boolean;
  /** Mode: 'autonomous' (no pause) or 'interactive' (pause enabled) */
  mode: 'autonomous' | 'interactive';
  /** Phases to pause on entry */
  pauseOnPhaseEntry: Phase[];
  /** Phases to pause on exit */
  pauseOnPhaseExit: Phase[];
  /** Triggers enabled for this configuration */
  enabledTriggers: HitPauseTrigger[];
  /** Iteration threshold for ITERATION_THRESHOLD trigger */
  iterationThreshold: number;
  /** Time threshold in minutes for TIME_THRESHOLD trigger */
  timeThresholdMinutes: number;
  /** Timeout in ms for blocking pauses */
  pauseTimeoutMs: number;
  /** Custom pause points by phase and step */
  customPausePoints: Record<string, { trigger: HitPauseTrigger; severity: HitPauseSeverity }>;
}

/** Default Hit-Pause configuration - autonomous mode */
export const DEFAULT_HIT_PAUSE_CONFIG: HitPauseConfig = {
  enabled: true,
  mode: 'autonomous',
  pauseOnPhaseEntry: [],
  pauseOnPhaseExit: [],
  enabledTriggers: [HitPauseTrigger.MANUAL],
  iterationThreshold: 10,
  timeThresholdMinutes: 30,
  pauseTimeoutMs: 60000, // 1 minute default timeout
  customPausePoints: {}
};

/** Configuration for interactive mode with recommended pauses */
export const INTERACTIVE_HIT_PAUSE_CONFIG: HitPauseConfig = {
  enabled: true,
  mode: 'interactive',
  pauseOnPhaseEntry: [Phase.SOLUTIONING, Phase.WRAP_UP],
  pauseOnPhaseExit: [Phase.ANALYSIS, Phase.PLANNING, Phase.IMPLEMENTATION],
  enabledTriggers: [
    HitPauseTrigger.PHASE_ENTRY,
    HitPauseTrigger.PHASE_EXIT,
    HitPauseTrigger.ON_ERROR,
    HitPauseTrigger.MANUAL
  ],
  iterationThreshold: 5,
  timeThresholdMinutes: 15,
  pauseTimeoutMs: 300000, // 5 minutes for interactive mode
  customPausePoints: {}
};

/**
 * Hit-Pause Event
 * Represents a pause event in the workflow
 */
export interface HitPauseEvent {
  /** Unique identifier for this pause */
  id: string;
  /** Trigger that caused this pause */
  trigger: HitPauseTrigger;
  /** Severity of the pause */
  severity: HitPauseSeverity;
  /** Current phase when pause occurred */
  phase: Phase;
  /** Current step when pause occurred */
  step: number;
  /** Message to display to user */
  message: string;
  /** Additional context for the pause */
  context: Record<string, unknown>;
  /** Status of this pause */
  status: HitPauseStatus;
  /** When this pause was created */
  createdAt: string;
  /** When this pause was acknowledged/skipped */
  resolvedAt?: string;
  /** User response if provided */
  userResponse?: string;
}

/**
 * Hit-Pause Result
 * Result of a pause interaction
 */
export interface HitPauseResult {
  /** Whether the pause was acknowledged */
  acknowledged: boolean;
  /** Whether the user chose to continue */
  continue: boolean;
  /** User's response/message */
  message?: string;
  /** Timestamp of resolution */
  resolvedAt: string;
}

/**
 * HitPauseManager
 * Manages strategic pauses in the workflow
 */
export class HitPauseManager {
  private config: HitPauseConfig;
  private activePauses: Map<string, HitPauseEvent> = new Map();
  private pauseHistory: HitPauseEvent[] = [];
  private iterationCount: number = 0;
  private lastPauseTime: number = Date.now();
  private isPaused: boolean = false;

  constructor(config: Partial<HitPauseConfig> = {}) {
    this.config = { ...DEFAULT_HIT_PAUSE_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HitPauseConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HitPauseConfig {
    return { ...this.config };
  }

  /**
   * Check if Hit-Pause is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if currently in paused state
   */
  isCurrentlyPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Increment iteration counter
   */
  incrementIteration(): void {
    this.iterationCount++;
  }

  /**
   * Get current iteration count
   */
  getIterationCount(): number {
    return this.iterationCount;
  }

  /**
   * Reset iteration count
   */
  resetIterationCount(): void {
    this.iterationCount = 0;
  }

  /**
   * Check if should pause based on triggers
   */
  shouldPause(
    trigger: HitPauseTrigger,
    phase: Phase,
    step: number,
    context: Record<string, unknown> = {}
  ): boolean {
    // If not enabled or in autonomous mode, never pause automatically
    if (!this.config.enabled || this.config.mode === 'autonomous') {
      return false;
    }

    // Check if trigger is enabled
    if (!this.config.enabledTriggers.includes(trigger)) {
      return false;
    }

    // Check phase-specific triggers
    if (trigger === HitPauseTrigger.PHASE_ENTRY) {
      return this.config.pauseOnPhaseEntry.includes(phase);
    }

    if (trigger === HitPauseTrigger.PHASE_EXIT) {
      return this.config.pauseOnPhaseExit.includes(phase);
    }

    // Check iteration threshold
    if (trigger === HitPauseTrigger.ITERATION_THRESHOLD) {
      return this.iterationCount > 0 &&
             this.iterationCount % this.config.iterationThreshold === 0;
    }

    // Check time threshold
    if (trigger === HitPauseTrigger.TIME_THRESHOLD) {
      const elapsed = Date.now() - this.lastPauseTime;
      const thresholdMs = this.config.timeThresholdMinutes * 60 * 1000;
      return elapsed > thresholdMs;
    }

    // Manual and error triggers always checked
    if (trigger === HitPauseTrigger.MANUAL || trigger === HitPauseTrigger.ON_ERROR) {
      return true;
    }

    // Check custom pause points
    const key = `${phase}:${step}`;
    const customPoint = this.config.customPausePoints[key];
    if (customPoint && customPoint.trigger === trigger) {
      return true;
    }

    return false;
  }

  /**
   * Create a pause event
   */
  createPause(
    trigger: HitPauseTrigger,
    phase: Phase,
    step: number,
    message: string,
    severity: HitPauseSeverity = HitPauseSeverity.RECOMMENDED,
    context: Record<string, unknown> = {}
  ): HitPauseEvent {
    const pause: HitPauseEvent = {
      id: `pause-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      trigger,
      severity,
      phase,
      step,
      message,
      context,
      status: HitPauseStatus.ACTIVE,
      createdAt: new Date().toISOString()
    };

    this.activePauses.set(pause.id, pause);
    this.lastPauseTime = Date.now();

    return pause;
  }

  /**
   * Trigger a pause (creates and returns pause event)
   */
  async triggerPause(
    trigger: HitPauseTrigger,
    phase: Phase,
    step: number,
    message: string,
    severity: HitPauseSeverity = HitPauseSeverity.RECOMMENDED,
    context: Record<string, unknown> = {}
  ): Promise<HitPauseEvent | null> {
    // Check if should pause
    if (!this.shouldPause(trigger, phase, step, context)) {
      return null;
    }

    // Create pause event
    const pause = this.createPause(trigger, phase, step, message, severity, context);
    this.isPaused = true;

    return pause;
  }

  /**
   * Acknowledge a pause (user continues)
   */
  acknowledgePause(pauseId: string, message?: string): HitPauseResult {
    const pause = this.activePauses.get(pauseId);
    if (!pause) {
      return {
        acknowledged: false,
        continue: false,
        message: 'Pause not found',
        resolvedAt: new Date().toISOString()
      };
    }

    pause.status = HitPauseStatus.ACKNOWLEDGED;
    pause.resolvedAt = new Date().toISOString();
    pause.userResponse = message;

    this.moveToHistory(pause);
    this.isPaused = false;

    return {
      acknowledged: true,
      continue: true,
      message,
      resolvedAt: pause.resolvedAt
    };
  }

  /**
   * Skip a pause (continue without user input)
   */
  skipPause(pauseId: string): HitPauseResult {
    const pause = this.activePauses.get(pauseId);
    if (!pause) {
      return {
        acknowledged: false,
        continue: false,
        message: 'Pause not found',
        resolvedAt: new Date().toISOString()
      };
    }

    pause.status = HitPauseStatus.SKIPPED;
    pause.resolvedAt = new Date().toISOString();

    this.moveToHistory(pause);
    this.isPaused = false;

    return {
      acknowledged: true,
      continue: true,
      message: 'Pause skipped',
      resolvedAt: pause.resolvedAt
    };
  }

  /**
   * Cancel a pause (abort workflow)
   */
  cancelPause(pauseId: string, message?: string): HitPauseResult {
    const pause = this.activePauses.get(pauseId);
    if (!pause) {
      return {
        acknowledged: false,
        continue: false,
        message: 'Pause not found',
        resolvedAt: new Date().toISOString()
      };
    }

    pause.status = HitPauseStatus.CANCELLED;
    pause.resolvedAt = new Date().toISOString();
    pause.userResponse = message;

    this.moveToHistory(pause);
    this.isPaused = false;

    return {
      acknowledged: true,
      continue: false,
      message,
      resolvedAt: pause.resolvedAt
    };
  }

  /**
   * Get active pause
   */
  getActivePause(): HitPauseEvent | null {
    for (const pause of this.activePauses.values()) {
      if (pause.status === HitPauseStatus.ACTIVE) {
        return pause;
      }
    }
    return null;
  }

  /**
   * Get all active pauses
   */
  getActivePauses(): HitPauseEvent[] {
    return Array.from(this.activePauses.values())
      .filter(p => p.status === HitPauseStatus.ACTIVE);
  }

  /**
   * Get pause history
   */
  getPauseHistory(): HitPauseEvent[] {
    return [...this.pauseHistory];
  }

  /**
   * Get pause statistics
   */
  getStats(): {
    totalPauses: number;
    activePauses: number;
    acknowledged: number;
    skipped: number;
    cancelled: number;
    averagePauseDurationMs: number;
  } {
    const resolved = this.pauseHistory.filter(p => p.resolvedAt);
    const totalDuration = resolved.reduce((sum, p) => {
      const duration = new Date(p.resolvedAt!).getTime() - new Date(p.createdAt).getTime();
      return sum + duration;
    }, 0);

    return {
      totalPauses: this.pauseHistory.length,
      activePauses: this.getActivePauses().length,
      acknowledged: this.pauseHistory.filter(p => p.status === HitPauseStatus.ACKNOWLEDGED).length,
      skipped: this.pauseHistory.filter(p => p.status === HitPauseStatus.SKIPPED).length,
      cancelled: this.pauseHistory.filter(p => p.status === HitPauseStatus.CANCELLED).length,
      averagePauseDurationMs: resolved.length > 0 ? totalDuration / resolved.length : 0
    };
  }

  /**
   * Clear pause history
   */
  clearHistory(): void {
    this.pauseHistory = [];
  }

  /**
   * Request manual pause
   */
  requestManualPause(
    phase: Phase,
    step: number,
    message: string = 'Manual pause requested'
  ): HitPauseEvent | null {
    // Even in autonomous mode, manual pauses can be triggered
    if (!this.config.enabled) {
      return null;
    }

    return this.createPause(
      HitPauseTrigger.MANUAL,
      phase,
      step,
      message,
      HitPauseSeverity.REQUIRED,
      { manualRequest: true }
    );
  }

  /**
   * Set mode (autonomous or interactive)
   */
  setMode(mode: 'autonomous' | 'interactive'): void {
    this.config.mode = mode;

    // Apply preset configurations
    if (mode === 'interactive') {
      this.config = { ...this.config, ...INTERACTIVE_HIT_PAUSE_CONFIG };
    } else {
      this.config = { ...this.config, ...DEFAULT_HIT_PAUSE_CONFIG };
    }
  }

  /**
   * Get current mode
   */
  getMode(): 'autonomous' | 'interactive' {
    return this.config.mode;
  }

  private moveToHistory(pause: HitPauseEvent): void {
    this.activePauses.delete(pause.id);
    this.pauseHistory.push(pause);

    // Keep only last 100 pauses in history
    if (this.pauseHistory.length > 100) {
      this.pauseHistory.shift();
    }
  }
}

/**
 * Create a HitPauseManager with default configuration
 */
export function createHitPauseManager(config?: Partial<HitPauseConfig>): HitPauseManager {
  return new HitPauseManager(config);
}

/**
 * Create a HitPauseManager for interactive mode
 */
export function createInteractiveHitPauseManager(): HitPauseManager {
  return new HitPauseManager(INTERACTIVE_HIT_PAUSE_CONFIG);
}
