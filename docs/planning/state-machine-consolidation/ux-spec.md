# UX Spec: Consolidação da State Machine

## Meta
- **PRD vinculado:** docs/planning/state-machine-consolidation/prd.md
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28

---

## 1. Visão Geral da Refatoração

Esta é uma refatoração técnica, não uma feature com UI. A UX Spec documenta a experiência do **desenvolvedor** ao usar as APIs unificadas.

---

## 2. Inventário de Componentes/Interfaces

| ID | Componente/Interface | Tipo | Descrição | Requisitos PRD |
|----|---------------------|------|-----------|----------------|
| API-001 | AgentCircuitBreaker | Classe | Implementação canônica de Circuit Breaker | RF-001 |
| API-002 | UnifiedTelemetry | Classe | Sistema único de telemetry | RF-004 |
| API-003 | WALManager | Classe | Write-Ahead Logging integrado | RF-003 |
| API-004 | StateMachineIntegration | Módulo | Integração SM + WAL + Telemetry | RF-003, RF-005 |

---

## 3. Design de APIs Unificadas

### 3.1 AgentCircuitBreaker (Canônico)

```typescript
// API existente em src/error-handler/circuit-breaker.ts
// Manter como está - já é a melhor implementação

import { AgentCircuitBreaker, CircuitBreakerState } from './circuit-breaker.js';

// Uso:
const cb = new AgentCircuitBreaker({ maxRetries: 3 });
const result = await cb.execute(async () => {
  // operation
}, 'operation-name');
```

### 3.2 UnifiedTelemetry

```typescript
// Nova API - substitui 4 sistemas existentes

import { UnifiedTelemetry, createUnifiedTelemetry } from './telemetry/unified.js';

// Métodos do TelemetryCollector
await telemetry.startTimer('correlation-id');
await telemetry.recordMetric('name', 'correlation-id', true, { metadata: {} });

// Métodos do Logger
await telemetry.log('message', 'info');
await telemetry.warn('message');
await telemetry.error('message');

// Métodos do QuotaTracker
await telemetry.recordCall(estimatedTokens);
const usage = telemetry.getUsagePercentage(); // 0-100
const isAboveThreshold = telemetry.isAboveThreshold();
await telemetry.reset();

// Métodos do StateMachineTelemetry
telemetry.startPhase(Phase.ANALYSIS);
telemetry.endPhase();
telemetry.recordTransition(Phase.NEW, Phase.ANALYSIS, ActionType.ADVANCE, 1000);
const metrics = telemetry.getSessionMetrics();
const json = telemetry.exportToJsonString();
```

### 3.3 WAL Integration

```typescript
// StateMachine usa WAL para recovery

import { StateMachine } from './state-machine/index.js';
import { WALManager } from './wal-recovery.js';

// Configuração
const sm = new StateMachine({
  enableWAL: true,
  walDir: '.vibe-flow/wal'
});

// Recovery automático após crash
const recovered = await sm.recoverFromWAL();
if (recovered) {
  console.log('Estado recuperado do WAL');
}
```

### 3.4 Persistência Otimizada

```typescript
// Persistência lazy/batched

interface StateMachineConfig {
  // Persistência
  persistence: {
    /** Modo: 'eager' | 'lazy' | 'batch' */
    mode: 'eager' | 'lazy' | 'batch';
    /** Intervalo em ms para modo lazy (default: 5000) */
    lazyIntervalMs?: number;
    /** Número de transições para batch (default: 10) */
    batchSize?: number;
  };
}

const sm = new StateMachine({
  persistence: {
    mode: 'lazy',
    lazyIntervalMs: 5000,  // Persiste se 5s sem mudanças
    batchSize: 10          // Ou após 10 transições
  }
});
```

---

## 4. Convenções de Nomenclatura

| Antes | Depois |
|-------|--------|
| CircuitBreakerError (tracker.ts) | StagnationError |
| CircuitBreakerState (drivers) | DriverCircuitState |
| CircuitBreakerState (mcp) | MCPCircuitState |

---

## 5. Mapa de Migração

```
APIs Antigas (Deprecated)
        │
        ▼
┌───────────────────┐
│  UnifiedTelemetry │  ← TelemetryCollector + Logger + QuotaTracker + StateMachineTelemetry
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ AgentCircuitBreaker│ ← AgentRouter + FallbackRouter + AgentCircuitBreaker
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  StateMachine +   │  ← + WALManager Integration
│  WALManager       │  ← + Persistência lazy/batched
└───────────────────┘
```

---

## 6. Critérios de Conclusão

- [ ] APIs unificadas documentadas
- [ ] Exemplos de migração disponíveis
- [ ] Deprecated warnings funcionando
- [ ] Testes de integração passando
