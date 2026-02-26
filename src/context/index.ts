// Context module exports
export { ContextAwarePromptGenerator } from './context-aware-prompt.js';
export { ContextAggregator, ContextSummary, ContextEntry } from './context-aggregation.js';
export { pruneStaleTools } from './pruner.js';
export { summarizeContext, SummarizerOptions, SummarizationResult } from './summarizer.js';
export {
  compactContext,
  expandContext,
  needsCompaction,
  getContextStatus,
  estimateTokens,
  calculateTotalTokens,
  loadFromPointer,
  CompactionConfig,
  CompactionResult,
  CompactedMessage,
  RawDataPointer
} from './compaction.js';
export {
  ContextManager,
  createContextManager,
  ContextManagerConfig,
  OptimizedContextResult
} from './context-manager.js';
export {
  LeafSummary,
  CondensedSummary,
  SummaryNode,
  DAGState,
  ActiveContextEntry,
  ActiveContextResult,
  DAGSummaryConfig,
  MessagePointer,
  SummaryPointer,
  DAGPointer,
  SummaryId,
  MessageId
} from './summary-types.js';
export {
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
} from './dag-summary.js';
export {
  ImmutableStore,
  ImmutableTransaction,
  TransactionType,
  TransactionResult,
  SearchOptions,
  SearchResult,
  ImmutableStoreConfig
} from './store.js';
export {
  ImmutableLogger,
  LogEntry,
  LogLevel,
  LogCategory,
  LogResult,
  LogSearchOptions,
  LogSearchResult,
  ImmutableLoggerConfig
} from './immutable-logger.js';
// Active Window - Aggressive noise cleaning middleware
export {
  ActiveWindowMiddleware,
  createActiveWindowMiddleware,
  filterProviderPayload,
  ProviderPayload
} from './active-window.js';
export {
  thinkingBlockClearing,
  staleToolClearing,
  needsAggressiveCleaning,
  ContextMessage,
  ActiveWindowConfig,
  CleaningResult
} from './pruning.js';
// Three-Level Escalation - LCM pattern
export {
  escalatedSummarize,
  deterministicEscalate,
  EscalationMessage,
  EscalationResult,
  EscalationOptions,
  EscalationLogger,
  LLMCaller
} from './escalation.js';
export {
  DEFAULT_COMPACTION_LIMITS,
  CompactionLimits,
  EscalationLevelConfig,
  getLevelConfig,
  calculateTargetTokens,
  estimateTokensFromChars,
  estimateCharsFromTokens
} from './compaction-limits.js';
// File Pointers - Intelligent large file injection
export {
  SOFT_TOKEN_LIMIT,
  FilePointer,
  ExplorationSummary,
  FileInjectionResult,
  FilePointerConfig,
  detectLargeFile,
  injectFilePointer,
  createExplorationSummary,
  storeFileContent,
  estimateFileTokens,
  loadFromFilePointer
} from './file-pointers.js';
// File Analyzer - Static file structure analysis
export {
  FileType,
  CodeStructure,
  detectFileType,
  analyzeFileStructure,
  analyzeTextPreview,
  generateCodeStructure
} from './file-analyzer.js';
// Hierarchical Context Manager - Compactação hierárquica de contexto
export {
  HierarchicalContextManager,
  createHierarchicalContextManager,
  HierarchicalConfig,
  HierarchicalCompactionResult,
  HierarchicalCompactedContextResult,
  HierarchicalExpandNodeResult,
  HierarchicalError,
  HierarchicalEntry,
  HierarchicalEntryType,
  HierarchicalSummaryNode,
  HierarchicalState
} from './hierarchical.js';
// Worker Thread - CPU-intensive context compression
export {
  compressContextAsync,
  CompressContextOptions,
  CompressContextResult
} from './worker-wrapper.js';
// Context Editor - Active history cleaning for agent loop
export {
  ContextEditor,
  ContextMessage,
  ToolCall,
  ContextEditorConfig,
  ContextEditResult,
  ContextEditStrategy,
  TokenEstimation,
  DEFAULT_CONTEXT_EDITOR_CONFIG,
  editContext,
  clearThinkingBlocks,
  clearToolResults,
  needsContextCleaning
} from './context-pruner.js';
// SubAgent Context Isolator - Sandboxed sub-agent execution
export {
  SubAgentContextIsolator,
  SubAgentConfig,
  SubAgentResult,
  createSubAgentIsolator
} from './subagent-isolator.js';
