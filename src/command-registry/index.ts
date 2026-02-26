// Command Registry - Maps phases to bmalph CLI commands
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export interface CommandDefinition {
  command: string;
  description: string;
  checkpoint?: boolean;
}

export interface CommandResult {
  correlationId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timestamp: string;
  success: boolean;
}

// Claude Code CLI path - try multiple locations
function getClaudeCLIPath(): string {
  const possiblePaths = [
    'claude',  // System PATH
    'C:\\Users\\gabri\\AppData\\Roaming\\npm\\claude',
    '/c/Users/gabri/AppData/Roaming/npm/claude',
    join(homedir(), 'AppData', 'Roaming', 'npm', 'claude')
  ];

  for (const p of possiblePaths) {
    try {
      // Just check if it might work - we'll test execution
      if (p === 'claude') return p;
      if (existsSync(p)) return p;
      if (existsSync(p + '.cmd')) return p + '.cmd';
    } catch {
      // Continue to next
    }
  }
  return 'claude'; // Fallback to system PATH
}

// Default phase-to-command mapping for bmalph
export const DEFAULT_COMMAND_MAP: Record<string, Record<number, CommandDefinition>> = {
  ANALYSIS: {
    1: { command: '/bmalph create-brief', description: 'Create project brief', checkpoint: true },
    2: { command: '/bmalph brainstorm-project', description: 'Brainstorm project scope' },
    3: { command: '/bmalph market-research', description: 'Conduct market research' },
    4: { command: '/bmalph domain-research', description: 'Conduct domain research' },
    5: { command: '/bmalph technical-research', description: 'Conduct technical research', checkpoint: true }
  },
  PLANNING: {
    1: { command: '/bmalph create-prd', description: 'Create Product Requirements Document', checkpoint: true },
    2: { command: '/bmalph create-ux', description: 'Create UX Design specification' },
    3: { command: '/bmalph create-architecture', description: 'Create Technical Architecture', checkpoint: true },
    4: { command: '/bmalph create-epics-stories', description: 'Create Epics and Stories breakdown' }
  },
  SOLUTIONING: {
    1: { command: '/bmalph implementation-readiness', description: 'Check implementation readiness', checkpoint: true },
    2: { command: '/bmalph validate-prd', description: 'Validate PRD completeness' },
    3: { command: '/bmalph validate-architecture', description: 'Validate architecture design' },
    4: { command: '/bmalph validate-epics-stories', description: 'Validate epics and stories', checkpoint: true }
  },
  IMPLEMENTATION: {
    1: { command: '/bmalph sprint-planning', description: 'Plan sprint' },
    2: { command: '/bmalph create-story', description: 'Create first story' },
    3: { command: '/bmalph dev', description: 'Start development' },
    4: { command: '/bmalph qa', description: 'Run QA testing' },
    5: { command: '/bmalph dev', description: 'Continue development' },
    6: { command: '/bmalph qa', description: 'Run QA testing' },
    7: { command: '/bmalph dev', description: 'Continue development' },
    8: { command: '/bmalph qa', description: 'Run QA testing' },
    9: { command: '/bmalph retrospective', description: 'Run sprint retrospective' },
    10: { command: '/bmalph correct-course', description: 'Correct course if needed', checkpoint: true }
  }
};

export class CommandRegistry {
  private commandMap: Record<string, Record<number, CommandDefinition>>;
  private cliWrapperPath: string;

  constructor(
    customMap?: Record<string, Record<number, CommandDefinition>>,
    cliWrapperPath: string = './.ralph/claude-wrapper.sh'
  ) {
    this.commandMap = customMap || DEFAULT_COMMAND_MAP;
    this.cliWrapperPath = cliWrapperPath;
  }

  /**
   * Get the command definition for a given phase and step
   */
  getCommand(phase: string, step: number): CommandDefinition | null {
    const phaseCommands = this.commandMap[phase];
    if (!phaseCommands) {
      return null;
    }
    return phaseCommands[step] || null;
  }

  /**
   * Get all commands for a phase
   */
  getPhaseCommands(phase: string): Record<number, CommandDefinition> {
    return this.commandMap[phase] || {};
  }

  /**
   * Check if a step is a checkpoint (requires confirmation)
   */
  isCheckpoint(phase: string, step: number): boolean {
    const cmd = this.getCommand(phase, step);
    return cmd?.checkpoint || false;
  }

  /**
   * Check if we're running inside a Claude Code session
   */
  isClaudeCodeSession(): boolean {
    return !!process.env.CLAUDECODE;
  }

