# AUDITORIA OPERACIONAL — PDV / FLUXOS DE VENDA (FINAL) — v03

> **Modo:** READ ONLY — nenhuma linha de código foi alterada. Nada commitado/pushado.
> **Data:** 2026-06-10 · **Autor:** Claude Code (Opus) · **Escopo:** todos os PDVs e telas de venda do OmniGestão Pro.
> **Pergunta central:** *se a RafaCell vender o dia inteiro amanhã usando o PDV, o que ainda pode quebrar, travar, confundir, vender errado, lançar errado no caixa ou perder venda?*
> **Operações V3:** NÃO tocada. Financeiro HUB só lido no necessário para entender Caixa/Recebimento.
>
> **Por que v03 (e não v01):** o GOAL pedia `..._v01.md`, mas **`v01` já está commitado** e **`v02` já existe**
> (untracked). Sobrescrever um relatório commitado destruiria histórico de auditoria. Este **v03 re-verifica o
> v01/v02 contra o código de hoje** e **acrescenta provas novas** (git history + camada PWA). Onde confirma o
> anterior, marca `(=v02)`. **O v01/v02 seguem válidos no diagnóstico de fundo; o v03 apenas afia a conclusão da
> queixa nº 1 e checa o que foi/não foi corrigido desde ontem.**

---

## 0. O que mudou entre o v02 (ontem) e hoje — TL;DR

- **Nada de código mudou nos PDVs no último dia.** Os 5 commits mais recentes do repo são todos de **Operações V3**
  (`f1f2622`, `960fbdf`, `effcbc1`, `96e0766`, `3d199d9`). Os arquivos de PDV envolvidos na queixa nº 1
  (`vendas-pdv.tsx`, `pdv-classic.tsx`, `pdv-classic-layout.ts`, `store-settings-types.ts`, `VendasHub.tsx`) **não
  foram tocados** desde antes do v02.
- **A correção sugerida no v02 (Fase 0) NÃO foi aplicada.** Continuam vivos: o tipo órfão `"venda-completa"`, a
  prop morta `classicLayoutKind`, o componente duplicado `pdv-venda-completa-enterprise.tsx`, a rota placeholder
  `/vendas/nova` e o estado morto `saleMode`. Ver §6/§7.
- **Prova nova (git):** o card "Venda Completa" aponta para `/dashboard/vendas/venda-completa` **desde o primeiro
  commit do arquivo** (`365418a`) — **nunca** apontou para o PDV comum. O link **nunca regrediu em código**.
- **Vetor novo (PWA):** o app roda como **PWA com Service Worker ativo em produção** (`skipWaiting: true`,
  `cacheOnFrontEndNav: true`). Isso é uma causa clássica e plausível de **"a gente corrigiu e voltou"** — um
  cache antigo na máquina da loja pode servir bundle/shell defasado. Ver §7 (R-05) e §10 (Fase 0).

---

## 1. Resumo executivo

**Veredito geral:** o **núcleo transacional do PDV está saudável e seguro para operar**. Há um **motor único de
venda** — `finalizeSaleTransaction` (`lib/operations-store.tsx`) — que centraliza, em um só lugar e para **todos**
os PDVs: bloqueio de caixa fechado, validação de estoque, conferência soma-pagamentos × total (tolerância 0,02),
exigência de CPF para à-prazo/crédito, baixa de estoque, lançamento no caixa/ledger, persistência no banco e
**rede de segurança de reenvio**. **Não há PDV "fantasma"** que venda sem registrar, nem auto-abertura silenciosa
de caixa. **Nenhum P0 ativo confirmado.** (Verificado linha a linha — ver §6 e Anexo.)

**Sobre a queixa nº 1 ("Venda Completa abrindo o PDV comum") — conclusão afiada:**

1. ✅ **O link do card está correto e SEMPRE esteve.** O card "Venda Completa" do Vendas HUB aponta para
   `/dashboard/vendas/venda-completa` (`VendasHub.tsx:45`) **desde o commit `365418a`** (git `-S`/`show` provam:
   o href nunca foi `/dashboard/vendas`). A rota renderiza o fluxo **enterprise real e distinto**
   `VendaCompletaEnterprise`, **sem redirect** (`venda-completa/page.tsx` → `venda-completa-page-client.tsx` →
   `VendaCompletaEnterprise`). **Não há regressão de código no caminho do card.**
