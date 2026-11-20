# OMNI-RELATORIO-GERAL-LOJA-COMERCIAL-FINANCEIRO-001 — Relatório Geral da Loja

Branch `codex/relatorio-geral-loja-001` (base `main` bdff99c, PR #377 já em Production). Sem merge, sem deploy,
sem schema, sem migration, sem escrita em Production. Nenhum fluxo transacional (venda, caixa, estoque,
financeiro), Electron ou POS-80 alterado.

## 1. Mapa das fontes

| Fonte | Uso no relatório | Confiabilidade / rastreio |
|---|---|---|
| `Venda` (`at`, `total`, `status`, `payload.paymentBreakdown`, `payload.origem`) | Vendas por competência; canceladas à parte; formas **declaradas** | Confiável para total/data/status. Formas do payload são declaração do PDV, não prova de recebimento. Rastreio por `pedidoId`. |
| `ItemVenda` (`inventoryId`, `lineTotal`, `quantidade`) | Tipo da linha e valor bruto | Valor/qtd gravados. Sem custo histórico → CMV indisponível. |
| Linhas virtuais `__os_servico__/__os_pecas__/__servico__/__avulso__` (`lib/os-pdv-virtual-lines.ts`) | OS, serviço e avulso no PDV | Contrato gravado no `inventoryId`; comprovado. |
| `AparelhoVenda` + `AparelhoFisico` (+ `Produto.metadata.serializedDevice`) | Aparelhos (celulares) | Unidade vinculada à venda (IMEI) é prova forte; modelo serializado sem unidade (legado) classificado como aparelho pelo cadastro atual. |
| `Produto.category` + `categorias_produto.nome` | Acessório × produto | **Categoria atual** do catálogo (sem histórico). Sem produto na loja → Não classificado. |
| `DevolucaoVenda` / `ItemDevolucaoVenda` | Devoluções por data da devolução e por tipo | Vínculo por `vendaLocalId`; devolução sem venda é apontada. |
| `MovimentacaoFinanceira` (ledger) | **Única** fonte de recebimentos, pagamentos, tesouraria e fluxo | Cada movimento em exatamente uma classe; rastreio por `id` (link para Fluxo de Caixa). |
| `CarteiraFinanceira` | Saldos inicial/final (reuso de `cashFlowReport`) | Mesmo cálculo do relatório Fluxo de Caixa. |
| `ContaReceberTitulo` (`localKey`, `payload.historico`) | A prazo comprovado, origem do recebimento, saldo devedor | Saldo pelo mesmo contrato do Fluxo de Caixa; histórico inválido → Indisponível. Origem por `localKey` (`pdv-aprazo-*`, `os-faturamento:*`, `receber:os:*`, `receber:pdv:*`, `receber:manual:*`). |
| `ContaPagarTitulo` (`payload.categoria`, histórico) | Pendentes × pagos, categoria da despesa | Categoria **atual** do título. |
| `CaixaOperacao` (`recebimento_cr`/`estorno_recebimento_cr`) | Só conferência | Mesmo fato do ledger — nunca somado. |
| `OrdemServico` | Contagem de OS criadas (só com acesso a Operações) | Contagem por `createdAt`. |

## 2. Regras de conciliação e prevenção de duplicidade

1. **Competência × caixa**: vendas usam `Venda.at`; recebimentos/pagamentos usam `MovimentacaoFinanceira.createdAt`. Os dois universos aparecem lado a lado e nunca são somados.
2. **Parcela antiga** (`receber*` sobre título `pdv-aprazo-*` de venda anterior ao período) entra em "Recebimentos — parcelas de vendas anteriores", nunca em vendas.
3. **OS × PDV**: recebimentos vêm só do ledger, cada movimento uma vez. Quando a OS aparece como linha virtual numa venda **e** o título da mesma OS tem recebimento, a conferência marca "possível duplicidade" (não desconta).
4. **Sessões de caixa** (`CaixaOperacao`) e histórico dos títulos são o mesmo fato do ledger: aparecem só como informativo.
5. **Transferências** (neutras, soma das pernas = 0), **sangria/suprimento** (tesouraria) ficam fora de receitas, despesas e do "recebido − pago".
6. **Despesas pagas** (ledger `pagar*` − `estorno_pagar*`) separadas de **títulos pendentes** (posição atual).
7. **Compras de estoque**: categorias de custo (mesma lista de `dre-service.ts`) aparecem como "Compras/insumos pagos (não é CMV)". CMV/lucro/margem: Indisponível.
8. **Cancelamentos** fora das vendas; o estorno no ledger (`cancelamento_pdv`) reduz o recebido. Cancelada com entrada sem estorno → conferência. **Devoluções** pelo `devolucao_pdv` (caixa) e pelo documento (competência). **Parciais** pelo histórico do título.
9. **Não comprovado** → "Não classificado" (linha, recebimento, título, ledger) ou "Indisponível" (saldo sem histórico válido, CMV, OS sem permissão). Nada é estimado.
10. **Isolamento**: toda consulta, junção, lateral e subconsulta filtra `storeId`; transação `READ ONLY` + `REPEATABLE READ` (herdado de `buildReport`). ACL: exige Central + Vendas + Financeiro (visão) e os módulos `reports`, `sales`, `finance`.

## 3. Funcionalidades implementadas

- Card e rota `/dashboard/relatorios/geral` (kind `geral`) na Central existente.
- Blocos: Resumo geral · Vendas por tipo · À vista e a prazo (comprovado × declarado) · Recebimentos efetivos · Contas a receber e saldo devedor · Despesas e pagamentos · Contas a pagar · Fluxo de entradas/saídas/saldos · OS e aparelhos · Conferência de lançamentos e divergências (15 verificações).
- Filtros: período, loja (loja ativa autorizada), registro, origem, classificação/categoria, situação, busca por referência. Os blocos são sempre o total da loja no período; os filtros refinam o detalhamento (declarado na tela e no arquivo).
- Detalhamento unificado (venda, movimento, título a receber/pagar, devolução), paginado, com link para o registro de origem: `geral?source=venda:{pedido}` (linhas, títulos, devoluções e movimentos em qualquer data) e `geral?source=titulo:{lado}:{id}` (histórico tipo/valor, movimentos, venda de origem); movimentos → Fluxo de Caixa. Sem nome de cliente, documento, observação ou payload bruto.
- Exportação CSV (blocos + detalhamento completo) e PDF A4 paisagem, Courier 7 pt, cabeçalho de tabela repetido, células com quebra (sem corte), rodapé "Página x/y". Recorte completo até 5.000 registros; acima disso, 422 com orientação para refinar.

## 4. Lacunas históricas identificadas

- **CMV / margem / lucro**: `ItemVenda` não grava custo; `Produto.precoCusto` é atual. Exigiria snapshot de custo por linha (mudança de schema e do writer da venda) — **bloqueado, depende de aprovação**.
- **Categoria histórica**: acessório × produto e categoria de despesa usam o cadastro atual.
- **Formas de pagamento por recebimento de título** não estão no ledger de forma uniforme (o Fluxo de Caixa já declara isso); só formas declaradas na venda são mostradas.
- **Data do evento no histórico do título** não é contrato uniforme; o rastreio mostra tipo e valor.
- **Vendas geradas da OS (V2, `payload.origem='os'`)** não têm vínculo direto com o título da OS; o pagamento é atribuído à OS e listado à parte.
- **Movimentos `manual`/`omni_agent`/legados** sem origem comprovada aparecem como Não classificado.
- **Aquisições de aparelhos** (`AparelhoAquisicao`) não entram como despesa: só o pagamento no ledger comprova saída.

## 5. Validação

- `npm run typecheck`: 0 erros. ESLint dos arquivos alterados: limpo.
- Vitest (mesmo comando do job `relatorios-qa`, sem `.pg`): 8 arquivos, 105/105.
- PostgreSQL 17 descartável loopback (`scripts/relatorios/run-local-qa.mjs`): 3 arquivos, **41/41** — inclui `geral.pg.test.ts` (9 testes) em banco próprio `omni_reports_qa_geral`: venda à vista, a prazo, parcela recebida em outro mês, pagamento parcial, OS (inclusive cobrança dupla), aparelho com IMEI, serviço, item sem produto, contas pagas/parciais/pendentes, devolução, cancelamento com e sem estorno, transferência, sangria/suprimento, lançamento manual, recebimento órfão três lojas, venda de OS sem título da OS e rastreio com mais de 2.000 vínculos (marcado incompleto, exportação recusada).
- `npm run build` (local, antes das correções da revisão): Compiled successfully, exit 0. CI: ver PR.
- Revisão independente (subagente, somente leitura): **APPROVE_WITH_FIXES**, sem P0/P1. Corrigidos: rastreio cortado não é mais exportado nem dito completo (LIMIT+1, 422); vencido/a vencer/coorte viram Indisponível quando há título sem saldo comprovado; venda gerada de OS só conta como acompanhada na OS se existir título da OS; ledger do Geral limitado ao período e detalhamento numa só leitura (`count(*) OVER()`); duplicidade de OS sem DISTINCT; sem texto livre de linhas virtuais no rastreio; base única de devolução (documento); à vista aceita origem `pdv`; filtro por origem do título a receber; nota sobre saídas manuais sem título.
- **Risco remanescente (P2 da revisão):** desempenho em lojas com histórico grande não foi medido — a validação foi com dados sintéticos. Medir na homologação (tempo por consulta < 12 s, transação < 30 s).

## 6. Pendências para homologação com dados reais da RAFACELL

1. Abrir o relatório na loja RAFACELL em Production com um mês fechado e comparar Resumo/Fluxo com o fechamento de caixa e o Financeiro.
2. Conferir a tabela "Conferência" — cada "Verificar" deve ser explicado (legado, correção manual ou bug real).
3. Validar a classificação Acessório × Produto com as categorias reais (regra: nome/slug da categoria contém "acess").
4. Confirmar que as categorias de despesa de compra usadas pela loja estão na lista de custo (`estoque`, `peças`, `mercadoria`…).
5. Exportar CSV e PDF de um mês cheio e verificar legibilidade e contagem de registros (limite 5.000).
6. Conferir ACL com um perfil sem Financeiro (card não aparece; API 403).
