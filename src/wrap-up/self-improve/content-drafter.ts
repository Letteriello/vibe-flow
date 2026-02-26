// Content Drafter - Converts session work into publishable material
import { DraftReport, ResolvedBug } from './types';

export { DraftReport, ResolvedBug };

export class PostSessionDrafter {
  private static readonly COMPLEXITY_THRESHOLD = 3;
  private static readonly FEATURE_KEYWORDS = [
    'implemented', 'created', 'added', 'built', 'developed',
    'feature', 'module', 'system', 'engine', 'framework',
    'integration', 'api', 'service', 'component'
  ];
  private static readonly BUG_KEYWORDS = [
    'fixed', 'resolved', 'bug', 'error', 'issue', 'problem',
    'fix', 'patch', 'corrected', 'repaired', 'debugged'
  ];
  private static readonly COMPLEXITY_INDICATORS = [
    'complex', 'advanced', 'sophisticated', 'intricate', 'elaborate',
    'multiple', 'several', 'various', 'numerous', 'many'
  ];

  /**
   * Extracts publishable material from session summary and resolved bugs
   * @param sessionSummary - Summary of the session work
   * @param resolvedBugs - Array of resolved bug objects
   * @returns DraftReport with title and markdownDraft if relevant content found, null otherwise
   */
  static extractPublishableMaterial(
    sessionSummary: string,
    resolvedBugs: ResolvedBug[]
  ): DraftReport | null {
    const hasComplexWork = this.hasComplexResolution(sessionSummary, resolvedBugs);
    const hasFeatureWork = this.hasCompleteFeature(sessionSummary);

    if (!hasComplexWork && !hasFeatureWork) {
      return null;
    }

    const isBugFix = resolvedBugs.length > 0 && hasComplexWork;
    const draft = isBugFix
      ? this.generateBugFixDraft(sessionSummary, resolvedBugs)
      : this.generateFeatureDraft(sessionSummary);

    return {
      title: draft.title,
      markdownDraft: draft.markdown
    };
  }

  private static hasComplexResolution(
    sessionSummary: string,
    resolvedBugs: ResolvedBug[]
  ): boolean {
    const normalizedSummary = sessionSummary.toLowerCase();
    const bugCount = resolvedBugs.length;

    // Multiple bug fixes indicate complexity
    if (bugCount >= this.COMPLEXITY_THRESHOLD) {
      return true;
    }

    // Check for complexity indicators in summary
    const complexityMatches = this.COMPLEXITY_INDICATORS.filter(
      indicator => normalizedSummary.includes(indicator)
    ).length;

    if (complexityMatches >= 2) {
      return true;
    }

    // Check each bug for complexity
    for (const bug of resolvedBugs) {
      const bugDescription = (bug.description || '').toLowerCase();
      const complexityInBug = this.COMPLEXITY_INDICATORS.filter(
        indicator => bugDescription.includes(indicator)
      ).length;

      if (complexityInBug >= 1 || bugCount >= 2) {
        return true;
      }
    }

    // Check for multi-step solutions
    const hasMultiStepIndicators = this.detectMultiStepSolution(sessionSummary);
    if (hasMultiStepIndicators) {
      return true;
    }

    return false;
  }

  private static hasCompleteFeature(sessionSummary: string): boolean {
    const normalizedSummary = sessionSummary.toLowerCase();

    // Check for feature keywords
    const featureMatches = this.FEATURE_KEYWORDS.filter(
      keyword => normalizedSummary.includes(keyword)
    );

    // Need at least 2 feature-related keywords for a complete feature
    if (featureMatches.length >= 2) {
      return true;
    }

    // Check for "created" + another feature indicator
    if (normalizedSummary.includes('created') &&
        (normalizedSummary.includes('module') ||
         normalizedSummary.includes('class') ||
         normalizedSummary.includes('system') ||
         normalizedSummary.includes('component'))) {
      return true;
    }

    return false;
  }