2. ⚠️ **Existe, sim, um mecanismo vivo que produz o sintoma — mas por OUTRA porta, não pelo card** `(=v02)`. Em
   `/dashboard/vendas` (a rota do PDV), se o `localStorage` da máquina tiver `omni-pdv-classic-layout =
   "venda-completa"` (resíduo legado), `readPdvClassicLayout()` retorna esse valor (`pdv-classic-layout.ts:24`) e
   `vendas-pdv.tsx:118-123` o **normaliza para `"lovable"`** → renderiza o **PDV Clássico comum**, em silêncio. A
   prop `classicLayoutKind` que chega ao `PdvClassic` (`pdv-classic.tsx:176,188`) **continua sem uso**. Ninguém
   grava mais esse valor pelas Settings (só `services`/`lovable`), mas resíduo é plausível. → **B-07/R-04.**
3. ⚠️ **Vetor adicional novo — cache do PWA (R-05).** Como o link nunca quebrou em código, a percepção
   "corrigimos e voltou" tem como suspeito nº 1 o **Service Worker**: `cacheOnFrontEndNav: true` pré-cacheia
   páginas na navegação SPA e `skipWaiting: true` troca o SW na hora, mas um **precache antigo** pode servir um
   shell/bundle defasado na máquina específica da RafaCell. Reproduz "na loja sim, no clone limpo não" — igual ao
   `localStorage`. **É hipótese operacional, não bug de código** — teste em §10.

> **Tradução prática para o balcão:** clicar no card "Venda Completa" **abre a tela certa** na base de código de
> hoje. Se na máquina da loja ainda abre o PDV comum, a causa é **estado da máquina** (localStorage legado **ou**
> Service Worker cacheado), **não** o link. O conserto de raiz (tratar/sanear `"venda-completa"` + limpar PWA)
> está descrito na Fase 0.

**Onde mora o resto do risco operacional (na borda, não no núcleo):**

1. **Divergência grave de atalhos** — no **Supermercado**, `F2/F3/F4` são **pagamento** (dinheiro/PIX/débito —
   `pdv-supermercado.tsx:647-655`, **verificado**); nos demais PDVs são **cliente/busca/quantidade**. Memória
   muscular do Clássico → F3 "buscar" abre **pagamento PIX** no Supermercado. **(P1)** `(=v02)`
2. **Busca do Supermercado é mais fraca** — `.toLowerCase().includes()` cru, **sem acento e sem multi-termo**
   (`pdv-supermercado.tsx:274-293`, **verificado**), enquanto Clássico/Assistência usam o motor canônico
   `lib/pdv-product-search.ts`. → "não acha o produto" no balcão. **(P2)** `(=v02)`
3. **Cobertura de recursos desigual** — Supermercado sem cliente e sem trocas/devolução; Venda Completa sem
   abrir caixa / item avulso / espera / devolução. **(P1/P2)** `(=v02)`
4. **Persistência otimista** — venda gravada local + POST "fire-and-forget"; em falha fica `syncPending`
   (`operations-store.tsx:1336`) com **reenvio automático** (online/foco/30s) + manual, mas o aviso ao operador é
   **só um toast transitório**. Risco residual baixo, mitigação forte. **(P1)** `(=v02)`

PDVs experimentais/legados (`pdv-next`, `pdv-github-original`) seguem **bloqueados em produção** por feature flag.

---

## 2. Inventário de PDVs / telas de venda

| # | Tela | Rota | Componente | O que é | Estado |
|---|------|------|------------|---------|--------|
| 1 | **PDV Clássico** | `/dashboard/vendas` (shell omni-smart) | `pdv-classic.tsx` via `vendas-pdv.tsx` | Balcão padrão | **Funcional** |
| 2 | **PDV Supermercado** | `/dashboard/vendas` (perfil supermercado/variedades) | `pdv-supermercado.tsx` | Balcão bipe-first | **Funcional (divergente)** |
| 3 | **PDV Assistência** | `/dashboard/vendas` (`pdvClassicLayout="services"`) | `pdv-assistencia-enterprise.tsx` | Balcão assistência (mais completo) | **Funcional** |
| 4 | **Venda Completa** | `/dashboard/vendas/venda-completa` | `venda-completa-enterprise.tsx` | Venda comercial estruturada (cliente obrigatório) | **Funcional** |
| 5 | **PDV Rápido** | `/dashboard/vendas?modo=rapido` | *flag* `isModoRapido` sobre os shells 1–3 | **Não é PDV separado** — modo compacto | **Funcional (modo)** |
| 6 | **PDV Next (Black)** | `/dashboard/pdv-next` | `components/pdv-next/PdvBlackEdition.tsx` | 4º PDV experimental | **Bloqueado em prod** (flag) |
| 7 | **PDV GitHub Original** | `/dashboard/pdv-github-original` | espelho `components/pdv-github-original/**` | Referência interna | **Bloqueado em prod** (flag) |
| 8 | **Mesas / Controle de Consumo** | `/dashboard/vendas/mesas` | `controle-consumo.tsx` | Comanda/mesa (gated por `pdvParams.moduloControleConsumo`) | **Funcional (opt-in)** |
| 9 | **Histórico de Vendas** | `/dashboard/vendas-arquivo-geral` | `vendas-arquivo-geral.tsx` | Arquivo geral + **Reenviar sincronização** | **Funcional** |
| 10 | **Vendas HUB** | `/dashboard/vendas-hub` | `VendasHub` (TanStack Router) | Cards de navegação | **Funcional** |
| 11 | `/dashboard/pdv` | redirect → `/dashboard/vendas` | `app/dashboard/pdv/page.tsx` | Alias | **OK** |
| 12 | `/dashboard/historico-vendas` | redirect → `/dashboard/vendas-arquivo-geral` | — | Alias legado | **OK** |
| 13 | **Venda Completa Enterprise (duplicata)** | — (não roteada) | `pdv-venda-completa-enterprise.tsx` | 2ª cópia que re-exporta `VendaCompletaEnterprise` | **Órfã / dead code** ⚠️ B-07 (ainda presente) |
| 14 | **Venda Completa (placeholder TanStack)** | `/dashboard/vendas-hub/vendas/nova` | `lovable/routes/vendas.nova.tsx` → `PlaceholderModule` | Rota órfã alcançável por URL | **Placeholder (morto)** (ainda presente) |

