# UX Spec - Consolidação de Memória com Quality Gates

## Interface

```typescript
import { canConsolidateMemory, consolidateWithGate, isWrapUpBlocked, QualityGateResult } from '../wrap-up/quality-gate-consolidator.js';

// Verificar se pode consolidar
const gate = await canConsolidateMemory();
if (!gate.approved) {
  console.log('Bloqueadores:', gate.blockers);
  console.log('Avisos:', gate.warnings);
}

// Consolidar com gate
const result = await consolidateWithGate();
// → Se QA reprovado, retorna erro e não persiste

// Verificar se wrap-up está bloqueado
if (isWrapUpBlocked()) {
  console.log('QA reprovado - wrap-up bloqueado');
}
```

---

## Fluxo

```
Phase Complete → Run QA → QA Pass?
                                    ↓
                              ┌─ SIM ─→ Consolidate Memory → Wrap-up
                              │
                              ↓
                            NÃO → Block Wrap-up → Fix Issues → Retry
```

---

*Gerado pelo Flow Orchestrator*
