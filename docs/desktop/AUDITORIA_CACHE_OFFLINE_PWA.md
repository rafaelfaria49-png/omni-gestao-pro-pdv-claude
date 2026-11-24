# Auditoria Read-Only de Segurança do Cache Offline (PWA / Service Worker)

- **GOAL:** `OMNI-PWA-INSTALACAO-PUBLICACAO-FINAL-001`
- **PR:** `#393` (`claude/pwa-instalacao-custo-zero-003`, base `main`)
- **Data:** 24/11/2026
- **Escopo da auditoria:** somente leitura sobre `next.config.mjs`, `@ducanh2912/next-pwa` (`dist/index.js`, `sw-entry-worker.js`), `public/client-privacy-cache.js`, `SegurancaSection.tsx`, `SignOutButton.tsx`, `apps/desktop/src/main/privacy.ts` e evidências de execução E2E em build de produção com banco PostgreSQL descartável (`test-results/platform-pilot/pwa-multiloja.json`, run CI `45387951773`).
- **Áreas protegidas preservadas:** nenhuma alteração em `next.config.mjs`, service worker, auth, proxy, PDV offline, fila de vendas pendentes, Electron, schema ou migrations.

---

## 1. Arquitetura atual do cache offline

1. `next.config.mjs` ativa `@ducanh2912/next-pwa` com `register: true`, `skipWaiting: true`, `cacheOnFrontEndNav: true` e `extendDefaultRuntimeCaching: true` para toda navegação web/PWA em produção.
2. As regras padrão do Workbox (`defaultCache`) incluem:
   - `apis`: `NetworkFirst`, `GET /api/*` (exceto `/api/auth/callback*` e a lista explícita `NetworkOnly` em `next.config.mjs`), `maxEntries: 16`, `maxAgeSeconds: 86400` (24 h), `networkTimeoutSeconds: 10`.
   - `pages`, `pages-rsc`, `pages-rsc-prefetch`: `NetworkFirst`, `maxEntries: 32`, `maxAgeSeconds: 86400` (24 h).
   - `start-url` e `pages` também são preenchidos pelo worker auxiliar `swe-worker-*.js` (`__START_URL_CACHE__`, `__FRONTEND_NAV_CACHE__`), exceto nas rotas explicitamente bloqueadas por `protegerWorkerPessoas()`.
3. A lista `NetworkOnly` atual em `next.config.mjs` protege apenas: `/api/clientes*`, `/api/clients`, `/api/import/*`, `/api/ops/import/clientes`, `/api/pessoas*`, `/api/ops/inventory?catalogSync=1`, `/api/ops/vendas/by-client-sale-id`, `/api/ops/venda-persist/v2`, `/api/vendas/*`, `/api/financeiro/*`, `/api/ops/caixa/*`, `/api/dashboard/*`, `/api/ops/contas-pagar-list`, `/api/ops/contas-receber-list`, `/api/finance/*` e páginas `/dashboard/{clientes,cadastros*,pessoas*,relatorios*}`.
4. **Logout no navegador/PWA:** `SegurancaSection.tsx` e `SignOutButton.tsx` chamam apenas `signOut({ callbackUrl: "/login" })` — **não** limpam `CacheStorage`. Em contraste, o app Desktop Electron (`apps/desktop/src/main/privacy.ts`) implementa `LogoutGuard`, expurgando todos os caches não-estáticos (`apis`, `pages`, `pages-rsc*`, `next-data`, `start-url`) ao chegar em `/login` e novamente no submit de login, preservando `localStorage`/`IndexedDB`.

---

## 2. Evidência reproduzível em runtime (CI run `45387951773`)

No teste E2E autenticado (`e2e/platform-pilot/baixar-pwa.spec.ts`), em build de produção (`next start`, SW ativo) e PostgreSQL descartável:
1. Login `adminA` (`pilot-a`) → recarga com SW controlando a página (`swControllingBeforeLogout: true`) → `/api/stores` retornou `["pilot-a"]`.
2. Fechamento e reabertura do perfil persistente em `/login` (`start_url`) manteve a sessão (`reinicioMantemSessao: true`).
3. Logout via *Configurações → Segurança → Encerrar sessão* redirecionou para `/login` (`saiu: true`).
4. **Inspeção direta de `window.caches` após logout (`cacheAposLogoutOnline`):**
   - `apis` (**8 entradas retidas após logout**):
     - `/api/stores`
     - `/api/stores/pilot-a`
     - `/api/stores/pilot-a/settings`
     - `/api/ops/inventory?lojaId=pilot-a`
     - `/api/ops/vendas-list?lojaId=pilot-a`
     - `/api/ops/credito-cliente?lojaId=pilot-a`
     - `/api/auth/csrf`
     - `/api/version`
   - `pages` (**3 entradas retidas após logout**): `/dashboard`, `/dashboard/configuracoes?sec=seguranca`, `/login`.
   - `pages-rsc-prefetch` (**29 entradas retidas após logout**): `/dashboard`, `/dashboard/vendas`, `/dashboard/vendas-hub`, `/dashboard/estoque`, `/dashboard/estoque/inventario`, `/dashboard/caixa/historico`, `/dashboard/configuracoes`, `/conta/seguranca`.
