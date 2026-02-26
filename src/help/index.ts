// Help Module - BMAD workflow guidance integration
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { Phase } from '../state-machine/index.js';

export interface WorkflowEntry {
  module: string;
  phase: string;
  name: string;
  code: string;
  sequence: number;
  workflowFile: string;
  command: string;
  required: boolean;
  agent: string;
  options: string;
  description: string;
  outputLocation: string;
  outputs: string;
}

export interface HelpResult {
  currentPhase: string;
  nextWorkflows: WorkflowEntry[];
  universalWorkflows: WorkflowEntry[];
  suggestions: string[];
}

export interface EducationalContext {
  phase: string;
  title: string;
  why: string;
  mainGoal: string;
  keyActivities: string[];
  outcome: string;
}

export class HelpExecutor {
  private bmadHelpPath: string;
  private workflows: WorkflowEntry[] = [];

  constructor(projectRoot?: string) {
    // Try to find BMAD-help.csv in multiple locations
    const searchPaths = projectRoot
      ? [join(projectRoot, '_bmad', '_config', 'bmad-help.csv')]
      : [
          join(process.cwd(), '_bmad', '_config', 'bmad-help.csv'),
          join(process.cwd(), '..', '_bmad', '_config', 'bmad-help.csv'),
          join(dirname(process.cwd()), '_bmad', '_config', 'bmad-help.csv'),
          join(homedir(), 'Claude Code', '_bmad', '_config', 'bmad-help.csv')
        ];

    // Use first valid path
    this.bmadHelpPath = searchPaths[0];
  }

  /**
   * Load and parse the BMAD help CSV
   */
  async loadWorkflows(): Promise<void> {
    // Try multiple paths to find BMAD-help.csv
    // Use parent directory lookup for vibe-flow running as submodule
    const searchPaths = [
      join(process.cwd(), '_bmad', '_config', 'bmad-help.csv'),
      join(process.cwd(), '..', '_bmad', '_config', 'bmad-help.csv'),
      join(process.cwd(), '..', '..', '_bmad', '_config', 'bmad-help.csv'),
    ];

    for (const bmadPath of searchPaths) {
      try {
        // Check if path exists first
        await fs.access(bmadPath);
        const content = await fs.readFile(bmadPath, 'utf-8');
        this.bmadHelpPath = bmadPath;

        const lines = content.trim().split('\n');
        this.workflows = [];

        for (let i = 1; i < lines.length; i++) {
          const values = this.parseCSVLine(lines[i]);
          if (values.length >= 13) {
            this.workflows.push({
              module: values[0] || '',
              phase: values[1] || '',
              name: values[2] || '',
              code: values[3] || '',
              sequence: parseInt(values[4]) || 0,
              workflowFile: values[5] || '',
              command: values[6] || '',
              required: values[7]?.toLowerCase() === 'true',
              agent: values[8] || '',
              options: values[9] || '',
              description: values[10] || '',
              outputLocation: values[11] || '',
              outputs: values[12] || ''
            });
          }
        }
        return; // Successfully loaded
      } catch {
        // Try next path
      }
    }

    // BMAD not found - return empty workflows
    this.workflows = [];
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }

  /**
   * Map vibe-flow phases to BMAD phases
   */
  private mapPhaseToBMAD(phase: string): string {
    const phaseMap: Record<string, string> = {
      'NEW': 'anytime',
      'ANALYSIS': '1-analysis',
      'PLANNING': '2-planning',
      'SOLUTIONING': '3-solutioning',
      'IMPLEMENTATION': '4-implementation',
      'WRAP_UP': '5-wrap-up',
      'COMPLETE': 'anytime'
    };
    return phaseMap[phase] || 'anytime';
  }

  /**
   * Get help recommendations based on current project phase
   */
  async getHelp(phase: string, currentStep: number): Promise<HelpResult> {
    await this.loadWorkflows();

    const bmadPhase = this.mapPhaseToBMAD(phase);

    // Get workflows for current phase
    const phaseWorkflows = this.workflows.filter(w => {
      // Match phase or 'anytime' workflows
      if (w.phase === bmadPhase) return true;
      // Include 'anytime' workflows
      if (w.phase === 'anytime') return true;
      return false;
    });

    // Separate universal and phase-specific workflows
    const universalWorkflows = phaseWorkflows.filter(w => w.phase === 'anytime');
    const phaseSpecificWorkflows = phaseWorkflows.filter(w => w.phase !== 'anytime');

    // Sort by sequence and separate required from optional
    const sortedPhaseWorkflows = phaseSpecificWorkflows.sort((a, b) => {
      const seqA = a.sequence || 0;
      const seqB = b.sequence || 0;
      return seqA - seqB;
    });

    // Find next workflow based on current step
    const nextWorkflows = this.determineNextWorkflows(sortedPhaseWorkflows, currentStep, phase);

    // Generate suggestions
    const suggestions = this.generateSuggestions(phase, currentStep, nextWorkflows);

    return {
      currentPhase: phase,
      nextWorkflows,
      universalWorkflows,
      suggestions
    };
  }

