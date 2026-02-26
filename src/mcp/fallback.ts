// MCP Fallback - Sistema de Fallback para API Secundária
import { MCPToolRequest, MCPToolResponse } from './types.js';

/**
 * Configuração do Fallback
 */
export interface FallbackConfig {
  enabled: boolean;
  fallbackApiUrl: string | null;
  fallbackApiKey: string | null;
  timeoutMs: number;
  healthCheckEnabled: boolean;
  healthCheckIntervalMs: number;
  maxFallbackAttempts: number;
}

/**
 * Estado do Fallback
 */
export interface FallbackState {
  isActive: boolean;
  activatedAt: string | null;
  fallbackCount: number;
  successfulFallbacks: number;
  failedFallbacks: number;
  lastFallbackAttempt: string | null;
  lastHealthCheck: string | null;
  isHealthy: boolean;
}

/**
 * Resultado do Fallback
 */
export interface FallbackResult {
  success: boolean;
  usedFallback: boolean;
  originalError: string | null;
  fallbackError: string | null;
  result: MCPToolResponse | null;
  attempts: number;
}

/**
 * Log de Fallback
 */
export interface FallbackLog {
  timestamp: string;
  toolName: string;
  action: 'fallback_triggered' | 'fallback_success' | 'fallback_failed' | 'health_check_passed' | 'health_check_failed' | 'fallback_disabled';
  details: string;
  responseTimeMs: number;
}

/**
 * Configuração padrão
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: false,
  fallbackApiUrl: null,
  fallbackApiKey: null,
  timeoutMs: 10000,
  healthCheckEnabled: true,
  healthCheckIntervalMs: 60000,
  maxFallbackAttempts: 3
};

/**
 * Fallback Router - Redireciona para API secundária após 3 falhas
 */
export class FallbackRouter {
  private config: FallbackConfig;
  private state: FallbackState;
  private fallbackLogs: FallbackLog[];
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.state = {
      isActive: false,
      activatedAt: null,
      fallbackCount: 0,
      successfulFallbacks: 0,
      failedFallbacks: 0,
      lastFallbackAttempt: null,
      lastHealthCheck: null,
      isHealthy: true
    };
    this.fallbackLogs = [];

