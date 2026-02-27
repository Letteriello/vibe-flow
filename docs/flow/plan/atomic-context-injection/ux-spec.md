# UX Spec - Injeção de Contexto Atômica

## Interface

```typescript
import { injectAtomicContext, getPhaseContext, selectModelForPhase, ContextPhase, PhaseContextCache } from '../context/atomic-injector.js';

// Injeção por fase
const context = injectAtomicContext('dev');
// → Retorna apenas: CLAUDE.md, docs/architecture/* da feature atual, tasks ativas

// Cache
const cached = getPhaseContext('planning');
// → Retorna contexto em cache ou null

// Cognitive tiering
const model = selectModelForPhase('analysis');
// → 'haiku' (menor custo, para roteamento)
const model2 = selectModelForPhase('dev');
// → 'sonet' (maior capacidade, para implementação)
```

---

## Fase → Contexto Mapping

| Fase | Artefatos Injetados | Tamanho Est. |
|------|---------------------|---------------|
| analysis | CLAUDE.md, docs/architecture/* | ~2k tokens |
| planning | CLAUDE.md, docs/planning/*, PRDs | ~4k tokens |
| dev | CLAUDE.md, tasks.md, contratos | ~6k tokens |
| qa | CLAUDE.md, qa-report.md | ~2k tokens |

---

*Gerado pelo Flow Orchestrator*
