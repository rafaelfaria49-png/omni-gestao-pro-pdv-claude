# AUDITORIA — Produto: variações, unidades, venda fracionada e descrição comercial · 001

**GOAL:** CADASTROS-V2-PRODUTO-VARIACOES-UNIDADES-AUDIT-001
**Modo:** READ-ONLY (nenhum arquivo de código alterado; sem commit; sem push)
**Data:** 2026-07-10
**Branch de leitura:** `recover/cosmos-auth-diag-011-on-current-main`

---

## 1. Resumo executivo

O OmniGestão Pro hoje só conhece **produto simples, unitário e inteiro**: 1 linha em
`Produto` = 1 SKU = 1 saldo `Int`. Não existe unidade de venda operacional, quantidade
decimal, tipo de produto, variação nem produto pai — **nem em coluna, nem em metadata**.

Três descobertas centrais:

1. **A UI de peso/balança do PDV Supermercado está completa porém morta.** O carrinho
   aceita quantidade fracionada em kg, lê balança USB real (Web Serial) e valida estoque —
   mas a flag `vendaPorPeso` nunca chega do servidor (`rowToItem` em
   `app/api/ops/inventory/route.ts` não a emite) e, se chegasse, o motor server-side
   **arredondaria a quantidade para inteiro** (`Math.round` em `lib/ops-upsert-venda.ts:356,416`),
   corrompendo a venda (0,35 kg → qty 0 → sem baixa de estoque, item gravado com quantidade 0).
2. **Quantidade é `Int` em toda a cadeia operacional** — `Produto.stock`,
   `ItemVenda.quantidade`, `MovimentacaoEstoque.quantidade/estoqueAntes/estoqueDepois`,
   `OrdemServicoItem.quantidade`, `ProdutoDeposito.quantidade`. A única exceção é o
   snapshot fiscal (`NotaFiscalItem.quantidade Float` + `unidadeComercial "UN"`), que já
   nasceu pronto para fração.
3. **Descrição comercial já existe, mas é um beco sem saída.** Cadastros V2 persiste
   `metadata.atributos.descricao` (+ tags + modeloCompativel) e faz read-back no próprio
   modal — **nenhum outro consumidor lê** (PDV, OS, NF, marketplace, WhatsApp). O Estoque
   HUB tem um segundo campo, `descricaoVenda` (preenchido por IA visão/voz), que é
   **descartado no save** (não entra no payload de `/api/produtos`).

Implementar variação "por cima" do schema atual (em metadata/JSON) é **inseguro**: quebra
a baixa atômica anti-negativo, a idempotência do ledger e a rastreabilidade de
venda/correção/inventário. O caminho seguro é **variação como produto filho** (colunas
aditivas `produtoPaiId`/`tipoProduto`/`atributosVariacao`), que reaproveita 100% do motor
existente.

---

## 2. Arquivos analisados

| Arquivo | Papel |
|---|---|
| `prisma/schema.prisma` | `Produto` (740-782), `OrdemServicoItem` (715-738), `MovimentacaoEstoque` (790-829), `Deposito`/`ProdutoDeposito` (839-882), `ItemVenda` (1426-1438), `Servico` (1040+), `NotaFiscalItem` (2425-2460) |
| `app/actions/cadastros.ts` | `upsertProduto` (1550-1667), `lookupProdutoPorBarcodeLocal` |
| `lib/cadastros/produto-upsert-metadata.ts` (+ test) | merge 2 níveis de metadata, `produtoStockPatch` (trunca Int), tags |
| `components/cadastros/lovable/components/cadastros/produto-ia.tsx` | modal Cadastros V2 — save (1053-1094), read-back (361-375), campo Descrição (911-912) |
| `components/dashboard/estoque/gestao-produtos.tsx` | form Estoque HUB — payload REST (730-762), campo `descricaoVenda` (2186+) |
| `lib/merge-cadastro-relampago.ts` | slice de form IA (visão/voz) — `descricaoVenda` só em memória |
| `app/api/produtos/route.ts` + `[id]/route.ts` | REST create/patch — metadata passthrough (replace) + merges fiscal/catálogo |
| `app/api/ops/inventory/route.ts` | catálogo do PDV — `rowToItem` (77-101) |
| `lib/pdv-catalog.ts` | merge catálogo client — tipos `vendaPorPeso`/`atributos` |
| `lib/operations-store.tsx` | `ProdutoAtributoDef` (23-27), `InventoryItem` (43-51), `finalizeSaleTransaction` (1275+) |
| `components/dashboard/vendas/pdv-supermercado.tsx` | peso/balança (546-607), atributos, finalize (1344) |
| `components/dashboard/vendas/pdv-classic.tsx` | add-to-cart unitário (qty Int, step 1) |
| `lib/ops-upsert-venda.ts` | motor server da venda — itens (352-398), baixa (400-497) |
| `lib/operacoes/adapters/os-estoque.ts` | consumo/estorno de peça por OS (258-267, 362-367, 512-549) |
| `lib/produto-fiscal.ts` | contrato `metadata.fiscal` — inclui `unidadeComercial`/`unidadeTributavel` |
| `docs/audits/CADASTROS_V2_PRODUTO_UPSERTPRODUTO_PARITY_AUDIT_001.md` | cross-ref (parcialmente desatualizada — ver §3.2) |

