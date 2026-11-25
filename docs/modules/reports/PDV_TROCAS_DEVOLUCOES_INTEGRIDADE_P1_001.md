# PDV · Trocas e devoluções — integridade e histórico (P1-001)

GOAL `OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001` · branch `fix/pdv-trocas-devolucoes-integridade-001` · base `origin/main e609ef0`.

## 1. Causa raiz (comprovada no código da main)

| # | Defeito | Efeito na loja |
|---|---------|----------------|
| A | `registrarDevolucao` muda **localmente** `qtyReturned`, estoque, crédito e lista de devoluções e dispara o `POST /api/ops/devolucao` sem esperar (`void fetch`). | O modal passa a mostrar "Devolvido 1 · Disponível 0" **naquele navegador** mesmo que o servidor nunca tenha gravado nada. O `qtyReturned` nunca vem do servidor (`saleFromDbRow` usa o payload da venda, e o merge preserva o local). |
| B | O `localId` da devolução (`DEV-AAAA-NNNN`) é um contador **por navegador**; o servidor deduplica por `(storeId, localId)` e respondia `ok/idempotente` para qualquer corpo. | Dois terminais (PDV desktop, navegador, outra máquina) geram o mesmo número: a segunda devolução era descartada no servidor e marcada como sincronizada no terminal. Some sem erro. |
| C | Troca imediata = devolução local + `finalizeSaleTransaction` com `creditoVale`. O débito do vale no servidor exige o `ClienteCredito` criado pelo POST assíncrono do passo A. | Se a nova venda chega antes (ou o POST de A falhou / caiu em B), o servidor recusa com `CREDITO_VALE_INSUFICIENTE` e a nova venda fica pendente/bloqueada. A devolução local permanece. |
| D | A validação dos itens novos acontecia **depois** do registro local da devolução. | Falha na nova venda deixava a devolução local sem a venda. |
| E | A rota da devolução lançava saída financeira `devolucao_pdv` para **vale-troca e troca**. | O financeiro registrava R$ 119,90 saindo quando nada saiu; o caixa e o DRE ficavam errados. |
| F | Disponibilidade só no cliente; o servidor não validava quantidade. | Fila antiga ou outro terminal podia devolver mais que o vendido. |
| G | Linhas identificadas por `inventoryId`. | Linhas repetidas do mesmo produto (preços diferentes) e itens sem `inventoryId` colidiam; o ledger usava a mesma chave para duas linhas do mesmo produto. |
| H | Busca da troca: `inventory.find(...)` pegava o **primeiro** produto do cadastro atual e só olhava as vendas carregadas no navegador; não usava barcode/SKU. | Bipagem e nome não localizavam a venda; avulso e produto removido eram impossíveis. |
| I | Troca exigia CPF e nome sempre (o vale precisava de titular). | Cliente sem cadastro travava a troca integral sem crédito residual. |

## 2. Diagnóstico da venda real VDA-L01-2026-000760 (auditado em Production, somente leitura)

Leitura autorizada pelo proprietário em 25/11/2026, banco `omnigestao_prod`, sessão read-only. Evidência completa em
[`auditoria-producao-2026-11-25.md`](../../ai-execution/_evidence/OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001/auditoria-producao-2026-11-25.md).

- **Devolução: não existe no servidor.** Zero documento, crédito, estoque ou financeiro. A loja-1 inteira tem 1 devolução gravada desde sempre (`DEV-2026-0001`, maio, outra venda).
- **Causa (categoria 2 — devolução apenas local):** o terminal gravou a devolução só no navegador (por isso "Devolvido 1"). A causa mais provável é a colisão: a primeira devolução de 2026 de um terminal recebe `DEV-2026-0001`, número que já existe na loja; a rota antiga respondia "ok/idempotente" e a devolução sumia.
- **Nova venda (X-360): não existe.** Nenhuma venda com X-360 nem com crédito/vale.
- **Produto original: cadastrado** (`CONTROLE DE VIDEO GAME PS4 WIRELESS`, ativo). Hipótese de lançamento avulso descartada.
- **Estoque:** PS4 = 0 e X-360 = 1 no sistema; fisicamente é o contrário.
- **Caixa/financeiro:** só a entrada de R$ 119,90 (crédito). Os R$ 10,00 recebidos em dinheiro **não estão registrados**. A sessão de 21/11 está fechada (saldo final 636,89, sem contagem informada).
- **Bipagem não achou a venda** porque a busca antiga comparava o código bipado com o id do produto, e a linha guarda o SKU; o EAN não era consultado. A busca nova acha pelo EAN, SKU e nome.

