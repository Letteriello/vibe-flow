/**
 * Task Queue - Gerenciador de fila de tarefas TDD
 *
 * Implementa o sistema de ingestion de tarefas planejadas (parse de Markdown)
 * e gerenciamento do estado de progresso de cada feature.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Estados possíveis de uma tarefa TDD
 */
export enum TDDTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED'
}

/**
 * Representa uma tarefa individual no ciclo TDD
 */
export interface TDDTask {
  id: string;
  description: string;
  status: TDDTaskStatus;
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/**
 * Resultado da operação de extração de próxima tarefa
 */
export interface TaskPeekResult {
  task: TDDTask | null;
  hasMore: boolean;
  totalRemaining: number;
}

/**
 * Estatísticas da fila de tarefas
 */
export interface TaskQueueStats {
  total: number;
  pending: number;
  inProgress: number;
  failed: number;
  completed: number;
}

/**
 * Configuração do TaskIngestor
 */
export interface TaskIngestorConfig {
  sourcePath?: string;
  autoSave?: boolean;
  savePath?: string;
}

/**
 * TaskIngestor - Parser de Markdown e gerenciador de fila de tarefas TDD
 *
 * Faz o parse de arquivos Markdown com checkboxes [ ] e gerencia
 * o ciclo de vida de cada tarefa na fila.
 */
export class TaskIngestor {
  private tasks: Map<string, TDDTask> = new Map();
  private taskOrder: string[] = [];
  private readonly autoSave: boolean;
  private readonly savePath: string | null;

  constructor(config: TaskIngestorConfig = {}) {
    this.autoSave = config.autoSave ?? false;
    this.savePath = config.savePath ?? null;
  }

  /**
   * Carrega tarefas de um arquivo Markdown
   *
   * Formato esperado:
   * - [ ] Tarefa 1
   * - [x] Tarefa concluída
   * - [ ] Tarefa 2 com descrição
   */
  async loadFromMarkdown(filePath: string): Promise<TDDTask[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseMarkdown(content);
  }

