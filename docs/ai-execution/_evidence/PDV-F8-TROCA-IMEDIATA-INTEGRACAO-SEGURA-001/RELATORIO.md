# PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — relatório

GOAL=PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 · LEVEL=5 · MODE=END_TO_END_WITH_AUTO_FIX
Data: 2026-11-04 (America/Sao_Paulo) · Base: `origin/main` 37acc3b · Branch: `claude/pdv-f8-troca-imediata-001`
Schema/migration: **nenhum** · Produção: **nenhuma escrita, deploy ou merge** · Dados: 100% sintéticos.
PRONTO_PARA_PRODUCAO=**NÃO** (ver §4 e §5).

## 0. Fontes lidas antes de codar

- `CONTRATO_COMUM_R3.md` / `DECISOES_E_COMPATIBILIDADE_R3.md` (worktree `pdv-devolucao-lastro-idempotencia-001`, não rastreados, preservados): schema de lastro de devolução **PENDING**, D01–D13 PENDING, `SEM_RECEBIMENTO` PENDING.
- `PDV-KG-CASH-HANDOVER-GH01-GH02-GH03-CONSOLIDACAO-001/RELATORIO_FINAL.md`: G-H01..03 propostos, não implementados; **CASH_HANDOVER_RECOVERY=RELEASE_BLOCKER**.
- Consequência: nada aqui implementa o motor R3/G-H nem cria tabela. O trabalho corrige a integração sobre o schema atual e **bloqueia** o caminho de dinheiro.

## 1. Defeitos encontrados no código de `main`

| # | Defeito | Efeito |
|---|---|---|
| D1 | F8 no Clássico só focava o bipe | troca só pelo menu Ctrl |
| D2 | Busca só no `localStorage` | venda de outro terminal não aparecia; "disponível" ignorava devoluções de outros caixas |
| D3 | Servidor sem teto por item nem lock da venda | duas devoluções (ou duas abas) passavam do vendido → vale/estoque em dobro |
| D4 | `localId` `DEV-AAAA-NNNN` por navegador | dois terminais geravam o mesmo id; o 2º era tratado como replay e **sumia** |
| D5 | Vale-troca gerava `createSaida(devolucao_pdv)` fora da transação | saída financeira fictícia |
| D6 | "Reembolso" tirava dinheiro sem fluxo aprovado | conflita com G-H RELEASE_BLOCKER |
| D7 | Venda de origem fora do banco → valores do client aceitos | crédito fabricado pelo client |
| D8 | Troca: devolução *fire-and-forget* + nova venda no mesmo tick | corrida com o débito do vale; e o vale recém-criado não estava em `stateRef` → "Saldo de crédito insuficiente" |
| D9 | `ItemVenda.inventoryId` = `Produto.id`, client envia SKU | qualquer recálculo pelo servidor comparava chaves diferentes |
| D10 | Sobra da troca podia ser "devolvida em dinheiro" só no audit-log local | dinheiro sem lançamento |

## 2. IMPLEMENTADO

1. **F8 no Clássico** abre Troca/Devolução nos três caminhos (tecla, barra de atalhos, menu Ctrl). Keymap, ajuda e shell atualizados.
2. **Busca no servidor** `GET /api/ops/devolucao/elegibilidade?q=` — venda (exato, sem caixa), código de barras / SKU / ID → últimas 10 vendas com o item, CPF/nome. Escopo por loja (sessão + `canAccessStore` + `pdv.devolucao`). `qtyReturned` = agregado do banco. Sem conexão: cai na busca local, sinalizada.
3. **Escritor único** `lib/pdv/devolucao/registrar-devolucao.ts` (rota `POST /api/ops/devolucao`), numa transação READ COMMITTED: lock `FOR UPDATE` na venda → idempotência pós-lock (replay idêntico = mesmo resultado; conteúdo diferente = `LOCAL_ID_CONFLITO`) → teto por item com chaves canônicas → documento → entrada de estoque pelo boundary canônico → status da venda → vale uma vez. Valores do client ignorados. Corrida na unique relida fora da transação.
4. **Sem saída fictícia**: `createSaida` removido da devolução.
5. **Bloqueios de política**: `tipo: "devolucao"` → 409 `REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA` antes de qualquer IO; botão Reembolso desabilitado; opção "Devolver dinheiro" removida (sobra = vale).
6. **Troca imediata**: devolução confirmada pelo servidor → nova venda pelo motor canônico `finalizeSaleTransaction` com `creditoVale = min(devolvido, nova)`; diferença positiva na forma escolhida; zero/negativa sem cobrança. Bipe do novo item (Enter com código/SKU/ID exato).
7. **Recuperação**: resposta perdida → reenvio com o MESMO `localId` (replay); nova venda falhou → estado "devolução já gravada" e "Concluir nova venda" refaz só a venda; venda PENDING segue o contrato CORREÇÃO-01 (sem cupom/callback, carrinho mantido).
8. **IDs únicos**: `DEV-AAAA-NNNN-XXXXXXXX` (sufixo aleatório).
9. **Espelho local** `registrarDevolucao({ serverConfirmed })`: mesmo id, crédito/linhas do servidor, sem reenvio, publicado em `stateRef`.
10. **Cancelamento**: estorno desconta o vale já entregue (`creditoEmitido`) quando não há saída legada — sem a saída fictícia, o cliente ficaria com vale + estorno integral.
11. **Comprovante**: operador gravado no servidor (antes saía o nome da loja), `localId` + id do servidor, marcação de pendência.
12. **Uma gravação por vez** na tela (ref + estado): duplo clique não abre duas devoluções.

