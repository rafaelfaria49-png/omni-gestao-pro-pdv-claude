# INTEGRIDADE_FINANCEIRA_ESTOQUE

| Garantia | Mecanismo | Prova |
|---|---|---|
| Uma venda econômica por identidade | `@@unique([storeId, clientSaleId])` + replay em `P2002` (servidor, inalterado) | PG T12 (10 sequenciais), PG T14 (10 concorrentes) |
| Uma baixa de estoque por venda confirmada | baixa dentro da transação do writer; replay não toca estoque | PG T12/T14 (`movimentacaoEstoque` = 1, estoque −1); E2E 10 (`origem: "pdv"` = 3 para 3 vendas) |
| Um lançamento de caixa por venda | idem, financeiro na mesma transação | PG T12 (snapshot `financeiro` inalterado nos replays); modelo: `cash` = 1 |
| Nenhuma venda fantasma após timeout | prazo → resultado DESCONHECIDO, mesma identidade; consulta antes do reenvio manual | componente T15 (pendurado), T16 (perdida após commit → reconcilia sem 2º POST) |
| Nenhuma confirmação fictícia | prova obrigatória no corpo (`confirmedSaleEvidence`: mesma loja + mesma identidade) | componente T58/T17; motor (portal HTML, outra loja, outra identidade, corpo vazio) |
| Nada confirmado offline | offline = sem fetch no manual; pendente sem efeitos locais (`localEffectsApplied: false`) | componente T04/T56; E2E 10 (DB inalterado offline) |
| Isolamento multiloja | fila por `storageKey` da loja; URL e header com a loja; prova exige `storeId` igual | componente T30/T43; PG T30/T43 |
| Estoque insuficiente no retorno não confirma | 409 do writer → REJEITADA, sem loop | PG T23; componente T19-T29, T35 |
| Preço mudou offline | a venda pendente leva o preço praticado (linha congelada); divergência de catálogo no carrinho segue a política da #325 | E2E 09 (#325) para o carrinho; pendente: sem mudança unilateral (não testado em E2E nesta entrega) |
| Caixa original fechado | nunca lança no caixa atual; retroativo só manual e explícito | PG T25; componente (só `retrySyncSaleRetroactive` envia `allowClosedOriginalSession`) |
| Fechamento com pendências | fechamento exige ciência; pendentes não entram | `fechamento-pendentes-sync.component.test.ts` |
| Sincronização separada de operações sensíveis | devolução/sangria/suprimento/reembolso não foram alterados | diff |

Produção: **0 escritas, 0 leituras, 0 migrations, 0 deploys**.