  /**
   * Parse de conteúdo Markdown para extrair tarefas
   */
  parseMarkdown(markdownContent: string): TDDTask[] {
    const lines = markdownContent.split('\n');
    const extractedTasks: TDDTask[] = [];

    // Regex para capturar checkboxes: [ ], [x], [X]
    const checkboxRegex = /^(\s*)-\s*\[([ xX])\]\s*(.+)$/;

    let lineNumber = 0;
    for (const line of lines) {
      lineNumber++;
      const match = line.match(checkboxRegex);

      if (match) {
        const [, indent, checked, description] = match;
        const trimmedDescription = description.trim();

        if (trimmedDescription.length === 0) {
          continue;
        }

        const task: TDDTask = {
          id: this.generateTaskId(trimmedDescription, lineNumber),
          description: trimmedDescription,
          status: checked.toLowerCase() === 'x' ? TDDTaskStatus.COMPLETED : TDDTaskStatus.PENDING,
          priority: this.calculatePriority(indent.length, checked.toLowerCase() === 'x'),
          metadata: {
            lineNumber,
            indentLevel: indent.length,
            originalCheckbox: `[${checked}]`
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        extractedTasks.push(task);
        this.tasks.set(task.id, task);
        this.taskOrder.push(task.id);
      }
    }

    return extractedTasks;
  }

  /**
   * Carrega tarefas de uma string Markdown (sem arquivo)
   */
  loadFromString(markdownContent: string): TDDTask[] {
    return this.parseMarkdown(markdownContent);
  }

  /**
   * Extrai a próxima tarefa não concluída da fila
   * Segue a ordem de prioridade: menor indent primeiro, depois ordem de aparição
   */
  getNextTask(): TaskPeekResult {
    const pendingTasks = this.getTasksByStatus(TDDTaskStatus.PENDING);

    if (pendingTasks.length === 0) {
      return {
        task: null,
        hasMore: false,
        totalRemaining: 0
      };
    }

    // Ordena por prioridade (indent menor = mais prioritário)
    pendingTasks.sort((a, b) => a.priority - b.priority);

    const nextTask = pendingTasks[0];
    const remaining = this.getTasksByStatus(TDDTaskStatus.PENDING).length - 1;

    return {
      task: nextTask,
      hasMore: remaining > 0,
      totalRemaining: remaining + this.getTasksByStatus(TDDTaskStatus.IN_PROGRESS).length
    };
  }

  /**
   * Marca uma tarefa como em progresso
   */
  markInProgress(taskId: string): TDDTask | null {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    if (task.status !== TDDTaskStatus.PENDING && task.status !== TDDTaskStatus.FAILED) {
      return null;
    }

    task.status = TDDTaskStatus.IN_PROGRESS;
    task.updatedAt = Date.now();
    this.maybeSave();

    return task;
  }

  /**
   * Marca uma tarefa como falha
   */
  markFailed(taskId: string, error?: string): TDDTask | null {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    if (task.status !== TDDTaskStatus.IN_PROGRESS) {
      return null;
    }

    task.status = TDDTaskStatus.FAILED;
    task.error = error ?? 'Task failed';
    task.updatedAt = Date.now();
    this.maybeSave();

    return task;
  }

  /**
   * Marca uma tarefa como concluída
   */
  markCompleted(taskId: string): TDDTask | null {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    if (task.status !== TDDTaskStatus.IN_PROGRESS && task.status !== TDDTaskStatus.PENDING) {
      return null;
    }

    task.status = TDDTaskStatus.COMPLETED;
    task.updatedAt = Date.now();
    task.error = undefined;
    this.maybeSave();

    return task;
  }

  /**
   * Reseta uma tarefa para pendente (para tentar novamente)
   */
  resetTask(taskId: string): TDDTask | null {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    task.status = TDDTaskStatus.PENDING;
    task.updatedAt = Date.now();
    task.error = undefined;
    this.maybeSave();

    return task;
  }

  /**
   * Retorna uma tarefa pelo ID
   */
  getTask(taskId: string): TDDTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Retorna todas as tarefas
   */
  getAllTasks(): TDDTask[] {
    return this.taskOrder.map(id => this.tasks.get(id)!).filter(Boolean);
  }

  /**
   * Retorna tarefas por status
   */
  getTasksByStatus(status: TDDTaskStatus): TDDTask[] {
    return this.getAllTasks().filter(task => task.status === status);
  }

  /**
   * Retorna estatísticas da fila
   */
  getStats(): TaskQueueStats {
    const allTasks = this.getAllTasks();

    return {
      total: allTasks.length,
      pending: allTasks.filter(t => t.status === TDDTaskStatus.PENDING).length,
      inProgress: allTasks.filter(t => t.status === TDDTaskStatus.IN_PROGRESS).length,
      failed: allTasks.filter(t => t.status === TDDTaskStatus.FAILED).length,
      completed: allTasks.filter(t => t.status === TDDTaskStatus.COMPLETED).length
    };
  }

  /**
   * Verifica se há mais tarefas pendentes
   */
  hasMoreTasks(): boolean {
    return this.getTasksByStatus(TDDTaskStatus.PENDING).length > 0;
  }

  /**
   * Verifica se todas as tarefas foram concluídas
   */
  isAllCompleted(): boolean {
    const stats = this.getStats();
    return stats.pending === 0 && stats.inProgress === 0 && stats.failed === 0;
  }

  /**
   * Gera ID único para a tarefa
   */
  private generateTaskId(description: string, lineNumber: number): string {
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);

    return `task-${lineNumber}-${slug}`;
  }

  /**
   * Calcula prioridade baseada no indent (tarefas menos indentadas são mais prioritárias)
   */
  private calculatePriority(indentLevel: number, isCompleted: boolean): number {
    // Completed tasks have lowest priority
    if (isCompleted) {
      return 1000 + indentLevel;
    }
    return indentLevel;
  }

  /**
   * Salva estado atual se autoSave estiver habilitado
   */
  private maybeSave(): void {
    if (this.autoSave && this.savePath) {
      this.saveToFile(this.savePath).catch(err => {
        console.error('Failed to save task queue:', err);
      });
    }
  }

  /**
   * Salva a fila de tarefas em arquivo JSON
   */
  async saveToFile(filePath: string): Promise<void> {
    const data = {
      tasks: Array.from(this.tasks.values()),
      taskOrder: this.taskOrder,
      savedAt: Date.now()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Carrega a fila de tarefas de um arquivo JSON
   */
  async loadFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as {
      tasks: TDDTask[];
      taskOrder: string[];
    };

    this.tasks.clear();
    this.taskOrder = [];

    for (const task of data.tasks) {
      this.tasks.set(task.id, task);
    }
    this.taskOrder = data.taskOrder;
  }

  /**
   * Adiciona uma tarefa manualmente
   */
  addTask(description: string, metadata?: Record<string, unknown>): TDDTask {
    const task: TDDTask = {
      id: this.generateTaskId(description, this.tasks.size + 1),
      description,
      status: TDDTaskStatus.PENDING,
      priority: this.calculatePriority(0, false),
      metadata: metadata ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.tasks.set(task.id, task);
    this.taskOrder.push(task.id);
    this.maybeSave();

    return task;
  }

  /**
   * Remove uma tarefa pelo ID
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);

    if (!task) {
      return false;
    }

    this.tasks.delete(taskId);
    this.taskOrder = this.taskOrder.filter(id => id !== taskId);
    this.maybeSave();

    return true;
  }

  /**
   * Limpa todas as tarefas
   */
  clear(): void {
    this.tasks.clear();
    this.taskOrder = [];
    this.maybeSave();
  }
}

/**
 * Factory function para criar TaskIngestor com configurações padrão
 */
export function createTaskIngestor(config?: TaskIngestorConfig): TaskIngestor {
  return new TaskIngestor(config);
}
