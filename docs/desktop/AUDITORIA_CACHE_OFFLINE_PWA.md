# Auditoria e Correção de Segurança do Cache Offline (PWA / Service Worker)

- **GOALs:** `OMNI-PWA-INSTALACAO-PUBLICACAO-FINAL-001` (auditoria read-only) → `OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001` (correção definitiva)
- **PR:** `#393` (`claude/pwa-instalacao-custo-zero-003`, base `main`)
- **Data:** 24/11/2026
- **Status do P1:** **RESOLVIDO COM EVIDÊNCIA RED → GREEN**
- **Áreas protegidas preservadas:** nenhuma alteração em `auth.ts`, `auth.config.ts`, `proxy.ts`, schema Prisma, migrations, motores transacionais do PDV, Electron (`apps/desktop/*`), Caixa, Financeiro, Estoque, Fiscal ou SAAS-001A.

---

## 1. Causa raiz

1. Em `main`, `next.config.mjs` configurava `@ducanh2912/next-pwa` com `extendDefaultRuntimeCaching: true`, `cacheOnFrontEndNav: true`, `cacheStartUrl: true` e `dynamicStartUrl: true`.
2. Essa configuração herdava regras genéricas `NetworkFirst` (TTL 24 h, timeout 10 s, chaveadas somente por URL, ignorando `Cookie` e `x-assistec-loja-id`):
   - `apis`: armazenava respostas HTTP 200 de qualquer `GET /api/*` fora da lista parcial `NetworkOnly` (`/api/stores`, `/api/stores/[id]`, `/api/stores/[id]/settings`, `/api/ops/inventory`, `/api/ops/vendas-list`, `/api/ops/credito-cliente`, `/api/ops/ordens`, `/api/whatsapp/*`, `/api/admin/users`, `/api/auth/session`, etc.).
   - `pages`, `pages-rsc`, `pages-rsc-prefetch` e `start-url` (incluindo o worker auxiliar `swe-worker-*.js` em `__FRONTEND_NAV_CACHE__` e `__START_URL_CACHE__`): armazenavam HTML/RSC autenticados de `/dashboard/*` e `"/"` (onde `RootLayout` serializa `session`).
3. Os caminhos de logout no navegador (`SignOutButton.tsx`, `SegurancaSection.tsx`, `ChangePasswordForm.tsx`) chamavam apenas `signOut()` sem expurgar `CacheStorage`, ao contrário do `LogoutGuard` existente no app Electron (`apps/desktop/src/main/privacy.ts`).
4. **Falso negativo anterior explicado:** no teste anterior, `context.setOffline(true)` no Playwright não desconectava o `fetch()` interno do Service Worker; assim, o SW atingiu o servidor local, recebeu HTTP 401 (`{"error":"Não autenticado"}`, 38 bytes), e `j.stores ?? []` mascarou a retenção como `[]`.

---

## 2. Evidência RED (antes da correção)

### 2.1 Evidência de retenção pós-logout em CI (run `45387951773`, `pwa-multiloja.json`)
Logo após login de `adminA` (`pilot-a`) e clique em *Encerrar sessão* → `/login`, permaneceram em `window.caches`:
- `apis` (8 entradas): `/api/stores`, `/api/stores/pilot-a`, `/api/stores/pilot-a/settings`, `/api/ops/inventory?lojaId=pilot-a`, `/api/ops/vendas-list?lojaId=pilot-a`, `/api/ops/credito-cliente?lojaId=pilot-a`, `/api/auth/csrf`, `/api/version`.
- `pages` (3 entradas): `/dashboard`, `/dashboard/configuracoes?sec=seguranca`, `/login`.
- `pages-rsc-prefetch` (29 entradas): `/dashboard/*` e `/conta/seguranca`.

