# OmniGestão Pro — Estado Atual do Projeto

> Última atualização: 24 Mai 2026 — Sessão: Sangria/Suprimento acessível em todos os PDVs
> Referência rápida para retomar o projeto ou fazer onboarding.

**Memória viva consolidada:**
[`docs/memory/OMNIGESTAO_MASTER_MEMORY.md`](../memory/OMNIGESTAO_MASTER_MEMORY.md)

**Auditoria consolidada:**
[`docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`](../modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md)

---

## ✅ Concluído e Funcionando

### Sangria/Suprimento acessível em todos os PDVs (concluído 24/05/2026)

**Contexto:** homologação multi-terminal revelou que **sangria/suprimento só existia no
PDV Clássico** (menu engrenagem). No PDV Rápido/Supermercado, Assistência e Venda Completa
**não havia fluxo de sangria/suprimento** — gap operacional (não era regressão; nunca existiu lá).

**Auditoria:**
- `pdv-classic.tsx` → tem (menu engrenagem + diálogo + handler com retry/idempotência da Sprint 1.2). ✅
- `pdv-supermercado.tsx` / `pdv-assistencia-enterprise.tsx` / `pdv-venda-completa-enterprise.tsx` → **não tinham**. ❌
- Todos renderizam o **`CaixaStatusBar`** compartilhado (que só tinha Abrir/Fechar).

**Correção cirúrgica (sem tocar no Clássico que já funciona):**

| Arquivo | Mudança |
|---|---|
| `lib/pdv-caixa-operacao.ts` (NOVO) | Helper `registrarOperacaoCaixaServer` — retry exponencial + idempotência por `localId` (mesmo contrato/endpoint da Sprint 1.2). |
| `components/dashboard/caixa/caixa-status-bar.tsx` | Botões **Sangria** e **Suprimento** + diálogo (valor/motivo) quando o caixa está aberto. Reflete na barra na hora (`adicionarSaida/Entrada`), persiste via helper, alerta se sem sessão (não silencia). Auditoria via `appendAuditLog`. |

**Efeito:** sangria/suprimento agora acessível em **todos os PDVs** (a barra é compartilhada).
O Clássico mantém também o menu engrenagem (entrada redundante, inofensiva). Backend financeiro,
estoque, schema, auth/proxy, temas e o retry do Clássico **inalterados**.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

### Multi-Terminais Fase 3 — Relatórios por terminal (concluído 24/05/2026)

**Contexto:** organizar relatórios/histórico/fechamento por PDV1/PDV2/PDV3 + consolidado geral.
Detalhes em [`docs/ai/PDV_MULTI_TERMINAIS_FASE3_RELATORIOS_REPORT.md`](./PDV_MULTI_TERMINAIS_FASE3_RELATORIOS_REPORT.md).

**Descoberta:** a maior parte já estava implementada/commitada (de sessão anterior): filtro por
terminal + badge + detalhe no **Histórico de Vendas** (`vendas-arquivo-geral.tsx`) e no **Histórico
de Caixa** (`caixa-historico-client.tsx`); rotas `vendas/historico`, `caixa/sessoes` e
`caixa/sessao-detalhe` já aceitam `terminalId` (`id`/`"sem"`/todos) e retornam terminal + KPIs.

**Lacuna fechada nesta sessão:**

| Arquivo | Mudança |
|---|---|
| `components/dashboard/caixa/fechamento-caixa-modal.tsx` | Terminal agora aparece no **fechamento**: cabeçalho ("Terminal: …"), **comprovante** (copiar/imprimir) e `payload.resumoFechamento` (`terminalId`/`terminalLabel`). Usa `useTerminalAtivo`; "Sem terminal" para sessões legadas. Lógica de fechamento inalterada (por `sessaoId`, totais server-side). |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Não incluído:** consolidado gerencial dedicado (`/api/ops/caixa/consolidado` + card PDV1×PDV2×PDV3) —
hoje o consolidado é o filtro "Todos os terminais". Vendas antigas sem `terminalId` = "Sem terminal".

**Fora de escopo / pendente:** `components/vendas-hub/lovable/features/vendas/VendasHub.tsx` tem
mudança não relacionada (botão Voltar TanStack→Next) **não commitada** — para revisão do usuário.
Homologação runtime da Sprint 1.2 segue pendente.

### Sprint 1.2 — Estabilização final de Caixa/PDV (concluído 24/05/2026)

**Contexto:** 5 itens cirúrgicos recomendados na auditoria (`docs/ai/AUDITORIA_2026-05-24.md`),
fechando os riscos P0/P1 restantes de caixa. Sem schema/auth/proxy; sem refator.

