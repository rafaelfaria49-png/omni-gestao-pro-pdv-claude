# Ratificação documental — OPS-V4-DATAS-UI-PROMOCAO-001

Data: 13/10/2026. Trilha: `ops-v4-datas-ui-promocao`.
Autorização humana específica: criação e ratificação documental por `init`,
incluindo apenas o cadastro desta trilha em `protocol.json`.
O PR documental aguarda aprovação humana e merge. Não há autorização
de execução funcional, merge de produto, push de produto ou deploy.

## Fontes e preservação

Fontes lidas em
`C:/Projetos/omni-gestao/docs/ai-execution/_evidence/OPS-V4-DATAS-UI-PROMOCAO-001/proposta/`:

| Fonte preservada | SHA-256 |
| --- | --- |
| `CONTRATO-DE-PROMOCAO.md` | `a790dffc8b3a119d66a7937aab2de22790ab2b284bdb7818e75a4b5e90e95ee1` |
| `OPS-V4-DATAS-UI-PROMOCAO-001.md` | `f82e77726dd81655b8947289a325dfe06db12dd7e42802c5c278bbdc65675734` |
| `TRACK.md` | `2a2c5dd097e72e358153dd5b35a3da3cf63190e444eecd69f44277c4f0e9eb0f` |

Os originais permanecem na worktree principal sem edição. Este PR
materializa o TRACK e o GOAL autorizados e consolida aqui o contrato;
não inclui os arquivos WIP da principal nem o ROADMAP_FINANCEIRO.md.
As propostas históricas não liberam gates nem comprovam execução.

Documentação canônica conferida na main: `ENTRYPOINT.md`,
`EXECUTION_PROTOCOL.md`, `TASK_LEVELS.md`, `protocol.json`,
`executors.json` e a implementação de `scripts/track.mjs`.

## Pré-flight e base efetivamente atualizada

- `git fetch origin main` e `git ls-remote origin refs/heads/main`:
  `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`. A referência anterior continua sendo a main vigente.
- `verify --all` antes de `init`: exit 0, nenhuma divergência nas 10 trilhas.
- Nenhum cadastro local, diretório da trilha nas worktrees, branch remota
  ou PR aberto correspondente foi encontrado antes do registro.
- Worktree de governança esparsa, isolada e limpa na criação; branch
  `codex/ops-v4-datas-ui-promocao-plan`, baseada nessa main.
- Espaço livre observado no pré-flight: 12.637.716.480 bytes,
  aproximadamente 11,77 GiB. O ambiente funcional não foi liberado.
  Nenhuma dependência instalada, build ou teste de produto executado.
- Principal ocupada, HEAD `5ae661d730af827006fd10c389ddbdd4f18edc51`;
  seus arquivos modificados e não rastreados foram inventariados por hash.
- Experimento limpo, HEAD `183898ee9fa34f0ae6e8ee4feebdd52eef74b301`;
  branch `experiment/ops-v4-editar-os-datas-ui-001`, sem `.aep-active`.
- Candidato financeiro limpo, HEAD `a50a40ce6bd9cc8324309d730ed12af7735f39ed`;
  branch `goal/ops-v4-financeiro-retirada-garantia-002`, sessão AEP existente preservada.

## Experimento e allowlist exata

Base original: `1fd90905e05656444576cf83c9df6c46919a917a`.
HEAD esperado e encontrado: `183898ee9fa34f0ae6e8ee4feebdd52eef74b301`.
Quatro commits preservados, em ordem:

1. `1079da972c329def62c85327ec2cb9cdb8c9434f`: resumo de datas persistidas,
   acesso ao editor auditado existente e testes.
2. `53696cba5cb4b3afbec2dacb2ca14b865a4c31e8`: teclado e mobile.
3. `a08b4605283338ec4a2238fd61136ee3aef31324`: foco e Entrada ocupada.
4. `183898ee9fa34f0ae6e8ee4feebdd52eef74b301`: overlays, atalhos e foco.

Diff base → HEAD: **18 arquivos, 1.637 inserções e 47 deleções**.
A comparação entre os caminhos reais e a allowlist não tem faltantes,
extras, curingas ou duplicatas: 11 arquivos funcionais e 7 de teste/fixture.

