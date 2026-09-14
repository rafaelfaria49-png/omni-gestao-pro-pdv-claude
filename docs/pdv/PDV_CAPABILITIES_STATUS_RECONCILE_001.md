# PDV Capabilities — Reconciliação de Estado 001

> Auditoria **read-only** (GOAL `PDV-CAPABILITIES-STATUS-RECONCILE-001B`).
> Reconcilia o planejamento Fable 5 (ancorado em `f42072a`) contra o código vivo
> de `origin/main`. **O código vivo prevalece** sobre o planejamento em qualquer
> divergência. Nenhuma linha de código foi alterada neste GOAL.

## 1. Resumo executivo

O planejamento Fable 5 está **correto no espírito e impreciso em pontos
estruturais**. O motor transacional é único (`finalizeSaleTransaction`), mas a
hipótese de "sucesso antes da confirmação" estava mal formulada: o motor
**aguarda** o servidor (`lib/operations-store.tsx:2171`) e ainda assim retorna
`ok:true + pending:true` quando o servidor falha (`lib/operations-store.tsx:2199`),
e os PDVs limpam o carrinho e exibem sucesso nesse caso — risco **P1**
confirmado sob nova formulação. O endpoint de settings tem **GET sem
autenticação e PUT sem ownership por loja** — risco **P0** confirmado
(`app/api/stores/[id]/settings/route.ts:22-37`). O motor de quantidades é
inteiro ponta a ponta (`Int` no Prisma, `Math.round` no upsert e na correção,
projeção de inventário que descarta peso) enquanto o frontend aceita peso e a
balança Web Serial existe — risco **P0** confirmado. Três superfícies filtram
linhas não resolvidas em silêncio antes do motor (**P1**); o Black/Next já
bloqueia com aviso (padrão a replicar). Nenhuma feature-key `pdv.*` existe em
runtime: a proposta v0.9 é integralmente net-new, exceto `sales.paymentMethods`
(persistência já existe) e `pdv.tables` (toggle real já existe). Vereditos:
oito AJUSTADO, um REFUTADO (P-03), um CONFIRMADO (P-10).

## 2. Base auditada

- Repositório: `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.
- Branch de materialização: `goal/pdv-capabilities-status-reconcile-001b`,
  nascida de `origin/main` vigente.
- Hash-base auditado e materializado: `0846c25fae2d31b00ec0c3b1fdcd740ff2b4fa10`
  (`Merge pull request #173 … goal/fiscal-022-aep-definition-184`).
- Ancestralidade verificada (`git merge-base --is-ancestor`, exit 0):
  `738af36` ✅ · `f42072a` ✅.
- Data: 2026-09-10. Executor: Muse Spark (modelos recomendados Opus 4.8 /
  Sonnet 5 indisponíveis neste ambiente — ver §2.1).
- Branch anterior `goal/pdv-capabilities-status-reconcile-001` (`c11c290`,
  base `b528945` de 2026-07-13) **preservada intacta**: não apagada, movida,
  renomeada ou reutilizada.

### 2.1 Limitações

- Pacote Fable 5 (4 documentos) localizado apenas em
  `Downloads/PDV COMPATIB FABLE 5.zip`, fora do repositório; lido como
  referência, não copiado. `PDV_CAPABILITIES_COMMANDS_001.md` lido por índice
  + seção GOAL-001, não integralmente.
- Auditoria por amostragem dirigida (`git grep`/`git show` sobre
  `origin/main`), sem execução de runtime; fluxos offline, mesas e devolução
  amostrados, não exauridos.
- Inventário de worktrees/branches restrito a metadados (caminho, branch,
  HEAD, ahead/behind, diffstat); nenhum WIP alheio foi aberto.
- Modelo executor divergente do recomendado; nenhuma afirmação depende disso,
  pois todas carregam evidência `arquivo:linha`.

## 3. Método

- Arquivos: leitura das superfícies (`pdv-classic.tsx`,
  `pdv-assistencia-enterprise.tsx`, `pdv-supermercado.tsx`,
  `venda-completa-enterprise.tsx`, `PdvBlackEdition.tsx`/`PdvBlackShell.tsx`),
  motor (`lib/operations-store.tsx`, `lib/ops-upsert-venda.ts`,
  `app/api/ops/venda-persist/route.ts`), settings/flags
  (`store-settings-*`, `settings/route.ts`, `feature-flags.ts`,
  `pdv-formas-pagamento.ts`), tenant/plano (`schema.prisma`, `plan-guard.ts`,
  webhook Stripe, `enterprise-permissions.ts`), HUB
  (`VendasHub.tsx`, `dashboard-nav-items.ts`), acessórios, fracionado,
  catálogos, fiscal.
