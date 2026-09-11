# PDV — Classificação das Superfícies + Estado Real do Next/Black (002-003)

> GOAL `PDV-SURFACES-NEXT-ROADMAP-RECONCILE-002-003` · documentação **read-only**.
> Consolida o antigo GOAL 002 (classificação de todas as superfícies) e o antigo
> GOAL 003 (estado/paridade real do Next/Black). **Nenhuma funcionalidade foi
> implementada; nenhum código de aplicação foi alterado.**
> Base: `docs/pdv/PDV_CAPABILITIES_STATUS_RECONCILE_001.md` (GOAL 001) — este
> documento não refaz o GOAL 001, apenas consome seus vereditos P-01…P-10 e
> revalida o estritamente necessário contra o código vivo.

## 0. Base, método e limitações

- Repositório: `rafaelfaria49-png/omni-gestao-pro-pdv-claude` (worktree
  `C:\Projetos\omni-gestao-pdv-002-003`, branch
  `goal/pdv-surfaces-next-roadmap-002-003`).
- Base auditada (código vivo): `9a9626d091dd738aa292e122c697170a77a984e4`
  (`fix(pdv): bloquear venda com quantidade fracionada`), que já contém os dois
  P0 integrados: `bfdb8e4` (`STORE-SETTINGS-ACCESS-CONTROL-004`) e `9a9626d`
  (`FRACTIONAL-SALE-HARD-BLOCK-005`).
- Método: leitura direta + `git grep -n` sobre o HEAD; cada afirmação relevante
  carrega evidência `arquivo:linha`. Classificação é pelo **comportamento real**,
  nunca pelo nome do arquivo.
- Limitações: auditoria estática, sem execução de runtime (sem caixa real, sem
  impressora térmica, sem balança WebSerial, sem SEFAZ). Fluxos offline/mesas/
  devolução amostrados por código, não exauridos em navegador. Fiscal/NF-e além
  da fronteira do PDV não foi re-auditado.

## 1. Resumo executivo

| Superfície | Rota real | Classe canônica | Status |
|---|---|---|---|
| PDV Classic | `/dashboard/vendas` (default) | MOTOR (shell base) | produção |
| PDV Assistência | `/dashboard/vendas` (`classicLayout=services`) | MOTOR (variante de domínio) | produção |
| PDV Supermercado | `/dashboard/vendas` (`layout=supermercado`) | MOTOR (variante de domínio) | produção |
| PDV Next / Black Edition | `/dashboard/pdv-next` | MOTOR experimental + SHELL própria | experimental |
| `PdvBlackShell` | — (interno ao Next) | SHELL (presentacional) | experimental |
| Modo Rápido | `?modo=rapido` sobre `/dashboard/vendas` | MODE (transversal) | produção |
| Venda Completa | `/dashboard/vendas/venda-completa` | FLOW + MOTOR | produção |
| Mesas / Controle de Consumo | `/dashboard/vendas/mesas` | FLOW (não finaliza) | produção gated |
| `pdv-venda-completa-enterprise.tsx` | nenhuma (órfã) | LEGACY (morto) | órfão |
| `pdv-github-original` | `/dashboard/pdv-github-original` | LEGACY (espelho) | legado |
| `PdvNeonShell` | nenhuma (órfão) | LEGACY (morto) | órfão |
| `PdvOmniClassicShell` | — (interno ao Classic) | SHELL/LAYOUT ativo | produção |
| VendasHub | `/dashboard/vendas-hub` | SHELL de navegação | produção |

Tese do GOAL 001 **confirmada e refinada**: há **um motor transacional**
(`finalizeSaleTransaction`, `lib/operations-store.tsx:1996`) consumido por
todas as superfícies que vendem de verdade — mas existem **quatro motores de
borda** (Classic, Assistência, Supermercado/grade e Black): cada um com
carrinho, desconto, holds e validações próprios, triplicando/quadruplicando
lógica de borda sobre o mesmo núcleo. As diferenças Classic × Assistência ×
Supermercado são majoritariamente **intencionais (domínio)**; as diferenças
Next × demais são majoritariamente **dívida de paridade**.

