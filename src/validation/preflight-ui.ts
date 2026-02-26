// Pre-Flight Checklist UI - Story 7.2: Display checklist with status indicators
// AC: Dado Pre-Flight Check em execução, Quando UI exibe resultados,
//     Então mostra items com status (✅ ready, ❌ missing, ⚠️ needs review),
//     E permite marcar items como "will fix later", E permite pular com confirmação

import chalk from 'chalk';
import { PreFlightResult, PreFlightStatus, PreFlightCheckItem } from './preflight-checker.js';

export interface ChecklistUIOptions {
  showDetails?: boolean;
  showSummary?: boolean;
  verbose?: boolean;
  interactive?: boolean;
}

const STATUS_ICONS: Record<PreFlightStatus, string> = {
  [PreFlightStatus.READY]: '✓',
  [PreFlightStatus.MISSING]: '✗',
  [PreFlightStatus.NEEDS_REVIEW]: '!',
  [PreFlightStatus.SKIPPED]: '-'
};

const STATUS_COLORS: Record<PreFlightStatus, typeof chalk.green> = {
  [PreFlightStatus.READY]: chalk.green,
  [PreFlightStatus.MISSING]: chalk.red,
  [PreFlightStatus.NEEDS_REVIEW]: chalk.yellow,
  [PreFlightStatus.SKIPPED]: chalk.gray
};

const STATUS_LABELS: Record<PreFlightStatus, string> = {
  [PreFlightStatus.READY]: 'READY',
  [PreFlightStatus.MISSING]: 'MISSING',
  [PreFlightStatus.NEEDS_REVIEW]: 'NEEDS REVIEW',
  [PreFlightStatus.SKIPPED]: 'SKIPPED'
};

/**
 * Story 7.2: Pre-Flight Checklist UI
 *
 * Renders the pre-flight check results in a user-friendly format
 * with status indicators and optional interactive features.
 */
export class PreFlightChecklistUI {
  private options: Required<ChecklistUIOptions>;

  constructor(options: ChecklistUIOptions = {}) {
    this.options = {
      showDetails: options.showDetails ?? true,
      showSummary: options.showSummary ?? true,
      verbose: options.verbose ?? false,
      interactive: options.interactive ?? false
    };
  }

  /**
   * Render the full checklist result
   */
  render(result: PreFlightResult): string {
    const lines: string[] = [];

    // Header
    lines.push(this.renderHeader(result));
    lines.push('');

    // Summary
    if (this.options.showSummary) {
      lines.push(this.renderSummary(result));
      lines.push('');
    }

    // Checklist items
    lines.push(this.renderChecklist(result.checks));
    lines.push('');

    // Blockers and warnings
    if (result.blockers.length > 0) {
      lines.push(this.renderBlockers(result.blockers));
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push(this.renderWarnings(result.warnings));
      lines.push('');
    }

    // Final status
    lines.push(this.renderFooter(result));

    return lines.join('\n');
  }

  /**
   * Render the header with timestamp and project path
   */
  private renderHeader(result: PreFlightResult): string {
    const timestamp = new Date(result.timestamp).toLocaleString();

    return chalk.bold.cyan('═'.repeat(60)) + '\n' +
      chalk.bold.cyan('  Pre-Flight Check Results') + '\n' +
      chalk.dim.cyan('═'.repeat(60)) + '\n' +
      chalk.dim(`  Project: ${result.projectPath}`) + '\n' +
      chalk.dim(`  Time: ${timestamp}`);
  }

  /**
   * Render the summary section with counts
   */
  private renderSummary(result: PreFlightResult): string {
    const { summary, readinessScore } = result;

    const scoreColor = readinessScore >= 80 ? chalk.green :
                       readinessScore >= 50 ? chalk.yellow :
                       chalk.red;

    return chalk.bold('  Summary') + '\n' +
      '  ' + '─'.repeat(40) + '\n' +
      `  ${chalk.bold('Readiness Score:')} ${scoreColor(`${readinessScore}%`)}\n` +
      `    ${STATUS_COLORS[PreFlightStatus.READY]('✓')} ${summary.ready} ready\n` +
      `    ${STATUS_COLORS[PreFlightStatus.MISSING]('✗')} ${summary.missing} missing\n` +
      `    ${STATUS_COLORS[PreFlightStatus.NEEDS_REVIEW]('!')} ${summary.needsReview} need review\n` +
      `    ${STATUS_COLORS[PreFlightStatus.SKIPPED]('-')} ${summary.skipped} skipped`;
  }