### 2.2 Reprodução RED com desligamento real do servidor HTTP (TCP `ERR_CONNECTION_REFUSED`, commit `a80c554`)
Executada com o `public/sw.js` real compilado antes da correção, usuários sintéticos A (`qa-store-a` / `"Loja Sintetica RED A"` / `"PRODUTO_SECRETO_LOJA_A"` / `"Cliente Privado Loja A"`) e B (`qa-store-b`), encerramento de sessão e **desligamento efetivo do servidor HTTP (`closeAllConnections` + `close`)** atingindo inclusive os fetches internos do SW:

| Endpoint sondado com servidor morto | Pós-logout (A) | Sob usuário B offline | Cache de origem | Conteúdo sintético de A exposto |
|---|---|---|---|---|
| `GET /api/stores` | **HTTP 200** | **HTTP 200** | `apis` | `Loja Sintetica RED A`, `qa-store-a` |
| `GET /api/stores/qa-store-a` | **HTTP 200** | **HTTP 200** | `apis` | `Loja Sintetica RED A`, `qa-a@synthetic.invalid` |
| `GET /api/stores/qa-store-a/settings` | **HTTP 200** | — | `apis` | `Loja Sintetica RED A`, `qa-a@synthetic.invalid` |
| `GET /api/ops/inventory?lojaId=qa-store-a` | **HTTP 200** | **HTTP 200** | `apis` | `PRODUTO_SECRETO_LOJA_A`, `qa-store-a` |
| `GET /api/ops/vendas-list?lojaId=qa-store-a` | **HTTP 200** | **HTTP 200** | `apis` | `Cliente Privado Loja A`, `qa-store-a` |
| `GET /dashboard`, `/dashboard/estoque`, `/dashboard/vendas` | **HTTP 200** | **HTTP 200** | `pages` | `Loja Sintetica RED A`, `PRODUTO_SECRETO_LOJA_A` |
| `GET /dashboard/estoque?_rsc=1` (`RSC: 1`) | **HTTP 200** | **HTTP 200** | `pages-rsc` | `Loja Sintetica RED A`, `PRODUTO_SECRETO_LOJA_A` |
| `GET /dashboard/vendas?_rsc=1` (`Next-Router-Prefetch: 1`) | **HTTP 200** | — | `pages-rsc-prefetch` | `Loja Sintetica RED A`, `PRODUTO_SECRETO_LOJA_A` |

---

## 3. Correção implementada

1. **Política allowlist-only no Service Worker (`next.config.mjs`):**
   - `extendDefaultRuntimeCaching: false`, `cacheOnFrontEndNav: false`, `cacheStartUrl: false`, `dynamicStartUrl: false` (elimina por completo `swe-worker-*.js` e os buckets genéricos `apis`, `pages`, `pages-rsc`, `pages-rsc-prefetch`, `start-url`, `next-data`, `static-data-assets`, `static-js-assets`, `cross-origin`).
   - **Regra 1 (`NetworkOnly`, precedência máxima, allowlist negativa estrita):** todo `GET` mesma-origem fora dos 8 prefixos/arquivos públicos estáticos oficiais (`/_next/static/*`, `/icons/*`, `/gestao-lojas/*`, `/manifest.webmanifest`, `/manifest.json`, `/apple-touch-icon.png`, `/omni-gestao-pro-icon.svg`, `/favicon.ico`) — ou qualquer requisição contendo `_rsc` / `RSC: 1` / `Next-Router-Prefetch: 1` — cai obrigatoriamente em `NetworkOnly` (cobrindo também `"/"` e qualquer rota futura).
   - **Regras 2–5 (somente ativos públicos/estáticos):** Google Fonts, `next-static-assets` (`/_next/static/*`) e `public-pwa-assets` com `CacheableResponsePlugin({ statuses: [200] })` + `plugins[].cacheWillUpdate` rejeitando redirecionamentos e respostas `text/html`, `text/x-component` (e `application/json` em `next-static-assets`) contra cache poisoning.
   - **Headers anti-BFCache/HTTP-cache:** `Cache-Control: private, no-store, max-age=0, must-revalidate` em `/dashboard`, `/dashboard/:path*` e `/conta/:path*`.
   - `reloadOnOnline: false` preservado integralmente.
