# Plano de Correção: Conflito de Interface TestResult

## Análise do Problema

### Definições Conflitantes

| Arquivo | Linha | Campos |
|---------|-------|--------|
| `src/execution/tdd/loop-controller.ts` | 25 | `success`, `output`, `error`, `duration` |
| `src/execution/tdd/test-runner.ts` | 8 | `passed`, `failedTests`, `errorOutput` |

### Contexto de Uso

- **tdd-coordinator.ts** (linha 14): importa `TestResult` de `loop-controller.ts`
- **tdd-coordinator.ts** (linha 15): importa `TestRunner` classe de `test-runner.ts`
- **tdd-coordinator.ts** (linhas 730-749): faz mapeamento manual entre os dois formatos

### Problema Adicional

`loop-controller.ts` (linha 91) define uma interface `TestRunner` diferente da classe `TestRunner` em `test-runner.ts`. A interface é usada para injeção de dependência.

---

## Opções de Correção

### Opção A: Unificar em Tipo Compartilhado

**Abordagem:** Criar um tipo único em um arquivo compartilhado (`src/execution/tdd/types.ts`) e remover as definições duplicadas.

**Prós:**
- Elimina completamente a duplicação
- Facilita manutenção futura
- Tipo único para toda a aplicação
- Funciona bem com o mapeamento já existente no coordinator

**Contras:**
- Requer modificar 3 arquivos
- Quebra se outros módulos dependerem das definições antigas
- Requer atualizar exports no index.ts

**Arquivos a modificar:**
1. Criar `src/execution/tdd/types.ts` com tipo unificado
2. Modificar `loop-controller.ts` para importar de `types.ts`
3. Modificar `test-runner.ts` para importar de `types.ts`
4. Modificar `tdd-coordinator.ts` para usar tipo importado corretamente
5. Atualizar `src/execution/tdd/index.ts` com exports

---

### Opção B: Usar Aliases para Distinguir

**Abordagem:** Renomear as interfaces para nomes distintos e manter o mapeamento existente.

- `TestResult` em `loop-controller.ts` -> `TDDTestResult`
- `TestResult` em `test-runner.ts` -> `TestExecutionResult`

**Prós:**
- Mudança mínima no código
- Sem risco de quebrar dependências externas
- Mantém semântica distinta (resultado TDD vs resultado de execução)

**Contras:**
- Não resolve a duplicação conceitual
- Mantém código redundante
- Requer atualização no coordinator (imports)

**Arquivos a modificar:**
1. Renomear em `loop-controller.ts` (linha 25)
2. Renomear em `test-runner.ts` (linha 8)
3. Atualizar imports/exports no `tdd-coordinator.ts`
4. Atualizar referências internas (linha 95 de loop-controller)

---

### Opção C: Mapeamento Explícito no Coordinator (Recomendada)

**Abordagem:** Manter as definições separadas (cada uma com seu propósito), masClarificar o mapeamento no coordinator com funções utilitárias.

**Prós:**
- Cada tipo tem propósito claro e distinto
- `TestResult` do loop-controller = resultado de uma iteração TDD
- `TestResult` do test-runner = resultado de execução real de testes
- Mínimo de mudanças nos arquivos existentes
- Facilita debug e manutenção

**Contras:**
- Duplicação permanece (mas justificada semanticamente)
- Requer atenção ao usar imports

**Arquivos a modificar:**
1. Adicionar função auxiliar de mapeamento em `tdd-coordinator.ts`
2. Atualizar import do TestRunner para usar alias
3. Criar tipo interno para mapear entre os dois

---

## Recomendação

**Escolher Opção C** pelos seguintes motivos:

1. **Semântica distinta:** Os dois tipos representam conceitos diferentes
   - `loop-controller.ts::TestResult` = resultado de execução no contexto TDD (phase, attempts)
   - `test-runner.ts::TestResult` = resultado raw de execução de testes (failedTests, errorOutput)

2. **Mínima invasão:** Não requer reescrever exports ou criar novos arquivos

3. **Documentação implícita:** O mapeamento explícito no coordinator serve como documentação

---

## Plano de Execução (Opção C)

### Passo 1: Adicionar tipo auxiliar no tdd-coordinator.ts

Adicionar função de mapeamento após os imports:

```typescript
// Mapping between TestResult from TestRunner and TDDTestResult
function mapTestRunnerResult(result: import('../tdd/test-runner').TestResult): import('../tdd/loop-controller').TestResult {
  return {
    success: result.passed,
    output: result.errorOutput,
    duration: 0
  };
}
```

### Passo 2: Atualizar método runTest

Substituir o mapeamento inline (linhas 738-742) pela função auxiliar.

### Passo 3: Verificar build

Executar `npm run build` para validar.

### Passo 4: Executar testes

Executar `npm test` para garantir que nada quebrou.

---

## Impacto em Outras Partes

| Componente | Impacto | Ação Necessária |
|------------|---------|-----------------|
| `loop-controller.ts` | Nenhum | Manter como está |
| `test-runner.ts` | Nenhum | Manter como está |
| `tdd-coordinator.ts` | Baixo | Adicionar função de mapeamento |
| `src/execution/tdd/index.ts` | Nenhum | Já não exporta esses tipos |

---

## Risco Residual

**Baixo.** A correção é localizada e não afeta outras partes do sistema. O mapeamento já existe, apenas será formalizado.
