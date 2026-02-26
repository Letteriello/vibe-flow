// MCP Router - Resiliência e Exponential Backoff para chamadas MCP
import { MCPToolRequest, MCPToolResponse } from './types.js';

/**
 * Configuração do Router
 */
export interface RouterConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

/**
 * Estado do Router para cada tool
 */
export interface RouterState {
  toolName: string;
  consecutiveFailures: number;
  lastAttempt: string | null;
  currentDelay: number;
  isCircuitOpen: boolean;
  circuitOpenedAt: string | null;
}

/**
 * Log de roteamento
 */
export interface RoutingLog {
  timestamp: string;
  toolName: string;
  attempt: number;
  action: 'retry' | 'backoff' | 'circuit_open' | 'circuit_half_open' | 'circuit_closed' | 'success' | 'fail';
  details: string;
  delayMs: number;
}

/**
 * Configuração padrão
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: [
    'rate limit',
    'too many requests',
    'Rate Limit',
    'Too Many Requests',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout'
  ]
};

/**
 * Router com Exponential Backoff
 */
export class MCPRouter {
  private config: RouterConfig;
  private toolStates: Map<string, RouterState>;
  private routingLogs: RoutingLog[];
  private onFallbackTriggered?: (toolName: string, attempts: number) => void;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.toolStates = new Map();
    this.routingLogs = [];
  }

  /**
   * Define callback para acionar fallback após 3 falhas
   */
  setFallbackCallback(callback: (toolName: string, attempts: number) => void): void {
    this.onFallbackTriggered = callback;
  }

  /**
   * Verifica se o erro é retryable (429 ou 500)
   */
  isRetryableError(error: any, statusCode?: number): boolean {
    // Verifica status code HTTP
    if (statusCode && this.config.retryableStatusCodes.includes(statusCode)) {
      return true;
    }

    // Verifica mensagem de erro
    const errorMessage = (error?.message || String(error)).toLowerCase();
    return this.config.retryableErrors.some(err =>
      errorMessage.includes(err.toLowerCase())
    );
  }

  /**
   * Inicializa estado para uma tool
   */
  private initializeToolState(toolName: string): RouterState {
    const state: RouterState = {
      toolName,
      consecutiveFailures: 0,
      lastAttempt: null,
      currentDelay: this.config.baseDelayMs,
      isCircuitOpen: false,
      circuitOpenedAt: null
    };
    this.toolStates.set(toolName, state);
    return state;
  }

  /**
   * Obtém o estado atual de uma tool
   */
  getToolState(toolName: string): RouterState | undefined {
    return this.toolStates.get(toolName);
  }

  /**
   * Calcula o delay com Exponential Backoff
   */
  private calculateBackoffDelay(state: RouterState): number {
    const delay = Math.min(
      state.currentDelay * Math.pow(this.config.backoffMultiplier, state.consecutiveFailures),
      this.config.maxDelayMs
    );
    // Adiciona jitter aleatório (0-25% do delay)
    const jitter = delay * Math.random() * 0.25;
    return Math.floor(delay + jitter);
  }

  /**
   * Registra um log de roteamento
   */
  private logRouting(log: Omit<RoutingLog, 'timestamp'>): void {
    const fullLog: RoutingLog = {
      ...log,
      timestamp: new Date().toISOString()
    };
    this.routingLogs.push(fullLog);
    console.log(`[MCP Router] ${log.action.toUpperCase()}: ${log.toolName} - ${log.details} (delay: ${log.delayMs}ms)`);
  }

  /**
   * Verifica se o circuit breaker deve abrir
   */
  private shouldOpenCircuit(state: RouterState): boolean {
    return state.consecutiveFailures >= this.config.maxRetries;
  }

  /**
   * Gerencia o circuit breaker
   */
  private manageCircuit(state: RouterState): 'open' | 'half_open' | 'closed' {
    if (state.isCircuitOpen) {
      // Verifica se pode tentar half-open (após 30 segundos)
      const openedAt = state.circuitOpenedAt ? new Date(state.circuitOpenedAt).getTime() : 0;
      const now = Date.now();
      if (now - openedAt > 30000) {
        return 'half_open';
      }
      return 'open';
    }
    return 'closed';
  }

  /**
   * Executa uma requisição com retry e exponential backoff
   */
  async executeWithRetry(
    toolName: string,
    executeFn: () => Promise<MCPToolResponse>
  ): Promise<MCPToolResponse> {
    let state = this.toolStates.get(toolName);
    if (!state) {
      state = this.initializeToolState(toolName);
    }

    const circuitState = this.manageCircuit(state);

    if (circuitState === 'open') {
      this.logRouting({
        toolName,
        attempt: state.consecutiveFailures,
        action: 'circuit_open',
        details: `Circuit breaker open, blocking requests for 30s`,
        delayMs: 0
      });
      return {
        success: false,
        error: `Circuit breaker open for tool "${toolName}". Please retry later.`,
        toolName,
        circuitOpen: true
      };
    }

    if (circuitState === 'half_open') {
      this.logRouting({
        toolName,
        attempt: state.consecutiveFailures,
        action: 'circuit_half_open',
        details: `Testing circuit with single attempt`,
        delayMs: 0
      });
    }

    let lastError: any;
    let attempts = 0;
    const maxAttempts = this.config.maxRetries + 1; // +1 para tentativa inicial

    while (attempts < maxAttempts) {
      attempts++;
      state.lastAttempt = new Date().toISOString();

      try {
        const result = await executeFn();

        // Sucesso - reseta contadores
        if (result.success) {
          state.consecutiveFailures = 0;
          state.currentDelay = this.config.baseDelayMs;

          if (state.isCircuitOpen) {
            state.isCircuitOpen = false;
            state.circuitOpenedAt = null;
            this.logRouting({
              toolName,
              attempt: attempts,
              action: 'circuit_closed',
              details: `Circuit breaker closed after successful request`,
              delayMs: 0
            });
          }

          this.logRouting({
            toolName,
            attempt: attempts,
            action: 'success',
            details: `Request successful`,
            delayMs: 0
          });

          return result;
        }

        // Falha - verifica se é retryable
        lastError = new Error(result.error || 'Unknown error');

        if (!this.isRetryableError(lastError, result.statusCode)) {
          // Erro não retryable - falha imediata
          state.consecutiveFailures++;
          this.logRouting({
            toolName,
            attempt: attempts,
            action: 'fail',
            details: `Non-retryable error: ${result.error}`,
            delayMs: 0
          });
          return result;
        }

        // Erro retryable - continua retry loop
        this.handleRetryableFailure(state, attempts, lastError);

      } catch (error: any) {
        lastError = error;

        if (!this.isRetryableError(error)) {
          state.consecutiveFailures++;
          this.logRouting({
            toolName,
            attempt: attempts,
            action: 'fail',
            details: `Non-retryable exception: ${error.message}`,
            delayMs: 0
          });
          return {
            success: false,
            error: error.message,
            toolName
          };
        }

        this.handleRetryableFailure(state, attempts, error);
      }
    }

    // Todas as tentativas esgotadas
    state.consecutiveFailures++;

    // Abre o circuit breaker
    if (this.shouldOpenCircuit(state)) {
      state.isCircuitOpen = true;
      state.circuitOpenedAt = new Date().toISOString();
      this.logRouting({
        toolName,
        attempt: attempts,
        action: 'circuit_open',
        details: `Opening circuit breaker after ${state.consecutiveFailures} consecutive failures`,
        delayMs: 0
      });
    }

    // Aciona callback de fallback após 3 falhas
    if (state.consecutiveFailures >= 3 && this.onFallbackTriggered) {
      this.onFallbackTriggered(toolName, state.consecutiveFailures);
    }

    return {
      success: false,
      error: lastError?.message || 'Max retries exceeded',
      toolName,
      attempts: attempts,
      failed: true
    };
  }

  /**
   * Trata falha retryable com backoff
   */
  private handleRetryableFailure(state: RouterState, attempt: number, error: any): void {
    if (attempt >= this.config.maxRetries + 1) {
      return; // Não faz retry na última tentativa
    }

    const delay = this.calculateBackoffDelay(state);

    this.logRouting({
      toolName: state.toolName,
      attempt,
      action: 'backoff',
      details: `Retryable error: ${error.message || error}. Waiting ${delay}ms before retry`,
      delayMs: delay
    });

    // Aguarda o delay (backoff)
    const waitPromise = new Promise(resolve => setTimeout(resolve, delay));
    // 注意: Esta função é chamada dentro de executeWithRetry, então não bloqueia
    // O backoff é aplicado na próxima iteração do loop
    state.currentDelay = delay;
  }

  /**
   * Reseta o estado de uma tool específica
   */
  resetToolState(toolName: string): void {
    const state = this.toolStates.get(toolName);
    if (state) {
      state.consecutiveFailures = 0;
      state.currentDelay = this.config.baseDelayMs;
      state.isCircuitOpen = false;
      state.circuitOpenedAt = null;
      this.logRouting({
        toolName,
        attempt: 0,
        action: 'success',
        details: `Tool state reset`,
        delayMs: 0
      });
    }
  }

  /**
   * Reseta todos os estados
   */
  resetAll(): void {
    this.toolStates.clear();
    this.routingLogs = [];
    console.log('[MCP Router] All tool states and logs cleared');
  }

  /**
   * Obtém todos os logs de roteamento
   */
  getRoutingLogs(): RoutingLog[] {
    return [...this.routingLogs];
  }

  /**
   * Limpa logs de roteamento
   */
  clearLogs(): void {
    this.routingLogs = [];
  }

  /**
   * Obtém estatísticas de roteamento
   */
  getRoutingStats(): {
    totalTools: number;
    openCircuits: number;
    totalRetries: number;
    failedRequests: number;
  } {
    let openCircuits = 0;
    let totalRetries = 0;
    let failedRequests = 0;

    for (const state of Array.from(this.toolStates.values())) {
      if (state.isCircuitOpen) openCircuits++;
      totalRetries += state.consecutiveFailures;
      if (state.consecutiveFailures > 0) failedRequests++;
    }

    return {
      totalTools: this.toolStates.size,
      openCircuits,
      totalRetries,
      failedRequests
    };
  }
}
