/**
 * TDD Prompt Builders
 *
 * Specialized prompts that enforce test-first methodology.
 * Addresses the common LLM pattern of writing tests AND implementation together,
 * breaking true TDD principles.
 */

/**
 * Task description for TDD workflow
 */
export interface TDDTask {
  featureName: string;
  description: string;
  expectedBehavior: string;
  inputOutput?: {
    input: string;
    expectedOutput: string;
  };
  constraints?: string[];
  existingCode?: string;
}

/**
 * Generates a prompt for test-only generation (RED phase of TDD).
 *
 * This prompt enforces that the agent writes ONLY test code that makes
 * assertions about APIs that don't exist yet.
 *
 * @param task - The TDD task description
 * @returns Formatted prompt string for test generation
 */
export function buildTestGenerationPrompt(task: TDDTask): string {
  const constraintsSection = task.constraints?.length
    ? `\n## Constraints\n${task.constraints.map(c => `- ${c}`).join('\n')}`
    : '';

  const existingCodeSection = task.existingCode
    ? `\n## Existing Code Context\n\`\`\`\n${task.existingCode}\n\`\`\``
    : '';

  return `# Test Generation (TDD - RED Phase)

## Objective
Write ONLY test code. Do NOT implement the solution. The tests should fail initially (RED).

## Feature Description
**Name:** ${task.featureName}
**Description:** ${task.description}
**Expected Behavior:** ${task.expectedBehavior}
${constraintsSection}
${existingCodeSection}

## Instructions

1. **Write only tests** - Create test cases that assert the expected behavior
2. **Assume APIs don't exist** - Call functions/methods that will be implemented later
3. **Use descriptive test names** - Make the test intent clear
4. **Include multiple test cases** - Cover happy path, edge cases, and error conditions
5. **Do NOT write implementation code** - Only tests should be generated

## Output Format

Provide ONLY the test code. No explanations, no implementation stubs, no TODO comments with implementation details.

\`\`\`typescript
// Your test code here
\`\`\`

## Example

If the task is "implement a sum function":
- ✅ Write: \`expect(sum(2, 3)).toBe(5)\`
- ❌ Do NOT write: \`function sum(a, b) { return a + b }\`

Remember: You are in the RED phase. Tests should fail. Implementation comes next.
`;
}

/**
 * Generates a prompt for implementation based on failing tests (GREEN phase of TDD).
 *
 * This prompt injects the test code and requires the agent to write ONLY
 * the implementation needed to make tests pass.
 *
 * @param task - The TDD task description
 * @param testCode - The generated test code to satisfy
 * @param testErrors - Optional array of specific test errors/failures
 * @returns Formatted prompt string for implementation
 */
export function buildImplementationPrompt(
  task: TDDTask,
  testCode: string,
  testErrors?: string[]
): string {
  const errorsSection = testErrors && testErrors.length
    ? `\n## Test Failures (Review Carefully)\n${testErrors.map(e => `- ${e}`).join('\n')}`
    : '';

  const constraintsSection = task.constraints?.length
    ? `\n## Constraints\n${task.constraints.map(c => `- ${c}`).join('\n')}`
    : '';

  return `# Implementation (TDD - GREEN Phase)

## Objective
Write ONLY the implementation needed to make the tests pass. Follow test-first mindset.

## Task Context
**Name:** ${task.featureName}
**Description:** ${task.description}
**Expected Behavior:** ${task.expectedBehavior}
${constraintsSection}

## Tests to Satisfy
\`\`\`typescript
${testCode}
\`\`\`
${errorsSection}

## Instructions

1. **Read the tests carefully** - Understand what they expect
2. **Implement only what's needed** - No extra features, no over-engineering
3. **Make tests pass** - Every assertion must succeed
4. **Do NOT modify tests** - Tests are the contract, implementation adapts
5. **Keep it simple** - Minimal code that satisfies the contract

## Output Format

Provide ONLY the implementation code. No tests, no explanations.

\`\`\`typescript
// Your implementation here
\`\`\`

## Mindset

You are in the GREEN phase. The tests define the contract. Your job is to fulfill that contract with minimal, focused code.

- ✅ Write exactly what's needed for tests to pass
- ❌ Don't add features not tested
- ❌ Don't write "flexible" solutions beyond test requirements
- ❌ Don't refactor existing code unnecessarily

Make the tests green first. Refactor later (in the REFACTOR phase, not covered here).
`;
}
