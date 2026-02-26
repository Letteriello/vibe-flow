/**
 * Knowledge Graph Compiler
 *
 * Inspired by STELE (Self-improving Tailorable Learning Environment)
 * Extracts structured nodes (functions, classes, modules) and edges
 * (depends_on, modifies, tests) from session file changes
 */

export type NodeType = 'function' | 'class' | 'module' | 'interface' | 'variable';
export type EdgeType = 'depends_on' | 'modifies' | 'tests' | 'imports' | 'exports';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  file: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export interface LocalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    sessionId: string;
    timestamp: string;
    fileCount: number;
  };
}

export interface FileChange {
  filename: string;
  diff: string;
  content?: string;
  status: 'added' | 'modified' | 'deleted';
}

export interface SessionData {
  sessionId: string;
  timestamp?: string;
  changes: FileChange[];
  [key: string]: unknown;
}

interface ExtractedEntity {
  name: string;
  type: NodeType;
  line: number;
}

export class KnowledgeGraphCompiler {
  private nodeMap: Map<string, GraphNode>;
  private edgeSet: Set<string>;

  constructor() {
    this.nodeMap = new Map<string, GraphNode>();
    this.edgeSet = new Set<string>();
  }

  /**
   * Main entry point: compiles session data into a LocalGraph
   */
  compileSessionGraph(sessionData: SessionData): LocalGraph {
    this.nodeMap.clear();
    this.edgeSet.clear();

    const { sessionId, timestamp, changes } = sessionData;

    for (const fileChange of changes) {
      this.processFileChange(fileChange);
    }

    const nodes = Array.from(this.nodeMap.values());
    const edges = this.extractEdges();

    return {
      nodes,
      edges,
      metadata: {
        sessionId,
        timestamp: timestamp ?? new Date().toISOString(),
        fileCount: changes.length,
      },
    };
  }

  /**
   * Process a single file change and extract entities
   */
  private processFileChange(fileChange: FileChange): void {
    const { filename, diff, status } = fileChange;

    if (status === 'deleted') {
      return;
    }

    const entities = this.extractEntitiesFromDiff(diff, filename);
    const moduleName = this.getModuleName(filename);

    for (const entity of entities) {
      const nodeId = this.generateNodeId(filename, entity.name, entity.type);

      if (!this.nodeMap.has(nodeId)) {
        this.nodeMap.set(nodeId, {
          id: nodeId,
          type: entity.type,
          name: entity.name,
          file: filename,
          line: entity.line,
          metadata: {
            status,
            module: moduleName,
          },
        });
      }

      if (entity.type === 'class' || entity.type === 'function') {
        this.addImportedDependencies(entity, filename);
      }
    }

    if (status === 'added') {
      this.addModuleNode(filename, moduleName);
    }

    this.detectTestRelationships(filename, entities);
  }

  /**
   * Extract entities (functions, classes, etc.) from diff text
   */
  private extractEntitiesFromDiff(diff: string, filename: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    const lines = diff.split('\n');
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;

      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)/);
        if (match) {
          lineNumber = parseInt(match[1], 10);
        }
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedContent = line.substring(1).trim();

        const functionMatch = addedContent.match(/^(?:async\s+)?(?:export\s+)?function\s+(\w+)/);
        if (functionMatch) {
          entities.push({
            name: functionMatch[1],
            type: 'function',
            line: lineNumber,
          });
          continue;
        }

        const classMatch = addedContent.match(/^(?:export\s+)?class\s+(\w+)/);
        if (classMatch) {
          entities.push({
            name: classMatch[1],
            type: 'class',
            line: lineNumber,
          });
          continue;
        }

        const interfaceMatch = addedContent.match(/^(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) {
          entities.push({
            name: interfaceMatch[1],
            type: 'interface',
            line: lineNumber,
          });
          continue;
        }

        const constMatch = addedContent.match(/^(?:export\s+)?const\s+(\w+)\s*=/);
        if (constMatch) {
          entities.push({
            name: constMatch[1],
            type: 'variable',
            line: lineNumber,
          });
          continue;
        }

        const letMatch = addedContent.match(/^(?:export\s+)?let\s+(\w+)\s*=/);
        if (letMatch) {
          entities.push({
            name: letMatch[1],
            type: 'variable',
            line: lineNumber,
          });
          continue;
        }
      }
    }

    return entities;
  }

  /**
   * Add module-level node
   */
  private addModuleNode(filename: string, moduleName: string): void {
    const nodeId = `module:${filename}`;

    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        id: nodeId,
        type: 'module',
        name: moduleName,
        file: filename,
        metadata: {},
      });
    }
  }

  /**
   * Detect import/dependency relationships
   */
  private addImportedDependencies(entity: ExtractedEntity, filename: string): void {
    const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
    const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;

    const diffContent = this.getDiffContent(filename);
    let match: RegExpExecArray | null;

    const patterns = [importRegex, requireRegex];

    for (const regex of patterns) {
      while ((match = regex.exec(diffContent)) !== null) {
        const importPath = match[1];
        const edgeId = this.generateEdgeId(
          `${entity.type}:${entity.name}`,
          'imports',
          `module:${importPath}`
        );

        if (!this.edgeSet.has(edgeId)) {
          this.edgeSet.add(edgeId);
        }
      }
    }
  }

  /**
   * Detect test relationships (file tests another)
   */
  private detectTestRelationships(filename: string, entities: ExtractedEntity[]): void {
    const isTestFile = filename.includes('.test.') ||
                       filename.includes('.spec.') ||
                       filename.includes('__tests__');

    if (!isTestFile) {
      return;
    }

    const testedModule = this.inferTestTarget(filename);

    if (testedModule) {
      for (const entity of entities) {
        if (entity.type === 'function' || entity.type === 'class') {
          const edgeId = this.generateEdgeId(
            `${entity.type}:${entity.name}`,
            'tests',
            `module:${testedModule}`
          );

          if (!this.edgeSet.has(edgeId)) {
            this.edgeSet.add(edgeId);
          }
        }
      }
    }
  }

  /**
   * Infer the target module being tested
   */
  private inferTestTarget(testFilename: string): string | null {
    let target = testFilename
      .replace(/\.test\.(ts|js|tsx|jsx)$/, '')
      .replace(/\.spec\.(ts|js|tsx|jsx)$/, '')
      .replace(/__tests__\//, '');

    return target || null;
  }

  /**
   * Extract edges from the edge set
   */
  private extractEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const edgeKey of this.edgeSet) {
      const parts = edgeKey.split('|');
      if (parts.length >= 4) {
        edges.push({
          id: edgeKey,
          type: parts[1] as EdgeType,
          source: parts[0],
          target: parts[2],
        });
      }
    }

    return edges;
  }

  /**
   * Get diff content (placeholder - would need to store diffs internally)
   */
  private getDiffContent(_filename: string): string {
    return '';
  }

  /**
   * Generate a unique node ID
   */
  private generateNodeId(file: string, name: string, type: NodeType): string {
    return `${type}:${file}#${name}`;
  }

  /**
   * Generate a unique edge ID
   */
  private generateEdgeId(source: string, edgeType: EdgeType, target: string): string {
    return `${source}|${edgeType}|${target}`;
  }

  /**
   * Extract module name from file path
   */
  private getModuleName(filename: string): string {
    const parts = filename.replace(/\\/g, '/').split('/');
    const basename = parts[parts.length - 1];
    return basename.replace(/\.(ts|js|tsx|jsx)$/, '');
  }
}
