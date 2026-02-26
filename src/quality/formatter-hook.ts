// Formatter Hook - Run Prettier and ESLint as guardrails on AI-modified files
// Executes local binaries via npx, captures output, returns diagnostic object

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';

const execAsync = promisify(exec);

// Supported file extensions for formatting/linting
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml'];

/**
 * Diagnostic result from formatter guardrails
 */
export interface FormatterDiagnostic {
  success: boolean;
  targetPath: string;
  filesChecked: string[];
  prettier?: ToolResult;
  eslint?: ToolResult;
  combinedIssues: FormattedIssue[];
  timestamp: string;
}

/**
 * Individual tool (Prettier/ESLint) result
 */
export interface ToolResult {
  tool: 'prettier' | 'eslint';
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  filesProcessed: string[];
  issues: FormattedIssue[];
}

/**
 * Structured issue from formatting/linting
 */
export interface FormattedIssue {
  tool: 'prettier' | 'eslint';
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
}

/**
 * Configuration for formatter guardrails
 */
export interface FormatterHookConfig {
  /**
   * Run Prettier check (default: true)
   */
  runPrettier?: boolean;

  /**
   * Run ESLint check (default: true)
   */
  runEslint?: boolean;

  /**
   * File extensions to process (default: SUPPORTED_EXTENSIONS)
   */
  extensions?: string[];

  /**
   * Timeout for each tool in ms (default: 60000)
   */
  timeout?: number;

  /**
   * Working directory (defaults to targetPath)
   */
  cwd?: string;
}

/**
 * Recursively find all supported files in a directory
 */
async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .git, .vibe-flow directories
        if (!['node_modules', '.git', '.vibe-flow', 'dist', 'build', 'coverage'].includes(entry.name)) {
          const subFiles = await findFiles(fullPath, extensions);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory may not exist or be accessible
  }

  return files;
}

/**
 * Run Prettier check on files
 */
async function executePrettier(
  files: string[],
  cwd: string,
  timeout: number
): Promise<ToolResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode = 0;

  // Run Prettier with --check flag (doesn't modify files, just reports)
  const prettierArgs = ['--check', '--ignore-unknown', ...files];

  try {
    const { stdout: prettierStdout, stderr: prettierStderr } = await execAsync(
      `npx prettier ${prettierArgs.join(' ')}`,
      { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }
    );

    stdout.push(prettierStdout);
    stderr.push(prettierStderr);
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    exitCode = execError.code ?? 1;
    if (execError.stdout) stdout.push(execError.stdout);
    if (execError.stderr) stderr.push(execError.stderr);
  }

  // Parse Prettier output into structured issues
  const issues = parsePrettierOutput(stdout.join('\n'), stderr.join('\n'), files);

  return {
    tool: 'prettier',
    success: exitCode === 0,
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    filesProcessed: files,
    issues
  };
}

/**
 * Run ESLint check on files
 */
async function executeEslint(
  files: string[],
  cwd: string,
  timeout: number
): Promise<ToolResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode = 0;

  // Run ESLint with --quiet to only show errors/warnings
  // Filter to TypeScript and JavaScript files for ESLint
  const lintableFiles = files.filter(f => {
    const ext = extname(f).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  });

  if (lintableFiles.length === 0) {
    return {
      tool: 'eslint',
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      filesProcessed: [],
      issues: []
    };
  }

  try {
    const { stdout: eslintStdout, stderr: eslintStderr } = await execAsync(
      `npx eslint --quiet ${lintableFiles.join(' ')}`,
      { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }
    );

    stdout.push(eslintStdout);
    stderr.push(eslintStderr);
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    exitCode = execError.code ?? 1;
    if (execError.stdout) stdout.push(execError.stdout);
    if (execError.stderr) stderr.push(execError.stderr);
  }

  // Parse ESLint output into structured issues
  const issues = parseEslintOutput(stdout.join('\n'), stderr.join('\n'), lintableFiles);

  return {
    tool: 'eslint',
    success: exitCode === 0,
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    filesProcessed: lintableFiles,
    issues
  };
}

