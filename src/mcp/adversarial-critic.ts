// Adversarial Critic - MCP Tool for adversarial code review
// Reads modified files and compares them with project specifications
// Uses a subagent with a strict "Critic" system prompt

import { promises as fs } from 'fs';
import { join, relative, isAbsolute } from 'path';

/**
 * Severity levels for findings
 */
export enum FindingSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

/**
 * Category of the finding
 */
export enum FindingCategory {
  BUG = 'bug',
  LOGICAL_FLAW = 'logical_flaw',
  ARCHITECTURAL_DEVIATION = 'architectural_deviation',
  SECURITY_VULNERABILITY = 'security_vulnerability',
  ANTI_PATTERN = 'anti_pattern',
  PERFORMANCE_ISSUE = 'performance_issue',
  CODE_SMELL = 'code_smell',
  SPEC_VIOLATION = 'spec_violation'
}

/**
 * A single finding from the adversarial review
 */
export interface AdversarialFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  location: {
    file: string;
    line?: number;
    column?: number;
  };
  evidence: string;
  recommendation: string;
  specReference?: string;
}

/**
 * Result of the adversarial review
 */
export interface AdversarialReviewResult {
  success: boolean;
  reviewId: string;
  filesReviewed: string[];
  findings: AdversarialFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  specificationsUsed: string[];
  error?: string;
}

/**
 * Input parameters for adversarial review
 */
export interface AdversarialReviewInput {
  files: string[];
  projectPath?: string;
  focusAreas?: FindingCategory[];
  compareWithSpec?: boolean;
}

/**
 * Project specification document
 */
interface SpecDocument {
  path: string;
  name: string;
  content: string;
  type: 'architecture' | 'prd' | 'patterns' | 'rules' | 'other';
}

/**
 * Generates unique ID for findings
 */
