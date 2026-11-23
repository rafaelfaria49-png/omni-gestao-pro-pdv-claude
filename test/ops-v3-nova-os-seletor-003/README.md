# Operações V3 — seletor "Novo atendimento" (PR #391)

Dois níveis de prova:

- **`seletor.test.tsx`** (jsdom, componentes montados, Server Actions espiãs) — `vitest.config.ts` desta pasta.
- **`aceite.e2e.ts`** (aceite real no navegador) — app de produção (`next start`), login NextAuth
  real pela tela e PostgreSQL **descartável** com massa sintética de `qa-bootstrap.mjs`.

## Aceite real (OPERACOES-V3-SELETOR-003-ACEITE-REAL)

Login, app e navegador na **mesma origem** `http://localhost:3047` (a config recusa outra).
Banco só `ops_v3_seletor_qa*` em loopback, idêntico em `DATABASE_URL`/`DIRECT_URL` (bootstrap e
spec recusam outro alvo). Nenhuma credencial, banco ou cookie de produção; nenhuma env da Vercel.

1. PostgreSQL descartável (fora do repo): `initdb` + `pg_ctl ... -p <porta livre> start`,
   `CREATE DATABASE ops_v3_seletor_qa`, `npx prisma db push --skip-generate`.
2. Arquivo de env **fora do repositório** com `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` aleatório,
   `AUTH_URL`/`NEXTAUTH_URL`/`PLAYWRIGHT_BASE_URL` = `http://localhost:3047`, `AUTH_TRUST_HOST=true`,
   `PLAYWRIGHT_E2E_EMAIL` (`*.test`) e `PLAYWRIGHT_E2E_PASSWORD` aleatória (≥ 16).
3. `node --env-file=<env> test/ops-v3-nova-os-seletor-003/qa-bootstrap.mjs`
   — loja A (assistência liberada) com o usuário STORE/ADMIN, loja B sem vínculo, uma OS original
   entregue em cada loja.
4. `npm run build` e `node --env-file=<env> node_modules/next/dist/bin/next start -p 3047 -H localhost`.
5. `node --env-file=<env> node_modules/@playwright/test/cli.js test --config test/ops-v3-nova-os-seletor-003/playwright.config.ts`

O aceite exige banco recém-semeado (A04 parte de zero retornos na OS original).

| Cenário | Prova |
|---|---|
| A01 | Login real; os dois gatilhos "Nova OS" abrem o seletor com `os · orcamento · retorno`, sem "Atendimento rápido"; ESC devolve o foco ao gatilho; Fechar fecha |
| A02 | Nova OS preenchida e criada; banco: loja A, cliente, aparelho, defeito, sem efeito financeiro; reaberta pela Fila |
| A03 | Orçamento sem passo Pagamento e com entrada vazia; banco: `comercialV4.tipo = orcamento_pre_os`, sem entrega, pagamento, título, caixa, venda ou estoque |
| A04 | Retorno: busca não acha OS da loja B; abre retorno (duplo clique) → 1 filha vinculada nos dois lados, núcleo da original intacto; 2ª tentativa só oferece o atendimento em andamento; "Ver OS original" |
| A05 | 390×844: seletor em bottom sheet, sem rolagem horizontal; ESC/Fechar no seletor, Retorno e Orçamento |
| A06 | Telas principais da V3 sem erro; loja B intacta (OS, payload, `updatedAt`, financeiro); loja ativa forjada = B volta à loja A |

Screenshots ficam em `test-results/ops-v3-seletor-003-aceite/` (ignorado pelo git); sem trace/vídeo,
e a senha entra pelo setter nativo para não cair em call log.

Ruídos de console filtrados no A06, ambos do ambiente local e fora da V3: `workbox-window` (PWA)
lendo `.waiting` com o service worker bloqueado pelo teste, e `/_vercel/insights/script.js`, que só
existe na Vercel.