| # | Arquivo | Mudança |
|---|---|---|
| 1 Desconto | `components/dashboard/vendas/pdv-classic.tsx` | Tecla **F10 = Desconto** no keymap vivo (omni-smart) → abre pagamento com campos de desconto (convenção do PDV Assistência). Linha na ajuda de atalhos. |
| 2 Retry sangria/supr. | `components/dashboard/vendas/pdv-classic.tsx` + `app/api/ops/caixa/operacao/route.ts` | **Retry exponencial** (4 tentativas, 400/800/1600ms) no cliente, com **idempotência por `localId`** no servidor (gravado no `payload` JSONB — sem schema). Retry de 5xx/rede; para em 4xx. Sem duplicar sangria. |
| 3 Título à prazo | `lib/ops-upsert-venda.ts` + `lib/pdv-append-conta-receber.ts` | `ContaReceberTitulo` à prazo agora criado **dentro da transação de venda** (passo 6), `localKey` `pdv-aprazo-{pedidoId}` (idempotente, sem dup). Removido o POST fire-and-forget do cliente (mantido só o cache localStorage). Persistência passa a herdar o retry `syncPending` do `venda-persist`. |
| 4 Guard abrir caixa | `app/api/ops/caixa/abrir/route.ts` + `components/dashboard/caixa/abertura-caixa-modal.tsx` | Se já há `SessaoCaixa` ABERTA (loja + terminal), o `abrir` **retorna a existente** (`alreadyOpen:true`) em vez de criar duplicada. Modal adota saldo/sessão do servidor + toast informativo. |
| 5 Código morto | `components/dashboard/estoque/servicos.tsx` | **Removido** (`Servicos()` sem nenhum import — confirmado; só docs/strings de categoria referenciavam). |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` **OK** (prisma generate + next build completos, 95/95 páginas).

**Não alterado:** schema Prisma, auth/proxy, PDV Assistência/Supermercado, Marketplace/Omni Agent/Marketing IA/WhatsApp, `local-key.ts`, adapter `os-faturamento`.

**Riscos restantes (Sprint 2+):** desconto continua sendo aplicado no modal de pagamento (F10 abre lá — não há tela de desconto isolada); `Venda.contaReceberTituloId` não é vinculado no fluxo PDV à prazo (cancelamento não estorna o título à prazo automaticamente — paridade mantida); guard de abrir reconcilia saldo no modal mas `totalEntradas/totalSaidas` da barra seguem runtime local; OS legado vs v2, auth staff legado e `pdv-github-original/` seguem para Sprints 2–4.

### Sprint 1.1 — Estabilização do PDV Clássico (concluído 24/05/2026)

**Contexto:** homologação operacional revelou bugs no **PDV Clássico** (shell omni-smart)
que a auditoria estrutural não pegou. Correções cirúrgicas, sem tocar Assistência/Supermercado.

**Mapa de renderização confirmado:** Clássico → `pdv-classic` (shell `pdv-omni-classic-shell`,
`uiShell="omni-smart"`); Assistência → `pdv-assistencia-enterprise` (early-return em pdv-classic);
Supermercado → `pdv-supermercado`. O `uiShell="default"` é **legado/sem uso** (VendasPDV usa sempre omni-smart).

| Arquivo | Mudança |
|---|---|
| `components/dashboard/vendas/pdv-classic.tsx` | (1) **INSERT/Item Avulso corrigido:** a tecla estava só no handler `default` (desativado no omni-smart) → "feature fantasma". Adicionado `Insert` ao keymap vivo do shell (`down`) → abre o modal. (2) **Busca de cliente ao digitar:** o campo inline "Cliente" só guardava texto; agora alimenta a busca live (`customerSearch`/`useClienteSearch`) e abre o picker. (3) **Loja segura:** passa `storeId` (loja ativa) ao shell. (4) **Keymap consolidado:** comentário marcando o handler `default` como legado + linha `Insert` na ajuda de atalhos. |
| `components/dashboard/vendas/pdv-omni-classic-shell.tsx` | Cabeçalho do estabelecimento agora **sempre visível** (era `hidden md:flex` → invisível em telas menores) + **badge com o `storeId`** ao lado do nome, para o operador confirmar a unidade antes de vender. |

**storeId/loja ativa — diagnóstico:** o nome exibido e o storeId de gravação vêm da **mesma fonte**
(`useLojaAtiva`/`opsStorageKey`); não há `loja-1` hardcoded no caminho de escrita. Se o PDV mostra
loja-1, a venda vai para loja-1 — por isso o badge sempre visível é a salvaguarda. (Causa provável do
sintoma original: loja de teste criada via script **após** o app carregar a lista → exigia reload do switcher.)

**Validação:** `npx tsc --noEmit` 0 erros · `npx next build --webpack` OK (árvore de rotas completa).
⚠️ `npm run build` falha localmente por **lock do `prisma generate`** (DLL do Prisma travada pelo
`npm run dev` em execução) — não é erro de código; o build do Next compila normalmente.

**Não alterado (intacto):** PDV Assistência e Supermercado (INSERT/atalhos já funcionam neles);
auth/proxy; schema; servidor segue como fonte da verdade.

**Riscos restantes → Sprint 1.2:** desconto sem tecla dedicada no Clássico (só menu CTRL/avançado);
handler `default` legado permanece (marcado, não removido, para evitar refator grande); propagação
cross-tab da troca de loja não implementada (reload resolve).

### Sprint 1 — PDV + Caixa confiável (concluído 24/05/2026)

**Contexto:** deixar o fluxo de caixa seguro para uso diário — servidor como fonte
da verdade; localStorage como cache que **não** pode causar venda perdida, caixa
falso aberto ou totais divergentes. Mudanças cirúrgicas, sem refatorar.

| Arquivo | Mudança |
|---|---|
| `app/dashboard/clientes/ClientesPageClient.tsx` | Link "Iniciar Venda (PDV)" `/dashboard/pdv?clienteId=` (redirect que **descartava a query**) → `/dashboard/vendas?clienteId=` (rota canônica, param preservado). |
| `components/dashboard/vendas/pdv-classic.tsx` | (1) "Ver contas a receber" `/?page=contas-receber` (legado SPA) → `/dashboard/financeiro/contas-a-receber`. (2) "Nova O.S." `/?page=os` → `/dashboard/operacoes-v2` (rota oficial). (3) **Sangria/suprimento sem sessão deixou de ser silencioso:** quando o caixa está aberto mas sem `sessaoId` confirmado no servidor, agora alerta (antes incrementava o total local e mostrava "registrado com sucesso" sem persistir). |
| `lib/operations-store.tsx` | **Caixa falso aberto corrigido:** o bootstrap só restaurava sessão (server aberto + local fechado). Agora trata o inverso — server **sem** sessão aberta + local aberto → fecha localmente (fonte de verdade = servidor). Roda só com servidor respondendo (`rCaixa.ok` + inventory/ordens carregados); offline não dispara; vendas `syncPending` preservadas. Cura o "caixa fantasma" após refresh/reload. |

**Fluxo validado (código):** abrir caixa (POST `/api/ops/caixa/abrir` → `sessaoId`) ·
venda (`venda-persist` idempotente, `syncPending` reenvia em online/foco/30s) ·
sangria/suprimento (`/api/ops/caixa/operacao` + alerta se sem sessão) · fechar
(`/api/ops/caixa/fechar` calcula `totalVendasServer` do ledger) · histórico ·
**refresh/reload** (reconciliação bidirecional com o servidor).

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK (95/95 páginas).

**Riscos restantes → Sprint 1.2:** (a) `abrir` sempre cria nova `SessaoCaixa` (sem
guard de duplicada — corrigir exige ajuste no modal de abertura); (b) caixa em
**dois** locais de localStorage (blob ops + snapshot `omnigestao:caixa:` — redundante,
mas consistente); (c) `totalEntradas/totalSaidas` da barra são runtime local (podem
divergir do servidor durante o turno — fechamento usa o canônico do servidor); (d) PDV
não pré-seleciona cliente via `?clienteId=` (param já preservado para uso futuro); (e)
link "Nova OS" do CRM ainda aponta para `/dashboard/os` (legado).

### Sprint 0 — Blindagem de navegação operacional (concluído 24/05/2026)

**Contexto:** primeira sprint da estabilização operacional — impedir uso operacional
incorreto antes da operação real, **sem remover código** e preservando rotas para dev.

| Arquivo | Mudança |
|---|---|
| `lib/feature-flags.ts` | + `experimentalPdvEnabled` e `roadmapHubsEnabled`, ambos via env `NEXT_PUBLIC_OG_EXPERIMENTAL=1` (default OFF em produção). |
| `app/dashboard/vendas/vendas-page-client.tsx` | **Armadilha crítica corrigida:** o PDV oficial auto-redirecionava para `/dashboard/pdv-next` (que **não persiste vendas**) quando `localStorage["@omnigestao:pdv-layout"]==="next"`. Agora só redireciona com `experimentalPdvEnabled`; em operação faz **auto-heal** da preferência presa (volta para `classic`). |
| `app/dashboard/pdv-next/page.tsx` · `app/dashboard/pdv-github-original/page.tsx` | Gate operacional: renderizam `ModuleEmDesenvolvimento` (com link para o PDV oficial) quando `!experimentalPdvEnabled`. Componentes reais preservados (acesso via env em dev). |
| `components/configuracoes-v3/.../PdvSection.tsx` | Card "PDV Next" oculto da galeria em operação (`visibleFlows`); liberado em dev via env. |
| `components/painel-inicial/Sidebar.tsx` | Hubs de roadmap (Marketing IA, Marketplace) ocultos do menu via `experimental`/`roadmapHubsEnabled` (mock/não operacional). |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK (todas as rotas compilam; experimentais seguem registradas, apenas gated).

**Links quebrados identificados (para Sprint 1, não corrigidos aqui):**
`ClientesPageClient.tsx` usa `/dashboard/pdv?clienteId=` → o redirect de `/dashboard/pdv` **descarta a query** (perde `clienteId`); `pdv-classic.tsx` navega via legado `/?page=os` e `/?page=contas-receber` (quebra potencial dependente da home SPA).

**Pendências (fora do escopo Sprint 0):** páginas Marketplace/Marketing IA seguem
acessíveis por URL direta (só ocultas do menu); IA Mestre / Omni Agent / Financeiro V2
**não** foram alterados (decisão do usuário pendente).

### PDV Multi-Terminais — Fase 2 (lock + heartbeat) (concluído 23/05/2026)

**Contexto:** impedir dois computadores no mesmo terminal ao mesmo tempo, via lock
server-side por terminal + heartbeat, com liberação automática por expiração e
Assumir/Liberar para admin/gerente. Detalhes em
[`docs/ai/PDV_MULTI_TERMINAIS_FASE2_LOCK_REPORT.md`](./PDV_MULTI_TERMINAIS_FASE2_LOCK_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `PdvTerminal` + `lockedByDeviceId`/`lockedByOperador`/`lockedAt`/`heartbeatAt` (nullable) + `@@index([storeId, heartbeatAt])`. Aditivo (`db push` aplicado). |
| `lib/pdv-terminal-lock.ts` | **NOVO** — lógica pura (TTL 120s, heartbeat 30s, `computeLockStatus`) reusada por server e client. |
| `app/api/ops/terminal/{lock,heartbeat,unlock}/route.ts` | **NOVO** — lock atômico (`updateMany` condicional), heartbeat, unlock próprio/forçado. `force` exige `p.pdv.cancelarVenda` (admin/gerente). Degrada (200) em falha de infra. |
| `app/actions/terminais.ts` | `listTerminais(storeId, deviceId?)` retorna estado de lock (status/operador/heartbeat/isMine); desativar limpa o lock. |
| `lib/pdv-terminal.ts` | + `lockTerminal`/`heartbeatTerminal`/`unlockTerminal` + hook `useTerminalHeartbeat` (adquire, bate 30s, detecta perda, libera no unmount/beforeunload). |
| `components/dashboard/vendas/terminal-selector.tsx` | Lock-aware: Livre/Em uso/Offline/Ocupado/Inativo, bloqueia ocupado, Assumir/Liberar (admin) com confirmação. |
| `app/dashboard/vendas/vendas-page-client.tsx` | Keeper de heartbeat; bloqueia PDV se perder o lock (painel reassumir/reselecionar); banner de degradação. |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK (rotas registradas) · `npx prisma db push` em sync.

**Pendências (relatório):** venda não revalida lock no servidor por transação; 2 abas no mesmo
device = mesmo deviceId (sem BroadcastChannel); `localStorage` do caixa ainda por loja;
relatórios por terminal e `pdv-next` fora do escopo.

### PDV Multi-Terminais — Fase 1 (cadastro + seleção) (concluído 23/05/2026)

**Contexto:** base profissional de múltiplos terminais por loja (PDV1, PDV2, PDV3…),
estilo supermercado, para que dois computadores não abram o mesmo caixa por engano.
Detalhes em [`docs/ai/PDV_MULTI_TERMINAIS_FASE1_REPORT.md`](./PDV_MULTI_TERMINAIS_FASE1_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | **NOVO** model `PdvTerminal` (`code` PDV1…, `name`, `status` ACTIVE/INACTIVE, `@@unique([storeId, code])`); + colunas nullable `SessaoCaixa.terminalId` e `Venda.terminalId` + índices. 100% aditivo (`db push` aplicado). |
| `app/actions/terminais.ts` | **NOVO** — `listTerminais` (cria PDV1/2/3 default), `criarTerminal`, `setTerminalStatus`. Scoped por `storeId`; `withPrismaSafe` degrada se a tabela não existir. |
| `lib/pdv-terminal.ts` | **NOVO** — `deviceId` estável, seleção por loja em localStorage, hook `useTerminalAtivo`. |
| `components/dashboard/vendas/terminal-selector.tsx` | **NOVO** — tela "Selecionar Terminal": cards, adicionar, ativar/desativar, fallback "Continuar sem terminal". |
| `app/dashboard/vendas/vendas-page-client.tsx` | Gate: seleciona terminal antes do PDV (com fallback que não bloqueia a operação). |
| `components/dashboard/caixa/caixa-status-bar.tsx` | Exibe terminal atual (badge) + "Trocar" com caixa fechado. |
| `components/dashboard/caixa/abertura-caixa-modal.tsx` · `app/api/ops/caixa/abrir/route.ts` | Caixa grava `terminalId` na `SessaoCaixa` (com fallback se a coluna não existir). |
| `lib/operations-sale-types.ts` · `lib/ops-upsert-venda.ts` · `lib/operations-store.tsx` | Venda carrega `terminalId` em `Venda.payload` (caminho financeiro intacto). |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK · `npx prisma db push` em sync.

**Fase 2 (pendente, documentada):** lock/heartbeat anti-simultâneo, caixa/venda 100% por
terminal (coluna `Venda.terminalId` + reconciliação/fechamento por terminal), relatórios
PDV1/PDV2/PDV3 + consolidado, `localStorage` do caixa por terminal, gate no `pdv-next`,
limite de terminais por plano.

### Vendas HUB — Correção operacional de vendas (concluído 23/05/2026)

**Contexto:** décima fase — implementar edição segura de vendas com auditoria,
separar área operacional de relatórios. Detalhes em
[`docs/ai/VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md`](./VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `app/api/vendas/[id]/corrigir/route.ts` | **NOVO** — endpoint de correção segura: altera forma de pagamento (com PIN supervisor + ajuste `MovimentacaoFinanceira.descricao`), cliente, observação. Valida total imutável, motivo obrigatório, auditoria em `payload.correcoes[]`. |
| `app/api/vendas/[id]/route.ts` | GET expõe `clienteId`, `observacao` e `correcoes[]` do payload. |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | Header renomeado "Histórico de Vendas" → "Vendas". Botão "Corrigir venda" (Wrench) na tabela, drawer e dropdown mobile. Modal de correção com 3 abas (Pagamento/Cliente/Observação). Seção "Correções" no drawer com histórico before/after. |

**Funcionalidades:**
- Correção de forma de pagamento (ex.: Dinheiro → PIX) com PIN supervisor
- Correção de cliente vinculado (nome + FK)
- Correção de observação
- Total e itens **nunca alterados** (validação server-side `422 total_mismatch`)
- Auditoria completa em `Venda.payload.correcoes[]` (before/after, operador, supervisor, motivo)
- `MovimentacaoFinanceira` ajustada na descrição (valor total preservado)
- Drawer mostra histórico de correções

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Riscos restantes:** correção de pagamento redistribui 100% do total em uma forma
(correção parcial de pagamento misto exigiria UI breakdown — fora de escopo);
validação visual nos 4 temas recomendada.

### Caixa — Fechamento ERP Premium (estilo Gestão Click) (concluído 23/05/2026)

**Contexto:** evoluir o fechamento de caixa para padrão ERP — consolidação por
origem, por forma de pagamento e resumo operacional. Detalhes em
[`docs/ai/FECHAMENTO_CAIXA_ERP_PREMIUM_REPORT.md`](./FECHAMENTO_CAIXA_ERP_PREMIUM_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `lib/caixa-fechamento-resumo.ts` (NOVO) | Helper puro único: `classifyLineOrigem`, `filterSalesDaSessao`, `computeFechamentoResumo` → por origem (PDV/Balcão, Item Avulso, O.S.), por pagamento e consolidação. Convenção `recebido = líquido − aPrazo` alinhada ao `MovimentacaoFinanceira(origem:"venda")`. |
| `components/dashboard/caixa/fechamento-caixa-modal.tsx` | Resumo ERP (KPIs + por origem + por pagamento + gaveta), **conferência por dinheiro físico** (`saldoInicial + dinheiro + suprimentos − sangrias`, corrige conferir gaveta contra total que incluía pix/cartão), cabeçalho operador/sessão, impressão/cópia ERP, persistência do resumo em `SessaoCaixa.payload.resumoFechamento`. |
| `components/dashboard/caixa/caixa-relatorio.tsx` | Card "Vendas por origem" reusando o helper. |
| `components/dashboard/caixa/caixa-historico-client.tsx` | Comprovante (impressão + detalhe) consome `payload.resumoFechamento`, com fallback ao ledger legado. |

**Sem schema novo** (resumo viaja no `payload` JSONB existente). Rotas
`caixa/{fechar,sessao-detalhe}` e o ledger financeiro **inalterados**.
Multi-terminal **não** iniciado (fora de escopo).

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Pendências (relatório):** PDV Balcão × Venda Completa não são distinguíveis na
origem (mesmo `finalizeSaleTransaction`, sem marcador); operador é o `cashierId`
local (nome amigável fica no server); vendas `syncPending` entram no resumo
operacional (canônico financeiro segue sendo `totalVendasServer`).

### PDV — Venda Avulsa via tecla INSERT (Item Avulso) (concluído 23/05/2026)

**Contexto:** trazer ao OmniGestão o fluxo do sistema antigo onde **INSERT**
vendia rápido um item não cadastrado no balcão. Detalhes em
[`docs/ai/PDV_ITEM_AVULSO_INSERT_GOAL_REPORT.md`](./PDV_ITEM_AVULSO_INSERT_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `lib/os-pdv-virtual-lines.ts` | + `AVULSO_PREFIX`, `isAvulsoSaleLine`, `isVirtualSaleLine` (união O.S.+avulso), `avulsoInventoryId()`. Linha avulsa = `inventoryId` com prefixo `__avulso__` — não toca estoque. |
| `lib/operations-sale-types.ts` | `SaleLineRecord` + `isAvulso?` e `custoUnitario?: number\|null`. |
| `lib/operations-store.tsx` | `finalizeSaleTransaction` aceita avulso; usa `isVirtualSaleLine` para pular validação/decremento de stock; mapping propaga `isAvulso`/`custoUnitario`. |
| `lib/ops-upsert-venda.ts` | `SalePayload.lines[]` + `isAvulso?`/`custoUnitario?`; Step 2/3 pulam resolução de produto e ledger para avulso. `MovimentacaoFinanceira` do total à vista inalterada. |
| `components/dashboard/vendas/item-avulso-modal.tsx` (NOVO) | Modal com descrição/valor/qtd/custo opcional; mostra total e margem estimada; tokens semânticos. |
| `components/dashboard/vendas/pdv-classic.tsx` · `pdv-supermercado.tsx` · `pdv-assistencia-enterprise.tsx` | Tecla INSERT + handler `addItemAvulso` + filter do `onConfirm` aceitando avulso, nos **3 PDVs operacionais**. Clássico ainda ganha item "Item Avulso" no menu Operações de Caixa. Linha avulsa rotulada "AVULSO" no carrinho. |
| `lib/audit-log.ts` | + action `pdv_item_avulso_adicionado`. |
| `app/api/ops/devolucao/route.ts` · `app/api/vendas/[id]/cancelar/route.ts` | Trocam `isOsVirtualSaleLine`→`isVirtualSaleLine` (defesa: cancelar/devolver venda com avulso não tenta repor estoque inexistente). |

**Comportamento:** item avulso entra na venda, caixa, financeiro, cupom e
histórico; **não** baixa estoque, **não** cria `MovimentacaoEstoque`, **não**
cria produto. Custo opcional vai em `Venda.payload.lines[].custoUnitario`
(ausente = custo desconhecido). Idempotência/retry/syncPending preservados.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Cobertura:** os **3 PDVs operacionais** (Clássico, Assistência, Supermercado)
têm Item Avulso via INSERT.

**Pendências (relatório):** relatórios de margem ainda não distinguem "custo
zero" de "custo desconhecido" (avulso sem custo informado fica `undefined` no
payload); item avulso é sempre quantidade inteira (sem venda por peso);
`pdv-next` segue sem persistir venda (não usar).

### CRM / Clientes HUB — Auditoria e estabilização para uso real (concluído 23/05/2026)

**Contexto:** oitava fase — auditoria ponta-a-ponta do CRM `/dashboard/clientes`
(SPA Lovable-style ~2.235 linhas): listagem, drawer de cadastro/edição (5 abas),
drawer de perfil (3 abas), histórico de compras + OS, timeline, total gasto,
integrações Venda→Cliente / OS→Cliente, multi-loja. Detalhes em
[`docs/ai/CLIENTES_HUB_GOAL_REPORT.md`](./CLIENTES_HUB_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `app/api/clientes/route.ts` | **Bug de consistência crítico:** `totalSpent` retornado era a coluna estática `Cliente.totalSpent` (preenchida só no import, nunca atualizada por PDV/OS). Agora a lista agrega `OrdemServico Pronto/Entregue` + `Venda concluida` por `clienteId` (dois `groupBy` paralelos, scoped por `storeId`), com fallback à coluna estática — mesma estratégia do `listClientes` do Cadastros HUB. Consistência entre módulos. |
| `app/api/clientes/[id]/route.ts` | Detalhe do cliente agora retorna `totalSpent` **agregado** (dois `aggregate` paralelos somando OS+Vendas sem o limite de 15 do `include`), com fallback ao estático. Resolve o caso "perfil mostra R$ 0,00 mas histórico abaixo lista 5 vendas". |
| `app/dashboard/clientes/ClientesPageClient.tsx` | (1) **Métrica falsa removida:** KPI "Ticket Médio" caía para `380.00` hardcoded quando não havia `totalSpent>0` → trocado por `0`. (2) **Contraste de tema corrigido:** caixas `listError` e `formError` usavam `bg-red-950/20 text-red-200` (invisível em Light/Soft Ice) → tokens semânticos `border-destructive/30 bg-destructive/10 text-destructive` (legíveis nos 4 temas). |

**Auditoria (real, multi-loja preservado):** busca server-side por
nome/CPF/CNPJ/cidade; filtros por PF/PJ/status/VIP/inadimplente/cidade reais;
KPIs reais; drawer de cadastro com 5 abas persistindo `tags` estruturadas
(labels, address, financial, operational); drawer de perfil com histórico real
de OS e Vendas (relações Prisma) e timeline derivada de eventos reais; ações
WhatsApp/Nova OS/Iniciar Venda com deep-link `?clienteId=`. `storeId` via
`ASSISTEC_LOJA_HEADER` em todas as chamadas.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Riscos restantes (documentados no relatório):** dois editores de cliente com
formatos diferentes de `tags` (Cadastros HUB salva como `string[]` → sobrescreve
o objeto estruturado do CRM); histórico do perfil limitado a 15 últimos (total
agora é agregado sem esse limite); opções hardcoded de Carteira/Técnico
Responsável no form; `toastRafacell` força tom preto cross-tema (marca); coluna
`Cliente.totalSpent` permanece estática (não é atualizada por PDV/OS — agregação
em leitura é o suficiente).

### Estoque HUB — Auditoria e estabilização para operação real (concluído 23/05/2026)

**Contexto:** sétima fase — auditoria ponta-a-ponta do Estoque HUB: saldo,
movimentações, inventário, ajustes, entradas/saídas, integrações PDV→estoque e
OS→estoque, filtros/busca, multi-loja. Detalhes em
[`docs/ai/ESTOQUE_HUB_GOAL_REPORT.md`](./ESTOQUE_HUB_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `components/dashboard/estoque/gestao-produtos.tsx` | **Mock enganoso crítico corrigido:** a importação de XML NF-e (`confirmarEntradaMercadoria`) só alterava o estado local do React mas exibia "Entrada de mercadoria concluída / Estoque atualizado com sucesso" — nada era persistido (sumia ao recarregar). Tornado **pré-visualização honesta**: função fake removida, botão "Confirmar Entrada" desabilitado ("em breve"), banner âmbar explicando que XML não grava no estoque (entrada real via Cadastros → Estoque ou Importador Avançado), copy corrigida. Removido também `const mockProducts` morto. |

**Auditoria (real, multi-loja preservado):** backend `app/actions/estoque.ts`
(entrada com custo médio ponderado, ajuste com delta, livro-razão imutável
`MovimentacaoEstoque`, KPIs/alertas, tudo `storeId`-scoped); Auditoria de Estoque
(`auditoria-estoque.tsx`) e Movimentação/Inventário (`planejamento-compras.tsx`)
são reais; integrações PDV→estoque (`origem:"pdv"`) e OS→estoque (`origem:"os"`)
visíveis e auditáveis. `toast.info` confirmado existente no hook.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Riscos restantes (documentados no relatório):** "Estoque Mínimo (Alerta)" do
form **não persiste** (sem coluna no schema) → KPI "Estoque Baixo" conta
`stock<=0`; entrada real por NF-e segue pendente (preview); editar "Estoque Atual"
pelo produto sobrescreve saldo **sem livro-razão** (use Entrada/Ajuste para
trilha); estoque negativo possível em concorrência (já detectado na Auditoria);
`servicos.tsx` do estoque é código morto.

### Cadastros HUB — Auditoria e estabilização para uso real (concluído 23/05/2026)

**Contexto:** sexta fase — auditoria ponta-a-ponta do Cadastros HUB
(`/dashboard/cadastros-v2`): Dashboard, Clientes, Produtos, Serviços,
Fornecedores, Técnicos, Equipamentos, Categorias/Marcas, Importação e
Auditoria. Detalhes em [`docs/ai/CADASTROS_HUB_GOAL_REPORT.md`](./CADASTROS_HUB_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `app/actions/cadastros.ts` | **Bug crítico de perda de dados:** `ClienteDTO` ganha `email` e `listClientes` mapeia `c.email`. Antes o DTO não trazia email → o modal de edição usava `defaultValue=""` → `updateCliente` gravava `email: null`, **apagando o email** de qualquer cliente editado sem redigitar o campo. |
| `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` | (1) Email do cliente prefilled na edição (`defaultValue={editing?.email}`). (2) Card fake "IA de Cadastros" (números hardcoded + botão "Corrigir com IA" morto) → "Sugestões de melhoria" com dados **reais** de `stats` + botão real que navega para Produtos. (3) Busca global morta do header removida. (4) Botões mortos "Filtros"/"Exportar" do `Toolbar` desabilitados ("em breve"); busca do `Toolbar` agora condicional ao handler. (5) Busca real ligada em Serviços/Fornecedores/Técnicos/Equipamentos (antes a caixa não filtrava). (6) Botões IA do card de Equipamento desabilitados (não disparam mais o modal por bubbling). |

**Auditoria (todas reais, multi-loja preservado):** CRUD real via Server
Actions → Prisma para Clientes, Produtos (com exclusão protegida por vínculos),
Serviços, Fornecedores, Técnicos, Equipamentos, Categorias/Marcas; estoque via
`app/actions/estoque`; Importação (auditada 21/05) e Auditoria de logs reais.
`storeId` resolvido por loja ativa em todas as actions.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Riscos restantes (documentados no relatório):** campos do form de Cliente
(Endereço/UF/Observações/Consentimento LGPD) e de Serviço (Peças/Checklist/
Marketing IA) **não persistem** (sem coluna no schema); cards de Técnico com
métricas zeradas fixas; coluna "Categoria" de Fornecedor sempre "—"; Auditoria
e Histórico de importação **não filtram por `storeId`** (logs globais,
pré-existente). Nenhum exige correção sem mudança de schema/queries.

### Vendas HUB — Auditoria e estabilização para uso real (concluído 23/05/2026)

**Contexto:** quinta fase — auditoria ponta-a-ponta do Vendas HUB (HUB Central,
Venda Completa Enterprise, Orçamentos, Histórico de Vendas, links internos) e
correção do bug visual de inputs/search bars em todos os temas. Detalhes em
[`docs/ai/VENDAS_HUB_GOAL_REPORT.md`](./VENDAS_HUB_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `styles/operational-density.css` | Removido `padding-inline … !important` das regras `[data-slot="input"]` e `input.border-input.rounded-md`. Esse `!important` (sempre ativo via `data-density="operational"` no `<html>`) sobrescrevia `pl-9`/`pr-9`, fazendo o texto/placeholder colidir com o ícone `absolute` dos search bars (Cliente e Itens na Venda Completa, Histórico, Orçamentos, pickers de PDV) em **todos os temas** (Light/Soft Ice/Midnight/Black). O `<Input>` base já usa `px-2.5` (= `--density-control-px`), então inputs sem ícone não regridem. |

**Auditoria (todas reais):** Venda Completa Enterprise — busca de cliente
(`/api/clientes`), busca/bipe de itens (inventory + scan), finalização via
`finalizeSaleTransaction` (estoque + `MovimentacaoFinanceira` + ledger),
integração com caixa aberto, a prazo (`ContaReceberTitulo`), enrich de dados
enterprise (`Venda.payload.enterprise`) e cupom não fiscal. HUB Central com cards
apontando para rotas reais. Histórico (`vendas-arquivo-geral`) com KPIs/detalhe
reais. Multi-loja preservado.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Riscos restantes:** rotas placeholder do SPA TanStack (`/pdv`, `/vendas/nova`,
`/orcamentos`, `/pedidos`, `/fiscal`) seguem "Em construção" e desconectadas dos
cards (código morto navegacional); Orçamentos é fluxo legado/transição;
`enrichVendaEnterprise` pode perder metadados silenciosamente se todos os retries
falharem (venda já registrada); PDV Black Edition (`/dashboard/pdv-next`) continua
sem persistir vendas. Validação visual em navegador nos 4 temas recomendada.

### Operações HUB — Auditoria e estabilização para uso real (concluído 23/05/2026)

**Contexto:** quarta fase de preparação para operação real — auditoria
ponta-a-ponta de OS (criar → editar → status → estoque → faturamento →
cancelar). Detalhes em
[`docs/ai/OPERACOES_HUB_GOAL_REPORT.md`](./OPERACOES_HUB_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `app/api/ops/ordens/route.ts` | **PUT** agora bloqueia (`409 ordens_ja_existentes`) quando a loja já tem OS persistidas. O endpoint era usado apenas para migração one-shot do localStorage legado quando o banco está vazio (`lib/operations-store.tsx` bootstrap), mas o `deleteMany`+`createMany` original podia apagar/zerar todas as OS de uma loja se chamado por engano ou com permissão de edição. Guard server-side preserva o caso legítimo. |
| `app/actions/operacoes.ts` | `criarVendaDeOSAction` agora resolve `clienteNome` por prioridade (`os.cliente?.nome` → lookup por `clienteId` → fallback `"Cliente"`) e persiste a FK `Venda.clienteId`. Antes gravava `clienteId` no campo `clienteNome` (cuid aparecia no Histórico de Vendas) e quebrava o cálculo de `Cliente.totalGasto` para vendas oriundas de OS. |

**Idempotência confirmada:** consumo/restauração/delta de estoque via flags em
`payload.estoqueConsumido` + `estoqueRestaurado` + `estoqueUltimaRevisaoEm`;
adapter OS→Faturamento via `localKey: adapter_os_faturamento:{storeId}:{osId}`
com merge de revisões em `payload.revisoes[]`. Multi-loja preservado em todas
as Server Actions via `requireOperacaoAuth`.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Orientação para uso amanhã:** Operações HUB V2 (`/dashboard/operacoes-v2`)
pronto. PDV (Goals 1–3) inalterado. Riscos restantes (Lovable hub usa
`CURRENT_STORE_ID = "loja-1"` mutável; race teórica em `nextCodigo`; estoque
fora da tx do status) documentados no relatório.

### Financeiro do PDV — Estabilização para operação real de caixa (concluído 23/05/2026)

**Contexto:** terceira fase de preparação para operação real em loja — auditoria
ponta-a-ponta dos registros financeiros gerados pelo PDV
(`MovimentacaoFinanceira`, `SessaoCaixa`, `CaixaOperacao`) nos 3 PDVs operacionais
(Clássico, Assistência, Supermercado). Detalhes em
[`docs/ai/FINANCEIRO_CAIXA_GOAL_REPORT.md`](./FINANCEIRO_CAIXA_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `lib/ops-upsert-venda.ts` | `MovimentacaoFinanceira(origem:"venda")` agora grava `createdAt = at` (data real da venda no cliente). Vendas offline re-sincronizadas tardiamente passam a cair na sessão de caixa temporalmente correta, em vez de na sessão atual do servidor (`/api/ops/caixa/{fechar,sessao-detalhe}` filtra por `createdAt BETWEEN abertaEm AND fechadaEm`). |
| `components/dashboard/vendas/pdv-classic.tsx` | Sangria/suprimento deixou de **falhar em silêncio**: substitui `void fetch(...).catch(() => {})` por handler que loga e exibe toast destrutivo "Sangria/Suprimento não confirmado no servidor". O `caixa.totalSaidas`/`totalEntradas` local diverge do DB quando o servidor rejeita ou cai — operador precisa saber para retentar. |

**Idempotência confirmada em todas as origens financeiras críticas:**
`venda` (referenciaId=pedidoId), `cancelamento_pdv` (referenciaId=pedidoId,
tipo:saida), `devolucao_pdv` (referenciaId=devolucao.id), `sangria_pdv` /
`suprimento_pdv` (referenciaId=caixaOperacao.id). Multi-loja preservado em
todos os endpoints de escrita (`opsLojaIdFromRequestForWrite`).

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Orientação para uso amanhã:** PDV **Clássico / Assistência / Supermercado**.
**NÃO usar `/dashboard/pdv-next`**. Riscos restantes (idempotência fraca de
sangria/suprimento, fire-and-forget do título à prazo, devolução com vale gera
saída financeira) documentados no relatório.

### PDV ↔ Estoque — Auditoria de integração para uso real (concluído 23/05/2026)

**Contexto:** segunda fase de preparação para operação real em loja — auditoria ponta-a-ponta
do caminho venda PDV → baixa de estoque → ledger → financeiro nos 3 PDVs operacionais
(Clássico, Assistência, Supermercado). Detalhes em
[`docs/ai/ESTOQUE_PDV_GOAL_REPORT.md`](./ESTOQUE_PDV_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `lib/ops-upsert-venda.ts` | Coleta `unresolvedInventoryIds[]` no Step 3 e emite `console.warn("[upsert-venda] estoque-nao-baixado", { pedidoId, lojaId, unresolvedInventoryIds })` quando uma linha não-virtual não casa por id/sku/barcode. Dá observabilidade para o cenário "venda OK mas estoque inflado" (produto deletado mid-sale, SKU divergente). Sem mudança de contrato. |

**Idempotência confirmada em todas as camadas:** `Venda.pedidoId` (PK), `ItemVenda`
(deleteMany+create), `MovimentacaoEstoque` (guard `documento+produtoId+origem`),
`MovimentacaoFinanceira` (guard `referenciaId+origem+tipo`), `DevolucaoVenda`
(`@unique storeId_localId`), e cancelamento (mesmos guards com `origem:"cancelamento_pdv"`).
Reenvios da rede de segurança Goal 1 (online/visibilitychange/30 s) **não duplicam** estoque
nem financeiro.

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Orientação para uso amanhã:** usar **Clássico / Assistência / Supermercado**. **NÃO usar
`/dashboard/pdv-next`** (continua não persistindo vendas, Goal 1). Riscos restantes (estoque
negativo em concorrência, venda por peso truncada como int) documentados como pré-existentes
no relatório.

### PDV & Caixa — Estabilização para operação real (concluído 23/05/2026)

**Contexto:** preparar PDV/Caixa para uso real em loja. Auditoria completa do fluxo
(abrir caixa → vender → finalizar → fechar) + 2 correções cirúrgicas. Detalhes em
[`docs/ai/PDV_CAIXA_GOAL_REPORT.md`](./PDV_CAIXA_GOAL_REPORT.md).

| Arquivo | Mudança |
|---|---|
| `components/dashboard/caixa/abertura-caixa-modal.tsx` | Abertura deixou de **falhar em silêncio**: toast destrutivo quando a sessão não é registrada no servidor (caixa abre local, mas o operador é avisado). |
| `lib/operations-store.tsx` | **Rede de segurança de venda**: além do reenvio no bootstrap, vendas `syncPending` são reenviadas em `online`, foco da aba e a cada 30s (`venda-persist` é idempotente). Reduz risco de venda presa só no localStorage até reload. |

**Validação:** `npx tsc --noEmit` 0 erros · `npm run build` OK.

**Risco crítico documentado:** PDV Black Edition (`/dashboard/pdv-next`) **não persiste
vendas** (`handlePaymentConfirm` só reseta UI) — não usar para operação real. Demais
riscos (fechamento offline reabre no reload mas auto-cura; abertura duplicada;
`totalEntradas` acumulativo) listados no relatório.

### Trocas — Fase 4 Crédito/Vale persistente no banco (concluído 22/05/2026)

**Contexto:** crédito/vale do cliente estava 100% em `localStorage` (`customerCredits`) — sumia entre navegadores, caixas e computadores.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | + modelos `ClienteCredito` e `UsoCreditoCliente`. `Store` + `Cliente` + `DevolucaoVenda` ganham relações. Tabelas: `clientes_creditos` e `usos_credito_cliente`. |
| `app/api/ops/credito-cliente/route.ts` (NOVO) | `GET ?lojaId=&[doc=]` — retorna créditos ativos agregados por CPF/CNPJ. Usado no bootstrap e no drawer de detalhes. |
| `app/api/ops/devolucao/route.ts` | Passo 4 dentro da transação: cria `ClienteCredito` quando `creditoEmitido > 0` e `tipo !== "somente_estoque"`. Atômico — rollback se devolução falhar. |
| `lib/ops-upsert-venda.ts` | `SalePayload` + `customerCpf?`. Passo 5 dentro da transação: debita `ClienteCredito` (oldest-first) e cria `UsoCreditoCliente` quando `creditoVale > 0`. Atômico — rollback se venda falhar. |
| `lib/operations-store.tsx` | `loadDb` bootstrap: fetch `GET /api/ops/credito-cliente` após reconciliação de sessão; DB sobrescreve localStorage para docs conhecidos (best-effort). |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | `saldoCredito` state; `openDetalhe` busca saldo atual se venda tem devolução com crédito; drawer mostra "Saldo em haver: R$ X" ou "Crédito totalmente utilizado". |

**Fluxo completo:**
1. Operador faz devolução com modo `vale_credito` ou `troca`:
   - `registrarDevolucao` debita estoque + cria `DevolucaoVenda` + cria `ClienteCredito` (DB) na mesma tx.
   - `customerCredits[cpf].saldo` em localStorage atualizado imediatamente.
2. Operador usa o vale em nova venda (`creditoVale` no `paymentBreakdown`):
   - `finalizeSaleTransaction` valida saldo em localStorage e debita.
   - `venda-persist` → `upsertVendaInTransaction` debita `ClienteCredito` e cria `UsoCreditoCliente` (DB) na mesma tx.
3. Ao iniciar o PDV (bootstrap):
   - `loadDb` busca `GET /api/ops/credito-cliente?lojaId=...` e mescla DB → localStorage. DB vence para CPFs conhecidos.
4. Drawer Histórico de Vendas:
   - Se venda tem devolução com crédito e `clienteCpf`, busca saldo atual em `GET /api/ops/credito-cliente?doc=...`.
   - Mostra "Saldo em haver" (verde) ou "Crédito totalmente utilizado" (neutro).

**Comportamento sem cadastro de cliente (sem CPF):**
- `registrarDevolucao` requer CPF → não permite vale sem doc (comportamento pré-existente mantido).
- Crédito sem CPF não é persistido no DB (linha `if (docNorm)` na devolução).

**Schema:**

```prisma
model ClienteCredito {
  clienteDoc    String   // CPF/CNPJ dígitos — chave de lookup
  valorOriginal Float
  saldoAtual    Float
  status        String   // "ativo" | "zerado" | "expirado"
  validoAte     DateTime?
  usos          UsoCreditoCliente[]
  // + storeId, clienteId?, devolucaoId?, vendaOrigemId, createdAt, updatedAt
}

