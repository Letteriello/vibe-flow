// Memory Router - Routes insights to the correct memory level
import { homedir } from 'os';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';

export type InsightCategory =
  | 'global_convention'
  | 'file_type_specific'
  | 'ephemeral_wip'
  | 'isolated_pattern';

export interface MemoryRoute {
  category: InsightCategory;
  destination: string;
  confidence: number;
  reasoning: string;
}

export interface RoutedMemory {
  insights: Array<{
    insight: string;
    route: MemoryRoute;
  }>;
  summary: {
    globalConvention: number;
    fileTypeSpecific: number;
    ephemeralWip: number;
    isolatedPattern: number;
  };
}

export interface AutoMemoryEntry {
  id: string;
  pattern: string;
  context: string;
  occurrences: number;
  createdAt: string;
  lastUsed: string;
}

export interface AutoMemoryStore {
  entries: AutoMemoryEntry[];
  lastUpdated: string;
}

// Pattern matchers for categorization
const GLOBAL_CONVENTION_PATTERNS = [
  /^(always|never|ensure|avoid|use|do not use)\s+.+/i,
  /^(project|codebase|code)\s+(rule|convention|standard|pattern)/i,
  /(typescript|javascript|node|npm|npm|git)\s+(rule|convention|standard)/i,
  /^(import|export|class|interface|type)\s+(must|should|need to)/i,
  /^(follow|adhere to|maintain)\s+.+(convention|standard|pattern)/i,
  /error handling|error-handling/i,
  /best practice/i,
  /coding standard/i,
  /project-wide|across the project/i,
];

const FILE_TYPE_SPECIFIC_PATTERNS = [
  /^(test|tests|spec|testing)\s+(.*)$/i,
  /(test|spec|__tests?__|e2e)\s+(must|should|need|file|for)/i,
  /\.(test|spec|e2e)\.(ts|js)$/i,
  /test.*fixture|fixture.*test/i,
  /mock|stub|spy/i,
  /^src\/.*\.(test|spec)\./i,
  /test runner|test suite/i,
  /\.tsx?$|\.jsx?$/,
  /component|hook|reducer|action/i,
  /controller|service|repository/i,
  /model|schema|entity/i,
  /api|endpoint|route|handler/i,
  /\.scss|\.css|\.less$/i,
  /\.html|\.ejs|\.pug$/i,
];

const EPHEMERAL_WIP_PATTERNS = [
  /\b(WIP|work in progress|in progress|TODO|FIXME|XXX)\b/i,
  /temporary|temp|tmp/i,
  /experimental|prototype|proof of concept/i,
  /draft|stubbed|not ready/i,
  /needs review|pending review|under review/i,
  /will be|to be determined|TBD/i,
  /incomplete|partial implementation/i,
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^\{.*\}$/,
];

const AUTO_MEMORY_FILE = join(homedir(), '.vibe-flow', 'auto-memory.json');

