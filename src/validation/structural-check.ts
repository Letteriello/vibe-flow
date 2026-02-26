// Structural Check - Verificações Estruturais Profundas para Artefatos BMAD
// Story: Dado um artefato de especificação, o validador estrutural verifica
// se o conteúdo segue a estrutura esperada para a fase atual

import type { Phase, Artifact, ProjectContext } from '../types.js';
import { GateStatus, GateSeverity, GateType, type GateResult, type GateIssue, type ValidationResult } from './gate-keeper.js';

/**
 * Tipo de estrutura esperada para cada tipo de artefato
 */
export interface StructureRule {
  type: string;
  requiredSections: string[];
  optionalSections: string[];
  minLength: number;
  maxLength: number;
  requiredFields: string[];
  validationPatterns: ValidationPattern[];
}

export interface ValidationPattern {
  name: string;
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Estruturas esperadas para cada tipo de artefato
 */
export const ARTIFACT_STRUCTURES: Record<string, StructureRule> = {
  prd: {
    type: 'prd',
    requiredSections: ['overview', 'requirements', 'features', 'constraints'],
    optionalSections: ['assumptions', 'glossary', 'references'],
    minLength: 500,
    maxLength: 50000,
    requiredFields: [],
    validationPatterns: [
      { name: 'hasFeatures', pattern: /features?|funcionalidades?|funcionalidades/i, message: 'PRD deve conter seção de features', severity: 'error' },
      { name: 'hasRequirements', pattern: /requirements?|requisitos/i, message: 'PRD deve conter seção de requisitos', severity: 'error' }
    ]
  },
  architecture: {
    type: 'architecture',
    requiredSections: ['overview', 'components', 'data-flow', 'technology-stack'],
    optionalSections: ['security', 'scalability', 'monitoring', 'deployment'],
    minLength: 800,
    maxLength: 100000,
    requiredFields: [],
    validationPatterns: [
      { name: 'hasComponents', pattern: /components?|componentes/i, message: 'Arquitetura deve descrever componentes', severity: 'error' },
      { name: 'hasTechStack', pattern: /technology.?stack|stack|tecnologias|tech/i, message: 'Arquitetura deve definir stack tecnológico', severity: 'error' }
    ]
  },
  plan: {
    type: 'plan',
    requiredSections: ['phases', 'timeline', 'deliverables'],
    optionalSections: ['risks', 'resources', 'milestones'],
    minLength: 300,
    maxLength: 50000,
    requiredFields: [],
    validationPatterns: [
      { name: 'hasPhases', pattern: /phases?|fases|etapas/i, message: 'Plano deve conter fases', severity: 'error' },
      { name: 'hasDeliverables', pattern: /deliverables?|entregas|entregáveis/i, message: 'Plano deve conter entregas definidas', severity: 'error' }
    ]
  },
  implementation: {
    type: 'implementation',
    requiredSections: ['files', 'code'],
    optionalSections: ['tests', 'configuration', 'documentation'],
    minLength: 100,
    maxLength: Infinity,
    requiredFields: [],
    validationPatterns: [
      { name: 'hasCode', pattern: /code|código|function|class|interface/i, message: 'Implementação deve conter código', severity: 'error' }
    ]
  },
  prompt: {
    type: 'prompt',
    requiredSections: ['description', 'goal'],
    optionalSections: ['context', 'constraints', 'examples'],
    minLength: 20,
    maxLength: 50000,
    requiredFields: [],
    validationPatterns: [
      { name: 'hasGoal', pattern: /goal|objetivo|finalidade/i, message: 'Prompt deve ter um objetivo definido', severity: 'error' }
    ]
  }
};

/**
 * Regras de validação estrutural por fase
 */
export const PHASE_STRUCTURAL_RULES: Record<Phase, StructuralPhaseRule> = {
  ANALYSIS: {
    phase: 'ANALYSIS',
    expectedArtifactTypes: ['prompt'],
    minArtifacts: 1,
    maxArtifacts: 3,
    requireApproval: false,
    validationOrder: ['prompt']
  },
  PLANNING: {
    phase: 'PLANNING',
    expectedArtifactTypes: ['prompt', 'prd'],
    minArtifacts: 1,
    maxArtifacts: 5,
    requireApproval: false,
    validationOrder: ['prompt', 'prd']
  },
  SOLUTIONING: {
    phase: 'SOLUTIONING',
    expectedArtifactTypes: ['prd', 'architecture', 'plan'],
    minArtifacts: 2,
    maxArtifacts: 10,
    requireApproval: true,
    validationOrder: ['prd', 'architecture', 'plan']
  },
  COMPLETE: {
    phase: 'COMPLETE',
    expectedArtifactTypes: ['prd', 'architecture', 'implementation'],
    minArtifacts: 2,
    maxArtifacts: Infinity,
    requireApproval: true,
    validationOrder: ['prd', 'architecture', 'implementation']
  }
};

export interface StructuralPhaseRule {
  phase: Phase;
  expectedArtifactTypes: string[];
  minArtifacts: number;
  maxArtifacts: number;
  requireApproval: boolean;
  validationOrder: string[];
}

/**
 * Resultado de verificação estrutural de um artefato
 */
export interface StructuralCheckResult {
  artifactId: string;
  artifactType: string;
  valid: boolean;
  structureRule?: StructureRule;
  sectionChecks: SectionCheck[];
  patternChecks: PatternCheck[];
  lengthCheck: LengthCheck;
  overallIssues: StructuralIssue[];
  validatedAt: string;
}

export interface SectionCheck {
  section: string;
  present: boolean;
  required: boolean;
  position?: number;
}

export interface PatternCheck {
  pattern: string;
  matched: boolean;
  message: string;
  severity: 'error' | 'warning';
}

export interface LengthCheck {
  actual: number;
  min: number;
  max: number;
  valid: boolean;
}

export interface StructuralIssue {
  type: 'missing_section' | 'pattern_mismatch' | 'length_invalid' | 'structure_invalid';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
  suggestion?: string;
}

/**
 * Structural Checker - Validações Estruturais Profundas
 *
 * Executa verificações estruturais em artefatos:
 * - Validação de seções obrigatórias
 * - Validação de padrões (regex)
 * - Validação de comprimento
 * - Validação de ordem de artefatos
 */
export class StructuralChecker {
  private context: ProjectContext;
  private strictMode: boolean;

