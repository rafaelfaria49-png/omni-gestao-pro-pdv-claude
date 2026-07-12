---
title: Contador HUB — Reconciliação de status (GOAL CONTADOR-HUB-STATUS-RECONCILE-001)
status: concluído
date: 2026-07-12
mode: auditoria read-only + documentação (gate G1 da série 001)
branch: goal/contador-001-status-reconcile
worktree: C:\Projetos\omni-gestao-contador-001
---

# Contador HUB — Reconciliação de status (001)

> **Gate G1 da série Contador 001.** Nada da série é implementado antes desta
> reconciliação. Este documento compara o masterplan (escrito sem acesso direto
> ao repositório, sobre a auditoria feita em `origin/main = 1911415`) com o
> código atual de `origin/main`.

## 1. Baseline analisado

| Item | Valor |
|---|---|
| `origin/main` atual | `f42072a` (`f42072ae2275aaa53402ea71a6c14ca89e92b30c`, 2026-07-12, `fix(vendas): preservar metadata ao corrigir itens`) |
| Baseline do masterplan | `1911415` (`feat(acessorios): configurar produtos e projetar catalogo`) |
| Commit visual do HUB | `9023e7b` (`9023e7b365083bdc31728980d76acbcfa902265b`, 2026-07-08, `feat(contador): adicionar hub visual em preview`) — **contido em origin/main** |
| Último commit a tocar arquivos do contador | `9023e7b` (verificado com `git log origin/main -- app/dashboard/contador components/dashboard/contador lib/contador-aggregates.ts app/contador app/login-contador app/api/auth/contador`) |
| Branches remotas com "contador" no nome | **nenhuma** (`git branch -r` sem hits) |
| Branch local relacionada | `audit/contador-hub-current-state-001` — aponta para `1911415`, **sem commits próprios** (diff vazio vs. `1911415`) |

### Commits entre o baseline do masterplan e o main atual

| Commit | Escopo | Toca contador ou guards citados? |
|---|---|---|
| `738af36` `feat(pdv): selecionar modelo e cor de acessorios` | `components/dashboard/vendas/*`, `components/dashboard/vendas/acessorios/*`, `lib/acessorios/*`, `lib/pdv-hold.ts` | **Não** |
| `f42072a` `fix(vendas): preservar metadata ao corrigir itens` | `app/api/vendas/[id]/corrigir-itens/route.ts`, `lib/vendas/*` | **Não** |

Nenhum dos dois commits altera o módulo contador nem os arquivos de guard/segurança
citados pelo masterplan (`app/api/ops/vendas-list/route.ts`, `lib/ops-api-gate.ts`,
`proxy.ts`, `app/api/auth/contador/route.ts`, `lib/loja-ativa.tsx`,
`lib/operations-store.tsx`, `lib/auth/api-enterprise-guard.ts`).

## 2. Situação dos documentos da série

- **`docs/contador/` não existia no repositório** antes deste documento. Os 4
  documentos da série 001 (masterplan + comandos) **estão ausentes** do repo —
  apenas reportado aqui, conforme o GOAL; não foram criados.
- A auditoria-base (`CONTADOR_HUB_CURRENT_STATE_AUDIT_001.md`) foi localizada
  **apenas como arquivo não rastreado** no worktree paralelo
  `C:\Projetos\omni-gestao-contador-hub-audit-001` (branch
  `audit/contador-hub-current-state-001`), sem commit em nenhuma branch.
- **Limitação declarada:** como o texto do masterplan (§3 e §21) não está no
  repositório, a reconciliação abaixo usa como proxy o inventário de afirmações
  da auditoria-base — a fonte factual do masterplan. Cada afirmação central foi
  reverificada diretamente no código de `f42072a`.

## 3. Tabela de reconciliação

Legenda: **CONFIRMADO** = afirmação bate com o código atual; **DIVERGENTE** =
código atual difere (descrito); **NOVO** = fato relevante não coberto pelo
masterplan/auditoria.

