// Ensemble Voting Mechanism - FR-XXX: Party Mode consensus for hallucination elimination
// Receives verdicts from multiple agents (e.g., Opus, Kimi, GLM) and determines consensus

/**
 * Vote from a single agent simulation
 */
export interface AgentVote {
  agent: string;
  isApproved: boolean;
  reasoning: string;
}

/**
 * Point of divergence between agents
 */
export interface DivergencePoint {
  topic: string;
  conflictingAgents: string[];
  positions: Record<string, string>;
  severity: 'critical' | 'moderate' | 'minor';
}

/**
 * Result of consensus evaluation
 */
export interface ConsensusResult {
  approved: boolean;
  consensusType: 'unanimous' | 'majority' | 'split' | 'diverged';
  votes: AgentVote[];
  agreeCount: number;
  disagreeCount: number;
  divergencePoints: DivergencePoint[];
  resolved: boolean;
  resolutionPrompt?: string;
  confidence: number;
}

/**
 * EnsembleVotingMechanism - Aggregates votes from multiple agent simulations
 * to reach consensus and eliminate individual agent hallucinations.
 *
 * Party Mode: When multiple agents independently evaluate the same decision,
 * their collective agreement provides higher confidence than any single agent.
 */
export class EnsembleVotingMechanism {
  private minimumAgents: number;
  private confidenceThresholds: {
    unanimous: number;
    majority: number;
  };

  constructor(options?: {
    minimumAgents?: number;
    unanimousThreshold?: number;
    majorityThreshold?: number;
  }) {
    this.minimumAgents = options?.minimumAgents ?? 3;
    this.confidenceThresholds = {
      unanimous: options?.unanimousThreshold ?? 1.0,
      majority: options?.majorityThreshold ?? 0.66
    };
  }

  /**
   * Evaluates consensus among multiple agent votes
   * @param votes Array of votes from different agents
   * @returns ConsensusResult with approval decision and divergence details
   */
  evaluateConsensus(votes: AgentVote[]): ConsensusResult {
    // Validate minimum number of agents
    if (votes.length < this.minimumAgents) {
      return this.createInsufficientVotesResult(votes);
    }

    const agreeCount = votes.filter(v => v.isApproved).length;
    const disagreeCount = votes.filter(v => !v.isApproved).length;
    const totalVotes = votes.length;
    const agreementRatio = agreeCount / totalVotes;

    // Determine consensus type
    const consensusType = this.determineConsensusType(agreeCount, disagreeCount, totalVotes);

    // Check for divergence
    const divergencePoints = this.detectDivergences(votes);

    // Calculate confidence based on agreement ratio
    const confidence = this.calculateConfidence(agreementRatio, consensusType);

    // Determine if consensus is reached
    const resolved = consensusType === 'unanimous' ||
                     (consensusType === 'majority' && agreementRatio >= this.confidenceThresholds.majority);

    // Build result
    const result: ConsensusResult = {
      approved: resolved && agreeCount > disagreeCount,
      consensusType,
      votes,
      agreeCount,
      disagreeCount,
      divergencePoints,
      resolved,
      confidence
    };

    // If not resolved, generate resolution prompt
    if (!resolved && divergencePoints.length > 0) {
      result.resolutionPrompt = this.generateResolutionPrompt(divergencePoints, votes);
    }

    return result;
  }

  /**
   * Determines the type of consensus based on vote distribution
   */
  private determineConsensusType(
    agreeCount: number,
    disagreeCount: number,
    totalVotes: number
  ): 'unanimous' | 'majority' | 'split' | 'diverged' {
    const agreeRatio = agreeCount / totalVotes;

    // Unanimous: all agents agree
    if (agreeCount === totalVotes || disagreeCount === totalVotes) {
      return 'unanimous';
    }

    // Majority: more than half agree (but not unanimous)
    if (agreeRatio >= this.confidenceThresholds.majority || (1 - agreeRatio) >= this.confidenceThresholds.majority) {
      return 'majority';
    }

    // Split: exactly half/half or near split
    if (Math.abs(agreeCount - disagreeCount) <= 1) {
      return 'split';
    }

    // Diverged: significant disagreement
    return 'diverged';
  }

  /**
   * Detects specific points of divergence between agents
   */
  private detectDivergences(votes: AgentVote[]): DivergencePoint[] {
    const divergences: DivergencePoint[] = [];

    // Group agents by their decision
    const approvers = votes.filter(v => v.isApproved).map(v => v.agent);
    const rejectors = votes.filter(v => !v.isApproved).map(v => v.agent);

    if (approvers.length === 0 || rejectors.length === 0) {
      return divergences; // No divergence if all agree
    }

    // Create main divergence point for the decision
    const mainDivergence: DivergencePoint = {
      topic: 'Decision outcome',
      conflictingAgents: [...approvers, ...rejectors],
      positions: {},
      severity: this.determineSeverity(approvers.length, rejectors.length, votes.length)
    };

    // Add reasoning for each agent
    for (const vote of votes) {
      mainDivergence.positions[vote.agent] = vote.isApproved
        ? `Approved: ${vote.reasoning.substring(0, 100)}...`
        : `Rejected: ${vote.reasoning.substring(0, 100)}...`;
    }

    divergences.push(mainDivergence);

    // Extract additional divergence points from reasoning
    const reasoningDivergences = this.extractReasoningDivergences(votes);
    divergences.push(...reasoningDivergences);

    return divergences;
  }

