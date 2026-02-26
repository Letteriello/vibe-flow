// Rate Limit Handler - Backoff exponencial com Jitter para erros transientes
import * as crypto from 'crypto';

// Tipos de erro de Rate Limit conhecidos
export interface RateLimitError {
  isRateLimit: boolean;
  retryAfterMs?: number;
  provider?: string;
  errorType: RateLimitType;
  rawError: unknown;
}

export enum RateLimitType {
  HTTP_429 = 'HTTP_429',
  OPENAI_RATE_LIMIT = 'OPENAI_RATE_LIMIT',
  ANTHROPIC_RATE_LIMIT = 'ANTHROPIC_RATE_LIMIT',
  CLAUDE_CODE_RATE_LIMIT = 'CLAUDE_CODE_RATE_LIMIT',
  GENERIC_RATE_LIMIT = 'GENERIC_RATE_LIMIT',
  TOKEN_LIMIT = 'TOKEN_LIMIT',
  CONTEXT_LIMIT = 'CONTEXT_LIMIT'
}

// Configuração do backoff
export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
  jitterFactor: number; // 0-1, quantidade de ruído aleatório
  backoffMultiplier: number;
}

// Resultado do retry
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: RateLimitError;
  attempts: number;
  totalDelayMs: number;
}

// Padrões de erro de Rate Limit
const RATE_LIMIT_PATTERNS: Array<{
  type: RateLimitType;
  patterns: RegExp[];
  provider: string;
}> = [
  {
    type: RateLimitType.HTTP_429,
    patterns: [
      /429/,
      /rate\s*limit/i,
      /rate\s*limit\s*exceeded/i,
      /too\s*many\s*requests/i,
      /rate\s*limit\s*error/i
    ],
    provider: 'generic'
  },
  {
    type: RateLimitType.OPENAI_RATE_LIMIT,
    patterns: [
      /openai.*rate\s*limit/i,
      /you.*exceeded.*rate.*limit/i,
      /billing.*hard.*limit/i,
      /tokens.*limit.*exceeded/i,
      /max.*tokens.*exceeded/i
    ],
    provider: 'openai'
  },
  {
    type: RateLimitType.ANTHROPIC_RATE_LIMIT,
    patterns: [
      /anthropic.*rate\s*limit/i,
      /anthropic.*too.*many.*requests/i,
      /claude.*rate.*limit/i,
      /api.*rate.*limit.*exceeded/i,
      /max.*tokens.*limit/i
    ],
    provider: 'anthropic'
  },
  {
    type: RateLimitType.CLAUDE_CODE_RATE_LIMIT,
    patterns: [
      /claude.*code.*rate/i,
      /mcp.*rate.*limit/i,
      /tool.*use.*limit/i,
      /tool.*calls.*limit/i,
      /maximum.*tool.*calls/i
    ],
    provider: 'claude-code'
  },
  {
    type: RateLimitType.TOKEN_LIMIT,
    patterns: [
      /token.*limit/i,
      /max.*token/i,
      /tokens.*exceeded/i,
      /context.*length/i,
      /context.*window/i,
      /message.*too.*long/i,
      /input.*too.*long/i
    ],
    provider: 'generic'
  },
  {
    type: RateLimitType.CONTEXT_LIMIT,
    patterns: [
      /context.*window/i,
      /context.*length/i,
      /context.*exceeded/i,
      /too.*large.*context/i,
      /context.*size.*limit/i
    ],
    provider: 'generic'
  }
];

/**
 * RateLimitHandler - Manipulador de erros de Rate Limit
 *
 * Responsável por:
 * - Detectar erros de rate limit de diferentes provedores (OpenAI, Anthropic, Claude Code)
 * - Extrair retry-after de respostas quando disponível
 * - Calcular delays com backoff exponencial e jitter
 */
export class RateLimitHandler {
  private config: BackoffConfig;

  constructor(config?: Partial<BackoffConfig>) {
    this.config = {
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      maxRetries: 5,
      jitterFactor: 0.3, // 30% de jitter por padrão
      backoffMultiplier: 2,
      ...config
    };
  }

  /**
   * Detecta se um erro é um erro de Rate Limit
   */
  detectRateLimitError(error: unknown): RateLimitError {
    const rawError = error;
    const errorString = this.errorToString(error);

    // Procura Retry-After em headers (para respostas HTTP)
    let retryAfterMs: number | undefined;
    if (this.isObjectWithHeaders(error)) {
      const headers = this.normalizeHeaders(error.headers);
      if (headers['retry-after']) {
        retryAfterMs = this.parseRetryAfter(headers['retry-after']);
      } else if (headers['x-ratelimit-reset']) {
        retryAfterMs = this.parseRateLimitReset(headers['x-ratelimit-reset']);
      }
    }

    // Detecta o tipo de rate limit
    for (const group of RATE_LIMIT_PATTERNS) {
      for (const pattern of group.patterns) {
        if (pattern.test(errorString)) {
          return {
            isRateLimit: true,
            retryAfterMs,
            provider: group.provider,
            errorType: group.type,
            rawError
          };
        }
      }
    }

    // Não é um erro de rate limit
    return {
      isRateLimit: false,
      provider: undefined,
      errorType: RateLimitType.GENERIC_RATE_LIMIT,
      rawError
    };
  }

  /**
   * Verifica se o erro indica rate limit
   */
  isRateLimit(error: unknown): boolean {
    const detection = this.detectRateLimitError(error);
    return detection.isRateLimit;
  }

