// Context Memory Persistence - Story 9.1: Persist project context between sessions
// AC: Dado projeto em andamento, Quando sessão termina, Então contexto é salvo automaticamente,
//     E quando nova sessão inicia, Então contexto é restaurado completamente, E usuário pode continuar de onde parou

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { ContextEntry, ContextSnapshot, ContextOptions } from './types.js';

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Story 9.1: Context Memory Persistence
 *
 * Provides session-to-session context persistence:
 * - Saves context when session ends
 * - Restores context when new session starts
 * - User can continue from where they left off
 */
export class ContextMemory {
  private options: Required<ContextOptions>;
  private contextPath: string;
  private entries: ContextEntry[] = [];
  private dirty: boolean = false;

  constructor(options: ContextOptions) {
    this.options = {
      projectId: options.projectId,
      projectPath: options.projectPath,
      maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      autoSave: options.autoSave ?? true
    };

    this.contextPath = join(
      options.projectPath,
      '.bmad',
      'context',
      `${options.projectId}.json`
    );
  }

  /**
   * Load context from disk
   */
  async load(): Promise<ContextEntry[]> {
    try {
      if (existsSync(this.contextPath)) {
        const content = await fs.readFile(this.contextPath, 'utf-8');
        const data = JSON.parse(content);
        this.entries = data.entries || [];
        console.log(`[ContextMemory] Loaded ${this.entries.length} context entries`);
        return this.entries;
      }
    } catch (error) {
      console.error(`[ContextMemory] Failed to load context:`, error);
    }

    this.entries = [];
    return this.entries;
  }

  /**
   * Save context to disk
   */
  async save(): Promise<void> {
    if (!this.dirty && this.entries.length > 0) {
      return;
    }

    try {
      // Ensure directory exists
      await fs.mkdir(dirname(this.contextPath), { recursive: true });

      const snapshot: ContextSnapshot = {
        id: `snapshot-${Date.now()}`,
        projectId: this.options.projectId,
        entries: this.entries,
        size: JSON.stringify(this.entries).length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(this.contextPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      this.dirty = false;
      console.log(`[ContextMemory] Saved ${this.entries.length} context entries`);
    } catch (error) {
      console.error(`[ContextMemory] Failed to save context:`, error);
      throw error;
    }
  }

  /**
   * Add a new entry to context
   */
  async addEntry(entry: Omit<ContextEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContextEntry> {
    const now = new Date().toISOString();
    const newEntry: ContextEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: now,
      updatedAt: now
    };

    this.entries.push(newEntry);
    this.dirty = true;

    // Check if we need to trim
    if (this.entries.length > this.options.maxEntries) {
      await this.trimEntries();
    }

    // Auto-save if enabled
    if (this.options.autoSave) {
      await this.save();
    }

    return newEntry;
  }

  /**
   * Update an existing entry
   */
  async updateEntry(id: string, updates: Partial<ContextEntry>): Promise<ContextEntry | null> {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) {
      return null;
    }

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.dirty = true;

    if (this.options.autoSave) {
      await this.save();
    }

    return this.entries[index];
  }

  /**
   * Get an entry by ID
   */
  getEntry(id: string): ContextEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  /**
   * Get all entries of a specific type
   */
  getEntriesByType(type: ContextEntry['type']): ContextEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  /**
   * Search entries by content
   */
  search(query: string): ContextEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.entries.filter(e =>
      e.content.toLowerCase().includes(lowerQuery) ||
      JSON.stringify(e.metadata).toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get all entries
   */
  getAllEntries(): ContextEntry[] {
    return [...this.entries];
  }

  /**
   * Get context size
   */
  getSize(): number {
    return JSON.stringify(this.entries).length;
  }

  /**
   * Trim entries if exceeding max
   */
  private async trimEntries(): Promise<void> {
    // Keep the most recent entries
    const toRemove = this.entries.length - this.options.maxEntries;
    if (toRemove > 0) {
      // Keep the last maxEntries entries (most recent)
      this.entries = this.entries.slice(-this.options.maxEntries);
      console.log(`[ContextMemory] Trimmed ${toRemove} older entries`);
    }
  }

  /**
   * Clear all context
   */
  async clear(): Promise<void> {
    this.entries = [];
    this.dirty = true;
    await this.save();
  }

  /**
   * Get context summary
   */
  getSummary(): {
    totalEntries: number;
    byType: Record<string, number>;
    size: number;
    lastUpdated: string | null;
  } {
    const byType: Record<string, number> = {};
    let lastUpdated: string | null = null;

    for (const entry of this.entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      if (!lastUpdated || entry.updatedAt > lastUpdated) {
        lastUpdated = entry.updatedAt;
      }
    }

    return {
      totalEntries: this.entries.length,
      byType,
      size: this.getSize(),
      lastUpdated
    };
  }

  /**
   * Export context to a portable format
   */
  async export(): Promise<string> {
    if (this.dirty) {
      await this.save();
    }
    return JSON.stringify({
      projectId: this.options.projectId,
      exportedAt: new Date().toISOString(),
      entries: this.entries
    }, null, 2);
  }

  /**
   * Import context from a portable format
   */
  async import(data: string): Promise<void> {
    try {
      const parsed = JSON.parse(data);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        this.entries = parsed.entries;
        this.dirty = true;
        await this.save();
        console.log(`[ContextMemory] Imported ${this.entries.length} entries`);
      }
    } catch (error) {
      console.error(`[ContextMemory] Failed to import context:`, error);
      throw error;
    }
  }
}

/**
 * Convenience function to create context memory
 */
export function createContextMemory(options: ContextOptions): ContextMemory {
  return new ContextMemory(options);
}

/**
 * Convenience function to load project context
 */
export async function loadProjectContext(
  projectPath: string,
  projectId: string
): Promise<ContextEntry[]> {
  const memory = new ContextMemory({
    projectId,
    projectPath,
    autoSave: false
  });

  return memory.load();
}

/**
 * Convenience function to save project context
 */
export async function saveProjectContext(
  projectPath: string,
  projectId: string,
  entries: ContextEntry[]
): Promise<void> {
  const memory = new ContextMemory({
    projectId,
    projectPath,
    autoSave: true
  });

  for (const entry of entries) {
    await memory.addEntry(entry);
  }

  await memory.save();
}
