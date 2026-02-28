# PRD: Context Management Lifecycle

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise de:** vibe-flow codebase

## 1. Contexto e Problema

O sistema de gerenciamento de contexto do vibe-flow apresenta 5 problemas principais que afetam a estabilidade e performance em longas sessões de uso:

### 1.1 Archives criados mas nunca limpos
- Múltiplos módulos criam archives em disco:
  - `compression.ts` -> `.vibe-flow/compressed-archives/`
  - `compaction.ts` -> `.vibe-flow/context-archives/`
  - `file-pointers.ts` -> `.vibe-flow/file-archives/`
- **Impacto:** Consumo de disco ilimitado ao longo do tempo
- **Referência:** Arquivos `src/context/compression.ts:40`, `src/context/compaction.ts:64`, `src/context/file-pointers.ts:66`

### 1.2 Token estimation inconsistente entre módulos
- Módulos usam fórmulas diferentes para estimar tokens:
  - `src/utils/token-estimation.ts`: Versão completa com cache LRU e overhead por mensagem
  - `src/context/compression.ts`: `Math.ceil(content.length / 4)` simples
  - `src/context/compaction.ts`: Mesmo cálculo simples
  - `src/context/dag-summary.ts`: Mesmo cálculo simples
  - `src/context/file-pointers.ts`: Mesmo cálculo simples
- **Impacto:** Contagens de tokens imprecisas leading a decisões incorretas de compactação
- **Referência:** Arquivos listados em grep results

### 1.3 DAG não persiste entre sessões
- `src/context/dag-summary.ts` tem `rebuildDAGFromSummaries()` mas não tem função de salvar o estado
- DAG é construído em memória mas nunca persiste
- **Impacto:** Perda de contexto condensado entre sessões, recomputação constante

### 1.4 Potencial memory pressure com pointer expansion
- Módulos (`file-pointers.ts`, `compression.ts`, `compaction.ts`) têm funções de expansão que podem carregar muitos arquivos simultaneamente
- Não há controle de quantos pointers podem ser expandidos
- **Impacto:** Potencial OOM em sessões longas

### 1.5 Global singleton em WorkerPool
- `src/context/worker-pool.ts:528` usa `let globalPool: WorkerPool | null = null`
- **Impacto:** Dificuldade detesting, potenciais problemas de estado compartilhado entre sessões

## 2. Objetivo

Implementar lifecycle management completo para o sistema de gerenciamento de contexto, consolidando token estimation e adicionando persistência DAG.

**Critérios de sucesso:**
- Archives são automaticamente limpos após X dias (configurável)
- Todos os módulos usam `src/utils/token-estimation.ts` como fonte única de verdade
- DAG persiste entre sessões e é reconstruído automaticamente
- Expansão de pointers tem limites configuráveis para evitar memory pressure
- WorkerPool não usa mais singleton global

## 3. Escopo

### 3.1 Incluso (Must Have)
1. **Archive Lifecycle Manager** - Sistema de limpeza automática de archives
2. **Token Estimation Unification** - Refatorar todos os módulos para usar módulo centralizado
3. **DAG Persistence** - Salvar/carregar estado DAG entre sessões
4. **Pointer Expansion Guard** - Limites para evitar memory pressure
5. **WorkerPool Factory** - Remover singleton global

### 3.2 Incluso (Should Have)
1. **Dashboard de archives** - Visualizar tamanho e idade dos archives
2. **Métricas de token estimation** - Cache hit rate, estimativas por módulo

### 3.3 Fora de Escopo (Won't Have - this release)
- Modificações na interface CLI de usuário
- Sistema de alerts/notificações para archives antigos
- Reorganização da estrutura de diretórios

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | Archive Lifecycle Manager limpa archives com mais de N dias | Must | - |
| RF-002 | Configuração de retention (dias) via ContextManagerConfig | Must | RF-001 |
| RF-003 | Substituir estimateTokens em compression.ts pelo módulo centralizado | Must | - |
| RF-004 | Substituir estimateTokens em compaction.ts pelo módulo centralizado | Must | RF-003 |
| RF-005 | Substituir estimateTokens em dag-summary.ts pelo módulo centralizado | Must | RF-004 |
| RF-006 | Substituir estimateFileTokens em file-pointers.ts pelo módulo centralizado | Must | RF-005 |
| RF-007 | Adicionar função saveDAGState() em dag-summary.ts | Must | - |
| RF-008 | Adicionar função loadDAGState() em dag-summary.ts | Must | RF-007 |
| RF-009 | Integrar persistência DAG no ContextManager | Must | RF-008 |
| RF-010 | Adicionar config maxConcurrentExpansions em PointerConfig | Must | - |
| RF-011 | Implementar semaphore para controlar expansões simultâneas | Must | RF-010 |
| RF-012 | Remover globalPool singleton de worker-pool.ts | Must | - |
| RF-013 | Expor factory function getPoolInstance() com instance ID | Must | RF-012 |

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Performance de limpeza de archives | < 100ms para 1000 arquivos |
| RNF-002 | Cache hit rate de token estimation | > 80% após warmup |
| RNF-003 | Persistência DAG não bloqueia thread principal | Operações assíncronas |
| RNF-004 | Backward compatibility | APIs existentes não quebram |

## 6. Restrições Técnicas

- Stack: TypeScript 5.3.3, Node.js
- Módulos existentes NÃO podem ter suas interfaces públicas quebradas
- Precisa funcionar em Windows e Unix
- Dependências externas: zero (manter padrão do projeto)

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Breaking changes em APIs existentes | Alta | Alto | Manter aliases de compatibilidade, testes de regressão |
| Performance degrade com refactoring | Baixa | Médio | Benchmark antes/depois,monitorar cache hit rate |
| Memória durante expansão de pointers | Média | Médio | Semaphore com limite baixo por padrão |

## 8. Métricas de Sucesso

- [ ] Archives em `.vibe-flow/` não excedem 100MB após 7 dias
- [ ] Todos os módulos usam `src/utils/token-estimation.ts`
- [ ] DAG é reconstruído corretamente após restart
- [ ] Expansão de pointers limitada a 5 concorrentes por padrão
- [ ] WorkerPool não usa mais singleton global
