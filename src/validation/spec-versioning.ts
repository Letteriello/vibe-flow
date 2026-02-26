// Specification Versioning - Story 8.4: Version specifications over time
// AC: Dado spec existente modificada, Quando versionamento executa,
//     Então cria nova versão com timestamp, E mantém histórico de versões,
//     E permite comparação entre versões, E permite rollback se necessário

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface SpecVersion {
  version: string;
  timestamp: string;
  author?: string;
  message: string;
  diff?: string;
  path: string;
}

export interface SpecVersionHistory {
  specName: string;
  currentVersion: string;
  versions: SpecVersion[];
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  summary: string;
}

export interface VersionChange {
  type: 'added' | 'removed' | 'modified';
  section?: string;
  content: string;
}

export interface SpecVersioningOptions {
  projectPath: string;
  specName?: string;
  specPath?: string;
  author?: string;
}

/**
 * Story 8.4: Specification Versioning
 *
 * Provides versioning for specifications:
 * - Creates new version with timestamp
 * - Maintains version history
 * - Allows comparison between versions
 * - Supports rollback
 */
export class SpecVersioning {
  private options: Required<SpecVersioningOptions>;
  private versionsDir: string;

  constructor(options: SpecVersioningOptions) {
    this.options = {
      projectPath: options.projectPath,
      specName: options.specName || 'spec',
      specPath: options.specPath || this.findSpecFile(options.projectPath),
      author: options.author || 'system'
    };

    this.versionsDir = join(this.options.projectPath, '.bmad', 'spec-versions');
  }

  /**
   * Find the spec file in the project
   */
  private findSpecFile(projectPath: string): string {
    const patterns = [
      'SPEC.md',
      'SPECIFICATION.md',
      'architecture.md',
      '.bmad/architecture.md',
      '.bmad/spec.md'
    ];

    for (const pattern of patterns) {
      const fullPath = join(projectPath, pattern);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    return join(projectPath, 'SPEC.md');
  }

  /**
   * Create a new version of the specification
   */
  async createVersion(message: string): Promise<SpecVersion> {
    // Read current spec
    let currentContent = '';
    try {
      currentContent = await fs.readFile(this.options.specPath, 'utf-8');
    } catch {
      throw new Error(`Specification file not found: ${this.options.specPath}`);
    }

    // Get version history to determine next version number
    const history = await this.getHistory();
    const versionNumber = this.incrementVersion(history.currentVersion);

    const version: SpecVersion = {
      version: versionNumber,
      timestamp: new Date().toISOString(),
      author: this.options.author,
      message,
      path: join(this.versionsDir, `${this.options.specName}-v${versionNumber}.md`)
    };

    // Ensure versions directory exists
    await fs.mkdir(this.versionsDir, { recursive: true });

    // Save versioned spec
    let versionContent = `# ${this.options.specName} v${version}\n\n`;
    versionContent += `**Created:** ${new Date(version.timestamp).toLocaleString()}\n`;
    versionContent += `**Author:** ${version.author || 'Unknown'}\n`;
    versionContent += `**Message:** ${version.message}\n\n`;
    versionContent += `---\n\n`;
    versionContent += currentContent;

    await fs.writeFile(version.path, versionContent, 'utf-8');

    // Update history
    await this.updateHistory(history, version);

    // Update current spec file
    await fs.writeFile(this.options.specPath, currentContent, 'utf-8');

    return version;
  }

  /**
   * Get version history
   */
  async getHistory(): Promise<SpecVersionHistory> {
    const historyPath = join(this.versionsDir, 'history.json');

    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Return default history
      return {
        specName: this.options.specName,
        currentVersion: '0.0.0',
        versions: []
      };
    }
  }

