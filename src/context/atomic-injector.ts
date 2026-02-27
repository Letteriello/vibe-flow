/**
 * Atomic Context Injector
 * Partitions context by state-machine phase to mitigate "context rot"
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Context phases matching state-machine phases
 */
export type ContextPhase = 'analysis' | 'planning' | 'dev' | 'qa' | 'idle';

/**
 * Model tiers for cognitive tiering
 */
export type ModelTier = 'haiku' | 'sonet' | 'opus';

/**
 * Context payload to inject
 */
export interface ContextPayload {
  phase: ContextPhase;
  artifacts: ContextArtifact[];
  totalTokens: number;
  modelTier: ModelTier;
  cachedAt?: number;
}

/**
 * Individual context artifact
 */
export interface ContextArtifact {
  type: 'file' | 'directory' | 'config';
  path: string;
  content: string;
  tokens: number;
  relevance: 'critical' | 'important' | 'optional';
}

/**
 * Phase configuration defining what to inject
 */
export interface PhaseConfig {
  patterns: string[];
  maxTokens: number;
  modelTier: ModelTier;
  relevanceWeights: Record<string, 'critical' | 'important' | 'optional'>;
}

/**
 * Default phase configurations
 */
export const PHASE_CONFIGS: Record<ContextPhase, PhaseConfig> = {
  analysis: {
    patterns: ['CLAUDE.md', 'docs/architecture/*.md'],
    maxTokens: 4000,
    modelTier: 'sonet',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/architecture/overview.md': 'critical',
    }
  },
  planning: {
    patterns: ['CLAUDE.md', 'docs/planning/*.md'],
    maxTokens: 6000,
    modelTier: 'sonet',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/planning/prd.md': 'critical',
    }
  },
  dev: {
    patterns: ['CLAUDE.md', 'src/**/*.ts'],
    maxTokens: 8000,
    modelTier: 'opus',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
    }
  },
  qa: {
    patterns: ['CLAUDE.md', 'docs/planning/qa-report.md'],
    maxTokens: 4000,
    modelTier: 'sonet',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/planning/qa-report.md': 'critical',
    }
  },
  idle: {
    patterns: ['CLAUDE.md'],
    maxTokens: 2000,
    modelTier: 'haiku',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
    }
  }
};

/**
 * Phase Context Cache
 */
export class PhaseContextCache {
  private cache: Map<ContextPhase, ContextPayload> = new Map();
  private ttl: number = 60000;

  get(phase: ContextPhase): ContextPayload | null {
    const payload = this.cache.get(phase);
    if (!payload) return null;
    if (payload.cachedAt && Date.now() - payload.cachedAt > this.ttl) {
      this.cache.delete(phase);
      return null;
    }
    return payload;
  }

  set(phase: ContextPhase, payload: ContextPayload): void {
    this.cache.set(phase, { ...payload, cachedAt: Date.now() });
  }

  invalidate(): void {
    this.cache.clear();
  }

  invalidatePhase(phase: ContextPhase): void {
    this.cache.delete(phase);
  }

  getStats(): { phases: ContextPhase[]; size: number } {
    return {
      phases: Array.from(this.cache.keys()),
      size: this.cache.size
    };
  }

  setTTL(ttl: number): void {
    this.ttl = ttl;
  }
}

const globalCache = new PhaseContextCache();

let projectRoot: string = '';

function resolveProjectRoot(): string {
  if (projectRoot) return projectRoot;
  return process.cwd();
}

function matchesPattern(path: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(path);
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(path, pattern));
}

async function loadArtifactContent(basePath: string, artifactPath: string): Promise<string | null> {
  try {
    const fullPath = join(basePath, artifactPath);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      const files = await readdir(fullPath);
      const contents: string[] = [];
      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.ts')) {
          const filePath = join(fullPath, file);
          const content = await readFile(filePath, 'utf-8');
          contents.push(`// ${artifactPath}/${file}\n${content}`);
        }
      }
      return contents.join('\n\n');
    } else {
      return await readFile(fullPath, 'utf-8');
    }
  } catch {
    return null;
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build context payload for a phase
 */
export async function injectAtomicContext(
  phase: ContextPhase,
  options?: { cache?: boolean; forceRefresh?: boolean; customRoot?: string }
): Promise<ContextPayload> {
  const useCache = options?.cache ?? true;
  const forceRefresh = options?.forceRefresh ?? false;
  const root = options?.customRoot ?? resolveProjectRoot();

  if (useCache && !forceRefresh) {
    const cached = globalCache.get(phase);
    if (cached) return cached;
  }

  const config = PHASE_CONFIGS[phase];
  const artifacts: ContextArtifact[] = [];
  let totalTokens = 0;

  for (const pattern of config.patterns) {
    const content = await loadArtifactContent(root, pattern.replace(/\*\*\/|\*/g, ''));
    if (content) {
      const tokens = estimateTokens(content);
      const relevance = config.relevanceWeights[pattern] || 'optional';
      if (totalTokens + tokens <= config.maxTokens) {
        artifacts.push({
          type: pattern.includes('*') ? 'directory' : 'file',
          path: pattern,
          content,
          tokens,
          relevance
        });
        totalTokens += tokens;
      }
    }
  }

  const payload: ContextPayload = {
    phase,
    artifacts,
    totalTokens,
    modelTier: config.modelTier
  };

  if (useCache) globalCache.set(phase, payload);
  return payload;
}

export function getPhaseContext(phase: ContextPhase): ContextPayload | null {
  return globalCache.get(phase);
}

export function selectModelForPhase(phase: ContextPhase): ModelTier {
  return PHASE_CONFIGS[phase].modelTier;
}

export function getPhaseConfig(phase: ContextPhase): PhaseConfig {
  return PHASE_CONFIGS[phase];
}

export function getGlobalCache(): PhaseContextCache {
  return globalCache;
}

export function invalidateAllCaches(): void {
  globalCache.invalidate();
}

export { PhaseContextCache as AtomicContextCache };
