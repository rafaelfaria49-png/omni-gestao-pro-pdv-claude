# Relatório — Venda Avulsa via tecla INSERT no PDV (Item Avulso)

> Data: 23/05/2026 · Modelo: Claude Opus 4.7
> Goal: implementar Venda Avulsa via tecla INSERT no PDV, com valor de venda e
> custo opcional, sem quebrar o fluxo estabilizado (Goals 1–4 PDV/Caixa,
> Estoque, Financeiro).

## 1. O que foi entregue

A tecla **INSERT** (mais o item de menu "Item Avulso") abre um modal que
permite ao operador adicionar ao carrinho um item **não cadastrado** no
estoque, informando descrição, valor unitário, quantidade e — opcionalmente —
custo unitário. A venda segue pelo mesmo pipeline de qualquer outra venda PDV:
caixa, ledger financeiro, cupom e histórico funcionam normalmente. Item avulso
**não baixa estoque** e **não cria `MovimentacaoEstoque`**.

| Camada | Status |
|---|---|
| Atalho `Insert` no PDV Clássico | ✅ |
| Item "Item Avulso" no menu Operações de Caixa (Clássico) | ✅ |
| Atalho `Insert` no PDV Supermercado | ✅ |
| Atalho `Insert` no PDV Assistência | ✅ |
| Modal `<ItemAvulsoModal>` reutilizável | ✅ |
| `finalizeSaleTransaction` aceita avulso e pula validação/decremento de stock local | ✅ |
| `upsertVendaInTransaction` (server) pula resolução de produto e ledger para avulso | ✅ |
| `MovimentacaoFinanceira(origem:"venda")` continua sendo criada pelo total à vista | ✅ |
| Cupom não fiscal renderiza o avulso (lê `nome`/`qtd`/`lineTotal`) | ✅ |
| Histórico de Vendas mostra o avulso | ✅ |
| Idempotência: retry/syncPending não duplica venda nem cria ledger fantasma | ✅ |
| Cancelamento de venda com avulso (`/api/vendas/[id]/cancelar`) pula reposição do avulso | ✅ |
| Devolução com avulso (`/api/ops/devolucao`) pula entrada do avulso | ✅ |
| Custo opcional persistido em `Venda.payload.lines[].custoUnitario` quando informado | ✅ |
| PDV Assistência | ✅ (integrado após o WIP de desconto/PIN ser commitado — ver §7) |
| PDV Black Edition (`/dashboard/pdv-next`) | 🔴 fora de escopo (não persiste venda — Goal 1) |

## 2. Arquitetura — como o "item avulso" atravessa as camadas

A peça central é o predicado `isVirtualSaleLine` (em
`lib/os-pdv-virtual-lines.ts`), que unifica duas famílias de linhas que **não
tocam estoque**:

- O.S. (`__os_servico__` / `__os_pecas__`) — faturamento da Ordem de Serviço.
- **Item Avulso (`__avulso__`) — Venda Avulsa via INSERT (este goal).**

Cada item avulso recebe um `inventoryId` único `__avulso__{lineId}`. Todos os
pontos que decidem "pular ledger / pular resolução de produto" usam o predicado
unificado:

```
finalizeSaleTransaction (client)
  ├─ Validação de stock:           if (isVirtualSaleLine(...)) skip
  ├─ Decremento local:             if (isVirtualSaleLine(...)) skip
  └─ Mapping SaleRecord.lines[]:   propaga isAvulso + custoUnitario

upsertVendaInTransaction (server)
  ├─ Step 2 (resolução Produto):   if (isVirtualSaleLine(...)) skip — `ItemVenda.inventoryId` preserva o `__avulso__...`
  ├─ Step 3 (estoque/ledger):      if (isVirtualSaleLine(...)) skip — nenhum decrement, nenhum MovimentacaoEstoque
  └─ Step 4 (MovimentacaoFinanceira): inalterado — soma do total à vista é creditada normalmente

Cancelamento `/api/vendas/[id]/cancelar`
  ├─ Soma vendida por produto:     if (isVirtualSaleLine(raw)) skip
  ├─ Soma já devolvida:            if (isVirtualSaleLine(raw)) skip
  └─ Estorno financeiro:           inalterado (valor da venda, não do item)

Devolução `/api/ops/devolucao`
  └─ Entrada de estoque:           if (isVirtualSaleLine(raw)) skip
```

### 2.1 Onde mora o custo

`ItemVenda` não tem coluna `custoUnitario` (schema atual). Para evitar
migração, o custo opcional informado pelo operador é persistido em
**`Venda.payload.lines[].custoUnitario`** (o `payload` da `Venda` é o snapshot
completo do `SaleRecord` enviado pelo PDV; agora `SaleLineRecord` tem o campo).
Quando o operador não informou custo, o campo fica **`undefined`** — não é
gravado e relatórios devem tratar como "custo desconhecido", **não como 100% de
lucro**.

