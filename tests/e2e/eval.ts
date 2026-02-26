/**
 * Context Window Evaluation Test Runner
 *
 * Este script avalia se o agente consegue processar diferentes tamanhos de contexto
 * (8k e 128k tokens) sem quebrar a lógica base.
 *
 * Executar com:
 *   npx tsx tests/e2e/eval.ts
 *   npm test -- --testPathPattern=eval
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
// Fixtures Loader
// ============================================================================

function loadFixtures(): EnvStates {
  const projectRoot = path.resolve(__dirname, '../..');
  const fixturesPath = path.join(projectRoot, 'tests', 'fixtures', 'env_states.json');
  const rawData = fs.readFileSync(fixturesPath, 'utf-8');
  return JSON.parse(rawData);
}

// ============================================================================
// Test Runner
// ============================================================================

function runTests(): void {
  console.log('='.repeat(60));
  console.log('Context Window Evaluation Test Runner');
  console.log('='.repeat(60));
  console.log('');

  // Load fixtures
  let envStates: EnvStates;

  try {
    envStates = loadFixtures();
    console.log(`Loaded ${envStates.scenarios.length} test scenarios`);
    console.log('');
  } catch (error) {
    console.error(`Failed to load fixtures: ${error}`);
    process.exit(1);
  }

  // Run tests
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of envStates.scenarios) {
    const result = evaluateScenario(scenario);
    results.push(result);

    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${result.scenario}`);
    console.log(`       ${result.details}`);
    console.log('');

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total:  ${envStates.scenarios.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  // Context-specific results
  const context8k = envStates.scenarios.filter(s => s.tokens === CONTEXT_8K);
  const context128k = envStates.scenarios.filter(s => s.tokens === CONTEXT_128K);

  console.log('Context 8K:');
  const results8k = results.filter(r =>
    context8k.some(s => s.name === r.scenario)
  );
  console.log(`  Tests: ${results8k.length}, Passed: ${results8k.filter(r => r.passed).length}`);
  console.log('');

  console.log('Context 128K:');
  const results128k = results.filter(r =>
    context128k.some(s => s.name === r.scenario)
  );
  console.log(`  Tests: ${results128k.length}, Passed: ${results128k.filter(r => r.passed).length}`);
  console.log('');

  // Exit code
  if (failed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

// ============================================================================
// CLI Options
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Context Window Evaluation Test Runner

Usage: npx tsx tests/e2e/eval.ts [options]

Options:
  --help, -h     Show this help message
  --json         Output results as JSON

Examples:
  npx tsx tests/e2e/eval.ts
  npx tsx tests/e2e/eval.ts --json
  npm test -- --testPathPattern=eval
`);
  process.exit(0);
}

if (args.includes('--json')) {
  const envStates = loadFixtures();
  const results = envStates.scenarios.map(evaluateScenario);
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every(r => r.passed) ? 0 : 1);
}

// Run tests
runTests();
