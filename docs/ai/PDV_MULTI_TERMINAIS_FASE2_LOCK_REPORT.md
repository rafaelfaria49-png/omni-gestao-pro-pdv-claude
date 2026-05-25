# Relatório — PDV Multi-Terminais · Fase 2 (Lock server-side + Heartbeat)

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Solicitante: Rafael Faria
> Plano: [`PDV_MULTI_TERMINAIS_ARCHITECTURE_PLAN.md`](./PDV_MULTI_TERMINAIS_ARCHITECTURE_PLAN.md) ·
> Fase 1: [`PDV_MULTI_TERMINAIS_FASE1_REPORT.md`](./PDV_MULTI_TERMINAIS_FASE1_REPORT.md)

## 1. Objetivo

Impedir que **dois computadores usem o mesmo terminal ao mesmo tempo**, via **lock
server-side por terminal** + **heartbeat periódico**. Liberação automática quando o
heartbeat expira (PC travado/fechado) e tomada manual (Assumir/Liberar) por
admin/gerente com confirmação — **sem quebrar** o fluxo atual e degradando com aviso
se algo falhar.

## 2. Arquivos

### Novos

| Arquivo | Papel |
|---|---|
| `lib/pdv-terminal-lock.ts` | Lógica **pura** (sem `"use client"`/prisma) reusada por server e client: `TERMINAL_HEARTBEAT_INTERVAL_MS` (30s), `TERMINAL_LOCK_TTL_MS` (120s), `computeLockStatus()` → `LIVRE \| EM_USO \| OCUPADO \| EXPIRADO \| INATIVO`, `isSelectableWithoutAdmin()`. Mesma regra de expiração nos dois lados (sem clock skew). |
| `app/api/ops/terminal/lock/route.ts` | POST — reserva o terminal para `deviceId` (concede se livre/meu/expirado via `updateMany` condicional atômico). Ocupado fresco por outro → 409. `force` (admin/gerente) assume. Falha de infra → 200 `degraded`. |
| `app/api/ops/terminal/heartbeat/route.ts` | POST — atualiza `heartbeatAt` só se o lock ainda é do `deviceId`. Lock perdido → 409 `lost`. Falha → 200 `degraded`. |
| `app/api/ops/terminal/unlock/route.ts` | POST — libera o próprio lock (`deviceId`) ou força (admin/gerente). Idempotente. Falha → 200 `degraded`. |

### Alterados

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `PdvTerminal` + `lockedByDeviceId`, `lockedByOperador`, `lockedAt`, `heartbeatAt` (todos nullable) + `@@index([storeId, heartbeatAt])`. **Aditivo/backward-compatible.** |
| `app/actions/terminais.ts` | `listTerminais(storeId, deviceId?)` retorna `lock` (status computado server-side, `lockedByOperador`, `heartbeatAt`, `lockedAt`, `isMine`). `setTerminalStatus` **limpa o lock** ao desativar. |
| `lib/pdv-terminal.ts` | + `lockTerminal`/`heartbeatTerminal`/`unlockTerminal` (client) + hook `useTerminalHeartbeat` (adquire ao montar, bate heartbeat a cada 30s, detecta perda, libera no unmount/`beforeunload` via `sendBeacon`). |
| `components/dashboard/vendas/terminal-selector.tsx` | UI lock-aware: badges Livre/Em uso (aqui)/Em uso/Offline/Inativo + "último sinal HH:MM"; **"Usar"** garante o lock antes de entrar; **bloqueia** terminal ocupado; **"Assumir"/"Liberar"** (admin/gerente) com `AlertDialog` de confirmação; auto-refresh 20s. |
| `app/dashboard/vendas/vendas-page-client.tsx` | Monta o keeper (`useTerminalHeartbeat`); **bloqueia** o PDV com painel "Controle do PDVx perdido" (Tentar reassumir / Selecionar outro) quando o lock é perdido; banner âmbar quando `degraded`. |

> **Nota de git:** durante esta sessão um commit externo (`ad19903`) capturou parte
> dos arquivos da Fase 2 já no HEAD (`prisma/schema.prisma`, `lib/pdv-terminal-lock.ts`,
> `app/actions/terminais.ts`); o restante (rotas, hook client, UI) permanece no working
> tree. Tudo consistente em disco — `tsc`/`build` passam. Nenhum commit foi feito por
> esta tarefa.

## 3. Modelo de lock

```prisma
model PdvTerminal {
  // ... Fase 1 (code, name, status) ...
  lockedByDeviceId String?   // deviceId do navegador dono do terminal
  lockedByOperador String?   // rótulo do operador (exibição)
  lockedAt         DateTime? // quando o lock atual foi adquirido
  heartbeatAt      DateTime? // último sinal de vida
  @@index([storeId, heartbeatAt])
}
```

**Estados (computados, não persistidos):**

| Status | Condição | Pode usar? |
|---|---|---|
| `LIVRE` | sem lock | Sim |
| `EM_USO` | lock é deste device | Sim (continuar) |
| `OCUPADO` | lock de outro device + heartbeat fresco (< 120s) | Não (só admin "Assumir") |
| `EXPIRADO` | lock de outro device + heartbeat velho (≥ 120s) | Sim (assume sem admin) |
| `INATIVO` | terminal desativado | Não (ativar antes) |

## 4. Concorrência / segurança

