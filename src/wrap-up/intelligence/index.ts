/**
 * WrapUpIntelligenceFacade - Orquestra o pipeline de inteligência para enriquecimento de memória de sessão
 *
 * Este módulo centraliza a coordenação dos submódulos de inteligência:
 * - KnowledgeGraphCompiler: Compila o grafo de conhecimento
 * - ContextDAGManager: Gerencia o DAG de contexto
 * - EscalationSummarizer: Resume eventos de escalação
 * - JustificationLinker: Liga justificativas a decisões
 * - ArtifactSealer: Selos de artefatos com integridade
 * - OntologyMetadataTagger: Tags de metadados para RAG
 * - FinalQAAuditor: Auditoria final de QA
 */

import { KnowledgeGraphCompiler, KnowledgeGraph } from './knowledge-graph.js';
import { ContextDAGManager, DAGState } from './context-dag.js';
import { EscalationSummarizer, EscalationSummary } from './escalation-summarizer.js';
import { JustificationLinker, JustificationLink } from './justification-linker.js';
import { ArtifactSealer, SealedArtifact } from './artifact-sealer.js';
import { OntologyMetadataTagger, RAGMetadata } from './rag-metadata.js';
import { FinalQAAuditor, QAReport } from './qa-auditor.js';

/**
 * Dados brutos da sessão recebidos para enriquecimento
 */
export interface RawSessionData {
  sessionId: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp?: number;
  }>;
  decisions?: Array<{
    id: string;
    rationale: string;
    confidence?: number;
  }>;
  artifacts?: Array<{
    id: string;
    name: string;
    type: string;
    content: unknown;
    version?: string;
  }>;
  escalations?: Array<{
    id: string;
    timestamp?: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    type?: string;
    description?: string;
    resolution?: string;
  }>;
  metadata?: Record<string, unknown>;
  workspacePath?: string;
  changedFiles?: string[];
}

/**
 * Resultado do enrichment com todos os componentes processados
 */
export interface EnrichedSessionPackage {
  sessionId: string;
  enrichedAt: string;
  knowledgeGraph: KnowledgeGraph;
  contextDAG: DAGState;
  escalationSummary: EscalationSummary;
  justificationLinks: JustificationLink[];
  sealedArtifacts: SealedArtifact[];
  ragMetadata: RAGMetadata;
  qaReport: QAReport | null;
  sealChecksum: string;
}

/**
 * Resultado de cada estágio do pipeline
 */
export interface PipelineStageResult {
  stage: string;
  success: boolean;
  duration: number;
  error?: string;
  data?: unknown;
}

/**
 * Configuração do pipeline de inteligência
 */
export interface IntelligencePipelineConfig {
  enableQA: boolean;
  enableRAG: boolean;
  enableSealing: boolean;
  targetContextSize?: number;
}

/**
 * WrapUpIntelligenceFacade - Facade principal que orquestra todos os submódulos de inteligência
 *
 * Pipeline de execução:
 * 1. KnowledgeGraphCompiler - Compila grafo de conhecimento das mensagens
 * 2. ContextDAGManager - Constrói e comprime o DAG de contexto
 * 3. EscalationSummarizer - Resume eventos de escalação
 * 4. JustificationLinker - Liga justificativas a decisões
 * 5. OntologyMetadataTagger - Gera metadados RAG
 * 6. ArtifactSealer - Selos artefatos (se existirem)
 * 7. FinalQAAuditor - Auditoria final de QA
 */
export class WrapUpIntelligenceFacade {
  private knowledgeGraphCompiler: KnowledgeGraphCompiler;
  private contextDAGManager: ContextDAGManager;
  private escalationSummarizer: EscalationSummarizer;
  private justificationLinker: JustificationLinker;
  private artifactSealer: ArtifactSealer;
  private ontologyTagger: OntologyMetadataTagger;
  private qaAuditor: FinalQAAuditor;
  private config: IntelligencePipelineConfig;
  private pipelineHistory: PipelineStageResult[];