- `components/operacoes-v4-preview/parts/CorrigirDatasModalV4.tsx`
- `components/operacoes-v4-preview/parts/atendimento/AtendimentoModalShell.tsx`
- `components/operacoes-v4-preview/parts/stages/EntradaSections.tsx`
- `components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx`
- `components/operacoes-v4-preview/parts/stages/entrada-workspace.module.css`
- `components/operacoes-v4-preview/types.ts`
- `components/operacoes-v4-preview/use-entrada-ocupada.ts`
- `components/operacoes-v4-preview/use-v4-preview.ts`
- `components/painel-inicial/Topbar.tsx`
- `components/painel-inicial/workspace-focus-context.tsx`
- `components/ui/command.tsx`
- `test/ops-v4-datas-ui-001/browser/fixture.tsx`
- `test/ops-v4-datas-ui-001/browser/index.html`
- `test/ops-v4-datas-ui-001/browser/p2-check.mjs`
- `test/ops-v4-datas-ui-001/browser/qa.css`
- `test/ops-v4-datas-ui-001/browser/stubs.ts`
- `test/ops-v4-datas-ui-001/entrada-datas.test.tsx`
- `test/ops-v4-datas-ui-001/vitest.config.ts`

`git diff --name-status <base> origin/main -- <18 caminhos>` não retornou
alterações. A base comum continua sendo a base original; a divergência
experimento...main é 4/10 commits. O plano promove o resumo
`DatasAtendimentoSection`, o editor e os corretivos existentes, sem
reconstruir interface ou criar outro writer.

O futuro transporte será um merge normal com dois pais do SHA completo,
na branch funcional `codex/ops-v4-datas-ui-promocao-001`, baseada na main
vigente já integrada ao financeiro 002. Os quatro SHAs permanecem ancestrais.
Não usar rebase, cherry-pick, reset, force push, squash, amend, cópia de
arquivos como substituto de histórico ou resolução integral ours/theirs.
Se houver outro host, transportar objetos por bundle validado, sem publicar
a branch experimental; não gerar bundle nesta rodada.

## Metadados e comando de teste

GOAL **READY**, `plan_rev: 1`, classe **C3**, risco **ALTO**,
`familia_executor: "openai"`, `revisao_independente: true`,
`reversibilidade: "alta"`, `read_budget: 48`,
`gates_liberados: []`.
Branch e worktree funcionais permanecem os propostos; esta worktree
documental não pode ser usada para executar `open`.

Comando dedicado validado pelo parser oficial e inspeção da config no
experimento, sem execução:

```text
node node_modules/vitest/vitest.mjs run --config test/ops-v4-datas-ui-001/vitest.config.ts
```

A config existente seleciona `test/ops-v4-datas-ui-001/*.test.tsx`, usa
jsdom e cobre o arquivo de teste incluído. A main declara Vitest e jsdom.
Nenhum dos 18 caminhos toca gates universais de caminho; nenhum gate foi
liberado. O comando dedicado não comprova integração, build, persistência,
garantia, revisão R ou a cobertura de regressões exigida.

## Dependência obrigatória antes de open

**GOAL 002 financeiro DONE e mergeado na main é pré-condição para executar `open` da promoção.**

Identificador: `OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002`. Na main conferida
seu último evento ratificado ainda é BLOCKED, com o 002 no caminho quente
e 003 como próximo. Isso não comprova DONE, aprovação ou merge.
Até DONE + merge normal do 002 na main, só planejamento é permitido.

Reconciliar `use-v4-preview.ts` exclusivamente na futura branch de promoção,
por trecho e com a base comum real. Preservar os contratos financeiros A–E,
forma explícita, pendência compartilhada de recebimento, identidade/replay
e `comercial={codigo,destino}` oficialmente integrados pelo 002. Preservar
`alvoCorrecaoDatas`, carga confirmada por loja/OS, `useEntradaOcupadaV4`,
`runEntradaWrite`, ocupação viva, rascunhos e respostas tardias.
Não substituir o hook inteiro nem transplantar o candidato financeiro.
Conflito fora da allowlist exige replanejamento humano.

003 não é pré-requisito de planejamento e não será iniciado por esta trilha.
Se já estiver integrado na execução futura, reconferir datas/garantia
na main resultante; incompatibilidade exige decisão formal. 008 permanece
fora do escopo, assim como migrations e evolução financeira.

