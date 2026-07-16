# FISCAL — Auditoria de paridade fiscal do `upsertProduto` (GOAL-004)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-PRODUTO-UPSERT-PARITY-004-AUDIT` |
| Tipo | Auditoria estrutural read-only (nenhuma alteração de código/schema/testes) |
| Data | 2026-07-15 |
| Branch | `audit/fiscal-produto-upsert-parity-004` |
| Worktree | `C:/Projetos/wt-fiscal-produto-upsert-004-audit` |
| Base (`origin/main`) | `5b96df71a0b507c11785a043b49c6adb15ec26c8` |
| HEAD da worktree | `5b96df71a0b507c11785a043b49c6adb15ec26c8` (== base; sem WIP) |
| Modo banco | não consultado (auditoria de código + Git + docs) |
| Autorização | Executar auditoria, criar 1 relatório, commit/push só da branch de auditoria |

> **Aviso de proveniência.** Este relatório reflete o estado da `origin/main` em `5b96df7`
> (15/07/2026). Todos os hashes, caminhos e vereditos foram verificados por Git e leitura de
> código na worktree isolada. Nada foi implementado, corrigido ou mesclado.

---

## 1. Objetivo

Avaliar formalmente, **antes de qualquer implementação**, o GOAL nomeado
`FISCAL-PRODUTO-UPSERT-PARITY-004`: dar **paridade fiscal** ao caminho de cadastro de produto do
Cadastros V2 (`upsertProduto`), de modo que os campos fiscais do produto sejam **persistidos
canonicamente** — sem ativar emissão, sem tocar SEFAZ, sem alterar schema desnecessariamente e sem
duplicar trabalho já integrado.

Perguntas respondidas: (1) critério oficial; (2) estado de `upsertProduto`; (3) quais campos
fiscais existem; (4) quais são persistidos; (5) quais são descartados; (6) contratos canônicos;
(7) o que Cadastros V2 já cobre; (8) conflito com branches/commits; (9) menor implementação segura;
(10) necessidade de schema/migration; (11) gates e nível N afetados; (12) se pode iniciar agora.

---

## 2. Critério oficial do GOAL-004 (reconciliado)

Existe uma **colisão de numeração** que precisa ser explicitada — ela é a principal fonte de risco
de retrabalho:

| "GOAL-004" em qual sistema | Significado | Estado |
|---|---|---|
| **Tabela histórica reconciliada** (`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`, linhas 6–29) | GOAL 004 = "ST mínima do mix piloto, incluindo CSOSN 500" | **não iniciado** (F2, motor tributário) |
| **Tabela histórica reconciliada** — GOAL **002** | "Dar paridade fiscal ao `upsertProduto` do Cadastros V2, sem ativar emissão" · saída: **`metadata.fiscal` canônico e testes** | backlog de produto/cadastro |
| **Sequência de identificadores nomeados** (execução) | `...-XSD-...-002` (FECHADO), `...-C14N-...-003` (FECHADO), **`...-004` = próximo slot nomeado** | 004 "não iniciado" |
| **Rótulo em código** `GOAL_004` (commit `04ce54d`) | "Produto Fiscal Persist" — `lib/produto-fiscal.ts` + REST + importadores | **em `main`, parcial** |
| **Identificador do usuário** `FISCAL-PRODUTO-UPSERT-PARITY-004` | Paridade fiscal do `upsertProduto` | objeto desta auditoria |

**Reconciliação canônica:** o `FISCAL-PRODUTO-UPSERT-PARITY-004` do usuário é, por **objetivo**, o
mesmo trabalho descrito como **GOAL histórico 002 / P-04** ("paridade fiscal do `upsertProduto`",
saída `metadata.fiscal` canônico + testes). O número "004" corresponde ao **próximo slot nomeado**
(após XSD-002 e C14N-003). O rótulo `GOAL_004` já presente no código (commit `04ce54d`) é a
**implementação parcial** desse mesmo objetivo — feita para as portas REST/importadores, mas
**não** para a porta do Cadastros V2.

Fontes primárias (verificadas):

- `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md:9` — GOAL 002 = paridade `upsertProduto`,
  saída "`metadata.fiscal` canônico e testes"; linhas 122–126: "GOAL nomeado **004 não foi iniciado**";
  "sequência histórica GOAL 002 — paridade fiscal do `upsertProduto` permanece backlog de
  produto/cadastro, **distinta** dos identificadores nomeados XSD (002) e C14N (003)".
