# PDV Parity Suite — Auditoria N5 (somente leitura)

> GOAL `PDV-PARITY-SUITE-N5-PLAN-AUDIT-001` · auditoria read-only · nenhum código
> de produção alterado · nenhuma correção implementada neste GOAL.
> Base: `89428111d2e3ef473f69c00a5bdd611cfe283b02` (= `origin/main`, N4
> `ENCERRADO_PUBLICADO`). Data: 2026-09-13.

Fontes de verdade (ordem de precedência nesta auditoria):

1. Código vivo das 4 superfícies oficiais em `HEAD`.
2. Runtime de capabilities N4 publicado (`lib/pdv/*`, `lib/pdv-hold.ts`).
3. Roadmap canônico do módulo (`docs/pdv/PDV_CAPABILITIES_ROADMAP_REDUCED_002_003.md`,
   `docs/roadmaps/ROADMAP_PDV.md`).

Superfícies oficiais auditadas: `classic` · `assistencia` · `supermercado` ·
`venda-completa`. `next` = experimental/gated. `black` = next-shell.
`rapido` = modo (`isModoRapido`). `mesas` = flow/capability, não superfície.

Arquivos auditados (linhas medidas em `HEAD`):

| Arquivo | Linhas | surfaceId |
|---|---|---|
| `components/dashboard/vendas/pdv-classic.tsx` | ~2302 | `classic` (`:247`) |
| `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | ~3094–3260 | `assistencia` (`:920`) |
| `components/dashboard/vendas/pdv-supermercado.tsx` | ~2259 | `supermercado` (`:190`) |
| `components/dashboard/vendas/venda-completa-enterprise.tsx` | ~1878 | `venda-completa` (`:205`) |
| `components/dashboard/vendas/payment-modal.tsx` | ~2663 | compartilhado (6 callers) |
| `components/dashboard/vendas/vendas-pdv.tsx` | 46 | switcher via `PdvRegistry` |
| `lib/pdv/capability-support-matrix.ts` | 135 | matriz code-owned |
| `lib/pdv/resolve-capability.ts` | 221 | resolver puro |
| `lib/pdv/pdv-registry.ts` · `surface-ids.ts` · `capability-types.ts` · `use-pdv-capabilities.ts` | — | taxonomia + runtime |
| `lib/pdv-hold.ts` | 194 | holds loja+terminal + snapshot N4 |
| `lib/operations-store.tsx` (`finalizeSaleTransaction`) · `lib/ops-upsert-venda.ts` | — | motor compartilhado |

Legenda de classificação (GOAL §2):

- `PARITY_REQUIRED` — deve ser igual nas superfícies onde se aplica.
- `SURFACE_SPECIFIC` — diferença intencional por superfície/domínio.
- `UNSUPPORTED_BY_DESIGN` — sem implementação por decisão (matriz N4 / roadmap).
- `EXPERIMENTAL` — fora das 4 oficiais (next/black); registrado, não exigido.
- `GAP` — divergência real sem justificativa; entra no backlog N5 com severidade.
- `BUG_OUTSIDE_N5` — bug independente; não pertence ao N5; não corrigir aqui.

---

## A. Matriz das quatro superfícies

Cada linha = dimensão auditada. "Estado" resume o observado; "Classe" é a
classificação primária da dimensão; gaps pontuais têm ID próprio em §C.

### A.1 Núcleo de venda

| # | Dimensão | classic | assistencia | supermercado | venda-completa | Classe |
|---|---|---|---|---|---|---|
| 01 | busca de produto | `filteredProducts` + sugestões bipe | `fullSearch` top-50 + Enter adiciona se único | `filterCatalogByTerm` slice 50; vazio = `quickItems` (atalhos) | `filteredProducts` slice 10 + dropdown rico | PARITY_REQUIRED (deltas de apresentação) |
| 02 | scanner / código de barras | `parsePdvScanPrefix` + `findPdvProductByScan` + `lookupPdvScanRemote` + toast | mesmo caminho (+ `parsed.qty`) | mesmo caminho (`3x789`, EAN, remoto) | mesmo caminho (`parsePdvScanPrefix` + remoto multi-loja) | PARITY_REQUIRED |
| 03 | adição ao carrinho | `addToCart` + estoque agregado + intercept acessório/atributo/peso | `addItem` + serviço exige preço>0 + acessório | `addToCart` + `normalizeQtyForProduct` + acessório/atributo/peso | `addToCart` + `discountPct:0` + `garantiaDias` default | PARITY_REQUIRED |
| 04 | quantidade | `updateQuantity` + dialog F4, revalida estoque | `changeQty` + modal F4 + edição preço serviço | `updateQuantity` (peso passo 0.05) | `parseInt` inteiro (fracionado bloqueado, coerente c/ `scale` blocked) | PARITY_REQUIRED (+ GAP-P2-05 no peso Super, §C) |
| 05 | remoção de item | Delete/Esc-modo-rápido livres | F5/F6/Delete livres | PIN supervisor (exceto modo-rápido/admin) | trash por linha livre | GAP (GAP-P2-01) |
| 06 | limpar carrinho | F6 + confirm, limpa tudo | Ctrl+L + `AlertDialog`, limpa tudo | PIN-gated, zera desconto | "Limpar tudo" **parcial** (mantém cliente/desconto/tipo/obs) | GAP (GAP-P1-01, GAP-P2-01) |
| 07 | cliente | F2 + picker, opcional (`CONSUMIDOR`) | F2 + picker + gating total, opcional | F10 + picker, opcional | **obrigatório** (`Cliente obrigatório [F2]`) | PARITY_REQUIRED + SURFACE_SPECIFIC (obrigatoriedade na VC: fluxo enterprise c/ entrega/garantia) |
| 08 | descontos | states + cálculo cap subtotal; UI no PaymentModal | idem + `discountOverTotal` bloqueia | idem + audit `desconto_elevado` | idem + **`discountPct` por linha** (gated) | PARITY_REQUIRED + SURFACE_SPECIFIC (desconto por linha só VC) |
| 09 | formas de pagamento | PaymentModal + `formasPagamento` + gate `sales.paymentMethods` | idem (grid 3x2, filtra `carne/credito_vale/boleto`) | idem (3 quick + Múltiplo) | idem (sem `instantPayIntent`) | PARITY_REQUIRED |
| 10 | múltiplos pagamentos | F12 + `allowMultiplePayments` | F12 + botão Múltiplo | F12 + botão Múltiplo | só via modal (`allowMultiplePayments`, sem F12) | PARITY_REQUIRED (nomenclatura doc "F12" não se aplica à VC — §D.3) |
| 11 | crédito / vale | fetch + `creditDoc` fallback p/ cpf + sync local | fetch + badge + modal | fetch, **sem** fallback `creditDoc` | fetch, **sem** fallback `creditDoc` | PARITY_REQUIRED (+ GAP-P2-02) |
| 12 | venda em espera (save) | F7 + `withHoldCapabilitiesSnapshot`, scoped loja+terminal+`classic` | idem (`assistencia`) | idem (`supermercado`) | idem (`venda-completa`) | PARITY_REQUIRED |
| 13 | retomada de venda | `combineHoldSnapshotWithRuntime` + `resumeDiscountFields` | idem | idem | idem (+ `operationalLineDiscountPct`) | PARITY_REQUIRED |
| 14 | acessórios modelo/cor | intercept + `SelecionarAcessorioDialog` + `cartLineKey` + vai ao finalize | idem | idem | idem (preservado em hold/resume/finalize) | PARITY_REQUIRED |

### A.2 Domínio, atalhos, finalização, feedback, plataforma

| # | Dimensão | classic | assistencia | supermercado | venda-completa | Classe |
|---|---|---|---|---|---|---|
| 15 | serviços rápidos | ausente | catálogo + abas + `quickServicesEnabled` (gate exclusivo) | ausente (atalhos genéricos de serviço na grade ≠ capability) | ausente | SURFACE_SPECIFIC (só Assistência; matriz) |
| 16 | OS | hidrata `linkedOsId` via import comanda; sem lookup | sem `linkedOsId`/comanda | `linkedOsId` pass-through sem UI (invisível) | sem OS | SURFACE_SPECIFIC (hidratação Classic) + UNSUPPORTED_BY_DESIGN (`osLookup`; roadmap 031) + GAP-P3-13 (Super invisível) |
| 17 | mesas | sem botão (import único de comanda); fluxo em rota própria | sem botão; rota própria | sem botão inline; botão na page (`moduloControleConsumo` + gate) | **sem mesas** | SURFACE_SPECIFIC (switcher Classic/Assist/Super; VC excluída por matriz — não é gap) |
| 18 | atalhos de teclado | F1/F2/F3/F4/F5/F9/F6/F7/F8/F10(=F1)/F12/Insert/End/Esc/Del/Ctrl | F1/F2/F3/F4/F5/F6/F7/F8/F9/F10/F11/F12/END/DEL/Enter/Arrows/Insert/Ctrl+L/ESC-modo | Enter/Arrows/Insert/F7/F8/F9/F10/F2/F3/F4/F12/Esc-modo | F1/F2/F3/Insert/F7/End/Esc/Enter | GAP (GAP-P2-04 colisões; GAP-P3-01/02/03/04/06) |
| 19 | fechamento / finalização | `finalizeSaleTransaction` + guard unresolved + `{ok,pending}` | idem + `openCaixaIfClosed:false` explícito | idem | idem + `claimSaleFinalizeLock` (mutex) | PARITY_REQUIRED (+ GAP-P2-06: provar anti-duplo-submit nas 4) |
| 20 | erro / pending / retry | FAILED toast, carrinho intacto; PENDING toast 6s sem efeitos; retry em Vendas→Reenviar sync | idem | idem | idem | PARITY_REQUIRED (retry global por design; descoberta P3 em §C) |
| 21 | feedback de sucesso | `shellInfo ✓` + toast + cupom/post-sale | toast + `PdvPostSaleDialog`/`AutoPrint` | toast + post-sale + foco agressivo | `CupomNaoFiscal` + toasts | PARITY_REQUIRED (apresentação varia) |
| 22 | audit log | `sale_finalized` + `desconto_elevado` só CONFIRMED | idem | idem | idem | PARITY_REQUIRED (+ GAP-P3-15 formato divergente) |
| 23 | capability gates | 7 keys consultadas; `tables` page-level; `paymentMethods/multiplePayments` fail-closed **silencioso** | idem + `quickServices` exclusivo | idem | idem | PARITY_REQUIRED (+ GAP-P2-03 fail-closed silencioso; P3 transientes §C) |
| 24 | StoreSettings | `useStoreSettings` server-first; gate Nome Fantasia | idem + atalhos por loja anti-contaminação | idem + grade `atalhosRapidos` | idem + draft por loja | PARITY_REQUIRED |
| 25 | isolamento por loja | holds/estoque/crédito/remoto escopados loja(+terminal) | idem | idem | idem | PARITY_REQUIRED |
| 26 | comportamento de caixa | sessão exigida pré-pagamento (`garantirSessao`); server revalida | idem | idem (`caixaProntoParaFinalizar`) | porta dupla (`isCaixaProntoParaFinalizar` pré-modal + pré-motor) | PARITY_REQUIRED |
| 27 | estados vazio/loading/erro | empty `ItemsTable`; skeleton gate; toasts | empties por aba; skeletons; toasts + inline | empty grade/cart/cadastro; `LoadingState` page | empties; loading só cliente; toasts | PARITY_REQUIRED (apresentação varia) |

Contagens de dimensões (27): `PARITY_REQUIRED=21` · `SURFACE_SPECIFIC=3` (15, 16-hidratação,
17) · `GAP=3` (05, 06, 18). `UNSUPPORTED_BY_DESIGN=4` e `EXPERIMENTAL=2` contam
comportamentos/capabilities fora das linhas (ver §B).

### A.3 Matriz de atalhos por superfície (resumo §5 do GOAL)

`—` = sem implementação. `≠` = mesma tecla, semântica diferente (colisão).

| Tecla | classic | assistencia | supermercado | venda-completa |
|---|---|---|---|---|
| F1 | pagamento | finalizar (dinheiro/1º) | pagar quick[0] | finalizar |
| F2 | cliente | cliente | pagar quick[0] `≠` | buscar/limpar cliente |
| F3 | busca produto | foco busca | pagar quick[1] `≠` | foco produto |
| F4 | editar qtd | editar qtd | pagar quick[2] `≠` | — |
| F5 | recebimento | remover item `≠` | — | — |
| F6 | cancelar venda | remover item | — | — |
| F7 | espera | espera | espera | espera |
| F8 | foco bipe | trocas | trocas | — |
| F9 | recebimento (alias F5) | recebimento | recebimento (só tecla) | — |
| F10 | pagamento (=F1) | pagamento/desconto | cliente `≠` | — |
| F11 | — | fullscreen | — | — |
| F12 | multipagamento | multipagamento | multipagamento | — (só modal) |
| Insert | item avulso | item avulso | item avulso (só tecla) | item avulso |
| Delete | remover | remover | — | — |
| Ctrl+L | — (só no keymap-doc) | limpar | — | — |
| End | ajuda (doc diz "F1 ou End", código: só End) | ajuda | — | ajuda |
| Esc | limpa campo / modo-rápido remove último | fecha dropdown / modo-rápido remove último | modo-rápido remove último | fecha ajuda/inputs |

Achados: mesma tecla com comportamento diferente (F2/F4/F5/F10) → GAP-P2-04;
atalho sem botão (Super F9/Insert) → GAP-P3-12; botão/hint sem gate equivalente
(Múltiplo visível com `multiplePayments` off cai em `return` silencioso) →
GAP-P2-03; atalhos que furam capability: nenhum com efeito (gates verificados
antes do efeito; F2/F3 furam *modal* na Assistência mas respeitam capability);
atalhos mortos: Espaço/Ctrl+L no `PDV_KEYMAP` do Classic (GAP-P3-02), F5
redundante com F6 na Assistência (nota), itens do menu avançado Classic sem
wiring (GAP-P3-04). `SHORTCUT_PARITY_STATUS=DIVERGENTE_DOCUMENTADO` (núcleo
F1/F7/Insert/Esc convergente; F-keys de domínio divergentes sem decisão de
keymap-base unificado — roadmap prevê, sem GOAL aberto).

---

## B. Diferenças intencionais (não são gaps)

B-01. `quickServices` só na Assistência (`supportedBy:[assistencia]`, matriz
`capability-support-matrix.ts:57-62`). Catálogo de serviços, abas
Serviços/Produtos/Favoritos, preço manual. Expansão = FUTURE (roadmap 031).
`SURFACE_SPECIFIC`. Contagem: 1.

B-02. `tables`/mesas só no switcher Classic/Assistência/Supermercado via
page-level (`vendas-page-client.tsx` botão Mesas + `moduloControleConsumo`);
Venda Completa não expõe (matriz `:33`, registry `renderKey:none`).
`SURFACE_SPECIFIC`. Contagem: 1.

B-03. Hidratação Classic `linkedOsId` via import único de comanda
(`PDV_IMPORT_COMANDA_KEY`) + linhas virtuais OS. Integração legada local, não
lookup compartilhado. `SURFACE_SPECIFIC`. Contagem: 1.

B-04. Cliente obrigatório na Venda Completa (fluxo enterprise com endereço de
entrega, garantia, tipos de venda); opcional (`CONSUMIDOR`) nas demais.
`SURFACE_SPECIFIC`. Contagem: 1.

B-05. Desconto por linha (`discountPct`) + `LineDetail` (IMEI/serial/garantia/
obs) só na Venda Completa. `SURFACE_SPECIFIC`. Contagem: 1.

B-06. `isModoRapido` (beep/flash, Esc-remove, sem PIN, foco agressivo) é modo
transversal, não superfície; diferenças de feedback por modo são intencionais.
Nota (sem contagem).

`SURFACE_SPECIFIC_COUNT=5` (B-01..B-05).

Comportamentos `UNSUPPORTED_BY_DESIGN` (matriz N4 + roadmap; não exigir):

U-01. `pdv.filmLookup` — backend read-only existe; sem modal em nenhuma
superfície (roadmap 029, FUTURE).
U-02. `pdv.osLookup` — hidratação via comanda ≠ lookup; lookup compartilhado é
FUTURE (roadmap 031).
U-03. `pdv.scale.*` / `sale.fractionalQty` — blocked no resolver; balança via
diálogo de peso/hardware direto (sem override). Nuance: `disabled` no resolver
≠ "sem balança"; documentar para evitar leitura errada.
U-04. Next como superfície e Black como superfície — Next experimental/gated,
Black `next-shell` (`surface-ids.ts:30`, registry sem `black`).

`UNSUPPORTED_BY_DESIGN_COUNT=4`. `EXPERIMENTAL=2` (next, black-shell).

---

## C. Gaps reais de paridade

Prioridade orientada a risco: perda de venda · duplicidade · total divergente ·
pagamento divergente · estoque inconsistente · cliente incorreto · hold
incorreto · sucesso falso. Nenhum gap atinge o motor compartilhado
(`finalizeSaleTransaction`/idempotência/server), já convergente no N1.

### P1 (1)

GAP-P1-01 — Venda Completa: "Limpar tudo" parcial
(`venda-completa-enterprise.tsx:1237-1245` limpa só `cart/expanded/query/
dropdown`; mantém cliente, desconto, tipo, obs, endereço — vs reset total do
hold `:629-637` e do CONFIRMED `:950-960`). Risco: resíduo de cliente/desconto
na venda seguinte → cliente incorreto / total divergente. Fronteira: superfície
VC. Prova futura: teste de contrato do reset.

### P2 (6)

GAP-P2-01 — Remoção/limpeza com PIN de supervisor só no Supermercado
(`pdv-supermercado.tsx:1283-1307,1182-1224`; Classic/Assist/VC livres).
Divergência de política sem decisão registrada. Risco: fricção operacional /
inconsistência de controle. Decisão de produto pendente (uniformizar ou
declarar específico). Fronteira: superfícies.

GAP-P2-02 — Fallback `creditDoc`→cpf + sync local de crédito existe no Classic
(`:1971-1980`) e Black, mas não no Super (`:1539-1541`) nem na VC (`:798-800`).
Vale localizado por documento sem cliente selecionado falha onde o Classic
resolve. Risco: pagamento divergente / cliente incorreto no recibo. Fronteira:
callers do PaymentModal.

GAP-P2-03 — Fail-closed silencioso: `sales.paymentMethods` e
`pdv.multiplePayments` off retornam `false` sem toast e sem `disabled`
(Classic `:1320-1325`; Assist `:1334-1335`; botões/Múltiplo continuam visíveis;
F12 morto). Demais gates (F2/F7) escondem/desabilitam. Risco: confusão
operacional (botão morto no rush). Fronteira: superfícies + PaymentModal.

GAP-P2-04 — Colisões semânticas de F-keys entre superfícies (tabela §A.3):
F2/F4 = cliente/qtd (Classic/Assist) vs pagamento quick (Super); F5 =
recebimento (Classic) vs remover (Assist); F10 = pagamento (Classic/Assist) vs
cliente (Super); F12 ausente na VC. Núcleo F1/F7/Insert/Esc convergente.
Risco: operador multi-superfície executa ação errada (ex.: F5 apaga item onde
se esperava recebimento). Requer decisão de keymap-base (roadmap prevê
unificado). Fronteira: superfícies. Sem correção neste GOAL.

GAP-P2-05 — Supermercado: confirmação de peso aceita linha R$0
(`confirmWeightDialog`, `precoPorKg ?? price` sem validação `>0` —
vs Assistência que exige preço de serviço `>0` com toast). Risco: total
divergente (requer produto-por-peso com preço zerado no catálogo). Fronteira:
Super. Prova futura: teste de contrato.

GAP-P2-06 — Mutex de finalização (`claimSaleFinalizeLock`) só na VC (`:740`);
demais superfícies dependem de `finalConfirmBusyRef` do modal. Sem prova de que
a cobertura anti-duplo-submit (teclado F1 duplo, Enter duplo) é equivalente.
Risco potencial: duplicidade. Classificado P2 como item de prova (não como
defeito confirmado). Fronteira: contrato + suite.

`GAPS_P0=0` · `GAPS_P1=1` · `GAPS_P2=6`.

### P3 (15)

GAP-P3-01 — Classic: help diz "F1 ou End" abre ajuda; código: End=ajuda,
F1=pagamento (`:1342-1346,2257`).
GAP-P3-02 — Classic: `PDV_KEYMAP` lista Espaço=Finalizar e Ctrl+L=Limpar sem
handler (`:27,29` vs handler `:1411`).
GAP-P3-03 — Classic: F10 (Desconto) é alias exato de F1; nada diferencia.
GAP-P3-04 — Classic: menu Funções Avançadas lista Orçamentos/Sangria/
Suprimento/Reimprimir sem wiring (clique silencioso; só Trocas/Devoluções
chamam).
GAP-P3-05 — Classic: transientes vs toggle — `accessoryProduct` preso se
`accessoryModelColor` desligada mid-flow (`:2228`); desconto aplicado sobrevive
ao toggle off até resume/reload.
GAP-P3-06 — Assist: `HELP_SHORTCUTS` omite F5/F7/Insert/Ctrl+L/Arrows;
documenta F9=Limpar (runtime=F9 Recebimento); hint `kbd F2` no campo F3;
mensagem de desconto aponta F7 (espera) em vez de F10.
GAP-P3-07 — Assist: badge de crédito exibe com `customerStoreCredit` off
(fetch zerado `:1063`, mas badge lê ledger local `:1079,2618-2623`; modal
recebe 0 corretamente).
GAP-P3-08 — Assist: escrita local de desconto (`:2905-2914`) e
EditarAtalhos-serviço sem gate local (proteção só no modal/resume).
GAP-P3-09 — VC: F7 guarda parcial (`:417` ignora itemAvulso/espera/accessory
que `anyModalOpen :385` cobre).
GAP-P3-10 — VC: Enter no cliente sem checar `customerSearchEnabled` (`:1144`;
input `disabled :1134` mitiga) + restore de draft sem `resumeDiscountFields`/
revalidação (`:322-348` vs resume `:649-664`).
GAP-P3-11 — VC: cupom omite `discountPct` por linha e IMEI/serial/garantia
(vão só ao `enrich`); banner diz "serão salvos no cupom e no sistema".
GAP-P3-12 — Super: F9 Recebimento e Insert Avulso só-tecla (sem botão;
operador mouse-only não descobre).
GAP-P3-13 — Super: `linkedOsId` pass-through sem UI (`:178,1529`) — venda pode
carregar OS invisível; voz injeta linha sem validação prévia (fail-closed só no
confirm); `quickItems` fallback mascara grade vazia (`:335`).
GAP-P3-14 — Super: imposto estimado só display (não entra no
`finalizeSaleTransaction` nem no breakdown; divergência potencial visor×fiscal).
GAP-P3-15 — Formato do `appendAuditLog sale_finalized` divergente entre
superfícies (`formatBrlAudit` vs `brl` vs `pagamentosResumo`).

`GAPS_P3=15`. Total de gaps: 22 (0/1/6/15).

---

## D. Contrato N4 — coerência

D-01. Support matrix (`capability-support-matrix.ts:25-105`) × runtime wiring
(`usePdvCapabilities(surfaceId)` fixo e correto nas 4 superfícies; precedência
`blocked > unsupported > override > default` em `resolve-capability.ts:42-90`)
× comportamento observado: **COERENTES**. Toda capability `supportedBy` tem
gate operacional nas superfícies declaradas; `tables` é page-level (botão Mesas
fora dos shells — separação arquitetural documentada, não divergência);
`quickServices` exclusivo Assist; `filmLookup/osLookup` ausentes em toda parte;
snapshot de hold (`withHoldCapabilitiesSnapshot` no save +
`combineHoldSnapshotWithRuntime` + `resumeDiscountFields` no resume) presente
nas 4; holds legados sem snapshot continuam válidos (runtime puro).

D-02. `PdvRegistry` dirige o switcher (`vendas-pdv.tsx:27-45`); taxonomia
oficial `[classic,assistencia,supermercado,venda-completa]` = registry =
matriz; Next experimental+gated; Black ausente do registry (shell).
**COERENTE**. `CAPABILITY_RUNTIME_COHERENT=true`.

D-03. Divergências doc×código (não quebram o contrato, registrar para
alinhamento): matriz cita "F12 / forma multiplo" para `multiplePayments`, mas
a VC não tem F12 (só modal); roadmap citava perda de `accessorySelection` na
Completa (~`:634`) — **verificado desatualizado**: seleção preservada em
add/hold/resume/finalize; contagem de linhas citada no escopo difere do HEAD
(arquivos cresceram; irrelevante).

D-04. N4 não é reaberto. Nenhuma regressão factual nova do N4 encontrada:
`N4_REGRESSION_FOUND=false`. Evidência: (i) `HEAD == origin/main == 89428111`;
(ii) wiring N4 íntegro nas 4 bordas; (iii) suite `capability-runtime` 30 its
verde; (iv) o único teste vermelho no escopo
(`pdv-pending-post-sale-effects.static` / Black `writeCupom`, 1 failed em 119)
quebrou no N2 (`cadf188`, rename `writeCupom`→`writePdvBlackCupom`), anterior ao
N4 — é brittleness de teste estático, registrado como BUG_OUTSIDE_N5-03, sem
efeito em runtime (pending continua antes do cupom no Black).

---

## E. Cobertura atual (inventário)

Método: inspeção de arquivos de teste + execução read-only de subconjunto
(`capability-runtime`, `pdv-hold`, `pdv-formas-pagamento`, `pdv-payments`,
`pdv-finalize-integrity`: 62/62 verde; bloco motor: 118/119, 1 falha
pré-existente test-only §D-04). E2E não executado (fora do necessário).

| Contrato PARITY_REQUIRED | Estado | Evidência |
|---|---|---|
| resolver/matriz/registry/switcher/multi-loja | TESTED | `lib/pdv/capability-runtime.test.ts` (~30 its) |
| hold round-trip/isolamento loja+terminal/filtro pdvType | TESTED | `lib/pdv-hold.test.ts` |
| hold snapshot no resume + desconto retomado | PARTIAL | só no `capability-runtime` (estático); sem teste de resume por superfície |
| formas default/mapeamento/assistência | PARTIAL | `lib/pdv-formas-pagamento.test.ts` (sem `permitirTroco/NoMultiplo`, auth, hotkeys) |
| troco/somas/normalização | PARTIAL | `lib/pdv-payments.test.ts` (só dinheiro) |
| tri-estado CONFIRMED/PENDING/FAILED + `findUnresolvedSaleLines` por superfície | PARTIAL | `lib/pdv-finalize-integrity.test.ts` (puro; sem integração c/ finalize real) |
| pending antes de efeitos por superfície | PARTIAL | `pdv-pending-post-sale-effects.static.test.ts` (indexOf; 1 stale no Black) |
| mutex anti-duplo-submit | PARTIAL | `sale-finalize-busy.test.ts` (unit; sem prova por superfície — GAP-P2-06) |
| server: idempotência replay, vale, aprazo, fiscal handoff, safety, linhas | TESTED | `lib/ops-upsert-venda*.test.ts` (13 arquivos) |
| caixa sessão/terminal | TESTED | `lib/pdv-caixa-session.test.ts`, `lib/caixa/*` |
| busca/scan/prefixo/produto | TESTED | `lib/pdv-product-search/scan-lookup/scan-prefix`, `lib/catalog/*` |
| acessórios modelo/cor + readback | TESTED | `lib/acessorios/*`, `lib/vendas/accessory-selection-readback` |
| atalhos assistência (helpers) | PARTIAL | `lib/pdv-assistencia-shortcuts.test.ts` (helpers, não keymap) |
| matriz de props do PaymentModal × superfície | UNTESTED | nenhum teste renderiza props por caller |
| keymap por superfície (tecla→efeito→gate) | UNTESTED | — |
| fluxo E2E por superfície (split F12, vale, aprazo, troco, retry mesma identidade, quarentena, audit) | UNTESTED | `e2e/specs/02-pdv-vendas.spec.ts` = 1 smoke de 28 linhas |
| desconto total/per-linha, cliente search, draft restore, reset total | SOURCE_INSPECTION_ONLY | sem teste dedicado encontrado |
| numeração server-side | TESTED | `lib/vendas/server-sale-numbering*`, `app/api/stores/numeracao-venda/*` |

`TEST_COVERAGE_STATUS=PARCIAL` — motor/server bem cobertos; bordas (props,
keymap, fluxo por superfície) sem prova automatizada. Nenhum `*.test.*` novo
criado neste GOAL (read-only).

---

## F. Suite de testes proposta (futura N5)

Princípio do GOAL: preferir helpers puros > contrato > integração focada >
E2E mínimo. Nomes sugeridos (não criados aqui):

1. `lib/pdv/parity-payment-props.test.ts` — contrato: props que cada superfície
   passa ao PaymentModal (gates × defaults; cobre callers Classic/Super/Assist/
   VC; prova GAP-P2-02/P2-03). Puro/contrato.
2. `lib/pdv/parity-keymap.test.ts` — contrato: mapa tecla→efeito→gate por
   superfície a partir de fonte única (cobre A.3; prova GAP-P2-04; congela
   correções P3-01/02/03/06). Puro (exige extrair keymap p/ helper — implementação N5).
3. `lib/pdv/parity-hold-resume.test.ts` — snapshot+`resumeDiscountFields`+
   `operationalLineDiscountPct` por superfície, incl. hold legado e draft VC
   (prova GAP-P3-10). Puro.
4. `lib/pdv/parity-finalize-guards.test.ts` — unresolved-fail-closed,
   preço>0 (GAP-P2-05), mutex duplo-submit por superfície (GAP-P2-06),
   `creditDoc` fallback (GAP-P2-02). Contrato/integração focada.
5. `lib/pdv/parity-cart-reset.test.ts` — reset total pós-venda/hold/limpar por
   superfície (prova GAP-P1-01). Contrato.
6. `lib/pdv/parity-feedback.test.ts` — fail-closed audível (toast/disabled) com
   capability off (prova GAP-P2-03). Integração focada.
7. Reparo `pdv-pending-post-sale-effects.static.test.ts` (Black
   `writePdvBlackCupom`) — manutenção test-only (BUG-03).
8. E2E mínimo (estender `e2e/specs/02-pdv-vendas.spec.ts`): 1) split F12 →
   confirm; 2) vale → saldo; 3) aprazo entrada+parcelas → títulos; 4) PENDING →
   Reenviar mesma identidade; 5) audit `sale_finalized` por superfície. Só onde
   helper/contrato não comprova.

`PROPOSED_N5_SUITE=F-01..F-08` acima.

---

## G. Ordem recomendada de implementação (sub-GOALs N5)

Agrupados por fronteira técnica. Nada iniciado neste GOAL.

N5-A — Contrato das bordas + suite base (fronteira: `components/dashboard/
vendas/*` + `lib/pdv/*`, só testes + extração de keymap p/ helper).
Cobre: F-01, F-02, F-06, F-07; congela P3-01/02/03/06; prova P2-03/P2-04.
Risco baixo (majoritariamente testes).

N5-B — Paridade operacional P1/P2 (fronteira: as 4 superfícies, sem schema).
Cobre: P1-01 (reset total VC), P2-01 (política PIN), P2-02 (`creditDoc`),
P2-05 (peso >0), P2-06 (mutex), P3-04/05/07/08/09/10/11/12/13/14/15.
Requer decisão de produto em P2-01 e P2-04 antes de codar. Risco médio.

N5-C — Fluxo ponta a ponta mínimo (fronteira: `e2e/` + fixtures).
Cobre: F-08 (5 cenários); fecha `TEST_COVERAGE_STATUS=VERDE`.
Risco baixo; depende de N5-B para os cenários P1/P2.

`PROPOSED_SUBGOALS=N5-A, N5-B, N5-C`.

---

## Apêndice H. Bugs fora do N5 (não corrigir aqui)

BUG-01 — `components/dashboard/vendas/pdv-venda-completa-enterprise.tsx`:
duplicata legada não roteada (código morto; header do próprio arquivo
confirma zero imports; remoção exige decisão de Rafael + ajuste em
`DT13_FILES` de `multi-loja-client-no-legacy-fallback.test.ts`). Contém filtro
silencioso `inventory.some` sem fail-closed — irrelevante em runtime por ser
morto. `BUG_OUTSIDE_N5`.

BUG-02 — Black (next-shell, experimental, fora do escopo): zero `appendAuditLog`
em venda confirmada; resume de hold sem `combine/resumeDiscountFields`
(`PdvBlackEdition.tsx:303-318`); F6/F8/F11 mortos ou "Em breve". Não exigir
paridade; pertence a N2/futuro. `BUG_OUTSIDE_N5`.

BUG-03 — `lib/pdv-pending-post-sale-effects.static.test.ts:203` espera literal
`writeCupom` no Black; fonte usa `writePdvBlackCupom` desde N2 (`cadf188`).
Falha pré-existente em `origin/main` (1 failed/119 no bloco motor), test-only,
sem efeito em runtime. Reparo na N5-A (F-07). `BUG_OUTSIDE_N5`.

Exclusões respeitadas (não auditadas como requisito): Next/Black como
superfície, plano/entitlement (N7), settings-UI comercial (N6), schema/
migrations, redesign visual, ressalvas antigas da R3, N6/N7.

---

## Apêndice I. Validações deste GOAL (read-only)

- `BASE_SHA=89428111d2e3ef473f69c00a5bdd611cfe283b02`, `HEAD_SHA=idem`,
  `origin/main=idem` (verificado via `git rev-parse`).
- Working tree: só `?? generated/` (não incorporado); stashes pré-existentes
  listados e não tocados; nenhum WIP incorporado.
- Testes executados (somente existentes): bloco capabilities 62/62 verde;
  bloco motor 118/119 (1 falha test-only pré-existente, §D-04). E2E não
  executado. `tsc`/`build` não requeridos (só documento).
- `git diff --check` limpo (só adição do presente documento).
- Nenhum código de produção alterado; nenhum schema/migration; support matrix
  intocada; Next/Black não reabertos.
