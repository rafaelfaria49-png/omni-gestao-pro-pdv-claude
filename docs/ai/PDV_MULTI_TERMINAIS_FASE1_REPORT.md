# Relatório — PDV Multi-Terminais · Fase 1 (Cadastro + Seleção)

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Solicitante: Rafael Faria
> Plano de arquitetura: [`PDV_MULTI_TERMINAIS_ARCHITECTURE_PLAN.md`](./PDV_MULTI_TERMINAIS_ARCHITECTURE_PLAN.md)

## 1. Objetivo

Criar a base segura de **múltiplos terminais PDV por loja** (modelo supermercado:
PDV1, PDV2, PDV3, …): cadastro/listagem de terminais, seleção do terminal antes de
operar o PDV, exibição do terminal atual, e preparação de caixa/venda para receber
`terminalId` — **sem quebrar** o fluxo atual e sem implementar lock/heartbeat (que
fica para a Fase 2).

> **Nota de escopo:** o que aqui chamamos de "Fase 1" cobre o que o plano de
> arquitetura mapeia como Fase 2 (schema + CRUD) e Fase 3 (seleção). A Fase 4 do
> plano (lock/heartbeat/anti-simultâneo) **não** foi iniciada — ver §7.

## 2. Arquivos

### Novos

| Arquivo | Papel |
|---|---|
| `prisma/schema.prisma` (model `PdvTerminal`) | Modelo de terminal por loja: `id`, `storeId`, `code` (PDV1…), `name`, `status` (ACTIVE/INACTIVE), `createdAt`/`updatedAt`. `@@unique([storeId, code])`, `@@index([storeId, status])`. |
| `app/actions/terminais.ts` | Server Actions: `listTerminais` (cria PDV1/2/3 default na 1ª vez), `criarTerminal` (próximo PDVn), `setTerminalStatus` (ativar/desativar). Tudo scoped por `storeId` e protegido por `withPrismaSafe` (degrada se a tabela não existir). |
| `lib/pdv-terminal.ts` | Helpers client (`"use client"`): `getDeviceId` (UUID estável p/ Fase 2), `readSelectedTerminal`/`writeSelectedTerminal`/`clearSelectedTerminal` (persistência por loja em `@omnigestao:pdv-terminal:{storeId}`) e hook reativo `useTerminalAtivo`. |
| `components/dashboard/vendas/terminal-selector.tsx` | UI "Selecionar Terminal": cards PDV1/2/3, badge Ativo/Inativo, **Selecionar**, **Adicionar terminal**, ativar/desativar, e fallback **"Continuar sem terminal"**. |

### Alterados

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | + relação `Store.pdvTerminais`; + coluna `SessaoCaixa.terminalId` (nullable) + `@@index([storeId, terminalId, status])`; + coluna `Venda.terminalId` (nullable) + `@@index([storeId, terminalId])`. Tudo aditivo/backward-compatible. |
| `app/dashboard/vendas/vendas-page-client.tsx` | Gate de terminal: se há loja ativa e nenhum terminal selecionado, renderiza `TerminalSelector` antes do PDV; `onSkip` libera operação sem bloquear. |
| `components/dashboard/caixa/caixa-status-bar.tsx` | Exibe o **terminal atual** (badge `Monitor`+code) nos estados Caixa Fechado e Caixa Aberto; botão "Trocar" (caixa fechado) limpa a seleção e reabre o gate. |
| `components/dashboard/caixa/abertura-caixa-modal.tsx` | Envia `terminalId` (do terminal selecionado) no corpo de `POST /api/ops/caixa/abrir`. |
| `app/api/ops/caixa/abrir/route.ts` | Aceita `terminalId` (opcional) e grava em `SessaoCaixa.terminalId`, com **fallback defensivo**: se a coluna ainda não existir, reabre a sessão sem o vínculo (não quebra). |
| `lib/operations-sale-types.ts` | `SaleRecord` + `terminalId?: string`. |
| `lib/ops-upsert-venda.ts` | `SalePayload` + `terminalId?: string \| null` (Fase 1: persiste só em `Venda.payload`; a coluna `Venda.terminalId` fica preparada para a Fase 2). |
| `lib/operations-store.tsx` | `finalizeSaleTransaction` injeta `terminalId` (do terminal selecionado) no `SaleRecord` → flui para `Venda.payload.terminalId` via `venda-persist`. |

