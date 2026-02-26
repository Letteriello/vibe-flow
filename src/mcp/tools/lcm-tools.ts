// LCM (Large Context Management) Tools
// MCP tools for context recovery and history search

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { compactionLoadFromPointer as loadFromPointer, RawDataPointer, CompactedMessage } from '../../context/compaction.js';
import {
  lcmDescribeSchema,
  lcmExpandSchema,
  lcmGrepSchema,
  LCMDescribeInput,
  LCMExpandInput,
  LCMGrepInput
} from './lcm-schema.js';

/**
 * Default project path
 */
function getDefaultProjectPath(input?: { projectPath?: string }): string {
  return input?.projectPath || process.cwd();
}

/**
 * Get the context archives directory path
 */
function getArchivesDir(projectPath: string): string {
  return join(projectPath, '.vibe-flow', 'context-archives');
}

/**
 * Get the compaction state file path
 */
function getCompactionStatePath(projectPath: string): string {
  return join(projectPath, '.vibe-flow', 'compaction-state.json');
}

/**
 * Find archive file by pointerId
 */
async function findArchiveByPointerId(
  pointerId: string,
  projectPath: string
): Promise<{ filePath: string; data: any } | null> {
  const archivesDir = getArchivesDir(projectPath);

  try {
    const files = await fs.readdir(archivesDir);

    for (const file of files) {
      if (!file.startsWith('archive_') || !file.endsWith('.json')) {
        continue;
      }

      const filePath = join(archivesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Check if this archive contains the pointerId
      if (data.archivedAt && data.messages) {
        // Return the file if the ID matches or if we can't determine
        // We'll check in the main function
        return { filePath, data };
      }
    }
  } catch {
    // Archives directory doesn't exist or is empty
  }

  return null;
}

/**
 * Get all archive files
 */
async function getAllArchives(
  projectPath: string
): Promise<Array<{ filePath: string; data: any }>> {
  const archivesDir = getArchivesDir(projectPath);
  const archives: Array<{ filePath: string; data: any }> = [];

  try {
    const files = await fs.readdir(archivesDir);

    for (const file of files) {
      if (!file.startsWith('archive_') || !file.endsWith('.json')) {
        continue;
      }

      const filePath = join(archivesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      archives.push({
        filePath,
        data: JSON.parse(content)
      });
    }
  } catch {
    // Archives directory doesn't exist
  }

  // Sort by modification time (newest first)
  archives.sort((a, b) => {
    const timeA = new Date(a.data.archivedAt || 0).getTime();
    const timeB = new Date(b.data.archivedAt || 0).getTime();
    return timeB - timeA;
  });

  return archives;
}

/**
 * LCM Tool: lcm_describe
 * Describes metadata for a given ID (pointer or file)
 */
export async function lcmDescribe(input: LCMDescribeInput): Promise<{
  success: boolean;
  type: 'summary' | 'file' | 'unknown';
  metadata: Record<string, unknown>;
  error?: string;
}> {
  const projectPath = getDefaultProjectPath(input);
  const { id } = input;

  try {
    // Check if it's a file path
    const isFilePath = id.includes('/') || id.includes('\\') || id.endsWith('.json');

    if (isFilePath) {
      // It's a file path - try to read it
      try {
        const content = await fs.readFile(id, 'utf-8');
        const data = JSON.parse(content);

        // Determine if it's an archive or a summary
        if (data.messages && data.archivedAt) {
          return {
            success: true,
            type: 'summary',
            metadata: {
              filePath: id,
              archivedAt: data.archivedAt,
              messageCount: data.messageCount || data.messages.length,
              roles: extractRoles(data.messages),
              firstTimestamp: getFirstTimestamp(data.messages),
              lastTimestamp: getLastTimestamp(data.messages)
            }
          };
        }

        return {
          success: true,
          type: 'file',
          metadata: {
            filePath: id,
            keys: Object.keys(data)
          }
        };
      } catch {
        return {
          success: false,
          type: 'unknown',
          metadata: {},
          error: `File not found: ${id}`
        };
      }
    }

    // It's a pointerId - search in archives
    const archives = await getAllArchives(projectPath);

    for (const archive of archives) {
      // Check if this is the archive we're looking for
      // The pointerId is embedded in the file name
      if (archive.filePath.includes(id) || id.includes(basename(archive.filePath, '.json'))) {
        return {
          success: true,
          type: 'summary',
          metadata: {
            filePath: archive.filePath,
            archivedAt: archive.data.archivedAt,
            messageCount: archive.data.messageCount || archive.data.messages?.length,
            roles: extractRoles(archive.data.messages),
            firstTimestamp: getFirstTimestamp(archive.data.messages),
            lastTimestamp: getLastTimestamp(archive.data.messages)
          }
        };
      }
    }

    // Try to find by pointerId in any archive
    for (const archive of archives) {
      if (archive.data.messages) {
        // Check if we can find a match
        return {
          success: true,
          type: 'summary',
          metadata: {
            filePath: archive.filePath,
            archivedAt: archive.data.archivedAt,
            messageCount: archive.data.messageCount || archive.data.messages.length,
            roles: extractRoles(archive.data.messages),
            note: `Found closest match for ID "${id}"`
          }
        };
      }
    }

    return {
      success: false,
      type: 'unknown',
      metadata: {},
      error: `No archive found with ID: ${id}`
    };
  } catch (error) {
    return {
      success: false,
      type: 'unknown',
      metadata: {},
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * LCM Tool: lcm_expand
 * Expands a compacted summary to reveal original messages
 */
export async function lcmExpand(input: LCMExpandInput): Promise<{
  success: boolean;
  messages?: unknown[];
  messageCount?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}> {
  const projectPath = getDefaultProjectPath(input);
  const { pointerId } = input;

  try {
    // Try to find the archive file
    const archives = await getAllArchives(projectPath);

    // Find the archive matching the pointerId
    let targetArchive: { filePath: string; data: any } | null = null;

    for (const archive of archives) {
      if (archive.filePath.includes(pointerId) ||
          basename(archive.filePath, '.json').includes(pointerId)) {
        targetArchive = archive;
        break;
      }
    }

    if (!targetArchive) {
      // Try direct path resolution
      const archivesDir = getArchivesDir(projectPath);
      const directPath = join(archivesDir, `archive_${pointerId}.json`);

      try {
        const content = await fs.readFile(directPath, 'utf-8');
        targetArchive = {
          filePath: directPath,
          data: JSON.parse(content)
        };
      } catch {
        // Not found at direct path either
      }
    }

    if (!targetArchive) {
      return {
        success: false,
        error: `No archive found with pointerId: ${pointerId}`
      };
    }

    const messages = targetArchive.data.messages || [];

    return {
      success: true,
      messages,
      messageCount: messages.length,
      metadata: {
        filePath: targetArchive.filePath,
        archivedAt: targetArchive.data.archivedAt,
        roles: extractRoles(messages)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * LCM Tool: lcm_grep
 * Searches for regex pattern across all archived messages
 */
export async function lcmGrep(input: LCMGrepInput): Promise<{
  success: boolean;
  matches: Array<{
    filePath: string;
    messageIndex: number;
    role: string;
    content: string;
    match: string;
  }>;
  totalMatches: number;
  archivesSearched: number;
  error?: string;
}> {
  const projectPath = getDefaultProjectPath(input);
  const { pattern, options } = input;

  const caseSensitive = options?.caseSensitive ?? false;
  const maxResults = options?.maxResults ?? 50;
  const includeContent = options?.includeContent ?? true;

  try {
    // Compile regex
    const flags = caseSensitive ? 'g' : 'gi';
    let regex: RegExp;

    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return {
        success: false,
        matches: [],
        totalMatches: 0,
        archivesSearched: 0,
        error: `Invalid regex pattern: ${pattern}`
      };
    }

    const archives = await getAllArchives(projectPath);
    const matches: Array<{
      filePath: string;
      messageIndex: number;
      role: string;
      content: string;
      match: string;
    }> = [];

    for (const archive of archives) {
      const messages = archive.data.messages || [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as any;

        if (!msg) continue;

        const content = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);

        // Check for matches
        const contentMatches = content.match(regex);

        if (contentMatches && contentMatches.length > 0) {
          matches.push({
            filePath: archive.filePath,
            messageIndex: i,
            role: msg.role || 'unknown',
            content: includeContent ? content.substring(0, 500) : '',
            match: contentMatches[0]
          });

          if (matches.length >= maxResults) {
            break;
          }
        }
      }

      if (matches.length >= maxResults) {
        break;
      }
    }

    return {
      success: true,
      matches,
      totalMatches: matches.length,
      archivesSearched: archives.length
    };
  } catch (error) {
    return {
      success: false,
      matches: [],
      totalMatches: 0,
      archivesSearched: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Helper: Extract unique roles from messages
 */
function extractRoles(messages: unknown[]): string[] {
  const roles = new Set<string>();

  for (const msg of messages) {
    const m = msg as any;
    if (m?.role) {
      roles.add(m.role);
    }
  }

  return Array.from(roles);
}

/**
 * Helper: Get first timestamp from messages
 */
function getFirstTimestamp(messages: unknown[]): string | null {
  if (!messages || messages.length === 0) return null;

  const first = messages[0] as any;
  return first?.timestamp || null;
}

/**
 * Helper: Get last timestamp from messages
 */
function getLastTimestamp(messages: unknown[]): string | null {
  if (!messages || messages.length === 0) return null;

  const last = messages[messages.length - 1] as any;
  return last?.timestamp || null;
}

/**
 * Get all LCM tools definitions for MCP registration
 */
export function getLCMTools() {
  return [
    {
      name: 'lcm_describe',
      description: 'Describe metadata for a given ID (pointer or archived file). Returns information about whether it is a summary or file, with its metadata.',
      inputSchema: lcmDescribeSchema,
      handler: lcmDescribe
    },
    {
      name: 'lcm_expand',
      description: 'Expand a compacted summary to reveal its constituent original messages from the archive. Use this to recover information that was compacted.',
      inputSchema: lcmExpandSchema,
      handler: lcmExpand
    },
    {
      name: 'lcm_grep',
      description: 'Search for a regex pattern across all archived messages in the immutable history. Returns matching messages with their context.',
      inputSchema: lcmGrepSchema,
      handler: lcmGrep
    }
  ];
}

export default {
  lcmDescribe,
  lcmExpand,
  lcmGrep,
  getLCMTools
};
