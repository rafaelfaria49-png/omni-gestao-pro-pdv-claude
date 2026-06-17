---
title: AUDITORIA_WORKSPACE_CORRECAO_VENDA_v01 · Correção/Edição de Venda → Workspace de Pós-Venda
audit_id: PDV-CORRECAO-01
hub: pdv
tipo: forense
data: 2026-06-17
duracao_horas: 1
auditor_humano: Rafael Faria
auditor_ia: opus
escopo: Modal "Corrigir venda" (Vendas HUB) + APIs de correção/cancelamento + modelo de dados da venda + impacto em caixa/estoque/financeiro/fiscal. Desenho do futuro Workspace de Correção de Venda.
status: rascunho
imutavel_apos: publicada
versao_anterior: —
---

# AUDITORIA_WORKSPACE_CORRECAO_VENDA_v01 · Correção de Venda → Workspace de Pós-Venda

> **Status:** rascunho
> **Tipo:** forense · **Duração:** ~1 h · **Auditor IA:** Opus 4.8
> **Modo:** SOMENTE LEITURA — nenhuma alteração de código de aplicação. Único arquivo criado: este documento.

---

## 0. Como ler este documento

Este documento segue a estrutura do GOAL (PARTE 1 → PARTE 12) e, ao final (§13), consolida os findings na convenção P0–P3 do `TEMPLATE_AUDITORIA.md`. Quem tem 3 minutos deve ler **§13.1 (resumo executivo)**, **§7 (decisão sobre data)** e **§11 (plano de fases)**.

