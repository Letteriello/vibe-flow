# Tasks: Melhorias nos Módulos de Validação

## Fase A — Contratos (Serializados)

### TASK-000: Definir interfaces semânticas

**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (20 min)

**Arquivos sob propriedade:**
- `src/validation/semantic-types.ts` (criar)

**Contratos de entrada:**
- Interfaces existentes de `ValidationResult`, `CrossRuleIssue`

**Contratos de saída:**
- `SemanticIssue`, `EntityDependencyGraph`, `EntityNode`, `DependencyEdge`
- `SemanticValidationResult` estende `ValidationResult`

**Critérios de conclusão:**
- [ ] Interfaces definidas e exportadas
- [ ] Types possuem documentação JSDoc
- [ ] Compila sem erros

---

### TASK-001: Definir interfaces do drift detector melhorado

**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/validation/drift-types.ts` (criar)

**Contratos de entrada:**
- Interfaces existentes de `DriftReport`, `DriftItem`

**Contratos de saída:**
- `EnhancedDriftReport`, `ParsedFeature`, `DriftDetectorConfig`

**Critérios de conclusão:**
- [ ] Interfaces definidas e exportadas
- [ ] Config com valores padrão sensatos
- [ ] Compila sem erros

---

### TASK-002: Definir interfaces de fallback policy

**Tipo:** types
**Prioridade:** P0
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/drivers/fallback-policy-types.ts` (criar)

**Contratos de entrada:**
- Interfaces existentes de `DriverResult`, `CircuitBreakerState`

**Contratos de saída:**
- `FallbackPolicy`, `FallbackTrigger`, `FallbackTriggerType`, `TriggerConfig`, `RouterMetrics`

**Critérios de conclusão:**
- [ ] Interfaces definidas e exportadas
- [ ] Todos os trigger types definidos
- [ ] Compila sem erros

---

## Fase B — Implementação (Paralela)

### TASK-100: Implementar SemanticCrossRuleValidator

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-001, RF-002, RF-003, RF-011

**Arquivos sob propriedade:**
- `src/validation/semantic-validator.ts` (criar)
- `src/validation/semantic-validator.test.ts` (criar)

**Contratos de entrada:**
- `src/validation/semantic-types.ts` (TASK-000)
- `ValidationResult`, `CrossRuleIssue` de `cross-rule.ts`

**Contratos de saída:**
- `SemanticCrossRuleValidator` com método `validateSemantics(artifactA, artifactB)`

**Critérios de conclusão:**
- [ ] Detecta entidades referenciadas mas não definidas
- [ ] Deteta conflitos de tipo (array vs object)
- [ ] Deteta inconsistências de nomenclatura
- [ ] Deteta dependências circulares (RF-011)
- [ ] Testes passam (>80% coverage)

---

### TASK-101: Implementar EnhancedDriftDetector

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-004, RF-005

**Arquivos sob propriedade:**
- `src/validation/enhanced-drift.ts` (criar)
- `src/validation/enhanced-drift.test.ts` (criar)

**Contratos de entrada:**
- `src/validation/drift-types.ts` (TASK-001)
- `DriftReport`, `DriftItem` de `drift-detector.ts`

**Contratos de saída:**
- `EnhancedDriftDetector` com método `detectDriftEnhanced(plan, diff, config)`

**Critérios de conclusão:**
- [ ] Usa parser estruturado para extração de features
- [ ] Threshold configurável (0.85-0.95)
- [ ] Marca features de baixa confiança
- [ ] Testes passam com taxa de FP <15%

---

### TASK-102: Implementar FallbackPolicy

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (30 min)

**Requisitos PRD:** RF-006, RF-007, RF-008

**Arquivos sob propriedade:**
- `src/drivers/fallback-policy.ts` (criar)
- `src/drivers/fallback-policy.test.ts` (criar)

**Contratos de entrada:**
- `src/drivers/fallback-policy-types.ts` (TASK-002)
- `DriverResult` de `types.ts`

**Contratos de saída:**
- `FallbackPolicy` com método `shouldFallback(error, metrics)`

**Critérios de conclusão:**
- [ ] Implementa trigger de timeout
- [ ] Implementa trigger de HTTP errors (500, 503)
- [ ] Implementa trigger de baixa qualidade
- [ ] Policy configurável

---

### TASK-103: Implementar EnhancedAgentRouter

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-006, RF-007, RF-008, RF-012

**Arquivos sob propriedade:**
- `src/drivers/enhanced-router.ts` (criar)
- `src/drivers/enhanced-router.test.ts` (criar)

**Contratos de entrada:**
- `src/drivers/fallback-policy.ts` (TASK-102)
- `AgentDriver` de `types.ts`
- `ClaudeCodeDriver`, `CodexDriver`

**Contratos de saída:**
- `EnhancedAgentRouter` com `executeTask()`, `getMetrics()`, `setFallbackPolicy()`

**Critérios de conclusão:**
- [ ] Fallback em timeout
- [ ] Fallback em HTTP errors
- [ ] Fallback em baixa qualidade
- [ ] Métricas por driver
- [ ] Mantém compatibilidade com interface existente

---

### TASK-104: Implementar ClaudeCodeDriver Real

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-009

**Arquivos sob propriedade:**
- `src/drivers/claude-code.ts` (modificar existente)
- `src/drivers/claude-code.test.ts` (criar)

**Contratos de entrada:**
- Interfaces de `src/drivers/types.ts`
- `RealAgentDriver` de TASK-002

