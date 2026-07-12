# AUDITORIA — PDV-ACESSORIOS-SELECAO-PERSISTENCIA-AUDIT-004

- **Data:** 2026-07-11
- **Modo:** auditoria arquitetural read-only (nenhum código alterado, nenhum schema tocado, nenhuma migration criada)
- **Base:** `origin/work/pdv-acessorios-seletor-modelo-cor-003` @ `738af36` (`feat(pdv): selecionar modelo e cor de acessorios`) — hash idêntico ao esperado pelo GOAL
- **Worktree:** `C:\Projetos\omni-gestao-pdv-acessorios-persistencia-audit-004` · branch `audit/pdv-acessorios-persistencia-004`
- **Pergunta central:** como persistir `accessorySelection` (modelo/cor) de forma **estruturada** do carrinho até o banco, sem quebrar estoque, fiscal, offline e idempotência.

---

## 1. Estado atual do client (contrato do GOAL 003)

### 1.1 `AccessorySelectionV1` (`lib/acessorios/types.ts:16-24`)

```ts
type AccessorySelectionV1 = Readonly<{
  version: 1
  deviceModelKey?: string      // máx 160 chars (ACCESSORY_SELECTION_TEXT_LIMITS)
  deviceBrand?: string         // máx 80
  deviceModelName?: string     // máx 160
  colorKey?: AcessorioColorKey // enum canônico de lib/acessorios/cores.ts
  colorLabel?: string          // SEMPRE recomputado de colorKey pelo sanitizer (nunca confiado)
  customColorLabel?: string    // máx 80; só quando colorKey === "outra"
}>
```

O sanitizer canônico `sanitizeAccessorySelection` (`lib/acessorios/selection.ts:28-52`) é **puro e isomórfico** (sem dependência de browser): valida `version === 1`, trim + cap de tamanho, rejeita `colorKey` fora do enum, **ignora o `colorLabel` enviado** (recomputa via `resolveAcessorioColorLabel`) e só aceita `customColorLabel` com `colorKey === "outra"`. Já está pronto para reuso server-side.

### 1.2 `cartLineKey` (`lib/acessorios/selection.ts:123-131`)

```ts
buildAccessoryConsolidationKey(inventoryId, selection)
// = JSON.stringify([inventoryId, deviceModelKey ?? "", colorKey ?? "", customColorNormalizada])
```

Chave **determinística e recomputável** a partir de (`inventoryId`, seleção saneada). Existe só para agrupar linhas iguais no carrinho (`sameAccessoryCartLine`) e nunca é id de estoque (documentado em `lib/acessorios/cart-line.ts:41-48`).

### 1.3 Onde os campos vivem na linha do carrinho

| PDV | Tipo da linha | Campos |
|---|---|---|
| Clássico (`pdv-classic.tsx:160-167`) | `CartItem` | `accessorySelection?`, `cartLineKey?` |
| Supermercado (`pdv-supermercado.tsx:161-167`) | `CartItem` | idem |
| Assistência (`pdv-assistencia-enterprise.tsx:211-217`) | `CartLine` | idem |
| Venda em Espera (`lib/pdv-hold.ts:33-36`) | `HeldCartItem` | idem (F7 preserva) |

Nos 3 PDVs a linha de acessório entra com `name = lineDescription` (ex.: `Capinha silicone — Samsung Galaxy A06 — Preto`), `accessorySelection = line.selection` e `cartLineKey`. A Assistência também persiste o carrinho inteiro em `localStorage` (`CART_STORAGE_KEY`, `pdv-assistencia-enterprise.tsx:1220-1324`) — JSON round-trip preserva os campos.

### 1.4 Quais PDVs preservam / o que chega à finalização

Os 3 PDVs preservam os campos **até o carrinho e até a espera (F7)**. Na finalização, **nenhum PDV repassa** `accessorySelection`/`cartLineKey` (ver §3). Somente o `name` expandido sobrevive.

---

## 2. Payload atual (carrinho → venda → servidor)

Cadeia real:

```
Carrinho (com accessorySelection + cartLineKey)
  → map "saleLines" do PDV                      ← DESCARTE nº 1
  → finalizeSaleTransaction (operations-store)  ← DESCARTE nº 2 (tipo + re-map)
  → SaleRecord.lines (SaleLineRecord)           ← já sem os campos
  → POST /api/ops/venda-persist { sale }        ← body não contém os campos
  → upsertVendaInTransaction                    ← Venda.payload = sale verbatim; ItemVenda 6 colunas
```

