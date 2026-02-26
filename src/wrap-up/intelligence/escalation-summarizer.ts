/**
 * EscalationSummarizer - Resume eventos de escalação da sessão
 */
export interface EscalationEvent {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  resolution?: string;
}

export interface EscalationSummary {
  totalEscalations: number;
  bySeverity: Record<string, number>;
  events: EscalationEvent[];
  resolutionRate: number;
}

export class EscalationSummarizer {
  private escalations: EscalationEvent[];

  constructor() {
    this.escalations = [];
  }

  async summarize(sessionData: Record<string, unknown>): Promise<EscalationSummary> {
    const events = (sessionData.escalations as Record<string, unknown>[]) || [];
    this.escalations = events.map(e => this.parseEscalation(e));

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const esc of this.escalations) {
      bySeverity[esc.severity]++;
    }

    const resolved = this.escalations.filter(e => e.resolution).length;
    const resolutionRate = this.escalations.length > 0
      ? resolved / this.escalations.length
      : 0;

    return {
      totalEscalations: this.escalations.length,
      bySeverity,
      events: this.escalations,
      resolutionRate,
    };
  }

  private parseEscalation(data: Record<string, unknown>): EscalationEvent {
    return {
      id: (data.id as string) || `esc_${Date.now()}`,
      timestamp: (data.timestamp as number) || Date.now(),
      severity: (data.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium',
      type: (data.type as string) || 'unknown',
      description: (data.description as string) || '',
      resolution: data.resolution as string | undefined,
    };
  }

  getEscalations(): EscalationEvent[] {
    return this.escalations;
  }
}
