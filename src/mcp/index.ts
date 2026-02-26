// MCP Server - Model Context Protocol server implementation
import { StateMachine, Phase, ProjectState } from '../state-machine/index.js';
import { ConfigManager } from '../config/index.js';
import { WrapUpExecutor } from '../wrap-up/index.js';
import { HelpExecutor } from '../help/index.js';
import { CommandRegistry } from '../command-registry/index.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (params: any) => Promise<any>;
}

// Tool failure tracking
export interface ToolFailure {
  toolName: string;
  error: string;
  timestamp: string;
  retryable: boolean;
  consecutiveFailures: number;
}

// Tool health status
export interface ToolHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSuccess: string | null;
  lastFailure: string | null;
  consecutiveFailures: number;
  totalExecutions: number;
  averageExecutionTimeMs: number;
}

// Graceful Degradation Configuration
export interface DegradationConfig {
  timeoutMs: number;
  maxConsecutiveFailures: number;
  enableHotReload: boolean;
  hotReloadIntervalMs: number;
}

// Default configuration
const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  timeoutMs: 30000, // 30 seconds
  maxConsecutiveFailures: 3,
  enableHotReload: true,
  hotReloadIntervalMs: 60000 // 1 minute
};

export class MCPServer {
  private stateMachine: StateMachine;
  private configManager: ConfigManager;
  private wrapUpExecutor: WrapUpExecutor;
  private helpExecutor: HelpExecutor;
  private commandRegistry: CommandRegistry;
  private tools: Map<string, MCPTool>;
  private toolHealth: Map<string, ToolHealth>;
  private toolFailures: ToolFailure[];
  private degradationConfig: DegradationConfig;
  private hotReloadInterval: NodeJS.Timeout | null = null;
  private isReloading: boolean = false;

  constructor(config?: Partial<DegradationConfig>) {
    this.stateMachine = new StateMachine();
    this.configManager = new ConfigManager();
    this.wrapUpExecutor = new WrapUpExecutor(this.configManager, this.stateMachine);
    this.helpExecutor = new HelpExecutor();
    this.commandRegistry = new CommandRegistry();
    this.tools = new Map();
    this.toolHealth = new Map();
    this.toolFailures = [];
    this.degradationConfig = { ...DEFAULT_DEGRADATION_CONFIG, ...config };
    this.registerTools();
    this.initializeToolHealth();

    if (this.degradationConfig.enableHotReload) {
      this.startHotReloadMechanism();
    }
  }

  private initializeToolHealth(): void {
    for (const [name, tool] of this.tools) {
      this.toolHealth.set(name, {
        name,
        status: 'healthy',
        lastSuccess: null,
        lastFailure: null,
        consecutiveFailures: 0,
        totalExecutions: 0,
        averageExecutionTimeMs: 0
      });
    }
  }

  private startHotReloadMechanism(): void {
    if (this.hotReloadInterval) {
      clearInterval(this.hotReloadInterval);
    }

    this.hotReloadInterval = setInterval(() => {
      this.simulateHotReload();
    }, this.degradationConfig.hotReloadIntervalMs);

    console.log(`[MCP] Hot reload mechanism started (interval: ${this.degradationConfig.hotReloadIntervalMs}ms)`);
  }

