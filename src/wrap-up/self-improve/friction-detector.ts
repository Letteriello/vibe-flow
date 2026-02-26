/**
 * FrictionDetector - Analisa logs de sessão para identificar vulnerabilidades do agente
 *
 * Identifica:
 * - Skill gap: operações que falharam mais de 2x consecutivas com retry
 * - Friction: comandos executados manualmente pelo usuário
 * - Knowledge: erros de compilação por falta de importação/tipagem
 */

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'tool_call' | 'tool_result' | 'user_input' | 'system' | 'error';
  tool?: string;
  action?: string;
  status?: 'success' | 'failure' | 'retry';
  error?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillGapFinding {
  operation: string;
  failureCount: number;
  firstAttempt: number;
  lastAttempt: number;
  errors: string[];
}

export interface FrictionFinding {
  command: string;
  reason: string;
  timestamp: number;
  userInitiated: boolean;
}

export interface KnowledgeFinding {
  errorType: 'missing_import' | 'missing_type' | 'type_mismatch' | 'syntax_error';
  file?: string;
  line?: number;
  message: string;
  missingItem?: string;
}

export interface FrictionImprovementFindings {
  skillGaps: SkillGapFinding[];
  frictions: FrictionFinding[];
  knowledgeGaps: KnowledgeFinding[];
  totalAnomalies: number;
  analyzedAt: number;
}

