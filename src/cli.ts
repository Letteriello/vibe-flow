// VibeFlow CLI - Command-line interface handler
import { Command } from 'commander';
import { StateMachine, Phase } from './state-machine/index.js';
import { ConfigManager } from './config/index.js';
import { DecisionHandler } from './decision/index.js';
import { WrapUpExecutor } from './wrap-up/index.js';
import { HelpExecutor } from './help/index.js';
import { CommandRegistry } from './command-registry/index.js';
import { StepValidator } from './validation/index.js';
import { MCPServer } from './mcp/index.js';
import {
  AnalyzeHandler,
  FlowHandler,
  HelpHandler,
  PreflightHandler,
  QualityHandler,
  MCPHandler,
  QaHandler,
  WrapUpHandler,
  InitHandler,
  AnalyzeOptions,
  AdvanceOptions,
  HelpOptions,
  PreflightOptions,
  QualityOptions,
  MCPOptions,
  QAOptions,
  WrapUpOptions,
  InitOptions
} from './cli/handlers/index.js';

export class VibeFlowCLI {
  private program: Command;
  private stateMachine: StateMachine;
  private configManager: ConfigManager;
  private decisionHandler: DecisionHandler;
  private wrapUpExecutor: WrapUpExecutor;
  private helpExecutor: HelpExecutor;
  private commandRegistry: CommandRegistry;
  private stepValidator: StepValidator;

  // Handlers
  private analyzeHandler: AnalyzeHandler;
  private flowHandler: FlowHandler;
  private helpHandler: HelpHandler;
  private preflightHandler: PreflightHandler;
  private qualityHandler: QualityHandler;
  private mcpHandler: MCPHandler;
  private qaHandler: QaHandler;
  private wrapUpHandler: WrapUpHandler;
  private initHandler: InitHandler;

  constructor() {
    this.program = new Command();
    this.stateMachine = new StateMachine();
    this.configManager = new ConfigManager();
    this.decisionHandler = new DecisionHandler();
    this.wrapUpExecutor = new WrapUpExecutor(this.configManager, this.stateMachine);
    this.helpExecutor = new HelpExecutor();
    this.commandRegistry = new CommandRegistry();
    this.stepValidator = new StepValidator();

    // Initialize handlers with dependency injection
    this.analyzeHandler = new AnalyzeHandler(this.stateMachine, this.configManager, this.helpExecutor);
    this.flowHandler = new FlowHandler(
      this.stateMachine,
      this.configManager,
      this.helpExecutor,
      this.decisionHandler,
      this.commandRegistry,
      this.stepValidator
    );
    this.helpHandler = new HelpHandler(this.stateMachine, this.helpExecutor);
    this.preflightHandler = new PreflightHandler();
    this.qualityHandler = new QualityHandler();
    this.mcpHandler = new MCPHandler();
    this.qaHandler = new QaHandler();
    this.wrapUpHandler = new WrapUpHandler(
      this.wrapUpExecutor,
      this.configManager,
      this.helpExecutor,
      this.stateMachine
    );
    this.initHandler = new InitHandler();

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
        await this.flowHandler.handleStart({ name });
      });

    this.program
      .command('advance')
      .description('Advance to the next step in the workflow')
      .option('-f, --force', 'Skip confirmation prompts')
      .action(async (options) => {
        await this.flowHandler.handleAdvance({ force: options.force });
      });

    this.program
      .command('status')
      .description('Show current project status')
      .action(async () => {
        await this.flowHandler.handleStatus({});
      });

    this.program
      .command('wrap-up')
      .description('Execute wrap-up session')
      .option('-m, --mode <mode>', 'Mode: full, ship-it, remember-it, self-improve, publish-it', 'full')
      .option('--phase <phase>', 'Execute specific phase only')
      .option('--status', 'Show last wrap-up report')
      .option('--force', 'Force execution even if wrap-up is disabled in config')
      .option('-y, --yes', 'Skip confirmation prompts (auto-confirm commit)')
      .action(async (options) => {
        await this.wrapUpHandler.execute({
          mode: options.mode,
          phase: options.phase,
          status: options.status,
          force: options.force,
          yes: options.yes
        });
      });

    this.program
      .command('analyze')
      .description('Analyze current project and generate report')
      .option('-o, --output <file>', 'Output file path')
      .action(async (options) => {
        await this.analyzeHandler.execute({ output: options.output });
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
        await this.helpHandler.execute({ phase: options.phase });
      });

    this.program
      .command('preflight')
      .description('Run pre-flight checks before code generation')
      .option('-p, --path <path>', 'Project path to check', process.cwd())
      .option('--json', 'Output as JSON')
      .option('--compact', 'Compact single-line output')
      .option('--no-details', 'Hide details')
      .action(async (options) => {
        await this.preflightHandler.execute({
          path: options.path,
          json: options.json,
          compact: options.compact,
          details: options.details
        });
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
        await this.qualityHandler.execute({
          path: options.path,
          json: options.json,
          compact: options.compact,
          severity: options.severity,
          format: options.format
        });
      });

    // MCP server command - exposes tools for Claude Code
    this.program
      .command('mcp')
      .description('Start MCP server for Claude Code integration')
      .option('-p, --port <port>', 'Port for MCP server', '3000')
      .option('--stdio', 'Use stdio mode instead of HTTP')
      .action(async (options) => {
        await this.mcpHandler.execute({
          port: options.port,
          stdio: options.stdio
        });
      });

    // Generate claude.md for project integration
    this.program
      .command('init-claude')
      .description('Initialize Claude Code project integration')
      .action(async () => {
        await this.initHandler.execute({});
      });

    // QA Report command - generates quality assurance report
    this.program
      .command('qa')
      .description('Generate QA report (tests, build, types, security, coverage)')
      .option('-p, --path <path>', 'Project path', process.cwd())
      .option('-o, --output <file>', 'Output file (default: docs/planning/qa-report.md)')
      .option('--json', 'Output as JSON')
      .option('--no-block', 'Do not block on failure')
      .option('--skip-tests', 'Skip test validation')
      .option('--skip-build', 'Skip build validation')
      .option('--skip-types', 'Skip type checking')
      .option('--skip-security', 'Skip security scan')
      .option('--skip-coverage', 'Skip coverage check')
      .action(async (options) => {
        await this.qaHandler.execute({
          path: options.path,
          output: options.output,
          json: options.json,
          block: options.block,
          skipTests: options.skipTests,
          skipBuild: options.skipBuild,
          skipTypes: options.skipTypes,
          skipSecurity: options.skipSecurity,
          skipCoverage: options.skipCoverage
        });
      });
  }

  public async run(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }
}

// CLI entry point
const cli = new VibeFlowCLI();
cli.run(process.argv).catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