### 3.1 Existência e forma do módulo

| # | Afirmação central | Evidência no código atual | Status |
|---|---|---|---|
| 1 | HUB interno `/dashboard/contador` existe desde `9023e7b`, é casca visual preview-only | `app/dashboard/contador/page.tsx:10-17` (docblock "Casca VISUAL/preview… GOAL CONTADOR-HUB-VISUAL-PREVIEW-ONLY-001") | CONFIRMADO |
| 2 | Está no menu de hubs com badge "Preview", gate `p.hubs.financeiro` | `lib/navigation/dashboard-nav-items.ts:134-143` | CONFIRMADO |
| 3 | Dados 100% estáticos em `contador-preview-data.ts` (436 linhas), sem API/banco | `components/dashboard/contador/contador-preview-data.ts:2` ("dados ESTÁTICOS de pré-visualização"); nenhum fetch/action no componente | CONFIRMADO |
| 4 | 16 no-ops com toast honesto | `contador-hub-preview.tsx:297-301` (função `noop` → toast "pré-visualização, sem efeito real nesta fase"); call sites nas linhas 446, 473, 558, 593, 652, 682, 700, 812, 815, 849, 881, 908, 1009, 1085, 1139, 1231 — **contagem exata: 16** | CONFIRMADO |
| 5 | Competência/abas/filtros/modo só em `useState`, sem URL/localStorage/persistência | `contador-hub-preview.tsx` (estados locais; único `setTimeout` é o do toast) | CONFIRMADO |
| 6 | "Modo contador" só oculta seções owner-only, não é ACL | `contador-hub-preview.tsx:282-306` (`goSection`/`handleModo`/`visibleSections`) | CONFIRMADO |
| 7 | Portal legado `/contador` + `/login-contador` intactos e separados do HUB interno | `app/contador/page.tsx`, `app/contador/layout.tsx`, `app/login-contador/page.tsx`; `docs/architecture/SIDEBAR_PAGE_ROUTES.md:23-24` | CONFIRMADO |
| 8 | Agregação legada: dedup heurístico OS×venda por mesmo dia/valor; CSV/XML client-side via Blob; `estimativaImposto` = percentual manual | `lib/contador-aggregates.ts:54-111` (`buildMovimentosMes`, tolerância `< 0.02` + `dataSaida === saleDate`), `:122-125` (`estimativaImposto`), `:127-166` (CSV/XML) | CONFIRMADO |
| 9 | `area-contador-pro.tsx` usa `useOperationsStore()` (vendas/OS/inventário híbridos), alíquota inicial 6 | `components/dashboard/contador/area-contador-pro.tsx:21,48,52,87` | CONFIRMADO |
| 10 | Nenhum model `Contador*` no schema; sem competência/documento/pacote/convite/ACL de contador | `prisma/schema.prisma` — único hit de "contador" é comentário do contador **numérico** fiscal (`:2328`, `FiscalNumberSeries`), semanticamente não relacionado | CONFIRMADO |

### 3.2 Segurança e guards (riscos P0)

| # | Afirmação central | Evidência no código atual | Status |
|---|---|---|---|
| 11 | **P0 IDOR:** `/api/ops/vendas-list` só exige assinatura (`requireOpsSubscription`), sem `auth()`/`canAccessStore`; `lojaId` vem de header/query/cookie | `app/api/ops/vendas-list/route.ts:65-81` + `lib/ops-api-gate.ts:7-22` (assinatura = vencimento/plano/status, sem storeId) | CONFIRMADO |
| 12 | **P0 PIN global/default:** `DEFAULT_CONTADOR_PIN = "5678"`, cookie literal `"1"`, 7 dias, sem identidade/rate-limit/auditoria | `app/api/auth/contador/route.ts:7,29-41` | CONFIRMADO |
| 13 | **P0 contexto de loja client-side:** loja ativa em localStorage + cookie gravável por JS | `lib/loja-ativa.tsx:31` (`document.cookie = …ASSISTEC_ACTIVE_STORE_COOKIE…`), `:186-246` (localStorage) | CONFIRMADO |
| 14 | **P0 fallback legado de OS:** `apiGuardOperacoesHubOrLegacy` sem sessão NextAuth aceita assinatura sem vínculo com a loja | `lib/auth/api-enterprise-guard.ts:100-118` | CONFIRMADO |
| 15 | `proxy.ts` protege `/contador` com cookie `=== "1"` após checks de assinatura; `/login-contador` é público | `proxy.ts:148-156` e `:55-57,79-86` | CONFIRMADO |
| 16 | Bypass do gate de assinatura em `vendas-list` quando `NODE_ENV === "development"` (falha do gate é ignorada; resposta expõe `_gateBypassedInDev`) | `app/api/ops/vendas-list/route.ts:66-70,98` | **NOVO** (nuance não destacada; não altera o P0 em produção) |

