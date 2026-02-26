---
platform: dev.to
title: "Implementando um TDD Loop Controller em TypeScript"
tags: ["typescript", "tdd", "clean-code", "software-engineering"]
status: draft
created_at: "2026-02-27"
---

# Implementando um TDD Loop Controller em TypeScript

O padrão TDD (Test-Driven Development) segue o ciclo **Red-Green-Refactor**:
1. **RED**: Escreva um teste que falha
2. **GREEN**: Faça o código passar no teste
3. **REFACTOR**: Melhore o código mantendo os testes passando

Recentemente implementei um `TDDLoopController` em TypeScript que orquestra esse ciclo como uma máquina de estados robusta.

## A Estrutura

```typescript
export enum TDDPhase {
  IDLE = 'IDLE',
  RED = 'RED',
  GREEN = 'GREEN',
  REFACTOR = 'REFACTOR',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}
```

## Dependency Injection

Uma das decisões de design mais importantes foi usar injeção de dependência para as funções geradoras:

```typescript
export interface TestGenerator {
  generateTest(taskDescription: string, context?: Record<string, unknown>): Promise<string>;
  validateTest(testCode: string): Promise<boolean>;
}

export interface ImplementationGenerator {
  generateImplementation(
    taskDescription: string,
    testCode: string,
    testOutput: string,
    context?: Record<string, unknown>
  ): Promise<string>;
}

export interface TestRunner {
  runTests(testCode: string, implementationCode: string): Promise<TestResult>;
}
```

Isso permite que o controller seja testado unitariamente eque você troque as implementações (mock LLM, LLM real, etc.).

## Validação do Ciclo TDD

Um ponto crítico: **o teste deve falhar na fase RED**. Se o teste passa sem implementação, rejeitamos como inválido:

```typescript
if (redResult.testOutput.includes('PASS') || redResult.testOutput.includes('SUCCESS')) {
  throw new Error(
    'INVALID_TEST: Test passed without implementation. ' +
    'TDD requires RED phase to fail.'
  );
}
```

## Controles de Segurança

O controller tem limites configuráveis para evitar loops infinitos:
- `maxIterationsPerPhase` (padrão: 5)
- `maxTotalIterations` (padrão: 15)
- `timeoutMs` (padrão: 60000)

## Conclusão

O resultado é um orchestrator testável e flexível que segue rigorosamente o contrato TDD. O código está disponível em `src/execution/tdd/loop-controller.ts`.

