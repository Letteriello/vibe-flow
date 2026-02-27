# Análise de Domínio: quality-modules

## Visão Geral

Módulos de qualidade existentes no projeto vibe-flow para validação de código e artefatos.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/quality/index.ts` | Barrel exports |
| `src/quality/ast-checker.ts` | Verificador de sintaxe e anomalias |
| `src/quality/types.ts` | Tipos e interfaces |
| `src/quality/preflight-checker.ts` | Verificador pré-voo |
| `src/quality/quality-guard.ts` | Guarda de qualidade |
| `src/quality/ai-patterns-detector.ts` | Detector de padrões de IA |

## Interfaces Públicas

```typescript
// types.ts
export interface QualityCheckResult { ... }
export interface SyntaxAnomaly { ... }

// ast-checker.ts
export class SemanticQualityChecker {
  hasOrphanedImports(code: string): boolean
  hasSyntaxAnomalies(code: string): boolean
  checkCode(code: string, sanitize?: boolean): QualityCheckResult
}
```

## Dependências

- Nenhuma dependência NPM externa
- Node.js stdlib apenas

## Gargalos

1. **Integração limitada** - Módulos não são usados automaticamente pelo state-machine
2. **Cobertura incompleta** - Faltam validadores para alguns tipos de artefatos

---

*Analisado em: 2026-02-28*
