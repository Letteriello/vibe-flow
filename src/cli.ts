// VibeFlow CLI - Command-line interface handler
import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { join } from 'path';
import { StateMachine, Phase } from './state-machine/index.js';
import { ConfigManager } from './config/index.js';
import { DecisionHandler } from './decision/index.js';
import { WrapUpExecutor } from './wrap-up/index.js';
import { HelpExecutor } from './help/index.js';
import { CommandRegistry, CommandResult } from './command-registry/index.js';
import { runPreFlightChecks, PreFlightChecklistUI, runQualityCheck, QualityLevel, StepValidator } from './validation/index.js';
import { MCPServer } from './mcp/index.js';

export class VibeFlowCLI {
  private program: Command;
  private stateMachine: StateMachine;
  private configManager: ConfigManager;
  private decisionHandler: DecisionHandler;
  private wrapUpExecutor: WrapUpExecutor;
  private helpExecutor: HelpExecutor;
  private commandRegistry: CommandRegistry;
  private stepValidator: StepValidator;

  constructor() {
    this.program = new Command();
    this.stateMachine = new StateMachine();
    this.configManager = new ConfigManager();
    this.decisionHandler = new DecisionHandler(this.configManager);
    this.wrapUpExecutor = new WrapUpExecutor(this.configManager, this.stateMachine);
    this.helpExecutor = new HelpExecutor();
    this.commandRegistry = new CommandRegistry();
    this.stepValidator = new StepValidator();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('vibe-flow')
      .description('Workflow orchestration system for AI development agents')
      .version('0.1.0');

    this.program
      .command('start')
      .description('Start a new project workflow')
      .argument('[name]', 'Project name')
      .action(async (name?: string) => {
        await this.startProject(name);
      });

    this.program
      .command('advance')
      .description('Advance to the next step in the workflow')
      .option('-f, --force', 'Skip confirmation prompts')
      .action(async (options) => {
        await this.advanceStep(options.force);
      });

    this.program
      .command('status')
      .description('Show current project status')
      .action(async () => {
        await this.showStatus();
      });

    this.program
      .command('wrap-up')
      .description('Execute wrap-up session')
      .option('-m, --mode <mode>', 'Mode: full, ship-it, remember-it, self-improve, publish-it', 'full')
      .option('--dry-run', 'Show what would be done without executing')
      .option('--phase <phase>', 'Execute specific phase only')
      .option('--status', 'Show last wrap-up report')
      .option('--force', 'Force execution even if wrap-up is disabled in config')
      .option('-y, --yes', 'Skip confirmation prompts (auto-confirm commit)')
      .action(async (options) => {
        await this.wrapUp(options);
      });

    this.program
      .command('analyze')
      .description('Analyze current project and generate report')
      .option('-o, --output <file>', 'Output file path')
      .action(async (options) => {
        await this.analyzeProject(options.output);
      });

    // Config command - placeholder for future subcommands
    this.program
      .command('config')
      .description('Manage configuration (coming soon)');

    this.program
      .command('help')
      .description('Show workflow guidance based on current phase')
      .option('-p, --phase <phase>', 'Show help for specific phase')
      .action(async (options) => {
        await this.showHelp(options.phase);
      });

    this.program
      .command('preflight')
      .description('Run pre-flight checks before code generation')
      .option('-p, --path <path>', 'Project path to check', process.cwd())
      .option('--json', 'Output as JSON')
      .option('--compact', 'Compact single-line output')
      .option('--no-details', 'Hide details')
      .action(async (options) => {
        await this.runPreFlight(options);
      });

    this.program
      .command('quality')
      .description('Run code quality checks')
      .option('-p, --path <path>', 'Project path to check', process.cwd())
      .option('--json', 'Output as JSON')
      .option('--compact', 'Compact single-line output')
      .option('--severity <level>', 'Minimum severity: error, warning, info', 'warning')
      .option('--no-format', 'Skip formatting checks')
      .action(async (options) => {
        await this.runQuality(options);
      });

    // MCP server command - exposes tools for Claude Code
    this.program
      .command('mcp')
      .description('Start MCP server for Claude Code integration')
      .option('-p, --port <port>', 'Port for MCP server', '3000')
      .option('--stdio', 'Use stdio mode instead of HTTP')
      .action(async (options) => {
        await this.startMCPServer(options);
      });

    // Generate claude.md for project integration
    this.program
      .command('init-claude')
      .description('Initialize Claude Code project integration')
      .action(async () => {
        await this.initClaudeIntegration();
      });
  }

