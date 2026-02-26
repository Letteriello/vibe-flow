import { createHash } from 'crypto';

export interface ProposedArtifact {
  content: unknown;
  metadata?: Record<string, unknown>;
  version?: string;
}

export interface SealedArtifact {
  id: string;
  originalContent: unknown;
  sealedContent: unknown;
  timestamp: string;
  hash: string;
  algorithm: string;
  status: 'Immutable';
  metadata?: Record<string, unknown>;
}

export interface SealingResult {
  success: boolean;
  artifact?: SealedArtifact;
  error?: string;
}

function generateId(): string {
  return `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function computeHash(content: unknown, algorithm: string = 'sha256'): string {
  const jsonContent = JSON.stringify(content);
  return createHash(algorithm).update(jsonContent, 'utf8').digest('hex');
}

function validateProposedArtifact(artifact: ProposedArtifact): void {
  if (artifact === null || artifact === undefined) {
    throw new Error('Proposed artifact cannot be null or undefined');
  }

  if (artifact.content === undefined) {
    throw new Error('Proposed artifact must have content property');
  }

  if (typeof artifact.content === 'undefined') {
    throw new Error('Content cannot be undefined');
  }
}

export class ArtifactSealer {
  private algorithm: string;

  constructor(algorithm: string = 'sha256') {
    this.algorithm = algorithm;
  }

  sealSessionArtifacts(proposedArtifact: ProposedArtifact): SealedArtifact {
    validateProposedArtifact(proposedArtifact);

    const timestamp = new Date().toISOString();

    const contentAsObject = typeof proposedArtifact.content === 'object' && proposedArtifact.content !== null
      ? proposedArtifact.content
      : {};

    const sealedContent = {
      ...contentAsObject,
      _sealed: true,
      _sealedAt: timestamp,
    };

    const hash = computeHash(sealedContent, this.algorithm);

    const sealedArtifact: SealedArtifact = {
      id: generateId(),
      originalContent: proposedArtifact.content,
      sealedContent,
      timestamp,
      hash,
      algorithm: this.algorithm,
      status: 'Immutable',
      metadata: proposedArtifact.metadata,
    };

    return sealedArtifact;
  }

  verifySealedArtifact(artifact: SealedArtifact): boolean {
    if (artifact.status !== 'Immutable') {
      return false;
    }

    const currentHash = computeHash(artifact.sealedContent, artifact.algorithm);
    return currentHash === artifact.hash;
  }

  sealMultipleArtifacts(artifacts: ProposedArtifact[]): SealedArtifact[] {
    return artifacts.map((artifact) => this.sealSessionArtifacts(artifact));
  }
}

export function sealSessionArtifacts(proposedArtifact: ProposedArtifact): SealedArtifact {
  const sealer = new ArtifactSealer();
  return sealer.sealSessionArtifacts(proposedArtifact);
}

export function verifyArtifact(artifact: SealedArtifact): boolean {
  const sealer = new ArtifactSealer(artifact.algorithm);
  return sealer.verifySealedArtifact(artifact);
}