---

## 3. Estado atual

### 3.1 Schema Prisma — `Produto` (`estoque_produtos`)

Colunas reais: `id`, `storeId`, `sku String?`, `barcode String?`, `name`, `brand`,
`supplierName`, **`stock Int`**, `precoCusto Float`, `price Float`, `category?`,
`warrantyDays Int`, `status String`, `active Boolean`, `metadata Json?`, timestamps.
Uniques: `(storeId, sku)` e `(storeId, barcode)`.

**Não existem**: `unidade`, `quantidadeDecimal`, `tipoProduto`, `produtoPaiId`,
variação/grade, `description`. Serviço é model separado (`Servico`) sem relação com
`Produto`; no PDV, serviço vira linha virtual `__avulso__svc-*` (não toca estoque).

### 3.2 Metadata em uso no cadastro (namespaces reais)

| Namespace | Conteúdo | Escritor | Leitor |
|---|---|---|---|
| `metadata.fiscal` | NCM/CEST/CFOP/CST/CSOSN/origem/**uCom/uTrib**/ANP/exTIPI | Cadastros V2, Estoque HUB, importador | `getProdutoFiscal()` (fonte única) → snapshot fiscal, inventory API |
| `metadata.catalogoAparelhos` | vínculo modelo de aparelho | ambos os forms | telas de compatibilidade, busca películas |
| `metadata.atributos` | `{ descricao, tags[], modeloCompativel }` | **só Cadastros V2** (`produto-ia.tsx:1073-1077`) | **só o próprio modal** (read-back) |
| `metadata.cadastroIa` | `{ phase, savedAt, source }` | Cadastros V2 | ninguém |
| `metadata.barcodeLookup` | auditoria lookup Cosmos/UPCitemdb | Cadastros V2 | ninguém |
| `metadata.codigosAlias` | EANs alternativos | inventário | lookup de bipagem |
| `metadata.cadastroFiscalPendente` | flag cadastro rápido | inventário | saneamento |

Merge: `upsertProduto` usa `mergeProdutoMetadataTwoLevels` (2 níveis, `null` = omissão —
à prova de wipe). **REST PATCH `/api/produtos/[id]` com `metadata` cru é REPLACE integral**
(`[id]/route.ts:142-150`) — só fiscal/catálogo têm merge não-destrutivo dedicado.

Nota: a auditoria de paridade 001 (09/07) afirmava ausência de checagem de duplicidade e
campos mortos (Descrição/Tags) no `upsertProduto` — **no código atual isso já foi
corrigido** (pré-check + P2002 + `metadata.atributos` persistido). Permanece válido o
alerta sobre caminhos divergentes Estoque HUB × Cadastros V2.

### 3.3 PDV → carrinho