- `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md:215` — **P-04** "paridade `upsertProduto`", GOAL 002,
  Resolvido? **não**, impacto "bloqueia mix real".
- `docs/roadmaps/ROADMAP_FISCAL.md:51,97,184` — "GOAL-004 **não** iniciado. Backlog de cadastro
  (paridade `upsertProduto`) permanece distinto"; P0 = "paridade fiscal do `upsertProduto`".
- `docs/ai/CURRENT_STATUS.md:20,51,54` — "GOAL-004 **não** iniciado"; "paridade `upsertProduto`" na
  lista de pendências.

**Critério de aceite herdado (GOAL 002 / P-04):** identidade fiscal do produto **persistida
canonicamente em `metadata.fiscal`** também pelo caminho do Cadastros V2, com **testes**, **sem**
ativar emissão. Sem `fiscalEnabled`, sem SEFAZ, sem cálculo de imposto.

**Gate / Nível N:** este objetivo é **backlog de produto/cadastro**; não abre nem avança gate
fiscal (G-C1/G-C2 permanecem fechados; F4→F5, G-F5, G-F7, G-F12 permanecem como estão). Teto de
maturidade **N3** (teste interno). Não toca regra tributária → **não** exige autoridade contábil
nomeada (essa exigência é do GOAL 003/004 histórico de ST/CSOSN 500). N6=0, N7=0 preservados.

---

## 3. Base publicada e GOALs anteriores

- `origin/main` = `5b96df71a0b507c11785a043b49c6adb15ec26c8` (bate com a base declarada no pedido).
- GOAL-002 XSD (`FISCAL-XSD-OFFICIAL-VALIDATION-002`) — **FECHADO**, PR #4, merge `82c219c4…`, G-C2 fechado.
- GOAL-003 C14N/XMLDSig (`FISCAL-XML-C14N-EXTERNAL-PROOF-003`) — **FECHADO**, PR #6, merge `e52d16b1…`,
  fechamento documental `b236f54`/`5b96df7`.
- C14N/XMLDSig técnico fechado; signer **dormente**; emissão **não** ativada; SEFAZ **não** chamada.

Nada disso ativa emissão, e nenhum deles cobre a porta do Cadastros V2.

---

## 4. Estado do schema (`Produto`)

`prisma/schema.prisma` — model `Produto` (`@@map("estoque_produtos")`):

- Colunas core: `id, storeId (@default("loja-1")), sku?, barcode?, name, brand, supplierName,
  stock, precoCusto (price_cost), price, category?, warrantyDays, status, active, createdAt, updatedAt`.
- **`metadata Json? @db.JsonB`** — campo extensível onde vive `metadata.fiscal`.
- **Nenhuma coluna fiscal dedicada** (não há `ncm`, `cest`, `cfop`, `cst`, `csosn`, `origem`, etc.).
- Unicidade **store-scoped**: `@@unique([storeId, sku])`, `@@unique([storeId, barcode])`, `@@index([storeId])`.

**Conclusão de schema:** os dados fiscais do produto já têm lar canônico em `Produto.metadata.fiscal`
(JSONB). O contrato `lib/produto-fiscal.ts` declara explicitamente "**sem alteração de schema, sem
migration, sem db:push**". Como `Produto` é por loja, `metadata.fiscal` é **inerentemente
store-scoped** (não há linha de produto compartilhada entre lojas). **Schema/migration não são
necessários** para o GOAL-004.

---

## 5. Estado de `upsertProduto`

Local: `app/actions/cadastros.ts:1554` (Server Action do Cadastros V2).

Assinatura de entrada (campos aceitos): `id?, nome, sku?, barras?, categoria?, marca?, fornecedor?,
estoque?, custo?, preco?, garantia?, active?, metadata?, accessoryConfig?`. **Nenhum campo fiscal
top-level** (ncm/cest/cfop/…).

Comportamento de metadata:

- Update: `mergeProdutoMetadataTwoLevels(existing.metadata, input.metadata)` — merge aditivo de
  **dois níveis** (`lib/cadastros/produto-upsert-metadata.ts`). Preserva namespaces não enviados; se
  o caller mandar `metadata.fiscal`, ele **sobrevive** (merge nível 2).
