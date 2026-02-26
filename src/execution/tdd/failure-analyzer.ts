/**
 * TDD Failure Analyzer
 * Parses test failure output from Jest/Vitest into surgical summaries
 * to avoid Context Rot from dumping full terminal logs to LLM
 */

export interface FailureContext {
  testName: string;
  file: string;
  line: number | null;
  expected: string | null;
  received: string | null;
  errorType: string | null;
  summary: string;
  isSnapshot: boolean;
  isAsync: boolean;
  isTimeout: boolean;
}

interface MatchResult {
  value: string;
  type: 'expected' | 'received' | 'actual';
}

/**
 * Parse raw test failure output into structured FailureContext
 * Supports Jest, Vitest, and similar frameworks
 */
export function parseTestFailure(rawError: string): FailureContext {
  const lines = rawError.split('\n');

  // Extract test name - typically at the start or after "FAIL " or "● "
  const testName = extractTestName(lines, rawError);

  // Extract file and line from stack trace
  const { file, line } = extractFileAndLine(lines);

  // Extract expected vs received values
  const expected = extractValue(rawError, ['Expected:', 'expected']);
  const received = extractValue(rawError, ['Received:', 'received:', 'actual:']);

  // Detect failure type
  const isSnapshot = /snapshot|toMatchSnapshot|toThrowErrorMatchingSnapshot/i.test(rawError);
  const isAsync = /timeout|async|promise|await/i.test(rawError);
  const isTimeout = /timeout|ETIMEDOUT|exceeded/i.test(rawError);
  const errorType = isTimeout ? 'Timeout' : extractErrorType(rawError);

  // Generate surgical summary
  const summary = generateSummary(testName, expected, received, errorType, isSnapshot, isTimeout);

  return {
    testName,
    file,
    line,
    expected,
    received,
    errorType,
    summary,
    isSnapshot,
    isAsync,
    isTimeout,
  };
}

function extractTestName(lines: string[], rawError: string): string {
  // Try Jest pattern: "● describe/test name"
  const jestMatch = rawError.match(/●\s+(.+)$/m);
  if (jestMatch) {
    return cleanTestName(jestMatch[1]);
  }

  // Try Vitest pattern: "FAIL file.test.ts > describe > test name"
  const vitestMatch = rawError.match(/FAIL\s+.*?>\s*(.+)$/m);
  if (vitestMatch) {
    return cleanTestName(vitestMatch[1]).replace(/^.*>\s*/, ''); // Get last part after >
  }

  // Try "Test name:" or "Test:"
  const testNameMatch = rawError.match(/(?:Test name|Test):\s*(.+)$/mi);
  if (testNameMatch) {
    return cleanTestName(testNameMatch[1]);
  }

  // Try first meaningful line that's not a separator
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('●') && !trimmed.startsWith('FAIL') &&
        !trimmed.startsWith('PASS') && trimmed.length > 3) {
      return cleanTestName(trimmed);
    }
  }

  return 'Unknown Test';
}

