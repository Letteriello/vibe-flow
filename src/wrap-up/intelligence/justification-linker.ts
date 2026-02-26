/**
 * JustificationLinker - Liga justificativas a decisões e artefatos
 */
export interface Justification {
  id: string;
  targetId: string;
  targetType: 'decision' | 'artifact' | 'action';
  rationale: string;
  evidence: string[];
  confidence: number;
}

export interface JustificationLink {
  sourceId: string;
  targetId: string;
  relationship: string;
  weight: number;
}

export class JustificationLinker {
  private justifications: Justification[];
  private links: JustificationLink[];

  constructor() {
    this.justifications = [];
    this.links = [];
  }

  async link(sessionData: Record<string, unknown>): Promise<JustificationLink[]> {
    const decisions = (sessionData.decisions as Record<string, unknown>[]) || [];
    const artifacts = (sessionData.artifacts as Record<string, unknown>[]) || [];

    for (const decision of decisions) {
      const id = (decision.id as string) || `dec_${this.justifications.length}`;
      const rationale = (decision.rationale as string) || '';

      this.justifications.push({
        id,
        targetId: id,
        targetType: 'decision',
        rationale,
        evidence: this.extractEvidence(rationale),
        confidence: (decision.confidence as number) || 0.5,
      });

      for (const artifact of artifacts) {
        const artifactId = (artifact.id as string) || '';
        if (rationale.toLowerCase().includes(artifactId.toLowerCase()) ||
            rationale.toLowerCase().includes((artifact.name as string) || '')) {
          this.links.push({
            sourceId: id,
            targetId: artifactId,
            relationship: 'justified_by',
            weight: 0.8,
          });
        }
      }
    }

    return this.links;
  }

  private extractEvidence(text: string): string[] {
    const evidence: string[] = [];
    const patterns = [
      /(?:because|since|due to|owing to) (.+?)(?:\.|$)/gi,
      /(?:evidence|proof|support)[:\s]+(.+?)(?:\.|$)/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          evidence.push(match[1].trim());
        }
      }
    }

    return evidence;
  }

  getJustifications(): Justification[] {
    return this.justifications;
  }

  getLinks(): JustificationLink[] {
    return this.links;
  }
}