model UsoCreditoCliente {
  vendaId     String   // pedidoId da venda
  valor       Float    // quanto foi debitado
  saldoAntes  Float
  saldoDepois Float
  operador    String
  // + creditoId, storeId, at
}
```

**Idempotência e atomicidade:**
- `ClienteCredito` é criado dentro da transação de `DevolucaoVenda` → rollback se falhar.
- `UsoCreditoCliente` é criado dentro da transação de `Venda` → rollback se falhar.
- Não há guards adicionais de idempotência: a transação só é executada uma vez (bloqueada pelo `pedidoId` único no upsert de Venda).

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → em andamento ao fechar a sessão.

**Limitações / Fases futuras:**
- `validoAte` (validade opcional) existe no schema mas não é verificada no PDV ainda.
- Crédito gerado antes da Fase 4 (pré-22/05/2026) está apenas em localStorage — não migrado retroativamente.
- Bootstrap recupera do DB, mas operação offline (sem internet) ainda usa só localStorage.
- `getSaldoCreditoCliente` continua retornando valor de localStorage; após bootstrap, os valores são sincronizados.

---

### Trocas — Fase 3 Troca Imediata + Cupom (concluído 22/05/2026)

**Contexto:** modo "troca" da Fase 0 emitia apenas vale-crédito local; não havia ligação com nova venda. Operador precisava abrir o PDV em paralelo. Não havia comprovante operacional.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `components/dashboard/vendas/trocas-devolucao.tsx` | Mini-PDV embutido (modo "troca"): busca produto/SKU/EAN no inventory real, mini-carrinho com `+/-/x`, resumo "Devolvido / Nova compra / Diferença". Cobrança da diferença via `paymentBreakdown` (dinheiro/pix/débito/crédito) usando o **próprio `finalizeSaleTransaction`** existente — abate `creditoVale` recém-emitido como crédito interno. Excesso devolvido escolhe entre vale ou dinheiro. **Cupom de Troca/Devolução** (`CupomTroca`) abre automaticamente após confirmar (devolução simples, vale e troca imediata): imprimir 80mm, imprimir vale ESC/POS, copiar resumo. |
| `app/api/vendas/[id]/route.ts` | GET expõe `modo` e `novaVendaId` extraídos do `payload` de cada devolução (vínculo para a timeline). |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | Drawer: badge "Troca imediata" em destaque + mini-timeline `venda original → devolução → nova venda` quando `payload.modo === "troca_imediata"`. |

**Cenários da troca imediata:**
- `nova > devolvido` → cobra **só a diferença** na forma escolhida; cria nova venda real (PDV core inalterado).
- `nova = devolvido` → finaliza sem cobrança; vale consumido integralmente.
- `nova < devolvido` → vale parcial consumido + opção de gerar vale-troca ou devolver em dinheiro.

**Vínculo via payload (sem alterar schema):** `DevolucaoVenda.payload` agora guarda `{ modo: "troca_imediata", vendaOriginalId, novaVendaId, valorDevolvido, totalNovaCompra, diferencaPaga, diferencaForma, creditoRestante, excessoDinheiro }`. A nova venda é criada via `finalizeSaleTransaction` standard.

**Reaproveitamento:** `finalizeSaleTransaction` (PDV core), `registrarDevolucao` (Fase 0), `/api/ops/devolucao` (estoque + status server), `buildValeTrocaEscPos`, `openThermalHtmlPrint`. Nenhuma duplicação de lógica de PDV.

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → Compiled successfully.

**Limitações / Fase 4:** crédito persistente em DB segue fora de escopo (Fase 1); excesso em dinheiro só é registrado no audit-log (não cria `MovimentacaoFinanceira` saída — operador entrega no caixa); recovery automático se `finalizeSaleTransaction` falhar após `registrarDevolucao` continua manual (toast com instrução clara).

---

### Cancelamento de Venda — Fase 2 ERP-safe (concluído 22/05/2026)

**Contexto:** o cancelamento marcava `status="cancelada"` + motivo/operador/data e estornava **apenas** o título à prazo (`contaReceberTituloId`). **Não repunha estoque** nem estornava a entrada à vista (`MovimentacaoFinanceira origem:"venda"`). Sem trilha de auditoria de estoque/financeiro no cancelamento.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/vendas/[id]/cancelar/route.ts` | Cancelamento agora roda em **transação**: (1) marca cancelada; (2) **repõe estoque** por `ItemVenda` resolvendo produto via `OR[id,sku,barcode]`, criando `MovimentacaoEstoque(tipo:"entrada", origem:"cancelamento_pdv", documento=pedidoId)` — repõe o **líquido** (vendido − já devolvido na Fase 0) para não duplicar entrada; (3) **estorna à vista** criando `MovimentacaoFinanceira(saida, origem:"cancelamento_pdv")` pelo valor líquido (entrada `venda` − refunds de devolução). Idempotente em estoque (`documento+produtoId+origem`) e financeiro (`referenciaId+tipo+origem`). `sessaoId` registrado na descrição do estorno (não reabre sessão). Estorno à prazo (`contaReceberTitulo`) mantido. |
| `app/api/vendas/[id]/route.ts` | Detalhe expõe `estoqueReposto` e `estornoFinanceiro` (flags do cancelamento). |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | Banner de cancelamento mostra "Estoque reposto" / "Estorno financeiro registrado". |

