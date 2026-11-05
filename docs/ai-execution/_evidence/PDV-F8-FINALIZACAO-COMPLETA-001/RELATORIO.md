# PDV-F8-FINALIZACAO-COMPLETA-001 — relatório

GOAL=PDV-F8-FINALIZACAO-COMPLETA-001 · LEVEL=4 · EXECUTION=END_TO_END
Data: 2026-11-04 (America/Sao_Paulo) · PR #331 · Branch `claude/pdv-f8-troca-imediata-001` · Referência de partida `3c12aa2`
Base `origin/main` = `37acc3b` (não andou durante o GOAL).
Schema/migration: **nenhum** · Produção: **0 escritas, 0 deploys, 0 merges** · Dados: 100% sintéticos.
Continua o GOAL anterior (`../PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001/RELATORIO.md`); aqui só o que mudou.

## 1. Correções

| # | Pendência do GOAL anterior | Correção |
|---|---|---|
| 1 | SKU alterado depois da venda → recusa falsa `ITEM_NAO_CONSTA_NA_VENDA`; replay após rename virava "conflito" (→ 2ª devolução) | `saleProductKeyResolver` (`lib/pdv/devolucao/product-keys.ts`): a autoridade é `ItemVenda.inventoryId` (= Produto.id permanente). Ordem: chave exata da venda → `produtoId` enviado (se for da venda) → SKU/EAN **da época** (linhas do payload da venda) → catálogo atual, aceito só se cair numa chave da venda. Mesmo resolvedor no escritor (sob lock), na busca e no fingerprint de replay. SKU reutilizado por outro produto nunca troca o item. Entrada de estoque pelo Produto.id histórico (nunca por SKU/EAN de hoje). |
| 2 | Fila offline legada sem tratamento operacional | Categorias `DINHEIRO_ENTREGUE` / `VALE_EMITIDO` / `INTENCAO_SEM_EFEITO` (`lib/pdv/devolucao/pendencias.ts`). Painel F8 lista cada pendência com estado, valor declarado e motivo; fechamento do caixa mostra contagens. **Encaminhamento ao Financeiro** `POST /api/ops/devolucao/pendencias`: registro append-only em `AuditoriaFinanceira` (tabela existente) com referência única, categoria, valor declarado, valor recalculado pelo servidor (quando a venda existe), justificativa e operador da **sessão**. Idempotente (advisory lock + chave `devolucao-pendencia:{loja}:{localId}`). Exige NextAuth + `pdv.devolucao` **e** `pdv.cancelarVenda`. **Nenhuma** `MovimentacaoFinanceira`, vale ou estoque. Devolução já gravada → 409 `DEVOLUCAO_JA_GRAVADA`. O registro local fica (evidência), com a referência. |
| 3 | Venda de origem que nunca chega → tentativas infinitas | Estado explícito `AGUARDANDO_VENDA_ORIGEM` (tentativas, desde, última). Bloqueio persistente: venda fora da fila local + ≥5 tentativas + ≥30 min, ou 24 h em qualquer caso → `syncBlocked`, **a retentativa automática para** e entra no audit-log. "Tentar novamente" = retomada controlada (mesmo `localId`, nova janela). Reconciliação supervisionada = encaminhamento (item 2): sai da fila e desfaz só os efeitos **locais**. Preço/quantidade do navegador continuam ignorados; nada é fabricado. |
| 4 | Serviço/linha virtual gerava vale sem lastro | `ITEM_SEM_LASTRO_BLOQUEADO` para serviço, avulso, O.S. e qualquer linha cuja chave não é `Produto` da loja; `DEVOLUCAO_KG_BLOQUEADA` para produto por peso. Nada gravado; recusa definitiva na fila; a busca devolve `bloqueioDevolucao` e a tela desabilita a linha com o motivo. Produto real da mesma venda segue devolvível. |
| 5 | Linhas repetidas do mesmo SKU contavam em dobro no espelho local | `fundirLinhasPorItem` na tela; `distribuirQtyReturned` no espelho/recusa/encaminhamento; registro offline valida o agregado. Estoque local casa pelo `dbId` (Produto.id) antes do SKU. |
| 6 | Recusas só no F8, não no fechamento | Fechamento do caixa: bloco informativo (trocas, devoluções confirmadas, vales emitidos/utilizados, diferenças recebidas além do vale, pendentes, aguardando venda de origem, recusas, conciliação manual, encaminhadas). Não lança nada e não mexe em saldo. |

Combinações da troca (item 5 do GOAL) revisadas: igual/mais cara/mais barata/zero, várias unidades, parcial, vale parcialmente utilizado e consumido por outro caixa, rede antes/depois do COMMIT, reenvio, venda pendente, troca interrompida, simultâneos, cancelamento concorrente, reabertura do F8 — cobertas pelos testes da §2 (as já existentes seguem passando).

## 2. Testes (resultados reais)

