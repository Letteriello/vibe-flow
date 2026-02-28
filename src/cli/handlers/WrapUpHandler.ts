// WrapUpHandler - Handles wrap-up command
import chalk from 'chalk';
import { WrapUpExecutor } from '../../wrap-up/index.js';
import { ConfigManager } from '../../config/index.js';
import { HelpExecutor } from '../../help/index.js';
import { StateMachine } from '../../state-machine/index.js';

export interface WrapUpOptions {
  mode?: string;
  phase?: string;
  status?: boolean;
  force?: boolean;
  yes?: boolean;
}

export class WrapUpHandler {
  private wrapUpExecutor: WrapUpExecutor;
  private configManager: ConfigManager;
  private helpExecutor: HelpExecutor;
  private stateMachine: StateMachine;

  constructor(
    wrapUpExecutor: WrapUpExecutor,
    configManager: ConfigManager,
    helpExecutor: HelpExecutor,
    stateMachine: StateMachine
  ) {
    this.wrapUpExecutor = wrapUpExecutor;
    this.configManager = configManager;
    this.helpExecutor = helpExecutor;
    this.stateMachine = stateMachine;
  }

  async execute(options: WrapUpOptions): Promise<void> {
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

    console.log(chalk.blue(`🔧 Running wrap-up in ${mode} mode...`));

    const force = options.force || false;
    const yes = options.yes || false;
    const result = await this.wrapUpExecutor.execute(mode, force, yes);

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
}