  constructor(context: ProjectContext, strictMode = true) {
    this.context = context;
    this.strictMode = strictMode;
  }

  /**
   * Valida a estrutura de um artefato específico
   */
  checkArtifactStructure(artifact: Artifact): StructuralCheckResult {
    const structureRule = ARTIFACT_STRUCTURES[artifact.type.toLowerCase()];
    const issues: StructuralIssue[] = [];

    // Se não houver regra específica, retorna válido
    if (!structureRule) {
      return {
        artifactId: artifact.id,
        artifactType: artifact.type,
        valid: true,
        sectionChecks: [],
        patternChecks: [],
        lengthCheck: { actual: 0, min: 0, max: Infinity, valid: true },
        overallIssues: [],
        validatedAt: new Date().toISOString()
      };
    }

    const content = artifact.content || '';
    const sectionChecks = this.checkSections(content, structureRule);
    const patternChecks = this.checkPatterns(content, structureRule);
    const lengthCheck = this.checkLength(content, structureRule);

    // Compilar issues
    for (const section of sectionChecks) {
      if (section.required && !section.present) {
        issues.push({
          type: 'missing_section',
          severity: 'error',
          message: `Seção obrigatória ausente: ${section.section}`,
          location: section.section,
          suggestion: `Adicione a seção "${section.section}" ao artefato`
        });
      }
    }

    for (const pattern of patternChecks) {
      if (!pattern.matched) {
        issues.push({
          type: 'pattern_mismatch',
          severity: pattern.severity,
          message: pattern.message,
          suggestion: pattern.message
        });
      }
    }

    if (!lengthCheck.valid) {
      issues.push({
        type: 'length_invalid',
        severity: 'warning',
        message: `Tamanho do conteúdo: ${lengthCheck.actual} caracteres (mín: ${lengthCheck.min}, máx: ${lengthCheck.max})`,
        suggestion: lengthCheck.actual < lengthCheck.min
          ? `Expanda o conteúdo para pelo menos ${lengthCheck.min} caracteres`
          : `Conteúdo muito longo, considere dividir em partes`
      });
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      artifactId: artifact.id,
      artifactType: artifact.type,
      valid: !hasErrors,
      structureRule,
      sectionChecks,
      patternChecks,
      lengthCheck,
      overallIssues: issues,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Valida estrutura de todos os artefatos do contexto
   */
  checkAllArtifacts(): StructuralCheckResult[] {
    const artifacts = this.context.artifacts || [];
    return artifacts.map(artifact => this.checkArtifactStructure(artifact));
  }

  /**
   * Valida a estrutura da fase atual
   */
  validatePhaseStructure(): ValidationResult {
    const currentPhase = this.context.phase;
    const phaseRule = PHASE_STRUCTURAL_RULES[currentPhase];
    const gates: GateResult[] = [];

    // Gate 1: Verificar tipos de artefatos esperados
    const artifactTypeGate = this.checkArtifactTypeGate(phaseRule);
    gates.push(artifactTypeGate);

    // Gate 2: Verificar quantidade de artefatos
    const artifactCountGate = this.checkArtifactCountGate(phaseRule);
    gates.push(artifactCountGate);

    // Gate 3: Verificar estrutura individual dos artefatos
    const structuralGate = this.checkStructuralGate();
    gates.push(structuralGate);

    // Gate 4: Verificar ordem de validação
    const orderGate = this.checkValidationOrderGate(phaseRule);
    gates.push(orderGate);

    // Compilar resultado
    return this.compileStructuralResult(gates, currentPhase);
  }

  // ========== Private Checkers ==========

  private checkSections(content: string, rule: StructureRule): SectionCheck[] {
    const lowerContent = content.toLowerCase();
    const checks: SectionCheck[] = [];

    // Verificar seções obrigatórias
    for (const section of rule.requiredSections) {
      const pattern = new RegExp(`^#*\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im');
      const present = pattern.test(lowerContent);

      // Tentar encontrar a posição
      let position: number | undefined;
      const match = lowerContent.search(pattern);
      if (match !== -1) {
        position = match;
      }

      checks.push({
        section,
        present,
        required: true,
        position
      });
    }

    // Verificar seções opcionais
    for (const section of rule.optionalSections) {
      const pattern = new RegExp(`^#*\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im');
      const present = pattern.test(lowerContent);

      let position: number | undefined;
      const match = lowerContent.search(pattern);
      if (match !== -1) {
        position = match;
      }

      checks.push({
        section,
        present,
        required: false,
        position
      });
    }

    return checks;
  }

  private checkPatterns(content: string, rule: StructureRule): PatternCheck[] {
    return rule.validationPatterns.map(vp => ({
      pattern: vp.name,
      matched: vp.pattern.test(content),
      message: vp.message,
      severity: vp.severity
    }));
  }

  private checkLength(content: string, rule: StructureRule): LengthCheck {
    const length = content.trim().length;
    const valid = length >= rule.minLength && (rule.maxLength === Infinity || length <= rule.maxLength);

    return {
      actual: length,
      min: rule.minLength,
      max: rule.maxLength,
      valid
    };
  }

  private checkArtifactTypeGate(phaseRule: StructuralPhaseRule): GateResult {
    const artifacts = this.context.artifacts || [];
    const artifactTypes = artifacts.map(a => a.type.toLowerCase());

    const expectedTypes = phaseRule.expectedArtifactTypes;
    const unexpectedTypes = artifactTypes.filter(t => !expectedTypes.includes(t));

    const issues: GateIssue[] = [];

    if (unexpectedTypes.length > 0) {
      issues.push({
        id: `type-gate-${Date.now()}`,
        type: 'warning',
        gateType: GateType.SPECIFICATION,
        message: `Tipos de artefato inesperados para fase ${phaseRule.phase}`,
        severity: GateSeverity.WARNING,
        phase: this.context.phase,
        expected: expectedTypes.join(', '),
        actual: unexpectedTypes.join(', '),
        suggestion: `Remova ou reclassifique artefatos dos tipos: ${unexpectedTypes.join(', ')}`
      });
    }

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Artifact Type Gate',
      status: issues.length === 0 ? GateStatus.PASSED : GateStatus.PENDING,
      severity: GateSeverity.INFO,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { expectedTypes, actualTypes: artifactTypes }
    };
  }

  private checkArtifactCountGate(phaseRule: StructuralPhaseRule): GateResult {
    const artifacts = this.context.artifacts || [];
    const count = artifacts.length;

    const issues: GateIssue[] = [];

    if (count < phaseRule.minArtifacts) {
      issues.push({
        id: `count-gate-${Date.now()}`,
        type: 'error',
        gateType: GateType.SPECIFICATION,
        message: `Quantidade insuficiente de artefatos para fase ${phaseRule.phase}`,
        severity: GateSeverity.BLOCKING,
        phase: this.context.phase,
        expected: `Mínimo ${phaseRule.minArtifacts} artefatos`,
        actual: `${count} artefatos`,
        suggestion: `Crie mais ${phaseRule.minArtifacts - count} artefatos para a fase`
      });
    }

    if (count > phaseRule.maxArtifacts) {
      issues.push({
        id: `count-gate-max-${Date.now()}`,
        type: 'warning',
        gateType: GateType.SPECIFICATION,
        message: `Quantidade excessiva de artefatos para fase ${phaseRule.phase}`,
        severity: GateSeverity.WARNING,
        phase: this.context.phase,
        expected: `Máximo ${phaseRule.maxArtifacts} artefatos`,
        actual: `${count} artefatos`,
        suggestion: 'Considere remover ou consolidar artefatos extras'
      });
    }

    const valid = count >= phaseRule.minArtifacts && count <= phaseRule.maxArtifacts;

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Artifact Count Gate',
      status: valid ? GateStatus.PASSED : GateStatus.FAILED,
      severity: valid ? GateSeverity.INFO : GateSeverity.BLOCKING,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { count, min: phaseRule.minArtifacts, max: phaseRule.maxArtifacts }
    };
  }

  private checkStructuralGate(): GateResult {
    const results = this.checkAllArtifacts();
    const issues: GateIssue[] = [];

    for (const result of results) {
      if (!result.valid) {
        for (const issue of result.overallIssues) {
          issues.push({
            id: `struct-gate-${result.artifactId}-${Date.now()}`,
            type: issue.severity,
            gateType: GateType.SPECIFICATION,
            message: `[${result.artifactType}] ${issue.message}`,
            severity: issue.severity === 'error' ? GateSeverity.BLOCKING : GateSeverity.WARNING,
            phase: this.context.phase,
            expected: undefined,
            actual: undefined,
            suggestion: issue.suggestion,
            artifactId: result.artifactId
          });
        }
      }
    }

    const hasErrors = issues.some(i => i.type === 'error');

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Structural Gate',
      status: hasErrors ? GateStatus.FAILED : GateStatus.PASSED,
      severity: hasErrors ? GateSeverity.BLOCKING : GateSeverity.INFO,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString(),
      details: { artifactsChecked: results.length, invalidArtifacts: results.filter(r => !r.valid).length }
    };
  }

