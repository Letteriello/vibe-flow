// Semantic Quality Checker - Final barrier for agent-generated code
// Uses string/regex analysis to detect structural anomalies without heavy AST libraries

export interface SyntaxAnomaly {
  type: 'markdown_prefix' | 'orphaned_import' | 'unclosed_brace' | 'unclosed_paren' | 'unclosed_bracket' | 'invalid_string' | 'trailing_code';
  message: string;
  line?: number;
  severity: 'error' | 'warning';
}

export interface QualityCheckResult {
  isValid: boolean;
  anomalies: SyntaxAnomaly[];
  sanitizedCode?: string;
}

/**
 * SemanticQualityChecker - Final barrier for LLM-generated code
 * Detects and removes common LLM output anomalies like markdown prefixes,
 * orphaned imports, issues
 and structural */
export class SemanticQualityChecker {
  /**
   * Check for orphaned imports (imports that appear but are never used)
   * Uses heuristic analysis of import statements vs usage patterns
   */
  hasOrphanedImports(code: string): boolean {
    const imports = this.extractImports(code);
    if (imports.length === 0) return false;

    const usedIdentifiers = this.extractUsedIdentifiers(code);

    for (const imp of imports) {
      const defaultImport = imp.default;
      const namedImports = imp.named;

      // Check if any imported identifier is used
      const hasUsage = [...namedImports, defaultImport].some(id => {
        if (!id) return false;
        // Simple usage check - identifier appears outside import statement
        const usagePattern = new RegExp(`\\b${this.escapeRegex(id)}\\b`);
        // Exclude the import line itself
        const codeWithoutImports = code.split(/^import\s/m).slice(1).join('');
        return usagePattern.test(codeWithoutImports);
      });

      if (!hasUsage) {
        return true; // Found orphaned import
      }
    }

    return false;
  }

  /**
   * Detect syntax anomalies in code that indicate LLM output issues
   */
  hasSyntaxAnomalies(code: string): boolean {
    const anomalies = this.detectAnomalies(code);
    return anomalies.length > 0;
  }

  /**
   * Full quality check with optional sanitization
   */
  checkCode(code: string, sanitize: boolean = true): QualityCheckResult {
    const anomalies = this.detectAnomalies(code);
    const hasOrphans = this.hasOrphanedImports(code);

    if (hasOrphans) {
      anomalies.push({
        type: 'orphaned_import',
        message: 'Found unused/orphaned import statements',
        severity: 'warning'
      });
    }

    let sanitizedCode: string | undefined;

    if (sanitize && anomalies.some(a => a.type === 'markdown_prefix')) {
      sanitizedCode = this.sanitizeMarkdownPrefix(code);
    }

    return {
      isValid: anomalies.filter(a => a.severity === 'error').length === 0,
      anomalies,
      sanitizedCode
    };
  }

  /**
   * Detect all anomalies in the code
   */
  private detectAnomalies(code: string): SyntaxAnomaly[] {
    const anomalies: SyntaxAnomaly[] = [];

    // Check for markdown prefix (common LLM output issue)
    if (this.hasMarkdownPrefix(code)) {
      anomalies.push({
        type: 'markdown_prefix',
        message: 'Code starts with markdown explanation - should be pure code',
        line: 1,
        severity: 'error'
      });
    }

    // Check for unclosed braces
    if (!this.checkBalancedBraces(code)) {
      anomalies.push({
        type: 'unclosed_brace',
        message: 'Unbalanced curly braces detected',
        severity: 'error'
      });
    }

    // Check for unclosed parentheses
    if (!this.checkBalancedParens(code)) {
      anomalies.push({
        type: 'unclosed_paren',
        message: 'Unbalanced parentheses detected',
        severity: 'error'
      });
    }

    // Check for unclosed brackets
    if (!this.checkBalancedBrackets(code)) {
      anomalies.push({
        type: 'unclosed_bracket',
        message: 'Unbalanced square brackets detected',
        severity: 'error'
      });
    }

    // Check for invalid string literals
    if (this.hasInvalidStrings(code)) {
      anomalies.push({
        type: 'invalid_string',
        message: 'Invalid string literal detected (unclosed or malformed)',
        severity: 'error'
      });
    }

    // Check for trailing code after close tags
    if (this.hasTrailingCode(code)) {
      anomalies.push({
        type: 'trailing_code',
        message: 'Trailing content detected after code block closure',
        severity: 'warning'
      });
    }

    return anomalies;
  }

