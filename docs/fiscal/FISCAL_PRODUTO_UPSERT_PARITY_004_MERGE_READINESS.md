# FISCAL — Merge Readiness · Paridade fiscal do `upsertProduto` (GOAL-004)

| Campo | Valor |
|-------|-------|
| **GOAL** | `FISCAL-PRODUTO-UPSERT-PARITY-004-MERGE-READINESS` |
| **Tipo** | Auditoria de merge readiness — read-only (nenhuma alteração de código/schema/testes/deps) |
| **Data** | 2026-07-16 |
| **Classificação** | **A — PRONTO PARA INTEGRAÇÃO** |
| **Auditoria anterior** | `audit/fiscal-produto-upsert-parity-004` @ `61b736f` — classe **B** (implementação parcial: faltava só a porta Cadastros V2) |

---

## 1. Objetivo

Determinar se a branch de implementação `origin/work/fiscal-produto-upsert-parity-004`
(HEAD `3f8928c`) pode ser integrada com segurança à `origin/main` atual. **Não integrar
neste GOAL** — apenas auditar, classificar (A/B/C/D) e produzir o relatório.

A implementação fecha a lacuna registrada na auditoria anterior (classe B): dar **paridade
fiscal** à porta do Cadastros V2 (`upsertProduto`), canonizando `metadata.fiscal` com o mesmo
contrato já publicado que as portas REST/importador usam, **sem** ativar emissão, **sem** tocar
schema, **sem** chamar SEFAZ. O ponto de atenção declarado é o namespace novo
`metadata.fiscalRegime`.

## 2. Base (merge-base)

```
merge-base(origin/main, origin/work/…-004) = 5b96df71a0b507c11785a043b49c6adb15ec26c8
```

A merge-base é **idêntica** à `origin/main` atual → a branch está exatamente **1 commit à
frente e 0 atrás**. Integração seria **fast-forward puro**.

## 3. main atual

```
origin/main = 5b96df71a0b507c11785a043b49c6adb15ec26c8
  ("docs(fiscal): fechar GOAL-003 de C14N externo (#7)")
```

A `main` **não avançou** desde a base da implementação (inalterada início→fim). Commits
exclusivos da main sobre a base: **0**.

## 4. Branch (implementação)

```
origin/work/fiscal-produto-upsert-parity-004 = 3f8928c0d8dc7361b6282cbb2b225ae04ed8a501
  ("fix(cadastros-v2): canonizar dados fiscais no upsertProduto")
```

`git cat-file -t 3f8928c…` = `commit` (HEAD esperado confirmado).

## 5. Commit

Commit exclusivo da branch (exatamente 1):

```
3f8928c fix(cadastros-v2): canonizar dados fiscais no upsertProduto
```

Diffstat: **4 arquivos · +206 / −20**.

## 6. Arquivos

```
M  app/actions/cadastros.ts                                              (+11 / −2)
M  components/cadastros/lovable/components/cadastros/produto-ia.tsx       (~41 linhas)
A  lib/produtos/produto-fiscal-upsert.ts                                 (+57)
A  lib/produtos/produto-fiscal-upsert.test.ts                            (+115)
```

Confirmado **exatamente 4 arquivos**, **nenhum** adicional. **Não** há alteração em: Prisma
schema · migrations · `app/api/**` · PDV · Caixa · Estoque · Inventário · Barcode providers ·
`lib/fiscal/**` · `lib/produto-fiscal.ts` · `package.json` · `package-lock.json` · workflows ·
`docs/**` · Contador HUB.

## 7. Interseções

Listas fora do repositório (`git diff --name-only BASE..ref | sort`):

| Conjunto | Qtde | Arquivos |
|----------|------|----------|
| `BASE..origin/main` | **0** | (vazio) |
| `BASE..branch` | 4 | os 4 acima |
| **Interseção (`comm -12`)** | **0** | (vazio) |

**Nenhum arquivo em comum.** Como não há commits exclusivos da main e não há arquivos
compartilhados, **não existe conflito textual nem semântico possível** — nenhum fix da main
pode ser perdido, nenhuma alteração concorrente no `upsertProduto`/payload/metadata/Barcode.