  private checkValidationOrderGate(phaseRule: StructuralPhaseRule): GateResult {
    const artifacts = this.context.artifacts || [];
    const issues: GateIssue[] = [];

    // Verificar se a ordem de criação está correta
    const validationOrder = phaseRule.validationOrder;

    for (let i = 0; i < validationOrder.length - 1; i++) {
      const currentType = validationOrder[i];
      const nextType = validationOrder[i + 1];

      const hasCurrent = artifacts.some(a => a.type.toLowerCase() === currentType);
      const hasNext = artifacts.some(a => a.type.toLowerCase() === nextType);

      // Se tem o próximo mas não tem o atual, é um problema de ordem
      if (hasNext && !hasCurrent) {
        issues.push({
          id: `order-gate-${Date.now()}`,
          type: 'error',
          gateType: GateType.SPECIFICATION,
          message: `Artefato "${nextType}" encontrado sem "${currentType}" predecessor`,
          severity: GateSeverity.BLOCKING,
          phase: this.context.phase,
          expected: `${currentType} antes de ${nextType}`,
          actual: `${nextType} presente, ${currentType} ausente`,
          suggestion: `Crie o artefato "${currentType}" antes de "${nextType}"`
        });
      }
    }

    return {
      gateType: GateType.SPECIFICATION,
      gateName: 'Validation Order Gate',
      status: issues.length === 0 ? GateStatus.PASSED : GateStatus.FAILED,
      severity: GateSeverity.BLOCKING,
      phase: this.context.phase,
      issues,
      validatedAt: new Date().toISOString()
    };
  }

