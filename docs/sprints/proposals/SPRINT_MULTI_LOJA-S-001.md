---
title: SPRINT_MULTI_LOJA-S-001 · Eliminar fallback silencioso loja-1 + ACL rotas críticas
sprint_id: MULTI_LOJA-S-001
hub: multi_loja
status: mergeada
origin:
  type: finding
  id: F-01
  findings_cobertos: [F-01, F-02, F-05, F-06, F-07, F-14]
  findings_fora: [F-03, F-04, F-08, F-10]
benchmark_ref: null
audit_ref: docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
proposta_por: SKILL_PROPOSE_SPRINT v1
proposta_em: 2026-05-28T19:00:00-03:00
modo_execucao: opcao_A_atomico
data_saneamento_banco: 2026-05-28
resultado_saneamento: GREEN
---

# SPRINT_MULTI_LOJA-S-001 · Eliminar fallback silencioso loja-1 + ACL rotas críticas

> Modo: **SAFE** com regime piloto (humano confirma cada checkpoint — HUMAN_GATES §7).
> Escopo: F-01 + F-02 atômicos (Opção A aprovada) + ACL em F-05/F-06/F-07/F-14.
> Allow-list ESTRITA · 43 arquivos · exceção `files_max` declarada.

---

## 1. Por que esta sprint existe

### 1.1 Rastreabilidade

- **Dívida-raiz**: **DT-03 — Fallback silencioso para `loja-1`** (registrada no backlog técnico multi-loja).
- **Finding-âncora**: **F-01 (P0)** em `lib/store-id-from-request.ts:25-32` — função `storeIdFromAssistecRequestForRead` cai em `LEGACY_PRIMARY_STORE_ID = "loja-1"` quando todas as fontes (header `x-assistec-loja-id`, query `storeId`, cookie de loja) estão ausentes.
- **Documento-fonte**: `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md`.
- **Saneamento de banco prévio**: A4 executado em 2026-05-28 com resultado **GREEN** (12 tabelas auditadas · 0 `storeId` nulo/vazio · 0 orphans). Não há débito de dados bloqueando a remoção do fallback.

### 1.2 Decisão arquitetural aprovada — Opção A (atômica)

Aprovou-se a **Opção A — F-01 + F-02 corrigidos no mesmo lote**, em vez de um dual-mode com flag de transição.

Justificativa registrada (mantida aqui para o executor):

1. **Lovable Financeiro** já consome todas as rotas via `withStoreHeaders()` — o cliente real do hub Financeiro nunca emite request sem `x-assistec-loja-id`. Logo, retirar o fallback não quebra fluxos legítimos.
2. **Failure mode visível** (HTTP 400 "storeId obrigatório") é estritamente superior a **failure mode silencioso** (escrita/leitura cega em `loja-1`), porque revela imediatamente qualquer caller mal-configurado.
3. **Dual-mode vira dívida permanente** — flags de transição em código de tenancy raramente são removidas e mascaram regressões. Cortar a "rede de segurança" agora, com a piloto controlada, é mais barato do que carregá-la indefinidamente.
4. **Blast radius pequeno e auditado**: 32 rotas com `|| "loja-1"` foram inventariadas. Mais 1 exceção (rota de exportar via anchor-tag) recebe TODO comentado em vez de remoção, isolada com plano de saneamento na Sprint_02.

### 1.3 Por que junto com ACL (F-05/F-06/F-07/F-14)

F-01/F-02 endurecem a **resolução** de `storeId`. Mas resolver corretamente não basta — é preciso garantir que o caller **pode** ler/escrever naquele `storeId`. F-05/F-06/F-07/F-14 fecham a **autorização** (`canAccessStore`) nas rotas mais sensíveis que ficariam expostas após o endurecimento da resolução. Mantê-los na mesma sprint evita um intervalo em que a resolução é estrita mas a ACL ainda é frouxa.

---

## 2. Escopo fechado

### 2.1 Dentro do escopo (detalhado por finding)

#### F-01 — P0 · `lib/store-id-from-request.ts`