## 8. merge-tree

```
git merge-tree --write-tree origin/main origin/work/…-004
→ tree bf3b1edc38f19e36264160a2e0f820eb19c290b9   (exit 0)

git merge-tree <BASE> origin/main origin/work/…-004   (forma verbosa)
→ nenhum hunk de conflito ("changed in both" / marcadores <<<< ==== >>>> ausentes)
```

Árvore virtual única, **exit 0, zero conflito**. Consistente com a interseção vazia. Merge real
**não** executado.

## 9. Helper puro — `lib/produtos/produto-fiscal-upsert.ts`

`canonicalizeProdutoFiscalMetadata(mergedMetadata, fiscalInput)` — 57 linhas. Parecer: **correto
e não-destrutivo**.

| # | Verificação | Resultado |
|---|-------------|-----------|
| 1 | Reutiliza exclusivamente helpers de `lib/produto-fiscal.ts` | ✅ `getProdutoFiscal`, `sanitizeProdutoFiscal`, `mergeProdutoFiscalIntoMetadata`, `PRODUTO_FISCAL_VAZIO` |
| 2 | Não cria contrato fiscal paralelo | ✅ sem tipos/saneadores próprios |
| 3 | Não replica saneadores | ✅ `asObject` é só type-guard trivial |
| 4 | Não cria defaults tributários | ✅ base vem de `getProdutoFiscal`; nada inventado |
| 5 | Não aceita campos desconhecidos | ✅ itera só `FISCAL_KEYS = Object.keys(PRODUTO_FISCAL_VAZIO)` (10 campos) |
| 6 | Remove resíduo não canônico só dentro de `metadata.fiscal` | ✅ `delete next.fiscal` e reescreve forma compacta |
| 7 | Preserva metadata fora de `fiscal` | ✅ `next = { ...mergedMetadata }` mantém todos os namespaces |
| 8 | Preserva campos fiscais não reenviados | ✅ `if (incoming[key]) fiscalSource[key] = …` — vazio não sobrescreve |
| 9 | Update sem fiscal não recanoniza/destrói | ✅ helper só é chamado com `fiscalInput != null` (contrato documentado + caller) |
| 10 | create e update usam a mesma identidade canônica | ✅ mesma função; teste `create ≡ update` |
| 11 | Não interpreta texto livre como regra fiscal | ✅ só campos saneados do contrato |
| 12 | Não cria dependência circular | ✅ importa só de `@/lib/produto-fiscal`; nenhum módulo do contrato importa este helper |
| 13 | Não importa Prisma | ✅ |
| 14 | Não depende de browser | ✅ funções puras |
| 15 | Não altera storeId | ✅ opera só sobre metadata |

`PRODUTO_FISCAL_VAZIO`: usado apenas para derivar `FISCAL_KEYS` (as 10 chaves canônicas). **Não**
cria bloco fiscal vazio — quando nada sobra, `mergeProdutoFiscalIntoMetadata` não adiciona a
chave `fiscal` (JSONB enxuto; provado pelo teste "fiscal vazio").

## 10. `upsertProduto` — `app/actions/cadastros.ts`

Diff cirúrgico (+11/−2 + 2 imports). Parecer: **correto**.

```ts
const accessoryInput = produtoAcessoriosInputFromBody(input);
const fiscalInput = fiscalInputFromBody(input as Record<string, unknown>);          // + novo
const shouldWriteMetadata =
  Boolean(input.metadata) || accessoryInput.provided || fiscalInput != null;        // + "|| fiscalInput != null"
let nextMetadata = input.id
  ? mergeProdutoMetadataTwoLevels(existing?.metadata, input.metadata)               // update
  : { ...(input.metadata ?? {}) };                                                  // create
if (accessoryInput.provided) nextMetadata = mergeProdutoAcessoriosIntoMetadata(…);
if (fiscalInput) nextMetadata = canonicalizeProdutoFiscalMetadata(nextMetadata, fiscalInput); // + novo
```

