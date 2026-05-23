# Relatório — Auditoria PDV ↔ Estoque para uso real em loja

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal: estabilizar a integração entre
> PDV e Estoque para uso real amanhã na loja (Goal 2, sequência do Goal 1 PDV/Caixa).

## 1. Resumo do que foi auditado

Mapeamento ponta-a-ponta do caminho de uma venda PDV até a baixa de estoque + ledger
+ financeiro, com foco em **idempotência**, **multi-loja (`storeId`)** e **erros silenciosos**.

| Camada | Arquivo | Resultado |
|---|---|---|
| Client — finalização local + sync | `lib/operations-store.tsx` (`finalizeSaleTransaction`, `flushPendingSales`) | ✅ Idempotente; reenvio em `online`/`visibilitychange`/30 s (Goal 1) |
| API — persistência server | `app/api/ops/venda-persist/route.ts` | ✅ Exige `x-assistec-loja-id`; gate enterprise/ops; transação Prisma |
| Service — upsert + estoque + financeiro | `lib/ops-upsert-venda.ts` | ⚠️ Silent skip corrigido (ver §4) |
| Cancelamento | `app/api/vendas/[id]/cancelar/route.ts` | ✅ Reposição líquida idempotente, estorno financeiro |
| Devolução | `app/api/ops/devolucao/route.ts` | ✅ Estoque + crédito + status `Venda` atualizados na mesma tx |
| Inventory bootstrap | `app/api/ops/inventory/route.ts` | ✅ `storeId` propagado; `rowToItem` expõe `dbId/sku/barcode` |
| PDVs (Clássico, Assistência, Supermercado) | `components/dashboard/vendas/pdv-*` | ✅ Todos passam por `finalizeSaleTransaction` |
| PDV Black Edition (pdv-next) | `components/dashboard/pdv-next/*` | 🔴 Não persiste vendas (escopo do Goal 1, fora deste Goal) |

### 1.1 Fluxo confirmado (venda PDV → Estoque)

1. **Client** (`finalizeSaleTransaction`) valida caixa aberto, estoque local suficiente,
   soma de pagamentos = total (±0,02), regras de a-prazo/vale, grava
   `SaleRecord{syncPending:true}` em localStorage e dispara `POST /api/ops/venda-persist`
   fire-and-forget.
2. **Server** (`venda-persist`) exige `x-assistec-loja-id` (write gate), valida
   permissão `pdv.vendas`, resolve operador via sessão NextAuth e roda
   `upsertVendaInTransaction` em **uma única transação Prisma**:
   - Upsert `Venda` (PK por `pedidoId`).
   - `deleteMany`+recria `ItemVenda` (idempotente); resolve produto por
     `OR [id, sku, barcode]` e armazena o **cuid** real em `ItemVenda.inventoryId`.
   - **Agrega quantidade por produto** (corrige bug de 2 linhas mesmo SKU).
   - `MovimentacaoEstoque(tipo:"saida", origem:"pdv")` por produto, com guard
     `findFirst({ documento+produtoId+origem })` antes — **retry da mesma venda não duplica**.
   - `MovimentacaoFinanceira(tipo:"entrada", origem:"venda")` pelo valor à vista
     (`total − aPrazo`), com guard `findFirst({ referenciaId+origem+tipo })`.
   - Debita `ClienteCredito` (oldest-first) quando `creditoVale > 0`, criando
     `UsoCreditoCliente` — atômico com a venda.

### 1.2 Idempotência confirmada

