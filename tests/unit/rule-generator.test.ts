// Unit tests for RuleGenerator
import { RuleGenerator, ImprovementFindings, SkillGap, SystemicError } from '../../src/wrap-up/self-improve/rule-generator.js';

describe('RuleGenerator', () => {
  const testWorkspacePath = '/tmp/test-workspace';

  describe('applyRules', () => {
    it('should generate rules for skill gaps', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          {
            area: 'nextjs-routing',
            description: 'Falha ao implementar rotas dinâmicas no Next.js',
            severity: 'high',
            context: 'Tentativa de usar params em page.tsx'
          }
        ],
        systemicErrors: []
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].filename).toBe('router-rules.md');
      expect(rules[0].category).toBe('nextjs-routing');
    });

    it('should generate rules for systemic errors', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [],
        systemicErrors: [
          {
            category: 'typescript',
            message: "Type 'string' is not assignable to type 'number'",
            frequency: 3,
            rootCause: 'Interface com tipos incompatíveis'
          }
        ]
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].filename).toBe('typescript-rules.md');
    });

    it('should handle multiple errors and merge rules', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          { area: 'react-hooks', description: 'useEffect dependency array', severity: 'medium' },
          { area: 'typescript', description: 'Type inference', severity: 'low' }
        ],
        systemicErrors: [
          { category: 'null-undefined', message: 'Cannot read property', frequency: 2 }
        ]
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getFileContents', () => {
    it('should return simulated file contents in dry-run mode', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          { area: 'security', description: 'Secret scanning', severity: 'high' }
        ],
        systemicErrors: []
      };

      const generator = new RuleGenerator(testWorkspacePath);
      await generator.applyRules(findings, testWorkspacePath);

      const contents = generator.getFileContents();
      expect(contents.size).toBeGreaterThan(0);
    });
  });

  describe('category mapping', () => {
    it('should map nextjs-routing to router-rules.md', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          { area: 'nextjs-routing', description: 'Test', severity: 'low' }
        ],
        systemicErrors: []
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules[0].filename).toBe('router-rules.md');
    });

    it('should map react-hooks to react-hooks-rules.md', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          { area: 'react-hooks', description: 'Test', severity: 'low' }
        ],
        systemicErrors: []
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules[0].filename).toBe('react-hooks-rules.md');
    });

    it('should map unknown categories to general-errors.md', async () => {
      const findings: ImprovementFindings = {
        skillGaps: [
          { area: 'unknown-category', description: 'Test', severity: 'low' }
        ],
        systemicErrors: []
      };

      const generator = new RuleGenerator(testWorkspacePath);
      const rules = await generator.applyRules(findings, testWorkspacePath);

      expect(rules[0].filename).toBe('general-errors.md');
    });
  });
});
