// State Machine - Core workflow orchestration
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { getTelemetryCollector } from '../telemetry/index.js';

// Phase definitions matching the BMAD methodology
export enum Phase {
  NEW = 'NEW',
  ANALYSIS = 'ANALYSIS',
  PLANNING = 'PLANNING',
  SOLUTIONING = 'SOLUTIONING',
  IMPLEMENTATION = 'IMPLEMENTATION',
  WRAP_UP = 'WRAP_UP',
  COMPLETE = 'COMPLETE'
}

// Action types for state machine
export enum ActionType {
  ADVANCE = 'advance',
  ROLLBACK = 'rollback',
  SKIP = 'skip',
  OVERRIDE = 'override'
}

// Deterministic error codes
export enum ErrorCode {
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  STATE_CORRUPTED = 'STATE_CORRUPTED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  AUDIT_FAILURE = 'AUDIT_FAILURE'
}

// WorkflowError - Base error class
export class WorkflowError extends Error {
  code: ErrorCode;
  recovery: string;

  constructor(message: string, code: ErrorCode, recovery: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.recovery = recovery;
  }
}

// InvalidTransitionError - Thrown when an invalid transition is attempted
export class InvalidTransitionError extends WorkflowError {
  from: Phase;
  action: ActionType;
  validTransitions: Phase[];

  constructor(
    message: string,
    from: Phase,
    action: ActionType,
    validTransitions: Phase[],
    recovery: string = 'retry_valid_action'
  ) {
    super(message, ErrorCode.INVALID_TRANSITION, recovery);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.action = action;
    this.validTransitions = validTransitions;
  }
}

export interface ProjectState {
  projectName: string;
  phase: Phase;
  currentStep: number;
  totalSteps: number;
  lastUpdated: string;
  decisions: Decision[];
  errors: ErrorRecord[];
  context: Record<string, any>;
  auditLog: TransitionAuditEntry[];
}

export interface Decision {
  id: string;
  phase: Phase;
  description: string;
  timestamp: string;
  override?: boolean;
}

export interface ErrorRecord {
  id: string;
  message: string;
  phase: Phase;
  timestamp: string;
  retryable: boolean;
  resolved: boolean;
}

// Phase step configuration
const PHASE_STEPS: Record<Phase, number> = {
  [Phase.NEW]: 1,
  [Phase.ANALYSIS]: 5,
  [Phase.PLANNING]: 4,
  [Phase.SOLUTIONING]: 4,
  [Phase.IMPLEMENTATION]: 10,
  [Phase.WRAP_UP]: 3,
  [Phase.COMPLETE]: 0
};

// Phase transition rules
// IMPLEMENTATION must transition to WRAP_UP - no bypass allowed
const PHASE_TRANSITIONS: Record<Phase, Phase> = {
  [Phase.NEW]: Phase.ANALYSIS,
  [Phase.ANALYSIS]: Phase.PLANNING,
  [Phase.PLANNING]: Phase.SOLUTIONING,
  [Phase.SOLUTIONING]: Phase.IMPLEMENTATION,
  [Phase.IMPLEMENTATION]: Phase.WRAP_UP,
  [Phase.WRAP_UP]: Phase.COMPLETE,
  [Phase.COMPLETE]: Phase.COMPLETE
};

// Rollback transitions (which phases can go back to)
const ROLLBACK_TRANSITIONS: Record<Phase, Phase | null> = {
  [Phase.NEW]: null,  // Cannot rollback from NEW
  [Phase.ANALYSIS]: Phase.NEW,
  [Phase.PLANNING]: Phase.ANALYSIS,
  [Phase.SOLUTIONING]: Phase.PLANNING,
  [Phase.IMPLEMENTATION]: Phase.SOLUTIONING,
  [Phase.WRAP_UP]: Phase.IMPLEMENTATION,
  [Phase.COMPLETE]: Phase.WRAP_UP
};

// Transition audit entry
export interface TransitionAuditEntry {
  id: string;
  from: Phase;
  to: Phase;
  action: ActionType;
  timestamp: string;
  correlationId: string;
  success: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
}

const STATE_FILE = join(homedir(), '.vibe-flow', 'state.json');

