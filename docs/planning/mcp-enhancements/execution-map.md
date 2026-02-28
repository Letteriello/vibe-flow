# Execution Map: Melhorias nas MCP Tools

## Resumo do Plano

| Fase | Tasks | Tempo Estimado | Paralelismo |
|------|-------|----------------|-------------|
| A (Contratos) | 3 | ~50 min | 1 terminal |
| B (Implementação) | 6 | ~75 min | 4 terminais |
| C (Integração) | 3 | ~55 min | 1 terminal |
| **Total** | **12** | **~180 min** | - |

## Execução por Fase

### Fase A — Contratos (Serial)

```
Terminal 1:
  TASK-A-001 (15 min) → TASK-A-002 (15 min) → TASK-A-003 (20 min)
```

### Fase B — Implementação (Paralela)

```
Rodada 1 (~45 min):
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: TASK-B-001 RealLLMWorker                       │
│ Terminal 2: TASK-B-002 HealthPersistence                   │
│ Terminal 3: TASK-B-004 LCM Graceful Deg                   │
│ Terminal 4: TASK-B-005 Remove Fallbacks                    │
└─────────────────────────────────────────────────────────────┘

Rodada 2 (~30 min):
┌─────────────────────────────────────────────────────────────┐
│ Terminal 1: TASK-B-003 FallbackRouter+Health              │
│ Terminal 2: TASK-B-006 health_status tool                 │
└─────────────────────────────────────────────────────────────┘
```

### Fase C — Integração (Serial)

```
Terminal 1:
  TASK-C-001 (10 min) → TASK-C-002 (30 min) → TASK-C-003 (15 min)
```

## Dependências Críticas

1. **TASK-B-001** requer **TASK-A-001** (tipos)
2. **TASK-B-002** requer **TASK-A-002** (tipos de health)
3. **TASK-B-003** requer **TASK-B-002** (HealthPersistence)
4. **TASK-B-006** requer **TASK-B-003** (circuit states)
5. **TASK-C-002** requer todas as tasks B

## Speedup vs Sequencial

- **Sem paralelismo:** ~280 min
- **Com paralelismo:** ~180 min
- **Speedup:** ~1.56x

## Executando em Paralelo

Para executar em terminais paralelos:

```bash
# Terminal 1 - Fase A
/dev TASK-A-001

# Terminal 2 - Fase A
/dev TASK-A-002

# Terminal 3 - Fase A
/dev TASK-A-003

# (Aguarde A finalizar, depois execute B em paralelo)

# Terminal 1 - Fase B Rodada 1
/dev TASK-B-001

# Terminal 2 - Fase B Rodada 1
/dev TASK-B-002

# Terminal 3 - Fase B Rodada 1
/dev TASK-B-004

# Terminal 4 - Fase B Rodada 1
/dev TASK-B-005

# (Aguarde Rodada 1, depois execute Rodada 2)

# Terminal 1 - Fase B Rodada 2
/dev TASK-B-003

# Terminal 2 - Fase B Rodada 2
/dev TASK-B-006

# (Aguarde B, depois execute C)

# Terminal 1 - Fase C
/dev TASK-C-001
/dev TASK-C-002
/dev TASK-C-003
```