- Histórico: `git log f42072a..HEAD`, greps por `pdv|venda|acessor|catalog|
  caixa|financ|fiscal`, `merge-base`, `rev-list --left-right --count`.
- Critério de evidência: toda afirmação relevante cita `arquivo:linha` (ou
  `arquivo:símbolo` quando a linha é instável); afirmações sem evidência são
  marcadas como limitação, nunca como fato.

## 4. Arquitetura atual do PDV

- **Motor único**: `finalizeSaleTransaction`
  (`lib/operations-store.tsx:1992`), consumido pelos três PDVs de produção,
  Venda Completa, trocas/devoluções e Next/Black (§6, P-01). Valida caixa,
  estoque, soma de pagamentos, CPF para a-prazo/vale, decrementa estoque
  local, grava venda local com `syncPending:true`
  (`lib/operations-store.tsx:2147`), persiste via `persistPendingSale` e
  reconcilia (`syncPending:false`) em sucesso.
- **Shells/layouts**: seletor `VendasPDV`
  (`components/dashboard/vendas/vendas-pdv.tsx:32-133`) em dois eixos —
  `layout` (`classic|supermercado|next`, `lib/pdv-layout-storage.ts`) e
  `classicLayout` (`lovable|services`, `lib/pdv-classic-layout.ts`) — com
  hidratação parcial do banco (`vendas-pdv.tsx:105-112`).
- **Modos**: Rápido é prop transversal (`?modo=rapido`,
  `lib/omnigestao-pdv-modo.ts:16,29`), não PDV.
- **Fluxos**: Venda Completa (rota própria,
  `app/dashboard/vendas/venda-completa/page.tsx`), Mesas
  (`app/dashboard/vendas/mesas/page.tsx`, gate `moduloControleConsumo`),
  Next/Black experimental (`app/dashboard/pdv-next/page.tsx:12`), espelho
  morto `pdv-github-original` e duplicata órfã autodeclarada
  `pdv-venda-completa-enterprise.tsx:1-20`.
- **Settings**: blob `StoreSettings.printerConfig` via
  `GET/PUT /api/stores/[id]/settings` (`app/api/stores/[id]/settings/route.ts`),
  `StoreSettingsProvider`/`useStoreSettings`, `pdvParams`
  (`lib/store-settings-types.ts`) com `formasPagamento`,
  `pdvClassicLayout`, `moduloControleConsumo`.
- **Plano/permissões**: entitlement por `AdminUser.planName`
  (`lib/plan-guard.ts`); navegação por papel
  (`lib/navigation/dashboard-nav-items.ts:103`,
  `lib/auth/enterprise-permissions.ts`); `canAccessStore` é default-allow
  para sessões não restritas
  (`lib/auth/enterprise-permissions.ts:canAccessStore`).

## 5. Tabela P-01 a P-10

