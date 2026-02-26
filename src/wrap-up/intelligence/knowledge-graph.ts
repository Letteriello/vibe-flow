/**
 * KnowledgeGraphCompiler - Compila e gerencia o grafo de conhecimento da sessão
 */
export interface KnowledgeNode {
  id: string;
  type: 'concept' | 'artifact' | 'decision' | 'error' | 'file';
  label: string;
  connections: string[];
  metadata: Record<string, unknown>;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export class KnowledgeGraphCompiler {
  private graph: KnowledgeGraph;

  constructor() {
    this.graph = { nodes: [], edges: [] };
  }

  async compile(sessionData: Record<string, unknown>): Promise<KnowledgeGraph> {
    const nodes = this.extractNodes(sessionData);
    const edges = this.inferEdges(nodes);
    this.graph = { nodes, edges };
    return this.graph;
  }

  private extractNodes(sessionData: Record<string, unknown>): KnowledgeNode[] {
    const nodes: KnowledgeNode[] = [];
    const messages = (sessionData.messages as Record<string, unknown>[]) || [];

    for (const msg of messages) {
      const id = (msg.id as string) || `msg_${nodes.length}`;
      nodes.push({
        id,
        type: 'concept',
        label: this.extractLabel(msg),
        connections: [],
        metadata: { timestamp: msg.timestamp, role: msg.role },
      });
    }

    return nodes;
  }

  private extractLabel(msg: Record<string, unknown>): string {
    const content = (msg.content as string) || '';
    return content.substring(0, 50) + (content.length > 50 ? '...' : '');
  }

  private inferEdges(nodes: KnowledgeNode[]): KnowledgeEdge[] {
    const edges: KnowledgeEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i].id,
        target: nodes[i + 1].id,
        relationship: 'follows',
        weight: 1,
      });
    }
    return edges;
  }

  getGraph(): KnowledgeGraph {
    return this.graph;
  }
}
