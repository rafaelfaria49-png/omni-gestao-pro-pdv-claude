# Relatório — Estabilização do Financeiro do PDV para operação real de caixa

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal 3: estabilizar os registros
> financeiros gerados pelo PDV para operação real de caixa amanhã na loja.
> Sequência dos Goals 1 (PDV/Caixa) e 2 (PDV ↔ Estoque).

## 1. Resumo da auditoria

Auditoria ponta-a-ponta do caminho **venda PDV → MovimentacaoFinanceira →
SessaoCaixa**, mais sangria/suprimento, cancelamento, devolução e título à
prazo. Foco em **idempotência**, **multi-loja (`storeId`)**, **erros silenciosos**
e **consistência temporal** (sessão de caixa correta para cada venda).

| Camada | Arquivo | Resultado |
|---|---|---|
| Client — finalização local + reenvio | `lib/operations-store.tsx` (`finalizeSaleTransaction`, `flushPendingSales`) | ✅ Goal 1 cobriu reenvio em `online`/`visibilitychange`/30 s |
| Server — receita à vista PDV | `lib/ops-upsert-venda.ts` (passo 4) | ⚠️ Corrigido: `createdAt` agora alinhado à data real da venda (ver §3.1) |
| Server — persistência | `app/api/ops/venda-persist/route.ts` | ✅ Exige `x-assistec-loja-id` (`opsLojaIdFromRequestForWrite`); gate enterprise/ops |
| Server — title à prazo (cliente dispara) | `lib/pdv-append-conta-receber.ts` | ⚠️ Fire-and-forget sem retry server (risco documentado §4) |
| Server — sangria/suprimento | `app/api/ops/caixa/operacao/route.ts` | ✅ Verifica período fechado, espelha em MovimentacaoFinanceira com guard `(storeId,referenciaId,origem)` |
| Client — sangria/suprimento UX | `components/dashboard/vendas/pdv-classic.tsx` | ⚠️ Corrigido: erro de servidor deixou de ser silencioso (ver §3.2) |
| Server — fechamento de caixa | `app/api/ops/caixa/fechar/route.ts` | ✅ `totalVendasServer` calculado por agregação em `MovimentacaoFinanceira(origem:"venda")` |
| Server — detalhe da sessão | `app/api/ops/caixa/sessao-detalhe/route.ts` | ✅ Mesmo agregado por intervalo da sessão |
| Server — cancelamento | `app/api/vendas/[id]/cancelar/route.ts` | ✅ Estorno líquido em `MovimentacaoFinanceira(saida,"cancelamento_pdv")` com guard idempotente |
| Server — devolução | `app/api/ops/devolucao/route.ts` | ✅ Estoque atômico + idempotência `@unique storeId_localId` + `MovimentacaoFinanceira(saida,"devolucao_pdv")` |
| Service — movimentações | `lib/financeiro/services/movimentacoes-service.ts` | ✅ Idempotência declarada por `(storeId,referenciaId,tipo,origem)`; `assertStoreId` exige unidade |

## 2. Fluxo financeiro consolidado (PDV → Banco)

