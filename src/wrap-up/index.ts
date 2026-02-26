// Wrap-up Module - Session closure, memory consolidation, and self-improvement
import { promises as fs } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import inquirer from 'inquirer';
import { ConfigManager, WrapUpConfig } from '../config/index.js';
import { StateMachine, ProjectState } from '../state-machine/index.js';
import { Consolidation, getConsolidation } from './consolidation.js';
import { getMemory } from './memory.js';

const execAsync = promisify(exec);

// Conventional Commits types
type CommitType = 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore' | 'perf' | 'ci' | 'build';

interface CommitAnalysis {
  type: CommitType;
  scope: string | null;
  message: string;
  body: string;
  files: string[];
}

export interface WrapUpResult {
  success: boolean;
  phasesExecuted: string[];
  shipIt?: ShipItResult;
  rememberIt?: RememberItResult;
  selfImprove?: SelfImproveResult;
  publishIt?: PublishItResult;
  errors: string[];
}

export interface ShipItResult {
  commits: number;
  filesOrganized: string[];
  errors: string[];
}

export interface RememberItResult {
  rulesUpdated: number;
  filesModified: string[];
}

export interface SelfImproveResult {
  patternsDetected: number;
  rulesGenerated: number;
}

export interface PublishItResult {
  draftsCreated: number;
}

export class WrapUpExecutor {
  private configManager: ConfigManager;
  private stateMachine: StateMachine;
  private config: WrapUpConfig | null = null;

  constructor(configManager: ConfigManager, stateMachine: StateMachine) {
    this.configManager = configManager;
    this.stateMachine = stateMachine;
  }

