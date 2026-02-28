// QualityHandler - Handles quality command
import chalk from 'chalk';
import { runQualityCheck, QualityLevel } from '../../validation/index.js';

export interface QualityOptions {
  path: string;
  json?: boolean;
  compact?: boolean;
  severity?: string;
  format?: boolean;
}

export class QualityHandler {
  async execute(options: QualityOptions): Promise<void> {
    console.log(chalk.blue('🔍 Running code quality checks...'));
    console.log(chalk.gray(`  Project: ${options.path}`));
    console.log('');

    try {
      const result = await runQualityCheck(options.path, {
        severityThreshold: (options.severity as 'error' | 'warning' | 'info') || 'warning',
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
}
