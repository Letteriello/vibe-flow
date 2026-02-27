import { buildTestGenerationPrompt, buildImplementationPrompt, TDDTask } from '../../src/execution/tdd/prompts';

describe('TDD Prompts', () => {
  describe('buildTestGenerationPrompt', () => {
    it('should generate a RED phase prompt with task details', () => {
      const task: TDDTask = {
        featureName: 'sum',
        description: 'Add two numbers together',
        expectedBehavior: 'Returns the sum of two numbers',
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).toContain('Test Generation (TDD - RED Phase)');
      expect(prompt).toContain('sum');
      expect(prompt).toContain('Add two numbers together');
      expect(prompt).toContain('Write ONLY test code');
      expect(prompt).toContain('Do NOT implement the solution');
    });

    it('should include constraints when provided', () => {
      const task: TDDTask = {
        featureName: 'divide',
        description: 'Divide two numbers',
        expectedBehavior: 'Returns quotient or throws on zero',
        constraints: ['Throw Error when divisor is zero', 'Return number type'],
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).toContain('## Constraints');
      expect(prompt).toContain('Throw Error when divisor is zero');
      expect(prompt).toContain('Return number type');
    });

    it('should include existing code context when provided', () => {
      const task: TDDTask = {
        featureName: 'calculate',
        description: 'Calculate something',
        expectedBehavior: 'Returns calculated value',
        existingCode: 'function helper() { return 1; }',
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).toContain('## Existing Code Context');
      expect(prompt).toContain('function helper()');
    });

    it('should not include constraints section when empty', () => {
      const task: TDDTask = {
        featureName: 'test',
        description: 'Test feature',
        expectedBehavior: 'Works',
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).not.toContain('## Constraints');
    });

    it('should emphasize not writing implementation', () => {
      const task: TDDTask = {
        featureName: 'multiply',
        description: 'Multiply numbers',
        expectedBehavior: 'Returns product',
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).toContain('Do NOT write implementation code');
      expect(prompt).toContain('RED phase');
    });
  });

  describe('buildImplementationPrompt', () => {
    it('should generate a GREEN phase prompt with test code', () => {
      const task: TDDTask = {
        featureName: 'sum',
        description: 'Add two numbers',
        expectedBehavior: 'Returns sum',
      };
      const testCode = 'expect(sum(2, 3)).toBe(5);';

      const prompt = buildImplementationPrompt(task, testCode);

      expect(prompt).toContain('Implementation (TDD - GREEN Phase)');
      expect(prompt).toContain('sum');
      expect(prompt).toContain('expect(sum(2, 3)).toBe(5)');
      expect(prompt).toContain('Write ONLY the implementation');
    });

    it('should include test errors when provided', () => {
      const task: TDDTask = {
        featureName: 'add',
        description: 'Add numbers',
        expectedBehavior: 'Returns sum',
      };
      const testCode = 'expect(add(1, 2)).toBe(3);';
      const testErrors = ['Expected: 3, Received: undefined'];

      const prompt = buildImplementationPrompt(task, testCode, testErrors);

      expect(prompt).toContain('## Test Failures');
      expect(prompt).toContain('Expected: 3, Received: undefined');
    });

    it('should not include errors section when not provided', () => {
      const task: TDDTask = {
        featureName: 'test',
        description: 'Test',
        expectedBehavior: 'Works',
      };

      const prompt = buildImplementationPrompt(task, 'test code');

      expect(prompt).not.toContain('## Test Failures');
    });

    it('should emphasize making tests pass', () => {
      const task: TDDTask = {
        featureName: 'calculate',
        description: 'Calculate',
        expectedBehavior: 'Returns result',
      };
      const testCode = 'expect(calculate(10)).toBe(20);';

      const prompt = buildImplementationPrompt(task, testCode);

      expect(prompt).toContain('Make tests pass');
      expect(prompt).toContain('Do NOT modify tests');
      expect(prompt).toContain('GREEN phase');
    });

    it('should include constraints when provided', () => {
      const task: TDDTask = {
        featureName: 'divide',
        description: 'Divide',
        expectedBehavior: 'Returns quotient',
        constraints: ['Use integer division', 'Round down'],
      };
      const testCode = 'expect(divide(7, 2)).toBe(3);';

      const prompt = buildImplementationPrompt(task, testCode);

      expect(prompt).toContain('## Constraints');
      expect(prompt).toContain('Use integer division');
    });
  });

  describe('TDDTask interface', () => {
    it('should accept full task object', () => {
      const task: TDDTask = {
        featureName: 'fullTask',
        description: 'Full description',
        expectedBehavior: 'Expected behavior',
        inputOutput: { input: '5', expectedOutput: '10' },
        constraints: ['constraint1'],
        existingCode: 'existing code',
      };

      const prompt = buildTestGenerationPrompt(task);

      expect(prompt).toContain('fullTask');
      expect(prompt).toContain('Full description');
      expect(prompt).toContain('Expected behavior');
      expect(prompt).toContain('constraint1');
      expect(prompt).toContain('existing code');
    });
  });
});