> **Como o shell é escolhido (crítico):** em `/dashboard/vendas`, a unidade vê **UM** dos três shells — não há
> menu para trocar. `vendas-pdv.tsx`: `layout === "supermercado"` → Supermercado (`:116`); `resolvedClassicLayout
> === "services"` → Assistência (`:125`); **qualquer outro valor** (inclusive o legado `"venda-completa"`,
> normalizado para `"lovable"` em `:118-123`) → **Clássico comum** (`:133`). É essa cadeia que produz o R-04.

---

## 3. Matriz por PDV — funcional / parcial / placeholder / quebrado

| PDV | Classificação | Observação |
|-----|---------------|------------|
| PDV Clássico | **Funcional** | Keymap completo, busca canônica, caixa, espera, devolução, item avulso, impressão. |
| PDV Assistência | **Funcional** | O mais completo (trocas/devolução F8, cliente, recebimento, desconto, fullscreen). |
| PDV Supermercado | **Funcional, parcial nas bordas** | Sem cliente, sem trocas/devolução; busca mais fraca; atalhos com semântica própria. |
| Venda Completa | **Funcional** | Cliente obrigatório, gated por caixa; **sem** abrir caixa na tela, sem espera/avulso/devolução. |
| PDV Rápido (modo) | **Funcional** | Flag sobre os shells; não é tela própria. |
| PDV Next (Black) | **Placeholder operacional (bloqueado)** | Já chama `finalizeSaleTransaction` + gate de caixa, mas segue bloqueado por flag; texto do bloqueio desatualizado. |
| PDV GitHub Original | **Placeholder (bloqueado)** | Espelho de referência; bloqueado por flag. |
| `pdv-venda-completa-enterprise.tsx` | **Órfã / dead code** | Duplicata não roteada (B-07) — **ainda presente**. |
| Rota `/vendas/nova` | **Placeholder morto** | `PlaceholderModule` órfão; não linkado pelo card — **ainda presente**. |

---

## 4. Matriz de atalhos por PDV

Fonte (verificada): `pdv-classic.tsx` (keymap omni-smart) · `pdv-supermercado.tsx:624-660` ·
`pdv-assistencia-enterprise.tsx` (keydown global).

| Tecla | PDV Clássico | PDV Supermercado | PDV Assistência |
|------:|--------------|------------------|-----------------|
| **F1** | Finalizar / Pagamento | — | Pagamento (dinheiro) |
| **F2** | **Busca cliente** | **Pagamento rápido #1 (dinheiro)** ⚠️ | Toggle cliente |
| **F3** | **Busca produto** | **Pagamento rápido #2 (PIX)** ⚠️ | Foca busca |
| **F4** | **Editar quantidade** | **Pagamento rápido #3 (débito)** ⚠️ | Editar quantidade |
| **F5** | Receber contas (gate caixa) | — | Remove item selecionado |
| **F6** | Cancelar venda | — | Remove item selecionado |
| **F7** | Venda em espera | **Venda em espera** | Venda em espera |
| **F8** | Volta ao bipe | — | **Trocas / Devoluções** |
| **F9** | Receber contas (alias F5) | **Recebimento** | Recebimento |
| **F10** | Desconto (abre pagamento) | — | Desconto |
| **F11** | — | — | **Fullscreen** |
| **F12** | Pagamento múltiplo | Pagamento múltiplo (se habilitado) | Pagamento múltiplo |
| **Insert** | Item avulso | **Item avulso** | Item avulso |
| **Delete** | Remove item sel./último | — | — |
| **End** | Ajuda de teclado | — | — |
| **Esc / setas** | Esc remove último; ↑↓ navega carrinho | — | — |

