# Relatório — Estabilização PDV & Caixa para operação real

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal: estabilizar o uso real do PDV e
> Caixa para operação amanhã na loja.

## 1. Objetivo

Revisar e estabilizar (mudanças cirúrgicas) o fluxo de caixa e venda do PDV para uso
real em loja, sem refatoração visual, sem tocar áreas protegidas (auth, `proxy.ts`,
sidebar, schema Prisma) e preservando multi-loja (`storeId`).

## 2. Auditoria por objetivo

### 2.1 Abertura e fechamento de caixa
- **Rotas server** (`app/api/ops/caixa/{abrir,fechar,operacao,sessoes,sessao-detalhe}`):
  todas escopadas por `storeId` (`opsLojaIdFromRequest[ForWrite]`), com guard de
  permissão (`apiGuardEnterpriseOrOps`). ✅
- **Fechamento**: calcula `totalVendasServer` a partir de `MovimentacaoFinanceira(origem:"venda")`
  no intervalo da sessão — fonte canônica para auditoria mesmo se o localStorage divergir. ✅
- **Operação (sangria/suprimento)**: respeita `verificarPeriodoFechado`, espelha em
  `MovimentacaoFinanceira` com idempotência (`referenciaId + origem`). ✅
- **Reconciliação no bootstrap** (`lib/operations-store.tsx` → `loadDb`): se o servidor
  tem sessão `ABERTA` e o estado local diz fechado, restaura `caixaSessaoId`/`isOpen`/
  `saldoInicial`/`dataAbertura`. ✅
- 🔴 **Corrigido**: a **abertura falhava em silêncio**. Se `POST /api/ops/caixa/abrir`
  retornasse erro (rede/HTTP), o caixa abria localmente sem `sessaoId` e o operador via
  "Caixa Aberto!" sem nenhum aviso. Agora exibe toast de alerta explícito (ver §3).

### 2.2 Venda finalizada e persistência (nenhuma venda perdida)
- `finalizeSaleTransaction` (`lib/operations-store.tsx`): grava a venda em `localStorage`
  com `syncPending: true` **antes** de qualquer rede e dispara `POST /api/ops/venda-persist`.
  Em falha de rede/HTTP mostra toast destrutivo e mantém `syncPending: true`. ✅
- `upsertVendaInTransaction` (`lib/ops-upsert-venda.ts`): **idempotente** — upsert por
  `pedidoId`, `deleteMany`+recria `ItemVenda`, e guards (`findFirst`) em
  `MovimentacaoEstoque` (`documento+produtoId+origem:"pdv"`) e `MovimentacaoFinanceira`
  (`referenciaId+origem:"venda"`). Reenvio da mesma venda **não** duplica estoque/financeiro. ✅
- 🔴 **Corrigido/Reforçado**: o re-sync de vendas pendentes só ocorria no **bootstrap**
  (recarregar a página). Adicionada rede de segurança **em sessão** (ver §3): reenvio
  ao voltar a conexão (`online`), ao reganhar foco da aba (`visibilitychange`) e a cada
  30s — seguro por causa da idempotência do backend. Garante que uma falha transitória
  do servidor durante a operação não deixe a venda presa até um reload manual.

### 2.3 Formas de pagamento + cálculo total/troco/desconto
- `payment-modal.tsx`: `totalPaid`/`faltaPagar`/`troco` corretos; `troco` só com dinheiro
  e excedente. `normalizePaymentsToMatchTotal` apara o excedente (dinheiro primeiro) **antes**
  de confirmar, então o `paymentBreakdown` persistido bate com o `total` (troco não entra
  no ledger). ✅
- Desconto manual exige PIN de supervisor; bloqueia confirmação sem autorização. ✅
- Mapeamento `PaymentMethod[] → paymentBreakdown` idêntico e correto em **Clássico**,
  **Supermercado** e **Assistência**; todos tratam `!result.ok` com toast (não silencioso). ✅
- `finalizeSaleTransaction` revalida `|soma − total| ≤ 0,02` e regras de `aPrazo`/`creditoVale`. ✅

### 2.4 Persistência do caixa por `storeId`
- Snapshot local do caixa por loja: `omnigestao:caixa:{storeId}` + `caixaSessaoId` no
  estado persistido por `storageKey` da loja. Servidor é a fonte canônica para totais. ✅

### 2.5 PDV Clássico / Assistência / Supermercado (revisão "no necessário")
- Compartilham `finalizeSaleTransaction` + `venda-persist`; herdam as correções acima.
  Nenhuma alteração visual ou estrutural nesses componentes. ✅

## 3. Alterações realizadas (cirúrgicas)

| Arquivo | Mudança |
|---|---|
| `components/dashboard/caixa/abertura-caixa-modal.tsx` | Deixa de falhar em silêncio: rastreia `serverRegistered`; loga HTTP não-ok; exibe toast destrutivo "Caixa aberto localmente — sessão não confirmada no servidor" quando há `lojaAtivaId` mas o registro server falhou. Nenhuma mudança de layout/fluxo. |
| `lib/operations-store.tsx` | Extrai `flushPendingSales` (reaproveitado pelo bootstrap) e adiciona rede de segurança em sessão: reenvia vendas `syncPending` em `online`, `visibilitychange→visible` e a cada 30s. Listeners removidos no cleanup. |

