/**
 * Context Window Evaluation Test Runner
 *
 * Este script avalia se o agente consegue processar diferentes tamanhos de contexto
 * (8k e 128k tokens) sem quebrar a lógica base.
 *
 * Executar com:
 *   npm test -- --testPathPattern=eval
 *   npx jest tests/e2e/eval.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface Scenario {
  name: string;
  description: string;
  tokens: number;
  charCount: number;
  expectedBehavior: 'SUCCESS' | 'FAILURE';
  payload: {
    messages: Array<{ role: string; content: string }>;
    contextWindow: {
      maxTokens: number;
      usedTokens: number;
      remainingTokens: number;
    };
    fileTree: string[];
    activeFile: string | null;
  };
}

interface EnvStates {
  scenarios: Scenario[];
  testConfig: {
    maxTokens8k: number;
    maxTokens128k: number;
    charLimitMultiplier: number;
    successThreshold: number;
    failureThreshold: number;
  };
}

interface TestResult {
  scenario: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONTEXT_8K = 8192;
const CONTEXT_128K = 131072;

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Simula a lógica do agente para determinar sucesso ou falha
 * baseado no limite de caracteres lidos.
 */
function simulateAgentBehavior(scenario: Scenario): 'SUCCESS' | 'FAILURE' {
  const { contextWindow } = scenario.payload;
  const { maxTokens, usedTokens, remainingTokens } = contextWindow;
  const charCount = scenario.charCount;

  // Regra 1: Se tokens restantes são negativos, houve overflow
  if (remainingTokens < 0) {
    return 'FAILURE';
  }

  // Regra 2: Se utilizado > 95% da janela, risco de falha
  const usageRatio = usedTokens / maxTokens;
  if (usageRatio > 0.95) {
    // Ainda pode funcionar se não houver muita pressão
    if (remainingTokens < 1000 && charCount > maxTokens * 3) {
      return 'FAILURE';
    }
  }

  // Regra 3: Verificação de limite de caracteres
  // Assume que 1 token ≈ 3 caracteres (média comum)
  const estimatedCharLimit = 3;

  if (charCount > maxTokens * estimatedCharLimit * 1.2) {
    return 'FAILURE';
  }

  // Regra 4: Cenário de overflow explícito
  if (usedTokens > maxTokens) {
    return 'FAILURE';
  }

  return 'SUCCESS';
}

/**
 * Avalia se o agente retornaria sucesso ou falha para um cenário
 */
function evaluateScenario(scenario: Scenario): TestResult {
  const actual = simulateAgentBehavior(scenario);
  const expected = scenario.expectedBehavior;
  const passed = actual === expected;

  let details = '';
  if (passed) {
    details = `Agent correctly ${actual === 'SUCCESS' ? 'succeeded' : 'failed'} for ${scenario.tokens} token context`;
  } else {
    details = `Expected ${expected} but got ${actual}. Tokens: ${scenario.payload.contextWindow.usedTokens}/${scenario.payload.contextWindow.maxTokens}, Chars: ${scenario.charCount}`;
  }

  return {
    scenario: scenario.name,
    expected,
    actual,
    passed,
    details,
  };
}

// ============================================================================
// Test Fixtures Loader
// ============================================================================

function loadFixtures(): EnvStates {
  // Resolve from project root
  const projectRoot = path.resolve(__dirname, '../..');
  const fixturesPath = path.join(projectRoot, 'tests', 'fixtures', 'env_states.json');
  const rawData = fs.readFileSync(fixturesPath, 'utf-8');
  return JSON.parse(rawData);
}

// ============================================================================
// Jest Tests
// ============================================================================

describe('Context Window Evaluation', () => {
  const envStates = loadFixtures();

  describe('Small Context (8K tokens)', () => {
    const smallContextScenarios = envStates.scenarios.filter(
      s => s.tokens === CONTEXT_8K
    );

    test('small_context_8k should return SUCCESS', () => {
      const scenario = smallContextScenarios.find(s => s.name === 'small_context_8k');
      expect(scenario).toBeDefined();
      const result = evaluateScenario(scenario!);
      expect(result.actual).toBe('SUCCESS');
    });

    test('context_overflow_8k should return FAILURE', () => {
      const scenario = smallContextScenarios.find(s => s.name === 'context_overflow_8k');
      expect(scenario).toBeDefined();
      const result = evaluateScenario(scenario!);
      expect(result.actual).toBe('FAILURE');
    });
  });

  describe('Massive Context (128K tokens)', () => {
    const massiveContextScenarios = envStates.scenarios.filter(
      s => s.tokens === CONTEXT_128K
    );

    test('massive_context_128k should return SUCCESS', () => {
      const scenario = massiveContextScenarios.find(s => s.name === 'massive_context_128k');
      expect(scenario).toBeDefined();
      const result = evaluateScenario(scenario!);
      expect(result.actual).toBe('SUCCESS');
    });

    test('context_exact_limit_128k should return SUCCESS', () => {
      const scenario = massiveContextScenarios.find(s => s.name === 'context_exact_limit_128k');
      expect(scenario).toBeDefined();
      const result = evaluateScenario(scenario!);
      expect(result.actual).toBe('SUCCESS');
    });
  });

  describe('Context Overflow Detection', () => {
    test('detects overflow when remainingTokens < 0', () => {
      const overflowScenario = envStates.scenarios.find(
        s => s.name === 'context_overflow_8k'
      );
      expect(overflowScenario).toBeDefined();

      const result = evaluateScenario(overflowScenario!);
      expect(result.actual).toBe('FAILURE');
    });

    test('handles exact limit correctly', () => {
      const exactLimitScenario = envStates.scenarios.find(
        s => s.name === 'context_exact_limit_128k'
      );
      expect(exactLimitScenario).toBeDefined();

      const result = evaluateScenario(exactLimitScenario!);
      expect(result.actual).toBe('SUCCESS');
    });
  });

  describe('Overall Validation', () => {
    test('all scenarios should pass validation', () => {
      const results = envStates.scenarios.map(evaluateScenario);
      const failed = results.filter(r => !r.passed);

      if (failed.length > 0) {
        console.error('Failed scenarios:', failed.map(f => f.details));
      }

      expect(failed).toHaveLength(0);
    });
  });
});

// ============================================================================
// CLI Runner (exported for direct execution)
// ============================================================================

export { evaluateScenario, simulateAgentBehavior, loadFixtures };

// Allow direct execution via: npx ts-node tests/e2e/eval.test.ts
// Note: For ESM, use: npx tsx tests/e2e/eval.test.ts