- Create: `{ ...(input.metadata ?? {}) }`.
- Acessórios: `mergeProdutoAcessoriosIntoMetadata` (namespace `acessorios`).

O que **NÃO** faz (o gap):

- **Não** importa `lib/produto-fiscal.ts`.
- **Não** chama `fiscalInputFromBody` nem `mergeProdutoFiscalIntoMetadata`.
- **Não** roda `sanitizeProdutoFiscal` (sem digits-only, sem padding CEST, sem validação NCM/origem).
- **Não** expõe campos fiscais top-level (o que a API REST aceita).

Isto **confirma** o achado do `FISCAL_RECONCILE_REPORT_001.md:89-97` (§4.2, "achado D4") **na base
atual `5b96df7`**: `upsertProduto` mescla `metadata` genérica mas não normaliza `metadata.fiscal`;
Cadastros V2 ainda pode criar produto sem identidade fiscal canônica.

---

## 6. Campos fiscais — contrato canônico (`lib/produto-fiscal.ts`)

Criado por `04ce54d` (rótulo `GOAL_004 — Produto Fiscal Persist`). Tipo `ProdutoFiscal` — 10 campos,
sempre string (`""` = não informado):

| Campo | Regra de saneamento | Classificação |
|---|---|---|
| `ncm` | 8 dígitos (senão "") | metadata persistida (canônico) |
| `cest` | 7 dígitos, pad-left com zeros | metadata persistida (canônico) |
| `cfop` | 4 dígitos | metadata persistida (canônico) |
| `cst` | dígitos, ≤3 | metadata persistida (canônico) |
| `csosn` | dígitos, ≤4 | metadata persistida (canônico) |
| `origemMercadoria` | 1 char `[0-8]` (alias `origem`) | metadata persistida (canônico) |
| `unidadeComercial` | upper, ≤6 (alias `unidade`) | metadata persistida (canônico) |
| `unidadeTributavel` | upper, ≤6 | metadata persistida (canônico) |
| `codigoAnp` | dígitos, ≤9 | metadata persistida (canônico) |
| `exTipi` | dígitos, ≤3 | metadata persistida (canônico) |

APIs do contrato:

- `getProdutoFiscal(source)` — **leitura canônica** (preferência `metadata.fiscal.*`; fallback legado
  `metadata.ncm`/`metadata.cest` no topo; nunca lança).
- `mergeProdutoFiscalIntoMetadata(base, input)` — **escrita canônica** não-destrutiva; grava só
  campos não-vazios (objeto compacto); se tudo vazio, **não** adiciona `fiscal`.
- `sanitizeProdutoFiscal`, `isProdutoFiscalVazio`, `fiscalInputFromBody`, `PRODUTO_FISCAL_BODY_KEYS`,
  `PRODUTO_FISCAL_VAZIO`.

Campos **fora** do contrato (classificação):

- `tributacao` / regime tributário / natureza da operação / descrição fiscal / categoria fiscal /
  tributação de entrada vs saída / alíquota — **não** pertencem ao `ProdutoFiscal` canônico. O motor
  (F2 tax-engine) e a matriz tributária (GOAL 003/004 histórico) tratam disso. O Cadastros V2 hoje
  grava `metadata.fiscal.tributacao` como **texto livre não-canônico** (ver §9), **descartado** pela
  leitura canônica (`getProdutoFiscal` ignora chaves fora dos 10 campos).
- GTIN/EAN tributável, EX TIPI: `exTipi` existe no contrato; GTIN tributável divergente **não** é
  modelado (o produto tem `barcode` core; não há campo `cEANTrib` distinto).

---

## 7. Metadata (`metadata.fiscal`)

- **Lar:** `Produto.metadata.fiscal` (JSONB, aditivo, dormente).
- **Forma canônica** (REST/importador): objeto compacto só com os 10 campos não-vazios.
- **Forma escrita pelo Cadastros V2** (produto-ia.tsx): `{ tributacao?, tributacaoOrigem?,
  tributacaoAtualizadoEm?, ncm?, cest?, origem?, status?, revisadoEm? }` — **inclui chaves
  não-canônicas** e ncm/cest **sem saneamento** (ver §9). A leitura via `getProdutoFiscal` re-saneia
  e ignora as chaves extras, então **leituras permanecem seguras**; a **gravação diverge** da forma
  canônica REST/importador.