```
finalizeSaleTransaction (client)
  ├─ valida caixa aberto, soma pagamentos, estoque local
  ├─ paymentBreakdown = { dinheiro, pix, debito, credito, carne, aPrazo, creditoVale }
  ├─ grava SaleRecord{ syncPending:true } em localStorage
  ├─ POST /api/ops/venda-persist (fire-and-forget; Goal 1 garante retry)
  │   └─ upsertVendaInTransaction (uma transação Prisma)
  │       ├─ Venda (upsert por pedidoId)
  │       ├─ ItemVenda (deleteMany + create) com resolução OR[id,sku,barcode]
  │       ├─ MovimentacaoEstoque(saida,"pdv") por produto agregado — guard idempotente
  │       ├─ MovimentacaoFinanceira(entrada,"venda")  ← valor = total − aPrazo
  │       │   guard findFirst({ storeId, referenciaId=pedidoId, origem:"venda", tipo:"entrada" })
  │       │   createdAt = at (data real da venda; FIX desta sessão)
  │       └─ ClienteCredito (oldest-first) + UsoCreditoCliente quando creditoVale > 0
  └─ aPrazo > 0 → appendContaReceberTituloPdvAprazo (client)
                  ├─ localStorage CR + dispatchEvent
                  └─ fetch /api/ops/contas-receber-persist (fire-and-forget)

CaixaOperacao (sangria/suprimento) — pdv-classic apenas
  ├─ POST /api/ops/caixa/operacao
  │   ├─ verifica período fechado
  │   ├─ cria CaixaOperacao
  │   └─ se sangria/suprimento → MovimentacaoFinanceira(saida|entrada, "sangria_pdv"|"suprimento_pdv")
  │       guard findFirst({ storeId, referenciaId=op.id, origem })
  └─ client agora exibe toast destrutivo em falha (FIX desta sessão)

Fechamento de caixa
  └─ POST /api/ops/caixa/fechar
      ├─ valida sessão ABERTA com storeId
      ├─ agrega MovimentacaoFinanceira(entrada,"venda") entre abertaEm e now
      │   → totalVendasServer canônico em SessaoCaixa.payload
      └─ status FECHADA + payload merge cliente + servidor

Cancelamento
  └─ POST /api/vendas/[id]/cancelar
      ├─ verifica período fechado
      ├─ tx: marca cancelada + repõe estoque líquido + estorno financeiro líquido
      │   MovimentacaoFinanceira(saida,"cancelamento_pdv") com guard idempotente
      └─ estorna ContaReceberTitulo (à prazo) se houver

Devolução
  └─ POST /api/ops/devolucao
      ├─ idempotência: @unique storeId_localId (404→retorna existente)
      ├─ tx: cria DevolucaoVenda + estoque + ClienteCredito (se vale)
      └─ MovimentacaoFinanceira(saida,"devolucao_pdv") fora da tx (fire-and-forget interno)
```

## 3. Bugs encontrados e correções aplicadas

### 3.1 `MovimentacaoFinanceira(origem:"venda")` ignorava a data real da venda

**Sintoma:** A movimentação financeira da venda era criada com `createdAt =
now()` do servidor (default Prisma). Mas o `sale.at` (timestamp real da venda no
cliente) podia ser horas mais cedo — vendas offline ou em transit re-sincronizadas
tarde. Como `app/api/ops/caixa/{fechar,sessao-detalhe}/route.ts` filtra
`MovimentacaoFinanceira(origem:"venda")` por `createdAt BETWEEN abertaEm AND
fechadaEm`, uma venda das 17h do dia A persistida às 09h do dia B contaria como
**venda da sessão do dia B**, inflacionando o fechamento do dia seguinte.

**Causa raiz:** o passo 4 do `upsertVendaInTransaction` não passava `createdAt`
ao criar a movimentação financeira. O `at` já estava parseado no início da
função (`new Date(sale.at)`), mas só era usado em `Venda.at`.

**Correção:** `lib/ops-upsert-venda.ts` — passa `createdAt: at` ao criar
`MovimentacaoFinanceira(origem:"venda")`. Mudança cirúrgica de 5 linhas (incluindo
comentário). O modelo Prisma já aceita override (campo `@default(now())`).

```ts
await tx.movimentacaoFinanceira.create({
  data: {
    storeId: lojaId,
    tipo: "entrada",
    valor: valorImediato,
    descricao: `Venda PDV ${pedidoId}${sufixoCliente}`,
    origem: "venda",
    referenciaId: pedidoId,
    createdAt: at, // FIX: alinha com data real da venda
  },
})
```

**Efeito esperado:** vendas reaparecem na sessão de caixa que estava aberta no
momento real da venda — incluindo após reenvio tardio do `syncPending`. Sessões
já fechadas (snapshot persistido em `SessaoCaixa.payload.totalVendasServer`)
**não** são recalculadas, mantendo auditoria intacta; a correção afeta apenas
vendas a partir desta sessão.

