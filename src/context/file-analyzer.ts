// File Analyzer - Static file structure analysis
// Generates lightweight file signatures without using LLM

/**
 * File types supported
 */
export type FileType = 'code' | 'text' | 'binary' | 'unknown';

/**
 * Code structure information
 */
export interface CodeStructure {
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  interfaces: string[];
  types: string[];
  lineCount: number;
}

/**
 * Detect file type from extension
 */
export function detectFileType(filePath: string): FileType {
  const ext = filePath.toLowerCase().split('.').pop() || '';

  const codeExtensions = [
    'ts', 'js', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'java', 'cpp', 'c', 'h', 'hpp',
    'go', 'rs', 'rb', 'php', 'cs', 'swift', 'kt',
    'scala', 'hs', 'ml', 'clj', 'ex', 'exs',
    'vue', 'svelte', 'astro'
  ];

  const textExtensions = [
    'md', 'txt', 'json', 'yaml', 'yml', 'xml',
    'html', 'css', 'scss', 'sass', 'less',
    'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat',
    'toml', 'ini', 'cfg', 'conf', 'env'
  ];

  const binaryExtensions = [
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
    'mp3', 'wav', 'ogg', 'mp4', 'avi', 'mov', 'webm',
    'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
    'exe', 'dll', 'so', 'dylib', 'bin'
  ];

  if (codeExtensions.includes(ext)) return 'code';
  if (textExtensions.includes(ext)) return 'text';
  if (binaryExtensions.includes(ext)) return 'binary';

  return 'unknown';
}

/**
 * Extract imports from code (supports TypeScript/JavaScript)
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES6 imports: import x from 'y' or import { x } from 'y'
  const es6Regex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Regex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS: require('x')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Extract exports from code
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Named exports: export const x = ... or export function x
  const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Default export: export default x
  const defaultExportRegex = /export\s+default\s+(\w+)/g;
  while ((match = defaultExportRegex.exec(content)) !== null) {
    exports.push(`default:${match[1]}`);
  }

  return exports;
}

/**
 * Extract function declarations
 */
function extractFunctions(content: string): string[] {
  const functions: string[] = [];

  // Regular functions: function name(...)
  const funcRegex = /(?:^|\n)\s*function\s+(\w+)/gm;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Arrow functions: const name = (...) => or const name = function(...)
  const arrowRegex = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/gm;
  while ((match = arrowRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Methods in classes: methodName(...)
  const methodRegex = /(?:^|\n)\s{2,}(\w+)\s*\([^)]*\)\s*[:{]/gm;
  while ((match = methodRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  return functions;
}

/**
 * Extract class declarations
 */
function extractClasses(content: string): string[] {
  const classes: string[] = [];

  // class Name extends ...
  const classRegex = /class\s+(\w+)/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Extract interface declarations
 */
function extractInterfaces(content: string): string[] {
  const interfaces: string[] = [];

  // interface Name { ...
  const interfaceRegex = /interface\s+(\w+)/g;
  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    interfaces.push(match[1]);
  }

  return interfaces;
}

/**
 * Extract type declarations
 */
function extractTypes(content: string): string[] {
  const types: string[] = [];

  // type Name = ...
  const typeRegex = /type\s+(\w+)/g;
  let match;
  while ((match = typeRegex.exec(content)) !== null) {
    types.push(match[1]);
  }

  return types;
}

/**
 * Generate static code structure without LLM
 */
export function analyzeFileStructure(content: string, filePath: string): string {
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Extract code elements
  const imports = extractImports(content);
  const exports = extractExports(content);
  const functions = extractFunctions(content);
  const classes = extractClasses(content);
  const interfaces = extractInterfaces(content);
  const types = extractTypes(content);

  // Build static signature
  const parts: string[] = [];

  parts.push(`📄 File: ${filePath}`);
  parts.push(`📊 Lines: ${lineCount}`);

  if (imports.length > 0) {
    parts.push(`\n📥 Imports (${imports.length}):`);
    // Show first 5 imports
    imports.slice(0, 5).forEach(imp => parts.push(`  - ${imp}`));
    if (imports.length > 5) {
      parts.push(`  ... and ${imports.length - 5} more`);
    }
  }

  if (classes.length > 0) {
    parts.push(`\n🏷️ Classes: ${classes.join(', ')}`);
  }

  if (interfaces.length > 0) {
    parts.push(`\n🔷 Interfaces: ${interfaces.join(', ')}`);
  }

  if (types.length > 0) {
    parts.push(`\n📝 Types: ${types.join(', ')}`);
  }

  if (functions.length > 0) {
    parts.push(`\n⚡ Functions (${functions.length}):`);
    // Show first 10 functions
    functions.slice(0, 10).forEach(fn => parts.push(`  - ${fn}()`));
    if (functions.length > 10) {
      parts.push(`  ... and ${functions.length - 10} more`);
    }
  }

  if (exports.length > 0) {
    parts.push(`\n📤 Exports: ${exports.join(', ')}`);
  }

  // Add first few non-empty lines as code preview
  const nonEmptyLines = lines.filter(l => l.trim().length > 0).slice(0, 5);
  if (nonEmptyLines.length > 0) {
    parts.push(`\n🔍 Code Preview:`);
    nonEmptyLines.forEach(line => parts.push(`  ${line.substring(0, 80)}`));
  }

  return parts.join('\n');
}

/**
 * Generate text preview (first N characters)
 */
export function analyzeTextPreview(content: string, maxChars: number = 500): string {
  const preview = content.substring(0, maxChars);
  const truncated = content.length > maxChars;

  let result = `📄 Text Preview (first ${maxChars} chars):\n\n${preview}`;

  if (truncated) {
    result += `\n\n... [${content.length - maxChars} more characters]`;
  }

  // Add line count info
  const lineCount = content.split('\n').length;
  result += `\n\n📊 Total lines: ${lineCount}`;

  return result;
}

/**
 * Generate complete code structure object
 */
export function generateCodeStructure(content: string): CodeStructure {
  return {
    imports: extractImports(content),
    exports: extractExports(content),
    functions: extractFunctions(content),
    classes: extractClasses(content),
    interfaces: extractInterfaces(content),
    types: extractTypes(content),
    lineCount: content.split('\n').length
  };
}

export default {
  detectFileType,
  analyzeFileStructure,
  analyzeTextPreview,
  generateCodeStructure
};