export class MemoryRouter {
  private autoMemory: AutoMemoryStore = {
    entries: [],
    lastUpdated: new Date().toISOString()
  };
  private initialized: boolean = false;

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const content = await fs.readFile(AUTO_MEMORY_FILE, 'utf-8');
      this.autoMemory = JSON.parse(content);
    } catch {
      this.autoMemory = {
        entries: [],
        lastUpdated: new Date().toISOString()
      };
    }

    this.initialized = true;
  }

  private categorizeInsight(insight: string): MemoryRoute {
    const normalizedInsight = insight.trim().toLowerCase();

    // Check for global conventions first (highest priority)
    for (const pattern of GLOBAL_CONVENTION_PATTERNS) {
      if (pattern.test(insight)) {
        return {
          category: 'global_convention',
          destination: 'CLAUDE.md',
          confidence: this.calculateConfidence(pattern, insight, GLOBAL_CONVENTION_PATTERNS),
          reasoning: 'Insight matches global project convention pattern'
        };
      }
    }

    // Check for file-type specific patterns
    for (const pattern of FILE_TYPE_SPECIFIC_PATTERNS) {
      if (pattern.test(insight)) {
        return {
          category: 'file_type_specific',
          destination: '.claude/rules/',
          confidence: this.calculateConfidence(pattern, insight, FILE_TYPE_SPECIFIC_PATTERNS),
          reasoning: 'Insight is specific to a file type or code structure'
        };
      }
    }

    // Check for ephemeral/WIP patterns
    for (const pattern of EPHEMERAL_WIP_PATTERNS) {
      if (pattern.test(insight)) {
        return {
          category: 'ephemeral_wip',
          destination: 'CLAUDE.local.md',
          confidence: this.calculateConfidence(pattern, insight, EPHEMERAL_WIP_PATTERNS),
          reasoning: 'Insight appears to be work-in-progress or ephemeral context'
        };
      }
    }

    // Default to isolated pattern (auto memory)
    return {
      category: 'isolated_pattern',
      destination: 'Auto memory',
      confidence: 0.5,
      reasoning: 'Insight appears to be an isolated pattern without specific categorization'
    };
  }

  private calculateConfidence(
    matchedPattern: RegExp,
    insight: string,
    patternList: RegExp[]
  ): number {
    let baseConfidence = 0.7;

    // Increase confidence based on pattern specificity
    const matchLength = insight.length;
    if (matchLength > 20 && matchLength < 200) {
      baseConfidence += 0.1; // Optimal length for clear insights
    }

    // Add some randomness to break ties (0-0.15)
    baseConfidence += Math.random() * 0.15;

    return Math.min(0.95, baseConfidence);
  }

  private generateInsightId(): string {
    return `insight_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async routeInsights(insights: string[]): Promise<RoutedMemory> {
    await this.initialize();

    const routedInsights: Array<{ insight: string; route: MemoryRoute }> = [];
    const summary = {
      globalConvention: 0,
      fileTypeSpecific: 0,
      ephemeralWip: 0,
      isolatedPattern: 0
    };

    for (const insight of insights) {
      const route = this.categorizeInsight(insight);
      routedInsights.push({ insight, route });

      // Update summary counts
      switch (route.category) {
        case 'global_convention':
          summary.globalConvention++;
          break;
        case 'file_type_specific':
          summary.fileTypeSpecific++;
          break;
        case 'ephemeral_wip':
          summary.ephemeralWip++;
          break;
        case 'isolated_pattern':
          summary.isolatedPattern++;
          // Store in auto memory
          await this.storeInAutoMemory(insight, route.reasoning);
          break;
      }
    }

    return {
      insights: routedInsights,
      summary
    };
  }

  private async storeInAutoMemory(insight: string, context: string): Promise<void> {
    const existingIndex = this.autoMemory.entries.findIndex(
      entry => entry.pattern.toLowerCase() === insight.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Update existing entry
      this.autoMemory.entries[existingIndex].occurrences++;
      this.autoMemory.entries[existingIndex].lastUsed = new Date().toISOString();
    } else {
      // Add new entry
      this.autoMemory.entries.push({
        id: this.generateInsightId(),
        pattern: insight,
        context,
        occurrences: 1,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    }

    await this.saveAutoMemory();
  }

  private async saveAutoMemory(): Promise<void> {
    this.autoMemory.lastUpdated = new Date().toISOString();

    try {
      await fs.mkdir(dirname(AUTO_MEMORY_FILE), { recursive: true });
      await fs.writeFile(AUTO_MEMORY_FILE, JSON.stringify(this.autoMemory, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save auto memory:', error);
    }
  }

  async getAutoMemory(): Promise<AutoMemoryEntry[]> {
    await this.initialize();
    return this.autoMemory.entries;
  }

  async getAutoMemoryByPattern(pattern: string): Promise<AutoMemoryEntry | null> {
    await this.initialize();
    return this.autoMemory.entries.find(
      entry => entry.pattern.toLowerCase() === pattern.toLowerCase()
    ) || null;
  }

  async clearAutoMemory(): Promise<void> {
    this.autoMemory = {
      entries: [],
      lastUpdated: new Date().toISOString()
    };
    await this.saveAutoMemory();
  }
}
