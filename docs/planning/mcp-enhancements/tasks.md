# Tasks: Melhorias nas MCP Tools

## Fase A — Contratos (Serializados)

### TASK-A-001: Definir Interfaces para RealLLMWorker

**Fase:** A (Serial)
**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/mcp/types.ts` (atualizar)

**Contratos de entrada:**
- Dependencies: openai, antropic

**Contratos de saída:**
- `RealLLMWorkerConfig` interface: `{ apiKey: string, provider: 'openai' | 'anthropic', model: string, timeoutMs: number }`
- `LLMProvider` enum: `'openai' | 'anthropic'`

**Critérios de conclusão:**
- [ ] Interfaces definidas em src/mcp/types.ts
- [ ] Exportadas corretamente

---

### TASK-A-002: Definir Interfaces para Health Persistence

**Fase:** A (Serial)
**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/mcp/types.ts` (atualizar)

**Contratos de saída:**
- `HealthState` interface: `{ circuitBreakers: Record<string, CircuitBreakerState>, fallbackStats: FallbackStats, lastUpdated: string }`
- `PersistedHealthState` interface: versão serializável para JSON

**Critérios de conclusão:**
- [ ] Interfaces definidas e exportadas
- [ ] Compatíveis com estados existentes do FallbackRouter

---

### TASK-A-003: Criar Mocks para Testes

**Fase:** A (Serial)
**Tipo:** test
**Prioridade:** P0
**Estimativa:** S (20 min)

**Arquivos sob propriedade:**
- `tests/unit/mcp-real-llm-worker.test.ts` (criar)
- `tests/unit/mcp-health-persistence.test.ts` (criar)

**Contratos de entrada:**
- Interfaces de TASK-A-001 e TASK-A-002

**Critérios de conclusão:**
- [ ] Testes unitários para RealLLMWorker
- [ ] Testes unitários para HealthState persistence

---

## Fase B — Implementação (Paralela)

### TASK-B-001: Implementar RealLLMWorker

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-001, RF-002, RF-003

**Arquivos sob propriedade:**
- `src/mcp/real-llm-worker.ts` (criar)

**Contratos de entrada:**
- `RealLLMWorkerConfig` de `src/mcp/types.ts`
- Interfaces de TASK-A-001

**Contratos de saída:**
- `RealLLMWorker` classe implementando `LLMWorker`
- Exporta: `RealLLMWorker`, `createRealLLMWorker()`

**Critérios de conclusão:**
- [ ] Conecta a OpenAI quando provider=openai
- [ ] Conecta a Anthropic quando provider=anthropic
- [ ] Timeout configurável
- [ ] Retry básico em caso de erro
- [ ] Testes passam

---

### TASK-B-002: Implementar Health Persistence

**Fase:** B (Paralela)
**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-004, RF-005

**Arquivos sob propriedade:**
- `src/mcp/health-persistence.ts` (criar)

**Contratos de entrada:**
- `HealthState`, `PersistedHealthState` de TASK-A-002

**Contratos de saída:**
- `HealthPersistence` classe com `load()`, `save()`, `getStatePath()`

**Critérios de conclusão:**
- [ ] Salva estados em .vibe-flow/health-state.json
- [ ] Carrega estados ao iniciar
- [ ] Debounce para salvamento (max 1x/segundo)
- [ ] Tratamento de erros (arquivo corrompido)
- [ ] Testes passam

---

### TASK-B-003: Atualizar FallbackRouter com Persistência

**Fase:** B (Paralela)
**Tipo:** service
**Prioridade:** P0
**Estimativa:** M (30 min)

**Requisitos PRD:** RF-004, RF-005

**Arquivos sob propriedade:**
- `src/mcp/fallback-router.ts` (atualizar)

**Contratos de entrada:**
- `HealthPersistence` de TASK-B-002
- Interfaces de TASK-A-002

**Contratos de saída:**
- FallbackRouter agora usa HealthPersistence para estado

**Critérios de conclusão:**
- [ ] Carrega estados ao iniciar
- [ ] Salva estados após mudança
- [ ] Não quebra API existente
- [ ] Testes passam

---

### TASK-B-004: Implementar Graceful Degradation para LCM Tools

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P0
**Estimativa:** S (20 min)

**Requisitos PRD:** RF-006

**Arquivos sob propriedade:**
- `src/mcp/tools/lcm-tools.ts` (atualizar)

**Contratos de entrada:**
- Funções existentes lcm_describe, lcm_expand, lcm_grep

**Contratos de saída:**
- Same functions with graceful degradation

**Critérios de conclusão:**
- [ ] lcm_describe retorna erro when archives não existem
- [ ] lcm_expand retorna erro when archives não existem
- [ ] lcm_grep retorna array vazio com mensagem informativa
- [ ] Testes passam

---

### TASK-B-005: Remover Fallbacks Redundantes

**Fase:** B (Paralela)
**Tipo:** refactor
**Prioridade:** P0
**Estimativa:** S (15 min)

**Requisitos PRD:** RF-007

**Arquivos sob propriedade:**
- `src/mcp/official-server.ts` (atualizar)

**Contratos de entrada:**
- Funções existentes de registro de fallback

**Contratos de saída:**
- Fallbacks registrados corretamente (não duplicados)

**Critérios de conclusão:**
- [ ] Cada tool tem fallback handler diferente
- [ ] Se não há provider alternativo, não registra fallback
- [ ] Documentação atualizada

---

### TASK-B-006: Criar Tool mcp_health_status