### Respostas diretas do PASSO 4

1. **`accessorySelection` chega ao POST?** **Não.** É descartada antes, no client.
2. **Onde é descartada?** Em **duas camadas client**, ambas antes da rede:
   - *Descarte nº 1* — o map `saleLines` de cada PDV constrói objeto novo sem os campos: `pdv-classic.tsx:1860-1875`, `pdv-supermercado.tsx:1388-1397`, `pdv-assistencia-enterprise.tsx:1890-1897`.
   - *Descarte nº 2* — o contrato de `finalizeSaleTransaction` (`lib/operations-store.tsx:275-302`) não aceita os campos, e o map interno (`lib/operations-store.tsx:1389-1421`) recria cada linha com o shape fixo de `SaleLineRecord` (`lib/operations-sale-types.ts:22-41`): `inventoryId, name, quantity, unitPrice, lineTotal, qtyReturned, isAvulso?, custoUnitario?`.
3. **`cartLineKey` chega ao servidor?** **Não** (mesmos descartes).
4. **O `name` expandido é persistido?** **Sim.** Carrinho grava `name = lineDescription`; PDVs passam `name`; `finalizeSaleTransaction` usa `ln.name ?? item.name`; o servidor grava `ItemVenda.nome = line.name` e `Venda.payload.lines[].name`.
5. **O servidor recompõe/substitui o nome?** **Não.** `ops-upsert-venda.ts:354` usa o `line.name` como veio. A resolução de produto (id|sku|barcode, `:365-386`) só troca o `inventoryId` gravado pelo cuid real e alimenta o ledger — o nome fica o enviado.
6. **Campos aceitos vs ignorados:** o tipo `SalePayload` (`lib/ops-upsert-venda.ts:118-171`) declara `sale{id, at, total, customerName, customerCpf, clienteId, cashierId, sessaoId, terminalId, paymentBreakdown, aPrazoConfig, lines[...]}`. **Importante:** tipos TS não removem nada em runtime — `Venda.payload = asJsonPayload(sale)` grava o body **verbatim** (`:173-175, :313-336`). Ou seja: propriedades extras enviadas em `sale.lines[]` seriam persistidas no JSONB **hoje, sem mudança de servidor** — apenas ignoradas pela lógica. Não há sanitização runtime do payload (fato que a proposta do §12 corrige).

---

## 3. Campos descartados

| Campo | Descarte | Arquivo:linha |
|---|---|---|
| `accessorySelection` | client, map saleLines + finalize | `pdv-*.tsx` (§2.2) e `operations-store.tsx:1389-1421` |
| `cartLineKey` | idem | idem |
| `atributosLabel`, `lineDetail`, `codigoAvulso`, `discountPct`, `detail` | idem (precedente: outros metadados de linha também não viajam) | idem |

---

## 4. Schema atual (somente leitura de `prisma/schema.prisma`)

### 4.1 `ItemVenda` (`schema.prisma:1426-1438`, tabela `venda_itens`)

```prisma
model ItemVenda {
  id            String  @id @default(cuid())
  vendaId       String
  inventoryId   String?      // cuid real do Produto (resolvido) ou id virtual/sku legado
  nome          String       // ← hoje carrega a descrição expandida
  quantidade    Int
  precoUnitario Float
  lineTotal     Float
  @@index([vendaId])
}
```

- **`ItemVenda` NÃO possui `metadata` Json.** Nenhum campo livre além de `nome`.
- Recriado a cada re-sync: `deleteMany + create` (`ops-upsert-venda.ts:341, :388-398`) — qualquer coluna nova precisa ser repopulada a partir do payload de entrada em todo upsert.

### 4.2 `Venda` (`schema.prisma:1369-1424`)

- **`payload Json? @db.JsonB`** — "Snapshot JSON da venda ... para recuperação fiel". Guarda o `SalePayload` inteiro, **incluindo `lines[]`**.
- **Precedente direto:** metadados por item (IMEI/serial/lote/garantia/observação — F4) já vivem em **`Venda.payload.lines[i].metadata`**, casados **por posição** com `ItemVenda` (`app/api/vendas/[id]/route.ts:259-276`; escrita em `corrigir-item-meta/route.ts:110-134`).

### 4.3 Demais modelos

