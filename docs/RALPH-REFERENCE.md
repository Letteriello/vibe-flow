# Guia de Referencia do Ralph

Este guia detalha como executar o `ralph_loop.sh`, como ele consome as ferramentas MCP do vibe-flow, e como interpretar os logs em `.ralph/live.log`.

## Sumario

1. [Executando o Ralph Loop](#executando-o-ralph-loop)
2. [Integracao com Ferramentas MCP do Vibe-Flow](#integracao-com-ferramentas-mcp-do-vibe-flow)
3. [Interpretando os Logs](#interpretando-os-logs)
4. [Estrutura do Arquivo live.log](#estrutura-do-arquivo-livelog)
5. [Solucionando Problemas](#solucionando-problemas)

---

## Executando o Ralph Loop

### Pre-requisitos

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Claude Code CLI** >= 2.0.76
- Projeto vibe-flow buildado (`npm run build`)

### Comandos Basicos

```bash
# Executar Ralph em primeiro plano (recomendado para testes)
cd vibe-flow
bash .ralph/ralph_loop.sh

# Executar em background (para execucao autonomo)
nohup bash .ralph/ralph_loop.sh > .ralph/logs/ralph.log 2>&1 &

# Executar com streaming em tempo real
bash .ralph/ralph_loop.sh --live
```

### Opções de Linha de Comando

| Flag | Descricao | Default |
|------|-----------|---------|
| `--calls N` | Limite de chamadas por hora | 100 |
| `--live` | Habilitar output em streaming | false |
| `--monitor` | Usar tmux para monitoramento | false |
| `--target STORY` | Trabalhar em story especifico (ex: "1.1") | "" |
| `--help` | Mostrar ajuda | - |

### Executando via bmalph

```bash
# Usando bmalph para iniciar o loop Ralph
cd vibe-flow
bmalph implement
```

---

## Integracao com Ferramentas MCP do Vibe-Flow

### Configuracao MCP

O vibe-flow expõe 5 ferramentas via MCP (Model Context Protocol). A configuracao esta em `.claude/settings.json`:

```json
{
  "mcpServers": {
    "vibe-flow": {
      "command": "node",
      "args": [
        "C:\\Users\\gabri\\Desktop\\Claude Code\\vibe-flow\\dist\\cli.js",
        "mcp",
        "--stdio"
      ]
    }
  }
}
```

### Ferramentas Disponiveis

Quando o Ralph executa o Claude Code dentro do diretorio vibe-flow, ele tem acesso automatico as seguintes ferramentas:

#### 1. start_project

Inicializa um novo projeto com a fundamentacao do workflow BMAD.

```json
{
  "tool": "start_project",
  "parameters": {
    "projectName": "meu-projeto",
    "projectPath": "./projetos/meu-projeto"
  }
}
```

**Quando usar:** No inicio de um novo projeto para configurar a estrutura BMAD.

#### 2. advance_step

Progride para a proxima tarefa atomica do workflow.

```json
{
  "tool": "advance_step",
  "parameters": {
    "projectPath": "./meu-projeto"
  }
}
```

**Quando usar:** Para avancar automaticamente nas fases do workflow (Analysis -> Planning -> Solutioning -> Implementation).

#### 3. get_status

Consulta o status atual do projeto e detecta estagnacao.

```json
{
  "tool": "get_status",
  "parameters": {
    "projectPath": "./meu-projeto"
  }
}
```

**Retorna:**
- Fase atual do workflow
- Progresso百分比
- Historico de etapas
- Indicadores de estagnacao

#### 4. analyze_project

Analisa um projeto existente e gera documentacao BMAD.

```json
{
  "tool": "analyze_project",
  "parameters": {
    "projectPath": "./projeto-legado"
  }
}
```

**Quando usar:** Para projetos ja existentes que precisam ser documentados ou migrados para o metodo BMAD.

#### 5. wrap_up_session

Finaliza a sessao com consolidacao automatica de memoria.

```json
{
  "tool": "wrap_up_session",
  "parameters": {
    "projectPath": "./meu-projeto"
  }
}
```

**Quando usar:** Ao final de cada sessao de trabalho para salvar o estado e gerar um resumo.

### Como o Ralph Usa as Ferramentas

O Ralph Loop nao chama as ferramentas MCP diretamente via linha de comando. Em vez disso:

1. O Claude Code e executado com acesso automatico as ferramentas MCP
2. O PROMPT.md instrui o Claude a usar as ferramentas quando necessario
3. O Claude decide quando chamar `get_status`, `advance_step`, etc.

Exemplo de como o Claude pode usar as ferramentas durante a execucao:

```
# O Claude pode chamar automaticamente durante o loop:
- get_status: para verificar o estado atual do projeto
- advance_step: para avancar para proxima fase
- wrap_up_session: ao finalizar o trabalho
```

---

## Interpretando os Logs

### Estrutura dos Arquivos de Log

```
.ralph/
├── live.log              # Output em tempo real (streaming)
├── logs/
│   ├── claude_output_2026-02-23_09-02-43.log   # Log de cada loop
│   ├── claude_output_2026-02-23_10-15-22.log
│   └── ...
├── status.json           # Status em tempo real
├── progress.json         # Progresso do projeto
└── .response_analysis    # Analise da resposta Claude
```

### Arquivo live.log

O `live.log` e o arquivo principal para monitoramento em tempo real. Ele registra:

- Inicio de cada iteracao do loop
- Output do Claude Code em formato legivel
- Chamadas de ferramentas
- Erros e advertencias

### Exemplo de Entrada no live.log

```
=== Loop #11 - 2026-02-25 11:32:03 ===

[Timestamp] [Tipo] Conteudo
```

### Estrutura dos Logs de Saida do Claude

Cada arquivo em `.ralph/logs/claude_output_*.log` e um JSON com a seguinte estrutura:

```json
{
  "type": "result",
  "subtype": "error_during_execution",
  "duration_ms": 863583,
  "num_turns": 13,
  "session_id": "69547828-c59e-4800-9261-8a9c36327b37",
  "total_cost_usd": 2.5380663,
  "usage": {
    "input_tokens": 832962,
    "output_tokens": 2176,
    "cache_read_input_tokens": 21801
  },
  "permission_denials": [],
  "errors": [
    "Error: mensagem de erro aqui"
  ]
}
```

### Interpretando os Campos

| Campo | Descricao |
|-------|-----------|
| `type` | Tipo de resultado (sempre "result") |
| `subtype` | Subtipo da execucao (ex: "error_during_execution") |
| `duration_ms` | Tempo total de execucao em milissegundos |
| `num_turns` | Numero de interacoes (turns) com o Claude |
| `session_id` | ID unico da sessao |
| `total_cost_usd` | Custo total da execucao em USD |
| `usage.input_tokens` | Tokens de entrada processados |
| `usage.output_tokens` | Tokens de saida gerados |
| `permission_denials` | Lista de permissoes negadas |
| `errors` | Lista de erros encontrados |

### Status de Execucao

O Ralph detecta diferentes status atraves do bloco RALPH_STATUS que o Claude inclui no final de cada resposta:

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <numero>
FILES_MODIFIED: <numero>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <resumo de uma linha>
---END_RALPH_STATUS---
```

### Interpretação do Status

| STATUS | Significado | Ação |
|--------|-------------|------|
| `IN_PROGRESS` | Trabalho em andamento | Continuar loop |
| `COMPLETE` | Tarefa finalizada | Verificar EXIT_SIGNAL |
| `BLOCKED` | Bloqueado por erro/externo | Intervenção humana necessaria |

---

## Estrutura do Arquivo live.log

### Formato do Arquivo

O `live.log` e um arquivo de texto que acumula o output de todas as iteracoes do loop:

```
=== Loop #1 - 2026-02-25 11:32:03 ===
[output do Claude Code aqui]

=== Loop #2 - 2026-02-25 12:45:12 ===
[output do Claude Code aqui]

=== Loop #3 - 2026-02-25 14:02:30 ===
[output do Claude Code aqui]
```

### Monitoramento em Tempo Real

```bash
# Ver o log em tempo real
tail -f .ralph/live.log

# Ver as ultimas 50 linhas
tail -n 50 .ralph/live.log

# Contagem de loops
grep -c "=== Loop" .ralph/live.log
```

---

## Solucionando Problemas

### Problema: Ralph para muito cedo

**Sintomas:** O loop para antes do trabalho estar completo

**Causas possiveis:**
- EXIT_SIGNAL definido como true prematuramente
- completion_indicators acionado por linguagem natural
- Todos os itens em fix_plan.md marcados como completos

**Solucoes:**
1. Verificar se EXIT_SIGNAL so esta true quando genuinamente completo
2. Adicionar tarefas restantes ao fix_plan.md
3. Consultar `.ralph/.response_analysis` para motivos de saida

### Problema: Ralph nao sai quando completo

**Sintomas:** O loop continua com trabalho inutil

**Causas possiveis:**
- EXIT_SIGNAL nao definido como true
- fix_plan.md tem itens nao marcados
- Limite de completion_indicators nao atingido

**Solucoes:**
1. Garantir que o bloco RALPH_STATUS esta incluido nas respostas
2. Definir EXIT_SIGNAL: true quando todo o trabalho estiver concluido
3. Marcar todos os itens concluidos no fix_plan.md

### Problema: Circuit breaker abre inesperadamente

**Sintomas:** Mensagem "OPEN - stagnation detected"

**Causas possiveis:**
- Mesmo erro se repete em varios loops
- Sem alteracoes de arquivos por varios loops
- Volume de output diminuindo significativamente

**Solucoes:**
1. Verificar `.ralph/logs/` para erros recorrentes
2. Corrigir o problema subjacente causando o erro
3. Resetar o circuit breaker: `ralph --reset-circuit`

### Problema: Permissao negada interrompe o loop

**Sintomas:** Mensagem "OPEN - permission_denied"

**Causas possiveis:**
- Claude Code teve permissao negada para executar comandos
- `ALLOWED_TOOLS` em `.ralphrc` muito restritivo

**Solucoes:**
1. Atualizar `ALLOWED_TOOLS` em `.ralphrc` para incluir ferramentas necessarias
2. Resetar o circuit breaker: `ralph --reset-circuit`
3. Ferramentas comuns: `Write,Read,Edit,Bash(git *),Bash(npm *),Bash(pytest)`

### Problema: Sessao expira no meio do projeto

**Sintomas:** Contexto perdido, idade da sessao > 24h

**Causas possiveis:**
- Intervalos longos entre iteracoes do loop
- Sessao nao sendo atualizada

**Solucoes:**
1. Sessoes expiram apos 24h (configuravel via SESSION_EXPIRY_HOURS)
2. Iniciar nova sessao com `ralph --reset-session`
3. Contexto sera reconstruido do fix_plan.md e specs/

---

## Comandos de Diagnostico

```bash
# Verificar status do Ralph
ralph --status

# Verificar estado do circuit breaker
ralph --circuit-status

# Resetar circuit breaker
ralph --reset-circuit

# Reset automatico do circuit breaker (pula cooldown)
ralph --auto-reset-circuit

# Resetar sessao
ralph --reset-session

# Habilitar streaming em tempo real
ralph --live

# Streaming com monitoramento
ralph --monitor --live
```

---

## Arquivos de Configuracao

### .ralphrc

Arquivo de configuracao do projeto na raiz:

```bash
# Projeto
PROJECT_NAME="vibe-flow"
PROJECT_TYPE="typescript"

# Rate limiting
MAX_CALLS_PER_HOUR=100
CLAUDE_TIMEOUT_MINUTES=15

# Permissoes de ferramentas
ALLOWED_TOOLS="Write,Read,Edit,Glob,Bash(*)"

# Sessao
SESSION_CONTINUITY=true
SESSION_EXPIRY_HOURS=24

# Circuit Breaker
CB_NO_PROGRESS_THRESHOLD=3
CB_SAME_ERROR_THRESHOLD=5
CB_OUTPUT_DECLINE_THRESHOLD=70
CB_COOLDOWN_MINUTES=30
CB_AUTO_RESET=false
```

### Estrutura de Arquivos do Ralph

| Arquivo | Finalidade |
|---------|-----------|
| `.ralph/PROMPT.md` | Prompt principal que direciona cada iteracao |
| `.ralph/fix_plan.md` | Lista de tarefas priorizadas |
| `.ralph/@AGENT.md` | Instrucoes de build e execucao |
| `.ralph/status.json` | Rastreamento de status em tempo real |
| `.ralph/logs/` | Logs de execucao de cada loop |
| `.ralph/.ralph_session` | Estado atual da sessao |
| `.ralph/.circuit_breaker_state` | Estado do circuit breaker |
| `.ralph/live.log` | Arquivo de output para monitoramento |
| `.ralph/.loop_start_sha` | Git HEAD SHA capturado no inicio do loop |

---

## Leitura Adicional

- [BMAD-METHOD Documentation](https://github.com/bmad-code-org/BMAD-METHOD)
- [Ralph Repository](https://github.com/snarktank/ralph)
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
