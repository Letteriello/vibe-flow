// Memory Module - Stores and retrieves learned lessons
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface LearnedLesson {
  id: string;
  pattern: string;
  lesson: string;
  source: 'error' | 'decision' | 'correction' | 'pattern';
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  metadata?: Record<string, string>;
}

export interface MemoryStore {
  lessons: LearnedLesson[];
  lastUpdated: string;
}

const MEMORY_FILE = join(homedir(), '.vibe-flow', 'memory.json');

export class Memory {
  private store: MemoryStore = {
    lessons: [],
    lastUpdated: new Date().toISOString()
  };
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(dirname(MEMORY_FILE), { recursive: true });
      const content = await fs.readFile(MEMORY_FILE, 'utf-8');
      this.store = JSON.parse(content);
    } catch {
      // File doesn't exist, use default store
      this.store = {
        lessons: [],
        lastUpdated: new Date().toISOString()
      };
    }

    this.initialized = true;
  }

  async save(): Promise<void> {
    this.store.lastUpdated = new Date().toISOString();
    await fs.writeFile(MEMORY_FILE, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  async addLesson(
    pattern: string,
    lesson: string,
    source: LearnedLesson['source']
  ): Promise<void> {
    await this.initialize();

    // Check if pattern already exists
    const existing = this.store.lessons.find(l => l.pattern === pattern);

    if (existing) {
      existing.occurrences += 1;
      existing.lastSeen = new Date().toISOString();
      existing.lesson = lesson; // Update with latest lesson
    } else {
      const newLesson: LearnedLesson = {
        id: `lesson-${Date.now()}`,
        pattern,
        lesson,
        source,
        occurrences: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      this.store.lessons.push(newLesson);
    }

    await this.save();
  }

  async getLessons(): Promise<LearnedLesson[]> {
    await this.initialize();
    return this.store.lessons;
  }

  async getLessonsByPattern(pattern: string): Promise<LearnedLesson[]> {
    await this.initialize();
    return this.store.lessons.filter(l => l.pattern.includes(pattern));
  }

  async getRecentLessons(limit: number = 10): Promise<LearnedLesson[]> {
    await this.initialize();
    return [...this.store.lessons]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, limit);
  }

  async exportToClaudeRules(projectRoot: string): Promise<string[]> {
    await this.initialize();

    const rulesDir = join(projectRoot, '.claude', 'rules');
    const exportedFiles: string[] = [];

    try {
      await fs.mkdir(rulesDir, { recursive: true });

      // Export high-occurrence lessons as rules
      const significantLessons = this.store.lessons.filter(l => l.occurrences >= 2);

      if (significantLessons.length > 0) {
        const rulesFile = join(rulesDir, 'auto-generated-lessons.md');
        const content = this.generateRulesMarkdown(significantLessons);
        await fs.writeFile(rulesFile, content, 'utf-8');
        exportedFiles.push(rulesFile);
      }

      // Also export to CLAUDE.local.md if it exists
      const localMdPath = join(projectRoot, 'CLAUDE.local.md');
      try {
        await fs.access(localMdPath);
        const existingContent = await fs.readFile(localMdPath, 'utf-8');
        const updatedContent = this.appendLessonsToLocalMd(existingContent, significantLessons);
        await fs.writeFile(localMdPath, updatedContent, 'utf-8');
        exportedFiles.push(localMdPath);
      } catch {
        // CLAUDE.local.md doesn't exist, create it with lessons
        const localMdContent = this.generateLocalMd(significantLessons);
        await fs.writeFile(localMdPath, localMdContent, 'utf-8');
        exportedFiles.push(localMdPath);
      }
    } catch (error) {
      console.error('[Memory] Failed to export to Claude rules:', error);
    }

    return exportedFiles;
  }

  private generateRulesMarkdown(lessons: LearnedLesson[]): string {
    const lines = [
      '# Auto-Generated Lessons',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Learned Patterns',
      ''
    ];

    for (const lesson of lessons) {
      lines.push(`### ${lesson.pattern}`);
      lines.push('');
      lines.push(`- **Lesson:** ${lesson.lesson}`);
      lines.push(`- **Source:** ${lesson.source}`);
      lines.push(`- **Occurrences:** ${lesson.occurrences}`);
      lines.push(`- **Last seen:** ${lesson.lastSeen}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private appendLessonsToLocalMd(existingContent: string, lessons: LearnedLesson[]): string {
    const lines = existingContent.split('\n');

    // Find the last occurrence of Auto-Learned Lessons section or end of file
    let insertIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('## Auto-Learned Lessons')) {
        insertIndex = i + 1;
        break;
      }
    }

    // Check if we already have lessons listed after Auto-Learned Lessons
    const existingLessonLines: string[] = [];
    for (let i = insertIndex; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) break;
      if (lines[i].trim()) existingLessonLines.push(lines[i]);
    }

    const lessonSection = [
      ...(existingLessonLines.length > 0 ? [] : ['']),
      ...lessons.map(l => `- ${l.pattern}: ${l.lesson}`)
    ];

    if (insertIndex < lines.length) {
      lines.splice(insertIndex, 0, ...lessonSection);
    } else {
      lines.push(...lessonSection);
    }
    return lines.join('\n');
  }

  private generateLocalMd(lessons: LearnedLesson[]): string {
    const lines = [
      '# CLAUDE.local.md',
      '',
      'Auto-generated lessons from vibe-flow sessions',
      '',
      '## Auto-Learned Lessons',
      ''
    ];

    for (const lesson of lessons) {
      lines.push(`### ${lesson.pattern}`);
      lines.push(`${lesson.lesson}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  async clear(): Promise<void> {
    this.store = {
      lessons: [],
      lastUpdated: new Date().toISOString()
    };
    await this.save();
  }
}

// Singleton instance
let memory: Memory | null = null;

export function getMemory(): Memory {
  if (!memory) {
    memory = new Memory();
  }
  return memory;
}