**Decisão sobre o Next/Black: C — absorver os componentes do Next nos PDVs
atuais** (manter o Next gated como lab até a absorção; nunca promover como
superfície independente sem paridade; nunca descontinuar jogando fora o que
ele faz bem). Justificativa completa no §5.

## 2. Roteador real (quem chama quem)

- `/dashboard/pdv` não tem UI: `app/dashboard/pdv/page.tsx:1-4` redireciona
  para `/dashboard/vendas`.
- `/dashboard/vendas` → `VendasPageClient`
  (`app/dashboard/vendas/vendas-page-client.tsx:27`): lê `?modo=rapido`
  (`:30-31`), exige terminal ativo (`:39-44`, `useTerminalAtivo` +
  `useTerminalHeartbeat`), redireciona `layout=next` para `/dashboard/pdv-next`
  (`:55-63`), persiste preferência de modo (`:68-77`), bloqueia venda sem
  terminal ou com lock perdido (`:92-117`), exibe botão Mesas só com
  `pdvParams.moduloControleConsumo` (`:127-136`) e renderiza `VendasPDV`
  (`:137`).
- `VendasPDV` (`components/dashboard/vendas/vendas-pdv.tsx:32`) decide em dois
  eixos: `layout` (`classic|supermercado|next`, `lib/pdv-layout-storage.ts:11`)
  lido com fallback por ramo (`vendas-pdv.tsx:60-67`) e `classicLayout`
  (`lovable|services`, `lib/pdv-classic-layout.ts:15`). `next` não renderiza
  aqui — só redireciona (`vendas-pdv.tsx:115`). Hidratação parcial do banco
  (`pdvParams.pdvClassicLayout` → local) em `vendas-pdv.tsx:105-112`.
- Venda Completa, Mesas, Next e github-original são **rotas próprias** fora do
  switcher (`app/dashboard/vendas/venda-completa/page.tsx:3-10`,
  `app/dashboard/vendas/mesas/page.tsx:3-8`,
  `app/dashboard/pdv-next/page.tsx:7-26`,
  `app/dashboard/pdv-github-original/page.tsx:5-18`).

## 3. PARTE A — Fichas por superfície

### 3.1 PDV Classic — MOTOR, produção

- Rota: `/dashboard/vendas` (caminho default). Raiz: `PdvClassic`
  (`components/dashboard/vendas/pdv-classic.tsx:222`), renderizado via
  `PdvOmniClassicShell` (`pdv-classic.tsx:1650`).
- Motor: `finalizeSaleTransaction` (`pdv-classic.tsx:245`, chamada `:1934` com
  `linkedOsId`, `discountReais/Percent`, `clienteId`).
- Regras próprias (domínio justificado): desconto duplo
  (`discountReais+discountPercent`, `:262-263`); threshold de estoque `999` com
  exceção para serviços (`:174-188`, bloqueio `:727`); item avulso sem baixa
  (`:160-165`); importação de comanda via `sessionStorage`
  (`PDV_IMPORT_COMANDA_KEY`, `:395-423`); hidratação de OS vinculada
  (`linkedOsId`, `:582-637`); semente de voz (`voiceCartSeed`, `:1436-1469`).
- Pagamento: `PaymentModal` compartilhado (`:1831-1835`) +
  `PdvRecebimentoModal` F5/F9 (`:1803`).
- Caixa: leitura via `useCaixa` (`:237`); abre/fecha delegado a
  `CaixaStatusBar`; sessão por terminal (`isCaixaProntoParaFinalizar`,
  `lib/pdv-caixa-session.ts:95-96`).
- Estoque: valida no client, baixa no servidor
  (`lib/operations-store.tsx:1067`).
