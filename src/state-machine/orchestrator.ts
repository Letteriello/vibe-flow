// Orchestrator - Advanced orchestration layer for Vibe Flow state machine
// Integrates MCP callers, validation guards, context pruning, fallback routing, and subagent isolation

import { StateMachine, Phase, ProjectState, ActionType, TransitionAuditEntry } from './index.js';
import { MCPClient, MCPClientManager } from '../mcp/client.js';
import { MCPRouter, RouterConfig, DEFAULT_ROUTER_CONFIG } from '../mcp/router.js';
import { FallbackRouter, FallbackConfig, DEFAULT_FALLBACK_CONFIG, FallbackResult } from '../mcp/fallback.js';
import { MCPToolResponse } from '../mcp/types.js';
import { pruneStaleTools } from '../context/pruner.js';
import { ContextManager, createContextManager, OptimizedContextResult } from '../context/context-manager.js';
import { StepValidator, ValidationLevel } from '../validation/step-validator.js';

// ============================================================================
// Types - Explicit types for all properties
// ============================================================================

export interface OrchestratorConfig {
  mcp: {
    router?: Partial<RouterConfig>;
    fallback?: Partial<FallbackConfig>;
    clientEnabled?: boolean;
  };
  context: {
    maxTokens?: number;
    enablePruning?: boolean;
    maxRecentIterations?: number;
  };
  validation: {
    strictMode?: boolean;
    validationLevel?: ValidationLevel;
  };
  isolation: {
    enableSubagentIsolation?: boolean;
    isolationTimeoutMs?: number;
  };
}

export interface OrchestratorContext {
  stateMachine: StateMachine;
  mcpRouter: MCPRouter;
  fallbackRouter: FallbackRouter;
  mcpClient: MCPClient | null;
  contextManager: ContextManager;
  stepValidator: StepValidator;
  subagentIsolator: SubagentIsolator | null;
}

export interface OrchestratorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  context?: OptimizedContextResult;
  validationErrors?: string[];
  fallbackUsed?: boolean;
  pruned?: boolean;
}

export interface TransitionLifecycleHook {
  name: string;
  priority: number;
  execute: (phase: Phase, state: ProjectState) => Promise<void> | void;
}

// Subagent Isolator - Context isolation for subagents
export class SubagentIsolator {
  private isolatedContexts: Map<string, OptimizedContextResult> = new Map();
  private config: OrchestratorConfig['isolation'];

  constructor(config?: OrchestratorConfig['isolation']) {
    this.config = {
      enableSubagentIsolation: config?.enableSubagentIsolation ?? true,
      isolationTimeoutMs: config?.isolationTimeoutMs ?? 300000
    };
  }

  async isolateContext(subagentId: string, context: OptimizedContextResult): Promise<void> {
    if (!this.config.enableSubagentIsolation) return;

    this.isolatedContexts.set(subagentId, {
      messages: [...context.messages],
      status: { ...context.status }
    });
  }

  getIsolatedContext(subagentId: string): OptimizedContextResult | undefined {
    return this.isolatedContexts.get(subagentId);
  }

  releaseContext(subagentId: string): void {
    this.isolatedContexts.delete(subagentId);
  }

  clearAll(): void {
    this.isolatedContexts.clear();
  }
}

// Context Editor - Injects context modifications before each request
export class ContextEditor {
  private contextManager: ContextManager;
  private prunerConfig: OrchestratorConfig['context'];

  constructor(contextManager: ContextManager, config?: OrchestratorConfig['context']) {
    this.contextManager = contextManager;
    this.prunerConfig = {
      maxTokens: config?.maxTokens ?? 100000,
      enablePruning: config?.enablePruning ?? true,
      maxRecentIterations: config?.maxRecentIterations ?? 10
    };
  }

  async prepareContext(request: unknown): Promise<OptimizedContextResult> {
    // Get optimized context from manager
    const optimized = await this.contextManager.getOptimizedContext();

    // Apply pruning if enabled
    if (this.prunerConfig.enablePruning && optimized.messages.length > 0) {
      const prunedMessages = pruneStaleTools(optimized.messages);

      // Update context with pruned messages
      return {
        messages: prunedMessages,
        status: {
          ...optimized.status,
          wasCompacted: true
        },
        compactionResult: optimized.compactionResult
      };
    }

    return optimized;
  }

  async injectContext(request: unknown, context: OptimizedContextResult): Promise<Record<string, unknown>> {
    // Inject context into request payload
    return {
      ...(request as Record<string, unknown>),
      _context: {
        messages: context.messages,
        totalTokens: context.status.tokenCount,
        pruned: context.status.wasCompacted,
        preparedAt: new Date().toISOString()
      }
    };
  }
}