**Divergências de risco (⚠️):** `F2/F3/F4` têm significado **oposto** no Supermercado (pagamento, conforme
`pdv-supermercado.tsx:647-655` — **lê `formasSupermercado.quick[0..2]` com fallback dinheiro/PIX/débito**) vs.
Clássico/Assistência (cliente/busca/quantidade). `F5/F6/F8/F10` só existem em parte dos PDVs. **`Insert` (item
avulso)** e **`F7` (espera)** são os **únicos 100% consistentes** entre os três (verificado: ambos presentes no
Supermercado, `:644-645`).

> **Boa notícia operacional (verificada):** o keydown do Supermercado **respeita os modais** — só dispara fora de
> input e **só intercepta** quando nenhum modal está aberto (`:640` lista `isPaymentModalOpen, attrDialogOpen,
> weightDialogOpen, showItemAvulsoModal, vendaEsperaOpen, recebimentoOpen`, e o deps array `:660` inclui todas).
> Isso é o **padrão-ouro** de keydown (sem closure stale — lição registrada no projeto).
>
> **Doc desatualizada:** `PDV_HOTKEYS.md` (skill) ainda diz **F11 = Suspender venda** na Assistência. No código
> atual **F11 = Fullscreen** e **F7 = Suspender**. Doc, não bug de código.

---

## 5. Matriz de recursos por PDV

Legenda: ✅ presente · ⚠️ presente com ressalva · ❌ ausente

| Recurso | Clássico | Supermercado | Assistência | Venda Completa |
|--------|:--------:|:------------:|:-----------:|:--------------:|
| Abrir/Fechar caixa (`CaixaStatusBar`) | ✅ | ✅ | ✅ | ❌ (só avisa "abra o caixa") |
| Status do caixa visível | ✅ | ✅ | ✅ | ✅ (texto) |
| Bloqueio de venda com caixa fechado | ✅ (motor `:1204-1216`) | ⚠️ (só falha no finalizar) | ✅ (motor) | ✅ (gate + `canFinalize`) |
| Busca por nome/SKU/EAN/código | ✅ canônica | ⚠️ própria, sem acento/multi-termo | ✅ canônica | ✅ canônica |
| Scanner / código de barras (`findPdvProductByScan`) | ✅ | ✅ | ✅ | ✅ |
| Seleção de cliente | ✅ `useClienteSearch` | ❌ (cliente = null) | ✅ `PdvClientePicker` | ✅ obrigatório |
| Desconto | ✅ | ✅ (R$/%) | ✅ | ✅ |
| Item avulso (Insert) | ✅ | ✅ | ✅ | ❌ |
| Forma de pagamento (`PaymentModal`) | ✅ | ✅ | ✅ (modal próprio) | ✅ |
| Pagamento múltiplo / split | ✅ F12 | ✅ F12 (se habilitado) | ✅ F12 | ✅ |
| Impressão de comprovante | ✅ pós-venda | ✅ | ✅ | ✅ `CupomNaoFiscal` |
| Venda em espera (F7) | ✅ | ✅ | ✅ | ❌ |
| Cancelamento / Devolução | ✅ `TrocasDevolucao` | ❌ | ✅ `TrocasDevolucao` + F8 | ❌ |
| Integração com estoque (baixa/restaura) | ✅ motor `:1267-1272` | ✅ motor | ✅ motor | ✅ motor |
| Integração com financeiro/caixa | ✅ | ✅ | ✅ | ✅ |
| Venda à prazo → Contas a Receber | ✅ | ✅ | ✅ | ✅ (tipo `a_prazo`) |
| Multi-loja (`storeId` no persist) | ✅ | ✅ | ✅ | ✅ |

**Lacunas notáveis:** Supermercado sem **cliente** e sem **devolução**; Venda Completa sem **abrir caixa / item
avulso / espera / devolução**.

---

## 6. Bugs encontrados

> Apenas auditoria — nada corrigido. Severidade entre colchetes. Itens marcados `(=v02)` foram **re-verificados**
> contra o código de hoje e **confirmados**; os demais são afinamentos do v03.

