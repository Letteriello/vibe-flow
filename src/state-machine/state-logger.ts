// State Diagnostics Logger - Colored console output for BMAD phase transitions
import { Phase } from './index.js';

// ANSI Color Codes
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Phase-specific colors
  phaseNew: '\x1b[36m',        // Cyan
  phaseAnalysis: '\x1b[33m',   // Yellow
  phasePlanning: '\x1b[35m',    // Magenta
  phaseSolutioning: '\x1b[34m', // Blue
  phaseImplementation: '\x1b[32m', // Green
  phaseComplete: '\x1b[36m'     // Cyan
};

// Phase order for progression display
const PHASE_ORDER = [
  Phase.NEW,
  Phase.ANALYSIS,
  Phase.PLANNING,
  Phase.SOLUTIONING,
  Phase.IMPLEMENTATION,
  Phase.COMPLETE
];

// Get color for a specific phase
function getPhaseColor(phase: Phase): string {
  switch (phase) {
    case Phase.NEW:
      return Colors.phaseNew;
    case Phase.ANALYSIS:
      return Colors.phaseAnalysis;
    case Phase.PLANNING:
      return Colors.phasePlanning;
    case Phase.SOLUTIONING:
      return Colors.phaseSolutioning;
    case Phase.IMPLEMENTATION:
      return Colors.phaseImplementation;
    case Phase.COMPLETE:
      return Colors.phaseComplete;
    default:
      return Colors.white;
  }
}

