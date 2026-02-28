# PRD: Flow Orchestrator Implementation

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise de:** vibe-flow codebase + .claude/commands/flow.md

---

## 1. Contexto e Problema

### O que existe hoje

O projeto vibe-flow possui documentação extensiva para um sistema de pipeline paralelo em `.claude/commands/flow.md` (648 linhas), incluindo:

- **Filosofia de paralelização**: Modelo "fábrica de software" com N terminais simultâneos
- **Estrutura de coordenação**: `pipeline.json` com work units por fase
- **Fases definidas**: Analyze → Plan → Dev → QA → Wrap-up
- **Worker universal**: Conceito de terminal que executa qualquer tipo de work unit
- **Merge gates**: Consolidação entre fases
- **Streaming entre fases**: Execução paralela entre fases adjacentes

### O que está faltando

1. **Flow Orchestrator não implementado**: Apenas documentação, sem código executável
   - CLI command `/flow` não existe (comandos: start, advance, status, wrap-up, analyze, quality, preflight, qa, mcp)
   - FlowHandler atual só gerencia fluxo BMAD sequencial

2. **QA verdict não bloqueia wrap-up**:
   - `QualityGateConsolidator` existe em `src/wrap-up/quality-gate-consolidator.ts`
   - Mas não está integrado ao `WrapUpHandler`
   - Wrap-up executa independentemente do resultado do QA

3. **SecurityGuard não integrado no pipeline QA**:
   - `SecurityGuard` existe em `src/state-machine/security-guard.ts`
   - `QualityGateInterceptor` existe em `src/state-machine/quality-gate.ts`
   - Mas QA não usa o SecurityGuard para scanear artefatos

4. **Pipeline streaming não operacional**:
   - Documentado mas sem implementação
   - Fase B (Dev) não pode iniciar enquanto Fase A (Plan) não termina completamente

### Por que isso importa

O Flow Orchestrator é o coração do sistema vibe-flow. Sem ele:
- O projeto não pode executar pipelines paralelos
- Não há coordenação entre múltiplos terminais
- A promessa de "3x speedup" não se concretiza
- O QA verdict é ignorado, permitindo que código com problemas seja consolidado

---

## 2. Objetivo

Implementar o **Flow Orchestrator** - o sistema que coordena pipelines paralelos de desenvolvimento de software, lendo a especificação em `.claude/commands/flow.md` e executando automaticamente as fases de Analyze, Plan, Dev e QA.

### Critério de sucesso

| Métrica | Meta |
|---------|------|
| CLI `/flow` implementado | Command presente e executável |
| Pipeline pode ser iniciado | `docs/flow/pipeline.json` criado automaticamente |
| Execução paralela funciona | 2+ workers processando work units simultaneamente |
| QA verdict bloqueia wrap-up | `/wrap-up` falha se QA não aprovado |
| SecurityGuard integrado ao QA | Scanner executado durante QA |
| Streaming entre fases | Fase B pode iniciar antes de Fase A finalizar |

---

## 3. Escopo

### 3.1 Incluso (Must Have)

1. **Flow Orchestrator Core**
   - CLI command `/flow` com subcomandos: `full`, `analyze`, `plan`, `dev`, `qa`, `status`, `fix`
   - PipelineStateManager para gerenciar `pipeline.json`
   - WorkUnitDispatcher para distribuir tasks aos workers

2. **Worker System**
   - Worker universal que processa qualquer tipo de work unit
   - Heartbeat system para detectar workers travados
   - Claim system atômico para evitar work duplication

3. **Merge Gate System**
   - Consolidador para cada fase
   - Detecção de conflitos entre features
   - Geração de artefatos unificados

4. **QA Integration**
   - QualityGateConsolidator integrado ao WrapUpHandler
   - SecurityGuard executado durante QA
   - Verdict bloqueante para wrap-up

5. **Pipeline Streaming**
   - Execução paralela entre fases adjacentes
   - Detecção de dependências entre work units
   - Progressão automática quando dependências resolvidas

### 3.2 Incluso (Should Have)

1. **Relatório de pipeline**
   - Métricas de speedup
   - Tempo por fase
   - Work units por worker

2. **Smart Resume**
   - Detectar pipeline existente
   - Retomar de onde parou
   - Preservar work units concluídas

### 3.3 Fora de Escopo (Won't Have - this release)

1. **Execução distribuída real** (Multiple machines)
   - Por agora, múltiplos terminais na mesma máquina
2. **Persistência de workers**
   - Workers são processos efêmeros
3. **Integração com GitHub Actions**
   - Futura expansão

---

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | CLI `/flow full <objective>` cria pipeline.json | Must | — |
| RF-002 | `/flow status` exibe estado do pipeline | Must | RF-001 |
| RF-003 | Worker claim work unit atomico | Must | RF-001 |
| RF-004 | Worker executa ANA/PLAN/DEV/QA work units | Must | RF-003 |
| RF-005 | Merge gate consolida outputs de cada fase | Must | RF-004 |
| RF-006 | `/wrap-up` verifica QA verdict antes de prosseguir | Must | — |
| RF-007 | SecurityGuard executa durante QA | Must | — |
| RF-008 | Fase pode iniciar antes da anterior finalizar (streaming) | Should | RF-005 |
| RF-009 | `/flow fix` executa TASK-FIX-* geradas pelo QA | Should | RF-005 |
| RF-010 | Smart resume detecta pipeline existente | Should | RF-001 |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Tempo de inicialização do pipeline | < 2s |
| RNF-002 | Latência de claim de work unit | < 100ms |
| RNF-003 | Memory footprint por worker | < 50MB |
| RNF-004 | Suporte a Windows | Build funciona em Windows |
| RNF-005 | Escalabilidade | Suporta até 16 workers simultâneos |

---

## 6. Restrições Técnicas

- **Stack**: Node.js + TypeScript (existente)
- **CLI**: Commander.js (existente)
- **State persistence**: JSON files em `docs/flow/` e `.vibe-flow/`
- **No new npm dependencies**: Usar apenas libs existentes
- **Backward compatibility**: Comandos existentes (/start, /advance, /status) não podem quebrar

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Conflito de escrita no pipeline.json | Alta | Alto | Usar file locking ou atomic writes |
| Worker deadlock (esperando merge) | Média | Alto | Timeout com retry automático |
| QA não block wrap-up (regressão) | Alta | Alto | Teste unitário verificando integração |
| Complexidade excessiva | Média | Médio | Implementar em fases: Core → Worker → Merge → QA |

---

## 8. Métricas de Sucesso

- [ ] `/flow --help` lista todos os subcomandos
- [ ] `/flow full "test objective"` cria pipeline.json válido
- [ ] 2 workers simultâneos processam work units sem duplicação
- [ ] `/flow status` mostra progresso em tempo real
- [ ] QA fail → `/wrap-up` exibe erro e não executa
- [ ] SecurityGuard scan executado durante QA
- [ ] Build: `npm run build` compila sem erros
- [ ] Testes: `npm test` passa com >95% sucesso