5. **Análise do falso negativo da medição anterior (`medicaoCacheOfflineAposSair: []`):**
   - Em Playwright, `browserContext.setOffline(true)` aplica emulação de rede no alvo da `Page`, mas **não** desconecta o `fetch()` interno do `ServiceWorker`. Por isso, `fetch("/api/stores")` ainda atingiu `localhost:3000` e recebeu HTTP `401` (`{"error":"Não autenticado"}`, 38 bytes), que `j.stores ?? []` converteu em `[]`.
   - Em uma máquina realmente offline (sem rede no SO) ou sob latência > 10 s (`networkTimeoutSeconds: 10`), o `NetworkFirst` do Workbox entrega os payloads HTTP `200` ainda armazenados nos caches `apis`, `pages` e `pages-rsc-prefetch` por até 24 h — chaveados somente por URL, ignorando `Cookie` e `x-assistec-loja-id`.
6. **Outras rotas autenticadas GET fora da lista `NetworkOnly`:** `/api/whatsapp/*` (conversas, mensagens, contatos), `/api/ops/ordens`, `/api/ordens-servico`, `/api/admin/users`, `/api/aparelhos/*`, `/api/contador/*`, `/api/audit/logs`, `/api/produtos` e `/api/settings/perfil-loja`.
7. **Fluxo online normal:** login subsequente de `adminB` (`pilot-b`) em rede saudável obteve sessão `adminb@pilot.invalid`, `lojasB: ["pilot-b"]` e `/dashboard` sem qualquer menção a `Padaria Piloto A`.

---

## 3. Interação com filas offline do PDV

- As vendas pendentes, devoluções e operações de caixa offline do PDV ficam em `localStorage` particionado por loja (`opsKeyForLoja(storeId)` — ver `lib/loja-ativa.tsx` e `lib/auth/store-switcher-policy.ts`), **não** no `CacheStorage` do Service Worker.
- Portanto, expurgar `CacheStorage` não-estático no logout/entrada de `/login` (como o `LogoutGuard` do Electron já faz em `apps/desktop/src/main/privacy.ts`) **preserva integralmente a fila offline do PDV**.

---

## 4. Classificação de severidade e impacto na publicação do PWA

- **P0:** `0`
- **P1:** `1` — **Retenção de respostas autenticadas em `CacheStorage` após logout (TTL 24 h / `NetworkFirst`, pré-existente em `main`, agravado ao promover instalação PWA em computador compartilhado de loja sem `LogoutGuard`).**
  - **Cenário real de exposição:** computador compartilhado entre usuários/lojas no mesmo perfil de navegador onde o usuário A encerra sessão e o dispositivo perde internet (ou sofre timeout > 10 s), permitindo servir payloads autenticados de `apis`/`pages`/`pages-rsc-prefetch` da sessão anterior.
  - **Decisão honesta de prontidão:** embora o defeito seja pré-existente na camada global do SW em `main` (não introduzido pela PR #393) e a página `/baixar` + roteiro avisem o limite explicitamente, **a PR #393 não deve ser declarada incondicionalmente pronta para merge comercial enquanto o achado P1 não for sanado** (ou explicitamente aceito pelo dono do produto para uso estritamente monoloja/perfil isolado de SO).

---

## 5. Proposta de GOAL corretivo específico

- **ID sugerido:** `OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001`
- **Escopo autorizado necessário:** `next.config.mjs`, `public/client-privacy-cache.js`, `components/auth/SignOutButton.tsx`, `components/configuracoes-v3/features/settings/sections/SegurancaSection.tsx`, tela `/login` e testes E2E.
- **Ações técnicas:**
  1. Portar a política de limpeza de `CacheStorage` do `LogoutGuard` (`apps/desktop/src/main/privacy.ts`) para o logout web/PWA e para a montagem da tela `/login`: remover caches não-estáticos (`apis`, `pages`, `pages-rsc*`, `next-data`, `start-url`), **sem tocar em `localStorage`/`IndexedDB`** (fila offline do PDV preservada).
  2. Inverter a regra `apis` em `next.config.mjs` para `NetworkOnly` em `/api/*` autenticadas (ou adicionar as rotas privadas restantes à allowlist `NetworkOnly`), mantendo cache apenas para ativos estáticos imutáveis (`/_next/static/*`, ícones, fontes) e rotas públicas explícitas.
  3. Validar em E2E inspecionando diretamente `window.caches` (`caches.open(name).keys()`) após logout (garantindo zero entradas `/api/*` ou `/dashboard*` retidas) + regressão integral do PDV offline (`localStorage` intacto).
