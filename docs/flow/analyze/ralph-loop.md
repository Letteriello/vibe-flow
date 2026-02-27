# Análise de Domínio: ralph-loop

## Visão Geral

Sistema de loop Ralph para execução contínua de tarefas e wrap-up.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/execution/tdd/loop-controller.ts` | Controlador de loop TDD |
| `src/execution/tdd/task-queue.ts` | Fila de tarefas |
| `src/execution/tdd/regression-guard.ts` | Guarda de regressão |
| `src/execution/tdd/failure-analyzer.ts` | Analisador de falhas |

## Fluxo do Ralph Loop

```
IMPLEMENTATION → quality-gate → WRAP_UP → COMPLETE
                    ↑
              (pode falhar)
```

## Integração com Quality Gate

O loop atual:
1. Executa tarefa
2. Verifica quality gate
3. Se passa → wrap-up
4. Se falha → refinamento

## Gargalos

1. **Security não integrado** - Quality gate atual não inclui scanning de segurança
2. **Manual verification** - Algumas verificações precisam ser manuais

---

*Analisado em: 2026-02-28*
