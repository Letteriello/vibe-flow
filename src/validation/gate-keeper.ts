// Gate Keeper - Pipeline Governado de Validação de Transição de Fases BMAD
// Story: Dado um projeto em uma fase do BMAD, o sistema deve validar
// se as pré-condições foram cumpridas antes de permitir a transição

import type { Phase, ProjectContext, Artifact } from '../types.js';

/**
 * Status possível de um gate de validação
 */
export enum GateStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  PENDING = 'pending',
  SKIPPED = 'skipped'
}

/**
 * Nível de severidade do gate
 */
export enum GateSeverity {
  BLOCKING = 'blocking',    // Impede transição se falhar
  WARNING = 'warning',      // Permite mas alerta
  INFO = 'info'             // Apenas informativo
}

/**
 * Tipo de gate de validação
 */
export enum GateType {
  INPUT = 'input',           // Valida pré-condições para entrar na fase
  SPECIFICATION = 'specification', // Valida artefatos da fase
  OUTPUT = 'output'          // Valida pós-condições para sair da fase
}

/**
 * Issue individual encontrada durante a validação
 */
export interface GateIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  gateType: GateType;
  message: string;
  severity: GateSeverity;
  phase: Phase;
  expected?: string;
  actual?: string;
  suggestion?: string;
  artifactId?: string;
}

/**
 * Resultado de um gate de validação individual
 */
export interface GateResult {
  gateType: GateType;
  gateName: string;
  status: GateStatus;
  severity: GateSeverity;
  phase: Phase;
  issues: GateIssue[];
  validatedAt: string;
  details?: Record<string, unknown>;
}

/**
 * Resultado completo da validação de transição
 */
export interface ValidationResult {
  valid: boolean;
  canTransition: boolean;
  phase: Phase;
  targetPhase?: Phase;
  gates: GateResult[];
  summary: {
    totalGates: number;
    passed: number;
    failed: number;
    skipped: number;
    blockingIssues: number;
    warnings: number;
  };
  validatedAt: string;
  message?: string;
}

/**
 * Pré-condições esperadas para cada fase do BMAD
 */
export interface PhasePrerequisites {
  requiredArtifacts: ArtifactRequirement[];
  requiredDecisions: string[];
  minimumArtifacts: number;
}

export interface ArtifactRequirement {
  type: string;
  name: string;
  description: string;
  required: boolean;
  patterns?: string[];  // Patterns de nome de arquivo para verificar
}

/**
 * Mapeamento de fases para suas pré-condições
 */
export const PHASE_PREREQUISITES: Record<Phase, PhasePrerequisites> = {
  ANALYSIS: {
    requiredArtifacts: [
      { type: 'prompt', name: 'User Prompt', description: 'Descrição inicial do projeto', required: true }
    ],
    requiredDecisions: [],
    minimumArtifacts: 1
  },
  PLANNING: {
    requiredArtifacts: [
      { type: 'prd', name: 'Product Requirements Document', description: 'Documento de requisitos do produto', required: true },
      { type: 'prompt', name: 'User Prompt', description: 'Descrição inicial do projeto', required: true }
    ],
    requiredDecisions: [],
    minimumArtifacts: 2
  },
  SOLUTIONING: {
    requiredArtifacts: [
      { type: 'prd', name: 'Product Requirements Document', description: 'Documento de requisitos do produto', required: true },
      { type: 'architecture', name: 'Architecture Document', description: 'Documento de arquitetura', required: true },
      { type: 'plan', name: 'Implementation Plan', description: 'Plano de implementação', required: true }
    ],
    requiredDecisions: ['tech-stack', 'architecture-pattern'],
    minimumArtifacts: 3
  },
  COMPLETE: {
    requiredArtifacts: [
      { type: 'prd', name: 'Product Requirements Document', description: 'Documento de requisitos do produto', required: true },
      { type: 'architecture', name: 'Architecture Document', description: 'Documento de arquitetura', required: true },
      { type: 'implementation', name: 'Implementation Artifacts', description: 'Artefatos de implementação', required: true }
    ],
    requiredDecisions: ['tech-stack', 'architecture-pattern', 'deployment'],
    minimumArtifacts: 3
  }
};

/**
 * Gate Keeper - Pipeline Governado de Validação
 *
 * Responsável por validar as transições entre fases do BMAD:
 * - validateInput(): Pré-condições para entrar em uma fase
 * - validateSpecification(): Validação de artefatos da fase atual
 * - validateOutput(): Pós-condições para sair da fase
 */
