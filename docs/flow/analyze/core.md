# Análise de Domínio: Core

## Visão Geral
Módulo central do vibe-flow CLI que coordena todas as operações. Gerencia estado, configuração, comandos e execução do workflow.

## Arquivos

| Arquivo | Descrição | Lines |
|---------|------------|-------|
| `src/cli.ts` | Ponto de entrada principal - CLI com commander.js | ~600 |
| `src/types.ts` | Tipos centrais do projeto | ~200 |
| `src/command-registry/index.ts` | Mapeamento de fases para comandos bmalph | ~250 |
| `src/config/index.ts` | Gerenciador de configuração | ~150 |
| `src/config/config-loader.ts` | Carregador de config JSON | ~100 |
| `src/config/schema.ts` | Schema de validação de config | ~80 |
| `src/config/cognitive-tiering.ts` | Sistema de tiering cognitivo | ~120 |
| `src/config/fallback-router.ts` | Router de fallback para comandos | ~100 |

## Interfaces Públicas

### CLI (src/cli.ts)
```typescript
class VibeFlowCLI {
  constructor()
  setupCommands(): void
  startProject(name?: string): Promise<void>
  advanceStep(force?: boolean): Promise<void>
  showStatus(): Promise<void>
  wrapUp(options: WrapUpOptions): Promise<void>
  analyzeProject(output?: string): Promise<void>
  showHelp(phase?: string): Promise<void>
  runPreFlight(): Promise<void>
}
```

### CommandRegistry (src/command-registry/index.ts)
```typescript
interface CommandDefinition {
  command: string
  description: string
  checkpoint?: boolean
}

interface CommandResult {
  correlationId: string
  command: string
  exitCode: number
  stdout: string
  stderr: string
  executionTimeMs: number
  timestamp: string
  success: boolean
}

class CommandRegistry {
  registerPhase(phase: string, commands: Record<number, CommandDefinition>): void
  executeCommand(command: string, args?: string[]): Promise<CommandResult>
  getPhaseCommands(phase: string): Record<number, CommandDefinition>
}
```

### ConfigManager (src/config/index.ts)
```typescript
interface Config {
  projectPath: string
  wrapUpEnabled: boolean
  telemetryEnabled: boolean
  maxTokens: number
  // ... mais campos
}

class ConfigManager {
  loadConfig(projectPath: string): Promise<Config>
  saveConfig(config: Config): Promise<void>
  getConfig(): Config
  updateConfig(updates: Partial<Config>): Promise<void>
}
```

## Padrões Detectados

1. **Dependency Injection**: Classes recebem dependências no construtor
2. **Async/Await**: Toda operação de I/O é assíncrona
3. **Commander.js**: CLI usa commander para parsing de argumentos
4. **Singleton-ish**: Módulos exportam instâncias únicas
5. **Phase-based**: Sistema baseado em fases (ANALYSIS, PLANNING, SOLUTIONING, IMPLEMENTATION, WRAP_UP)

## Dependências Externas

### NPM Packages
- `commander` - CLI parsing
- `chalk` - Cores no terminal
- `uuid` - Geração de IDs
- `fs` (Node.js) - File system

### Módulos Internos
- `src/state-machine/` - Gerenciamento de estado
- `src/decision/` - Tomada de decisões
- `src/wrap-up/` - Execução de wrap-up
- `src/help/` - Sistema de ajuda
- `src/validation/` - Validação

## Gargalos

1. **Alta acoplagem**: CLI centralizada cria dependência forte entre módulos
2. **CommandRegistry frágil**: mapeamento hardcoded de fases para comandos
3. **Configuração rígida**: Pouca flexibilidade para plugins

## Métricas

- **Arquivos**: 8
- **Linhas estimadas**: ~1500
- **Testes**: command-registry.test.ts, config.test.ts
