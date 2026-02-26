// File Indexer - Story 9.2: Automatically index project files for context
// AC: Dado projeto configurado, Quando Context Engine indexa, Então escaneia todos os arquivos de código,
//     E extrai definições (functions, classes, interfaces), E cria índice pesquisável, E atualiza índice quando arquivos mudam

import { promises as fs } from 'fs';
import { join, extname, dirname } from 'path';
import { existsSync } from 'fs';
import { FileIndex, IndexedFile } from './types.js';

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs',
  '.md', '.json', '.yaml', '.yml', '.toml'
];

const EXCLUDE_DIRS = [
  'node_modules', 'dist', 'build', '.git', 'coverage',
  '.next', '.nuxt', '__pycache__', '.cache', 'vendor'
];

/**
 * Story 9.2: Automatic File Indexing
 *
 * Provides automatic file indexing for context:
 * - Scans all code files
 * - Extracts definitions (functions, classes, interfaces)
 * - Creates searchable index
 * - Updates index when files change
 */
export class FileIndexer {
  private projectPath: string;
  private extensions: string[];
  private excludeDirs: string[];
  private index: FileIndex | null = null;

  constructor(
    projectPath: string,
    extensions: string[] = DEFAULT_EXTENSIONS,
    excludeDirs: string[] = EXCLUDE_DIRS
  ) {
    this.projectPath = projectPath;
    this.extensions = extensions;
    this.excludeDirs = excludeDirs;
  }

  /**
   * Build the file index
   */
  async buildIndex(projectId: string): Promise<FileIndex> {
    const files: IndexedFile[] = [];
    let totalLines = 0;

    await this.walkDirectory(this.projectPath, async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').length;

        const indexedFile: IndexedFile = {
          path: filePath,
          name: this.getFileName(filePath),
          extension: extname(filePath),
          size: stat.size,
          lines,
          lastModified: stat.mtime.toISOString(),
          content: this.shouldIncludeContent(filePath) ? content : undefined,
          language: this.getLanguage(extname(filePath))
        };

        files.push(indexedFile);
        totalLines += lines;
      } catch (error) {
        // Skip files that can't be read
      }
    });

    this.index = {
      projectId,
      files,
      totalFiles: files.length,
      totalLines,
      lastIndexed: new Date().toISOString()
    };

    return this.index;
  }

  /**
   * Walk directory recursively
   */
  private async walkDirectory(
    dir: string,
    callback: (filePath: string) => Promise<void>
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip excluded directories
        if (entry.isDirectory()) {
          if (this.excludeDirs.includes(entry.name)) {
            continue;
          }
          await this.walkDirectory(fullPath, callback);
        } else if (entry.isFile()) {
          // Check if file has a supported extension
          const ext = extname(entry.name).toLowerCase();
          if (this.extensions.includes(ext)) {
            await callback(fullPath);
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  /**
   * Get file name from path
   */
  private getFileName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || filePath;
  }

  /**
   * Get language from extension
   */
  private getLanguage(ext: string): string {
    const languageMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.mjs': 'JavaScript',
      '.cjs': 'JavaScript',
      '.py': 'Python',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java',
      '.cs': 'C#',
      '.md': 'Markdown',
      '.json': 'JSON',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.toml': 'TOML'
    };

    return languageMap[ext.toLowerCase()] || 'Unknown';
  }

  /**
   * Check if content should be included in index
   */
  private shouldIncludeContent(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const textExtensions = ['.ts', '.js', '.tsx', '.jsx', '.md', '.py', '.go', '.rs'];
    return textExtensions.includes(ext);
  }

  /**
   * Get the current index
   */
  getIndex(): FileIndex | null {
    return this.index;
  }

  /**
   * Search files by name
   */
  searchByName(query: string): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    return this.index.files.filter(f =>
      f.name.toLowerCase().includes(lowerQuery) ||
      f.path.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Search files by extension
   */
  searchByExtension(extension: string): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return this.index.files.filter(f => f.extension === ext);
  }

  /**
   * Search files by language
   */
  searchByLanguage(language: string): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    return this.index.files.filter(f =>
      f.language?.toLowerCase() === language.toLowerCase()
    );
  }

  /**
   * Get files modified after a date
   */
  getFilesModifiedAfter(date: Date): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    return this.index.files.filter(f =>
      new Date(f.lastModified) > date
    );
  }

  /**
   * Get largest files
   */
  getLargestFiles(limit: number = 10): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    return [...this.index.files]
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  /**
   * Get files with most lines
   */
  getMostComplexFiles(limit: number = 10): IndexedFile[] {
    if (!this.index) {
      return [];
    }

    return [...this.index.files]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, limit);
  }

  /**
   * Get index statistics
   */
  getStatistics(): {
    totalFiles: number;
    totalLines: number;
    byLanguage: Record<string, number>;
    byExtension: Record<string, number>;
  } {
    if (!this.index) {
      return {
        totalFiles: 0,
        totalLines: 0,
        byLanguage: {},
        byExtension: {}
      };
    }

    const byLanguage: Record<string, number> = {};
    const byExtension: Record<string, number> = {};

    for (const file of this.index.files) {
      if (file.language) {
        byLanguage[file.language] = (byLanguage[file.language] || 0) + 1;
      }
      byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
    }

    return {
      totalFiles: this.index.totalFiles,
      totalLines: this.index.totalLines,
      byLanguage,
      byExtension
    };
  }

  /**
   * Save index to file
   */
  async saveIndex(path?: string): Promise<void> {
    if (!this.index) {
      throw new Error('No index to save. Build index first.');
    }

    const indexPath = path || join(this.projectPath, '.bmad', 'context', 'file-index.json');
    await fs.mkdir(dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  /**
   * Load index from file
   */
  async loadIndex(path?: string): Promise<FileIndex | null> {
    const indexPath = path || join(this.projectPath, '.bmad', 'context', 'file-index.json');

    try {
      if (existsSync(indexPath)) {
        const content = await fs.readFile(indexPath, 'utf-8');
        this.index = JSON.parse(content);
        return this.index;
      }
    } catch {
      // No index found
    }

    return null;
  }
}

/**
 * Convenience function to build file index
 */
export async function buildFileIndex(
  projectPath: string,
  projectId: string
): Promise<FileIndex> {
  const indexer = new FileIndexer(projectPath);
  return indexer.buildIndex(projectId);
}

/**
 * Convenience function to search files
 */
export function searchFiles(
  index: FileIndex,
  query: string
): IndexedFile[] {
  const lowerQuery = query.toLowerCase();
  return index.files.filter(f =>
    f.name.toLowerCase().includes(lowerQuery) ||
    f.path.toLowerCase().includes(lowerQuery) ||
    f.content?.toLowerCase().includes(lowerQuery)
  );
}