export class GateKeeper {
  private context: ProjectContext;
  private strictMode: boolean;

  constructor(context: ProjectContext, strictMode = true) {
    this.context = context;
    this.strictMode = strictMode;
  }

  /**
   * Valida as pré-condições para ENTRAR na fase especificada
   * Executa validateInput() - Story: Verifica se a fase atual permitiu gerar artefatos necessários
   */
  validateInput(targetPhase: Phase): ValidationResult {
    const prerequisites = PHASE_PREREQUISITES[targetPhase];
    const gates: GateResult[] = [];

    // Gate 1: Verificar se há artefatos suficientes do contexto atual
    const artifactGate = this.checkArtifactGate(targetPhase, prerequisites);
    gates.push(artifactGate);

    // Gate 2: Verificar se há decisões suficientes para a transição
    const decisionGate = this.checkDecisionGate(targetPhase, prerequisites);
    gates.push(decisionGate);

    // Gate 3: Verificar se os artefatos obrigatórios existem
    const requiredGate = this.checkRequiredArtifactsGate(targetPhase, prerequisites);
    gates.push(requiredGate);

    // Gate 4: Verificar se a fase atual foi concluída (progresso mínimo)
    const progressGate = this.checkProgressGate(targetPhase);
    gates.push(progressGate);

    // Compilar resultado
    return this.compileResult(gates, targetPhase, 'input');
  }

  /**
   * Valida as especificações da fase ATUAL
   * Executa validateSpecification() - Story: Verifica se os artefatos da fase são válidos
   */
  validateSpecification(): ValidationResult {
    const currentPhase = this.context.phase;
    const prerequisites = PHASE_PREREQUISITES[currentPhase];
    const gates: GateResult[] = [];

    // Gate 1: Verificar qualidade dos artefatos existentes
    const qualityGate = this.checkArtifactQualityGate();
    gates.push(qualityGate);

    // Gate 2: Verificar consistência entre artefatos
    const consistencyGate = this.checkArtifactConsistencyGate(currentPhase);
    gates.push(consistencyGate);

    // Gate 3: Verificar completude das especificações
    const completenessGate = this.checkCompletenessGate(currentPhase, prerequisites);
    gates.push(completenessGate);

    // Compilar resultado
    return this.compileResult(gates, currentPhase, 'specification');
  }

  /**
   * Valida as pós-condições para SAIR da fase especificada
   * Executa validateOutput() - Story: Verifica se a fase atingiu seus objetivos
   */
  validateOutput(): ValidationResult {
    const currentPhase = this.context.phase;
    const prerequisites = PHASE_PREREQUISITES[currentPhase];
    const gates: GateResult[] = [];

    // Gate 1: Verificar se todos os artefatos obrigatórios foram criados
    const outputArtifactsGate = this.checkOutputArtifactsGate(currentPhase, prerequisites);
    gates.push(outputArtifactsGate);

    // Gate 2: Verificar se as decisões necessárias foram tomadas
    const outputDecisionGate = this.checkOutputDecisionGate(currentPhase, prerequisites);
    gates.push(outputDecisionGate);

    // Gate 3: Verificar se a fase atingiu o progresso mínimo
    const outputProgressGate = this.checkOutputProgressGate(currentPhase);
    gates.push(outputProgressGate);

    // Gate 4: Verificar se há artefatos suficientes para transição
    const outputSufficiencyGate = this.checkOutputSufficiencyGate(currentPhase);
    gates.push(outputSufficiencyGate);

    // Compilar resultado
    return this.compileResult(gates, currentPhase, 'output');
  }

  /**
   * Validação completa de transição entre fases
   */
  validateTransition(targetPhase: Phase): ValidationResult {
    // Valida input para a nova fase
    const inputResult = this.validateInput(targetPhase);

    // Se input falhar com issues blocking, retorna imediatamente
    if (!inputResult.canTransition) {
      return inputResult;
    }

    // Valida output da fase atual
    const outputResult = this.validateOutput();

    // Combina resultados
    return this.combineResults(inputResult, outputResult, targetPhase);
  }

  // ========== Private Gate Checkers ==========

