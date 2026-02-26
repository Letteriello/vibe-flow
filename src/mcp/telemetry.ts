/**
 * MCP Telemetry Tracker
 *
 * Tracks MCP tool calls with timing, success/failure, and token estimation.
 */

export interface TelemetryRecord {
  toolName: string;
  durationMs: number;
  success: boolean;
  error?: string;
  tokensIn: number;
  tokensOut: number;
  timestamp: string;
  requestId?: string;
}

export interface SessionMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalDurationMs: number;
  averageDurationMs: number;
  toolUsage: Record<string, ToolUsageStats>;
  sessionStart: string;
  sessionEnd: string;
}

export interface ToolUsageStats {
  callCount: number;
  successCount: number;
  failureCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export interface TokenEstimateConfig {
  charsPerToken: number;
  overheadMultiplier: number;
}

const DEFAULT_TOKEN_CONFIG: TokenEstimateConfig = {
  charsPerToken: 4,
  overheadMultiplier: 1.3
};

export class MCPTelemetryTracker {
  private records: TelemetryRecord[] = [];
  private sessionStart: Date;
  private tokenConfig: TokenEstimateConfig;

  constructor(tokenConfig?: Partial<TokenEstimateConfig>) {
    this.sessionStart = new Date();
    this.tokenConfig = { ...DEFAULT_TOKEN_CONFIG, ...tokenConfig };
  }

  /**
   * Estimate tokens from input size (params + context)
   */
  estimateTokensIn(input: unknown): number {
    const jsonStr = JSON.stringify(input);
    const baseTokens = Math.ceil(jsonStr.length / this.tokenConfig.charsPerToken);
    return Math.ceil(baseTokens * this.tokenConfig.overheadMultiplier);
  }

  /**
   * Estimate tokens from output size (result)
   */
  estimateTokensOut(output: unknown): number {
    const jsonStr = JSON.stringify(output);
    const baseTokens = Math.ceil(jsonStr.length / this.tokenConfig.charsPerToken);
    return Math.ceil(baseTokens * this.tokenConfig.overheadMultiplier);
  }

  /**
   * Record a successful tool call
   */
  recordSuccess(
    toolName: string,
    durationMs: number,
    input: unknown,
    output: unknown,
    requestId?: string
  ): void {
    const record: TelemetryRecord = {
      toolName,
      durationMs,
      success: true,
      tokensIn: this.estimateTokensIn(input),
      tokensOut: this.estimateTokensOut(output),
      timestamp: new Date().toISOString(),
      requestId
    };

    this.records.push(record);
  }

  /**
   * Record a failed tool call
   */
  recordFailure(
    toolName: string,
    durationMs: number,
    input: unknown,
    error: string,
    requestId?: string
  ): void {
    const record: TelemetryRecord = {
      toolName,
      durationMs,
      success: false,
      error,
      tokensIn: this.estimateTokensIn(input),
      tokensOut: 0,
      timestamp: new Date().toISOString(),
      requestId
    };

    this.records.push(record);
  }

  /**
   * Generate a session report with aggregated metrics
   */
  generateSessionReport(): SessionMetrics {
    const sessionEnd = new Date();

    const toolUsageMap = new Map<string, ToolUsageStats>();
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalDurationMs = 0;
    let successfulCalls = 0;
    let failedCalls = 0;

    for (const record of this.records) {
      totalTokensIn += record.tokensIn;
      totalTokensOut += record.tokensOut;
      totalDurationMs += record.durationMs;

      if (record.success) {
        successfulCalls++;
      } else {
        failedCalls++;
      }

      const existing = toolUsageMap.get(record.toolName);
      if (existing) {
        existing.callCount++;
        if (record.success) {
          existing.successCount++;
        } else {
          existing.failureCount++;
        }
        existing.totalTokensIn += record.tokensIn;
        existing.totalTokensOut += record.tokensOut;
        existing.totalDurationMs += record.durationMs;
        existing.averageDurationMs = existing.totalDurationMs / existing.callCount;
      } else {
        toolUsageMap.set(record.toolName, {
          callCount: 1,
          successCount: record.success ? 1 : 0,
          failureCount: record.success ? 0 : 1,
          totalTokensIn: record.tokensIn,
          totalTokensOut: record.tokensOut,
          totalDurationMs: record.durationMs,
          averageDurationMs: record.durationMs
        });
      }
    }

    const totalCalls = successfulCalls + failedCalls;
    const averageDurationMs = totalCalls > 0 ? totalDurationMs / totalCalls : 0;

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      totalTokensIn,
      totalTokensOut,
      totalDurationMs,
      averageDurationMs,
      toolUsage: Object.fromEntries(toolUsageMap),
      sessionStart: this.sessionStart.toISOString(),
      sessionEnd: sessionEnd.toISOString()
    };
  }

  /**
   * Get all recorded telemetry
   */
  getRecords(): TelemetryRecord[] {
    return [...this.records];
  }

  /**
   * Get records for a specific tool
   */
  getRecordsByTool(toolName: string): TelemetryRecord[] {
    return this.records.filter(r => r.toolName === toolName);
  }

  /**
   * Clear all telemetry records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Get current session duration in ms
   */
  getSessionDurationMs(): number {
    return Date.now() - this.sessionStart.getTime();
  }

  /**
   * Reset session (clears records and starts a new session)
   */
  resetSession(): void {
    this.records = [];
    this.sessionStart = new Date();
  }
}