// Validation: Get valid transitions from a given phase
export function getValidTransitions(from: Phase): Phase[] {
  const valid: Phase[] = [];

  // Advance is valid if not at COMPLETE
  const advanceTarget = PHASE_TRANSITIONS[from];
  if (advanceTarget && advanceTarget !== from) {
    valid.push(advanceTarget);
  }

  // Rollback is valid if there's a previous phase
  const rollbackTarget = ROLLBACK_TRANSITIONS[from];
  if (rollbackTarget) {
    valid.push(rollbackTarget);
  }

  return valid;
}

// Validation: Check if transition is valid
export function isTransitionValid(from: Phase, action: ActionType): boolean {
  switch (action) {
    case ActionType.ADVANCE:
      return PHASE_TRANSITIONS[from] !== from;
    case ActionType.ROLLBACK:
      return ROLLBACK_TRANSITIONS[from] !== null;
    case ActionType.SKIP:
      // Skip is never allowed - must go through all phases
      return false;
    case ActionType.OVERRIDE:
      // Override requires justification, handled separately
      return false;
    default:
      return false;
  }
}

// Validation: Validate a transition
export function validateTransition(from: Phase, action: ActionType): { valid: boolean; errorCode?: ErrorCode } {
  const validActions = Object.values(ActionType);

  if (!validActions.includes(action)) {
    return { valid: false, errorCode: ErrorCode.INVALID_TRANSITION };
  }

  if (!isTransitionValid(from, action)) {
    return { valid: false, errorCode: ErrorCode.INVALID_TRANSITION };
  }

  return { valid: true };
}

export class StateMachine {
  private state: ProjectState | null = null;
  private auditLog: TransitionAuditEntry[] = [];

  constructor() {
    // Defer directory creation to avoid blocking constructor
    this.ensureStateDirectoryAsync();
  }

  private ensureStateDirectoryAsync(): void {
    this.ensureStateDirectory().catch(error => {
      console.error('[StateMachine] Failed to create state directory:', error);
    });
  }

  private async ensureStateDirectory(): Promise<void> {
    const stateDir = dirname(STATE_FILE);
    await fs.mkdir(stateDir, { recursive: true });
  }

  async initialize(projectName: string): Promise<ProjectState> {
    // Validate projectName
    if (!projectName || projectName.trim().length === 0) {
      throw new WorkflowError(
        'Project name is required',
        ErrorCode.VALIDATION_FAILED,
        'provide_a_valid_project_name'
      );
    }

    if (projectName.length > 255) {
      throw new WorkflowError(
        'Project name must be less than 255 characters',
        ErrorCode.VALIDATION_FAILED,
        'shorten_project_name'
      );
    }

    const initialState: ProjectState = {
      projectName,
      phase: Phase.NEW,
      currentStep: 1,
      totalSteps: PHASE_STEPS[Phase.NEW],
      lastUpdated: new Date().toISOString(),
      decisions: [],
      errors: [],
      context: {},
      auditLog: []
    };

    this.state = initialState;
    await this.persist();
    return this.state;
  }

  async getState(): Promise<ProjectState> {
    if (!this.state) {
      await this.load();
    }
    if (!this.state) {
      throw new Error('No project state found. Run "vibe-flow start" first.');
    }
    return this.state;
  }

  async advance(): Promise<ProjectState> {
    return this.transition(ActionType.ADVANCE);
  }

