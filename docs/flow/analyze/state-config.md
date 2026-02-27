# Análise de Domínio: State & Config (Estado e Configuração)

## Arquivos (23)

### State Machine (16)
| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| Core | orchestrator.ts, tracker.ts, index.ts | Máquina de estados principal |
| Persistence | atomic-persistence.ts | Escrita atômica com backup |
| Locks | file-lock.ts | WorkspaceLockManager |
| Drift | state-drift-detector.ts | Detecção de drift via hash |
| Project | project-classifier.ts | Classificação de projeto |
| Quality | quality-gate.ts | Portão de qualidade |
| Telemetry | telemetry.ts | Coleta de métricas |
| Subagent | subagent-coordinator.ts | Coordenador de subagentes |

### Config (5)
| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| Loader | config-loader.ts | Carregamento de config |
| Schema | schema.ts | Esquema de validação |
| Cognitive | cognitive-tiering.ts | Tiering cognitivo |
| Fallback | fallback-router.ts | Roteamento de fallback |

### Telemetry (3)
| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| Logger | logger.ts | Logger simples para .vibe-flow/usage.log |
| Quota | quotaTracker.ts | Rastreamento de quota (80% threshold) |

## Padrões Detectados

### AtomicPersistence
- writeAtomic(): write + copy + unlink pattern
- Cross-device fallback (EXDEV)
- Backup automático

### WorkspaceLockManager
- Map<string, Lock> em memória
- acquireLock(), releaseLock(), isLocked()
- LockError com currentHolder, requestedBy

### StateDriftDetector
- calculateDirectoryHash(): SHA-256 de .vibe-flow/
- saveDirectoryHash() → state.json
- checkAndWarnDrift() → alerta com "analyze_project"

### ProjectClassifier
- Heurísticas: .bmad (+25), .ralph (+30), .git (+5)
- Estados: NEW, IN_PROGRESS, REVERSE_ENGINEERING

### TelemetryCollector
- phase-transition tracking
- Windows compatibility: directory check before write
- EXDEV fallback para rename cross-device

### ConfigLoader
- support*.json, config.json, vibe-flow.json
- Merge em cascata
- Cognitive tiering para limits

## Interfaces Públicas

```typescript
// State Machine
StateMachine, StateTransition
WorkspaceLockManager: acquireLock(), releaseLock(), isLocked()
AtomicPersistence: writeAtomic(), readAtomic()
StateDriftDetector: checkAndWarnDrift()
ProjectState, ProjectMaturity

// Config
ConfigLoader, CognitiveTiering, TierLevel
FallbackRouter

// Telemetry
TelemetryCollector: trackPhase()
QuotaTracker: checkQuota(), getUsage()
```

## Dependências Externas

- Node.js: fs, path, crypto, child_process
- @types/node@20.10.0

## Gargalos

| Severidade | Item | Descrição |
|------------|------|----------|
| Baixa | Project classifier | .ralph detection pode conflitar com .bmad |

## Recomendação para Auth System

Para implementar sistema de autenticação:
- Reutilizar AtomicPersistence para tokens/sessões
- Criar AuthStateMachine (login → authenticated → session_expired)
- ConfigLoader pode carregar auth config (JWT secret, session TTL)
- WorkspaceLockManager para arquivos de sessão
