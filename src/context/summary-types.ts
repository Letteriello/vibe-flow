// Summary Types - Hierarchical summary data structures
// Defines LeafSummary and CondensedSummary for DAG-based context management

/**
 * Represents a unique identifier for messages and summaries in the Immutable Store
 */
export type MessageId = string;
export type SummaryId = string;

/**
 * Pointer to a specific message in the Immutable Store
 */
export interface MessagePointer {
  type: 'message';
  messageId: MessageId;
  index: number;
  timestamp: string;
}

/**
 * Pointer to another summary in the DAG
 */
export interface SummaryPointer {
  type: 'summary';
  summaryId: SummaryId;
  level: number; // DAG level (1 = leaf, 2 = condensed from leaves, etc.)
  timestamp: string;
}

/**
 * Union type for any pointer (message or summary)
 */
export type DAGPointer = MessagePointer | SummaryPointer;

/**
 * LeafSummary - Resumes direct messages from the Immutable Store
 * Represents the lowest level of the DAG hierarchy
 */
export interface LeafSummary {
  id: SummaryId;
  type: 'leaf';
  summary: string;
  pointers: MessagePointer[];
  createdAt: string;
  tokenCount: number;
  messageCount: number;
}

/**
 * CondensedSummary - Resumes other summaries (creates DAG hierarchy)
 * Higher level summary that references LeafSummary or other CondensedSummary
 */
export interface CondensedSummary {
  id: SummaryId;
  type: 'condensed';
  summary: string;
  pointers: SummaryPointer[];
  level: number;
  createdAt: string;
  tokenCount: number;
  childCount: number;
}

/**
 * Union type for any summary in the DAG
 */
export type SummaryNode = LeafSummary | CondensedSummary;

/**
 * Entry in the active context (can be a raw message or a summary node)
 */
export interface ActiveContextEntry {
  role: string;
  content: string;
  timestamp: string;
  isSummary?: boolean;
  summaryId?: SummaryId;
  provenance?: DAGPointer[];
}

/**
 * DAG state containing all summaries organized by level
 */
export interface DAGState {
  summaries: Map<SummaryId, SummaryNode>;
  latestSummaryId: SummaryId | null;
  levels: Map<number, SummaryId[]>;
}

/**
 * Result from building active context
 */
export interface ActiveContextResult {
  messages: ActiveContextEntry[];
  summaryIds: SummaryId[];
  totalTokens: number;
  provenanceMap: Map<SummaryId, DAGPointer[]>;
}

/**
 * Configuration for DAG summary system
 */
export interface DAGSummaryConfig {
  maxLeafMessages: number;      // Max messages per leaf summary (default: 10)
  maxCondensedChildren: number; // Max children per condensed summary (default: 5)
  maxLevels: number;            // Max DAG depth (default: 3)
  preserveRecentMessages: number; // Recent messages to keep untouched (default: 20)
}