**Idempotência:** retry do cancelamento é bloqueado por `status==="cancelada"` (409) **e** por guards `findFirst` em estoque/financeiro (defesa em profundidade). Reposição/estorno nunca duplicam.

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → Compiled successfully.

**Riscos/pendências:** sessão de caixa fechada não é reaberta — estorno é registrado mesmo assim (auditável; impacto operacional documentado). Crédito/vale persistente segue fora de escopo (Fase 1).

---

### Trocas & Devoluções — Fase 0 (unificação real, concluído 22/05/2026)

**Contexto:** o F8 do PDV Assistência abria um `TrocasModal` 100% mock (inputs `itemDesc`/`motivo`, toast fake, `setTimeout(1500)`). Os botões "Trocas"/"Devoluções" do shell Omni/Classic eram placeholders. O Histórico de Vendas não tinha entrada para troca/devolução. A devolução existente (`/api/ops/devolucao`) persistia `DevolucaoVenda` + financeiro, **mas não devolvia estoque real** nem atualizava `Venda.status`.

**Objetivo da fase:** substituir o mock pelo fluxo real **reaproveitando** `TrocasDevolucao`, `/api/ops/devolucao`, `GET /api/vendas/[id]`, `qtyReturned` e `buildValeTrocaEscPos` — sem criar sistema novo.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/ops/devolucao/route.ts` | **Estoque REAL** dentro da transação: resolve produto por `OR [id, sku, barcode]`, `increment` em `Produto.stock` e cria `MovimentacaoEstoque(tipo:"entrada", origem:"devolucao")` com custo/auditoria (mesmo padrão do adapter OS→Estoque). Idempotência por `documento(localId)+produtoId+origem`. **`Venda.status`** atualizado para `parcialmente_devolvida`/`devolvida` agregando devoluções vs `ItemVenda`. `tipo` zod aceita `devolucao`. |
| `app/api/vendas/[id]/route.ts` | Detalhe expõe `creditoEmitido` por devolução. |
| `components/dashboard/vendas/trocas-devolucao.tsx` | 4 modos (devolução / troca / crédito-vale / somente estoque) mapeados ao modo local; campo **motivo**; props `initialSaleId` + `initialSale` (prefill) e `onRegistered` (refresh externo). `qtyReturned`, bloqueio de excesso e impressão ESC/POS preservados. |
| `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | `TrocasModal` mock **removido**; F8 abre `<TrocasDevolucao />` real em Dialog. |
| `components/dashboard/vendas/pdv-omni-classic-shell.tsx` + `pdv-classic.tsx` | Botões "Trocas"/"Devoluções" do diálogo avançado ligados ao modal real (`onOpenTrocas` → `showDevolucaoModal`). |
| `components/dashboard/vendas/vendas-arquivo-geral.tsx` | Botão "Trocar / Devolver" (linha, menu e drawer) abre `TrocasDevolucao` com a venda pré-carregada (snapshot); drawer mostra crédito gerado por devolução e label "Devolução". |

**Status real vs mock:**

| Item | Status |
|---|---|
| F8 PDV Assistência → fluxo real | ✅ Real |
| Trocas/Devoluções no Omni/Classic | ✅ Real |
| Botão Trocar/Devolver no Histórico | ✅ Real (carrega cliente + itens) |
| Estoque devolvido ao banco + ledger auditável | ✅ Real (`origem:"devolucao"`) |
| `Venda.status` parcial/total automático | ✅ Real (server-side) |
| Vale-troca ESC/POS | ✅ Real (inalterado) |
| Crédito do cliente | ⚠️ Local (localStorage) — persistência DB fica para Fase 1 |