- **Mudança**: `storeIdFromAssistecRequestForRead` deve retornar `null` quando nenhuma fonte resolve o `storeId` (idêntico ao comportamento já existente de `storeIdFromAssistecRequestForWrite`).
- **Remover**: referência a `LEGACY_PRIMARY_STORE_ID` no caminho de leitura.
- **Manter**: a constante pode permanecer exportada apenas se algum teste/seed depender dela (verificar grep antes de excluir).
- **Critério**: `npx tsc --noEmit` deve sinalizar todos os callers que ignoravam a possibilidade de `null` — esses callers são tratados em F-02.

#### F-02 — P0 · 32 rotas (lista canônica)

Cada uma das rotas abaixo segue **um único padrão de fix**:

```ts
// ANTES
const storeId = storeIdFromAssistecRequestForRead(req) || "loja-1";

// DEPOIS
const storeId = storeIdFromAssistecRequestForRead(req);
if (!storeId) {
  return NextResponse.json(
    { error: "storeId obrigatório" },
    { status: 400 },
  );
}
```

Rotas a corrigir (32 + 1 exceção):

- `app/api/vendas/[id]/route.ts`
- `app/api/vendas/[id]/cancelar/route.ts`
- `app/api/vendas/[id]/corrigir/route.ts`
- `app/api/vendas/historico/route.ts`
- `app/api/financeiro/receber/route.ts`
- `app/api/financeiro/pagar/route.ts`
- `app/api/financeiro/movimentacoes/route.ts`
- `app/api/financeiro/fluxo-caixa/route.ts`
- `app/api/financeiro/analytics/route.ts`
- `app/api/financeiro/auditoria/route.ts`
- `app/api/financeiro/dre/route.ts`
- `app/api/financeiro/conciliacao/route.ts`
- `app/api/financeiro/conciliacao/[id]/route.ts`
- `app/api/financeiro/fechamentos/route.ts`
- `app/api/financeiro/fechamentos/fechar-mes/route.ts`
- `app/api/financeiro/fechamentos/fechar-dia/route.ts`
- `app/api/financeiro/fechamentos/[id]/reabrir/route.ts`
- `app/api/financeiro/relatorios/resumo/route.ts`
- `app/api/financeiro/relatorios/rankings/route.ts`
- `app/api/financeiro/relatorios/indicadores/route.ts`
- `app/api/financeiro/relatorios/fluxo/route.ts`
- `app/api/financeiro/relatorios/categorias/route.ts`
- `app/api/financeiro/carteiras/route.ts`
- `app/api/financeiro/carteiras/[id]/route.ts`
- `app/api/financeiro/carteiras/transferencia/route.ts`
- `app/api/financeiro/auditoria/[entidade]/[entidadeId]/route.ts`
- `app/api/finance/transactions/route.ts`
- `app/api/finance/dashboard/route.ts`
- `app/api/finance/categories/route.ts`
- `app/api/finance/accounts/route.ts`
- `app/api/ops/contas-receber-list/route.ts`
- `app/api/ops/contas-pagar-list/route.ts`

**Exceção declarada (1 rota)**:

- `app/api/financeiro/relatorios/exportar/route.ts` — chamada via anchor-tag (`<a href>`) **não envia header `x-assistec-loja-id`**, então removê-lo agora quebra exportação de relatórios. Manter o fallback **com comentário explícito**:
  ```ts
  // TODO F-02-anchor: rota acessada via anchor-tag não envia x-assistec-loja-id.
  // Resolver em SPRINT_MULTI_LOJA-S-002 (cookie/proxy de loja).
  const storeId = storeIdFromAssistecRequestForRead(req) || "loja-1";
  ```

#### F-05 (parcial) — P0 · 5 rotas sem `auth()` + `canAccessStore`

- `app/api/dashboard/resumo/route.ts`
- `app/api/dashboard/elite/route.ts`
- `app/api/clients/route.ts`
- `app/api/ops/inventory/route.ts`
- `app/api/ops/sync-legacy-vendas/route.ts`

Padrão de fix:

```ts
import { auth } from "@/auth";
import { canAccessStore } from "@/lib/auth/enterprise-permissions";

const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
}
const storeId = storeIdFromAssistecRequestForRead(req);
if (!storeId) {
  return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 });
}
if (!(await canAccessStore(session, storeId))) {
  return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 });
}
```

