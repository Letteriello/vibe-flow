// Rule Generator - Creates preventive rules from improvement findings
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

/**
 * Represents a skill gap identified during the session
 */
export interface SkillGap {
  area: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  context?: string;
}

/**
 * Represents a systemic error that occurred during the session
 */
export interface SystemicError {
  category: string;
  message: string;
  pattern?: string;
  frequency: number;
  rootCause?: string;
}

/**
 * Input interface for rule generation
 * Contains skill gaps and systemic errors from the session
 */
export interface ImprovementFindings {
  skillGaps: SkillGap[];
  systemicErrors: SystemicError[];
  sessionId?: string;
  timestamp?: string;
}

/**
 * Generated rule structure
 */
export interface GeneratedRule {
  filename: string;
  category: string;
  content: string;
  updated: boolean;
}

/**
 * Mapping from error/skill categories to rule filenames
 */
const CATEGORY_TO_FILENAME: Record<string, string> = {
  // Framework-specific
  'nextjs-routing': 'router-rules.md',
  'next.js-routing': 'router-rules.md',
  'react-routing': 'router-rules.md',
  'react-hooks': 'react-hooks-rules.md',
  'react-state': 'react-state-rules.md',
  'nextjs-state': 'nextjs-state-rules.md',

  // Language/Tool-specific
  'typescript': 'typescript-rules.md',
  'typescript-mismatch': 'typescript-rules.md',
  'type-mismatch': 'typescript-rules.md',
  'import-issues': 'import-rules.md',
  'esm-issues': 'import-rules.md',
  'path-resolution': 'path-resolution-rules.md',

  // General patterns
  'async-await': 'async-rules.md',
  'null-undefined': 'null-safety-rules.md',
  'null-access': 'null-safety-rules.md',
  'build-error': 'build-rules.md',
  'compilation': 'build-rules.md',

  // Security
  'security': 'security-rules.md',
  'secrets': 'security-rules.md',

  // Testing
  'testing': 'testing-rules.md',
  'test-fixtures': 'testing-rules.md',

  // General errors
  'error': 'general-errors.md',
  'default': 'general-errors.md'
};

/**
 * RuleGenerator - Creates and updates markdown rule files based on
 * skill gaps and systemic errors detected during sessions
 */
export class RuleGenerator {
  private rulesDir: string;
  private fileContents: Map<string, string> = new Map();

  constructor(workspacePath: string) {
    this.rulesDir = join(workspacePath, '.vibe-flow', 'rules');
  }

  /**
   * Main method to apply rules from improvement findings
   * Generates/updates markdown files for each skill gap or systemic error
   */
  async applyRules(findings: ImprovementFindings, workspacePath: string): Promise<GeneratedRule[]> {
    const rules: GeneratedRule[] = [];
    const rulesMap = new Map<string, GeneratedRule>();

    // Process skill gaps
    for (const gap of findings.skillGaps) {
      const rule = this.generateRuleFromSkillGap(gap);
      const existing = rulesMap.get(rule.filename);
      if (existing) {
        // Merge rules if same category
        existing.content = this.mergeRuleContent(existing.content, rule.content);
        existing.updated = true;
      } else {
        rulesMap.set(rule.filename, rule);
      }
    }

    // Process systemic errors
    for (const error of findings.systemicErrors) {
      const rule = this.generateRuleFromError(error);
      const existing = rulesMap.get(rule.filename);
      if (existing) {
        existing.content = this.mergeRuleContent(existing.content, rule.content);
        existing.updated = true;
      } else {
        rulesMap.set(rule.filename, rule);
      }
    }

    // Write rules to files
    for (const rule of rulesMap.values()) {
      try {
        await this.writeRuleFile(rule);
        rules.push(rule);
      } catch (err) {
        // If FS is not available, simulate the content
        this.fileContents.set(rule.filename, rule.content);
        rules.push({ ...rule, updated: false });
      }
    }

    return rules;
  }

  /**
   * Generate a rule file content from a skill gap
   */
  private generateRuleFromSkillGap(gap: SkillGap): GeneratedRule {
    const filename = this.getFilenameForCategory(gap.area);
    const content = this.formatSkillGapRule(gap);

    return {
      filename,
      category: gap.area,
      content,
      updated: false
    };
  }

  /**
   * Generate a rule file content from a systemic error
   */
  private generateRuleFromError(error: SystemicError): GeneratedRule {
    const filename = this.getFilenameForCategory(error.category);
    const content = this.formatErrorRule(error);

    return {
      filename,
      category: error.category,
      content,
      updated: false
    };
  }

