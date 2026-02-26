/**
 * ContextDAGManager - Gerencia o DAG (Directed Acyclic Graph) de contexto
 */

export interface DAGMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface CondensedSummary {
  id: string;
  condensedContent: string;
  originalIds: string[];
  level: number;
  timestamp: number;
}

export interface DAGNode {
  id: string;
  type: 'message' | 'summary';
  content: string;
  children: string[];
  metadata: Record<string, unknown>;
}

export interface LocalDAGState {
  messages: DAGMessage[];
  summaries: CondensedSummary[];
  pointers: string[];
}

export class ContextDAGManager {
  private dagState: LocalDAGState;
  private nodeMap: Map<string, DAGNode>;

  constructor() {
    this.dagState = {
      messages: [],
      summaries: [],
      pointers: [],
    };
    this.nodeMap = new Map();
  }

  async buildDAG(rawSessionData: Record<string, unknown>): Promise<LocalDAGState> {
    const messages = (rawSessionData.messages as Record<string, unknown>[]) || [];

    for (const msg of messages) {
      const id = (msg.id as string) || `msg_${this.dagState.messages.length}`;
      this.dagState.messages.push({
        id,
        role: (msg.role as string) || 'user',
        content: (msg.content as string) || '',
        timestamp: (msg.timestamp as number) || Date.now(),
      });

      this.nodeMap.set(id, {
        id,
        type: 'message',
        content: (msg.content as string) || '',
        children: [],
        metadata: {},
      });
    }

    return this.dagState;
  }

  async compressContext(targetSize: number): Promise<CondensedSummary[]> {
    const summaries: CondensedSummary[] = [];

    if (this.dagState.messages.length <= targetSize) {
      return summaries;
    }

    const groupSize = Math.ceil(this.dagState.messages.length / targetSize);
    for (let i = 0; i < this.dagState.messages.length; i += groupSize) {
      const group = this.dagState.messages.slice(i, i + groupSize);
      summaries.push({
        id: `summary_${i}`,
        condensedContent: group.map(m => m.content).join(' | '),
        originalIds: group.map(m => m.id),
        level: 1,
        timestamp: Date.now(),
      });
    }

    this.dagState.summaries = summaries;
    return summaries;
  }

  getDAGState(): LocalDAGState {
    return this.dagState;
  }

  getProvenance(summaryId: string): string[] {
    const summary = this.dagState.summaries.find(s => s.id === summaryId);
    return summary?.originalIds || [];
  }
}