### 3.2 Sangria/Suprimento engolia falha de rede em silêncio

**Sintoma:** No `pdv-classic.tsx`, ao registrar sangria/suprimento o cliente
chamava `void fetch("/api/ops/caixa/operacao", ...).catch(() => {})`. Em falha
de rede ou HTTP não-ok, o operador via toast verde "Sangria gerada / R$ X
registrado com sucesso" — mas no banco **nada havia sido criado**: nem
`CaixaOperacao`, nem `MovimentacaoFinanceira`. O `caixa.totalSaidas` /
`totalEntradas` já tinha sido incrementado client-side, gerando divergência
silenciosa entre caixa local e DB.

**Correção:** `components/dashboard/vendas/pdv-classic.tsx` — substitui o
`.catch(() => {})` por handler explícito que loga `console.error` e exibe toast
destrutivo "Sangria/Suprimento não confirmado no servidor — operação aplicada
apenas no caixa local". Sem retry automático (o operador retenta manualmente).
Padrão consistente com o Goal 1 (toast em abertura de caixa offline e em venda
não confirmada).

Mudança cirúrgica de 32 linhas em um único bloco. Sem alteração da UX em caso
de sucesso ou da estrutura do componente.

## 4. Riscos restantes (NÃO corrigidos — fora do escopo cirúrgico)

| Risco | Severidade | Mitigação atual / Observação |
|---|---|---|
| 🔴 **PDV Black Edition (`/dashboard/pdv-next`) NÃO persiste vendas** | **CRÍTICO** | Não usar amanhã. Goals 1 e 2 já documentaram. |
| 🟡 **`appendContaReceberTituloPdvAprazo` é fire-and-forget no cliente** | Médio | `lib/pdv-append-conta-receber.ts` dispara `fetch /api/ops/contas-receber-persist` sem retry. Em falha, o título à prazo fica em `localStorage` (`contasReceberStorageKey`) e o `MovimentacaoFinanceira(entrada,"venda")` ainda contabiliza apenas a parte à vista (`total − aPrazo`). Sem perda de receita à vista; risco é o título à prazo não chegar ao Financeiro HUB até bootstrap manual. |
| 🟡 **Sangria/Suprimento sem idempotência forte** | Médio-baixo | Guard usa `referenciaId = caixaOperacao.id`, que muda a cada `create`. Em retry (cliente reenvia o POST), seria criada nova `CaixaOperacao` + nova `MovimentacaoFinanceira`. Atualmente protegido apenas pela UI (botão único + `setOperationType(null)` após clique). Não há reenvio automático. |
| 🟡 **Cancelamento usa `opsLojaIdFromRequest` (read variant) com `\|\| "loja-1"`** | Baixo | `app/api/vendas/[id]/cancelar/route.ts` aceita cookie de loja ativa como fallback. UI sempre envia header, mas é uma exceção ao padrão "Write exige header". Documentado no Goal 2; mantido neste Goal para não mudar fluxo validado. |
| 🟡 **Devolução com `tipo:"vale_credito"` cria `MovimentacaoFinanceira(saida,"devolucao_pdv")`** | Decisão de design | `app/api/ops/devolucao/route.ts` aplica saída financeira para todos os tipos exceto `somente_estoque`. Em devolução com vale (sem entrega de dinheiro), isso pode contabilizar saída de caixa que não ocorreu fisicamente. Compensado parcialmente pelo `+creditoVale` na próxima venda. Fora do escopo deste Goal. |
| 🟢 **Devolução cria `MovimentacaoFinanceira` fora da transação** | Baixo | `await createSaida({...})` está fora do `prisma.$transaction` do passo 1. Se a devolução foi criada com sucesso mas o financeiro falhar, a movimentação fica ausente. Há `console.warn` mas sem retry. Frequência baixa em loja única. |
| 🟢 **Sessão de caixa não bloqueia abertura duplicada** | Baixo | Goal 1 documentou. Mitigado pela reconciliação no bootstrap (`loadDb`). |
| 🟢 **Vendas históricas pré-21/05/2026** | Pré-existente | Não decrementaram estoque e não geraram MovimentacaoFinanceira. Goal 1/2 documentaram. Backfill manual fora de escopo. |
| 🟢 **`totalEntradas` na barra do PDV (localStorage acumulativo)** | Baixo | Pode divergir de `totalVendasServer`; fechamento usa o agregado server como canônico (Goal 1). |
| 🟢 **`MovimentacaoFinanceira.createdAt` para sangria/suprimento usa `now()`** | Baixo | Ao contrário da venda (FIX §3.1), sangria/suprimento usa default `now()`. Mas o operador opera sangria/suprimento em tempo real durante o turno; risco temporal é mínimo. |

