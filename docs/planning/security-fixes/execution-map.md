# Execution Map: Correções de Segurança Críticas

## Mapa Visual de Execução

### Fase A — Contratos (Sequencial, 1 terminal)

```
TASK-001 interfaces ──► TASK-002 test-specs
Tempo estimado: ~65 min
```

### Fase B — Implementação (Paralela, até 5 terminais)

#### Rodada 1: Core Infrastructure (~45 min)
```
┌─────────────────────────────────────────────────────────┐
│  Terminal 1: TASK-100 RegexCache           [M ~45min]  │
│  Terminal 2: TASK-101 SymlinkGuard         [M ~45min]  │
│  Terminal 3: TASK-102 PerformanceOptimizer [M ~45min] │
│                                                         │
│  Tempo da rodada: ~45 min                               │
├─────────────────────────────────────────────────────────┤
│  Rodada 2: OWASP Expansion (~180 min total)           │
│                                                         │
│  Terminal 1: TASK-200 A01 Rules           [M ~45min]  │
│  Terminal 2: TASK-201 A04 Rules           [S ~20min]  │
│  Terminal 3: TASK-202 A06 Rules           [S ~25min]  │
│  Terminal 4: TASK-203 A07 Rules           [S ~25min]  │
│  Terminal 5: TASK-204 A09 Rules           [S ~15min]  │
│                                                         │
│  Tempo da rodada: ~45 min (maior task)                │
├─────────────────────────────────────────────────────────┤
│  Rodada 3: Pattern Expansion (~150 min)               │
│                                                         │
│  Terminal 1: TASK-300 XSS Patterns         [M ~40min]  │
│  Terminal 2: TASK-301 SQLi Patterns        [M ~50min]  │
│  Terminal 3: TASK-302 Cmd Injection       [M ~40min]  │
│                                                         │
│  Tempo da rodada: ~50 min                               │
├─────────────────────────────────────────────────────────┤
│  Rodada 4: Integração (~90 min)                        │
│                                                         │
│  Terminal 1: TASK-400 Cache Integration   [S ~25min]  │
│  Terminal 2: TASK-401 Symlink Integration  [S ~25min]  │
│  Terminal 3: TASK-402 Early Termination    [S ~20min]  │
│  Terminal 4: TASK-403 Fast Mode            [S ~20min]  │
│                                                         │
│  Tempo da rodada: ~25 min                               │
└─────────────────────────────────────────────────────────┘
```

### Fase C — Integração (Sequencial, 1 terminal)

```
TASK-INT-001 exports ──► TASK-INT-002 tests ──► TASK-INT-003 performance ──► TASK-INT-004 registry
Tempo estimado: ~90 min
```

---

## Projeção de Velocidade

| Métrica | Valor |
|---------|-------|
| Tempo sequencial estimado | ~550 min (~9 horas) |
| Tempo com paralelismo | ~300 min (~5 horas) |
| Terminais recomendados | 5 |
| Speedup vs sequencial | ~1.8x |

---

## Resumo de Tasks por Categoria

| Categoria | Tasks |
|-----------|-------|
| Interfaces & Types | 1 |
| Testes Spec | 1 |
| Core (Cache, Symlink, Perf) | 3 |
| OWASP Rules | 5 |
| Pattern Expansion | 3 |
| Integração | 4 |
| Validação | 4 |
| **Total** | **21** |

---

## Dependências Críticas (Serialização Obrigatória)

1. **TASK-002** (test specs) depende de **TASK-001** (interfaces)
2. **TASK-100,101,102** (core) dependem de **TASK-002**
3. **TASK-200-204** dependem de **TASK-100** (cache disponível)
4. **TASK-400-403** dependem de **TASK-102** (optimizer disponível)
5. **Fase C** depende de toda Fase B estar completa

---

## Arquivos Criados/Modificados

### Novos Arquivos
- `src/security/regex-cache.ts`
- `src/security/symlink-guard.ts`
- `src/security/performance-optimizer.ts`
- `tests/unit/security-cache.test.ts`
- `tests/unit/symlink-guard.test.ts`
- `tests/unit/security-perf.test.ts`

### Arquivos Modificados
- `src/security/types.ts` (interfaces)
- `src/security/index.ts` (exports)
- `src/security/owasp-rules.ts` (novas regras)
- `src/security/scanner.ts` (integração)
