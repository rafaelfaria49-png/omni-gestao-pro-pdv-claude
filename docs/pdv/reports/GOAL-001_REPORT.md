# Relatório Final — PDV-CAPABILITIES-STATUS-RECONCILE-001

GOAL de materialização: `PDV-CAPABILITIES-STATUS-RECONCILE-001B` (auditoria
concluída anteriormente contra a mesma base; este GOAL apenas versiona).

## Estado

- Concluído. Branch `goal/pdv-capabilities-status-reconcile-001b` nascida da
  `origin/main` vigente, com exclusivamente os dois documentos permitidos,
  commit criado e push publicado. `main` intocada.
- Branch antiga `goal/pdv-capabilities-status-reconcile-001` (`c11c290`)
  preservada intacta (não apagada, movida, renomeada ou reutilizada).
- Worktree: `C:\Projetos\omni-gestao-goal-001-status-reconcile-b`; demais
  worktrees (46) não tocadas.
- Hash-base auditado e materializado: `0846c25fae2d31b00ec0c3b1fdcd740ff2b4fa10`.
- `origin/main` ao final: `0846c25` (idêntica — sem avanço durante a execução;
  nenhuma re-auditoria foi necessária).
- Commit: `docs(pdv): materializar reconciliacao de capabilities`.
- Push: `origin/goal/pdv-capabilities-status-reconcile-001b` publicado; sem
  PR automático.

## Arquivos criados

- `docs/pdv/PDV_CAPABILITIES_STATUS_RECONCILE_001.md` (dossiê, §5–§14:
  tabela, análise, delta, worktrees, feature keys v0.9, riscos, divergências,
  gates, dependências).
- `docs/pdv/reports/GOAL-001_REPORT.md` (este relatório).

## Vereditos P-01 a P-10

| ID | Veredito |
|----|----------|
| P-01 motor único | AJUSTADO |
| P-02 Black/Next | AJUSTADO |
| P-03 Rápido | REFUTADO |
| P-04 tenant/plano | AJUSTADO |
| P-05 worktrees/branches | AJUSTADO |
| P-06 condicionais/settings | AJUSTADO |
| P-07 Venda Completa | AJUSTADO |
| P-08 paridade Next | AJUSTADO |
| P-09 accessoryConfig | AJUSTADO |
| P-10 cards HUB | CONFIRMADO |

## Principais divergências

- Nenhuma feature-key `pdv.*` existe em runtime — proposta v0.9 é net-new
  (exceções: `sales.paymentMethods` com persistência pronta;
  `pdv.tables` com toggle real `moduloControleConsumo`).
- Black = implementação do Next (`PdvBlackEdition`), não skin
  (`PdvBlackShell` = apresentação); Rápido = modo transversal, não do
  Clássico; Venda Completa = fluxo real + órfão morto + copy de NF desonesta.
- Motor aguarda o servidor mas resolve pendência como sucesso visual;
  três superfícies filtram linhas em silêncio (Black já é fail-closed).
- Dossiê anterior `c11c290` obsoleto (base `b528945`, "8 commits" → hoje 612).

## Principais riscos

- **P0** settings sem ownership (`settings/route.ts:22-37`) →
  `STORE-SETTINGS-ACCESS-CONTROL-004`.
- **P0** fracionado inteiro-vs-decimal (projeção + `Math.round` + `Int`) →
  `FRACTIONAL-SALE-HARD-BLOCK-005`.
- **P1** sucesso-pendente; **P1** descarte silencioso de linhas.
- **P2** chaves Black sem escopo, copy fiscal, Completa sem acessórios;
  **P3** cards hardcoded, órfão morto.

## Feature keys propostas

Dez candidatas validadas + adicionais avaliadas (§9 do dossiê); nenhuma
existe em runtime. Primeira a formalizar: `sales.paymentMethods`.
Bloqueadas em código: `pdv.scale.*`, `sale.fractionalQty`.

## Worktrees e branches observadas

46 worktrees (metadados, sem WIP aberto). Branches PDV paralelas
majoritariamente absorvidas pela main ou stale; recebimento multitítulo e
caixa-terminal seguem paralelas sem interseção com este dossiê.

## Validações

- `git fetch origin --prune` (início e pré-commit); `rev-parse`/`log -1`
  (base `0846c25` estável); ancestralidade `738af36`/`f42072a` (exit 0).
- `git log --oneline HEAD..origin/main` vazio antes do commit.
- `git diff --check` limpo; `status` com exatamente os dois documentos;
  `diff --cached --name-only` com exatamente os dois caminhos literais.
- Pacote Fable 5 localizado fora do repo (4/4 docs) e referenciado, não
  copiado.

## Escopo preservado

Somente documentação nos dois caminhos autorizados; nenhum código, schema,
migration, dependência, banco, Supabase, credencial ou dado pessoal tocado;
nenhum checkout/merge/rebase/reset/stash na pasta principal ou em worktrees
alheias; nenhum push para `main`; nenhum PR; nenhuma integração da branch
antiga.

## Próximo passo recomendado

`STORE-SETTINGS-ACCESS-CONTROL-004` (P0 segurança) e
`FRACTIONAL-SALE-HARD-BLOCK-005` (P0 integridade), sem implementar neste
GOAL. Na sequência, GOAL-002 (classificação) e GOAL-003 (Next) consumindo
§13 do dossiê. Parar após o push desta branch.