#### F-06 — P0 · `app/actions/whatsapp.ts`

Actions afetadas: `sendWhatsAppTextAction`, `sendWhatsAppTemplateAction`, `sendWhatsAppMediaAction`.

- Já chamam `auth()`. Adicionar logo depois:
  ```ts
  if (!(await canAccessStore(session, storeId))) {
    throw new Error("Sem acesso à loja");
  }
  ```
- Não alterar a assinatura pública das actions (escopo cirúrgico).

#### F-07 — P0 · `app/api/whatsapp/send-daily/route.ts`

Já tem `auth()`. Falta `canAccessStore` **depois** de resolver `storeId`. Aplicar o mesmo padrão das rotas F-05.

#### F-14 — P0 (upgrade de P1) · `lib/whatsapp-daily-server.ts`

- Linhas-alvo: `6` (assinatura) e `38` (uso interno).
- Alteração: tornar o parâmetro `storeId` **obrigatório** (não nullable). Quem garante a presença é o caller (rota F-07); o service apenas exige o campo.
- Justificativa: o service não deve aceitar `null` "por defesa" — isso esconde o bug de roteamento.

### 2.2 Fora do escopo (explícito)

Os findings abaixo NÃO entram nesta sprint:

- **F-03** — `proxy.ts` cookie typo. Vai para **SPRINT_MULTI_LOJA-S-002**, exige flag `--with-protected-areas:proxy.ts` (área protegida).
- **F-04** — Webhook WhatsApp com `storeId` fixo. Exige schema novo (mapping de número → store). Sprint dedicada.
- **F-08** — Sync legacy financeiro. Faz parte da sprint de descomissionamento legacy, fora do piloto multi-loja.
- **F-10** — Auditoria de dados em produção. Blocker apenas para 2ª loja real; não bloqueia o piloto técnico.

Também fora:
- Refatorar `withStoreHeaders` (cliente Lovable) — está correto e não tem dívida.
- Tocar em `prisma/schema.prisma` — proibido sem autorização explícita (CORE_RULES).
- Mudar `auth.ts` / `auth.config.ts` — proibido.
- Qualquer mudança visual/UI.

---

## 3. Critério de pronto (DoD)

Esta sprint só é considerada pronta quando **todos** os itens abaixo estiverem verdes:

1. **`npx tsc --noEmit`** — zero erros.
2. **`npm run lint`** — zero erros (warnings novos exigem justificativa inline).
3. **`npm run build`** — passa (mudança afeta rotas → build é obrigatório por CORE_RULES).
4. **`npm run test`** — todos os testes passam.
5. **Expected-fail viram pass**:
   - 3 testes em `tests/.../store-id-from-request.test.ts` (F-01) — devem passar de "expected fail" para **pass**.
   - 1 teste em `tests/.../multi-loja-no-hardcoded-fallback.test.ts` (F-02) — deve passar de "expected fail" para **pass**.
   - Resultado-alvo: **≥ 94 passed** | **≤ 10 expected fail** (baseline atual: 90 passed | 14 expected fail).
6. **Smoke check manual** (operado pelo humano que mergeia):
   - `GET /api/financeiro/receber` sem header `x-assistec-loja-id` → 400 com `{ "error": "storeId obrigatório" }`.
   - `GET /api/financeiro/receber` com header válido + sessão válida → 200.
   - `GET /api/financeiro/relatorios/exportar` sem header → ainda 200 (exceção F-02-anchor documentada).
   - Smoke do PDV no `/dashboard` (criar venda em uma loja) — comportamento idêntico ao pré-merge.
7. **Allow-list respeitada** — `git diff --name-only main...HEAD` deve listar **apenas** arquivos da allow-list da §5.
8. **`docs/status/EXECUTION_LOG.md`** atualizado com entrada da sprint (append-only).
9. **`docs/ai/CURRENT_STATUS.md`** — atualizar somente se houver mudança relevante de estado de módulo (esta sprint endurece API; provavelmente vale 1-2 linhas em "multi-loja").

---