Outras devoluções da loja podem ter sido perdidas do mesmo jeito em outros terminais. O modal novo avisa quando o terminal tem uma devolução da venda que não existe no servidor.

## 3. O que mudou

- **`POST /api/ops/trocas`** (`lib/pdv/trocas/troca-service.ts`): uma transação PostgreSQL faz lock da venda (`pg_advisory_xact_lock`), calcula a disponibilidade a partir das devoluções persistidas, grava o documento de devolução com as linhas exatas (`lineIndex`), devolve ao estoque pelo boundary canônico (`applyStockMutationTx`, agregado por produto), cria o crédito e, na troca imediata, cria a nova venda pelo **motor canônico** (`upsertVendaInTransaction`, numeração V2, caixa aberto, estoque, financeiro). O crédito da troca é debitado da própria troca (`creditoValeCreditoId`), sem depender de CPF. Qualquer falha reverte tudo.
- **Idempotência**: `operationId` (`trc_…`) = `DevolucaoVenda.localId` = `clientSaleId` da nova venda. Reenvio devolve o mesmo resultado; mesma chave com outro conteúdo → `OPERACAO_REUTILIZADA`.
- **Valores no servidor**: valor devolvido da venda original (rateio de desconto global, centavo a centavo); preço da nova compra do cadastro.
- **Financeiro**: saída `devolucao_pdv` **só** quando dinheiro sai (reembolso ou sobra devolvida em dinheiro). Vale e crédito consumido não são saída. Estorno de cartão fica registrado como `pendente_manual` (nunca apresentado como executado).
- **Avulso / serviço / produto removido**: tratamento só financeiro; nenhum movimento de estoque inventado; "apenas estoque" recusa (`SEM_VINCULO_ESTOQUE`). Aparelho IMEI e produto com grade seguem bloqueados.
- **Busca** (`GET /api/ops/trocas/buscar`): SQL nas vendas persistidas — cupom, cliente, CPF/CNPJ, nome histórico da linha (sem acento), EAN/SKU/id com zeros à esquerda preservados, todos os produtos correspondentes, período e paginação.
- **Detalhe** (`GET /api/ops/trocas/venda`): disponibilidade por linha, códigos do snapshot × **cadastro atual** (rotulado), histórico de trocas/devoluções com venda substituta, diferença, reembolso, vale, operador e motivo. Usado no modal e no painel do Histórico.
- **UI compartilhada** (`trocas-devolucao.tsx`, usada por Classic, Assistência, Supermercado, Black e Histórico): nada local antes do `ok`; "Processando no servidor"; operação sem resposta fica pendente com **Verificar / reenviar** (mesma chave); comprovante só após confirmação; zero disponível mostra a devolução associada; CPF opcional salvo para vale.
- **Rota legada** `/api/ops/devolucao` (fila antiga do navegador): colisão de `localId` → 409 `DEVOLUCAO_LOCAL_ID_COLISAO`; quantidade validada no servidor sob o mesmo lock → 409 `DEVOLUCAO_ACIMA_DO_DISPONIVEL`; sem saída para vale/troca. Novos ids locais ganham sufixo aleatório.

Sem migration. Sem alteração em `prisma/schema.prisma`.

## 4. Revisão independente (somente leitura) — achados e tratamento