**Fase:** B (Paralela)
**Tipo:** component
**Prioridade:** P1
**Estimativa:** S (20 min)

**Requisitos PRD:** MH-007

**Arquivos sob propriedade:**
- `src/mcp/tools/health-status-tool.ts` (criar)
- `src/mcp/tools/lcm-schema.ts` (atualizar)

**Contratos de entrada:**
- FallbackRouter.getAllCircuitStates()

**Contratos de saída:**
- `mcp_health_status` tool registrada

**Critérios de conclusão:**
- [ ] Tool expõe status de circuit breakers
- [ ] Inclui estatísticas de fallback
- [ ] Registrada no MCP server

---

## Fase C — Integração (Serializada)

### TASK-C-001: Atualizar Exports e Index

**Fase:** C (Serial)
**Tipo:** config
**Prioridade:** P0
**Estimativa:** S (10 min)

**Arquivos sob propriedade:**
- `src/mcp/index.ts` (atualizar)

**Contratos de entrada:**
- RealLLMWorker, HealthPersistence, mcp_health_status

**Critérios de conclusão:**
- [ ] Todos os novos módulos exportados
- [ ] API pública consistente

---

### TASK-C-002: Testes de Integração

**Fase:** C (Serial)
**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (30 min)

**Arquivos sob propriedade:**
- `tests/integration/mcp-enhancements.test.ts` (criar)

**Contratos de entrada:**
- Todas as tasks anteriores

**Critérios de conclusão:**
- [ ] Integração RealLLMWorker + AgenticMapOperator
- [ ] Integração HealthPersistence + FallbackRouter
- [ ] LCM tools com archives e sem archives

---

### TASK-C-003: Build e Validação

**Fase:** C (Serial)
**Tipo:** config
**Prioridade:** P0
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- Nenhum (apenas validação)

**Critérios de conclusão:**
- [ ] TypeScript compila sem erros
- [ ] Todos os testes passam
- [ ] ESLint passa

---

## Mapa de Execução

### Fase A — Contratos (Sequencial, 1 terminal)
```
TASK-A-001 (15 min) → TASK-A-002 (15 min) → TASK-A-003 (20 min)
Tempo estimado: ~50 min
```

### Fase B — Implementação (Paralela, até 4 terminais)

```
Rodada 1 (sem dependências entre si):
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: TASK-B-001 RealLLMWorker         [M ~45min]    │
│ Terminal 2: TASK-B-002 HealthPersistence     [M ~45min]    │
│ Terminal 3: TASK-B-004 LCM Graceful          [S ~20min]    │
│ Terminal 4: TASK-B-005 Remove Fallbacks      [S ~15min]    │
│                                                             │
│ Tempo da rodada: ~45 min (maior task)                      │
├─────────────────────────────────────────────────────────────┤
│ Rodada 2 (depende de B-001 e B-002):                        │
│                                                             │
│ Terminal 1: TASK-B-003 FallbackRouter+Health  [M ~30min]    │
│ Terminal 2: TASK-B-006 health_status tool    [S ~20min]    │
│                                                             │
│ Tempo da rodada: ~30 min                                    │
└─────────────────────────────────────────────────────────────┘
```

### Fase C — Integração (Sequencial, 1 terminal)
```
TASK-C-001 (10 min) → TASK-C-002 (30 min) → TASK-C-003 (15 min)
Tempo estimado: ~55 min
```

### Tempo Total Estimado
- Fase A: 50 min
- Fase B: 75 min (45 + 30)
- Fase C: 55 min
- **Total: ~180 min (3 horas)**

### Paralelismo Efetivo
- Fase A: 1 terminal
- Fase B: 4 terminais (2 rodadas)
- Fase C: 1 terminal

---

## Branch Map

| Task | Branch | Base | Merge Target |
|------|--------|------|--------------|
| TASK-A-001 | task/mcp-a1-types | master | task/mcp-integration |
| TASK-A-002 | task/mcp-a2-health-types | task/mcp-a1-types | task/mcp-integration |
| TASK-A-003 | task/mcp-a3-mocks | task/mcp-a2-health-types | task/mcp-integration |
| TASK-B-001 | task/mcp-b1-real-llm | task/mcp-a3-mocks | task/mcp-integration |
| TASK-B-002 | task/mcp-b2-health-persistence | task/mcp-a3-mocks | task/mcp-integration |
| TASK-B-003 | task/mcp-b3-fallback-update | task/mcp-b2-health-persistence | task/mcp-integration |
| TASK-B-004 | task/mcp-b4-lcm-graceful | task/mcp-a3-mocks | task/mcp-integration |
| TASK-B-005 | task/mcp-b5-remove-dup | task/mcp-a3-mocks | task/mcp-integration |
| TASK-B-006 | task/mcp-b6-health-tool | task/mcp-b3-fallback-update | task/mcp-integration |
| TASK-C-001 | task/mcp-c1-exports | task/mcp-integration | master |
| TASK-C-002 | task/mcp-c2-integration | task/mcp-c1-exports | master |
| TASK-C-003 | task/mcp-c3-build | task/mcp-c2-integration | master |

---

## Dependências entre Tasks

```
TASK-A-001 ─┬─→ TASK-B-001
            │
TASK-A-002 ─┼─→ TASK-B-002 ──→ TASK-B-003 ──→ TASK-B-006
            │
TASK-A-003 ─┼─→ TASK-B-004
            │
            └─→ TASK-B-005

TASK-B-003 ─┼─→ TASK-C-001 ──→ TASK-C-002 ──→ TASK-C-003
            │
(all B) ────┘
```
