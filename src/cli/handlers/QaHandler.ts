// QaHandler - Handles QA report generation
import chalk from 'chalk';
import { createQAReportGenerator, QAReportGenerator } from '../../qa/reporter/index.js';

export interface QAOptions {
  path: string;
  output?: string;
  json?: boolean;
  block?: boolean;
  skipTests?: boolean;
  skipBuild?: boolean;
  skipTypes?: boolean;
  skipSecurity?: boolean;
  skipCoverage?: boolean;
}

export class QaHandler {
  async execute(options: QAOptions): Promise<void> {
    console.log(chalk.blue('📊 Generating QA Report...'));
    console.log(chalk.gray(`  Project: ${options.path}`));
    console.log('');

    try {
      const generator = createQAReportGenerator(options.path, {
        outputDir: 'docs/planning',
        outputFilename: options.output || 'qa-report.md',
        blockOnFail: options.block !== false,
      });

      // Run selected validations
      const validations: Promise<unknown>[] = [];

      if (!options.skipTests) {
        validations.push(generator.runTestValidation());
      }
      if (!options.skipBuild) {
        validations.push(generator.runBuildValidation());
      }
      if (!options.skipTypes) {
        validations.push(generator.runTypesValidation());
      }
      if (!options.skipSecurity) {
        validations.push(generator.runSecurityValidation());
      }

      // Wait for all validations to complete
      const results = await Promise.all(validations);

      // Add results to generator
      for (const result of results) {
        generator.addVerification(result as Parameters<typeof generator.addVerification>[0]);
      }

      // Generate report
      const report = await generator.generate();

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(report.verdict === 'PASS' ? 0 : 1);
        return;
      }

      // Display summary
      const verdictColors = {
        PASS: chalk.green,
        WARNING: chalk.yellow,
        FAIL: chalk.red,
      };

      const verdictText = {
        PASS: '✅ APROVADO',
        WARNING: '⚠️ APROVADO COM RESSALVAS',
        FAIL: '❌ REPROVADO',
      };

      console.log(chalk.bold('═══ QA Report Summary ═══'));
      console.log(`  Verdict: ${verdictColors[report.verdict](verdictText[report.verdict])}`);
      console.log(`  Passed: ${chalk.green(report.summary.passed)}`);
      console.log(`  Failed: ${chalk.red(report.summary.failed)}`);
      console.log(`  Warnings: ${chalk.yellow(report.summary.warnings)}`);
      console.log('');

      // Show verification results
      console.log(chalk.bold('═══ Verifications ═══'));
      for (const v of report.verifications) {
        const icon = v.status === 'PASS' ? '✅' : v.status === 'WARNING' ? '⚠️' : '❌';
        console.log(`  ${icon} ${v.name}: ${v.status} (${v.duration}ms)`);
        if (v.issues && v.issues.length > 0) {
          for (const issue of v.issues.slice(0, 2)) {
            console.log(chalk.gray(`     - ${issue}`));
          }
        }
      }
      console.log('');

      // Save report
      const reportPath = await generator.save(report);
      console.log(chalk.gray(`  Report saved to: ${reportPath}`));
      console.log('');

      // Exit with appropriate code
      if (report.verdict === 'FAIL') {
        console.log(chalk.red.bold('✗ QA Report: FAILED'));
        if (options.block !== false) {
          console.log(chalk.yellow('  Use --no-block to ignore failures'));
          process.exit(1);
        }
      } else if (report.verdict === 'WARNING') {
        console.log(chalk.yellow.bold('⚠ QA Report: PASSED WITH WARNINGS'));
      } else {
        console.log(chalk.green.bold('✓ QA Report: PASSED'));
      }
    } catch (error) {
      console.error(chalk.red(`❌ QA Report failed: ${error}`));
      process.exit(1);
    }
  }
}