- `MovimentacaoEstoque` (`:790-829`): ledger por **produto agregado** (`documento = pedidoId`, `produtoId`), com snapshot `produtoNome`/`produtoSku`. Não conhece linha de venda — correto assim.
- `DevolucaoVenda` (`:1449-1477`) + `ItemDevolucaoVenda` (`:1479-1491`): itens de devolução têm `inventoryId?, nome, quantidade, valorUnitario, valorTotal` — sem metadata; `DevolucaoVenda.payload Json?` existe no cabeçalho.
- Não existe tabela genérica de "detalhe de item" reutilizável.

### Respostas diretas do PASSO 5

- `ItemVenda` possui metadata Json? **Não.**
- `Venda` possui payload que armazene seleção por linha? **Sim** — `Venda.payload.lines[]` (JSONB), com precedente F4 já lido pela API de detalhe.
- Tabela de detalhe reutilizável? **Não.**
- Campo textual seguro além do nome? **Não** por item (apenas `nome`).
- **Persistir só no nome é suficiente? Não.** Justificativa: (a) parsing do separador `" — "` é frágil — nomes de produto podem conter travessão e `customColorLabel` é texto livre; (b) perde `deviceModelKey`/`colorKey`, que são as chaves canônicas para BI, catálogo e agregação (o label do modelo pode mudar de grafia entre versões de seeds); (c) devolução/troca e relatórios não conseguem reagrupar por modelo/cor sem heurística; (d) impossível validar/corrigir a seleção a posteriori. O nome expandido é um excelente **fallback de exibição**, não um formato de dados.

---

## 5. Consumidores de `ItemVenda` / linhas da venda

| Fluxo | Arquivo | Como identifica o item | Precisa de modelo/cor estruturado? |
|---|---|---|---|
| Lista PDV (read-back) | `app/api/ops/vendas-list/route.ts:20-63` | **Preferência pelo `Venda.payload`**: se `payload.id === pedidoId` e `payload.lines[]` existe, devolve o payload inteiro como `SaleRecord`; senão reconstrói de `ItemVenda` | **Automático** — o que estiver em `payload.lines` volta ao PDV sem mudança de servidor |
| Detalhe da venda / Workspace | `app/api/vendas/[id]/route.ts:259-276` | `ItemVenda` por ordem + `payload.lines[i].metadata` **posicional** | Sim — expor `accessorySelection` ao lado da `metadata` F4 |
| Reimpressão/cupom não fiscal | `components/dashboard/vendas/cupom-nao-fiscal.tsx:99-102` | `itens[].nome` | Não obrigatório — nome expandido já imprime "Produto — Modelo — Cor" |
| Correção de itens (F2) | `app/api/vendas/[id]/corrigir-itens/route.ts` + `lib/vendas/correcao-itens-plan.ts` | Reconstrói `oldLines` de `ItemVenda` (`:124`); audita casando **por `inventoryId`** (`correcao-itens-plan.ts:197-213`); **reescreve `payload.lines` com shape fixo** (`route.ts:304-312`) | **Ponto crítico** — ver riscos §14: o rewrite descarta a `metadata` F4 hoje e descartaria `accessorySelection`; e o casamento por `inventoryId` colide com 2 linhas do mesmo produto |
| Correção de meta do item (F4) | `corrigir-item-meta/route.ts:110-134` | posicional (`itemIndex`); `{ ...base }` **preserva props extras** da linha | Compatível como está |
| Cancelamento | `app/api/vendas/[id]/cancelar/route.ts` | agrega por produto p/ repor estoque | Não |
| Devolução/troca | `app/api/ops/devolucao/route.ts:129-148` + `trocas-devolucao.tsx` | client escolhe linhas de `sale.lines` e envia `{inventoryId, nome, ...}`; estoque reposto por `inventoryId` | Desejável — hoje 2 linhas do mesmo produto (cores diferentes) são indistinguíveis exceto pelo nome; `ItemDevolucaoVenda.nome` herda o expandido |
| Fechamento de caixa | `app/api/ops/caixa/sessao-detalhe/route.ts` | totais/`MovimentacaoFinanceira` — não usa itens | Não |
| Relatórios (dashboard elite) | `app/api/dashboard/elite/route.ts:147` | `prisma.itemVenda.findMany` + resolução de Produto por `inventoryId` | Futuro (BI por modelo/cor) — motiva a Fase F |
| Fiscal (dormente) | `lib/fiscal/venda-fiscal-snapshot-service.ts:141-181` | `ItemVenda` + Produto por id\|sku\|barcode; `descricao = it.nome \|\| prod.name` | **Não deve** consumir metadata estruturada (ver §8) |
| Financeiro / CR | `lib/contas-receber-prisma-queries.ts`, títulos `pdv-aprazo-*` | por venda (`pedidoId`), nunca por item | Não |