| # | Verificação | Resultado |
|---|-------------|-----------|
| 1 | `fiscalInputFromBody` no ponto correto | ✅ após `accessoryInput`, antes do merge |
| 2 | `shouldWriteMetadata` inclui fiscal sem alterar outros gatilhos | ✅ só adiciona `\|\| fiscalInput != null` |
| 3 | Merge fiscal ocorre depois dos merges compatíveis, na ordem certa | ✅ genérico → acessórios → **fiscal** → persistência |
| 4 | create persiste `metadata.fiscal` canônico | ✅ (teste CREATE + saneamento) |
| 5 | update sem input fiscal preserva bloco existente | ✅ `fiscalInput=null` ⇒ canonicalize não roda; 2-níveis preserva `fiscal` |
| 6 | update parcial preserva campos não reenviados | ✅ (teste UPDATE parcial) |
| 7–10 | acessórios / catálogo / Barcode / IA preservados | ✅ namespaces disjuntos; spread preserva |
| 11 | Duplicidade SKU/EAN intacta | ✅ `findDuplicate` store-scoped inalterado |
| 12 | Patch de estoque intacto | ✅ `produtoStockPatch` inalterado |
| 13 | Autorização/storeId intactos | ✅ assinatura `(storeId, input)`; `where:{storeId}` |
| 14 | Retorno da action compatível | ✅ `{ ok, … }` inalterado |
| 15 | Nenhum caller novo do signer | ✅ |
| 16 | Nenhuma emissão ativada | ✅ |

**Ordem × clobber:** a canonização fiscal roda **por último** e o merge de acessórios só toca
`metadata.acessorios` (namespace disjunto de `metadata.fiscal`). `canonicalizeProdutoFiscalMetadata`
faz spread de todo o `nextMetadata` (preservando `.acessorios` e demais) e só reescreve `.fiscal`.
**Nenhum merge posterior sobrescreve fiscal.**

**Não-regressão do gate:** `fiscalInputFromBody` retorna `null` quando não há sinal fiscal (provado
no contrato) → `shouldWriteMetadata` **não** é forçado a `true` em upserts não-fiscais → sem
gravação espúria de metadata. Quando há sinal fiscal mas não há `input.metadata` (ncm/cest
top-level), `mergeProdutoMetadataTwoLevels(existing, undefined)` retorna o existente fielmente
(`if (!incoming) return base`) e a canonização apenas acrescenta o bloco canônico — **aditivo**.

## 11. Cadastros V2 — `produto-ia.tsx`

Parecer: **correto**. Três mudanças: (a) prefill lê `fiscalRegime` com fallback legado; (b) remoção
do `fiscalBarcodeSuggestion`; (c) payload envia fiscal canônico + regime separado.

| # | Verificação | Resultado |
|---|-------------|-----------|
| 1 | Payload fiscal = só o que a UI possui | ✅ `metadata.fiscal = { ...cosmosFiscalApplied }` (tipo `{ ncm?; cest? }`) |
| 2 | NCM/CEST não auto-confirmados | ✅ `applyExternalBarcodeSuggestions` é ação do operador; toast "Revise e salve manualmente" |
| 3 | `cosmosFiscalApplied` exige ação humana | ✅ setado só no clique "Aplicar sugestões", e só se campo vazio |
| 4 | origem/status/revisadoEm em `metadata.barcodeLookup` | ✅ preservados lá; `fiscalBarcodeSuggestion` removido |
| 5 | `metadata.fiscal` não recebe proveniência | ✅ só ncm/cest canônicos |
| 6 | `metadata.fiscalRegime` não é contrato tributário canônico | ✅ (ver §13) |
| 7 | `fiscalRegime` só compatibilidade visual/textual | ✅ dropdown Simples/Presumido/Real |
| 8 | Prefill lê `fiscalRegime` com fallback legado | ✅ `fiscalRegime.tributacao` ?? `fiscal.tributacao` ?? "" |
| 9 | Fallback legado não sobrescreve `metadata.fiscal` | ✅ só seta estado local; não grava |
| 10 | Nenhum dos 10 campos inventado | ✅ só ncm/cest quando o Cosmos sugere |
| 11 | NCM manual permanece desabilitado | ✅ `<input readOnly>` ("Edição fiscal — em breve") |
| 12 | CEST mantém saneamento | ✅ display readOnly; saneamento server-side inalterado |
| 13 | Barcode/Cosmos/UPCitemdb funcionais | ✅ fluxo de lookup intocado pelo diff |
| 14 | create e edit usam o mesmo payload | ✅ único `upsertProduto(storeId, { id: productId, … })` |
| 15 | categoria/SKU/EAN/imagens/preço/custo/estoque intactos | ✅ todos permanecem no payload |

