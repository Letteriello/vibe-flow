/**
 * RAG Metadata Tagger
 *
 * Provides ontological tagging for session summaries to enable
 * contextual memory routing in Vibe Flow sessions.
 */

export interface RAGMetadata {
  domain: string[];
  object: string[];
  actions: string[];
  confidence: number;
  tags: string[];
}

export type DomainKeyword = 'frontend' | 'backend' | 'devops' | 'security' | 'data' | 'testing' | 'docs' | 'config';
export type ObjectKeyword = 'componente' | 'endpoint' | 'database' | 'service' | 'config' | 'test' | 'interface' | 'type' | 'schema' | 'pipeline' | 'workflow' | 'memory' | 'context' | 'agent' | 'tool';
export type ActionKeyword = 'create' | 'read' | 'update' | 'delete' | 'validate' | 'scan' | 'compress' | 'route' | 'track' | 'analyze' | 'implement' | 'fix' | 'refactor' | 'test' | 'build' | 'deploy' | 'configure' | 'optimize' | 'monitor' | 'protect' | 'recover';

interface KeywordMapping {
  domain: Record<string, string[]>;
  object: Record<string, string[]>;
  actions: Record<string, string[]>;
}

export class OntologyMetadataTagger {
  private keywordMappings: KeywordMapping;

