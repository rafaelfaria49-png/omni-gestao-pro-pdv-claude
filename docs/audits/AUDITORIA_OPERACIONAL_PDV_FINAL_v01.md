# AUDITORIA OPERACIONAL — PDV / FLUXOS DE VENDA (FINAL) — v01

> **Modo:** READ ONLY — nenhuma linha de código foi alterada. Nada commitado/pushado.
> **Data:** 2026-06-09 · **Autor:** Claude Code (Opus) · **Escopo:** todos os PDVs e telas de venda do OmniGestão Pro.
> **Pergunta central:** *se a RafaCell vender o dia inteiro amanhã usando o PDV, o que ainda pode quebrar, travar, confundir, vender errado, lançar errado no caixa ou perder venda?*
> **Operações V3:** NÃO tocada. Financeiro HUB só lido no necessário para entender Caixa/Recebimento.

---

## 1. Resumo executivo

**Veredito geral:** o núcleo transacional do PDV está **saudável e seguro para operar**. O motor único de venda
(`finalizeSaleTransaction`, em `lib/operations-store.tsx`) centraliza: bloqueio de caixa fechado, validação de
estoque, soma de pagamentos × total, baixa de estoque, lançamento no caixa/ledger, persistência no banco e
**rede de segurança de reenvio** (auto-flush + manual). Não há, hoje, um PDV "fantasma" que venda sem registrar.

**Sobre a preocupação nº 1 (Venda Completa abrindo o PDV comum):** ✅ **NÃO se confirma na base atual.**
O card "Venda Completa" do Vendas HUB aponta para `/dashboard/vendas/venda-completa`
(`components/vendas-hub/lovable/features/vendas/VendasHub.tsx:45`), que renderiza o fluxo **enterprise real e
distinto** `VendaCompletaEnterprise` (`venda-completa-enterprise.tsx`, 1.398 linhas, com cliente obrigatório,
tipos de venda comum/garantia/à prazo/orçamento, endereço de entrega e cupom). O antigo modo embutido
`saleMode="completa"` do `pdv-classic.tsx` está **morto** (declarado mas nunca setado nem lido —
`pdv-classic.tsx:205`). **Confirma a sua leitura de que "parece que tá correto".** Resíduos legados existem
(rota placeholder `/vendas/nova` e o estado morto `saleMode`), mas não estão no caminho do clique real.

**Onde mora o risco operacional real (não no núcleo, e sim na borda):**

1. **Divergência grave de atalhos entre PDVs** — em **Supermercado**, `F2/F3/F4` são **atalhos de pagamento**
   (dinheiro/PIX/débito); nos demais PDVs `F2/F3/F4` são **cliente/busca/quantidade**. Um operador com memória
   muscular do Clássico que aperta **F3 para "buscar produto"** no Supermercado **abre o modal de pagamento PIX**.
   → risco de lançar/confundir venda. **(P1)**
2. **Busca do Supermercado é mais fraca** que a dos demais: não ignora acento e não faz multi-termo
   (`pdv-supermercado.tsx:274`), enquanto Clássico/Assistência usam o motor canônico com acento e ranking
   (`lib/pdv-product-search.ts`). → "não acha o produto" no balcão. **(P2)**
3. **Cobertura de recursos desigual** — Supermercado **não tem** seleção de cliente nem
   trocas/devolução; Venda Completa **não tem** botão para abrir o caixa (só avisa "abra o caixa"). **(P1/P2)**
4. **Persistência otimista** — a venda é gravada localmente e confirmada no servidor por POST "fire-and-forget";
   se a rede falhar, fica `syncPending` e há **reenvio automático** (online/foco/30s) + manual. Risco residual
   **baixo**, mas o aviso ao operador é apenas um toast transitório. **(P1, com forte mitigação)**

Não foram encontrados **P0 ativos** (rota principal quebrada / venda silenciosamente não salva / caixa
fantasma). Os PDVs experimentais/legados (`pdv-next`, `pdv-github-original`) estão **bloqueados em produção**
por feature flag — corretamente.

---

## 2. Inventário de PDVs / telas de venda

