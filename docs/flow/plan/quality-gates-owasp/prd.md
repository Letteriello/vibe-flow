# PRD - Feature 001: Quality Gates OWASP

## 1. Visão Geral

**Feature:** Bloqueio via Quality Gates (OWASP)
**Pipeline:** flow-20260227-quality-gates
**Data:** 2026-02-28

### Objetivo
Integrar os módulos de segurança existentes ao state-machine para criar Quality Gates determinísticos que bloqueiem commits que falhem no scanner OWASP antes do wrap-up.

---

## 2. Requisitos Funcionais

### RF-001: Execução Automática de Security Scan

- Scan executa automaticamente ao tentar transicionar para WRAP_UP
- Tempo máximo: 60 segundos
- Escaneia arquivos TypeScript/JavaScript modificados

### RF-002: Bloqueio de Commits

- CRITICAL vulnerabilities bloqueiam
- HIGH vulnerabilities bloqueiam (por padrão)
- MEDIUM geram warning

### RF-003: Resumo de Vulnerabilidades

- Lista cada vulnerability: tipo, severidade, arquivo, linha
- Sugere remediation

### RF-004: Configuração de Thresholds

- Configurável via JSON ou ambiente
- Por padrão: CRITICAL + HIGH bloqueiam

### RF-005: CLI Command

- `npm run security:scan`
- `--format json|table`

---

## 3. Arquitetura

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/state-machine/security-gate.ts` | CRIAR |
| `src/state-machine/quality-gate.ts` | MODIFICAR |
| `.vibe-flow/security-gate.json` | CRIAR |
| `package.json` | MODIFICAR (script) |

---

## 4. Tarefas

| Task | Descrição |
|------|-----------|
| DEV-001 | Criar security-types.ts |
| DEV-002 | Configurar security-gate.json |
| DEV-003 | Integrar SecurityGuard ao QualityGate |
| DEV-004 | CLI command |
| DEV-005 | Testes unitários |

---

## 5. Critérios de Conclusão

- [ ] Security scan executa automaticamente
- [ ] Commits com CRITICAL/HIGH são bloqueados
- [ ] CLI command disponível
- [ ] Testes passando
