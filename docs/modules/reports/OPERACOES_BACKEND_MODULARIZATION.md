# Operações — Modularização segura do backend operacional

**Data:** 2026-05-07  
**Escopo:** reorganização interna do backend operacional (Server Actions), **sem alterar comportamento**.  
**Regras:** sem feature nova, sem mudar assinatura pública, sem mexer em Prisma schema, sem alterar UX.

---

## 1) Problema

`app/actions/operacoes.ts` vinha concentrando responsabilidades demais:

- parsing/hidratação do payload JsonB
- normalização de status (status granular no payload vs enum Prisma)
- helpers de timeline
- merge/validação de patch de payload
- sync financeiro idempotente (OS → `ContaReceberTitulo`)

Isso aumenta risco de regressão e dificulta revisão/manutenção.

---

## 2) Nova estrutura criada

Criado o diretório:

- `lib/operacoes/services/`

Arquivos:

- `os-helpers.ts`
  - `isRecord`, `nowIso`, `asOperacoesPayload`
- `hydration-service.ts`
  - `hydrateOSRows` (hidrata rows Prisma em payload consumido pelo HUB)
- `payload-service.ts`
  - `validatePatchIdentifiers`, `computeEffectiveOperacaoStatus`, `mergePayload`
- `timeline-service.ts`
  - `makeTimelineEvent`, `appendTimelineEvent` (append direto no Prisma, sem recursão)
- `status-service.ts`
  - `toPrismaStatus` (wrapper de conversão para enum Prisma)
- `financeiro-sync-service.ts`
  - `shouldSyncFinanceiroFromPatch`, `syncFinanceiroAfterOSPayloadUpdate`

---

## 3) O que saiu de `app/actions/operacoes.ts`

Sem mudar as Server Actions públicas (`listOS`, `createOS`, `updateOSStatus`, `updateOSPayload`):

- **Helpers de parsing/tempo** → `os-helpers.ts`
- **Hidratação do `listOS`** → `hydration-service.ts`
- **Validação e merge do patch** → `payload-service.ts`
- **Timeline event builder + append** → `timeline-service.ts`
- **Conversão status → Prisma enum** → `status-service.ts`
- **Bloco de sync financeiro** (guard + try/catch + timeline) → `financeiro-sync-service.ts`

`app/actions/operacoes.ts` agora atua como **orquestrador**, chamando serviços.

---

## 4) Comportamento preservado (garantias)

- **Sem alteração de assinatura** das Server Actions.
- **Mesma semântica de parsing** do payload (continua exigindo `id`, `codigo`, `storeId`).
- **Mesma regra de normalização de status** (preserva granularidade no payload).
- **Mesmo comportamento do sync financeiro**:
  - upsert idempotente quando `faturamentoPendente=true` e `status="pendente"`
  - cancelamento idempotente quando cancelado/recusado
  - falha vira evento `financeiro_sync_erro` na timeline
  - append na timeline não recursa (update direto Prisma)

---

## 5) Higiene

- Adicionado `tsconfig.tsbuildinfo` ao `.gitignore` (artefato de build; não deve compor commits de feature).

---

## 6) Próximos passos (futuro)

- Consolidar testes (mínimos) para:
  - hidratação de payload antigo (fallback) vs payload completo
  - idempotência do sync financeiro (duas aprovações → um título)
- Se necessário, extrair ainda mais responsabilidades (ex.: `nextCodigo`, `createOS` builder) mantendo comportamento.