  private checkArtifactGate(targetPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const hasMinimum = artifacts.length >= prerequisites.minimumArtifacts;

    const issues: GateIssue[] = [];

    if (!hasMinimum) {
      issues.push({
        id: `artifact-gate-${Date.now()}`,
        type: this.strictMode ? 'error' : 'warning',
        gateType: GateType.INPUT,
        message: `Artefatos insuficientes para transição para ${targetPhase}`,
        severity: GateSeverity.BLOCKING,
        phase: this.context.phase,
        expected: `Mínimo de ${prerequisites.minimumArtifacts} artefatos`,
        actual: `${artifacts.length} artefatos`,
        suggestion: `Gere mais artefatos na fase ${this.context.phase} antes de avançar`
      });
    }

    return {
      gateType: GateType.INPUT,
      gateName: 'Artifact Gate',
      status: hasMinimum ? GateStatus.PASSED : GateStatus.FAILED,
      severity: hasMinimum ? GateSeverity.INFO : (this.strictMode ? GateSeverity.BLOCKING : GateSeverity.WARNING),
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { artifactCount: artifacts.length, required: prerequisites.minimumArtifacts }
    };
  }

  private checkDecisionGate(targetPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const decisions = this.context.decisions ?? [];
    const decisionTopics = decisions.map(d => d.question.toLowerCase());

    const missingDecisions: string[] = [];
    for (const required of prerequisites.requiredDecisions) {
      const found = decisionTopics.some(topic => topic.includes(required));
      if (!found) {
        missingDecisions.push(required);
      }
    }

    const issues: GateIssue[] = [];

    if (missingDecisions.length > 0) {
      issues.push({
        id: `decision-gate-${Date.now()}`,
        type: this.strictMode ? 'error' : 'warning',
        gateType: GateType.INPUT,
        message: `Decisões faltando para transição para ${targetPhase}`,
        severity: GateSeverity.BLOCKING,
        phase: this.context.phase,
        expected: `Decisões: ${prerequisites.requiredDecisions.join(', ')}`,
        actual: `Decisões faltando: ${missingDecisions.join(', ')}`,
        suggestion: `Tome as decisões necessárias na fase ${this.context.phase}`,
        artifactId: missingDecisions[0]
      });
    }

    return {
      gateType: GateType.INPUT,
      gateName: 'Decision Gate',
      status: missingDecisions.length === 0 ? GateStatus.PASSED : GateStatus.FAILED,
      severity: missingDecisions.length === 0 ? GateSeverity.INFO : (this.strictMode ? GateSeverity.BLOCKING : GateSeverity.WARNING),
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { decisionCount: decisions.length, missingDecisions }
    };
  }

  private checkRequiredArtifactsGate(targetPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const artifactTypes = artifacts.map(a => a.type.toLowerCase());

    const missingRequired: ArtifactRequirement[] = [];

    for (const required of prerequisites.requiredArtifacts) {
      if (required.required) {
        const found = artifactTypes.some(type => type === required.type.toLowerCase());
        if (!found) {
          missingRequired.push(required);
        }
      }
    }

    const issues: GateIssue[] = [];

    for (const missing of missingRequired) {
      issues.push({
        id: `required-artifact-gate-${missing.type}-${Date.now()}`,
        type: 'error',
        gateType: GateType.INPUT,
        message: `Artefato obrigatório ausente: ${missing.name}`,
        severity: GateSeverity.BLOCKING,
        phase: this.context.phase,
        expected: missing.type,
        actual: 'não encontrado',
        suggestion: `Gere o artefato ${missing.name} antes de avançar para ${targetPhase}`,
        artifactId: missing.type
      });
    }

    return {
      gateType: GateType.INPUT,
      gateName: 'Required Artifacts Gate',
      status: missingRequired.length === 0 ? GateStatus.PASSED : GateStatus.FAILED,
      severity: missingRequired.length === 0 ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { missingRequired: missingRequired.map(m => m.type) }
    };
  }

  private checkProgressGate(targetPhase: Phase): GateResult {
    const currentStep = this.context.currentStep;
    const totalSteps = this.context.totalSteps;
    const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

    const issues: GateIssue[] = [];

    // Para transicionar, precisa ter completado pelo menos 50% da fase atual
    if (progress < 50 && this.strictMode) {
      issues.push({
        id: `progress-gate-${Date.now()}`,
        type: 'warning',
        gateType: GateType.INPUT,
        message: `Progresso insuficiente na fase atual`,
        severity: GateSeverity.WARNING,
        phase: this.context.phase,
        expected: 'Mínimo 50% de progresso',
        actual: `${Math.round(progress)}% de progresso`,
        suggestion: 'Complete mais tarefas da fase atual antes de avançar'
      });
    }

    return {
      gateType: GateType.INPUT,
      gateName: 'Progress Gate',
      status: progress >= 50 || !this.strictMode ? GateStatus.PASSED : GateStatus.PENDING,
      severity: GateSeverity.INFO,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { currentStep, totalSteps, progress: Math.round(progress) }
    };
  }

