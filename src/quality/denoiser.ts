// Code denoiser - removes LLM artifacts from generated code

// Denoise result with statistics
export interface DenoiseResult {
  cleanedCode: string;
  removedItems: DenoiseRemoval[];
  statistics: DenoiseStatistics;
}

// Individual removal record
export interface DenoiseRemoval {
  type: DenoiseRemovalType;
  original: string;
  line: number;
}

// Statistics from denoising
export interface DenoiseStatistics {
  totalRemovals: number;
  todoCommentsRemoved: number;
  consoleLogsRemoved: number;
  thoughtBlocksRemoved: number;
  placeholderCommentsRemoved: number;
  extraNewlinesRemoved: number;
}

// Types of removals
export type DenoiseRemovalType =
  | 'todo_comment'
  | 'console_log'
  | 'thought_block'
  | 'placeholder_comment'
  | 'extra_whitespace';

/**
 * CodeDenoiser - removes common LLM artifacts from generated code
 * Ensures production-ready code without "AI slop" visual artifacts
 */
export class CodeDenoiser {
  private readonly patterns: RegExp[];

  constructor() {
    this.patterns = [
      // TODO: AI generated / AI-written / AI-assisted comments
      /\/\/\s*TODO:\s*(?:AI|AI-generated|AI-written|AI-assisted|assistant|model|llm|chatgpt|claude|gemini).*$/gim,
      // AI-generated markers in various formats
      /\/\/\s*(?:AI|AI-generated|AI-written|AI-assisted)\s*(?:comment|note|marker).*$/gim,
      // Placeholder comments like // ... or // TODO: implement
      /\/\/\s*(?:\.\.\.|(?:TODO|FIXME|HACK|XXX):?\s*(?:implement|add|write|create|fix|complete).*)$/gim,
      // Placeholder function bodies
      /\/\/\s*.*(?:placeholder|temp|temporary|stub|mock).*$/gim,
      // Console.log debugging artifacts
      /console\.log\s*\(\s*(?:["'`](?:here|debug|test|tmp|temp|output|result|value|val|check|ok|done|ready|start|end|step|item|entry|exit|hit|fired|triggered|processed|found|created|updated|deleted|added|removed|changed|modified|selected|clicked|hovered|focused|blurred|loaded|submitted|cancelled|accepted|rejected|approved|denied|confirmed|cleared|reset|initialized|configured|installed|uninstalled|enabled|disabled|activated|deactivated|started|stopped|paused|resumed|opened|closed|connected|disconnected|sent|received|pushed|pulled|merged|built|deployed|tested|validated|verified|checked|analyzed|parsed|compiled|bundled|minified|optimized|refactored|restructured|reorganized|reformatted|linted|type-checked|typechecked|scanned|scraped|crawled|fetched|downloaded|uploaded|streamed|broadcasted|published|subscribed|unsubscribed|connected|reconnected|authenticated|authorized|encrypted|decrypted|compressed|decompressed|cached|evicted|backed-up|restored|migrated|upgraded|downgraded|installed|uninstalled|loaded|unloaded|imported|exported|included|excluded|filtered|sorted|grouped|mapped|reduced|folded|expanded|collapsed|minimized|maximized|restored|zoomed|scrolled|dragged|dropped|selected|copied|cut|pasted|undone|redone|undo|redo|saved|loaded|exported|imported|printed|rendered|painted|drawn|updated|refreshed|invalidated|revalidated|recomputed|precomputed|cached|stored|retrieved|queried|searched|found|matched|replaced|substituted|swapped|exchanged|rotated|flipped|mirrored|scaled|resized|moved|positioned|aligned|distributed|constrained|validated|sanitized|escaped|encoded|decoded|transformed|converted|parsed|stringified|serialized|deserialized)["'`]|\d+|true|false|null|undefined)\s*\)/gi,
      // Generic console.log with single string argument (often debug)
      /console\.log\s*\(\s*["'`][^"'`]*["'`]\s*\)(?!\s*;)/gi,
      // console.debug, console.info, console.warn (keep console.error for actual errors)
      /console\.(debug|info)\s*\([^)]*\)/gi,
      // Thought block patterns (various LLM thought artifacts)
      /(\/\*\*?\s*(?:THINKING|THOUGHT|REASONING|ANALYSIS|THINK|THOUGHTS?|REASONING|CONSIDERING|PROCESSING).*?\*\/)/gis,
      /(\/\/\s*(?:THINKING|THOUGHT|REASONING|ANALYSIS|THINK|THOUGHTS?|REASONING|Consider|Let me|I will|I need to|First|Second|Third|Next|Then|Now|Finally).*$)/gim,
      // XML thought blocks that leaked
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /<thought>[\s\S]*?<\/thought>/gi,
      /<analysis>[\s\S]*?<\/analysis>/gi,
      // Scratch/working notes left in code
      /\/\/\s*(?:NOTE|SCRATCH|WORKING|TEMP|DEBUG):.*$/gim,
      // Code that looks like example/placeholder
      /\/\/\s*(?:example|example|样品|例).*$/gim,
      // Empty catch blocks with only comments
      /catch\s*\([^)]*\)\s*\{\s*\/\/[^\n]*\s*\}/gi,
      // Multiple consecutive blank lines (more than 2)
      /\n{3,}/g,
      // Trailing whitespace on lines
      /[ \t]+$/gm,
      // Lines with only comments that look like AI markers
      /^\s*\/\/\s*(?:AI|Generated|Created|Produced|Made|Made with|Built by).*$/gim,
      // Debug flags left in code
      /(?:const|let|var)\s+(?:DEBUG|DEBUG_MODE|DEBUGGING|VERBOSE|LOG_LEVEL)\s*=\s*(?:true|1|"true"|'true')/gi,
      // Unused variable assignments that look like debug
      /(?:const|let|var)\s+(?:tmp|temp|placeholder|dummy|test|debug)\s*=/gi,
    ];
  }

  /**
   * Clean generated code by removing LLM artifacts
   * @param sourceCode - The raw generated code
   * @returns Cleaned code without visual artifacts
   */
  cleanGeneratedCode(sourceCode: string): string {
    let cleaned: string = sourceCode;
    const removals: DenoiseRemoval[] = [];

    // Track line numbers for each removal
    let lineNumber = 1;

    // Remove each pattern
    for (const pattern of this.patterns) {
      const matches = cleaned.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Count newlines before this match for line tracking
          const beforeMatch = cleaned.substring(0, cleaned.indexOf(match));
          lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

          // Determine removal type based on pattern
          const removalType = this.determineRemovalType(match);

          removals.push({
            type: removalType,
            original: match.substring(0, 100) + (match.length > 100 ? '...' : ''),
            line: lineNumber,
          });
        }
      }
      cleaned = cleaned.replace(pattern, '');
    }

    // Normalize multiple blank lines to max 2
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Remove trailing whitespace
    cleaned = cleaned.replace(/[ \t]+$/gm, '');

    // Ensure file ends with single newline
    cleaned = cleaned.replace(/\n+$/g, '') + '\n';

    return cleaned;
  }

  /**
   * Determine the type of removal based on the matched content
   */
  private determineRemovalType(content: string): DenoiseRemovalType {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('todo')) {
      return 'todo_comment';
    }
    if (lowerContent.includes('console')) {
      return 'console_log';
    }
    if (
      lowerContent.includes('thinking') ||
      lowerContent.includes('thought') ||
      lowerContent.includes('analysis') ||
      lowerContent.includes('reasoning')
    ) {
      return 'thought_block';
    }
    if (
      lowerContent.includes('placeholder') ||
      lowerContent.includes('...') ||
      lowerContent.includes('example') ||
      lowerContent.includes('implement')
    ) {
      return 'placeholder_comment';
    }
    if (content.match(/^\s*$/)) {
      return 'extra_whitespace';
    }
    return 'placeholder_comment';
  }

  /**
   * Clean code and return detailed result with statistics
   */
  denoise(sourceCode: string): DenoiseResult {
    const cleanedCode = this.cleanGeneratedCode(sourceCode);
    const removals: DenoiseRemoval[] = [];

    // Re-scan to collect removals for statistics
    let tempCode = sourceCode;
    for (const pattern of this.patterns) {
      const matches = tempCode.match(pattern);
      if (matches) {
        for (const match of matches) {
          const beforeMatch = tempCode.substring(0, tempCode.indexOf(match));
          const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

          removals.push({
            type: this.determineRemovalType(match),
            original: match.substring(0, 100) + (match.length > 100 ? '...' : ''),
            line: lineNumber,
          });
        }
      }
      tempCode = tempCode.replace(pattern, '');
    }

    const statistics: DenoiseStatistics = {
      totalRemovals: removals.length,
      todoCommentsRemoved: removals.filter((r) => r.type === 'todo_comment').length,
      consoleLogsRemoved: removals.filter((r) => r.type === 'console_log').length,
      thoughtBlocksRemoved: removals.filter((r) => r.type === 'thought_block').length,
      placeholderCommentsRemoved: removals.filter((r) => r.type === 'placeholder_comment').length,
      extraNewlinesRemoved: 0, // Calculated from difference
    };

    return {
      cleanedCode,
      removedItems: removals,
      statistics,
    };
  }
}

// Standalone function export for convenience
export function denoiseCode(sourceCode: string): string {
  const denoiser = new CodeDenoiser();
  return denoiser.cleanGeneratedCode(sourceCode);
}