### 2.1 Revisão independente (rodada 1 = REQUEST_CHANGES) — corrigido no commit seguinte

| Achado | Correção |
|---|---|
| P1 cancelamento × devolução sem lock (estoque em dobro; vale + estorno integral) | cancelar trava a venda `FOR UPDATE` dentro da transação, relê status e devoluções; devolução concorrente → 409 sem estorno parcial |
| P1 vale pelo preço de tabela (desconto só no payload) | `fatorValorPago = min(1, Venda.total / Σ lineTotal)` no escritor e na busca + teto acumulado por venda |
| P2 recusas definitivas presas na fila com vale só local | `classificarRespostaDevolucao`: recusa sai da fila e estorna vale/estoque locais; conflito de id → id novo; replay de reembolso legado já gravado reconhecido |
| P2 tentativa sem resposta + formulário editado → 2ª devolução | reenvio da tentativa original antes de qualquer nova intenção |
| P2 cancelamento de venda paga com vale/a prazo com vale emitido | bloqueado (409 `vale_emitido_bloqueia_cancelamento`) |
| P2 Histórico sempre "local" | prefill reconsulta o servidor |
| P2 venda pendente refinalizada pela retomada | retomada guarda a venda pendente e não finaliza de novo |
| P3 carrinho editável durante o envio | travado |

Rodada 2 = **APPROVE_WITH_LIMITATIONS** (riscos de dinheiro/estoque no servidor fechados). Corrigidos em seguida: P2-A recusa definitiva agora entra no audit-log e aparece no painel F8 (reembolso legado → tratar com o Financeiro); P2-B tentativa sem resposta persistida por loja em `sessionStorage` (sobrevive a fechar o F8/recarregar); P3-2 tentativa perdida que era troca e foi gravada reabre a retomada.

Não corrigidos (registrados em §5): SKU alterado depois da venda (inclui replay após renomear SKU), linhas virtuais/serviço gerando vale, linhas duplicadas do mesmo SKU no espelho local, devolução cuja venda de origem nunca chega ao servidor (tenta para sempre).

## 3. VALIDADO

| Prova | Resultado |
|---|---|
| `lib/pdv/devolucao/troca-imediata.pg.test.ts` — PostgreSQL 17 **descartável** (initdb no scratchpad, porta 55471, schema da branch via `migrate diff`), handlers de produção | **15/15**, repetido 3× estável |
| ↳ diferença positiva / negativa / zero; vale consumido; caixa recebe só a diferença | PASS |
| ↳ teto (incl. devoluções anteriores), item fora da venda | PASS |
| ↳ **concorrência**: 2 devoluções simultâneas da mesma venda → 1 × 200, 1 × 409; estoque/vale uma vez | PASS |
| ↳ mesmo `localId` em paralelo + reenvio → 1 documento, 1 crédito | PASS |
| ↳ mesmo `localId` com conteúdo diferente → 409 conflito | PASS |
| ↳ reembolso bloqueado sem gravar; sem venda no servidor / sem CPF → nada gravado | PASS |
| ↳ vale gasto em 2 vendas simultâneas → 1 passa, 1 recusada inteira | PASS |
| ↳ busca por código de barras/SKU/venda com devolvível agregado; isolamento por loja | PASS |
| ↳ cancelamento após vale → estorno 10 (não 20) | PASS |
| ↳ desconto: 2×10 vendidos por 10 → vale 5 + 5 | PASS |
| ↳ cancelamento bloqueado com vale usado + vale emitido | PASS |
| ↳ corrida cancelamento × devolução (5 rodadas): estoque exato, vale + estorno ≤ pago | PASS |
| `lib/pdv/trocas-devolucao-f8.component.test.ts` (jsdom, tela real) — ordem devolução→venda, mesmo `localId` no reenvio, retomada, PENDING, recusa, política, tentativa incerta + nova intenção, pendente sem refinalizar | **10/10** |
| `lib/pdv/devolucao/fila-devolucao.test.ts` — desfecho da fila, ids sem colisão, fator pago | PASS |
| `app/api/ops/devolucao/route.test.ts` (reescrito para o contrato novo) | **7/7** |
| Keymap/paridade (`parity-keymap`, `parity-pin-keymap`), `pdv-pending-post-sale-effects.static` | PASS |
| Regressão `lib/pdv`, `lib/operations-store`, `lib/ops-upsert-venda*`, `app/api/ops`, `app/api/vendas`, `lib/caixa`, `components/dashboard/vendas` (Node 22) | branch 1326 pass / 60 fail × base 1306 / 68; **0 falha nova** (comparação por nome) |
| `npm run typecheck` | exit 0 |
| ESLint nos arquivos alterados | limpo |