| ID | Hipótese original | Veredito | Estado real | Evidência | Impacto | Correção proposta | GOAL relacionado |
|----|-------------------|----------|-------------|-----------|---------|-------------------|------------------|
| P-01 | Três PDVs usam o mesmo motor; sucesso pode ocorrer antes da confirmação server-side | AJUSTADO | Motor único confirmado; ele **aguarda** o servidor, mas retorna `ok:true + pending:true` em falha e os PDVs tratam como sucesso (carrinho limpo, toast) | `lib/operations-store.tsx:1992,2171,2199-2204`; callers `pdv-classic.tsx:245,1934`, `pdv-assistencia-enterprise.tsx:904,1844`, `pdv-supermercado.tsx:186,1474`, `venda-completa-enterprise.tsx:169,658`, `PdvBlackEdition.tsx:61,382` | Risco P1 de sucesso visual pendente; §12 do masterplan (offline/snapshot) precisa cobrir o caso pending-como-sucesso | Reformular a hipótese: "aguarda, mas resolve pendência como sucesso"; gate de UX para `pending` | `PDV-OFFLINE-CAPABILITY-SNAPSHOT-024`, `PDV-SERVER-GUARDS-023` |
| P-02 | Black é apenas skin do Next | AJUSTADO | Black é a **implementação concreta** do Next experimental; o skin puro é `PdvBlackShell` (apresentacional, sem `operations-store`); turno/cupom locais **sem escopo por loja** | `app/dashboard/pdv-next/page.tsx:12`; `lib/feature-flags.ts:16,25`; `PdvBlackEdition.tsx:41-55,61`; shell sem imports de store (`PdvBlackShell.tsx`) | Registry não pode listar Black como superfície; chaves locais colidem entre lojas | `PdvRegistry`: Next como superfície `reactivating`, Black como tema; escopar turno/cupom por loja | `PDV-NEXT-CURRENT-STATE-RECONCILE-003`, `PDV-REGISTRY-012` |
| P-03 | Rápido é modo exclusivo do Clássico | REFUTADO | Rápido é **modo transversal** propagado às três superfícies e persistido por loja | `vendas-pdv.tsx:116,128,133`; `vendas-page-client.tsx:31,68-77,137`; `lib/omnigestao-pdv-modo.ts:16,29`; consumo `pdv-classic.tsx:219`, `pdv-assistencia-enterprise.tsx:903` | Matriz §12.5 (coluna Rápido ≡ Classic) está correta por acidente de motivo errado; migração trata como preferência, não regra de loja | Reclassificar como preferência transversal usuário/dispositivo com default por loja | `PDV-ALL-SURFACES-CLASSIFICATION-002` |
| P-04 | Existe split-brain Store × AdminUser | AJUSTADO | Confirmado: `Store.subscriptionPlan` first-class operacional; Stripe/assinatura em `AdminUser`; `AdminUserStore` M:N; sem Account/Organization/Subscription first-class | `prisma/schema.prisma:50,2161,2192-2202`; `lib/plan-guard.ts:checkPlanAccess`; `app/api/webhooks/stripe/route.ts:42-43,69-70` | Entitlement por usuário logado quebra multi-operador; nenhuma migration proposta aqui | Resolver entitlement por conta/tenant com fallback documentado em `AdminUser.planName` | `ENTITLEMENT-FEATURE-PLAN-MAP-010` |
| P-05 | Inventário de worktrees/branches paralelas | AJUSTADO | 46 worktrees; branches PDV majoritariamente mergeadas ou stale; branch 001 antiga 604-behind/1-ahead; nenhum WIP aberto | `git worktree list` (46); `rev-list origin/main...goal/pdv-capabilities-status-reconcile-001` = 604/1; acessórios `42f622b`/`2e64fa8` já na main | Sem bloqueio para capabilities; reexecução deve revalidar apenas contratos (§7) | Manter inventário superficial por GOAL; não tocar WIPs | GOAL-001 (este) |
| P-06 | Decisão de recursos fragmentada; settings sem ownership | AJUSTADO | Settings server-backed reais, porém sem CapabilityRegistry/Resolver; **GET sem auth, PUT sem ownership** confirmados | grep `CapabilityRegistry\|resolveCapability` = zero em runtime (`blockedReason` só em `services/ai-orchestrator.ts:190,207`, domínio alheio); `settings/route.ts:12-20,22-37` | **P0 segurança**: bypass de plano e cross-store antes de qualquer capability no blob | Endurecer rota (auth no GET, `canAccessStore` no GET/PUT) antes de `STORE-CAPABILITIES-PERSISTENCE-013` | `STORE-SETTINGS-ACCESS-CONTROL-004` |
| P-07 | Venda Completa é fluxo separado real ligado ao motor comum | AJUSTADO | Confirmado + órfão morto autodeclarado + copy do HUB promete NF com fiscal dormente | `venda-completa-page-client.tsx`; `venda-completa-enterprise.tsx:169,624,658`; órfão `pdv-venda-completa-enterprise.tsx:1-20`; `VendasHub.tsx:42` vs `schema.prisma:1486` | Copy desonesta (P2); órfão é ruído, não risco | Corrigir copy para "registro completo", sem "nota fiscal"; registrar órfão como `dead` no futuro registry | `PDV-ALL-SURFACES-CLASSIFICATION-002` |
| P-08 | Next vende pelo motor, sem paridade | AJUSTADO | Vende de verdade (`finalize` + guard anti-descarte); F6/F8/F11 placeholders; sem desconto, troca/devolução, espera, acessórios, impressão, settings por loja | `PdvBlackEdition.tsx:32-33,129,151,226,247,298,304,314,382,549-567`; `page.tsx:8-16` | Não pode ser default nem piloto antes de G10; é referência de UX fail-closed (guard) | Paridade mínima integrando compartilhados (§5.3 do masterplan), sem reconstruir | `PDV-NEXT-REACTIVATION-027` |
| P-09 | accessoryConfig nos 3 PDVs; conferir Next e Completa | AJUSTADO | Presente e saneado nos 3 + servidor com readback; **ausente** no Next e na Venda Completa (map omite `accessorySelection`) | classic `pdv-classic.tsx:96,742-747,2114`; assist `:65,951,2912`; super `:61,147,1677`; server `inventory/route.ts:90,104`, `ops-upsert-venda.ts:633-636`, `sanitize-sale-line-payload.ts:38`, readback `vendas/[id]/route.ts:295`; zero hits em Black/Completa | Vendas sem modelo/cor nessas superfícies; `cartLineKey` não vaza (removido no sanitize) | Integrar dialog + preservação nas duas superfícies; manter guarda de dependência | `PDV-ACCESSORY-CAPABILITIES-030` |
| P-10 | Vendas HUB tem seis cards | CONFIRMADO | Seis cards, destinos e status conferidos; sem card Next; hardcoded por índice | `VendasHub.tsx:29-80` | Qualquer capability que oculte cards exige refatorar a lista fixa | Derivar cards do futuro `PdvRegistry`/registry de navegação | `VENDAS-HUB-SETTINGS-ENTRY-018` |

