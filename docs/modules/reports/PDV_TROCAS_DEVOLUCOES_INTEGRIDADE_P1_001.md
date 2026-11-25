# PDV · Trocas e devoluções — integridade e histórico (P1-001 + P1-002 + P1-003)

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

## 5. P1-002 — recuperação, caixa, a prazo/carnê e terminais

### 5.1 Regularização de troca já realizada (contrato reutilizável, sem migration)
`POST /api/ops/trocas` aceita `regularizacao: { sessaoId, dataEconomica, justificativa }` (permissão de devolução **e** de gerente — `pdv.cancelarVenda`). Reusa o contrato retroativo que o motor já tinha (`allowClosedOriginalSession`):
- a devolução e a venda substituta gravam com a **data econômica real** e na **sessão de caixa original (fechada)**; a entrada da diferença cai na janela daquela sessão;
- trilha: `regularizacao { dataEconomica, registradaEm, sessaoOriginal, justificativa, operador }` no resultado/payload, `retroactiveSync/originalSessionClosed/syncedAt` na venda, observação no movimento de estoque;
- nada na gaveta atual, **nenhuma sangria**, nenhuma cobrança nova; o fechamento gravado da sessão antiga (`saldoFinal`) não é reescrito;
- recusas: sessão ainda aberta, data fora da janela da sessão, data antes da venda, justificativa curta, período financeiro fechado na data econômica;
- `GET /api/ops/trocas/sessoes?dia=` lista as sessões fechadas do dia para escolha.

### 5.2 Fechamento de caixa
`resumoDevolucoesCaixa` (regra única): reembolso e sobra de troca **em dinheiro** deduzem a gaveta; Pix deduz só o saldo movimentado; vale, crédito consumido, estorno de cartão e "apenas estoque" não deduzem; reembolso legado sem forma não é presumido (fica em `legadoSemForma`). A sessão é a da própria devolução. `sessao-detalhe` devolve o resumo (sem expor o payload com CPF); `computeFechamentoResumo` e a composição da gaveta deduzem o valor. **Corrida devolução × fechamento**: a troca trava a linha da sessão (`FOR UPDATE`) e o fechamento também; o fechamento recalcula no servidor e recusa (`RESUMO_DESATUALIZADO_DEVOLUCAO`) um resumo que ignore dinheiro que saiu. Provado em PG (5 rodadas concorrentes).

### 5.3 Vendas a prazo e carnê
`recebimentoDaVenda` separa recebido (à vista + pagamentos dos títulos `pdv-aprazo-*` pelo histórico canônico do Contas a Receber) e saldo a receber (a prazo não pago + carnê — o motor não gera título para carnê, então não é presumido pago). Com saldo em aberto, **reembolso, vale e troca ficam bloqueados** (`VENDA_COM_SALDO_EM_ABERTO`) nas duas rotas; "Apenas estoque" segue permitido. Teto: nunca devolver acima do recebido. O ajuste da obrigação (abater o título) fica para contrato próprio do Financeiro.

### 5.4 Devoluções antigas só no terminal
A fila antiga **não é mais reenviada automaticamente**. No modal, cada devolução local ausente no servidor (inclusive as "marcadas como enviadas" pela colisão) tem: **Enviar ao servidor** (o servidor recusa colisão, quantidade e saldo em aberto) ou **Arquivar neste terminal** (motivo obrigatório; trilha append-only em `AuditoriaFinanceira`, entidade `devolucao_pdv_pendencia_local`, recusada se a devolução existir no servidor; desfaz só o vale local, a quantidade devolvida local e o estoque otimista dela; registro mantido como `arquivada`). Venda pendente com vale próxima no tempo é apontada para tratamento em Vendas → pendências.

### 5.5 Numeração da troca
A nova venda da troca usa **sempre** o alocador canônico do servidor (série da loja), sem depender do gate que escolhe o writer do PDV. Loja sem código de numeração → `SALE_NUMBERING_NOT_CONFIGURED` (409).

### 5.6 Histórico
Mantidos: código histórico da linha (`inventoryId` operacional), códigos do cadastro atual rotulados, vendido/devolvido/disponível, histórico de trocas, venda substituta, diferença e motivo. **Snapshot de identificadores em vendas futuras: não implementado** — exige mexer na sanitização de linhas do motor de venda (core). Proposta: gravar `sku`/`barcode` resolvidos no servidor em `payload.lines[]` no momento da venda, sem alterar `ItemVenda`. Aguarda decisão.

## 6. Riscos residuais