function cleanTestName(name: string): string {
  return name
    .replace(/^['"`]|['"`]$/g, '') // Remove surrounding quotes
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200); // Truncate long names
}

function extractFileAndLine(lines: string[]): { file: string; line: number | null } {
  // Look for stack trace patterns
  const stackPatterns = [
    // at Object.<anonymous> (/path/file.test.ts:10:5)
    /at\s+.+\s+\((.+):(\d+):\d+\)/,
    // at Object.<anonymous> (/path/file.test.ts:10)
    /at\s+.+\s+\((.+):(\d+)\)/,
    // /path/file.test.ts:10:5
    /^(.+):(\d+):\d+$/,
    // Error: message\n    at file.test.ts:10
    /^\s*at\s+(.+):(\d+)/m,
  ];

  for (const line of lines) {
    for (const pattern of stackPatterns) {
      const match = line.match(pattern);
      if (match) {
        const file = match[1].replace(/^.*[/\\]/, ''); // Get just filename
        const lineNum = parseInt(match[2], 10);
        if (!isNaN(lineNum)) {
          return { file, line: lineNum };
        }
      }
    }
  }

  // Try to extract from first "at" line
  for (const line of lines) {
    if (line.includes('at ') && (line.includes('.test.') || line.includes('.spec.'))) {
      const fileMatch = line.match(/at\s+.+\(([^:]+):(\d+)/);
      if (fileMatch) {
        return {
          file: fileMatch[1].replace(/^.*[/\\]/, ''),
          line: parseInt(fileMatch[2], 10)
        };
      }
    }
  }

  return { file: 'unknown', line: null };
}

function extractValue(rawError: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    // Try multiline pattern first (for Jest/Vitest)
    const multilinePattern = new RegExp(
      `${prefix}[\\s\\S]*?(?=Expected|Received|at\\s|\\d+\\s+passing|\\d+\\s+failing|$)`,
      'i'
    );
    const multilineMatch = rawError.match(multilinePattern);
    if (multilineMatch) {
      let value = multilineMatch[0]
        .replace(prefix, '')
        .replace(/\n\s+/g, ' ')
        .trim();
      if (value && value !== '-') {
        return truncateValue(value);
      }
    }

    // Try single line pattern
    const singleLinePattern = new RegExp(`${prefix}\\s*(.+?)(?:\\n|$)`, 'i');
    const singleMatch = rawError.match(singleLinePattern);
    if (singleMatch) {
      let value = singleMatch[1].trim();
      if (value && value !== '-') {
        return truncateValue(value);
      }
    }
  }

  return null;
}

function truncateValue(value: string): string {
  // Remove ANSI codes
  const clean = value.replace(/\x1b\[[0-9;]*m/g, '');
  // Truncate long values
  if (clean.length > 300) {
    return clean.slice(0, 297) + '...';
  }
  return clean;
}

function extractErrorType(rawError: string): string | null {
  // Common assertion error types
  const errorPatterns = [
    { pattern: /expect\(.*\)\.toBe\(/, type: 'toBe' },
    { pattern: /expect\(.*\)\.toEqual\(/, type: 'toEqual' },
    { pattern: /expect\(.*\)\.toStrictEqual\(/, type: 'toStrictEqual' },
    { pattern: /expect\(.*\)\.toContain\(/, type: 'toContain' },
    { pattern: /expect\(.*\)\.toThrow\(/, type: 'toThrow' },
    { pattern: /expect\(.*\)\.rejects/, type: 'rejects' },
    { pattern: /AssertionError/, type: 'AssertionError' },
    { pattern: /ReferenceError/, type: 'ReferenceError' },
    { pattern: /TypeError/, type: 'TypeError' },
    { pattern: /SyntaxError/, type: 'SyntaxError' },
    { pattern: /Error:/, type: 'Error' },
  ];

  for (const { pattern, type } of errorPatterns) {
    if (pattern.test(rawError)) {
      return type;
    }
  }

  return 'Unknown';
}

function generateSummary(
  testName: string,
  expected: string | null,
  received: string | null,
  errorType: string | null,
  isSnapshot: boolean,
  isTimeout: boolean
): string {
  const parts: string[] = [];

  parts.push(`Test: ${testName}`);

  if (isTimeout) {
    parts.push('Type: Timeout');
  } else if (isSnapshot) {
    parts.push('Type: Snapshot mismatch');
  } else if (expected && received) {
    parts.push(`Expected: ${expected}`);
    parts.push(`Received: ${received}`);
  } else if (errorType) {
    parts.push(`Error: ${errorType}`);
  }

  return parts.join(' | ');
}

/**
 * Check if failure is worth retrying (not a syntax/compilation error)
 */
export function isRetryableFailure(failure: FailureContext): boolean {
  const nonRetryable = ['SyntaxError', 'ReferenceError', 'TypeError'];
  // Retry unless it's a clear code error (not assertion)
  return !nonRetryable.includes(failure.errorType || '');
}

/**
 * Serialize FailureContext to minimal string for LLM context
 */
export function serializeFailureContext(failure: FailureContext): string {
  return failure.summary;
}