  private async simulateHotReload(): Promise<void> {
    if (this.isReloading) {
      console.log('[MCP] Hot reload skipped - reload already in progress');
      return;
    }

    this.isReloading = true;
    console.log('[MCP] Starting simulated hot reload...');

    try {
      // Check for degraded tools and attempt recovery
      let recoveredCount = 0;

      for (const [name, health] of this.toolHealth) {
        if (health.status === 'degraded' || health.status === 'unhealthy') {
          // Simulate re-initialization attempt
          console.log(`[MCP] Attempting to recover tool: ${name}`);

          // Reset consecutive failures (simulating successful reconnection)
          health.consecutiveFailures = 0;
          health.status = 'healthy';
          recoveredCount++;

          console.log(`[MCP] Tool "${name}" recovered successfully`);
        }
      }

      // Notify state machine about the reload event
      await this.stateMachine.updateContext('lastHotReload', new Date().toISOString());

      console.log(`[MCP] Hot reload completed. Recovered ${recoveredCount} tool(s).`);
    } catch (error) {
      console.error('[MCP] Hot reload failed:', error);
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Manually trigger hot reload
   */
  async triggerHotReload(): Promise<{ success: boolean; recoveredTools: string[] }> {
    const recoveredTools: string[] = [];

    for (const [name, health] of this.toolHealth) {
      if (health.status !== 'healthy') {
        health.consecutiveFailures = 0;
        health.status = 'healthy';
        recoveredTools.push(name);
      }
    }

    await this.simulateHotReload();

    return {
      success: true,
      recoveredTools
    };
  }

  /**
   * Get all tool health statuses
   */
  getToolHealth(): ToolHealth[] {
    return Array.from(this.toolHealth.values());
  }

  /**
   * Get health status for a specific tool
   */
  getToolHealthByName(name: string): ToolHealth | undefined {
    return this.toolHealth.get(name);
  }

  /**
   * Get all recorded tool failures
   */
  getToolFailures(): ToolFailure[] {
    return [...this.toolFailures];
  }

  /**
   * Clear tool failure history
   */
  clearToolFailures(): void {
    this.toolFailures = [];
    console.log('[MCP] Tool failure history cleared');
  }

  private async handleToolFailure(toolName: string, error: string, retryable: boolean): Promise<void> {
    const failure: ToolFailure = {
      toolName,
      error,
      timestamp: new Date().toISOString(),
      retryable,
      consecutiveFailures: (this.toolHealth.get(toolName)?.consecutiveFailures || 0) + 1
    };

    this.toolFailures.push(failure);

    // Update tool health
    const health = this.toolHealth.get(toolName);
    if (health) {
      health.consecutiveFailures = failure.consecutiveFailures;
      health.lastFailure = failure.timestamp;

      // Determine status based on consecutive failures
      if (health.consecutiveFailures >= this.degradationConfig.maxConsecutiveFailures) {
        health.status = 'unhealthy';
        console.error(`[MCP] Tool "${toolName}" marked as UNHEALTHY after ${health.consecutiveFailures} consecutive failures`);
      } else {
        health.status = 'degraded';
        console.warn(`[MCP] Tool "${toolName}" marked as DEGRADED after ${health.consecutiveFailures} consecutive failures`);
      }
    }

    // Gracefully notify the state machine about the failure
    try {
      await this.stateMachine.addError(
        `MCP tool "${toolName}" failure: ${error}`,
        retryable
      );
      console.log(`[MCP] Tool failure recorded in state machine: ${toolName}`);
    } catch (smError) {
      console.error('[MCP] Failed to notify state machine about tool failure:', smError);
    }

    // Log the failure
    console.error(`[MCP] Tool "${toolName}" failed: ${error}`);
  }

  private async handleToolSuccess(toolName: string, executionTimeMs: number): Promise<void> {
    const health = this.toolHealth.get(toolName);
    if (health) {
      health.consecutiveFailures = 0;
      health.lastSuccess = new Date().toISOString();
      health.totalExecutions++;

      // Update average execution time
      const totalTime = health.averageExecutionTimeMs * (health.totalExecutions - 1);
      health.averageExecutionTimeMs = (totalTime + executionTimeMs) / health.totalExecutions;

      // Reset status if was degraded
      if (health.status !== 'healthy') {
        health.status = 'healthy';
        console.log(`[MCP] Tool "${toolName}" recovered to HEALTHY status`);
      }
    }
  }

  /**
   * Execute a tool with timeout and graceful degradation
   */
  private async executeWithDegradation(
    toolName: string,
    handler: (params: any) => Promise<any>,
    params: any
  ): Promise<any> {
    const health = this.toolHealth.get(toolName);

    // Check if tool is completely unhealthy
    if (health?.status === 'unhealthy') {
      const errorMsg = `Tool "${toolName}" is unhealthy and cannot be executed`;
      console.error(`[MCP] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        degraded: true,
        toolStatus: 'unhealthy'
      };
    }

    // Execute with timeout
    return this.executeWithTimeout(toolName, handler, params);
  }

  /**
   * Execute with timeout protection
   */
  private async executeWithTimeout(
    toolName: string,
    handler: (params: any) => Promise<any>,
    params: any
  ): Promise<any> {
    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(async () => {
        // Handle timeout as a failure
        const timeoutError = `Tool "${toolName}" timed out after ${this.degradationConfig.timeoutMs}ms`;
        console.error(`[MCP] ${timeoutError}`);

        await this.handleToolFailure(toolName, timeoutError, true);

        resolve({
          success: false,
          error: timeoutError,
          degraded: true,
          toolStatus: 'timeout'
        });
      }, this.degradationConfig.timeoutMs);

      try {
        const startTime = Date.now();
        const result = await handler(params);
        const executionTime = Date.now() - startTime;

        clearTimeout(timeoutId);

        // Handle successful execution
        await this.handleToolSuccess(toolName, executionTime);

        resolve(result);
      } catch (error: any) {
        clearTimeout(timeoutId);

        // Handle failure
        const errorMessage = error.message || String(error);
        const isRetryable = this.isErrorRetryable(error);

        await this.handleToolFailure(toolName, errorMessage, isRetryable);

        resolve({
          success: false,
          error: errorMessage,
          degraded: true,
          toolStatus: 'failed'
        });
      }
    });
  }

  /**
   * Determine if an error is retryable
   */
  private isErrorRetryable(error: any): boolean {
    const errorMessage = (error.message || String(error)).toLowerCase();
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'econnrefused',
      'econnreset',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'temporary'
    ];

    return retryablePatterns.some(pattern =>
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Get degradation configuration
   */
  getDegradationConfig(): DegradationConfig {
    return { ...this.degradationConfig };
  }

  /**
   * Update degradation configuration
   */
  updateDegradationConfig(config: Partial<DegradationConfig>): void {
    this.degradationConfig = { ...this.degradationConfig, ...config };

    // Restart hot reload if interval changed
    if (config.hotReloadIntervalMs && this.degradationConfig.enableHotReload) {
      this.startHotReloadMechanism();
    }

    console.log('[MCP] Degradation config updated:', this.degradationConfig);
  }

  /**
   * Shutdown the MCP server gracefully
   */
  async shutdown(): Promise<void> {
    if (this.hotReloadInterval) {
      clearInterval(this.hotReloadInterval);
      this.hotReloadInterval = null;
    }

    // Log final statistics
    console.log('[MCP] Server shutdown - Final tool health status:');
    for (const health of this.toolHealth.values()) {
      console.log(`  ${health.name}: ${health.status} (${health.totalExecutions} executions)`);
    }

    console.log(`[MCP] Total tool failures recorded: ${this.toolFailures.length}`);
  }

  private registerTools(): void {
    // FR-004: MCP Tools API

    // Tool: start_project
    this.tools.set('start_project', {
      name: 'start_project',
      description: 'Start a new project workflow with vibe-flow',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: {
            type: 'string',
            description: 'Name of the project to start'
          }
        },
        required: ['projectName']
      },
      handler: async (params: { projectName: string }) => {
        const state = await this.stateMachine.initialize(params.projectName);
        return {
          success: true,
          projectName: state.projectName,
          phase: state.phase,
          message: `Project "${params.projectName}" started successfully`
        };
      }
    });

    // Tool: advance_step (Story 2.6: Command Registry Integration)
    this.tools.set('advance_step', {
      name: 'advance_step',
      description: 'Advance the workflow to the next step or phase and execute the corresponding bmalph command',
      inputSchema: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            description: 'Skip confirmation prompts',
            default: false
          },
          executeCommand: {
            type: 'boolean',
            description: 'Execute the mapped bmalph command for this step',
            default: true
          }
        }
      },
      handler: async (params: { force?: boolean; executeCommand?: boolean }) => {
        try {
          // First advance the state
          const state = await this.stateMachine.advance();

          // Get the command for this phase/step from registry
          const phaseKey = state.phase.toUpperCase();
          const commandDef = this.commandRegistry.getCommand(phaseKey, state.currentStep);

          let commandResult = null;
          let commandError = null;

          // Execute the command if requested and available
          if (params.executeCommand !== false && commandDef) {
            try {
              // Execute with performance monitoring (NFR6: <500ms target)
              commandResult = await this.commandRegistry.executeWithPerformanceCheck(
                commandDef.command,
                { warningThresholdMs: 500 }
              );
            } catch (execError: any) {
              commandError = {
                message: execError.message,
                code: execError.code
              };
            }
          }

          return {
            success: true,
            phase: state.phase,
            step: state.currentStep,
            message: `Advanced to ${state.phase} (step ${state.currentStep})`,
            command: commandDef ? commandDef.command : null,
            commandDescription: commandDef?.description || null,
            commandResult: commandResult ? {
              correlationId: commandResult.correlationId,
              exitCode: commandResult.exitCode,
              executionTimeMs: commandResult.executionTimeMs,
              success: commandResult.success,
              performanceWarning: commandResult.performanceWarning,
              stdout: commandResult.stdout,
              stderr: commandResult.stderr
            } : null,
            commandError: commandError,
            isCheckpoint: commandDef?.checkpoint || false
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    });

    // Tool: get_status - optimized with in-memory cache
    this.tools.set('get_status', {
      name: 'get_status',
      description: 'Get the current status of the project workflow',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => {
        try {
          const state = await this.stateMachine.getState();
          // Use get() instead of load() to leverage in-memory cache
          const config = await this.configManager.get();
          return {
            success: true,
            projectName: state.projectName,
            phase: state.phase,
            currentStep: state.currentStep,
            totalSteps: state.totalSteps,
            lastUpdated: state.lastUpdated,
            decisionsCount: state.decisions.length,
            errorsCount: state.errors.filter(e => !e.resolved).length,
            beginnerMode: config.preferences.beginnerMode
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            hasProject: false
          };
        }
      }
    });

    // Tool: analyze_project
    this.tools.set('analyze_project', {
      name: 'analyze_project',
      description: 'Analyze the current project and generate a structured report',
      inputSchema: {
        type: 'object',
        properties: {
          outputFormat: {
            type: 'string',
            enum: ['json', 'markdown'],
            default: 'json'
          }
        }
      },
      handler: async (params: { outputFormat?: string }) => {
        try {
          const state = await this.stateMachine.getState();
          const format = params.outputFormat || 'json';

          const report = {
            projectName: state.projectName,
            phase: state.phase,
            currentStep: state.currentStep,
            progress: {
              phase: state.phase,
              step: state.currentStep,
              total: state.totalSteps
            },
            summary: this.generateSummary(state),
            painPoints: this.identifyPainPoints(state),
            suggestions: this.generateSuggestions(state),
            decisions: state.decisions,
            unresolvedErrors: state.errors.filter(e => !e.resolved)
          };

          if (format === 'markdown') {
            return {
              success: true,
              format: 'markdown',
              report: this.toMarkdown(report)
            };
          }

          return {
            success: true,
            format: 'json',
            report
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    });

    // Tool: wrap_up_session (FR-WU-006)
    this.tools.set('wrap_up_session', {
      name: 'wrap_up_session',
      description: 'Execute a wrap-up session to organize the project, consolidate learnings, and generate content',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['full', 'ship-it', 'remember-it', 'self-improve', 'publish-it'],
            description: 'Execution mode: full or specific phase',
            default: 'full'
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, only show what would be done without executing',
            default: false
          },
          force: {
            type: 'boolean',
            description: 'If true, skip confirmations and execute directly',
            default: false
          }
        }
      },
      handler: async (params: { mode?: string; dryRun?: boolean; force?: boolean }) => {
        const config = await this.configManager.load();

        if (!config.wrapUp.enabled) {
          return {
            success: false,
            error: 'Wrap-up is not enabled. Enable it in configuration first.'
          };
        }

        // Execute wrap-up using the WrapUpExecutor
        const mode = params.mode || 'full';
        const dryRun = params.dryRun || false;

        try {
          const result = await this.wrapUpExecutor.execute(mode, dryRun);
          await this.wrapUpExecutor.saveReport(result);

          return {
            success: result.success,
            mode,
            phasesExecuted: result.phasesExecuted,
            shipIt: result.shipIt,
            rememberIt: result.rememberIt,
            selfImprove: result.selfImprove,
            publishIt: result.publishIt,
            errors: result.errors,
            message: result.success ? 'Wrap-up completed successfully' : 'Wrap-up completed with errors'
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    });

    // Tool: get_guidance - BMAD workflow guidance
    this.tools.set('get_guidance', {
      name: 'get_guidance',
      description: 'Get workflow guidance based on current project phase using BMAD methodology',
      inputSchema: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            enum: ['NEW', 'ANALYSIS', 'PLANNING', 'SOLUTIONING', 'IMPLEMENTATION', 'COMPLETE'],
            description: 'Optional: Show guidance for specific phase instead of current project state'
          }
        }
      },
      handler: async (params: { phase?: string }) => {
        try {
          let phase: string;
          let currentStep: number;

          if (params.phase) {
            phase = params.phase;
            currentStep = 1;
          } else {
            const state = await this.stateMachine.getState();
            phase = state.phase;
            currentStep = state.currentStep;
          }

          const helpResult = await this.helpExecutor.getHelp(phase, currentStep);

          return {
            success: true,
            currentPhase: helpResult.currentPhase,
            nextWorkflows: helpResult.nextWorkflows.map(w => ({
              name: w.name,
              command: w.command,
              agent: w.agent,
              description: w.description,
              required: w.required,
              sequence: w.sequence
            })),
            universalWorkflows: helpResult.universalWorkflows.map(w => ({
              name: w.name,
              command: w.command,
              agent: w.agent,
              description: w.description
            })),
            suggestions: helpResult.suggestions
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    });
  }

  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools with their health status
   */
  getToolsWithHealth(): Array<MCPTool & { health: ToolHealth }> {
    const toolsWithHealth: Array<MCPTool & { health: ToolHealth }> = [];

    for (const tool of this.tools.values()) {
      const health = this.toolHealth.get(tool.name);
      if (health) {
        toolsWithHealth.push({ ...tool, health });
      }
    }

    return toolsWithHealth;
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  async handleTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Check if tool health exists (initialize if not)
    if (!this.toolHealth.has(name)) {
      this.initializeToolHealth();
    }

    // Measure execution time for performance monitoring
    const startTime = Date.now();

    // Execute with graceful degradation and timeout
    const result = await this.executeWithDegradation(name, tool.handler, params);

    const executionTime = Date.now() - startTime;

    // Log warning if tool takes longer than 450ms
    if (executionTime > 450) {
      console.warn(`[MCP] Tool "${name}" took ${executionTime}ms (>450ms threshold)`);
    }

    return result;
  }

  // Helper methods for report generation
  private generateSummary(state: ProjectState): string {
    const phaseDescriptions: Record<Phase, string> = {
      [Phase.NEW]: 'Project has been initialized',
      [Phase.ANALYSIS]: 'Analysis phase in progress - understanding the problem',
      [Phase.PLANNING]: 'Planning phase in progress - defining the solution',
      [Phase.SOLUTIONING]: 'Solutioning phase in progress - designing the architecture',
      [Phase.IMPLEMENTATION]: 'Implementation phase in progress - building the solution',
      [Phase.COMPLETE]: 'Project is complete'
    };
    return phaseDescriptions[state.phase];
  }

  private identifyPainPoints(state: ProjectState): string[] {
    const painPoints: string[] = [];

    if (state.errors.length > 0) {
      const unresolved = state.errors.filter(e => !e.resolved);
      if (unresolved.length > 0) {
        painPoints.push(`${unresolved.length} unresolved error(s) in ${unresolved[0].phase} phase`);
      }
    }

    return painPoints;
  }

  private generateSuggestions(state: ProjectState): string[] {
    const suggestions: string[] = [];

    switch (state.phase) {
      case Phase.ANALYSIS:
        suggestions.push('Complete market and domain research before proceeding');
        suggestions.push('Document key assumptions and constraints');
        break;
      case Phase.PLANNING:
        suggestions.push('Ensure all user stories have clear acceptance criteria');
        suggestions.push('Review technical feasibility of proposed solutions');
        break;
      case Phase.SOLUTIONING:
        suggestions.push('Verify architecture meets all non-functional requirements');
        suggestions.push('Ensure specification is ready before implementation gate (FR-017)');
        break;
      case Phase.IMPLEMENTATION:
        suggestions.push('Run tests regularly to catch issues early');
        suggestions.push('Document any deviations from the specification');
        break;
    }

    return suggestions;
  }

  private toMarkdown(report: any): string {
    let md = `# Project Analysis Report: ${report.projectName}\n\n`;
    md += `**Phase:** ${report.phase}\n`;
    md += `**Step:** ${report.progress.step} / ${report.progress.total}\n\n`;
    md += `## Summary\n\n${report.summary}\n\n`;

    if (report.painPoints.length > 0) {
      md += `## Pain Points\n\n`;
      for (const point of report.painPoints) {
        md += `- ${point}\n`;
      }
      md += '\n';
    }

    if (report.suggestions.length > 0) {
      md += `## Suggestions\n\n`;
      for (const suggestion of report.suggestions) {
        md += `- ${suggestion}\n`;
      }
    }

    return md;
  }
}

// Re-export Router and Fallback
export { MCPRouter, RouterConfig, RouterState, RoutingLog, DEFAULT_ROUTER_CONFIG } from './router.js';
export { FallbackRouter, FallbackConfig, FallbackState, FallbackResult, DEFAULT_FALLBACK_CONFIG } from './fallback.js';
export { MCPToolRequest, MCPToolResponse, ToolExecutionResult } from './types.js';

// Re-export MCP Client
export { MCPClient, MCPClientManager } from './client.js';
export type { MCPClientConfig, MCPToolResult } from './client.js';

// Re-export Official MCP Server
export { VibeFlowMCPServer } from './official-server.js';