Falhas pré-existentes nesta máquina (iguais na base `origin/main`): `app/api/vendas/[id]/cancelar/route.test.ts` (27) e o antigo `devolucao/route.test.ts` — o CI é a referência para esses.

## 4. BLOQUEADO_POR_POLITICA

| Caminho | Gate | O que falta |
|---|---|---|
| Reembolso em dinheiro (`tipo: "devolucao"`) | G-H01..03 / `CASH_HANDOVER_RECOVERY=RELEASE_BLOCKER`; D-H01..10 PENDING | fluxo financeiro aprovado (forma do reembolso, vínculo com sessão, fechamento) |
| Sobra da troca em dinheiro | idem | idem |
| Devolução KG / `SEM_RECEBIMENTO` / lastro R3 | R3 PENDING (`OWNER_SCHEMA_APPROVAL=PENDING`) | aprovação de schema e ensaio |

## 5. PENDENTE_DE_HOMOLOGACAO

1. **E2E navegador** `e2e/cadastros-ramos/11-pdv-f8-troca-imediata.spec.ts` (build de produção, NextAuth real, PG descartável) — escrito e incluído no workflow `Ramos e Cadastros`; **não rodado localmente** (o runner exige o serviço de CI). Resultado só vale após o CI do PR.
2. **Fila offline legada**: reembolsos `tipo: "devolucao"` já enfileirados e não gravados passam a ser recusados; saem da fila, entram no audit-log e aparecem no painel F8. O dinheiro já saiu da gaveta — **precisa lançamento manual pelo Financeiro** (decisão operacional).
3. **Vendas só locais** (nunca sincronizadas): devolução fica pendente até a venda chegar ao servidor (`VENDA_ORIGEM_NAO_ENCONTRADA`); se a venda nunca chegar, tenta para sempre com o vale local.
4. **Venda nova pendente após a troca**: o vale existe no servidor mas não fica reservado; se outro caixa o gastar antes, a venda cai em `CREDITO_VALE_INSUFICIENTE` (fail-closed, recuperável, sem perda).
5. **Política para linhas virtuais/serviço** (geram vale sem estoque) e **SKU alterado depois da venda** (recusa falsa `ITEM_NAO_CONSTA_NA_VENDA`).
6. **Smoke logado com operador** na loja piloto.
7. `docs/ai/CURRENT_STATUS.md` não alterado: nada mudou em `main`.

## 6. Arquivos

Novos: `lib/pdv/devolucao/{registrar-devolucao,elegibilidade,product-keys}.ts`, `app/api/ops/devolucao/elegibilidade/route.ts`, testes (`*.pg.test.ts`, `*.component.test.ts`, E2E 11).
Alterados: `app/api/ops/devolucao/route.ts`, `app/api/vendas/[id]/cancelar/route.ts` (netting), `components/dashboard/vendas/{trocas-devolucao,pdv-classic,pdv-omni-classic-shell}.tsx`, `lib/operations-store.tsx`, `lib/pdv-keymap.ts`, `lib/pdv/parity-keymap.ts`, testes de keymap, `.github/workflows/ramos-cadastros.yml` (paths).
Preservados intocados: worktrees `pdv-devolucao-lastro-idempotencia-001`, `omni-gestao-trocas-audit-001` e todos os WIPs.

Como reproduzir o teste PG (banco descartável próprio, nunca produção — o guard recusa outro host/porta):

```bash
F8_TROCA_DISPOSABLE_DB=true F8_TROCA_TEST_DATABASE_URL=postgresql://pgadmin@127.0.0.1:55471/f8_troca_test npx vitest run lib/pdv/devolucao/troca-imediata.pg.test.ts
```