- **Versionamento:** o contrato não carrega número de versão explícito no objeto `fiscal`; a
  compatibilidade legado é feita por fallback de leitura (`metadata.ncm`/`metadata.cest` topo).

---

## 8. Create vs Update — parecer

- **Update** é **não-destrutivo** para `metadata.fiscal` graças ao merge de 2 níveis
  (`mergeProdutoMetadataTwoLevels`): editar outros campos **não apaga** `fiscal` já salvo, e enviar
  `metadata.fiscal` parcial **mescla** chave a chave. `input.metadata: null` = omissão (preserva).
- **Create** grava `{ ...(input.metadata ?? {}) }` — o que o UI mandar em `metadata.fiscal` entra.
- **Divergência create/update:** nenhuma quanto a fiscal — ambos apenas repassam o que o UI empacota;
  nenhum dos dois **canoniza**. O risco não é destruição no update, e sim **ausência de normalização
  e de captura completa** nos dois caminhos.

---

## 9. Cadastros V2 — o que já cobre (UI `produto-ia.tsx`)

O formulário do Cadastros V2 (`components/cadastros/lovable/components/cadastros/produto-ia.tsx`)
**parcialmente** trata fiscal:

- Captura **NCM/CEST** apenas via **sugestão Cosmos** (lookup por código de barras), aplicada pelo
  operador (`cosmosFiscalApplied`, `status: "revisado_operador"`). Os campos NCM/CEST na tela são
  **somente-leitura** (`placeholder: "Fase fiscal futura"`, `title: "Edição fiscal — em breve"`) —
  **não há entrada manual** de NCM.
- Captura **`tributacao`** por campo do operador (texto livre) → grava em `metadata.fiscal.tributacao`
  (não-canônico).
- Empacota `input.metadata.fiscal = { ...tributacao?, ...cosmosFiscalApplied? }` e chama
  `upsertProduto` (`produto-ia.tsx:1066-1108`). Este é o **único** ponto do app (fora de importadores
  e REST) que escreve `fiscal: {…}` direto — e o faz **sem** o helper canônico.
- **Não** captura `cfop, cst, csosn, origemMercadoria, unidadeComercial, unidadeTributavel,
  codigoAnp, exTipi` (8 dos 10 campos).

`CadastrosHub.tsx` também repassa `metadata.ncm`/`cest` legados na edição (linhas ~2224), sem
canonização.

**Veredito Cadastros V2:** cobre **parcialmente** — porta principal (`upsertProduto`) sem canonização;
UI captura só ncm/cest (Cosmos, sem saneamento) + tributacao (não-canônico); 8 campos ausentes.

---

## 10. Callers e consumidores (Passo 5)

### 10.1 Escritores de identidade fiscal

| Superfície | Arquivo | Usa contrato canônico? |
|---|---|---|
| Estoque REST (POST create) | `app/api/produtos/route.ts:156-161` | **Sim** — `fiscalInputFromBody` + `mergeProdutoFiscalIntoMetadata` |
| Estoque REST (PATCH update) | `app/api/produtos/[id]/route.ts:186-191` | **Sim** |
| Importador padrão | `lib/importador-produtos/persist.ts:249,273-274` | **Sim** (`mergeProdutoFiscalIntoMetadata`) |
| Importador avançado | `lib/importador-avancado/persistidor.ts:266-270` | **Sim** |
| **Cadastros V2 (Server Action)** | `app/actions/cadastros.ts:1554` `upsertProduto` | **Não** — merge genérico apenas |
| **Cadastros V2 (UI)** | `produto-ia.tsx:1094` (`fiscal: {…}` direto) | **Não** — bypass do helper |

### 10.2 Leitores de identidade fiscal (`getProdutoFiscal`)

| Superfície | Arquivo | Papel |
|---|---|---|
| Inventário | `app/api/ops/inventory/route.ts:89,103` | campo `fiscal` **somente-leitura, aditivo**; "**O PDV ignora; o Cadastro usa na edição**" |
| Motor fiscal (snapshot) | `lib/fiscal/venda-fiscal-snapshot-service.ts:146-167` | resolve `fiscal` por item via `getProdutoFiscal` — **dormente** (sem caller de venda) |
| Dry-run | `lib/fiscal/dry-run/dry-run-fixtures.ts:17` | fixtures |
| Estoque UI | `components/dashboard/estoque/gestao-produtos.tsx:758` | comentário/uso de leitura |