  /**
   * Determine which workflows to recommend next
   */
  private determineNextWorkflows(
    workflows: WorkflowEntry[],
    currentStep: number,
    phase: string
  ): WorkflowEntry[] {
    if (phase === 'COMPLETE') {
      return [];
    }

    // For each phase, show remaining workflows in sequence order
    const remaining = workflows.filter(w => w.sequence >= currentStep);

    // Prioritize required workflows first
    const required = remaining.filter(w => w.required);
    const optional = remaining.filter(w => !w.required);

    return [...required, ...optional].slice(0, 5);
  }

  /**
   * Generate contextual suggestions
   */
  private generateSuggestions(
    phase: string,
    currentStep: number,
    nextWorkflows: WorkflowEntry[]
  ): string[] {
    const suggestions: string[] = [];

    if (phase === 'NEW') {
      suggestions.push('Start a new project with: vibe-flow start <project-name>');
      suggestions.push('Use /bmad-help anytime for general guidance');
    } else if (phase === 'COMPLETE') {
      suggestions.push('Project completed! Start a new project or use wrap-up to close the session.');
    } else {
      // Add suggestions based on next workflows
      if (nextWorkflows.length > 0) {
        const next = nextWorkflows[0];
        if (next.command) {
          suggestions.push(`Next: Run ${next.command} for "${next.name}"`);
        } else if (next.agent) {
          suggestions.push(`Next: Use /${next.agent.toLowerCase()} for "${next.name}"`);
        }
      }

      suggestions.push('Use "vibe-flow advance" to move to next step');
      suggestions.push('Use "vibe-flow status" to see current state');
    }

    // Always add universal suggestions
    suggestions.push('Use "vibe-flow wrap-up --dry-run" to preview session closure');
    suggestions.push('Use /bmad-help for detailed BMAD methodology guidance');

    return suggestions;
  }

  /**
   * Display help in a formatted way
   */
  async displayHelp(phase: string, currentStep: number): Promise<void> {
    const help = await this.getHelp(phase, currentStep);

    console.log(chalk.bold('\n📋 Workflow Guidance\n'));

    // Current phase
    console.log(chalk.gray(`  Current Phase: ${chalk.white(help.currentPhase)} (Step ${currentStep})`));

    // Next workflows from BMAD
    if (help.nextWorkflows.length > 0) {
      console.log(chalk.bold('\n  Next Steps:'));
      for (const workflow of help.nextWorkflows) {
        const marker = workflow.required ? '🔴' : '⚪';
        const cmd = workflow.command ? `/${workflow.command}` : `[Agent: ${workflow.agent}]`;
        console.log(`    ${marker} ${chalk.cyan(workflow.name)}`);
        console.log(chalk.gray(`       ${cmd}`));
        if (workflow.description) {
          console.log(chalk.gray(`       ${workflow.description.slice(0, 60)}...`));
        }
      }
    }

    // Universal workflows from BMAD
    if (help.universalWorkflows.length > 0) {
      console.log(chalk.bold('\n  Always Available:'));
      for (const workflow of help.universalWorkflows.slice(0, 3)) {
        const cmd = workflow.command ? `/${workflow.command}` : `[Agent: ${workflow.agent}]`;
        console.log(`    🌐 ${chalk.cyan(workflow.name)} ${chalk.gray(cmd)}`);
      }
    }

    // Suggestions
    console.log(chalk.bold('\n  Quick Actions:'));
    for (const suggestion of help.suggestions.slice(0, 4)) {
      console.log(chalk.gray(`    → ${suggestion}`));
    }

    // Debug info if BMAD not found
    if (help.nextWorkflows.length === 0 && help.universalWorkflows.length === 0) {
      console.log(chalk.yellow('\n  ⚠️ BMAD not found - using fallback guidance'));
      console.log(chalk.gray('     Run from project root with _bmad/ directory'));
    }

    console.log();
  }

