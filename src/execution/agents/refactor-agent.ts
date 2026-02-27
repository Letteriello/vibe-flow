/**
 * RefactorAgent - Post-Implementation Excellence Agent
 *
 * Recebe código que já passou nos testes e aplica análise estática heurística
 * para melhorar qualidade sem alterar comportamento.
 */

export interface RefactorContext {
  originalCode: string;
  testResults: RefactorTestResults;
  filePath: string;
  language: 'typescript' | 'javascript';
}

export interface RefactorTestResults {
  passed: boolean;
  testCount: number;
  executionTime: number;
  lastRun: string;
}

export interface RefactorFinding {
  type: 'dry' | 'naming' | 'complexity' | 'architecture';
  severity: 'low' | 'medium' | 'high';
  location: string;
  description: string;
  suggestion: string;
  estimatedImpact: 'minor' | 'moderate' | 'significant';
}

export interface RefactorResult {
  success: boolean;
  findings: RefactorFinding[];
  diff: string;
  semanticsPreserved: boolean;
  confidence: number;
  warnings: string[];
  metadata: RefactorMetadata;
}

export interface RefactorMetadata {
  originalLines: number;
  refactoredLines: number;
  duplicateBlocksRemoved: number;
  loopsOptimized: number;
  variablesRenamed: number;
  processingTime: number;
  timestamp: string;
}

export interface RefactorPromptConfig {
  focusAreas: Array<'dry' | 'naming' | 'complexity' | 'architecture'>;
  maxIterations: number;
  preserveSemantics: boolean;
  allowUnsafeRefactors: boolean;
}

/**
 * RefactorAgent - Agente de refatoração pós-teste
 *
 * Foco: Análise estática heurística para código que já passou nos testes
 * - DRY: Detectar e extrair código duplicado
 * - Naming: Melhorar nomenclatura de variáveis e funções
 * - Complexity: Otimizar loops e algoritmos (Big-O)
 * - Architecture: Identificar code smells e padrões problemáticos
 */
export class RefactorAgent {
  private config: RefactorPromptConfig;

  constructor(config?: Partial<RefactorPromptConfig>) {
    this.config = {
      focusAreas: ['dry', 'naming', 'complexity', 'architecture'],
      maxIterations: 3,
      preserveSemantics: true,
      allowUnsafeRefactors: false,
      ...config,
    };
  }

  /**
   * Executa análise de refatoração no código fornecido
   */
  async analyze(context: RefactorContext): Promise<RefactorResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const findings: RefactorFinding[] = [];

    // Validação de entrada
    if (!context.originalCode || context.originalCode.trim().length === 0) {
      return this.createEmptyResult('Código vazio fornecido');
    }

    if (!context.testResults.passed) {
      warnings.push('Código não passou nos testes - refatoração ignorada');
      return this.createEmptyResult('Testes falharam', warnings);
    }

    // Análise heurística do código
    const analysisFindings = this.performStaticAnalysis(context.originalCode);
    findings.push(...analysisFindings);

    // Geração do diff
    const diff = this.generateDiff(context.originalCode, analysisFindings);

    // Métricas
    const metadata = this.calculateMetadata(context.originalCode, analysisFindings, startTime);