## 12. `metadata.fiscal`

**Fonte canônica única.** Escrita pela porta REST (whole-block replace) e pelos importadores via
`mergeProdutoFiscalIntoMetadata`; agora **também** pela porta Cadastros V2 via
`canonicalizeProdutoFiscalMetadata` (que reusa o mesmo contrato). Leitura **exclusiva** via
`getProdutoFiscal` (preferência `metadata.fiscal.*`; fallback legado `metadata.ncm/cest` do topo).
Guarda só os 10 campos, na forma compacta (só não-vazios). **Não há segunda fonte fiscal.**

## 13. `metadata.fiscalRegime` — decisão obrigatória

**Classificação: A — compatibilidade visual segura e não canônica.**

- **Motivo da criação:** o regime tributário (Simples/Lucro Presumido/Lucro Real) é texto livre de
  UI e **não** é um dos 10 campos do contrato fiscal do produto (é atributo de emitente/CRT, não do
  item). Antes vivia poluindo `metadata.fiscal.tributacao` (+ `tributacaoOrigem`/`tributacaoAtualizadoEm`).
  Foi movido para um namespace próprio para **não poluir** o bloco canônico.
- **Formato:** `{ tributacao: string, origem: "operador", atualizadoEm: ISO }`.
- **Quem escreve:** apenas `produto-ia.tsx` (payload), quando há texto de regime.
- **Quem lê:** apenas `produto-ia.tsx` (prefill).
- **Havia chave equivalente?** Sim — `metadata.fiscal.tributacao` legado; o campo é uma
  **realocação** de um dado já existente e já não-canônico.

**Prova de A** (grep em toda a árvore pós-merge, `':!*.md'`):

| Requisito | Evidência |
|-----------|-----------|
| Motor Fiscal nunca lê `fiscalRegime` | ✅ 0 referências em `lib/fiscal/**` |
| `getProdutoFiscal` nunca lê `fiscalRegime` | ✅ lê só `metadata.fiscal` + legado `ncm/cest` |
| APIs/importadores não dependem de `fiscalRegime` | ✅ 0 referências fora de `produto-ia.tsx` + o teste |
| Nenhum valor canônico é derivado dele | ✅ canônico = `sanitizeProdutoFiscal` (10 campos) |
| Remover/mudar futuramente não altera emissão | ✅ só afeta o prefill de UI |
| Não contém NCM/CEST nem os 10 campos | ✅ contém `tributacao`/`origem`/`atualizadoEm`; teste prova separação |

Referências totais de `fiscalRegime` (não-doc): `produto-ia.tsx` (prefill L374/379-380 + payload
L1102) e `produto-fiscal-upsert.test.ts` (asserções L106/110). **Zero** leitores fiscais. O nome
"fiscalRegime" é adequado (regime tributário), sem indução a interpretá-lo como campo canônico do
item; o fallback legado é transitório e seguro (não grava de volta).

## 14. Barcode / Cosmos

Parecer: **sujeito a revisão humana (inalterado)**. O lookup local/externo (Cosmos, UPCitemdb) e a
função `applyExternalBarcodeSuggestions` não foram tocados. NCM/CEST sugeridos pelo Cosmos:
(a) só entram se o campo estiver vazio; (b) exigem clique do operador; (c) mostram toast "Revise e
salve manualmente"; (d) só o operador salva. A remoção de `fiscalBarcodeSuggestion` **melhora** a
higiene: a proveniência da sugestão continua auditada em `metadata.barcodeLookup`
(`aplicadoPeloOperador`, `camposAplicados`, `statusLookup`), sem contaminar `metadata.fiscal`.

## 15. create

