# PRD - Feature 002: Agentic-Map Tool

## 1. Visão Geral

**Feature:** Agentic-Map Tool
**Pipeline:** flow-20260227-quality-gates

### Objetivo
Criar estrutura baseada em LCM (Language Model Context Management) para gerenciar execuções de sub-tarefas em sessões isoladas, permitindo execução paralela sem degradação de contexto.

---

## 2. Requisitos Funcionais

### RF-001: Isolamento de Contexto
- Cada sub-tarefa recebe snapshot isolado do contexto base
- Contexto anterior descartado após conclusão
- Outputs sãoados ao contexto principal merge

### RF-002: Task Graph Explícito
- Grafo definido em JSON/TypeScript
- Suporta dependências: `dependsOn: [taskId]`
- Detecção de ciclos

### RF-003: Executor com Isolamento
- Cada tarefa executa em processo isolado
- Timeout configurável
- Captura de output

### RF-004: MCP Tool
- `agentic_map_execute` tool disponível

---

## 3. Tarefas

| Task | Descrição |
|------|-----------|
| DEV-006 | Criar agentic-map/types.ts |
| DEV-007 | Implementar AgenticMapCore |
| DEV-008 | Implementar ContextIsolation |
| DEV-009 | Implementar Executor |
| DEV-010 | Expor via MCP tool |

---

## 4. Critérios de Conclusão

- [ ] TaskGraph valida dependências
- [ ] Executor isolado funciona
- [ ] MCP tool exposta
- [ ] Testes passando