### 10.3 Callers de `upsertProduto`

| Caller | Superfície | Observação |
|---|---|---|
| `components/cadastros/lovable/.../produto-ia.tsx:1066` | Cadastros V2 (ativo) | única porta que envia `metadata.fiscal` |
| `components/cadastros/lovable/.../CadastrosHub.tsx:1952` | Cadastros V2 (ativo) | edição/listagem |
| `components/pdv-github-original/.../CadastrosHub.tsx:682` | **legado quarentenado** | fora de escopo |
| `components/pdv-github-original/.../produto-ia.tsx:324` | **legado quarentenado** | fora de escopo |

**PDV:** **não** lê identidade fiscal do produto (confirmado — "O PDV ignora"). **Sem impacto em PDV.**
**Inventário:** apenas **lê** `fiscal` (aditivo). **Barcode/Cosmos:** alimenta sugestão de NCM/CEST no
Cadastros V2 (revisão do operador; **não** auto-salva silenciosamente).

---

## 11. Testes existentes (Passo 6)

Arquivos relevantes na `main`:

- `lib/produto-fiscal.test.ts` (contrato canônico — sanitize/read/write/legado).
- `lib/cadastros/produto-upsert-metadata.test.ts` (merge de 2 níveis, identifier).
- `lib/produtos/produto-form-codigos.test.ts` (SKU/EAN).
- `lib/fiscal/venda-fiscal-snapshot.test.ts` + `-tax.test.ts` (ponte snapshot).

**Execução read-only** (os 4 arquivos abaixo são **byte-idênticos** entre `origin/main` `5b96df7` e o
HEAD do repo primário `ad94854`, validado por `git diff --quiet`; execução no repo primário, que possui
`node_modules`, é representativa; a worktree de auditoria não tem `node_modules`/`generated/prisma`):

```
npx vitest run lib/produto-fiscal.test.ts lib/cadastros/produto-upsert-metadata.test.ts \
  lib/produtos/produto-form-codigos.test.ts lib/fiscal/venda-fiscal-snapshot.test.ts
→ Test Files 4 passed (4) · Tests 51 passed (51)
```

Baseline do repo (reconcile GOAL-001): suíte total 170 arquivos / 2353 passed / 2 expected fail;
`tsc --noEmit` sem erros. `tsc`/`build`/suíte completa **não** re-executados nesta auditoria por não
serem necessários (arquivos-alvo idênticos à `main`; nenhuma mudança de código).

**Cobertura de teste do gap:** existe teste para o contrato canônico e para o merge genérico, mas
**não** há teste que exercite `upsertProduto` **canonizando** fiscal (porque a canonização ainda não
existe nessa porta). É a lacuna de teste a fechar junto do GOAL-004.

---

## 12. Histórico Git e implementações paralelas (Passo 4)

### 12.1 `04ce54d` — a implementação parcial já integrada

`04ce54d880c48df82082ea7fe989ece19ed1682e` — "feat(fiscal): persistir identidade fiscal dos produtos
(GOAL_004)". **Ancestral de `origin/main`** (confirmado). Tocou:
`lib/produto-fiscal.ts` (+ test), `app/api/produtos/route.ts`, `app/api/produtos/[id]/route.ts`,
`app/api/ops/inventory/route.ts`, `components/dashboard/estoque/gestao-produtos.tsx`,
`lib/importador-produtos/persist.ts`, `lib/importador-avancado/persistidor.ts`. **NÃO** tocou
`app/actions/cadastros.ts` — ou seja, deixou a porta do Cadastros V2 de fora **desde o início**.

### 12.2 `fd2162b` e `backup/cadastros-paralelo-fd2162b`

- `fd2162b12489e87ed21132d5c02a5244c7dcde0e` — "fix(cadastros-v2): endurecer salvamento de produto e
  metadata". **NÃO** é ancestral de `origin/main`.
