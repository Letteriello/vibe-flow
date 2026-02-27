# PRD - Injeção de Contexto Atômica

## 1. Visão Geral

**Feature:** Injeção de Contexto Atômica
**Pipeline:** flow-20260228-memory-init

### Problema
- Contextos massivos degradam performance do modelo (comunidades Reddit reportam "Context is noise")
- O sistema atual carrega contexto inteiro em cada operação
- Não há particionamento por fase do state-machine
- Desperdício de tokens em informações irrelevantes para a tarefa atual

### Solução
Implementar injeção de contexto atômica que:
- Particiona o contexto por fase (Analysis, Planning, Dev, QA)
- Injeta APENAS os artefatos relevantes para a fase atual
- Implementa "cognitive tiering" (modelos menores para roteamento)

---

## 2. Escopo

### Include
- `src/context/atomic-injector.ts` - Módulo principal
- Interface `ContextPhase` para definir fases
- Função `injectAtomicContext(phase: Phase): ContextPayload`
- Cache de contexto por fase

### Exclude
- Modificar lógica de negócio existente
- Alterar state-machine

---

## 3. Requisitos Funcionais

```typescript
// RF-001: Definir fases de contexto
type ContextPhase = 'analysis' | 'planning' | 'dev' | 'qa' | 'idle';

// RF-002: Injeção atômica
function injectAtomicContext(phase: ContextPhase): ContextPayload;

// RF-003: Cache por fase
class PhaseContextCache {
  get(phase: ContextPhase): ContextPayload | null
  set(phase: ContextPhase, payload: ContextPayload): void
  invalidate(): void
}

// RF-004: Cognitive tiering
function selectModelForPhase(phase: ContextPhase): ModelTier;
```

---

## 4. Critérios de Conclusão

| ID | Critério |
|----|----------|
| CC-01 | Módulo criado em `src/context/atomic-injector.ts` |
| CC-02 | Função `injectAtomicContext()` funciona |
| CC-03 | Cache implementado |
| CC-04 | Build compila |

---

## 5. Arquitetura

```
src/context/
├── atomic-injector.ts    # NOVO MÓDULO
├── context-manager.ts    # Existing - adaptar
└── index.ts             # Atualizar exports
```

---

## 6. Referências

- r/ClaudeCode: "Context is noise. Bigger token windows are a trap"
- Paper LCM (Lossless Context Management)
- docs/flow/analyze/context-engine.md - análise existente

---

*Gerado pelo Flow Orchestrator*