## 3. Modelo de dados

```prisma
model PdvTerminal {
  id        String   @id @default(cuid())
  storeId   String   @map("storeId")
  store     Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  code      String   @map("code")     // PDV1, PDV2, PDV3...
  name      String   @default("") @map("name")
  status    String   @default("ACTIVE") @map("status") // ACTIVE | INACTIVE
  createdAt DateTime @default(now()) @map("createdAt")
  updatedAt DateTime @updatedAt @map("updatedAt")

  @@unique([storeId, code])
  @@index([storeId, status])
  @@map("pdv_terminais")
}
// + SessaoCaixa.terminalId String? (nullable)  + @@index([storeId, terminalId, status])
// + Venda.terminalId       String? (nullable)  + @@index([storeId, terminalId])
```

**Backward-compatible:** colunas novas são nullable. Sessões/vendas anteriores ficam
`terminalId = null` ("Terminal Legacy"). Estoque continua **por loja** (compartilhado
entre terminais) — `Produto`/`MovimentacaoEstoque` inalterados.

## 4. Decisões de design (segurança / não-quebra)

- **Degradação graciosa:** as Server Actions usam `withPrismaSafe(op, fallback)` →
  se `pdv_terminais` não existir, `listTerminais` retorna `[]` e o seletor mostra
  "Continuar sem terminal". O PDV nunca quebra por causa do terminal.
- **Fallback no caixa:** `caixa/abrir` tenta gravar `terminalId`; em erro de coluna
  ausente, reabre sem o vínculo (log `warn`). Caixa sempre abre.
- **Venda sem risco no caminho financeiro:** o `terminalId` viaja no `Venda.payload`
  (o `SaleRecord` inteiro já é serializado em `payload`). **Nenhuma** escrita nova de
  coluna no `upsertVendaInTransaction` — o core de estoque/financeiro fica intacto.
- **Multi-loja preservado:** toda operação de terminal é scoped por `storeId`; o
  toggle valida `findFirst({ id, storeId })` antes de atualizar.
- **deviceId** já é gerado/persistido (`@omnigestao:deviceId`) para a Fase 2 usar em
  lock/heartbeat, mas **não** é enviado/validado ainda nesta fase.

## 5. Validação

| Comando | Resultado |
|---|---|
| `npx prisma generate` | ✅ Client gerado (v6.19.3) |
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ Build concluído (prisma generate + Next build), tabela de rotas gerada |
| `npx prisma db push` | ✅ "Your database is now in sync" — aditivo, **autorizado pelo usuário**; sem `--accept-data-loss` |
| Smoke DB | ✅ `prisma.pdvTerminal.count()` → 0 (tabela consultável; defaults criados sob demanda) |

## 6. Testes (roteiro do goal — status)

> tsc/build/db-push verificados automaticamente. Os fluxos de UI abaixo são roteiro de
> conferência no navegador (servidor `npm run dev` + DB). A lógica está implementada e
> compilando; a marcação indica o que é verificável só em runtime.

1. Abrir PDV sem terminal selecionado → exibe "Selecionar Terminal". ✅ (gate)
2. Selecionar PDV1 → persiste em localStorage + PDV abre. ✅ (impl.)
3. Abrir caixa no PDV1 → `terminalId` enviado ao `caixa/abrir` e gravado na `SessaoCaixa`. ✅ (impl.) — conferir runtime.
4. Outro navegador/dispositivo seleciona PDV2 → seleção é por device (localStorage). ✅ (impl.) — conferir runtime.
5. Adicionar PDV4 → `criarTerminal` cria o próximo PDVn. ✅ (impl.) — conferir runtime.
6. Terminal atual no PDV → badge na `CaixaStatusBar` (fechado e aberto). ✅ (impl.)
7. Venda com terminal selecionado → `terminalId` em `Venda.payload`. ✅ (impl.) — conferir runtime.
8. Compatibilidade venda/caixa → sem terminal, fluxo idêntico ao atual (campos nullable). ✅
9. Filtros/relatórios por terminal → **não** nesta fase (ver §7). ⛔ Fase 2.
10. Pendências Fase 2 documentadas → §7. ✅