  private checkArtifactQualityGate(): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const issues: GateIssue[] = [];

    for (const artifact of artifacts) {
      // Verificar se artefato tem conteúdo
      if (!artifact.content || artifact.content.trim().length === 0) {
        issues.push({
          id: `quality-gate-${artifact.id}-${Date.now()}`,
          type: 'error',
          gateType: GateType.SPECIFICATION,
          message: `Artefato "${artifact.id}" está vazio`,
          severity: GateSeverity.BLOCKING,
          phase: this.context.phase,
          expected: 'Conteúdo não vazio',
          actual: 'Conteúdo vazio',
          suggestion: `Preencha o conteúdo do artefato ${artifact.id}`,
          artifactId: artifact.id
        });
      }

      // Verificar tamanho mínimo do conteúdo
      const minContentLength = 50;
      if (artifact.content && artifact.content.length < minContentLength) {
        issues.push({
          id: `quality-gate-size-${artifact.id}-${Date.now()}`,
          type: 'warning',
          gateType: GateType.SPECIFICATION,
          message: `Artefato "${artifact.id}" tem conteúdo muito curto`,
          severity: GateSeverity.WARNING,
          phase: this.context.phase,
          expected: `Mínimo ${minContentLength} caracteres`,
          actual: `${artifact.content.length} caracteres`,
          suggestion: `Expanda o conteúdo do artefato ${artifact.id}`,
          artifactId: artifact.id
        });
      }
    }