- **B-07 [P1 latente / P3 dead code] — Layout `"venda-completa"` órfão + prop `classicLayoutKind` morta + componente duplicado. STATUS: NÃO corrigido desde o v02.**
  - `PdvClassicLayoutKind = "lovable" | "services" | "venda-completa"` (`store-settings-types.ts:14`) e
    `readPdvClassicLayout()` **retorna `"venda-completa"`** se o `localStorage` legado o tiver
    (`pdv-classic-layout.ts:24`).
  - `vendas-pdv.tsx:118-123` **normaliza** `"venda-completa"` (e qualquer desconhecido) para `"lovable"` →
    renderiza **`PdvClassic` comum** (`:133`). Degradação **silenciosa**, sem redirect, sem aviso.
  - `PdvClassic` recebe `classicLayoutKind` e **nunca usa** (`pdv-classic.tsx:176` tipo, `:188` desestruturação;
    **0 leituras** no corpo — verificado por grep).
  - **Nenhuma UI atual grava** `"venda-completa"` (Settings V3 e legado só gravam `services`/`lovable`), mas
    **resíduo legado** em `localStorage` é totalmente possível. → entrar no PDV "esperando Venda Completa" e ver o
    **PDV comum**.
  - Há **duas** "Venda Completa Enterprise": a viva (`venda-completa-enterprise.tsx`, usada pela rota) e a **órfã**
    `pdv-venda-completa-enterprise.tsx` (re-exporta `VendaCompletaEnterprise`; **sem importadores de rota** —
    confirmado).
- **B-01 [P1] Semântica de F2/F3/F4 invertida no Supermercado** (`pdv-supermercado.tsx:647-655`). **Re-verificado.** `(=v02)`
- **B-02 [P2] Busca do Supermercado sem acento e sem multi-termo** (`pdv-supermercado.tsx:274-293` — `term` é só
  `searchTrim.toLowerCase()`, sem `normalize`/NFD, sem split por espaços). **Re-verificado.** `(=v02)`
- **B-03 [P2] Caixa fechado só barra no finalizar (Supermercado)** — sem gate visual antecipado; o operador monta
  o carrinho e só recebe "Caixa fechado." no motor (`operations-store.tsx:1214`). `(=v02)`
- **B-04 [P2] Venda Completa avisa "abra o caixa" mas não oferece como** — a tela não monta `CaixaStatusBar`. `(=v02)`
- **B-05 [P3] Estado morto `saleMode` no Clássico** (`pdv-classic.tsx:205` — `useState<SaleMode>("balcao")`,
  declarado e nunca lido). **Re-verificado, ainda presente.** `(=v02)`
- **B-06 [P3] Texto de bloqueio do PDV Next desatualizado** — diz "não registra vendas", mas já chama
  `finalizeSaleTransaction`. Continua bloqueado por flag (seguro). `(=v02)`

**Não são bugs (verificados OK, linha a linha em `operations-store.tsx`):**
- **Gate de caixa fechado** (`:1204-1216`): sem `openCaixaIfClosed`, retorna `{ ok:false, reason:"Caixa fechado." }`.
  Nenhum PDV passa `openCaixaIfClosed:true` silenciosamente → **sem caixa fantasma** por auto-abertura.
- **Estoque** (`:1218-1230`): linhas virtuais (Item Avulso / O.S.) só validam quantidade e **não tocam estoque**
  (`:1220-1222`); estoque insuficiente **bloqueia** (`:1227-1228`). Baixa real em `:1267-1272`. Devolução
  **restaura** (`registrarDevolucao`, `:1409`).
- **Soma de pagamentos × total** (`:1237-1248`): bloqueia divergência > **0,02**.
- **CPF obrigatório** para à-prazo (`:1251-1252`) e para crédito/vale com checagem de saldo (`:1254-1264`).
- **Caixa físico exclui à-prazo** (`:1275` — `totalEntradas += total - pb.aPrazo`); ledger separa
  `vendasAPrazo` (`:1283`).
- Diálogo pós-venda Sim/Não com foco determinístico (`pdv-post-sale-dialog.tsx`).
- `/dashboard/pdv` e `/dashboard/historico-vendas` redirecionam corretamente.

---

## 7. Regressões encontradas

- **R-04 — "Venda Completa = PDV comum": mecanismo de runtime ainda vivo (não corrigido).** Confirma o v02. O
  link do card está certo; o sintoma vem do `localStorage` legado `omni-pdv-classic-layout = "venda-completa"` →
  `vendas-pdv.tsx` o degrada para o Clássico comum sem avisar (B-07). **Dependente de estado da máquina** → some
  no clone limpo, pode estar firme na máquina da RafaCell. **Não houve correção desde o v02.**
- **R-05 — Hipótese PWA: cache de Service Worker servindo bundle/shell antigo.** *(NOVO)* O app é PWA
  (`next.config.mjs:3-12`: `register:true`, `skipWaiting:true`, `cacheOnFrontEndNav:true`). Como o link **nunca
  quebrou em código** (git prova href estável desde `365418a`), a sensação "corrigimos e voltou" tem como
  suspeito o **precache do SW** na máquina da loja. Reproduz "na loja sim, no clone não" — mesma assinatura do
  R-04. **Hipótese operacional (não confirmada como bug de código)**; teste objetivo em §10 (hard-reload / limpar
  dados do site / verificar versão do SW). Se após limpar o cache o card abrir a tela certa, era PWA.
