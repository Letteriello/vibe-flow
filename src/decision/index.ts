// Decision Handler - FR-006: Decision point interaction and workflow overrides
import { Phase } from '../state-machine/index.js';

// Re-export ensemble voting types and class
export {
  EnsembleVotingMechanism,
  AgentVote,
  DivergencePoint,
  ConsensusResult
} from './ensemble-voting.js';

export { ProjectState, analyzeProjectMaturity } from './state-detector.js';

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
  // Autonomous mode: no configuration needed for automatic decisions

  // FR-006: Check if we should pause for a decision at this phase
  // Autonomous mode: never pause, always continue automatically
  async shouldPauseForDecision(_phase: Phase): Promise<boolean> {
    return false;
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
      [Phase.WRAP_UP]: {
        id: 'decision-wrap-up',
        phase: Phase.WRAP_UP,
        message: 'Wrap-up complete? Proceed to Complete?',
        options: ['Continue', 'Review', 'Override'],
        requiresJustification: true
      },
      [Phase.COMPLETE]: null
    };
    return decisionPoints[phase];
  }

  // Prompt user for decision - auto-approves all decisions for autonomous operation
  async promptDecision(decisionPoint: DecisionPoint): Promise<DecisionResult> {
    // Autonomous mode: automatically choose the first positive option
    // "Continue" is always the first option and represents forward progress
    const defaultChoice = decisionPoint.options[0] || 'Continue';
    return {
      choice: defaultChoice,
      overrideJustification: undefined
    };
  }

  // FR-016: Request override with justification - auto-approves for autonomous operation
  async requestOverride(reason: string): Promise<boolean> {
    // Autonomous mode: always approve overrides without human intervention
    return true;
  }
}
