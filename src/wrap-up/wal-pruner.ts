// WAL Pruner - Remove logs redundantes do Write-Ahead Logging
// Mantém apenas a versão final de ações modificadas

/**
 * Tipo de ação executada pelo agente
 */
export type WALActionType = 'write' | 'edit' | 'delete' | 'read' | 'bash' | 'create' | 'move' | 'copy';

/**
 * Interface para um evento de log do WAL
 */
export interface WALLogEvent {
  id: string;
  timestamp: number;
  action: WALActionType;
  target?: string;
  content?: string;
  previousContent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resultado da poda de logs
 */
export interface PruneResult {
  prunedLogs: WALLogEvent[];
  removedCount: number;
  keptCount: number;
  duplicatesRemoved: number;
  revertedRemoved: number;
}

/**
 * WALPruner - Remove logs duplicados e ações revertidas
 *
 * Algoritmo:
 * 1. Agrupa eventos por target (arquivo/caminho)
 * 2. Para ações write/edit: mantém apenas a última versão
 * 3. Remove ações canceladas (write + delete = remove ambos)
 * 4. Remove duplicatas exatas
 */
export class WALPruner {
  /**
   * Prune - Remove logs redundantes
   *
   * @param logs - Array de eventos de log
   * @returns Array de eventos podados
   */
  static prune(logs: WALLogEvent[]): WALLogEvent[] {
    if (!Array.isArray(logs) || logs.length === 0) {
      return [];
    }

    // Ordena por timestamp
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);

    // Remove duplicatas exatas primeiro
    const deduplicated = this.removeExactDuplicates(sortedLogs);

    // Remove ações revertidas
    const noReverted = this.removeRevertedActions(deduplicated);

    // Mantém apenas a última versão de cada target
    const finalVersions = this.keepLatestVersions(noReverted);

    return finalVersions;
  }

  /**
   * Remove eventos duplicados exatamente iguais
   */
  private static removeExactDuplicates(events: WALLogEvent[]): WALLogEvent[] {
    const seen = new Set<string>();
    const result: WALLogEvent[] = [];

    for (const event of events) {
      const key = this.getEventKey(event);

      if (!seen.has(key)) {
        seen.add(key);
        result.push(event);
      }
    }

    return result;
  }

  /**
   * Gera chave única para um evento
   */
  private static getEventKey(event: WALLogEvent): string {
    const parts = [
      event.action,
      event.target || '',
      event.content || '',
      String(event.timestamp)
    ];
    return parts.join('|');
  }

  /**
   * Remove ações canceladas (write seguido de delete do mesmo arquivo)
   * A lógica final é tratada em keepLatestVersions
   * Aqui apenas retorna os eventos que não foram completamente revertidos
   */
  private static removeRevertedActions(events: WALLogEvent[]): WALLogEvent[] {
    // A poda real de ações revertidas é feita em keepLatestVersions
    // Este método pode ser estendido para lógica adicional se necessário
    return events;
  }

  /**
   * Agrupa eventos por target (sem considerar action)
   */
  private static groupByTarget(events: WALLogEvent[]): Map<string, WALLogEvent[]> {
    const groups = new Map<string, WALLogEvent[]>();

    for (const event of events) {
      const target = event.target || '';

      if (!groups.has(target)) {
        groups.set(target, []);
      }

      groups.get(target)!.push(event);
    }

    return groups;
  }

  /**
   * Mantém apenas a última versão de cada target
   * Se a última ação for delete, remove o arquivo da lista
   * Se a última ação for write/edit, mantém apenas a versão final
   */
  private static keepLatestVersions(events: WALLogEvent[]): WALLogEvent[] {
    // Primeiro, agrupa todas as ações por target
    const actionsByTarget = new Map<string, WALLogEvent[]>();

    for (const event of events) {
      const target = event.target || event.id;

      if (!actionsByTarget.has(target)) {
        actionsByTarget.set(target, []);
      }

      actionsByTarget.get(target)!.push(event);
    }

    const result: WALLogEvent[] = [];

    // Para cada target, mantém apenas a última ação
    for (const [, targetEvents] of Array.from(actionsByTarget.entries())) {
      if (targetEvents.length === 0) continue;

      // O último evento (já ordenado por timestamp)
      const lastEvent = targetEvents[targetEvents.length - 1];

      // Se o último evento for delete, não inclui nada para esse target
      if (lastEvent.action === 'delete') {
        continue;
      }

      // Caso contrário, mantém o último evento
      result.push(lastEvent);
    }

    return result;
  }

  /**
   * Prune com resultado detalhado
   *
   * @param logs - Array de eventos de log
   * @returns Resultado detalhado da poda
   */
  static pruneWithStats(logs: WALLogEvent[]): PruneResult {
    const originalCount = logs.length;
    const pruned = this.prune(logs);

    const exactDuplicates = this.countExactDuplicates(logs);
    const reverted = this.countRevertedActions(logs);

    return {
      prunedLogs: pruned,
      removedCount: originalCount - pruned.length,
      keptCount: pruned.length,
      duplicatesRemoved: exactDuplicates,
      revertedRemoved: reverted
    };
  }

  /**
   * Conta duplicatas exatas
   */
  private static countExactDuplicates(events: WALLogEvent[]): number {
    const seen = new Set<string>();
    let count = 0;

    for (const event of events) {
      const key = this.getEventKey(event);
      if (seen.has(key)) {
        count++;
      } else {
        seen.add(key);
      }
    }

    return count;
  }

  /**
   * Conta ações revertidas
   */
  private static countRevertedActions(events: WALLogEvent[]): number {
    const groups = this.groupByTarget(events);
    let count = 0;

    for (const groupEvents of Array.from(groups.values())) {
      if (groupEvents.length > 1) {
        count += groupEvents.length - 1;
      }
    }

    return count;
  }
}