## 4. Plano de execução por checkpoint

Regime piloto: humano confirma **cada checkpoint** antes do próximo.

### CP1 — F-01 (helper)

- **Owner**: Sonnet via `SKILL_EXEC_DEBT_ITEM`.
- **Arquivos**: `lib/store-id-from-request.ts`.
- **Ação**: trocar fallback `LEGACY_PRIMARY_STORE_ID` por `return null` em `storeIdFromAssistecRequestForRead`.
- **Estimativa**: ~5 linhas alteradas · 5 min.
- **Critério de avanço**: `npx tsc --noEmit` executado. **Erros de tipo em callers são esperados** e provam que F-02 é necessário. Lista de callers que quebraram é registrada no `EXECUTION_LOG.md`. Humano confirma "ok, segue CP2".

### CP2 — F-02 (32 rotas + 1 exceção)

- **Owner**: Sonnet.
- **Arquivos**: 32 rotas da §2.1 + `app/api/financeiro/relatorios/exportar/route.ts` (apenas TODO).
- **Ação**: aplicar o padrão uniforme de fix em cada rota; na rota de exportar, somente adicionar TODO.
- **Estimativa**: ~3 linhas por rota × 32 = ~96 linhas adicionadas, ~32 removidas. · ~45 min.
- **Critério de avanço**:
  - `npx tsc --noEmit` limpo.
  - `npm run test` — expected-fail de F-02 deve virar **pass**.
  - Humano confirma "ok, segue CP3".

### CP3 — F-05 + F-06 + F-07 + F-14 (ACL)

- **Owner**: Sonnet.
- **Arquivos**: 5 rotas F-05 + `app/actions/whatsapp.ts` (3 actions) + `app/api/whatsapp/send-daily/route.ts` + `lib/whatsapp-daily-server.ts`.
- **Ação**: aplicar guards `auth()` + `canAccessStore` conforme padrões da §2.1.
- **Estimativa**: ~50 (F-05) + ~15 (F-06) + ~8 (F-07) + ~3 (F-14) = ~76 linhas adicionadas. · ~30 min.
- **Critério de avanço**:
  - `npx tsc --noEmit` limpo.
  - `npm run test` — todos passam.
  - Humano confirma "ok, segue CP4".

### CP4 — Suite completa + log

- **Owner**: Sonnet.
- **Ação**:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - Anexar resultado em `docs/status/EXECUTION_LOG.md` (append-only).
  - Atualizar `docs/ai/CURRENT_STATUS.md` se aplicável.
- **Critério de avanço**:
  - Todos os 5 DoD-itens 1–6 verdes.
  - Expected-fail de F-01 (3) e F-02 (1) viraram **pass**.
  - Resultado final: ≥ 94 passed | ≤ 10 expected fail.
  - Sprint pronta para **AUDIT pós** (`SKILL_AUDIT_MULTI_LOJA`) e Gate #2.

---

## 5. Allow-list de paths (ESTRITA)

Esta sprint **só** pode tocar nos arquivos abaixo. Qualquer arquivo fora desta lista exige nova autorização explícita do humano.

