# MATRIZ_TESTES_E2E — T01–T60

Legenda de evidência:
- **C** = `lib/vendas/offline-sync.component.test.ts` (OperationsProvider REAL × servidor-modelo, jsdom, Node 22) — 32/32
- **M** = `lib/vendas/sale-sync-engine.test.ts` (motor puro) — 55/55 · **B** = testes do painel (`pdv-pending-sync-badge*.test.ts`)
- **PG** = `lib/vendas/offline-sync.integration.test.ts` (rotas reais × PostgreSQL real descartável) — 10/10
- **E2E** = `e2e/cadastros-ramos/10-pdv-offline-sync.spec.ts` (build de produção + login real + PG descartável, Chromium, CI)
- **S** = `components/auth/SessionProvider.offline.component.test.ts`
- **EX** = suítes existentes (#324/#325) reexecutadas

Dados: lojas/produtos/usuários sintéticos. Ambiente: Windows 11 local (Node 22.23, PG 17 em 127.0.0.1:55471) e GitHub Actions (Node 24, PG 16 do job).
"PASS (simulado)" = executado contra o modelo de rede/armazenamento, não em hardware de loja.

| ID | Cenário | Resultado | Evidência |
|---|---|---|---|
| T01 | Venda online normal | PASS | C T01; PG; E2E (rodada 1: venda online gravada no banco) |
| T02 | Internet cai com carrinho aberto | PASS | C T02…T05; E2E |
| T03 | Internet volta sem recarregar | PASS | C (evento `online`, mesma montagem); E2E (marcador `__semF5`) |
| T04 | Venda offline persistida localmente | PASS | C (gravada ANTES do 1º envio, com linhas/pagamento); E2E (fila no `localStorage`) |
| T05 | Reconexão sincroniza pendente | PASS | C; E2E |
| T06 | Botão manual envia imediatamente | PASS | C T06/T12/T15/T36 |
| T07 | Botão mostra progresso e resultado | PASS | B (fase "Verificando…/Enviando…", botão desabilitado; "Último reenvio"); E2E (resultado visível) |
| T08 | Botão não fica inerte | PASS | C T56 (resposta imediata offline), T15 (prazo); B |
| T09 | Confirmada aparece no histórico | PARTIAL | C (lista do provider confirmada com `VDA-…`); tela Histórico sem E2E dedicado |
| T10 | Baixa de estoque exatamente uma vez | PASS | PG T12/T14; C; E2E (`origem: "pdv"` = 3 para 3 vendas) |
| T11 | Registro financeiro exatamente uma vez | PASS | PG T12 (snapshot financeiro inalterado nos replays); C (`cash` = 1) |
| T12 | 10 reenvios da mesma identidade | PASS | PG T12 (10 sequenciais); C T12 (10 simultâneos + 10 seguidos) |
| T13 | Duplo clique não duplica | PASS | C T13 |
| T14 | Duas abas enviam simultaneamente | PASS | PG T14 (10 concorrentes reais); C T14/T44, REV-P0, REV-P1 |
| T15 | Timeout antes do commit | PASS | C T15 (servidor pendurado → prazo 25 s → SEM_RESPOSTA → Reenviar confirma 1×) |
| T16 | Timeout após commit | PASS | C T16 (perdida após commit → Reenviar reconcilia sem 2º POST); PG T16/T17 |
| T17 | Resposta perdida após gravação | PASS | C T16/T17; PG T16/T17 |
| T18 | HTTP 500 transitório | PASS | C T18 (backoff; volta confirma) |
| T19 | 409 PRODUTO_NAO_RESOLVIDO | PASS | C (sem loop); PG T19/T21; EX `produto-nao-resolvido-recovery` |
| T20 | Produto excluído enquanto offline | PARTIAL | EX (#324: linha com `produtoId` → "produto excluído", sem recadastro); mesmo caminho do T19; sem caso dedicado aqui |
| T21 | SKU alterado enquanto offline | PASS | PG T19/T21; EX #324 (`produtoId` estável) |
| T22 | Preço alterado em outro aparelho | PARTIAL | EX E2E 09 (#325, carrinho); pendente leva o preço praticado — sem caso dedicado de pendente |
| T23 | Estoque insuficiente no retorno | PASS | PG T23; C T19-T29, T35 |
| T24 | Divergência de depósitos | PASS (cliente) | C (STOCK_INVARIANT_DRIFT sem loop); EX classificação de drift |
| T25 | Caixa original fechado | PASS | PG T25; C (retroativo só manual) |
| T26 | Sessão de caixa inválida | PASS | C (SESSAO_INVALIDA) |
| T27 | Pagamento divergente | PASS | PG T27; C |
| T28 | Crédito/vale insuficiente | PASS | C (código); M/C (bloqueio offline) |
| T29 | Conflito de identidade | PASS | PG T29; C (IDEMPOTENCY_KEY_REUSED); M |
| T30 | Venda de outra loja não é enviada | PASS | C T30/T43; PG T30/T43 |
| T31 | F5 com pendências | PASS | C (desmonta/remonta lendo só o storage) |
| T32 | Fechar e reabrir navegador | PASS (simulado) | C (mesmo mecanismo: só o `localStorage` sobrevive) |
| T33 | Reinício da aplicação | PASS (simulado) | C |
| T34 | Múltiplas vendas offline sequenciais | PASS | C T34/T34b; PG T34; E2E (2 idênticas offline → 2 identidades) |
| T35 | Fila com aprovadas e rejeitadas | PASS | C T35 |
| T36 | Manual durante retry automático | PASS | C T36 (junta-se ao envio em voo: 1 POST) |
| T37 | Troca de operador | NOT EXECUTED | fila é por loja/navegador por construção; não testado |
| T38 | Sessão expirada | PASS | C T38 (401 → AUTH_REQUIRED, volta sozinha); S (rede fora não "expira" sessão) |
| T39 | Falha de escrita local | PASS | C T39/T40 |
| T40 | Quota esgotada | PASS | C T39/T40 (aviso; venda nova offline recusada) |
| T41 | Dados locais corrompidos | PASS | C T41 (quarentena do blob; gravação volta) |
| T42 | Migração de fila legada | PASS | C T42 (pendente V1 sem clientSaleId reenviada pelo V1, mesma identidade) |
| T43 | Loja A e B isoladas | PASS | C; PG |
| T44 | Dois terminais da mesma loja | PASS (simulado) | PG T14 (concorrência real no banco); C (2 providers) |
| T45 | Carrinho preservado em reconexão | PASS | C T45/T59; E2E (carrinho segue no PENDING); EX E2E 09 |
| T46 | Navegação entre telas sem perda | PARTIAL | C (remontagem do provider preserva a fila); sem E2E de navegação |
| T47 | Pix sem confirmação | PASS | C T47/T48 (declarado, `registeredOffline`, não confirmado) |
| T48 | Cartão sem aprovação | PASS | C T47/T48 |
| T49 | Caixa com pendências não conciliadas | PASS | `fechamento-pendentes-sync.component.test.ts` (modal real: aviso com quantidade/valor; sem ciência não chama `/api/ops/caixa/fechar`; com ciência segue) |
| T50 | Histórico após sincronização | PARTIAL | ver T09 |
| T51 | E2E 09 da #325 continua passando | PASS | CI rodada 1: `09-catalogo-sem-f5` ✓ |
| T52 | Regressão #324 | PASS | `produto-nao-resolvido-recovery`, `pdv-pending-sync-badge-produto-nao-resolvido`, paridade (4 PDVs) |
| T53 | Regressão #325 | PASS | E2E 09 no CI; `pdv-catalog-sync.contract` |
| T54 | Pendente antiga não ressuscita | PASS | C T54; REV-P0 |
| T55 | Serviço indisponível no clique | PASS | C T55 (verifica, não envia, explica) |
| T56 | Reenviar enquanto offline | PASS | C T56 (sem fetch); E2E |
| T57 | Rejeição definitiva sem retry infinito | PASS | C T19-T29, T35 |
| T58 | Resposta HTTP inconclusiva | PASS | C T58/T17; M |
| T59 | Pendente preservada após mudança de catálogo | PASS | C T45/T59 |
| T60 | Todas as pendências classificadas | PASS | C T60; M `operatorSaleSyncView` |

Extras: REV-P0, REV-P1, REV-P2-7 (revisão independente); sessão offline (S); fixtures desatualizados desde a #325
(`parity-pin-keymap`, `classic-weight-sale-guard`) corrigidos — 116/116.
