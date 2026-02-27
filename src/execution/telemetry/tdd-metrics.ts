/**
 * TDD Metrics Collector
 *
 * Captura eventos do ciclo de vida do TDD:
 * - Iterações necessárias para aprovar uma tarefa
 * - Tempo gasto (latency)
 * - Estimativa de tokens gastos (fórmula simples baseada em tamanho de strings)
 * - Alertas quando o orçamento é excedido
 */

export interface TDDEvent {
  taskId: string;
  taskDescription: string;
  phase: 'RED' | 'GREEN' | 'REFACTOR' | 'COMPLETED' | 'FAILED';
  timestamp: number;
  iterations: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  error?: string;
}

export interface TaskMetrics {
  taskId: string;
  taskDescription: string;
  totalIterations: number;
  totalLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  phases: TDDEvent[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startTime: number;
  endTime?: number;
  budgetExceeded: boolean;
  alertTriggered?: string;
}

export interface TelemetryReport {
  sessionId: string;
  generatedAt: number;
  tasks: TaskMetrics[];
  summary: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalIterations: number;
    totalLatencyMs: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    averageIterationsPerTask: number;
    averageLatencyMs: number;
    averageTokensPerTask: number;
  };
  alerts: Alert[];
}

export interface Alert {
  taskId: string;
  type: 'ITERATION_BUDGET' | 'TIME_BUDGET' | 'TOKEN_BUDGET';
  threshold: number;
  actual: number;
  message: string;
  timestamp: number;
}

export interface TDDMetricsConfig {
  maxIterationsPerTask: number;
  maxLatencyMs: number;
  maxTokensPerTask: number;
  sessionId?: string;
}

/**
 * Lightweight token estimation based on string size
 * Uses simple formula: ~4 characters per token (English text average)
 * For code, slightly more conservative: ~3.5 characters per token
 */
function estimateTokens(text: string, isCode: boolean = false): number {
  if (!text || text.length === 0) return 0;

  const charsPerToken = isCode ? 3.5 : 4;
  // Add overhead for special characters and whitespace
  const adjustedLength = text.length * 1.1;
  return Math.ceil(adjustedLength / charsPerToken);
}

/**
 * Estimates tokens for input and output separately
 */
function estimateTokenPair(input: string, output: string): { input: number; output: number; total: number } {
  const inputTokens = estimateTokens(input, true);
  const outputTokens = estimateTokens(output, true);
  return {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens
  };
}

export class TDDMetricsCollector {
  private tasks: Map<string, TaskMetrics> = new Map();
  private events: TDDEvent[] = [];
  private alerts: Alert[] = [];
  private config: TDDMetricsConfig;
  private sessionId: string;

  constructor(config: Partial<TDDMetricsConfig> = {}) {
    this.config = {
      maxIterationsPerTask: config.maxIterationsPerTask ?? 15,
      maxLatencyMs: config.maxLatencyMs ?? 300000, // 5 minutes default
      maxTokensPerTask: config.maxTokensPerTask ?? 100000,
      sessionId: config.sessionId
    };
    this.sessionId = this.config.sessionId ?? `session-${Date.now()}`;
  }

  /**
   * Start tracking a new TDD task
   */
  startTask(taskId: string, taskDescription: string): void {
    const metrics: TaskMetrics = {
      taskId,
      taskDescription,
      totalIterations: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      phases: [],
      status: 'IN_PROGRESS',
      startTime: Date.now(),
      budgetExceeded: false
    };
    this.tasks.set(taskId, metrics);
  }

