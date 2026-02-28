// FlowHandler - Handles workflow commands (start, advance, status)
import chalk from 'chalk';
import { StateMachine, Phase } from '../../state-machine/index.js';
import { ConfigManager } from '../../config/index.js';
import { HelpExecutor } from '../../help/index.js';
import { DecisionHandler } from '../../decision/index.js';
import { CommandRegistry, CommandResult } from '../../command-registry/index.js';
import { StepValidator } from '../../validation/index.js';

export interface StartOptions {
  name?: string;
}

export interface AdvanceOptions {
  force?: boolean;
}

export interface StatusOptions {
  // No specific options for status
}

export class FlowHandler {
  private stateMachine: StateMachine;
  private configManager: ConfigManager;
  private helpExecutor: HelpExecutor;
  private decisionHandler: DecisionHandler;
  private commandRegistry: CommandRegistry;
  private stepValidator: StepValidator;

  constructor(
    stateMachine: StateMachine,
    configManager: ConfigManager,
    helpExecutor: HelpExecutor,
    decisionHandler: DecisionHandler,
    commandRegistry: CommandRegistry,
    stepValidator: StepValidator
  ) {
    this.stateMachine = stateMachine;
    this.configManager = configManager;
    this.helpExecutor = helpExecutor;
    this.decisionHandler = decisionHandler;
    this.commandRegistry = commandRegistry;
    this.stepValidator = stepValidator;
  }

  async handleStart(options: StartOptions): Promise<void> {
    console.log(chalk.blue('🚀 Starting new project workflow...'));
    const projectName = options.name || 'unnamed-project';

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

  async handleAdvance(options: AdvanceOptions): Promise<void> {
    const force = options.force || false;
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

  async handleStatus(_options: StatusOptions): Promise<void> {
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
}