  /**
   * Render the checklist items
   */
  private renderChecklist(checks: PreFlightCheckItem[]): string {
    const lines: string[] = [chalk.bold('  Checklist'), '  ' + '─'.repeat(40)];

    for (const check of checks) {
      lines.push(this.renderCheckItem(check));
    }

    return lines.join('\n');
  }

  /**
   * Render a single checklist item
   */
  private renderCheckItem(check: PreFlightCheckItem): string {
    const icon = STATUS_ICONS[check.status];
    const color = STATUS_COLORS[check.status];
    const label = STATUS_LABELS[check.status];

    let line = `  ${color(icon)} ${chalk.bold(check.name)} `;
    line += chalk.dim(`[${label}]`);

    if (this.options.showDetails && check.details) {
      line += '\n    ' + chalk.dim(check.details);
    }

    if (check.canSkip && check.status !== PreFlightStatus.READY) {
      line += ' ' + chalk.gray('(can skip)');
    }

    return line;
  }

  /**
   * Render blockers section
   */
  private renderBlockers(blockers: string[]): string {
    const lines = [
      chalk.red.bold('  Blockers'),
      '  ' + '─'.repeat(40)
    ];

    for (const blocker of blockers) {
      lines.push(`  ${chalk.red('✗')} ${blocker}`);
    }

    return lines.join('\n');
  }

  /**
   * Render warnings section
   */
  private renderWarnings(warnings: string[]): string {
    const lines = [
      chalk.yellow.bold('  Warnings'),
      '  ' + '─'.repeat(40)
    ];

    for (const warning of warnings) {
      lines.push(`  ${chalk.yellow('!')} ${warning}`);
    }

    return lines.join('\n');
  }

  /**
   * Render the footer with final status
   */
  private renderFooter(result: PreFlightResult): string {
    const border = chalk.bold.cyan('═'.repeat(60));

    if (result.ready) {
      return border + '\n' +
        chalk.green.bold('  ✓ All checks passed! Ready to proceed.') + '\n' +
        border;
    } else {
      return border + '\n' +
        chalk.red.bold('  ✗ Blockers detected. Please resolve before proceeding.') + '\n' +
        border;
    }
  }

  /**
   * Render a compact single-line status for scripting
   */
  renderCompact(result: PreFlightResult): string {
    const { summary, readinessScore, ready } = result;

    const status = ready ? 'READY' : 'NOT_READY';
    const icon = ready ? '✓' : '✗';

    return `${icon} Pre-flight: ${status} (${readinessScore}%) - ` +
      `${summary.ready} ready, ${summary.missing} missing`;
  }

  /**
   * Render as JSON for programmatic use
   */
  renderJSON(result: PreFlightResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Interactive mode - prompt user for actions
   * (This is a placeholder for future implementation)
   */
  async *interactivePrompt(result: PreFlightResult): AsyncGenerator<{
    action: 'skip' | 'proceed' | 'quit';
    checkId?: string;
    reason?: string;
  }> {
    // For now, just yield the current state
    // Full interactive implementation would require inquirer integration
    if (!result.ready && this.options.interactive) {
      yield {
        action: result.blockers.length > 0 ? 'quit' : 'proceed'
      };
    }
  }
}

/**
 * Convenience function to render pre-flight results
 */
export function renderPreFlightChecklist(
  result: PreFlightResult,
  options?: ChecklistUIOptions
): string {
  const ui = new PreFlightChecklistUI(options);
  return ui.render(result);
}

/**
 * Convenience function for compact output
 */
export function renderPreFlightCompact(
  result: PreFlightResult
): string {
  const ui = new PreFlightChecklistUI({ showDetails: false, showSummary: false });
  return ui.renderCompact(result);
}
