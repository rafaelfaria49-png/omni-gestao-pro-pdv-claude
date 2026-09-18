# PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007 — Ação configurável ao bipar produto não cadastrado

- GOAL: `PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007-ENDTOEND`
- base: `origin/main` `94cb339` · branch: `work/pdv-scan-unregistered-settings-007`
- superfícies compatíveis: Clássico/Rápido, Assistência/Rápido, Supermercado/Rápido, Venda Completa
- PDV Next/Black: **auditado, sem mudança** (`PDV_NEXT_SUPPORTED=NO`)

## 1. A configuração (server-first, por unidade)

Chave canônica nova em `StoreSettings.printerConfig.pdvScanUnregisteredAction`
(blob JSONB **aditivo — sem schema/migration**; `mergePrinterConfigServerSide` preserva
irmãos desconhecidos em save normal e backfill):

| Valor | UI | Comportamento |
|---|---|---|
| `warn_continue` | Avisar e continuar | Comportamento exato do GOAL 006. |
| `warn_offer_avulso` | Avisar e oferecer Item Avulso | Mesmo runtime do GOAL 006 + hint `Insert para Item Avulso` no aviso; Insert abre o Item Avulso **com o código lido preenchido** (quando o campo segue vazio). |
| `open_avulso` | Abrir Item Avulso automaticamente | **Opt-in.** Após o miss confirmado, abre o Item Avulso uma única vez por scan, com o código como contexto. |

- **Fonte da verdade: servidor** (`GET/PUT /api/stores/[id]/settings`). Sem localStorage na
  precedência (chave nova, nada legado a migrar — `isEligibleForBackfill: false` sempre).
- **DEFAULT = `warn_offer_avulso`** (decisão documentada): idêntico em comportamento
  operacional material ao GOAL 006 — feedback inline, campo `value=""` focado, próximo bipe
  imediato, e o Insert **já abria** Item Avulso nas 4 superfícies antes deste GOAL. A única
  diferença é a copy do hint e o código pré-preenchido quando o Insert ocorre logo após um
  miss. `open_avulso` NUNCA é default (configuração ausente/inválida nunca autoabre —
  fail-safe, provado por teste).
- **Isolamento por loja**: a resolução é função exclusiva do `printerConfig` da loja
  requisitada (provider epoch-gated por `storeId`); `STORE_A_SETTING != STORE_B_SETTING`
  provado por teste (`resolvePdvScanUnregisteredActionServerFirst`).
- Auditoria de configuração: a chave contém "pdv" → seção `pdv` automática em
  `lib/config-audit/store-settings.ts`.
- Classificação N3: registrada como `SERVER_SETTING` em `lib/pdv-settings-classification.ts`.

## 2. Decisão centralizada (uma só regra, quatro superfícies)

`lib/pdv-scan-unregistered-action.ts` (pura, sem React/DOM-real):

- `normalizePdvScanUnregisteredAction` — fail-safe para o default;
- `resolvePdvScanUnregisteredPolicy` — `{ action, showInsertHint, offersAvulsoContext, autoOpenAvulso }`;
- `hasBlockingPdvDialog` — guarda da autoabertura (nunca abrir por cima de modal crítico).

O provider expõe `pdvScanUnregisteredAction` já resolvido; cada superfície deriva a policy e
só a aplica **no branch de miss remoto** — depois que o fluxo existente (GOAL 005/006)
determina PRODUTO NÃO ENCONTRADO. Match exato, fuzzy único, múltiplos parciais e pesquisa
textual (A05, S23, G54, KD11C, "capinha samsung") **nunca** disparam a ação. Corrida real
descoberta pela prova de browser e corrigida: autoabertura, hint de Insert e contexto valem
**apenas para miss scan-like** (`scanLike &&` na condição) — miss de busca textual invalida o
contexto do último código e nunca abre modal.

## 3. Item Avulso com o código bipado (contexto, não cadastro)

- `ItemAvulsoModal` ganha `initialCodigo?: string | null`: semeia o campo
  "Código de barras / SKU" com o código lido + badge `capturado do bipe`; foco inicial
  permanece na Descrição; sem prop, abre limpo (comportamento atual).
- O código viaja no payload existente (`codigo` → `codigoAvulso` da linha; fila
  "Produtos a cadastrar" reutilizada). **Nenhum cadastro automático de Produto; nenhuma
  persistência silenciosa de SKU/barcode.**

## 4. Guardas do modo automático (opt-in)