- Cliente: `PdvClientePicker` (`:1816`), opcional (consumidor final permitido).
- Impressão: térmica ESC/POS (`buildPagamentosResumo` `:75`,
  `PdvPostSaleDialog` `:2166-2171`, `PdvAutoPrintFeedback` `:2177`).
- Offline/sync: `syncPending` do motor + holds `classic` (`useHeldSales`,
  `:1483`; `saveHeldSale`, `:1513`) + badge
  (`pdv-pending-sync-badge.tsx:30-34`).
- Settings: `useStoreSettings` (`:236`); usa `atalhosRapidos`,
  `ocultarCategoriasNoPdv`, `incluirImpostoEstimadoNoPdv`,
  `formasPagamento` (`:427-441,1068-1078,1810`).
- localStorage: holds `@omnigestao:pdv-holds:{storeId}:{terminalId}`
  (`lib/pdv-hold.ts:68-69`); layout/modo escopados por `storeId`
  (`lib/store-scoped-storage.ts:52-60`); `assistec-pdv-ui-mode` e
  `assistec-pdv-operator-id-v1` globais.
- Dívida: prop `uiShell` morta (`:217,229-230`, sempre `omni-smart`).

### 3.2 PDV Assistência — MOTOR (variante de domínio), produção

- Rota: `/dashboard/vendas` com `classicLayout=services`
  (`vendas-pdv.tsx:125-130`). Raiz: `PdvAssistenciaEnterprise`
  (`pdv-assistencia-enterprise.tsx:903`).
- Motor: `finalizeSaleTransaction` (`:904`, chamada `:1844`).
- Regras próprias (justificadas): aba Serviços com catálogo real (`Servico`),
  garantia (`warrantyDays`, `:347,380-381`), carrinho persistente por loja
  (`:134,1174-1276`), atalhos próprios (`:154,109`), snapshot/revert de
  desconto ao fechar o pagamento (`:1238`).
- É o **único PDV de balcão sem descarte silencioso**: mapeia o carrinho direto
  e deixa o motor rejeitar (fail-closed) — ver §6.2.
- Pagamento/caixa/estoque/cliente/impressão/offline/settings: mesmos
  compartilhados do Classic (`PaymentModal` `:2804-2837`,
  `PdvPostSaleDialog` `:2962-2967`, holds `assistencia` `:1982,2014`).
- Dívida: duplicação histórica já convergida (comentário `:454-458`).

### 3.3 PDV Supermercado — MOTOR (variante de domínio), produção

- Rota: `/dashboard/vendas` com `layout=supermercado` ou inferência por
  `perfilLoja`/`ramo` (`vendas-pdv.tsx:60-70,116`). Raiz: `PdvSupermercado`
  (`pdv-supermercado.tsx:180`).
- Motor: `finalizeSaleTransaction` (`:186`, chamada `:1474`).
- Regras próprias (justificadas): venda por peso (`vendaPorPeso/precoPorKg`,
  `:126-159`, `WeightProductDialog` `:230-232`, balança WebSerial `:671`),
  atributos/variações (`AttrProductDialog` `:235,424-637`), acessório
  modelo/cor (`:238,419-486`), PIN de supervisor para limpar carrinho
  (`:219-224`).
- Pagamento/caixa/cliente/impressão/offline/settings: compartilhados
  (`PaymentModal` `:1385-1837`, holds `supermercado` `:866,892`).
- Dívida: lógica de carrinho triplicada entre os três motores de borda;
  convergência apenas nos modais compartilhados.

### 3.4 PDV Next / Black — MOTOR experimental + SHELL própria

- Rota: `/dashboard/pdv-next`, atrás de `experimentalPdvEnabled`
  (`page.tsx:12`, `lib/feature-flags.ts:16,25`). A página declara o estado com
  honestidade: "já persiste vendas reais… impressão/desconto/devolução em
  desenvolvimento" (`page.tsx:8-17`).
