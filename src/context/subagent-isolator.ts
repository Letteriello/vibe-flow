// SubAgent Context Isolator - Sandboxed sub-agent execution
// Encapsulates a complete LLM session with isolated context
// Prevents tool logs from polluting main history and returns only conclusions

import {
  ContextMessage,
  ContextEditor,
  ToolCall,
  ContextEditorConfig,
  DEFAULT_CONTEXT_EDITOR_CONFIG
} from './context-pruner.js';

/**
 * Configuration for sub-agent isolated execution
 */
export interface SubAgentConfig {
  /** System prompt for the sub-agent */
  systemPrompt: string;
  /** The delegated scope - what the sub-agent is responsible for */
  delegatedScope: string;
  /** What the parent agent retains */
  retainedWork: string;
  /** Maximum execution turns */
  maxTurns?: number;
  /** Custom context editor config */
  editorConfig?: Partial<ContextEditorConfig>;
  /** Whether to capture detailed tool logs internally */
  captureInternalLogs?: boolean;
}

/**
 * Result of sub-agent execution
 */
export interface SubAgentResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Summary conclusion to return to parent agent */
  conclusion: string;
  /** Number of turns executed */
  turnsExecuted: number;
  /** Whether execution was truncated due to maxTurns */
  truncated: boolean;
  /** Errors encountered during execution */
  errors: string[];
  /** Internal tool call count */
  toolCallCount: number;
}

/**
 * Internal tool call log entry
 */
interface ToolLogEntry {
  timestamp: string;
  toolName: string;
  arguments_json: string;
  toolCallId?: string;
  result?: string;
  error?: string;
}

/**
 * Message format for LLM interaction
 */
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * SubAgentContextIsolator - Sandboxed execution environment for sub-agents
 *
 * Provides complete isolation from parent agent's context:
 * - Starts with clean slate (only system prompt + delegated_scope)
 * - Captures all tool calls internally without polluting main history
 * - Returns only a summary conclusion to parent agent
 */
export class SubAgentContextIsolator {
  private config: SubAgentConfig;
  private internalMessages: LLMMessage[];
  private toolLogs: ToolLogEntry[];
  private turnsExecuted: number;
  private editor: ContextEditor;

  /**
   * Create a new SubAgentContextIsolator
   * @param config Configuration for isolated execution
   */
  constructor(config: SubAgentConfig) {
    this.config = {
      maxTurns: 20,
      captureInternalLogs: true,
      ...config
    };
    this.internalMessages = [];
    this.toolLogs = [];
    this.turnsExecuted = 0;
    this.editor = new ContextEditor({
      ...DEFAULT_CONTEXT_EDITOR_CONFIG,
      ...config.editorConfig
    });
  }

  /**
   * Initialize the isolated context with system prompt and delegated scope
   * @returns Initial messages for LLM session
   */
  initializeContext(): LLMMessage[] {
    const systemContent = this.buildSystemPrompt();
    const initialMessage: LLMMessage = {
      role: 'system',
      content: systemContent
    };
    this.internalMessages = [initialMessage];
    return this.internalMessages;
  }

  /**
   * Build the system prompt for the sub-agent
   */
  private buildSystemPrompt(): string {
    return `${this.config.systemPrompt}

## Delegated Scope
You are responsible for: ${this.config.delegatedScope}

## Parent Agent Retains
The parent agent handles: ${this.config.retainedWork}

## Isolation Rules
- You have a completely isolated context - no access to parent agent's history
- All tool results from your execution are captured internally
- At the end, provide a concise summary of what you accomplished
- Focus on delivering the specific outcome requested in your scope`;
  }

  /**
   * Add a user message to the isolated context
   * @param content User message content
   */
  addUserMessage(content: string): void {
    this.internalMessages.push({
      role: 'user',
      content
    });
  }

  /**
   * Add an assistant message with optional tool calls to the isolated context
   * @param message Assistant message
   */
  addAssistantMessage(message: LLMMessage): void {
    this.internalMessages.push(message);
    if (message.tool_calls && this.config.captureInternalLogs) {
      for (const toolCall of message.tool_calls) {
        this.logToolCall(toolCall);
      }
    }
  }

  /**
   * Add a tool result to the isolated context
   * @param toolCallId The tool call ID
   * @param content The tool result content
   */
  addToolResult(toolCallId: string, content: string): void {
    const toolMessage: LLMMessage = {
      role: 'user',
      content,
      tool_call_id: toolCallId
    };
    this.internalMessages.push(toolMessage);

    // Update tool log with result
    const logEntry = this.toolLogs.find(
      (log) => log.toolCallId === toolCallId || log.toolName === this.extractLastToolName()
    );
    if (logEntry && this.config.captureInternalLogs) {
      logEntry.result = this.truncateContent(content);
    }
  }