  /**
   * Extrai o retry-after de uma resposta
   */
  extractRetryAfter(error: unknown): number | undefined {
    const detection = this.detectRateLimitError(error);
    return detection.retryAfterMs;
  }

  /**
   * Calcula o delay com backoff exponencial e jitter
   *
   * Fórmula: delay = min(baseDelay * (multiplier ^ attempt) + jitter, maxDelay)
   * Onde jitter = random(-factor * delay, +factor * delay)
   */
  calculateBackoffWithJitter(attempt: number, suggestedDelay?: number): number {
    // Se há um delay sugerido (do Retry-After), usa-o
    if (suggestedDelay !== undefined && suggestedDelay > 0) {
      // Adiciona um pequeno jitter (10%) ao delay sugerido
      const jitterRange = suggestedDelay * this.config.jitterFactor;
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      return Math.min(
        Math.max(suggestedDelay + jitter, 0),
        this.config.maxDelayMs
      );
    }

    // Calcula backoff exponencial
    const exponentialDelay = this.config.baseDelayMs *
      Math.pow(this.config.backoffMultiplier, attempt);

    // Adiciona jitter
    const jitterRange = exponentialDelay * this.config.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.min(
      Math.max(exponentialDelay + jitter, 0),
      this.config.maxDelayMs
    );
  }

  /**
   * Executa uma operação com retry automático para rate limits
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    onRetry?: (attempt: number, delayMs: number, error: RateLimitError) => void | Promise<void>
  ): Promise<RetryResult<T>> {
    let attempt = 0;
    let totalDelayMs = 0;
    let lastError: RateLimitError | undefined;

    while (attempt < this.config.maxRetries) {
      try {
        const result = await operation();

        if (attempt > 0) {
          console.log(`[RateLimit] Recovery successful on attempt ${attempt + 1}`);
        }

        return {
          success: true,
          result,
          attempts: attempt + 1,
          totalDelayMs
        };
      } catch (error) {
        const rateLimitError = this.detectRateLimitError(error);

        if (!rateLimitError.isRateLimit) {
          // Não é um erro de rate limit, propaga
          return {
            success: false,
            error: rateLimitError,
            attempts: attempt + 1,
            totalDelayMs,
            result: undefined
          };
        }

        lastError = rateLimitError;
        attempt++;

        if (attempt >= this.config.maxRetries) {
          break;
        }

        const delayMs = this.calculateBackoffWithJitter(
          attempt,
          rateLimitError.retryAfterMs
        );
        totalDelayMs += delayMs;

        console.log(
          `[RateLimit] Rate limit detected (${rateLimitError.errorType}). ` +
          `Attempt ${attempt}/${this.config.maxRetries}. ` +
          `Waiting ${Math.round(delayMs)}ms...`
        );

        if (onRetry) {
          await onRetry(attempt, delayMs, rateLimitError);
        }

        await this.sleep(delayMs);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attempt,
      totalDelayMs
    };
  }

  /**
   * Cria uma função de retry wrapper
   */
  createRetryableOperation<T>(
    operation: () => Promise<T>
  ): () => Promise<RetryResult<T>> {
    return () => this.executeWithRetry(operation);
  }

  /**
   * Converte erro para string para análise
   */
  private errorToString(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      // Inclui message, stack e name para matching completo
      return `${error.message} ${error.name} ${error.stack || ''}`;
    }

    if (this.isObjectWithHeaders(error)) {
      return this.stringifyWithBody(error);
    }

    return JSON.stringify(error);
  }

  /**
   * Stringifica erro com body quando disponível
   */
  private stringifyWithBody(error: { message?: unknown; body?: unknown; headers?: unknown }): string {
    const parts: string[] = [];

    if (error.message) {
      parts.push(String(error.message));
    }

    if (error.body) {
      parts.push(JSON.stringify(error.body));
    }

    return parts.join(' ');
  }

  /**
   * Verifica se é objeto com headers
   */
  private isObjectWithHeaders(obj: unknown): obj is { headers: Record<string, unknown> } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'headers' in obj &&
      typeof obj.headers === 'object'
    );
  }

  /**
   * Normaliza headers para lowercase
   */
  private normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = String(value);
    }

    return normalized;
  }

  /**
   * Parses Retry-After header (pode ser segundos ou data HTTP)
   */
  private parseRetryAfter(value: string): number | undefined {
    // Pode ser segundos (number) ou data HTTP
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      return num * 1000; // Converte segundos para ms
    }

    // Data HTTP (ex: "Wed, 21 Oct 2015 07:28:00 GMT")
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return Math.max(date.getTime() - Date.now(), 0);
    }

    return undefined;
  }

  /**
   * Parses X-Ratelimit-Reset header (geralmente timestamp Unix em segundos)
   */
  private parseRateLimitReset(value: string): number | undefined {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      // Pode ser segundos ou milissegundos
      const ms = num > 1e12 ? num : num * 1000;
      return Math.max(ms - Date.now(), 0);
    }
    return undefined;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }
}

// Instância singleton
export const rateLimitHandler = new RateLimitHandler();

// Funções utilitárias
export function isRateLimitError(error: unknown): boolean {
  return rateLimitHandler.isRateLimit(error);
}

export function extractRetryAfter(error: unknown): number | undefined {
  return rateLimitHandler.extractRetryAfter(error);
}

export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000,
  jitterFactor: number = 0.3
): number {
  const handler = new RateLimitHandler({
    baseDelayMs,
    maxDelayMs,
    jitterFactor
  });
  return handler.calculateBackoffWithJitter(attempt);
}
