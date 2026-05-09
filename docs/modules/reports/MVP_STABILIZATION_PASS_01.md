# MVP — Estabilização e consistência visual (passo 01)

**Data:** 2026-05-08  
**Escopo:** polimento, honestidade de UI, hardening leve de API e fallbacks — sem migration, sem alteração de schema Prisma, sem mudanças em auth, billing, WhatsApp Cloud API ou Omni Agent.

---

## 1. Objetivos atendidos

| Área | Ação |
|------|------|
| Painel inicial | Remover aparência de “números reais” nos KPIs; aviso explícito de pré-visualização; selos **Exemplo** em gráficos/listas ilustrativas. |
| Financeiro HUB V2 | Badges **Preview** / **Demo** nas abas com conteúdo misto ou ilustrativo; texto de cabeçalho esclarecendo mistura; alertas da visão geral apenas quando há dados de atraso reais. |
| Operações vs legado | Sidebar e menu mobile: **Novo** no HUB; entrada **Ordens de Serviço (Legado)** com selo **Legado**. |
| Produção / cache | `GET /api/ops/ordens` passa a exportar `dynamic = "force-dynamic"` e `revalidate = 0` (lista crítica de OS para ops). |
| Fallbacks | `FinanceiroRealContext`: `rows`/`audit` das APIs de listagem validados com `Array.isArray` antes de normalizar. |

---

## 2. Arquivos alterados (referência)

- `app/dashboard/page.tsx` — aviso + KPIs neutros.  
- `components/painel-inicial/DashboardDemoNotice.tsx` — **novo**.  
- `components/painel-inicial/DemoBadge.tsx` — **novo**.  
- `components/painel-inicial/KpiCard.tsx` — prop `hideTrend`.  
- `components/painel-inicial/RevenueChart.tsx`, `CategoryChart.tsx`, `AiInsights.tsx`, `CriticalStock.tsx`, `RecentActivityTable.tsx` — honestidade visual.  
- `components/painel-inicial/Sidebar.tsx` — labels Novo/Legado + rodapé sem texto de sync falso.  
- `components/dashboard/mobile-nav.tsx` — labels alinhados.  
- `components/financeiro/lovable/routes/financeiro.tsx` — badges nas tabs; alertas; hint de lucro.  
- `components/financeiro/lovable/context/FinanceiroRealContext.tsx` — guards em arrays.  
- `app/api/ops/ordens/route.ts` — `force-dynamic` / `revalidate`.  
- `docs/modules/reports/MVP_STABILIZATION_PASS_01.md` — este arquivo.  
- `docs/ai/CURRENT_STATUS.md`, `docs/changelog/CHANGELOG.md` — atualização.

---

## 3. Rotas API já protegidas (não alteradas neste passo)

Confirmado com `force-dynamic` + `revalidate = 0` no repositório: `GET /api/stores`, `GET /api/ops/contas-receber-list`, `GET /api/ops/contas-pagar-list`, `GET /api/financeiro/analytics`, `GET/POST` em `app/api/ordens-servico/*` conforme arquivos existentes.  
**Novo neste passo:** `app/api/ops/ordens/route.ts`.

---

## 4. O que continua mock / preview (explícito na UI)

- Curvas e participações do painel inicial (dados estáticos de desenho).  
- Carteiras e Configurações no Financeiro HUB (estado local / switches ilustrativos).  
- Visão geral / Fluxo / Relatórios: **Preview** — podem combinar API com trechos ainda não substituídos por 100% Prisma.

---

## 5. Riscos restantes (fora do escopo deste passo)

- Painel inicial ainda não consome `/api/dashboard/resumo` ou `elite` para números reais.  
- Duas superfícies de OS (HUB vs legado) permanecem; apenas rótulos de navegação foram clarificados.  
- Outras rotas `POST` financeiras sem `force-dynamic` podem, em teoria, ser cacheadas em cenários extremos — avaliar por rota em passo futuro.

---

## 6. Próximos passos sugeridos (não executados aqui)

- Ligar KPIs do dashboard a uma API agregadora real ou feature flag por loja.  
- Reduzir dependência de dados estáticos nas carteiras (Prisma ou desativar edição até existir modelo).  
- Revisar demais `app/api/**/route.ts` sem `force-dynamic` que façam **GET** com dados por loja.