- **R-01 — Pelo card do Vendas HUB, a rota está correta** (card → `/dashboard/vendas/venda-completa` →
  `VendaCompletaEnterprise`, sem redirect). **Git confirma href estável desde o 1º commit.** `(=v02, reforçado)`
- **R-02 — Atalhos do Supermercado divergiram do padrão** (consistência, não "quebra"). `(=v02)`
- **R-03 — Doc de hotkeys (F11) divergiu do código** (doc, não código). `(=v02)`

---

## 8. Problemas de rota / navegação

- **N-06 [P1] Runtime degrada layout desconhecido para o Clássico sem aviso** — base do R-04. Não é "rota errada",
  é "shell errado" silencioso (`vendas-pdv.tsx:118-123`). **Ainda presente.** `(=v02)`
- **N-08 [P2] Camada PWA pode servir shell/bundle defasado** — base do R-05. *(NOVO)* Não é rota errada; é
  **asset cacheado**. Sem estratégia explícita de invalidação por rota (`workboxOptions` só seta `disableDevLogs`;
  usa os defaults de runtime caching do `@ducanh2912/next-pwa`).
- **N-07 [P3] Componente duplicado `pdv-venda-completa-enterprise.tsx`** — 2ª "Venda Completa Enterprise" não
  roteada; candidata a remoção. **Ainda presente.** `(=v02)`
- **N-01 [P3] Rota placeholder órfã `/dashboard/vendas-hub/vendas/nova`** (`lovable/routes/vendas.nova.tsx` →
  `PlaceholderModule`) — alcançável por URL, "segunda Venda Completa" falsa. **Ainda presente.** `(=v02)`
- **N-02 [OK] Aliases corretos:** `/dashboard/pdv` → `/dashboard/vendas`; `/dashboard/historico-vendas` →
  `/dashboard/vendas-arquivo-geral`.
- **N-03 [OK] Legados bloqueados:** `/dashboard/pdv-next` e `/dashboard/pdv-github-original` via flag
  `NEXT_PUBLIC_OG_EXPERIMENTAL`.
- **N-05 [Observação] Card "Venda Completa" usa `<a href>` (hard nav)** — sai do RouterProvider TanStack do hub e
  recarrega a página Next (flash). Aceitável; **e na prática é útil** (hard nav reduz a chance de cache de SPA
  servir shell antigo). `(=v02)`

---

## 9. Riscos classificados

### P0 — venda perdida / não salva / caixa errado / estoque errado / valor errado / rota principal quebrada
- **Nenhum P0 ativo confirmado.** Motor bloqueia caixa fechado, valida estoque e soma de pagamentos, persiste com
  reconciliação anti-duplicidade. Rota principal do card correta (git-provada).
- **Vigiar (cauda P0):** venda `syncPending` só se perde se **nunca** sincronizar **e** o `localStorage` for
  limpo antes de qualquer flush (mitigação forte — ver P1-1). ⚠️ **Atenção cruzada com R-05:** se a equipe for
  orientada a "limpar dados do site" para resolver o cache do PWA **com vendas pendentes não sincronizadas**, isso
  pode **apagar** as vendas `syncPending`. **Sincronizar (Reenviar) ANTES de limpar cache.**

### P1 — fluxo operacional ruim / atalho quebrado / impressão incompleta / divergência entre PDVs
- **P1-0 — Layout `"venda-completa"` legado abre PDV comum + PWA cache** (R-04/R-05/B-07/N-06/N-08). É o item que
  mais combina com a queixa do usuário. **Não corrigido desde o v02.**
- **P1-1 — Persistência otimista com sinal fraco ao operador.** POST fire-and-forget; em falha, só **toast
  transitório**. Mitigações existentes: auto-flush (online/foco/30s) + "Reenviar sincronização" no histórico +
  reconciliação por ID. **Recomendação:** indicador persistente "N vendas pendentes" no header do PDV. `(=v02)`
- **P1-2 — F2/F3/F4 com semântica oposta no Supermercado** (B-01). `(=v02)`
- **P1-3 — Cobertura desigual de recursos** (Supermercado sem cliente/devolução; Venda Completa sem
  abrir-caixa/espera/avulso). `(=v02)`

### P2 — UX confusa / empty state ruim / produtividade
- **P2-1 — Busca fraca no Supermercado** (B-02). `(=v02)`
- **P2-2 — Caixa fechado só falha no finalizar (Supermercado)** (B-03). `(=v02)`
- **P2-3 — Venda Completa sem botão de abrir caixa** (B-04). `(=v02)`
- **P2-4 — Rota placeholder órfã `/vendas/nova`** (N-01). `(=v02)`
- **P2-5 — Sem invalidação explícita de cache do PWA por rota crítica** (N-08). *(NOVO)*