  /**
   * Get educational context explaining the "why" behind each phase
   */
  getEducationalContext(phase: string): EducationalContext | null {
    const contexts: Record<string, EducationalContext> = {
      'NEW': {
        phase: 'NEW',
        title: 'Início do Projeto',
        why: 'Todo projeto precisa de um ponto de partida estruturado. Sem entender onde você está, é impossível planejar para onde vai.',
        mainGoal: 'Definir o escopo e objetivos iniciais do projeto',
        keyActivities: [
          'Nomear o projeto',
          'Estabelecer objetivos principais',
          'Identificar stakeholders'
        ],
        outcome: 'Um projeto inicializado com direção clara'
      },
    'ANALYSIS': {
      phase: 'ANALYSIS',
      title: 'Análise - Entender o Problema',
      why: 'A maioria dos projetos falha não por execução ruim, mas por resolver o problema errado. Análise é onde garantimos que entendemos o "quê" antes de definir o "como".',
      mainGoal: 'Compreender profundamente o problema a ser resolvido',
      keyActivities: [
        'Pesquisar o domínio/problema',
        'Identificar requisitos reais',
        'Entender restrições e limitações',
        'Mapear stakeholders e necessidades'
      ],
      outcome: 'Documento de análise (briefing) com compreensão clara do problema'
    },
    'PLANNING': {
      phase: 'PLANNING',
      title: 'Planejamento - Definir a Solução',
      why: 'Um problema bem compreendido merece uma solução bem definida. Planejamento transforma análise em direção.',
      mainGoal: 'Definir a solução que resolve o problema identificado',
      keyActivities: [
        'Especificar funcionalidades',
        'Definir critérios de sucesso',
        'Planejar estrutura da solução',
        'Estimar escopo e recursos'
      ],
      outcome: 'Especificação clara (PRD) da solução a ser construída'
    },
    'SOLUTIONING': {
      phase: 'SOLUTIONING',
      title: 'Solução - Arquitetar a Implementação',
      why: 'Antes de construir, é preciso saber como construir. Uma boa arquitetura evita refações costly e problemas estruturais.',
      mainGoal: 'Projetar a estrutura técnica da solução',
      keyActivities: [
        'Definir arquitetura técnica',
        'Criar design de componentes',
        'Planejar integrações',
        'Especificar detalhes de implementação'
      ],
      outcome: 'Documento de arquitetura e design pronto para implementação'
    },
    'IMPLEMENTATION': {
      phase: 'IMPLEMENTATION',
      title: 'Implementação - Construir a Solução',
      why: 'Código é onde o valor acontece. Todo o trabalho anterior só se torna útil quando a solução é construída.',
      mainGoal: 'Transformar design em código funcional',
      keyActivities: [
        'Desenvolver funcionalidades',
        'Testar unidades e integração',
        'Corrigir defeitos',
        'Validar contra especificações'
      ],
      outcome: 'Código funcional que atende aos requisitos'
    },
    'WRAP_UP': {
      phase: 'WRAP_UP',
      title: 'Consolidação e Encerramento',
      why: 'A fase de wrap-up é obrigatória para garantir que o projeto atinja o status de finalizado.',
      mainGoal: 'Consolidar aprendizados e preparar para conclusão',
      keyActivities: [
        'Revisar decisões tomadas',
        'Documentar lições aprendidas',
        'Consolidar contexto para futuras sessões',
        'Atualizar estado do projeto'
      ],
      outcome: 'Projeto pronto para ser marcado como completo'
    },
    'COMPLETE': {
      phase: 'COMPLETE',
      title: 'Projeto Concluído',
      why: 'Um projeto só está verdadeiramente completo quando entrega valor e está pronto para manutenção.',
      mainGoal: 'Finalizar e entregar o projeto',
      keyActivities: [
        'Validar entregáveis finais',
        'Documentar decisões',
        'Preparar para operação',
        'Realizar retrospectiva'
      ],
      outcome: 'Projeto entregue com documentação e insights para futuras iterações'
    }
    };

    return contexts[phase] || null;
  }

  /**
   * Display educational context for the current phase
   */
  displayEducationalContext(phase: string): void {
    const context = this.getEducationalContext(phase);
    if (!context) return;

    console.log(chalk.bold.cyan(`\n📚 Contexto: ${context.title}\n`));
    console.log(chalk.white('  Por que esta fase existe?'));
    console.log(chalk.gray(`  ${context.why}\n`));

    console.log(chalk.white('  Objetivo principal:'));
    console.log(chalk.gray(`  ${context.mainGoal}\n`));

    console.log(chalk.white('  Atividades-chave:'));
    for (const activity of context.keyActivities) {
      console.log(chalk.gray(`    • ${activity}`));
    }

    console.log(chalk.white('\n  Resultado esperado:'));
    console.log(chalk.gray(`  ${context.outcome}\n`));
  }
}

export default HelpExecutor;