**Fora de escopo (Fase 1/2):** estorno de cartão, PIX automático, financeiro avançado, crédito persistente em DB, carrinho negativo, multi-venda avançada.

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → Compiled successfully.

---

### Fluxos de Novo Cadastro — Unificação (concluído 22/05/2026)

**Contexto:** Existiam 3 pontos de entrada para criar cadastros (Topbar, CadastrosHub modal, DashboardPanel) com comportamento inconsistente. O Topbar apontava para páginas legacy. O ProductAIModal tinha botões mortos e animação fake de IA.

**Arquivos alterados:**

| Arquivo | Mudança |
|---------|---------|
| `components/painel-inicial/Topbar.tsx` | "Novo Cliente" e "Novo Produto" agora apontam para `/dashboard/cadastros-v2` (CadastrosHub canônico) em vez de páginas legacy |
| `components/cadastros/lovable/components/cadastros/produto-ia.tsx` | Botão "Preencher com IA" desabilitado com label "Em breve"; "Salvar rascunho" desabilitado; seção "Imagem IA" marcada como "Em breve" com `pointer-events-none` |

**O que já funcionava e não foi alterado:**

- Modal "Novo cadastro" do CadastrosHub: todos os 6 cards (Cliente, Produto, Serviço, Fornecedor, Técnico, Equipamento) já abriam formulários reais via `autoOpen` — mecanismo correto, nenhuma mudança necessária.
- `upsertProduto`: estoque, custo, preço e todos os campos mapeados já salvavam corretamente.
- Todos os 6 painéis do CadastrosHub: persistência real via server actions.

**O que ficou como "Em breve" (documentado em `docs/auditoria/CADASTROS_FLUXOS_UNIFICACAO.md`):**

- Preenchimento automático de produto por IA (OCR, voz, link, código de barras)
- Upload e processamento de imagem de produto
- Rascunhos de produto
- Campos NCM, Tributação, Tags, Descrição, Modelo — presentes no form mas não mapeados em `upsertProduto`

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → Compiled successfully.

---

### Bug: decremento de estoque ignorava quantidade total quando mesmo produto em múltiplas linhas (corrigido 21/05/2026)

**Problema em produção:** produto com estoque 2, vendido em 2 unidades → estoque ficava 1 (deveria ficar 0).

**Causa raiz:** o PDV pode enviar o mesmo produto em N linhas do carrinho (ex.: 2 cliques → 2 linhas qty=1, ou manualmente incrementado → 1 linha qty=2). O Step 3 de `upsertVendaInTransaction` processava linha por linha. Após criar `MovimentacaoEstoque` para a linha 1, o guard de idempotência `findFirst({ documento, produtoId, origem:"pdv" })` encontrava essa entrada na linha 2 e pulava → só 1 unidade decrementada em vez da soma correta.

**Solução — agregação prévia por produto (1 arquivo, 1 bloco):**

`lib/ops-upsert-venda.ts` Step 3: antes de criar o ledger, agrega `qtyByProdutoId: Map<dbId, totalQty>` somando as quantidades de todas as linhas do mesmo produto. Cria `resolvedByDbId` mapa reverso para acessar `sku/nome`. Então itera por produto único (não por linha), criando um único `MovimentacaoEstoque` e um único `decrement` com a quantidade total. Idempotência preservada: o guard `findFirst(documento+produtoId)` continua bloqueando retry da mesma venda.

| Cenário | Antes | Depois |
|---|---|---|
| 1 linha qty=2 | ✓ (decrementa 2) | ✓ (decrementa 2) |
| 2 linhas qty=1 mesmo produto | ✗ (decrementa 1) | ✓ (decrementa 2) |
| Retry da mesma venda | ✓ (bloqueado) | ✓ (bloqueado) |
| Produtos diferentes | ✓ | ✓ |

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → OK.

---

### Bug: estoque PDV não baixava + detalhe de venda falhava (corrigido 21/05/2026)

**Problema em produção:** vendas finalizadas no PDV mostravam saldo no financeiro/caixa mas:
- `Produto.stock` nunca decrementava;
- Nenhuma `MovimentacaoEstoque` era criada;
- Botão "Detalhes" na venda retornava erro 400 "ID da venda obrigatório".

**Causa raiz 1 — OR lookup ausente (estoque):**
`app/api/ops/inventory/route.ts` → `rowToItem()` retorna `id = skuTrim || row.id`. Quando o produto tem SKU (ex. "P001"), `InventoryItem.id = "P001"` (não o cuid). O PDV grava `inventoryId: "P001"` no carrinho. `upsertVendaInTransaction` Step 3 fazia `findFirst({ id: "P001" })` — campo `id` é cuid, não SKU → retornava `null` → `continue` → sem decremento, sem ledger.

**Causa raiz 2 — params não-await (detalhe):**
`app/api/vendas/[id]/route.ts` usava `{ params }: { params: { id: string } }` + `params.id` síncrono. No Next.js 16.2.0 `params` é uma `Promise` — `params.id === undefined` → 400 "ID da venda obrigatório".

**Solução (3 arquivos, mínimo necessário):**

| Arquivo | Mudança |
|---|---|
| `lib/ops-upsert-venda.ts` | Step 2 (ItemVenda): resolve produto via `OR [{ id }, { sku }, { barcode }]` + caches resultado em `resolvedProductMap<rawInvId, ResolvedProduct>`. Grava `ItemVenda.inventoryId = resolved.dbId` (cuid real). Step 3 (MovimentacaoEstoque): consome `resolvedProductMap` — sem re-busca; usa `resolved.dbId` para idempotência, decremento e ledger. |
| `app/api/vendas/[id]/route.ts` | `params: Promise<{ id: string }>` + `const { id: rawId } = await params`. |
| `app/api/vendas/[id]/cancelar/route.ts` | Mesma correção de `params`. |

**Efeito colateral positivo:** `ItemVenda.inventoryId` agora armazena o cuid real do `Produto` em vez do SKU, tornando as consultas de detalhe/devolução mais robustas.

**Validação:** `npx tsc --noEmit` → 0 erros. `npx next build --webpack` → OK.

---

### Caixa Híbrido → SessaoCaixa Server como fonte principal (concluído 21/05/2026)

**Problema:** estado do caixa vivia 100% em localStorage. Se limpo entre turnos, o PDV perdia a sessão ativa (abre sessão duplicada no server), e o fechamento gravava `totalVendas` vindo do localStorage (que podia divergir do banco).

**Solução (3 arquivos, best-effort/backward-compatible):**

| Arquivo | Mudança |
|---|---|
| `app/api/ops/caixa/sessao-detalhe/route.ts` | Agrega `MovimentacaoFinanceira(origem:"venda")` no intervalo da sessão → devolve `totalVendas` + `totalVendasCount` em `totais`. Sem mudança de assinatura existente (campo novo, adição). |
| `app/api/ops/caixa/fechar/route.ts` | Lê `abertaEm` da sessão; calcula `totalVendasServer` e `totalVendasCount` do banco; mescla com payload do cliente antes de gravar em `SessaoCaixa.payload`. Registro de fechamento agora é auditável mesmo se localStorage estava divergente. |
| `lib/operations-store.tsx` | No `loadDb` bootstrap, após sincronizar inventory/orders/sales, faz `GET /api/ops/caixa/sessoes?status=ABERTA&take=1`. Se server tem sessão ABERTA e estado local diz fechado (ou sem sessaoId): restaura `caixaSessaoId`, `isOpen=true`, `saldoInicial`, `dataAbertura`. Best-effort — falha silenciosa; não auto-fecha sessão no sentido inverso (segurança). |

**Fonte de verdade por campo após esta sessão:**

| Campo | Antes | Depois |
|---|---|---|
| `caixa.isOpen` | localStorage | localStorage + reconciliação server no bootstrap |
| `caixaSessaoId` | localStorage | localStorage + recuperação server no bootstrap |
| `caixa.saldoInicial` | localStorage | localStorage + recuperação server no bootstrap |
| `caixa.totalEntradas` | localStorage (acumulativo) | localStorage (runtime); `totalVendasServer` em `SessaoCaixa.payload` no fechamento |
| `totalVendas` histórico | localStorage snapshot em payload | banco (`MovimentacaoFinanceira`) — calculado server-side no fechamento e no `sessao-detalhe` |
| sangria/suprimento | `CaixaOperacao` DB (já era) | inalterado |

**O que NÃO foi alterado:**
- Fluxo de abertura/fechamento do caixa (modal UX, botões, toasts).
- `totalEntradas` runtime na barra PDV (ainda vem do localStorage acumulativo — mudá-la seria refatoração visual).
- Auth, proxy, OS, Marketplace, WhatsApp.
- Idempotência de `MovimentacaoFinanceira` e `MovimentacaoEstoque` (sessão anterior).

**Riscos remanescentes:**
- `totalEntradas` na barra PDV pode divergir de `totalVendasServer` (se vendas falharam no sync ou se localStorage foi parcialmente limpo). Resolver exigiria polling de `sessao-detalhe` durante o turno — fora de escopo.
- Sessões históricas (pré-21/05/2026) terão `totalVendasServer = 0` em `sessao-detalhe` (não existiam `MovimentacaoFinanceira(origem:"venda")` antes dessa data).
- Se caixa fechado no server mas localStorage diz aberto (raro — requereria fechamento externo direto no DB), a reconciliação NÃO fecha localmente. Operador verá caixa "aberto" que já foi fechado. Solução futura: verificar `status=FECHADA` do `sessaoId` local.

**Validação:** `npx tsc --noEmit` → 0 erros. `npm run build` → OK.

---

### PDV → Financeiro + Estoque — consolidação do fluxo de venda (concluído 21/05/2026)

**Problema:** o PDV finalizava a venda, decrementava estoque em memória (localStorage) e persistia `Venda` + `ItemVenda` no banco, mas:
- `Produto.stock` nunca era decrementado no banco;
- Nenhum `MovimentacaoEstoque` era criado para rastreabilidade;
- Nenhuma `MovimentacaoFinanceira` era lançada (receita PDV invisível no DRE/fluxo).

**Solução (cirúrgica — apenas 2 arquivos):**

| Arquivo | Mudança |
|---|---|
| `lib/ops-upsert-venda.ts` | `SalePayload` ganha `paymentBreakdown?: Partial<PaymentBreakdownFull>`. `upsertVendaInTransaction` ganha parâmetro `operadorLabel?` e, dentro da mesma transação, executa: (3) `MovimentacaoEstoque` por linha real com idempotência via `documento=pedidoId + produtoId + origem:"pdv"`; (4) `MovimentacaoFinanceira(entrada, "venda")` pelo valor imediato (total − aPrazo) com idempotência via `referenciaId=pedidoId + origem:"venda"`. |
| `app/api/ops/venda-persist/route.ts` | Resolve `operadorLabel` da sessão NextAuth e propaga ao `upsertVendaInTransaction`. |

**Comportamento completo de uma venda PDV (do confirm ao banco):**

1. `finalizeSaleTransaction` (client-side): valida caixa, decrementa estoque em memória, grava `SaleRecord` em localStorage, emite `venda_finalizada`, dispara `POST /api/ops/venda-persist` (fire-and-forget).
2. `venda-persist` → `upsertVendaInTransaction` (mesma transação Prisma):
   - Upsert `Venda` + recria `ItemVenda` (idempotente por `pedidoId`).
   - Para cada item físico: cria `MovimentacaoEstoque(tipo:"saida", origem:"pdv")` e decrementa `Produto.stock`.
   - Se `valorImediato > 0`: cria `MovimentacaoFinanceira(tipo:"entrada", origem:"venda")`.
3. Se aPrazo > 0: client chama `appendContaReceberTituloPdvAprazo` → `ContaReceberTitulo` no banco (fluxo pré-existente, não alterado).

**Idempotência (anti-dupla movimentação em retry):**
- `MovimentacaoEstoque`: `findFirst({ documento, produtoId, origem:"pdv" })` antes de criar.
- `MovimentacaoFinanceira`: `findFirst({ referenciaId, origem:"venda", tipo:"entrada" })` antes de criar.

**O que NÃO foi alterado:**
- `operations-store.tsx` (client-side), fluxo aPrazo, auth/proxy/schema.prisma.
- PDV Classic, Assistência e Supermercado — usam o mesmo `finalizeSaleTransaction` e `venda-persist`, ganham os efeitos automaticamente.
- PDV Black Edition — `handlePaymentConfirm` ainda não chama `venda-persist` (pendência pré-existente, não escopo desta sessão).

**Riscos remanescentes:**
- Histórico de vendas anteriores (245 no banco): `Produto.stock` está inflado em relação ao que foi vendido. Novas vendas serão decrementadas corretamente a partir desta sessão.
- Operações offline (venda no localStorage sem sync): `Produto.stock` e ledgers não são retroativamente corrigidos — depende de um reconciliador futuro.
- `creditoVale` não gera `MovimentacaoFinanceira` (é abatimento de saldo já existente, não receita nova).

**Validação:** `npx tsc --noEmit` → 0 erros. `npm run build` → OK.

---

### Operações HUB — Adapter OS → Estoque Fase 2 (concluído 21/05/2026)

