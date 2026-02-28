# PRD - Feature 003: QA Report Generator

## 1. Visão Geral

**Feature:** Geração Automatizada de qa-report.md

### Objetivo
Consolidar todos os achados de qualidade (security, tests, build) em relatório unificado gerado automaticamente durante wrap-up.

---

## 2. Requisitos Funcionais

### RF-001: Execução Unificada
- Executa: build, tests, lint, security
- Timeout por verificação (default: 60s)
- Continua mesmo se uma falhar

### RF-002: Relatório Markdown
- Salvo em `docs/planning/qa-report.md`
- Formato markdown com tables

### RF-003: Veredito Consolidado
- FAIL se qualquer verificação tem bloqueador
- WARNING se há warnings
- PASS se tudo ok

### RF-004: Bloqueio de Wrap-up
- Se FAIL → wrap-up bloqueado
- Flag `--force` para override

---

## 3. Tarefas

| Task | Descrição |
|------|-----------|
| DEV-011 | Criar qa-report/types.ts |
| DEV-012 | Implementar QAReportGenerator |
| DEV-013 | Implementar collectors |
| DEV-014 | Integrar ao WrapUp |
| DEV-015 | CLI qa:verify |

---

## 4. Critérios de Conclusão

- [ ] Relatório gerado automaticamente
- [ ] Veredito calculado corretamente
- [ ] Bloqueio funciona
- [ ] CLI disponível