- Catálogo 100% server-driven: `GET /api/ops/inventory` → `rowToItem` emite
  `id (sku||cuid)`, `dbId`, `name`, `sku`, `barcode`, `stock`, `cost`, `price`,
  `category`, `fiscal`. **Não emite `vendaPorPeso`, `precoPorKg` nem `atributos`** —
  os campos existem nos tipos (`InvPayload`, `InventoryItem`, `PdvCatalogProduct`) mas
  nunca são populados do banco (resquício do catálogo mock removido).
- Add-to-cart (Clássico e demais): quantidade default 1, incremento inteiro,
  `Math.max(1, Math.round(...))` no item avulso; anti-oversell client-side
  (`stock < qty` bloqueia com epsilon).
- `finalizeSaleTransaction` (`operations-store.tsx:1275`) é otimista/local: valida caixa
  aberto, qty > 0, estoque local; decrementa estoque **local**; em seguida a venda é
  enviada a `POST /api/ops/venda-persist`.

### 3.4 Baixa de estoque (server, fonte da verdade)

`lib/ops-upsert-venda.ts` (chamado por `venda-persist`):
1. `ItemVenda.quantidade = Math.round(qty)` clampado 0..2e9 (**Int**).
2. Resolve produto por `OR [id | sku | barcode]`; físico não resolvido →
   `UnresolvedProductError` (409, aborta tudo) quando `enforceStock`.
3. Agrega qty por produto (`Math.round`; **qty 0 é pulada**).
4. Baixa atômica anti-negativo: `updateMany({ where: { stock: { gte: qty } }, data: { stock: { decrement: qty } } })`;
   `count === 0` → `InsufficientStockError` → rollback da transação inteira.
5. Ledger `MovimentacaoEstoque` origem `"pdv"`, quantidade `-qty` (Int).

OS: `lib/operacoes/adapters/os-estoque.ts` faz decrement/increment com
`quantidade` Int e ledger origem `"os"`. Linhas virtuais (`__avulso__*`, serviço) nunca
tocam estoque em nenhum dos caminhos.

### 3.5 PDV Supermercado — peso/balança (dormente)

UI completa em `pdv-supermercado.tsx`: input de peso em kg (3 casas), leitura real de
balança USB via Web Serial (`services/hardware-bridge.ts` → `waitForStableWeightKg`),
linha de carrinho com `quantity` fracionada e nome sufixado (`"— 0.350 kg"`), step 0,05,
validação `kg > stock + 0.0001`, preço por kg (`precoPorKg ?? price`). Há ainda seleção
de **atributos por linha** (`ProdutoAtributoDef { id, nome, opcoes[] }` — tamanho/cor/sabor),
que vira apenas rótulo no nome da linha (sem SKU/estoque próprios).

**Tudo isso é inalcançável em produção**: nenhum produto real chega com `vendaPorPeso`
ou `atributos` (§3.3). E o funil server-side é inteiro-only (§3.4).

### 3.6 O que já existe vs não existe

| Conceito | Existe? | Onde |
|---|---|---|
| Unidade de medida | **Só fiscal, dormente** | `metadata.fiscal.unidadeComercial/unidadeTributavel` (`produto-fiscal.ts`); `NotaFiscalItem.unidadeComercial` default `"UN"`. Nada operacional/PDV. |
| Quantidade decimal | **Não** (operacional) | Única coluna decimal: `NotaFiscalItem.quantidade Float` (fiscal). |
| `tipoProduto` | **Não** | Serviço = model `Servico` separado + linha virtual no PDV. |
| Variações / `produtoPai` | **Não** no schema | Tipos client dormentes (`ProdutoAtributoDef`) — rótulo de carrinho, não variação real. |
| Descrição comercial | **Parcial** | `metadata.atributos.descricao` (Cadastros V2, sem consumidores); `descricaoVenda` do Estoque HUB **não persiste**. |
| Peso/balança | **UI pronta, dado morto** | §3.5. |

---

## 4. Gaps

1. **Sem unidade de venda operacional** — tudo é implicitamente "UN"; impressos, PDV e
   relatórios não sabem dizer kg/m/L.
2. **Quantidade fracionada impossível** — 6 pontos Int + 2 `Math.round` no motor.
3. **Sem variação/grade** — cadastrar "Capa X Preta" e "Capa X Azul" hoje = 2 produtos
   sem nenhum vínculo; relatórios e estoque não agregam por família.