| Prova | Resultado |
|---|---|
| `lib/pdv/devolucao/troca-imediata.pg.test.ts` — PostgreSQL 17 **descartável** (initdb no scratchpad, 127.0.0.1:55471, `f8_troca_test`, schema da branch via `migrate diff`), handlers de produção | **31/31** (15 anteriores + 16 novos) |
| ↳ A/G/I troca com diferença positiva, negativa e zero; estoque exato antes/depois | PASS |
| ↳ B busca por EAN, SKU, venda e ID; C SKU **alterado** (SKU antigo, novo e Produto.id → mesma linha; replay idempotente após rename), **removido** e **reutilizado** (nunca devolve o produto que herdou o SKU) | PASS |
| ↳ D produto repetido no carrinho (uma linha por bipe → uma linha devolvível, teto somado) | PASS |
| ↳ E duas devoluções concorrentes · F vale consumido por dois operadores · vale parcialmente utilizado e consumido por outro caixa | PASS |
| ↳ H desconto (vale = valor pago) · teto acumulado pelo total pago | PASS |
| ↳ J/K perda de resposta, replay paralelo, conflito de `localId` | PASS |
| ↳ L cancelamento concorrente (5 rodadas) e bloqueio de cancelamento com vale | PASS |
| ↳ M fila legada: encaminhamento idempotente (paralelo + reenvio = 1 registro, valor declarado não muda), 0 `MovimentacaoFinanceira`/vale/estoque, listagem isolada por loja | PASS |
| ↳ M/P1 encaminhada → venda chega → reenvio recusado (`DEVOLUCAO_ENCAMINHADA_FINANCEIRO`); corrida encaminhar × gravar (5 rodadas): exatamente um vence | PASS |
| ↳ N venda de origem ausente: nada gravado; venda chega → mesmo `localId` grava uma vez (preço do client ignorado) | PASS |
| ↳ O serviço / avulso → `ITEM_SEM_LASTRO_BLOQUEADO`; KG → `DEVOLUCAO_KG_BLOQUEADA`; busca sinaliza; produto real da mesma venda segue devolvível | PASS |
| ↳ histórico legado não identificável → `HISTORICO_DEVOLUCAO_NAO_RESOLVIDO` (falha fechado) | PASS |
| ↳ Q isolamento entre lojas (gravação e busca) · R permissões reais (`getEnterprisePermissions`): sem `pdv.devolucao` → 403; encaminhar sem sessão → 401, sem `cancelarVenda` → 403 | PASS |
| ↳ T reembolso em dinheiro bloqueado, nada gravado | PASS |
| `lib/pdv/devolucao/fila-devolucao-provider.component.test.ts` — `OperationsProvider` real (jsdom, Node 22) | **8/8**: AGUARDANDO_VENDA_ORIGEM, bloqueio persistente para a retentativa, retomada com mesmo `localId`, confirmação limpa a espera, encaminhamento desfaz só o local e guarda evidência, mesmo tick sem reenvio, recusa de outra aba guarda a referência, espelho com linhas repetidas e SKU reutilizado |
| `lib/pdv/trocas-devolucao-f8.component.test.ts` (tela real) | **14/14** (painel de pendências, encaminhar com justificativa, retomada, linha de serviço bloqueada, `produtoId` enviado, fusão de linhas) |
| `lib/pdv/devolucao/fila-devolucao.test.ts` | **6/6** (resumo do fechamento, limites do bloqueio, distribuição) |
| Mutações (código alterado, teste rodado, arquivo restaurado por cópia) | 13 mutações; 12 reprovadas pelos testes; 1 equivalente (ordem catálogo × alias — o mapa de vendidos já recusa) |
| Regressão `lib/pdv`, `lib/operations-store`, `lib/ops-upsert-venda`, `lib/vendas`, `lib/caixa`, `lib/financeiro`, `lib/estoque`, `app/api/ops`, `app/api/vendas`, `components/dashboard/{vendas,caixa}` (Node 22) | branch 2490 pass / 65 fail × baseline `3c12aa2` 2431 / 64, comparação por nome: **0 falha nova**. A única diferença (`parity-pin-keymap` N5-B2) passa 100/100 isolada nas duas árvores (3× e 2×) → intermitência de carga. Falhas pré-existentes reproduzidas idênticas na baseline (ex.: `fechamento-calculadora-modal.static` 4, `cancelar/route.test` 27). |
| `npm run typecheck` | exit 0 |
| ESLint nos arquivos alterados (incl. E2E 11) | limpo |
| `npm run build` | **✓ Compiled successfully** (5,6 min), rota `/api/ops/devolucao/pendencias` gerada, exit 0 |
| E2E 11 (CI, Chromium com login real) | reforçado: corpo do POST traz `produtoId` = Produto.id; `ItemDevolucaoVenda.inventoryId` = Produto.id; após renomear o SKU, a busca pelo SKU novo acha a venda com "Devolvido: 1" |
| GitHub Actions | ver §3.1 |

