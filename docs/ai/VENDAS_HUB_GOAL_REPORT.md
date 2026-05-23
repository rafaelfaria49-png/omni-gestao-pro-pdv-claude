# Vendas HUB — Auditoria e estabilização para uso real

> Goal 5 — concluído 23/05/2026
> Foco: auditar e estabilizar o Vendas HUB completo (HUB Central, Venda Completa
> Enterprise, Orçamentos, Histórico de Vendas, links internos) + corrigir bug
> visual de inputs/search bars em todos os temas.

## 1. Escopo auditado

| Rota / Tela | Componente real | Status |
|---|---|---|
| `/vendas-hub` · `/dashboard/vendas-hub` | `components/vendas-hub/VendasHubPage.tsx` (SPA TanStack Router, redirect → `/vendas`) | ✅ Real |
| Vendas HUB Central (cards Bento) | `components/vendas-hub/lovable/features/vendas/VendasHub.tsx` | ✅ Real |
| `/dashboard/vendas` (PDV Rápido) | `VendasPDV` (PDV estabilizado, Goals 1–4) | ✅ Real (inalterado) |
| `/dashboard/vendas/venda-completa` | `components/dashboard/vendas/venda-completa-enterprise.tsx` | ✅ Real |
| `/dashboard/orcamentos` | `components/dashboard/orcamentos/orcamentos.tsx` | ⚠️ Legado/transição (banner honesto aponta p/ Operações HUB) |
| `/dashboard/vendas-arquivo-geral` (Histórico) | `components/dashboard/vendas/vendas-arquivo-geral.tsx` | ✅ Real |

## 2. Mapa de navegação dos cards (HUB Central)

Os cards de `VendasHub.tsx` usam `<a href={dashboardHref}>` apontando para rotas
**reais** do Next.js — não para as rotas internas do TanStack Router:

| Card | Destino | Real? |
|---|---|---|
| PDV Rápido | `/dashboard/vendas?modo=rapido` | ✅ |
| Venda Completa | `/dashboard/vendas/venda-completa` | ✅ |
| Orçamentos | `/dashboard/orcamentos` | ⚠️ legado |
| Histórico de Vendas | `/dashboard/vendas-arquivo-geral` | ✅ |
| Estoque | `/dashboard/estoque` | ✅ |
| Relatórios | `/dashboard/relatorios` | ✅ |

**Achado (não corrigido — fora de escopo):** as rotas internas do SPA TanStack
(`/pdv`, `/vendas/nova`, `/orcamentos`, `/pedidos`, `/fiscal` em
`components/vendas-hub/lovable/routes/`) são todas `PlaceholderModule`
("Em construção"). Elas **não são alcançáveis pelos cards** (que apontam para as
rotas reais acima) — só por digitação manual da URL dentro do basepath do SPA.
Não são mocks enganosos (a tela diz "Em construção" e o botão fica desabilitado),
mas são código morto navegacional. Documentado como pendência, não tocado.

## 3. Venda Completa Enterprise — integrações verificadas (todas reais)

| Fluxo | Implementação | Status |
|---|---|---|
| Busca de cliente | `useClienteSearch` → `GET /api/clientes?q=` (debounce 300ms, abortável, header `x-assistec-loja-id`) | ✅ Real |
| Busca/adicionar itens | `inventory` do `useOperationsStore` + `filterPdvCatalogBySearch` + `findPdvProductByScan` (bipe por código de barras) | ✅ Real |
| Validação de estoque | bloqueia add/qty acima de `stock` (exceto categoria `Servicos`) | ✅ Real |
| Finalização | `finalizeSaleTransaction` (mesmo core do PDV estabilizado) → `venda-persist` → estoque + `MovimentacaoFinanceira` + ledger | ✅ Real |
| Integração caixa | `handleClickFinalize` exige `caixa.isOpen` antes de abrir pagamento | ✅ Real |
| A prazo | `appendContaReceberTituloPdvAprazo` → `ContaReceberTitulo` | ✅ Real |
| Dados enterprise (IMEI/serial/garantia/endereço/cliente) | `enrichVendaEnterprise` (Server Action) grava em `Venda.payload.enterprise` com retry (fire-and-forget tolerante) | ✅ Real |
| Cupom não fiscal | `CupomNaoFiscal` abre após confirmar | ✅ Real |
| Crédito do cliente | `getSaldoCreditoCliente` exibido no resumo | ✅ Real (Fase 4) |
| Rascunho | persistência em localStorage por `storeId`, restaurado no mount | ✅ Real |

Multi-loja preservado: `storeId` derivado de `lojaAtivaId || LEGACY_PRIMARY_STORE_ID`
e propagado a busca de cliente, finalização e enrich.

## 4. Bug visual de inputs/search — causa raiz e correção

**Sintoma:** em search bars com ícone (lupa à esquerda, spinner à direita) o
texto/placeholder ficava **sobreposto/cortado** sob o ícone. Reportado em
`/dashboard/vendas/venda-completa` (campos Cliente e Itens) no tema Soft Ice, mas
afetava **todos os temas** (Light, Soft Ice, Midnight, Black).

**Causa raiz (1 arquivo, global):** `styles/operational-density.css` forçava
`padding-inline: var(--density-control-px) !important` em duas regras:
- `[data-slot="input"]` (Input shadcn canônico)
- `input.border-input.rounded-md` (inputs legados Lovable)

