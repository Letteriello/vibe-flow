# Analise de Domnio: context-engine

## Arquivos (7)

| Arquivo | Tipo | Proposito | Exporta | Status |
|---------|------|-----------|---------|--------|
| `src/context-engine/index.ts` | Modulo de exportacao | Point of entry para o dominio | 6 exports principais | Ativo |
| `src/context-engine/types.ts` | Definicoes de tipos | Interfaces e tipos do dominio | 10+ tipos | Ativo |
| `src/context-engine/context-memory.ts` | Persistencia | Armazenamento de contexto entre sessoes | ContextMemory, createContextMemory, loadProjectContext, saveProjectContext | Ativo |
| `src/context-engine/context-categorizer.ts` | Categorizacao | Classificacao inteligente de entradas por tipo | ContextCategorizer, categorizeEntry | Ativo |
| `src/context-engine/context-summarizer.ts` | Compressao | Resumir contexto quando muito grande | ContextSummarizer, summarizeContext, needsSummarization | Ativo |
| `src/context-engine/file-indexer.ts` | Indexacao | Indexar arquivos do projeto para busca | FileIndexer, buildFileIndex, searchFiles | Ativo |
| `src/context-engine/decision-logger.ts` | Decisoes | Log de decisoes arquiteturais (ADR) | DecisionLogger, logDecision, searchDecisions | Ativo |

---

## Padroes Detectados

### 1. Convencoes de nomenclatura
- **Classes**: PascalCase (ex: `ContextMemory`, `FileIndexer`)
- **Funcoes helper**: camelCase (ex: `createContextMemory`, `searchFiles`)
- **Interfaces**: PascalCase com sufixo descritivo (ex: `ContextEntry`, `IndexedFile`, `DecisionRecord`)
- **Arquivos**: kebab-case (ex: `context-memory.ts`, `decision-logger.ts`)

### 2. Padrao de classes com metodos estaticos
- `ContextCategorizer`: Todos os metodos sao estaticos (design pattern utility)
- `ContextSummarizer`: Metodos de instancia + metodos estaticos

### 3. Conveniencia (factory functions)
Todos os modulos principais exportam funcoes de conveniencia:
```typescript
// context-memory.ts
export function createContextMemory(options: ContextOptions): ContextMemory
export async function loadProjectContext(projectPath, projectId)
export async function saveProjectContext(projectPath, projectId, entries)

// file-indexer.ts
export async function buildFileIndex(projectPath, projectId)
export function searchFiles(index, query)

// decision-logger.ts
export async function logDecision(projectPath, decision)
export function searchDecisions(decisions, query)

// context-summarizer.ts
export function summarizeContext(entries, maxEntries)
export function needsSummarization(entries, maxEntries)
```

### 4. Persistencia em arquivo JSON
- Todos os modulos salvam em `.bmad/context/`
- Estrutura: `{projectId}.json`, `decisions.json`, `file-index.json`

### 5. Logging com console.log/error
- Nao ha sistema de logging estruturado
- Logs no formato `[ModuleName] message`

### 6. Tratamento de erros silencioso
- Muitos metodos capturam erros e retornam arrays vazios ou null
- Exemplo em `file-indexer.ts`:
```typescript
} catch {
  // Skip directories that can't be read
}
```

---

## Interfaces Publicas

### Exports do modulo principal (`index.ts`)
```typescript
// Classes
export { ContextMemory } from './context-memory.js';
export { FileIndexer } from './file-indexer.js';
export { DecisionLogger } from './decision-logger.js';
export { ContextSummarizer } from './context-summarizer.js';

// Funcoes factory
export { createContextMemory, loadProjectContext, saveProjectContext } from './context-memory.js';
export { buildFileIndex, searchFiles } from './file-indexer.js';
export { logDecision, searchDecisions } from './decision-logger.js';
export { summarizeContext, needsSummarization } from './context-summarizer.js';

// Tipos
export type {
  ContextSnapshot,
  ContextEntry,
  FileIndex,
  IndexedFile,
  DecisionRecord,
  Summary,
  ContextOptions
} from './types.js';
```

### Tipos principais (types.ts)
- `ContextEntryType` - Union type: `'file' | 'decision' | 'artifact' | 'summary' | 'bash' | 'error' | 'bmad' | 'code' | 'userInput'`
- `EntryPriority` - Enum: CRITICAL(3), HIGH(2), MEDIUM(1), LOW(0)
- `ContextEntry` - Interface principal de entrada de contexto
- `ContextSnapshot` - Snapshot do contexto para persistencia
- `FileIndex` / `IndexedFile` - Indice de arquivos do projeto
- `DecisionRecord` - Registro de decisao arquitetural (formato ADR)
- `Summary` - Resumo comprimido de entradas
- `SlidingWindowConfig` - Configuracao para janela deslizante

---

## Dependencias Externas

### Dependencias internas do dominio
Nenhuma. O dominio e auto-contido.

### Pacotes npm externos
Nenhum. O dominio usa apenas modulos nativos do Node.js:
- `fs` (promises)
- `fs` (existsSync)
- `path` (join, dirname, extname)

