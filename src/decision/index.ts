// Decision Handler - FR-006: Decision point interaction and workflow overrides
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Phase } from '../state-machine/index.js';
import { ConfigManager } from '../config/index.js';

type InquirerQuestion = Parameters<typeof inquirer.prompt>[0];

export interface DecisionPoint {
  id: string;
  phase: Phase;
  message: string;
  options: string[];
  requiresJustification?: boolean;
}

export interface DecisionResult {
  choice: string;
  overrideJustification?: string;
}

export class DecisionHandler {
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  // FR-006: Check if we should pause for a decision at this phase
  async shouldPauseForDecision(phase: Phase): Promise<boolean> {
    const config = await this.configManager.load();
    // In auto-advance mode, skip decision prompts
    if (config.preferences.autoAdvance) {
      return false;
    }
    // Pause at phase transitions (not at step advances)
    return phase !== Phase.NEW && phase !== Phase.COMPLETE;
  }

  // Get the decision point for a specific phase
  getPhaseDecisionPoint(phase: Phase): DecisionPoint | null {
    const decisionPoints: Record<Phase, DecisionPoint | null> = {
      [Phase.NEW]: null,
      [Phase.ANALYSIS]: {
        id: 'decision-analysis',
        phase: Phase.ANALYSIS,
        message: 'Analysis complete? Proceed to Planning?',
        options: ['Continue', 'Review', 'Override'],
        requiresJustification: true
      },
      [Phase.PLANNING]: {
        id: 'decision-planning',
        phase: Phase.PLANNING,
        message: 'Planning defined? Proceed to Solutioning?',
        options: ['Continue', 'Review', 'Override'],
        requiresJustification: true
      },
      [Phase.SOLUTIONING]: {
        id: 'decision-solutioning',
        phase: Phase.SOLUTIONING,
        message: 'Specification ready for implementation? (FR-017)',
        options: ['Continue', 'Review Specification', 'Override'],
        requiresJustification: true
      },
      [Phase.IMPLEMENTATION]: {
        id: 'decision-implementation',
        phase: Phase.IMPLEMENTATION,
        message: 'Implementation complete? Finish project?',
        options: ['Finish', 'Continue Implementing', 'Override'],
        requiresJustification: true
      },
      [Phase.COMPLETE]: null
    };
    return decisionPoints[phase];
  }

  // Prompt user for decision
  async promptDecision(decisionPoint: DecisionPoint): Promise<DecisionResult> {
    const config = await this.configManager.load();
    const isBeginner = config.preferences.beginnerMode;

    if (isBeginner) {
      console.log(chalk.cyan('\n🌱 Beginner Mode Active\n'));
      console.log(chalk.gray(decisionPoint.message));
      console.log(chalk.gray('\nChoose one of the options below:\n'));
    }

    const questions: InquirerQuestion[] = [
      {
        type: 'list',
        name: 'choice',
        message: decisionPoint.message,
        choices: decisionPoint.options
      }
    ];

    if (decisionPoint.requiresJustification) {
      questions.push({
        type: 'input',
        name: 'justification',
        message: 'Justification (required for override):'
      });
    }

    const answers = await inquirer.prompt(questions) as Record<string, unknown>;
    return {
      choice: String(answers.choice),
      overrideJustification: answers.justification as string | undefined
    };
  }

  // FR-016: Request override with justification
  async requestOverride(reason: string): Promise<boolean> {
    const config = await this.configManager.load();

    if (config.preferences.beginnerMode) {
      console.log(chalk.cyan('\n🌱 Beginner Mode: Override Request\n'));
      console.log(chalk.yellow(`⚠️ You are requesting an override: ${reason}`));
      console.log(chalk.gray('Overrides should be used sparingly.\n'));
    }

    // First prompt for confirmation, then get justification if confirmed
    const confirmAnswers = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Confirm override: ${reason}?`,
      default: false
    }]) as { confirm: boolean };

    if (!confirmAnswers.confirm) {
      return false;
    }

    // Get justification for audit trail
    const justificationAnswers = await inquirer.prompt([{
      type: 'input',
      name: 'justification',
      message: 'Justification for the override:',
      validate: (input: string): boolean | string => input.length > 3 || 'Justification must be at least 4 characters'
    }]) as { justification: string };

    // Log justification for audit (saved to context)
    const justification = String(justificationAnswers.justification);
    console.log(chalk.gray(`Override justification recorded: ${justification}`));

    return true;
  }
}
