# PRD: Melhorias nos Módulos de Validação do vibe-flow

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise de:** vibe-flow codebase (195 arquivos TypeScript)

---

 Contexto e Proble## 1.ma

O projeto vibe-flow possui módulos de validação que apresentamções críticas identificadas na limita análise:

### 1.1 Cross-Rule Validator
O módulo atual (`src/validation/cross-rule.ts`) compara artefatos de especificação em nível estrutural, mas falha em detectar inconsistências semânticas profundas. Por exemplo, se o PRD menciona um endpoint `/api/users` que retorna `User[]` mas a arquitetura especifica `User`, o validador atual não detecta essa contradição semântica.

### 1.2 Drift Detector
O módulo atual (`src/validation/drift-detector.ts`) usa regex com padrões muito amplos que resultam em alta taxa de falsos positivos. O pattern `FEATURE_INDICATORS` captura qualquer `const` ou `let` como feature, e a similaridade Levenshtein de 0.7-0.8 é excessivamente agressiva.

### 1.3 Agent Router
O router atual (`src/drivers/router.ts`) usa apenas rate limit (429) como gatilho de fallback. Não considera timeout, erros de API, qualidade de resposta ou latência.

### 1.4 Drivers (ClaudeCodeDriver, CodexDriver)
Ambos são mocks puros que apenas simulam execução com `setTimeout(100ms)` e retornam strings fixas. Não há integração real com as ferramentas.

---

## 2. Objetivo

Melhorar a precisão e utilidade dos módulos de validação:
1. Detectar inconsistências semânticas entre artefatos de especificação
2. Reduzir falsos positivos no drift detector
3. Expandir triggers de fallback no agent router
4. Substituir mocks por implementações reais

---

## 3. Escopo

### 3.1 Incluso (Must Have)

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-001 | Semantic Cross-Rule | Detectar entidades referenciadas mas não definidas entre artefatos |
| RF-002 | Semantic Cross-Rule | Detectar contradições de tipo (array vs object) |
| RF-003 | Semantic Cross-Rule | Detectar inconsistências de nomenclatura (plural/singular) |
| RF-004 | Drift Detector | Melhorar extração de features com parser estruturado |
| RF-005 | Drift Detector | Reduzir falsos positivos com threshold ajustável |
| RF-006 | Agent Router | Adicionar trigger de timeout (>30s) |
| RF-007 | Agent Router | Adicionar trigger de erro de API (500, 503) |
| RF-008 | Agent Router | Adicionar trigger de baixa qualidade de resposta |
| RF-009 | Real Drivers | Implementar ClaudeCodeDriver com CLI real |
| RF-010 | Real Drivers | Implementar CodexDriver com CLI real |

### 3.2 Incluso (Should Have)

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-011 | Semantic Cross-Rule | Detectar dependências circulares entre componentes |
| RF-012 | Agent Router | Métricas de latência por driver |
| RF-013 | Real Drivers | Health check para drivers |

### 3.3 Fora de Escopo (Won't Have - this release)

- Integração com provedores externos reais (API keys)
- Monitoramento contínuo de qualidade
- UI de configuração de thresholds

---

## 4. Requisitos Funcionais

### 4.1 Cross-Rule Validator - Semantic Enhancement

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | Detectar entidades referenciadas mas não definidas | Must | — |
| RF-002 | Detectar contradições de tipo entre artefatos | Must | RF-001 |
| RF-003 | Detectar inconsistências de nomenclatura | Must | — |
| RF-011 | Detectar dependências circulares | Should | RF-001 |

### 4.2 Drift Detector - Accuracy Improvement

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-004 | Extrair features via parser estruturado (não regex) | Must | — |
| RF-005 | Threshold ajustável (0.85-0.95) | Must | — |

### 4.3 Agent Router - Extended Fallback Triggers

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-006 | Fallback em timeout (>30s) | Must | — |
| RF-007 | Fallback em erros 500/503 | Must | — |
| RF-008 | Fallback em baixa qualidade de resposta | Must | — |
| RF-012 | Métricas de latência | Should | RF-006 |

### 4.4 Real Driver Implementations

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-009 | ClaudeCodeDriver com CLI real | Must | — |
| RF-010 | CodexDriver com CLI real | Must | — |
| RF-013 | Health check para drivers | Should | RF-009, RF-010 |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Precisão do Cross-Rule (semântico) | >90% de detecção |
| RNF-002 | Taxa de falsos positivos do Drift | <15% |
| RNF-003 | Latência do Agent Router | <50ms overhead |
| RNF-004 | Cobertura de testes | >80% |

---

## 6. Restrições Técnicas

- Stack: TypeScript 5.3.3
- Padrões: Manter interfaces existentes, adicionar sem quebrar
- Drivers: CLI real com fallback para mock se não disponível
- Compatibilidade: Windows verificável

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Regex muito complexo no drift | Alta | Alto | Usar parser estruturado, não regex |
| Mock vs Real causing test failures | Média | Médio | Wrap com try/catch, fallback para mock |
| Breaking changes em interfaces | Baixa | Alto | Manter compatibilidade reversível |

---

## 8. Métricas de Sucesso

- Cross-rule detecta inconsistências semânticas em artefatos relacionados
- Drift detector tem taxa de falsos positivos <15%
- Agent router faz fallback em timeout e erros HTTP
- Drivers reais funcionam com CLI disponível
