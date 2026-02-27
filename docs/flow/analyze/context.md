# Análise de Domínio: Context

## Visão Geral
Módulo central de gerenciamento de contexto com múltiplas estratégias de compressão, agregação e otimização. É o coração do vibe-flow para lidar com límites de context window.

## Arquivos (29 arquivos)

### Core Context
| Arquivo | Descrição |
|---------|------------|
| `src/context/index.ts` | Exports principais (190 linhas) |
| `src/context/context-manager.ts` | Gerenciador principal de contexto |
| `src/context/context-aggregation.ts` | Agregação de contexto |

### Compression & Compaction
| Arquivo | Descrição |
|---------|------------|
| `src/context/compression.ts` | Compressão lossless de logs |
| `src/context/compaction.ts` | Compactação de mensagens |
| `src/context/compaction-limits.ts` | Limites por nível de escalação |
| `src/context/pruner.ts` | Poda de ferramentas obsoletas |
| `src/context/pruning.ts` | Limpeza agressiva (active window) |

### Summarization
| Arquivo | Descrição |
|---------|------------|
| `src/context/summarizer.ts` | Sumarização via LLM |
| `src/context/dag-summary.ts` | Sistema DAG hierárquico |
| `src/context/summary-types.ts` | Tipos para sumários |
| `src/context/context-summarizer.ts` | Sumarização (context-engine) |

### Escalation System
| Arquivo | Descrição |
|---------|------------|
| `src/context/escalation.ts` | Three-Level Escalation (LCM pattern) |
| `src/context/hierarchical.ts` | Hierarchical Context Manager |

### Storage
| Arquivo | Descrição |
|---------|------------|
| `src/context/store.ts` | ImmutableStore |
| `src/context/immutable-logger.ts` | ImmutableLogger |

### Utilities
| Arquivo | Descrição |
|---------|------------|
| `src/context/file-pointers.ts` | Large file injection |
| `src/context/file-analyzer.ts` | Static file analysis |
| `src/context/context-aware-prompt.ts` | Prompt contextual |
| `src/context/active-window.ts` | Middleware de limpeza |
| `src/context/context-pruner.ts` | Context Editor |
| `src/context/subagent-isolator.ts` | Sub-agent sandbox |
| `src/context/worker.ts` | Worker thread |
| `src/context/worker-wrapper.ts` | Async compression wrapper |

### Operators
| Arquivo | Descrição |
|---------|------------|
| `src/context/operators/llm-map.ts` | LLM map operator |
| `src/context/operators/types.ts` | Operator types |

## Interfaces Públicas

### ContextManager
```typescript
class ContextManager {
  getOptimizedContext(messages: Message[]): OptimizedContextResult
  addMessage(msg: Message): void
  compress(): Promise<void>
  pruneStale(): void
}
```

### HierarchicalContextManager
```typescript
class HierarchicalContextManager {
  compact(context: Message[]): Promise<HierarchicalCompactedContextResult>
  expand(nodeId: string): Promise<HierarchicalExpandNodeResult>
  getSummary(): HierarchicalSummaryNode
}
```

### ImmutableStore
```typescript
class ImmutableStore<T> {
  get(key: string): T | undefined
  set(key: string, value: T): ImmutableTransaction
  commit(): Promise<void>
  search(query: SearchOptions): SearchResult[]
}
```

## Padrões Detectados

1. **LCM (Large Context Management)**: Three-level escalation pattern
2. **DAG-based Summaries**: Hierarchical summaries with provenance tracking
3. **Immutable Data Structures**: Store and Logger usam imutabilidade
4. **Worker Threads**: CPU-intensive tasks em threads separadas
5. **Pointer-based Storage**: Arquivos grandes usam ponteiros em vez de conteúdo inline

## Dependências Externas
- `uuid` - IDs únicos
- `worker_threads` - Worker threads native

## Gargalos

1. **Complexidade alta**: Múltiplos sistemas de compressão sobrepostos
2. **API inconsistente**: Alguns módulos duplicam funcionalidade
3. **Testes frágeis**: Dependencies em LLM para tests de summarization

## Métricas
- **Arquivos**: 29 (context + context-engine)
- **Exportações**: 100+ tipos e funções
- **Complexidade**: Alta (múltiplos padrões)