## 3. Arquivos alterados/criados

### Centrais (helpers + pipeline de venda)

| Arquivo | Mudança |
|---|---|
| `lib/os-pdv-virtual-lines.ts` | Adiciona `AVULSO_PREFIX`, `isAvulsoSaleLine`, `isVirtualSaleLine` (união O.S. + avulso) e `avulsoInventoryId(localId?)`. Comentário no topo explica o contrato. `isOsVirtualSaleLine` permanece exportado para callers que precisem diferenciar. |
| `lib/operations-sale-types.ts` | `SaleLineRecord` ganha `isAvulso?: boolean` e `custoUnitario?: number \| null` (com JSDoc explicando o "custo desconhecido"). |
| `lib/operations-store.tsx` | `finalizeSaleTransaction` aceita `isAvulso?` e `custoUnitario?` em `lines[]`; troca `isOsVirtualSaleLine` por `isVirtualSaleLine` nos 3 pontos críticos (validação, decremento local, mapping); o mapping propaga `isAvulso` e arredonda `custoUnitario` para 2 casas (ou deixa `undefined`). Sem mudança de comportamento para itens cadastrados. |
| `lib/ops-upsert-venda.ts` | `SalePayload.lines[]` ganha `isAvulso?` e `custoUnitario?` (apenas tipos — o conteúdo do payload é serializado integralmente em `Venda.payload`). O troca de helper (`isVirtualSaleLine`) já estava feita. Step 2 e 3 não tentam mais resolver produto nem criar `MovimentacaoEstoque` para `__avulso__...`. |
| `lib/audit-log.ts` | Adicionado `"pdv_item_avulso_adicionado"` ao union `AuditAction`. |

### Defesa em profundidade nas rotas de write (já estava aplicada na sessão)

| Arquivo | Mudança |
|---|---|
| `app/api/ops/devolucao/route.ts` | Step de estoque pula linhas virtuais via `isVirtualSaleLine` — devolver avulso não tenta criar `Produto.stock` para um SKU inexistente. |
| `app/api/vendas/[id]/cancelar/route.ts` | Cálculo de quantidade líquida para reposição e checagem de já-devolvido pulam linhas virtuais — cancelar venda que contém avulso não falha tentando resolver produto fantasma e não gera reposição inexistente. |

### UI dos PDVs

| Arquivo | Mudança |
|---|---|
| `components/dashboard/vendas/item-avulso-modal.tsx` | **NOVO** — modal `<ItemAvulsoModal>` com campos descrição (obrigatória), valor de venda (obrigatório), quantidade (default 1, inteiro), custo unitário (opcional). Tokens semânticos, foco automático na descrição, Enter no custo confirma, Esc fecha, mostra total da linha + margem estimada quando há custo. Discreto, sem usar cores hardcoded. |
| `components/dashboard/vendas/pdv-classic.tsx` | Import dos helpers + modal; `CartItem` ganha `isAvulso?` e `custoUnitario?`; estado `showItemAvulsoModal`; handler `addItemAvulso` (cria linha com `inventoryId = __avulso__{lineId}` + audit log dedicado + flash/beep do modo rápido); branch `e.key === "Insert"` no handler global de teclado; filter do `onConfirm` do PaymentModal aceita avulso e propaga `isAvulso`/`custoUnitario`; entrada "Item Avulso" no menu Operações de Caixa com hint "INS" à direita. |
| `components/dashboard/vendas/pdv-supermercado.tsx` | Import dos helpers + modal; `CartItem` ganha `isAvulso?` e `custoUnitario?`; estado `showItemAvulsoModal`; handler `addItemAvulso`; tecla `Insert` adicionada ao único handler de teclado (junto com F2/F3/F4, com guards contra modais já abertos); filter do `onConfirm` aceita avulso; `<ItemAvulsoModal>` montado no JSX. |

### Arquivos NÃO tocados nesta sessão (já apareciam como modificados no `git status` inicial)

`app/actions/cadastros.ts`, `app/api/clientes/*`, `app/dashboard/clientes/ClientesPageClient.tsx`, `components/cadastros/lovable/.../CadastrosHub.tsx`, `components/dashboard/estoque/gestao-produtos.tsx`, `components/dashboard/vendas/pdv-assistencia-enterprise.tsx`, `docs/ai/CURRENT_STATUS.md`, `docs/ai/{CADASTROS,CLIENTES,ESTOQUE}_HUB_GOAL_REPORT.md` — mudanças de sessões anteriores que ainda não tinham sido commitadas.