```
# F-01 — helper
lib/store-id-from-request.ts

# F-14 — service WhatsApp daily
lib/whatsapp-daily-server.ts

# F-06 — actions WhatsApp
app/actions/whatsapp.ts

# F-02 — rotas de vendas (4)
app/api/vendas/[id]/route.ts
app/api/vendas/[id]/cancelar/route.ts
app/api/vendas/[id]/corrigir/route.ts
app/api/vendas/historico/route.ts

# F-02 — rotas Financeiro principais (7)
app/api/financeiro/receber/route.ts
app/api/financeiro/pagar/route.ts
app/api/financeiro/movimentacoes/route.ts
app/api/financeiro/fluxo-caixa/route.ts
app/api/financeiro/analytics/route.ts
app/api/financeiro/auditoria/route.ts
app/api/financeiro/dre/route.ts

# F-02 — Conciliação (2)
app/api/financeiro/conciliacao/route.ts
app/api/financeiro/conciliacao/[id]/route.ts

# F-02 — Fechamentos (4)
app/api/financeiro/fechamentos/route.ts
app/api/financeiro/fechamentos/fechar-mes/route.ts
app/api/financeiro/fechamentos/fechar-dia/route.ts
app/api/financeiro/fechamentos/[id]/reabrir/route.ts

# F-02 — Relatórios (5) + exceção (1)
app/api/financeiro/relatorios/resumo/route.ts
app/api/financeiro/relatorios/rankings/route.ts
app/api/financeiro/relatorios/indicadores/route.ts
app/api/financeiro/relatorios/fluxo/route.ts
app/api/financeiro/relatorios/categorias/route.ts
app/api/financeiro/relatorios/exportar/route.ts   # F-02 exceção (apenas TODO)

# F-02 — Carteiras (3)
app/api/financeiro/carteiras/route.ts
app/api/financeiro/carteiras/[id]/route.ts
app/api/financeiro/carteiras/transferencia/route.ts

# F-02 — Auditoria dinâmica (1)
app/api/financeiro/auditoria/[entidade]/[entidadeId]/route.ts

# F-02 — finance/* (4)
app/api/finance/transactions/route.ts
app/api/finance/dashboard/route.ts
app/api/finance/categories/route.ts
app/api/finance/accounts/route.ts

# F-02 — ops/* listings (2)
app/api/ops/contas-receber-list/route.ts
app/api/ops/contas-pagar-list/route.ts

# F-05 — rotas sem auth+ACL (5)
app/api/dashboard/resumo/route.ts
app/api/dashboard/elite/route.ts
app/api/clients/route.ts
app/api/ops/inventory/route.ts
app/api/ops/sync-legacy-vendas/route.ts

# F-07 — WhatsApp send-daily (1)
app/api/whatsapp/send-daily/route.ts

# Documentação (append-only)
docs/status/EXECUTION_LOG.md
```

**Total: 43 arquivos.**

---

## 6. Exceção de `files_max` (declarada)

O default da `SKILL_EXEC_DEBT_ITEM` é `files_max: 10`. Esta sprint **excede** esse default.

### 6.1 Override solicitado

- **Campo**: `allowed_paths` declarado como `dynamic` (lista ESTRITA acima).
- **Workaround**: documentado em **ADR-0002 §4** (override de `files_max` via `allowed_paths: dynamic` + lista enumerada).

### 6.2 Justificativa

1. **Atomicidade obrigatória**: F-01 e F-02 são, por definição, indivisíveis — alterar o helper sem alterar os callers quebra build/runtime. Logo, partir em sprints menores **introduziria janelas de inconsistência** (build vermelho ou comportamento mais frouxo).
2. **Diff total pequeno**: ~200-280 linhas adicionadas / ~50 removidas — **≤ 500** (dentro de `expected_diff_max`).
3. **Mudanças cirúrgicas e uniformes**: 32 rotas seguem **um único padrão de fix** (substituição mecânica). Risco por arquivo é mínimo.
4. **Auditável**: cada rota é coberta por testes existentes ou pelo expected-fail F-02. Regressão é detectada pela suíte.
5. **Rollback simples**: 1 branch, 1 revert (ver §8).

### 6.3 Flag a passar no SKILL_EXEC_DEBT_ITEM

```yaml
allow_files_max_override: true
files_max_override_reason: "F-01+F-02 atômicos; allow-list estrita; ADR-0002 §4"
allowed_paths: dynamic   # ver §5
expected_diff_max: 500
```

---

## 7. Riscos identificados

| ID | Severidade | Risco | Mitigação |
|---|---|---|---|
| **R-CRIT-05** | Médio | Lovable Financeiro tem 1 fetch via anchor-tag (`/api/financeiro/relatorios/exportar`) que **não envia** `x-assistec-loja-id`. Após F-01, receberia 400. | Manter fallback `|| "loja-1"` **apenas** nessa rota, com `// TODO F-02-anchor`. Sprint_02 resolve via cookie/proxy de loja. Exportação continua funcional. |
| **R-CRIT-01** | Baixo (mitigado) | F-01 + F-02 precisam ser atômicos para não quebrar build entre commits. | Checkpoints CP1 e CP2 **na mesma sessão de execução**. Branch só é mergeada após CP4 verde. |
| **R-BLAST** | Baixo | 43 arquivos tocados — blast radius maior que sprints típicas. | Diff é pequeno e mecânico. Allow-list estrita. Rollback de 1 comando (ver §8). Smoke check em PDV/Financeiro antes de mergear. |
| **R-DATA** | Encerrado | Dados em banco poderiam ter `storeId` órfão expostos após endurecimento. | A4 (saneamento) executado em 2026-05-28 — **GREEN**, 12 tabelas, 0 orphans. Risco encerrado antes de abrir a sprint. |