  constructor(config?: Partial<IntelligencePipelineConfig>) {
    this.knowledgeGraphCompiler = new KnowledgeGraphCompiler();
    this.contextDAGManager = new ContextDAGManager();
    this.escalationSummarizer = new EscalationSummarizer();
    this.justificationLinker = new JustificationLinker();
    this.artifactSealer = new ArtifactSealer();
    this.ontologyTagger = new OntologyMetadataTagger();
    this.qaAuditor = new FinalQAAuditor();
    this.config = {
      enableQA: config?.enableQA ?? true,
      enableRAG: config?.enableRAG ?? true,
      enableSealing: config?.enableSealing ?? true,
      targetContextSize: config?.targetContextSize ?? 1000,
    };
    this.pipelineHistory = [];
  }

  /**
   * Método principal: enrichSessionMemory
   *
   * Orquestra todos os submódulos em uma ordem lógica de pipeline
   * para enriquecer os dados brutos da sessão em um pacote selado.
   *
   * @param rawSessionData - Dados brutos da sessão
   * @returns EnrichedSessionPackage - Pacote completo e selado
   */
  async enrichSessionMemory(rawSessionData: RawSessionData): Promise<EnrichedSessionPackage> {
    const startTime = Date.now();
    this.pipelineHistory = [];

    const sessionId = rawSessionData.sessionId || `session_${Date.now()}`;

    // Estágio 1: Compilar grafo de conhecimento
    const knowledgeGraph = await this.executeStage(
      'KnowledgeGraphCompiler',
      async () => {
        return this.knowledgeGraphCompiler.compile(rawSessionData as unknown as Record<string, unknown>);
      }
    );

    // Estágio 2: Construir DAG de contexto
    const contextDAG = await this.executeStage(
      'ContextDAGManager',
      async () => {
        return this.contextDAGManager.buildDAG(rawSessionData as unknown as Record<string, unknown>);
      }
    );

    // Comprimir contexto se necessário
    if (this.config.targetContextSize && rawSessionData.messages.length > this.config.targetContextSize) {
      await this.executeStage(
        'ContextDAGManager_compression',
        async () => {
          return this.contextDAGManager.compressContext(this.config.targetContextSize!);
        }
      );
    }

    // Estágio 3: Resumir escalações
    const escalationSummary = await this.executeStage(
      'EscalationSummarizer',
      async () => {
        return this.escalationSummarizer.summarize(rawSessionData as unknown as Record<string, unknown>);
      }
    );

    // Estágio 4: Ligar justificativas
    const justificationLinks = await this.executeStage(
      'JustificationLinker',
      async () => {
        return this.justificationLinker.link(rawSessionData as unknown as Record<string, unknown>);
      }
    );

    // Estágio 5: Gerar metadados RAG (se habilitado)
    let ragMetadata: RAGMetadata | null = null;
    if (this.config.enableRAG) {
      ragMetadata = await this.executeStage(
        'OntologyMetadataTagger',
        async () => {
          const summaryText = this.generateSummaryText(rawSessionData);
          return this.ontologyTagger.tagSummary(summaryText);
        }
      );
    }

    // Estágio 6: Selar artefatos (se habilitado e existirem)
    let sealedArtifacts: SealedArtifact[] = [];
    if (this.config.enableSealing && rawSessionData.artifacts && rawSessionData.artifacts.length > 0) {
      sealedArtifacts = await this.executeStage(
        'ArtifactSealer',
        async () => {
          return this.artifactSealer.sealMultipleArtifacts(
            rawSessionData.artifacts!.map(a => ({
              content: a.content,
              metadata: { name: a.name, type: a.type },
              version: a.version,
            }))
          );
        }
      );
    }

    // Estágio 7: Auditoria final de QA (se habilitado)
    let qaReport: QAReport | null = null;
    if (this.config.enableQA && rawSessionData.workspacePath && rawSessionData.changedFiles) {
      qaReport = await this.executeStage(
        'FinalQAAuditor',
        async () => {
          return this.qaAuditor.runPreSealAudit(
            rawSessionData.workspacePath!,
            rawSessionData.changedFiles!
          );
        }
      );
    }

    // Gerar checksum de selagem final
    const sealChecksum = this.generateSealChecksum({
      knowledgeGraph,
      contextDAG,
      escalationSummary,
      justificationLinks,
      sealedArtifacts,
      ragMetadata,
    });

    const totalDuration = Date.now() - startTime;

    return {
      sessionId,
      enrichedAt: new Date().toISOString(),
      knowledgeGraph: knowledgeGraph as KnowledgeGraph,
      contextDAG: contextDAG as DAGState,
      escalationSummary: escalationSummary as EscalationSummary,
      justificationLinks: justificationLinks as JustificationLink[],
      sealedArtifacts,
      ragMetadata: ragMetadata as RAGMetadata,
      qaReport,
      sealChecksum,
    };
  }

