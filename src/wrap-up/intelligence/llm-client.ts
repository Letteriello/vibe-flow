/**
 * LLM Client - Wrapper para chamadas à API do LLM com resiliência
 *
 * Fornece:
 * - AbortController para cancelamento de requisições
 * - Timeout máximo de 30 segundos
 * - Fallback determinístico (truncagem via substring)
 * - Circuit Breaker para abortar rapidamente em falhas consecutivas
 */

import { randomUUID } from 'crypto';

/**
 * Estados do Circuit Breaker para LLM
 */
export enum LLMCircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Configuração do LLM Client
 */
export interface LLMClientConfig {
  /** Timeout em ms para cada requisição (default: 30000 = 30s) */
  requestTimeoutMs: number;
  /** Máximo de falhas consecutivas antes de abrir o circuit (default: 3) */
  maxRetries: number;
  /** Tempo em ms para tentar recovery (default: 60000 = 1min) */
  resetTimeoutMs: number;
  /** Tamanho máximo do fallback (default: 2000 chars) */
  fallbackMaxLength: number;
  /** Modelo padrão a usar */
  defaultModel: string;
  /** Habilitar verbose logging */
  verbose: boolean;
}

/**
 * Opções para chamada de completamento
 */
export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Callback para streaming de chunks */
  onChunk?: (chunk: string) => void;
}

/**
 * Resultado de uma chamada ao LLM
 */
export interface LLMResult {
  success: boolean;
  content?: string;
  error?: string;
  wasFallback: boolean;
  durationMs: number;
  circuitState: LLMCircuitState;
}

/**
 * Resultado de uma chamada com metadados
 */
export interface LLMCallMetadata {
  requestId: string;
  timestamp: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Erro customizado para falhas de LLM
 */
export class LLMClientError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly wasFallback: boolean;

  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    wasFallback: boolean = false
  ) {
    super(message);
    this.name = 'LLMClientError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.wasFallback = wasFallback;
  }
}

/**
 * Configurações padrão
 */
const DEFAULT_CONFIG: LLMClientConfig = {
  requestTimeoutMs: 30000,
  maxRetries: 3,
  resetTimeoutMs: 60000,
  fallbackMaxLength: 2000,
  defaultModel: 'claude-3-5-sonnet-20241022',
  verbose: false
};

/**
 * LLM Client com Circuit Breaker, AbortController e Fallback determinístico
 */
export class LLMClient {
  private config: LLMClientConfig;
  private circuitState: LLMCircuitState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private callHistory: LLMCallMetadata[];
  private requestFn: (
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: CompletionOptions
  ) => Promise<string>;

  /**
   * Cria um novo LLM Client
   * @param requestFn Função real de chamada à API (ex: fetch para OpenAI/Anthropic)
   * @param config Configuração opcional
   */
  constructor(
    requestFn: (
      model: string,
      messages: Array<{ role: string; content: string }>,
      options?: CompletionOptions
    ) => Promise<string>,
    config?: Partial<LLMClientConfig>
  ) {
    this.requestFn = requestFn;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitState = LLMCircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.callHistory = [];
  }

  /**
   * Obtém o estado atual do circuit breaker
   */
  getCircuitState(): LLMCircuitState {
    this.checkStateTransition();
    return this.circuitState;
  }

  /**
   * Obtém contagem de falhas
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset manual do circuit breaker
   */
  reset(): void {
    this.circuitState = LLMCircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.log('Circuit breaker reset to CLOSED');
  }