  constructor(keywordMappings?: Partial<KeywordMapping>) {
    this.keywordMappings = {
      domain: {
        frontend: ['react', 'vue', 'angular', 'ui', 'component', 'style', 'css', 'html', 'browser', 'frontend', 'client'],
        backend: ['api', 'server', 'express', 'fastify', 'route', 'endpoint', 'controller', 'service', 'backend', 'database'],
        devops: ['docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'deploy', 'infrastructure', 'automation', 'devops'],
        security: ['auth', 'security', 'token', 'secret', 'encryption', 'permission', 'access', 'vulnerability', 'scan'],
        data: ['database', 'sql', 'nosql', 'cache', 'storage', 'query', 'migration', 'schema', 'model'],
        testing: ['test', 'jest', 'mocha', 'coverage', 'unit', 'integration', 'e2e', 'mock', 'fixture'],
        docs: ['readme', 'documentation', 'comment', 'doc', 'guide', 'tutorial', 'changelog'],
        config: ['config', 'configuration', 'env', 'setting', 'option', 'flag', 'package.json', 'tsconfig'],
      },
      object: {
        componente: ['component', 'widget', 'element', 'ui', 'button', 'input', 'form', 'modal', 'card'],
        endpoint: ['endpoint', 'route', 'api', 'handler', 'controller', 'GET', 'POST', 'PUT', 'DELETE'],
        database: ['database', 'table', 'collection', 'index', 'query', 'migration', 'schema', 'model', 'entity'],
        service: ['service', 'manager', 'provider', 'handler', 'worker', 'queue', 'job'],
        config: ['config', 'configuration', 'settings', 'options', 'env', 'variable'],
        test: ['test', 'spec', 'fixture', 'mock', 'stub', 'assertion', 'suite'],
        interface: ['interface', 'type', 'class', 'enum', 'abstract', 'implements'],
        type: ['type', 'interface', 'typedef', 'schema', 'structure'],
        schema: ['schema', 'model', 'structure', 'definition', 'validation'],
        pipeline: ['pipeline', 'workflow', 'job', 'task', 'stage', 'step', 'ci', 'cd'],
        workflow: ['workflow', 'flow', 'process', 'automation', 'sequence'],
        memory: ['memory', 'store', 'cache', 'session', 'context', 'state'],
        context: ['context', 'state', 'payload', 'message', 'conversation'],
        agent: ['agent', 'driver', 'router', 'executor', 'worker'],
        tool: ['tool', 'function', 'utility', 'helper', 'library', 'module'],
      },
      actions: {
        create: ['create', 'new', 'add', 'insert', 'generate', 'make'],
        read: ['read', 'get', 'fetch', 'load', 'retrieve', 'find', 'search', 'query'],
        update: ['update', 'edit', 'modify', 'change', 'alter', 'patch'],
        delete: ['delete', 'remove', 'drop', 'clear', 'purge'],
        validate: ['validate', 'verify', 'check', 'ensure', 'assert', 'test'],
        scan: ['scan', 'detect', 'find', 'search', 'analyze', 'inspect'],
        compress: ['compress', 'reduce', 'optimize', 'minify', 'truncate'],
        route: ['route', 'direct', 'forward', 'redirect', 'route'],
        track: ['track', 'monitor', 'log', 'measure', 'telemetry'],
        analyze: ['analyze', 'evaluate', 'assess', 'review', 'examine'],
        implement: ['implement', 'add', 'introduce', 'integrate', 'enable'],
        fix: ['fix', 'bug', 'issue', 'error', 'problem', 'solve', 'resolve'],
        refactor: ['refactor', 'restructure', 'reorganize', 'improve', 'clean'],
        test: ['test', 'spec', 'mock', 'stub', 'assert', 'verify'],
        build: ['build', 'compile', 'bundle', 'package', 'create'],
        deploy: ['deploy', 'release', 'publish', 'push', 'ship'],
        configure: ['configure', 'setup', 'init', 'install', 'prepare'],
        optimize: ['optimize', 'improve', 'enhance', 'performance', 'speed'],
        monitor: ['monitor', 'watch', 'observe', 'track', 'log'],
        protect: ['protect', 'secure', 'encrypt', 'sanitize', 'escape'],
        recover: ['recover', 'restore', 'rollback', 'revert', 'undo'],
      },
      ...keywordMappings,
    };
  }

  /**
   * Analyzes a summary text and extracts RAG metadata
   * by matching against predefined keyword patterns.
   */
  tagSummary(summary: string): RAGMetadata {
    const normalizedSummary = summary.toLowerCase();
    const words = normalizedSummary.split(/\s+/);

    const domain = this.extractMatches(normalizedSummary, words, this.keywordMappings.domain);
    const object = this.extractMatches(normalizedSummary, words, this.keywordMappings.object);
    const actions = this.extractMatches(normalizedSummary, words, this.keywordMappings.actions);

    const allTags = [...domain, ...object, ...actions];
    const confidence = this.calculateConfidence(allTags.length);

    return {
      domain,
      object,
      actions,
      confidence,
      tags: Array.from(new Set(allTags)),
    };
  }

  /**
   * Extract matching keywords from text against category mappings
   */
  private extractMatches(
    normalizedSummary: string,
    words: string[],
    categoryMapping: Record<string, string[]>
  ): string[] {
    const matches = new Set<string>();

    for (const [category, keywords] of Object.entries(categoryMapping)) {
      for (const keyword of keywords) {
        if (normalizedSummary.includes(keyword.toLowerCase())) {
          matches.add(category);
          break;
        }
      }
    }

    return Array.from(matches);
  }

  /**
   * Calculate confidence based on number of matched tags
   * More matches = higher confidence
   */
  private calculateConfidence(matchCount: number): number {
    if (matchCount === 0) return 0.1;
    if (matchCount <= 2) return 0.3;
    if (matchCount <= 4) return 0.5;
    if (matchCount <= 6) return 0.7;
    if (matchCount <= 8) return 0.85;
    return 0.95;
  }

  /**
   * Allow injection of custom keyword mappings for extensibility
   */
  addKeywordMapping(
    category: 'domain' | 'object' | 'actions',
    categoryName: string,
    keywords: string[]
  ): void {
    const cat = this.keywordMappings[category];
    if (!cat[categoryName]) {
      cat[categoryName] = [];
    }
    for (const kw of keywords) {
      cat[categoryName].push(kw);
    }
  }
}
