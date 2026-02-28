// HelpHandler - Handles help command
import chalk from 'chalk';
import { StateMachine } from '../../state-machine/index.js';
import { HelpExecutor } from '../../help/index.js';

export interface HelpOptions {
  phase?: string;
}

export class HelpHandler {
  private stateMachine: StateMachine;
  private helpExecutor: HelpExecutor;

  constructor(stateMachine: StateMachine, helpExecutor: HelpExecutor) {
    this.stateMachine = stateMachine;
    this.helpExecutor = helpExecutor;
  }

  async execute(options: HelpOptions): Promise<void> {
    try {
      let state;
      let phase: string;
      let currentStep: number;

      if (options.phase) {
        // Show help for specific phase
        phase = options.phase.toUpperCase();
        currentStep = 1;
      } else {
        // Get current project state
        state = await this.stateMachine.getState();
        phase = state.phase;
        currentStep = state.currentStep;
      }

      await this.helpExecutor.displayHelp(phase, currentStep);
    } catch (error: unknown) {
      // No project started yet - show general help
      await this.helpExecutor.displayHelp('NEW', 1);
    }
  }
}