- **Contido apenas** em `backup/cadastros-paralelo-fd2162b`.
- **`patch-id --stable` de `fd2162b` == `c254572`** (ambos `7303c4bd1f78528309297aad270f01e5c5be61d7`).
- `c2545727dfb939f7352b79b76a5ef76db61e46bc` — **É ancestral de `origin/main`** (posição 58 na
  linhagem; **anterior** à base do reconcile `2b9c51a`, posição 39).

**Conclusão:** o trabalho de `fd2162b` **já está integrado** na `main` via `c254572` (reaplicação
idêntica por patch-id). Isso adicionou `lib/cadastros/produto-upsert-metadata.ts` (+ test) e endureceu
`duplicate-product.ts` — **endurecimento genérico de metadata/duplicidade, NÃO paridade fiscal**.
Prova: `c254572` é **anterior** ao reconcile que **ainda** constatou a lacuna fiscal do `upsertProduto`.

- `backup/cadastros-paralelo-fd2162b` tem só 2 commits não presentes na `main`: `fd2162b` (integrado
  via `c254572`) e `5c48b7b` (docs do roadmap barcode — o doc
  `CADASTROS_V2_CADASTRO_INTELIGENTE_BARCODE_ROADMAP.md` **está** na `main`). **Nada funcional falta.**

### 12.3 Busca por qualquer paridade fiscal paralela

- `git log --all -- lib/produto-fiscal.ts` → único commit `04ce54d`. **Sem fonte paralela/conflitante.**
- `git log --all -S "fiscalInputFromBody" -- app/actions/cadastros.ts` → **vazio**.
- `git log --all -S "mergeProdutoFiscalIntoMetadata" -- app/actions/cadastros.ts` → **vazio**.

**Nenhuma branch, em lugar algum, jamais ligou o helper fiscal canônico ao `upsertProduto`.** A parte
faltante do GOAL-004 é **genuinamente não implementada** — **não há trabalho a duplicar**.

### 12.4 Classificação do trabalho (matriz do Passo 4)

| Categoria | Item |
|---|---|
| **Já integrado** | Contrato canônico + REST + importadores + leitura do motor (`04ce54d`); endurecimento genérico (`c254572`) |
| **Equivalente/reaplicado** | `fd2162b` ≡ `c254572` (patch-id idêntico) |
| **Superado** | `backup/cadastros-paralelo-fd2162b` (nada funcional além do já integrado) |
| **Ausente/parcial** | Canonização fiscal no `upsertProduto` (Server Action) + captura fiscal no UI Cadastros V2 |
| **Conflitante** | Nenhum |

---

## 13. Relação com o motor fiscal (Passo 8)

- O motor lê o produto **exclusivamente** por `getProdutoFiscal` (nunca lê campos fiscais direto).
- `venda-fiscal-snapshot-service.ts` seleciona `Produto.metadata` e resolve `fiscal` por item; o
  snapshot **congela** a identidade (`fiscal: ProdutoFiscal`) e calcula `pendenciasItem(fiscal)` —
  ou seja, já existe **status de completude fiscal no momento do snapshot** (não no cadastro).
- **Dormente:** `createVendaFiscalSnapshot`/`emitirNotaFiscalVenda`/pipeline **sem caller** no fluxo de
  venda (confirma `FISCAL_RECONCILE_REPORT_001.md` §4.1). `fiscalEnabled` default false, inalcançável.

**Este GOAL não ativa emissão.** Ele apenas garante que a porta do Cadastros V2 **grave** o que o
motor **já sabe ler**. N6=0, N7=0 preservados.

---

## 14. Multi-loja

- `Produto` é store-scoped (`storeId` + uniques por loja). `metadata.fiscal` é, portanto, **por linha
  de produto por loja** — **sem vazamento cross-store** e sem cenário de "produto único compartilhado
  entre lojas com regimes diferentes" no schema atual.
- `upsertProduto` já recebe `storeId` e escopa todas as queries (`where: { storeId }`, uniques por
  loja). A implementação do GOAL-004 **não** introduz nova superfície multi-loja.

---

## 15. Riscos (Passo 7)

Contexto: emissão **dormente** e leitura **saneada** ⇒ nenhum risco **ativo P0** hoje. Os riscos abaixo
são (a) do **gap** e (b) do que a implementação do GOAL-004 **deve** tratar para não criar dívida.