  private async startProject(name?: string): Promise<void> {
    console.log(chalk.blue('🚀 Starting new project workflow...'));
    const projectName = name || 'unnamed-project';

    // Display educational context in beginner mode
    const config = await this.configManager.load();
    if (config.preferences.beginnerMode) {
      this.helpExecutor.displayEducationalContext('NEW');
    }

    try {
      const state = await this.stateMachine.initialize(projectName);
      console.log(chalk.green(`✅ Project "${projectName}" initialized`));
      console.log(chalk.gray(`  Phase: ${state.phase}`));
      console.log(chalk.gray(`  Step: ${state.currentStep}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to start project: ${error}`));
      process.exit(1);
    }
  }

  private async advanceStep(force: boolean = false): Promise<void> {
    console.log(chalk.blue('⏩ Advancing workflow...'));

    try {
      const currentState = await this.stateMachine.getState();
      const config = await this.configManager.load();

      // Display educational context in beginner mode
      if (config.preferences.beginnerMode) {
        this.helpExecutor.displayEducationalContext(currentState.phase);
      }

      // FR-006: Decision Point Interaction - prompt at phase transitions
      if (!force) {
        const shouldPause = await this.decisionHandler.shouldPauseForDecision(currentState.phase);
        if (shouldPause) {
          const decisionPoint = this.decisionHandler.getPhaseDecisionPoint(currentState.phase);
          if (decisionPoint) {
            const result = await this.decisionHandler.promptDecision(decisionPoint);

            // Handle override case
            if (result.choice === 'Override' || result.choice?.includes('ressalvas')) {
              if (!config.preferences.beginnerMode) {
                const confirmed = await this.decisionHandler.requestOverride(
                  'Phase transition override'
                );
                if (!confirmed) {
                  console.log(chalk.yellow('Operação cancelada.'));
                  return;
                }
              }
            }

            // Record the decision
            await this.stateMachine.addDecision(
              currentState.phase,
              `Decision: ${result.choice}`,
              result.choice === 'Override'
            );
          }
        }
      }

      // FR-017: Specification readiness gate
      if (!force && currentState.phase === Phase.SOLUTIONING) {
        console.log(chalk.yellow('⚠️ You are about to enter implementation phase.'));
        console.log(chalk.yellow('   Make sure your specification is ready (FR-017).'));
      }

      // Get the command to execute for this step
      const commandDef = this.commandRegistry.getCommand(currentState.phase, currentState.currentStep);
      let commandResult: CommandResult | null = null;

      if (commandDef) {
        // Check if it's a checkpoint - require confirmation before execution
        if (!force && commandDef.checkpoint) {
          console.log(chalk.yellow(`⚠️ This is a checkpoint step: ${commandDef.description}`));
          // In a real CLI, we'd prompt here. For now, we continue.
        }

        // Execute the command via CLI wrapper
        console.log(chalk.gray(`  Executing: ${commandDef.command}`));
        commandResult = await this.commandRegistry.executeWithPerformanceCheck(commandDef.command);

        // Display execution results
        if (commandResult.success) {
          // Check if it's a Claude Code session message
          if (commandResult.stderr?.includes('Claude Code session detected')) {
            console.log(chalk.yellow(`  ⚠️ ${commandResult.stderr}`));
          } else {
            console.log(chalk.green(`  ✅ Command executed successfully (${commandResult.executionTimeMs}ms)`));

            // Store correlation ID for traceability
            await this.stateMachine.updateContext('lastCommandCorrelationId', commandResult.correlationId);

            // Show performance warning if applicable
            if ((commandResult as any).performanceWarning) {
              console.log(chalk.yellow(`  ⚠️ ${(commandResult as any).performanceWarning}`));
            }
          }
        } else {
          console.error(chalk.red(`  ❌ Command failed: ${commandResult.stderr}`));
          console.log(chalk.gray(`  Correlation ID: ${commandResult.correlationId}`));
        }
      } else {
        console.log(chalk.gray('  No command mapped for this step (manual step)'));
      }

      // FR-XXX: Validate step before advancing - blocks progress if artifact is incomplete
      console.log(chalk.gray('  Running step validation...'));
      const validationResult = await this.stepValidator.validateStep(currentState);

      if (!validationResult.allPassed) {
        console.error(chalk.red('\n❌ Step validation failed! Cannot advance.\n'));

        for (const validation of validationResult.validations) {
          if (validation.status === 'FAILED') {
            console.error(chalk.red(`  [${validation.level}] ${validation.message}`));
            if (validation.details) {
              for (const detail of validation.details) {
                console.error(chalk.gray(`    - ${detail}`));
              }
            }
          }
        }

        console.error(chalk.yellow('\nPlease complete the required sections before advancing.'));
        process.exit(1);
      }

      console.log(chalk.green('  ✅ Step validation passed'));

      const newState = await this.stateMachine.advance();
      console.log(chalk.green(`✅ Advanced to: ${newState.phase} (Step ${newState.currentStep})`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to advance: ${error}`));
      process.exit(1);
    }
  }

  private async showStatus(): Promise<void> {
    try {
      const state = await this.stateMachine.getState();
      const config = await this.configManager.load();

      // Display educational context in beginner mode
      if (config.preferences.beginnerMode) {
        this.helpExecutor.displayEducationalContext(state.phase);
      }

      console.log(chalk.bold('\n📊 Project Status\n'));
      console.log(chalk.gray(`  Project: ${state.projectName}`));
      console.log(chalk.gray(`  Phase: ${state.phase}`));
      console.log(chalk.gray(`  Step: ${state.currentStep} / ${state.totalSteps}`));
      console.log(chalk.gray(`  Last Updated: ${state.lastUpdated}`));

      if (config.preferences.beginnerMode) {
        console.log(chalk.cyan('\n  🌱 Beginner Mode: ON'));
      }

      console.log();
    } catch (error) {
      console.error(chalk.red(`❌ Failed to get status: ${error}`));
      process.exit(1);
    }
  }

  private async wrapUp(options: any): Promise<void> {
    // Display educational context in beginner mode
    const config = await this.configManager.load();
    if (config.preferences.beginnerMode) {
      this.helpExecutor.displayEducationalContext('COMPLETE');
    }

    if (options.status) {
      console.log(chalk.blue('📋 Last Wrap-up Report'));
      const report = await this.wrapUpExecutor.getLastReport();
      if (report) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(chalk.gray('  No previous wrap-up report found.'));
      }
      return;
    }

    const mode = options.phase || options.mode || 'full';
    const dryRun = options.dryRun || false;

    console.log(chalk.blue(`🔧 Running wrap-up in ${mode} mode...`));

    if (dryRun) {
      console.log(chalk.yellow('  🔍 Dry-run mode - no changes will be made'));
    }

    const force = options.force || false;
    const yes = options.yes || false;
    const result = await this.wrapUpExecutor.execute(mode, dryRun, force, yes);

    if (result.success) {
      await this.wrapUpExecutor.saveReport(result);
      console.log(chalk.green(`\n✅ Wrap-up completed. Phases executed: ${result.phasesExecuted.join(', ')}`));
    } else {
      console.error(chalk.red('\n❌ Wrap-up failed.'));
      if (result.errors.length > 0) {
        console.error(chalk.red(`  Errors: ${result.errors.join(', ')}`));
      }
    }
  }

  private async analyzeProject(_outputPath?: string): Promise<void> {
    // Display educational context in beginner mode
    const config = await this.configManager.load();
    if (config.preferences.beginnerMode) {
      const state = await this.stateMachine.getState();
      this.helpExecutor.displayEducationalContext(state.phase);
    }

    console.log(chalk.blue('🔍 Analyzing project...'));

    const state = await this.stateMachine.getState();
    const report = {
      projectName: state.projectName,
      phase: state.phase,
      currentStep: state.currentStep,
      summary: 'Project analysis report',
      painPoints: [],
      suggestions: []
    };

    console.log(chalk.green('✅ Analysis complete'));
    console.log(JSON.stringify(report, null, 2));
  }

  private async runPreFlight(options: {
    path: string;
    json?: boolean;
    compact?: boolean;
    details?: boolean;
  }): Promise<void> {
    console.log(chalk.blue('🛫 Running pre-flight checks...'));
    console.log(chalk.gray(`  Project: ${options.path}`));
    console.log('');

    try {
      const result = await runPreFlightChecks(options.path);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (options.compact) {
        const ui = new PreFlightChecklistUI({ showDetails: false, showSummary: false });
        console.log(ui.renderCompact(result));
        process.exit(result.ready ? 0 : 1);
        return;
      }

      const ui = new PreFlightChecklistUI({
        showDetails: options.details !== false,
        showSummary: true
      });
      console.log(ui.render(result));

      // Exit with appropriate code
      process.exit(result.ready ? 0 : 1);
    } catch (error) {
      console.error(chalk.red(`❌ Pre-flight check failed: ${error}`));
      process.exit(1);
    }
  }

  private async runQuality(options: {
    path: string;
    json?: boolean;
    compact?: boolean;
    severity?: string;
    format?: boolean;
  }): Promise<void> {
    console.log(chalk.blue('🔍 Running code quality checks...'));
    console.log(chalk.gray(`  Project: ${options.path}`));
    console.log('');

    try {
      const result = await runQualityCheck(options.path, {
        severityThreshold: options.severity as 'error' | 'warning' | 'info' || 'warning',
        checkFormatting: options.format !== false
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (options.compact) {
        const icon = result.level === QualityLevel.PERFECT || result.level === QualityLevel.GOOD ? '✓' : '✗';
        console.log(`${icon} Quality: ${result.qualityScore}% [${result.level}] - ${result.filesScanned} files, ${result.summary.warnings} warnings`);
        process.exit(result.level === QualityLevel.PERFECT || result.level === QualityLevel.GOOD ? 0 : 1);
        return;
      }

      // Full output
      const levelColors = {
        [QualityLevel.PERFECT]: chalk.green,
        [QualityLevel.GOOD]: chalk.green,
        [QualityLevel.WARNING]: chalk.yellow,
        [QualityLevel.ERROR]: chalk.red
      };

      console.log(chalk.bold('═══ Code Quality Report ═══'));
      console.log(`  Files Scanned: ${result.filesScanned}`);
      console.log(`  Quality Score: ${levelColors[result.level](`${result.qualityScore}%`)} [${result.level}]`);
      console.log('');
      console.log('  Issues Found:');
      console.log(`    ${chalk.red('✗')} Errors: ${result.summary.errors}`);
      console.log(`    ${chalk.yellow('!')} Warnings: ${result.summary.warnings}`);
      console.log(`    ${chalk.blue('i')} Info: ${result.summary.info}`);
      console.log(`    ${chalk.cyan('⚡')} Auto-fixable: ${result.summary.autoFixable}`);
      console.log('');

      if (result.suggestions.length > 0) {
        console.log(chalk.bold('  Suggestions:'));
        for (const suggestion of result.suggestions) {
          console.log(`    • ${suggestion}`);
        }
      }

      // Exit with appropriate code
      const pass = result.level === QualityLevel.PERFECT || result.level === QualityLevel.GOOD;
      console.log('');
      console.log(pass
        ? chalk.green.bold('✓ Code quality check passed!')
        : chalk.red.bold('✗ Code quality issues detected'));
      process.exit(pass ? 0 : 1);
    } catch (error) {
      console.error(chalk.red(`❌ Quality check failed: ${error}`));
      process.exit(1);
    }
  }

  private async showHelp(phaseOverride?: string): Promise<void> {
    try {
      let state;
      let phase: string;
      let currentStep: number;

      if (phaseOverride) {
        // Show help for specific phase
        phase = phaseOverride.toUpperCase();
        currentStep = 1;
      } else {
        // Get current project state
        state = await this.stateMachine.getState();
        phase = state.phase;
        currentStep = state.currentStep;
      }

      await this.helpExecutor.displayHelp(phase, currentStep);
    } catch (error: any) {
      // No project started yet - show general help
      await this.helpExecutor.displayHelp('NEW', 1);
    }
  }

  private async startMCPServer(options: { port?: string; stdio?: boolean }): Promise<void> {
    const port = parseInt(options.port || '3000', 10);

    if (options.stdio) {
      console.log(chalk.blue('🔌 Starting vibe-flow MCP server in STDIO mode...'));
      this.runStdioMCP();
    } else {
      console.log(chalk.blue(`🔌 Starting vibe-flow MCP server on port ${port}...`));
      this.runHttpMCP(port);
    }
  }

  private async runStdioMCP(): Promise<void> {
    const mcpServer = new MCPServer();
    const { createInterface } = await import('readline');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line);
        const { method, params, id } = request;

        if (method === 'tools/list') {
          const tools = mcpServer.getTools();
          const response = {
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools.map((t: any) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema
              }))
            }
          };
          console.log(JSON.stringify(response));
        } else if (method === 'tools/call') {
          const { name, arguments: args } = params;
          const result = await mcpServer.handleTool(name, args);
          const response = { jsonrpc: '2.0', id, result };
          console.log(JSON.stringify(response));
        }
      } catch (error: any) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: error.message }
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    console.log(chalk.green('✅ MCP server running in STDIO mode'));
  }

  private async runHttpMCP(port: number): Promise<void> {
    const http = await import('http');
    const mcpServer = new MCPServer();

    const server = http.default.createServer(async (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/tools' && req.method === 'GET') {
        const tools = mcpServer.getTools();
        res.end(JSON.stringify({ tools }));
        return;
      }

      if (req.url === '/tools/call' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => body += chunk);
        req.on('end', async () => {
          try {
            const { name, arguments: args } = JSON.parse(body);
            const result = await mcpServer.handleTool(name, args);
            res.end(JSON.stringify(result));
          } catch (error: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(port, () => {
      console.log(chalk.green(`✅ MCP server running at http://localhost:${port}`));
      console.log(chalk.gray(`  Tools: GET http://localhost:${port}/tools`));
      console.log(chalk.gray(`  Call: POST http://localhost:${port}/tools/call`));
    });
  }

  private async initClaudeIntegration(): Promise<void> {
    console.log(chalk.blue('📝 Initializing Claude Code integration...'));

    try {
      const claudeDir = join(process.cwd(), '.claude');
      await fs.mkdir(claudeDir, { recursive: true });

      const settingsPath = join(claudeDir, 'settings.json');
      const settings = {
        mcpServers: {
          "vibe-flow": {
            command: "node",
            args: [join(process.cwd(), "dist", "cli.js"), "mcp", "--stdio"],
            env: {}
          }
        }
      };

      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      console.log(chalk.green(`  ✅ Created .claude/settings.json`));

      const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
      try {
        await fs.access(claudeMdPath);
        console.log(chalk.gray('   CLAUDE.md already exists'));
      } catch {
        const claudeMd = `# Project Notes

Generated by vibe-flow

## BMAD-METHOD Integration

This project uses vibe-flow for workflow orchestration.

### Commands
- \`vibe-flow start <name>\` - Start new project
- \`vibe-flow advance\` - Advance workflow
- \`vibe-flow status\` - Show status
- \`vibe-flow wrap-up\` - Execute wrap-up
- \`vibe-flow preflight\` - Run pre-flight checks
`;
        await fs.writeFile(claudeMdPath, claudeMd);
        console.log(chalk.green(`  ✅ Created CLAUDE.md`));
      }

      console.log(chalk.green('\n✅ Claude Code integration initialized!'));
      console.log(chalk.gray('\nRestart Claude Code to use vibe-flow tools.'));
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize: ${error.message}`));
    }
  }

  public async run(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }
}

// CLI entry point
const cli = new VibeFlowCLI();
cli.run(process.argv).catch((error) => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
