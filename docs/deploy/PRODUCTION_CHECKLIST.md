# Checklist de produção — OmniGestão Pro (Vercel)

Use este roteiro antes e depois de cada deploy relevante. Não substitui revisão de código nem testes manuais das jornadas críticas.

---

## 1. Variáveis de ambiente (Vercel)

- [ ] **`DATABASE_URL`** — pooler Supabase (ex.: porta **6543**, `?pgbouncer=true` quando aplicável).
- [ ] **`DIRECT_URL`** — conexão direta (ex.: porta **5432**) para migrations fora do runtime da app (Build não deve depender de migrate interativo).
- [ ] **`NEXT_PUBLIC_APP_URL`** — URL pública coerente com o domínio da Vercel.
- [ ] **Chaves de IA / OpenRouter / OpenAI** — apenas se os fluxos que as usam estiverem no escopo do release (não são obrigatórias para smoke financeiro/ops básico).

**Supabase**

- [ ] Projeto correto (mesmo ID que o banco com dados reais de staging/produção).
- [ ] Pooler habilitado para `DATABASE_URL`; direct para `DIRECT_URL`.

**Não commitar** `.env` nem colar secrets em issues ou chats.

### Painel técnico `/dashboard/dev-health` (opcional)

- [ ] **`ENABLE_DEV_HEALTH`** — deixar **ausente** ou diferente de `true` em produção estável. Definir **`true`** apenas durante diagnóstico (variável **server-side** na Vercel — preferida).
- [ ] **`NEXT_PUBLIC_ENABLE_DEV_HEALTH`** — só se realmente precisar do flag no cliente; valor exato **`true`** para liberar. **Recomendação:** manter **desligado** quando não estiver diagnosticando; preferir `ENABLE_DEV_HEALTH` server-only.

Comportamento: em **`NODE_ENV === "production"`** sem essas flags, a rota mostra **“Painel técnico indisponível”** e **não** executa probes. Em desenvolvimento local (`next dev`) o painel segue disponível por padrão.

---

## 2. Build e tipo

Localmente (ou na CI):

```bash
npx tsc --noEmit
npm run build
```

**Nota:** se `npm run lint` falhar com `ENOENT ... public/sw.js`, rode `npm run build` primeiro (o PWA gera/atualiza o service worker) ou garanta que `public/sw.js` existe no working tree.

Na Vercel: conferir que o deploy terminou **Ready** e não há erro de build.

---

## 3. Rotas dinâmicas críticas (cache)

Rotas que leem **Prisma por loja** ou lista global de lojas devem estar marcadas com:

```ts
export const dynamic = "force-dynamic"
export const revalidate = 0
```

Checklist mental após mudanças em `app/api/**`:

- [ ] **`GET /api/stores`** — lista de unidades (evita resposta vazia cacheada).
- [ ] **`GET /api/debug/prod-health`** — diagnóstico read-only (contagens globais / por loja).
- [ ] **`GET /api/clientes`**, **`GET /api/produtos`** — cadastros por `storeId`.
- [ ] **`GET /api/ops/contas-receber-list`**, **`GET /api/ops/contas-pagar-list`** — financeiro ops.
- [ ] **`GET /api/ops/ordens`** — lista payload OS por loja.
- [ ] **`GET /api/ordens-servico`** — legado/automações.
- [ ] **`GET /api/stores/[id]`**, **`GET /api/stores/[id]/settings`** — detalhe unidade / settings.
- [ ] **`GET /api/settings/perfil-loja`** — perfil da loja resolvido por header/cookie.

Lista revisada no relatório: `docs/modules/reports/MVP_STABILIZATION_PASS_02.md`.

---

## 4. Smoke HTTP (read-only)

Com o deploy no ar:

```bash
BASE_URL=https://seu-dominio.vercel.app node scripts/smoke-production.mjs
```

Opcional (quando o servidor exige loja no header):

```bash
BASE_URL=https://xxx.vercel.app X_ASSISTEC_LOJA_ID=sua-loja-id node scripts/smoke-production.mjs
```

Interpretação:

- **200** em `/` — app responde.
- **`/api/stores`** — esperado JSON com `stores` (array); vazio pode indicar DB/ENV errado.
- **`/api/debug/prod-health`** — `ok: true` e contagens; `storeIdResolved` ajuda a validar header/cookie de loja.
- **Ops list** — podem retornar **401/403** sem sessão/cookie de assinatura; o importante é **não** ser 500 por crash nem resposta HTML cacheada errada.

---

## 4b. Painel interno de diagnóstico (UI, somente leitura)

Em **produção**, o painel só carrega se **`ENABLE_DEV_HEALTH=true`** ou **`NEXT_PUBLIC_ENABLE_DEV_HEALTH=true`** (ou ambiente não-produção). Ver `lib/dev-tools/dev-access.ts` e `docs/modules/reports/MVP_STABILIZATION_PASS_04.md`.

Checklist quando for usar o painel:

- [ ] Definir **`ENABLE_DEV_HEALTH=true`** na Vercel (recomendado) e redeploy se necessário.
- [ ] Com **sessão válida** no dashboard, abrir **`/dashboard/dev-health`** (não está no menu lateral).
- [ ] Conferir cards **OK** para `/api/stores`, `/api/debug/prod-health` e, se a assinatura permitir, rotas `/api/ops/*`.
- [ ] Usar **Atualizar diagnóstico** para repetir sem recarregar a página inteira.
- [ ] **Desligar** a variável após o diagnóstico.

Documentação: `docs/modules/reports/MVP_STABILIZATION_PASS_03.md` (UI), `MVP_STABILIZATION_PASS_04.md` (gate).

**Segurança:** com o gate ligado por flag, usuários sem a flag não veem probes. Com a flag **ligada**, qualquer usuário autenticado que conheça a URL ainda acessa — auth forte continua como evolução futura.

---

## 5. Validação manual por módulo (UI)

Marque após conferir em navegador autenticado (sessão staff/assinatura válida conforme seu fluxo):

| Módulo | Rota sugerida | O que validar |
|--------|----------------|---------------|
| Cadastros HUB | `/dashboard/cadastros-v2` | Stats/actions carregam; sem tela branca. |
| Clientes | `/dashboard/clientes` | Lista por loja ativa. |
| Produtos | `/dashboard/estoque` ou fluxo de produtos | Lista e filtros básicos. |
| Vendas | `/dashboard/vendas`, histórico | PDV / arquivo conforme perfil. |
| Financeiro receber/pagar | `/dashboard/financeiro-v2` ou painéis legados | Listas batem com ops APIs quando aplicável. |
| Operações HUB | `/dashboard/operacoes-v2` | Lista OS; mudança de status não quebra. |
| PDV | `/dashboard/vendas` | Abrir caixa, venda de teste em staging apenas. |

---

## 6. Pós-deploy rápido

- [ ] Abrir `/dashboard` — shell e tema.
- [ ] Trocar unidade no seletor — dados mudam (quando houver mais de uma loja).
- [ ] Conferir **logs Vercel** por erros Prisma (`P1001`, `P2021`, etc.).

---

## 7. Referências

- Deploy geral: `docs/ai/DEPLOY.md`
- Diagnóstico “produção zerada”: `docs/modules/reports/VERCEL_PROD_DATA_EMPTY_DIAGNOSIS.md`
- Smoke script: `scripts/smoke-production.mjs`