  async execute(mode: string = 'full', dryRun: boolean = false, force: boolean = false, yes: boolean = false): Promise<WrapUpResult> {
    const result: WrapUpResult = {
      success: true,
      phasesExecuted: [],
      errors: []
    };

    try {
      this.config = (await this.configManager.load()).wrapUp;

      // Allow force override of enabled check
      if (!force && !this.config.enabled) {
        console.log(chalk.yellow('⚠️ Wrap-up is not enabled. Enable it in configuration first.'));
        return { ...result, success: false, errors: ['Wrap-up not enabled'] };
      }

      if (this.config?.output?.verbose) {
        console.log(chalk.gray(`📋 Wrap-up config loaded:`));
        console.log(chalk.gray(`   Enabled: ${this.config.enabled}`));
        console.log(chalk.gray(`   Ship It: ${this.config.phases?.shipIt?.enabled}`));
        console.log(chalk.gray(`   Remember It: ${this.config.phases?.rememberIt?.enabled}`));
        console.log(chalk.gray(`   Self Improve: ${this.config.phases?.selfImprove?.enabled}`));
        console.log(chalk.gray(`   Publish It: ${this.config.phases?.publishIt?.enabled}`));
      }

      // Use safety.dryRunDefault if dryRun not explicitly specified
      if (dryRun === undefined && this.config.safety?.dryRunDefault) {
        dryRun = true;
        console.log(chalk.cyan('🔍 Running in dry-run mode by default (safety setting)'));
      }

      const modes = mode === 'full'
        ? ['ship-it', 'remember-it', 'self-improve', 'publish-it']
        : [mode];

      for (const m of modes) {
        if (dryRun) {
          console.log(chalk.cyan(`🔍 [DRY-RUN] Would execute: ${m}`));
          result.phasesExecuted.push(`${m} (dry-run)`);
          continue;
        }

        console.log(chalk.blue(`\n📦 Executing: ${m}`));

        switch (m) {
          case 'ship-it':
            if (this.config.phases?.shipIt?.enabled) {
              result.shipIt = await this.executeShipIt(yes);
              result.phasesExecuted.push('ship-it');
            } else {
              console.log(chalk.gray('  ↪️ Ship It disabled in config, skipping'));
            }
            break;
          case 'remember-it':
            if (this.config.phases?.rememberIt?.enabled) {
              result.rememberIt = await this.executeRememberIt();
              result.phasesExecuted.push('remember-it');
            } else {
              console.log(chalk.gray('  ↪️ Remember It disabled in config, skipping'));
            }
            break;
          case 'self-improve':
            if (this.config.phases?.selfImprove?.enabled) {
              result.selfImprove = await this.executeSelfImprove();
              result.phasesExecuted.push('self-improve');
            } else {
              console.log(chalk.gray('  ↪️ Self Improve disabled in config, skipping'));
            }
            break;
          case 'publish-it':
            if (this.config.phases?.publishIt?.enabled) {
              result.publishIt = await this.executePublishIt();
              result.phasesExecuted.push('publish-it');
            } else {
              console.log(chalk.gray('  ↪️ Publish It disabled in config, skipping'));
            }
            break;
        }
      }

      console.log(chalk.green('\n✅ Wrap-up completed successfully'));
    } catch (error: any) {
      console.error(chalk.red(`❌ Wrap-up failed: ${error.message}`));
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  private async executeShipIt(autoConfirm: boolean = false): Promise<ShipItResult> {
    const result: ShipItResult = {
      commits: 0,
      filesOrganized: [],
      errors: []
    };

    console.log(chalk.gray('  🚢 Ship It phase...'));

    // Check safety settings
    if (this.config!.safety.secretDetection) {
      console.log(chalk.gray('  🔒 Checking for secrets...'));
      // Basic check for common secret patterns in staged files
      try {
        const { stdout } = await execAsync('git diff --cached --name-only', { cwd: process.cwd() });
        const files = stdout.trim().split('\n').filter(f => f);

        for (const file of files) {
          if (file.match(/\.(env|json|yaml|yml)$/i)) {
            try {
              const content = await fs.readFile(join(process.cwd(), file), 'utf-8');
              if (content.match(/(api[_-]?key|secret|password|token)\s*=\s*['"][^'"]+['"]/i)) {
                result.errors.push(`Potential secret found in ${file}`);
                console.log(chalk.yellow(`  ⚠️ Potential secret in ${file}`));
              }
            } catch {
              // File might not exist or be unreadable
            }
          }
        }
      } catch {
        // Not a git repo or no staged files
      }
    }

    // Get git status to see what files have changed
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: process.cwd() });
      const changes = stdout.trim().split('\n').filter(line => line.length > 0);

      if (changes.length === 0) {
        console.log(chalk.gray('    No changes to commit'));
        return result;
      }

      result.filesOrganized = changes.map(line => line.substring(3).trim());
      console.log(chalk.gray(`    Found ${changes.length} changed files`));

      // Analyze changes for Conventional Commits
      const useConventionalCommits = this.config!.phases.shipIt.useConventionalCommits ?? true;
      const confirmBeforeCommit = this.config!.phases.shipIt.confirmBeforeCommit ?? true;

      let commitAnalysis: CommitAnalysis | null = null;
      if (useConventionalCommits) {
        commitAnalysis = await this.analyzeChangesForConventionalCommit(result.filesOrganized);
        console.log(chalk.gray(`    Detected type: ${commitAnalysis.type}`));
      }

      if (this.config!.phases.shipIt.autoCommit) {
        // Build commit message
        let commitMessage: string;
        if (useConventionalCommits && commitAnalysis) {
          commitMessage = this.buildConventionalCommitMessage(commitAnalysis);
        } else {
          commitMessage = `docs: Auto-wrap-up session ${new Date().toISOString()}`;
        }

        // Show summary and confirm if enabled
        if (confirmBeforeCommit && !autoConfirm) {
          console.log(chalk.blue('\n  📋 Commit Summary'));
          console.log(chalk.gray('  ───────────────────'));
          if (commitAnalysis) {
            console.log(chalk.gray(`  Type: ${commitAnalysis.type}`));
            console.log(chalk.gray(`  Scope: ${commitAnalysis.scope || 'none'}`));
            console.log(chalk.gray(`  Message: ${commitAnalysis.message}`));
            if (commitAnalysis.body) {
              console.log(chalk.gray(`  Body: ${commitAnalysis.body.substring(0, 100)}...`));
            }
          }
          console.log(chalk.gray(`  Files: ${result.filesOrganized.length} changed`));
          console.log(chalk.gray('  ───────────────────\n'));

          const answers = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmCommit',
            message: 'Proceed with commit?',
            default: true
          }]) as { confirmCommit: boolean };

