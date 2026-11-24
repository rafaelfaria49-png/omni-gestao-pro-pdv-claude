import withPWAInit from "@ducanh2912/next-pwa"

/**
 * OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001:
 * Política allowlist-only no Service Worker.
 * - `cacheOnFrontEndNav: false` e `cacheStartUrl: false` eliminam o worker auxiliar (`swe-worker`)
 *   que gravava HTML autenticado em `pages`/`start-url`.
 * - `extendDefaultRuntimeCaching: false` impede que regras genéricas (`apis`, `pages`, `pages-rsc*`,
 *   `next-data`, `static-data-assets`, `static-js-assets`, `cross-origin`) armazenem respostas
 *   autenticadas ou envenenem caches estáticos com HTML de login/dashboard.
 * - A 1ª regra (`NetworkOnly`) tem precedência máxima sobre TODAS as APIs, páginas privadas e RSC.
 * - Somente ativos públicos e estáticos imutáveis entram no cache do SW; a fila offline do PDV vive
 *   em `localStorage` por loja (`opsKeyForLoja`) e `reloadOnOnline: false` permanece preservado.
 */
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // O padrão (true) instala `online → location.reload()` no app inteiro: cada oscilação
  // de rede recarregava o PDV e apagava o carrinho em memória. A reconexão já é tratada
  // pelos handlers de `online` (catálogo, pendências, caixa, versão) sem recarregar.
  reloadOnOnline: false,
  skipWaiting: true,
  cacheOnFrontEndNav: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  extendDefaultRuntimeCaching: false,
  workboxOptions: {
    disableDevLogs: true,
    cleanupOutdatedCaches: true,
    importScripts: ["/client-privacy-cache.js"],
    runtimeCaching: [
      {
        // REGRA 1 (precedência máxima — true allowlist-only, autocontida para serialização Workbox):
        // Qualquer GET mesma-origem que NÃO seja um ativo estático público explicitamente listado
        // (inclui "/", todas as /api/*, /dashboard*, /conta*, /login*, /portal*, /contador*,
        // /_next/data/*, qualquer rota futura e qualquer requisição RSC/prefetch) é NetworkOnly.
        urlPattern: ({ sameOrigin, url, request }) => sameOrigin && (
          // Mantém explicitamente o marcador do contrato de sync do catálogo do PDV:
          (url.pathname === "/api/ops/inventory" && url.searchParams.get("catalogSync") === "1") ||
          url.searchParams.has("_rsc") ||
          Boolean(request && request.headers && (
            request.headers.get("RSC") === "1" ||
            request.headers.get("Next-Router-Prefetch") === "1"
          )) ||
          !(
            url.pathname.startsWith("/_next/static/") ||
            url.pathname === "/manifest.webmanifest" ||
            url.pathname === "/manifest.json" ||
            url.pathname === "/apple-touch-icon.png" ||
            url.pathname === "/omni-gestao-pro-icon.svg" ||
            url.pathname === "/favicon.ico" ||
            url.pathname.startsWith("/icons/") ||
            url.pathname.startsWith("/gestao-lojas/")
          )
        ),
        handler: "NetworkOnly",
        method: "GET",
      },
      {
        // REGRA 2: Google Fonts webfonts (públicos e imutáveis).
        urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
        handler: "CacheFirst",
        method: "GET",
        options: {
          cacheName: "google-fonts-webfonts",
          expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // REGRA 3: Google Fonts stylesheets (públicos).
        urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        method: "GET",
        options: {
          cacheName: "google-fonts-stylesheets",
          expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // REGRA 4: Ativos estáticos imutáveis gerados pelo build (`/_next/static/*`, somente HTTP 200 não-HTML/JSON/RSC).
        urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        method: "GET",
        options: {
          cacheName: "next-static-assets",
          expiration: { maxEntries: 128, maxAgeSeconds: 7 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
          plugins: [{
            cacheWillUpdate: async ({ response }) => (
              !response ||
              response.status !== 200 ||
              response.redirected ||
              response.type === "opaqueredirect" ||
              /^\s*(text\/html|application\/json|text\/x-component)/i.test(response.headers.get("content-type") || "")
                ? null
                : response
            ),
          }],
        },
      },
      {
        // REGRA 5: Manifesto PWA, ícones oficiais e imagens públicas da landing (somente HTTP 200 não-HTML/RSC).
        urlPattern: ({ sameOrigin, url }) => sameOrigin && (
          url.pathname === "/manifest.webmanifest" ||
          url.pathname === "/manifest.json" ||
          url.pathname === "/apple-touch-icon.png" ||
          url.pathname === "/omni-gestao-pro-icon.svg" ||
          url.pathname === "/favicon.ico" ||
          url.pathname.startsWith("/icons/") ||
          url.pathname.startsWith("/gestao-lojas/")
        ),
        handler: "StaleWhileRevalidate",
        method: "GET",
        options: {
          cacheName: "public-pwa-assets",
          expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
          plugins: [{
            cacheWillUpdate: async ({ response }) => (
              !response ||
              response.status !== 200 ||
              response.redirected ||
              response.type === "opaqueredirect" ||
              /^\s*(text\/html|text\/x-component)/i.test(response.headers.get("content-type") || "")
                ? null
                : response
            ),
          }],
        },
      },
    ],
  },
})

const isVercel = process.env.VERCEL === "1"

/**
 * Carimbo de versão do build (PWA stale guard).
 *
 * Avaliado UMA vez por build e inlined via `env` no bundle do cliente E no código
 * do servidor (rota `/api/version`). Como cada deploy gera um `BUILD_ID` próprio, um
 * cliente rodando bundle ANTIGO (cache/PWA) carrega o id antigo, enquanto a rota do
 * deploy ATUAL devolve o id novo → divergência = versão desatualizada detectável
 * sem depender do ciclo de Service Worker do navegador. Em dev (sem commit SHA) usa
 * timestamp: cliente e servidor compartilham o mesmo valor na sessão (sem falso stale).
 */
const BUILD_ID =
  (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)) ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  String(Date.now())