export class FrictionDetector {
  /**
   * Analisa logs de sessão e identifica vulnerabilidades do agente
   * @param logs - Array de entradas de log da sessão
   * @returns Objeto categorizado com as anomalias encontradas
   */
  analyzeSessionLogs(logs: LogEntry[]): FrictionImprovementFindings {
    const sortedLogs = this.sortLogsByTimestamp(logs);

    const skillGaps = this.detectSkillGaps(sortedLogs);
    const frictions = this.detectFrictions(sortedLogs);
    const knowledgeGaps = this.detectKnowledgeGaps(sortedLogs);

    return {
      skillGaps,
      frictions,
      knowledgeGaps,
      totalAnomalies: skillGaps.length + frictions.length + knowledgeGaps.length,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Ordena logs por timestamp
   */
  private sortLogsByTimestamp(logs: LogEntry[]): LogEntry[] {
    return [...logs].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Detecta skill gaps - operações que falharam mais de 2x consecutivas
   */
  private detectSkillGaps(logs: LogEntry[]): SkillGapFinding[] {
    const skillGaps: SkillGapFinding[] = [];
    const operationMap = new Map<string, SkillGapFinding>();

    for (const log of logs) {
      if (log.type === 'error' || (log.status === 'failure' && log.tool)) {
        const operation = log.tool || log.action || 'unknown';

        if (!operationMap.has(operation)) {
          operationMap.set(operation, {
            operation,
            failureCount: 0,
            firstAttempt: log.timestamp,
            lastAttempt: log.timestamp,
            errors: [],
          });
        }

        const finding = operationMap.get(operation)!;
        finding.failureCount++;
        finding.lastAttempt = log.timestamp;
        if (log.error) {
          finding.errors.push(log.error);
        }
      }

      // Se a operação teve sucesso depois de falhas, resetamos a contagem
      if (log.status === 'success' && log.tool) {
        const operation = log.tool;
        if (operationMap.has(operation)) {
          const finding = operationMap.get(operation)!;
          // Verifica se houve retry antes do sucesso
          const recentFailures = logs.filter(
            (l) =>
              l.tool === operation &&
              l.status === 'failure' &&
              l.timestamp > finding.firstAttempt &&
              l.timestamp <= log.timestamp
          );
          if (recentFailures.length <= 2) {
            // Remove se teve menos de 3 falhas antes do sucesso
            operationMap.delete(operation);
          }
        }
      }
    }

    // Filtra apenas operações com mais de 2 falhas consecutivas
    for (const [, finding] of Array.from(operationMap.entries())) {
      if (finding.failureCount > 2) {
        skillGaps.push(finding);
      }
    }

    return skillGaps;
  }

  /**
   * Detecta friction - comandos executados manualmente pelo usuário
   */
  private detectFrictions(logs: LogEntry[]): FrictionFinding[] {
    const frictions: FrictionFinding[] = [];
    const userCommands = new Map<string, FrictionFinding>();

    for (const log of logs) {
      // Detecta input do usuário que deveria ser automático
      if (log.type === 'user_input' && log.content) {
        const command = log.content.trim();

        // Padrões de comandos manuais que o agente deveria fazer
        const manualPatterns = [
          { pattern: /^npm\s+install/, reason: 'Agent should manage dependencies' },
          { pattern: /^npm\s+run\s+build/, reason: 'Agent should run build' },
          { pattern: /^npm\s+test/, reason: 'Agent should run tests' },
          { pattern: /^npx\s+tsc/, reason: 'Agent should run type checking' },
          { pattern: /^git\s+commit/, reason: 'Agent should handle git commits' },
          { pattern: /^git\s+push/, reason: 'Agent should handle git push' },
          { pattern: /^git\s+add/, reason: 'Agent should stage files' },
          { pattern: /^mkdir\s+/, reason: 'Agent should create directories' },
          { pattern: /^touch\s+/, reason: 'Agent should create files' },
          { pattern: /^rm\s+-rf/, reason: 'Agent should handle cleanup' },
        ];

        for (const { pattern, reason } of manualPatterns) {
          if (pattern.test(command)) {
            if (!userCommands.has(command)) {
              userCommands.set(command, {
                command,
                reason,
                timestamp: log.timestamp,
                userInitiated: true,
              });
            }
            break;
          }
        }
      }

      // Deteta quando usuário executa bash que agente falhou
      if (log.type === 'tool_result' && log.status === 'failure' && log.error) {
        const subsequentLogs = logs.filter(
          (l) => l.timestamp > log.timestamp && l.timestamp < log.timestamp + 60000
        );

        for (const subsequent of subsequentLogs) {
          if (subsequent.type === 'user_input' && subsequent.content) {
            const content = subsequent.content.trim();
            // Usuário tentando executar manualmente o que o agente falhou
            if (
              log.tool &&
              (content.includes(log.tool) || content.includes('manual') || content.includes('fix'))
            ) {
              frictions.push({
                command: content,
                reason: `User manually executing: ${log.tool} after agent failure`,
                timestamp: subsequent.timestamp,
                userInitiated: true,
              });
            }
          }
        }
      }
    }

    // Adiciona comandos manuais detectados
    for (const [, finding] of Array.from(userCommands.entries())) {
      frictions.push(finding);
    }

    return frictions;
  }

  /**
   * Detecta knowledge gaps - erros de compilação por falta de importação/tipagem
   */
  private detectKnowledgeGaps(logs: LogEntry[]): KnowledgeFinding[] {
    const knowledgeGaps: KnowledgeFinding[] = [];

    for (const log of logs) {
      if (log.type === 'error' && log.error) {
        const error = log.error.toLowerCase();

        // Erros de importação faltando
        if (
          error.includes("cannot find module") ||
          error.includes("module not found") ||
          error.includes("cannot find name") ||
          error.includes("is not defined")
        ) {
          knowledgeGaps.push({
            errorType: 'missing_import',
            message: log.error,
            missingItem: this.extractMissingItem(log.error),
            file: typeof log.metadata?.file === 'string' ? log.metadata.file : undefined,
            line: typeof log.metadata?.line === 'number' ? log.metadata.line : undefined,
          });
        }

        // Erros de tipagem
        if (
          error.includes("type") &&
          (error.includes("expected") || error.includes("assignment"))
        ) {
          knowledgeGaps.push({
            errorType: 'type_mismatch',
            message: log.error,
            file: typeof log.metadata?.file === 'string' ? log.metadata.file : undefined,
            line: typeof log.metadata?.line === 'number' ? log.metadata.line : undefined,
          });
        }

        // Erros de tipo faltando (TypeScript)
        if (
          error.includes("type '") &&
          (error.includes("does not exist") || error.includes("not defined"))
        ) {
          knowledgeGaps.push({
            errorType: 'missing_type',
            message: log.error,
            missingItem: this.extractMissingItem(log.error),
            file: typeof log.metadata?.file === 'string' ? log.metadata.file : undefined,
            line: typeof log.metadata?.line === 'number' ? log.metadata.line : undefined,
          });
        }

        // Erros de sintaxe
        if (
          error.includes("syntax error") ||
          error.includes("unexpected token") ||
          error.includes("unexpected character")
        ) {
          knowledgeGaps.push({
            errorType: 'syntax_error',
            message: log.error,
            file: typeof log.metadata?.file === 'string' ? log.metadata.file : undefined,
            line: typeof log.metadata?.line === 'number' ? log.metadata.line : undefined,
          });
        }
      }
    }

    return knowledgeGaps;
  }

  /**
   * Extrai o item faltante de uma mensagem de erro
   */
  private extractMissingItem(errorMessage: string): string | undefined {
    // Tenta extrair o nome do módulo ou tipo faltante
    const moduleMatch = errorMessage.match(/cannot find module ['"]([^'"]+)['"]/i);
    if (moduleMatch) {
      return moduleMatch[1];
    }

    const nameMatch = errorMessage.match(/cannot find name ['"]([^'"]+)['"]/i);
    if (nameMatch) {
      return nameMatch[1];
    }

    const typeMatch = errorMessage.match(/type ['"]([^'"]+)['"]/i);
    if (typeMatch) {
      return typeMatch[1];
    }

    return undefined;
  }
}

export function analyzeSessionLogs(logs: LogEntry[]): FrictionImprovementFindings {
  const detector = new FrictionDetector();
  return detector.analyzeSessionLogs(logs);
}