## 3. Revisão independente

Subagente revisor com contexto limpo, somente leitura, sobre `3c12aa2..HEAD` dentro da PR.

| Rodada | Veredito | Achados → correção |
|---|---|---|
| 1 (`7372d4e`) | REQUEST_CHANGES | **P1** encaminhar não impedia gravação posterior do mesmo `localId` (outra aba/flush) → escritor toma o mesmo advisory lock e recusa `DEVOLUCAO_ENCAMINHADA_FINANCEIRO`; `stateRef` síncrono; "Tentar novamente" travado. **P2** histórico legado não resolvido falhava aberto → `HISTORICO_DEVOLUCAO_NAO_RESOLVIDO`. **P2** resumo contava encaminhadas como confirmadas e escondia bloqueios → corrigido + contador. **P3** posição com nomes repetidos, referência com itens em dobro, POST duplicado em voo → corrigidos. |
| 2 (`ae7a2da`) | **APPROVE_WITH_LIMITATIONS — sem P0/P1/P2**; limitações só de política/homologação | Ordem de locks sem ciclo (venda `FOR UPDATE` → advisory; encaminhamento só advisory; cancelamento só venda); rota legada `tipo: devolucao` intacta. P3 cosmético (referência ausente na aba que recebeu a recusa) → corrigido no commit seguinte. P3 operacional: medir antes do go-live quantas `itens_devolucao_venda` legadas têm `inventoryId` nulo (falha fechado as travaria) — exige leitura de produção, fora deste GOAL. |
| 3 (`a107d27`) | **APPROVE** | Nenhum defeito técnico corrigível restante; o relatório confere com o código e os testes (PG 31/31, jsdom 28/28 refeitos pelo revisor). |

### 3.1 CI da PR #331

| Head | Resultado |
|---|---|
| `ae7a2da` | visor e piloto PASS; Ramos e Cadastros: E2E **33/34**. O que falhou foi o passo novo do spec 11 (o `Escape` era consumido pelo campo de busca, então o diálogo F8 não fechava). As asserções novas de `produtoId` e de `ItemDevolucaoVenda.inventoryId` passaram antes desse passo. |
| `dd85b65` | spec 11 fecha o F8 pelo X — CI em execução no fechamento deste relatório; o resultado final fica na PR. |

Compatibilidade: `git merge-tree` sem conflito contra `origin/main` (`37acc3b`, não andou) e contra a PR #327 (`027bba5`); a #327 não toca devolução, operations-store nem fechamento.

## 4. Pendências exclusivamente de política

| Caminho | Gate |
|---|---|
| Reembolso em dinheiro (`tipo: "devolucao"`) e sobra da troca em dinheiro | `REFUND_CASH=BLOCKED_BY_POLICY` (G-H01..03 / CASH_HANDOVER_RECOVERY) |
| Devolução KG | `KG_RETURNS=BLOCKED_BY_SCHEMA_APPROVAL` (R3) |
| `SEM_RECEBIMENTO` | `BLOCKED_BY_POLICY` |
| Vale para serviço/avulso/linha sem produto | sem política aprovada → bloqueado |
| Lançamento financeiro das pendências encaminhadas | decisão do Financeiro (o sistema só registra a referência) |

## 5. Pendências de homologação presencial

1. Smoke com operador real na loja piloto (F8 → troca → comprovante impresso).
2. Supervisor encaminhando uma pendência legada real (se existir na fila de algum navegador).
3. Leitura do bloco de trocas no fechamento por quem confere o caixa.

## 6. Arquivos

Novos: `lib/pdv/devolucao/{pendencias,pendencia-financeiro}.ts`, `app/api/ops/devolucao/pendencias/route.ts`, `lib/pdv/devolucao/fila-devolucao-provider.component.test.ts`.
Alterados: `lib/pdv/devolucao/{product-keys,registrar-devolucao,elegibilidade,troca-imediata.pg.test}.ts`, `app/api/ops/devolucao/route.ts`, `lib/operations-store.tsx`, `lib/operations-sale-types.ts`, `components/dashboard/vendas/trocas-devolucao.tsx`, `components/dashboard/caixa/fechamento-caixa-modal.tsx`, `lib/pdv/trocas-devolucao-f8.component.test.ts`, `e2e/cadastros-ramos/11-pdv-f8-troca-imediata.spec.ts`.
Intocados neste GOAL (`3c12aa2..HEAD`): auth, proxy, `prisma/schema.prisma`, migrations, workflows, outros GOALs/worktrees e WIPs do checkout principal.
Na PR como um todo (contra a `main`) há 3 workflows alterados, de GOALs anteriores: `ramos-cadastros.yml` (`paths` do F8, `47b0f33`) e o runner fixado em `ubuntu-24.04` em `ramos-cadastros.yml`, `platform-pilot.yml` e `pdv-scale-visor.yml` (`5a36b78`, `98495c4` — hunks idênticos aos da PR #327).