2. **Purge de upgrade de caches legados (`public/client-privacy-cache.js`):**
   - No evento `activate` do novo SW, percorre todos os caches da origem, apaga todas as entradas não-estáticas ou com `Content-Type` HTML/JSON/RSC e exclui buckets legados inseguros (`apis`, `pages`, `pages-rsc*`, `start-url`, `next-data`, `static-js-assets`, `others`, etc.), sem tocar em `localStorage`/`IndexedDB` e sem recarregar abas abertas.
3. **Limpeza segura no logout, entrada em `/login` e coordenação multi-aba (`lib/auth/pwa-cache-privacy.ts`):**
   - Helper `purgeAuthenticatedBrowserCaches()` espelhando a política do `LogoutGuard` do Electron (`apps/desktop/src/main/privacy.ts`), com retorno estruturado honesto (`ok`, `deletedCaches`, `failedCaches`, `error` — sem sucesso fictício) e garantia estrita de nunca tocar em `localStorage`/`IndexedDB`.
   - Integrado em **todos** os caminhos de logout: `SignOutButton.tsx`, `SegurancaSection.tsx` e `ChangePasswordForm.tsx`.
   - `app/login/login-form.tsx` (que só monta quando o servidor confirma ausência de sessão ativa em `app/login/page.tsx`): executa passada adicional de limpeza ao montar e no submit de novo login (neutralizando corridas de requisições em andamento), dispara `reg.update()` silencioso e exibe aviso honesto (`role="status"`) caso a limpeza de `CacheStorage` falhe.
   - `components/auth/SessionProvider.tsx`: escuta `BroadcastChannel("omni-auth-privacy")` para encerramento imediato em múltiplas abas, expurga `CacheStorage` quando o servidor confirma revogação/expiração (`!fetched?.user`, preservando 100% da resiliência offline em falhas de rede/5xx) e revalida no evento `pageshow` (`event.persisted`, proteção contra BFCache / botão Voltar).

---

## 4. Evidência GREEN (após a correção)

1. **Inspeção direta do `public/sw.js` gerado por `npm run build`:**
   - `sweWorkerFilesInPublic: []` (worker auxiliar eliminado).
   - `cacheNamesInGeneratedSw: ["google-fonts-stylesheets", "google-fonts-webfonts", "next-static-assets", "public-pwa-assets"]`.
   - Buckets proibidos presentes no `sw.js`: **0** (`apis=false`, `pages=false`, `pages-rsc=false`, `start-url=false`, `static-js-assets=false`, `cross-origin=false`).
   - `importScripts("/client-privacy-cache.js")` presente e `NetworkOnly` em precedência máxima.
2. **Upgrade real de SW legado + desligamento real do servidor HTTP (`verify-sw-green-light.mjs`):**
   - Perfil populado previamente pelo SW legado com `apis` (3 entradas), `pages` (1 entrada), `pages-rsc` (1 entrada) e venda offline pendente em `localStorage["assistec-pro-ops-v1-qa-store-a"]`.
   - Após upgrade para o `public/sw.js` endurecido com aba PDV aberta:
     - `afterSwUpgradeNoReloadSentinel: "STAYED_OPEN_NO_RELOAD"` (zero recarregamento inesperado durante venda).
     - `afterSwUpgradePendingSalePreserved: true` (venda pendente intacta).
     - `afterSwUpgradeCaches: {}` (100% dos caches legados removidos na ativação).
   - Após navegação autenticada sob SW endurecido, logout e **desligamento real do servidor (`ERR_CONNECTION_REFUSED`)**: **10/10** endpoints (`/api/stores`, `/api/stores/qa-store-a`, `/api/stores/qa-store-a/settings`, `/api/ops/inventory`, `/api/ops/vendas-list`, `/dashboard`, `/dashboard/estoque`, `/dashboard/vendas`, RSC e RSC prefetch) retornaram `Failed to fetch` (`servedWhileServerDead: false`).
   - Sob usuário B offline com servidor desligado: **10/10** endpoints da loja A retornaram `Failed to fetch`.