Riscos adicionais monitorados durante execução:

- **Caller não previsto** (rota não listada que chama `storeIdFromAssistecRequestForRead`): será capturado em CP1 pelo `tsc` (erro de tipo: `string | null` não é assinable a `string`). Se aparecer, parar e pedir extensão de allow-list.
- **Teste em snapshot/mocks que assumia `loja-1`**: capturado em CP2/CP4 pelo `npm run test`. Ajuste do mock entra no escopo (mesmo arquivo) ou pede extensão.

---

## 8. Rollback

**Protocolo exato**: ver `docs/execution/PILOT_RUNBOOK_MULTI_LOJA.md §6`.

Resumo operacional para esta sprint:

1. **Antes do merge (branch ainda viva)**:
   ```bash
   git checkout main
   git branch -D skill/MULTI_LOJA-S-001
   ```
   Nenhum impacto em produção; lock `multi_loja | MULTI_LOJA-S-001` é liberado manualmente.

2. **Após merge em `main` (pré-deploy)**:
   ```bash
   git revert <merge_sha>
   git push origin main
   ```
   Branch de revert nomeada `revert/MULTI_LOJA-S-001-<ISO>`. Atualizar `EXECUTION_LOG.md` com motivo do revert.

3. **Após deploy (incidente em produção)**:
   - Seguir `PILOT_RUNBOOK_MULTI_LOJA.md §6.3` (incident rollback).
   - O fallback `loja-1` era inseguro — mas restaurá-lo via revert é seguro em curto prazo (preserva comportamento legado).
   - Reabrir DT-03 no backlog; documentar root cause em `docs/status/EXECUTION_LOG.md`.

**Não há migration nem mudança de schema** → rollback de código é suficiente; banco permanece consistente em qualquer cenário.

---

## 9. Gates

### Gate #1 — Aprovação desta proposta (humano)

Formato exato esperado (A6 — §10 do runbook):

```
APPROVE_GATE_1
ticket_id: MULTI_LOJA-S-001
approved_by: Rafael
approved_at: <ISO>
allow_protected_areas: false
opcao_execucao: A
```

Campos:
- `allow_protected_areas: false` — esta sprint **não toca** áreas protegidas (`auth.ts`, `proxy.ts`, `prisma/schema.prisma`, core PDV).
- `opcao_execucao: A` — atômico (F-01+F-02 no mesmo lote), conforme decisão arquitetural §1.2.

Sem Gate #1, executor Sonnet **não inicia**.

### Gate #2 — Merge da sprint executada (humano)

Pré-requisitos (todos verdes):
- DoD §3 completo (tsc / lint / build / test / expected-fail viram pass / smoke).
- Allow-list §5 respeitada (`git diff --name-only` confere).
- `SKILL_AUDIT_MULTI_LOJA` rodada pós-execução e resultado **GREEN**.
- `docs/status/EXECUTION_LOG.md` atualizado.

Humano mergeia manualmente. Lock `multi_loja | MULTI_LOJA-S-001` liberado após merge.

---

## 10. ADR sugerido

**ADR-0003 — Eliminar fallback `LEGACY_PRIMARY_STORE_ID` em leituras de API.**