  /**
   * Map a category to a filename
   */
  private getFilenameForCategory(category: string): string {
    const normalizedCategory = category.toLowerCase().replace(/\s+/g, '-');

    // Try exact match first
    if (CATEGORY_TO_FILENAME[normalizedCategory]) {
      return CATEGORY_TO_FILENAME[normalizedCategory];
    }

    // Try partial match
    for (const [key, value] of Object.entries(CATEGORY_TO_FILENAME)) {
      if (normalizedCategory.includes(key) || key.includes(normalizedCategory)) {
        return value;
      }
    }

    // Check specific keywords
    if (normalizedCategory.includes('next') && normalizedCategory.includes('route')) {
      return 'router-rules.md';
    }
    if (normalizedCategory.includes('react')) {
      return 'react-hooks-rules.md';
    }
    if (normalizedCategory.includes('type') && normalizedCategory.includes('script')) {
      return 'typescript-rules.md';
    }
    if (normalizedCategory.includes('import') || normalizedCategory.includes('require')) {
      return 'import-rules.md';
    }
    if (normalizedCategory.includes('null') || normalizedCategory.includes('undefined')) {
      return 'null-safety-rules.md';
    }
    if (normalizedCategory.includes('async') || normalizedCategory.includes('await')) {
      return 'async-rules.md';
    }
    if (normalizedCategory.includes('security') || normalizedCategory.includes('secret')) {
      return 'security-rules.md';
    }
    if (normalizedCategory.includes('test')) {
      return 'testing-rules.md';
    }

    return 'general-errors.md';
  }

  /**
   * Format a skill gap as a markdown rule
   */
  private formatSkillGapRule(gap: SkillGap): string {
    const severityEmoji = {
      low: '⚠️',
      medium: '⚠️⚠️',
      high: '🚨'
    }[gap.severity];

    return `# ${gap.area} - Skill Gap Rule

## Problema Detectado
${severityEmoji} **Severidade:** ${gap.severity.toUpperCase()}

${gap.description}

${gap.context ? `### Contexto\n${gap.context}` : ''}

## Diretriz para Evitar

1. **Antes de implementar:** Estude a documentação oficial da área
2. **Verifique padrões:** Analise como o codebase existente lida com isso
3. **Teste incremental:** Implemente e teste em partes pequenas
4. **Documente decisões:** Registre o motivo das escolhas técnicas

## Referências
- Consulte a documentação oficial
- Revise PRs anteriores relacionados
- Peça review antes de implementar em produção

---
*Gerado automaticamente pelo vibe-flow - ${new Date().toISOString()}*
`;
  }

  /**
   * Format a systemic error as a markdown rule
   */
  private formatErrorRule(error: SystemicError): string {
    const message = error.message;

    const patternSection = error.pattern
      ? `\n### Pattern Identificado\n\`\`\`\n${error.pattern}\n\`\`\`\n`
      : '';

    const rootCauseSection = error.rootCause
      ? `\n### Causa Raiz\n${error.rootCause}\n`
      : '';

    return `# ${error.category} - Error Prevention Rule

## Problema Detectado

**Categoria:** ${error.category}
**Frequência:** ${error.frequency}x

\`\`\`
${message}
\`\`\`${patternSection}${rootCauseSection}

## Diretriz para Evitar

1. **Validação inicial:** Verifique configurações antes de executar
2. **Checks automatizados:** Adicione lint/format no pre-commit
3. **Type safety:** Use TypeScript strict mode
4. **Testes de integração:** Cubra casos problemáticos
5. **Documentação:** Registre soluções encontradas

## Exemplo de Correção

\`\`\`typescript
// Antes (problemático)
// ${message.split('\n')[0]}

// Depois (corrigido)
// [Implementar solução aqui]
\`\`\`

---
*Gerado automaticamente pelo vibe-flow - ${new Date().toISOString()}*
`;
  }

  /**
   * Merge new rule content with existing (append new sections)
   */
  private mergeRuleContent(existing: string, newContent: string): string {
    // Extract header from existing
    const existingLines = existing.split('\n');
    const headerEndIndex = existingLines.findIndex(line => line.startsWith('---'));

    if (headerEndIndex > 0) {
      // Insert new content before the footer
      const header = existingLines.slice(0, headerEndIndex).join('\n');
      const footer = existingLines.slice(headerEndIndex).join('\n');
      return `${header}\n\n---\n\n${newContent}\n\n${footer}`;
    }

    // If no clear structure, just append
    return `${existing}\n\n---\n\n${newContent}`;
  }

  /**
   * Write a rule file to disk (or simulate if dryRun)
   */
  private async writeRuleFile(rule: GeneratedRule): Promise<void> {
    if (this.dryRun) {
      this.fileContents.set(rule.filename, rule.content);
      return;
    }

    const filepath = join(this.rulesDir, rule.filename);

    try {
      // Try to read existing content
      const existingContent = await fs.readFile(filepath, 'utf-8');
      const mergedContent = this.mergeRuleContent(existingContent, rule.content);
      await fs.writeFile(filepath, mergedContent, 'utf-8');
    } catch {
      // File doesn't exist, create new
      await fs.mkdir(dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, rule.content, 'utf-8');
    }
  }

  /**
   * Get simulated file contents (for testing without FS)
   */
  getFileContents(): Map<string, string> {
    return this.fileContents;
  }

  /**
   * Clear cached file contents
   */
  clearCache(): void {
    this.fileContents.clear();
  }
}

export default RuleGenerator;