Parecer: **correto**. `input.id` ausente ⇒ `nextMetadata = { ...(input.metadata ?? {}) }`; se houver
sinal fiscal, `canonicalizeProdutoFiscalMetadata` sanea e grava `metadata.fiscal` na forma canônica
(mesmo valores brutos do Cosmos, ex.: `8517.62.00` → `85176200`). Testes CREATE + saneamento verdes.

## 16. update

Parecer: **correto**. `input.id` presente ⇒ merge de 2 níveis sobre o existente (store-scoped) e, se
houver sinal fiscal, canonização não-destrutiva. Base fiscal vem do metadata **já mesclado**
(existente + enviado), preservando o que não foi reenviado.

## 17. update parcial

Parecer: **não-destrutivo**. `if (incoming[key]) fiscalSource[key] = incoming[key]` — campos fiscais
vazios não sobrescrevem a base. Teste: `{ncm:85176200, cest:0106400}` + envio `{ncm:99887766}` ⇒
`{ncm:99887766, cest:0106400}` (cest preservado).

## 18. metadata não fiscal

Parecer: **preservada**. `canonicalizeProdutoFiscalMetadata` faz spread de todo o metadata e só
deleta/reescreve `.fiscal`. Teste prova preservação de `atributos`, `catalogoAparelhos`, `acessorios`,
`cadastroIa`, `barcodeLookup` ao canonizar o fiscal.

## 19. Compatibilidade legada

Parecer: **compatível**. Chaves legadas do topo (`metadata.ncm/cest`) preservadas e **não**
promovidas quando já existe bloco canônico; `getProdutoFiscal` mantém o fallback; sem migração em
massa; produto sem fiscal continua sem default falso.

| Cenário | Resultado |
|---------|-----------|
| 1. Antigo sem `metadata.fiscal` | ✅ VAZIO; sem input fiscal, metadata intocada |
| 2. Antigo com ncm/cest legados (topo) | ✅ lido por fallback; promovido só se o operador enviar fiscal; topo preservado |
| 3. Com `metadata.fiscal` canônico | ✅ lido canonicamente |
| 4. fiscal + fiscalRegime | ✅ fiscal canônico; regime em namespace próprio (teste real) |
| 5. Editado sem tocar Fiscal | ✅ `fiscalInput=null` ⇒ canonicalize não roda; fiscal preservado |
| 6. Editado após lookup Cosmos | ✅ `fiscal:{ncm,cest}` canonizado |
| 7. Update parcial só NCM | ✅ demais preservados |
| 8. Update parcial só CEST | ✅ demais preservados |
| 9. Campo inválido | ✅ saneado a `""` → não gravado |
| 10. Fiscal vazio | ✅ chave `fiscal` não criada |

**Observação transitória (não bloqueante):** ao editar um produto **legado** cujo `tributacao`
está dentro de `metadata.fiscal` e salvar **sem** reaplicar o Cosmos (sem enviar `fiscal`), o
resíduo `metadata.fiscal.tributacao` permanece no JSONB enquanto um novo `metadata.fiscalRegime`
é escrito. É **inerte**: `getProdutoFiscal` sanea e descarta `tributacao` (não canônico) e o prefill
prefere `fiscalRegime`. O resíduo só é removido quando o operador reaplicar o Cosmos (envia
`fiscal` → `delete next.fiscal` + reescrita canônica). Não é segunda fonte fiscal, não afeta emissão.

## 20. Testes

`lib/produtos/produto-fiscal-upsert.test.ts` — **10 testes**. Compõe os helpers **reais**
(`mergeProdutoMetadataTwoLevels`, `fiscalInputFromBody`, `getProdutoFiscal`,
`canonicalizeProdutoFiscalMetadata`) espelhando fielmente a composição do `upsertProduto`
(create=spread, update=2-níveis, canoniza se `fiscalInput`). **Não é réplica** — chama o helper real.

Cobertura: create · saneamento · update sem fiscal · update parcial · preservação de namespaces ·
chave desconhecida · legado do topo · input inválido · create≡update · payload real do Cadastros V2.

Execução (na worktree da branch, read-only), conjunto = 4 arquivos-baseline da auditoria anterior +
o novo:

```
npx vitest run lib/produto-fiscal.test.ts lib/cadastros/produto-upsert-metadata.test.ts \
  lib/produtos/produto-form-codigos.test.ts lib/fiscal/venda-fiscal-snapshot.test.ts \
  lib/produtos/produto-fiscal-upsert.test.ts
→ Test Files 5 passed (5) · Tests 61 passed (61)
```

**61 passed** — bate exatamente com o declarado. Working tree da branch permaneceu limpa.

## 21. TypeScript

```
npx tsc --noEmit --incremental false   → exit 0
```

## 22. ESLint

```
npx eslint app/actions/cadastros.ts produto-ia.tsx \
  lib/produtos/produto-fiscal-upsert.ts lib/produtos/produto-fiscal-upsert.test.ts   → exit 0
```

## 23. build

```
npm run build (prisma generate + next build)   → exit 0
```

Manifesto completo de rotas gerado, incluindo `/dashboard/produtos` e
`/dashboard/produtos/assistente-ia` (superfície do Cadastros V2). **Reproduzido de forma
independente** (sem crash de RAM nesta execução).

## 24. Dependências

Parecer: **coerentes / não bloqueante**. `package.json` e `package-lock.json` da branch são
**byte-idênticos** à main (diff vazio). Os 4 arquivos **não** introduzem nenhum import externo novo
(só `@/…` local + `vitest`). Portanto o verde de build/testes **não** depende de pacote não
declarado.

## 25. node_modules stale

Parecer: **não bloqueante**. `@xmldom/xmldom@0.8.13`, `xml-crypto@6.1.2` e `stripe@22.1.1` estão
**declarados** no `package.json` e **resolvidos** no node_modules da worktree da branch nas versões
**consistentes com o lock** (stripe casa `^22.1.1`, sem drift 22.3.2; xmldom/xml-crypto nas versões
exatas). Herança do GOAL-003 (C14N), instalados `--no-save` na sessão de implementação — apenas
**restaurou** o conteúdo previsto pelo lock, sem alterar arquivos rastreados. Os 5 arquivos de teste
executados aqui não exercitam xml-crypto/xmldom; ainda assim a árvore permaneceu limpa e sem
generated oculto rastreado.

## 26. schema

**Não alterado.** `prisma/schema.prisma` fora do diff.

## 27. migration

**Nenhuma.** `metadata.fiscal` é JSONB aditivo, store-scoped; sem `db:push`/`db:migrate`.

## 28. Motor Fiscal

Parecer: **intacto**. Lê `metadata.fiscal` **exclusivamente** via `getProdutoFiscal`
(`lib/fiscal/venda-fiscal-snapshot-service.ts:167` monta o snapshot congelado; a inventory route e os
importadores também consomem `getProdutoFiscal`). `fiscalRegime` é **ignorado** pelo motor (0
referências em `lib/fiscal/**`). PDV **não** passou a ler Fiscal. Nenhuma venda cria emissão.

## 29. signer

**Dormente.** Sem caller produtivo. O diff não adiciona nenhum import/chamada do signer; a branch
não toca `lib/fiscal/signing/**`.

## 30. callers produtivos

**0.** Grep por `runEmissionPipeline|assinarNfce|nfceSigner|signNfce|emitirNota|enviarSefaz|sefaz`
fora de `lib/fiscal/**` e testes → vazio. O único caller novo introduzido pela branch é
`upsertProduto → canonicalizeProdutoFiscalMetadata` (caminho de **cadastro**, não de emissão).

## 31. multi-loja

Parecer: **seguro**. `upsertProduto(storeId, input)`: duplicidade e lookup de existente filtram
`where: { storeId }` / `{ id, storeId }`. `metadata.fiscal` fica vinculada ao produto da loja; sem
leitura cross-store; o input fiscal não introduz `storeId` arbitrário; autorização inalterada.

## 32. emissão

**Não.** N6=0 / N7=0 mantidos. Emissão permanece dormente.

## 33. SEFAZ

**Não chamada.** Nenhuma integração SEFAZ tocada ou acionada.

## 34. Contador HUB

**Sem colisão.** 0 arquivos compartilhados; a branch não toca `app/actions/contador*`,
`components/contador*`, nem qualquer superfície do Contador HUB. Interseção de arquivos vazia
garante ausência de colisão.