  /**
   * Log a tool call to internal storage (not to main history)
   * @param toolCall The tool call to log
   */
  private logToolCall(toolCall: ToolCall): void {
    const entry: ToolLogEntry = {
      timestamp: new Date().toISOString(),
      toolName: toolCall.function.name,
      arguments_json: toolCall.function.arguments,
      toolCallId: toolCall.id
    };
    this.toolLogs.push(entry);
  }

  /**
   * Extract the last tool name from assistant message
   */
  private extractLastToolName(): string {
    const lastAssistant = this.internalMessages
      .filter((m) => m.role === 'assistant')
      .pop();
    if (lastAssistant?.tool_calls && lastAssistant.tool_calls.length > 0) {
      const lastTool = lastAssistant.tool_calls[lastAssistant.tool_calls.length - 1];
      return lastTool.function.name;
    }
    return '';
  }

  /**
   * Truncate content to prevent memory issues
   */
  private truncateContent(content: string, maxLength: number = 2000): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + `...\n[truncated: ${content.length - maxLength} chars]`;
  }

  /**
   * Get current isolated messages for LLM processing
   * @returns Current message array
   */
  getMessages(): LLMMessage[] {
    return this.internalMessages;
  }

  /**
   * Increment turn counter and check if max turns reached
   * @returns Whether execution should continue
   */
  incrementTurn(): boolean {
    this.turnsExecuted++;
    const maxTurns = this.config.maxTurns ?? 20;
    return this.turnsExecuted < maxTurns;
  }

  /**
   * Get current turn count
   */
  getTurnsExecuted(): number {
    return this.turnsExecuted;
  }

  /**
   * Generate a conclusion summary from the isolated execution
   * @param finalResponse The final LLM response
   * @returns Formatted conclusion message
   */
  generateConclusion(finalResponse: string): string {
    const toolCount = this.toolLogs.length;
    const uniqueTools = new Set(this.toolLogs.map((t) => t.toolName)).size;

    // Extract key outcomes from the final response
    const summaryLines: string[] = [
      `[SubAgent Conclusion] ${this.config.delegatedScope}`
    ];

    if (this.turnsExecuted >= (this.config.maxTurns ?? 20)) {
      summaryLines.push(`- ⚠️ Execution truncated after ${this.turnsExecuted} turns`);
    } else {
      summaryLines.push(`- Completed in ${this.turnsExecuted} turn(s)`);
    }

    summaryLines.push(`- ${toolCount} tool call(s) executed (${uniqueTools} unique tool(s))`);
    summaryLines.push('');
    summaryLines.push('Result:');

    // Add the final response (truncated if needed)
    const truncatedResponse = this.truncateContent(finalResponse, 1500);
    summaryLines.push(truncatedResponse);

    if (this.toolLogs.length > 0 && this.config.captureInternalLogs) {
      summaryLines.push('');
      summaryLines.push('Tools used:');
      const uniqueToolSet = new Set(this.toolLogs.map((t) => t.toolName));
      for (const tool of uniqueToolSet) {
        const count = this.toolLogs.filter((t) => t.toolName === tool).length;
        summaryLines.push(`  - ${tool} (${count}x)`);
      }
    }

    return summaryLines.join('\n');
  }

  /**
   * Format the final result to return to parent agent
   * @param finalResponse The final LLM response content
   * @returns SubAgentResult with conclusion and metadata
   */
  finalize(finalResponse: string): SubAgentResult {
    const maxTurns = this.config.maxTurns ?? 20;
    const conclusion = this.generateConclusion(finalResponse);

    return {
      success: this.turnsExecuted < maxTurns,
      conclusion,
      turnsExecuted: this.turnsExecuted,
      truncated: this.turnsExecuted >= maxTurns,
      errors: [],
      toolCallCount: this.toolLogs.length
    };
  }

  /**
   * Get tool logs for debugging/auditing (not added to main history)
   */
  getToolLogs(): ToolLogEntry[] {
    return this.toolLogs;
  }

  /**
   * Get token estimate for current isolated context
   * Rough estimate: 1 token ≈ 4 characters
   */
  estimateTokenCount(): number {
    let totalChars = 0;
    for (const msg of this.internalMessages) {
      totalChars += msg.content.length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.name.length + tc.function.arguments.length;
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * Check if context is approaching token limits
   * @param threshold Threshold ratio (0-1)
   */
  isApproachingLimit(threshold: number = 0.8): boolean {
    const estimated = this.estimateTokenCount();
    const limit = 100000; // Assume 100k context window
    return estimated / limit >= threshold;
  }
}

/**
 * Helper to create a SubAgentContextIsolator with default configuration
 */
export function createSubAgentIsolator(
  systemPrompt: string,
  delegatedScope: string,
  retainedWork: string
): SubAgentContextIsolator {
  return new SubAgentContextIsolator({
    systemPrompt,
    delegatedScope,
    retainedWork
  });
}