**Contratos de saída:**
- `ClaudeCodeDriver` com CLI real, fallback para mock

**Critérios de conclusão:**
- [ ] Detecta disponibilidade de CLI
- [ ] Executa via CLI quando disponível
- [ ] Fallback para mock quando CLI indisponível
- [ ] Testes de integração

---

### TASK-105: Implementar CodexDriver Real

**Tipo:** component
**Prioridade:** P0
**Estimativa:** M (45 min)

**Requisitos PRD:** RF-010

**Arquivos sob propriedade:**
- `src/drivers/codex.ts` (modificar existente)
- `src/drivers/codex.test.ts` (criar)

**Contratos de entrada:**
- Interfaces de `src/drivers/types.ts`
- `RealAgentDriver` de TASK-002

**Contratos de saída:**
- `CodexDriver` com CLI real, fallback para mock

**Critérios de conclusão:**
- [ ] Detecta disponibilidade de CLI
- [ ] Executa via CLI quando disponível
- [ ] Fallback para mock quando CLI indisponível
- [ ] Testes de integração

---

## Fase C — Integração (Serializada)

### TASK-INT-001: Atualizar exports do validation module

**Tipo:** integration
**Prioridade:** P0
**Estimativa:** S (10 min)

**Arquivos sob propriedade:**
- `src/validation/index.ts` (modificar)

**Contratos de entrada:**
- `semantic-validator.ts`, `enhanced-drift.ts`, `semantic-types.ts`, `drift-types.ts`

**Contratos de saída:**
- Exports atualizados

**Critérios de conclusão:**
- [ ] Novos módulos exportados
- [ ] Compila sem erros

---

### TASK-INT-002: Atualizar exports do drivers module

**Tipo:** integration
**Prioridade:** P0
**Estimativa:** S (10 min)

**Arquivos sob propriedade:**
- `src/drivers/index.ts` (modificar)

**Contratos de entrada:**
- `enhanced-router.ts`, `fallback-policy.ts`, `fallback-policy-types.ts`
- Versões atualizadas de `claude-code.ts`, `codex.ts`

**Contratos de saída:**
- Exports atualizados

**Critérios de conclusão:**
- [ ] Novos módulos exportados
- [ ] Compila sem erros

---

### TASK-INT-003: Atualizar CrossRuleValidator com detecção semântica

**Tipo:** integration
**Prioridade:** P1
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/validation/cross-rule.ts` (modificar)

**Contratos de entrada:**
- `SemanticCrossRuleValidator` de TASK-100

**Contratos de saída:**
- Método integrado ao validador existente

**Critérios de conclusão:**
- [ ] Mantém compatibilidade com API existente
- [ ] Detecção semântica disponível via nova opção

---

### TASK-INT-004: Atualizar DriftDetector com versão melhorada

**Tipo:** integration
**Prioridade:** P1
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/validation/drift-detector.ts` (modificar)

**Contratos de entrada:**
- `EnhancedDriftDetector` de TASK-101

**Contratos de saída:**
- Método integrado ao detector existente

**Critérios de conclusão:**
- [ ] Mantém compatibilidade com API existente
- [ ] Versão melhorada disponível via nova opção

---

### TASK-INT-005: Atualizar AgentRouter com fallback estendido

**Tipo:** integration
**Prioridade:** P1
**Estimativa:** S (15 min)

**Arquivos sob propriedade:**
- `src/drivers/router.ts` (modificar)

**Contratos de entrada:**
- `EnhancedAgentRouter` de TASK-103

**Contratos de saída:**
- Backward compatible wrapper

**Critérios de conclusão:**
- [ ] Mantém compatibilidade com API existente
- [ ] Fallback estendido disponível

---

### TASK-INT-006: Teste de integração completo

**Tipo:** test
**Prioridade:** P0
**Estimativa:** M (30 min)

**Arquivos sob propriedade:**
- `tests/integration/validation-improvements.test.ts` (criar)

**Contratos de entrada:**
- Todos os módulos implementados

**Contratos de saída:**
- Testes de integração

**Critérios de conclusão:**
- [ ] Todos os módulos funcionam juntos
- [ ] Fallback chain funciona
- [ ] Métricas são coletadas

---

## Mapa de Execução

### Fase A — Contratos (Sequencial)
TASK-000 → TASK-001 → TASK-002
Tempo estimado: ~50 min

### Fase B — Implementação (Paralela)
```
┌─────────────────────────────────────────────────────────┐
│  Terminal 1: TASK-100 SemanticValidator    [M ~45min]   │
│  Terminal 2: TASK-101 EnhancedDrift       [M ~45min]   │
│  Terminal 3: TASK-102 FallbackPolicy      [M ~30min]   │
│  Terminal 4: TASK-103 EnhancedRouter      [M ~45min]   │
│  Terminal 5: TASK-104 ClaudeCodeDriver    [M ~45min]   │
│  Terminal 6: TASK-105 CodexDriver         [M ~45min]   │
└─────────────────────────────────────────────────────────┘
Tempo da rodada: ~45 min (maior task)
```

### Fase C — Integração (Sequencial)
TASK-INT-001 → TASK-INT-002 → TASK-INT-003 → TASK-INT-004 → TASK-INT-005 → TASK-INT-006
Tempo estimado: ~95 min

### Tempo total estimado: ~190 min (3h10)
### Paralelismo efetivo: 6 terminais
### Speedup vs sequencial: ~4.5x
