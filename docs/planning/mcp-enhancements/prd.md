# PRD: Melhorias nas MCP Tools do Vibe-Flow

## Meta

- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise de:** Arquivos MCP em src/mcp/*.ts

## 1. Contexto e Problema

O sistema MCP (Model Context Protocol) do vibe-flow fornece ferramentas para interação com o Claude Code. A análise identificou os seguintes problemas:

### 1.1 Problema 1: AgenticMapOperator usa MockLLMWorker

O `AgenticMapOperator` em `src/mcp/agentic-map.ts` utiliza apenas `MockLLMWorker` que simula processamento com delay aleatório. Não há integração real com provedores LLM (OpenAI, Anthropic, etc.), limitando a utilidade prática do operador para casos de uso reais.

### 1.2 Problema 2: Health stats em memória

Os estados de health (circuit breaker, fallback stats) são mantidos exclusivamente em memória (`FallbackRouter`, `MCPRouter`). Não há persistência entre sessões, causando:
- Perda de histórico de falhas após restart
- Impossibilidade de análise de tendências
- Circuit breakers resetados desnecessariamente

### 1.3 Problema 3: LCM tools dependem de sistema de arquivamento

As tools `lcm_describe`, `lcm_expand`, `lcm_grep` em `src/mcp/tools/lcm-tools.ts` dependem de `.vibe-flow/context-archives/` que precisa estar configurado. Não há graceful degradation quando o sistema de arquivamento não existe.

### 1.4 Problema 4: Fallback providers são redundantes

Existem 3 sistemas de fallback redundantes no código:
- `src/mcp/router.ts` - MCPRouter com exponential backoff
- `src/mcp/fallback.ts` - FallbackRouter para API secundária
- `src/mcp/fallback-router.ts` - FallbackRouter com circuit breaker

Além disso, os fallback providers registrados em `official-server.ts` (linhas 207-262) são todos o mesmo handler - não há diferença real entre `fallback_start_project`, `fallback_advance_step`, etc.

## 2. Objetivo

Melhorar as MCP tools do vibe-flow com:

1. **Integração LLM Real** - Substituir MockLLMWorker por integração real com provedores (OpenAI/Anthropic)
2. **Persistência de Health** - Salvar estados de health em arquivo para persistência entre sessões
3. **Graceful Degradation** - LCM tools devem funcionar mesmo sem sistema de arquivamento configurado
4. **Consolidação de Fallbacks** - Unificar/otimizar os sistemas de fallback redundantes

## 3. Escopo

### 3.1 Incluso (Must Have)

| ID | Funcionalidade | Descrição |
|----|---------------|-----------|
| MH-001 | Integração LLM Real | Criar RealLLMWorker que conecta a OpenAI ou Anthropic |
| MH-002 | Configuração de Provider | Permitir seleção de provider via config/env |
| MH-003 | Persistência de Health | Salvar estados de circuit breaker em arquivo JSON |
| MH-004 | Carregamento de Estado | Restaurar estados de health ao iniciar |
| MH-005 | LCM Graceful Degradation | Retornar resultado vazio/indicativo quando archives não existem |
| MH-006 | Remover Fallbacks Redundantes | Consolidar handlers de fallback duplicados |

### 3.2 Incluso (Should Have)

| ID | Funcionalidade | Descrição |
|----|---------------|-----------|
| MH-007 | Health Dashboard | Expor endpoint/tool para ver status de health |
| MH-008 | Retry com Jitter Adaptativo | Ajustar jitter baseado em taxa de falha |
| MH-009 | Rate Limit Detection | Detectar rate limits automaticamente via headers |

### 3.3 Fora de Escopo (Won't Have - this release)

- Integração com provedores LLM além de OpenAI/Anthropic
- Sistema de caching de respostas LLM
- Monitoramento avançado com métricas Prometheus

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | AgenticMapOperator deve aceitar RealLLMWorker como factory | Must | MH-001 |
| RF-002 | Configuração de API key via variável de ambiente | Must | MH-001 |
| RF-003 | Fallback para Anthropic se OpenAI falhar | Should | MH-001 |
| RF-004 | Circuit breaker state persistido em `.vibe-flow/health-state.json` | Must | MH-003 |
| RF-005 | Estados restaurados ao iniciar FallbackRouter | Must | MH-004 |
| RF-006 | lcm_grep retorna array vazio com mensagem quando archives não existem | Must | MH-005 |
| RF-007 | Remover handlers de fallback duplicados em official-server.ts | Must | MH-006 |

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Tempo de resposta LLM | < 30s por item processado |
| RNF-002 | Persistência de health | < 100ms para salvar/carregar estado |
| RNF-003 | Degradação graceful | LCM tools respondem em < 500ms mesmo sem archives |
| RNF-004 | Backward compatibility | APIs existentes não quebram |

## 6. Restrições Técnicas

- **Stack:** TypeScript, Node.js
- **Dependencies:** antropic (Anthropic SDK), openai (OpenAI SDK) - novas dependências
- **Arquivos existentes a modificar:**
  - `src/mcp/agentic-map.ts` - adicionar RealLLMWorker
  - `src/mcp/fallback-router.ts` - adicionar persistência
  - `src/mcp/official-server.ts` - limpar fallbacks redundantes
  - `src/mcp/tools/lcm-tools.ts` - graceful degradation

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| RF-001: API keys inválidas causam falhas | Alta | Alto | Validação upfront, fallback para mock |
| RF-002: Arquivo de health corrompido | Baixa | Médio | Try-catch, reset para estado padrão |
| RF-003: Performance degrade com LLM real | Média | Médio | Timeout configurável, retry limits |

## 8. Métricas de Sucesso

- AgenticMapOperator processa inputs com LLM real quando factory fornecida
- Circuit breaker state persiste entre reinicializações do servidor
- LCM tools funcionam sem erros mesmo sem diretório de archives
- Fallback providers não são mais duplicados/redundantes