### Verificacao de imports
```
context-memory.ts:  import { promises as fs } from 'fs'
                    import { join, dirname } from 'path'
                    import { existsSync } from 'fs'

decision-logger.ts: import { promises as fs } from 'fs'
                    import { join, dirname } from 'path'
                    import { existsSync } from 'fs'

file-indexer.ts:    import { promises as fs } from 'fs'
                    import { join, extname, dirname } from 'path'
                    import { existsSync } from 'fs'

context-summarizer.ts: import { ContextCategorizer } from './context-categorizer.js'
                       (import interno do dominio)

context-categorizer.ts: Sem imports externos
types.ts: Sem imports externos
```

---

## Gargalos

### 1. Nenhum teste unitario
- **Severidade**: Media
- **Arquivos**: Todos os 7 arquivos
- **Problema**: Dominio sem cobertura de testes
- **Impacto**: Risco de regressao, dificuldade de manutencao

### 2. Tratamento de erros silencioso
- **Severidade**: Media
- **Arquivos**: `file-indexer.ts` (linha 115-117), `context-memory.ts` (linha 56-58)
- **Problema**: Catch vazio que ignora erros sem logs ou notificacao
- **Impacto**: Dificil debugar problemas de leitura de arquivos

### 3. Nao ha validacao de entrada
- **Severidade**: Baixa
- **Arquivos**: Todos os metodos de classe
- **Problema**: Parametros nao sao validados (ex: projectPath vazio, entries undefined)
- **Impacto**: Possiveis erros em runtime

### 4. Logger com console.log
- **Severidade**: Baixa
- **Arquivos**: Todos
- **Problema**: Logs vao para stdout, sem estruturacao
- **Impacto**: Dificil agregar/monitorar em producao

### 5. Dominio nao utilizado em outros modulos
- **Severidade**: Alta (para o objetivo do pipeline)
- **Problema**: O dominio nao e importado por nenhum outro modulo do projeto
- **Impacto**: O contexto-engine existe mas nao esta integrado ao fluxo do projeto

---

## Oportunidades de Otimizacao

### Objetivo do pipeline: Otimizacao de contexto - Melhorar performance e eficiencia do context management

### 1. Integracao com o fluxo principal (ALTA PRIORIDADE)
**Problema**: O `context-engine` nao esta conectado ao state-machine ou qualquer outro modulo ativo.

**Solucao proposta**:
- Conectar `ContextMemory` ao state-machine para persistencia automatica
- Usar `ContextCategorizer` no fluxo de entrada de mensagens
- Integrar `ContextSummarizer` antes de enviar contexto para o LLM

### 2. Compressao de contexto ineficiente
**Problema atual**: O `ContextSummarizer` usa algoritmo simples de truncamento de linhas.

**Oportunidade**:
- Implementar compressao semantica usando embedding vectors
- Usar algoritmos de summarization mais sofisticados (extractive/abstractive)
- Cache de summaries para evitar recomputacao

### 3. Indexacao de arquivosheavy
**Problema atual**: `FileIndexer` le todos os arquivos em memoria.

**Oportunidade**:
- Indexacao incremental (apenas arquivos modificados)
- Busca por conteudo usando trie/indice invertido
- Parallelizacao com worker_threads para grandes projetos

### 4. Sistema de prioridade nao dinamico
**Problema atual**: `EntryPriority` e fixo, nao considera relevancia temporal ou historica.

**Oportunidade**:
- Implementar aprendizado de prioridade baseada em acessos
- Score dinamico: acesso recente + tipo + relevancia

### 5. Missing: Contexto de janela deslizante ativo
**Problema atual**: O `ContextSummarizer` precisa ser chamado manualmente.

**Oportunidade**:
- Implementar sliding window automatico que comprime antes de enviar para LLM
- Hook no fluxo de mensagens que dispara compressao quando token count > threshold

---

## Analise de Integracao com pipeline

Para alcancar o objetivo "Otimizacao de contexto", as seguintes integracoes sao necessarias:

1. **StateMachine** -> `ContextMemory.save()` ao final de cada transicao
2. **Entrada de mensagens** -> `ContextCategorizer.categorize()` para classificar
3. **Antes de enviar para LLM** -> `ContextSummarizer.summarize()` para caber no contexto
4. **Busca de arquivos** -> `FileIndexer.searchByName()` para contexto de codigo
5. **Decisoes arquiteturais** -> `DecisionLogger` para manter history de ADRs

---

## Conclusao

O dominio `context-engine` esta bem estruturado e coeso, porem **nao esta integrado** ao resto do projeto. As oportunidades de otimizacao estao principalmente em:

1. Conectar o modulo ao fluxo ativo do projeto
2. Melhorar a eficiencia dos algoritmos de compressao
3. Implementar indexacao incremental
4. Adicionar testes unitarios

**Recomendacao para o pipeline**: Comecar pela integracao com o state-machine, pois sem isso o contexto-engine permanece codigo morto.