## 35. Riscos

| ID | Risco | Sev. | Nota |
|----|-------|------|------|
| R-1 | Resíduo `metadata.fiscal.tributacao` em produtos legados editados sem reaplicar Cosmos | **Baixo** | Inerte (não lido canonicamente; prefill prefere `fiscalRegime`); some ao reaplicar Cosmos. Não bloqueia. |
| R-2 | Display de NCM/CEST no modal lê `metadata.ncm/cest` legado, não `getProdutoFiscal` | **Baixo** | **Pré-existente e fora de escopo** (inalterado por esta branch); só display, persistência é canônica. |
| R-3 | Operador não consegue "limpar" regime via campo vazio (2-níveis preserva) | **Trivial** | UX de `fiscalRegime` (não canônico); irrelevante para fiscal/emissão. |

Nenhum risco P0/P1. Segredos: **nenhum** (grep por password/secret/token/apikey nas linhas
adicionadas → nada; sem XML/certificado/CPF/CNPJ/credencial). `git diff --check` limpo (exit 0):
sem marcadores de conflito, whitespace, `console.*`, `TODO`/`FIXME` reais, `any`/`as any`,
`@ts-ignore`, `eslint-disable`, `debugger`, dead code ou arquivos gerados. Casts presentes são
`as Record<string, unknown>` estreitos e guardados por checagem em runtime.

## 36. Classificação

### **A — PRONTO PARA INTEGRAÇÃO**

Todos os critérios de A satisfeitos:

- ✅ merge-tree limpo (exit 0, árvore única, sem conflito)
- ✅ sem conflito semântico (0 arquivos comuns, 0 commits exclusivos da main)
- ✅ exatamente 4 arquivos
- ✅ contrato canônico reutilizado (`lib/produto-fiscal.ts`)
- ✅ create/update corretos
- ✅ update parcial não-destrutivo
- ✅ metadata não fiscal preservada
- ✅ `fiscalRegime` provado não canônico e seguro (classe A)
- ✅ Barcode continua sob revisão humana
- ✅ 61 testes verdes · TypeScript verde · ESLint verde · build verde
- ✅ dependências coerentes (idênticas à main; sem dep nova)
- ✅ sem schema · sem migration · sem emissão · sem SEFAZ · sem caller produtivo
- ✅ sem colisão com Contador HUB

## 37. Estratégia

Integração recomendada: **fast-forward puro** de `origin/work/fiscal-produto-upsert-parity-004`
sobre `origin/main` (merge-base == main; 1 ahead / 0 behind), ou merge-commit não-fast-forward
para preservar rastro — ambos sem risco de conflito. **Abrir PR do GOAL-004** e integrar somente
após aprovação humana (Gate #2). Nada a rebase/cherry-pick. Opcional, em GOAL futuro e fora deste
escopo: varredura transitória para migrar `metadata.fiscal.tributacao` legado → `metadata.fiscalRegime`
(R-1) e alinhar o display NCM/CEST do modal a `getProdutoFiscal` (R-2) — nenhum dos dois bloqueia.

## 38. Conclusão

A implementação fecha exatamente a lacuna da auditoria classe B: dá paridade fiscal à porta
Cadastros V2 reutilizando o contrato canônico publicado, de forma **cirúrgica** (4 arquivos, +206/−20),
**aditiva** e **não-destrutiva**. Não há segunda fonte fiscal — `metadata.fiscal` permanece a única
verdade lida por `getProdutoFiscal`; `metadata.fiscalRegime` é compatibilidade visual comprovadamente
invisível ao motor. Barcode/Cosmos seguem sob revisão humana. Schema, emissão, SEFAZ, signer, PDV,
Caixa, Estoque, Inventário e Contador HUB permanecem intocados. Todas as validações reproduzidas em
verde. **Classificação A — apto a abrir PR e integrar após aprovação humana.**

---

_Auditoria read-only. Branch de auditoria: `audit/fiscal-produto-upsert-parity-004-readiness`.
Worktree: `C:/Projetos/wt-fiscal-produto-upsert-004-readiness`. Nenhum arquivo além deste relatório
foi criado ou alterado._
