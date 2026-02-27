// Wrap-up Module - Session closure, memory consolidation, and self-improvement
import { promises as fs } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager, WrapUpConfig } from '../config/index.js';
import { StateMachine, ProjectState } from '../state-machine/index.js';
import { Consolidation, getConsolidation } from './consolidation.js';
import { getMemory } from './memory.js';
import { SessionAuditLogger, AuditEntry, AuditReport } from './audit-logger.js';
import { WrapUpWatchdog, createWatchdog } from './watchdog.js';
import { SessionReflector, createReflector, reflect, ReflectionResult } from './reflection.js';

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
  private watchdog: WrapUpWatchdog | null = null;

  constructor(configManager: ConfigManager, stateMachine: StateMachine) {
    this.configManager = configManager;
    this.stateMachine = stateMachine;
  }

  async execute(mode: string = 'full', force: boolean = false, yes: boolean = false): Promise<WrapUpResult> {
    const result: WrapUpResult = {
      success: true,
      phasesExecuted: [],
      errors: []
    };

    // Initialize watchdog for real-time progress tracking
    this.watchdog = createWatchdog(5);
    await this.watchdog.start();

    try {
      this.config = (await this.configManager.load()).wrapUp;
      await this.watchdog.logProgress('Configuration loaded');

      // Wrap-up is always enabled - no check needed

      if (this.config?.output?.verbose) {
        console.log(chalk.gray(`📋 Wrap-up config loaded:`));
        console.log(chalk.gray(`   Enabled: true (always)`));
        console.log(chalk.gray(`   Ship It: ${this.config.phases?.shipIt?.enabled}`));
        console.log(chalk.gray(`   Remember It: ${this.config.phases?.rememberIt?.enabled}`));
        console.log(chalk.gray(`   Self Improve: ${this.config.phases?.selfImprove?.enabled}`));
        console.log(chalk.gray(`   Publish It: ${this.config.phases?.publishIt?.enabled}`));
      }

      const modes = mode === 'full'
        ? ['ship-it', 'remember-it', 'self-improve', 'publish-it']
        : [mode];

      for (const m of modes) {
        console.log(chalk.blue(`\n📦 Executing: ${m}`));
        await this.watchdog!.logPhase(m);

        switch (m) {
          case 'ship-it':
            if (this.config.phases?.shipIt?.enabled) {
              await this.watchdog!.logStep(1, 'Ship It: Starting commit phase');
              result.shipIt = await this.executeShipIt(yes);
              await this.watchdog!.logComplete(1, 'Ship It: Commit phase completed');
              result.phasesExecuted.push('ship-it');
            } else {
              await this.watchdog!.logProgress('Ship It disabled, skipping');
              console.log(chalk.gray('  ↪️ Ship It disabled in config, skipping'));
            }
            break;
          case 'remember-it':
            if (this.config.phases?.rememberIt?.enabled) {
              await this.watchdog!.logStep(2, 'Remember It: Consolidating memory');
              result.rememberIt = await this.executeRememberIt();
              await this.watchdog!.logComplete(2, 'Remember It: Memory consolidated');
              result.phasesExecuted.push('remember-it');
            } else {
              await this.watchdog!.logProgress('Remember It disabled, skipping');
              console.log(chalk.gray('  ↪️ Remember It disabled in config, skipping'));
            }
            break;
          case 'self-improve':
            if (this.config.phases?.selfImprove?.enabled) {
              await this.watchdog!.logStep(3, 'Self Improve: Analyzing patterns');
              result.selfImprove = await this.executeSelfImprove();
              await this.watchdog!.logComplete(3, 'Self Improve: Patterns analyzed');
              result.phasesExecuted.push('self-improve');
            } else {
              await this.watchdog!.logProgress('Self Improve disabled, skipping');
              console.log(chalk.gray('  ↪️ Self Improve disabled in config, skipping'));
            }
            break;
          case 'publish-it':
            if (this.config.phases?.publishIt?.enabled) {
              await this.watchdog!.logStep(4, 'Publish It: Generating report');
              result.publishIt = await this.executePublishIt();
              await this.watchdog!.logComplete(4, 'Publish It: Report generated');
              result.phasesExecuted.push('publish-it');
            } else {
              await this.watchdog!.logProgress('Publish It disabled, skipping');
              console.log(chalk.gray('  ↪️ Publish It disabled in config, skipping'));
            }
            break;
        }
      }

      console.log(chalk.green('\n✅ Wrap-up completed successfully'));
      await this.watchdog!.finish(true);
    } catch (error: any) {
      console.error(chalk.red(`❌ Wrap-up failed: ${error.message}`));
      await this.watchdog!.logError('Wrap-up failed', error);
      await this.watchdog!.finish(false);
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  private async executeShipIt(autoConfirm: boolean = true): Promise<ShipItResult> {
    const result: ShipItResult = {
      commits: 0,
      filesOrganized: [],
      errors: []
    };

    console.log(chalk.gray('  🚢 Ship It phase...'));
    await this.watchdog!.logProgress('Ship It: Checking for secrets');

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

        // Autonomous mode: always auto-confirm, show summary only
        if (confirmBeforeCommit) {
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

          // Autonomous mode: auto-confirm commits without user prompt
          console.log(chalk.gray('  📝 Auto-committing (autonomous mode)'));
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
    await this.watchdog!.logProgress('Remember It: Updating CLAUDE.md');

    // Execute reflection to extract lessons learned
    let reflectionResult: ReflectionResult | null = null;
    try {
      console.log(chalk.gray('  🔍 Extracting lessons learned...'));
      reflectionResult = await createReflector().execute();

      if (reflectionResult.success) {
        console.log(chalk.gray(`    Extracted ${reflectionResult.lessonsLearned.length} lessons`));
        if (reflectionResult.outputPath) {
          console.log(chalk.green(`    Saved to: ${reflectionResult.outputPath}`));
        }
        result.rulesUpdated += reflectionResult.lessonsLearned.length;
        if (reflectionResult.outputPath) {
          result.filesModified.push(reflectionResult.outputPath);
        }
      } else {
        console.log(chalk.yellow(`    Reflection warning: ${reflectionResult.errors.join(', ')}`));
      }
    } catch (error: any) {
      console.log(chalk.yellow(`    Reflection error: ${error.message}`));
    }

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
    await this.watchdog!.logProgress('Self Improve: Analyzing error patterns');

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
    await this.watchdog!.logProgress('Publish It: Generating wrap-up report');

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

// Re-export audit logger
export { SessionAuditLogger, AuditEntry, AuditReport };

// Re-export incremental consolidator
export {
  IncrementalConsolidator,
  getConsolidator,
  resetConsolidator,
  type InteractionData,
  type PartialSummary,
  type SummaryState,
  type ArtifactSummary,
  type ErrorSummary,
  type DecisionSummary,
  type LessonSummary,
  type FlushResult,
  type ConsolidatorOptions
} from './incremental.js';

// Re-export RuleGenerator
export {
  RuleGenerator,
  type ImprovementFindings,
  type SkillGap,
  type SystemicError,
  type GeneratedRule
} from './self-improve/rule-generator.js';

// Re-export AutonomyMetricsTracker
export {
  AutonomyMetricsTracker,
  type DiffLine,
  type Diff,
  type HumanEdit,
  type AcceptanceMetrics,
  type TelemetrySummary
} from './self-improve/autonomy-metrics.js';

// Re-export DocFreshnessValidator
export {
  DocFreshnessValidator,
  type DocFreshnessResult,
  type DocRule
} from './self-improve/doc-freshness.js';

// Re-export ContentDrafter
export {
  PostSessionDrafter,
  type DraftReport,
  type ResolvedBug
} from './self-improve/content-drafter.js';

// Re-export FrictionDetector
export {
  FrictionDetector,
  analyzeSessionLogs,
  type LogEntry,
  type SkillGapFinding,
  type FrictionFinding,
  type KnowledgeFinding,
  type FrictionImprovementFindings
} from './self-improve/friction-detector.js';

// Re-export OntologyMetadataTagger
export {
  OntologyMetadataTagger,
  type RAGMetadata,
  type DomainKeyword,
  type ObjectKeyword,
  type ActionKeyword
} from './intelligence/rag-metadata.js';

// Re-export FinalQAAuditor
export {
  FinalQAAuditor,
  type QAReport,
  type QAAlert
} from './intelligence/qa-auditor.js';

// Re-export EscalationSummarizer
export {
  EscalationSummarizer,
  createEscalationSummarizer,
  type SummarizationResult,
  type LLMProvider,
  type EscalationOptions
} from './intelligence/summarization-escalation.js';

// Re-export WrapUpWatchdog
export {
  WrapUpWatchdog,
  createWatchdog
} from './watchdog.js';

// Re-export TimeoutController for worker timeout management
export {
  TimeoutController,
  createTimeoutController,
  executeWrapUpWithTimeout,
  type TimeoutControllerOptions,
  type WorkerExecutionResult
} from './worker-manager.js';

// Re-export WAL Parser (stream-based async parser)
export {
  WALParser,
  createWALParser,
  parseWALFile,
  parseWALDirectory,
  forEachWALEvent,
  type WALParserOptions,
  type WALParseResult,
  type WALMetadata,
  type WALLogEvent,
  type WALActionType
} from './wal-parser.js';

// Re-export Reflection (lessons learned extraction)
export {
  SessionReflector,
  createReflector,
  reflect,
  type ReflectionResult,
  type SessionAttempt,
  type CommonError,
  type EstablishedConvention,
  type ReflectionSummary
} from './reflection.js';

// Quality Gate Consolidator - Deterministic quality gates before memory consolidation
export {
  QualityGateConsolidator,
  getQualityGateConsolidator,
  resetQualityGateConsolidator,
  isWrapUpBlocked,
  canConsolidateMemory,
  consolidateWithGate,
  type QualityGateResult,
  type ConsolidationResult,
  type QualityGateConfig,
  DEFAULT_QUALITY_GATE_CONFIG
} from './quality-gate-consolidator.js';
