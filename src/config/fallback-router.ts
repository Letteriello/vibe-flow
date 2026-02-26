/**
 * LLM Fallback Router - Resiliência para APIs de LLMs
 *
 * Intercepta requisições de API para LLMs e redireciona para
 * provedores alternativos em caso de falhas (Rate Limit, erros de servidor).
 */

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Tipos de erros que disparam fallback
 */
export type FallbackTriggerError = 'rate_limit' | 'server_error' | 'timeout' | 'network_error';

/**
 * Configuração de um provedor LLM
 */
export interface LLMProviderConfig {
  /** Identificador único do provedor */
  id: string;
  /** Nome amigável do provedor */
  name: string;
  /** URL base da API */
  baseUrl: string;
  /** Chave da API (opcional) */
  apiKey?: string;
  /** Headers adicionais */
  headers?: Record<string, string>;
  /** Timeout em ms */
  timeoutMs: number;
  /** Se este provedor está habilitado */
  enabled: boolean;
}

/**
 * Configuração do Router
 */
export interface LLMFallbackRouterConfig {
  /** Lista de provedores em ordem de preferência */
  providers: LLMProviderConfig[];
  /** Timeout padrão para requisições */
  defaultTimeoutMs: number;
  /** Número máximo de tentativas por provedor */
  maxRetries: number;
  /** Intervalo entre tentativas em ms */
  retryDelayMs: number;
  /** Se deve registrar logs detalhados */
  verboseLogging: boolean;
}

/**
 * Estado atual do Router
 */
export interface LLMFallbackRouterState {
  /** Índice do provedor atual */
  currentProviderIndex: number;
  /** Número de falhas consecutivas */
  consecutiveFailures: number;
  /** Se o fallback está ativo */
  isFallbackActive: boolean;
  /** Timestamp da última falha */
  lastFailureAt: string | null;
  /** Timestamp da última alternância de provedor */
  lastProviderSwitchAt: string | null;
}

/**
 * Resultado de uma requisição via Router
 */
export interface LLMFallbackResult<T = unknown> {
  /** Se a requisição foi bem-sucedida */
  success: boolean;
  /** Dados retornados */
  data?: T;
  /** Erro message (se falhou) */
  error?: string;
  /** Provedor que respondeu */
  providerUsed: string;
  /** Provedores tentados */
  providersAttempted: string[];
  /** Número de tentativas */
  attempts: number;
  /** Tipo de trigger que causou fallback */
  fallbackTrigger?: FallbackTriggerError;
}

/**
 * Log de evento de fallback
 */
export interface FallbackLogEvent {
  timestamp: string;
  action: 'request_start' | 'request_success' | 'request_failure' | 'fallback_triggered' | 'provider_switch' | 'all_providers_failed';
  provider: string;
  targetProvider?: string;
  error?: string;
  attempts: number;
}

/**
 * Configuração padrão
 */
export const DEFAULT_ROUTER_CONFIG: LLMFallbackRouterConfig = {
  providers: [],
  defaultTimeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 1000,
  verboseLogging: true
};

/**
 * Erros que disparam fallback automático
 */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'RATE_LIMIT',
  '429',
  'too many requests',
  'TOO_MANY_REQUESTS',
  'quota exceeded',
  'QUOTA_EXCEEDED'
];

const SERVER_ERROR_PATTERNS = [
  '500',
  '502',
  '503',
  '504',
  'server error',
  'SERVER_ERROR',
  'internal server error',
  'bad gateway',
  'service unavailable'
];

const TIMEOUT_PATTERNS = [
  'timeout',
  'TIMEOUT',
  'etimedout',
  'ECONNREFUSED',
  'connection refused'
];

const NETWORK_ERROR_PATTERNS = [
  'network',
  'NETWORK',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'fetch failed'
];

/**
 * LLM Fallback Router - Camada de resiliência para APIs de LLMs
 *
 * Este router intercepta todas as requisições de API para LLMs.
 * Se a chamada principal falhar por Rate Limit ou erros de servidor,
 * o router captura a exceção silenciosamente e redireciona o mesmo payload
 * para o próximo modelo/provedor configurado na lista de fallback.
 */
