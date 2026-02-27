# Análise de Domínio: Security (Segurança)

## Arquivos (13)

| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| Secret Scanner | secret-scanner.ts, secrets-detector.ts, scanner.ts | Detecção de credenciais |
| OWASP | owasp-rules.ts, rules.ts | Regras OWASP |
| Headers | headers-validator.ts | Validação de headers HTTP |
| Types | types.ts | Tipos compartilhados |

## Arquivos (26) - Validation

| Módulo | Arquivos | Descrição |
|--------|----------|------------|
| Gate Keeper | gate-keeper.ts, readiness-gate.ts | Portões de qualidade |
| Cross Rule | cross-rule.ts | Validação cruzada PRD vs Arquitetura |
| Drift Detector | drift-detector.ts | Detecção de drift impl vs spec |
| Preflight | preflight-checker.ts, preflight-ui.ts | Checagens pré-build |
| Spec | spec-validator.ts, spec-versioning.ts | Validação de especificações |
| Quality | code-quality-guard.ts, quality-reporter.ts | Guardrails de código |
| Human Review | human-review-gate.ts | Revisão humana |
| Structural | structural-check.ts | Checagem estrutural |

## Padrões Detectados

### SecretScanner
- 40+ padrões RegEx para segredos: AWS keys, JWT, OpenAI, GitHub, Stripe, PEM/RSA
- 11 padrões de prompt injection
- SecurityFinding com severity: critical/high/medium/low/info
- Métodos estáticos: scanPayload(), scanForSecrets(), hasPromptInjection()

### OWASP
- rules.ts: 13+ regras de segurança
- owasp-rules.ts: Compliance OWASP Top 10
- HeadersValidator: security headers HTTP

### Validation
- CrossRuleValidator: compara artefatos (PRD vs Architecture)
- DriftDetector: Levenshtein similarity para detecção
- GateKeeper: Pipeline de validação com threshold
- PreflightChecker: 8+ checagens pré-build

## Interfaces Públicas

```typescript
// Security
SecurityFinding, SecurityReport, ScanResult
SecretScanner: scanPayload(), scanForSecrets(), hasPromptInjection()

// Validation
CrossRuleValidator, CrossRuleStatus
DriftType, DriftSeverity, DriftReport
ValidationResult, ValidationGate
PreflightResult, ReadinessLevel
```

## Dependências Externas

- Nenhum package.json externo
- Zero-dependency para máximo de portabilidade

## Gargalos

| Severidade | Item | Descrição |
|------------|------|----------|
| Nenhum | - | Módulos robustos |
| Info | secrets-detector.ts | Duplicado funcional de secret-scanner.ts |

## Recomendação para Auth System

Para implementar sistema de autenticação:
- ✅ SecretScanner já detecta exposição de tokens/JWT
- ✅ CrossRuleValidator pode validar spec de auth
- ✅ GateKeeper pode validar critérios de segurança
- Criar módulo de auth validation (password strength, JWT format)