---

## 6. Fluxo offline / sincronização

- **Persistência local:** `OperationsProvider` grava todo o estado (menos inventário/OS) em `localStorage` via `toPersistedRest` (`operations-store.tsx:461-472, :536`) — inclui `sales[]` completas com `syncPending`.
- **Retry:** `doRetrySyncSale` (`operations-store.tsx:904-949`) reenvia **o mesmo objeto `sale` integral** (`body: { sale }`) — inclusive o retroativo (`allowClosedOriginalSession`). Não há transformação do payload no reenvio.
- **Dedup/idempotência:** `Venda.upsert` por `pedidoId` único + guard de ledger (§7). Reenvio do mesmo `sale` é seguro.

### Respostas diretas do PASSO 7

- **`accessorySelection` sobreviveria a uma venda offline?** Hoje **não chega** ao `SaleRecord`. Porém, **assim que `SaleLineRecord` ganhar o campo**, a sobrevivência é automática: JSON round-trip do `localStorage` preserva propriedades, e o retry reenvia o objeto como está. Nenhuma mudança extra no fluxo offline é necessária.
- **Propriedades extras são preservadas ou descartadas?** Preservadas no armazenamento e no reenvio (não há re-map no retry).
- **O mesmo payload é reenviado?** Sim, byte a byte (exceto flag retroativa no body externo).
- **Versionar o payload?** Desnecessário no envelope: `AccessorySelectionV1` já carrega `version: 1` embutido, e o servidor deve tolerar ausência do campo (vendas antigas). Não versionar `SalePayload` inteiro.

---

## 7. Impacto no estoque

Confirmado — o desenho atual já é o correto e **nada muda com a persistência da seleção**:

- **Baixa pelo produto real:** `upsertVendaInTransaction` resolve cada `inventoryId` por `id|sku|barcode` (`:365-386`) e **agrega quantidades por produto** em `qtyByProdutoId` (`:404-419`) antes do ledger — 2 linhas "Preto" + "Azul" do mesmo produto geram **um único decremento** com a soma.
- **Idempotência:** guard `MovimentacaoEstoque.findFirst({documento: pedidoId, produtoId, origem: "pdv"})` (`:446-450`) bloqueia dupla baixa em retry.
- **Anti-negativo atômico:** `updateMany({ stock: { gte: qty } }, { decrement } )` (`:468-475`) + `InsufficientStockError` → 409.
- **Client anti-oversell agregado:** `sumCartQuantityByInventoryId` soma todas as linhas do produto (`cart-line.ts:102-110`); usado nos 3 PDVs antes de adicionar/confirmar.
- **`cartLineKey` nunca participa** de nada no servidor (não é enviado; e não deve ser): jamais usar como id de estoque.
- **Sem sobrescrita de linha:** `ItemVenda.create` por linha, sem unique por produto — linhas do mesmo produto coexistem.
- **`accessorySelection` NÃO deve entrar na regra anti-negativo** server-side: a agregação por produto já a ignora por construção. Manter assim.

**Riscos identificados:** nenhum risco novo de dupla baixa/produto não resolvido/quantidade duplicada introduzido pela persistência da seleção — desde que ela seja **dado passivo** (nunca chave de agregação nem de resolução).

---

## 8. Impacto fiscal