## Gates funcionais pendentes

Todos permanecem pendentes; nenhuma evidência anterior aprova o candidato
integrado:

1. Planejamento aprovado e mergeado na main; financeiro 002 DONE e integrado;
   SHA de origem confirmado; checkout funcional limpo e ambiente liberado.
2. Build Next integral no SHA exato, com Node compatível, disco/memória
   suficientes, cliente Prisma já gerado e QA isolado, sem migration
   ou credenciais de produção. Evitar o wrapper de deploy.
3. Aplicativo Next integrado: Entrada/menu/editor existente, Topbar/paleta,
   outros consumidores dos modais, loja/OS, rascunhos, sucesso/recusa,
   recarga, teclado e mobile.
4. Recuperar inventário/comandos das 333 regressões anteriores e rodar todos
   sem skips, somando testes novos e do 002 integrado; registrar diferenças
   e contagem final. Incluir configs de datas-retroativas, fluxo-curto,
   fluxo-curto-002 até -007 e financeiro-001/002. A lista não prova a soma 333.
5. Runner existente completo de 20 casos sem filtro, mais cenários do Next
   integrado. O runner sintético de Vite/Edge não prova Next/DB/garantia.
6. Datas/garantia: fuso/precisão, cadastro distinto da entrada física,
   ausência de entrega, ordem/limites, motivo/permissão, CAS, auditoria e
   confirmação de impacto na garantia. Rollback de código não desfaz
   correções operacionais já gravadas.
7. Lint/typecheck, allowlist, ancestralidade, `verify`, `verify --all`,
   `check` e R independente válida sobre o SHA exato: APPROVE,
   P0=P1=P2=0, P3 registrados. Preferência `claude-code`/`anthropic`,
   declarada e elegível; OpenAI não é R desta autoria.

Comandos adicionais existentes, somente para a futura validação:

```text
node test/ops-v4-datas-ui-001/browser/p2-check.mjs <diretorio-de-evidencias> integrado
node node_modules/next/dist/bin/next build --webpack
```

Configurações com PostgreSQL exigem bancos descartáveis e prefixos próprios,
sem produção. Não alterar suítes/configs fora da allowlist. Logs, JSONs,
screenshots e hashes ficam em artefatos externos de runner/CI com destinos
declarados antes de `open`. Não ampliar a allowlist para logs.
O `check` atual não automatiza todos esses gates. Nova main após `open`
exige parar e replanejar por merge normal; não editar `.aep-active`.
Qualquer novo SHA exige revalidação e nova R.

## Rito documental e ponto de parada

Verificações documentais realizadas após a materialização:

- `node scripts/track.mjs registry`: exit 0, derivados oficiais gerados.
- `node scripts/track.mjs verify ops-v4-datas-ui-promocao`: exit 0.
- `node scripts/track.mjs verify --all`: exit 0, 11 trilhas sem divergências.
- `git diff --check`: exit 0.
- `status` da nova trilha: zero eventos ratificados e nenhuma sessão aberta.

Executar `init`, materializar TRACK/GOAL e gerar derivados por `registry`;
verificar a trilha e todas as trilhas. Não editar state/ledger/REGISTRY/GATES
manualmente nem gerar DONE, BLOCKED ou SUPERSEDED deste GOAL.

O commit documental usa `AEP_WRITE=1` somente no rito de planejamento
de `EXECUTION_PROTOCOL.md` §§2 e 14, com caminhos explícitos restritos
a `docs/execution-tracks/` e `docs/ai-execution/`. A autorização G-AEP-CORE
abrange só o novo cadastro. Regras, gates, adapters, executores e entradas
existentes permanecem equivalentes. Usar os hooks existentes no commit;
não alterar a configuração compartilhada.

O estado derivado RUNNING é consequência automática do GOAL READY;
ledger vazio e ausência de `.aep-active` demonstram que não houve execução.
Parar após abrir o PR documental e conferir arquivos/checks.
Não fazer merge sem nova aprovação humana, não executar `open`/`close`,
merge do experimento, push de produto, deploy, migrations, 003 ou 008.

Data efetiva por pagamento, Caixa/períodos fechados, relatórios por base
temporal e identidade/idempotência de estornos continuam no roadmap futuro,
fora deste PR e deste GOAL.