- Um modal por scan: o campo é consumido ANTES do `await` (GOAL 005) — 2º Enter/CR/LF
  encontra o campo vazio e não repete o fluxo; todos os abridores passam por
  `openItemAvulso(seed)` (última escrita do seed vence).
- Novo scan não atravessa modal ativo: com diálogo aberto o keydown do PDV nem chega ao
  miss; `hasBlockingPdvDialog()` re-checa no fim do `await` (modal surgido durante a busca).
- Concluir/cancelar limpa campo, aviso e contexto transitório
  (`missedScanCodeRef`/`avulsoSeedCodigo`) e devolve o foco ao Código/Bipe via
  `onCloseAutoFocus` (contrato GOAL 006 preservado).
- Modo B: Insert só carrega o contexto se o campo segue vazio ("quando seguro"); modo A
  nunca carrega contexto.

## 5. Feedback por modo

- A: `Produto não cadastrado · <código>` (GOAL 006 intacto).
- B: `Produto não cadastrado · <código> · Insert para Item Avulso` — a copy viaja no ESTADO
  do aviso (`suggestsAvulso`), então o Clássico (overlay dentro do shell) recebe o hint sem
  nenhuma mudança em `pdv-omni-classic-shell.tsx`.
- C: aviso breve + modal no mesmo tick (a abertura não atrasa); sem toast redundante.

## 6. PDV Next/Black — auditado, sem mudança

`PdvBlackEdition` tem scanner próprio (toast + `select()` no miss), **não tem Item Avulso nem
Insert** e não usa a pilha compartilhada do GOAL 006. Adotar a configuração exigiria mudar
deliberadamente o comportamento dessa superfície → fora deste GOAL.
`PDV_NEXT_SUPPORTED=NO` · `PDV_NEXT_CHANGED=NO`.

## 7. Testes e validação

- Novos: `lib/pdv-scan-unregistered-action.test.ts` (normalização fail-safe, policy por modo,
  guarda de dialog); extensões em `lib/pdv-settings-server-first.test.ts` (precedência,
  fail-safe, merge, classificação, isolamento A≠B) e `lib/pdv-scan-input.test.ts` (hint no
  estado do aviso); contrato estático por superfície estendido em
  `components/dashboard/vendas/pdv-scan-autoclear.static.test.ts` (contexto, guarda da
  autoabertura, cleanup do modal, `initialCodigo`).
- `npm run typecheck` PASS · ESLint focado: **0 erros** (12 warnings — todos pré-existentes na
  base, contados na base limpa) · suite do GOAL (6 arquivos, 162 testes) PASS ·
  sweep lib+vendas+configurações: 7065 PASS, 7 falhas **pré-existentes/ambientais** (3 do
  xmllint ausente no Windows + 2 testes de varredura com timeout 5 s que falham igual na base
  limpa + multi-loja instável sob carga — todas reprovam também sem este GOAL).
- `npm run build` PASS. `git diff --check` limpo.
- Prova de browser (app real + login e2e + teclado real; dados sintéticos; sem venda real):
  **7/7 PNGs** em `docs/ai-execution/_evidence/PDV_SCAN_UNREGISTERED_ACTION_SETTINGS_007/` —
  configuração salva pela UI V3 e persistida após reload; modo A sem hint; modo B com hint e
  Insert abrindo o Item Avulso com o código; modo C autoabrindo uma única vez por scan com o
  código no contexto e concluir/cancelar devolvendo o foco; busca manual nunca abre modal.
  Validação por superfície e limitações honestas de ambiente:
  `docs/ai-execution/_evidence/PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007.md`.

## 8. Arquivos tocados

- libs: `pdv-scan-unregistered-action.ts` (novo) + teste, `pdv-scan-input.ts` (+teste),
  `pdv-settings-server-first.ts` (+teste), `store-settings-types.ts`,
  `store-settings-provider.tsx`, `pdv-settings-classification.ts`;
- componentes: `item-avulso-modal.tsx`, `pdv-scan-inline-feedback.tsx`,
  `use-pdv-scan-feedback.ts`, `pdv-classic.tsx`, `pdv-assistencia-enterprise.tsx`,
  `pdv-supermercado.tsx`, `venda-completa-enterprise.tsx`, `pdv-scan-autoclear.static.test.ts`,
  `configuracoes-v3/.../PdvSection.tsx`;
- fora do escopo intocado: cálculo/estoque/preço/desconto/pagamento, Caixa, Financeiro,
  Fiscal, Prisma/schema/migrations (nenhuma), auth/proxy, Operações V4, WhatsApp,
  Marketplace, scanner do Next/Black.