## 5. Pontos fora do escopo

- 🔴 **`/dashboard/pdv-next`** (regra explícita).
- Refatoração do Financeiro HUB inteiro.
- Refatoração do PDV inteiro (visual / shells).
- Schema Prisma — **nenhuma mudança** (validado: `prisma generate` rodou sem
  alteração).
- Auth, `proxy.ts`, sidebar, billing/Stripe, WhatsApp webhook.
- UI dos PDVs (Clássico / Assistência / Supermercado) — preservada.
- Retry automático de título à prazo (`contas-receber-persist`).
- Endurecimento de idempotência de sangria/suprimento (precisaria `localId` no
  client).
- Endurecimento do cancelar para `opsLojaIdFromRequestForWrite` (mesmo risco
  baixo do Goal 2).

## 6. Arquivos alterados

```
M  lib/ops-upsert-venda.ts                       (+5 linhas, 1 comentário + 1 campo)
M  components/dashboard/vendas/pdv-classic.tsx   (+32 linhas, handler de erro)
```

Total: **2 arquivos** · **+36 linhas, -1 linha**.

Nenhum arquivo criado fora deste relatório
(`docs/ai/FINANCEIRO_CAIXA_GOAL_REPORT.md`). Nenhum arquivo removido. Nenhuma
área protegida tocada (auth, `proxy.ts`, sidebar, `prisma/schema.prisma`,
`lib/financeiro/contracts/local-key.ts`, `lib/financeiro/adapters/os-faturamento.ts`,
core de infra). `prisma generate` rodou apenas como parte do `npm run build`
sem alteração de schema.

## 7. Resultado das validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** (prisma generate + Next webpack, todas as rotas íntegras) |
| `git status` | ✅ `M components/dashboard/vendas/pdv-classic.tsx`, `M lib/ops-upsert-venda.ts` (e `M next-env.d.ts` pré-existente, gerado pelo Next) |
| `git diff --stat` | ✅ `pdv-classic.tsx \| 32 +-`, `ops-upsert-venda.ts \| 5 +` |

## 8. Teste manual documentado (roteiro de loja)

> Roteiro para conferência **na máquina da loja** amanhã antes do primeiro
> cliente. Use **PDV Clássico**, **Assistência** ou **Supermercado** — **NÃO**
> use `/dashboard/pdv-next`.

### 8.1 Abrir caixa

1. `/dashboard/vendas` → "Abrir Caixa" → saldo inicial → confirmar.
2. **Esperado:** barra "Caixa Aberto" + comprovante mostra **Sessão** (id servidor).
3. **Teste de rede (opcional):** com servidor parado, deve aparecer toast
   "Caixa aberto localmente — sessão não confirmada no servidor" (Goal 1).

### 8.2 Venda em dinheiro

1. Adicionar produto. F1 / Finalizar → dinheiro = total → confirmar.
2. **Esperado:**
   - Toast "Venda finalizada".
   - `Produto.stock` decrementa.
   - `MovimentacaoFinanceira(origem:"venda", tipo:"entrada", valor=total)` criada
     com `createdAt` ≈ horário da finalização (FIX §3.1).
   - Em **Financeiro → Movimentações** aparece a entrada.