3. **E2E autenticado em PostgreSQL descartável + servidor dedicado derrubado em CI (`e2e/platform-pilot/baixar-pwa.spec.ts`):**
   - Valida toda a matriz A–P em `next start` real, perfil persistente e banco PostgreSQL 16 descartável.

---

## 5. Matriz de testes (A–P)

| ID | Cenário | Prova | Resultado |
|---|---|---|---|
| A | Cache autenticado retido após logout | `baixar-pwa.spec.ts` + `verify-sw-green-light.mjs` | GREEN (0 buckets/entradas privadas) |
| B | API privada sem conexão real após logout | Servidor dedicado encerrado (`ECONNREFUSED`) em `baixar-pwa.spec.ts` e `verify-sw-green-light.mjs` | GREEN (100% `Failed to fetch`) |
| C | Página privada sem conexão real após logout | Servidor dedicado encerrado (`ECONNREFUSED`) | GREEN (100% `Failed to fetch`) |
| D | Resposta RSC / prefetch privada sem conexão real | Headers `RSC: 1` e `Next-Router-Prefetch: 1` com servidor morto | GREEN (100% `Failed to fetch`) |
| E | Login de usuário de outra loja (`adminB`) | `baixar-pwa.spec.ts`: online só `["pilot-b"]`, offline 0 acesso à loja A | GREEN |
| F | Troca autorizada de loja (`multi`) | `baixar-pwa.spec.ts`: `["pilot-a","pilot-b"]`, 0 entradas privadas em `CacheStorage` | GREEN |
| G | Logout em múltiplas abas | `baixar-pwa.spec.ts` (aba 1 faz logout → aba 2 bloqueada com *"Sua sessão foi encerrada"*) | GREEN |
| H | Atualização de SW antigo (caches legados) | `verify-sw-green-light.mjs` + `baixar-pwa.spec.ts` + `sw-network-only.test.ts` | GREEN (0 reload, 0 perda PDV, 100% purge) |
| I | Venda pendente preservada após logout | `baixar-pwa.spec.ts` (`assistec-pro-ops-v1-pilot-a` preservado) | GREEN |
| J | Venda pendente disponível/sincronizável no retorno de A | `baixar-pwa.spec.ts` + `offline-sync.component.test.ts` (33/33) + `classic-offline-sequence.component.test.ts` | GREEN |
| K | Venda da loja A inacessível para usuário B | `baixar-pwa.spec.ts` + `offline-sync.component.test.ts` (`T30/T43`) + `loja-ativa.pilot-context.test.ts` (6/6) | GREEN |
| L | Falha de limpeza do cache (sem sucesso fictício) | `pwa-cache-privacy.test.ts` + `pwa-logout-privacy.component.test.ts` | GREEN |
| M | Requisição concorrente com logout | `baixar-pwa.spec.ts` (fetches em voo durante clique em *Encerrar sessão* + dupla passada no `/login`) | GREEN |
| N | PWA continua instalável | `baixar-pwa.spec.ts` (CDP `getAppManifest` + `getInstallabilityErrors = []` + 5 ícones PNG 200) | GREEN |
| O | Funil `/gestao-lojas → /baixar → /login` | `baixar-pwa.spec.ts` + Preview Vercel | GREEN |
| P | Regressão de revogação/resiliência offline de sessão | `SessionProvider.offline.component.test.ts` (4/4) + `first-access.spec.ts` + `pilot-access.spec.ts` | GREEN |

---

## 6. Impacto sobre o PDV offline e armazenamento local