- Raiz dupla: `PdvBlackEdition` (`components/pdv-next/PdvBlackEdition.tsx:57`,
  lógica+transação) + `PdvBlackShell`
  (`components/pdv-next/PdvBlackShell.tsx:31`, UI pura: `PdvBlackCartRow`
  `:31-41`, `SHORTCUTS` F2–F12 `:47-59`).
- Vende de verdade: `finalizeSaleTransaction` (`PdvBlackEdition.tsx:61`,
  chamada `:382-393`, comentário "mesmo motor idempotente+retry" `:349-352`).
- Regras próprias: turno/cupom locais (`:41-55,87-96,398-400`) — **sem escopo
  por loja/terminal (P2)**; fechar caixa exige supervisor (`:72,83-85`);
  guard anti-fantasma (`linhasNaoResolvidas`, `:357-373`) — **padrão mais
  seguro, a replicar**.
- Pagamento: `PaymentModal` compartilhado (`:567-579`) mas com
  `discountReais/Percent` zerados e travados (`:572-575`) — sem desconto.
- Caixa: `useCaixa` + modais próprios (`:62,538,546`) + `CaixaStatusBar`
  compartilhada (`:439`); checagem fraca `!caixa.isOpen` (`:353-356`), sem
  `sessaoId` como os demais.
- Cliente: picker só para a-prazo (`:549-564,580`); sem cadastro rápido no F5.
- Impressão: **ausente** (zero imports de impressão; só contador local
  `cupomNum`).
- Offline: herda `syncPending` do motor + badge via `CaixaStatusBar`, mas
  shell exibe `Online` hardcoded (`PdvBlackShell.tsx:506-518`), sem holds
  (`useHeldSales` ausente), sem entry de quarentena.
- Settings: **não usa `useStoreSettings`** (zero hits) — ignora
  `formasPagamento`, impressão, atalhos e rodapé por loja (P0 de paridade).
- localStorage: `@omnigestao:pdv-black-turno/cupom` **globais** (`:41-55`) —
  colidem entre lojas/terminais.
- F6/F8/F11 são **placeholders com botão ativo** (`:297-299,303-305,313-315`);
  F7 alterna `emitirNota` sem efeito fiscal (`:143,300-301`; botão rotulado
  "Finalizar com NF-e" no shell — copy enganosa).

### 3.5 Modo Rápido — MODE transversal, produção

- Não é rota nem PDV: `?modo=rapido` lido em `vendas-page-client.tsx:30-31`,
  persistido por loja (`:68-77`, `lib/omnigestao-pdv-modo.ts:16-35`) e entregue
  como prop `isModoRapido` às três superfícies (`vendas-pdv.tsx:116,128,133`;
  consumo em `pdv-classic.tsx:219`, `pdv-assistencia-enterprise.tsx:903`,
  `pdv-supermercado.tsx:180`, `pdv-omni-classic-shell.tsx:275,281`).
- Efeito: foco automático de bipe, flash verde, layout condensado, `ShortcutBar`
  oculta. Herda 100% do motor/pagamento/caixa/offline do PDV base.
- Veredito GOAL 001 P-03 (REFUTADO como "exclusivo do Clássico") **mantido**:
  é preferência de usuário/dispositivo, nunca capability comercial nem item
  vendável.

### 3.6 Venda Completa — FLOW + MOTOR, produção

- Rota própria: `/dashboard/vendas/venda-completa` → `VendaCompletaEnterprise`
  (`venda-completa-enterprise.tsx:168`).
- Regras próprias (justificadas): `TipoVenda` (comum/garantia/a-prazo/
  orçamento, `:89-96`), detalhe por linha (IMEI/série/garantia/observação,
  `:111-116`), desconto por linha (`:126,461`), endereço de entrega
  (`:98-109`), enriquecimento pós-venda (`enrichVendaEnterprise`, `:734-748`),
  lock anti-dupla-finalização (`claimSaleFinalizeLock`, `:47-50`), **cliente
  obrigatório** (`:587,821`).