  /**
   * Extracts specific topic divergences from agent reasoning
   */
  private extractReasoningDivergences(votes: AgentVote[]): DivergencePoint[] {
    const divergences: DivergencePoint[] = [];

    // Common decision topics to check
    const topicKeywords = [
      'security', 'performance', 'correctness', 'feasibility',
      'risk', 'scope', 'priority', 'approach', 'implementation'
    ];

    for (const keyword of topicKeywords) {
      const mentions = this.findKeywordMentions(votes, keyword);

      if (mentions.length >= 2) {
        // Check if agents have conflicting opinions on this topic
        const approvals = mentions.filter(m => m.approved);
        const rejections = mentions.filter(m => !m.approved);

        if (approvals.length > 0 && rejections.length > 0) {
          divergences.push({
            topic: `Topic: ${keyword}`,
            conflictingAgents: mentions.map(m => m.agent),
            positions: Object.fromEntries(mentions.map(m => [m.agent, m.context])),
            severity: 'moderate'
          });
        }
      }
    }

    return divergences;
  }

  /**
   * Finds mentions of a keyword in agent reasoning
   */
  private findKeywordMentions(
    votes: AgentVote[],
    keyword: string
  ): Array<{ agent: string; approved: boolean; context: string }> {
    const mentions: Array<{ agent: string; approved: boolean; context: string }> = [];

    const regex = new RegExp(keyword, 'gi');

    for (const vote of votes) {
      if (regex.test(vote.reasoning)) {
        const contextMatch = vote.reasoning.match(new RegExp(`.{0,50}${keyword}.{0,50}`, 'gi'));
        const context = contextMatch ? contextMatch[0] : vote.reasoning.substring(0, 100);

        mentions.push({
          agent: vote.agent,
          approved: vote.isApproved,
          context
        });
      }
    }

    return mentions;
  }

  /**
   * Determines the severity of divergence
   */
  private determineSeverity(
    approvals: number,
    rejections: number,
    total: number
  ): 'critical' | 'moderate' | 'minor' {
    const ratio = Math.min(approvals, rejections) / total;

    if (ratio >= 0.4) {
      return 'critical';
    }
    if (ratio >= 0.25) {
      return 'moderate';
    }
    return 'minor';
  }

  /**
   * Calculates confidence score based on agreement
   */
  private calculateConfidence(agreementRatio: number, consensusType: string): number {
    let baseConfidence = agreementRatio;

    // Boost confidence for unanimous decisions
    if (consensusType === 'unanimous') {
      baseConfidence = Math.min(baseConfidence + 0.1, 1.0);
    }

    // Reduce confidence for split decisions
    if (consensusType === 'split') {
      baseConfidence = Math.max(baseConfidence - 0.2, 0.0);
    }

    return Math.round(baseConfidence * 100) / 100;
  }

  /**
   * Generates a prompt for resolving divergence
   */
  private generateResolutionPrompt(
    divergencePoints: DivergencePoint[],
    votes: AgentVote[]
  ): string {
    const lines: string[] = [
      '## Divergence Detected - Human Resolution Required',
      '',
      `**Voting Agents:** ${votes.map(v => v.agent).join(', ')}`,
      `**Agreement:** ${votes.filter(v => v.isApproved).length} approve, ${votes.filter(v => !v.isApproved).length} reject`,
      '',
      '### Divergence Points:'
    ];

    for (const point of divergencePoints) {
      lines.push(`- **${point.topic}** (${point.severity})`);
      lines.push(`  Agents: ${point.conflictingAgents.join(', ')}`);

      for (const [agent, position] of Object.entries(point.positions)) {
        lines.push(`  - ${agent}: ${position}`);
      }
    }

    lines.push('');
    lines.push('Please review the conflicting positions above and provide a resolution.');

    return lines.join('\n');
  }

  /**
   * Creates result for insufficient votes
   */
  private createInsufficientVotesResult(votes: AgentVote[]): ConsensusResult {
    return {
      approved: false,
      consensusType: 'diverged',
      votes,
      agreeCount: votes.filter(v => v.isApproved).length,
      disagreeCount: votes.filter(v => !v.isApproved).length,
      divergencePoints: [],
      resolved: false,
      resolutionPrompt: `Insufficient agents for consensus. Need at least ${this.minimumAgents} agents, got ${votes.length}.`,
      confidence: 0
    };
  }

  /**
   * Static method for quick consensus evaluation
   */
  static quickConsensus(votes: AgentVote[]): ConsensusResult {
    const mechanism = new EnsembleVotingMechanism();
    return mechanism.evaluateConsensus(votes);
  }
}
