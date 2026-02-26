// Context Engine types - Project memory and context

// Context entry types - expanded for intelligent sliding window
export type ContextEntryType =
  | 'file'           // File content or references
  | 'decision'       // General decisions
  | 'artifact'       // Planning artifacts (PRD, specs, etc.)
  | 'summary'        // Summarized content
  | 'bash'           // Bash command output/logs
  | 'error'          // Errors and exceptions
  | 'bmad'           // BMAD architectural decisions (high priority)
  | 'code'           // Code snippets
  | 'userInput';    // User messages/inputs

// Context entry priority levels
export enum EntryPriority {
  CRITICAL = 3,   // BMAD decisions - never summarize
  HIGH = 2,       // Decisions, artifacts - summarize last
  MEDIUM = 1,     // Code, user-input - normal handling
  LOW = 0         // Bash logs, errors - aggressive summarization
}

// Context entry
export interface ContextEntry {
  id: string;
  type: ContextEntryType;
  content: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  priority?: EntryPriority;  // Override default priority for type
  tokens?: number;          // Estimated token count
}

// Context snapshot
export interface ContextSnapshot {
  id: string;
  projectId: string;
  entries: ContextEntry[];
  summary?: string;
  summaries?: Summary[];  // Stored summaries for later expansion
  size: number;
  createdAt: string;
  updatedAt: string;
}

// Sliding window configuration
export interface SlidingWindowConfig {
  maxTotalTokens: number;          // Total token budget
  maxEntries: number;               // Max entries before summarization
  keepRecentByType: Record<ContextEntryType, number>;  // How many recent to keep by type
  compressionRatios: Record<ContextEntryType, number>; // Aggressiveness by type
  neverSummarizeTypes: ContextEntryType[]; // Types that should never be summarized
}

// Indexed file
export interface IndexedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  lines: number;
  lastModified: string;
  content?: string;
  language?: string;
}

// File index
export interface FileIndex {
  projectId: string;
  files: IndexedFile[];
  totalFiles: number;
  totalLines: number;
  lastIndexed: string;
}

// Decision record
export interface DecisionRecord {
  id: string;
  projectId: string;
  decision: string;
  justification: string;
  alternatives: string[];
  context: string;
  timestamp: string;
  author?: string;
}

// Summary
export interface Summary {
  id: string;
  projectId: string;
  content: string;
  sections: string[];
  originalEntries: string[]; // IDs of entries that were summarized
  compressionRatio: number;
  createdAt: string;
}

// Context options
export interface ContextOptions {
  projectId: string;
  projectPath: string;
  maxEntries?: number;
  maxSize?: number; // in bytes
  autoSave?: boolean;
}