- **Status**: proposta (a ser ratificada junto com merge desta sprint).
- **Decisão**: `storeIdFromAssistecRequestForRead` retorna `null` quando nenhuma fonte resolve. Toda rota chamadora deve responder 400 ao receber `null`. Exceção única e documentada: `app/api/financeiro/relatorios/exportar/route.ts` (anchor-tag — TODO F-02-anchor).
- **Consequências positivas**: failure mode visível; eliminação de cross-store silencioso; alinhamento com `…For_Write` que já retorna `null`.
- **Consequências negativas / dívida assumida**: a rota de exportar mantém fallback temporário (Sprint_02).
- **Alternativas descartadas**: Opção B (dual-mode com flag) — descartada por gerar dívida permanente; Opção C (manter fallback) — descartada por falhar nos critérios de tenancy do piloto multi-loja.
- **Referências**: F-01, F-02, esta sprint, ADR-0002 (workaround de `files_max`).

ADR-0003 será materializado em `docs/architecture/decisions/ADR-0003-*.md` durante o handoff (§12), não como pré-requisito para execução.

---

## 11. Sequência incremental

```
Gate #1 (humano aprova proposta)
   │
   ▼
CP1  F-01  — helper retorna null
   │  (tsc roda; erros de tipo esperados; humano confirma)
   ▼
CP2  F-02  — 32 rotas + 1 exceção
   │  (tsc limpo; expected-fail F-02 vira pass; humano confirma)
   ▼
CP3  F-05 + F-06 + F-07 + F-14  — ACL guards
   │  (tsc + test verdes; humano confirma)
   ▼
CP4  Suite completa
   │  (lint + build + test verdes; expected-fail F-01 vira pass; log)
   ▼
AUDIT pós  — SKILL_AUDIT_MULTI_LOJA roda
   │  (resultado GREEN obrigatório)
   ▼
Gate #2  (humano mergeia)
   │
   ▼
Handoff §12
```

Sem pular checkpoint. Sem mesclar checkpoints. Cada um termina com confirmação humana antes do próximo.

---

## 12. Handoff (pós Gate #2)

Após merge em `main`, executar nesta ordem:

1. **`SKILL_DOC_REFRESH`** — atualizar:
   - `docs/ai/CURRENT_STATUS.md` (status do módulo multi-loja).
   - `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md` — marcar F-01/F-02/F-05/F-06/F-07/F-14 como **resolvidos** (referência ao SHA de merge).
   - Materializar `docs/architecture/decisions/ADR-0003-*.md` conforme §10.
2. **`SKILL_HANDOFF_MVP`** — entrega para próxima sprint do hub multi-loja (provável: SPRINT_MULTI_LOJA-S-002 cobrindo F-03/F-04/anchor-tag).
3. **Liberar lock** `multi_loja | MULTI_LOJA-S-001` (manual ou via ferramenta de lock, conforme runbook).
4. **Anotar no backlog**: dívidas remanescentes (F-03, F-04, F-08, F-10, F-02-anchor) continuam abertas; nenhuma é introduzida por esta sprint.

---

## 13. Referências

- `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md` — auditoria-fonte (findings F-01..F-14).
- `docs/execution/PILOT_RUNBOOK_MULTI_LOJA.md` — runbook do piloto (gates A6, rollback §6, HUMAN_GATES §7).
- `docs/architecture/decisions/ADR-0002-*.md` — workaround `allowed_paths: dynamic` para override de `files_max`.
- `docs/architecture/decisions/ADR-0003-*.md` — (a criar no handoff) eliminar fallback `LEGACY_PRIMARY_STORE_ID`.
- `docs/skills/INDEX.md` + `docs/skills/rules/CORE_RULES.md` + `docs/skills/rules/DELIVERY_CHECKLIST.md` + `docs/skills/rules/AI_WORKFLOW.md`.
- `docs/ai/CURRENT_STATUS.md` — estado real dos módulos.
- `docs/status/EXECUTION_LOG.md` — log append-only de execuções.
- Skill executora: `SKILL_EXEC_DEBT_ITEM` (Sonnet).
- Skill de auditoria pós: `SKILL_AUDIT_MULTI_LOJA`.
- Skill proponente: `SKILL_PROPOSE_SPRINT v1` (Opus).
- Branch: `skill/MULTI_LOJA-S-001`.
- Lock: `multi_loja | MULTI_LOJA-S-001 | TTL=PT4H`.

---

> Fim da proposta. Aguardando Gate #1 (formato A6) para iniciar CP1.