| Operação | Mecanismo | Resultado |
|---|---|---|
| Upsert `Venda` | PK `pedidoId` | Reenvio sobrescreve com mesma chave |
| `ItemVenda` | `deleteMany` + `create` | Recriado coerente a cada retry |
| `MovimentacaoEstoque` PDV | `findFirst({ storeId+documento+produtoId+origem:"pdv" })` | **Bloqueia 2ª baixa** |
| `MovimentacaoFinanceira` PDV | `findFirst({ storeId+referenciaId+origem:"venda"+tipo:"entrada" })` | **Bloqueia 2º crédito** |
| `MovimentacaoEstoque` cancelamento | `findFirst({ documento+produtoId+origem:"cancelamento_pdv" })` | **Bloqueia 2ª reposição** |
| `MovimentacaoFinanceira` cancelamento | `findFirst({ referenciaId+tipo:"saida"+origem:"cancelamento_pdv" })` | **Bloqueia 2º estorno** |
| `DevolucaoVenda` | `@unique storeId_localId` + guard upfront | Retry retorna `idempotente:true` |
| `MovimentacaoEstoque` devolução | `findFirst({ documento+produtoId+origem:"devolucao" })` | **Bloqueia 2ª entrada** |

→ A rede de segurança Goal 1 (re-sync em `online`/`visibilitychange`/30 s) é segura:
mesma `Venda` reenviada não duplica estoque nem financeiro.

### 1.3 Multi-loja (`storeId`) na cadeia PDV→Estoque

| Ponto | Mecanismo | Status |
|---|---|---|
| `venda-persist` (write) | `opsLojaIdFromRequestForWrite` → exige header/query, rejeita 400 sem unidade | ✅ |
| `devolucao` (write) | `opsLojaIdFromRequestForWrite` → idem | ✅ |
| `caixa/{abrir,fechar,operacao}` (write) | `opsLojaIdFromRequestForWrite` | ✅ |
| `inventory` GET (read) | `storeIdFromAssistecRequestForRead` | ✅ |
| `vendas/[id]/cancelar` (write) | `opsLojaIdFromRequest` (read variant) + `\|\| "loja-1"` | ⚠️ ver §5 |
| `vendas/[id]` GET (read) | `opsLojaIdFromRequest` + `\|\| "loja-1"` | ⚠️ ver §5 |
| Client PDV (todos) | Sempre envia `x-assistec-loja-id: ${lojaAtivaId}` | ✅ |
| Persistência local | `omnigestao:caixa:${storeId}` + `assistec-pro-ops-v1-${storeId}` | ✅ |

## 2. Bugs encontrados

### 2.1 🟡 Silent skip de baixa de estoque quando produto não casa server-side

**Onde:** `lib/ops-upsert-venda.ts` Step 3 (agregação `qtyByProdutoId`).

**Sintoma:** Se uma linha referencia um `inventoryId` cujo produto não foi
encontrado no banco via `OR [id, sku, barcode]` (cache do cliente desatualizado,
produto deletado por outro usuário, SKU divergente), o loop simplesmente
`continue`. A venda persiste, mas:

- `Produto.stock` não decrementa.
- Nenhum `MovimentacaoEstoque` é criado.
- Nenhum log informa.

**Causa raiz:** o early-return silencioso era pensado para linhas virtuais de
OS (`isOsVirtualSaleLine`). O mesmo branch também tratava (silenciosamente) o
caso de produto físico não resolvido.

**Frequência esperada:** baixa em loja única, mas existe — concorrência entre
admin (deletar produto) e operador (vender o mesmo item) é o gatilho típico.

### 2.2 Bugs pré-existentes confirmados como NÃO regressivos

| Bug | Status |
|---|---|
| 2 linhas qty=1 do mesmo SKU decrementarem só 1 unidade | ✅ Corrigido em 21/05/2026 (agregação por produto) |
| `Produto.stock` nunca decrementar (OR lookup ausente) | ✅ Corrigido em 21/05/2026 |
| `params.id` 400 no detalhe da venda | ✅ Corrigido em 21/05/2026 (`await params`) |
| Cancelamento sem reposição de estoque | ✅ Corrigido em 22/05/2026 (Fase 2 ERP-safe) |

## 3. Correções aplicadas

### 3.1 Observabilidade de produtos não resolvidos

