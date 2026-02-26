// Context Engine Module - Persistent project memory
// Epic 9: Project Context Engine

export { ContextMemory, createContextMemory, loadProjectContext, saveProjectContext } from './context-memory.js';
export { FileIndexer, buildFileIndex, searchFiles } from './file-indexer.js';
export { DecisionLogger, logDecision, searchDecisions } from './decision-logger.js';
export { ContextSummarizer, summarizeContext, needsSummarization } from './context-summarizer.js';
export type { ContextSnapshot, ContextEntry, FileIndex, IndexedFile, DecisionRecord, Summary, ContextOptions } from './types.js';
