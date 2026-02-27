# Análise de Domínio: cli-core

## Arquivos (3)

| Arquivo | Descrição | Linhas |
|---------|-----------|--------|
| `src/cli.ts` | CLI principal - gerencia todos os comandos | 664 |
| `src/command-registry/index.ts` | Mapeamento de fases para comandos | 305 |
| `src/types.ts` | Tipos TypeScript principais | 67 |

## Padrões Detectados

### CLI (commander.js)
- Uso de `commander` para parsing de argumentos
- Estrutura: setupCommands() → handlers privados → StateMachine/ConfigManager/etc
- Padrão: comando → validação → execução → output

### Command Registry
- Mapa de fases: ANALYSIS → PLANNING → SOLUTIONING → IMPLEMENTATION
- Checkpoints: passos que requerem confirmação
- Execução via Claude Code CLI com timeout (5 min default)
- Performance monitoring (NFR6: <500ms target)

### Tipos
- Tipos principais: ProjectState, Phase, ProjectContext
- Extensíveis: Decision, Artifact, Progress
- Telemetry: MetricEvent para tracking

## Interfaces Públicas

### CLI Commands
```
start [name]     - Iniciar novo projeto
advance [-f]     - Avançar próximo passo
status           - Mostrar status atual
wrap-up          - Executar wrap-up session
analyze          - Analisar projeto
preflight        - Pre-flight checks
quality          - Code quality checks
mcp              - Start MCP server
init-claude      - Iniciar integração Claude Code
```

### CommandRegistry API
```
getCommand(phase, step) → CommandDefinition
getPhaseCommands(phase) → Record<number, CommandDefinition>
isCheckpoint(phase, step) → boolean
executeCommand(command, options) → CommandResult
executeWithPerformanceCheck(command, options) → CommandResult + performanceWarning
checkClaudeAvailability() → { available, path, version }
```

## Dependências Externas

### NPM
- `commander` - CLI parsing
- `chalk` - Terminal colors
- `uuid` - Correlation IDs

### Módulos Internos
- `src/state-machine/` - Phase transitions
- `src/config/` - ConfigManager
- `src/decision/` - DecisionHandler
- `src/wrap-up/` - WrapUpExecutor
- `src/help/` - HelpExecutor
- `src/validation/` - StepValidator
- `src/mcp/` - MCPServer

## Gargalos

| Severidade | Arquivo | Problema |
|------------|---------|----------|
| Baixa | cli.ts:660 | Exit code não específico em erros |
| Baixa | command-registry:172 | Fallback commands múltiplas tentativas |
| Info | cli.ts | MCP server é básico (STDIO/HTTP simples) |
