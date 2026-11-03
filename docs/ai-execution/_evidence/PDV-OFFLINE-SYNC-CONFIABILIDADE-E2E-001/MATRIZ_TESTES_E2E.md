# MATRIZ_TESTES_E2E — T01–T60

Head de código final: `b6d4d90` (CI 12/12 PASS). Legenda de evidência:
- **E2E** = `e2e/cadastros-ramos/10-pdv-offline-sync.spec.ts` — build de produção + `next start` + login NextAuth real + PostgreSQL 16 descartável + Chromium (CI run 41672371685: 33 specs esperados, 0 inesperados, 0 instáveis)
- **C** = `lib/vendas/offline-sync.component.test.ts` — OperationsProvider REAL × servidor-modelo (33/33)
- **K** = `lib/pdv/classic-offline-sequence.component.test.ts` — PDV Clássico REAL (pendente → F6 → venda idêntica → F12) (1/1)
- **M** = motor `sale-sync-engine.test.ts` (55/55) · **B** = painel/decisão (`pdv-pending-sync-badge*`, `pdv-unknown-twin-decision`) (18/18)
- **PG** = `lib/vendas/offline-sync.integration.test.ts` — rotas reais × PostgreSQL real (10/10 local PG 17; CI `postgres-integration` PASS)
- **S** = `SessionProvider.offline` (4/4) · **F** = `fechamento-pendentes-sync` (2/2) · **EX** = suítes existentes (#324/#325)

"PASS (simulado)" = executado contra o modelo de rede/armazenamento, não em hardware de loja.

| ID | Cenário | Resultado | Evidência |
|---|---|---|---|
| T01 | Venda online normal | PASS | E2E (venda gravada, estoque 20→19); C; PG |
| T02 | Internet cai com carrinho aberto | PASS | E2E; C |
| T03 | Internet volta sem recarregar | PASS | E2E (marcador `__semF5` intacto); C |
| T04 | Venda offline persistida localmente | PASS | E2E (fila no `localStorage`, banco inalterado); C |
| T05 | Reconexão sincroniza pendente | PASS | E2E (3 vendas no banco sem clique); C |
| T06 | Botão manual envia imediatamente | PASS | C T06/T12/T15/T36 |
| T07 | Botão mostra progresso e resultado | PASS | E2E ("Último reenvio … sem conexão — nada foi enviado"); B (fase "Verificando…/Enviando…") |
| T08 | Botão não fica inerte | PASS | E2E; C T56; B |
| T09 | Confirmada aparece no histórico | PARTIAL | C (lista do provider com `VDA-…` confirmada); tela Histórico sem E2E dedicado |
| T10 | Baixa de estoque exatamente uma vez | PASS | E2E (`movimentacaoEstoque origem=pdv` = 3; estoque 20→17); PG T12/T14 |
| T11 | Registro financeiro exatamente uma vez | PASS | E2E (3 vendas, `pedidoId` únicos); PG T12; C |
| T12 | 10 reenvios da mesma identidade | PASS | PG (10 sequenciais); C (10 simultâneos + 10 seguidos) |
| T13 | Duplo clique não duplica | PASS | C T13 |
| T14 | Duas abas enviam simultaneamente | PASS | PG (10 concorrentes reais); C T14/T44, REV-P0, REV-P1 |
| T15 | Timeout antes do commit | PASS | C T15 |
| T16 | Timeout após commit | PASS | C T16; PG T16/T17 |
| T17 | Resposta perdida após gravação | PASS | C T16/T17; PG |
| T18 | HTTP 500 transitório | PASS | C T18 |
| T19 | 409 PRODUTO_NAO_RESOLVIDO | PASS | C; PG T19/T21; EX #324 |
| T20 | Produto excluído enquanto offline | PARTIAL | EX #324 (linha com `produtoId` → "produto excluído"); sem caso dedicado aqui |
| T21 | SKU alterado enquanto offline | PASS | PG T19/T21; EX #324 |
| T22 | Preço alterado em outro aparelho | PARTIAL | EX E2E 09 (#325, carrinho); pendente não testada com preço novo |
| T23 | Estoque insuficiente no retorno | PASS | PG T23; C T35 |
| T24 | Divergência de depósitos | PASS | C (STOCK_INVARIANT_DRIFT sem loop); EX |
| T25 | Caixa original fechado | PASS | PG T25; C (retroativo só manual) |
| T26 | Sessão de caixa inválida | PASS | C |
| T27 | Pagamento divergente | PASS | PG T27; C |
| T28 | Crédito/vale insuficiente | PASS | C; M/C (bloqueio offline) |
| T29 | Conflito de identidade | PASS | PG T29; C; M |
| T30 | Venda de outra loja não é enviada | PASS | C T30/T43; PG |
| T31 | F5 com pendências | PASS | C (remontagem lê só o storage) |
| T32 | Fechar e reabrir navegador | PASS (simulado) | C |
| T33 | Reinício da aplicação | PASS (simulado) | C |
| T34 | Múltiplas vendas offline sequenciais | PASS | E2E (2 idênticas offline → 2 identidades → 2 vendas); C T34/T34-V1/T34b; K; PG |
| T35 | Fila com aprovadas e rejeitadas | PASS | C T35 |
| T36 | Manual durante retry automático | PASS | C T36 |
| T37 | Troca de operador | NOT EXECUTED | fila é por loja/navegador por construção; não testado |
| T38 | Sessão expirada | PASS | C T38; S (rede fora não "expira" sessão; logout/revogação real encerra) |
| T39 | Falha de escrita local | PASS | C T39/T40 |
| T40 | Quota esgotada | PASS | C T39/T40 |
| T41 | Dados locais corrompidos | PASS | C T41 |
| T42 | Migração de fila legada | PASS | C T42 (V1 sem clientSaleId) |
| T43 | Loja A e B isoladas | PASS | C; PG |
| T44 | Dois terminais da mesma loja | PASS (simulado) | PG T14; C |
| T45 | Carrinho preservado em reconexão | PASS | E2E (carrinho segue no PENDING, sem F5); C; EX E2E 09 |
| T46 | Navegação entre telas sem perda | PARTIAL | C (remontagem preserva a fila); sem E2E de navegação |
| T47 | Pix sem confirmação | PASS | C (declarado, `registeredOffline`) |
| T48 | Cartão sem aprovação | PASS | C |
| T49 | Caixa com pendências não conciliadas | PASS | F (aviso; sem ciência não chama `/api/ops/caixa/fechar`) |
| T50 | Histórico após sincronização | PARTIAL | ver T09 |
| T51 | E2E 09 da #325 continua passando | PASS | CI final (09 ✓) |
| T52 | Regressão #324 | PASS | EX `produto-nao-resolvido-recovery` (19/19), painel, paridade 4 PDVs |
| T53 | Regressão #325 | PASS | E2E 09; `pdv-catalog-sync.contract` |
| T54 | Pendente antiga não ressuscita | PASS | C T54; REV-P0 |
| T55 | Serviço indisponível no clique | PASS | C T55 |
| T56 | Reenviar enquanto offline | PASS | E2E; C T56 |
| T57 | Rejeição definitiva sem retry infinito | PASS | C T19-T29, T35 |
| T58 | Resposta HTTP inconclusiva | PASS | C T58/T17; M |
| T59 | Pendente preservada após mudança de catálogo | PASS | C T45/T59 |
| T60 | Todas as pendências classificadas | PASS | C T60; M |

## Contagem (T01–T60)
| Total | PASS | dos quais simulados | PARTIAL | FAIL | BLOCKED / NOT EXECUTED |
|---|---|---|---|---|---|
| **60** | **54** | 3 (T32, T33, T44) | **5** (T09, T20, T22, T46, T50) | **0** | **1** (T37) |

Extras além do T01–T60 (todos PASS): REV-P0, REV-P1, REV-P2-7, REV2-P1, REV2-P2 ×2, REV3 ("É outra venda" explícito),
T34-V1 (writer V1), K (F12 após fechar diálogo), sessão offline (S), fixtures da #325 (`parity-pin-keymap`, `classic-weight-sale-guard`).