| # | Risco | Sev. | Nota |
|---|---|---|---|
| R1 | Porta principal (Cadastros V2) cria produto sem identidade fiscal canônica → "bloqueia mix real" quando emissão for ativada | **P1** | P-04. Núcleo do GOAL-004 |
| R2 | Divergência de forma: `produto-ia.tsx` grava `metadata.fiscal` não-canônico (ncm/cest **sem saneamento** + chaves extras `tributacao/origem/status`) | **P1** | Leitura tolera (re-saneia), mas gravação inconsistente vs REST/importador; risco de perda silenciosa se valor inválido (NCM ≠ 8 díg → "" na leitura) |
| R3 | NCM/CFOP/CST/CSOSN/origem/unidades **não capturáveis** manualmente no Cadastros V2 (campo NCM é read-only; 8 campos ausentes) | **P2** | Depende só de sugestão Cosmos para ncm/cest |
| R4 | CFOP fixado no produto: se implementado, CFOP é **sugestão** de cadastro, não verdade da operação (varia por natureza/UF) | **P2** | Design da implementação; contrato já guarda como string, sem semântica — correto para cadastro |
| R5 | CST vs CSOSN sem considerar regime (Simples vs Normal) | **P2** | Cadastro guarda ambos como string; a **escolha** por regime é do motor/emissão, não do cadastro |
| R6 | Unidade comercial ≠ tributável; GTIN tributável divergente | **P2** | `unidadeComercial`/`unidadeTributavel` existem; GTIN tributável (`cEANTrib`) não modelado |
| R7 | Sem status de completude fiscal **no cadastro** (só no snapshot dormente) | **P2** | Produto incompleto pode parecer "pronto" na UI |
| R8 | Dado fiscal sugerido por IA/Cosmos salvo automaticamente | **P3** | **Mitigado**: exige aplicação do operador (`revisado_operador`), não auto-save |
| R9 | Multi-loja / regimes distintos por loja | **P3** | Sem risco: produto é por loja; `metadata.fiscal` por linha |
| R10 | Metadata fiscal não-versionada | **P3** | Compat por fallback de leitura; sem número de versão explícito |
| R11 | Conflito com cadastro por barcode | **P3** | Cosmos alimenta sugestão; convive com o merge de 2 níveis |

Nenhum risco **P0** ativo por ausência de emissão. R1/R2 são os que o GOAL-004 fecha.

---

## 16. Segredos e dados (Passo 10)

Auditoria de código/Git/docs; **nenhum** XML real, certificado, token, CSC, CNPJ/CPF, credencial ou
produto real sensível foi lido, gerado ou incluído. Banco **não** consultado. Este relatório contém
apenas hashes de commit, caminhos e vereditos.

---

## 17. Escopo mínimo seguro (Passo 9)

### Classificação: **B — implementação parcial; falta fechamento limitado.**

Feito e em `main` (via `04ce54d`): contrato canônico `lib/produto-fiscal.ts` + testes; escrita
canônica em REST (`app/api/produtos/**`) e importadores; leitura do motor via `getProdutoFiscal`.
Falta **apenas** a porta do Cadastros V2 (`upsertProduto` + UI) usar o contrato canônico.

### Menor implementação segura (a executar em GOAL futuro, **não** agora)

**Arquivos exatos (allowlist proposta para a implementação):**

1. `app/actions/cadastros.ts` — em `upsertProduto`: aceitar entrada fiscal (top-level e/ou
   `metadata.fiscal`), rodar por `mergeProdutoFiscalIntoMetadata` (escrita canônica, não-destrutiva),
   **preservando** o merge genérico dos demais namespaces. Sem tocar estoque/preço/duplicidade.
2. `components/cadastros/lovable/components/cadastros/produto-ia.tsx` — enviar fiscal na forma
   canônica (e, opcionalmente, habilitar entrada manual dos campos). *(UI é incremento; o mínimo é a
   canonização no servidor, que sanea qualquer forma que chegar.)*
3. Teste novo/estendido (`lib/cadastros/produto-upsert-metadata.test.ts` **ou** um teste de
   `upsertProduto`): assevera canonização de `metadata.fiscal`, merge não-destrutivo e ausência de
   perda de outros namespaces.