| # | Tela | Rota | Componente | O que é | Estado |
|---|------|------|------------|---------|--------|
| 1 | **PDV Clássico** | `/dashboard/vendas` (shell omni-smart) | `pdv-classic.tsx` (1.899) via `vendas-pdv.tsx` | Balcão padrão | **Funcional** |
| 2 | **PDV Supermercado** | `/dashboard/vendas` (perfil supermercado/variedades) | `pdv-supermercado.tsx` (1.774) | Balcão bipe-first | **Funcional (divergente)** |
| 3 | **PDV Assistência** | `/dashboard/vendas` (`pdvClassicLayout="services"`) | `pdv-assistencia-enterprise.tsx` (3.226) | Balcão assistência (mais completo) | **Funcional** |
| 4 | **Venda Completa** | `/dashboard/vendas/venda-completa` | `venda-completa-enterprise.tsx` (1.398) | Venda comercial estruturada (cliente obrigatório) | **Funcional** |
| 5 | **PDV Rápido** | `/dashboard/vendas?modo=rapido` | *flag* `isModoRapido` sobre os shells 1–3 | **Não é PDV separado** — é modo compacto | **Funcional (modo)** |
| 6 | **PDV Next (Black)** | `/dashboard/pdv-next` | `components/pdv-next/PdvBlackEdition.tsx` | 4º PDV experimental | **Bloqueado em prod** (flag) |
| 7 | **PDV GitHub Original** | `/dashboard/pdv-github-original` | espelho `components/pdv-github-original/**` | Referência interna | **Bloqueado em prod** (flag) |
| 8 | **Mesas / Controle de Consumo** | `/dashboard/vendas/mesas` | `controle-consumo.tsx` (488) | Comanda/mesa (gated por `pdvParams.moduloControleConsumo`) | **Funcional (opt-in)** |
| 9 | **Histórico de Vendas** | `/dashboard/vendas-arquivo-geral` | `vendas-arquivo-geral.tsx` (2.554) | Arquivo geral + **Reenviar sincronização** | **Funcional** |
| 10 | **Vendas HUB** | `/dashboard/vendas-hub` | `VendasHubPage` (TanStack Router) | Cards de navegação | **Funcional** |
| 11 | `/dashboard/pdv` | redirect → `/dashboard/vendas` | `app/dashboard/pdv/page.tsx` | Alias | **OK** |
| 12 | `/dashboard/historico-vendas` | redirect → `/dashboard/vendas-arquivo-geral` | — | Alias legado | **OK** |
| 13 | **Venda Completa (placeholder)** | `/dashboard/vendas-hub/vendas/nova` | `lovable/routes/vendas.nova.tsx` → `PlaceholderModule` | Rota TanStack órfã | **Placeholder (morto)** |

> **Como o shell é escolhido (importante):** em `/dashboard/vendas`, o store vê **UM** dos três shells
> principais — não há menu para trocar. `vendas-pdv.tsx:114-133` decide: `supermercado` → Supermercado;
> `pdvClassicLayout="services"` → Assistência; senão → Clássico. `?modo=rapido` apenas compacta o layout.

---

## 3. Matriz por PDV — funcional / parcial / placeholder / quebrado

| PDV | Classificação | Observação |
|-----|---------------|------------|
| PDV Clássico | **Funcional** | Keymap completo, busca canônica, caixa, espera, devolução, item avulso, impressão. |
| PDV Assistência | **Funcional** | O mais completo (trocas/devolução por F8, cliente, recebimento, desconto, fullscreen). |
| PDV Supermercado | **Funcional, parcial nas bordas** | Sem cliente, sem trocas/devolução; busca mais fraca; atalhos com semântica própria. |
| Venda Completa | **Funcional** | Cliente obrigatório, gated por caixa; **sem** abrir caixa na tela, sem espera/avulso/devolução. |
| PDV Rápido (modo) | **Funcional** | É flag sobre os shells; não é tela própria. |
| PDV Next (Black) | **Placeholder operacional (bloqueado)** | Código evoluiu (já chama `finalizeSaleTransaction` + gate de caixa), mas continua bloqueado por flag e o texto do bloqueio está desatualizado. |
| PDV GitHub Original | **Placeholder (bloqueado)** | Espelho de referência; bloqueado por flag. |
| Rota `/vendas/nova` | **Placeholder morto** | `PlaceholderModule` órfão; não linkado pelo card real. |

---

## 4. Matriz de atalhos por PDV

Fonte: `pdv-classic.tsx:1032-1174` · `pdv-supermercado.tsx:624-660` · `pdv-assistencia-enterprise.tsx:1895-2008`.