**Antes:** o adapter `lib/operacoes/adapters/os-estoque.ts` já fazia consumo/restauração/delta real do estoque com transação, idempotência, anti-negativo e ledger profissional (`MovimentacaoEstoque` com `tipo:"saida"`, `origem:"os"`). Mas as movimentações geradas pela OS gravavam `usuario: null`, `documento: null`, `custoUnitario: 0` e `valorTotal: 0` — sem auditoria de quem baixou, sem vínculo humano com a OS e sem valor consumido para KPIs.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/operacoes/adapters/os-estoque.ts` | `registrarLedgerOS` recebe `osNumero` e `operador` e grava: `usuario` (do session label), `documento` = número da OS (ex.: `OS-2026-00012`), `motivo` igual ao `documento`, `custoUnitario` = `arredonda2(max(0, precoCusto))` e `valorTotal` = `qtd × custoUnitario`. As três funções públicas (`consumeEstoqueFromOS`, `restoreEstoqueFromOS`, `applyEstoqueDelta`) ganham `operador?: string \| null`, leem `OrdemServico.numero` na mesma transação e repassam ao ledger. `tipo` e `origem` mantidos. |
| `app/actions/operacoes.ts` | `updateOSStatus` e `updateOSPayload` resolvem `getOperatorLabelFromSession(await auth())` uma vez e propagam para as 4 chamadas (1 consume + 2 restore + 1 delta). |

**Campos do `MovimentacaoEstoque` para `origem:"os"`:**

| Campo | Antes | Depois |
|---|---|---|
| `usuario` | `null` | operador NextAuth (`name` ou `email`) |
| `documento` | `null` | `OrdemServico.numero` (fallback `OS {osId}`) |
| `motivo` | `OS {osId}` (cuid) | mesmo do `documento` (número humano) |
| `custoUnitario` | `0` | `precoCusto` atual do produto |
| `valorTotal` | `0` | `qtd × custoUnitario` |

**Validação:** `npx tsc --noEmit` — 0 erros novos nos arquivos modificados. Os 4 erros pré-existentes em `components/omni-agent/OmniAgentHub.tsx` (linhas 732–744, `points`/`heatmap` undefined) eram causados pelas variáveis de gráfico sintético e foram **resolvidos na sessão de refatoração visual de 21/05/2026** (remoção dos `useMemo` com `Math.random()`).

**Comportamento preservado (NÃO alterado):**

- Idempotência (`payload.estoqueConsumido`, `estoqueUltimaRevisaoEm`).
- Validação anti-negativo prévia em transação.
- Best-effort: falhas registram `estoque_sync_erro` na timeline, não quebram a OS.
- `tipo:"saida"` + `origem:"os"` mantidos como par diferenciador (PDV usa `origem:"pdv"`).

**Riscos remanescentes / pendências:**

- Operador pode vir `null` em transições disparadas fora de sessão NextAuth (job interno) — schema aceita; relatórios precisarão tratar.
- Produtos com `precoCusto = 0` (legados GestaoClick) continuarão gerando `valorTotal = 0` até cadastro de custo — não é regressão.
- Movimentos históricos pré-21/05/2026 continuam com campos `null/0` — só novas baixas/restaurações são preenchidas. Backfill opcional fica como próximo passo.
- `registrarLedgerOS` continua silencioso em falha (`console.error`) — endurecer com evento `estoque_ledger_erro` fica para fase futura.

**Próximos passos sugeridos:** F2.4 — evento `estoque_item_ignorado` visível na timeline; F2.5 — defesa em profundidade na idempotência via consulta ao ledger; F2.6 — KPI "valor consumido por OS" agora que `valorTotal` é confiável.

---

### Omni Agent HUB — Refinamento Visual Premium (concluído 21/05/2026)

**Contexto:** backend, Prisma, server actions, automações e lógica de comandos mantidos intactos. Sessão exclusivamente de visual/UX.

**Problema principal:** gráfico SVG "Comandos por hora" e "Mapa de calor (semana)" usavam `Math.random()` em `useMemo` — dados 100% sintéticos apresentados como tendências reais. Quatro erros TypeScript (`points`/`heatmap` undefined) eram consequência direta dessas variáveis.

**Arquivos alterados:**

| Arquivo | Tipo |
|---|---|
| `components/omni-agent/OmniAgentHub.tsx` | Múltiplas edições cirúrgicas (visual/UX) |
| `components/omni-agent/OmniAgentInboxReal.tsx` | Reescrita completa visual (lógica inalterada) |

**Mudanças em `OmniAgentHub.tsx`:**

- **Dados sintéticos removidos:** `useMemo` com `Math.random()` para `hours`, `points` e `heatmap` eliminados
- **Gráfico fake → distribuição real:** card "Comandos por hora" substituído por barras de distribuição por status usando `stats.executed`, `stats.pending`, `stats.awaitingConfirmation`, `stats.error` (dados Prisma reais) com skeleton loading
- **Heatmap aleatório → resumo honesto:** 4 métricas reais (hoje, total histórico, taxa de acerto, pendentes) com skeleton por célula
- **Stat component:** prop `loading` com skeleton animado; prop `accent` para cor semântica por tipo de métrica
- **Header:** ícone `Bot` → `Cpu`; status badge com cor semântica (verde/cinza); notificações com lista scrollável e link "Ver Inbox"; botões `sm:inline-flex`
- **Tabs:** labels `hidden sm:inline`; badges de pendência com formato compacto
- **Feed rows:** borda esquerda `border-l-2` colorida por `badgeKind` (`emerald`/`amber`/`blue`/`destructive`)
- **Último comando:** card com borda colorida e badge de status contextual
- **AutomationsTab:** borda esquerda `emerald` (ativa) / `border` (inativa); badge Ativa/Inativa; template em bloco `bg-muted/50 font-mono`; skeleton de loading; empty state com ícone `Zap`
- **MemoryTab:** avatar de iniciais (2 letras, `rounded-full`) na lista; skeleton de 5 itens; empty state com ícone `Users`
- **ReportsTab:** stat grid com `loading` prop e cores semânticas; barras `rounded-full` com `transition-all duration-500`; cards financeiros com cores por tipo (receita=verde, despesa=vermelho, pend.=âmbar); skeleton do financeiro em vez de texto simples
- **SettingsTab:** audit log com ponto `bg-primary/40` por linha, monospace, hover sutil, container `bg-muted/30`
- **Floating button:** pill com `ring-2`; cor semântica online/pausado; label dinâmico ("X pendentes" / "Online" / "Pausado"); mini-dashboard expandido polido

**Mudanças em `OmniAgentInboxReal.tsx`:**

- **Skeleton loading:** 3 cards animados com avatar, texto e badges
- **Filtros pill:** barra no estilo das Tabs principais; contadores por status integrados ao label
- **Borda esquerda colorida por status:** `amber`=pendente · `blue`=aguardando · `emerald`=executado · `destructive`=erro
- **Ícone semântico por card:** `Clock` (pendente) · `AlertTriangle` (aguardando) · `CheckCircle2` (executado) · `XCircle` (erro)
- **Botão "Executar":** spinner `Loader2` durante processamento; "Recusar" com hover `text-destructive`
- **Confirmação de cliente ambíguo:** container `bg-blue-500/5 border-blue-500/20`
- **Campos interpretados:** label `uppercase tracking-wider`; `sm:grid-cols-2`
- **Resultado:** container `bg-card` com label uppercase
- **Empty state:** ícone `Inbox` centralizado com subtexto orientativo

**Validação:** `npx tsc --noEmit` → **0 erros** (os 4 erros pré-existentes de `points`/`heatmap` foram eliminados junto com as variáveis).

**O que NÃO foi alterado:**
- Prisma, server actions, automações, event bus
- WhatsApp backend, auth, proxy
- Lógica de interpretação de comandos, tipos, APIs
- Mocks de "sugestões" no OverviewTab (cards de ação UI, não dados)
- WhatsAppTab, CommandsTab, NewCommandModal, CommandPalette (sem mudanças visuais além das passadas pelo Stat refatorado)

**Pontos que ainda dependem do backend para evolução futura:**
- Gráfico de comandos por hora: exigiria `OmniAgentHubStatsDTO` com breakdown `por hora`
- Memória operacional / timeline unificada do cliente: fase 3
- Créditos IA / plano no SettingsTab: localStorage local, sem backend

---

### Cadastros HUB > Importação — HUB reestruturado (concluído 21/05/2026)

**Antes:** aba "Importação" do `CadastrosHub` rodava um `ImportFlow` mock (drag&drop fake, mapeamento de colunas fictício, contagens de erro hardcoded) + um modal `Importar planilha` que abria o mesmo mock. O `ImportadorAvancado` real existia mas só era acessível por `Configurações > Importação`. XML NF-e tinha apenas protótipo isolado em `components/dashboard/estoque/gestao-produtos.tsx`. Não havia histórico/auditoria consolidado de lotes de import.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `components/cadastros/lovable/components/cadastros/ImportacaoHub.tsx` (NOVO) | HUB 3-blocos: (1) **Planilhas** monta `<ImportadorAvancado />` real dentro de `<AppOpsProviders>`; (2) **XML NF-e** com `DOMParser` cliente lendo `det/prod/xProd/cProd/NCM/CFOP/vUnCom/qCom` — preview de cabeçalho + tabela de itens, banner "Parser experimental — preview apenas, não persiste no banco", botão "Confirmar entrada" desabilitado; (3) **Histórico** consome `listImportacoesAuditoria` com empty state honesto. Header com 3 KPIs clicáveis (Lotes / Última / Registros consolidados) derivados dos logs reais. |
| `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` | Removidos `ImportFlow` mock e modal `Importar planilha`. Botão "Importar" do header navega para `tab=importacao`. `ImportacaoPanel` agora delega ao `<ImportacaoHub />`. |
| `app/actions/cadastros.ts` | Nova Server Action `listImportacoesAuditoria(limit)` lê `LogsAuditoria` com `action startsWith "import."`. Tipo amigável (Planilhas / XML NF-e / Outro), totais, batchId, duração, porDominio, status (ok/erro). Sem schema novo — usa o modelo existente. |
| `app/api/import/advanced/route.ts` | Best-effort `prisma.logsAuditoria.create` ao final de cada batch: `action: "import.planilha"` (ou `.erro`), `source: "importador_avancado"`, `metadata` JSON com `batchId`, `storeId`, `duracaoMs`, `totais`, `porDominio`, `arquivos`. `requireSubscription` agora devolve `userLabel` para logar quem importou. |

**Status real vs placeholder:**

| Bloco | Status |
|---|---|
| Planilhas (CSV/XLSX/ZIP GestaoClick) | ✅ Real — reaproveita `ImportadorAvancado` intacto |
| Histórico de lotes (data, usuário, totais, duração, batchId, porDominio) | ✅ Real — gravação a partir desta sessão; lotes pré-21/05/2026 não aparecem |
| KPIs do header (Lotes / Última / Registros) | ✅ Real — calculados sobre `LogsAuditoria` |
| XML NF-e — preview cliente (cabeçalho + itens) | ✅ Real (preview-only) |
| XML NF-e — gravação de estoque/fornecedor/preço | ⚠️ Placeholder honesto: banner explícito, botão desabilitado, card "Planejado" / "Fora deste fluxo" |

**Validação:** `npx tsc --noEmit` EXIT 0 · `npm run build` Compiled successfully in 35.2s.

**Pendências:**
- Backend fiscal definitivo (entrada estoque por NF-e, vínculo fornecedor por CNPJ, atualização preço custo + NCM/CFOP, lançamento financeiro automático, integração SEFAZ) — fora de escopo desta sessão.
- Lotes importados antes de 21/05/2026 não constam no Histórico (o gancho de auditoria foi adicionado nesta sessão).

---

### Financeiro HUB V2 — aba "A Pagar" plugada em dados reais (concluído 20/05/2026)

**Antes:** `/api/financeiro/pagar` retornava `rows[]` apenas com `id, descricao, fornecedor, valor, vencimento, status`. `fornecedorFromPayload` fazia fallback para a string `"Fornecedor"` (mock falso). `normalizePagarRows` ignorava `descricao` e `parcela`; UI mostrava `id` cru ("imp-gc:loja-1:cp:funcionario:…").

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/financeiro/pagar/route.ts` | Helper `pickStringFromPayload`/`parcelaLabelFromPayload`. `rows[]` (e detalhe via `?localKey=`) agora inclui `categoria` (payload.planoContas), `formaPagamento`, `contaBancaria`, `observacao`, `parcela: "N/M"`. `fornecedorFromPayload` deixou de retornar "Fornecedor" como fallback — devolve string vazia, UI decide o "—". |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Tipo `ContaPagar` ganha `descricao`, `categoria`, `parcela`, `formaPagamento`, `contaBancaria`, `observacao`. `normalizePagarRows` propaga todos os campos sem fallback enganoso (vazio fica vazio). |
| `components/financeiro/lovable/routes/financeiro.tsx` | Aba "A Pagar": coluna `Doc.` → `Título` exibindo `descricao` (truncate + tooltip), novas colunas `Categoria` e `Parcela`, sub-texto "saldo R$ X" em Pago quando parcial, empty state honesto (mensagem diferente para "sem dados na loja" vs "filtro vazio"), vencimento "—" quando vazio. `handleDuplicar` agora propaga `descricao` e `categoria`. |

**Validação (5 exemplos reais):**

- **ALUGUEL IMOVEL** — vencido · R$ 1.950,00 · venc 10/04/2026 · categoria Aluguel · fornecedor "—" (vazio na planilha)
- **FUNCIONARIO** — 4 parcelas: 1/4 R$ 600 (vencido, 07/04, 13º salário) · 2/4 R$ 400 (pendente, 20/04, VALE) · 3/4 e 4/4 R$ 600 (pendentes, 07/05, PAGAMENTO)
- **WORD CELL PRIME** — 3 parcelas pagas (R$ 110 + R$ 195,25 + R$ 215), fornecedor "WORD CELL PRIME", categoria Compras
- **PLANETA CELULARES** — 2 parcelas pagas via PIX (R$ 310 + R$ 138), fornecedor "PLANETA CELULARES", categoria Compras
- **Fechamento de caixa** — 22 registros preservados (RAFAEL FARIA DE LIMA / Ajuste de caixa)