**Arquivo:** `lib/ops-upsert-venda.ts`

Adicionada coleta de `unresolvedInventoryIds[]` no Step 3 e um `console.warn`
contendo `pedidoId`, `lojaId` e a lista. Não muda comportamento (a venda
continua persistindo o que conseguir), mas **deixa rastro auditável** em
Vercel/Logs para diagnóstico de "venda OK, estoque não baixou" — exatamente o
cenário que precisamos enxergar amanhã.

```ts
const unresolvedInventoryIds: string[] = []
for (const line of lines) {
  const rawInvId = ...
  if (!rawInvId || isOsVirtualSaleLine(rawInvId)) continue
  const resolved = resolvedProductMap.get(rawInvId)
  if (!resolved) {
    unresolvedInventoryIds.push(rawInvId)
    continue
  }
  ...
}
if (unresolvedInventoryIds.length > 0) {
  console.warn("[upsert-venda] estoque-nao-baixado",
    JSON.stringify({ pedidoId, lojaId, unresolvedInventoryIds }))
}
```

Mudança cirúrgica de 14 linhas; sem alteração de contrato.

## 4. Riscos restantes (NÃO corrigidos — fora do escopo cirúrgico)

| Risco | Severidade | Mitigação atual |
|---|---|---|
| 🔴 **PDV Black Edition (`/dashboard/pdv-next`) NÃO persiste vendas** | **CRÍTICO** | Não usar amanhã. Goal 1 já documentou. Os 3 PDVs operacionais (Clássico, Assistência, Supermercado) estão íntegros. |
| **Estoque pode ir negativo em concorrência** | Baixa em loja única | `decrement: qty` no Prisma não checa sinal. 2 caixas vendendo o mesmo SKU simultaneamente pode resultar em `stock < 0`. |
| **Venda por peso (kg) consolida como int** | Limitação pré-existente | `Produto.stock` é `Int`; `Math.round(quantity)` no upsert converte 0,5 kg em 1 unidade na ItemVenda/Movimentação. Cliente vê preço/kg ok; servidor inflar/decrementar 1. |
| **Produto deletado mid-sale → silent (agora WARN-ado)** | Baixa | A correção §3 agora gera `console.warn` quando isso acontecer. Sem toast no PDV — auditoria por log. |
| **Cancelamento usa READ gate (cookie fallback)** | Baixa | `app/api/vendas/[id]/cancelar/route.ts` usa `opsLojaIdFromRequest` (read) com fallback `\|\| "loja-1"`. UI sempre envia o header, então em uso real não dispara. Risco teórico de cancelar venda na loja errada via cookie. Não corrigido para não mexer no fluxo já validado do Goal 1. |
| **Fechamento offline reabre no reload** | Baixa | Documentado no Goal 1 — auto-cura. |
| **`totalEntradas` na barra acumulativo via localStorage** | Baixa | Documentado no Goal 1 — fechamento usa `totalVendasServer` (canônico). |
| **Estoque histórico inflado** | Pré-existente | Vendas anteriores a 21/05/2026 não baixaram estoque server-side. Novas vendas a partir de agora estão corretas. |
| **Concorrência entre fluxo PDV e fluxo OS (mesmo SKU)** | Baixa | Ambos têm idempotência própria (`origem:"pdv"` vs `origem:"os"`), guards distintos. Sem cross-bloqueio. |

## 5. Pontos fora do escopo

- 🔴 **Não corrigir** `pdv-next` (regra explícita do goal).
- Refatoração do Estoque HUB inteiro.
- Refatoração do PDV inteiro (visual / shells).
- Schema Prisma (nenhuma migration foi necessária — confirmado).
- Auth, `proxy.ts`, sidebar, billing/Stripe, WhatsApp webhook.
- UI dos PDVs (Clássico / Assistência / Supermercado) — preservada.
- Cobertura de venda-por-peso server-side (exigiria mudar `Produto.stock` para `Float`).
- Endurecimento do cancelar para usar `opsLojaIdFromRequestForWrite` (uma linha,
  mas é uma **mudança de comportamento** que pode quebrar fluxo legado — preservei
  o status quo do Goal 1 e documentei como risco).

