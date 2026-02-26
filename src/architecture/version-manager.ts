// Specification Version Manager
// Story 8.4: Specification Versioning

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { ArchitectureSpec, SpecVersion } from './types.js';

const VERSION_FILE = join(homedir(), '.vibe-flow', 'spec-versions.json');

// In-memory cache
let versionCache: Map<string, SpecVersion[]> = new Map();

export class SpecVersionManager {
  /**
   * Create a new version of a specification
   */
  static async createVersion(spec: ArchitectureSpec, changelog: string, author?: string): Promise<SpecVersion> {
    // Generate version number
    const versions = await this.getVersions(spec.id);
    const versionNumber = this.incrementVersion(versions);

    const version: SpecVersion = {
      id: uuidv4(),
      specId: spec.id,
      version: versionNumber,
      changelog,
      createdAt: new Date().toISOString(),
      author,
      snapshot: JSON.stringify(spec)
    };

    // Add to cache
    versions.push(version);
    versionCache.set(spec.id, versions);

    // Persist
    await this.persist();

    return version;
  }

  /**
   * Get all versions for a specification
   */
  static async getVersions(specId: string): Promise<SpecVersion[]> {
    await this.load();

    return versionCache.get(specId) || [];
  }

  /**
   * Get a specific version
   */
  static async getVersion(specId: string, version: string): Promise<SpecVersion | undefined> {
    const versions = await this.getVersions(specId);
    return versions.find(v => v.version === version);
  }

  /**
   * Get the latest version
   */
  static async getLatestVersion(specId: string): Promise<SpecVersion | undefined> {
    const versions = await this.getVersions(specId);
    return versions[versions.length - 1];
  }

  /**
   * Restore a specification from a version
   */
  static async restoreVersion(specId: string, version: string): Promise<ArchitectureSpec | undefined> {
    const versionData = await this.getVersion(specId, version);

    if (!versionData) {
      return undefined;
    }

    return JSON.parse(versionData.snapshot);
  }

  /**
   * Compare two versions
   */
  static async compareVersions(specId: string, version1: string, version2: string): Promise<{
    version1: SpecVersion | undefined;
    version2: SpecVersion | undefined;
    changes: string[];
  }> {
    const v1 = await this.getVersion(specId, version1);
    const v2 = await this.getVersion(specId, version2);

    const changes: string[] = [];

    if (v1 && v2) {
      if (v1.version !== v2.version) {
        changes.push(`Version changed from ${v1.version} to ${v2.version}`);
      }
      if (v1.changelog !== v2.changelog) {
        changes.push(`Changelog updated`);
      }
    }

    return { version1: v1, version2: v2, changes };
  }

  /**
   * List all specifications with versions
   */
  static async listAllSpecs(): Promise<string[]> {
    await this.load();
    return Array.from(versionCache.keys());
  }

  /**
   * Delete old versions (keep last N)
   */
  static async pruneVersions(specId: string, keepLast: number = 10): Promise<void> {
    const versions = await this.getVersions(specId);

    if (versions.length <= keepLast) {
      return;
    }

    const toKeep = versions.slice(-keepLast);
    versionCache.set(specId, toKeep);

    await this.persist();
  }

  /**
   * Increment version number
   */
  private static incrementVersion(versions: SpecVersion[]): string {
    if (versions.length === 0) {
      return '1.0.0';
    }

    const latest = versions[versions.length - 1];
    const parts = latest.version.split('.').map(Number);

    // Increment patch version
    parts[2]++;

    // If patch > 9, increment minor
    if (parts[2] > 9) {
      parts[2] = 0;
      parts[1]++;
    }

    // If minor > 9, increment major
    if (parts[1] > 9) {
      parts[1] = 0;
      parts[0]++;
    }

    return parts.join('.');
  }

  /**
   * Load versions from disk
   */
  private static async load(): Promise<void> {
    if (versionCache.size > 0) return;

    try {
      const content = await fs.readFile(VERSION_FILE, 'utf-8');
      const data = JSON.parse(content);

      for (const [specId, versions] of Object.entries(data)) {
        versionCache.set(specId, versions as SpecVersion[]);
      }
    } catch {
      // File doesn't exist yet - start with empty cache
    }
  }

  /**
   * Persist versions to disk
   */
  private static async persist(): Promise<void> {
    const data: Record<string, SpecVersion[]> = {};

    for (const [specId, versions] of versionCache.entries()) {
      data[specId] = versions;
    }

    const dir = dirname(VERSION_FILE);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(VERSION_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
}