- **P2 · Ajuste da obrigação a prazo/carnê** (abater o título na devolução) não existe: a devolução financeira fica bloqueada até a quitação.
- **P2 · Snapshot de códigos para vendas futuras** (5.6) não implementado.
- **P2 · Devolução legada sem linha** (`naoAlocado`) é exibida, não corrigida.
- **P2 · Reembolso legado sem forma** não entra na gaveta automaticamente (aparece como `legadoSemForma`).
- **P2 · Conflito com as drafts #331/#336** (mesmos arquivos de troca e caixa): precisam ser reconciliadas ou fechadas antes do merge de qualquer uma.

## 7. Proposta de recuperação da venda 000760 (aguarda autorização do proprietário)

Nada foi executado. Depois do deploy desta PR, por um usuário **gerente**, **no terminal que fez a troca**:

1. Abrir Troca/Devolução e buscar o EAN do PS4 ou `VDA-L01-2026-000760`: o modal mostra **Disponível 1** (servidor) e o aviso da devolução que só existe no terminal.
2. Selecionar PS4 (1) → X-360 (1), forma da diferença **Dinheiro**, motivo "nao deu certo".
3. Marcar **Regularizar operação já feita no balcão**: data/hora da troca em 21/11/2026 (se o horário exato for desconhecido, marcar **Horário exato desconhecido** e explicar), sessão `cmwqhfve…` (21/11, 11:07–18:10), justificativa, **valor cobrado pelo X-360 na ocasião = 129,90** e **diferença recebida = 10,00** (o servidor confere a coerência com os 119,90 devolvidos, mesmo que o preço atual seja outro). Clicar **Conferir efeitos** e revisar estoque (contagem de inventário posterior aparece como "já refletido"), valores e sessão antes de finalizar.
4. Resultado: devolução e venda substituta datadas de 21/11 na sessão de 21/11; entrada de R$ 10,00 na janela daquela sessão (o dinheiro que ficou a mais na gaveta daquele dia); PS4 +1 e X-360 −1 agora; crédito 119,90 criado e consumido; **nada** na gaveta de hoje, **nenhuma sangria**, cliente não cobrado de novo. O `saldoFinal` gravado de 21/11 (636,89) permanece; o relatório recalculado da sessão passa a mostrar os R$ 10,00, com a trilha da regularização.
5. No mesmo terminal: a devolução local antiga aparece como "ausente no servidor" → **Arquivar neste terminal** com motivo "regularizada pela operação …".
6. Conferir Vendas → pendências: venda pendente do X-360, se houver, **descartar** (não reenviar).
7. Conferir os outros terminais da loja pelo mesmo aviso.

Se o horário exato da troca for desconhecido, usar um horário dentro da sessão de 21/11 e registrar isso na justificativa.

## 8. P1-003 — aceite final

### 8.1 Reabertura do modal / teclado (causa real)
O E2E falhou ao reabrir a troca depois do vale: o comprovante era um `Dialog` aninhado **desmontado ainda aberto** (`setCupom(null)`), o que deixava a pilha de camadas/foco do Radix inconsistente — Escape não fechava o diálogo de troca e o atalho CTRL do PDV ficava bloqueado. Correção: estado `open` separado dos dados (o Radix fecha a camada e devolve o foco), `onCloseAutoFocus` devolvendo o foco ao campo de busca. Prova no E2E: dois comprovantes seguidos no mesmo diálogo, busca focada, Escape fecha, CTRL reabre.

### 8.2 Valor histórico na regularização
Troca regularizada exige `valoresConfirmados { totalNovaCompra, diferencaRecebida }` (gerente + justificativa). O servidor confere `diferença = max(0, total confirmado − valor devolvido)`; incoerente → `REGULARIZACAO_VALORES_INCONSISTENTES`; ausente → `REGULARIZACAO_VALOR_HISTORICO_OBRIGATORIO`. O valor é rateado em centavos entre os itens novos (tem de fechar em unitário × quantidade). Trilha: `precos { precoAtual, precoConfirmado, diferencaRecebida, divergente }`. Troca normal não aceita valor confirmado (`VALOR_CONFIRMADO_SO_REGULARIZACAO`). Horário desconhecido → `horarioAproximado: true` registrado. Cenário provado: 119,90 → 129,90 na ocasião, preço atual 149,90 → registra 129,90 e diferença 10,00, nunca 30,00.