| Achado | Sev. | Tratamento |
|--------|------|-----------|
| Cancelar a venda original depois de vale/troca estornava em dinheiro o que já tinha virado crédito (o netting do cancelamento só descontava saídas `devolucao_pdv`, que vale/troca não geram mais) | P1 | **Corrigido** em `app/api/vendas/[id]/cancelar/route.ts`: o valor de devoluções `troca`/`vale_credito` sem saída própria entra no netting. Provado em PG (venda à vista → vale integral → cancelar = R$ 0 de estorno). |
| Cancelamento lia as devoluções fora do lock | P2 | **Corrigido**: o cancelamento toma o mesmo `pg_advisory_xact_lock` e relê devoluções/status; mudou → 409 `VENDA_ALTERADA_DURANTE_CANCELAMENTO`. |
| Após envio sem resposta, "Finalizar" criava nova chave → 2ª troca possível em devolução parcial | P2 | **Corrigido**: novo envio bloqueado enquanto houver operação sem confirmação da venda; timeout do cliente 45 s (> janela do servidor). |
| Cancelar a venda substituta reativava crédito sem titular (troca sem CPF) | P2 | **Corrigido**: venda nascida de troca recusa cancelamento (409 `VENDA_DE_TROCA`); a reversão é por Troca/Devolução nela. |
| Rateio do desconto global podia somar 1 centavo acima do pago | P3 | **Corrigido**: rateio em centavos pelo maior resto (`liquidosPorLinha`). |
| Reembolso/vale de venda a prazo/carnê ainda em aberto | P3 | **Não corrigido** (comportamento herdado da rota antiga) — residual abaixo. |

## 5. Riscos residuais

- **P1 · Gaveta não conta reembolso em dinheiro**: `computeFechamentoResumo` não tem ramo de devolução (lacuna pré-existente, documentada em `lib/caixa/conferencia-acoes.ts`). O reembolso/sobra em dinheiro entra no financeiro, não no "esperado na gaveta". Corrigir mexe no fechamento de caixa — gate próprio.
- **P2 · Snapshot de códigos para vendas futuras** não foi adicionado ao motor de venda; o detalhe mostra o cadastro atual rotulado como tal.
- **P2 · Devolução legada sem linha** (`naoAlocado`) é exibida como inconsistência; não é corrigida automaticamente.
- **P2 · Devolução de venda a prazo/carnê não quitada** pode virar reembolso ou vale sem conferir o recebido (herdado). Proposta: limitar ao valor efetivamente recebido.
- **P2 · Troca imediata exige numeração V2** (`TROCA_REQUER_NUMERACAO_SERVIDOR` onde o writer V1 estiver ativo).

## 6. Proposta de recuperação da venda 000760 (aguarda autorização do proprietário)

Nada foi executado. Depois do deploy desta PR, **no terminal que fez a troca**:

1. Abrir Troca/Devolução, buscar o EAN do PS4 ou "VDA-L01-2026-000760". O modal deve mostrar **Disponível 1** (servidor) e o aviso de devolução que só existe naquele terminal.
2. Registrar a troca: linha PS4 → X-360, diferença R$ 10,00 em **dinheiro**, motivo "nao deu certo". Isso faz, numa transação: PS4 +1, X-360 −1, devolução + nova venda vinculadas, crédito 119,90 consumido, entrada de R$ 10,00.
3. **Os R$ 10,00:** o fluxo lança a entrada na sessão de caixa **aberta no momento** (o sistema não grava em sessão fechada). Como o dinheiro entrou em 21/11 e não foi registrado, a sessão de 21/11 ficou com R$ 10,00 a mais na gaveta do que o sistema esperava. Registrar agora coloca esses R$ 10,00 no esperado da sessão atual — a gaveta de hoje **não** recebe dinheiro novo. Escolhas do proprietário:
   registrar normalmente e, na mesma sessão, fazer uma sangria de R$ 10,00 com motivo "ajuste troca 000760 — recebido em 21/11", para a gaveta atual fechar. Não usar outra forma de pagamento (a forma real foi dinheiro) e não cobrar o cliente de novo.
4. No mesmo terminal, conferir Vendas → pendências: se houver venda pendente/quarentenada do X-360, **descartar** (não reenviar) depois da troca confirmada.
5. Conferir os outros terminais da loja: o aviso "devolução que não existe no servidor" indica outras devoluções perdidas.