/**
 * Parse Prettier output into structured issues
 */
function parsePrettierOutput(stdout: string, stderr: string, files: string[]): FormattedIssue[] {
  const issues: FormattedIssue[] = [];

  // Prettier --check returns:
  // - Nothing if all files are formatted
  // - List of unformatted files if any are unformatted
  const output = stdout + stderr;

  // Match file paths in output that need formatting
  const filePaths = files.map(f => relative(process.cwd(), f));
  const unformattedFiles: string[] = [];

  for (const line of output.split('\n')) {
    for (const filePath of filePaths) {
      if (line.includes(filePath) || line.includes(filePath.replace(/\\/g, '/'))) {
        unformattedFiles.push(filePath);
      }
    }
  }

  // Also check for "checking formatting..." output
  const checkPattern = /^\s*(.+?)\s+needs formatting$/gm;
  let match;
  while ((match = checkPattern.exec(output)) !== null) {
    const filePath = match[1].trim();
    issues.push({
      tool: 'prettier',
      severity: 'warning',
      file: filePath,
      message: 'File is not formatted according to Prettier rules',
      rule: 'prettier'
    });
  }

  // If there's output but no specific files matched, report general issue
  if (output.trim() && issues.length === 0) {
    issues.push({
      tool: 'prettier',
      severity: 'warning',
      file: '',
      message: output.trim().substring(0, 500),
      rule: 'prettier'
    });
  }

  return issues;
}

/**
 * Parse ESLint output into structured issues
 */
function parseEslintOutput(stdout: string, stderr: string, files: string[]): FormattedIssue[] {
  const issues: FormattedIssue[] = [];
  const output = stdout + stderr;

  // ESLint output format: file:line:column: message (rule)
  // Example: src/app.ts:10:5: Unexpected console.log (no-console)
  const eslintPattern = /^(.+?):(\d+):(\d+):\s*(.+?)\s+\(([^)]+)\)$/gm;

  let match;
  const matchedFiles = new Set<string>();

  while ((match = eslintPattern.exec(output)) !== null) {
    const [, file, line, column, message, rule] = match;
    matchedFiles.add(file);

    // Determine severity based on ESLint output prefix
    const severity: 'error' | 'warning' | 'info' =
      message.startsWith('error') ? 'error' :
      message.startsWith('warning') ? 'warning' : 'info';

    issues.push({
      tool: 'eslint',
      severity: severity === 'error' ? 'error' : 'warning',
      file,
      line: parseInt(line, 10),
      column: parseInt(column, 10),
      message: message.trim(),
      rule
    });
  }

  // Also try to match simple error lines without rule
  const simpleErrorPattern = /^(.+?):(\d+):(\d+):\s*(.+)$/gm;
  while ((match = simpleErrorPattern.exec(output)) !== null) {
    const [, file, line, column, message] = match;

    // Skip if already matched by the detailed pattern
    if (!matchedFiles.has(file)) {
      issues.push({
        tool: 'eslint',
        severity: message.startsWith('error') ? 'error' : 'warning',
        file,
        line: parseInt(line, 10),
        column: parseInt(column, 10),
        message: message.trim()
      });
    }
  }

  return issues;
}

/**
 * Run formatting guardrails (Prettier + ESLint) on files in target path
 *
 * This function executes local Prettier and ESLint binaries via npx
 * on files modified by AI agents. It captures stdout/stderr and returns
 * a diagnostic object instead of throwing errors.
 *
 * @param targetPath - Path to directory or file to check
 * @param config - Optional configuration
 * @returns FormatterDiagnostic with results from both tools
 */