  /**
   * Perform a deterministic transition with validation
   * This is the main method that enforces transition rules
   */
  async transition(action: ActionType): Promise<ProjectState> {
    const telemetry = getTelemetryCollector();
    const state = await this.getState();
    const from = state.phase;
    const correlationId = `sm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Start telemetry timer for phase transition
    telemetry.startTimer(correlationId);

    // Validate transition
    const validation = validateTransition(from, action);
    if (!validation.valid) {
      const validTransitions = getValidTransitions(from);

      // Log invalid transition to audit trail
      const auditEntry: TransitionAuditEntry = {
        id: correlationId,
        from,
        to: from,
        action,
        timestamp,
        correlationId,
        success: false,
        errorCode: validation.errorCode,
        errorMessage: `Invalid transition from ${from} with action ${action}`
      };
      this.auditLog.push(auditEntry);

      // Persist audit log in state
      if (!state.auditLog) {
        state.auditLog = [];
      }
      state.auditLog.push(auditEntry);

      // Record telemetry for failed transition
      await telemetry.recordMetric(
        `transition-failed-${from}`,
        correlationId,
        false,
        { action, errorCode: validation.errorCode }
      );

      // Throw deterministic error
      throw new InvalidTransitionError(
        `Invalid transition from ${from} with action ${action}. Valid actions: ${validTransitions.join(', ')}`,
        from,
        action,
        validTransitions,
        'retry_valid_action'
      );
    }

    // Determine target phase
    let to: Phase;
    switch (action) {
      case ActionType.ADVANCE:
        to = PHASE_TRANSITIONS[from];
        break;
      case ActionType.ROLLBACK:
        to = ROLLBACK_TRANSITIONS[from]!;
        break;
      default:
        to = from;
    }

    // Log successful transition
    const auditEntry: TransitionAuditEntry = {
      id: correlationId,
      from,
      to,
      action,
      timestamp,
      correlationId,
      success: true
    };
    this.auditLog.push(auditEntry);

    // Persist audit log in state
    if (!state.auditLog) {
      state.auditLog = [];
    }
    state.auditLog.push(auditEntry);

    // Execute transition
    if (state.currentStep < state.totalSteps) {
      state.currentStep++;
    } else {
      state.phase = to;
      state.currentStep = 1;
      state.totalSteps = PHASE_STEPS[to];
    }

    state.lastUpdated = new Date().toISOString();
    await this.persist();

    // Record telemetry for successful transition
    const metricName = action === ActionType.ADVANCE
      ? `phase-advance-${from}-to-${to}`
      : `phase-rollback-${from}-to-${to}`;
    await telemetry.recordMetric(
      metricName,
      correlationId,
      true,
      { from, to, action, currentStep: state.currentStep, totalSteps: state.totalSteps }
    );

    return state;
  }

  /**
   * Rollback to previous phase
   */
  async rollback(): Promise<ProjectState> {
    return this.transition(ActionType.ROLLBACK);
  }

  /**
   * Get audit log for tracking
   */
  getAuditLog(): TransitionAuditEntry[] {
    return [...this.auditLog];
  }

  async addDecision(phase: Phase, description: string, override: boolean = false): Promise<void> {
    const state = await this.getState();
    const decision: Decision = {
      id: `decision-${Date.now()}`,
      phase,
      description,
      timestamp: new Date().toISOString(),
      override
    };
    state.decisions.push(decision);
    state.lastUpdated = new Date().toISOString();
    await this.persist();
  }

  async addError(message: string, retryable: boolean = false): Promise<void> {
    const state = await this.getState();
    const error: ErrorRecord = {
      id: `error-${Date.now()}`,
      message,
      phase: state.phase,
      timestamp: new Date().toISOString(),
      retryable,
      resolved: false
    };
    state.errors.push(error);
    state.lastUpdated = new Date().toISOString();
    await this.persist();
  }

  async resolveError(errorId: string): Promise<void> {
    const state = await this.getState();
    const error = state.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      state.lastUpdated = new Date().toISOString();
      await this.persist();
    }
  }

  async updateContext(key: string, value: any): Promise<void> {
    const state = await this.getState();
    state.context[key] = value;
    state.lastUpdated = new Date().toISOString();
    await this.persist();
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      this.state = JSON.parse(content);
      // Restore audit log from persisted state
      if (this.state?.auditLog) {
        this.auditLog = [...this.state.auditLog];
      }
    } catch (error) {
      // State file doesn't exist yet
      this.state = null;
    }
  }

  private async persist(): Promise<void> {
    if (!this.state) return;

    const stateDir = dirname(STATE_FILE);
    const walFile = join(stateDir, 'state.wal');
    const tempFile = STATE_FILE + '.tmp';

    // Ensure directory exists before writing
    try {
      await fs.mkdir(stateDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    // Write-Ahead Log: always write to WAL first for crash recovery
    const walEntry = {
      timestamp: new Date().toISOString(),
      state: this.state
    };
    try {
      await fs.appendFile(walFile, JSON.stringify(walEntry) + '\n', 'utf-8');
    } catch (error) {
      // WAL write failed - log but continue with atomic write
      console.error('[StateMachine] WAL write failed:', error);
    }

    // Atomic write using temp file + rename
    // On Windows, rename fails if dest doesn't exist, so we handle both cases
    await fs.writeFile(tempFile, JSON.stringify(this.state, null, 2), 'utf-8');
    try {
      await fs.rename(tempFile, STATE_FILE);
    } catch (renameErr) {
      // Windows fallback: copy file and delete temp
      const err = renameErr as { code?: string };
      if (err.code === 'EXDEV' || err.code === 'ENOENT') {
        // Try to handle the case where destination doesn't exist
        try {
          // Check if target exists, if not we can just use the temp file as the new file
          await fs.copyFile(tempFile, STATE_FILE);
          await fs.unlink(tempFile);
        } catch (copyErr) {
          // If copy also fails, try one more approach
          const content = await fs.readFile(tempFile, 'utf-8');
          await fs.writeFile(STATE_FILE, content, 'utf-8');
          await fs.unlink(tempFile).catch(() => { /* ignore if already deleted */ });
        }
      } else {
        throw renameErr;
      }
    }
  }

  // Utility methods for external use
  canAdvance(): boolean {
    return this.state?.phase !== Phase.COMPLETE;
  }

  getCurrentPhase(): Phase {
    return this.state?.phase || Phase.NEW;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    if (!this.state) return { current: 0, total: 0, percentage: 0 };

    let totalSteps = 0;
    let currentStepGlobal = 0;

    const phases = Object.values(Phase);
    for (const phase of phases) {
      const phaseSteps = PHASE_STEPS[phase];
      if (phase === this.state.phase) {
        currentStepGlobal += this.state.currentStep;
        totalSteps += phaseSteps;
        break;
      }
      totalSteps += phaseSteps;
      currentStepGlobal += phaseSteps;
    }

    return {
      current: currentStepGlobal,
      total: totalSteps,
      percentage: Math.round((currentStepGlobal / totalSteps) * 100)
    };
  }
}

// Re-export Story 1.2: Project State Classification
export { ProjectStateClassifier, ProjectClassification } from './project-classifier.js';

// Re-export Story 1.4: State Drift Detection
export { StateDriftDetector, DriftStatus } from './state-drift-detector.js';

// Re-export Story: State Machine Tracker (Stagnation Detection)
export {
  StateMachineTracker,
  CircuitBreakerError,
  TransitionRecord,
  ArtifactSnapshot,
  StagnationResult
} from './tracker.js';

// Re-export Story: State Machine Telemetry
export {
  StateMachineTelemetry,
  getGlobalTelemetry,
  createTelemetry,
  formatDuration,
  estimateTokensFromText,
  MetricData,
  SessionMetrics,
  TransitionMetric,
  PhaseMetrics
} from './telemetry.js';

// Re-export Story 1.6: Workspace Lock Manager (File Lock)
export {
  WorkspaceLockManager,
  LockError,
  LockType,
  getGlobalLockManager,
  resetGlobalLockManager
} from './file-lock.js';

// Re-export Orchestrator - Advanced orchestration layer
export {
  Orchestrator,
  OrchestratorConfig,
  OrchestratorContext,
  OrchestratorResult,
  TransitionLifecycleHook,
  SubagentIsolator,
  ContextEditor,
  LLMHttpClient,
  createOrchestrator,
  getDefaultOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG
} from './orchestrator.js';

// Re-export Quality Gate Interceptor - Architectural quality gate
export {
  QualityGateInterceptor,
  QualityGateStatus,
  QualityGateResult,
  QualityCheck,
  RefinementAction,
  ArchitectureGuard,
  RefinerManager,
  createQualityGate,
  getGlobalQualityGate,
  resetGlobalQualityGate
} from './quality-gate.js';

// Re-export Security Guard - OWASP Security Scanner
export {
  SecurityGuard,
  SecuritySeverity,
  OWASPViolation,
  OWASPScanResult,
  SecurityGateConfig,
  DEFAULT_SECURITY_GATE_CONFIG,
  SecurityQualityCheck,
  createSecurityGuard,
  getGlobalSecurityGuard,
  resetGlobalSecurityGuard
} from './security-guard.js';

// Re-export SubagentCoordinator - Parallel task coordination for Implementation phase
export {
  SubagentCoordinator,
  TaskStatus,
  ParallelTask,
  TaskResult,
  CoordinatorResult,
  CoordinatorConfig,
  CoordinatorStatus,
  PhaseTransitionContext,
  canTransitionToImplementation,
  extractParallelTasks,
  createSubagentCoordinator,
  createCoordinatorWithDefaults
} from './subagent-coordinator.js';