### P3 — polimento / dívida técnica
- **P3-0 — Componente duplicado `pdv-venda-completa-enterprise.tsx`** (N-07). `(=v02)`
- **P3-1 — Estado morto `saleMode`** no Clássico (B-05). `(=v02)`
- **P3-2 — Tipo `"venda-completa"` órfão em `PdvClassicLayoutKind`** + prop `classicLayoutKind` morta (parte de
  B-07). `(=v02)`
- **P3-3 — Texto de bloqueio do PDV Next + memória do projeto desatualizados** (B-06). `(=v02)`
- **P3-4 — Doc `PDV_HOTKEYS.md` (F11) desatualizada** (R-03). `(=v02)`

---

## 10. Plano recomendado de correção por fases

> Sugestão de sequência. **Nada aqui foi executado** — depende de novo GOAL com autorização.

**Fase 0 — Resolver de vez o "Venda Completa = PDV comum" (P1, prioridade máxima)**
1. **Diagnóstico operacional ANTES de codar (1 sessão, na máquina da RafaCell):** reproduzir o sintoma e separar a
   causa:
   - (a) Abrir DevTools → Application → Local Storage → checar `omni-pdv-classic-layout`. Se for `"venda-completa"`
     → é **R-04** (localStorage legado).
   - (b) Application → Service Workers → "Update on reload" + "Unregister" + Clear storage; depois **hard-reload**.
     Se o card passar a abrir a tela certa → era **R-05** (PWA cache). **⚠️ Reenviar vendas pendentes ANTES** (P0
     cauda).
2. **Código — tratar `"venda-completa"` explicitamente** em `vendas-pdv.tsx`: redirecionar para
   `/dashboard/vendas/venda-completa` (decisão de produto: Venda Completa **não** é o balcão), **ou** sanear o
   `localStorage` legado para `"lovable"` na leitura — **nunca degradar em silêncio**.
3. **Remover a ambiguidade na raiz:** tirar o tipo órfão `"venda-completa"` de `PdvClassicLayoutKind` e a prop
   morta `classicLayoutKind` do `PdvClassic`; remover a duplicata `pdv-venda-completa-enterprise.tsx`.
4. **Estratégia de cache do PWA:** avaliar `NetworkFirst` para os documentos de rota do dashboard (ou versionar o
   SW por deploy) para evitar shell defasado em rotas críticas. Documentar o procedimento de "atualizar PDV"
   (hard-reload) para a equipe da loja.

**Fase A — Segurança da venda (P1)**
5. Indicador persistente de **vendas pendentes de sincronização** no header do PDV (badge "N pendentes" +
   "reenviar"), reusando `flushPendingSales`/`retrySyncSale`. Sem novo backend.

**Fase B — Equalização de atalhos (P1)**
6. Decisão de produto: convergir `F2/F3/F4` do Supermercado para a semântica canônica (cliente/busca/quantidade) e
   mover pagamento-rápido para teclas livres, **ou** documentar e treinar. Recomendado: **convergir**. Atualizar
   `PDV_HOTKEYS.md`.

**Fase C — Paridade de busca e caixa (P2)**
7. Trocar `filterCatalogByTerm` do Supermercado por `filterPdvCatalogBySearch` (acento + multi-termo + ranking).
8. Gate visual de caixa fechado **antes** de montar carrinho no Supermercado.
9. Embutir `CaixaStatusBar` (ou botão "Abrir caixa") na Venda Completa.

**Fase D — Limpeza de rotas/legado (P2/P3)**
10. Remover a rota placeholder `/vendas/nova`; remover `saleMode` morto; atualizar o texto do PDV Next e a memória.

---

## 11. Próximo GOAL recomendado

**GOAL sugerido — `PDV_VENDA_COMPLETA_E_SYNC_FASE_0` (P1, cirúrgico, alto valor/baixo risco):**

> Escopo fechado, **sem tocar o motor de venda**:
> 1. **Diagnóstico na máquina da RafaCell** (Fase 0.1) — separar R-04 (localStorage) de R-05 (PWA) com o
>    procedimento objetivo acima. **Esse passo é o que falta para fechar a queixa nº 1**, porque o link nunca
>    quebrou em código (git-provado).
> 2. **Corrigir o R-04/B-07** (Fase 0.2–0.3): `vendas-pdv.tsx` tratar/sanear `"venda-completa"` (redirect para a
>    página real ou normalizar sem degradar em silêncio); remover a prop morta e a duplicata.
> 3. **Indicador de vendas pendentes** no header do PDV (Fase A.5) — protege contra a única "venda perdida"
>    plausível, reusando `flushPendingSales`/`retrySyncSale`/`syncPending`. **Importante por causa do R-05:** se a
>    equipe limpar o cache do PWA, precisa de um aviso claro de que há vendas a reenviar antes.
>
> Validação obrigatória: `npx tsc --noEmit` + `npm run build` + teste manual nos 3 shells **e** com
> `localStorage.omni-pdv-classic-layout="venda-completa"` para reproduzir/validar o fix **e** um ciclo de
> hard-reload do PWA para validar a invalidação de cache.
> Deixar a convergência de F2/F3/F4 (Fase B) e a paridade de busca (Fase C) como GOALs seguintes.

