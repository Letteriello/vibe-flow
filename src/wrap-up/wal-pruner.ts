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
 * Grupo de ações pelo target (arquivo/caminho)
 */
interface ActionGroup {
  events: WALLogEvent[];
  actionType: WALActionType;
  target: string;
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
   * Remove ações que foram revertidas/canceladas
   * Ex: write(file) + delete(file) = ambos removidos
   */
  private static removeRevertedActions(events: WALLogEvent[]): WALLogEvent[] {
    // Agrupa por target
    const groups = this.groupByTarget(events);

    const result: WALLogEvent[] = [];

    for (const group of Array.from(groups.values())) {
      const filtered = this.processActionGroup(group);
      result.push(...filtered);
    }

    // Mantém eventos sem target (ações globais)
    const globalEvents = events.filter(e => !e.target);
    result.push(...globalEvents.filter(e =>
      !result.some(r => r.id === e.id)
    ));

    return result;
  }

  /**
   * Agrupa eventos por target
   */
  private static groupByTarget(events: WALLogEvent[]): Map<string, ActionGroup> {
    const groups = new Map<string, ActionGroup>();

    for (const event of events) {
      const target = event.target || '';
      const key = `${event.action}:${target}`;

      if (!groups.has(key)) {
        groups.set(key, {
          events: [],
          actionType: event.action,
          target
        });
      }

      groups.get(key)!.events.push(event);
    }

    return groups;
  }

  /**
   * Processa um grupo de ações para um mesmo target
   */
  private static processActionGroup(group: ActionGroup): WALLogEvent[] {
    const events = group.events;

    // Se só tem uma ação, mantém
    if (events.length <= 1) {
      return events;
    }

    // Para delete, mantém apenas o último delete
    if (group.actionType === 'delete') {
      return [events[events.length - 1]];
    }

    // Para write/edit, mantém apenas o último
    if (group.actionType === 'write' || group.actionType === 'edit') {
      return [events[events.length - 1]];
    }

    // Para outras ações, mantém todas
    return events;
  }

  /**
   * Mantém apenas a última versão de cada target
   */
  private static keepLatestVersions(events: WALLogEvent[]): WALLogEvent[] {
    const latestByTarget = new Map<string, WALLogEvent>();

    for (const event of events) {
      const target = event.target || event.id;
      const key = `${event.action}:${target}`;

      // Sobrescreve o anterior (já que está ordenado por timestamp)
      latestByTarget.set(key, event);
    }

    return Array.from(latestByTarget.values());
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

    for (const group of Array.from(groups.values())) {
      if (group.events.length > 1) {
        count += group.events.length - 1;
      }
    }

    return count;
  }
}