export class LLMFallbackRouter {
  private config: LLMFallbackRouterConfig;
  private state: LLMFallbackRouterState;
  private logs: FallbackLogEvent[] = [];
  private stateFilePath: string | null = null;

  constructor(config: Partial<LLMFallbackRouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.state = {
      currentProviderIndex: 0,
      consecutiveFailures: 0,
      isFallbackActive: false,
      lastFailureAt: null,
      lastProviderSwitchAt: null
    };

    // Inicializar path do arquivo de estado
    this.initStatePath();
  }

  /**
   * Inicializa o path do arquivo de estado
   */
  private async initStatePath(): Promise<void> {
    try {
      const vibeFlowDir = join(process.cwd(), '.vibe-flow');
      await fs.mkdir(vibeFlowDir, { recursive: true });
      this.stateFilePath = join(vibeFlowDir, 'llm-fallback-state.json');
      await this.loadState();
    } catch {
      // Silencioso - usa estado em memória
    }
  }

  /**
   * Carrega estado persistido
   */
  private async loadState(): Promise<void> {
    if (!this.stateFilePath) return;

    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const savedState = JSON.parse(content);
      this.state = { ...this.state, ...savedState };
    } catch {
      // Silencioso - usa estado padrão
    }
  }

  /**
   * Salva estado para persistência
   */
  private async saveState(): Promise<void> {
    if (!this.stateFilePath) return;

    try {
      await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Silencioso - não bloqueia execução
    }
  }

  /**
   * Configura provedores
   */
  setProviders(providers: LLMProviderConfig[]): void {
    this.config.providers = providers;
    this.state.currentProviderIndex = 0;
    this.log('request_start', this.getCurrentProvider()?.id || 'none', 'Providers configured');
  }

  /**
   * Adiciona um provedor à lista
   */
  addProvider(provider: LLMProviderConfig): void {
    this.config.providers.push(provider);
  }

  /**
   * Remove um provedor pelo ID
   */
  removeProvider(providerId: string): void {
    this.config.providers = this.config.providers.filter(p => p.id !== providerId);
    if (this.state.currentProviderIndex >= this.config.providers.length) {
      this.state.currentProviderIndex = Math.max(0, this.config.providers.length - 1);
    }
  }

  /**
   * Obtém o provedor atual
   */
  getCurrentProvider(): LLMProviderConfig | null {
    return this.config.providers[this.state.currentProviderIndex] || null;
  }

  /**
   * Obtém todos os provedores configurados
   */
  getProviders(): LLMProviderConfig[] {
    return [...this.config.providers];
  }

  /**
   * Obtém o estado atual do router
   */
  getState(): LLMFallbackRouterState {
    return { ...this.state };
  }

  /**
   * Obtém os logs de fallback
   */
  getLogs(): FallbackLogEvent[] {
    return [...this.logs];
  }

  /**
   * Limpa os logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Reseta o router para o provedor primário
   */
  reset(): void {
    this.state.currentProviderIndex = 0;
    this.state.consecutiveFailures = 0;
    this.state.isFallbackActive = false;
    this.state.lastFailureAt = null;
    this.saveState();
    this.log('provider_switch', this.getCurrentProvider()?.id || 'none', 'Router reset to primary');
  }

  /**
   * Executa uma requisição com fallback automático
   *
   * @param payload - Payload a ser enviado para o LLM
   * @param makeRequest - Função que executa a requisição real
   * @returns Resultado da requisição
   */
  async executeWithFallback<T = unknown>(
    payload: unknown,
    makeRequest: (provider: LLMProviderConfig, requestPayload: unknown) => Promise<T>
  ): Promise<LLMFallbackResult<T>> {
    const providersAttempted: string[] = [];
    const enabledProviders = this.config.providers.filter(p => p.enabled);

    if (enabledProviders.length === 0) {
      return {
        success: false,
        error: 'No enabled providers configured',
        providerUsed: '',
        providersAttempted: [],
        attempts: 0
      };
    }

    this.log('request_start', enabledProviders[this.state.currentProviderIndex]?.id || 'none', 'Starting request');

    let lastError: string | undefined;
    let fallbackTrigger: FallbackTriggerError | undefined;

    // Tentar cada provedor em sequência
    for (
      let i = this.state.currentProviderIndex;
      i < enabledProviders.length;
      i++
    ) {
      const provider = enabledProviders[i];
      providersAttempted.push(provider.id);

      // Tentar com retries
      for (let retry = 0; retry <= this.config.maxRetries; retry++) {
        try {
          if (this.config.verboseLogging) {
            console.log(`[LLMFallbackRouter] Attempting ${provider.name} (attempt ${retry + 1})`);
          }

          const data = await this.executeWithTimeout(
            makeRequest,
            provider,
            payload,
            provider.timeoutMs || this.config.defaultTimeoutMs
          );

          // Sucesso - registra e retorna
          this.onSuccess(provider.id);
          this.log('request_success', provider.id, `Success on ${provider.name}`, providersAttempted.length);

          return {
            success: true,
            data,
            providerUsed: provider.id,
            providersAttempted,
            attempts: providersAttempted.length,
            fallbackTrigger
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          lastError = errorMessage;

          // Determina o tipo de erro e se deve fazer fallback
          const trigger = this.classifyError(errorMessage);

          if (trigger) {
            fallbackTrigger = trigger;
            if (this.config.verboseLogging) {
              console.warn(`[LLMFallbackRouter] ${trigger} detected on ${provider.name}: ${errorMessage}`);
            }
            // Não faz retry para erros de rate limit ou servidor - vai para próximo provedor
            break;
          }

          // Erro não-classificável - tenta novamente
          if (retry < this.config.maxRetries) {
            await this.delay(this.config.retryDelayMs * (retry + 1));
          }
        }
      }

      // Falhou com este provedor - tenta próximo
      if (i < enabledProviders.length - 1) {
        this.state.currentProviderIndex = i + 1;
        this.state.isFallbackActive = true;
        this.state.lastProviderSwitchAt = new Date().toISOString();
        fallbackTrigger = fallbackTrigger || 'server_error';

        this.log('fallback_triggered', provider.id, `Switching to next provider`, providersAttempted.length);

        if (this.config.verboseLogging) {
          console.warn(`[LLMFallbackRouter] Falling back from ${provider.name} to ${enabledProviders[i + 1]?.name}`);
        }
      }
    }

    // Todos os provedores falharam
    this.onFailure();
    this.log('all_providers_failed', providersAttempted[providersAttempted.length - 1] || 'none', lastError || 'Unknown error', providersAttempted.length);

    if (this.config.verboseLogging) {
      console.error(`[LLMFallbackRouter] All providers failed. Last error: ${lastError}`);
    }

    return {
      success: false,
      error: lastError,
      providerUsed: providersAttempted[providersAttempted.length - 1] || '',
      providersAttempted,
      attempts: providersAttempted.length,
      fallbackTrigger
    };
  }

  /**
   * Executa uma função com timeout
   */
  private async executeWithTimeout<T>(
    fn: (provider: LLMProviderConfig, payload: unknown) => Promise<T>,
    provider: LLMProviderConfig,
    payload: unknown,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn(provider, payload)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Classifica o erro e determina se deve fazer fallback
   */
  private classifyError(errorMessage: string): FallbackTriggerError | null {
    const lowerError = errorMessage.toLowerCase();

    // Rate Limit
    if (RATE_LIMIT_PATTERNS.some(p => lowerError.includes(p.toLowerCase()))) {
      return 'rate_limit';
    }

    // Server Error
    if (SERVER_ERROR_PATTERNS.some(p => lowerError.includes(p.toLowerCase()))) {
      return 'server_error';
    }

    // Timeout
    if (TIMEOUT_PATTERNS.some(p => lowerError.includes(p.toLowerCase()))) {
      return 'timeout';
    }

    // Network Error
    if (NETWORK_ERROR_PATTERNS.some(p => lowerError.includes(p.toLowerCase()))) {
      return 'network_error';
    }

    return null;
  }

  /**
   * Registra sucesso
   */
  private onSuccess(providerId: string): void {
    this.state.consecutiveFailures = 0;
    this.state.currentProviderIndex = 0;
    this.state.isFallbackActive = false;
    this.saveState();
  }

  /**
   * Registra falha
   */
  private onFailure(): void {
    this.state.consecutiveFailures++;
    this.state.lastFailureAt = new Date().toISOString();
    this.saveState();
  }

  /**
   * Registra um evento de log
   */
  private log(
    action: FallbackLogEvent['action'],
    provider: string,
    details: string,
    attempts: number = 1
  ): void {
    const event: FallbackLogEvent = {
      timestamp: new Date().toISOString(),
      action,
      provider,
      error: details,
      attempts
    };

    this.logs.push(event);

    // Mantém apenas os últimos 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }

    // Log no console
    if (this.config.verboseLogging) {
      const prefix = '[LLMFallbackRouter]';
      switch (action) {
        case 'request_start':
          console.log(`${prefix} → ${provider}: Starting request`);
          break;
        case 'request_success':
          console.log(`${prefix} ✓ ${provider}: Success`);
          break;
        case 'fallback_triggered':
          console.warn(`${prefix} ↻ ${provider}: Fallback triggered - ${details}`);
          break;
        case 'provider_switch':
          console.warn(`${prefix} ⇄ ${provider}: Provider switched`);
          break;
        case 'all_providers_failed':
          console.error(`${prefix} ✗ All providers failed: ${details}`);
          break;
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém estatísticas do router
   */
  getStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    fallbackCount: number;
    currentProvider: string | null;
    isFallbackActive: boolean;
    consecutiveFailures: number;
  } {
    const total = this.logs.filter(l => l.action === 'request_start').length;
    const successful = this.logs.filter(l => l.action === 'request_success').length;
    const failed = this.logs.filter(l => l.action === 'all_providers_failed').length;
    const fallbackCount = this.logs.filter(l => l.action === 'fallback_triggered').length;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      fallbackCount,
      currentProvider: this.getCurrentProvider()?.id || null,
      isFallbackActive: this.state.isFallbackActive,
      consecutiveFailures: this.state.consecutiveFailures
    };
  }

  /**
   * Verifica se o fallback está disponível
   */
  isAvailable(): boolean {
    return this.config.providers.filter(p => p.enabled).length > 1;
  }

  /**
   * Obtém configuração do router
   */
  getConfig(): LLMFallbackRouterConfig {
    return { ...this.config };
  }

  /**
   * Atualiza configuração
   */
  updateConfig(updates: Partial<LLMFallbackRouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Factory para criar router com provedores comuns
 */
export class LLMFallbackRouterFactory {
  /**
   * Cria router com provedores padrão (Claude -> Gemini)
   */
  static createDefault(): LLMFallbackRouter {
    const router = new LLMFallbackRouter({
      defaultTimeoutMs: 30000,
      maxRetries: 2,
      retryDelayMs: 1000,
      verboseLogging: true
    });

    router.setProviders([
      {
        id: 'claude',
        name: 'Claude (Anthropic)',
        baseUrl: 'https://api.anthropic.com/v1',
        timeoutMs: 30000,
        enabled: true
      },
      {
        id: 'gemini',
        name: 'Gemini (Google)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        timeoutMs: 30000,
        enabled: true
      },
      {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        timeoutMs: 30000,
        enabled: true
      }
    ]);

    return router;
  }

  /**
   * Cria router com configuração personalizada
   */
  static create(config: Partial<LLMFallbackRouterConfig>): LLMFallbackRouter {
    return new LLMFallbackRouter(config);
  }
}

export default LLMFallbackRouter;
