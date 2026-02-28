// AnalyzeHandler - Handles project analysis
import chalk from 'chalk';
import { StateMachine } from '../../state-machine/index.js';
import { ConfigManager } from '../../config/index.js';
import { HelpExecutor } from '../../help/index.js';

export interface AnalyzeOptions {
  output?: string;
}

export interface AnalyzeReport {
  projectName: string;
  phase: string;
  currentStep: number;
  summary: string;
  painPoints: string[];
  suggestions: string[];
}

export class AnalyzeHandler {
  private stateMachine: StateMachine;
  private configManager: ConfigManager;
  private helpExecutor: HelpExecutor;

  constructor(stateMachine: StateMachine, configManager: ConfigManager, helpExecutor: HelpExecutor) {
    this.stateMachine = stateMachine;
    this.configManager = configManager;
    this.helpExecutor = helpExecutor;
  }

  async execute(options: AnalyzeOptions): Promise<void> {
    // Display educational context in beginner mode
    const config = await this.configManager.load();
    if (config.preferences.beginnerMode) {
      const state = await this.stateMachine.getState();
      this.helpExecutor.displayEducationalContext(state.phase);
    }

    console.log(chalk.blue('🔍 Analyzing project...'));

    const state = await this.stateMachine.getState();
    const report: AnalyzeReport = {
      projectName: state.projectName,
      phase: state.phase,
      currentStep: state.currentStep,
      summary: 'Project analysis report',
      painPoints: [],
      suggestions: []
    };

    console.log(chalk.green('✅ Analysis complete'));
    console.log(JSON.stringify(report, null, 2));
  }
}