## 4. Validações executadas

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` (prisma generate + next build webpack) | ✅ **Compiled successfully in 114s** — todas as rotas geradas, incluindo `/dashboard/vendas`, `/api/ops/venda-persist`, `/api/ops/devolucao`, `/api/vendas/[id]/cancelar` |
| `git status` | Conforme §3 (arquivos do escopo + arquivos pré-existentes intocados) |
| `git diff --stat` (escopo deste goal apenas) | **9 arquivos · +240 / −25 linhas** (incluindo `+1` em audit-log e `+24` em rotas server pré-aplicadas) |

## 5. Teste manual (roteiro de loja para amanhã)

> Validação automatizada (tsc/build) concluída. Roteiro para conferência **na
> máquina da loja** antes do primeiro atendimento. Use **PDV Clássico** ou
> **PDV Supermercado** — não usar `/dashboard/pdv-next`.

### 5.1 INSERT abre o modal (Clássico/Supermercado)

1. Abrir o caixa (saldo inicial → "Abrir Caixa"). Conferir barra "Caixa Aberto".
2. Pressionar **INSERT** com foco em qualquer lugar do PDV.
   - Esperado: abre `<ItemAvulsoModal>` com foco no campo "Descrição".
3. **Alternativa (Clássico):** menu "Operações de Caixa" → entrada "Item Avulso" (hint **INS** à direita) → abre o mesmo modal.

### 5.2 Adicionar item avulso com descrição, valor e custo

1. Descrição: "Suporte TV genérico". Valor: `120,00`. Quantidade: `1`. Custo: `75,00`.
2. Esperado: aparece "Total da linha: R$ 120,00 · Margem estimada: R$ 45,00".
3. "Adicionar ao carrinho" → linha entra no carrinho com nome "Suporte TV genérico".

### 5.3 Finalizar a venda em dinheiro

1. F1/Finalizar → dinheiro = 120,00 → "Confirmar Pagamento".
2. Esperado:
   - Toast "Venda finalizada".
   - Em **Financeiro → Movimentações** entra `MovimentacaoFinanceira(entrada, "venda", 120,00)`.
   - Em **Histórico de Vendas**: a venda aparece, com 1 item "Suporte TV genérico", quantidade 1, R$ 120,00.
   - Em **Estoque → Auditoria**: **nenhuma** `MovimentacaoEstoque` foi criada para essa venda.
   - `Produto.stock` de qualquer produto cadastrado permanece **inalterado**.

### 5.4 Repetir sem custo

1. INSERT → "Caneta promocional", valor `5,00`, quantidade `1`, **custo em branco**.
2. Esperado: linha "Sem custo informado → relatórios tratam como custo desconhecido…" abaixo do campo. Total R$ 5,00 (sem linha "Margem estimada").
3. Adicionar → finalizar em pix.
4. Esperado: `Venda.payload.lines[0].custoUnitario` **não existe** (não gravado). Demais comportamentos iguais.

### 5.5 Cupom não fiscal

Quando o fluxo dispara o cupom (Venda Completa Enterprise), as linhas
avulsas aparecem normalmente — `<CupomNaoFiscal>` lê apenas `nome`/`quantidade`/
`precoUnitario`/`lineTotal`.

### 5.6 Retry/syncPending não duplica

1. Anotar o valor total agregado de `MovimentacaoFinanceira(origem:"venda")`.
2. DevTools → Application → Local Storage → editar a última entrada do
   `assistec-pro-ops-v1-{storeId}` → marcar `sales[…].syncPending = true`.
3. Aguardar ≤ 30 s (rede de segurança Goal 1).
4. Esperado:
   - `syncPending` volta a `false`.
   - **Nenhuma** nova `MovimentacaoFinanceira` é criada
     (guard `findFirst({referenciaId, origem:"venda", tipo:"entrada"})`).
   - **Nenhuma** `MovimentacaoEstoque` adicional (avulso continua pulando o ledger).

### 5.7 Cancelamento / devolução com avulso (defesa em profundidade)

1. Histórico de Vendas → cancelar a venda do passo 5.3.
2. Esperado:
   - `Venda.status = "cancelada"`.
   - Banner "Estorno financeiro registrado" (R$ 120,00 saída).
   - **Nenhuma** tentativa de reposição de estoque para o avulso (ele não estava lá).
3. Em uma venda com mix (produto cadastrado + avulso) — cancelar repõe **apenas** o produto cadastrado; estorno financeiro pelo valor total. Idem para devolução parcial.

## 6. Idempotência confirmada

| Operação | Cenário | Resultado |
|---|---|---|
| `Venda` upsert | Retry com mesmo `pedidoId` | ✅ Mesmos itens recriados (`deleteMany` + `create` em `ItemVenda`) |
| `ItemVenda` com avulso | Retry | ✅ Recriado com o mesmo `inventoryId = __avulso__...` |
| `MovimentacaoEstoque` PDV | Retry de venda com avulso | ✅ Continua **bloqueado** para produtos cadastrados; avulso nunca cria (pulado por `isVirtualSaleLine`) |
| `MovimentacaoFinanceira` PDV | Retry | ✅ Bloqueado por `findFirst({storeId, referenciaId=pedidoId, origem:"venda", tipo:"entrada"})` |
| Rede de segurança Goal 1 (online/visibilitychange/30s) | Venda avulsa offline | ✅ Reenviada idempotente — sem duplicação |

## 7. Riscos / pendências (NÃO corrigidos — fora do escopo cirúrgico)

| Risco / pendência | Severidade | Decisão |
|---|---|---|
| **PDV Assistência** (`pdv-assistencia-enterprise.tsx`) — INSERT/modal | ✅ Resolvido | Inicialmente adiado por causa do WIP de desconto/PIN. Após esse WIP ser commitado (HEAD `b406c1d`), o mesmo padrão foi aplicado: import dos helpers + `ItemAvulsoModal`, `CartLine` ganha `isAvulso?`/`custoUnitario?`, estado `showItemAvulsoModal`, `case "Insert"` no switch de teclado (com guard `anyModalOpen`), `<ItemAvulsoModal>` no JSX e mapping de `lines` propagando `isAvulso`/`custoUnitario`. Os **3 PDVs operacionais** (Clássico, Assistência, Supermercado) têm Item Avulso. `tsc`/`build` OK. |
| **PDV Black Edition** (`/dashboard/pdv-next`) | Crítico (pré-existente) | Fora de escopo — Goal 1 já documentou que `pdv-next` não persiste vendas. Item avulso lá teria o mesmo problema. **Não usar para operação real.** |
| **Custo desconhecido em relatórios** | Média | Quando o operador não informa o custo, `custoUnitario` fica `undefined`. Relatórios de margem precisam distinguir "custo zero" de "custo desconhecido" — hoje **não há esse tratamento** porque não foi pedido. Risco: gráficos de DRE poderem mostrar 100% de margem em avulso sem custo. Mitigação atual: o `<ItemAvulsoModal>` mostra um copy explicando o comportamento; o relatório futuro de margem deve filtrar `lines` com `custoUnitario === undefined` ou tratá-las separadamente. |
| **Venda por peso de item avulso** | Baixa | Quantidade do avulso é arredondada para inteiro (≥1) — `ItemVenda.quantidade` é `Int` no schema. Não há fluxo "0.5 kg de algo não cadastrado". Decisão consciente para não exigir migração. |
| **Crédito do cliente + avulso** | Baixa | O fluxo de `creditoVale` no `finalizeSaleTransaction` e o débito de `ClienteCredito` em `upsertVendaInTransaction` operam pelo **total** da venda — não distinguem item cadastrado de avulso. Funciona corretamente; só não há gating específico para avulso. |
| **Histórico mostra `__avulso__...` em algum lugar?** | Baixa | O detalhe da venda (`GET /api/vendas/[id]`) devolve `itens` direto do banco; o componente exibe `it.nome` (descrição livre que o operador digitou) — o `inventoryId` virtual fica oculto na UI por design. Auditoria por banco mostra o prefixo (útil para BI). |

## 8. Escopo

Confirmado: nenhuma área protegida tocada — auth, `proxy.ts`, sidebar,
`prisma/schema.prisma`, `lib/financeiro/contracts/local-key.ts`,
`lib/financeiro/adapters/os-faturamento.ts`, `AppShell.tsx`, `lib/prisma.ts`,
`next.config.mjs` — todos intocados. Multi-loja (`storeId`) preservado em todas
as escritas via as Server Actions/routes já validadas (Goals 1–4). Design
system e tokens semânticos preservados (cores via `bg-card`/`text-muted-foreground`/
`text-primary` — sem hardcode). Nenhuma migração Prisma.

## 9. Documentação

- Este relatório: `docs/ai/PDV_ITEM_AVULSO_INSERT_GOAL_REPORT.md` (NOVO).
- `docs/ai/CURRENT_STATUS.md`: adicionada entrada curta sobre o goal abaixo da
  seção do Estoque HUB (mudança relevante de estado — feature nova entregue).
- `CHANGELOG.md` / `MASTER_CONTEXT.md`: sem mudança de contrato/arquitetura —
  não alterados.