**Contrato:** reutilizar `mergeProdutoFiscalIntoMetadata`/`fiscalInputFromBody`/`sanitizeProdutoFiscal`
(já publicados). **Nenhum contrato novo.**

**Zonas proibidas:** PDV, Caixa, Estoque core, `prisma/schema.prisma`, migrations, auth/proxy,
emissão/signer/pipeline/SEFAZ, `components/pdv-github-original/**` (legado quarentenado), motor
tributário (ST/CSOSN 500 é GOAL histórico distinto).

**Critérios de aceite:** produto criado/editado pelo Cadastros V2 persiste `metadata.fiscal` **na
forma canônica**; `getProdutoFiscal` lê o resultado igual ao das portas REST; testes verdes; `tsc`
limpo; **nenhuma** ativação de emissão; N6=0/N7=0.

**Gate:** nenhum aberto/avançado (G-C1/G-C2 fechados permanecem; F4→F5, G-F5, G-F7, G-F12 inalterados).
**Nível N:** **N3** (teste interno). **Impacto multi-loja:** nenhum novo. **Impacto Barcode:** convive
com Cosmos (canoniza a sugestão). **Impacto Inventário:** nenhum (só leitura aditiva). **Impacto PDV:**
nenhum (PDV ignora fiscal).

### Schema necessário? **Não.** (Opção **B** — metadata JSONB aditiva.)
### ADR necessária? **Não.** Reusa contrato já decidido (`lib/produto-fiscal.ts`); nenhuma decisão
arquitetural nova. Uma nota de execução no roadmap basta. (Promoção futura para colunas dedicadas
seria um GOAL de schema separado, com ADR própria — **fora** deste escopo.)

---

## 18. Lacunas remanescentes (resumo)

1. `upsertProduto` não canoniza fiscal (porta principal). **[GOAL-004]**
2. UI Cadastros V2 grava forma não-canônica e captura só ncm/cest+tributacao. **[GOAL-004, incremento]**
3. Sem teste de canonização fiscal no nível do `upsertProduto`. **[GOAL-004]**
4. Sem status de completude fiscal no cadastro (só no snapshot dormente). *(opcional / P2)*
5. ST/CSOSN 500 e matriz tributária — **GOAL histórico distinto** (F2), **não** este GOAL.

---

## 19. Conclusão e veredito

- **GOAL-004** (= paridade fiscal do `upsertProduto`, P-04 / GOAL histórico 002) está **PARCIALMENTE
  IMPLEMENTADO** (classificação **B**): contrato canônico + REST + importadores + leitura do motor
  **já em `main`** (`04ce54d`); falta **só** a porta do Cadastros V2.
- **Não há trabalho paralelo a duplicar:** `fd2162b`/`backup` já integrados via `c254572` (patch-id
  idêntico) e são **endurecimento genérico**, não fiscal; nenhuma branch jamais ligou o helper fiscal
  ao `upsertProduto`.
- **Schema/migration:** desnecessários. **ADR:** desnecessária.
- **Gate:** nenhum aberto. **Nível N:** N3. Emissão permanece **dormente** (N6=0, N7=0).
- **Pode iniciar agora?** **Sim** — o GOAL-004 está **pronto para implementação** de baixo risco e
  escopo fechado (2 arquivos de código + 1 de teste), reutilizando contrato publicado, sem tocar
  zonas proibidas. Recomenda-se worktree/branch próprias e allowlist da §17.

---

### Anexo — hashes verificados

| Ref | Hash | Em `origin/main`? |
|---|---|---|
| `origin/main` | `5b96df71a0b507c11785a043b49c6adb15ec26c8` | — |
| `04ce54d` (GOAL_004 parcial) | `04ce54d880c48df82082ea7fe989ece19ed1682e` | **sim** |
| `c254572` (endurecer, ≡ fd2162b) | `c2545727dfb939f7352b79b76a5ef76db61e46bc` | **sim** |
| `fd2162b` (backup) | `fd2162b12489e87ed21132d5c02a5244c7dcde0e` | não (só backup) |
| `5c48b7b` (docs backup) | `5c48b7ba2eeb91ee48e028bd603e7da8c8fefe0a` | não (doc já na main via `c254572`) |
| patch-id `fd2162b`==`c254572` | `7303c4bd1f78528309297aad270f01e5c5be61d7` | — |