Nenhum arquivo removido. Nenhuma área protegida tocada (auth, `proxy.ts`, sidebar,
`prisma/schema.prisma`, core de infra).

## 4. Validação

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ Build concluído (prisma generate + Next build), tabela de rotas gerada |
| `git status` | `M components/dashboard/caixa/abertura-caixa-modal.tsx`, `M lib/operations-store.tsx`, `M next-env.d.ts` (este último é gerado pelo Next, já estava modificado no início da sessão) |

## 5. Teste manual documentado — fluxo abrir → vender → finalizar → fechar

> Validação automatizada (tsc/build) e auditoria de código concluídas. O passo a passo
> abaixo é o roteiro de conferência **na máquina da loja** (com servidor `npm run dev`
> ou produção e DB conectado). Existe ainda `e2e/specs/06-pdv-caixa-historico.spec.ts`
> como cobertura automatizada complementar.

1. **Abrir caixa** — `/dashboard/vendas` (ou `/dashboard/pdv`). Barra mostra "Caixa
   Fechado" → "Abrir Caixa" → informar saldo inicial → "Abrir Caixa".
   - Esperado: barra fica "Caixa Aberto", comprovante mostra a **Sessão** (id do servidor).
   - **Teste de rede**: com o servidor parado, abrir o caixa deve mostrar o toast
     "Caixa aberto localmente — sessão não confirmada no servidor" (correção §3).
2. **Vender** — bipar/buscar produto, ajustar quantidade.
   - Esperado: item entra no carrinho; total atualiza; estoque suficiente validado.
3. **Finalizar (F1 / Finalizar)** — abrir pagamento, escolher forma(s); conferir
   `Pago`/`Restante`/`Troco`; aplicar desconto (se houver, validar PIN supervisor);
   "Confirmar Pagamento".
   - Esperado: toast "Venda finalizada"; carrinho limpa; estoque decrementa no banco;
     `MovimentacaoFinanceira(origem:"venda")` criada; venda aparece no Histórico.
   - **Teste de rede**: derrubar a conexão antes de confirmar → toast "Venda não
     confirmada no servidor / salva localmente"; ao restaurar a conexão (ou em até 30s),
     a venda é reenviada automaticamente e o estoque/financeiro são gravados (sem duplicar).
4. **Fechar caixa** — "Fechar Caixa" → informar valor contado → "Confirmar Fechamento".
   - Esperado: toast "Caixa fechado e registrado"; sessão `FECHADA` no servidor com
     `totalVendasServer` calculado do banco; resumo do dia (din/pix/débito/crédito/carnê/vale)
     impressível/copiável.

## 6. Pendências e riscos conhecidos (NÃO corrigidos — fora do escopo cirúrgico)

- 🔴 **PDV Black Edition (`/dashboard/pdv-next`) NÃO persiste vendas.**
  `PdvBlackEdition.handlePaymentConfirm` apenas reseta a UI — não chama
  `finalizeSaleTransaction` nem `venda-persist`. Vendas feitas nele **não baixam estoque,
  não geram financeiro e não viram registro `Venda`**. **Recomendação: não usar o
  pdv-next para operação real amanhã.** Use Clássico, Assistência ou Supermercado.
  (Pendência pré-existente; fora da lista de revisão e da regra "não criar novo PDV".)
- ⚠️ **Fechamento com servidor indisponível**: o caixa fecha localmente e avisa por toast,
  mas a sessão fica `ABERTA` no servidor. No próximo reload a reconciliação reabre o caixa
  localmente; um novo fechamento (já com a conexão ok) encerra corretamente — **auto-cura
  no retry**. Resolver de forma definitiva exigiria fila de "fechamento pendente".
- ⚠️ **Abertura duplicada**: a rota `abrir` não bloqueia uma segunda sessão `ABERTA` para a
  mesma loja (mitigado pela reconciliação no bootstrap). Cenário só ocorre se o localStorage
  for limpo e o caixa reaberto antes do `loadDb` reconciliar.
- ⚠️ **`totalEntradas` na barra do PDV** continua acumulativo via localStorage (runtime) e
  pode divergir de `totalVendasServer`; o fechamento usa o valor do banco como canônico
  (pendência pré-existente documentada).

## 7. Documentação

- `docs/ai/CURRENT_STATUS.md`: adicionada entrada curta sobre a estabilização (erro
  silencioso de abertura + rede de segurança de reenvio de vendas em sessão).
- `CHANGELOG.md` / `MASTER_CONTEXT.md`: sem mudança de contrato/arquitetura — não alterados.

## 8. Escopo

Confirmado: apenas os 2 arquivos de aplicação acima foram alterados. Nada fora do pedido
foi tocado; nenhuma área protegida foi modificada; multi-loja (`storeId`) preservado;
design atual preservado.
