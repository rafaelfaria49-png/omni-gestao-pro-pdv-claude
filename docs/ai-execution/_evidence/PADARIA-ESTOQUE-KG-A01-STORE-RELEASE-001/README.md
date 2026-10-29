# PADARIA-ESTOQUE-KG-A01-STORE-RELEASE-001 — entrada KG para A01 e STORE

Data: 2026-10-28. Branch `claude/estoque-manual-kg-001` (PR #315), worktree `.worktrees/estoque-manual-kg-001`.
Decisão do dono: a melhoria vale para A01 (plataforma) e STORE (cliente). **Nada foi publicado:**
- sem push nem merge na `main`;
- sem deploy;
- sem migration em produção;
- sem conexão com produção (0 escritas).

## Fase 1 — reconciliação

| Item | SHA |
| --- | --- |
| `origin/main` no início | `0cd3418` (PR #320, Caixa Seguro STORE) |
| `origin/main` no fim | `ba010ac` (PR #319, só documentação AEP de Pessoas) |
| Head remoto da PR #315 | `2731097` (inalterado) |
| Registro local anterior, não empurrado | `fb88ab4` (docs da P4) |
| Merge da #320 | `e1b31ad`, automático. `operations-store.tsx` e `PdvBlackEdition.tsx` foram fundidos em regiões distintas. A R6 conferiu os dois lados. |
| Paridade A01 × STORE | `4cb4baa` |
| Correção da R6 | `5672462` |
| Merge da `main` `ba010ac` (só docs) | `f37ada9` |

O push `2731097..f37ada9` é fast-forward.

Os WIPs que já existiam na worktree ficaram intocados e fora dos commits:
- `ESTOQUE_MANUAL_KG_RUNBOOK.md`;
- `ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md`;
- `ESTOQUE_MANUAL_KG_PREVIEW_ISOLAMENTO.md`;
- as evidências `a1-*`, `rollout-readiness-004`, `runbook-hardening-005`, `PADARIA-GO-LIVE-FASTTRACK-002`.

## Fases 2 e 3 — o que mudou

Detalhe em `docs/padaria/pesagem/ESTOQUE_MANUAL_KG.md` § "Paridade A01 × STORE". Resumo:

- **A01, Gestão de Produtos histórica:**
  - produto por peso mostra o saldo em kg (`12,750 kg`);
  - a edição abre a ficha canônica por `/dashboard/cadastros-v2?aba=produtos&produto=<id>`;
  - o formulário histórico (`Math.floor` + `stock` como ajuste absoluto) não abre para esse produto;
  - o cadastro novo indica a ficha para produto por peso.
- **Link da ficha:** `obterProdutoFicha` lê com o mesmo gate e o mesmo DTO da listagem. Produto de outra loja devolve `null`.
- **Corrida do link:** cada pedido é um token próprio. Abrir o editor por outro caminho encerra o pedido pendente (R6).
- **REST `/api/produtos`:** `stock` fracionado ou com texto vira 400, onde antes truncava. Ajuste de produto por peso devolve 409 com orientação de entrada pela ficha.
- **Modal de movimentação:** UN recusa fração em Entrada e Ajuste; antes truncava sem aviso.
- **Textos corrigidos:** o writer de produto e a ficha deixaram de dizer que "não há estoque fracionado".

Continuam bloqueados, com recusa explícita:
- venda por peso: servidor 409 e PDV recusa ao adicionar;
- Ajuste e inventário em KG;
- estoque em G.

Não houve schema, migration ou writer novos.

## Fase 4 — provas

Tudo em ambiente isolado:
- PG 17 descartável na porta 55451, no scratchpad;
- NextAuth real, `next build` + `next start`;
- contas sintéticas.

| Prova | Resultado |
| --- | --- |
| E2E completo do piloto (`01-e2e-piloto-local-final.txt`), build final | **46/46 PASS** |
| E2E STORE (`e2e-store.json`, `telas/estoque-manual-kg-historico.png`) | 0,000 → 10,500 → 12,750 kg. Banco: 12.75 no produto e no depósito; livro `[10.5, 2.25]` com saldos antes/depois encadeados. A edição cadastral (preço) não mexe no saldo. `10.500` e `10,5001` são recusados sem chegar ao servidor. O duplo clique grava 1 movimentação. Lista e ficha mostram `12,750` depois do reload. |
| E2E A01 (`e2e-a01.json`, `telas/estoque-manual-kg-a01-lista.png`) | Da lista histórica até a ficha sem nenhum PATCH histórico. Falha de rede: erro visível e nada gravado. 10,500 + 2,250 = 12,750 no produto, depósito e livro. A edição cadastral preserva o saldo. A lista histórica mostra `12,750 kg` depois do reload. REST: ajuste KG → 409, fração → 400. |
| Isolamento por loja | O link para um produto de outra loja mostra "Produto não encontrado nesta loja." e não grava nada nela. |
| UN no formulário histórico | Ajuste 0→4 gera 1 movimentação. Mudar o preço não move o saldo nem cria movimentação. |
| PDV | Produto KG com 12,750 kg recusa a venda com a orientação de peso: 0 vendas, 0 saídas, saldo intacto. |
| Regressão da #320 | `caixa-seguro-store` 3/3; `access` 18/18. Unitários da #320: 32/32, a mesma contagem do README dela. |
| Boundary no PG real (`lib/estoque/stock-ledger-kg.pg.test.ts`) | 5/5. Inclui 20 entradas concorrentes sob `FOR UPDATE`, idempotência por chave e outra loja recusada. Banco: schema da `main` + seed `Int` + migration KG. |
| Unitários focados (KG, REST, modal, ficha, PDV, backfill) | 241 de 245 passam. As 4 falhas são de `cadastros-rest-access` e a coleta de `app/api/produtos/route.test.ts` falha por `next/server` pela junction do `node_modules`. As 4 falhas aparecem iguais com a rota da base. Por isso a rota POST nova não foi exercitada localmente; roda no CI (Linux). |
| Teste de componente do link (`produto-ficha-link.component.test.ts`) | 4/4. Mutação com o efeito anterior: P2 e P3 reprovam. |
| `npm run typecheck` | 0 erros no código versionado. Os 2 erros restantes estão só no WIP não rastreado `PADARIA-GO-LIVE-FASTTRACK-002/harness/golive.spec.ts`. |
| ESLint nos arquivos tocados | 0 erros. 1 aviso já existente em `MovimentacaoEstoqueModal.tsx:136`. |
| `npm run build` | "Compiled successfully", `MIGRATION_SKIPPED`, `PROXY_PRISMA_ARTIFACT_VERIFIED` |
| Revisão independente (Codex `gpt-6.1-sol`, somente leitura) | R6: REQUEST_CHANGES (1 P2, 1 P3, no efeito do link); corrigido em `5672462`. **R7: APPROVE, 0 achados.** |
| CI | **Não executado:** exige push, que não foi autorizado neste GOAL |

Flakes observados e esclarecidos em rodadas intermediárias; nenhum é regressão:
- `access:196` procura `actions/terminais` no manifest e falha só no Windows, onde o webpack grava `\`. A cópia local normaliza.
- `first-access:58/206` é uma corrida de hidratação no provisionamento sob carga. Passa 4/4 na base `0cd3418` e 4/4 na branch quando reexecutado.
- `client-experience` falhou em testes diferentes a cada rodada.
- Na rodada final, 46/46.

## Fase 5 — prontidão de produção (sem tocar produção)

Runbook canônico: `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_RUNBOOK.md`, versão local endurecida, ainda não commitada.

| Gate | Estado |
| --- | --- |
| A1 / A1.1 | PASS em 2026-10-28: 5 colunas `integer`; o diff traz só a renomeação da 0019; 1 caixa ABERTA (loja-2) |
| A2 | PASS: credenciais `omni_migrator`/`omni_runtime_v2` geradas offline, nada gravado |
| **A3** | **Próximo gate.** `01-papeis.sql` + `02-grants-runtime.sql` em produção. É escrita produtiva e exige autorização. |
| A4–A8 | Pendentes, na ordem do runbook. A6 decide o `07`; A7 trata dos conectores. |
| J0–J13 / P1–P5 | Pendentes |

O que este GOAL muda na prontidão:

1. **O código do J4 agora é `f37ada9`.**
   - A #315 contém a #320 e a `main` atual.
   - Se a `main` andar de novo antes do J4, é preciso fundir de novo, rodar o CI e conferir o gate do J4.
2. **Inventário de deployments.** Os merges da #320 e da #319 na `main` criaram builds novos de Production, com código `Int` e `neondb_owner`. A contagem "15 Production READY" do runbook está desatualizada e deve ser refeita no J0. Essa contagem nunca foi gate; o gate é o corte 04+05.
3. **Cliente `Int` nunca alcança coluna `Float` depois da migration.** No código da branch:
   - toda escrita das 5 colunas passa pelo client gerado do schema `Float`;
   - não há SQL cru que grave nelas.

   O risco restante está fora do código:
   - deployments e previews antigos: fechados pelo J6 (04+05) e pelas proibições do §5;
   - scripts locais: proibidos durante o congelamento;
   - "Redeploy"/"Promote" de build antigo: proibidos.
4. **Caixa aberto da loja-2:** o J0 exige 0 caixas `ABERTA`. O fechamento é ação da operação da loja, não do agente.
5. **Filas offline da loja-1 e da loja-2:** checklist das lojas no J0. A #320 tornou sangria e suprimento STORE online-only, mas as vendas pendentes continuam valendo no J0.
6. **Backup:** ponto de recuperação = branch Neon no J1.
   - O branch de ensaio `br-wispy-mountain-accw2a7p` continua existindo.
   - Excluí-lo exige autorização (P5).

### Sequência executável mais curta (cada passo com autorização própria)

0. Push fast-forward `2731097..f37ada9` na branch da PR. O preview usa o `pr315-kg`, isolado da produção. Depois, CI verde.
1. **A3** (papéis/grants) → **A4** (login do runtime read-only) → **A5** (revisar e commitar o runbook endurecido) → **A6** (decidir o `07`) → **A7** (conectores) → **A8** (marcar a janela e congelar).
2. **Janela:**
   - J0: loja-2 com caixa fechado e filas zeradas;
   - J1: branch de recuperação;
   - J2: trava;
   - J3: envs `omni_runtime_v2`;
   - J4: merge da #315;
   - J5: trava no ar;
   - J6: corte 03→04→05→06;
   - J7: reconferência;
   - J8: migration verificada (ponto de não-retorno);
   - J9: `07`, se aprovado;
   - J10: conferências;
   - J11: destrava;
   - J12: smoke STORE + A01 com produto sintético;
   - J13: reabrir.
3. **Pós-janela:** P1 → P2 (Preview `main`) → P3 → P4 (#318 depois) → P5.

## Relatório

```
A01_KG_ENTRY=PASS
STORE_KG_ENTRY=PASS
KG_LEDGER_PRECISION=PASS
LEGACY_UI_SAFE=PASS
UN_REGRESSION=PASS
CAIXA_320_REGRESSION=PASS
E2E=PASS (46/46 local, build de produção, PG descartável)
PR315_READY=NO — código pronto (R7 APPROVE, 46/46), falta push autorizado + CI verde no head f37ada9
PRODUCTION_MIGRATION=NOT_EXECUTED
NEXT_ROLLOUT_GATE=A3 (01-papeis.sql + 02-grants-runtime.sql em produção), precedido do push/CI da PR
REMAINING_BLOCKERS:
  - push da PR e CI
  - autorizações A3–A8
  - caixa ABERTA da loja-2 no J0
  - filas das lojas no J0
  - inventário de deployments refeito no J0
  - decisão do 07 (A6)
  - commit do runbook endurecido (A5)
PRODUCTION_WRITES=0
```
