// Project State Classifier - Story 1.2: Detect and classify project state
import { promises as fs } from 'fs';
import { join } from 'path';

export enum ProjectClassification {
  NEW = 'NEW',
  REVERSE_ENGINEERING = 'REVERSE_ENGINEERING',
  IN_PROGRESS = 'IN_PROGRESS'
}

export interface ClassificationResult {
  classification: ProjectClassification;
  confidence: number;
  indicators: string[];
  recommendedPhase: string;
  artifactsFound: string[];
  artifactsMissing: string[];
}

export class ProjectStateClassifier {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Main classification method - determines project state
   * Story 1.2 AC:
   * - Given: directory without bmalph/vibe-flow artifacts → classify as NEW
   * - Given: repository with code but no bmalph artifacts → classify as REVERSE_ENGINEERING
   * - Given: existing progress artifacts → classify as IN_PROGRESS
   */
  async classify(): Promise<ClassificationResult> {
    const vibeFlowDir = join(this.projectPath, '.vibe-flow');
    const bmalphDir = join(this.projectPath, '.bmad');
    const ralphDir = join(this.projectPath, '.ralph');
    const progressJson = join(this.projectPath, 'progress.json');
    const projectContextJson = join(this.projectPath, 'project_context.json');

    const artifactsFound: string[] = [];
    const indicators: string[] = [];

    // Check for vibe-flow artifacts
    try {
      await fs.access(vibeFlowDir);
      artifactsFound.push('.vibe-flow/');
      indicators.push('vibe-flow directory exists');
    } catch {
      // Not found
    }

    // Check for bmalph artifacts
    try {
      await fs.access(bmalphDir);
      artifactsFound.push('.bmad/');
      indicators.push('bmad directory exists');
    } catch {
      // Not found
    }

    // Check for Ralph artifacts
    try {
      await fs.access(ralphDir);
      artifactsFound.push('.ralph/');
      indicators.push('Ralph directory exists');
    } catch {
      // Not found
    }

    // Check for progress.json
    try {
      await fs.access(progressJson);
      artifactsFound.push('progress.json');
      indicators.push('progress.json exists');
    } catch {
      // Not found
    }

    // Check for project_context.json
    try {
      await fs.access(projectContextJson);
      artifactsFound.push('project_context.json');
      indicators.push('project_context.json exists');
    } catch {
      // Not found
    }

    // Check for source code (indicates existing project)
    const hasSourceCode = await this.hasSourceCode();
    if (hasSourceCode) {
      indicators.push('source code detected');
    }

    // Classification logic
    let classification: ProjectClassification;
    let confidence: number;
    let recommendedPhase: string;
    const artifactsMissing: string[] = [];

    if (artifactsFound.length === 0 && !hasSourceCode) {
      // Completely new project - no artifacts, no code
      classification = ProjectClassification.NEW;
      confidence = 1.0;
      recommendedPhase = 'ANALYSIS';
      artifactsMissing.push('.vibe-flow/ state directory', 'progress.json');
    } else if (artifactsFound.length === 0 && hasSourceCode) {
      // Reverse Engineering - has code but no bmalph/vibe-flow
      classification = ProjectClassification.REVERSE_ENGINEERING;
      confidence = 0.85;
      recommendedPhase = 'ANALYSIS';
      artifactsMissing.push('.vibe-flow/ state directory', 'progress.json', 'project_context.json');
    } else if (artifactsFound.length > 0) {
      // In Progress - has artifacts from previous session
      classification = ProjectClassification.IN_PROGRESS;
      confidence = 0.95;
      recommendedPhase = this.inferPhaseFromArtifacts(artifactsFound);
    } else {
      // Default to NEW
      classification = ProjectClassification.NEW;
      confidence = 0.5;
      recommendedPhase = 'ANALYSIS';
    }

    return {
      classification,
      confidence,
      indicators,
      recommendedPhase,
      artifactsFound,
      artifactsMissing
    };
  }

  /**
   * Check if project has source code
   */
  private async hasSourceCode(): Promise<boolean> {
    const codeExtensions = ['.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cs'];
    const codeDirs = ['src', 'lib', 'app', 'packages', 'modules'];

    try {
      // Check for common source directories
      for (const dir of codeDirs) {
        try {
          const dirPath = join(this.projectPath, dir);
          await fs.access(dirPath);
          return true;
        } catch {
          continue;
        }
      }

      // Check for files with code extensions
      const entries = await fs.readdir(this.projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.'));
          if (codeExtensions.includes(ext)) {
            return true;
          }
        }
      }
    } catch {
      // If we can't read the directory, assume no source code
    }

    return false;
  }

  /**
   * Infer current phase from existing artifacts
   */
  private inferPhaseFromArtifacts(artifacts: string[]): string {
    // If has .bmad/ but no .vibe-flow/, likely in BMAD workflow
    if (artifacts.includes('.bmad/') && !artifacts.includes('.vibe-flow/')) {
      return 'ANALYSIS'; // Start fresh with vibe-flow
    }

    // Check for specific phase indicators in progress.json
    // For now, default to ANALYSIS
    return 'ANALYSIS';
  }

  /**
   * Quick check if project is NEW (for startup)
   */
  async isNew(): Promise<boolean> {
    const result = await this.classify();
    return result.classification === ProjectClassification.NEW;
  }

  /**
   * Quick check if project is IN_PROGRESS
   */
  async isInProgress(): Promise<boolean> {
    const result = await this.classify();
    return result.classification === ProjectClassification.IN_PROGRESS;
  }

  /**
   * Quick check if project needs reverse engineering
   */
  async needsReverseEngineering(): Promise<boolean> {
    const result = await this.classify();
    return result.classification === ProjectClassification.REVERSE_ENGINEERING;
  }
}

export default ProjectStateClassifier;