    if (this.config.healthCheckEnabled && this.config.enabled) {
      this.startHealthCheck();
    }
  }

  /**
   * Configura a URL da API de fallback via environment ou config
   */
  configure(apiUrl: string, apiKey?: string): void {
    this.config.fallbackApiUrl = apiUrl;
    if (apiKey) {
      this.config.fallbackApiKey = apiKey;
    }
    this.config.enabled = !!apiUrl;

    if (this.config.enabled && this.config.healthCheckEnabled) {
      this.startHealthCheck();
    }

    this.logFallback({
      toolName: 'system',
      action: this.config.enabled ? 'fallback_triggered' : 'fallback_disabled',
      details: `Fallback configured: ${apiUrl ? 'enabled' : 'disabled'}`,
      responseTimeMs: 0
    });
  }

  /**
   * Inicia health check periódico
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (!this.config.fallbackApiUrl || !this.config.healthCheckEnabled) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Executa health check inicial
    this.performHealthCheck();
  }

  /**
   * Executa health check na API de fallback
   */
  private async performHealthCheck(): Promise<boolean> {
    if (!this.config.fallbackApiUrl) {
      this.state.isHealthy = false;
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.fallbackApiUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const isHealthy = response.ok;
      this.state.isHealthy = isHealthy;
      this.state.lastHealthCheck = new Date().toISOString();

      this.logFallback({
        toolName: 'health_check',
        action: isHealthy ? 'health_check_passed' : 'health_check_failed',
        details: `Health check ${isHealthy ? 'passed' : 'failed'} (status: ${response.status})`,
        responseTimeMs: 0
      });

      return isHealthy;
    } catch (error: any) {
      this.state.isHealthy = false;
      this.state.lastHealthCheck = new Date().toISOString();

      this.logFallback({
        toolName: 'health_check',
        action: 'health_check_failed',
        details: `Health check failed: ${error.message}`,
        responseTimeMs: 0
      });

      return false;
    }
  }

  /**
   * Obtém headers para requisições
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.fallbackApiKey) {
      headers['Authorization'] = `Bearer ${this.config.fallbackApiKey}`;
    }
    return headers;
  }

  /**
   * Registra log de fallback
   */
  private logFallback(log: Omit<FallbackLog, 'timestamp'>): void {
    const fullLog: FallbackLog = {
      ...log,
      timestamp: new Date().toISOString()
    };
    this.fallbackLogs.push(fullLog);
    console.log(`[MCP Fallback] ${log.action.toUpperCase()}: ${log.details}`);
  }

  /**
   * Verifica se fallback está disponível
   */
  isAvailable(): boolean {
    return this.config.enabled &&
           !!this.config.fallbackApiUrl &&
           this.state.isHealthy;
  }

  /**
   * Obtém o estado atual do fallback
   */
  getState(): FallbackState {
    return { ...this.state };
  }

  /**
   * Executa a requisição na API de fallback
   */
  private async executeFallbackRequest(
    toolName: string,
    request: MCPToolRequest
  ): Promise<FallbackResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        usedFallback: false,
        originalError: 'Fallback not available',
        fallbackError: null,
        result: null,
        attempts: 0
      };
    }

    this.state.lastFallbackAttempt = new Date().toISOString();
    this.state.fallbackCount++;

    this.logFallback({
      toolName,
      action: 'fallback_triggered',
      details: `Redirecting request to fallback API: ${this.config.fallbackApiUrl}`,
      responseTimeMs: 0
    });

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.fallbackApiUrl}/tools/${toolName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request.params || {}),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        this.state.failedFallbacks++;

        this.logFallback({
          toolName,
          action: 'fallback_failed',
          details: `Fallback request failed with status ${response.status}: ${errorText}`,
          responseTimeMs: responseTime
        });

        return {
          success: false,
          usedFallback: true,
          originalError: null,
          fallbackError: `HTTP ${response.status}: ${errorText}`,
          result: null,
          attempts: 1
        };
      }

      const data = await response.json();
      this.state.successfulFallbacks++;

      this.logFallback({
        toolName,
        action: 'fallback_success',
        details: `Fallback request successful`,
        responseTimeMs: responseTime
      });

      return {
        success: true,
        usedFallback: true,
        originalError: null,
        fallbackError: null,
        result: {
          success: true,
          data,
          toolName
        },
        attempts: 1
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      this.state.failedFallbacks++;

      this.logFallback({
        toolName,
        action: 'fallback_failed',
        details: `Fallback request exception: ${error.message}`,
        responseTimeMs: responseTime
      });

      return {
        success: false,
        usedFallback: true,
        originalError: null,
        fallbackError: error.message,
        result: null,
        attempts: 1
      };
    }
  }

  /**
   * Tenta executar com fallback após falhas
   */
  async executeWithFallback(
    toolName: string,
    request: MCPToolRequest,
    primaryFailed: boolean,
    failureCount: number
  ): Promise<FallbackResult> {
    // Só tenta fallback se:
    // 1. Não está ativo ainda OU
    // 2. Já houve 3+ falhas consecutivas E
    // 3. Fallback está disponível
    if (!primaryFailed || failureCount < 3) {
      return {
        success: false,
        usedFallback: false,
        originalError: null,
        fallbackError: null,
        result: null,
        attempts: 0
      };
    }

    if (!this.isAvailable()) {
      return {
        success: false,
        usedFallback: false,
        originalError: 'Fallback not available or not configured',
        fallbackError: null,
        result: null,
        attempts: 0
      };
    }

    // Ativa fallback
    if (!this.state.isActive) {
      this.state.isActive = true;
      this.state.activatedAt = new Date().toISOString();
    }

    let lastResult: FallbackResult = {
      success: false,
      usedFallback: false,
      originalError: null,
      fallbackError: null,
      result: null,
      attempts: 0
    };

    // Tenta até maxFallbackAttempts
    for (let i = 0; i < this.config.maxFallbackAttempts; i++) {
      lastResult = await this.executeFallbackRequest(toolName, request);

      if (lastResult.success) {
        return lastResult;
      }

      // Se falhou, espera um pouco antes de tentar novamente
      if (i < this.config.maxFallbackAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    return lastResult;
  }

  /**
   * Desativa o fallback manualmente
   */
  deactivate(): void {
    this.state.isActive = false;
    this.state.activatedAt = null;
    this.logFallback({
      toolName: 'system',
      action: 'fallback_disabled',
      details: 'Fallback manually deactivated',
      responseTimeMs: 0
    });
  }

  /**
   * Reativa o fallback
   */
  activate(): void {
    if (this.config.enabled && this.config.fallbackApiUrl) {
      this.state.isActive = true;
      this.state.activatedAt = new Date().toISOString();
      this.logFallback({
        toolName: 'system',
        action: 'fallback_triggered',
        details: 'Fallback manually activated',
        responseTimeMs: 0
      });
    }
  }

  /**
   * Obtém todos os logs de fallback
   */
  getFallbackLogs(): FallbackLog[] {
    return [...this.fallbackLogs];
  }

  /**
   * Limpa logs de fallback
   */
  clearLogs(): void {
    this.fallbackLogs = [];
  }

  /**
   * Obtém estatísticas do fallback
   */
  getStats(): {
    isActive: boolean;
    isAvailable: boolean;
    isHealthy: boolean;
    totalFallbackAttempts: number;
    successfulFallbacks: number;
    failedFallbacks: number;
    successRate: number;
    lastFallbackAttempt: string | null;
    lastHealthCheck: string | null;
  } {
    const total = this.state.successfulFallbacks + this.state.failedFallbacks;
    const successRate = total > 0
      ? (this.state.successfulFallbacks / total) * 100
      : 0;

    return {
      isActive: this.state.isActive,
      isAvailable: this.isAvailable(),
      isHealthy: this.state.isHealthy,
      totalFallbackAttempts: this.state.fallbackCount,
      successfulFallbacks: this.state.successfulFallbacks,
      failedFallbacks: this.state.failedFallbacks,
      successRate: Math.round(successRate * 100) / 100,
      lastFallbackAttempt: this.state.lastFallbackAttempt,
      lastHealthCheck: this.state.lastHealthCheck
    };
  }

  /**
   * Shutdown - limpa recursos
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('[MCP Fallback] Shutdown complete');
  }
}
