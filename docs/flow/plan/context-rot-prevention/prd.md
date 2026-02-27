# PRD - Prevenção de Context Rot

## 1. Visão Geral

**Feature:** Prevenção de Context Rot
**Pipeline:** flow-20260228-memory-init

### Problema
- Contextos longos acumulam "ruído" (thought blocks, tool results antigos)
- Performance degrada com o tempo de uso
- LlMs perdem qualidade após muitas iterações

### Solução
Implementar sistema de prevenção:
- Detecção automática de degradação
- Escalação de contexto (sliding window)
- Limpeza proativa de ruído

---

## 2. Escopo

### Include
- `src/context/rot-detector.ts` - Detector de degradação
- `src/context/escalation-manager.ts` - Gestão de escalação
- Integração com cleaning-strategy.ts existente

### Exclude
- Modificar lógica de compressão existente

---

## 3. Requisitos Funcionais

```typescript
// RF-001: Detecção de degradação
interface ContextHealth {
  score: number; // 0-100
  isHealthy: boolean;
  issues: string[];
}

function detectContextRot(messages: ContextMessage[]): ContextHealth

// RF-002: Escalação automática
async function escalateContext(): Promise<EscalationResult>

// RF-003: Limpeza proativa
function shouldPrune(messages: ContextMessage[]): boolean
```

---

## 4. Critérios de Conclusão

| ID | Critério |
|----|----------|
| CC-01 | Detector implementado |
| CC-02 | Escalação funciona |
| CC-03 | Limpeza integrada |
| CC-04 | Build compila |

---

## 5. Arquitetura

```
src/context/
├── rot-detector.ts           # NOVO
├── escalation-manager.ts     # NOVO
├── cleaning-strategy.ts      # Existing - integrar
└── index.ts                 # Atualizar exports
```

---

## 6. Referências

- r/ClaudeCode: "Context is noise. Bigger token windows are a trap"
- docs/flow/analyze/context-core.md

---

*Gerado pelo Flow Orchestrator*