### 3.3 Documentação e tracking

| # | Afirmação central | Evidência | Status |
|---|---|---|---|
| 17 | `docs/status/MOCKS_TRACKING.md` não listava o Contador HUB (última entrada MOCK-08, last_update 2026-05-30) | verificado antes desta tarefa | CONFIRMADO — **corrigido nesta entrega** (MOCK-09) |
| 18 | `docs/architecture/SIDEBAR_PAGE_ROUTES.md` diferencia `/contador` (externo) de `/dashboard/contador` (interno, preview) | linhas 23-24 do documento | CONFIRMADO |
| 19 | Não existia `docs/contador/*` no repo | confirmado em `f42072a` | CONFIRMADO — este documento inaugura o diretório |

## 4. Deltas classificados

| Delta | Classificação | Efeito na série 001 |
|---|---|---|
| `origin/main` avançou `1911415 → f42072a` (2 commits, ambos fora do módulo contador e dos guards citados) | **nenhum** | Plano permanece válido sem ajuste |
| Bypass dev-only do gate em `vendas-list` (item 16) | **ajusta plano** (menor) | Qualquer GOAL que endureça `vendas-list` deve decidir explicitamente se mantém ou remove o bypass de desenvolvimento — citar `app/api/ops/vendas-list/route.ts:66-70` no escopo |
| 4 documentos da série ausentes de `docs/contador/`; auditoria-base só existe não rastreada em worktree paralelo | **ajusta plano** (processo) | Comitar os documentos da série (masterplan + comandos + auditoria-base) em um GOAL documental próprio, para que os próximos GOALs tenham fonte versionada |
| — | **bloqueia** | **Nenhum delta bloqueante encontrado** |

## 5. Riscos P0 — reconfirmados sem alteração

1. **IDOR de vendas por `storeId`** — `app/api/ops/vendas-list/route.ts` (item 11). Inalterado desde a auditoria.
2. **PIN global/default `5678` + cookie `"1"`** — `app/api/auth/contador/route.ts` (item 12). Inalterado.
3. **Loja ativa controlável no cliente** — `lib/loja-ativa.tsx` (item 13). Inalterado.
4. **Fallback legado de OS sem ACL de loja** — `lib/auth/api-enterprise-guard.ts:100-118` (item 14). Inalterado.

Nenhum risco P0 foi mitigado nem agravado pelos commits `738af36`/`f42072a`.

## 6. Recomendação (gate G1)

**LIBERAR a série 001.** O estado do código em `f42072a` é, para o escopo do
contador, idêntico ao baseline `1911415` auditado — `9023e7b` segue sendo o
único commit do módulo. As afirmações centrais foram todas confirmadas com
arquivo e linha; os únicos deltas são não-bloqueantes (bypass dev-only a citar
no GOAL de hardening e a necessidade de versionar os documentos da série).

---

*Gerado pelo GOAL CONTADOR-HUB-STATUS-RECONCILE-001 (Claude Code · Fable 5),
2026-07-12. Nenhum código ou schema foi alterado; diff restrito a este arquivo
e a `docs/status/MOCKS_TRACKING.md`.*