## 6. Arquivos alterados

```
M  lib/ops-upsert-venda.ts       (+14 / -1 linha)  — observabilidade Step 3
M  next-env.d.ts                  (gerado pelo Next — já estava modificado pré-sessão)
```

Nenhum arquivo criado fora do relatório (`docs/ai/ESTOQUE_PDV_GOAL_REPORT.md`).
Nenhum arquivo removido.

## 7. Resultado das validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Build concluído** (prisma generate + Next webpack, tabela de rotas íntegra) |
| `git status` | ✅ `M lib/ops-upsert-venda.ts`, `M next-env.d.ts` |
| `git diff --stat` | ✅ `lib/ops-upsert-venda.ts \| 14 +++++++++++++-` ; `next-env.d.ts \| 2 +-` |

## 8. Teste manual documentado (roteiro de loja)

> Auditoria e validação automatizada concluídas. Roteiro para conferência **na
> máquina da loja** amanhã antes do primeiro cliente. Toda referência a "estoque"
> abaixo significa o número visível em **Estoque → Cadastro de Produtos**.

### 8.1 Abrir caixa
1. `/dashboard/vendas` → "Abrir Caixa" → saldo inicial → confirmar.
2. **Esperado:** barra "Caixa Aberto" + comprovante mostra **Sessão** (id servidor).
3. **Teste de rede (opcional):** com servidor parado, deve aparecer toast
   "Caixa aberto localmente — sessão não confirmada no servidor" (Goal 1).

### 8.2 Vender produto com estoque disponível
1. Bipar/buscar um produto com `stock >= 1`.
2. Ajustar quantidade (ex.: 2 unidades).
3. F1 / Finalizar → escolher forma (dinheiro / pix / cartão) → confirmar.
4. **Esperado:**
   - Toast "Venda finalizada".
   - Carrinho limpa, foco volta para busca.
   - `Produto.stock` decrementado em 2 (verificar em Estoque ou na própria barra do PDV).
   - `MovimentacaoEstoque(origem:"pdv")` registrada (visível em Estoque → Auditoria).
   - `MovimentacaoFinanceira(origem:"venda")` criada (visível em Financeiro → Movimentações).
   - Venda aparece em "Histórico de Vendas" sem `syncPending`.

### 8.3 Confirmar não-duplicação em reenvio
1. Anotar o `stock` atual do produto.
2. No console do navegador: forçar reenvio digitando
   `localStorage` da chave `assistec-pro-ops-v1-${storeId}` — verá `sales[]` com
   a venda mais recente.
3. **Forma A (mais fácil):** abrir DevTools → Application → Local Storage → editar
   o último `sales[…].syncPending` de `false` para `true`. Aguardar ≤ 30 s (rede
   de segurança Goal 1) ou recarregar a página.
4. **Esperado:**
   - `syncPending` volta a `false` (servidor respondeu OK).
   - `Produto.stock` **NÃO** muda (idempotência `findFirst({ documento+produtoId+origem })`).
   - Nenhum `MovimentacaoEstoque` novo é criado.
   - Nenhum `MovimentacaoFinanceira` novo é criado.

### 8.4 Vender produto com estoque zero / insuficiente
1. Tentar adicionar ao carrinho um produto com `stock = 0`.
2. **Esperado (validação client-side em `finalizeSaleTransaction`):**
   - Toast "Estoque insuficiente para {nome}".
   - Venda **não** é finalizada.
   - `Produto.stock` permanece 0.
   - Nenhum registro no banco.