  /**
   * Execute a command via Claude Code CLI and return structured result
   */
  async executeCommand(
    command: string,
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<CommandResult> {
    const correlationId = uuidv4();
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const timeout = options.timeout || 300000; // 5 min default
    const cwd = options.cwd || process.cwd();

    // Check if we're inside a Claude Code session - skip BMAD command execution
    if (this.isClaudeCodeSession()) {
      return {
        correlationId,
        command,
        exitCode: 0,
        stdout: '',
        stderr: 'Claude Code session detected - BMAD commands cannot be executed from within Claude Code. Please run vibe-flow from a separate terminal to execute BMAD commands.',
        executionTimeMs: Date.now() - startTime,
        timestamp,
        success: true
      };
    }

    // Get Claude CLI path
    const claudePath = getClaudeCLIPath();

    // Check if it's a BMAD/agent command (starts with /bmalph or /)
    const isBMADCommand = command.startsWith('/bmalph') || command.startsWith('/pm') ||
                         command.startsWith('/dev') || command.startsWith('/analyst') ||
                         command.startsWith('/architect') || command.startsWith('/sm') ||
                         command.startsWith('/qa') || command.startsWith('/ux-designer');

    try {
      let stdout: string;
      let stderr: string;

      if (isBMADCommand) {
        // Execute BMAD command via Claude Code CLI using the -p (prompt) flag
        // This allows executing skills/commands directly
        const claudeCommand = `${claudePath} -p "${command.replace(/"/g, '\\"')}"`;

        // Alternative: Use --print flag to get output
        const altCommand = `${claudePath} --print ${command}`;

        try {
          const result = await execAsync(altCommand, {
            timeout,
            cwd,
            maxBuffer: 10 * 1024 * 1024,
            shell: true as any
          });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (e: any) {
          // If --print doesn't work, try with message format
          const msgCommand = `${claudePath} -m "${command.replace(/"/g, '\\"')}"`;
          try {
            const result = await execAsync(msgCommand, {
              timeout,
              cwd,
              maxBuffer: 10 * 1024 * 1024,
              shell: true as any
            });
            stdout = result.stdout;
            stderr = result.stderr;
          } catch (e2: any) {
            // If Claude CLI execution fails, log and continue
            throw new Error(`Claude CLI execution failed: ${e2.message}`);
          }
        }
      } else {
        // Regular command - execute via shell
        const fullCommand = `${this.cliWrapperPath} "${command}"`;
        const result = await execAsync(fullCommand, {
          timeout,
          cwd,
          maxBuffer: 10 * 1024 * 1024
        });
        stdout = result.stdout;
        stderr = result.stderr;
      }

      const executionTimeMs = Date.now() - startTime;

      return {
        correlationId,
        command,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        executionTimeMs,
        timestamp,
        success: true
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;

      // Handle timeout or other execution errors
      const exitCode = error.code || 1;
      const stderr = error.message || String(error);

      return {
        correlationId,
        command,
        exitCode,
        stdout: '',
        stderr,
        executionTimeMs,
        timestamp,
        success: false
      };
    }
  }

  /**
   * Execute command with performance monitoring (NFR6: <500ms target)
   */
  async executeWithPerformanceCheck(
    command: string,
    options: { warningThresholdMs?: number; cwd?: string } = {}
  ): Promise<CommandResult & { performanceWarning?: string }> {
    const warningThreshold = options.warningThresholdMs || 500;
    const result = await this.executeCommand(command, { cwd: options.cwd });

    if (result.executionTimeMs > warningThreshold) {
      return {
        ...result,
        performanceWarning: `Operation took ${result.executionTimeMs}ms (target: ${warningThreshold}ms)`
      };
    }

    return result;
  }

  /**
   * Update command mapping (for custom workflows)
   */
  updateCommandMap(newMap: Record<string, Record<number, CommandDefinition>>): void {
    this.commandMap = { ...DEFAULT_COMMAND_MAP, ...newMap };
  }

  /**
   * Get all available phases
   */
  getAvailablePhases(): string[] {
    return Object.keys(this.commandMap);
  }

  /**
   * Check if Claude CLI is available for command execution
   */
  async checkClaudeAvailability(): Promise<{ available: boolean; path: string; version?: string }> {
    const claudePath = getClaudeCLIPath();

    try {
      const { stdout } = await execAsync(`"${claudePath}" --version`, { timeout: 5000 });
      return {
        available: true,
        path: claudePath,
        version: stdout.trim()
      };
    } catch {
      return {
        available: false,
        path: claudePath
      };
    }
  }
}

export default CommandRegistry;