### 8.3 Estoque na regularização
- Só **contagem física de inventário** absorve o movimento: movimento `ajuste` com chave de ledger `inventario:<sessão>:<produto>` (gravada por `app/actions/inventario.ts`) depois da data econômica. Ajuste administrativo (`origem manual` sem chave de inventário), correção de cadastro, ajuste relativo e reconciliação estrutural **não** absorvem. O motor recebeu a opção opt-in `historicalAbsorcaoSomenteInventario` (padrão inalterado para os outros chamadores).
- Corrida contagem × regularização encontrada e corrigida: o produto é travado (`FOR UPDATE`) antes de procurar a contagem; provado em PG (4 rodadas, saldo final = contado).
- **Item com defeito**: marcação explícita por linha (`naoRevendavel`) → não volta ao estoque vendável; motivo obrigatório.
- **Conferência antes de confirmar**: `simular: true` executa a operação inteira com as mesmas travas e desfaz no fim; a tela exige a simulação do mesmo pedido antes de liberar "Finalizar" numa regularização.

### 8.4 Fechamento histórico
O fechamento gravado (`saldoFinal`, resumo persistido) não muda. `sessao-detalhe` devolve `regularizacoes { itens, dinheiroLiquido }` e o histórico do caixa mostra, à parte: esperado no fechamento original, regularizado depois, total recalculado ("não substitui o original"), data econômica, data de registro, operador, justificativa e horário aproximado. Bloqueio de período financeiro fechado mantido (data atual e data econômica).

### 8.5 Identificadores históricos
- **Venda substituta da troca**: SKU/EAN resolvidos no servidor gravados em `payload.lines[]` (provado em PG).
- **Todas as vendas novas: não implementado — GOAL separado proposto** (`OMNI-VENDAS-SNAPSHOT-IDENTIFICADORES-001`). Motivo: no motor a resolução do produto acontece intercalada à criação dos itens, depois de `Venda.create`; gravar o snapshot exige mover a resolução para antes do create ou um `UPDATE` extra do payload em toda venda do PDV, e revisar `corrigir-itens` (que reconstrói linhas). Desenho: resolver `{ sku, barcode }` junto do `findFirst` já existente, gravar em `payload.lines[i].sku/barcode` só quando a linha foi resolvida pelo servidor (nunca o valor do cliente), preservar `deviceSale`/`accessorySelection`/garantia, e fazer `corrigir-itens` copiar os campos das linhas mantidas.

### 8.6 Pilha Padaria KG e PRs antigas (#331, #336, #335, #315, #337)
| PR | Estado | Coberto pela #401 | Exclusivo da PR (não substituído) |
|---|---|---|---|
| #331 F8 troca imediata (draft, 05/11) | aberta | busca no servidor por venda/EAN/SKU/cliente; escritor transacional com teto por item e idempotência; vale pelo valor pago; sem saída fictícia; troca com motor canônico; cancelamento serializado e netting do vale; pendências legadas com trilha | **atalho F8** e item na barra do PDV Clássico; fila offline com estados (`AGUARDANDO_VENDA_ORIGEM`, bloqueio persistente); encaminhamento de pendência ao **Financeiro** com valor recalculado (rota `pendencias`); bloqueio de avulso/serviço (a #401 permite reembolso financeiro de avulso por decisão do GOAL 001) |
| #336 F8 × KG (draft, empilhada) | aberta | — | **devolução fracionada KG** com migration (`quantidadeKg`), política por loja, condição da mercadoria (apto/não apto/descarte), triggers no banco |
| #335 venda KG / #315 estoque KG / #337 readiness | abertas | — | toda a venda/estoque por peso, migrations KG e plano de rollout |

Compatibilidade nesta PR: linha vendida por peso (`vendaPorPeso` / quantidade fracionária / `ItemVenda.quantidade` nulo) **não é arredondada**: é reconhecida e recusada (`DEVOLUCAO_POR_PESO_NAO_SUPORTADA`), sem efeito. Venda KG não foi habilitada.

**Estratégia de reconciliação (não executada):** (1) mergear a #401 primeiro (escritor e busca canônicos, sem migration); (2) rebasear a #331 sobre ela e manter só o exclusivo (atalho F8, estados da fila offline já sem reenvio automático, encaminhamento ao Financeiro reaproveitando `AuditoriaFinanceira`), descartando o escritor e a busca duplicados; (3) rebasear #315→#335→#336→#337 e portar a devolução fracionada da #336 para dentro de `registrarTroca` (quantidade em gramas, política por loja, condição da mercadoria → `naoRevendavel`), substituindo o bloqueio `DEVOLUCAO_POR_PESO_NAO_SUPORTADA` só quando a migration KG estiver aplicada. Nenhuma dessas PRs deve ser fechada antes dessa portabilidade comprovada.

### 8.7 Pendências de CI fora do escopo
`08-cadastro-manual.spec.ts › logoutViaSeguranca` falha de forma intermitente (corrida do logout #342; correção proposta na #345, aberta) — passou neste mesmo branch no commit `42cb7e5`.