| Tecla | PDV Clássico | PDV Supermercado | PDV Assistência |
|------:|--------------|------------------|-----------------|
| **F1** | Finalizar / Pagamento | — | Pagamento (dinheiro) |
| **F2** | **Busca cliente** | **Pagamento rápido #1 (dinheiro)** ⚠️ | Toggle cliente |
| **F3** | **Busca produto** | **Pagamento rápido #2 (PIX)** ⚠️ | Foca busca |
| **F4** | **Editar quantidade** | **Pagamento rápido #3 (débito)** ⚠️ | Editar quantidade |
| **F5** | Receber contas (gate caixa) | — | Remove item selecionado |
| **F6** | Cancelar venda | — | Remove item selecionado |
| **F7** | Venda em espera | Venda em espera | Venda em espera |
| **F8** | Volta ao bipe | — | **Trocas / Devoluções** |
| **F9** | Receber contas (alias F5) | Recebimento | Recebimento |
| **F10** | Desconto (abre pagamento) | — | Desconto |
| **F11** | — | — | **Fullscreen** |
| **F12** | Pagamento múltiplo | Pagamento múltiplo (se habilitado) | Pagamento múltiplo |
| **Insert** | Item avulso | Item avulso | Item avulso |
| **Delete** | Remove item sel./último | — | — |
| **End** | Ajuda de teclado | — | — |
| **Esc / setas** | Esc remove último; ↑↓ navega carrinho | — | — |

**Divergências de risco (⚠️):** `F2/F3/F4` têm significado **oposto** no Supermercado (pagamento) vs.
Clássico/Assistência (cliente/busca/quantidade). `F5/F6/F8/F10` só existem em parte dos PDVs.
`Insert` (item avulso) e `F7` (espera) são os **únicos 100% consistentes** entre os três.

> **Nota de documentação:** o arquivo de skill `PDV_HOTKEYS.md` ainda descreve **F11 = Suspender venda** na
> Assistência. No código atual **F11 = Fullscreen** e **F7 = Suspender** (consistente com os outros). Doc está
> **desatualizada** (não é bug de código).

---

## 5. Matriz de recursos por PDV

Legenda: ✅ presente · ⚠️ presente com ressalva · ❌ ausente

| Recurso | Clássico | Supermercado | Assistência | Venda Completa |
|--------|:--------:|:------------:|:-----------:|:--------------:|
| Abrir/Fechar caixa (`CaixaStatusBar`) | ✅ | ✅ | ✅ | ❌ (só avisa "abra o caixa") |
| Status do caixa visível | ✅ | ✅ | ✅ | ✅ (texto) |
| Bloqueio de venda com caixa fechado | ✅ (motor) | ⚠️ (só falha no finalizar) | ✅ (motor, `openCaixaIfClosed:false`) | ✅ (gate + `canFinalize`) |
| Busca por nome/SKU/EAN/código | ✅ canônica | ⚠️ própria, sem acento/multi-termo | ✅ canônica | ✅ canônica |
| Scanner / código de barras (`findPdvProductByScan`) | ✅ | ✅ | ✅ | ✅ |
| Seleção de cliente | ✅ `useClienteSearch` | ❌ (cliente = null) | ✅ `PdvClientePicker` | ✅ obrigatório |
| Desconto | ✅ | ✅ (campos R$/%) | ✅ | ✅ |
| Item avulso (Insert) | ✅ | ✅ | ✅ | ❌ |
| Forma de pagamento (`PaymentModal`) | ✅ | ✅ | ✅ (modal próprio) | ✅ |
| Pagamento múltiplo / split | ✅ F12 | ✅ F12 (se habilitado) | ✅ F12 | ✅ |
| Impressão de comprovante | ✅ pós-venda | ✅ | ✅ | ✅ `CupomNaoFiscal` |
| Venda em espera (F7) | ✅ | ✅ | ✅ | ❌ |
| Cancelamento / Devolução | ✅ `TrocasDevolucao` | ❌ | ✅ `TrocasDevolucao` + F8 | ❌ |
| Integração com estoque (baixa/restaura) | ✅ motor | ✅ motor | ✅ motor | ✅ motor |
| Integração com financeiro/caixa | ✅ | ✅ | ✅ | ✅ |
| Venda à prazo → Contas a Receber | ✅ | ✅ | ✅ | ✅ (tipo `a_prazo`) |
| Multi-loja (`storeId` no persist) | ✅ | ✅ | ✅ | ✅ |

**Lacunas notáveis:** Supermercado sem **cliente** e sem **devolução**; Venda Completa sem **abrir caixa /
item avulso / espera / devolução**.

