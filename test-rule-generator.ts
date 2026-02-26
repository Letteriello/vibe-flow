// Quick test for RuleGenerator
import { RuleGenerator, ImprovementFindings } from './wrap-up/index.js';

const findings: ImprovementFindings = {
  skillGaps: [
    {
      area: 'nextjs-routing',
      description: 'Falha ao implementar rotas dinâmicas no Next.js 14 com App Router',
      severity: 'high',
      context: 'Tentativa de usar params em page.tsx sem Promise'
    }
  ],
  systemicErrors: [
    {
      category: 'typescript',
      message: "Type 'string' is not assignable to type 'number'",
      frequency: 3,
      rootCause: 'Interface com tipos incompatíveis entre propriedades'
    }
  ]
};

const generator = new RuleGenerator('.', true); // dryRun=true
const rules = await generator.applyRules(findings, '.');

console.log('\n=== Regras Geradas ===');
for (const rule of rules) {
  console.log('\nArquivo:', rule.filename);
  console.log('Categoria:', rule.category);
  console.log('---');
  console.log(rule.content.substring(0, 600) + '...');
}

console.log('\n=== Arquivos simulados ===');
const contents = generator.getFileContents();
for (const [filename, content] of contents) {
  console.log(`- ${filename}: ${content.length} chars`);
}
