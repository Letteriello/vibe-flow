# PRD - Expansão de Ferramentas MCP

## Feature: MCP Tools Expansion

### Visão Geral
Expadir as ferramentas MCP existentes do vibe-flow para incluir funcionalidades de AI Code Review, tornando o sistema mais útil para análise de código.

### Problema
O vibe-flow atualmente tem 11 ferramentas MCP básicas. Para se tornar um sistema completo de AI Code Review, precisa de ferramentas especializadas.

### Solução
Adicionar novas ferramentas MCP especializadas em review de código:
1. `adversarial_review` - Review adversarial de código
2. `analyze_security` - Análise de segurança
3. `analyze_quality` - Análise de qualidade de código

### Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-001 | Ferramenta adversarial_review | Recebe array de paths, executa review cético identificando bugs, vulnerabilidades, flaws lógicos |
| RF-002 | Ferramenta analyze_security | Escaneia código para padrões OWASP, detecta credenciais expostas, XSS, injection |
| RF-003 | Ferramenta analyze_quality | Analisa qualidade AST, detecta imports órfãos, anomalias sintáticas |

### Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-001 | Performance | Análise < 5s por arquivo |
| RNF-002 | Compatibilidade | Funciona em Windows e Unix |
| RNF-003 | TypeScript | 100% tipado, zero erros de compilação |

### Interfaces

```typescript
interface AdversarialReviewParams {
  files: string[];
  focusAreas?: ('bug' | 'logical_flaw' | 'security_vulnerability' | 'anti_pattern')[];
  compareWithSpec?: boolean;
}

interface SecurityScanParams {
  path: string;
  patterns?: string[];
}

interface QualityCheckParams {
  path: string;
  severity?: 'error' | 'warning' | 'info';
}
```

### Dependências Existentes

- `src/security/secret-scanner.ts` - Reutilizar para RF-002
- `src/quality/ast-checker.ts` - Reutilizar para RF-003
- `src/mcp/official-server.ts` - Estender server existente
- `src/mcp/permission-guard.ts` - Verificações de permissão

### Escopo

**Incluído:**
- Novas ferramentas MCP
- Integração com módulos existentes
- testes unitários

**Excluído:**
- Interface visual
- Integração com serviços externos
- Dashboard de métricas

### Critérios de Conclusão

- [ ] 3 novas ferramentas MCP funcionando
- [ ] Testes unitários passando
- [ ] Build compila sem erros
- [ ] Documentação atualizada