---

## 6. Bugs encontrados

> Apenas auditoria — nada corrigido. Severidade entre colchetes.

- **B-01 [P1] Semântica de F2/F3/F4 invertida no Supermercado.** No Supermercado essas teclas abrem pagamento
  (`pdv-supermercado.tsx:647-655`); nos demais PDVs são cliente/busca/quantidade. Operador acostumado ao
  Clássico aperta F3 ("buscar") e cai no **pagamento PIX**. Risco de erro de lançamento.
- **B-02 [P2] Busca do Supermercado sem normalização de acento e sem multi-termo.**
  `filterCatalogByTerm` usa `.toLowerCase().includes()` cru (`pdv-supermercado.tsx:274-293`); "pelicula" não
  acha "Película" e "cabo tipo c" não funciona como multi-termo. Clássico/Assistência usam
  `filterPdvCatalogBySearch` (acento-insensível + multi-termo + ranking).
- **B-03 [P2] Caixa fechado só barra no momento de finalizar no Supermercado.** Não há gate antecipado/visual
  como no fluxo dedicado; o operador monta o carrinho todo e só recebe "Caixa fechado" no `finalizeSaleTransaction`
  (toast "Falha transacional"). UX ruim em horário de pico.
- **B-04 [P2] Venda Completa avisa "abra o caixa" mas não oferece como abrir.**
  `venda-completa-enterprise.tsx:403,596,1213` bloqueiam e exibem o aviso, porém a tela **não monta
  `CaixaStatusBar`** — o operador precisa sair para o PDV de balcão para abrir o caixa.
- **B-05 [P3] Estado morto `saleMode` no Clássico.** `pdv-classic.tsx:123,205` declara `SaleMode` e
  `saleMode/setSaleMode` que **nunca** são usados (vestígio do antigo modo "completa"). Limpeza.
- **B-06 [P3] Texto de bloqueio do PDV Next desatualizado.** `app/dashboard/pdv-next/page.tsx` diz "ainda NÃO
  registra as vendas no banco", mas `PdvBlackEdition.tsx:326-374` já chama `finalizeSaleTransaction` com gate de
  caixa (Convergência P1.3). Funcionalmente continua **bloqueado** por flag (seguro), mas o aviso e a memória do
  projeto ("pdv-next não persiste") estão defasados.

**Não são bugs (verificados OK):**
- Diálogo pós-venda Sim/Não com foco determinístico no "Sim, imprimir" e setas ←/→ (`pdv-post-sale-dialog.tsx:89-106`).
- Nenhum PDV passa `openCaixaIfClosed:true` silenciosamente → **sem caixa fantasma** por auto-abertura.
- Estoque negativo bloqueado e item avulso/O.S. (linhas virtuais) **não** baixam estoque
  (`operations-store.tsx:1218-1230,1267-1272`); devolução **restaura** estoque (`:1450`).
- `/dashboard/pdv` e `/dashboard/historico-vendas` redirecionam corretamente.

---

## 7. Regressões encontradas

- **R-01 — Venda Completa abrindo PDV comum: NÃO reproduzida na base atual.** O caminho do clique
  (card → `/dashboard/vendas/venda-completa` → `VendaCompletaPageClient` → `VendaCompletaEnterprise`) está
  **correto**. O modo antigo embutido (`saleMode="completa"`) está inerte. **Confirma a observação do usuário.**
  *Hipótese da percepção anterior:* navegar pela rota órfã `/dashboard/vendas-hub/vendas/nova` (placeholder)
  ou cache antigo do PWA poderia ter exibido tela genérica — mas não há, hoje, link ativo para o lugar errado.
- **R-02 — Atalhos do Supermercado divergiram do padrão.** Não é regressão de "quebra", mas de **consistência**:
  o Supermercado nunca convergiu o keymap de navegação (F2/F3/F4) com os demais PDVs.
- **R-03 — Doc de hotkeys (F11) divergiu do código.** `PDV_HOTKEYS.md` × código (F11 virou Fullscreen). Doc, não código.

---

## 8. Problemas de rota / navegação

- **N-01 [P3] Rota placeholder órfã `/dashboard/vendas-hub/vendas/nova`** (`lovable/routes/vendas.nova.tsx`)
  renderiza `PlaceholderModule "Venda completa"`. Não é linkada pelo card real (que usa `<a href>` para a página
  Next), mas é **alcançável por URL** e confunde — é uma "segunda Venda Completa" falsa. Candidata a remoção.