  private static detectMultiStepSolution(sessionSummary: string): boolean {
    const multiStepPatterns = [
      /\b(first|then|next|finally|after that)\b/i,
      /\b(step \d+)\b/i,
      /\b(phase \d+)\b/i,
      /\b(multi|multiple)\b/i,
      /\b(sequence|chain|pipeline)\b/i,
      /\band\b.*\band\b/
    ];

    return multiStepPatterns.some(pattern => pattern.test(sessionSummary));
  }

  private static generateBugFixDraft(
    sessionSummary: string,
    resolvedBugs: ResolvedBug[]
  ): { title: string; markdown: string } {
    const primaryBug = resolvedBugs[0];
    const bugTitle = primaryBug?.title || 'bug';
    const sanitizedTitle = this.sanitizeForTitle(bugTitle);

    const title = `Como resolvemos o ${sanitizedTitle} na sessão`;

    const bugsList = resolvedBugs
      .map((bug, index) => {
        const desc = bug.description || bugTitle;
        const solution = bug.solution || 'Implementada solução customizada';
        return `- **${desc}**: ${solution}`;
      })
      .join('\n');

    const markdown = `# ${title}

## Resumo da Sessão

Durante a sessão de desenvolvimento, enfrentamos e resolvemos o seguinte problema:

${bugsList}

## Detalhes da Resolução

${sessionSummary.slice(0, 500)}${sessionSummary.length > 500 ? '...' : ''}

## Aprendizados

${this.extractLessons(sessionSummary)}

---

*Generated by vibe-flow*
`;

    return { title, markdown };
  }

  private static generateFeatureDraft(sessionSummary: string): { title: string; markdown: string } {
    const featureName = this.extractFeatureName(sessionSummary);
    const sanitizedName = this.sanitizeForTitle(featureName);

    const title = `Nova funcionalidade: ${sanitizedName}`;

    const markdown = `# ${title}

## Resumo

Durante a sessão de desenvolvimento, foi implementada uma nova funcionalidade no projeto.

## O que foi feito

${sessionSummary.slice(0, 600)}${sessionSummary.length > 600 ? '...' : ''}

## Impacto

- Melhoria na experiência do usuário
- Expansão das capacidades do sistema
- Manutenção de código de qualidade

---

*Generated by vibe-flow*
`;

    return { title, markdown };
  }

  private static extractFeatureName(sessionSummary: string): string {
    const featurePatterns = [
      /(?:implement|create|build|develop|add)\s+(?:a\s+)?(?:new\s+)?(?:feature\s+)?(?:called\s+)?["']?(\w+)/i,
      /(?:new|added)\s+(?:feature|module|system|component)\s+(?:called\s+)?["']?(\w+)/i,
      /(?:implemented|created)\s+(\w+)\s+(?:class|module|system|feature)/i
    ];

    for (const pattern of featurePatterns) {
      const match = sessionSummary.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return 'Nova Funcionalidade';
  }

  private static sanitizeForTitle(text: string): string {
    return text
      .replace(/[^a-zA-Z0-9\sáàâãéèêíìîóòôõúùûç]/gi, '')
      .trim()
      .slice(0, 50);
  }

  private static extractLessons(sessionSummary: string): string {
    const lessonPatterns = [
      /(?:learned|lesson|insight|发现|percebido|aprendido)[:\s]+(.+)/gi,
      /(?:this demonstrates|shows that|illustrates)[:\s]+(.+)/gi
    ];

    const lessons: string[] = [];

    for (const pattern of lessonPatterns) {
      const matches = sessionSummary.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          lessons.push(`- ${match[1].trim()}`);
        }
      }
    }

    if (lessons.length === 0) {
      return '- Solução pode ser reaproveitada em casos similares\n' +
             '- Importância de testes para validação de correções';
    }

    return lessons.join('\n');
  }
}
