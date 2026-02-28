# PRD: Correções de Segurança Críticas - vibe-flow

## Meta
- **Status:** draft
- **Criado em:** 2026-02-28
- **Atualizado em:** 2026-02-28
- **Baseado na análise:** Auditoria de segurança do codebase

---

## 1. Contexto e Problema

O sistema de segurança do vibe-flow apresenta vulnerabilidades críticas e deficiências de cobertura que precisam ser corrigidas:

### Problemas Atuais

1. **Path Traversal via Symlinks (CRÍTICO)**
   - O `SecurityScanner.findScannableFiles()` em `src/security/scanner.ts:441-474` não valida symlinks
   - Um atacante pode criar symlinks para fora do diretório do projeto
   - Permite leitura de arquivos arbitrários do sistema

2. **Cobertura OWASP Insuficiente**
   - Apenas 8 regras de hardcoded secrets em `owasp-rules.ts`
   - Falta cobertura para: A01 (Broken Access Control), A04 (XXE), A06 (Vulnerable Components), A07 (Auth Failures), A09 (Security Logging)
   - Total de ~23 regras vs. necessidade de 50+ para cobertura adequada

3. **Padrões de Detecção Simplistas**
   - XSS: apenas `innerHTML` e `dangerouslySetInnerHTML` (falta `insertAdjacentHTML`, `document.write`, etc.)
   - SQL Injection: padrões básicos sem cobertura para NoSQL, GraphQL
   - Command Injection: regex simplificado, não detecta spawn options array

4. **Cache de Regex Não Implementado**
   - Cada scan recompila os patterns RegExp
   - `secret-scanner.ts` e `owasp-rules.ts` não usam memoization
   - Impacto: 3-5x mais lento em scans repetidos

5. **Performance Issues em runSecurityScan**
   - `findScannableFiles()` faz I/O síncrono em cascata
   - Não há parallelização para leitura de arquivos
   - Sem early termination otimizado
   - Scan completo de projetos grandes timeout

---

## 2. Objetivo

Corrigir todas as vulnerabilidades críticas de segurança e expandir a cobertura OWASP para atender aos padrões da indústria.

### Critérios de Sucesso

| Métrica | Atual | Meta |
|---------|-------|------|
| Path Traversal via symlinks | Vulnerável | Bloqueado |
| Regras OWASP Totais | ~23 | 50+ |
| Cobertura OWASP Top 10 | ~30% | 80%+ |
| Tempo de scan (100 arquivos) | ~5000ms | <1000ms |
| Cache de regex | Não | Sim |
| Regras XSS | 2 | 8+ |
| Regras SQLi | 5 | 15+ |
| Regras Command Injection | 1 | 6+ |

---

## 3. Escopo

### 3.1 Incluso (Must Have)

1. **Correção de Path Traversal via Symlinks**
   - Validar que symlinks apontam para dentro do projeto
   - Implementar allowlist de diretórios permitidos
   - Rejeitar symlinks que apontam para fora do projeto

2. **Expansão de Regras OWASP**
   - Adicionar 30+ novas regras de detecção
   - Cobrir categorias ausentes: A01, A04, A06, A07, A09

3. **Melhoria de Padrões de Detecção**
   - XSS: +6 padrões (insertAdjacentHTML, document.write, eval-based, etc.)
   - SQL Injection: +10 padrões (NoSQL, ORM, GraphQL)
   - Command Injection: +5 padrões (spawn options, shell=True, etc.)

4. **Implementação de Cache de Regex**
   - Memoização de padrões RegExp compilados
   - TTL configurável para invalidação
   - Interface singleton para acesso global

5. **Otimização de Performance**
   - Leitura paralela de arquivos
   - Early termination por threshold
   - Streaming para arquivos grandes

### 3.2 Incluso (Should Have)

1. **Relatório de Cobertura OWASP**
   - Métricas por categoria OWASP
   -heatmap de vulnerabilidades

2. **Modo Fast para CI/CD**
   - Scan rápido com subset de regras críticas
   - Configurável via environment variable

### 3.3 Fora de Escopo (Won't Have - this release)

- Integração com ferramentas externas (Snyk, Dependabot)
- Scanning de dependências npm/pip
- Varredura de imagens container
- Compliance reporting (SOC2, ISO27001)

---

## 4. Requisitos Funcionais

| ID | Requisito | Prioridade | Depende de |
|----|-----------|-----------|------------|
| RF-001 | Bloquear path traversal via symlinks | Must | - |
| RF-002 | Adicionar 30+ novas regras OWASP | Must | - |
| RF-003 | Implementar cache de regex com memoização | Must | - |
| RF-004 | Expandir detecção XSS para 8+ padrões | Must | RF-002 |
| RF-005 | Expandir detecção SQLi para 15+ padrões | Must | RF-002 |
| RF-006 | Expandir detecção Command Injection para 6+ padrões | Must | RF-002 |
| RF-007 | Implementar leitura paralela de arquivos | Must | - |
| RF-008 | Adicionar early termination por threshold | Should | RF-007 |
| RF-009 | Gerar relatório de cobertura OWASP | Should | RF-002 |
| RF-010 | Implementar modo fast para CI | Should | - |

---

## 5. Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF-001 | Performance de scan | < 1000ms para 100 arquivos |
| RNF-002 | Tempo de inicialização do cache | < 50ms |
| RNF-003 | Memory overhead do cache | < 10MB |
| RNF-004 | Cobertura OWASP Top 10 | 80%+ das categorias |
| RNF-005 | Backward compatibility | APIs existentes inalteradas |

---

## 6. Restrições Técnicas

- **Stack:** TypeScript, Node.js (sem mudanças de runtime)
- **Padrões:** Manter interfaces existentes (`SecurityScanResult`, `Vulnerability`)
- **Integrações:** Integrar com `src/security/scanner.ts`, `src/security/owasp-rules.ts`
- **Áreas sensíveis:** `findScannableFiles()` em scanner.ts (path traversal)

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Breaking changes em APIs existentes | Alta | Alto | Manter interfaces, adicionar novos métodos |
| Regex DoS (catastrophic backtracking) | Média | Alto | Usar atomic groups, limitar repetitions |
| Falsos positivos em novas regras | Média | Médio | Testes extensivos, allowlists |
| Performance degrade com mais regras | Baixa | Médio | Cache, parallelização |

---

## 8. Métricas de Sucesso

- [ ] Path traversal via symlinks bloqueado (teste com symlink para /etc/passwd)
- [ ] 50+ regras OWASP implementadas
- [ ] 8+ padrões XSS detectados
- [ ] 15+ padrões SQLi detectados
- [ ] 6+ padrões Command Injection detectados
- [ ] Cache de regex reduzindo tempo em 3x
- [ ] Scan de 100 arquivos em < 1 segundo
- [ ] Todos os testes existentes passando

---

## 9. Arquitetura Proposta

```
src/security/
├── scanner.ts           (existing - needs symlink fix)
├── owasp-rules.ts       (existing - expand rules)
├── secret-scanner.ts    (existing - add cache)
├── regex-cache.ts       (NEW - memoization)
├── symlink-guard.ts     (NEW - path traversal fix)
├── performance-optimizer.ts (NEW - parallelization)
└── index.ts            (update exports)
```
