# Análise de Domínio: state-machine

## Visão Geral

State machine central do projeto vibe-flow para gerenciamento de workflow e qualidade.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/state-machine/index.ts` | Barrel exports principal |
| `src/state-machine/quality-gate.ts` | Quality Gate Interceptor |
| `src/state-machine/security-guard.ts` | SecurityGuard para scanning |
| `src/state-machine/state-drift-detector.ts` | Detector de drift de estado |
| `src/state-machine/orchestrator.ts` | Orquestrador de fases |
| `src/state-machine/project-classifier.ts` | Classificador de projetos |

## Interfaces Públicas

```typescript
// quality-gate.ts
export class QualityGateInterceptor {
  verifyQualityGate(state: ProjectState): Promise<QualityGateResult>
}

export interface QualityCheck {
  name: string
  passed: boolean
  details: string
  severity: 'error' | 'warning' | 'info'
}

// security-guard.ts
export class SecurityGuard {
  runSecurityScan(): Promise<SecurityQualityCheck>
  checkContent(content: string): SecurityQualityCheck
  isSecure(content: string): boolean
}
```

## Integração Atual

O `QualityGateInterceptor` já possui integração com:
- ✅ State Drift Detection
- ✅ Architecture Guard
- ✅ SecurityGuard (OWASP scanning)

## Dependências

- Módulos internos: `../security/`, `../architecture/`
- Node.js stdlib

## Gargalos

1. **Security scan não automatic** - Precisa ser chamado manualmente
2. **Falta CLI** - Não há comando para executar security scan isoladamente

---

*Analisado em: 2026-02-28*