**Summary (KPIs aba A Pagar):**

| Estado | Qtd | Valor |
|---|---|---|
| Pago | 31 | R$ 10.984,17 |
| Vencido | 4 | R$ 2.804,05 |
| Pendente | 3 | R$ 1.600,00 |
| **Total** | **38** | **R$ 15.388,22** ✓ |

Bate exatamente com a expectativa indicada pelo usuário (~R$ 15.388,22).

**Limitações restantes da aba A Pagar:**

- KPIs específicos da aba A Pagar (cards no topo da aba) ainda não foram adicionados — Visão Geral já tem `StatCard "A pagar"` consumindo `summaryP.totalAberto`. Adicionar bloco de KPIs dentro de `ContasPagar()` seria escopo de UX, não foi pedido.
- `HistoricoPagarModal` busca `payload.historico` via `?localKey=` (já retorna corretamente o pagamento gravado pelo importador), mas renderização do histórico continua simples.
- Modais (`PagarContaModal`, `EstornoPagarModal`) usam `conta.id` (localKey) no título — visualmente longo mas funcional.
- Forma de pagamento e Conta bancária estão no contexto/modelo mas não foram expostas como colunas visíveis na tabela (decisão de manter visual atual de 7 colunas).

---

### Financeiro HUB V2 — aba "A Receber" plugada em dados reais (concluído 20/05/2026)

**Antes:** o `FinanceiroRealContext` já consumia `/api/financeiro/receber` mas perdia informação no caminho: `parcela` hardcoded `"1/1"`, `descricao` não chegava ao tipo `ContaReceber`, coluna "Título" da tabela mostrava o `localKey` cru (ex.: `imp-gc:loja-1:cr:venda-de-no-131:cleiton-…:2026-02-21:20000:1`).

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/financeiro/receber/route.ts` | `rows[]` agora inclui `descricao` (já existia) e `parcela` (extraída de `payload.parcela.{numero,total}` → `"N/M"`). Mantém compatibilidade com clientes antigos do endpoint (campos novos, nenhum removido). |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Tipo `ContaReceber` ganha `descricao: string`. `normalizeReceberRows` usa `parcela` real do endpoint (sem fallback `"1/1"`) e preserva `descricao` para a UI. |
| `components/financeiro/lovable/routes/financeiro.tsx` | Coluna "Título" da tabela "A Receber" mostra `descricao` (ex.: "Venda de nº 131 (1/5)") com fallback monoespaçado para `id` quando descrição vazia. Coluna "Recebido" agora exibe sub-texto "saldo R$ X" quando há recebimento parcial. Vencimento exibe "—" se vazio. |

**Validação (Venda 131 / CLEITON):**

```
Título                    Cliente                    Parcela Venc.       Status    Valor       Recebido    Saldo
Venda de nº 131 (1/5)     CLEITON RICARDO SIQUEIRA   1/5     2026-02-21  pago      R$ 200,00   R$ 200,00   R$ 0,00
Venda de nº 131 (2/5)     CLEITON RICARDO SIQUEIRA   2/5     2026-03-23  pago      R$ 272,50   R$ 272,50   R$ 0,00
Venda de nº 131 (3/5)     CLEITON RICARDO SIQUEIRA   3/5     2026-04-22  pendente  R$ 272,50   R$ 0,00     R$ 272,50
Venda de nº 131 (4/5)     CLEITON RICARDO SIQUEIRA   4/5     2026-05-22  pendente  R$ 272,50   R$ 0,00     R$ 272,50
Venda de nº 131 (5/5)     CLEITON RICARDO SIQUEIRA   5/5     2026-06-21  pendente  R$ 272,50   R$ 0,00     R$ 272,50
```

KPIs reais já em funcionamento desde antes desta sessão (`fluxoCaixa`, `summaryR`, `summaryP` consumidos pelos `StatCard` da Visão Geral e da aba Fluxo) — apenas refletem agora os 307 títulos preservados pelo importador.

**Limitações restantes do Financeiro HUB V2:**

- HistoricoModal já chama `/api/financeiro/receber?localKey=...` que retorna `payload.historico` — entrada `tipo: "pagamento"` gravada pelo importador (Confirmado) aparece ali, mas o modal renderiza só genéricos; refinamento de UI do histórico ainda não foi feito.
- Renegociação (`RenegociarModal`) continua placeholder ("em preparação") — sem backend.
- "Recibo" é gerado client-side a partir do `id` do título — usa `localKey` cru.
- Aba **A Pagar** segue o mesmo fluxo `FinanceiroRealContext`/`normalizePagarRows`, mas `parcela` ainda não foi exposta (importador já grava `payload.parcela` para pagar — plug é simétrico, só não aplicado nesta sessão por escopo).
- Carteiras, DRE, Conciliação, Fechamento, Relatórios continuam reais via seus próprios endpoints — não tocados.

---

### Importador GestaoClick — contas_receber/pagar com parcelas (concluído 20/05/2026)

**Bug original:** Vendas parceladas chegavam ao Financeiro HUB com apenas 1 parcela. Ex.: Venda nº 131 / CLEITON RICARDO SIQUEIRA tinha 5 parcelas na planilha mas o banco guardava só 1 (a última, R$ 272,50 não pago).

**Causa raiz (4 problemas independentes):**

1. **`localKey` colidia** — `chaveJoin` de contas_receber apontava para `financeiro.descricao`. Como todas as 5 parcelas têm a mesma descrição ("Venda de nº 131"), `localKey = imp-${storeId}-${chave}` era idêntica, e `upsertContaReceber` sobrescrevia cada parcela na mesma row.
2. **Valor sempre = 0** — colunas reais do GestaoClick são `Plano de contas_3` / `Plano de contas_8` (pivot ofuscado), não mapeadas no dicionário.
3. **Vencimento sempre vazio** — coluna real é `Plano de contas_9`, também não mapeada.
4. **Status nunca casava** — `"Confirmado"` (294 linhas) e `"Não Pago"` (6 linhas) não estavam em `RECEBER_ALIASES`; quase tudo caía em `pendente` por fallback.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/importador-avancado/merger.ts` | Novo helper `extrairPerfilGestaoClick` reconhece o pivot `Plano de contas_1..9` e mapeia entidade/valor/vencimento. Novo `mapearStatusReceberCanon`: `Confirmado→pago`, `Não Pago→pendente`, `Atrasado→vencido`, etc. `extrairCamposContaReceber`/`Pagar` retornam status canônico + `valorPago` + `dataConfirmacao` + `statusOriginal`. Prioriza `_raw` para descrições (evita `normalizarLinha` converter "Venda de nº 131" → `131`). |
| `lib/importador-avancado/persistidor.ts` | `persistirContasReceber`/`Pagar` agora: (a) pré-extrai todos os registros e numera parcelas N/M via `indexarParcelas` (agrupa por descrição+entidade, ordena por vencimento); (b) gera `localKey` única por parcela: `imp-gc:{storeId}:cr:{slugDesc}:{slugCli}:{venc}:{valorCents}:{n}`; (c) registra histórico de pagamento quando `status=pago`; (d) usa `replacePayload: true` para idempotência em re-importação. |

**Resultado pós-fix (re-import da planilha real, 307 linhas):**

- Venda 131 / CLEITON: **5 parcelas** corretas (1/5 R$ 200 pago, 2/5 R$ 272,50 pago, 3/5–5/5 R$ 272,50 pendente)
- Outras vendas parceladas: 14 grupos com ≥2 parcelas preservados
- Distribuição: 294 pago (R$ 17.989,41) · 7 vencido (R$ 2.124,99) · 6 pendente (R$ 1.522,49)
- Re-importação idempotente: mesma `localKey` → upsert no mesmo título, sem duplicar histórico

**Script auxiliar:** `scripts/reimport-contas-receber.ts` — re-roda o pipeline completo via CLI (`npx tsx scripts/reimport-contas-receber.ts <xlsx>`); limpa títulos com prefixos `imp-loja-1-` (legado) e `imp-gc:{storeId}:cr/cp:` antes de re-importar.

---

### Cadastros HUB — UX Clientes + Vínculo Venda→Cliente (concluído 19/05/2026)

#### UX Clientes (Fase 4)

**Arquivo principal:** `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx`

- **Modal PF/PJ:** Select de tipo controlado; ao mudar PF↔PJ o campo de documento é limpo e a label/placeholder mudam dinamicamente (`CPF 000.000.000-00` / `CNPJ 00.000.000/0000-00`); máscara aplicada em tempo real
- **Botões da tabela:** Eye/Wrench/ShoppingCart desabilitados com `opacity-40 cursor-not-allowed` e tooltip "em breve"; Editar funciona; WhatsApp abre `wa.me` se cliente tiver telefone, desabilitado se não tiver
- **Total gasto real:** calcula em tempo real via aggregate Prisma (OS + Venda por clienteId); fallback para `Cliente.totalSpent` se DB falhar

#### Vínculo Venda → Cliente (FK real no banco)

**Schema alterado:**

| Model | Mudança |
|---|---|
| `Venda` | + `clienteId String?` + `cliente Cliente? @relation(onDelete: SetNull)` + `@@index([clienteId])` |
| `Cliente` | + `vendas Venda[]` |

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/operations-sale-types.ts` | `SaleRecord` + `clienteId?: string` |
| `lib/ops-upsert-venda.ts` | `SalePayload` + `clienteId`; upsert persiste no banco |
| `lib/operations-store.tsx` | `finalizeSaleTransaction` aceita + propaga `clienteId` |
| `venda-completa-enterprise.tsx` | passa `clienteId: selectedCliente.id` |
| `pdv-venda-completa-enterprise.tsx` | passa `clienteId: selectedCliente?.id` |
| `pdv-assistencia-enterprise.tsx` | passa `clienteId: selectedClienteId ?? undefined` |
| `pdv-classic.tsx` | passa `clienteId: selectedCustomer?.id` |

**Regra de totalGasto:**
```
totalGasto = SUM(OS.valorTotal WHERE status IN [Pronto, Entregue] AND clienteId = c.id)
           + SUM(Venda.total WHERE status = "concluida" AND clienteId = c.id)
