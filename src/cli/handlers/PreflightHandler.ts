// PreflightHandler - Handles preflight command
import chalk from 'chalk';
import { runPreFlightChecks, PreFlightChecklistUI } from '../../validation/index.js';

export interface PreflightOptions {
  path: string;
  json?: boolean;
  compact?: boolean;
  details?: boolean;
}

export class PreflightHandler {
  async execute(options: PreflightOptions): Promise<void> {
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
}