- **N-02 [OK] Aliases corretos:** `/dashboard/pdv` → `/dashboard/vendas`; `/dashboard/historico-vendas` →
  `/dashboard/vendas-arquivo-geral`.
- **N-03 [OK] Legados bloqueados:** `/dashboard/pdv-next` e `/dashboard/pdv-github-original` exibem
  `ModuleEmDesenvolvimento` em produção (flag `NEXT_PUBLIC_OG_EXPERIMENTAL`). Sem vazamento operacional.
- **N-04 [Observação] Dois "históricos".** Card "Histórico de Vendas" → `vendas-arquivo-geral`. A rota
  `/dashboard/historico-vendas` redireciona para a mesma tela (não há duplicação real, apenas alias).
- **N-05 [Observação] Card "Venda Completa" usa `<a href>` (hard nav).** Sai do RouterProvider TanStack do hub e
  recarrega a página Next — funciona, mas perde a navegação SPA (flash). Comportamento aceitável; só registrar.

---

## 9. Riscos classificados

### P0 — venda perdida / não salva / caixa errado / estoque errado / valor errado / rota principal quebrada
- **Nenhum P0 ativo confirmado.** O núcleo bloqueia caixa fechado, valida estoque e soma de pagamentos, e
  persiste com reconciliação anti-duplicidade. A rota principal (Venda Completa) está correta.
- **Vigiar (cauda P0):** venda `syncPending` só se perde se **nunca** sincronizar **e** o `localStorage` for
  limpo antes de qualquer flush. Mitigação forte (ver P1-1), por isso não é P0 ativo — mas é o único cenário de
  "venda perdida" plausível num dia inteiro de balcão.

### P1 — fluxo operacional ruim / atalho quebrado / impressão incompleta / divergência entre PDVs
- **P1-1 — Persistência otimista com sinal fraco ao operador.** POST fire-and-forget
  (`operations-store.tsx:1357`); em falha, só um **toast transitório**. Mitigações: auto-flush em `online`,
  `visibilitychange` e a cada **30s** (`:1064-1083`) + "Reenviar sincronização" no histórico
  (`vendas-arquivo-geral.tsx:515,1327`) + reconciliação por ID (`:919-951`). **Recomendação:** indicador
  persistente "N vendas pendentes" no header do PDV (não só no histórico).
- **P1-2 — F2/F3/F4 com semântica oposta no Supermercado** (B-01). Treinar a equipe **ou** convergir o keymap.
- **P1-3 — Cobertura desigual de recursos** (sem cliente/devolução no Supermercado; sem abrir-caixa/espera/avulso
  na Venda Completa). Define o que cada balcão consegue resolver sem trocar de tela.

### P2 — UX confusa / empty state ruim / produtividade
- **P2-1 — Busca fraca no Supermercado** (B-02): acento e multi-termo.
- **P2-2 — Caixa fechado só falha no finalizar (Supermercado)** (B-03).
- **P2-3 — Venda Completa sem botão de abrir caixa** (B-04).
- **P2-4 — Rota placeholder órfã `/vendas/nova`** (N-01) — confusão de "duas Vendas Completas".

### P3 — polimento / dívida técnica
- **P3-1 — Estado morto `saleMode`** no Clássico (B-05).
- **P3-2 — Texto de bloqueio do PDV Next + memória do projeto desatualizados** (B-06).
- **P3-3 — Doc `PDV_HOTKEYS.md` (F11) desatualizada** (R-03).
- **P3-4 — Card "Venda Completa" com hard-nav** (N-05).

---

## 10. Plano recomendado de correção por fases

> Sugestão de sequência. **Nada aqui foi executado** — depende de novo GOAL com autorização.

**Fase A — Segurança da venda (P1, prioridade máxima)**
1. Indicador persistente de **vendas pendentes de sincronização** no header do PDV (badge "N pendentes" +
   ação rápida "reenviar"), reusando `flushPendingSales`/`retrySyncSale` já existentes. Sem novo backend.
2. (Opcional) tornar o toast de falha de persistência **sticky** até o operador agir.

**Fase B — Equalização de atalhos (P1)**
3. Decisão de produto: convergir `F2/F3/F4` do Supermercado para a semântica canônica
   (cliente/busca/quantidade) e mover pagamento-rápido para teclas livres (ex.: `F1`/`Shift+F2..`), **ou**
   documentar e treinar formalmente a diferença. Recomendado: **convergir** (menos risco humano).