  /**
   * Record a TDD phase event
   */
  recordPhase(
    taskId: string,
    phase: TDDEvent['phase'],
    iterations: number,
    latencyMs: number,
    input: string,
    output: string,
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TDDMetrics] Task ${taskId} not found, creating new task`);
      this.startTask(taskId, 'Unknown task');
    }

    const taskMetrics = this.tasks.get(taskId)!;
    const tokenEstimate = estimateTokenPair(input, output);

    const event: TDDEvent = {
      taskId,
      taskDescription: taskMetrics.taskDescription,
      phase,
      timestamp: Date.now(),
      iterations,
      latencyMs,
      inputTokens: tokenEstimate.input,
      outputTokens: tokenEstimate.output,
      totalTokens: tokenEstimate.total,
      error
    };

    this.events.push(event);
    taskMetrics.phases.push(event);
    taskMetrics.totalIterations += iterations;
    taskMetrics.totalLatencyMs += latencyMs;
    taskMetrics.totalInputTokens += tokenEstimate.input;
    taskMetrics.totalOutputTokens += tokenEstimate.output;
    taskMetrics.totalTokens += tokenEstimate.total;

    // Check budget and trigger alerts
    this.checkBudget(taskMetrics);
  }

  /**
   * Check if task exceeded configured budgets
   */
  private checkBudget(taskMetrics: TaskMetrics): void {
    // Check iteration budget
    if (taskMetrics.totalIterations > this.config.maxIterationsPerTask) {
      const alert: Alert = {
        taskId: taskMetrics.taskId,
        type: 'ITERATION_BUDGET',
        threshold: this.config.maxIterationsPerTask,
        actual: taskMetrics.totalIterations,
        message: `Task ${taskMetrics.taskId} exceeded iteration budget: ${taskMetrics.totalIterations} > ${this.config.maxIterationsPerTask}`,
        timestamp: Date.now()
      };
      this.alerts.push(alert);
      taskMetrics.budgetExceeded = true;
      taskMetrics.alertTriggered = alert.message;
      this.emitAlert(alert);
    }

    // Check time budget
    if (taskMetrics.totalLatencyMs > this.config.maxLatencyMs) {
      const alert: Alert = {
        taskId: taskMetrics.taskId,
        type: 'TIME_BUDGET',
        threshold: this.config.maxLatencyMs,
        actual: taskMetrics.totalLatencyMs,
        message: `Task ${taskMetrics.taskId} exceeded time budget: ${taskMetrics.totalLatencyMs}ms > ${this.config.maxLatencyMs}ms`,
        timestamp: Date.now()
      };
      this.alerts.push(alert);
      taskMetrics.budgetExceeded = true;
      taskMetrics.alertTriggered = alert.message;
      this.emitAlert(alert);
    }

    // Check token budget
    if (taskMetrics.totalTokens > this.config.maxTokensPerTask) {
      const alert: Alert = {
        taskId: taskMetrics.taskId,
        type: 'TOKEN_BUDGET',
        threshold: this.config.maxTokensPerTask,
        actual: taskMetrics.totalTokens,
        message: `Task ${taskMetrics.taskId} exceeded token budget: ${taskMetrics.totalTokens} > ${this.config.maxTokensPerTask}`,
        timestamp: Date.now()
      };
      this.alerts.push(alert);
      taskMetrics.budgetExceeded = true;
      taskMetrics.alertTriggered = alert.message;
      this.emitAlert(alert);
    }
  }

  /**
   * Emit alert - can be overridden for custom handling
   */
  protected emitAlert(alert: Alert): void {
    console.warn(`[TDDMetrics Alert] ${alert.message}`);
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'COMPLETED';
      task.endTime = Date.now();
    }
  }

  /**
   * Mark task as failed
   */
  failTask(taskId: string, error?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'FAILED';
      task.endTime = Date.now();
      if (error) {
        const lastEvent = task.phases[task.phases.length - 1];
        if (lastEvent) {
          lastEvent.error = error;
        }
      }
    }
  }

  /**
   * Get current task status
   */
  getTaskStatus(taskId: string): TaskMetrics | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): TaskMetrics[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Generate telemetry report in JSON format
   */
  generateReport(): TelemetryReport {
    const tasks = Array.from(this.tasks.values());

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const failedTasks = tasks.filter(t => t.status === 'FAILED').length;

    const totalIterations = tasks.reduce((sum, t) => sum + t.totalIterations, 0);
    const totalLatencyMs = tasks.reduce((sum, t) => sum + t.totalLatencyMs, 0);
    const totalInputTokens = tasks.reduce((sum, t) => sum + t.totalInputTokens, 0);
    const totalOutputTokens = tasks.reduce((sum, t) => sum + t.totalOutputTokens, 0);
    const totalTokens = tasks.reduce((sum, t) => sum + t.totalTokens, 0);

    const activeTasks = completedTasks + failedTasks;

    const report: TelemetryReport = {
      sessionId: this.sessionId,
      generatedAt: Date.now(),
      tasks,
      summary: {
        totalTasks: tasks.length,
        completedTasks,
        failedTasks,
        totalIterations,
        totalLatencyMs,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        averageIterationsPerTask: activeTasks > 0 ? totalIterations / activeTasks : 0,
        averageLatencyMs: activeTasks > 0 ? totalLatencyMs / activeTasks : 0,
        averageTokensPerTask: activeTasks > 0 ? totalTokens / activeTasks : 0
      },
      alerts: this.alerts
    };

    return report;
  }

  /**
   * Export report as JSON string
   */
  exportJSON(): string {
    return JSON.stringify(this.generateReport(), null, 2);
  }

  /**
   * Reset all metrics (for new session)
   */
  reset(): void {
    this.tasks.clear();
    this.events.length = 0;
    this.alerts.length = 0;
    this.sessionId = `session-${Date.now()}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TDDMetricsConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get events for a specific task
   */
  getTaskEvents(taskId: string): TDDEvent[] {
    const task = this.tasks.get(taskId);
    return task ? task.phases : [];
  }

  /**
   * Get all events
   */
  getAllEvents(): TDDEvent[] {
    return [...this.events];
  }
}

export default TDDMetricsCollector;