- **Atomicidade:** a concessão usa `updateMany` com `WHERE` condicional (livre OR meu
  OR `heartbeatAt < cutoff`). Dois devices simultâneos: **só um** tem `count === 1`; o
  outro recebe 409 "ocupado". Não há janela de corrida lógica.
- **Expiração:** `heartbeatAt < now − 120s` ⇒ EXPIRADO ⇒ assumível sem admin. PC
  travado/fechado libera o terminal em ~2 min (4 batidas de folga).
- **Liberação ao sair:** unmount do PDV / `beforeunload` → `unlock` (via `sendBeacon`,
  `storeId` na query pois beacon não envia header).
- **Permissão:** `lock`/`heartbeat`/`unlock` exigem `p.hubs.vendas`. `force`
  (Assumir/Liberar) exige `p.pdv.cancelarVenda` (= admin/gerente; caixa/vendedor não).
- **Multi-loja:** todas as queries são scoped por `storeId` (header `x-assistec-loja-id`).

## 5. Degradação (não bloquear operação)

- Rotas retornam `200 { degraded: true }` em erro de infra (coluna/tabela ausente, DB
  fora). O client trata `degraded` como "concedido com aviso" → banner âmbar, PDV opera
  sem trava. Mesma filosofia da Fase 1.
- Erros inesperados na aquisição (404/permissão) também degradam (não travam venda).
- `listTerminais` segue protegido por `withPrismaSafe` (→ `[]` → "Continuar sem terminal").

## 6. Validação

| Comando | Resultado |
|---|---|
| `npx prisma generate` | ✅ Client gerado |
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ OK — rotas `/api/ops/terminal/{lock,heartbeat,unlock}` registradas |
| `npx prisma db push` | ✅ "in sync" — aditivo (4 colunas nullable + índice), seguro |
| Smoke DB | ✅ colunas de lock consultáveis (`findMany select`) |

## 7. Testes (roteiro do goal — status)

> Lógica implementada e compilando; fluxos de 2 devices exigem conferência em runtime
> (`npm run dev` + 2 navegadores/perfis, pois o lock é por `deviceId` em localStorage).

1. Abrir `/dashboard/vendas` no navegador A → gate de terminal. ✅
2. Selecionar PDV1 → `lock` concede → entra no PDV. ✅ (impl.)
3. PDV1 fica OCUPADO (heartbeat a cada 30s mantém vivo). ✅ (impl.) — runtime.
4. Abrir navegador B (outro `deviceId`). ✅
5. Tentar PDV1 em B → "Em uso" bloqueado (botão desabilitado; só admin "Assumir"). ✅ (impl.) — runtime.
6. Selecionar PDV2 em B → concede → usa normal. ✅ (impl.) — runtime.
7. Heartbeat expirado (fechar A; esperar 120s) → PDV1 vira "Offline/EXPIRADO" → B usa sem admin. ✅ (impl.) — runtime.
8. Assumir/Liberar (admin/gerente) com `AlertDialog` de confirmação. ✅ (impl.) — runtime.
9. Venda após lock válido (Fase 1 intacta: caixa por terminal, venda no payload). ✅ — runtime.
10. Riscos restantes → §9. ✅

## 8. Integração preservada

- Caixa por terminal da Fase 1 (terminalId em `SessaoCaixa`/`Venda.payload`) intacto.
- Venda normal, **item avulso**, **desconto**, **fechamento premium**: nenhum arquivo
  de venda/caixa/estoque/financeiro core alterado nesta fase.
- `proxy.ts`, auth, sidebar, **PDV Next/Black Edition**: não tocados.
- Tokens semânticos nos 4 temas; cores de domínio (emerald/amber/destructive) só em
  estado, padrão já existente.

## 9. Riscos restantes / pendências (NÃO feitos — fora do escopo)

- **Lock não é revalidado por venda no servidor.** A trava impede o 2º device de
  *selecionar*; a perda de lock é detectada pelo heartbeat (até 30s) e **bloqueia o PDV
  inteiro**. Mas uma venda disparada na janela entre a tomada por outro device e a
  próxima batida ainda persiste (o caminho financeiro core não foi alterado de
  propósito). Hardening (checar lock no `venda-persist`) fica para fase futura.
- **Mesmo navegador, 2 abas = mesmo `deviceId`** → ambas "donas" do terminal (não há
  `BroadcastChannel` anti-aba-dupla). Plano §R2.
- **`localStorage` do caixa ainda é por `storeId`** (não por terminal) — isolamento de
  estado local entre terminais no mesmo device continua pendente (Fase 1 §7).
- **Relatórios por terminal** não implementados (fora do escopo desta fase).
- **Fallback legado sem NextAuth:** `force` (Assumir/Liberar) cai no guard de assinatura
  quando não há sessão NextAuth — nesse modo não há checagem de role. Operação real usa
  NextAuth (role aplicado).
- **`pdv-next`** segue sem gate/lock e sem persistir vendas (não usar).

## 10. Documentação

- Este relatório: `docs/ai/PDV_MULTI_TERMINAIS_FASE2_LOCK_REPORT.md`.
- `docs/ai/CURRENT_STATUS.md`: entrada "PDV Multi-Terminais — Fase 2 (lock + heartbeat)".
- `CHANGELOG.md`/`MASTER_CONTEXT.md`: incremento backward-compatible, contrato entre
  módulos inalterado — não alterados.