4. Publicar a **matriz oficial de atalhos** (este doc, seção 4) e atualizar `PDV_HOTKEYS.md`.

**Fase C — Paridade de busca e caixa (P2)**
5. Trocar `filterCatalogByTerm` do Supermercado por `filterPdvCatalogBySearch` (acento + multi-termo + ranking)
   — mudança cirúrgica de uma função.
6. Gate visual de caixa fechado **antes** de montar carrinho no Supermercado (espelhar Clássico/Assistência).
7. Embutir `CaixaStatusBar` (ou botão "Abrir caixa") na Venda Completa.

**Fase D — Limpeza de rotas/legado (P2/P3)**
8. Remover a rota placeholder `/vendas/nova` (ou apontá-la para a Venda Completa real).
9. Remover estado morto `saleMode`; atualizar o texto de bloqueio do PDV Next e a memória do projeto.

**Fase E — Decisão de produto sobre cobertura (P1/P2)**
10. Definir se Supermercado terá **devolução/cliente** e se Venda Completa terá **espera/avulso** — ou
    documentar oficialmente que são intencionalmente fora de escopo de cada tela.

---

## 11. Próximo GOAL recomendado

**GOAL sugerido — `PDV_EQUALIZACAO_FASE_1` (P1, cirúrgico, alto valor/baixo risco):**

> Escopo fechado em dois itens de maior impacto operacional, sem tocar o motor de venda:
> 1. **Indicador de vendas pendentes** no header do PDV (Fase A.1) — protege contra a única "venda perdida"
>    plausível, reusando o que já existe (`flushPendingSales`, `retrySyncSale`, `syncPending`).
> 2. **Equalizar a busca do Supermercado** para `filterPdvCatalogBySearch` (Fase C.5) — corrige "não acha o
>    produto" no balcão com uma troca de função.
>
> Validação obrigatória: `npx tsc --noEmit` + `npm run build` + teste manual nos 3 shells.
> **Deixar a convergência de F2/F3/F4 (Fase B) como GOAL seguinte**, por exigir decisão de produto/treinamento.

---

### Anexo — Evidências (arquivo:linha)

- Seleção de shell: `components/dashboard/vendas/vendas-pdv.tsx:114-133`
- Card Venda Completa (rota correta): `components/vendas-hub/lovable/features/vendas/VendasHub.tsx:41-47,196`
- Fluxo Venda Completa real: `app/dashboard/vendas/venda-completa/venda-completa-page-client.tsx` ·
  `components/dashboard/vendas/venda-completa-enterprise.tsx`
- Placeholder órfão: `components/vendas-hub/lovable/routes/vendas.nova.tsx`
- Motor de venda + persistência + flush: `lib/operations-store.tsx:1176-1407` (finalize) · `:799-1083` (flush) ·
  `:1204-1230` (gate caixa/estoque) · `:1357-1402` (POST + erro)
- Hotkeys: `pdv-classic.tsx:1032-1174` · `pdv-supermercado.tsx:624-660` · `pdv-assistencia-enterprise.tsx:1895-2008`
- Busca: `lib/pdv-product-search.ts` (canônica) × `pdv-supermercado.tsx:274-293` (própria)
- Scanner: `lib/pdv-scan-product.ts` via `findPdvProductByScan` (3 shells)
- Inventário sem limite de 1000: `app/api/ops/inventory/route.ts:138-139` (`findMany` por `storeId`, sem `take`)
- Pós-venda impressão: `components/dashboard/vendas/pdv-post-sale-dialog.tsx:89-106`
- Bloqueio de legados: `app/dashboard/pdv-next/page.tsx` · `app/dashboard/pdv-github-original/page.tsx` ·
  `lib/feature-flags.ts:16-23`
- Aliases: `app/dashboard/pdv/page.tsx` · `app/dashboard/historico-vendas/page.tsx`

> **Áreas não abertas exaustivamente** (sem impacto nas conclusões acima, mas registradas para honestidade):
> internals de `payment-modal.tsx` (2.160 linhas, compartilhado), `trocas-devolucao.tsx`, abertura/fechamento de
> caixa server-side (`caixa-provider`/`CaixaStatusBar`) e impressão térmica ESC/POS — cobertos por relatórios e
> memórias anteriores do projeto (ex.: "Fechamento caixa exige confirmação do servidor", "Impressão comprovantes").

---

*Fim do relatório. READ ONLY — nenhuma alteração de código realizada.*