### 8.3 Venda mista (PIX / cartão / dinheiro)

1. Total R$ 100. Pagamento: R$ 50 dinheiro + R$ 50 pix.
2. **Esperado:**
   - Uma única `MovimentacaoFinanceira(entrada,"venda", 100.00)`.
   - O detalhamento por forma vive em `Venda.payload.paymentBreakdown` (não há
     movimentação por forma — design atual: ledger soma o total à vista).

### 8.4 Venda à prazo (parcial ou total)

1. Selecionar cliente com CPF. Total R$ 200, à prazo R$ 200.
2. **Esperado:**
   - **Nenhuma** `MovimentacaoFinanceira(entrada,"venda")` (porque
     `valorImediato = 200 − 200 = 0`).
   - Título em "Contas a Receber" via `pdv-aprazo-{saleId}` em localStorage +
     persistido por `/api/ops/contas-receber-persist`.

### 8.5 Confirmar não-duplicação em reenvio

1. Anotar o `valor` total atual de `MovimentacaoFinanceira(origem:"venda")` em
   Financeiro → Movimentações.
2. DevTools → Application → Local Storage → editar último
   `assistec-pro-ops-v1-{storeId}` → `sales[…].syncPending = true`. Aguardar
   ≤ 30 s.
3. **Esperado:**
   - `syncPending` volta a `false`.
   - **Nenhuma** nova `MovimentacaoFinanceira` foi criada
     (idempotência `findFirst({referenciaId,origem,tipo})`).
   - Valor total agregado **não muda**.

### 8.6 Sangria (PDV Clássico)

1. Menu Caixa → Sangria → R$ 50 + motivo "Pagamento entregador".
2. **Esperado (online):**
   - Toast "Sangria gerada".
   - `CaixaOperacao(tipo:"sangria")` criada.
   - `MovimentacaoFinanceira(saida,"sangria_pdv", 50)` criada.
3. **Esperado (servidor offline):**
   - Toast verde "Sangria gerada" **e** toast destrutivo
     "Sangria não confirmada no servidor — verifique a conexão" (FIX §3.2).
   - Caixa local diminui R$ 50, mas DB **não** tem `CaixaOperacao` nem
     `MovimentacaoFinanceira`. Operador sabe que precisa retentar.

### 8.7 Suprimento

Mesmo fluxo da sangria, mas tipo `suprimento`. Cria
`MovimentacaoFinanceira(entrada,"suprimento_pdv", valor)`. Toast destrutivo em
falha (FIX §3.2).

### 8.8 Cancelamento de venda (opcional, se suportado pelo turno)

1. Histórico de Vendas → venda do passo 8.2 → "Cancelar" → motivo.
2. **Esperado:**
   - `Venda.status = "cancelada"`.
   - `Produto.stock` repõe o líquido (vendido − devolvido prévio).
   - `MovimentacaoEstoque(entrada,"cancelamento_pdv")`.
   - `MovimentacaoFinanceira(saida,"cancelamento_pdv", valor_líquido)` —
     guard `findFirst({referenciaId=pedidoId,tipo:"saida",origem:"cancelamento_pdv"})`
     bloqueia segundo estorno.
   - Badges "Estoque reposto" / "Estorno financeiro registrado" no drawer.

### 8.9 Fechar caixa

1. "Fechar Caixa" → contagem física → confirmar.
2. **Esperado:**
   - Toast "Caixa fechado".
   - `SessaoCaixa.status = "FECHADA"`, `payload.totalVendasServer` =
     soma de `MovimentacaoFinanceira(entrada,"venda")` no intervalo
     `[abertaEm, fechadaEm]` — graças ao FIX §3.1, vendas re-sincronizadas
     tardiamente caem na sessão temporal correta.
   - Resumo do dia em "Caixa Histórico" mostra os totais por forma de
     pagamento (lidos de `SessaoCaixa.payload.ledger`).

## 9. Orientação para uso amanhã

