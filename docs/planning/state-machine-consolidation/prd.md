# PRD: Consolidação da State Machine do vibe-flow

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise de:** Análise do codebase atual

---

## 1. Contexto e Problema

### Estado Atual
O projeto vibe-flow apresenta os seguintes problemas arquiteturais:

1. **3 Implementações de Circuit Breaker (Duplicação)**
   - `src/error-handler/circuit-breaker.ts`: `AgentCircuitBreaker` com `CircuitBreakerError` - focado em falhas de agente/LLM com sugestões human-in-the-loop
   - `src/drivers/router.ts`: `AgentRouter` - Circuit breaker simples para fallback entre drivers
   - `src/mcp/fallback-router.ts`: `FallbackRouter` - Circuit breaker completo para ferramentas MCP com retry/backoff

2. **Naming Conflict**
   - `src/error-handler/circuit-breaker.ts` define `CircuitBreakerError`
   - `src/state-machine/tracker.ts` define `CircuitBreakerError` para detecção de estagnação
   - Conflito impede imports simultâneos

3. **WALManager Não Integrado**
   - `src/error-handler/wal-recovery.ts` possui `WALManager` robusto
   - Nunca é utilizado pelo StateMachine para recuperação de estado

4. **4 Sistemas de Telemetry Separados (Fragmentação)**
   - `src/telemetry/index.ts`: `TelemetryCollector` - métricas de transição de fase
   - `src/telemetry/logger.ts`: `Logger` - logs de uso (append to usage.log)
   - `src/telemetry/quotaTracker.ts`: `QuotaTracker` - monitoramento de quota (80% threshold)
   - `src/state-machine/telemetry.ts`: `StateMachineTelemetry` - métricas de sessão

5. **Problema de Performance**
   - Persistência chamada após cada mudança de estado
   - Sem batch/persistência lazy

---

## 2. Objetivo

Consolidar a State Machine do vibe-flow através de:

1. **Unificação do Circuit Breaker** - Criar uma implementação única e reutilizável
2. **Resolução do Naming Conflict** - Renomear `CircuitBreakerError` em tracker.ts
3. **Integração do WAL** - StateMachine usa WALManager para recovery
4. **Unificação de Telemetry** - Um sistema único de telemetry
5. **Otimização de Persistência** - Implementar persistência lazy/batched

### Critérios de Sucesso

- [ ] Apenas 1 implementação de CircuitBreaker no codebase
- [ ] Naming conflict resolvido (sem import errors)
- [ ] StateMachine integra com WALManager para crash recovery
- [ ] Um único sistema de telemetry substitui os 4 existentes
- [ ] Persistência não é chamada em cada transição (lazy/batch)
- [ ] Todos os testes existentes passam
- [ ] Build compila com sucesso

---

## 3. Escopo

### 3.1 Incluso (Must Have)

1. **Unificação Circuit Breaker**
   - Manter `AgentCircuitBreaker` (src/error-handler) como implementação canônica
   - Remover `AgentRouter` (src/drivers/router.ts) - usar AgentCircuitBreaker
   - Remover `FallbackRouter` (src/mcp/fallback-router.ts) - usar AgentCircuitBreaker
   - Atualizar dependentes

2. **Resolução Naming Conflict**
   - Renomear `CircuitBreakerError` em src/state-machine/tracker.ts para `StagnationError`

3. **Integração WAL**
   - StateMachine usa WALManager para recovery em caso de crash
   - WAL persiste estado completo da máquina

4. **Unificação Telemetry**
   - Criar `UnifiedTelemetry` que substitui:
     - `TelemetryCollector` (src/telemetry/index.ts)
     - `Logger` (src/telemetry/logger.ts)
     - `QuotaTracker` (src/telemetry/quotaTracker.ts)
     - `StateMachineTelemetry` (src/state-machine/telemetry.ts)

5. **Otimização Persistência**
   - Implementar persistência lazy (X segundos sem mudanças)
   - Implementar persistência em batch (acumular N transições)

### 3.2 Incluso (Should Have)

- Documentação de uso das novas APIs unificadas
- Métricas de performance comparativas

### 3.3 Fora de Escopo (Won't Have)

- Refatoração de outras partes da StateMachine (Phase, ActionType, etc.)
- Alterações em sistemas que usam as APIs antigas (mantidas para compatibilidade)

---

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | Unificar CircuitBreaker em única implementação | Must | - |
| RF-002 | Resolver naming conflict CircuitBreakerError | Must | RF-001 |
| RF-003 | Integrar WALManager com StateMachine | Must | RF-002 |
| RF-004 | Criar UnifiedTelemetry como único sistema | Must | - |
| RF-005 | Implementar persistência lazy/batched | Must | RF-003 |
| RF-006 | Atualizar dependentes das APIs antigas | Should | RF-001, RF-004 |
| RF-007 | Manter compatibilidade com APIs antigas (deprecated) | Should | RF-001, RF-004 |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Build compilando | 0 erros TypeScript |
| RNF-002 | Testes passando | > 95% dos testes existentes |
| RNF-003 | Sem regressões | APIs existentes mantêm comportamento |
| RNF-004 | Performance de persistência | < 10ms por transição (sem I/O) |

---

## 6. Restrições Técnicas

- Stack: TypeScript, Node.js
- Manter compatibilidade com APIs existentes
- Suporte a Windows (já verificado no projeto)
- Não quebrar interfaces públicas existentes

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Quebrar APIs dependentes | Alta | Alto | Manter APIs antigas como deprecated |
| Regression em Circuit Breaker | Média | Alto | Testes extensivos |
| Perda de dados de telemetry | Baixa | Médio | Backup antes da migração |

---

## 8. Métricas de Sucesso

- Apenas 1 arquivo define CircuitBreaker
- 0 naming conflicts de importação
- StateMachine faz recovery após crash simulado
- UnifiedTelemetry exporta todas as funcionalidades anteriores
- Persistência não é chamada em cada transição