- **Identidade fiscal continua 100% do produto real:** o snapshot resolve `Produto` por id|sku|barcode e extrai NCM/CEST/CFOP/CST/CSOSN de `Produto.metadata.fiscal` via `getProdutoFiscal` (`venda-fiscal-snapshot-service.ts:141-167`). Modelo/cor **não criam** produto fiscal novo. ✔
- **Nome expandido → snapshot:** `descricao = str(it.nome) || str(prod?.name)` (`:172`) e o builder (`venda-fiscal-snapshot.ts:527`) **não trunca**. A NF-e/NFC-e limita `xProd` a **120 caracteres**; `produto(∞) + modelo(≤160) + cor(≤80)` pode exceder. Módulo fiscal está dormente (0 callers produtivos), então não há quebra hoje — mas a ativação (GOALs de emissão) deve **truncar/normalizar `xProd` na geração do XML** ou cap na montagem do snapshot. Registrar como pendência do trilho fiscal, **não** deste GOAL.
- **Nome cadastrado permanece disponível:** o snapshot também carrega `prod.name` (fallback) e `codigoProduto`/`gtin` do produto real; e `Produto.name` nunca é alterado pela venda. ✔
- **Metadata estruturada separada do contrato fiscal:** `SnapshotItemInput` não deve ganhar `accessorySelection`. A seleção é operacional; o fiscal só enxerga a descrição textual. ✔ (nenhuma mudança no módulo fiscal neste trilho)

---

## 9. Alternativas avaliadas

### OPÇÃO A — Somente nome expandido (estado atual)

- ✔ Já funciona; zero schema; cupom/reimpressão/devolução exibem corretamente.
- ✘ Não estruturado; parsing frágil (separador colide com nomes/labels livres); perde `deviceModelKey`/`colorKey`; BI/devolução dependem de heurística; irrecuperável para validação posterior.
- **Veredito:** aceitável **apenas como fallback de exibição e para o legado** (vendas já gravadas). Não é solução de persistência.

### OPÇÃO B — Metadata JSON por item

Duas variantes, com trade-offs distintos:

**B1 — `Venda.payload.lines[].accessorySelection` (JSONB existente, zero migration)**

- ✔ **Zero schema/migration** — `Venda.payload` já grava o `sale` verbatim; basta o client parar de descartar e o servidor sanear.
- ✔ Segue o **precedente F4** (metadata por linha no payload, leitura posicional já implementada em `/api/vendas/[id]`).
- ✔ Read-back para o PDV é **automático** (`vendas-list` prefere o payload — §5).
- ✔ Sobrevive offline/retry sem mudança (§6).
- ✔ Compatível com registros antigos: campo ausente = venda sem seleção.
- ✘ Não indexável para SQL/BI direto (JSONB path dentro de array).
- ✘ Casamento com `ItemVenda` é **posicional** (mesma fragilidade já aceita na F4).
- ✘ Exposto ao wipe do `corrigir-itens` (risco pré-existente, ver §14 — precisa de fix de qualquer forma).

**B2 — coluna `ItemVenda.metadata Json?` (migration aditiva)**

- ✔ Vínculo 1:1 robusto com o item (elimina o posicional); queryável com operadores JSONB; `INDEX GIN` possível depois.
- ✔ Migration puramente aditiva (coluna nullable) — compatível com registros antigos (null).
- ✘ Exige migration + `db:push`/migrate (schema é **área protegida** — precisa autorização explícita).
- ✘ `ItemVenda` é `deleteMany + create` a cada re-sync — a coluna precisa ser repopulada do payload de entrada em `upsertVendaInTransaction` (implementação simples, mas obrigatória).
- ✘ Duplicidade de fonte (payload + coluna) exige regra de precedência documentada.

### OPÇÃO C — Colunas específicas em `ItemVenda` (`deviceModelKey`, `deviceBrand`, `deviceModelName`, `accessoryColorKey`, `accessoryColorLabel`)

- ✔ Máxima ergonomia SQL.
- ✘ 5+ colunas esparsas (null para toda venda não-acessório — a maioria); polui um modelo core; qualquer evolução do contrato (ex.: `customColorLabel`, novos tipos) vira nova migration; contraria "sem overengineering". JSON com `version` já resolve evolução.
- **Veredito:** rejeitada. Só se justificaria com consultas SQL massivas por modelo/cor comprovadas — e mesmo então `metadata Json + GIN` cobre.

### OPÇÃO D — Tabela separada `ItemVendaAcessorioSelecao`

- ✘ Complexidade desnecessária para o MVP: join extra em todos os leitores, segunda escrita transacional, idempotência própria, zero benefício sobre B2 enquanto a cardinalidade é 0..1 por item.
- **Veredito:** rejeitada para o MVP. Reconsiderar apenas se a seleção virar N:1 por item (não há indício).

---

## 10. Recomendação arquitetural

**B1 primeiro (payload JSONB, zero migration), B2 depois somente se/quando BI ou devolução estruturada exigirem SQL.**

Racional:

1. O canal `Venda.payload.lines[]` **já existe, já é gravado verbatim, já tem read-back automático** (`vendas-list`) e precedente consolidado (F4 metadata). O custo de B1 é quase só *parar de descartar* no client + sanear no servidor.
2. Os consumidores que precisam da seleção hoje (histórico, detalhe, devolução assistida, reimpressão) leem o payload ou o `SaleRecord` — nenhum exige SQL por modelo/cor.
3. B2 continua disponível como evolução aditiva (Fase F), com backfill trivial a partir do payload (`payload.lines[i].accessorySelection` → `ItemVenda.metadata`), sem retrabalho do contrato.
4. A/C/D descartadas (§9).

## 11. Necessidade de schema/migration

- **MVP (B1): NENHUMA migration.** `prisma/schema.prisma` intocado.
- **Fase F (B2, opcional):** migration aditiva `ItemVenda.metadata Json? @db.JsonB` — só com autorização explícita (área protegida) e demanda real de BI/consultas SQL.

## 12. Contrato server-side proposto (não implementado)

### 12.1 Payload de entrada (extensão mínima do contrato real)

```ts
// lib/operations-sale-types.ts — SaleLineRecord ganha (opcional/aditivo):
accessorySelection?: AccessorySelectionV1

// lib/ops-upsert-venda.ts — SalePayload.lines[] espelha o campo.
// cartLineKey NÃO entra no contrato (ver §13).
```

### 12.2 Saneamento server-side (em `upsertVendaInTransaction`, antes do upsert do payload)

- Para cada `line.accessorySelection` presente: `sanitizeAccessorySelection(value)` (reuso direto de `lib/acessorios/selection.ts` — módulo puro, sem deps de browser).
  - Retornou `null` (inválido/versão desconhecida) → **descartar o campo, gravar warn** `[upsert-venda] accessory-selection-invalida {pedidoId, index}` e seguir. **Nunca rejeitar a venda** por seleção inválida: o dinheiro já foi recebido no PDV e o `name` expandido preserva a informação de exibição.
  - Retornou saneada → substituir o valor enviado pela versão saneada no `salePayloadForStorage` (labels recomputados; caps de 160/80/160/80 aplicados; `colorLabel` **nunca** confiado do client).
- Produto sem config de acessório (ou virtual/avulso): manter a seleção saneada se veio (dado passivo, inofensivo); opcionalmente warn. Não bloquear.
- **Não** validar contra `Produto.metadata.acessorios` de forma dura (config pode ter mudado entre a venda offline e o sync); no máximo validação *soft* com log.
- **Proibições:** `accessorySelection` nunca participa da resolução de produto, da agregação de estoque, do anti-negativo, do financeiro nem do fiscal.
- Sanitização deve ocorrer **também** no replay legado (`sync-legacy-vendas`) se a rota aceitar o campo — mesmo helper.

### 12.3 Fallback para registros antigos

- `payload.lines[i].accessorySelection` ausente → tratar como venda sem seleção (exibir só `nome`). Nenhum backfill necessário.

## 13. `cartLineKey`: persistir?

**Não persistir.** Veredito claro:

- É **derivável deterministicamente**: `buildAccessoryConsolidationKey(inventoryId, selection)` — qualquer consumidor que precise reagrupar pós-venda recomputa a partir da seleção persistida.
- Sua única função (merge de linhas iguais) termina no carrinho/espera. Persistir criaria uma segunda fonte de verdade que pode divergir da seleção (ex.: correção de item).
- Mantê-la fora do contrato server-side elimina qualquer tentação de usá-la como id de estoque.

## 14. Riscos e pontos de atenção

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | **`corrigir-itens` reescreve `payload.lines` com shape fixo** (`route.ts:304-312`) — hoje já **apaga a metadata F4** (IMEI/serial) e apagaria `accessorySelection` | **P1 (pré-existente)** | Fase D: o rewrite deve preservar campos extras da linha correspondente (padrão `{ ...base }` do `corrigir-item-meta`). Corrigir para F4 e acessórios juntos |
| R2 | Auditoria do `corrigir-itens` casa linhas **por `inventoryId`** (`correcao-itens-plan.ts:197-213`) — 2 linhas do mesmo produto (cores distintas) colidem no `Map` (audit impreciso; estoque OK pois agrega) | P2 (pré-existente) | Documentar; se a correção passar a editar linhas de acessório individualmente, casar por índice |
| R3 | Casamento posicional payload.lines × ItemVenda (herdado da F4) quebra se as ordens divergirem | P2 | `upsertVendaInTransaction` cria ItemVenda na ordem de `lines[]` — invariantes mantidas; B2 elimina de vez |
| R4 | `xProd` NF-e ≤ 120 chars vs nome expandido sem truncamento no snapshot fiscal | P2 (fiscal dormente) | Truncar na ativação fiscal (trilho fiscal, fora deste GOAL) |
| R5 | Payload JSONB cresce (~200 bytes/linha de acessório) | P3 | Irrelevante na prática; campos já capados |
| R6 | Cliente malicioso envia seleção forjada | P3 | Sanitizer server-side (§12.2); labels recomputados; dado é passivo (não move estoque/dinheiro) |

