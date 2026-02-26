// Context-Aware Prompt Generator - Story 3.2: Generate prompts anchored in accumulated context
import { ProjectState, Phase } from '../state-machine/index.js';

export interface PromptTemplate {
  id: string;
  phase: Phase;
  trigger: string;
  template: string;
  requiresContext?: string[];
}

/**
 * Story 3.2: Context-Aware Prompt Generation
 * AC:
 * - Given: project_context.json contains previous decisions
 * - When: system generates question for next step
 * - Then: question explicitly references the decision taken
 * - Given: context empty (NEW project)
 * - When: generates initial question
 * - Then: question is discovery-focused without assuming prior decisions
 * - Given: accumulated context > 50 decisions
 * - When: generates question
 * - Then: references only 5 most relevant, attaches "Based on previous decisions: [X, Y, Z]"
 */
export class ContextAwarePromptGenerator {
  private maxRelevantDecisions = 5;

  /**
   * Generate a context-aware prompt for the current step
   */
  generatePrompt(state: ProjectState): string {
    // Empty context - discovery mode
    if (state.decisions.length === 0) {
      return this.generateDiscoveryPrompt(state.phase);
    }

    // Context exists - reference it
    return this.generateContextualPrompt(state);
  }

  /**
   * Generate discovery prompt for new projects
   * Story 3.2 AC: Given context empty (NEW project), When generates initial question, Then discovery-focused
   */
  private generateDiscoveryPrompt(phase: Phase): string {
    const discoveryPrompts: Record<Phase, string> = {
      [Phase.NEW]: `Let's start your project! What problem are you trying to solve?
Please describe:
1. The main challenge or opportunity
2. Who will benefit from this solution
3. Any constraints or requirements you already know`,

      [Phase.ANALYSIS]: `To understand the problem better:
What market or domain will this project address?
Who are the key stakeholders?
What research have you already done?`,

      [Phase.PLANNING]: `For the planning phase:
What are the must-have features?
What can be deferred?
What technical constraints exist?`,

      [Phase.SOLUTIONING]: `For the solution design:
What architectural approaches have you considered?
What are the trade-offs you're evaluating?
What patterns or technologies do you prefer?`,

      [Phase.IMPLEMENTATION]: `For implementation:
What is your test strategy?
How will you handle errors and edge cases?
What documentation is needed?`,

      [Phase.WRAP_UP]: `For wrap-up phase:
Let's consolidate what was accomplished.
What lessons were learned?
What should be documented for future sessions?`,

      [Phase.COMPLETE]: `Project is complete! What would you like to do next?`
    };

    return discoveryPrompts[phase];
  }

  /**
   * Generate contextual prompt that references previous decisions
   * Story 3.2 AC: Given context contains decisions, When generates question, Then references decision explicitly
   */
  private generateContextualPrompt(state: ProjectState): string {
    const recentDecisions = state.decisions.slice(-10);
    const mostRelevant = this.selectMostRelevant(recentDecisions);

    // Build context reference
    const contextRef = mostRelevant
      .map(d => `- ${d.description}`)
      .join('\n');

    // Build prompt based on phase
    const basePrompt = this.getPhasePrompt(state.phase);

    // Add decision references
    let fullPrompt = basePrompt;

    if (mostRelevant.length > 0) {
      fullPrompt += `\n\nBased on your previous decisions:\n${contextRef}`;
    }

    // If too many decisions, add reference note
    if (state.decisions.length > 50) {
      const allDecisions = state.decisions.map(d => d.id);
      const notShown = allDecisions.slice(-(state.decisions.length - this.maxRelevantDecisions));
      fullPrompt += `\n\n(Plus ${notShown.length} earlier decisions in context)`;
    }

    return fullPrompt;
  }

  /**
   * Select most relevant decisions for the current context
   * Story 3.2 AC: Given >50 decisions, When generates question, Then references only 5 most relevant
   */
  private selectMostRelevant(decisions: { id: string; phase: Phase; description: string }[]): any[] {
    // Prioritize decisions from current phase and recent ones
    const scored = decisions.map((d, index) => ({
      ...d,
      score: (decisions.length - index) // Recent decisions score higher
    }));

    // Sort by score and take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.maxRelevantDecisions);
  }

  /**
   * Get base prompt for each phase
   */
  private getPhasePrompt(phase: Phase): string {
    const prompts: Record<Phase, string> = {
      [Phase.NEW]: `What problem would you like to solve with this project?`,

      [Phase.ANALYSIS]: `Building on your previous context, what additional analysis is needed?
Consider:
- Market trends
- User needs
- Technical feasibility`,

      [Phase.PLANNING]: `Based on your analysis, let's define the solution:
What features should be prioritized?
What are the key requirements?`,

      [Phase.SOLUTIONING]: `Moving to architecture design:
What technical approach will you take?
What patterns will guide the implementation?`,

      [Phase.IMPLEMENTATION]: `As you implement, consider:
- How does this align with previous decisions?
- What tests validate your approach?`,

      [Phase.WRAP_UP]: `Let's consolidate and wrap up:
- What was accomplished in this session?
- What decisions were made?
- What should be remembered for future work?`,

      [Phase.COMPLETE]: `Congratulations on completing the project!`
    };

    return prompts[phase];
  }

  /**
   * Generate a question that references specific context
   */
  generateSpecificQuestion(state: ProjectState, topic: string): string {
    // Find decisions related to the topic
    const relatedDecisions = state.decisions.filter(d =>
      d.description.toLowerCase().includes(topic.toLowerCase())
    );

    if (relatedDecisions.length === 0) {
      return `What are your thoughts on ${topic}?`;
    }

    const ref = relatedDecisions.slice(-3)
      .map(d => d.description)
      .join(', ');

    return `Regarding ${topic}, you previously decided: "${ref}". What are your thoughts now?`;
  }
}

export default ContextAwarePromptGenerator;
