# PRD: Integracao TDD do vibe-flow

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na analise de:** vibe-flow codebase

## 1. Contexto e Problema

O sistema TDD do vibe-flow possui modulos implementados mas desconectados entre si:

**Modulos existentes:**
- `src/execution/tdd/loop-controller.ts` - Maquina de estados TDD (RED-GREEN-REFACTOR)
- `src/execution/tdd/prompts.ts` - Builders de prompt para RED e GREEN
- `src/execution/tdd/failure-analyzer.ts` - Parser de falhas de teste
- `src/execution/tdd/coverage-tracker.ts` - Verificador de cobertura de testes
- `src/execution/tdd/regression-guard.ts` - Detector de regressoes
- `src/execution/orchestration/tdd-coordinator.ts` - Coordenador de agentes

**Problemas identificados:**
1. Prompts (`buildTestGenerationPrompt`, `buildImplementationPrompt`) existem mas NAO sao usados pelo `TDDLoopController`
2. `FailureAnalyzer` (`parseTestFailure`, `isRetryableFailure`) desconectado - nunca eh chamado
3. `TDDCoordinator` reimplementa o ciclo RED/GREEN em vez de delegar ao `TDDLoopController`
4. `CoverageTracker` nunca eh chamado - serve apenas como utilitario
5. Conflitos de interface `TestResult` entre 3 modulos diferentes

**Por que isso importa:**
- Prompts forcam a metodologia TDD (test-first) mas nao sao utilizados
- Falhas de teste sao passadas cruas ao LLM em vez de contexto cirurgico
- Duplicacao de logica entre Coordinator e Controller
- Impossivel detectar regressoes ou validar cobertura automaticamente

## 2. Objetivo

Integrar os modulos TDD existentes para que trabalhem em conjunto:

1. **TDDLoopController deve usar os prompts** de `prompts.ts` para gerar contexto para os generators
2. **TDDLoopController deve usar FailureAnalyzer** para processar falhas de teste antes de passar ao LLM
3. **TDDCoordinator deve delegar** ao TDDLoopController em vez de reimplementar o ciclo
4. **CoverageTracker deve ser chamado** apos GREEN para validar estrutura do teste
5. **Resolver conflitos de interface TestResult** com tipos unificados

**Criterio de sucesso:**
- Todos os modulos TDD se comunicam atraves de contratos definidos
- TestResult tem uma unica interface canonica
- TDDCoordinator delega 100% ao LoopController
- FailureAnalyzer processa todas as falhas antes de alimentar o LLM
- Cobertura eh validada apos GREEN

## 3. Escopo

### 3.1 Incluso (Must Have)
- [ ] Criar `TDDTypes` com interface `TestResult` unificada
- [ ] Modificar `TDDLoopController` para usar `prompts.ts`
- [ ] Modificar `TDDLoopController` para usar `failure-analyzer.ts`
- [ ] Modificar `TDDCoordinator` para delegar ao `TDDLoopController`
- [ ] Integrar `CoverageTracker` no fluxo (apos GREEN)
- [ ] Integrar `RegressionGuard` no fluxo (apos COMPLETED)
- [ ] Atualizar exports em `src/execution/tdd/index.ts`
- [ ] Criar testes de integracao para o fluxo completo

### 3.2 Incluso (Should Have)
- [ ] Adicionar validacao de coverage thresholds no TDDLoopController
- [ ] Adicionar callback para regressao no TDDCoordinator
- [ ] Documentar o fluxo de integracao

### 3.3 Fora de Escopo (Won't Have)
- [ ] Modificar a interface publica do TDDCoordinator (manter retrocompatibilidade)
- [ ] Alterar o fluxo de eventos do TDDCoordinator (manter eventos existentes)
- [ ] Implementar novo TestRunner - usar o existente

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | Interface TestResult unificada em src/execution/tdd/types.ts | Must | - |
| RF-002 | TDDLoopController usa prompts.ts para contexto de LLM | Must | RF-001 |
| RF-003 | TDDLoopController usa FailureAnalyzer para processar falhas | Must | RF-001 |
| RF-004 | TDDCoordinator delega ao TDDLoopController | Must | RF-002, RF-003 |
| RF-005 | CoverageTracker executa apos GREEN | Must | - |
| RF-006 | RegressionGuard executa apos COMPLETED | Must | - |
| RF-007 | Exports atualizados em index.ts | Must | RF-001 a RF-006 |
| RF-008 | Testes de integracao do fluxo | Must | RF-001 a RF-007 |

## 5. Requisitos Nao-Funcionais

| ID | Requisito | Metrica |
|----|-----------|---------|
| RNF-001 | Build compila sem erros | tsc --noEmit passa |
| RNF-002 | Testes existentes passam | npm test passa |
| RNF-003 | Retrocompatibilidade do TDDCoordinator | API publica inalterada |

## 6. Restricoes Tecnicas

- Stack: TypeScript, Node.js
- Manter as interfaces publicas existentes do TDDCoordinator
- Nao modificar o fluxo de eventos do TDDCoordinator
- Usar os modulos existentes: prompts.ts, failure-analyzer.ts, coverage-tracker.ts, regression-guard.ts
- TestResult unico deve ser compativel com todas as medicoes existentes

## 7. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|--------------|---------|-----------|
| Quebrar API existente do TDDCoordinator | Media | Alto | Manter interfaces publicas, apenas mudar implementacao interna |
| Conflito de tipos TestResult | Alta | Alto | Criar novo arquivo types.ts com interfaces canonicas |
| Testes falharem apos integracao | Media | Medio | Executar testes antes e depois de cada modificacao |

## 8. Metricas de Sucesso

1. **Integracao:** TDDLoopController usa prompts.ts e failure-analyzer.ts
2. **Delegacao:** TDDCoordinator delega 100% ao TDDLoopController
3. **Cobertura:** CoverageTracker integrado ao fluxo
4. **Regressao:** RegressionGuard integrado ao fluxo
5. **Build:** Compila sem erros TypeScript
6. **Testes:** Todos os testes existentes passam