- **Nenhuma exclusão de `localStorage`, `sessionStorage` indiscriminado ou `IndexedDB`.**
- Chaves legítimas do PDV permanecem 100% preservadas e particionadas por `storeId`:
  - `assistec-pro-ops-v1-${storeId}` (`opsKeyForLoja`), `assistec-pro-caixa-v1-${storeId}`, `omnigestao:pdv-sale-attempt:${storeId}`, `omnigestao:pdv-sale-tombstones:${storeId}`, `omnigestao:pdv-*-finalize-audit:${storeId}`, `omnigestao:pdv-assistencia-cart:${storeId}`, `@omnigestao:pdv-black-turno:${storeId}:*`, `@omnigestao:pdv-black-cupom:${storeId}:*`.
- Suítes de regressão PDV offline verificadas: `lib/vendas/offline-sync.component.test.ts` (33/33), `lib/pdv/classic-offline-sequence.component.test.ts` (1/1), `lib/pdv-black-storage.test.ts` (7/7), `components/dashboard/vendas/pdv-pending-sync-badge-offline.test.ts` (6/6), `components/dashboard/vendas/pdv-catalog-sync.contract.test.ts` (18/18), `components/auth/SessionProvider.offline.component.test.ts` (4/4).

---

## 7. Revisão independente de segurança e riscos residuais

- **Revisão independente executada** (subagente `research` dedicado sobre todos os arquivos e diff): veredito **APROVADO** — **0 P0**, **0 P1**.
  - Recomendação P3 (futuras rotas top-level) foi imediatamente fechada adotando allowlist negativa estrita na Regra 1 + `dynamicStartUrl: false` + `cacheWillUpdate` anti-poisoning.
- **Riscos residuais honestos (P2 / operacionais):**
  1. **Armazenamento local (`localStorage`) em perfil de SO compartilhado:** por requisito explícito de não perder vendas pendentes do PDV offline (`opsKeyForLoja`), `localStorage` permanece particionado por `storeId` na mesma origem (idêntico ao `LogoutGuard` do Electron). A UI isola rigorosamente a loja ativa pela sessão autenticada (`canAccessStore`), mas alguém com acesso físico ao DevTools do mesmo perfil de usuário do Windows conseguiria inspecionar chaves `localStorage` locais. Mitigação documentada em `/baixar` e no roteiro: usar contas de usuário do Windows separadas em computadores compartilhados entre empresas/lojas distintas.
  2. **Homologação física:** instalação física real em hardware Windows 10/11 (Edge/Chrome), Android e iPhone segue pendente de execução manual após autorização.

---

## 8. Procedimento de rollout e rollback seguro

### Rollout
1. Após revisão e autorização humana, integrar a PR #393 na `main`.
2. O deploy publica o novo `public/sw.js` e `public/client-privacy-cache.js`.
3. Clientes existentes com PWA/site já instalado recebem o novo SW silenciosamente (`skipWaiting: true`), que executa a limpeza de caches legados no `activate` sem recarregar abas de caixa abertas nem perder vendas pendentes; o banner `PwaUpdatePrompt` oferece atualização controlada ao concluir a venda.

### Rollback seguro (NÃO reintroduzir cache vulnerável)
- **Proibido** fazer rollback cego de toda a PR se isso restaurar `extendDefaultRuntimeCaching: true` / `cacheOnFrontEndNav: true` / `dynamicStartUrl: true` em `next.config.mjs`.
- Caso seja necessário reverter a superfície comercial de `/baixar` ou `/gestao-lojas`, reverter **somente** `app/baixar/page.tsx`, `app/gestao-lojas/page.tsx`, `components/pwa-install/*` e `lib/pwa-install/*`, **mantendo** obrigatoriamente `next.config.mjs`, `public/client-privacy-cache.js`, `lib/auth/pwa-cache-privacy.ts` e os ganchos de limpeza no logout/`/login`/`SessionProvider`.