// Format duration in human-readable format
function formatDuration(ms: number): string {
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

// Pad string to fixed width
function pad(str: string, width: number): string {
  const len = str.length;
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
}

// Phase step configuration (same as in index.ts)
const PHASE_STEPS: Record<Phase, number> = {
  [Phase.NEW]: 1,
  [Phase.ANALYSIS]: 5,
  [Phase.PLANNING]: 4,
  [Phase.SOLUTIONING]: 4,
  [Phase.IMPLEMENTATION]: 10,
  [Phase.WRAP_UP]: 3,
  [Phase.COMPLETE]: 0
};

interface PhaseTimer {
  startTime: number;
  phase: Phase;
}

export interface DiagnosticOptions {
  showTimestamp?: boolean;
  showDuration?: boolean;
  showProgress?: boolean;
  compact?: boolean;
}

class StateDiagnosticsLogger {
  private currentPhase: Phase = Phase.NEW;
  private phaseStartTime: number = Date.now();
  private phaseTimers: Map<string, PhaseTimer> = new Map();
  private transitionCount: number = 0;
  private options: DiagnosticOptions;

  constructor(options: DiagnosticOptions = {}) {
    this.options = {
      showTimestamp: true,
      showDuration: true,
      showProgress: true,
      compact: false,
      ...options
    };
    this.phaseStartTime = Date.now();
  }

  // Update current phase and restart timer
  setPhase(phase: Phase): void {
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();
  }

  // Get elapsed time in current phase
  getElapsedTime(): number {
    return Date.now() - this.phaseStartTime;
  }

  // Log phase transition
  logTransition(from: Phase, to: Phase, currentStep: number = 1, totalSteps: number = 1): void {
    this.transitionCount++;
    const elapsed = this.getElapsedTime();
    const phaseColor = getPhaseColor(to);

    if (this.options.compact) {
      this.logCompactTransition(from, to, currentStep, totalSteps);
      return;
    }

    // Build output parts
    const parts: string[] = [];

    // Timestamp
    if (this.options.showTimestamp) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
      parts.push(`${Colors.dim}[${timestamp}]${Colors.reset}`);
    }

    // Transition indicator
    const arrow = from === to ? '→' : '→';
    const fromColor = getPhaseColor(from);
    const transitionText = `${fromColor}${this.formatPhaseName(from)}${Colors.reset} ${arrow} ${phaseColor}${this.formatPhaseName(to)}${Colors.reset}`;
    parts.push(transitionText);

    // Progress
    if (this.options.showProgress && totalSteps > 0) {
      const progress = `[${currentStep}/${totalSteps}]`;
      parts.push(`${Colors.dim}${progress}${Colors.reset}`);
    }

    // Duration
    if (this.options.showDuration) {
      const durationText = `${Colors.yellow}${formatDuration(elapsed)}${Colors.reset}`;
      parts.push(`Elapsed: ${durationText}`);
    }

    // Transition count
    parts.push(`${Colors.dim}#${this.transitionCount}${Colors.reset}`);

    console.log(parts.join(' '));

    // Update phase
    this.setPhase(to);
  }

  // Compact format for terminal with limited width
  private logCompactTransition(from: Phase, to: Phase, currentStep: number, totalSteps: number): void {
    const phaseColor = getPhaseColor(to);
    const fromColor = getPhaseColor(from);
    const arrow = from === to ? '→' : '→';

    let line = `${phaseColor}${this.formatPhaseName(to)}${Colors.reset}`;
    if (totalSteps > 0) {
      line += ` ${Colors.dim}${currentStep}/${totalSteps}${Colors.reset}`;
    }
    line += ` ${arrow} ${fromColor}${this.formatPhaseName(from)}${Colors.reset}`;

    console.log(line);
  }

  // Log current status
  logStatus(projectName?: string): void {
    const phaseColor = getPhaseColor(this.currentPhase);
    const elapsed = this.getElapsedTime();
    const stepInfo = this.getStepInfo();

    const parts: string[] = [];

    // Project name
    if (projectName) {
      parts.push(`${Colors.bright}${projectName}${Colors.reset}`);
      parts.push('|');
    }

    // Phase
    parts.push(`${phaseColor}${Colors.bright}${this.formatPhaseName(this.currentPhase)}${Colors.reset}`);

    // Step progress
    if (stepInfo.currentStep > 0 && stepInfo.totalSteps > 0) {
      const progress = `${stepInfo.currentStep}/${stepInfo.totalSteps}`;
      const bar = this.renderProgressBar(stepInfo.currentStep, stepInfo.totalSteps);
      parts.push(`${Colors.dim}${bar}${Colors.reset}`);
      parts.push(`${Colors.cyan}${progress}${Colors.reset}`);
    }

    // Duration
    if (this.options.showDuration) {
      parts.push(`${Colors.yellow}${formatDuration(elapsed)}${Colors.reset}`);
    }

    console.log(parts.join(' '));
  }

  // Render ASCII progress bar
  private renderProgressBar(current: number, total: number, width: number = 20): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const fillChar = '█';
    const emptyChar = '░';

    return fillChar.repeat(filled) + emptyChar.repeat(empty);
  }

  // Format phase name for display
  private formatPhaseName(phase: Phase): string {
    return phase.toLowerCase().replace(/^./, c => c.toUpperCase());
  }

  // Get step information
  private getStepInfo(): { currentStep: number; totalSteps: number } {
    return {
      currentStep: 1, // Will be set by transition
      totalSteps: PHASE_STEPS[this.currentPhase] || 1
    };
  }

  // Log workflow progress (all phases)
  logWorkflowProgress(): void {
    const currentIndex = PHASE_ORDER.indexOf(this.currentPhase);
    const elapsed = this.getElapsedTime();

    console.log(`\n${Colors.bright}BMAD Workflow Progress${Colors.reset}`);
    console.log(Colors.dim + '─'.repeat(50) + Colors.reset);

    PHASE_ORDER.forEach((phase, index) => {
      const phaseColor = getPhaseColor(phase);
      const isCurrent = phase === this.currentPhase;
      const isPast = index < currentIndex;

      let marker: string;
      if (isCurrent) {
        marker = `${Colors.bright}${Colors.green}●${Colors.reset}`;
      } else if (isPast) {
        marker = `${Colors.green}✓${Colors.reset}`;
      } else {
        marker = `${Colors.dim}○${Colors.reset}`;
      }

      const phaseName = pad(this.formatPhaseName(phase), 15);

      if (isCurrent) {
        const elapsedStr = formatDuration(elapsed);
        console.log(`  ${marker} ${phaseColor}${phaseName}${Colors.reset} ${Colors.yellow}${elapsedStr}${Colors.reset}`);
      } else {
        console.log(`  ${marker} ${phaseColor}${phaseName}${Colors.reset}`);
      }
    });

    console.log(Colors.dim + '─'.repeat(50) + Colors.reset + '\n');
  }

  // Log warning message
  logWarning(message: string): void {
    const timestamp = this.options.showTimestamp
      ? `${Colors.dim}[${new Date().toISOString().split('T')[1].slice(0, 12)}]${Colors.reset}`
      : '';
    console.log(`${timestamp} ${Colors.yellow}⚠${Colors.reset} ${message}`.trim());
  }

  // Log error message
  logError(message: string): void {
    const timestamp = this.options.showTimestamp
      ? `${Colors.dim}[${new Date().toISOString().split('T')[1].slice(0, 12)}]${Colors.reset}`
      : '';
    console.log(`${timestamp} ${Colors.red}✗${Colors.reset} ${message}`.trim());
  }

  // Log success message
  logSuccess(message: string): void {
    const timestamp = this.options.showTimestamp
      ? `${Colors.dim}[${new Date().toISOString().split('T')[1].slice(0, 12)}]${Colors.reset}`
      : '';
    console.log(`${timestamp} ${Colors.green}✓${Colors.reset} ${message}`.trim());
  }

  // Log info message
  logInfo(message: string): void {
    const timestamp = this.options.showTimestamp
      ? `${Colors.dim}[${new Date().toISOString().split('T')[1].slice(0, 12)}]${Colors.reset}`
      : '';
    console.log(`${timestamp} ${Colors.cyan}ℹ${Colors.reset} ${message}`.trim());
  }

  // Start timer for a specific phase
  startPhaseTimer(phase: Phase): void {
    this.phaseTimers.set(phase, {
      startTime: Date.now(),
      phase
    });
  }

  // Get timer for specific phase
  getPhaseTimer(phase: Phase): number | null {
    const timer = this.phaseTimers.get(phase);
    return timer ? Date.now() - timer.startTime : null;
  }

  // Get total transition count
  getTransitionCount(): number {
    return this.transitionCount;
  }

  // Get current phase
  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  // Update options
  setOptions(options: Partial<DiagnosticOptions>): void {
    this.options = { ...this.options, ...options };
  }

  // Reset logger state
  reset(): void {
    this.currentPhase = Phase.NEW;
    this.phaseStartTime = Date.now();
    this.phaseTimers.clear();
    this.transitionCount = 0;
  }
}

// Export singleton instance
export const stateLogger = new StateDiagnosticsLogger();

// Convenience functions for direct use
export function logTransition(from: Phase, to: Phase, currentStep?: number, totalSteps?: number): void {
  stateLogger.logTransition(from, to, currentStep, totalSteps);
}

export function logStatus(projectName?: string): void {
  stateLogger.logStatus(projectName);
}

export function logWorkflowProgress(): void {
  stateLogger.logWorkflowProgress();
}

export function logWarning(message: string): void {
  stateLogger.logWarning(message);
}

export function logError(message: string): void {
  stateLogger.logError(message);
}

export function logSuccess(message: string): void {
  stateLogger.logSuccess(message);
}

export function logInfo(message: string): void {
  stateLogger.logInfo(message);
}

export function setPhase(phase: Phase): void {
  stateLogger.setPhase(phase);
}

export function getElapsedTime(): number {
  return stateLogger.getElapsedTime();
}

export function getCurrentPhase(): Phase {
  return stateLogger.getCurrentPhase();
}

export { StateDiagnosticsLogger };