  /**
   * Check if code starts with markdown explanation
   */
  private hasMarkdownPrefix(code: string): boolean {
    const trimmed = code.trimStart();
    const lines = trimmed.split('\n');

    if (lines.length === 0) return false;

    const firstLine = lines[0].toLowerCase();

    // Common LLM markdown prefix patterns
    const markdownPrefixPatterns = [
      /^aqui[ée]?\s+está/i,
      /^here['']s?\s+(the\s+)?código|code/i,
      /^aqui[ée]?\s+temos/i,
      /^seg[ue]?\s+o[sa]?\s+código/i,
      /^código[:\s]/i,
      /^code[:\s]/i,
      /^```(typescript|javascript|python|js|ts|py)?/i,
      /^```$/,
      /^aqui[ée]?\s+(está|estáo|está|está)\s+o/i,
      /^here['']s/i,
      /^claro[,\s]/i,
      /^com\s+prazer[,\s]/i,
      /^当然[,\s]/i,
      /^(。以下|上面)是/i,
      /^Voici/i,
      /^[=-]{3,}$/, // Markdown horizontal rule
    ];

    for (const pattern of markdownPrefixPatterns) {
      if (pattern.test(firstLine)) {
        return true;
      }
    }

    // Check if first non-empty line is a markdown code block start
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === '') continue;
      if (trimmedLine.startsWith('```')) {
        // It's a code block start - check if there's text before it
        const beforeCodeBlock = trimmed.substring(0, trimmed.indexOf('```'));
        if (beforeCodeBlock.length > 0 && !beforeCodeBlock.startsWith('```')) {
          return true;
        }
      }
      break;
    }

    return false;
  }

  /**
   * Remove markdown prefix and extract pure code
   */
  sanitizeMarkdownPrefix(code: string): string {
    let lines = code.split('\n');
    let foundCodeStart = false;
    const cleanedLines: string[] = [];

    for (const line of lines) {
      // Detect code block start
      if (!foundCodeStart && line.trim().startsWith('```')) {
        foundCodeStart = true;
        continue;
      }

      if (foundCodeStart) {
        // Stop at closing code block
        if (line.trim() === '```' || line.trim().startsWith('```')) {
          continue;
        }
        cleanedLines.push(line);
      } else {
        // Skip explanatory text before code block
        const trimmed = line.trim().toLowerCase();
        if (trimmed === '' || this.isExplanatoryText(trimmed)) {
          continue;
        }
        // Once we hit something that looks like code, include it
        if (this.looksLikeCode(trimmed)) {
          foundCodeStart = true;
          cleanedLines.push(line);
        }
      }
    }

    return cleanedLines.join('\n');
  }

  /**
   * Check if line is explanatory text (not code)
   */
  private isExplanatoryText(line: string): boolean {
    const explanatoryPatterns = [
      /^aqui[ée]?/i,
      /^here['']s/i,
      /^seg[ue]/i,
      /^com\s+praz/i,
      /^claro/i,
      /^当然/i,
      /^veja/i,
      /^vejam/i,
      /^note/i,
      /^observe/i,
      /^注意到/i,
      /^[=-]{3,}$/,
      /^código/i,
      /^code/i,
      /^Voici/i,
      /^以下/i,
    ];

    return explanatoryPatterns.some(p => p.test(line));
  }

  /**
   * Check if line looks like actual code
   */
  private looksLikeCode(line: string): boolean {
    const codePatterns = [
      /^(export|import|const|let|var|function|class|interface|type|enum|def|public|private|async|await)\s/,
      /^[{\[\(]/,
      /[;}]$/,
      /^if\(/,
      /^for\(/,
      /^while\(/,
      /^return/,
      /^import\s+['"]/,
      /^\*?\s*@/,
    ];

    return codePatterns.some(p => p.test(line));
  }

  /**
   * Extract import statements from code
   */
  private extractImports(code: string): Array<{ default?: string; named: string[]; source: string }> {
    const imports: Array<{ default?: string; named: string[]; source: string }> = [];
    const importRegex = /import\s+(?:([A-Za-z_$][\w$]*)\s+from\s+)?['"]([^'"]+)['"]|import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      if (match[1] && match[2]) {
        // Default import: import x from 'y'
        imports.push({ default: match[1], named: [], source: match[2] });
      } else if (match[3] && match[4]) {
        // Named imports: import { x, y } from 'z'
        const named = match[3].split(',').map(s => s.trim()).filter(s => s);
        imports.push({ default: undefined, named, source: match[4] });
      }
    }

    return imports;
  }

  /**
   * Extract used identifiers from code (excluding imports)
   */
  private extractUsedIdentifiers(code: string): string[] {
    // Simple heuristic - find identifiers that look like they're being used
    const identifierRegex = /\b([A-Za-z_$][\w$]*)\b/g;
    const identifiers = new Set<string>();

    let match;
    while ((match = identifierRegex.exec(code)) !== null) {
      identifiers.add(match[1]);
    }

    return Array.from(identifiers);
  }

  /**
   * Check for balanced curly braces
   */
  private checkBalancedBraces(code: string): boolean {
    let count = 0;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;

    for (const char of code) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char === '{') count++;
      if (char === '}') count--;
    }

    return count === 0;
  }

  /**
   * Check for balanced parentheses
   */
  private checkBalancedParens(code: string): boolean {
    let count = 0;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;

    for (const char of code) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char === '(') count++;
      if (char === ')') count--;
    }

    return count === 0;
  }

  /**
   * Check for balanced square brackets
   */
  private checkBalancedBrackets(code: string): boolean {
    let count = 0;
    let inString = false;
    let stringChar = '';
    let escapeNext = false;

    for (const char of code) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char === '[') count++;
      if (char === ']') count--;
    }

    return count === 0;
  }

  /**
   * Check for invalid string literals
   */
  private hasInvalidStrings(code: string): boolean {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        continue;
      }

      // Check for unclosed strings (simple heuristic)
      let inSingle = false;
      let inDouble = false;
      let inTemplate = false;
      let escapeNext = false;

      for (const char of line) {
        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === "'" && !inDouble && !inTemplate) {
          inSingle = !inSingle;
        } else if (char === '"' && !inSingle && !inTemplate) {
          inDouble = !inDouble;
        } else if (char === '`' && !inSingle && !inDouble) {
          inTemplate = !inTemplate;
        }
      }

      // If still in a string at end of line (and line doesn't end with continuation)
      if ((inSingle || inDouble || inTemplate) && !line.trim().endsWith('\\')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for trailing code after closing code block
   */
  private hasTrailingCode(code: string): boolean {
    const codeBlockEndRegex = /```[\s\S]*?```/g;
    const lastCodeBlockMatch = code.match(codeBlockEndRegex);

    if (!lastCodeBlockMatch) return false;

    const lastBlockEnd = code.lastIndexOf('```');
    const afterLastBlock = code.substring(lastBlockEnd + 3);

    // Check if there's significant non-empty content after the code block
    const significantContent = afterLastBlock.replace(/```\s*/g, '').trim();
    return significantContent.length > 0;
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Factory function for convenience
export function createSemanticChecker(): SemanticQualityChecker {
  return new SemanticQualityChecker();
}