          if (!answers.confirmCommit) {
            console.log(chalk.yellow('    ❌ Commit cancelled by user'));
            return result;
          }
        } else if (autoConfirm) {
          console.log(chalk.gray('\n  📋 Commit Summary (auto-confirmed)'));
          console.log(chalk.gray('  ───────────────────'));
          if (commitAnalysis) {
            console.log(chalk.gray(`  Type: ${commitAnalysis.type}`));
            console.log(chalk.gray(`  Message: ${commitAnalysis.message}`));
          }
          console.log(chalk.gray(`  Files: ${result.filesOrganized.length} changed`));
          console.log(chalk.gray('  ───────────────────\n'));
        }

        console.log(chalk.gray('  📝 Auto-commit enabled'));

        // Stage all changes
        await execAsync('git add -A', { cwd: process.cwd() });

        // Create commit with the generated message
        await execAsync(`git commit -m "${commitMessage}"`, { cwd: process.cwd() });
        result.commits = 1;
        console.log(chalk.green(`    ✓ Committed: ${commitMessage}`));

        // Push if enabled (never auto-push without confirmation)
        if (this.config!.phases.shipIt.autoPush) {
          console.log(chalk.gray('    Pushing to remote...'));
          await execAsync('git push', { cwd: process.cwd() });
          console.log(chalk.green('    Pushed to remote'));
        }
      }
    } catch (error: any) {
      // Not a git repo or git error - not critical
      if (!error.message.includes('not a git repository')) {
        result.errors.push(error.message);
        console.log(chalk.yellow(`  ⚠️ Git error: ${error.message}`));
      } else {
        console.log(chalk.gray('    Not a git repository, skipping commit'));
      }
    }

    return result;
  }

  private async analyzeChangesForConventionalCommit(files: string[]): Promise<CommitAnalysis> {
    let phase = 'NEW';
    let decisions: any[] = [];
    try {
      const state = await this.stateMachine.getState();
      phase = state.phase;
      decisions = state.decisions || [];
    } catch {
      // No project state found, use default phase
      console.log(chalk.gray('    ⚠️ No project state found. Using default phase.'));
    }

    // Detect commit type based on files and current phase
    let type: CommitType = 'chore';
    let scope: string | null = null;
    let message = '';
    let body = '';

    // Check file patterns to determine type
    const fileList = files.join(' ');

    if (fileList.match(/\.md$/) || fileList.match(/docs\//)) {
      type = 'docs';
      message = 'update documentation';
    } else if (fileList.match(/\.(test|spec)\.(ts|js)$/) || fileList.match(/__tests__|test\//)) {
      type = 'test';
      message = 'add or update tests';
    } else if (fileList.match(/\.(ts|js)$/) && fileList.match(/error|bug|fix/i)) {
      type = 'fix';
      message = 'resolve issue';
    } else if (fileList.match(/\/src\/(state|config|cli|types|wrap-up|decision)\//)) {
      type = 'refactor';
      message = 'refactor core components';
    } else if (fileList.match(/package\.json|yarn\.lock|pnpm-lock\.yaml/)) {
      type = 'chore';
      message = 'update dependencies';
    } else if (fileList.match(/\.(ts|js)$/)) {
      // Default to feat for new code features
      type = 'feat';
      message = 'implement new functionality';
    }

    // Set scope based on primary file location
    const primaryFile = files[0] || '';
    if (primaryFile.includes('src/')) {
      const match = primaryFile.match(/src\/(\w+)/);
      if (match) {
        scope = match[1];
      }
    } else if (primaryFile.includes('/')) {
      const match = primaryFile.match(/(\w+)\//);
      if (match) {
        scope = match[1];
      }
    }

    // Add phase context to body
    body = `Work completed in ${phase} phase. ${files.length} file(s) changed.`;

    // Include decisions if available
    if (decisions && decisions.length > 0) {
      const recentDecisions = decisions.slice(-3);
      body += '\n\nDecisions:\n' + recentDecisions.map((d: any) => `- ${d.description}`).join('\n');
    }

    return { type, scope, message, body, files };
  }

  private buildConventionalCommitMessage(analysis: CommitAnalysis): string {
    const { type, scope, message, body } = analysis;

    let commitMsg = `${type}`;

    if (scope) {
      commitMsg += `(${scope})`;
    }

    commitMsg += `: ${message}`;

    if (body) {
      commitMsg += `\n\n${body}`;
    }

    // Add Co-Authored-By for attribution
    commitMsg += '\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>';

    return commitMsg;
  }

  private async executeRememberIt(): Promise<RememberItResult> {
    const result: RememberItResult = {
      rulesUpdated: 0,
      filesModified: []
    };

    console.log(chalk.gray('  🧠 Remember It phase...'));

    if (this.config!.phases.rememberIt.consolidateClaudeMd) {
      console.log(chalk.gray('  📄 Consolidating CLAUDE.md...'));

      const claudeMdPath = join(process.cwd(), 'CLAUDE.md');

      try {
        // Check if CLAUDE.md exists
        try {
          await fs.access(claudeMdPath);
          const content = await fs.readFile(claudeMdPath, 'utf-8');

          // Add session note
          const sessionNote = `\n\n## Session Notes (${new Date().toISOString().split('T')[0]})\n- Wrap-up session executed`;
          await fs.writeFile(claudeMdPath, content + sessionNote, 'utf-8');
          result.filesModified.push(claudeMdPath);
          result.rulesUpdated = 1;
          console.log(chalk.green('    Updated CLAUDE.md'));
        } catch {
          // CLAUDE.md doesn't exist, create it
          const defaultContent = `# Project Notes

Generated by vibe-flow wrap-up
`;
          await fs.writeFile(claudeMdPath, defaultContent, 'utf-8');
          result.filesModified.push(claudeMdPath);
          result.rulesUpdated = 1;
          console.log(chalk.green('    Created CLAUDE.md'));
        }
      } catch (error: any) {
        console.log(chalk.yellow(`    Error updating CLAUDE.md: ${error.message}`));
      }
    }

    // Also check for .claude/rules directory
    const rulesDir = join(process.cwd(), '.claude', 'rules');
    try {
      await fs.access(rulesDir);
      const files = await fs.readdir(rulesDir);
      console.log(chalk.gray(`    Found ${files.length} rule files`));
    } catch {
      // Rules directory doesn't exist
    }

    return result;
  }

  private async executeSelfImprove(): Promise<SelfImproveResult> {
    const result: SelfImproveResult = {
      patternsDetected: 0,
      rulesGenerated: 0
    };

    console.log(chalk.gray('  🔧 Self Improve phase...'));

    if (this.config!.phases.selfImprove.analyzeErrors) {
      console.log(chalk.gray('  📊 Analyzing error patterns and extracting lessons...'));

      try {
        // Use Consolidation to analyze and extract lessons
        const consolidation = getConsolidation(getMemory());
        const consolidationResult = await consolidation.consolidate(process.cwd());

        result.patternsDetected = consolidationResult.patternsDetected;
        result.rulesGenerated = consolidationResult.lessonsExtracted;

        if (consolidationResult.patternsDetected > 0) {
          console.log(chalk.gray(`    Detected ${consolidationResult.patternsDetected} patterns`));
          console.log(chalk.gray(`    Extracted ${consolidationResult.lessonsExtracted} lessons`));

          if (consolidationResult.filesUpdated.length > 0) {
            for (const file of consolidationResult.filesUpdated) {
              console.log(chalk.green(`    Updated: ${file}`));
            }
          }

          // Print summary
          const summary = await consolidation.generateSummary();
          console.log(chalk.gray('\n' + summary));
        } else {
          console.log(chalk.gray('    No new patterns detected'));
        }
      } catch (error: any) {
        console.log(chalk.yellow(`    Error analysis: ${error.message}`));
      }
    }

    return result;
  }

  private async executePublishIt(): Promise<PublishItResult> {
    const result: PublishItResult = {
      draftsCreated: 0
    };

    console.log(chalk.gray('  📢 Publish It phase...'));

    try {
      // Generate a wrap-up report as a draft
      const state = await this.stateMachine.getState();
      const docsDir = join(process.cwd(), 'docs');
      await fs.mkdir(docsDir, { recursive: true });

      const reportPath = join(docsDir, `wrap-up-report-${Date.now()}.md`);
      const reportContent = this.generateReportMarkdown(state);

      await fs.writeFile(reportPath, reportContent, 'utf-8');
      result.draftsCreated = 1;
      console.log(chalk.green(`    Created report: ${reportPath}`));
    } catch (error: any) {
      console.log(chalk.yellow(`    Error creating report: ${error.message}`));
    }

    return result;
  }

  private generateReportMarkdown(state: ProjectState): string {
    return `# Wrap-up Report

Generated: ${new Date().toISOString()}

## Project State

- **Project:** ${state.projectName}
- **Phase:** ${state.phase}
- **Step:** ${state.currentStep} / ${state.totalSteps}

## Summary

This wrap-up report was automatically generated by vibe-flow.

## Decisions Made

${state.decisions && state.decisions.length > 0 ? state.decisions.map(d => `- ${d.phase}: ${d.description}`).join('\n') : 'No decisions recorded'}

## Errors

${state.errors && state.errors.length > 0 ? state.errors.map(e => `- ${e.phase}: ${e.message}`).join('\n') : 'No errors'}

---
*Generated by vibe-flow wrap-up*
`;
  }

  async getLastReport(): Promise<WrapUpResult | null> {
    try {
      const reportPath = join(process.cwd(), '.vibe-flow', 'wrap-up-report.json');
      const content = await fs.readFile(reportPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveReport(result: WrapUpResult): Promise<void> {
    const reportPath = join(process.cwd(), '.vibe-flow', 'wrap-up-report.json');
    await fs.writeFile(reportPath, JSON.stringify(result, null, 2), 'utf-8');
  }
}
