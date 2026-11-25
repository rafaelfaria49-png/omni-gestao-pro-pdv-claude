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

## 2. Diagnóstico da venda real VDA-L01-2026-000760

**Estado: não auditado no banco.** A leitura de Production exige credencial que só pode ser
usada com autorização explícita do proprietário (bloqueada nesta sessão, corretamente).
Script pronto, somente leitura, em
[`auditoria-venda-000760-readonly.sql`](../../ai-execution/_evidence/OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001/auditoria-venda-000760-readonly.sql)
(abre com `BEGIN TRANSACTION READ ONLY`, termina em `ROLLBACK`).

Hipótese mais provável pelo código (a confirmar com o script):

1. "Devolvido 1" veio do `qtyReturned` **local** do terminal (A) — prova de que o terminal registrou a devolução localmente.
2. O Histórico mostra a venda **Concluída**. Uma devolução total persistida pela rota muda o status para `devolvida`. Logo, o mais provável é que **não exista devolução persistida** para 000760 (causa B ou falha do POST), ou que ela tenha sido gravada com `vendaLocalId` diferente.
3. Sem crédito persistido, a nova venda (X-360 com `creditoVale` 119,90) foi recusada pelo servidor (C) e pode estar pendente/quarentenada no terminal. Os R$ 10,00 foram recebidos fisicamente.
4. O PS4 não existir no cadastro é **improvável**: a devolução local recusa item fora do inventário antes de marcar `qtyReturned`.

Classificação esperada: **(2) devolução apenas local, pendente ou descartada por colisão** + **nova venda não persistida**. Só o script confirma.

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

## 6. Proposta de recuperação da venda 000760 (aguarda autorização)

Nada é executado sem ordem do proprietário. Após rodar o script (seção 2):

- **Se não houver devolução nem nova venda persistidas** (cenário mais provável): após o deploy desta PR, registrar a troca pela tela nova com a venda 000760 → PS4 → X-360. Como os R$ 10,00 **já foram recebidos** no dia 21/11, **não** lançar a diferença como nova entrada de dinheiro na sessão atual: registrar a diferença com o mesmo valor e conferir com o proprietário se o caixa de 21/11 já tem esses R$ 10,00 como sobra (se sim, a correção é o ajuste daquela conferência, não nova cobrança). Isso exige uma decisão do proprietário sobre qual sessão recebe a entrada — não há opção automática para sessão fechada neste fluxo.
- **Se houver devolução persistida sem a nova venda**: não criar outra devolução; registrar só a nova venda do X-360 consumindo o crédito existente (`creditoVale`) com a mesma regra dos R$ 10,00.
- **Se houver nova venda pendente no terminal**: não reenviar às cegas; descartar a pendência só depois de a troca estar confirmada no servidor.
- **Devolução local antiga no terminal** (se ainda pendente): após a troca confirmada, a rota legada a recusará por quantidade; descartá-la manualmente da fila.
