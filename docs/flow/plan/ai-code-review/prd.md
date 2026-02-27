# PRD: AI Code Review Feature

## 1. Visão Geral

**Feature:** AI Code Review
**Pipeline:** flow-20260227-auth
**Objetivo:** Adicionar capacidade de revisão de código com IA ao vibe-flow, aproveitando os módulos existentes de qualidade (ai-patterns-detector, ast-checker, guardrails).

## 2. Contexto

O vibe-flow já possui módulos de qualidade:
- `src/quality/ai-patterns-detector.ts` - Detecta padrões problemáticos em código gerado por IA
- `src/quality/ast-checker.ts` - Verifica anomalias de sintaxe e imports órfãos
- `src/quality/guardrails.ts` - Valida código contra regras de qualidade

A feature AI Code Review deve unificar esses módulos em uma experiência coesa de revisão de código, integrada ao CLI e às ferramentas MCP.

## 3. Objetivos de Negócio

| ID | Objetivo | Métrica |
|----|----------|---------|
| OB-001 | Revisão automática de código via CLI | Comando `vibe-flow review <path>` disponível |
| OB-002 | Integração MCP para ferramentas de review | Ferramenta `review_code` disponível via MCP |
| OB-003 | Detecção de code smells específicos de IA | 15+ padrões detectados |
| OB-004 | Relatório de review em formato estruturado | JSON/Markdown output |

## 4. Requisitos Funcionais

### RF-001: CLI Review Command
- Comando: `vibe-flow review [path] [--format json|markdown] [--severity low|medium|high|critical]`
- Aceita path de arquivo ou diretório
- Executa análise completa usando módulos existentes
- Retorna relatório formatado

### RF-002: MCP Tool - review_code
- Input: code (string), language (string optional), options (object optional)
- Output: ReviewResult com issues[], score, summary
- Integração com tools/lcm-tools.ts

### RF-003: Pattern Detection
- Reutilizar `ai-patterns-detector.ts` para detectar:
  - Comentários excessivos
  - TODOs vagos
  - Nomes genéricos de variáveis
  - Código boilerplate
  - Estruturas complexas demais

### RF-004: AST Analysis
- Utilizar `ast-checker.ts` para:
  - Imports órfãos
  - Syntax anomalies
  - Unclosed braces/brackets

### RF-005: Scoring System
- Calcular score de 0-100 baseado em:
  - Número de issues por severidade
  - Peso: critical=10, high=5, medium=2, low=1
  - Formula: `score = 100 - (weighted_issues / lines_of_code * 100)`

### RF-006: Report Output
- Formato JSON:
```json
{
  "file": "src/foo.ts",
  "score": 85,
  "issues": [
    { "type": "naming", "severity": "medium", "line": 10, "message": "...", "suggestion": "..." }
  ],
  "summary": "3 issues found",
  "linesOfCode": 150
}
```
- Formato Markdown: tabela com issues

## 5. Arquitetura

```
src/
├── cli.ts (adicionar comando 'review')
├── quality/
│   ├── index.ts (exportar reviewCode review/
│       ├── index.ts       )
│   └── # ReviewOrchestrator
│       ├── scorer.ts       # Scoring logic
│       ├── formatter.ts    # JSON/Markdown output
│       └── types.ts        # ReviewResult, ReviewOptions
└── mcp/
    └── tools/
        └── review-tool.ts  # MCP tool wrapper
```

## 6. Interfaces

### ReviewOptions
```typescript
interface ReviewOptions {
  format: 'json' | 'markdown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  includeSuggestions: boolean
  maxIssues: number
}
```

### ReviewResult
```typescript
interface ReviewResult {
  file: string
  score: number
  issues: ReviewIssue[]
  summary: string
  linesOfCode: number
  analyzedAt: string
}

interface ReviewIssue {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  line?: number
  column?: number
  message: string
  suggestion?: string
}
```

## 7. Critérios de Conclusão

- [ ] Comando `vibe-flow review` funcionando
- [ ] Ferramenta MCP `review_code` disponível
- [ ] 15+ padrões de IA detectados
- [ ] Score calculado corretamente
- [ ] Output JSON e Markdown funcionando
- [ ] Integração com módulos existentes (ai-patterns-detector, ast-checker)
- [ ] Testes unitários para o módulo de review

## 8. Dependências

- Módulos existentes: ai-patterns-detector, ast-checker, guardrails
- Node.js stdlib (fs, path)
- Nenhuma nova dependência externa
