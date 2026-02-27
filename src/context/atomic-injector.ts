/**
 * Atomic Context Injector
 * Partitions context by state-machine phase to mitigate "context rot"
 * and reduce token waste in LLM calls
 */

import { readFile, readdir, stat } from 'fs/promises';
import { readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { estimateTokens } from '../utils/token-estimation.js';

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
    patterns: ['CLAUDE.md', 'docs/architecture/*.md', 'docs/flow/analyze/*.md'],
    maxTokens: 4000,
    modelTier: 'sonet',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/architecture/overview.md': 'critical',
      'docs/architecture/diagnostics.md': 'important',
    }
  },
  planning: {
    patterns: ['CLAUDE.md', 'docs/planning/*.md', 'docs/flow/plan/**/*.md'],
    maxTokens: 6000,
    modelTier: 'sonet',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/planning/prd.md': 'critical',
      'docs/flow/plan/*/prd.md': 'critical',
    }
  },
  dev: {
    patterns: ['CLAUDE.md', 'docs/flow/dev/*.md', 'src/**/*'],
    maxTokens: 8000,
    modelTier: 'opus',
    relevanceWeights: {
      'CLAUDE.md': 'critical',
      'docs/flow/dev/*.md': 'important',
    }
  },
  qa: {
    patterns: ['CLAUDE.md', 'docs/planning/qa-report.md', 'docs/flow/qa/*.md'],
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
  private ttl: number = 60000; // 1 minute default

  /**
   * Get cached context for phase
   */
  get(phase: ContextPhase): ContextPayload | null {
    const payload = this.cache.get(phase);
    if (!payload) return null;

    // Check TTL
    if (payload.cachedAt && Date.now() - payload.cachedAt > this.ttl) {
      this.cache.delete(phase);
      return null;
    }

    return payload;
  }

  /**
   * Set context for phase
   */
  set(phase: ContextPhase, payload: ContextPayload): void {
    this.cache.set(phase, {
      ...payload,
      cachedAt: Date.now()
    });
  }

  /**
   * Invalidate all cached context
   */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Invalidate specific phase
   */
  invalidatePhase(phase: ContextPhase): void {
    this.cache.delete(phase);
  }

  /**
   * Get cache stats
   */
  getStats(): { phases: ContextPhase[]; size: number } {
    return {
      phases: Array.from(this.cache.keys()),
      size: this.cache.size
    };
  }

  /**
   * Set TTL
   */
  setTTL(ttl: number): void {
    this.ttl = ttl;
  }
}

// Global cache instance
const globalCache = new PhaseContextCache();

/**
 * Project root path (resolved at runtime)
 */
let projectRoot: string = '';

/**
 * Resolve project root from module location
 */
function resolveProjectRoot(): string {
  if (projectRoot) return projectRoot;

  // Try to find project root by looking for package.json
  let current = fileURLToPath(import.meta.url);

  // Walk up to find package.json
  for (let i = 0; i < 10; i++) {
    try {
      const files = readdirSync(current);
      if (files.includes('package.json')) {
        projectRoot = current;
        return projectRoot;
      }
    } catch {
      // Continue walking up
    }
    current = join(current, '..');
  }

  // Fallback to process cwd
  return process.cwd();
}

/**
 * Check if path matches glob pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Simple glob matching
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(path);
}

/**
 * Check if path matches any pattern
 */
function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(path, pattern));
}

/**
 * Load artifact content
 */
async function loadArtifactContent(basePath: string, artifactPath: string): Promise<string | null> {
  try {
    const fullPath = join(basePath, artifactPath);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      // Load all files in directory
      const files = await readdir(fullPath);
      const contents: string[] = [];

      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.ts') || file === 'package.json') {
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

  // Check cache first
  if (useCache && !forceRefresh) {
    const cached = globalCache.get(phase);
    if (cached) {
      return cached;
    }
  }

  const config = PHASE_CONFIGS[phase];
  const artifacts: ContextArtifact[] = [];
  let totalTokens = 0;

  // Load matching artifacts
  for (const pattern of config.patterns) {
    const content = await loadArtifactContent(root, pattern.replace(/\*\*\/|\*/g, ''));
    if (content) {
      const tokens = estimateTokens(content);
      const relevance = config.relevanceWeights[pattern] || 'optional';

      // Check token budget
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

  // Cache if enabled
  if (useCache) {
    globalCache.set(phase, payload);
  }

  return payload;
}

/**
 * Get cached context (no computation)
 */
export function getPhaseContext(phase: ContextPhase): ContextPayload | null {
  return globalCache.get(phase);
}

/**
 * Select model tier based on phase (cognitive tiering)
 */
export function selectModelForPhase(phase: ContextPhase): ModelTier {
  return PHASE_CONFIGS[phase].modelTier;
}

/**
 * Get phase configuration
 */
export function getPhaseConfig(phase: ContextPhase): PhaseConfig {
  return PHASE_CONFIGS[phase];
}

/**
 * Get global cache instance
 */
export function getGlobalCache(): PhaseContextCache {
  return globalCache;
}

/**
 * Invalidate all caches
 */
export function invalidateAllCaches(): void {
  globalCache.invalidate();
}

// Backward compatibility alias
export { PhaseContextCache as AtomicContextCache };