const BUILD_TIME = new Date().toISOString()

/**
 * SEGURANÇA: o `env` do next.config é inlined via DefinePlugin no bundle do CLIENTE.
 * SÓ pode conter valores públicos (não-segredos). Segredos de servidor — incluindo
 * GOOGLE_GENERATIVE_AI_API_KEY — NUNCA entram aqui: o código de servidor (Node runtime)
 * lê `process.env.*` em runtime sem precisar de inline (ver lib/resolve-llm-env.ts).
 * Colocar uma chave aqui a "arma" para vazar ao bundle no instante em que qualquer
 * módulo alcançável pelo cliente referenciar `process.env.<chave>`.
 */
const env = {
  NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
}

/** Cabeçalhos de segurança (produção Vercel). COOP permissivo para não quebrar popups de pagamento/login. */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // microphone=() bloqueia voz em todo o site (SpeechRecognition / getUserMedia → not-allowed).
    // microphone=(self) permite o microfone na mesma origem (inclui http://localhost).
    // camera=(self): leitura de QR Code de contato em Clientes, aberta só por clique e lida no
    // navegador; iframes de outras origens continuam sem câmera.
    value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
  },
]

if (isVercel) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  })
}

/** Impede cache HTTP e BFCache em rotas autenticadas após logout / botão Voltar. */
const privateNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Next.js 16 — HMR/webpack dev a partir de 127.0.0.1 (ex.: Playwright com IPv4). */
  allowedDevOrigins: ["127.0.0.1"],
  /** Next.js 16 usa Turbopack por padrão; o plugin PWA injeta webpack — config vazia evita erro de build. */
  turbopack: {},
  env,
  /**
   * CATALOGO-APARELHOS-SEEDS-TRACING-002 — o loader server-only (`lib/catalogo-aparelhos/
   * catalogo-loader.ts`) lê os CSVs de `docs/catalogo/seeds` via `fs`/`process.cwd()`. Esse
   * caminho é dinâmico e NÃO é detectável pelo file-tracing do Next, então em produção
   * serverless (Vercel) os seeds ficariam de fora do bundle e a busca degradaria para vazio.
   * Incluímos os CSVs manualmente em CADA rota que os lê (busca de aparelhos e busca
   * de películas). A rota `produto/[id]` lê do Prisma, não dos CSVs — sem include.
   */
  outputFileTracingIncludes: {
    // Next 16/webpack aplica o include ao entry `proxy` antes de renomeá-lo
    // para middleware.js. A revalidação da sessão precisa do engine no pacote.
    proxy: ["./generated/prisma/*query_engine-*.node", "./generated/prisma/schema.prisma"],
    "/api/catalogo/aparelhos/search": ["./docs/catalogo/seeds/*.csv"],
    "/api/catalogo/peliculas/search": ["./docs/catalogo/seeds/*.csv"],
    // Cadastro manual por loja: dedupe/resolve também leem o catálogo global (CSV).
    "/api/catalogo/**": ["./docs/catalogo/seeds/*.csv"],
    "/api/fiscal/**": ["./lib/fiscal/provider/sefaz/trust/icp-brasil-v10.pem"],
    "/api/internal/fiscal/**": ["./lib/fiscal/provider/sefaz/trust/icp-brasil-v10.pem"],
    "/api/vendas/**": ["./lib/fiscal/provider/sefaz/trust/icp-brasil-v10.pem"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/dashboard",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/dashboard/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/conta/:path*",
        headers: privateNoStoreHeaders,
      },
    ]
  },
  async rewrites() {
    return [
      { source: "/manifest.json", destination: "/manifest.webmanifest" },
      // NOTE: The rewrite for /api/webhooks/whatsapp → /api/whatsapp/webhook was removed.
      // Next.js 16 plain-array rewrites are classified as "afterFiles" (confirmed in
      // load-custom-routes.js: `afterFiles = _rewrites`), meaning the filesystem is checked
      // first. Since app/api/webhooks/whatsapp/route.ts exists, that file always wins and
      // the rewrite was dead code. Removing it eliminates ambiguity.
    ]
  },
  async redirects() {
    return [
      {
        source: "/dashboard/vendas/config",
        destination: "/dashboard/configuracoes?sec=pdv",
        permanent: false,
      },
      {
        source: "/dashboard/fluxo-caixa",
        destination: "/dashboard/financeiro-v2",
        permanent: false,
      },
      {
        source: "/dashboard/contas-pagar",
        destination: "/dashboard/financeiro/contas-a-pagar",
        permanent: false,
      },
      {
        source: "/dashboard/contas-receber",
        destination: "/dashboard/financeiro/contas-a-receber",
        permanent: false,
      },
      {
        source: "/clientes",
        destination: "/dashboard/clientes",
        permanent: false,
      },
    ]
  },
}

export default withPWA(nextConfig)