**Testes obrigatórios (para as fases de implementação):**

1. Unit: sanitização server-side (inválido → descarte+warn; válido → labels recomputados; caps).
2. Unit: `upsertVendaInTransaction` grava `payload.lines[].accessorySelection` saneada e `ItemVenda.nome` expandido; re-sync (retry do mesmo `sale`) é idempotente (sem dupla baixa, payload igual).
3. Unit: 2 linhas mesmo produto/cores distintas → 1 `MovimentacaoEstoque` agregada + 2 `ItemVenda`.
4. Unit: `corrigir-itens` preserva `accessorySelection` + metadata F4 após correção (fix R1).
5. Integração: venda offline → localStorage → retry → seleção presente no banco.
6. Read-back: `vendas-list` devolve `lines[].accessorySelection`; `/api/vendas/[id]` expõe por item.
7. Guard: `accessorySelection` ausente em vendas antigas não quebra nenhum leitor.

## 15. Plano de implementação por fases

| Fase | Escopo | Arquivos previstos | Migration? |
|---|---|---|---|
| **A — Contrato client (parar de descartar)** | `SaleLineRecord.accessorySelection?`; PDVs incluem o campo no map `saleLines`; `finalizeSaleTransaction` aceita e repassa | `lib/operations-sale-types.ts`, `lib/operations-store.tsx`, `components/dashboard/vendas/pdv-classic.tsx`, `pdv-supermercado.tsx`, `pdv-assistencia-enterprise.tsx` | Não |
| **B — Saneamento server-side** | `SalePayload.lines[].accessorySelection?` + sanitização via `sanitizeAccessorySelection` antes do upsert; warn em inválido | `lib/ops-upsert-venda.ts` (+ testes) | Não |
| **C — Read-back APIs** | `/api/vendas/[id]` expõe `accessorySelection` por item (posicional, ao lado da metadata F4); `vendas-list` já cobre o PDV | `app/api/vendas/[id]/route.ts` | Não |
| **D — Correção sem wipe (fix R1)** | `corrigir-itens` preserva props extras das linhas (accessorySelection + metadata F4) | `app/api/vendas/[id]/corrigir-itens/route.ts`, `lib/vendas/correcao-itens-plan.ts` | Não |
| **E — Cupom/recibo** | Nada obrigatório (nome expandido já flui); opcional: linha secundária estruturada no cupom/detalhe | `cupom-nao-fiscal.tsx` (opcional) | Não |
| **F — BI/SQL (opcional, sob demanda)** | Migration aditiva `ItemVenda.metadata Json?` + população no upsert + backfill do payload | `prisma/schema.prisma`, `lib/ops-upsert-venda.ts`, script de backfill | **Sim (aditiva, exige autorização)** |

**GOAL seguinte exato:** `PDV-ACESSORIOS-SELECAO-PERSISTENCIA-SERVER-004B` — Fases A+B+C (contrato client → saneamento server → read-back), sem schema. Depois: `PDV-ACESSORIOS-SELECAO-READBACK-004C` cobre a Fase D/E se 004B não absorver; `PDV-ACESSORIOS-SELECAO-PERSISTENCIA-SCHEMA-004A` fica **reservado e adiado** para a Fase F (só com demanda de BI e autorização de schema).

---

## Confirmações finais

- Arquivo criado: somente `docs/audits/PDV_ACESSORIOS_SELECAO_PERSISTENCIA_AUDIT_004.md`.
- Nenhum código de aplicação alterado (`app/*`, `components/*`, `lib/*`, `prisma/*`, `next.config.mjs`, `proxy.ts` intocados).
- Nenhuma migration criada. Nenhum commit. Nenhum push.