### 8.5 Cancelar venda (opcional, validar reposição)
1. No "Histórico de Vendas", localizar a venda do passo 8.2.
2. Cancelar → informar motivo → confirmar.
3. **Esperado:**
   - `Venda.status = "cancelada"`.
   - `Produto.stock` volta a aumentar em 2 (reposição líquida).
   - `MovimentacaoEstoque(origem:"cancelamento_pdv")` criada.
   - `MovimentacaoFinanceira(origem:"cancelamento_pdv", tipo:"saida")` criada.
   - Badge "Estoque reposto" / "Estorno financeiro registrado" no drawer.

### 8.6 Fechar caixa
1. "Fechar Caixa" → valor contado → confirmar.
2. **Esperado:**
   - Toast "Caixa fechado e registrado".
   - `SessaoCaixa.status = "FECHADA"` com `totalVendasServer` consolidado.
   - Resumo do dia mostra valores corretos (din/pix/débito/crédito/carnê/vale).

### 8.7 Cobertura automatizada complementar
- `e2e/specs/06-pdv-caixa-historico.spec.ts` (Goal 1, ainda válida).

## 9. Orientação para uso amanhã

✅ **PODE USAR AMANHÃ** o caixa real, **desde que**:

1. Operadores usem **PDV Clássico**, **PDV Supermercado** ou **PDV Assistência**.
2. **NÃO USEM** `/dashboard/pdv-next` (PDV Black Edition) — não persiste vendas.
3. Internet razoavelmente estável (Goal 1 já cobriu: vendas sobrevivem a
   quedas transitórias via `syncPending` + rede de segurança).
4. Se a conexão cair durante o fechamento de caixa, o caixa fecha localmente
   e auto-cura no próximo reload (Goal 1).

### Sinais de alerta a monitorar (no Vercel Logs)

- `[upsert-venda] estoque-nao-baixado` — venda OK no banco, mas produto não
  baixou. Investigar `unresolvedInventoryIds[]`: provável produto deletado
  por admin enquanto cliente cacheava ou SKU/barcode divergente.
- `[venda-persist]` — falha na transação Prisma; venda fica `syncPending:true`,
  rede de segurança reenvia.
- `[venda-persist] re-sync HTTP {status} {pedidoId}` — venda pendente sendo
  retentada; se persistir, abrir DevTools para diagnosticar.

## 10. Próximos goals recomendados

| Prioridade | Goal sugerido | Justificativa |
|---|---|---|
| 🔴 Alta | **PDV Black Edition — habilitar persistência** | `handlePaymentConfirm` precisa chamar `finalizeSaleTransaction` + `venda-persist`. Atualmente é só UI. |
| 🟡 Média | **Validação anti-negativo no upsertVenda** | Adicionar `findFirst({stock<qty})` antes do decrement; falhar com 409 e devolver `Venda` à fila syncPending → exige reabrir o PDV. |
| 🟡 Média | **Surfar `unresolvedInventoryIds` no JSON de venda-persist** | Hoje só vai em log. Cliente poderia parsear o JSON e exibir toast destrutivo "Item X não baixou estoque — confira o cadastro". |
| 🟢 Baixa | **Endurecer cancelar/detail para `opsLojaIdFromRequestForWrite`** | Remove fallback `\|\| "loja-1"` e força header em rotas de write. |
| 🟢 Baixa | **Backfill retroativo de `Produto.stock`** | Reconciliação com vendas históricas pré-21/05/2026 que não baixaram estoque. |
| 🟢 Baixa | **Modelo de venda por peso server-side** | `Produto.stock` Float + ItemVenda.quantidade Float. Migration + reescrita do upsert. |

---

**Conclusão:** Fluxo PDV ↔ Estoque está sólido para uso real amanhã nos 3 PDVs
operacionais. Idempotência confirmada em todas as camadas críticas. A única
adição cirúrgica foi observabilidade (log) para o cenário marginal de produto
deletado mid-sale, que historicamente era silencioso.
