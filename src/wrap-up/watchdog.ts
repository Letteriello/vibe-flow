// Wrap-up Watchdog - Real-time progress logging for wrap-up debugging
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

/**
 * WrapUpWatchdog - Real-time progress logger for wrap-up process debugging
 * Writes step-by-step progress to .vibe-flow/wrap-up.log with millisecond timestamps
 */
export class WrapUpWatchdog {
  private logFilePath: string;
  private stepCount: number = 0;
  private totalSteps: number = 0;
  private sessionId: string;
  private enabled: boolean = true;

  constructor(totalSteps: number = 5) {
    this.totalSteps = totalSteps;
    this.sessionId = this.generateSessionId();
    this.logFilePath = join(process.cwd(), '.vibe-flow', 'wrap-up.log');
  }

  /**
   * Generate a unique session ID for this wrap-up execution
   */
  private generateSessionId(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${dateStr}-${timeStr}`;
  }

  /**
   * Get current timestamp with millisecond precision
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Format a log message with timestamp and session info
   */
  private formatMessage(message: string): string {
    return `[${this.getTimestamp()}] [${this.sessionId}] ${message}`;
  }

  /**
   * Ensure the .vibe-flow directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    const dir = dirname(this.logFilePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error: unknown) {
      // Directory may already exist
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Write a log message to the file
   */
  private async writeLog(message: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.ensureLogDirectory();
      const formattedMessage = this.formatMessage(message) + '\n';

      // Append to log file
      await fs.appendFile(this.logFilePath, formattedMessage, 'utf-8');
    } catch (error: unknown) {
      // Silently fail to avoid disrupting the main process
      console.error('[Watchdog] Failed to write log:', (error as Error).message);
    }
  }

  /**
   * Log a step start
   */
  async logStep(stepNumber: number, description: string): Promise<void> {
    this.stepCount = stepNumber;
    const progress = `${stepNumber}/${this.totalSteps}`;
    await this.writeLog(`Step ${progress}: ${description}`);
  }

  /**
   * Log an intermediate progress message within a step
   */
  async logProgress(message: string): Promise<void> {
    const progress = `${this.stepCount}/${this.totalSteps}`;
    await this.writeLog(`Step ${progress}: ${message}`);
  }

  /**
   * Log the start of a new phase
   */
  async logPhase(phaseName: string): Promise<void> {
    await this.writeLog(`=== PHASE: ${phaseName} ===`);
  }

  /**
   * Log the completion of a step
   */
  async logComplete(stepNumber: number, description: string): Promise<void> {
    const progress = `${stepNumber}/${this.totalSteps}`;
    await this.writeLog(`Step ${progress} ✓: ${description}`);
  }

  /**
   * Log an error during wrap-up
   */
  async logError(message: string, error?: unknown): Promise<void> {
    const errorMsg = error ? `${message} - ${(error as Error).message}` : message;
    await this.writeLog(`ERROR: ${errorMsg}`);
  }

  /**
   * Log a warning during wrap-up
   */
  async logWarning(message: string): Promise<void> {
    await this.writeLog(`WARNING: ${message}`);
  }

  /**
   * Log the start of wrap-up process
   */
  async start(): Promise<void> {
    await this.writeLog('========================================');
    await this.writeLog(`Wrap-up session STARTED (${this.totalSteps} steps)`);
    await this.writeLog('========================================');
  }

  /**
   * Log the end of wrap-up process
   */
  async finish(success: boolean = true): Promise<void> {
    await this.writeLog('========================================');
    await this.writeLog(`Wrap-up session ${success ? 'COMPLETED' : 'FAILED'}`);
    await this.writeLog(`Total steps logged: ${this.stepCount}`);
    await this.writeLog('========================================');
  }

  /**
   * Disable logging (useful for testing or when logging is not desired)
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Enable logging
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logFilePath;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear the log file (useful for fresh start)
   */
  async clearLog(): Promise<void> {
    try {
      await this.ensureLogDirectory();
      await fs.writeFile(this.logFilePath, '', 'utf-8');
    } catch (error: unknown) {
      console.error('[Watchdog] Failed to clear log:', (error as Error).message);
    }
  }
}

/**
 * Create a new WrapUpWatchdog instance
 */
export function createWatchdog(totalSteps: number = 5): WrapUpWatchdog {
  return new WrapUpWatchdog(totalSteps);
}