- Motor: `finalizeSaleTransaction` (`:169`, chamada `:658`).
- É a superfície com o tratamento de `pending` mais honesto (aviso de
  sincronização, pula AR/enrich — ver §6.1).
- Impressão divergente: `CupomNaoFiscal` (`:56,769-797`) em vez da térmica
  ESC/POS dos PDVs de balcão (dívida de paridade).
- Lacuna real: o map de linhas (`:634-643`) **não preserva
  `accessorySelection`** — vendas da Completa perdem modelo/cor (P2).
- Draft próprio por loja (`omnigestao:venda-completa-ent-v2:{storeId}`,
  `:145,286`) + holds `venda-completa` (`:232,531`).

### 3.7 Mesas / Controle de Consumo — FLOW, produção gated

- Rota: `/dashboard/vendas/mesas` → `ControleConsumo`
  (`controle-consumo.tsx:70`). Gate por `pdvParams.moduloControleConsumo`
  (`mesas-page-client.tsx:19-41`; botão no PDV em
  `vendas-page-client.tsx:127`).
- **Não finaliza**: não chama `finalizeSaleTransaction`; gerencia comandas (16
  mesas default, `:46-52`) e exporta para o Classic via `sessionStorage`
  (`PDV_IMPORT_COMANDA_KEY`, `controle-consumo.tsx:288`,
  `lib/pdv-comanda-bridge.ts:2-13`).
- Dívida: persistência `assistec-controle-consumo-mesas-v1` **global sem
  `storeId`** (`controle-consumo.tsx:28,54-64`) — vaza entre lojas; sem holds
  por terminal nem vínculo de sessão.

### 3.8 Legados e órfãos

- `pdv-venda-completa-enterprise.tsx`: **órfã, código morto**. Header declara
  `LEGADO/ÓRFÃO — NÃO USAR` (`:1-25`); nenhuma rota importa (só docs e um teste
  anti-fallback). Mantém draft com chave **divergente** da ativa. Remoção exige
  aprovação de Rafael (regra 0.1-5 dos GOALs).
- `pdv-github-original`: **legado/espelho vendored** em rota isolada sem
  `AppShell` (`app/dashboard/pdv-github-original/layout.tsx:1-26`), atrás do
  mesmo gate experimental (`page.tsx:8`). Catálogo mock (`PRODUCTS`,
  `PdvGithubOriginal.tsx:170,181`), cálculo 100% local, sem motor/caixa/
  settings. Utilidade: referência visual. Não usar para operação.
- `PdvNeonShell` (`pdv-neon-shell.tsx:37`): **órfão** — zero importadores
  ativos. Candidato a remoção com aprovação.
- `PdvOmniClassicShell`: SHELL/LAYOUT **ativo** do Classic — não é órfão.
- VendasHub: SHELL de navegação (6 cards, sem card Next, sem engrenagem de
  settings). Copy do card Venda Completa promete "nota fiscal" com fiscal
  dormente (`VendasHub.tsx:42` vs `Venda.fiscalStatus=NAO_FISCAL`, P2).

## 4. Matriz localStorage (chave exata + escopo)

| Chave | Escopo | Dono |
|---|---|---|
| `@omnigestao:pdv-layout::{storeId}` | loja | switch classic/supermercado/next |
| `omni-pdv-classic-layout::{storeId}` | loja | lovable vs services |
| `omnigestao-pdv-modo::{storeId}` | loja | modo normal/rápido |
| `@omnigestao:pdv-holds:{storeId}:{terminalId}` + filtro `pdvType` | loja+terminal | holds (classic/supermercado/assistencia/venda-completa; **Black e Mesas não usam**) |
| `@omnigestao:pdv-terminal:{storeId}` / `@omnigestao:deviceId` | loja / global | terminal ativo, lock anti-simultâneo |
| `omnigestao:pdv-assistencia-cart:{storeId}`, `omnigestao:pdv-shortcuts:{storeId}` | loja | carrinho/atalhos assistência |
| `omnigestao:venda-completa-ent-v2:{storeId}` | loja | draft da Completa ativa |
| `assistec-pdv-ui-mode`, `assistec-pdv-operator-id-v1` | global | preferência UI, auditoria |
| `@omnigestao:pdv-black-turno/cupom` | **global (dívida P2)** | turno/cupom Black |
| `assistec-controle-consumo-mesas-v1` | **global (dívida P2)** | mesas |
| `assistec-pdv-import-comanda` | sessionStorage (aba) | ponte comanda→PDV |