4. **Descrição comercial fragmentada** — dois campos (um sem leitor, outro sem persistência);
   IA de visão/voz gera descrição que é jogada fora no Estoque HUB.
5. **`vendaPorPeso`/`atributos` são tipos fantasma** — sugerem capacidade que não existe;
   risco de alguém "ligar" sem mexer no motor (ver risco R1).
6. **PATCH REST com `metadata` cru substitui o JSON inteiro** — qualquer feature nova que
   escreva metadata por REST sem helper de merge pode apagar namespaces alheios.

---

## 5. Riscos de implementar variação SEM schema novo (em metadata/JSON)

- **R1 · Corrupção silenciosa de venda fracionada**: se `vendaPorPeso` for populado sem
  reformar o motor, `Math.round` transforma 0,35 kg em qty 0 → venda gravada com item de
  quantidade 0, **sem baixa de estoque**, financeiro correto e ledger vazio (divergência
  auditável só a posteriori).
- **R2 · Oversell por variação**: estoque por variação dentro de `metadata` (JSONB) não
  tem decrement condicional atômico (`updateMany where stock >= qty` só funciona na coluna
  Int). Duas vendas paralelas da mesma variação passariam ambas.
- **R3 · Perda de rastro**: `ItemVenda` só tem `inventoryId + nome`; variação embutida no
  nome (como o `atributosLabel` faz) quebra correção de venda, devolução/troca e conciliação
  de inventário — todos operam por `inventoryId`/produto.
- **R4 · Ledger e inventário cegos**: `MovimentacaoEstoque` e Inventário Assistido contam
  por produto; variação em JSON ficaria fora da trilha auditável (viola o padrão append-only
  do projeto).
- **R5 · Uniques e fiscal**: `(storeId, barcode)` exige EAN distinto por variação (na
  prática cada cor/tamanho TEM GTIN próprio) — em JSON não há unique; colisões só
  explodiriam na venda. NF exige GTIN/descrição por item vendido.
- **R6 · Marketplace**: `MarketplaceListing/ProductLink` apontam para `Produto.id`;
  variação sem identidade própria inviabiliza o mapeamento de anúncios com grade.
- **R7 · Merge de metadata**: gravação concorrente (Cadastros V2 merge 2 níveis × REST
  replace integral) poderia perder o array de variações inteiro.

**Conclusão**: variação exige identidade de linha própria no banco. Metadata serve para
*atributos descritivos*, nunca para *saldo*.

---

## 6. Proposta de modelo (arquitetura alvo)

Princípio: **variação É um Produto** (padrão "produto filho flat"), para que baixa atômica,
ledger, ItemVenda, fiscal, inventário e marketplace funcionem sem reforma do motor.

```prisma
model Produto {
  // ... colunas atuais intactas ...
  /** "simples" (default) | "pai" | "variacao" — aditivo, sem migração de dados. */
  tipoProduto       String    @default("simples")
  /** Self-relation: variação aponta para o agregador. Pai não é vendável. */
  produtoPaiId      String?
  produtoPai        Produto?  @relation("ProdutoVariacoes", fields: [produtoPaiId], references: [id], onDelete: Restrict)
  variacoes         Produto[] @relation("ProdutoVariacoes")
  /** Eixos da variação, ex.: { "cor": "Preto", "tamanho": "M" }. Descritivo, nunca saldo. */
  atributosVariacao Json?
  /** Unidade de venda operacional: "UN" | "KG" | "M" | "L" | ... (espelha uCom fiscal). */
  unidade           String    @default("UN")
  /** Habilita quantidade fracionada no PDV (exige GOAL de venda fracionada concluído). */
  vendaFracionada   Boolean   @default(false)
}
```

- **Produto simples**: nada muda (`tipoProduto = "simples"`, default de todas as linhas atuais).
- **Produto com variações**: pai = agregador com `stock` ignorado/derivado e **bloqueado
  para venda** (guard no motor: vender `tipoProduto === "pai"` → erro); cada variação tem
  `sku`/`barcode`/`stock`/`price` próprios. PDV lista os filhos (ou abre seletor a partir do pai).