---

### Anexo — Evidências (arquivo:linha) — re-verificadas em 2026-06-10

- **Card href estável (git):** `git log -S '/dashboard/vendas/venda-completa' -- .../VendasHub.tsx` → sem
  mudanças; `git show 365418a:.../VendasHub.tsx` mostra `dashboardHref: "/dashboard/vendas/venda-completa"` desde o
  1º commit. Nenhuma versão apontou para `/dashboard/vendas`.
- **`resolvedClassicLayout` introduzido em `c37fa3a8` (2026-05-26)** — `git blame -L 118,133 .../vendas-pdv.tsx`.
  Inalterado desde então (nada mudou no último dia).
- Seleção de shell (degradação silenciosa): `components/dashboard/vendas/vendas-pdv.tsx:114-133` (supermercado
  `:116`, services `:125`, normalização venda-completa→lovable `:118-123`, classic `:133`).
- Layout `"venda-completa"` lido: `lib/pdv-classic-layout.ts:24` · tipo: `lib/store-settings-types.ts:14`.
- Prop `classicLayoutKind` morta: `components/dashboard/vendas/pdv-classic.tsx:176,188` (2 ocorrências, 0 leituras).
- Estado morto `saleMode`: `components/dashboard/vendas/pdv-classic.tsx:205`.
- Card Venda Completa (rota correta): `components/vendas-hub/lovable/features/vendas/VendasHub.tsx:41-47,194-196`.
- Fluxo Venda Completa real (sem redirect): `app/dashboard/vendas/venda-completa/page.tsx` →
  `venda-completa-page-client.tsx:6-12` → `VendaCompletaEnterprise`.
- `/vendas/venda-completa` reconhecido como tela-fixa de PDV (scroll): `app/dashboard/layout.tsx:19-22`.
- Duplicata órfã: `components/dashboard/vendas/pdv-venda-completa-enterprise.tsx` (re-export, sem importadores de rota).
- Placeholder TanStack órfão: `components/vendas-hub/lovable/routes/vendas.nova.tsx`.
- Motor de venda + gate + estoque + persistência: `lib/operations-store.tsx` (gate caixa `:1204-1216` · estoque
  `:1218-1230` · baixa `:1267-1272` · soma pagamentos `:1237-1248` · CPF à-prazo/crédito `:1251-1264` · caixa
  exclui à-prazo `:1275` · `syncPending` `:1336` · devolução restaura `:1409`).
- Hotkeys Supermercado (verificado): `pdv-supermercado.tsx:624-660` (F2/F3/F4 pagamento `:647-655`; Insert/F7
  consistentes `:644-645`; guard de modais `:640`; deps `:660`).
- Busca Supermercado (própria, sem acento/multi-termo): `pdv-supermercado.tsx:274-293`.
- Busca canônica: `lib/pdv-product-search.ts` (acento + multi-termo + ranking).
- Scanner: `lib/pdv-scan-product.ts` via `findPdvProductByScan` (3 shells + Venda Completa).
- PWA ativo em produção: `next.config.mjs:3-12` (`register:true`, `skipWaiting:true`, `cacheOnFrontEndNav:true`,
  `workboxOptions` só `disableDevLogs` → defaults de runtime caching).
- Bloqueio de legados: `app/dashboard/pdv-next/page.tsx` · `app/dashboard/pdv-github-original/page.tsx` ·
  `lib/feature-flags.ts`.

> **Áreas não abertas exaustivamente** (sem impacto nas conclusões; registradas por honestidade): internals de
> `payment-modal.tsx` (compartilhado), `trocas-devolucao.tsx`, abertura/fechamento de caixa server-side
> (`caixa-provider`/`CaixaStatusBar`), foco do scanner após a venda por shell, impressão térmica ESC/POS, e a
> **confirmação empírica do R-05** (exige sessão na máquina da loja com DevTools) — cobertos por relatórios e
> memórias anteriores do projeto, ou dependentes de ambiente.

---

*Fim do relatório v03. READ ONLY — nenhuma alteração de código realizada. Re-verifica e estende o v01/v02
(mantidos para histórico).*