**Tese central:** o módulo de correção atual está *correto naquilo que se propõe a fazer* (swap de forma de pagamento à vista↔à vista, troca de cliente, observação — tudo com motivo, PIN e trilha de auditoria). O problema não é bug no que existe; é **escopo insuficiente + duas portas perigosas abertas** (correção de pagamento envolvendo *À Prazo*/*Vale* e ausência de trava de período fechado). A evolução para "Workspace" deve **reusar o padrão de reversão ERP já existente no cancelamento** em vez de inventar um motor novo.

---

## PARTE 1 — Mapa da implementação atual

### 1.1 Fluxo de entrada (UI)

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Tela "Vendas" (ex-"Histórico") | `components/dashboard/vendas/vendas-arquivo-geral.tsx` | Lista paginada + KPIs + filtros; hospeda o modal de correção, o drawer de detalhe, o cupom e o modal de troca/devolução. |
| Ação por linha (ícone chave) | mesmo arquivo, `startCorrecaoFromRow` (`:866`) e botão `:1372` / dropdown mobile `:1432` | Faz `GET /api/vendas/{id}`, então `startCorrecao(venda)`. |
| Estado do modal | `:351-367` | `corrigindoVenda`, `correcaoMotivo`, `correcaoFormaPag`, `correcaoClienteId/Nome`, `correcaoObservacao`, `correcaoTab`, `correcaoPin`, `correcaoLoading/Error` + autocomplete de clientes. |
| Pré-preenchimento | `startCorrecao` (`:787-809`) | Detecta a forma de pagamento "principal" (a de maior valor) e a usa como seed da aba Pagamento. |
| Submit | `handleCorrigir` (`:811-854`) | Monta o body conforme a aba ativa e faz `POST /api/vendas/{id}/corrigir`. |
| JSX do modal | `:2225-2547` | 3 abas (Pagamento / Cliente / Observação) + campo Motivo sempre visível + ações. |
| Clientes para a aba Cliente | `listClientes(storeId)` via `app/actions/cadastros.ts` (`:369-383`) | Carrega **todos** os clientes da loja e filtra no cliente (client-side). Só seleciona cadastro existente — **não cria**. |

### 1.2 Backend

| Endpoint | Arquivo | O que faz hoje |
|---|---|---|
| `GET /api/vendas/[id]` | `app/api/vendas/[id]/route.ts` | Detalhe normalizado: itens, pagamentos (derivados de `payload.paymentBreakdown`), devoluções vinculadas, `correcoes[]`, flags de cancelamento (`estoqueReposto`/`estornoFinanceiro`), terminal, sessão. |
| `POST /api/vendas/[id]/corrigir` | `app/api/vendas/[id]/corrigir/route.ts` | Correção de pagamento (descrição da movimentação), cliente, observação. Valida motivo, total e PIN. Grava `payload.correcoes[]`. |
| `POST /api/vendas/[id]/cancelar` | `app/api/vendas/[id]/cancelar/route.ts` | **Reversão ERP completa** (modelo de referência): repõe estoque líquido, estorna financeiro à vista, cancela/estorna títulos à prazo, respeita período fechado, checa permissão enterprise. |
| Persistência da venda | `lib/ops-upsert-venda.ts` (`upsertVendaInTransaction`) | Cria Venda+Itens+ledger de estoque+MovimentacaoFinanceira+ClienteCredito+ContaReceberTitulo numa transação. **É o "espelho" que a correção precisa respeitar.** |
| Tipos compartilhados | `lib/operations-sale-types.ts` | `SaleRecord`, `PaymentBreakdownFull`, `APrazoConfig`. |
| Fechamento de caixa | `lib/caixa-fechamento-resumo.ts` | `computeFechamentoResumo` lê `paymentBreakdown` por forma → caixa esperado em dinheiro. |
| Período fechado | `lib/financeiro/services/fechamento-service.ts` (`verificarPeriodoFechado`) | Trava diária/mensal. **Usada no cancelar, ausente no corrigir.** |

### 1.3 Documentos de origem

- `docs/ai/VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md` (Goal 9, 23/05/2026) — entrega original. Já registra como **risco aberto** (§8) que "a correção redistribui 100% do total numa forma" e que "correção parcial exigiria UI com breakdown individual — fora do escopo".

---

## PARTE 2 — Auditoria do modelo de venda

### 2.1 O que está em COLUNA (fonte da verdade estrutural)

`model Venda` (`prisma/schema.prisma:1358`):
- `pedidoId` (chave de negócio, `VDA-…`), `total`, `at`, `status`, `operador`, `clienteId` (FK→`Cliente`, `SetNull`), `clienteNome`, `terminalId`, `contaReceberTituloId` (FK), `canceladaEm/Por`, `motivoCancelamento`.

`model ItemVenda` (`:1407`): `nome`, `quantidade` (**Int**), `precoUnitario`, `lineTotal`, `inventoryId` (cuid resolvido). **Não há coluna de custo nem de desconto por item.**

Satélites gerados pela venda:
- `MovimentacaoFinanceira` (`:1321`) — entrada à vista (`origem:"venda"`, valor = `total − aPrazo`, `createdAt = Venda.at`).
- `MovimentacaoEstoque` (`:779`) — saída por produto (`origem:"pdv"`, `quantidade` negativa, snapshot de custo/estoque).
- `ContaReceberTitulo` (`:1258`) — 1 por parcela à prazo (`localKey: pdv-aprazo-{pedidoId}[-n]`).
- `ClienteCredito`/`UsoCreditoCliente` — débito de vale quando `creditoVale > 0`.

### 2.2 O que está em PAYLOAD JSON (`Venda.payload`, JSONB)

Definido por `SalePayload`/`SaleRecord`:
- **`paymentBreakdown`** (dinheiro/pix/cartaoDebito/cartaoCredito/carne/aPrazo/creditoVale) — **fonte da verdade do mix de pagamento**; a coluna não guarda isso. A string `formaPagamento` da listagem é apenas um rótulo derivado.
- **`lines[]`** — com `isAvulso`, `custoUnitario`, `qtyReturned` (campos que **não existem em `ItemVenda`**).
- `customerCpf`, `customerName`, `observacao`, `sessaoId`, `terminalId`.
- `discountTotal`/`discountReais`/`discountPercent`, `discountAuthorizedByAdminId` (auditoria de desconto).
- `aPrazoConfig` (parcelas/vencimento/intervalo).
- **`correcoes[]`** — trilha de auditoria de correções (before/after por campo).

### 2.3 Respostas exigidas pelo GOAL

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O que está em coluna? | Identidade, total, data, status, cliente (FK+nome), operador, terminal, FK do título, dados de cancelamento; e os satélites (financeiro/estoque/receber). |
| 2 | O que está em payload? | Mix de pagamento, linhas ricas (avulso/custo/devolvido), CPF, observação, sessão, descontos, config à prazo, trilha de correções. |
| 3 | O que é derivado? | `formaPagamento` (label), KPIs, `porPagamento`, caixa esperado, ticket médio, "estoqueReposto/estornoFinanceiro". |
| 4 | O que é fonte da verdade? | **Por campo:** mix de pagamento → `payload.paymentBreakdown`; quantidade/itens → `ItemVenda` (+ espelho em `payload.lines`); dinheiro à vista → `MovimentacaoFinanceira`; fiado → `ContaReceberTitulo`; saldo de estoque → `Produto.stock` reconciliado pelo ledger `MovimentacaoEstoque`. |
| 5 | O que pode ser recalculado? | Tudo de §2.3-#3. **Não** se recalcula saldo de estoque/caixa sem novo lançamento — eles são *event-sourced* por ledger. |
| 6 | O que NÃO deve ser alterado (sem reversão)? | `total`, linhas/quantidades (geram estoque), `paymentBreakdown` quando envolve aPrazo/vale/dinheiro (gera caixa+financeiro+receber), `at`/`createdAt` (define a janela da sessão de caixa). Esses só mudam com **movimento compensatório**, nunca com `update` direto. |

> **Observação de modelagem (P3):** há *dupla fonte* deliberada para linhas — `ItemVenda` (coluna) e `payload.lines` (JSON). Hoje convivem porque `ItemVenda` é recriado a cada upsert (`ops-upsert-venda.ts:178`). Um workspace que edite itens precisa manter **as duas** em sincronia ou definir uma como canônica. Recomendação: `ItemVenda` é canônica para estoque/relatório; `payload.lines` continua como snapshot fiel.

---

## PARTE 3 — Auditoria da correção atual (o que o modal realmente faz)

### 3.1 Matriz capacidade × efeito

| Ação | Permite? | Persiste em | Toca caixa? | Toca CR? | Toca estoque? | Log? |
|---|---|---|---|---|---|---|
| Trocar forma de pagamento (à vista↔à vista) | ✅ | `payload.paymentBreakdown` + `MovimentacaoFinanceira.descricao` | **Só descrição** (valor inalterado) | ❌ | ❌ | ✅ `correcoes[]` + PIN |
| Trocar cliente | ✅ | `Venda.clienteId/Nome` + `payload.customerCpf/Name` | ❌ | ❌ (**não revincula título à prazo**) | ❌ | ✅ `correcoes[]` |
| Editar observação | ✅ | `payload.observacao` | ❌ | ❌ | ❌ | ✅ `correcoes[]` |
| Pagamento múltiplo / entrada+saldo | ❌ | — | — | — | — | — |
| Editar vencimento/parcelas | ❌ | — | — | — | — | — |
| Add/remover/trocar produto | ❌ | — | — | — | — | — |
| Editar qtd/preço/desconto de item | ❌ | — | — | — | — | — |
| Cadastro rápido de cliente | ❌ no modal | — | — | — | — | — |
| Editar data | ❌ | — | — | — | — | — |

### 3.2 Salvaguardas que JÁ existem (pontos positivos)

- **Total imutável:** soma da nova forma ≠ `Venda.total` ⇒ `422 total_mismatch` (`corrigir/route.ts:158`).
- **Motivo obrigatório** em qualquer correção (`:80`).
- **PIN de supervisor** para correção financeira, validado contra `User.pin` com role ADMIN (`:104`).
- **Venda cancelada** rejeita correção (`409`, `:128`).
- **Trilha before/after** em `payload.correcoes[]` (`:136-235`).
- Estoque e itens **intocados por design**.

### 3.3 Lacunas estruturais (correlato direto dos 10 problemas relatados)

1. **Pagamento múltiplo / entrada+saldo:** a UI redistribui 100% do total numa única forma (`handleCorrigir:819-822`). Não há breakdown editável.
2. **Vencimento/parcelas:** sem acesso a `ContaReceberTitulo` nem a `aPrazoConfig`.
3. **Produtos/itens:** nenhuma edição de linha; itens/total são "congelados".
4. **Cadastro rápido:** a aba Cliente só seleciona cadastro existente; o endpoint `POST /api/clientes/quick` **já existe** (ver §6.4) mas **não está plugado aqui**.
5. **Visão do que a venda gerou no financeiro:** o `GET` detalhe **não** retorna a lista de `MovimentacaoFinanceira`, os `ContaReceberTitulo` à prazo, o ledger de estoque nem o uso de crédito — só pagamentos derivados do breakdown.
6. **Auditoria completa:** `correcoes[]` é exibido só de forma fragmentada (histórico de observação no modal; seção "Correções" no drawer); não há linha do tempo unificada (venda → correções → devoluções → cancelamento).
7. **Fiscal:** não há nada — o sistema não emite documento fiscal (ver §8 e PARTE 8).
8. **Data:** não editável (ver PARTE 7 — e a recomendação é manter assim para a data *real*).

---

## PARTE 4 — Auditoria financeira

### 4.1 Como uma venda gera financeiro (verificado em `ops-upsert-venda.ts`)

- **À vista** (dinheiro/pix/débito/crédito/carnê): 1 `MovimentacaoFinanceira` `entrada/origem:"venda"`, valor = `total − aPrazo`, `createdAt = at` (Step 4, `:341-367`). Carnê é tratado como recebimento imediato.
- **À prazo:** N `ContaReceberTitulo` (1 por parcela), com `localKey` idempotente (Step 6, `:415-503`). Não vira entrada de caixa.
- **Vale/crédito:** debita `ClienteCredito` FIFO + grava `UsoCreditoCliente` (Step 5, `:369-408`). Não é receita nova.
- **Caixa:** o fechamento (`computeFechamentoResumo`) lê `paymentBreakdown` **por forma** e calcula `saldoDinheiroEsperado` a partir de `pg.dinheiro` (`caixa-fechamento-resumo.ts:290`). Ou seja: **a gaveta esperada depende do breakdown da venda.**

### 4.2 O que a correção de pagamento faz hoje — e onde quebra

O `corrigir/route.ts` (`:181-194`), na correção de pagamento, **apenas** atualiza `MovimentacaoFinanceira.descricao`. **Não** recomputa valor, **não** cria/cancela título, **não** mexe em crédito. Isso é **seguro** apenas no caso à vista↔à vista de mesma natureza de receita imediata. Mas o `Select` do modal oferece **"A Prazo"** e **"Vale/Crédito"** (`vendas-arquivo-geral.tsx:2294-2295`), abrindo dois caminhos inconsistentes:

- **À vista → À Prazo** (ex.: Dinheiro → A Prazo): o breakdown passa a ter `aPrazo = total`; o fechamento de caixa passa a **tirar esse valor da gaveta esperada** (correto pelo breakdown), **porém**:
  - a `MovimentacaoFinanceira` de entrada continua com o valor cheio (não foi estornada) → **caixa e financeiro divergem**;
  - **nenhum `ContaReceberTitulo` é criado** → a dívida do cliente fica **invisível** no Contas a Receber.
- **À Prazo → À vista:** o título à prazo **continua aberto** (não é cancelado) e **nenhuma entrada de caixa nova** é lançada → dinheiro "recebido" some E a cobrança permanece. Dupla inconsistência.
- **→ Vale/Crédito:** nenhum `ClienteCredito` é debitado.

> Esse é o achado financeiro mais grave (ver F-01). A boa notícia: o **cancelamento já tem o padrão de reversão correto** (`estornarMovimentacaoPorReferencia`, `cancelContaReceber`, estorno de entrada). O workspace deve **reusá-lo** para qualquer correção que mude a natureza do pagamento.

### 4.3 Respostas exigidas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Alterar pagamento depois da venda — o que precisa acontecer? | Se muda só a *forma à vista* (mesmo valor imediato): basta reetiquetar (como hoje). Se muda a *natureza* (vista↔prazo↔vale): **reverter os lançamentos antigos e recriar os novos** (entrada, título, crédito). |
| 2 | Estornar movimento anterior? | Sim, sempre que a natureza/valor muda. Usar `estornar…PorReferencia` (saída compensatória), nunca `delete`. |
| 3 | Criar novo movimento? | Sim — nova entrada e/ou novo título e/ou débito de crédito, espelhando `upsertVendaInTransaction`. |
| 4 | Atualizar fechamento de caixa? | O fechamento é **derivado** do breakdown — recalcula sozinho **se a sessão ainda estiver aberta**. Se a sessão/período já fechou, a correção **invalida silenciosamente** uma conferência já feita. |
| 5 | Atualizar contas a receber? | Sim — criar/cancelar/reparcelar `ContaReceberTitulo` conforme o novo `aPrazo`. |
| 6 | Impedir correção se o caixa já fechou? | **Sim — e hoje NÃO impede.** O `corrigir` não chama `verificarPeriodoFechado` (o `cancelar` chama, `:122`). Ver F-02. |

---

## PARTE 5 — Auditoria de estoque

### 5.1 Como a venda baixa estoque

`ops-upsert-venda.ts` Step 3 (`:237-332`): agrega qtd por produto, resolve `id|sku|barcode`, **pula linhas virtuais** (`isVirtualSaleLine` → `__avulso__`/`__os__`), grava `MovimentacaoEstoque` `saida/origem:"pdv"` e decrementa `Produto.stock`. Com `enforceStock` (PDV ao vivo) a baixa é **atômica anti-negativo** (`updateMany … stock >= qty`).

O cancelamento (`cancelar/route.ts:169-231`) é o espelho: repõe o **líquido** (vendido − já devolvido), `origem:"cancelamento_pdv"`, idempotente por (documento, produto, origem).

### 5.2 Respostas exigidas (regras para o workspace)

| # | Pergunta | Regra recomendada |
|---|---|---|
| 1 | Editar item deve restaurar estoque antigo? | Sim — toda edição de item é **delta**: gera movimento de ajuste com a diferença, nunca reescreve `ItemVenda` sem ledger. |
| 2 | Adicionar item baixa estoque novo? | Sim — saída adicional (`origem` própria, ex.: `correcao_pdv`), respeitando anti-negativo. |
| 3 | Remover item devolve estoque? | Sim — entrada compensatória. Conceitualmente é uma **devolução** — avaliar reusar o fluxo de devolução em vez de criar caminho paralelo. |
| 4 | Alterar quantidade aplica delta? | Sim — `delta = nova − antiga`; delta<0 repõe, delta>0 baixa. |
| 5 | Como evitar estoque negativo? | Reusar o predicado atômico `stock >= qty` (`enforceStock`) já existente. |
| 6 | Como auditar tudo? | Cada delta = uma `MovimentacaoEstoque` com `documento = pedidoId`, `origem = "correcao_pdv"`, `motivo`, `usuario`. Idempotência por chave composta. |

> **Decisão de arquitetura (importante):** editar itens de uma venda já fechada é, na prática, **uma devolução parcial + uma nova venda/ajuste**. O sistema **já tem** devolução/troca robusta (`trocas-devolucao.tsx`, `DevolucaoVenda`). Recomenda-se que a aba "Produtos" do workspace **oriente para troca/devolução** nos casos que mexem em valor/estoque, e reserve a edição direta de item para **correção de digitação que não altera estoque nem total** (ver F-04). Isso evita reimplementar netting de estoque/financeiro.

---

## PARTE 6 — Auditoria de cliente

### 6.1 O que existe

- Troca de cliente: `corrigir/route.ts:198-222` atualiza `Venda.clienteId/Nome` e re-deriva `customerCpf/Name` do cadastro.
- Vínculo com Contas a Receber: **não há revínculo** — os `ContaReceberTitulo` à prazo guardam o nome do cliente em `payload.cliente`/coluna `cliente` (string), criados no momento da venda; trocar o cliente da venda **não atualiza os títulos** já gerados.
- Cadastro rápido: a aba Cliente não cria; mas existe `POST /api/clientes/quick` (§6.4).

### 6.2 Respostas exigidas

| # | Pergunta | Resposta/recomendação |
|---|---|---|
| 1 | Trocar cliente atualiza contas a receber? | **Deve.** Hoje não atualiza → título à prazo fica no nome antigo. Para venda com título aberto, a troca de cliente precisa propagar para os títulos (ou ser bloqueada com aviso). |
| 2 | Atualiza histórico/CRM? | Deve refletir no 360° do novo cliente (a venda já passa a apontar para ele via FK). O CRM consome `Venda.clienteId`. |
| 3 | Reimprimir cupom com novo cliente? | Opcional — oferecer reimpressão, sem reemitir automaticamente. |
| 4 | Exigir motivo? | Sim — já exige (`motivo` obrigatório). Para venda à prazo, exigir motivo **e** permissão elevada. |

### 6.3 Cliente obrigatório em venda à prazo

Regra de negócio a reforçar no workspace: venda com `aPrazo > 0` **não pode** ficar "Consumidor Final". Remover o cliente de uma venda à prazo deve ser bloqueado (a cobrança ficaria órfã).

### 6.4 Cadastro rápido — fundação já existe (não plugada)

`app/api/clientes/quick/route.ts` (**arquivo novo, não commitado** — ver §14): cadastro mínimo (name obrigatório; phone/document opcionais), aberto a qualquer operador autenticado, `storeId` do header sem fallback. **O workspace deve consumir esse endpoint na aba Cliente** (botão "Cadastrar novo") — fechando o problema #6 com reuso, sem novo backend.

---

## PARTE 7 — Auditoria de data da venda (decisão com cautela)

### 7.1 Quantas "datas" existem

| Conceito | Onde mora hoje | Quem consome |
|---|---|---|
| Data real de criação | `Venda.at` | Listagem, ordenação, auditoria |
| Data financeira (caixa) | `MovimentacaoFinanceira.createdAt` (= `at`) | **Janela da sessão de caixa** e do fechamento diário/mensal |
| Data de competência | **não existe** | — |
| Data fiscal | **não existe** (sem módulo fiscal) | — |
| Data de vencimento | `ContaReceberTitulo.vencimento` (string) | Contas a Receber |

> **Risco crítico de editar `Venda.at`:** o fechamento de caixa filtra `MovimentacaoFinanceira` por `createdAt` dentro de `[abertaEm, fechadaEm]` da sessão (descrito em `ops-upsert-venda.ts:351-354` e `caixa-fechamento-resumo.ts`). Mudar a data **move a venda para outra sessão/dia**, podendo cair em período já fechado e quebrar conferências passadas.

### 7.2 Respostas exigidas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Data da venda pode ser alterada? | **Data real (`Venda.at`): não.** É imutável após gravada. |
| 2 | Em quais condições? | Só uma **data de competência/operacional** separada, e somente se a venda **não** estiver em período fechado. |
| 3 | Quem pode? | Admin/supervisor com permissão dedicada. |
| 4 | Precisa permissão admin? | Sim, sempre + PIN. |
| 5 | Auditoria? | Log obrigatório em `correcoes[]` (antes/depois, motivo, operador). |
| 6 | Impacto em caixa/fiscal/financeiro? | Por isso **só** a data de competência muda; `at`/`createdAt`/vencimento dos títulos permanecem como fonte para caixa e cobrança. |

**Recomendação (alinhada ao GOAL):** **não** permitir editar a data real. Se houver necessidade contábil, criar `payload.dataCompetencia` (novo campo JSON, aditivo, sem migration) com log obrigatório e gate admin. Vencimento de parcelas é editado na aba Financeiro (não é "data da venda").

---

## PARTE 8 — Fiscal (estado real)

Verificação por busca: **não há emissão fiscal** no projeto. Os hits de "fiscal/nfce/nfe" são (a) o componente `cupom-nao-fiscal.tsx` (HTML explicitamente **não fiscal**), (b) campos de produto e (c) menções em docs/roadmap. Não há variáveis de ambiente fiscais, rota SEFAZ, nem modelo de documento fiscal no schema.

**Conclusão:** a aba "Fiscal" do workspace é **greenfield/roadmap**. No v01 ela deve ser **read-only / placeholder** ("documento fiscal não emitido") e, sobretudo, o workspace deve ser **fiscal-ready**: nunca destruir dado que um futuro motor fiscal precisará (total, itens, impostos por item, datas). Toda correção deve ser **reversível e auditável** justamente para sobreviver à futura conciliação fiscal.

---

## PARTE 9 — Proposta de Workspace de Correção de Venda

Substitui o `Dialog` de 3 abas por um **workspace** (drawer largo ou rota dedicada) com 9 abas. Cabeçalho fixo: `pedidoId`, data, status, total, operador, terminal, badges (à prazo / com devolução / corrigida N×).

| # | Aba | Editável | NÃO editável | Ações | Permissão | Risco |
|---|---|---|---|---|---|---|
| 1 | **Resumo** | — (read-only) | tudo | Reimprimir, ir para abas | operador | baixo |
| 2 | **Produtos** | qtd/preço/desconto/add/remove **somente via delta auditado**; correção de nome/digitação livre | `pedidoId` | "Editar item" (delta) ou "Abrir troca/devolução" | supervisor p/ delta | **P0** (estoque+total) |
| 3 | **Pagamentos** | breakdown completo (múltiplo, entrada+saldo) | `total` (soma deve bater) | Reverter+recriar lançamentos | PIN supervisor | **P0** (caixa+CR) |
| 4 | **Cliente** | trocar/limpar; **cadastro rápido** | CPF de venda já fiscalizada (futuro) | Buscar / "Cadastrar novo" (`/api/clientes/quick`) | operador; supervisor se à prazo | médio |
| 5 | **Financeiro** | vencimento/parcelas dos títulos | valor total da venda | Reparcelar, ver movimentações | supervisor | **P0** (CR) |
| 6 | **Estoque** | — (read-only do ledger) | ledger histórico | Ver `MovimentacaoEstoque` da venda | operador | baixo (read) |
| 7 | **Fiscal** | — (placeholder) | — | "Emitir" desabilitado (roadmap) | — | n/a |
| 8 | **Auditoria** | — | trilha imutável | Linha do tempo unificada | operador | baixo |
| 9 | **Observações** | texto livre | — | Salvar (log) | operador | baixo |

**Campos por aba (resumo):**
- **Resumo:** total, líquido/bruto/desconto, formas, cliente, datas, status, contadores.
- **Produtos:** linha = nome, qtd, preço unit., desconto, lineTotal, origem (catálogo/avulso/OS), `inventoryId`.
- **Pagamentos:** uma linha por forma com valor; validação Σ = total; sinalização do que muda de natureza (vista↔prazo↔vale) e o estorno/recriação que isso dispara.
- **Cliente:** atual, busca, resultado, "cadastrar novo", aviso de revínculo de título à prazo.
- **Financeiro:** lista de `MovimentacaoFinanceira` (origem venda/estorno) + `ContaReceberTitulo` (parcela, vencimento, status, valor) + uso de crédito.
- **Estoque:** lista de `MovimentacaoEstoque` (saída pdv, reposições, ajustes de correção).
- **Auditoria:** venda criada → correções → devoluções → cancelamento, com operador/PIN/motivo.

---

## PARTE 10 — Regras de segurança (invariantes do workspace)

1. **Nunca apagar venda** — só `status` + log (já é assim).
2. **Nunca alterar `total` sem rastreio** — qualquer mudança de valor passa por aba Produtos/Pagamentos com motivo + delta auditado.
3. **Nunca alterar período/caixa fechado** sem regra explícita — **chamar `verificarPeriodoFechado` no `corrigir`** (hoje ausente) e bloquear/exigir reabertura, como o `cancelar` faz.
4. **Nunca alterar estoque sem `MovimentacaoEstoque`** — toda edição de item = ledger.
5. **Nunca alterar cliente de título à prazo sem log** — e propagar/bloquear conforme §6.
6. **Nunca alterar data fiscal/real** — só `dataCompetencia` separada (PARTE 7).
7. **Toda correção exige motivo** (já é assim).
8. **Toda correção grava operador** (e PIN do supervisor quando financeira).
9. **Toda correção é reversível ou auditável** — preferir movimento compensatório (padrão do `cancelar`) a `update`/`delete` destrutivo.
10. **Gate de permissão consistente** — o `corrigir` deve adotar `requireEnterpriseWith` como o `cancelar` (ver F-03).

---

## PARTE 11 — Plano de implementação (fases pequenas)

| Fase | Objetivo | Arquivos prováveis | Schema/migration? | Risco | Validação |
|---|---|---|---|---|---|
| **F1** | Este documento + decisão (data, escopo, reuso do padrão cancelar) | `docs/audits/…` | Não | nulo | revisão humana (Gate #1) |
| **F2 — Pagamentos & prazo (P0)** | (a) **Travar** correção que muda natureza vista↔prazo↔vale enquanto não houver reversão; (b) trava de período fechado; (c) breakdown múltiplo + entrada/saldo com **estorno+recriação** reusando `estornar…PorReferencia`/`cancelContaReceber`/criação de título | `corrigir/route.ts`, `lib/financeiro/services/*`, modal | Não (reusa) | **alto** (núcleo) | `tsc`, `build`, teste de caixa antes/depois |
| **F3 — Cliente & cadastro rápido (P2)** | Plugar `POST /api/clientes/quick` na aba Cliente; propagar/avisar revínculo de título à prazo | `vendas-arquivo-geral.tsx`/novo workspace | Não | médio | `tsc`, teste manual |
| **F4 — Produtos & estoque (P0)** | Edição de item por **delta** auditado **ou** roteamento para troca/devolução existente; anti-negativo | novo endpoint `corrigir-itens` ou reuso devolução; `ops-upsert-venda`-style | Possível (origem nova de ledger; sem schema) | **alto** | teste de estoque líquido |
| **F5 — Financeiro / contas a receber (P0)** | Aba Financeiro: ler movimentações + títulos; reparcelar/editar vencimento via serviços CR | `GET /api/vendas/[id]` (enriquecer), `contas-receber-service` | Não | alto | conferência CR |
| **F6 — Auditoria/logs (P2)** | Linha do tempo unificada + expor `correcoes[]`/devoluções/cancelamento | `GET` detalhe, workspace | Não | baixo | revisão |
| **F7 — Data de competência (P2)** | `payload.dataCompetencia` com gate admin + log; **sem** tocar `at` | `corrigir/route.ts`, modal | Não (JSON aditivo) | médio | teste de não-regressão de caixa |
| **F8 — Fiscal-ready (P3)** | Aba Fiscal placeholder; garantir que nada destrói dado fiscal futuro | workspace | Não | baixo | revisão |

> **Pré-requisito de F2/F4/F5:** como tocam PDV/Financeiro (áreas protegidas — `CORE_RULES §5`), exigem **autorização explícita** do usuário e provavelmente um **ADR** para o "motor de reversão de correção". F3/F6/F7/F8 são aditivas e de baixo risco.

---

## PARTE 12 / §13 — Findings consolidados (P0–P3)

### 13.1 Resumo executivo

| Severidade | Qtd | Itens |
|---|---|---|
| P0 | 2 | F-01, F-02 |
| P1 | 2 | F-03, F-04 |
| P2 | 4 | F-05, F-06, F-07, F-08 |
| P3 | 2 | F-09, F-10 |

**Diagnóstico em 1 parágrafo:** a correção atual é **segura no escopo estreito** para que foi feita (swap de forma à vista, cliente, observação — com motivo, PIN e auditoria) e o cancelamento já provê o **padrão de reversão ERP** que falta à correção. Os dois riscos sérios são *imediatos e independentes do workspace*: (F-01) o `Select` de pagamento permite escolher **À Prazo/Vale**, disparando um caminho que só reetiqueta a movimentação — gerando caixa ≠ financeiro e dívida invisível em Contas a Receber; e (F-02) o `corrigir` **não verifica período fechado**, permitindo alterar o mix de pagamento de uma venda cuja gaveta já foi conferida. O resto (itens, parcelas, múltiplo, cadastro rápido, visão financeira, data) é **lacuna de escopo** a ser entregue como Workspace, reusando devolução/troca e os serviços de Contas a Receber em vez de reimplementar netting.

### 13.2 Findings

#### F-01 · Correção de pagamento permite mudar a NATUREZA (à prazo/vale) sem reverter lançamentos — `P0`
- **Local:** `app/api/vendas/[id]/corrigir/route.ts:149-195` + `components/dashboard/vendas/vendas-arquivo-geral.tsx:2294-2295` (opções "A Prazo"/"Vale/Crédito") e `:819-822`.
- **Descrição:** ao corrigir o pagamento, o servidor só atualiza `MovimentacaoFinanceira.descricao`. Se a nova forma for `aPrazo`/`creditoVale` (ou se a venda original era à prazo), o valor da entrada não é estornado, **nenhum `ContaReceberTitulo` é criado/cancelado** e **nenhum `ClienteCredito` é debitado/restaurado**.
- **Evidência:** o único efeito financeiro é `tx.movimentacaoFinanceira.update({ data: { descricao } })` (`:188`). Comparar com a reversão completa do `cancelar` (`:233-308`).
- **Impacto:** caixa esperado (deriva do breakdown) diverge do financeiro real; cobrança a prazo fica invisível; saldo de crédito do cliente fica errado. Dinheiro/cobrança incorretos = P0.
- **Causa raiz:** o endpoint foi desenhado só para swap à vista↔à vista; a UI, porém, expõe todas as formas.
- **Plano sugerido:** curto prazo — **restringir** o `Select` às formas à vista de mesma natureza e rejeitar `aPrazo`/`creditoVale` no servidor (`422`). Médio prazo (F2) — implementar estorno+recriação reusando `estornarMovimentacaoPorReferencia`, `cancelContaReceber` e a criação de título de `ops-upsert-venda`.
- **Sprint/ADR alvo:** SPRINT_PDV_CORRECAO_F2 + ADR "motor de reversão de correção de venda".

#### F-02 · `corrigir` não respeita período/caixa fechado — `P0`
- **Local:** `app/api/vendas/[id]/corrigir/route.ts` (ausência de `verificarPeriodoFechado`).
- **Descrição:** diferente do `cancelar` (`cancelar/route.ts:122`), a correção não checa fechamento. Corrigir a forma de pagamento de uma venda de um dia já fechado altera o breakdown que alimenta o `saldoDinheiroEsperado`, invalidando uma conferência já assinada.
- **Evidência:** `caixa-fechamento-resumo.ts:290` deriva a gaveta de `pg.dinheiro`; `fechamento-service.ts:116` é a trava existente, não chamada aqui.
- **Impacto:** conferência de caixa fechada deixa de bater; auditoria financeira inconsistente. P0 (dinheiro/fechado).
- **Plano sugerido:** chamar `verificarPeriodoFechado(storeId, venda.at)` no início; se fechado, retornar `409 periodo_fechado` (igual ao cancelar). Permitir correção apenas após reabertura.
- **Sprint/ADR alvo:** SPRINT_PDV_CORRECAO_F2 (item rápido, pode ir antes).

#### F-03 · `corrigir` sem gate de permissão enterprise — `P1`
- **Local:** `corrigir/route.ts:117` (usa `auth()` só para rótulo do operador; não bloqueia).
- **Descrição:** o `cancelar` exige `requireEnterpriseWith(p => p.pdv.cancelarVenda)` (`cancelar/route.ts:42`); o `corrigir` não exige permissão equivalente — correção de cliente/observação não tem gate além do PIN (que só cobre pagamento).
- **Impacto:** postura de autorização inconsistente entre operações de pós-venda.
- **Plano sugerido:** adotar `requireEnterpriseWith` (ex.: `p.pdv.corrigirVenda`) coerente com o cancelar.
- **Sprint/ADR alvo:** SPRINT_PDV_CORRECAO_F2.

#### F-04 · Impossível corrigir itens (qtd/preço/desconto/add/remove) — `P1`
- **Local:** modal atual (sem aba Produtos) + `corrigir/route.ts` (não toca `ItemVenda`).
- **Descrição:** erro de bipagem/preço só pode ser resolvido cancelando a venda inteira ou via devolução. Não há correção cirúrgica de item.
- **Impacto:** retrabalho operacional; vendas canceladas indevidamente; relatórios de margem imprecisos.
- **Plano sugerido (F4):** edição por **delta auditado** com ledger de estoque; para mudanças de valor preferir rotear ao fluxo de **troca/devolução** já existente (`trocas-devolucao.tsx`). Editar nome/digitação que não muda estoque nem total pode ser direto + log.
- **Sprint/ADR alvo:** SPRINT_PDV_CORRECAO_F4.

#### F-05 · Detalhe não mostra o que a venda gerou no financeiro — `P2`
- **Local:** `GET /api/vendas/[id]` (`route.ts:137-197`).
- **Descrição:** retorna pagamentos (derivados do breakdown) e devoluções, mas **não** `MovimentacaoFinanceira`, `ContaReceberTitulo` à prazo, `MovimentacaoEstoque` nem uso de crédito.
- **Impacto:** o operador não enxerga parcelas/títulos/estornos da venda → correção às cegas.
- **Plano sugerido (F5):** enriquecer o `GET` com os satélites (filtrando por `pedidoId`/`localKey`) para alimentar as abas Financeiro/Estoque.

#### F-06 · Pagamento múltiplo / entrada+saldo inexistente — `P2`
- **Local:** `handleCorrigir:819-822` (redistribui 100% numa forma).
- **Descrição:** não dá para representar "R$50 dinheiro + R$100 PIX" nem "entrada + saldo a prazo".
- **Plano sugerido (F2):** breakdown editável com validação Σ = total; reuso do `PaymentModal` (`payment-modal.tsx`) que já faz isso no PDV.

#### F-07 · Cadastro rápido de cliente não plugado — `P2`
- **Local:** aba Cliente (`:2342-2455`) só seleciona existentes; `app/api/clientes/quick/route.ts` existe mas não é consumido.
- **Plano sugerido (F3):** botão "Cadastrar novo" chamando `/api/clientes/quick`, selecionando o cliente recém-criado.

#### F-08 · Troca de cliente não propaga para título à prazo — `P2`
- **Local:** `corrigir/route.ts:198-222` (atualiza venda, não os títulos).
- **Descrição:** título à prazo guarda nome do cliente como string no momento da venda; trocar o cliente não atualiza a cobrança.
- **Plano sugerido (F3/F5):** propagar nome ao(s) título(s) abertos ou bloquear troca quando há título à prazo, com aviso.

#### F-09 · Auditoria fragmentada (sem timeline unificada) — `P3`
- **Local:** `correcoes[]` exibido só parcialmente (modal observação `:2477-2498`; drawer seção "Correções").
- **Plano sugerido (F6):** aba Auditoria com linha do tempo única (criação → correções → devoluções → cancelamento).

#### F-10 · UX do modal (Dialog estreito de 3 abas) abaixo de ERP premium — `P3`
- **Local:** `Dialog max-w-lg` (`:2232`).
- **Plano sugerido (F1+):** evoluir para workspace (drawer largo/rota) com 9 abas, mantendo tokens semânticos.

---

## §14. O que NÃO foi alterado / nota sobre a árvore de trabalho

- **Auditoria 100% read-only.** Nenhum arquivo de aplicação tocado. Único arquivo criado: este documento.
- **Há mudanças não commitadas pré-existentes** na árvore (não feitas por esta auditoria): `M payment-modal.tsx`, `M pdv-classic.tsx`, `M pdv-cliente-picker.tsx`, `M pdv-supermercado.tsx`, `M venda-completa-enterprise.tsx`, `M PdvBlackEdition.tsx`, `M lib/operations-sale-types.ts`, `M lib/ops-upsert-venda.ts`, e os novos `app/api/clientes/quick/` e `docs/audits/AUDITORIA_PDV_NEXT_DECISAO_v01.md`. Parecem ser a fundação do **cadastro rápido de cliente no PDV** (relacionado a F-07). **Não foram analisados em profundidade nem modificados.**

---

## §15. Recomendações priorizadas

| # | Ação | Severidade | Tipo | Owner sugerido |
|---|---|---|---|---|
| 1 | Restringir formas de pagamento corrigíveis às à vista + rejeitar aPrazo/vale no servidor | P0 | sprint | Sonnet |
| 2 | Adicionar `verificarPeriodoFechado` ao `corrigir` | P0 | sprint | Sonnet |
| 3 | ADR "motor de reversão de correção" (estorno+recriação reusando cancelar) | P0 | ADR | Opus |
| 4 | Gate de permissão enterprise no `corrigir` | P1 | sprint | Sonnet |
| 5 | Workspace 9 abas (substituir Dialog) + enriquecer GET detalhe | P1/P2 | sprint | Sonnet |
| 6 | Plugar cadastro rápido + propagação de cliente em título à prazo | P2 | sprint | Sonnet |

---

## §16. Próximos GOALs recomendados

1. **GOAL_TRAVA_CORRECAO_PAGAMENTO_P0** — fechar F-01/F-02 (mudança cirúrgica no `corrigir` + UI), sem schema. *Pode ir já, com autorização (área protegida).*
2. **GOAL_ADR_MOTOR_REVERSAO_CORRECAO** — formalizar o reuso do padrão do `cancelar` para qualquer correção que mude valor/natureza.
3. **GOAL_WORKSPACE_CORRECAO_F_UI** — workspace 9 abas + GET detalhe enriquecido (F-05/F-06/F-09/F-10).
4. **GOAL_CORRECAO_ITENS_VIA_DELTA** — F-04, decidindo entre delta auditado vs. roteamento à devolução.
5. **GOAL_DATA_COMPETENCIA** — F-07 data, aditivo em payload, gate admin.

---

## §17. Referências

- Implementação atual: `components/dashboard/vendas/vendas-arquivo-geral.tsx`, `app/api/vendas/[id]/{route,corrigir/route,cancelar/route}.ts`
- Persistência/reversão: `lib/ops-upsert-venda.ts`, `lib/financeiro/services/{fechamento-service,movimentacoes-service,contas-receber-service}.ts`
- Caixa: `lib/caixa-fechamento-resumo.ts`
- Tipos: `lib/operations-sale-types.ts`
- Entrega original: `docs/ai/VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md`
- Governança: `docs/skills/rules/CORE_RULES.md`, `docs/audits/TEMPLATE_AUDITORIA.md`

## §18. Imutabilidade

Após `status = publicada`, o conteúdo não é editado (exceto correção tipográfica). Mudança de cenário → `AUDITORIA_WORKSPACE_CORRECAO_VENDA_v02.md` com §8 (comparativo) preenchido.