  private compileStructuralResult(gates: GateResult[], phase: Phase): ValidationResult {
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
      message: canTransition ? 'Structural validation passed' : `Structural validation failed with ${blockingIssues} blocking issues`
    };
  }

  /**
   * Gera relatório estrutural formatado
   */
  generateStructuralReport(result: ValidationResult): string {
    let report = `# Structural Validation Report\n\n`;
    report += `**Phase:** ${result.phase}\n`;
    report += `**Status:** ${result.valid ? 'VALID' : 'INVALID'}\n`;
    report += `**Can Transition:** ${result.canTransition ? 'YES' : 'NO'}\n`;
    report += `**Validated:** ${new Date(result.validatedAt).toLocaleString()}\n\n`;

    report += `## Summary\n`;
    report += `- Total Gates: ${result.summary.totalGates}\n`;
    report += `- Passed: ${result.summary.passed}\n`;
    report += `- Failed: ${result.summary.failed}\n`;
    report += `- Skipped: ${result.summary.skipped}\n`;
    report += `- Blocking Issues: ${result.summary.blockingIssues}\n`;
    report += `- Warnings: ${result.summary.warnings}\n\n`;

    if (result.gates.length > 0) {
      report += `## Gates\n\n`;
      for (const gate of result.gates) {
        const icon = gate.status === GateStatus.PASSED ? '✅' :
                    gate.status === GateStatus.FAILED ? '❌' : '⚠️';
        report += `${icon} **${gate.gateName}** (${gate.status})\n`;
        report += `   - Type: ${gate.gateType}\n`;
        report += `   - Severity: ${gate.severity}\n`;

        if (gate.issues.length > 0) {
          report += `   - Issues:\n`;
          for (const issue of gate.issues) {
            const issueIcon = issue.type === 'error' ? '🔴' : '🟡';
            report += `     ${issueIcon} ${issue.message}\n`;
            if (issue.suggestion) {
              report += `        → ${issue.suggestion}\n`;
            }
          }
        }
        report += '\n';
      }
    }

    return report;
  }
}

// ========== Convenience Functions =========-

/**
 * Valida a estrutura de um artefato específico
 */
export function checkArtifactStructure(artifact: Artifact): StructuralCheckResult {
  const context: ProjectContext = {
    id: 'temp',
    name: 'temp',
    state: 'IN_PROGRESS',
    phase: 'PLANNING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoveries: [],
    decisions: [],
    artifacts: [artifact],
    currentStep: 1,
    totalSteps: 1
  };

  const checker = new StructuralChecker(context);
  return checker.checkArtifactStructure(artifact);
}

/**
 * Valida a estrutura de todos os artefatos no contexto
 */
export function validatePhaseStructure(context: ProjectContext, strictMode = true): ValidationResult {
  const checker = new StructuralChecker(context, strictMode);
  return checker.validatePhaseStructure();
}

/**
 * Gera relatório estrutural formatado
 */
export function generateStructuralReport(result: ValidationResult): string {
  const context = {
    id: 'temp',
    name: 'temp',
    state: 'IN_PROGRESS' as const,
    phase: result.phase,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoveries: [],
    decisions: [],
    artifacts: [],
    currentStep: 1,
    totalSteps: 1
  };

  const checker = new StructuralChecker(context);
  return checker.generateStructuralReport(result);
}