```

**Backfill:** `run-backfill-venda-cliente.mjs` (match por doc/telefone normalizado, nunca por nome).
- 245 vendas GestaoClick não têm `payload.enterprise` → ficam `clienteId = null`
- Futuras vendas PDV Enterprise são vinculadas em tempo real

**`pdv-supermercado.tsx`** e consumidor final: `clienteId = null`, comportamento inalterado.

---

### Governança IA — sincronização canonical (concluído 19/05/2026)

- **`CLAUDE.md`** atualizado com bloco de governança obrigatória no topo (ler antes de qualquer tarefa)
- **`.cursor/rules/omnigestao.mdc`** criado — regras carregadas automaticamente pelo Cursor em toda sessão (`alwaysApply: true`)
- **`docs/skills/`** criado com estrutura canônica:
  - `INDEX.md` — índice de governança
  - `rules/CORE_RULES.md` — regras globais
  - `rules/DELIVERY_CHECKLIST.md` — checklist de encerramento
  - `rules/AI_WORKFLOW.md` — papéis Sonnet vs Opus, contexto, GitHub
  - `rules/FRONTEND_IMPORT_RULES.md` — regras de importação de UI externa

---

### Cadastros HUB — Fase 1+2+3 (concluído 19/05/2026)

**Arquivo:** `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx`

- **Fase 1 (busca clientes):** state `filterQuery` controlado, `visibleRows` com filtro nome/telefone/documento/cidade, contador atualizado, busca funciona desde o 1º caractere
- **Fase 2 (visual inputs):** campo de pesquisa da Toolbar trocado de `bg-card` para `bg-background` — texto visível em todos os temas
- **Fase 3 (performance):** separados `refreshRows` (rápido, bloqueia só tabela) e `refreshAlerts` (lento, silencioso) — busca responsiva imediatamente, alertas carregam em paralelo sem travar a lista

---

### PDV Next / Black Edition — 4º PDV (concluído 19/05/2026)

**Rota:** `/dashboard/pdv-next`
**Galeria:** `Configurações > PDV` → 4 cards na grade "Fluxos principais"

#### Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `components/pdv-next/PdvBlackShell.tsx` | Shell visual Black Edition isolado — sempre preto, sem dependência de `useStudioTheme`. Header operacional: loja, caixa aberto/fechado, operador, cupom, relógio, status online. Tabela de itens, sidebar (total emerald, cliente, NF-e), barra F1–F9 |
| `components/pdv-next/PdvBlackEdition.tsx` | Controller: carrinho, catálogo real (`mergePdvCatalogWithInventory`), busca de clientes real (`useClienteSearch`), caixa (`useCaixa`), atalhos globais F1–F9, `PaymentModal` |
| `app/dashboard/pdv-next/page.tsx` | Rota Next.js com Suspense |

#### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `app/dashboard/layout.tsx` | `isVendas` inclui `/dashboard/pdv-next` (noPadding + flex-1) |
| `components/configuracoes-v3/features/settings/sections/PdvSection.tsx` | 4º card com preview black/emerald, badge Beta, link direto para `/dashboard/pdv-next` |

#### Status real vs mock

| Funcionalidade | Status |
|----------------|--------|
| Produtos do inventário (ao vivo) | ✅ Real |
| Busca de clientes (F2) via API | ✅ Real |
| Status caixa aberto/fechado | ✅ Real |
| Nome da loja e operador | ✅ Real |
| Atalhos F1–F9 (teclado global) | ✅ Real |
| Bipe/scan de produto (Enter) | ✅ Real |
| CaixaStatusBar (abertura/fechamento) | ✅ Real |
| Pagamento (PaymentModal) | ⚠️ Mock — abre o modal, limpa carrinho, **não persiste venda no banco** |
| Documento fiscal (NF-e) | ⚠️ Mock — placeholder "NF-e — mock" |

#### PDVs preservados (sem alteração)

| PDV | Rota | Status |
|-----|------|--------|
| PDV Clássico/Omni | `/dashboard/vendas` | ✅ Intocado |
| PDV Assistência | `/dashboard/vendas` (services layout) | ✅ Intocado |
| PDV Supermercado | `/dashboard/vendas` (supermercado layout) | ✅ Intocado |
| **PDV Next / Black Edition** | `/dashboard/pdv-next` | ✅ **Novo — isolado** |

---

### Importador Avançado — GestaoClick (concluído 17/05/2026)

**Commit 1** — `lib/importador-avancado/` (6 arquivos):
- `types.ts`, `detector.ts`, `merger.ts`, `parser.ts`, `persistidor.ts`, `index.ts`

**Commit 2** — `app/api/import/advanced/route.ts`:
- `GET /api/import/advanced` → capabilities (formatos, domínios, limites)
- `POST /api/import/advanced?modo=preview` → planilhasDetectadas, grupos, confiança
- `POST /api/import/advanced?modo=importar` → { batchId, totais, porDominio, errosDetalhados, duracaoMs }
- Auth via NextAuth v5 + fallback cookie legado
- Suporte a ZIP do GestaoClick (adm-zip + jszip instalados)

**Commit 3** — UI do Importador Avançado:
- `components/dashboard/configuracoes/importador-avancado/hooks/use-importador-avancado.ts` — engine completa (upload, preview, import, estado em máquina de fases)
- `UploadZone.tsx` — drag & drop multi-arquivo, aceita ZIP
- `PreviewCruzamento.tsx` — lista planilhas com barra de confiança, amostra colapsável, botão Importar tudo
- `LogAuditoria.tsx` — resultado pós-import agrupado por domínio, batchId copiável, erros detalhados
- `ImportadorAvancado.tsx` — orquestrador (UploadZone → PreviewCruzamento → BarraProgresso → LogAuditoria)

**Integração:**
- `components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx` substituído por switcher de 2 cards (padrão PdvSection):
  - "Importação Universal" → `<ImportadorDadosExternos />` (legado, default)
  - "Importação Avançada" → `<ImportadorAvancado />`
  - Modo persistido em `localStorage["@omnigestao:importacao-modo"]`

**Dependências instaladas:**
- `adm-zip@^0.5.17`, `jszip@^3.10.1` (runtime — ZIP do GestaoClick)
- `@types/adm-zip` (devDependencies)

**Resultado de importação real (ZIP GestaoClick, 17/05/2026):**
- 17/17 arquivos detectados com domínio correto e confiança ≥70%
- Log do import reportou: ~555 criados / 2 atualizados / 13 ignorados / 0 erros (~53s) — *não reconferido nesta sessão*
- Estado do banco verificado após o import: Clientes 40 ✅ | Fornecedores 15 (tabela própria) ✅ | Produtos 231 ✅ | OS 34 ✅ | Vendas 245 ✅
- servicos_catalogo: ignorado (modelo próprio pendente)
- contas_pagar/receber: detectadas mas não persistidas (Fix futuro)

---

### Fixes aplicados (detector, parser, persistidor, hydration)

| Fix | Arquivo | O que fez |
|---|---|---|
| Fix 1 | deps | `npm install adm-zip jszip` |
| Fix 2 | `detector.ts` | Dicionário calibrado com headers reais GestaoClick (`"n da os"→os.numero`, `"nome"→cliente.nome`, etc.) |
| Fix 3 | `parser.ts` | Removido branch ExcelJS (não instalado → derrubava compilação da rota) |
| Fix 4 | `detector.ts` | `"n do pedido"→venda.numero`; reordenação de assinaturas (sub-domínios de vendas e `fornecedores_enderecos` antes dos genéricos); `clientes` passa a exigir `tipoPessoa` |
| Fix 5 | — | Não houve um Fix 5 isolado nesta sessão — o ajuste de `clientes_enderecos` foi incorporado ao Fix 6 |
| Fix 6 | `detector.ts` | `nomeNorm.includes(norm(n))` — normaliza entradas de `nomesArquivo` antes de comparar (underscore virava espaço e nunca casava); `clientes_enderecos.nomesArquivo` restrito |
| Fix 7 | `persistidor.ts` | Clientes: grava `document`, `kind`, `city`, `active`; Produtos: grava `barcode`, `brand`, SKU sintético anti-colisão; OS: match 4 camadas (doc→mapa→doc banco→nome banco) |
| Fix 8 | `use-importador-avancado.ts` | Hook lê `planilhasDetectadas` do response (backend) e preenche também `planilhas` (compatibilidade componentes) |
| Fix 9 | `route.ts` | Lê `modo` do query string (`?modo=importar`) e não só do FormData — era a causa de NUNCA persistir |
| Fix 10 | `persistidor.ts` | Fornecedores persistem na tabela `Fornecedor` (não mais em `Cliente`); `servicos_catalogo` marcado como ignorado; OS ganha 5ª camada de match (contains da 1ª palavra) |
| Fix 11 | `app/api/ops/ordens/route.ts` | GET usa `hydrateOSRows` com `include: { cliente, garantiasOperacionais }` em vez de devolver `r.payload` cru |
| Fix 12 | `app/actions/ordens.ts` | `findMany` inclui `cliente`; `DbOrdemRow` tipado com `cliente?`; `mapRows` propaga `{ id, nome }` |
| Fix 13 | `lib/operacoes/services/hydration-service.ts` | `PrismaOSRow` aceita `cliente?` (nome opcional); `applyPrismaEnrichment` propaga nome real do cliente (FK) quando payload tem `"—"` |

---

### Operações HUB — dados reais via Prisma (concluído 17/05/2026)

- **Kanban** mostra nome do cliente, defeito e valor nos cards ✅
- **Detalhe da OS** mostra `CLIENTE: LARISSA SOARES` (FK real) ✅
- **Histórico de clientes** vincula OS corretamente ✅
- Pipeline de status funcional (Aberto → Diagnóstico → Aprovado → etc.)
- `osStore` → `osApi.listOrdens` → Server Action `listOrdens` → `hydrateOSRows` → Kanban

**Arquivos principais da cadeia:**
```
components/operacoes/lovable/store/osStore.tsx
components/operacoes/lovable/api/os.ts  → listOrdens → listOrdensPrisma
app/actions/ordens.ts                   → findMany + include cliente + hydrateOSRows
lib/operacoes/services/hydration-service.ts  → applyPrismaEnrichment (propaga cliente real)
components/operacoes/lovable/components/operacoes/OSCard.tsx
```

---

### Hubs Visuais (mantidos da versão anterior)

- **WhatsApp HUB** — dados reais via Prisma, Meta Cloud API real, webhook HMAC, automações
- **PDV** — Assistência, Rápido, Completo; busca por SKU/EAN/nome; layout fixo sem scroll global
- **Cadastros HUB** — Clientes (UX completa: modal PF/PJ com máscara, botões corrigidos, totalGasto real OS+Venda), Produtos, Fornecedores com dados reais
- **Financeiro** — contas a pagar/receber com service Prisma (sem plug na UI visual ainda)

### Sistema de Temas
- 4 temas: Light, Soft Ice, Midnight, Black Edition
- Sincronização bidirecional Hub ↔ Global
- Tokens semânticos globais (bg-background, bg-card, text-foreground, etc.)

---

## 🔄 Em Andamento

| Item | Situação |
|---|---|
| **PDV Black Edition — persistência de vendas** | `PdvBlackEdition.tsx`: `handlePaymentConfirm` limpa carrinho localmente. Próximo passo: plugar `adicionarEntrada(useCaixa)` + criar venda no banco (Server Action `registrarVendaPDV`) |
| Equipamento no card Kanban | `os.equipamento` chega como string `"MOTOROLA MOTO EDGE 30"` — card exibe `—` na linha de marca/modelo. Fix pendente: `hydration-service` ler `payload.aparelho.{tipo,marca,modelo}` |
| servicos_catalogo (12 serviços) | Detectados mas ignorados — aguarda model `Servico` próprio no Prisma |
| contas_pagar / contas_receber — UI Financeiro V2 | **Persistência real OK** (importador GestaoClick com parcelas, fix 20/05/2026). Falta plugar o HUB V2 Lovable em `lib/financeiro/services/` — UI ainda mostra mocks |
| Fornecedores endereços | `fornecedores_enderecos.xlsx` (1 linha) importado mas sem modelo de endereço de fornecedor |
| Editar cliente/técnico na OS via UI | Botão "Vincular cliente" não existe ainda na tela de detalhe da OS |
| Relatórios de vendas a prazo | Vendas importadas existem no banco mas Relatórios HUB não as exibe ainda |

---

## 🔜 Próximos Passos (Backlog Priorizado)

### P0 — Crítico (bloqueia uso em produção)

- [ ] **Fix equipamento no card Kanban** — `hydration-service.ts`: ler `payload.aparelho.{tipo,marca,modelo}` quando `os.equipamento` é string plana
- [ ] **Vincular cliente na OS via UI** — botão inline na tela de detalhe para buscar e selecionar cliente
- [ ] **Atribuir técnico na OS via UI** — select de técnicos na tela de detalhe

### P1 — Importante

- [ ] **PDV Black Edition — persistir vendas** — `PdvBlackEdition.tsx`: plugar `adicionarEntrada` + Server Action `registrarVendaPDV`; rota `/dashboard/pdv-next` já existe, motor de carrinho já funciona
- [x] ~~**Persistir contas_pagar/contas_receber no importador**~~ — concluído 20/05/2026, com parcelamento idempotente e mapeamento GestaoClick
- [ ] **Persistir servicos_catalogo** — criar model `Servico` ou reutilizar `Produto` com `type="servico"`
- [ ] **Relatórios de vendas** — exibir vendas importadas (245 no banco) no Relatórios HUB
- [ ] **Vendas a prazo** — listar no módulo Financeiro HUB (contas a receber vinculadas)

### P2 — Qualidade

- [ ] **Label de domínio no PreviewCruzamento** — planilhas sem domínio mostrado (ex: `clientes_enderecos`, sub-domínios OS) ficam sem label no card
- [ ] **Dedup de clientes** — homônimos (SOLANGE × SOLANGE SOL COXINHA, MICHEL × MICHEL DOUGLAS) não são mesclados; match só por doc exato
- [ ] **Normalização de telefone** — `149981153484` vs `(14)99...` inconsistente na importação
- [ ] **Histórico de clientes** — exibir vendas além das OS (hoje só OS aparecem)

### P3 — Expansão

- [ ] Marketplace HUB
- [ ] Sistema de mídia para OS (upload de fotos/anexos)
- [ ] Marketing IA com dados reais
- [ ] Financeiro HUB — fechamento de caixa, conciliação

---

## ⚠️ Atenção ao Retomar

1. **Sempre rodar `npx tsc --noEmit`** antes de commitar — zero tolerância
2. **Sempre ler `docs/skills/rules/CORE_RULES.md`** antes de qualquer tarefa (governança obrigatória)
3. **PDV Black Edition** — pagamento **não persiste** no banco ainda. `handlePaymentConfirm` em `PdvBlackEdition.tsx` apenas limpa o carrinho localmente. NÃO apresente como real ao usuário final.
4. **Galeria PDV** — agora com 4 cards em `PdvSection.tsx` (grid `lg:grid-cols-4`). O 4º card usa `href` direto para `/dashboard/pdv-next`, não usa o mecanismo de `draftFlow`.
5. **Operações HUB usa dados REAIS via Prisma** (não mais mock) desde 17/05/2026
6. **Importador Avançado** — endpoint `POST /api/import/advanced` lê `modo` do **query string** (`?modo=preview` / `?modo=importar`), não do FormData
7. **GestaoClick ZIP** — todos os 17 arquivos detectam corretamente (Fix 6: `norm()` aplicado também nos `nomesArquivo`)
8. **Não tocar**: `auth.ts`, `proxy.ts`, `schema.prisma`
9. WhatsApp envio usa Meta Cloud API real (requer ENVs configuradas)
10. A rota `/dashboard/os` (legado) continua em paralelo ao `/dashboard/operacoes-v2`

---

## 📁 Arquivos-chave desta sessão

```
lib/importador-avancado/
├── types.ts
├── detector.ts          ← calibrado com headers reais GestaoClick
├── merger.ts
├── parser.ts            ← sem ExcelJS (Fix 3)
├── persistidor.ts       ← campos completos (Fix 7, 10)
└── index.ts

app/api/import/advanced/route.ts   ← lê modo do query string (Fix 9)
app/actions/ordens.ts              ← include cliente no findMany (Fix 12)
lib/operacoes/services/hydration-service.ts  ← propaga cliente FK (Fix 13)

components/dashboard/configuracoes/importador-avancado/
├── hooks/use-importador-avancado.ts   ← lê planilhasDetectadas (Fix 8)
├── UploadZone.tsx
├── PreviewCruzamento.tsx
├── LogAuditoria.tsx
└── ImportadorAvancado.tsx

components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx
```

---

## 📊 Estado do Banco (loja-1) após importação de 17/05/2026

| Modelo | Total | Observação |
|---|---|---|
| Cliente | 40 | Todos do `clientes.xlsx` GestaoClick |
| Produto | 231 | `produtos.xlsx` GestaoClick |
| OrdemServico | 34 | `ordens_servicos*.xlsx` GestaoClick |
| Venda | 245 | `vendas*.xlsx` GestaoClick |
| Fornecedor | 15 | `fornecedores.xlsx` (import 17/05) + eventuais legados — tabela `Fornecedor` não foi limpa antes do re-import |
| ContaReceberTitulo | 0 | Detectada, não persistida |
| ContaPagarTitulo | 0 | Detectada, não persistida |

> Contagens verificadas via Prisma em 17/05/2026 (`storeId: loja-1`).