export async function runFormattingGuardrails(
  targetPath: string,
  config?: FormatterHookConfig
): Promise<FormatterDiagnostic> {
  const {
    runPrettier = true,
    runEslint = true,
    extensions = SUPPORTED_EXTENSIONS,
    timeout = 60000,
    cwd = targetPath
  } = config || {};

  // Verify target path exists
  let targetStat;
  try {
    targetStat = await stat(targetPath);
  } catch {
    return {
      success: false,
      targetPath,
      filesChecked: [],
      combinedIssues: [{
        tool: 'prettier',
        severity: 'error',
        file: targetPath,
        message: `Target path does not exist: ${targetPath}`
      }],
      timestamp: new Date().toISOString()
    };
  }

  // Find all files to process
  let filesToCheck: string[];

  if (targetStat.isFile()) {
    filesToCheck = [targetPath];
  } else {
    filesToCheck = await findFiles(targetPath, extensions);
  }

  // If no files found, return early
  if (filesToCheck.length === 0) {
    return {
      success: true,
      targetPath,
      filesChecked: [],
      combinedIssues: [],
      timestamp: new Date().toISOString()
    };
  }

  const runPrettierCheck = runPrettier;
  const runEslintCheck = runEslint;

  // Execute tools in parallel
  const results = await Promise.all([
    runPrettierCheck ? runPrettier(filesToCheck, cwd, timeout) : Promise.resolve(undefined),
    runEslintCheck ? runEslint(filesToCheck, cwd, timeout) : Promise.resolve(undefined)
  ]);

  const prettierResult = results[0];
  const eslintResult = results[1];

  // Combine all issues
  const allIssues: FormattedIssue[] = [];
  if (prettierResult) allIssues.push(...prettierResult.issues);
  if (eslintResult) allIssues.push(...eslintResult.issues);

  // Determine overall success (both tools must succeed)
  const prettierSuccess = !prettierResult || prettierResult.success;
  const eslintSuccess = !eslintResult || eslintResult.success;
  const overallSuccess = prettierSuccess && eslintSuccess;

  return {
    success: overallSuccess,
    targetPath,
    filesChecked: filesToCheck.map(f => relative(cwd, f)),
    prettier: prettierResult,
    eslint: eslintResult,
    combinedIssues: allIssues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if a specific file needs formatting
 *
 * @param filePath - Path to file to check
 * @returns Promise<boolean> - true if file passes all checks
 */
export async function checkFileFormatting(filePath: string): Promise<boolean> {
  const result = await runFormattingGuardrails(filePath);
  return result.success;
}

/**
 * Get formatted summary of issues
 *
 * @param diagnostic - FormatterDiagnostic to summarize
 * @returns Human-readable summary string
 */
export function formatDiagnosticSummary(diagnostic: FormatterDiagnostic): string {
  const lines: string[] = [];

  lines.push(`Formatting Guardrails Results for: ${diagnostic.targetPath}`);
  lines.push(`Files checked: ${diagnostic.filesChecked.length}`);
  lines.push(`Overall: ${diagnostic.success ? 'PASSED' : 'FAILED'}`);
  lines.push('');

  if (diagnostic.prettier) {
    lines.push(`Prettier: ${diagnostic.prettier.success ? 'OK' : 'ISSUES FOUND'}`);
    if (diagnostic.prettier.issues.length > 0) {
      for (const issue of diagnostic.prettier.issues) {
        lines.push(`  - ${issue.file}: ${issue.message}`);
      }
    }
  }

  if (diagnostic.eslint) {
    lines.push(`ESLint: ${diagnostic.eslint.success ? 'OK' : 'ISSUES FOUND'}`);
    if (diagnostic.eslint.issues.length > 0) {
      for (const issue of diagnostic.eslint.issues) {
        const location = issue.line ? `:${issue.line}:${issue.column}` : '';
        lines.push(`  - ${issue.file}${location}: ${issue.message} (${issue.rule || 'unknown'})`);
      }
    }
  }

  return lines.join('\n');
}
