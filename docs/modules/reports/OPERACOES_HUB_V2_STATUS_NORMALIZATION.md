# Operações HUB V2 — Normalização segura de status (sem migration)

Data: 2026-05-07  
Escopo: implementação **sem alterar o schema Prisma**, sem migrations e sem redesign de UI.  
Objetivo: **preservar granularidade operacional** do HUB V2 sem quebrar o modelo atual (Prisma enum com 4 estados).

## Problema

- O **Operações HUB V2** usa um pipeline operacional com mais estados (ex.: `diagnostico`, `aguardando_aprovacao`, `em_execucao`).
- O Prisma enum `StatusOrdemServico` tem apenas 4 estados: `Aberto`, `EmAnalise`, `Pronto`, `Entregue`.
- Ao persistir a OS, múltiplos estados do HUB colapsam em `EmAnalise`, perdendo granularidade e gerando risco futuro para:
  - filtros/dashboards
  - timeline/auditoria
  - automations/eventos
  - integrações (financeiro/estoque/WhatsApp)

## Solução aplicada (camada canônica local)

Foi criada uma camada canônica no HUB:

- `components/operacoes/lovable/utils/os-status.ts`

Ela define:
- **Status canônico operacional**: `OperacaoStatusCanonico` (equivalente ao `OSStatus` do HUB)
- **Metadados**: label, descrição, ordem, classe de badge, se é final
- **Transições permitidas**: regra conservadora (avança na ordem ou cancela; não sai de estado final)
- **Helpers**:
  - `normalizeOperacaoStatus`
  - `operacaoStatusToPrismaStatus`
  - `prismaStatusToOperacaoStatus`
  - `getOperacaoStatusLabel`
  - `getOperacaoStatusMeta`
  - `canTransitionOperacaoStatus`
  - `isFinalOperacaoStatus`

## Mapeamento HUB → Prisma (colapso seguro)

- `aberta` → `Aberto`
- `diagnostico` → `EmAnalise`
- `aguardando_aprovacao` → `EmAnalise`
- `em_execucao` → `EmAnalise`
- `pronta` → `Pronto`
- `entregue` → `Entregue`
- `cancelada` → `Aberto` *(limitação atual: Prisma não tem “Cancelada”)*

## Mapeamento Prisma → HUB (fallback)

Quando não existir `payload.operacaoStatus`, convertemos de forma defensiva:

- `Aberto` → `aberta`
- `EmAnalise` → `diagnostico` *(fallback padrão; granularidade não existe no enum Prisma)*
- `Pronto` → `pronta`
- `Entregue` → `entregue`

## Preservação da granularidade no payload

Sem mudar Prisma, a granularidade passa a ficar no payload:

- `payload.operacaoStatus`: status operacional completo do HUB

Regras:
- Ao **escrever** status pelo HUB, sempre gravar:
  - `status` (HUB) = status canônico
  - `operacaoStatus` (payload) = status canônico
  - `status` (Prisma enum) = mapeamento colapsado compatível
- Ao **ler** OS do Prisma:
  - preferir `payload.operacaoStatus` → normalizar
  - fallback em `payload.status` → normalizar
  - fallback final em `status` Prisma → converter

## Pontos ajustados (leitura e escrita)

### Escrita (Hub)

- `components/operacoes/lovable/api/os.ts`
  - `moveStatus(...)` normaliza antes de persistir e mantém evento coerente na timeline
  - `criarOS(...)` passa `operacaoStatus` na criação

### Escrita (Server Actions / Prisma)

- `app/actions/operacoes.ts`
  - `createOS`: garante `payload.operacaoStatus`
  - `updateOSStatus`: grava `payload.status` e `payload.operacaoStatus` e persiste status Prisma colapsado
  - `updateOSPayload`: se receber patch com `status/operacaoStatus`, normaliza e garante consistência no payload

### Leitura (Server Actions)

- `app/actions/operacoes.ts` (`listOS`)
  - sempre devolve `status` e `operacaoStatus` coerentes para o HUB, mesmo que o payload antigo não tenha `operacaoStatus`

## Riscos resolvidos

- O HUB deixa de depender do `StatusOrdemServico` Prisma para manter o pipeline detalhado.
- Evita quebra futura de filtros e dashboards por perda de granularidade no enum Prisma.
- Mantém compatibilidade com OS antigas (sem payload) via fallback seguro.

## Riscos remanescentes

- `cancelada` continua sem representação no enum Prisma (fica colapsado em `Aberto` até evolução do schema).
- Sistemas externos que leem apenas `ordemServico.status` (Prisma) ainda verão o colapso (por design nesta fase).

## Próximos passos (futuro)

- Avaliar evolução do schema Prisma:
  - expandir enum (ou criar campo adicional) para estados operacionais granulares
  - opcional: tabela de eventos/timeline para auditoria forte (evitar JsonB crescer indefinidamente)
- Unificar o conceito de OS entre HUB V2 e OS clássica (fonte de verdade única).