  /**
   * Executa um estágio do pipeline com medição de tempo
   */
  private async executeStage<T>(
    stageName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const stageStart = Date.now();
    try {
      const result = await fn();
      this.pipelineHistory.push({
        stage: stageName,
        success: true,
        duration: Date.now() - stageStart,
        data: result,
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.pipelineHistory.push({
        stage: stageName,
        success: false,
        duration: Date.now() - stageStart,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Gera texto de resumo para análise de RAG
   */
  private generateSummaryText(rawSessionData: RawSessionData): string {
    const parts: string[] = [];

    for (const msg of rawSessionData.messages.slice(-20)) {
      parts.push(msg.content);
    }

    if (rawSessionData.decisions) {
      for (const decision of rawSessionData.decisions) {
        parts.push(decision.rationale);
      }
    }

    return parts.join(' ');
  }

  /**
   * Gera checksum de selagem para o pacote enriquecido
   */
  private generateSealChecksum(data: {
    knowledgeGraph: KnowledgeGraph;
    contextDAG: DAGState;
    escalationSummary: EscalationSummary;
    justificationLinks: JustificationLink[];
    sealedArtifacts: SealedArtifact[];
    ragMetadata: RAGMetadata | null;
  }): string {
    const payload = JSON.stringify({
      nodes: data.knowledgeGraph.nodes.length,
      edges: data.knowledgeGraph.edges.length,
      messages: data.contextDAG.messages.length,
      summaries: data.contextDAG.summaries.length,
      escalations: data.escalationSummary.totalEscalations,
      justifications: data.justificationLinks.length,
      artifacts: data.sealedArtifacts.length,
      ragTags: data.ragMetadata?.tags?.length || 0,
      timestamp: Date.now(),
    });

    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * Retorna o histórico de execução do pipeline
   */
  getPipelineHistory(): PipelineStageResult[] {
    return [...this.pipelineHistory];
  }

  /**
   * Retorna a configuração atual
   */
  getConfig(): IntelligencePipelineConfig {
    return { ...this.config };
  }

  /**
   * Atualiza a configuração do pipeline
   */
  updateConfig(config: Partial<IntelligencePipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Verifica se o pacote enriquecido é válido
   */
  validateEnrichedPackage(pkg: EnrichedSessionPackage): boolean {
    return (
      !!pkg.sessionId &&
      !!pkg.enrichedAt &&
      !!pkg.knowledgeGraph &&
      !!pkg.contextDAG &&
      !!pkg.escalationSummary &&
      Array.isArray(pkg.justificationLinks) &&
      !!pkg.sealChecksum
    );
  }
}

// Re-export all intelligence modules
export { KnowledgeGraphCompiler, KnowledgeGraph } from './knowledge-graph.js';
export { ContextDAGManager } from './context-dag.js';
export { EscalationSummarizer, EscalationSummary } from './escalation-summarizer.js';
export { JustificationLinker, JustificationLink } from './justification-linker.js';
export { ArtifactSealer, SealedArtifact } from './artifact-sealer.js';
export { OntologyMetadataTagger, RAGMetadata } from './rag-metadata.js';
export { FinalQAAuditor, QAReport } from './qa-auditor.js';