Como `data-density="operational"` está **sempre ativo** no `<html>`
(`app/layout.tsx`), esse `!important` sobrescrevia as classes utilitárias
`pl-9`/`pl-10`/`pr-9` que os search bars usam para **reservar espaço** ao ícone
posicionado em `absolute`. Resultado: padding lateral voltava a 10px e o texto
deslizava por baixo do ícone. Por ser densidade (independente de tema), o bug
aparecia em todos os temas.

**Correção (cirúrgica):** removido apenas o `padding-inline … !important` das duas
regras (mantidos `padding-block`, `font-size`, `line-height`, `border-radius`,
altura). Justificativa em comentário no próprio CSS:

- O `<Input>` base já aplica `px-2.5` (10px = exatamente `--density-control-px`)
  → inputs sem ícone mantêm o mesmo visual compacto, **sem regressão**.
- Inputs Lovable (`data-slot="input"`, `px-3` = 12px) ganham 2px a mais de
  padding — dentro do design original, sem regressão.
- Inputs com `pl-9`/`pr-9` voltam a funcionar → ícone e texto deixam de colidir.

**Alcance do fix (um ponto, vários search bars corrigidos):**
`venda-completa-enterprise` (Cliente + Itens), `vendas-arquivo-geral` (Histórico),
`orcamentos`, `pdv-classic`, `pdv-supermercado`, `pdv-assistencia-enterprise`,
`pdv-cliente-picker`, `pdv-omni-classic-shell`, `payment-modal`, `trocas-devolucao`
e demais inputs com ícone do app inteiro.

## 5. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `styles/operational-density.css` | Removido `padding-inline … !important` das regras `[data-slot="input"]` e `input.border-input.rounded-md`; comentário explicando o porquê. (commit `0fe88b3`) |

Nenhum `.ts/.tsx` foi alterado. Nenhuma área protegida tocada (sem auth, proxy,
schema Prisma, sidebar, PDV core).

## 6. Validação

- `npx tsc --noEmit` → **0 erros**.
- `npm run build` → **OK** (todas as rotas do Vendas HUB compiladas:
  `/vendas-hub`, `/dashboard/vendas-hub/[[...slug]]`, `/dashboard/vendas`,
  `/dashboard/vendas/venda-completa`, `/dashboard/vendas-arquivo-geral`,
  `/dashboard/orcamentos`).
- `git status` → árvore limpa (mudança commitada em `0fe88b3`;
  `git show --stat HEAD` → `styles/operational-density.css | 6 ++++--`).

## 7. Testes documentados

| # | Teste | Resultado |
|---|---|---|
| 1 | Abrir Vendas HUB Central | ✅ cards renderizam, links apontam p/ rotas reais |
| 2 | Acessar Venda Completa | ✅ `VendaCompletaEnterprise` carrega |
| 3 | Campo Cliente sem bug visual | ✅ `pl-9/pr-9` agora respeitados (corrigido via CSS) |
| 4 | Campo Itens sem bug visual | ✅ idem |
| 5 | Adicionar produto | ✅ busca real no inventory + bipe |
| 6 | Selecionar cliente obrigatório | ✅ bloqueio em `handleClickFinalize` |
| 7 | Finalizar venda | ✅ fluxo real (caixa + estoque + financeiro + cupom) |
| 8 | Abrir Histórico de Vendas | ✅ `vendas-arquivo-geral` com KPIs e detalhe reais |
| 9 | Temas Light/Soft Ice/Midnight/Black | ✅ fix é independente de tema (camada de densidade) |
| 10 | Riscos restantes | ⚠️ ver §8 |

> **Honestidade:** os testes 1–9 foram verificados por leitura de código + `tsc` +
> `build` (a correção é puramente CSS de padding, com causa raiz compreendida).
> **Não houve** validação visual interativa em navegador nesta sessão —
> recomenda-se um smoke visual rápido nos 4 temas antes do uso em produção.

## 8. Riscos / pendências restantes

- **Rotas placeholder do SPA TanStack** (`/pdv`, `/vendas/nova`, `/orcamentos`,
  `/pedidos`, `/fiscal`) seguem "Em construção" e desconectadas dos cards —
  código morto navegacional, não removido (fora de escopo).
- **Orçamentos** (`/dashboard/orcamentos`) é fluxo legado/transição (banner já
  avisa e aponta para Operações HUB). Não há orçamento "enterprise" novo.
- **Card "Orçamentos"** no HUB exibe badge "Beta" — coerente com o estado legado.
- **`enrichVendaEnterprise`** é tolerante a falha (retry + toast não-bloqueante):
  se todos os retries falharem, IMEI/serial/garantia/endereço **não** persistem no
  DB, mas a venda (estoque/financeiro) já está registrada. Comportamento
  intencional (não bloqueia o caixa), porém é uma perda silenciosa de metadados —
  documentado.
- **PDV Black Edition** (`/dashboard/pdv-next`) continua **não persistindo
  vendas** (pendência pré-existente dos Goals 1–4) — não usar para operação real.
- Validação visual em navegador nos 4 temas ainda recomendada (ver §7).

## 9. Docs atualizados

- Este relatório (`docs/ai/VENDAS_HUB_GOAL_REPORT.md`).
- `docs/ai/CURRENT_STATUS.md` — adicionada entrada do Goal 5.
</content>