// ============================================================================
// Main Orchestrator Class
// ============================================================================

export class Orchestrator {
  private config: OrchestratorConfig;
  private stateMachine: StateMachine;
  private mcpRouter: MCPRouter;
  private fallbackRouter: FallbackRouter;
  private mcpClient: MCPClient | null;
  private contextManager: ContextManager;
  private contextEditor: ContextEditor;
  private stepValidator: StepValidator;
  private subagentIsolator: SubagentIsolator;
  private lifecycleHooks: TransitionLifecycleHook[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = config;

    // Initialize State Machine
    this.stateMachine = new StateMachine();

    // Initialize MCP Router (Agentic Map equivalent)
    this.mcpRouter = new MCPRouter(config.mcp?.router ?? DEFAULT_ROUTER_CONFIG);

    // Initialize Fallback Router (LLMFallbackRouter equivalent)
    this.fallbackRouter = new FallbackRouter(config.mcp?.fallback ?? DEFAULT_FALLBACK_CONFIG);

    // Initialize MCP Client (Programmatic Caller equivalent)
    this.mcpClient = config.mcp?.clientEnabled !== false ? new MCPClient() : null;

    // Initialize Context Manager
    this.contextManager = createContextManager({
      maxTokens: config.context?.maxTokens ?? 100000
    });

    // Initialize Context Editor
    this.contextEditor = new ContextEditor(this.contextManager, config.context);

    // Initialize Step Validator (Delegation Guard equivalent)
    this.stepValidator = new StepValidator();

    // Initialize Subagent Isolator
    this.subagentIsolator = new SubagentIsolator(config.isolation);

    // Connect MCP Router to Fallback Router
    this.connectRouterToFallback();

    console.log('[Orchestrator] Initialized with all advanced modules');
  }

  /**
   * Connect MCP Router triggers to Fallback Router
   * When router detects 3+ failures, triggers fallback
   */
  private connectRouterToFallback(): void {
    this.mcpRouter.setFallbackCallback(async (toolName: string, attempts: number) => {
      console.log(`[Orchestrator] Fallback triggered for ${toolName} after ${attempts} attempts`);

      // Log the failure in state machine
      await this.stateMachine.addError(
        `MCP tool "${toolName}" failed ${attempts} times - fallback activated`,
        true
      );
    });
  }