- **Unidade de medida**: coluna `unidade` operacional + espelho em `metadata.fiscal.unidadeComercial`
  (leitura canônica continua `getProdutoFiscal`). PDV/impressos exibem "R$ 39,90/kg".
- **Venda fracionada** — duas opções, decisão via ADR:
  - **(A) Milésimos (recomendada)**: quantidade continua `Int` em TODA a cadeia, mas
    produtos `vendaFracionada` armazenam em milésimos (0,350 kg = 350). Mantém a baixa
    atômica `updateMany` intacta, zero migração de tipo, sem drift de float; UI e
    impressão convertem (÷1000). `NotaFiscalItem.quantidade Float` já comporta a conversão.
  - **(B) Migrar `Int → Decimal`** em `Produto.stock`, `ItemVenda`, `MovimentacaoEstoque`,
    `OrdemServicoItem`, `ProdutoDeposito`: mais "puro", porém migração pesada em 5+ models
    core, com risco em produção — só com autorização explícita e janela de migração.
  - Em ambas: remover os `Math.round` de `ops-upsert-venda.ts:356/416` **atrás da flag**
    `vendaFracionada` (produto unitário continua arredondando — proteção atual preservada).
- **Descrição comercial / IA**: canonizar leitura/escrita num helper único
  (`lib/produto-comercial.ts`, mesmo padrão do `produto-fiscal.ts`) sobre
  `metadata.atributos.descricao` (já persistido — não migrar à toa); religar o
  `descricaoVenda` do Estoque HUB para persistir nesse mesmo lugar (via merge helper,
  nunca metadata cru no PATCH); depois plugar consumidores (busca PDV, marketplace,
  WhatsApp IA, impressos).

---

## 7. Recomendação de fases seguras (próximos GOALs)

| # | GOAL sugerido | Toca schema? | Conteúdo |
|---|---|---|---|
| 1 | `PRODUTO-DESCRICAO-COMERCIAL-CANONICA-001` | Não | Helper `getProdutoComercial()` + persistir `descricaoVenda` do Estoque HUB em `metadata.atributos` (merge) + read-back nos dois forms. Risco ~zero. |
| 2 | `PRODUTO-UNIDADE-EXIBICAO-002` | Não | `metadata.fiscal.unidadeComercial` editável nos forms + badge de unidade no PDV/impressos (exibição apenas; qty segue Int). |
| 3 | `PRODUTO-VARIACAO-SCHEMA-003` | **Sim (aditivo)** — exige autorização explícita + ADR | Colunas `tipoProduto`/`produtoPaiId`/`atributosVariacao` + guard "pai não vende" no motor + testes de guard multi-loja. |
| 4 | `CADASTROS-V2-VARIACOES-UI-004` | Não | Gerador de variações no modal (matriz de eixos → cria filhos com SKU/EAN próprios, herda fiscal/categoria/marca). |
| 5 | `PDV-VARIACAO-SELETOR-005` | Não | PDV lista/seleciona variações (filhos); motor intocado — variação já é Produto. |
| 6 | `PDV-VENDA-FRACIONADA-006` | Depende do ADR (A: não / B: sim) | ADR milésimos vs Decimal; reforma dos `Math.round` atrás de `vendaFracionada`; ativar `vendaPorPeso`/`precoPorKg` no `rowToItem`; religar a UI de peso do Supermercado (já pronta) + balança (`hardware-bridge` já pronto). |

Ordem importa: 1–2 destravam valor imediato sem risco; 3 é o gate de governança
(CORE_RULES: `prisma/schema.prisma` só com autorização explícita); 6 é o único que mexe
no motor de venda e deve ser o último.

---

## 8. Observações finais

- Nenhum arquivo existente foi alterado; nenhum commit; nenhum push. Este relatório é o
  único artefato novo.
- `docs/audits/CADASTROS_V2_PRODUTO_UPSERTPRODUTO_PARITY_AUDIT_001.md` está parcialmente
  desatualizada frente ao código atual (duplicidade e persistência de descrição/tags já
  corrigidas) — vale revisar/anotar antes de usá-la como base de decisão.