## 6. Análise detalhada P-01 a P-10

### P-01 — Motor único (AJUSTADO)

Todos os fluxos chamam `finalizeSaleTransaction`
(`lib/operations-store.tsx:1992`): Clássico (`pdv-classic.tsx:245`, call
`:1934`), Assistência (`:904`, call `:1844`), Supermercado (`:186`, call
`:1474`), Venda Completa (`venda-completa-enterprise.tsx:169`, call `:658`),
trocas/devoluções (`trocas-devolucao.tsx:421`) e Black (`:61`, call `:382`).
O motor valida caixa/estoque/pagamentos/CPF, aplica o estado local, grava a
venda com `syncPending:true` (`:2147`) e **aguarda** `persistPendingSale`
(`:2171`). Em falha server, retorna `ok:true, pending:true` (`:2199-2204`)
com toast de "pendente". Os callers só checam `!result.ok`: o Clássico limpa o
carrinho e exibe "Venda finalizada" mesmo com `pending` (único ramo
pending-aware é pular o título de contas-a-receber); o Black incrementa o
cupom local e exibe "Venda registrada". A hipótese Fable ("retorna sucesso
antes da resposta HTTP") está refutada no mecanismo e confirmada no efeito:
**sucesso visual com pendência** (P1). A reconciliação posterior existe
(retry de `syncPending`), mas a UX promete antes da confirmação.

### P-02 — Black e Next (AJUSTADO)

A rota `/dashboard/pdv-next` renderiza `PdvBlackEdition` atrás de
`experimentalPdvEnabled` (`page.tsx:12`, `lib/feature-flags.ts:16,25`) e se
descreve como operacional porém experimental (impressão, desconto,
devolução em desenvolvimento, `page.tsx:8-16`). `PdvBlackShell.tsx` é
apresentacional (tipos `PdvBlackCartRow`, `SHORTCUTS`, sem imports de
`operations-store`); a lógica (caixa, cliente, a-prazo, pagamento,
persistência) mora em `PdvBlackEdition.tsx` (`:61`). Portanto Black =
implementação concreta do Next, não skin intercambiável. As chaves
`@omnigestao:pdv-black-turno` / `@omnigestao:pdv-black-cupom` (`:41-42`) são
lidas/escritas **sem `storeId`/`terminalId`** (`:44-55`): colidem entre lojas
e terminais (P2).

### P-03 — Modo Rápido (REFUTADO como "exclusivo do Clássico")

`?modo=rapido` é lido em `vendas-page-client.tsx:31`, persistido por loja
(`:68-77`, `lib/omnigestao-pdv-modo.ts:16,29` via storage escopado) e
entregue como `isModoRapido` ao `VendasPDV` (`:137`), que o repassa às **três**
superfícies (`vendas-pdv.tsx:116` Supermercado via spread, `:128`
Assistência explícito, `:133` Clássico). Clássico (`pdv-classic.tsx:219` e
usos) e Assistência (`:903,1002,2066`) consomem o flag. É modo transversal,
não PDV nem exclusividade do Clássico.

### P-04 — Tenant, plano e assinatura (AJUSTADO)

`Store.subscriptionPlan` é plano SaaS first-class **por unidade**
(`prisma/schema.prisma:50`). Cobrança Stripe vive em `AdminUser`
(`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `planName`,
`:2192-2202`), lida por `checkPlanAccess` (`lib/plan-guard.ts`) e escrita
pelo webhook (`app/api/webhooks/stripe/route.ts:42-43,69-70`). Vínculo
multi-loja via `AdminUserStore` (`:2161`). Não há Account/Organization/
Subscription first-class. Efeito: o operador do caixa "herda" plano do
titular; fatiar por loja exige resolução por conta/tenant (sem migration
neste GOAL).

### P-05 — Worktrees e branches (AJUSTADO)

46 worktrees ativas (metadados em §8). Branches PDV paralelas em sua maioria
mergeadas ou stale; marcos de acessórios já estão na main (`42f622b`,
`2e64fa8`). A branch 001 antiga está 604-behind/1-ahead e foi preservada
intocada. Nenhum conteúdo de WIP foi lido, por isolamento.

### P-06 — Condicionais de recurso (AJUSTADO)

`useStoreSettings`/`pdvParams` alimentam toggles reais por loja
(`formasPagamento`, `moduloControleConsumo`, `pdvClassicLayout`), mas não há
`CapabilityRegistry`, `CapabilityResolver`, `EffectiveCapabilities`,
`blockedReason` ou `sourceOfDecision` em runtime (grep zero; o único
`blockedReason` é de `services/ai-orchestrator.ts:190,207`, domínio de IA,
alheio ao PDV). Auditoria de segurança da rota: `GET` sem autenticação
(`settings/route.ts:22-31`, `findUnique` direto); `PUT` exige admin ou cookie
de assinatura (`:12-20,33-37`) mas **nunca valida ownership da loja**
(`canAccessStore` não é chamado) — loja A lê e escreve settings da loja B.
Classificação: **P0**, pré-requisito `STORE-SETTINGS-ACCESS-CONTROL-004`.

### P-07 — Venda Completa (AJUSTADO)

Rota ativa `venda-completa/page.tsx → venda-completa-page-client.tsx →
VendaCompletaEnterprise` (`venda-completa-enterprise.tsx:169`), com segunda
porta de sessão de caixa (`:624`) e lock anti-dupla-finalização, sobre o
motor comum (`:658`). Existe duplicata órfã autodeclarada morta
(`pdv-venda-completa-enterprise.tsx:1-20`), referenciada só por docs e um
lint anti-fallback — ruído, não risco. A copy do HUB ("nota fiscal",
`VendasHub.tsx:42`) contrasta com `Venda.fiscalStatus` default `NAO_FISCAL`
(`schema.prisma:1486`) e pipeline fiscal dormente — copy desonesta (P2).

### P-08 — PDV Next: matriz de paridade (AJUSTADO)

Base (`PdvBlackEdition.tsx`): catálogo real + merge com inventário (`:24,151`),
barcode local + busca remota (`:28-29,226,247`), carrinho com quantidade
(`:112-115`), cliente com CPF (`:31,33,129`, picker `:549`), pagamento
múltiplo via `PaymentModal` (`:32,567`) com dinheiro/Pix/débito/crédito/
a-prazo (`:381,390`), caixa abrir/fechar com PIN de supervisor, troco,
cancelamento do carrinho (`:166,525`), guard fail-closed de linhas
(`:352-380`). Placeholders: F6 troca/devolução (`:298`), F8
desconto/acréscimo (`:304`), F11 suspender (`:314`); F7 alterna flag
`emitirNota` (`:143,301`) sem emissão real. Ausências: acessórios (zero hits),
`useStoreSettings`/`formasPagamento` por loja, vale/crédito, impressão de
cupom, mesas, balança, offline/sync dedicado, serviços/OS. Segue
experimental por paridade, não por motor.

### P-09 — Accessory config (AJUSTADO)

Caminho completo verificado: `Produto.metadata →
projectProdutoAccessoryConfig → API inventory →
InventoryItem.accessoryConfig → catálogo local → dialog →
accessorySelection → SaleLine → sanitize server-side → Venda.payload →
readback → correção`. Projeção server (`inventory/route.ts:90,104`);
preservação nos catálogos locais (assistência `:951`, supermercado `:147`);
dialog nos três (`pdv-classic.tsx:96,2114`, assistência `:65,2912`,
supermercado `:61,1677`); resolução via catálogo real no Clássico
(`:742-747`); sanitize que remove `cartLineKey` e reprocessa a seleção
(`sanitize-sale-line-payload.ts:38,44`; `ops-upsert-venda.ts:633-636`);
readback por posição (`vendas/[id]/route.ts:295`). Lacunas: Next/Black e
Venda Completa sem nenhuma ocorrência de `accessory*` — o map da Completa
(`:634`) sequer espalha `accessorySelection`.

### P-10 — Cards do Vendas HUB (CONFIRMADO)

Seis cards (`VendasHub.tsx:29-80`): PDV Rápido
(`/dashboard/vendas?modo=rapido`, ativo, highlight), Venda Completa
(`/dashboard/vendas/venda-completa`, ativo), Orçamentos
(`/dashboard/orcamentos`, beta), Histórico
(`/dashboard/vendas-arquivo-geral`, ativo), Estoque (`/dashboard/estoque`,
ativo), Relatórios (`/dashboard/relatorios`, ativo). Sem card Next/Black.
Lista hardcoded por índice — frágil a reordenação e bloqueio para gates
futuros. Rotas internas do router não alcançadas pelos cards não foram
inventariadas além deste escopo (limitação registrada).

## 7. Mudanças relevantes desde f42072a

`git rev-list --count f42072a..0846c25` = **612 commits**. Seleção dos que
alteram arquitetura, comportamento, segurança, contratos ou paridade:

- Acessórios: `42f622b` persistir seleção na venda; `2e64fa8` exibir
  modelo/cor no detalhe; `1ca4288`/`2b9c51a` modal fechar/latência.
- PDV-001/002/003: `dc7e1e6` busca/vale-troca/crédito no pagamento; `785236b`
  crédito/vale fail-closed + estorno; `702a62f` restore de venda em espera.
- Caixa/terminal: `478b7e5` sessão por terminal; `0e355d7` recovery antes do
  pagamento; `e020dee`/`9726784` sessão por loja/terminal e totais por
  vínculo; `79b51b6` sessão exigida na Venda Completa; `bc479a4` testes.
- Numeração server-side: `f371b47`/`44cd296` infra (revertida em `7917689`
  até baseline Neon — dormente).
- Fiscal/pagamento: `06f30a4` handoff fiscal; `7d21c21` semântica fiscal do
  Pix; `57b591b` dinheiro entregue/troco; `51c906c` grupo card; `356f1d8`
  merge cashTendered/vTroco.
- Quarentena/recovery: `083a780`, `3889f87`, `bbeedc1`, `e08db42`,
  `ddb1697`, `46e451f` (anti-dupla-finalização na Completa).
- Assistência/layout: `5f921e4`/`dcecb6b` grade operacional.
- Recebimento multitítulo: `65a82a5`, `d3910ed`, `924bc23`, `adf0295`,
  `a26cafa`, `c9a9cc0` (canonicalidade, lote atômico, fail-closed).
- Auth: `a1e537c` PIN supervisor com hash; `1e78bf3` sessão × entitlement.
- Fiscal 018→022: maioria dormante/piloto (`fiscalEnabled` nunca ligado via
  config); sem interseção que invalide os vereditos P-01..P-10.
- Impressão: `fdafe4d` comprovante direto na térmica; `e973608` serviços
  reais nos atalhos.

## 8. Worktrees e branches paralelas

Somente metadados; nenhum WIP alheio tocado. 46 worktrees ativas no momento
da auditoria (inclui trilhas fiscal, contador, PDV recebimento, ops-v4).
Branches PDV/vendas observadas (`rev-list origin/main...branch` =
behind/ahead): `goal/pdv-001-trocas-busca-vale-credito` 191/0;
`goal/pdv-002-vale-fail-closed-cancelamento` 187/0;
`goal/pdv-003-venda-em-espera-restore` 102/0 (mergeado via #130);
`goal/pdv-assistencia-layout-carrinho-grade-002` 133/1;
`goal/pdv-caixa-session-recovery-cart-draft-001` 448/5;
`goal/pdv-caixa-session-recovery-split-fix-002a` 443/0;
`goal/pdv-caixa-session-terminal-scope-002b` 440/0;
`goal/pdv-capabilities-status-reconcile-001` (antiga) 604/1, preservada;
`work/pdv-acessorios-*` 611-617 behind (trabalho já incorporado à main);
`audit/pdv-acessorios-persistencia-004` 613/1. Diffstat superficial: as
trilhas de acessórios e espera estão absorvidas; recebimento multitítulo e
caixa-terminal seguem em branches paralelas sem interseção com este dossiê.

## 9. Feature keys v0.9

Nenhuma existe em runtime (grep zero para todas as candidatas) — a proposta
é net-new, sem tipos TypeScript neste GOAL:

| Chave | Existe? | Escopo proposto | Estado / motivo |
|-------|---------|-----------------|-----------------|
| `pdv.filmLookup` | Não | loja (+override superfície) | Válida; backend read-only real (`catalogo/peliculas/search`, `BuscadorPeliculas` prop-less) |
| `pdv.deviceCatalog` | Não | loja | Válida; idem (`catalogo/aparelhos/search`, `catalogo-aparelhos/page.tsx`) |
| `pdv.accessoryModelColor` | Não | loja/superfície | Válida; depende de `accessoryConfig` projetado; fechar Next/Completa |
| `pdv.quickServices` | Não | loja/superfície | Válida; exclusiva da Assistência hoje |
| `pdv.serviceCatalog` | Não | loja | Válida; `model Servico` (`schema.prisma:1059`) sem gate |
| `pdv.osLookup` | Não | loja | Válida (read-only; criação permanece em Operações) |
| `pdv.tables` | Não (toggle real existe) | loja | Válida; mapear `moduloControleConsumo` (gate em `mesas-page-client.tsx:19`, `vendas-page-client.tsx:127`) |
| `sales.paymentMethods` | Não (persistência existe) | loja | Mais forte; `pdvParams.formasPagamento` (`store-settings-types.ts`) já persiste — primeira a formalizar |
| `pdv.scale.*` | Não | — | **Bloqueada**; hardware existe, motor não suporta |
| `sale.fractionalQty` | Não | — | **Bloqueada**; `Math.round` + `Int` a tornam insegura |
| `pdv.quickMode` | Não | — | Não é capability: preferência transversal |
| `pdv.completeSale` | Não | — | Fluxo (`flow.*`), não capability |
| `pdv.heldSales` | Não | — | Dado operacional (holds scoped loja:terminal, `pdv-hold.ts`) |
| `pdv.itemAvulso` | Não | — | Comportamento real de linhas virtuais, não gate |
| `pdv.returnsExchange` | Não | — | Permissão por papel (`enterprise-permissions.ts` `pdv.*`), não toggle comercial |
| `pdv.receiptPrint` | Não | — | Preferência de dispositivo |
| `pdv.offlineSaleQueue` / `pdv.retroactiveSync` | Não | — | Não configuráveis; snapshot + revalidação server-side |
| `pdv.customerCredit` | Não | — | Ledger real, não gate |
| `pdv.nextExperimental` | Não | — | Rollout técnico (env), nunca gate comercial |
| `pdv.fiscalDocument` | Não | — | Entitlement futuro de módulo; fiscal dormente |
| `catalog.filmCompatibilityLookup` / `catalog.deviceLookup` | Não | — | Aliases de `pdv.filmLookup`/`pdv.deviceCatalog`; unificar nomes no G4 |
| `sales.tables` | Não | — | Alias de `pdv.tables`; unificar nomes no G4 |

## 10. Riscos novos

- **P0 — Settings sem ownership** (`settings/route.ts:22-37`): GET público,
  PUT cross-store. Próximo: `STORE-SETTINGS-ACCESS-CONTROL-004`.
- **P0 — Fracionado incompatível** (projeção `inventory/route.ts:80-106`
  descarta peso; `Math.round` em `ops-upsert-venda.ts:827,887`,
  `correcao-itens-plan.ts:102`, `devolucao/route.ts:196`,
  `cancelar/route.ts:247,258`; `Int` em `schema.prisma:237,774,1507`):
  0,350 kg cobra sem baixar estoque. Próximo:
  `FRACTIONAL-SALE-HARD-BLOCK-005`.
- **P1 — Sucesso-pendente** (`operations-store.tsx:2199-2204` + callers que
  só checam `!result.ok`): carrinho limpo e toast de sucesso com venda
  pendente.
- **P1 — Descarte silencioso** (filters em `pdv-classic.tsx:1857`,
  `pdv-supermercado.tsx:1431`, `venda-completa-enterprise.tsx:634` com total
  sobre o carrinho cheio): cobrado por item não persistido. Black
  (`PdvBlackEdition.tsx:352-380`) já é fail-closed — replicar.
- **P2 — Chaves Black sem escopo** (`PdvBlackEdition.tsx:41-55`): turno/cupom
  colidem entre lojas/terminais.
- **P2 — Copy fiscal** (`VendasHub.tsx:42` vs `NAO_FISCAL` + fiscal
  dormente): promete NF inexistente.
- **P2 — Completa sem acessórios** (`venda-completa-enterprise.tsx:634`):
  perde `accessorySelection` que os demais preservam.
- **P3 — Cards hardcoded** (`VendasHub.tsx`): impede gating futuro; órfão
  `pdv-venda-completa-enterprise.tsx` como ruído de navegação.

## 11. Divergências do masterplan

| Texto/hipótese anterior | Estado atual | Correção proposta |
|-------------------------|--------------|-------------------|
| Camada de capabilities "a ativar" | Não existe em runtime; tudo é net-new | Declarar net-new; primeira chave `sales.paymentMethods` (migração de leitura, não construção) |
| "Black = skin do Next" | `PdvBlackShell` = skin; `PdvBlackEdition` = implementação | Precisar a equivalência; Black não entra no registry como superfície |
| "Rápido = modo do Clássico" | Modo transversal às 3 superfícies | Reclassificar; escopo preferência, não regra de loja |
| Catálogos locais descartam `accessoryConfig` | Resolvido (`:951`, `:147`, projeção server) | Remover P0 correspondente; resta associação e lacunas Next/Completa |
| Seis cards como configuráveis | Hardcoded por índice | Refatorar para registry antes de gating |
| Fracionado como "item único" | Duas camadas de bloqueio (projeção + `Math.round` + tipos) | Trilha decomposta (§24 do masterplan) permanece; hard-block server-side já |
| Settings como "fundação aproveitável" sem ressalva | GET público + PUT cross-store | Gate G2 antes de qualquer capability no blob |

## 12. Gates recomendados

- **G1** (este dossiê): P-01..P-10 fechados; divergências registradas.
- **G2**: `STORE-SETTINGS-ACCESS-CONTROL-004` e
  `FRACTIONAL-SALE-HARD-BLOCK-005` antes de qualquer UI/persistência de
  capability; fracionado permanece `available:false` em código até G13.
- **G3/G4**: `PdvRegistry` (Next `reactivating`, órfão `dead`),
  `CapabilityRegistry` + contrato 3-fontes + resolver puro; congelar nomes
  (`catalog.*` × `pdv.*`, `sales.tables` × `pdv.tables`).
- **G5**: mapa feature→plano por conta/tenant (decisão comercial de Rafael).
- **G8/G9**: piloto no Clássico com tratamento de `pending` na UX;
  replicar guard fail-closed do Black nas três superfícies.
- **G10**: reativação do Next por paridade mínima (desconto, devolução,
  espera, acessórios, impressão) sem reconstrução.
- **G13**: autoriza a trilha fracionada, nunca o recurso.

## 13. Dependências para GOAL-002 e GOAL-003

- GOAL-002 (`PDV-ALL-SURFACES-CLASSIFICATION-002`): consome P-02/P-03/P-07/
  P-10 deste dossiê; fechar IDs canônicos (Black=tema, Rápido=modo,
  Completa=fluxo, órfão=dead); decidir destino das chaves Black sem escopo.
- GOAL-003 (`PDV-NEXT-CURRENT-STATE-RECONCILE-003`): consome P-08; zerar os
  `?` da matriz §12.5 do masterplan contra `PdvBlackEdition.tsx` (pagamento,
  caixa, cliente, catálogo, barcode já R; desconto, devolução, espera,
  acessórios, impressão X); estimar trilha §5.3 por componente
  compartilhado.

## 14. Conclusão

O código vivo confirma a tese central do Fable 5 (motor comum + shells) e
refuta/ajusta o suficiente para exigir as correções formais do §11 antes de
qualquer contrato ou UI. Dois P0 bloqueiam a Fase 1 (settings e fracionado);
dois P1 exigem desenho de UX/contrato (pending e descarte); o restante é
P2/P3 tratável nas fases próprias. Nenhum recurso foi implementado, nenhum
schema alterado, nenhuma superfície removida. Próximos passos:
`STORE-SETTINGS-ACCESS-CONTROL-004` e `FRACTIONAL-SALE-HARD-BLOCK-005`.