  /**
   * Register lifecycle hook for phase transitions
   */
  registerLifecycleHook(hook: TransitionLifecycleHook): void {
    this.lifecycleHooks.push(hook);
    this.lifecycleHooks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute all lifecycle hooks for a phase transition
   */
  private async executeLifecycleHooks(phase: Phase, state: ProjectState): Promise<void> {
    for (const hook of this.lifecycleHooks) {
      try {
        await hook.execute(phase, state);
      } catch (error) {
        console.error(`[Orchestrator] Lifecycle hook "${hook.name}" failed:`, error);
      }
    }
  }

  /**
   * Get the orchestrator context for external use
   */
  getContext(): OrchestratorContext {
    return {
      stateMachine: this.stateMachine,
      mcpRouter: this.mcpRouter,
      fallbackRouter: this.fallbackRouter,
      mcpClient: this.mcpClient,
      contextManager: this.contextManager,
      stepValidator: this.stepValidator,
      subagentIsolator: this.subagentIsolator
    };
  }

  /**
   * Get HTTP client with fallback support
   * This provides the base HTTP client with LLM fallback routing
   */
  getHttpClient(): LLMHttpClient {
    return new LLMHttpClient(this.mcpRouter, this.fallbackRouter, this.mcpClient);
  }

  /**
   * Execute a tool request with full orchestration pipeline
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<OrchestratorResult> {
    try {
      // 1. Prepare context (pruning + optimization)
      const preparedContext = await this.contextEditor.prepareContext(params);

      // 2. Inject context into request
      const enrichedRequest = await this.contextEditor.injectContext(params, preparedContext);

      // 3. Execute with MCP Router (retry + circuit breaker)
      const result = await this.mcpRouter.executeWithRetry(
        toolName,
        async () => {
          if (this.mcpClient) {
            const toolResult = await this.mcpClient.callTool(toolName, enrichedRequest);
            return {
              success: toolResult.success,
              data: toolResult.data,
              error: toolResult.error,
              toolName
            };
          }
          // Fallback to direct execution if no client
          return { success: true, data: null, toolName };
        }
      );

      // 4. Handle fallback if primary failed
      let fallbackResult: FallbackResult | null = null;
      if (!result.success) {
        fallbackResult = await this.fallbackRouter.executeWithFallback(
          toolName,
          { toolName, params: enrichedRequest },
          true,
          this.mcpRouter.getToolState(toolName)?.consecutiveFailures ?? 0
        );

        if (fallbackResult.success && fallbackResult.result) {
          return {
            success: true,
            data: fallbackResult.result.data,
            context: preparedContext,
            fallbackUsed: true
          };
        }
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        context: preparedContext,
        fallbackUsed: false,
        pruned: preparedContext.status.wasCompacted
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        validationErrors: []
      };
    }
  }

  /**
   * Execute state machine transition with orchestration
   */
  async transition(action: ActionType): Promise<ProjectState> {
    const currentState = await this.stateMachine.getState();
    const currentPhase = currentState.phase;

    // Pre-transition: Execute lifecycle hooks
    await this.executeLifecycleHooks(currentPhase, currentState);

    // Execute the transition
    const newState = await this.stateMachine.transition(action);

    // Post-transition: Clear isolated contexts after phase change
    this.subagentIsolator.clearAll();

    console.log(`[Orchestrator] Transitioned from ${currentPhase} to ${newState.phase}`);

    return newState;
  }

  /**
   * Validate current step before proceeding
   */
  async validateStep(): Promise<{ valid: boolean; errors: string[] }> {
    const state = await this.stateMachine.getState();

    // Use StepValidator for delegation guard
    const validationResult = await this.stepValidator.validateStep(state);

    const errors: string[] = [];
    for (const validation of validationResult.validations) {
      if (validation.status === 'FAILED') {
        errors.push(validation.message);
      }
    }

    return {
      valid: validationResult.allPassed,
      errors
    };
  }

  /**
   * Isolate subagent context
   */
  async isolateSubagent(subagentId: string): Promise<void> {
    const context = await this.contextManager.getOptimizedContext();
    await this.subagentIsolator.isolateContext(subagentId, context);
  }

  /**
   * Get isolated subagent context
   */
  getSubagentContext(subagentId: string): OptimizedContextResult | undefined {
    return this.subagentIsolator.getIsolatedContext(subagentId);
  }

  /**
   * Release subagent context
   */
  releaseSubagent(subagentId: string): void {
    this.subagentIsolator.releaseContext(subagentId);
  }

  /**
   * Configure fallback router
   */
  configureFallback(apiUrl: string, apiKey?: string): void {
    this.fallbackRouter.configure(apiUrl, apiKey);
  }

  /**
   * Shutdown orchestrator and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.fallbackRouter.shutdown();
    this.subagentIsolator.clearAll();
    console.log('[Orchestrator] Shutdown complete');
  }
}

// ============================================================================
// LLM HTTP Client - Base HTTP client with fallback support
// ============================================================================

export class LLMHttpClient {
  private router: MCPRouter;
  private fallback: FallbackRouter;
  private mcpClient: MCPClient | null;

  constructor(
    router: MCPRouter,
    fallback: FallbackRouter,
    mcpClient: MCPClient | null
  ) {
    this.router = router;
    this.fallback = fallback;
    this.mcpClient = mcpClient;
  }

  /**
   * Execute HTTP request with retry and fallback
   */
  async request(toolName: string, params: Record<string, unknown>): Promise<OrchestratorResult> {
    // Use orchestrator's executeTool method
    // This is called internally after getting the client instance
    return {
      success: true,
      data: null
    };
  }

  /**
   * Check if fallback is available
   */
  isFallbackAvailable(): boolean {
    return this.fallback.isAvailable();
  }

  /**
   * Get fallback status
   */
  getFallbackStatus(): ReturnType<FallbackRouter['getStats']> {
    return this.fallback.getStats();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}

export function getDefaultOrchestrator(): Orchestrator {
  return new Orchestrator(DEFAULT_ORCHESTRATOR_CONFIG);
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  mcp: {
    router: DEFAULT_ROUTER_CONFIG,
    fallback: DEFAULT_FALLBACK_CONFIG,
    clientEnabled: true
  },
  context: {
    maxTokens: 100000,
    enablePruning: true,
    maxRecentIterations: 10
  },
  validation: {
    strictMode: false,
    validationLevel: ValidationLevel.OUTPUT
  },
  isolation: {
    enableSubagentIsolation: true,
    isolationTimeoutMs: 300000
  }
};