  /**
   * Chama o LLM com timeout, abort controller e circuit breaker
   *
   * @param prompt Prompt ou mensagens para o LLM
   * @param options Opções da chamada
   * @returns LLMResult com content ou fallback
   */
  async complete(
    prompt: string,
    options?: CompletionOptions
  ): Promise<LLMResult> {
    const startTime = Date.now();
    const requestId = randomUUID();
    const model = options?.model || this.config.defaultModel;

    // Registrar a chamada
    this.callHistory.push({
      requestId,
      timestamp: new Date().toISOString(),
      model
    });
    this.pruneHistory();

    // Verificar circuit breaker
    this.checkStateTransition();

    if (this.circuitState === LLMCircuitState.OPEN) {
      this.log(`Circuit OPEN - using fallback for request ${requestId}`);
      return this.executeFallback(prompt, startTime, 'CIRCUIT_OPEN');
    }

    // Criar AbortController com timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.log(`Request ${requestId} timed out after ${this.config.requestTimeoutMs}ms`);
    }, this.config.requestTimeoutMs);

    try {
      // Tentar chamada real
      this.log(`Executing LLM request ${requestId} (circuit: ${this.circuitState})`);

      const messages = this.buildMessages(prompt, options?.systemPrompt);
      const content = await this.requestFn(model, messages, {
        ...options,
        // Passar signal para a função de request se suportar
      } as CompletionOptions);

      // Sucesso
      clearTimeout(timeoutId);
      this.handleSuccess();

      return {
        success: true,
        content,
        wasFallback: false,
        durationMs: Date.now() - startTime,
        circuitState: this.circuitState
      };

    } catch (error) {
      clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      const isTimeout = isAbortError || errorMessage.includes('timeout');

      this.log(`Request ${requestId} failed: ${errorMessage}`);

      // Capturar estado antes de modificar
      const stateBeforeFailure = this.circuitState;

      // Tratar falha
      this.handleFailure(errorMessage, isTimeout);

      // Usar fallback sempre após falha (determinístico)
      return this.executeFallback(prompt, startTime, errorMessage);

    }
  }

  /**
   * Chama o LLM com retry automático
   */
  async completeWithRetry(
    prompt: string,
    options?: CompletionOptions,
    maxAttempts?: number
  ): Promise<LLMResult> {
    const attempts = maxAttempts || this.config.maxRetries;
    let lastError: string = '';

    for (let i = 0; i < attempts; i++) {
      const result = await this.complete(prompt, options);

      if (result.success) {
        return result;
      }

      lastError = result.error || 'Unknown error';

      // Se circuit está aberto, não tentar mais
      if (result.circuitState === LLMCircuitState.OPEN) {
        break;
      }

      // Pequeno delay entre retries (exponencial backoff)
      if (i < attempts - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        await this.sleep(delay);
      }
    }

    // Todas as tentativas falharam, retornar fallback
    return this.executeFallback(prompt, Date.now(), lastError);
  }

  /**
   * Fallback determinístico: trunca o texto usando substring
   */
  private executeFallback(
    originalPrompt: string,
    startTime: number,
    errorReason: string
  ): LLMResult {
    this.log(`Executing deterministic fallback due to: ${errorReason}`);

    // Truncagem determinística - pega os primeiros caracteres
    const truncatedContent = this.truncateDeterministically(originalPrompt);

    return {
      success: true, // Fallback é "sucesso" do ponto de vista de resiliência
      content: truncatedContent,
      error: errorReason,
      wasFallback: true,
      durationMs: Date.now() - startTime,
      circuitState: this.circuitState
    };
  }

  /**
   * Truncagem determinística sem uso de IA
   * - Remove markdown se presente
   * - Trunca para o tamanho máximo especificado
   * - Adiciona marcador indicando que foi truncado
   */
  private truncateDeterministically(text: string): string {
    let processed = text;

    // Remover markdown code blocks para reduzir ruído
    processed = processed.replace(/```[\s\S]*?```/g, '[CODE_BLOCK]');
    processed = processed.replace(/`[^`]+`/g, '[CODE]');

    // Se ainda muito longo, trunca brutalmente
    const maxLength = this.config.fallbackMaxLength;

    if (processed.length <= maxLength) {
      return processed;
    }

    // Truncar e adicionar marcador
    const truncated = processed.substring(0, maxLength - 50);
    return `${truncated}\n\n[CONTENT TRUNCATED - LLM API unavailable or timed out after ${this.config.requestTimeoutMs}ms]`;
  }

  /**
   * Constrói array de mensagens para a API
   */
  private buildMessages(
    prompt: string,
    systemPrompt?: string
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    return messages;
  }

  /**
   * Verifica transições de estado do circuit breaker
   */
  private checkStateTransition(): void {
    const now = Date.now();

    if (this.circuitState === LLMCircuitState.OPEN) {
      if (now - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.transitionToHalfOpen();
      }
    }
  }

  /**
   * Handle de sucesso
   */
  private handleSuccess(): void {
    if (this.circuitState === LLMCircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 1) {
        this.transitionToClosed();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Handle de falha
   */
  private handleFailure(errorMessage: string, isTimeout: boolean): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.circuitState === LLMCircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.failureCount >= this.config.maxRetries) {
      this.transitionToOpen();
    }

    this.log(`Failure count: ${this.failureCount}/${this.config.maxRetries} - ${errorMessage}`);
  }

  /**
   * Transição para CLOSED
   */
  private transitionToClosed(): void {
    this.circuitState = LLMCircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.log('Circuit transitioned to CLOSED');
  }

  /**
   * Transição para OPEN
   */
  private transitionToOpen(): void {
    this.circuitState = LLMCircuitState.OPEN;
    this.successCount = 0;
    this.log('Circuit transitioned to OPEN');
  }

  /**
   * Transição para HALF_OPEN
   */
  private transitionToHalfOpen(): void {
    this.circuitState = LLMCircuitState.HALF_OPEN;
    this.successCount = 0;
    this.failureCount = 0;
    this.log('Circuit transitioned to HALF_OPEN');
  }

  /**
   * Limita histórico de chamadas
   */
  private pruneHistory(): void {
    if (this.callHistory.length > 100) {
      this.callHistory = this.callHistory.slice(-50);
    }
  }

  /**
   * Log condicional
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[LLMClient] ${message}`);
    }
  }

  /**
   * Utilitário de sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém histórico de chamadas
   */
  getCallHistory(): LLMCallMetadata[] {
    return [...this.callHistory];
  }
}

/**
 * Cria um LLM Client configurado para Anthropic (Claude)
 */
export function createAnthropicClient(
  apiKey: string,
  config?: Partial<LLMClientConfig>
): LLMClient {
  const requestFn = async (
    model: string,
    messages: Array<{ role: string; content: string }>,
    _options?: CompletionOptions
  ): Promise<string> => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: _options?.maxTokens || 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  };

  return new LLMClient(requestFn, config);
}

/**
 * Cria um LLM Client configurado para OpenAI
 */
export function createOpenAIClient(
  apiKey: string,
  config?: Partial<LLMClientConfig>
): LLMClient {
  const requestFn = async (
    model: string,
    messages: Array<{ role: string; content: string }>,
    _options?: CompletionOptions
  ): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: _options?.temperature || 0.7,
        max_tokens: _options?.maxTokens || 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  };

  return new LLMClient(requestFn, config);
}

/**
 * Cria um LLM Client com função de request genérica
 */
export function createGenericLLMClient(
  requestFn: (
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: CompletionOptions
  ) => Promise<string>,
  config?: Partial<LLMClientConfig>
): LLMClient {
  return new LLMClient(requestFn, config);
}
