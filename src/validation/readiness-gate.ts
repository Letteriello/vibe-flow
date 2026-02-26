// Specification Readiness Gate - Story 3.3: Block implementation until specs are complete
import { promises as fs } from 'fs';
import { join } from 'path';
import { Phase } from '../state-machine/index.js';

export interface ReadinessResult {
  ready: boolean;
  readinessScore: number; // 0-100
  blockers: string[];
  warnings: string[];
  summary: string;
}

export interface ArtifactCheck {
  name: string;
  path: string;
  required: boolean;
  exists: boolean;
  qualityNotes?: string;
}

/**
 * Story 3.3: Specification Readiness Gate
 * AC:
 * - Given: request to advance to Implementation phase
 * - When: readiness gate evaluates context
 * - Then: checks PRD, Architecture, Epics/Stories for completeness
 * - Given: readiness ≥ 80%
 * - When: all checks pass
 * - Then: allows transition to Implementation with READY_FOR_IMPLEMENTATION status
 * - Given: readiness < 80% or FRs without AC
 * - When: gate is consulted
 * - Then: blocks with SPECIFICATION_NOT_READY error listing what's missing
 */
export class SpecificationReadinessGate {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Check if specification is ready for implementation
   * Story 3.3 AC: Gate evaluates PRD, Architecture, Epics/Stories
   */
  async checkReadiness(): Promise<ReadinessResult> {
    const artifacts: ArtifactCheck[] = [];

    // Check PRD (Product Requirements Document)
    const prdCheck = await this.checkArtifact('.bmad/prd.md', 'PRD', true);
    artifacts.push(prdCheck);

    // Check Architecture
    const archCheck = await this.checkArtifact('.bmad/architecture.md', 'Architecture', true);
    artifacts.push(archCheck);

    // Check Epics/Stories
    const epicsCheck = await this.checkArtifact('.bmad/epics.md', 'Epics & Stories', true);
    artifacts.push(epicsCheck);

    // Check UX Design (optional)
    const uxCheck = await this.checkArtifact('.bmad/ux-design.md', 'UX Design', false);
    artifacts.push(uxCheck);

    // Check Brief (optional but recommended)
    const briefCheck = await this.checkArtifact('.bmad/brief.md', 'Project Brief', false);
    artifacts.push(briefCheck);

    // Calculate readiness score
    const { score, blockers, warnings } = this.calculateReadiness(artifacts);

    const ready = blockers.length === 0 && score >= 80;

    return {
      ready,
      readinessScore: score,
      blockers,
      warnings,
      summary: ready
        ? 'SPECIFICATION_READY_FOR_IMPLEMENTATION'
        : 'SPECIFICATION_NOT_READY'
    };
  }

  /**
   * Check a specific artifact
   */
  private async checkArtifact(
    relativePath: string,
    name: string,
    required: boolean
  ): Promise<ArtifactCheck> {
    const fullPath = join(this.projectPath, relativePath);

    let exists = false;
    let qualityNotes: string | undefined;

    try {
      await fs.access(fullPath);
      exists = true;

      // Basic quality check - file should have substantial content
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0).length;

      if (lines < 10) {
        qualityNotes = `File exists but has only ${lines} lines - may be incomplete`;
      }
    } catch {
      exists = false;
    }

    return {
      name,
      path: relativePath,
      required,
      exists,
      qualityNotes
    };
  }

  /**
   * Calculate readiness score based on artifacts
   */
  private calculateReadiness(artifacts: ArtifactCheck[]): {
    score: number;
    blockers: string[];
    warnings: string[];
  } {
    let score = 0;
    const blockers: string[] = [];
    const warnings: string[] = [];

    for (const artifact of artifacts) {
      if (artifact.required) {
        if (artifact.exists) {
          score += 25; // Each required artifact is worth 25 points (4 required = 100)
          if (artifact.qualityNotes) {
            warnings.push(`${artifact.name}: ${artifact.qualityNotes}`);
          }
        } else {
          blockers.push(`Missing required artifact: ${artifact.name} (${artifact.path})`);
        }
      } else {
        // Optional artifacts add to score but not required
        if (artifact.exists) {
          score += 10;
        }
      }
    }

    // Cap score at 100
    score = Math.min(score, 100);

    return { score, blockers, warnings };
  }

  /**
   * Check if can transition to Implementation
   * Story 3.3 AC: Blocks transition if readiness < 80%
   */
  async canTransitionToImplementation(): Promise<{ allowed: boolean; reason?: string }> {
    const readiness = await this.checkReadiness();

    if (!readiness.ready) {
      return {
        allowed: false,
        reason: `SPECIFICATION_NOT_READY: ${readiness.blockers.join(', ')}`
      };
    }

    return { allowed: true };
  }

  /**
   * Get detailed readiness report
   */
  async getDetailedReport(): Promise<string> {
    const readiness = await this.checkReadiness();

    let report = `# Specification Readiness Report\n\n`;
    report += `**Status:** ${readiness.summary}\n`;
    report += `**Readiness Score:** ${readiness.readinessScore}%\n\n`;

    if (readiness.blockers.length > 0) {
      report += `## Blockers\n\n`;
      for (const blocker of readiness.blockers) {
        report += `- ❌ ${blocker}\n`;
      }
      report += '\n';
    }

    if (readiness.warnings.length > 0) {
      report += `## Warnings\n\n`;
      for (const warning of readiness.warnings) {
        report += `- ⚠️ ${warning}\n`;
      }
      report += '\n';
    }

    if (readiness.ready) {
      report += `## ✅ Ready for Implementation\n\n`;
      report += `All required specifications are in place. You can proceed to the Implementation phase.\n`;
    } else {
      report += `## Next Steps\n\n`;
      report += `Complete the following before proceeding to Implementation:\n`;
      for (const blocker of readiness.blockers) {
        report += `- ${blocker}\n`;
      }
    }

    return report;
  }
}

export default SpecificationReadinessGate;
