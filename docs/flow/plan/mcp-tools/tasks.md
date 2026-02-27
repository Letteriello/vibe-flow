# Tasks - MCP Tools Expansion

## Feature: Expansão de Ferramentas MCP

### Tasks de Implementação

| ID | Task | Arquivo/Contrato | Prioridade |
|----|------|------------------|------------|
| TASK-001 | Criar tipo AdversarialReviewParams | `src/types.ts` | Alta |
| TASK-002 | Implementar função adversarial_review | `src/mcp/adversarial-review.ts` | Alta |
| TASK-003 | Registrar ferramenta no MCPServer | `src/mcp/official-server.ts` | Alta |
| TASK-004 | Criar tipo SecurityScanParams | `src/types.ts` | Média |
| TASK-005 | Implementar wrapper analyze_security | `src/mcp/security-analyzer.ts` | Média |
| TASK-006 | Criar tipo QualityCheckParams | `src/types.ts` | Média |
| TASK-007 | Implementar wrapper analyze_quality | `src/mcp/quality-analyzer.ts` | Média |
| TASK-008 | Adicionar testes unitários | `tests/unit/adversarial-review.test.ts` | Alta |
| TASK-009 | Verificar build | npm run build | Alta |

### Contratos

#### TASK-001: AdversarialReviewParams
```typescript
// Adicionar em src/types.ts
export interface AdversarialReviewParams {
  files: string[];
  focusAreas?: ('bug' | 'logical_flaw' | 'security_vulnerability' | 'anti_pattern' | 'performance_issue' | 'code_smell' | 'spec_violation')[];
  compareWithSpec?: boolean;
  projectPath?: string;
}

export interface AdversarialReviewResult {
  findings: ReviewFinding[];
  summary: {
    total: number;
    critical: number;
    warnings: number;
  };
}

export interface ReviewFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  description: string;
  suggestion?: string;
}
```

#### TASK-002: adversarial_review function
```typescript
// src/mcp/adversarial-review.ts
export async function adversarialReview(params: AdversarialReviewParams): Promise<AdversarialReviewResult> {
  // 1. Ler arquivos especificados
  // 2. Executar análise adversarial
  // 3. Detectar bugs, vulnerabilidades, flaws
  // 4. Retornar resultados estruturados
}
```

### Dependências Entre Tasks

```
TASK-001 ──┬──> TASK-002 ──> TASK-003 ──> TASK-008 ──> TASK-009
           │
           ├──> TASK-004 ──> TASK-005 ──> TASK-008
           │
           └──> TASK-006 ──> TASK-007 ──> TASK-008
```

### Critérios de Conclusão

- [ ] TASK-001: Tipo AdversarialReviewParams criado
- [ ] TASK-002: Função adversarial_review implementada
- [ ] TASK-003: Ferramenta registrada no MCP server
- [ ] TASK-004: Tipo SecurityScanParams criado
- [ ] TASK-005: Wrapper analyze_security implementado
- [ ] TASK-006: Tipo QualityCheckParams criado
- [ ] TASK-007: Wrapper analyze_quality implementado
- [ ] TASK-008: Testes unitários passando
- [ ] TASK-009: Build compila com sucesso