    const passed = issues.filter(i => i.type === 'error').length === 0;

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Artifact Quality Gate',
      status: passed ? GateStatus.PASSED : GateStatus.FAILED,
      severity: passed ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { artifactsChecked: artifacts.length }
    };
  }

  private checkArtifactConsistencyGate(currentPhase: Phase): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const issues: GateIssue[] = [];

    // Verificar se há PRD quando tem Architecture
    const hasPrd = artifacts.some(a => a.type.toLowerCase() === 'prd');
    const hasArchitecture = artifacts.some(a => a.type.toLowerCase() === 'architecture');

    if (hasArchitecture && !hasPrd) {
      issues.push({
        id: `consistency-gate-${Date.now()}`,
        type: 'error',
        gateType: GateType.SPECIFICATION,
        message: 'Arquitetura definida sem PRD correspondente',
        severity: GateSeverity.BLOCKING,
        phase: currentPhase,
        expected: 'PRD antes de Architecture',
        actual: 'Architecture sem PRD',
        suggestion: 'Gere o PRD antes de definir a arquitetura'
      });
    }

    // Verificar se há plano quando tem implementação
    const hasPlan = artifacts.some(a => a.type.toLowerCase() === 'plan');
    const hasImplementation = artifacts.some(a => a.type.toLowerCase() === 'implementation');

    if (hasImplementation && !hasPlan) {
      issues.push({
        id: `consistency-gate-plan-${Date.now()}`,
        type: 'warning',
        gateType: GateType.SPECIFICATION,
        message: 'Implementação iniciada sem plano correspondente',
        severity: GateSeverity.WARNING,
        phase: currentPhase,
        expected: 'Plan antes de Implementation',
        actual: 'Implementation sem Plan',
        suggestion: 'Gere o plano de implementação primeiro'
      });
    }

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Artifact Consistency Gate',
      status: issues.filter(i => i.severity === GateSeverity.BLOCKING).length === 0 ? GateStatus.PASSED : GateStatus.FAILED,
      severity: GateSeverity.INFO,
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString()
    };
  }

  private checkCompletenessGate(currentPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const artifactTypes = artifacts.map(a => a.type.toLowerCase());

    const missingForPhase: string[] = [];

    //根据当前阶段检查必要的工件
    const phaseRequiredMap: Record<Phase, string[]> = {
      ANALYSIS: ['prompt'],
      PLANNING: ['prd'],
      SOLUTIONING: ['architecture', 'plan'],
      COMPLETE: ['implementation']
    };

    const requiredForPhase = phaseRequiredMap[currentPhase] || [];

    for (const required of requiredForPhase) {
      const found = artifactTypes.some(type => type === required);
      if (!found) {
        missingForPhase.push(required);
      }
    }

    const issues: GateIssue[] = [];

    if (missingForPhase.length > 0) {
      issues.push({
        id: `completeness-gate-${Date.now()}`,
        type: 'error',
        gateType: GateType.SPECIFICATION,
        message: `Artefatos faltando para fase ${currentPhase}`,
        severity: GateSeverity.BLOCKING,
        phase: currentPhase,
        expected: requiredForPhase.join(', '),
        actual: missingForPhase.join(', '),
        suggestion: `Gere os artefatos necessários: ${missingForPhase.join(', ')}`
      });
    }

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Completeness Gate',
      status: missingForPhase.length === 0 ? GateStatus.PASSED : GateStatus.FAILED,
      severity: missingForPhase.length === 0 ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { missingForPhase }
    };
  }

  private checkOutputArtifactsGate(currentPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const artifactTypes = artifacts.map(a => a.type.toLowerCase());

    const issues: GateIssue[] = [];
    let allRequiredPresent = true;

    for (const required of prerequisites.requiredArtifacts) {
      if (required.required) {
        const found = artifactTypes.some(type => type === required.type.toLowerCase());
        if (!found) {
          allRequiredPresent = false;
          issues.push({
            id: `output-artifact-${required.type}-${Date.now()}`,
            type: 'error',
            gateType: GateType.OUTPUT,
            message: `Artefato obrigatório não criado: ${required.name}`,
            severity: GateSeverity.BLOCKING,
            phase: currentPhase,
            expected: required.type,
            actual: 'não encontrado',
            suggestion: `Crie o artefato ${required.name} antes de concluir a fase`,
            artifactId: required.type
          });
        }
      }
    }

    return {
      gateType: GateType.OUTPUT,
      gateName: 'Output Artifacts Gate',
      status: allRequiredPresent ? GateStatus.PASSED : GateStatus.FAILED,
      severity: allRequiredPresent ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { totalArtifacts: artifacts.length }
    };
  }

  private checkOutputDecisionGate(currentPhase: Phase, prerequisites: PhasePrerequisites): GateResult {
    const decisions = this.context.decisions ?? [];
    const decisionTopics = decisions.map(d => d.question.toLowerCase());

    const issues: GateIssue[] = [];
    let allDecisionsMade = true;

    for (const required of prerequisites.requiredDecisions) {
      const found = decisionTopics.some(topic => topic.includes(required));
      if (!found) {
        allDecisionsMade = false;
        issues.push({
          id: `output-decision-${required}-${Date.now()}`,
          type: this.strictMode ? 'error' : 'warning',
          gateType: GateType.OUTPUT,
          message: `Decisão necessária não tomada: ${required}`,
          severity: this.strictMode ? GateSeverity.BLOCKING : GateSeverity.WARNING,
          phase: currentPhase,
          expected: required,
          actual: 'não decidido',
          suggestion: `Tome a decisão sobre ${required} antes de concluir a fase`,
          artifactId: required
        });
      }
    }

    return {
      gateType: GateType.OUTPUT,
      gateName: 'Output Decision Gate',
      status: allDecisionsMade ? GateStatus.PASSED : GateStatus.FAILED,
      severity: allDecisionsMade ? GateSeverity.INFO : (this.strictMode ? GateSeverity.BLOCKING : GateSeverity.WARNING),
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { totalDecisions: decisions.length }
    };
  }

  private checkOutputProgressGate(currentPhase: Phase): GateResult {
    const currentStep = this.context.currentStep;
    const totalSteps = this.context.totalSteps;
    const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

    const issues: GateIssue[] = [];

    // Para output, precisa de pelo menos 75% de progresso
    if (progress < 75 && this.strictMode) {
      issues.push({
        id: `output-progress-${Date.now()}`,
        type: 'warning',
        gateType: GateType.OUTPUT,
        message: `Progresso insuficiente para concluir a fase`,
        severity: GateSeverity.WARNING,
        phase: currentPhase,
        expected: 'Mínimo 75% de progresso',
        actual: `${Math.round(progress)}% de progresso`,
        suggestion: 'Complete mais tarefas antes de concluir a fase'
      });
    }

    return {
      gateType: GateType.OUTPUT,
      gateName: 'Output Progress Gate',
      status: progress >= 75 || !this.strictMode ? GateStatus.PASSED : GateStatus.PENDING,
      severity: GateSeverity.INFO,
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { currentStep, totalSteps, progress: Math.round(progress) }
    };
  }

  private checkOutputSufficiencyGate(currentPhase: Phase): GateResult {
    const artifacts = this.context.artifacts ?? [];
    const prerequisites = PHASE_PREREQUISITES[currentPhase];

    const hasMinimum = artifacts.length >= prerequisites.minimumArtifacts;

    const issues: GateIssue[] = [];

    if (!hasMinimum) {
      issues.push({
        id: `output-sufficiency-${Date.now()}`,
        type: 'error',
        gateType: GateType.OUTPUT,
        message: `Artefatos insuficientes para concluir a fase ${currentPhase}`,
        severity: GateSeverity.BLOCKING,
        phase: currentPhase,
        expected: `Mínimo ${prerequisites.minimumArtifacts} artefatos`,
        actual: `${artifacts.length} artefatos`,
        suggestion: 'Crie mais artefatos antes de concluir a fase'
      });
    }

    return {
      gateType: GateType.OUTPUT,
      gateName: 'Output Sufficiency Gate',
      status: hasMinimum ? GateStatus.PASSED : GateStatus.FAILED,
      severity: hasMinimum ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: currentPhase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { artifactCount: artifacts.length, required: prerequisites.minimumArtifacts }
    };
  }

  // ========== Private Helpers ==========

  private compileResult(gates: GateResult[], phase: Phase, gateTypeStr: string): ValidationResult {
    const passed = gates.filter(g => g.status === GateStatus.PASSED).length;
    const failed = gates.filter(g => g.status === GateStatus.FAILED).length;
    const skipped = gates.filter(g => g.status === GateStatus.SKIPPED).length;
    const blockingIssues = gates.flatMap(g => g.issues).filter(i => i.severity === GateSeverity.BLOCKING).length;
    const warnings = gates.flatMap(g => g.issues).filter(i => i.type === 'warning').length;

    const canTransition = blockingIssues === 0 && failed === 0;

    return {
      valid: failed === 0 && blockingIssues === 0,
      canTransition,
      phase,
      gates,
      summary: {
        totalGates: gates.length,
        passed,
        failed,
        skipped,
        blockingIssues,
        warnings
      },
      validatedAt: new Date().toISOString(),
      message: canTransition ? `${gateTypeStr.toUpperCase()} validation passed` : `${gateTypeStr.toUpperCase()} validation failed with ${blockingIssues} blocking issues`
    };
  }

  private combineResults(inputResult: ValidationResult, outputResult: ValidationResult, targetPhase: Phase): ValidationResult {
    const allGates = [...inputResult.gates, ...outputResult.gates];

    const passed = allGates.filter(g => g.status === GateStatus.PASSED).length;
    const failed = allGates.filter(g => g.status === GateStatus.FAILED).length;
    const skipped = allGates.filter(g => g.status === GateStatus.SKIPPED).length;
    const blockingIssues = allGates.flatMap(g => g.issues).filter(i => i.severity === GateSeverity.BLOCKING).length;
    const warnings = allGates.flatMap(g => g.issues).filter(i => i.type === 'warning').length;

    const canTransition = inputResult.canTransition && outputResult.canTransition && blockingIssues === 0;

    return {
      valid: failed === 0 && blockingIssues === 0,
      canTransition,
      phase: this.context.phase,
      targetPhase,
      gates: allGates,
      summary: {
        totalGates: allGates.length,
        passed,
        failed,
        skipped,
        blockingIssues,
        warnings
      },
      validatedAt: new Date().toISOString(),
      message: canTransition
        ? `Transition validation to ${targetPhase} passed`
        : `Transition validation failed with ${blockingIssues} blocking issues`
    };
  }
}

// ========== Convenience Functions ==========

/**
 * Valida as pré-condições para entrar em uma fase (INPUT)
 */
export function validateInput(context: ProjectContext, targetPhase: Phase, strictMode = true): ValidationResult {
  const keeper = new GateKeeper(context, strictMode);
  return keeper.validateInput(targetPhase);
}

/**
 * Valida as especificações da fase atual (SPECIFICATION)
 */
export function validateSpecification(context: ProjectContext, strictMode = true): ValidationResult {
  const keeper = new GateKeeper(context, strictMode);
  return keeper.validateSpecification();
}

/**
 * Valida as pós-condições para sair da fase atual (OUTPUT)
 */
export function validateOutput(context: ProjectContext, strictMode = true): ValidationResult {
  const keeper = new GateKeeper(context, strictMode);
  return keeper.validateOutput();
}

/**
 * Valida uma transição completa entre fases
 */
export function validateTransition(context: ProjectContext, targetPhase: Phase, strictMode = true): ValidationResult {
  const keeper = new GateKeeper(context, strictMode);
  return keeper.validateTransition(targetPhase);
}
