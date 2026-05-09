# MVP — Estabilização passo 04 (guard para páginas técnicas / dev)

**Data:** 2026-05-08  
**Escopo:** gate por **variável de ambiente** para `/dashboard/dev-health` — **sem** auth real, billing, migration ou Prisma.

---

## 1. Helper

| Arquivo | Funções |
|---------|---------|
| `lib/dev-tools/dev-access.ts` | `isDevToolsEnabled()`, `getDevToolsAccessReason()` |

**Regras (`isDevToolsEnabled`):**

1. `NODE_ENV !== "production"` → **habilitado** (desenvolvimento local / preview típico).
2. `ENABLE_DEV_HEALTH === "true"` (trim exato) → **habilitado** (servidor — **recomendado** na Vercel).
3. `NEXT_PUBLIC_ENABLE_DEV_HEALTH === "true"` → **habilitado** (só se necessário; fica no bundle cliente).

Nenhum valor de secret é lido ou exibido.

---

## 2. Página `/dashboard/dev-health`

- `app/dashboard/dev-health/page.tsx`: se `!isDevToolsEnabled()`, renderiza **`DevHealthBlocked`** — **não** monta `DevHealthClient` (sem probes).
- `app/dashboard/dev-health/DevHealthBlocked.tsx`: estado bloqueado com mensagem e dica de `ENABLE_DEV_HEALTH`.

Build permanece válido: decisão em Server Component.

---

## 3. Habilitar / desabilitar

| Ambiente | Como |
|----------|------|
| **Local** (`next dev`) | Normalmente já liberado (`NODE_ENV !== "production"`). |
| **Produção (Vercel)** | Definir `ENABLE_DEV_HEALTH=true` no painel → redeploy se a variável for nova. |
| **Cliente-only flag** | `NEXT_PUBLIC_ENABLE_DEV_HEALTH=true` — usar só se houver motivo; **remover ou setar false** após diagnóstico. |
| **Desligar** | Remover a variável ou definir valor diferente de `"true"`; redeploy na Vercel se necessário. |

---

## 4. Documentação relacionada

- Checklist: `docs/deploy/PRODUCTION_CHECKLIST.md` (variáveis e seção do painel).
- Passo 03 (painel): `docs/modules/reports/MVP_STABILIZATION_PASS_03.md`

---

## 5. Riscos remanescentes

- Gate **não** é autenticação: com flag ligada, qualquer usuário logado no dashboard que saiba a URL ainda acessa o painel.
- `NEXT_PUBLIC_*` expõe a intenção “dev health pode existir” no bundle — preferir `ENABLE_DEV_HEALTH` server-only quando possível.