  /**
   * Update version history
   */
  private async updateHistory(history: SpecVersionHistory, version: SpecVersion): Promise<void> {
    history.versions.push({
      version: version.version,
      timestamp: version.timestamp,
      author: version.author,
      message: version.message,
      path: version.path
    });

    history.currentVersion = version.version;

    const historyPath = join(this.versionsDir, 'history.json');
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * Increment version number
   */
  private incrementVersion(current: string): string {
    const parts = current.split('.').map(Number);
    parts[2]++; // Increment patch version

    return parts.join('.');
  }

  /**
   * Compare two versions
   */
  async compareVersions(fromVersion: string, toVersion: string): Promise<VersionComparison> {
    const history = await this.getHistory();

    const from = history.versions.find(v => v.version === fromVersion);
    const to = history.versions.find(v => v.version === toVersion);

    if (!from || !to) {
      throw new Error('Version not found in history');
    }

    const fromContent = await fs.readFile(from.path, 'utf-8');
    const toContent = await fs.readFile(to.path, 'utf-8');

    // Simple line-by-line comparison
    const fromLines = fromContent.split('\n');
    const toLines = toContent.split('\n');

    const changes: VersionChange[] = [];

    // Find added lines (in to but not in from)
    for (const line of toLines) {
      if (!fromLines.includes(line) && line.trim() && !line.startsWith('#') && !line.startsWith('**')) {
        changes.push({
          type: 'added',
          content: line
        });
      }
    }

    // Find removed lines (in from but not in to)
    for (const line of fromLines) {
      if (!toLines.includes(line) && line.trim() && !line.startsWith('#') && !line.startsWith('**')) {
        changes.push({
          type: 'removed',
          content: line
        });
      }
    }

    const summary = `Added: ${changes.filter(c => c.type === 'added').length}, Removed: ${changes.filter(c => c.type === 'removed').length}`;

    return {
      fromVersion,
      toVersion,
      changes,
      summary
    };
  }

  /**
   * Rollback to a specific version
   */
  async rollback(version: string): Promise<{ success: boolean; message: string }> {
    const history = await this.getHistory();
    const targetVersion = history.versions.find(v => v.version === version);

    if (!targetVersion) {
      return {
        success: false,
        message: `Version ${version} not found`
      };
    }

    // Read the versioned spec
    const versionContent = await fs.readFile(targetVersion.path, 'utf-8');

    // Extract just the content (skip the header we added)
    const contentLines = versionContent.split('\n');
    const contentStart = contentLines.findIndex(line => line === '---');
    const actualContent = contentStart >= 0
      ? contentLines.slice(contentStart + 2).join('\n')
      : versionContent;

    // Save as current spec
    await fs.writeFile(this.options.specPath, actualContent, 'utf-8');

    // Create a new version for the rollback
    await this.createVersion(`Rollback to version ${version}`);

    return {
      success: true,
      message: `Successfully rolled back to version ${version}`
    };
  }

  /**
   * Get a specific version
   */
  async getVersion(version: string): Promise<SpecVersion | null> {
    const history = await this.getHistory();
    return history.versions.find(v => v.version === version) || null;
  }

  /**
   * Get all versions
   */
  async getAllVersions(): Promise<SpecVersion[]> {
    const history = await this.getHistory();
    return history.versions;
  }

  /**
   * Generate version report
   */
  async generateVersionReport(): Promise<string> {
    const history = await this.getHistory();

    let report = `# Specification Version History: ${history.specName}\n\n`;
    report += `**Current Version:** v${history.currentVersion}\n`;
    report += `**Total Versions:** ${history.versions.length}\n\n`;

    report += `## Version List\n\n`;
    report += `| Version | Date | Author | Message |\n`;
    report += `|--------|------|--------|---------|\n`;

    for (const version of history.versions.reverse()) {
      const date = new Date(version.timestamp).toLocaleDateString();
      report += `| v${version.version} | ${date} | ${version.author || '-'} | ${version.message} |\n`;
    }

    return report;
  }
}

/**
 * Convenience function to create a new spec version
 */
export async function createSpecVersion(
  projectPath: string,
  message: string,
  options?: Partial<SpecVersioningOptions>
): Promise<SpecVersion> {
  const versioning = new SpecVersioning({
    projectPath,
    ...options
  });

  return versioning.createVersion(message);
}

/**
 * Convenience function to compare spec versions
 */
export async function compareSpecVersions(
  projectPath: string,
  fromVersion: string,
  toVersion: string,
  options?: Partial<SpecVersioningOptions>
): Promise<VersionComparison> {
  const versioning = new SpecVersioning({
    projectPath,
    ...options
  });

  return versioning.compareVersions(fromVersion, toVersion);
}

/**
 * Convenience function to rollback to a spec version
 */
export async function rollbackSpecVersion(
  projectPath: string,
  version: string,
  options?: Partial<SpecVersioningOptions>
): Promise<{ success: boolean; message: string }> {
  const versioning = new SpecVersioning({
    projectPath,
    ...options
  });

  return versioning.rollback(version);
}