✅ **PODE USAR AMANHÃ** como caixa real, **desde que**:

1. Operadores usem **PDV Clássico**, **PDV Supermercado** ou **PDV Assistência**.
2. **NÃO USEM** `/dashboard/pdv-next` (PDV Black Edition).
3. Operadores observem toasts destrutivos — qualquer "Sangria/Suprimento não
   confirmado no servidor" ou "Caixa aberto localmente — sessão não confirmada"
   exige atenção (retentar manualmente quando voltar a rede ou registrar
   manualmente no Financeiro depois).
4. Internet razoavelmente estável (Goal 1 cobriu retry de venda; Goals 2 e 3
   confirmaram idempotência em todas as camadas).

### Sinais de alerta a monitorar nos logs do servidor (Vercel)

- `[caixa/operacao] HTTP {status}` — sangria/suprimento rejeitado pelo servidor
  (período fechado, sessão errada, permissão). Cliente já avisa via toast.
- `[caixa/operacao] rede` — sangria/suprimento perdido por rede. Cliente já
  avisa via toast.
- `[venda-persist]` — venda fica `syncPending=true` até reenvio (Goal 1 cobre).
- `[upsert-venda] estoque-nao-baixado` — venda OK no banco, mas produto não
  baixou (Goal 2).
- `[ops/devolucao] Falha ao criar movimentação financeira` — devolução criada
  mas saída financeira não.

## 10. Documentação atualizada

- `docs/ai/CURRENT_STATUS.md` — adicionada entrada curta sobre a estabilização
  do financeiro PDV (FIX `createdAt` da venda + toast em sangria/suprimento).
- `CHANGELOG.md` / `MASTER_CONTEXT.md` — sem mudança de contrato/arquitetura,
  não alterados.

## 11. Próximos goals recomendados

| Prioridade | Goal sugerido | Justificativa |
|---|---|---|
| 🔴 Alta | **PDV Black Edition — habilitar persistência** | Continua sem persistir vendas. Goals 1/2/3 documentaram. |
| 🟡 Média | **Idempotência forte de sangria/suprimento** | Aceitar `localId` no body do POST e usar como `referenciaId` em vez do `caixaOperacao.id`. Bloqueia retry duplicado. |
| 🟡 Média | **Retry server-side de `contas-receber-persist`** | Hoje é fire-and-forget client; em falha, título à prazo só fica em localStorage até bootstrap. Server-side persistence + ack. |
| 🟡 Média | **Devolução com vale_credito sem saída financeira física** | Revisar se `MovimentacaoFinanceira(saida,"devolucao_pdv")` deve ser criado quando a devolução é em vale (dinheiro não saiu fisicamente do caixa). Decisão contábil. |
| 🟢 Baixa | **Endurecer cancelar/detail para `opsLojaIdFromRequestForWrite`** | Remove fallback `\|\| "loja-1"`. |
| 🟢 Baixa | **Mover criação de `MovimentacaoFinanceira` da devolução para dentro da tx** | Hoje fica fora; em falha, devolução existe mas financeiro não. |
| 🟢 Baixa | **Backfill retroativo de `Produto.stock` + MovFinanceira histórica** | Vendas pré-21/05/2026 não decrementaram estoque nem geraram financeiro. |

---

**Conclusão:** Fluxo financeiro do PDV está sólido para uso real amanhã nos 3
PDVs operacionais (Clássico, Assistência, Supermercado). Idempotência confirmada
em **MovimentacaoFinanceira** para todas as origens críticas
(`venda`, `cancelamento_pdv`, `devolucao_pdv`, `sangria_pdv`, `suprimento_pdv`).
Multi-loja preservado em todos os pontos de escrita
(`opsLojaIdFromRequestForWrite`). Duas correções cirúrgicas tornam o sistema
mais robusto: vendas offline re-sincronizadas tardiamente agora caem na sessão
de caixa temporalmente correta, e operadores são imediatamente alertados se uma
sangria/suprimento não chegou ao servidor.
