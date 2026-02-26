// Three-Level Summarization Escalation
// Implementa fallback progressivo para compressão de texto

/**
 * Resultado da sumarização
 */
export interface SummarizationResult {
  text: string;
  method: 'prompt' | 'aggressive' | 'truncate';
  originalTokens: number;
  finalTokens: number;
  level: number;
}

/**
 * Interface para o provedor LLM injetado
 * Simula a chamada ao LLM para permitir testes e mock
 */
export interface LLMProvider {
  /**
   * Executa uma chamada ao LLM para sumarização
   * @param prompt - Prompt de instrução
   * @param text - Texto a ser sumarizado
   * @returns Texto sumarizado pelo LLM
   */
  summarize(prompt: string, text: string): Promise<string>;
}

/**
 * Opções para o EscalationSummarizer
 */
export interface EscalationOptions {
  /**
   * Provedor LLM injetado
   */
  llmProvider: LLMProvider;
  /**
   * Número máximo de retries para cada nível
   */
  maxRetries?: number;
  /**
   * Razão mínima de redução para considerar sucesso (0.7 = 70% do tamanho original)
   */
  minReductionRatio?: number;
}

/**
 * EscalationSummarizer - Implementa Three-Level Summarization Escalation
 *
 * Nível 1: Sumarização via prompt (preserva detalhes)
 * Nível 2: Sumarização agressiva (bullet points curtos)
 * Nível 3: DeterministicTruncate (corta início e fim de parágrafos)
 */
export class EscalationSummarizer {
  private llmProvider: LLMProvider;
  private maxRetries: number;
  private minReductionRatio: number;

  constructor(options: EscalationOptions) {
    this.llmProvider = options.llmProvider;
    this.maxRetries = options.maxRetries ?? 2;
    this.minReductionRatio = options.minReductionRatio ?? 0.7;
  }

  /**
   * Estima o número de tokens em um texto
   * Aproximação: 1 token ≈ 4 caracteres em inglês
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Nível 1: Sumarização via prompt preservando detalhes
   */
  private async level1PromptSummarize(
    text: string,
    targetTokens: number
  ): Promise<SummarizationResult | null> {
    const prompt = `You are a text summarization expert. Create a detailed summary that preserves important details.
Target length: approximately ${targetTokens} tokens.
Instructions:
- Keep all important facts, names, and technical details
- Maintain context and relationships between ideas
- Use complete sentences when possible
- Preserve code snippets or technical examples if present

Text to summarize:`;

    const result = await this.llmProvider.summarize(prompt, text);
    const originalTokens = this.estimateTokens(text);
    const finalTokens = this.estimateTokens(result);

    // Verifica se a redução foi suficiente
    if (finalTokens <= targetTokens || finalTokens <= originalTokens * this.minReductionRatio) {
      return {
        text: result,
        method: 'prompt',
        originalTokens,
        finalTokens,
        level: 1,
      };
    }

    return null;
  }

  /**
   * Nível 2: Sumarização agressiva com bullet points curtos
   */
  private async level2AggressiveSummarize(
    text: string,
    targetTokens: number
  ): Promise<SummarizationResult | null> {
    const prompt = `You are a text compression expert. Create an extremely compressed summary.
Target length: maximum ${targetTokens} tokens.
Instructions:
- Use bullet points only
- Keep only the most critical information
- Omit all redundant words and filler
- Use abbreviations where appropriate
- One line per bullet point maximum

Text to summarize:`;

    const result = await this.llmProvider.summarize(prompt, text);
    const originalTokens = this.estimateTokens(text);
    const finalTokens = this.estimateTokens(result);

    if (finalTokens <= targetTokens || finalTokens <= originalTokens * this.minReductionRatio) {
      return {
        text: result,
        method: 'aggressive',
        originalTokens,
        finalTokens,
        level: 2,
      };
    }

    return null;
  }

  /**
   * Nível 3: DeterministicTruncate
   * Corta o texto mantendo início e fim de parágrafos
   */
  private level3DeterministicTruncate(
    text: string,
    targetTokens: number
  ): SummarizationResult {
    const originalTokens = this.estimateTokens(text);
    const paragraphs = text.split(/\n\n+/);
    const targetChars = targetTokens * 4;

    if (paragraphs.length <= 1 || text.length <= targetChars) {
      // Texto já pequeno o suficiente
      return {
        text: text.slice(0, targetChars),
        method: 'truncate',
        originalTokens,
        finalTokens: this.estimateTokens(text.slice(0, targetChars)),
        level: 3,
      };
    }

    // Estratégia: manter início e fim de cada parágrafo
    const resultParts: string[] = [];
    let remainingChars = targetChars;

    for (let i = 0; i < paragraphs.length && remainingChars > 0; i++) {
      const paragraph = paragraphs[i];
      const isFirst = i === 0;
      const isLast = i === paragraphs.length - 1;

      if (isFirst) {
        // Primeiro parágrafo: mantém tudo que couber
        const keepLength = Math.min(paragraph.length, remainingChars);
        resultParts.push(paragraph.slice(0, keepLength));
        remainingChars -= keepLength;
      } else if (isLast) {
        // Último parágrafo: mantém tudo que couber
        const keepLength = Math.min(paragraph.length, remainingChars);
        resultParts.push(paragraph.slice(-keepLength));
        remainingChars -= keepLength;
      } else {
        // Parágrafos do meio: mantém início e fim
        const halfChars = Math.floor(remainingChars / 2);
        const startLength = Math.min(Math.floor(paragraph.length / 2), halfChars);
        const endLength = Math.min(paragraph.length - startLength, halfChars);

        if (startLength > 10 && endLength > 10) {
          const start = paragraph.slice(0, startLength);
          const end = paragraph.slice(-endLength);
          resultParts.push(start + ' [...] ' + end);
          remainingChars -= (startLength + endLength + 10); // +10 for [...]
        } else if (startLength > 20) {
          resultParts.push(paragraph.slice(0, startLength));
          remainingChars -= startLength;
        }
      }
    }

    const finalText = resultParts.join('\n\n');
    return {
      text: finalText,
      method: 'truncate',
      originalTokens,
      finalTokens: this.estimateTokens(finalText),
      level: 3,
    };
  }

  /**
   * Main method - Three-Level Summarization Escalation
   *
   * @param text - Texto a ser sumarizado
   * @param targetTokens - Número alvo de tokens
   * @returns Resultado da sumarização com método usado
   */
  async summarizeWithFallback(
    text: string,
    targetTokens: number
  ): Promise<SummarizationResult> {
    const originalTokens = this.estimateTokens(text);

    // Se já está no tamanho alvo, retorna original
    if (originalTokens <= targetTokens) {
      return {
        text,
        method: 'prompt',
        originalTokens,
        finalTokens: originalTokens,
        level: 0,
      };
    }

    // Nível 1: Sumarização via prompt
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.level1PromptSummarize(text, targetTokens);
        if (result !== null) {
          return result;
        }
      } catch {
        // Continua para próximo nível se falhar
        break;
      }
    }

    // Nível 2: Sumarização agressiva
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.level2AggressiveSummarize(text, targetTokens);
        if (result !== null) {
          return result;
        }
      } catch {
        // Continua para próximo nível se falhar
        break;
      }
    }

    // Nível 3: DeterministicTruncate
    return this.level3DeterministicTruncate(text, targetTokens);
  }
}

/**
 * Criador de instância com provedor LLM mock para testes
 */
export function createEscalationSummarizer(llmProvider: LLMProvider): EscalationSummarizer {
  return new EscalationSummarizer({ llmProvider });
}
