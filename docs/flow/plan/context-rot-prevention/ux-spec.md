# UX Spec - Prevenção de Context Rot

## Interface

```typescript
import { detectContextRot, shouldPrune, escalateContext, ContextHealth } from '../context/rot-detector.js';

// Verificar saúde do contexto
const health = detectContextRot(messages);
console.log('Health score:', health.score); // 0-100

if (!health.isHealthy) {
  console.log('Problemas:', health.issues);
  // → ["muitos thought blocks", "tool results duplication", "alta idade média"]
}

// Verificar se deve fazer prune
if (shouldPrune(messages)) {
  const cleaned = cleanMessages(messages, 'combined');
}

// Escalação automática
const result = await escalateContext();
// → Aplica sliding window + summary dos mais antigos
```

---

## Health Score

| Score | Status | Ação |
|-------|--------|------|
| 80-100 | 🟢 Healthy | Nenhuma |
| 50-79 | 🟡 Warning | Monitorar |
| 0-49 | 🔴 Unhealthy | Prune + Escalate |

---

## Métricas Monitoradas

- Thought block ratio
- Tool result duplication
- Average message age
- Token count vs threshold

---

*Gerado pelo Flow Orchestrator*
