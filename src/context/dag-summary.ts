// DAG Summary - Hierarchical summary management with provenance tracking
// Handles building active context from messages and summaries in DAG structure

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path, { join } from 'path';
import {
  LeafSummary,
  CondensedSummary,
  SummaryNode,
  DAGState,
  ActiveContextEntry,
  ActiveContextResult,
  DAGSummaryConfig,
  MessagePointer,
  SummaryPointer,
  SummaryId,
  MessageId,
  DAGPointer
} from './summary-types.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DAGSummaryConfig = {
  maxLeafMessages: 10,
  maxCondensedChildren: 5,
  maxLevels: 3,
  preserveRecentMessages: 20
};

/**
 * Generate unique ID for summaries
 */
function generateSummaryId(): SummaryId {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Extract message ID from a message object
 */
function extractMessageId(message: unknown, index: number): MessageId {
  const msg = message as Record<string, unknown>;
  // Try to use existing ID or generate one based on content
  if (msg.id && typeof msg.id === 'string') {
    return msg.id;
  }
  // Generate deterministic ID from content hash
  const content = JSON.stringify(message);
  return createHash('sha256')
    .update(content + index.toString())
    .digest('hex')
    .substring(0, 12);
}

/**
 * Estimate token count (approximate: 1 token ≈ 4 characters)
 */
function estimateTokens(text: string | unknown): number {
  if (!text) return 0;
  const textContent = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(textContent.length / 4);
}

/**
 * Create a LeafSummary from a group of messages
 */
export function createLeafSummary(
  messages: unknown[],
  config: DAGSummaryConfig = DEFAULT_CONFIG
): LeafSummary {
  const pointers: MessagePointer[] = messages.map((msg, idx) => ({
    type: 'message',
    messageId: extractMessageId(msg, idx),
    index: idx,
    timestamp: (msg as Record<string, unknown>)?.timestamp as string || new Date().toISOString()
  }));

  const summaryContent = summarizeMessages(messages);
  const tokenCount = estimateTokens(summaryContent);

  return {
    id: generateSummaryId(),
    type: 'leaf',
    summary: summaryContent,
    pointers,
    createdAt: new Date().toISOString(),
    tokenCount,
    messageCount: messages.length
  };
}

/**
 * Create a CondensedSummary from child summaries
 */
export function createCondensedSummary(
  children: SummaryNode[],
  level: number,
  config: DAGSummaryConfig = DEFAULT_CONFIG
): CondensedSummary {
  const pointers: SummaryPointer[] = children.map(child => ({
    type: 'summary',
    summaryId: child.id,
    level: child.type === 'leaf' ? 1 : (child as CondensedSummary).level,
    timestamp: child.createdAt
  }));

  const summaryContent = summarizeChildren(children);
  const tokenCount = estimateTokens(summaryContent);

  return {
    id: generateSummaryId(),
    type: 'condensed',
    summary: summaryContent,
    pointers,
    level,
    createdAt: new Date().toISOString(),
    tokenCount,
    childCount: children.length
  };
}

/**
 * Generate a summary string from messages (simple implementation)
 */
function summarizeMessages(messages: unknown[]): string {
  const toolCalls = messages.filter((m: unknown) => (m as Record<string, unknown>)?.role === 'tool').length;
  const toolResults = messages.filter((m: unknown) => (m as Record<string, unknown>)?.role === 'tool_result').length;
  const userMessages = messages.filter((m: unknown) => (m as Record<string, unknown>)?.role === 'user').length;
  const assistantMessages = messages.filter((m: unknown) => (m as Record<string, unknown>)?.role === 'assistant').length;

  return `[${messages.length} messages: ${userMessages} user, ${assistantMessages} assistant, ${toolCalls} tool calls, ${toolResults} results]`;
}

/**
 * Generate a summary string from child summaries
 */
function summarizeChildren(children: SummaryNode[]): string {
  const totalMessages = children.reduce((acc, child) => {
    return acc + (child.type === 'leaf' ? child.messageCount : (child as CondensedSummary).childCount);
  }, 0);

  const levels = new Set(children.map(c => c.type === 'leaf' ? 1 : (c as CondensedSummary).level));

  return `[Condensed summary of ${children.length} summaries covering ${totalMessages} original messages, levels: ${[...levels].join(', ')}]`;
}

/**
 * DAGState factory - creates an empty DAG state
 */
export function createDAGState(): DAGState {
  return {
    summaries: new Map(),
    latestSummaryId: null,
    levels: new Map()
  };
}

/**
 * Add a summary to the DAG state
 */
export function addSummaryToDAG(
  state: DAGState,
  summary: SummaryNode
): DAGState {
  const newSummaries = new Map(state.summaries);
  newSummaries.set(summary.id, summary);

  const newLevels = new Map(state.levels);
  const level = summary.type === 'leaf' ? 1 : (summary as CondensedSummary).level;
  const levelSummaries = newLevels.get(level) || [];
  newLevels.set(level, [...levelSummaries, summary.id]);

  return {
    summaries: newSummaries,
    latestSummaryId: summary.id,
    levels: newLevels
  };
}

/**
 * Get all leaf summaries from DAG state
 */
export function getLeafSummaries(state: DAGState): LeafSummary[] {
  const leaves: LeafSummary[] = [];
  for (const summary of state.summaries.values()) {
    if (summary.type === 'leaf') {
      leaves.push(summary);
    }
  }
  return leaves;
}

/**
 * Get the latest summary at each level
 */
export function getLatestSummariesByLevel(state: DAGState): Map<number, SummaryNode> {
  const result = new Map<number, SummaryNode>();

  for (const [level, ids] of state.levels) {
    if (ids.length > 0) {
      const latestId = ids[ids.length - 1];
      const summary = state.summaries.get(latestId);
      if (summary) {
        result.set(level, summary);
      }
    }
  }

  return result;
}

/**
 * Get full provenance (all original message IDs) for a summary
 */
export function getProvenance(
  summaryId: SummaryId,
  state: DAGState
): DAGPointer[] {
  const summary = state.summaries.get(summaryId);
  if (!summary) return [];

  const provenance: DAGPointer[] = [];

  if (summary.type === 'leaf') {
    // Direct message pointers
    provenance.push(...summary.pointers);
  } else {
    // Recursively get provenance from children
    const condensed = summary as CondensedSummary;
    for (const pointer of condensed.pointers) {
      const childProvenance = getProvenance(pointer.summaryId, state);
      provenance.push(...childProvenance);
    }
  }

  return provenance;
}

/**
 * Build active context - combines recent messages with DAG summaries
 * This is the main function that creates the lean context state
 */
export function buildActiveContext(
  messages: unknown[],
  dagState: DAGState,
  config: Partial<DAGSummaryConfig> = {}
): ActiveContextResult {
  const cfg: DAGSummaryConfig = { ...DEFAULT_CONFIG, ...config };

  const result: ActiveContextEntry[] = [];
  const provenanceMap = new Map<SummaryId, DAGPointer[]>();

  // Separate recent messages from older ones
  const preserveCount = Math.min(cfg.preserveRecentMessages, messages.length);
  const recentMessages = messages.slice(-preserveCount);
  const olderMessages = messages.slice(0, -preserveCount);

  // Add older messages as summaries if available
  if (olderMessages.length > 0) {
    // Group older messages into chunks and create summaries
    const chunkSize = cfg.maxLeafMessages;
    const chunks: unknown[][] = [];

    for (let i = 0; i < olderMessages.length; i += chunkSize) {
      chunks.push(olderMessages.slice(i, i + chunkSize));
    }

    // Create leaf summaries for each chunk
    const leafSummaries: LeafSummary[] = [];
    for (const chunk of chunks) {
      const leaf = createLeafSummary(chunk, cfg);
      leafSummaries.push(leaf);
    }

    // Condense leaf summaries if needed (create higher levels)
    let currentSummaries: SummaryNode[] = leafSummaries;
    let currentLevel = 1;

    while (currentSummaries.length > 1 && currentLevel < cfg.maxLevels) {
      const nextLevelSummaries: SummaryNode[] = [];

      for (let i = 0; i < currentSummaries.length; i += cfg.maxCondensedChildren) {
        const group = currentSummaries.slice(i, i + cfg.maxCondensedChildren);
        if (group.length > 1) {
          const condensed = createCondensedSummary(group, currentLevel + 1, cfg);
          nextLevelSummaries.push(condensed);
        } else {
          nextLevelSummaries.push(group[0]);
        }
      }

      currentSummaries = nextLevelSummaries;
      currentLevel++;
    }

    // Add the top-level summaries to active context
    for (const summary of currentSummaries) {
      const provenance = getProvenance(summary.id, dagState);

      result.push({
        role: 'system',
        content: summary.summary,
        timestamp: summary.createdAt,
        isSummary: true,
        summaryId: summary.id,
        provenance
      });

      provenanceMap.set(summary.id, provenance);
    }
  }

  // Add recent messages as-is (pure messages)
  for (const msg of recentMessages) {
    const message = msg as Record<string, unknown>;
    result.push({
      role: (message.role as string) || 'system',
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      timestamp: (message.timestamp as string) || new Date().toISOString(),
      isSummary: false
    });
  }

  // Calculate total tokens
  const totalTokens = result.reduce((acc, entry) => acc + estimateTokens(entry.content), 0);

  return {
    messages: result,
    summaryIds: Array.from(provenanceMap.keys()),
    totalTokens,
    provenanceMap
  };
}

/**
 * Rebuild DAG from persisted summaries
 */
export function rebuildDAGFromSummaries(
  summaries: SummaryNode[]
): DAGState {
  let state = createDAGState();

  for (const summary of summaries) {
    state = addSummaryToDAG(state, summary);
  }

  return state;
}

/**
 * Get summary by ID from DAG
 */
export function getSummaryById(
  summaryId: SummaryId,
  state: DAGState
): SummaryNode | undefined {
  return state.summaries.get(summaryId);
}

/**
 * Validate DAG consistency - ensures all pointers reference valid summaries
 */
export function validateDAG(state: DAGState): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [id, summary] of state.summaries) {
    if (summary.type === 'condensed') {
      const condensed = summary as CondensedSummary;
      for (const pointer of condensed.pointers) {
        if (!state.summaries.has(pointer.summaryId)) {
          errors.push(`Summary ${id} references non-existent summary ${pointer.summaryId}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  createLeafSummary,
  createCondensedSummary,
  createDAGState,
  addSummaryToDAG,
  getLeafSummaries,
  getLatestSummariesByLevel,
  getProvenance,
  buildActiveContext,
  rebuildDAGFromSummaries,
  getSummaryById,
  validateDAG
};
