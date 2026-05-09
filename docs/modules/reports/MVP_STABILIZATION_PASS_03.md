# MVP — Estabilização passo 03 (painel interno de health)

**Data:** 2026-05-08  
**Escopo:** tela **somente leitura** em `/dashboard/dev-health` para diagnosticar produção sem terminal — sem migration, schema, auth, billing, WhatsApp Cloud API ou Omni Agent; **sem expor secrets**.

---

## 1. Rota

| Caminho | Arquivos |
|---------|-----------|
| `/dashboard/dev-health` | `app/dashboard/dev-health/page.tsx` (Suspense + `force-dynamic`), `app/dashboard/dev-health/DevHealthClient.tsx` |

**Menu:** não foi adicionado link ao sidebar — não há seção técnica/dev consolidada nas configurações; acesso direto pela URL.

---

## 2. O que o painel mostra

- Aviso fixo: painel técnico interno, read-only, sem secrets.
- **Ambiente:** `NODE_ENV` exibido como `production` ou `development` + origem (`window.location.origin`).
- **Loja:** valor enviado no header `x-assistec-loja-id` (via `useLojaAtiva`) + `storeIdResolved` retornado por `/api/debug/prod-health` quando disponível.
- **Última atualização:** timestamp após cada execução dos probes (inclui carga inicial automática).
- **Botão:** “Atualizar diagnóstico”.
- **Cards** por endpoint (GET, `credentials: include`):
  - `/api/stores`
  - `/api/debug/prod-health`
  - `/api/ops/contas-receber-list`
  - `/api/ops/contas-pagar-list`
  - `/api/ops/ordens`
- **Estados por card:** Carregando, OK, Atenção (401/403 ou formato inesperado), Erro (rede, 5xx, JSON inválido).
- **Bloco prod-health:** contagens globais (lojas, clientes, produtos, vendas), flags booleanas `hasDatabaseUrl` / `hasDirectUrl` **somente sim/não** (sem valores), probe de produto na loja atual se vier na resposta.

**Nunca exibe:** `DATABASE_URL`, API keys, tokens, service role, payloads sensíveis.

---

## 3. Como validar em produção

1. Em **produção**, definir **`ENABLE_DEV_HEALTH=true`** (recomendado) ou **`NEXT_PUBLIC_ENABLE_DEV_HEALTH=true`** na Vercel quando for usar o painel — ver `MVP_STABILIZATION_PASS_04.md`.
2. Fazer login no app como já faz hoje (sessão/cookies válidos para assinatura ops quando aplicável).
3. Abrir `https://<seu-dominio>/dashboard/dev-health`.
4. Conferir cards verdes (OK) ou interpretar Atenção/Erro.
5. Opcional: repetir com smoke CLI (`scripts/smoke-production.mjs`) para comparar sem navegador.

---

## 4. Riscos remanescentes

- Com **`ENABLE_DEV_HEALTH=true`** (ou flag pública) em produção, qualquer usuário autenticado que conheça a URL ainda acessa — ver gate em `docs/modules/reports/MVP_STABILIZATION_PASS_04.md`. Auth forte continua como evolução futura.
- Rotas ops podem retornar **401/403** sem cookie de assinatura válido — esperado; o painel marca **Atenção**, não necessariamente bug de infra.

---

## 5. Referências

- Checklist deploy: `docs/deploy/PRODUCTION_CHECKLIST.md`
- Smoke: `scripts/smoke-production.mjs`
- Passo 02: `docs/modules/reports/MVP_STABILIZATION_PASS_02.md`
- Passo 04 (gate env): `docs/modules/reports/MVP_STABILIZATION_PASS_04.md`