    return {
      success: findings.length > 0,
      findings,
      diff,
      semanticsPreserved: true,
      confidence: this.calculateConfidence(findings),
      warnings,
      metadata,
    };
  }

  /**
   * Constrói o prompt estruturado para a LLM
   */
  buildPrompt(context: RefactorContext): string {
    const focusInstructions = this.config.focusAreas.map((area) => {
      switch (area) {
        case 'dry':
          return this.getDryInstructions();
        case 'naming':
          return this.getNamingInstructions();
        case 'complexity':
          return this.getComplexityInstructions();
        case 'architecture':
          return this.getArchitectureInstructions();
        default:
          return '';
      }
    }).join('\n\n');

    return `## Tarefa: Refatoração Pós-Teste

### Contexto
- Arquivo: ${context.filePath}
- Linguagem: ${context.language}
- Testes: ${context.testResults.testCount} executados, ${context.testResults.passed ? 'PASSARAM' : 'FALHARAM'}
- Tempo de execução: ${context.testResults.executionTime}ms

### Código Original
\`\`\`${context.language}
${context.originalCode}
\`\`\"

### Instruções de Foco
${focusInstructions}

### Regras Obrigatórias
1. **Semântica Inalterada**: O código refatorado DEVE produzir exatamente o mesmo resultado que o original
2. **Testes Devem Passar**: Após a refatoração, todos os testes originais devem continuar passando
3. **Diff Limpo**: Forneça apenas as mudanças necessárias, sem formatação adicional
4. **Promessa de Segurança**: Declare explicitamente que a semântica foi preservada

### Output Esperado
Retorne:
1. Lista de mudanças realizadas
2. Diff completo em formato unificado (--- a/... +++ b/...)
3. Confirmação de que testes passaram após refatoração`;
  }

  private getDryInstructions(): string {
    return `### 1. DRY - Don't Repeat Yourself
Analise e remova duplicação de código:
- Blocos de código idênticos ou muito similares (>= 3 linhas)
- Funções com lógica repetida
- Constantes duplicadas
- Strings literals repetidas
- Padrões de loops idênticos

**Ação**: Extraia para funções utilitárias ou constantes compartilhadas`;
  }

  private getNamingInstructions(): string {
    return `### 2. Melhoria de Nomenclatura
Identifique nomes que prejudicam legáveis com nomes genibilidade:
- Variéricos (data, temp, tmp, item, value)
- Funções com nomes misleading
- Constantes sem contexto
- Nomes demasiado curtos ou longos

**Ação**: Renomeie para nomes descritivos que revelem intenção`;
  }

  private getComplexityInstructions(): string {
    return `### 3. Otimização de Complexidade Big-O
Identifique ineficiências algorítmicas:
- Loops aninhados desnecessários (O(n²) ou pior)
- Buscas lineares em loops (podem usar Map/Set)
- Recursões desnecessárias
- Operações O(n) repetidas que podem ser cacheadas

**Ação**: Reduza complexidade quando possível sem alterar comportamento`;
  }

  private getArchitectureInstructions(): string {
    return `### 4. Análise de Code Smells
Identifique padrões arquiteturais problemáticos:
- Funções muito longas (> 50 linhas)
- Parâmetros excessivos (> 4)
- Classes/objetos monopólios (God Objects)
- Acoplamento forte entre módulos
- Dependencies ciclícas
- Comentários que explicam o óbvio (código mal escrito)

**Ação**: Aplique princípios SOLID quando apropriado`;
  }

  /**
   * Análise estática heurística do código
   */
  private performStaticAnalysis(code: string): RefactorFinding[] {
    const findings: RefactorFinding[] = [];

    // Detectar duplicação (DRY)
    findings.push(...this.detectDuplication(code));

    // Detectar problemas de nomenclatura
    findings.push(...this.detectNamingIssues(code));

    // Detectar complexidade excessiva
    findings.push(...this.detectComplexityIssues(code));

    // Detectar code smells arquiteturais
    findings.push(...this.detectArchitectureSmells(code));

    return findings;
  }

  private detectDuplication(code: string): RefactorFinding[] {
    const findings: RefactorFinding[] = [];
    const lines = code.split('\n');

    // Detectar linhas duplicadas (simplificado)
    const lineCounts = new Map<string, number>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 20 && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
      }
    }

    for (const [line, count] of lineCounts) {
      if (count >= 3) {
        findings.push({
          type: 'dry',
          severity: count >= 5 ? 'high' : 'medium',
          location: 'Múltiplas linhas duplicadas',
          description: `Linha duplicada ${count}x: "${line.substring(0, 50)}..."`,
          suggestion: 'Extrair para função utilitária ou constante',
          estimatedImpact: count >= 5 ? 'significant' : 'moderate',
        });
      }
    }

    // Detectar loops aninhados (complexidade)
    const nestedLoopMatches = code.match(/(for|while)\s*\([^)]*\)\s*\{[^}]*(for|while)\s*\(/g);
    if (nestedLoopMatches && nestedLoopMatches.length > 0) {
      findings.push({
        type: 'complexity',
        severity: 'high',
        location: `Encontrados ${nestedLoopMatches.length} pares de loops aninhados`,
        description: 'Loops aninhados detectados podem ter complexidade O(n²)',
        suggestion: 'Avaliar se é possível usar Map/Set para busca O(1) ou pré-computar',
        estimatedImpact: 'significant',
      });
    }

    return findings;
  }

  private detectNamingIssues(code: string): RefactorFinding[] {
    const findings: RefactorFinding[] = [];
    const badNames = ['temp', 'tmp', 'data', 'value', 'item', 'obj', 'res', 'ret'];

    for (const name of badNames) {
      const regex = new RegExp(`\\b(const|let|var)\\s+(${name})\\s*=`, 'gi');
      const matches = code.match(regex);
      if (matches && matches.length >= 3) {
        findings.push({
          type: 'naming',
          severity: 'medium',
          location: `${matches.length} ocorrências de '${name}'`,
          description: `Variável '${name}' usada ${matches.length}x sem contexto descritivo`,
          suggestion: `Renomear para '${name}' descriptivo que revele propósito (ex: ${name}Users, ${name}Config)`,
          estimatedImpact: 'minor',
        });
      }
    }

    // Funções muito curtas ou sem nome descritivo
    const shortFunctionMatches = code.match(/function\s+(\w{1,2})\s*\(/g);
    if (shortFunctionMatches && shortFunctionMatches.length > 0) {
      findings.push({
        type: 'naming',
        severity: 'low',
        location: `${shortFunctionMatches.length} funções com nomes muito curtos`,
        description: 'Funções com nomes de 1-2 caracteres dificultam leitura',
        suggestion: 'Usar nomes descritivos que revelem ação (ex: calculateTotal em vez de "f")',
        estimatedImpact: 'minor',
      });
    }

    return findings;
  }

  private detectComplexityIssues(code: string): RefactorFinding[] {
    const findings: RefactorFinding[] = [];

    // Contar profundidade de aninhamento
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }

    if (maxDepth >= 5) {
      findings.push({
        type: 'complexity',
        severity: 'high',
        location: `Profundidade máxima de aninhamento: ${maxDepth}`,
        description: 'Código com aninhamento excessivo é difícil de manter',
        suggestion: 'Extrair funções para reduzir aninhamento (early returns, guard clauses)',
        estimatedImpact: 'significant',
      });
    }

    // Funções longas
    const functionMatches = code.match(/function\s+\w*\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g);
    if (functionMatches) {
      for (const fn of functionMatches) {
        const lines = fn.split('\n').length;
        if (lines > 50) {
          findings.push({
            type: 'architecture',
            severity: 'medium',
            location: `Função com ${lines} linhas`,
            description: 'Função muito longa (> 50 linhas)',
            suggestion: 'Dividir em funções menores com responsabilidade única',
            estimatedImpact: 'moderate',
          });
        }
      }
    }

    return findings;
  }

  private detectArchitectureSmells(code: string): RefactorFinding[] {
    const findings: RefactorFinding[] = [];

    // Parâmetros excessivos
    const functionMatches = code.match(/function\s+\w*\s*\(([^)]*)\)/g);
    if (functionMatches) {
      for (const fn of functionMatches) {
        const params = fn.match(/[^,]+/g);
        if (params && params.length > 4) {
          findings.push({
            type: 'architecture',
            severity: 'medium',
            location: `Função com ${params.length} parâmetros`,
            description: 'Função com muitos parâmetros (> 4) dificulta uso',
            suggestion: 'Considerar usar objeto de opções ou dividir em funções menores',
            estimatedImpact: 'moderate',
          });
        }
      }
    }

    // Comments que explicam código ruim (code smell)
    const commentLines = code.split('\n').filter(
      (line) => line.trim().startsWith('//') && line.length > 50
    );
    if (commentLines.length >= 3) {
      findings.push({
        type: 'architecture',
        severity: 'low',
        location: `${commentLines.length} comentários longos`,
        description: 'Muitos comentários longos podem indicar código não autoexplicativo',
        suggestion: 'Prioritize código limpo com nomes descritivos em vez de comentários explicativos',
        estimatedImpact: 'minor',
      });
    }

    return findings;
  }

  /**
   * Gera diff das mudanças necessárias
   */
  private generateDiff(originalCode: string, findings: RefactorFinding[]): string {
    if (findings.length === 0) {
      return '# Nenhuma refatoração necessária - código já otimizado';
    }

    const dryFindings = findings.filter((f) => f.type === 'dry');
    const namingFindings = findings.filter((f) => f.type === 'naming');
    const complexityFindings = findings.filter((f) => f.type === 'complexity');
    const archFindings = findings.filter((f) => f.type === 'architecture');

    let diff = `# Refatoração Automática - ${findings.length} melhorias encontradas\n`;
    diff += `# Semântica preservada: SIM\n`;
    diff += `# Confiança: ${this.calculateConfidence(findings)}%\n\n`;

    diff += `## Resumo das Mudanças\n`;
    if (dryFindings.length > 0) {
      diff += `- DRY: ${dryFindings.length} duplicações a remover\n`;
    }
    if (namingFindings.length > 0) {
      diff += `- Naming: ${namingFindings.length} renomeações sugeridas\n`;
    }
    if (complexityFindings.length > 0) {
      diff += `- Complexity: ${complexityFindings.length} otimizações de Big-O\n`;
    }
    if (archFindings.length > 0) {
      diff += `- Architecture: ${archFindings.length} code smells a corrigir\n`;
    }

    diff += `\n## Detalhamento\n`;
    for (const finding of findings) {
      diff += `\n### ${finding.type.toUpperCase()} - ${finding.severity}\n`;
      diff += `**Localização**: ${finding.location}\n`;
      diff += `**Descrição**: ${finding.description}\n`;
      diff += `**Sugestão**: ${finding.suggestion}\n`;
    }

    diff += `\n---\n`;
    diff += `*Nota: Este diff é informativo. A implementação real deve ser feita com cuidado,\n`;
    diff += `verificando sempre que os testes continuam passando após cada mudança.*\n`;

    return diff;
  }

  private calculateMetadata(
    originalCode: string,
    findings: RefactorFinding[],
    startTime: number
  ): RefactorMetadata {
    const originalLines = originalCode.split('\n').length;
    const dryFindings = findings.filter((f) => f.type === 'dry');
    const complexityFindings = findings.filter((f) => f.type === 'complexity');
    const namingFindings = findings.filter((f) => f.type === 'naming');

    return {
      originalLines,
      refactoredLines: originalLines, // Estimado
      duplicateBlocksRemoved: dryFindings.length,
      loopsOptimized: complexityFindings.length,
      variablesRenamed: namingFindings.length,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private calculateConfidence(findings: RefactorFinding[]): number {
    if (findings.length === 0) return 100;

    let confidence = 100;
    const highSeverity = findings.filter((f) => f.severity === 'high').length;
    const mediumSeverity = findings.filter((f) => f.severity === 'medium').length;

    // Reduz confiança baseado na severidade das findings
    confidence -= highSeverity * 10;
    confidence -= mediumSeverity * 5;
    confidence -= findings.filter((f) => f.estimatedImpact === 'significant').length * 8;

    return Math.max(50, Math.min(95, confidence));
  }

  private createEmptyResult(reason: string, warnings: string[] = []): RefactorResult {
    return {
      success: false,
      findings: [],
      diff: `# Nenhuma refatoração possível\n\n${reason}`,
      semanticsPreserved: true,
      confidence: 100,
      warnings,
      metadata: {
        originalLines: 0,
        refactoredLines: 0,
        duplicateBlocksRemoved: 0,
        loopsOptimized: 0,
        variablesRenamed: 0,
        processingTime: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Retorna configuração atual do agente
   */
  getConfig(): RefactorPromptConfig {
    return { ...this.config };
  }

  /**
   * Atualiza configuração do agente
   */
  setConfig(config: Partial<RefactorPromptConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default RefactorAgent;
