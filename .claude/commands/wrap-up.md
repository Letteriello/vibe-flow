# Wrap-Up: Checklist Automatizado de Fim de Sessão

Você é um agente de encerramento de sessão. Execute **todas as 4 fases abaixo em sequência, sem pedir aprovação** entre elas. Ao final, imprima o relatório consolidado.

> **Gatilhos:** "wrap up", "close session", "end session", `/wrap-up`

---

## FASE 0 — 🔄 Verificação de Análise Pendente

Antes de tudo, verifique se a análise do projeto está atualizada:

1. Leia `docs/architecture/_meta.json` (se existir).
2. Compare `last_analyzed_commit` com o HEAD atual.
3. Conte quantos commits existem desde a última análise (`git rev-list --count {last_commit}..HEAD`).
4. Se houver **5 ou mais commits** desde a última análise, registre no relatório final:
   `"⚠️ Análise do projeto desatualizada ({N} commits desde a última). Recomendado: rodar /analyze"`
5. Se `docs/architecture/diagnostics.md` existir, leia a seção de 🚨 Bloqueadores e liste-os no relatório como aviso.
6. Se `docs/planning/tasks.md` existir, leia as tasks e atualize o status:
   - Tasks cujos arquivos de ownership já existem e testes passam → marque `✅ Done`
   - Tasks cujos arquivos foram criados mas testes falham → marque `🔧 Em progresso`
   - Tasks sem arquivos criados → mantenha `📋 Pendente`
   - Registre o progresso no relatório: "{N}/{Total} tasks concluídas"

7. Se `docs/planning/.workers/` existir, faça limpeza de workers:
   - Leia todos os `*.json` e identifique workers com `last_heartbeat` > 30 min → renomeie para `*.dead.json`
   - Consolide `completed_tasks` de todos os workers (ativos + mortos) no relatório
   - Registre progresso: "{N}/{Total} tasks concluídas por {M} workers"
8. Se `docs/planning/qa-report.md` existir, leia o veredito:
   - Se 🔴 REPROVADO → Emita aviso forte: `"🚨 QA REPROVADO — deploy bloqueado. Corrija os bloqueadores antes ou rode /qa novamente após os fixes."`
   - Se 🟡 RESSALVAS → Emita aviso: `"⚠️ QA com ressalvas — deploy possível mas revise os itens pendentes."`
   - Se ✅ APROVADO → Registre: `"✅ QA aprovado — pronto para deploy."`

---

## FASE 1 — 🚀 Ship It (Entrega)

### 1.1 Commit & Push

1. Execute `git status` na raiz do projeto.
2. Se houver alterações não commitadas (staged ou unstaged):
   - Faça `git add -A`.
   - Gere uma mensagem de commit descritiva seguindo Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:` etc.). Se múltiplos escopos foram alterados, use um commit por escopo lógico.
   - Execute `git commit` e depois `git push origin HEAD`.
3. Se não houver alterações, registre "✅ Working tree limpa — nada para commitar".

### 1.2 Organização de Arquivos

1. Leia as convenções de nomenclatura e estrutura de pastas definidas em `CLAUDE.md`, `.claude/rules/` ou nos configs do projeto (`tsconfig.json`, `pyproject.toml`, `.editorconfig` etc.).
2. Liste todos os arquivos criados ou modificados nesta sessão (`git diff --name-only HEAD~N..HEAD` onde N = número de commits desta sessão, ou use o contexto da conversa).
3. Para cada arquivo, verifique:
   - Nome segue a convenção (kebab-case, PascalCase, snake_case — conforme definido).
   - Está na pasta correta conforme a arquitetura do projeto.
4. Se houver violações: renomeie/mova automaticamente, atualize imports afetados e faça um commit adicional `chore: organize file structure`.

### 1.3 Deploy & Tarefas

1. Verifique se existe script de deploy no projeto:
   - Procure em: `package.json` (scripts: deploy/release), `Makefile`, `deploy.sh`, `Procfile`, CI configs (`.github/workflows/`).
   - Se encontrar **e** a branch atual for a principal (`main`/`master`), execute o script de deploy.
   - Se não encontrar, registre "ℹ️ Nenhum script de deploy encontrado — pulando".
2. Verifique listas de tarefas:
   - Procure em: `TODO.md`, `tasks.md`, comentários `// TODO` nos arquivos alterados, issues referenciadas em commits.
   - Marque como concluídos (`[x]`) os itens que foram resolvidos nesta sessão.
   - Sinalize itens órfãos (pendentes sem progresso) com `⚠️ PENDENTE` para visibilidade.

---

## FASE 2 — 🧠 Remember It (Memorização)

Analise toda a conversa desta sessão e extraia conhecimentos. Para cada item, decida o nível correto de persistência e grave automaticamente:

### 2.1 Hierarquia de Memória

| Destino | O que salvar | Exemplo |
|---|---|---|
| **Auto memory** (memória do Claude) | Insights de debug, peculiaridades do projeto, preferências do usuário, padrões descobertos | "Este projeto usa Zustand em vez de Redux", "O usuário prefere early returns" |
| **CLAUDE.md** (raiz do projeto) | Convenções permanentes, comandos úteis, decisões arquiteturais, stack definida | "Sempre usar `pnpm` neste projeto", "API segue padrão REST com versionamento em /v1/" |
| **`.claude/rules/*.md`** | Regras modulares que se aplicam a tipos de arquivo ou pastas específicas | "Em `src/components/`: todo componente deve exportar tipos Props", "Em `tests/`: usar `describe/it` do Vitest" |
| **CLAUDE.local.md** | Contexto efêmero, privado, não versionado (URLs locais, credenciais de teste, caminhos absolutos da máquina) | "Dev server roda em http://localhost:3247", "DB de teste: postgres://dev:dev@localhost/testdb" |