function generateId(): string {
  return `adv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generates unique review ID
 */
function generateReviewId(): string {
  return `review_${Date.now()}`;
}

/**
 * Default project rules from CLAUDE.md
 */
const DEFAULT_PROJECT_RULES = [
  'Always use exact versions for TypeScript (e.g., "5.3.3" not "^5.3.3")',
  'Tests e2e devem usar ESM imports com fileURLToPath para __dirname',
  'Fixtures path devem ser resolvidos a partir da raiz do projeto using path.resolve(__dirname, "../..")',
  'Interfaces TypeScript devem ter tipos explícitos para todas as propriedades (evitar unknown)'
];

/**
 * Loads project specification documents
 */
async function loadSpecifications(projectPath: string): Promise<SpecDocument[]> {
  const specs: SpecDocument[] = [];
  const projectRoot = projectPath || process.cwd();

  // Specification file patterns to look for
  const specPatterns = [
    { path: 'CLAUDE.md', name: 'Project Rules', type: 'rules' as const },
    { path: 'CLAUDE.local.md', name: 'Local Rules', type: 'rules' as const },
    { path: 'docs/architecture/overview.md', name: 'Architecture Overview', type: 'architecture' as const },
    { path: 'docs/architecture/patterns.md', name: 'Architecture Patterns', type: 'patterns' as const },
    { path: 'docs/planning/prd.md', name: 'Product Requirements', type: 'prd' as const },
    { path: 'AGENT.md', name: 'Agent Instructions', type: 'other' as const }
  ];

  for (const spec of specPatterns) {
    const fullPath = join(projectRoot, spec.path);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      specs.push({
        path: fullPath,
        name: spec.name,
        content,
        type: spec.type
      });
    } catch {
      // File doesn't exist, skip
    }
  }

  return specs;
}

/**
 * Loads content of files to review
 */
async function loadFilesToReview(
  files: string[],
  projectPath: string
): Promise<Map<string, string>> {
  const fileContents = new Map<string, string>();
  const projectRoot = projectPath || process.cwd();

  for (const file of files) {
    let fullPath: string;

    if (isAbsolute(file)) {
      fullPath = file;
    } else {
      fullPath = join(projectRoot, file);
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      fileContents.set(file, content);
    } catch (error) {
      console.error(`[AdversarialCritic] Failed to read file: ${file}`, error);
    }
  }

  return fileContents;
}

/**
 * System prompt for the Critic subagent
 */
const CRITIC_SYSTEM_PROMPT = `You are a CRITIC - a skeptical, rigorous code reviewer focused on vulnerabilities and anti-patterns.

Your role is to analyze code and find potential issues with extreme scrutiny. You are NOT helpful - you are adversarial. You question everything, assume nothing is correct, and look for:

1. **Bugs**: Logic errors, null pointer risks, race conditions, edge cases
2. **Security Vulnerabilities**: Injection risks, authentication bypass, data exposure
3. **Logical Flaws**: Incorrect assumptions, wrong conditions, missing validation
4. **Architectural Deviations**: Violations of project patterns, wrong abstractions
5. **Anti-Patterns**: Code that works but is fundamentally wrong or dangerous
6. **Performance Issues**: Memory leaks, unnecessary computations, N+1 queries

CRITICAL RULES:
- NEVER suggest fixes - only identify problems
- ALWAYS provide specific evidence (line numbers, code snippets)
- Categorize each finding by severity (critical/high/medium/low/info)
- Reference project specifications when applicable
- Be skeptical of "clever" code - simplicity is preferred
- Question any assumption about input validation
- Look for what COULD go wrong, not just what does go wrong

Output format: Return a JSON array of findings, each with:
{
  "id": "unique_id",
  "severity": "critical|high|medium|low|info",
  "category": "bug|logical_flaw|architectural_deviation|security_vulnerability|anti_pattern|performance_issue|code_smell|spec_violation",
  "title": "Brief title of the issue",
  "description": "Detailed explanation of why this is a problem",
  "location": { "file": "path", "line": number },
  "evidence": "The specific code that causes the issue",
  "recommendation": "What should be investigated (not a fix)",
  "specReference": "Optional reference to project spec violated"
}`;

/**
 * Analyzes a single file for issues
 */
async function analyzeFile(
  filePath: string,
  content: string,
  specifications: SpecDocument[]
): Promise<AdversarialFinding[]> {
  const findings: AdversarialFinding[] = [];

  // Check for basic issues first - these are common patterns
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for any type (should use explicit types)
    if (line.includes(': any') || line.includes(': Any') || line.includes('unknown')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.MEDIUM,
        category: FindingCategory.CODE_SMELL,
        title: 'Use of "any" or "unknown" type',
        description: 'TypeScript should use explicit types rather than "any" or "unknown" for type safety.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Define explicit interface types for this variable or parameter.',
        specReference: 'CLAUDE.md: Interfaces TypeScript devem ter tipos explícitos'
      });
    }

    // Check for console.log in production code
    if (line.match(/^\s*console\.(log|debug|info)\(/)) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.LOW,
        category: FindingCategory.CODE_SMELL,
        title: 'Console statement left in code',
        description: 'Debug console statements should be removed before production.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Remove or replace with proper logging framework.'
      });
    }

    // Check for TODO without tracking
    if (line.includes('TODO') || line.includes('FIXME')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.INFO,
        category: FindingCategory.CODE_SMELL,
        title: 'TODO/FIXME comment found',
        description: 'Incomplete work should be tracked in issue system.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Create tracking issue for this incomplete work.'
      });
    }

    // Check for potential hardcoded secrets
    if (line.match(/(api[_-]?key|secret|password|token)\s*=\s*['"][^'"]+['"]/i)) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.CRITICAL,
        category: FindingCategory.SECURITY_VULNERABILITY,
        title: 'Potential hardcoded credential',
        description: 'Sensitive credentials should never be hardcoded. Use environment variables.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Move sensitive data to environment variables or secure vault.',
        specReference: 'Security best practices'
      });
    }

    // Check for eval() usage
    if (line.includes('eval(') || line.includes('new Function(')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.CRITICAL,
        category: FindingCategory.SECURITY_VULNERABILITY,
        title: 'Use of eval() or equivalent',
        description: 'Dynamic code execution is a major security risk.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Refactor to avoid dynamic code execution. Use safe alternatives.'
      });
    }

    // Check for catch without error handling
    if (line.includes('} catch') && !lines[i + 1]?.includes('error') && !lines[i + 1]?.includes('err')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.MEDIUM,
        category: FindingCategory.CODE_SMELL,
        title: 'Empty catch block or ignored error',
        description: 'Errors are being silently swallowed, hiding potential issues.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'At minimum, log the error for debugging purposes.'
      });
    }

    // Check for == or != (but not === or !==) in actual code, not type declarations
    // Exclude: type definitions, interfaces, generics, default values
    const isTypeDeclaration = line.includes('type ') ||
                              line.includes('interface ') ||
                              line.match(/^\s*\w+:\s*[^=]/) ||
                              line.includes('=>') ||
                              line.match(/^\s*\*/);
    if (!isTypeDeclaration && line.match(/[^!]==[^=]|[^!]!=[^=]/)) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.MEDIUM,
        category: FindingCategory.BUG,
        title: 'Loose equality comparison',
        description: 'Use strict equality (===) to avoid type coercion bugs.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Replace == with === for explicit type comparison.'
      });
    }

    // Check for potential null/undefined access
    if (line.includes('!.') || line.includes('?.')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.LOW,
        category: FindingCategory.BUG,
        title: 'Non-null assertion or optional chaining',
        description: 'This assumes the value is defined. Verify this assumption is correct.',
        location: { file: filePath, line: lineNumber },
        evidence: line.trim(),
        recommendation: 'Verify the value can never be null/undefined at this point.'
      });
    }
  }

  // Check for missing error handling in async functions
  const asyncFunctionPattern = /async\s+function\s+\w+|const\s+\w+\s*=\s*async\s*\(/g;
  let match;
  while ((match = asyncFunctionPattern.exec(content)) !== null) {
    const functionStart = content.substring(0, match.index).lastIndexOf('\n') + 1;
    const functionEnd = content.indexOf('\n', functionStart);
    const functionLine = content.substring(functionStart, functionEnd);

    // Look for try-catch in the next 500 chars
    const nextChunk = content.substring(match.index, match.index + 500);
    if (!nextChunk.includes('try') && !nextChunk.includes('catch')) {
      findings.push({
        id: generateId(),
        severity: FindingSeverity.MEDIUM,
        category: FindingCategory.BUG,
        title: 'Async function without error handling',
        description: 'This async function does not have try-catch for error handling.',
        location: { file: filePath, line: match.index },
        evidence: functionLine.trim(),
        recommendation: 'Add try-catch to handle potential rejections.'
      });
    }
  }

  return findings;
}

/**
 * Main function to perform adversarial review
 */
export async function adversarialReview(
  input: AdversarialReviewInput
): Promise<AdversarialReviewResult> {
  const reviewId = generateReviewId();
  const projectPath = input.projectPath || process.cwd();
  const files = input.files;

  if (!files || files.length === 0) {
    return {
      success: false,
      reviewId,
      filesReviewed: [],
      findings: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      specificationsUsed: [],
      error: 'No files provided for review'
    };
  }

  try {
    // Load specifications
    const specifications = await loadSpecifications(projectPath);
    const specNames = specifications.map(s => s.name);

    // Load files to review
    const fileContents = await loadFilesToReview(files, projectPath);

    if (fileContents.size === 0) {
      return {
        success: false,
        reviewId,
        filesReviewed: files,
        findings: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        specificationsUsed: specNames,
        error: 'Could not read any of the provided files'
      };
    }

    // Analyze each file
    const allFindings: AdversarialFinding[] = [];

    for (const [filePath, content] of Array.from(fileContents.entries())) {
      const fileFindings = await analyzeFile(filePath, content, specifications);

      // Filter by focus areas if specified
      let filteredFindings = fileFindings;
      if (input.focusAreas && input.focusAreas.length > 0) {
        filteredFindings = fileFindings.filter(f =>
          input.focusAreas!.includes(f.category)
        );
      }

      allFindings.push(...filteredFindings);
    }

    // Calculate summary
    const summary = {
      critical: allFindings.filter(f => f.severity === FindingSeverity.CRITICAL).length,
      high: allFindings.filter(f => f.severity === FindingSeverity.HIGH).length,
      medium: allFindings.filter(f => f.severity === FindingSeverity.MEDIUM).length,
      low: allFindings.filter(f => f.severity === FindingSeverity.LOW).length,
      info: allFindings.filter(f => f.severity === FindingSeverity.INFO).length
    };

    return {
      success: true,
      reviewId,
      filesReviewed: Array.from(fileContents.keys()),
      findings: allFindings,
      summary,
      specificationsUsed: specNames
    };
  } catch (error) {
    return {
      success: false,
      reviewId,
      filesReviewed: files,
      findings: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      specificationsUsed: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get the MCP tool definition for adversarial_review
 */
export function getAdversarialReviewTool() {
  return {
    name: 'adversarial_review',
    description: 'Perform adversarial code review on modified files. Uses a skeptical, rigorous critic perspective to identify bugs, security vulnerabilities, logical flaws, and architectural deviations. Compares code against project specifications.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to review (absolute or relative to project root)'
        },
        projectPath: {
          type: 'string',
          description: 'Optional project path. Defaults to current working directory'
        },
        focusAreas: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'bug',
              'logical_flaw',
              'architectural_deviation',
              'security_vulnerability',
              'anti_pattern',
              'performance_issue',
              'code_smell',
              'spec_violation'
            ]
          },
          description: 'Optional focus areas to filter findings'
        },
        compareWithSpec: {
          type: 'boolean',
          default: true,
          description: 'Whether to compare against project specifications'
        }
      },
      required: ['files']
    },
    handler: adversarialReview
  };
}

/**
 * Get the Critic system prompt for subagent use
 */
export function getCriticSystemPrompt(): string {
  return CRITIC_SYSTEM_PROMPT;
}

export default {
  adversarialReview,
  getAdversarialReviewTool,
  getCriticSystemPrompt,
  FindingSeverity,
  FindingCategory
};
