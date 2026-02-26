// Simple Logger - Appends usage logs to .vibe-flow/usage.log
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const USAGE_LOG_FILE = join(homedir(), '.vibe-flow', 'usage.log');

export class Logger {
  private initialized: boolean = false;

  constructor() {
    this.ensureLogDirectory();
  }

  private async ensureLogDirectory(): Promise<void> {
    const logDir = dirname(USAGE_LOG_FILE);
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.error('[Logger] Failed to create log directory:', error);
    }
    this.initialized = true;
  }

  /**
   * Append a log entry to the usage log file
   */
  async log(message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    if (!this.initialized) {
      await this.ensureLogDirectory();
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    try {
      await fs.appendFile(USAGE_LOG_FILE, logEntry, 'utf-8');
    } catch (error) {
      console.error('[Logger] Failed to write to log file:', error);
    }
  }

  /**
   * Log info level message
   */
  async info(message: string): Promise<void> {
    await this.log(message, 'info');
  }

  /**
   * Log warning level message
   */
  async warn(message: string): Promise<void> {
    await this.log(message, 'warn');
  }

  /**
   * Log error level message
   */
  async error(message: string): Promise<void> {
    await this.log(message, 'error');
  }
}

// Singleton instance
let logger: Logger | null = null;

export function getLogger(): Logger {
  if (!logger) {
    logger = new Logger();
  }
  return logger;
}