Precedência-alvo (inalterada desde o masterplan): banco → valor migrado →
fallback legado → default seguro. Hoje o runtime ainda lê local primeiro para
layout/modo (dual-write com espelho `v3PdvSectionCard` declarado "só para
compatibilidade", `PdvSection.tsx:43`).

## 5. PARTE B — Matriz de paridade Next/Black × melhor das atuais

Referência por item = a superfície de produção com a melhor implementação.
Legenda: REAL / PARCIAL / PLACEHOLDER / AUSENTE / N/A.

| # | Recurso | Next/Black | Evidência | Impacto | Prior. | Referência |
|---|---|---|---|---|---|---|
| 1 | catálogo/busca/barcode | REAL | `PdvBlackEdition.tsx:149-153,210-262` (3x, remoto, 50 resultados) | nenhum | P3 | Classic |
| 2 | carrinho | PARCIAL | `:179-207` sem mesclar linhas, sem desconto/acessório; total `:156-159` ignora desconto | cupom longo, total≠fiscal | P1 | Classic |
| 3 | cliente | PARCIAL | `:129-140,498-510`; picker só p/ a-prazo `:549-564` | fricção, sem cadastro rápido | P1 | Classic |
| 4 | CPF/CNPJ | PARCIAL | repassa `:386-388`; validação só no modal | erro só no pagamento | P1 | Classic+modal |
| 5 | desconto | PLACEHOLDER | F8 no-op `:303-305`; modal travado em 0 `:567-575` | **bloqueador comercial** | P0 | Classic |
| 6 | acréscimo | AUSENTE (geral) | sem código em nenhuma superfície | — | P2 | — |
| 7 | múltiplos pagamentos | REAL (herdado) | delega ao modal `:349,385` | ok, sem controle fino | P2 | Classic |
| 8 | dinheiro/Pix/cartões por loja | PARCIAL | Black nunca lê `pdvParams.formasPagamento` (0 hits); mascarado pelo modal | ignora config de loja | P0 | Classic `:1071-1078` |
| 9 | a prazo/crédito | PARCIAL | `:381,390` ok; sem `customerStoreCredit` (saldo sempre 0) | operador não vê limite | P1 | Classic `:1849` |
| 10 | caixa/troco | PARCIAL | caixa ok `:62,538-546`; **troco sidebar desconectado** `:146,428-432` vs `cashTendered` do modal; turno/cupom sem escopo | troco exibido≠fiscal; colisão entre lojas | P0 | Classic |
| 11 | espera/retomada | AUSENTE | F11 placeholder `:313-315`; `pdv-hold.ts:65` prevê `black` sem call-site | fila de balcão trava | P0 | Classic `:1483,1513` |
| 12 | impressão/reimpressão | AUSENTE | 0 imports impressão; só `cupomNum` local | sem comprovante | P0 | Classic `:2166-2179` |
| 13 | devolução/troca | PLACEHOLDER | F6 no-op `:297-299` | sem pós-venda, sem origem de vale | P0 | Classic `:1764-1766` |
| 14 | correção pós-venda | AUSENTE | sem entry p/ workspace de correção | erro exige sair do PDV | P1 | arquivo-geral |
| 15 | acessórios modelo/cor | AUSENTE | `accessory*` = 0 hits | vende item errado | P0/P1 | Classic `:742-746` |
| 16 | serviços | AUSENTE | sem catálogo `Servico` | assistência não opera | P0/N/A | Assistência |
| 17 | OS vinculada | AUSENTE | `linkedOsId` = 0 hits | sem baixa de serviço | P1/N/A | Classic `:582-637` |
| 18 | item avulso | AUSENTE | sem `ItemAvulsoModal`/`isAvulso` | sem quebra-galho | P1 | Classic `:1786-1788` |
| 19 | favoritos/atalhos loja | AUSENTE | sem `atalhosRapidos` | perda de velocidade | P2 | Assistência |
| 20 | offline/sync UX | PARCIAL | herda `pending` do motor; shell mostra `Online` hardcoded | acha que vendeu, está pendente | P0 | arquivo-geral |
| 21 | mesas | AUSENTE | 0 hits | — | N/A/P0-food | Classic `:402-421` |
| 22 | balança/fracionado | PARCIAL | `KG/R$/kg` manual `:183-186`; sem dialog/balança; qtyEdit aceita `0.001` | peso sem leitura estável | P0-super/N/A | Supermercado |
| 23 | atalhos F (3 fake) | PARCIAL | F6/F8/F11 fake, F7 sem efeito | operador aprende atalho morto | P1 | Classic |
| 24 | erros fail-closed | REAL | guard `:357-373` bloqueia sem perder carrinho | **ponto forte — replicar** | P0-manter | Black |

Contagem: REAL 3 (1,7,24) · PARCIAL 9 · PLACEHOLDER 2 (5,13) · AUSENTE 10 ·
N/A condicional 3 (16,17,21 por segmento; 6 geral).

### Decisão: C — absorver componentes do Next nos PDVs atuais

- **Não A** (promover após gaps mínimos): os gaps não são mínimos — 7× P0
  (desconto, espera, impressão, devolução, acessórios/serviços por segmento,
  offline-UX, escopo loja/terminal + troco fiscal) + 5× P1, além de botões
  mortos e copy de NF-e enganosa. Promover agora expõe venda sem desconto,
  sem comprovante e com troco fiscal incorreto.
- **Não B sozinho** (manter experimental até paridade): mantém 5 bordas sobre
  1 motor e o custo de paridade do Black ≈ reimplementar tudo que os três PDVs
  já têm. Pior custo/benefício; B vale apenas como estado **transitório**.
- **Não D** (descontinuar e descartar): desperdiça o que o Black faz bem —
  bipe `3x` + fallback remoto, `ProductSearchPanel` (50 + teclado), highlight,
  guard anti-descarte, shell denso — tudo portável.
- **C vence (arquitetura + custo)**: a persistência já converge (motor único;
  `pdv-hold.ts:65` já reserva `"black"`). A divergência está só na borda.
  Portar `ProductSearchPanel`, `ItemsTable`, `ShortcutBar`,
  `handleBipeKeyDown` e o guard `linhasNaoResolvidas` para
  `components/dashboard/vendas/*` compartilhados é **aditivo, sem migração de
  dados e sem novo contrato fiscal**. Sequência: manter gate (B transitório)
  → portar borda → corrigir `valorRecebido→cashTendered`, turno/cupom com
  `storeId:terminalId`, wiring de desconto + `customerStoreCredit` →
  reavaliar A; nunca D puro.

## 6. PARTE C — Gaps transversais (P1s revalidados, não corrigidos)

### 6.1 P1-a — sucesso visual com venda pendente: TODAS afetadas

O motor continua retornando `ok:true + pending:true` em falha server
(`lib/operations-store.tsx:2189-2222`; toast de pendência existe **só no
motor**, `:2203-2213`). Todos os callers checam apenas `!result.ok` e limpam o
carrinho com toast de sucesso incondicional:

- Classic (`pdv-classic.tsx:1934` → `2021-2037`), Supermercado
  (`:1474` → `:1557-1570`), Assistência (`:1844` → `:1932-1943`), Black
  (`PdvBlackEdition.tsx:382` → `:398-412`, sem nenhum branch `pending`),
  Venda Completa (`:658` → `:797-814`, a mais honesta: avisa sincronização e
  pula AR/enrich, mas limpa o carrinho igual). A órfã
  (`pdv-venda-completa-enterprise.tsx:500→619`) idem. `trocas-devolucao.tsx:421`
  também chama o motor (fora do escopo 001, registrado aqui).
- Mitigação parcial existente: as 5 superfícies que criam título a-prazo pulam
  o AR quando `pending` (Classic `:1997`, Super `:1506`, Completa `:706`,
  órfã `:532`, Assistência `:1894`).
- Retry existe (`flushPendingSales` `:1284-1300`, `retrySyncSale` `:1333-1364`,
  "Reenviar sync" no arquivo-geral, badge) — o problema é **UX que promete
  antes da confirmação**, não falta de retry.

### 6.2 P1-b — descarte silencioso de linhas: 4 afetadas, 2 fail-closed

Totais calculados sobre o carrinho **cheio**, `saleLines` sobre carrinho
**filtrado** (`inventory.some`), sem aviso: Classic (`:1063-1068` vs
`:1857-1872`), Supermercado (`:549-559` vs `:1431-1444`), Venda Completa
(`:268-273` vs `:634-643`), órfã (`:250-254` vs `:463-479`). Cobra-se por item
não persistido.
Fail-closed: Assistência (sem filter — motor rejeita, `:1844-1862` +
`:2061-2062`) e Black (guard `:357-373`, carrinho intacto).

### 6.3 Padrão mais seguro + GOAL único

Padrão a replicar = **guard do Black (pré-motor) + honest-pending da Venda
Completa (pós-motor)**: bloquear antes do `finalize` sem perder o carrinho;
em `pending`, manter carrinho/cupom "PENDENTE — AGUARDANDO NÚMERO"
(`lib/vendas/local-sale-identity.ts:66-68`), pular AR/enrich e oferecer
"Reenviar sync" em vez de "Venda finalizada".
Os dois P1 **podem e devem virar um único GOAL de integridade do motor**:
mesma fronteira (`finalizeSaleTransaction → {ok,pending,saleId}`), mesmos
arquivos (motor + 6 callers + pagamento/cupom), mesmo risco (cobrança cheia ×
venda parcial/pendente × estoque/caixa/AR divergentes). Correção única:
contrato no motor (validar tudo, nunca filtrar silencioso, erro estruturado)
+ callers finos. Dividir perpetua a divergência que causa ambos.

## 7. Estado dos P0 (pós-integração)

- **004 settings** (`bfdb8e4`): PRESENTE — `GET=requireStoreAccess`
  (`app/api/stores/[id]/settings/route.ts:11-16`), `PUT=requireEnterpriseWith`
  (`:26-35`), upsert pelo `id` da URL (`:50-73`). Pré-requisito de qualquer
  persistência de capability: **cumprido**.
- **005 fracionado** (`9a9626d`): PRESENTE — contrato
  (`lib/vendas/sale-quantity-contract.ts:23-74`, `EPSILON=1e-9`), guards
  server-side antes de replay/caixa/create (`lib/ops-upsert-venda.ts:569-586`,
  `venda-persist/route.ts:122-127`, `v2:155-157`, `corrigir-itens:139-140`),
  preflight no motor (`operations-store.tsx:2012-2025`). Zero toques nos PDVs —
  P1-a/P1-b **não foram alterados pelos fixes**. `Math.round` silencioso
  eliminado do caminho de venda/correção; `available:false` em código até G13.

## 8. Dependências para o roadmap (produzido em documento próprio)

- Inventário de localStorage (§4) encerra o objeto do antigo GOAL-014.
- Classificação (§3) + matriz (§5) + P1s (§6) alimentam: GOAL único de
  integridade do motor, absorção do Next, migração server-first de settings,
  contrato/runtime de capabilities e suíte de paridade — detalhados em
  `docs/pdv/PDV_CAPABILITIES_ROADMAP_REDUCED_002_003.md`.