### 2.2 Procedimento

1. Extraia os conhecimentos da sessão.
2. Antes de gravar, leia o conteúdo atual de cada arquivo de destino para evitar duplicatas.
3. Adicione os novos itens sob seções organizadas (crie seções se necessário).
4. Para `CLAUDE.local.md`: crie o arquivo se não existir e adicione ao `.gitignore` se ainda não estiver lá.
5. Para auto memory: use linguagem concisa e objetiva.
6. Se `docs/architecture/file-registry.md` existir, verifique se arquivos criados nesta sessão estão registrados. Se não, adicione-os com status `🆕 Novo — pendente análise completa`.
7. Registre no relatório final o que foi salvo e onde.

---

## FASE 3 — 🔍 Review & Apply (Revisão e Aplicação)

Analise a conversa inteira buscando oportunidades de autoaperfeiçoamento. Classifique cada achado em uma das categorias abaixo e **aplique a melhoria imediatamente**:

### 3.1 Categorias

| Categoria | Descrição | Ação automática |
|---|---|---|
| 🐛 **Lacuna de habilidade** | Erros que cometi, abordagens incorretas, falhas de raciocínio | Adicionar regra preventiva em `.claude/rules/` ou `CLAUDE.md` para evitar recorrência |
| 🧱 **Atrito** | Passos manuais que poderiam ser automáticos, fluxos repetitivos | Criar spec de nova skill em `.claude/commands/` ou adicionar alias/script ao projeto |
| 📚 **Conhecimento faltante** | Informações que eu não tinha e precisei que o usuário corrigisse | Registrar na memória ou `CLAUDE.md` para referência futura |
| ⚡ **Oportunidade de automação** | Tarefas recorrentes detectadas que poderiam virar comandos | Redigir rascunho de nova skill em `.claude/commands/` com nome descritivo |

### 3.2 Procedimento

1. Revisar cada mensagem da conversa.
2. Para cada achado, classificar e executar a ação correspondente.
3. Se criar uma nova skill, seguir o formato padrão de `.claude/commands/` com instruções claras.
4. Consolidar tudo na seção de relatório.

---

## FASE 4 — 📝 Publish It (Publicação)

Examine a sessão em busca de conteúdo publicável. Procure por:

- 🔧 **Soluções técnicas** incomuns ou elegantes
- 🐛 **Histórias de debug** interessantes (o problema, a investigação, a solução)
- 🚀 **Anúncios de feature** (algo novo e útil foi construído)
- 📖 **Conteúdo educacional** (padrões, arquitetura, boas práticas demonstradas)
- 💡 **Descobertas** sobre ferramentas, bibliotecas ou fluxos de trabalho

### 4.1 Procedimento

1. Se nenhum conteúdo publicável for encontrado, registre "ℹ️ Nenhum conteúdo publicável identificado nesta sessão" e siga em frente.
2. Se encontrar material relevante:
   - Crie a pasta `drafts/` na raiz do projeto (se não existir). Adicione `drafts/` ao `.gitignore`.
   - Redija um rascunho em Markdown com estrutura adequada para a plataforma sugerida (Reddit, Dev.to, blog pessoal, Twitter/X thread, LinkedIn).
   - Nome do arquivo: `drafts/YYYY-MM-DD-titulo-slug.md`
   - Inclua no topo do arquivo um frontmatter com: `platform`, `title`, `tags`, `status: draft`, `created_at`.
   - O tom deve ser autêntico e prático — como um dev explicando para outro dev.

---

## 📊 RELATÓRIO FINAL

Após completar todas as fases, imprima um relatório consolidado no seguinte formato:

```
╔══════════════════════════════════════════════════╗
║           📋 WRAP-UP REPORT — SESSION END        ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  🔄 ANALYSIS STATUS                             ║
║  └─ {✅ Atualizada | ⚠️ Desatualizada (N commits)} ║
║     {Lista de Bloqueadores ativos, se houver}    ║
║                                                  ║
║  🎯 PLANNING STATUS                             ║
║  └─ {N}/{Total} tasks concluídas ({%})           ║
║     Fase atual: {A | B | C | completo}           ║
║                                                  ║
║  🚀 SHIP IT                                     ║
║  ├─ Commits: {N} commits enviados               ║
║  ├─ Arquivos reorganizados: {lista ou "nenhum"}  ║
║  ├─ Deploy: {executado | não encontrado | N/A}   ║
║  └─ Tarefas: {N concluídas, N pendentes}         ║
║                                                  ║
║  🧠 REMEMBER IT                                  ║
║  ├─ Auto memory: {N itens salvos}                ║
║  ├─ CLAUDE.md: {N itens adicionados}             ║
║  ├─ .claude/rules/: {N regras atualizadas}       ║
║  └─ CLAUDE.local.md: {N itens adicionados}       ║
║                                                  ║
║  🔍 REVIEW & APPLY                               ║
║  ├─ Lacunas de habilidade: {N} corrigidas        ║
║  ├─ Atritos removidos: {N}                       ║
║  ├─ Conhecimentos registrados: {N}               ║
║  └─ Novas skills criadas: {N}                    ║
║                                                  ║
║  📝 PUBLISH IT                                   ║
║  └─ Rascunhos gerados: {N} → drafts/             ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

Em seguida, liste brevemente os itens mais relevantes de cada seção (1-2 linhas por item) para que o desenvolvedor tenha um resumo rápido do que aconteceu.