## 7. Pendências — Fase 2 (documentadas, NÃO implementadas)

- **Lock / Heartbeat / anti-simultâneo:** dois computadores ainda podem selecionar o
  mesmo terminal. `deviceId` já existe mas não há `/api/ops/terminal/{lock,heartbeat,unlock}`
  nem estados "Ocupado/Fantasma" nem liberação por PIN. (Plano §3.4.)
- **Caixa/venda 100% por terminal:** `terminalId` é gravado em `SessaoCaixa` e no
  `Venda.payload`, mas a **coluna** `Venda.terminalId` ainda não é escrita; a
  reconciliação de sessão no bootstrap e o fechamento ainda filtram por janela
  temporal/loja, não por terminal. (Plano §3.5/§3.6.)
- **Relatórios por terminal + consolidado:** sem `GET /api/ops/caixa/consolidado` e
  sem UI "PDV1 / PDV2 / PDV3 + consolidado da loja". Visão atual permanece consolidada
  da loja. (Plano §3.7.)
- **`localStorage` do caixa por terminal:** ainda é `omnigestao:caixa:{storeId}` (sem
  `terminalId` na chave) — isolamento real de estado entre terminais no mesmo device
  fica para a Fase 2. (Plano §3.5.)
- **PDV Black Edition (`/dashboard/pdv-next`):** o gate de terminal foi adicionado no
  PDV principal (`/dashboard/vendas` → Clássico/Assistência/Supermercado). O pdv-next
  **não** recebeu o gate e segue **sem persistir vendas** (pendência pré-existente —
  não usar para operação real).
- **Limite de terminais por plano** (Bronze/Prata/Ouro): não há guard de quantidade.

## 8. Escopo e áreas protegidas

- **Schema (`prisma/schema.prisma`)** foi alterado **com autorização explícita** do
  goal ("se precisar schema, criar de forma backward-compatible"). Mudança 100%
  aditiva; `db push` autorizado pelo usuário nesta sessão.
- **Não** foram tocados: `auth.ts`, `auth.config.ts`, `proxy.ts`, `lib/prisma.ts`,
  `next.config.mjs`, `tsconfig.json`, `lib/financeiro/*`, `lib/operacoes/*`, `AppShell`.
- Arquivos **fora do escopo** que já estavam modificados no working tree no início da
  sessão (trabalho anterior "Goal 10 — Vendas HUB Correção Operacional": `app/api/vendas/[id]/route.ts`,
  `components/dashboard/vendas/vendas-arquivo-geral.tsx`, `app/api/vendas/[id]/corrigir/`,
  `docs/ai/VENDAS_HUB_CORRECAO_OPERACIONAL_REPORT.md`, e a entrada respectiva em
  `docs/ai/CURRENT_STATUS.md`) **não** foram alterados por esta tarefa.
- Tokens visuais semânticos preservados; cores de domínio (emerald/amber) usadas só
  em estados (ativo/aviso), no padrão já existente da `CaixaStatusBar`.

## 9. Documentação

- `docs/ai/CURRENT_STATUS.md`: adicionada entrada "PDV Multi-Terminais — Fase 1".
- Este relatório: `docs/ai/PDV_MULTI_TERMINAIS_FASE1_REPORT.md`.
- `CHANGELOG.md` / `MASTER_CONTEXT.md`: a feature é incremental e backward-compatible;
  o contrato entre módulos não mudou (campos nullable) — não alterados.
