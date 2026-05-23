# PDV Multi-Terminais — Plano de Arquitetura

> **Data:** 23 Mai 2026
> **Fase:** Auditoria + Planejamento (somente leitura — nenhuma mudança destrutiva)
> **Autor:** Claude Opus 4.6
> **Solicitante:** Rafael Faria

---

## 1. Resumo Executivo

O OmniGestão Pro atualmente opera com a premissa de **um único terminal PDV por loja**.
Múltiplos computadores podem abrir o mesmo PDV/sessão simultaneamente, causando:

- Sessões de caixa duplicadas no servidor
- Estado local (localStorage) conflitante entre máquinas
- Impossibilidade de auditoria por terminal
- Fechamento de caixa com totais inconsistentes

Este documento propõe uma arquitetura profissional de **múltiplos terminais por loja**
(modelo supermercado: PDV1, PDV2, …, PDV5+), com:

- Registro e seleção de terminais
- Lock/heartbeat para impedir uso simultâneo
- Sessão de caixa vinculada ao terminal
- Fechamento consolidado por loja
- Compatibilidade com os 4 PDVs existentes
- Migração não-destrutiva

---

## 2. Auditoria do Estado Atual

### 2.1 Modelos Prisma Envolvidos

| Modelo | Papel | Campo `storeId` | Campo terminal |
|--------|-------|:---:|:---:|
| `SessaoCaixa` | Sessão de caixa (aberta/fechada) | ✅ | ❌ |
| `CaixaOperacao` | Sangria, suprimento, devolução | ✅ | ❌ |
| `Venda` | Registro de venda persistido | ✅ | ❌ (sessaoId só no `payload` JSON) |
| `ItemVenda` | Linhas da venda | via Venda | ❌ |
| `DevolucaoVenda` | Devoluções/trocas | ✅ | `sessaoId` FK (nullable) |
| `MovimentacaoFinanceira` | Ledger financeiro | ✅ | ❌ |
| `MovimentacaoEstoque` | Ledger de estoque | ✅ | ❌ |
| `ClienteCredito` | Crédito/vale do cliente | ✅ | ❌ |
| `Produto` | Catálogo + saldo de estoque | ✅ | — (compartilhado) |

**Conclusão:** Nenhum modelo possui conceito de `terminalId`. Tudo é scoped por `storeId` apenas.

### 2.2 State Zustand (`lib/operations-store.tsx`)

```
CaixaState {
  isOpen: boolean
  saldoInicial: number
  dataAbertura: Date | null
  totalEntradas: number
  totalSaidas: number
}
```

- **localStorage key:** `omnigestao:caixa:{storeId}` — **sem terminal no nome**
- `caixaSessaoId`: string | null — um único ID por provider
- Reconciliação no mount: `GET /api/ops/caixa/sessoes?status=ABERTA&take=1`
  - Busca **uma** sessão aberta → assume terminal único

### 2.3 APIs de Caixa

| Rota | Método | Problema Multi-terminal |
|------|--------|------------------------|
| `/api/ops/caixa/abrir` | POST | Cria sessão sem verificar se já existe outra aberta na mesma loja |
| `/api/ops/caixa/fechar` | POST | Fecha por `sessaoId` — OK, mas totais calculados por `createdAt BETWEEN` podem incluir vendas de outro terminal |
| `/api/ops/caixa/sessoes` | GET | `take=1` na reconciliação — ignora múltiplas sessões |
| `/api/ops/caixa/sessao-detalhe` | GET | Agrega `MovimentacaoFinanceira` por janela temporal — sem filtro de terminal |
| `/api/ops/caixa/operacao` | POST | Grava `CaixaOperacao` — sem terminal |

### 2.4 Fluxo de Venda (`finalizeSaleTransaction`)

1. Valida `caixa.isOpen` (estado local)
2. Captura `sessaoId: current.caixaSessaoId` (pode ser null)
3. Cria `SaleRecord` no localStorage com `sessaoId` embutido
4. Fire-and-forget `POST /api/ops/venda-persist`
5. Server: `upsertVendaInTransaction` grava `Venda` + `ItemVenda` + estoque + financeiro
6. `sessaoId` é gravado **apenas dentro de `Venda.payload` (JSON)**, não como FK indexada

### 2.5 PDV Variants

| Variante | Rota | Componente | Caixa |
|----------|------|-----------|-------|
| **Clássico** | `/dashboard/vendas` | `pdv-classic.tsx` | `useCaixa()` compartilhado |
| **Assistência** | `/dashboard/vendas` (nested) | `pdv-assistencia-enterprise.tsx` | Via Classic wrapper |
| **Supermercado** | `/dashboard/vendas` | `pdv-supermercado.tsx` | `useCaixa()` compartilhado |
| **Black Edition** | `/dashboard/pdv-next` | `PdvBlackEdition.tsx` | Próprio `useCaixa()` — **NÃO persiste vendas** |

Seleção via `localStorage["@omnigestao:pdv-layout"]` → `classic | supermercado | next`.

### 2.6 Pontos Onde o Sistema Assume Terminal Único

| Local | Arquivo | Linha/Padrão | Problema |
|-------|---------|-------------|----------|
| Reconciliação de sessão | `lib/operations-store.tsx` | `?status=ABERTA&take=1` | Pega apenas 1 sessão, ignora outras |
| localStorage do caixa | `lib/operations-store.tsx` | `omnigestao:caixa:{storeId}` | Sem terminal na chave — dois PCs colidem |
| Abertura de caixa | `/api/ops/caixa/abrir` | Sem guard de sessão existente | Permite N sessões abertas sem aviso |
| Fechamento totais | `/api/ops/caixa/fechar` | `MovimentacaoFinanceira WHERE createdAt BETWEEN` | Janela temporal pode capturar vendas de outro terminal |
| Sessão na venda | `lib/ops-upsert-venda.ts` | `sessaoId` no payload JSON | Não é FK, não filtrável por query |
| UI de abertura | `abertura-caixa-modal.tsx` | Sem seleção de terminal | Abre "o caixa da loja" sem especificar qual |

---

## 3. Arquitetura Proposta

### 3.1 Novos Modelos Prisma

```prisma
model PdvTerminal {
  id          String   @id @default(cuid())
  storeId     String
  store       Store    @relation(fields: [storeId], references: [id])
  numero      Int                          // 1, 2, 3, 4, 5...
  nome        String                       // "PDV 1", "Caixa Principal", etc.
  ativo       Boolean  @default(true)      // desativado = não aparece na seleção
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Lock fields
  lockedBy    String?                      // deviceId (UUID gerado no browser)
  lockedByUser String?                     // operador que travou
  lockedAt    DateTime?                    // quando foi travado
  heartbeatAt DateTime?                    // última prova de vida

  // Relations
  sessoes     SessaoCaixa[]
  vendas      Venda[]

  @@unique([storeId, numero])              // PDV 1 é único por loja
  @@index([storeId, ativo])
  @@map("pdv_terminais")
}
```

**Alterações em modelos existentes:**

```prisma
model SessaoCaixa {
  // ... campos existentes ...
  terminalId  String?                      // FK → PdvTerminal (nullable para migração)
  terminal    PdvTerminal? @relation(...)
  @@index([storeId, terminalId, status])   // novo índice composto
}

model Venda {
  // ... campos existentes ...
  terminalId  String?                      // FK → PdvTerminal
  sessaoId    String?                      // promover de payload para coluna indexada
  terminal    PdvTerminal? @relation(...)
  @@index([storeId, terminalId])
  @@index([sessaoId])
}
```

### 3.2 DeviceId — Identificação do Computador

Cada navegador/computador gera um `deviceId` UUID persistido em `localStorage`:

```
localStorage["@omnigestao:deviceId"] = crypto.randomUUID()
```

- Gerado uma vez, reutilizado sempre
- Enviado em **todo request** de caixa/venda via header `x-omnigestao-device-id`
- Gravado em `PdvTerminal.lockedBy` quando o terminal é reservado

### 3.3 Fluxo de Seleção de Terminal

```
┌────────────────────────────────────────────────┐
│  Operador acessa /dashboard/vendas             │
│  ou /dashboard/pdv-next                        │
└───────────────┬────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│  Verificar: este device já tem terminal ativo? │
│  localStorage["@omnigestao:terminalId:{store}"]│
│  + validar lock no servidor                    │
└───────────────┬────────────────────────────────┘
                │
        ┌───────┴───────┐
        │ SIM           │ NÃO
        ▼               ▼
┌──────────────┐ ┌──────────────────────────────┐
│ Abrir PDV    │ │ Modal "Selecionar Terminal"   │
│ diretamente  │ │                              │
│ (terminal    │ │ ┌──────┬──────┬──────┬─────┐ │
│  já vinculado│ │ │PDV 1 │PDV 2 │PDV 3 │PDV 4│ │
│  e lock OK)  │ │ │Livre │Ocup. │Livre │Livre│ │
│              │ │ │  ●   │  🔒  │  ●   │  ●  │ │
│              │ │ └──────┴──────┴──────┴─────┘ │
│              │ │                              │
│              │ │ [Selecionar]                 │
│              │ │ PDV Ocupado: "Em uso por     │
│              │ │  Maria (PC-Balcão) desde     │
│              │ │  08:05" — botão Admin        │
│              │ │  "Liberar Terminal" (PIN)    │
└──────────────┘ └──────────────────────────────┘
```

### 3.4 Lock / Heartbeat

**Reservar terminal:**
```
POST /api/ops/terminal/lock
Body: { terminalId, deviceId }
Response: { ok: true, terminal, sessaoAberta? }
```

- Server valida: terminal existe, `ativo=true`, pertence à loja
- Se `lockedBy` é null ou heartbeat expirou (>5min): aceita lock
- Se `lockedBy` === deviceId atual: renova (mesmo PC)
- Se `lockedBy` !== deviceId e heartbeat válido: rejeita (409 "Terminal ocupado")
- Grava `lockedBy`, `lockedByUser`, `lockedAt`, `heartbeatAt`

**Heartbeat:**
```
POST /api/ops/terminal/heartbeat
Body: { terminalId, deviceId }
```

- Client envia a cada **60 segundos** (via `setInterval`)
- Server atualiza `heartbeatAt` se `lockedBy === deviceId`
- Se heartbeat não chega em 5 minutos, terminal é considerado "fantasma"

**Liberar terminal:**
```
POST /api/ops/terminal/unlock
Body: { terminalId, deviceId?, adminPin? }
```

- Se `deviceId` === `lockedBy`: libera normalmente (operador saindo)
- Se `adminPin` válido: libera forçado (admin liberando terminal travado)
- Limpa `lockedBy`, `lockedByUser`, `lockedAt`, `heartbeatAt`

### 3.5 Caixa por Terminal

**Abertura:**
- `POST /api/ops/caixa/abrir` ganha campo `terminalId` (obrigatório)
- Server verifica: não existe `SessaoCaixa WHERE terminalId AND status=ABERTA`
- Guard: se já existe sessão aberta neste terminal, retorna 409

**Fechamento:**
- `POST /api/ops/caixa/fechar` mantém por `sessaoId` (inalterado)
- Server calcula `totalVendasServer` filtrando por:
  ```sql
  MovimentacaoFinanceira
  WHERE storeId = ? AND origem = 'venda'
  AND createdAt BETWEEN sessao.abertaEm AND NOW()
  -- Novo: filtro adicional por sessaoId (quando Venda tiver a coluna)
  ```

**Reconciliação no mount:**
- Muda de `?status=ABERTA&take=1` para:
  ```
  GET /api/ops/caixa/sessoes?status=ABERTA&terminalId={terminalId}
  ```
- Só recupera a sessão do **seu** terminal

**localStorage:**
- Chave muda de `omnigestao:caixa:{storeId}` para:
  ```
  omnigestao:caixa:{storeId}:{terminalId}
  ```
- Cada terminal tem estado completamente isolado

### 3.6 Venda Vinculada ao Terminal

`finalizeSaleTransaction` passa a incluir:
```typescript
{
  ...salePayload,
  terminalId: current.terminalId,  // novo
  sessaoId: current.caixaSessaoId, // já existe
}
```

`upsertVendaInTransaction` grava:
- `Venda.terminalId` (nova coluna FK)
- `Venda.sessaoId` (promovida de payload para coluna indexada)

### 3.7 Fechamento Consolidado da Loja

Nova funcionalidade (não existente hoje):

```
GET /api/ops/caixa/consolidado?data=2026-05-23
```

Retorna:
```json
{
  "data": "2026-05-23",
  "storeId": "loja-1",
  "terminais": [
    {
      "terminal": "PDV 1",
      "sessoes": 1,
      "totalVendas": 4520.00,
      "totalSangrias": 200.00,
      "totalSuprimentos": 100.00,
      "totalDevolucoes": 150.00,
      "saldoFinal": 4270.00
    },
    {
      "terminal": "PDV 2",
      "sessoes": 2,
      "totalVendas": 3180.00,
      "totalSangrias": 0,
      "totalSuprimentos": 0,
      "totalDevolucoes": 0,
      "saldoFinal": 3180.00
    }
  ],
  "consolidado": {
    "totalVendas": 7700.00,
    "totalSangrias": 200.00,
    "totalSuprimentos": 100.00,
    "totalDevolucoes": 150.00,
    "saldoConsolidado": 7450.00,
    "sessoesTotal": 3
  }
}
```

**UI:** Novo card/aba no Histórico de Caixa com visão consolidada por dia/loja.

### 3.8 Compatibilidade com os 4 PDVs

| PDV | Mudança Necessária |
|-----|-------------------|
| **Clássico** | Recebe `terminalId` do provider; sem mudança no fluxo de venda |
| **Assistência** | Herda do wrapper Classic — transparente |
| **Supermercado** | Recebe `terminalId` do provider; sem mudança |
| **Black Edition** | Precisa primeiro **implementar persistência de vendas** (pendência pré-existente), depois recebe `terminalId` |

Todos os PDVs compartilham `OperationsProvider` → a mudança no provider propaga automaticamente.

A tela "Selecionar Terminal" é um **gate** antes de montar qualquer PDV. O componente PDV
só renderiza após terminal selecionado e lock confirmado.

---

## 4. Proposta de UX

### 4.1 Tela "Selecionar Terminal"

```
┌─────────────────────────────────────────────────────────────┐
│  🖥️  Selecionar Terminal — Loja Principal                   │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  PDV 1  │  │  PDV 2  │  │  PDV 3  │  │  PDV 4  │       │
│  │         │  │         │  │         │  │         │       │
│  │  Livre  │  │ Ocupado │  │  Livre  │  │  Livre  │       │
│  │   ●     │  │   🔒    │  │   ●     │  │   ●     │       │
│  │         │  │ Maria   │  │         │  │         │       │
│  │         │  │ 08:05   │  │         │  │         │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                             │
│  PDV 2: Em uso por Maria desde 08:05                        │
│  [Liberar Terminal — requer PIN supervisor]                  │
│                                                             │
│                           [Selecionar Terminal]             │
└─────────────────────────────────────────────────────────────┘
```

**Estados do terminal:**

| Estado | Visual | Descrição |
|--------|--------|-----------|
| `livre` | ● verde | Sem lock, pronto para uso |
| `ocupado` | 🔒 vermelho | Lock ativo + heartbeat válido |
| `fantasma` | ⚠️ âmbar | Lock ativo mas heartbeat expirou (>5min) |
| `caixa_aberto` | 💰 azul | Terminal com sessão de caixa aberta |
| `desativado` | — cinza | Admin desativou (não aparece por default) |

### 4.2 Liberação Forçada (Admin)

- Operador vê terminal "Ocupado" ou "Fantasma"
- Clica "Liberar Terminal"
- Modal solicita **PIN de supervisor** (mesmo mecanismo existente de `discountAuthorizedByAdminId`)
- Server valida PIN e limpa o lock
- Terminal volta a `livre`

### 4.3 Troca de Terminal

- Operador pode trocar de terminal sem fechar caixa
- Fecha caixa no terminal atual → libera lock → seleciona novo terminal → abre caixa
- Alternativa rápida (admin): "Migrar sessão" move a sessão aberta de um terminal para outro (edge case — mover fisicamente o operador)

### 4.4 Gerenciamento de Terminais (Configurações)

Em `/dashboard/configuracoes` → seção "Terminais PDV":

- Listar terminais da loja
- Criar novo terminal (nome + número sequencial)
- Ativar/desativar terminal
- Ver status atual (livre/ocupado/caixa)
- Definir quantidade máxima de terminais por plano (Bronze=1, Prata=3, Ouro=5, Diamante=10)

---

## 5. Mapa de Arquivos Envolvidos

### 5.1 Arquivos que Precisam de Alteração

| Arquivo | Mudança | Fase |
|---------|---------|------|
| `prisma/schema.prisma` | + `PdvTerminal`, + campos em `SessaoCaixa`/`Venda` | 2 |
| `lib/operations-store.tsx` | + `terminalId` no state, localStorage key, reconciliação | 3-5 |
| `lib/operations-sale-types.ts` | + `terminalId` em `SaleRecord` | 3 |
| `lib/ops-upsert-venda.ts` | + `terminalId`/`sessaoId` como colunas | 5 |
| `app/api/ops/caixa/abrir/route.ts` | + `terminalId` obrigatório, guard de sessão duplicada | 5 |
| `app/api/ops/caixa/fechar/route.ts` | Filtro de vendas por sessão (não só por janela temporal) | 5 |
| `app/api/ops/caixa/sessoes/route.ts` | + filtro por `terminalId` | 5 |
| `app/api/ops/caixa/sessao-detalhe/route.ts` | + filtro por terminal | 5 |
| `app/api/ops/venda-persist/route.ts` | + propagar `terminalId` | 5 |
| `components/dashboard/caixa/abertura-caixa-modal.tsx` | Terminal ID injetado | 5 |
| `components/dashboard/caixa/fechamento-caixa-modal.tsx` | Sem mudança funcional (fecha por sessaoId) | — |
| `components/dashboard/vendas/pdv-classic.tsx` | Receber `terminalId` do provider | 3 |
| `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | Herda do Classic | 3 |
| `components/dashboard/vendas/pdv-supermercado.tsx` | Receber `terminalId` do provider | 3 |
| `components/pdv-next/PdvBlackEdition.tsx` | Receber `terminalId` — mas precisa persistir vendas primeiro | 3+ |

### 5.2 Arquivos Novos

| Arquivo | Propósito | Fase |
|---------|-----------|------|
| `app/api/ops/terminal/lock/route.ts` | Reservar terminal | 4 |
| `app/api/ops/terminal/heartbeat/route.ts` | Heartbeat periódico | 4 |
| `app/api/ops/terminal/unlock/route.ts` | Liberar terminal | 4 |
| `app/api/ops/terminal/route.ts` | CRUD de terminais (GET/POST) | 2 |
| `app/api/ops/caixa/consolidado/route.ts` | Fechamento consolidado por dia | 6 |
| `components/dashboard/vendas/terminal-selector.tsx` | UI de seleção de terminal | 3 |
| `components/dashboard/caixa/caixa-consolidado.tsx` | UI de fechamento consolidado | 6 |
| `app/actions/terminais.ts` | Server Actions para CRUD de terminais (config) | 2 |

### 5.3 Arquivos que NÃO Devem Ser Alterados

| Arquivo | Motivo |
|---------|--------|
| `auth.ts` / `auth.config.ts` | Área protegida |
| `proxy.ts` | Área protegida |
| `lib/prisma.ts` | Infraestrutura core |
| `next.config.mjs` | Infraestrutura core |
| `lib/financeiro/*` | Módulo financeiro funcional — não tocar |
| `lib/operacoes/*` | Módulo operações funcional — não tocar |

---

## 6. Riscos e Mitigações

| # | Risco | Impacto | Mitigação |
|---|-------|---------|-----------|
| R1 | Heartbeat falha por rede instável → terminal fica "fantasma" | Médio | Timeout generoso (5min) + botão admin "Liberar" com PIN |
| R2 | Dois tabs no mesmo browser = mesmo deviceId | Baixo | Aviso na UI "Terminal já aberto nesta máquina" + block por `BroadcastChannel` |
| R3 | localStorage limpo = perde deviceId + terminalId | Médio | Gerar novo deviceId; forçar re-seleção de terminal (não perde dados do server) |
| R4 | Migração: vendas históricas sem `terminalId`/`sessaoId` coluna | Baixo | Campos nullable; relatórios tratam null como "Terminal Legacy" |
| R5 | PDV Black Edition não persiste vendas | Alto | **Pré-requisito:** implementar persistência do Black Edition ANTES de multi-terminal |
| R6 | Performance do heartbeat (N terminais × 60s) | Baixo | Endpoint leve (~1 UPDATE); 5 terminais = 5 req/min por loja (trivial) |
| R7 | Estoque negativo em concorrência entre terminais | Médio | Risco **pré-existente** (já documentado). Solução futura: `SELECT FOR UPDATE` ou optimistic lock no `Produto.stock` |
| R8 | Operador abre caixa em Terminal A, muda para Terminal B sem fechar | Médio | Guard: "Você tem caixa aberto no PDV 1. Fechar antes de mudar?" |
| R9 | Conflito de `pedidoId` entre terminais | Nenhum | `pedidoId` usa `VDA-{ano}-{seq}` com counter por loja — já é seguro |
| R10 | Clock skew entre máquinas afeta janela temporal do fechamento | Baixo | Promover `sessaoId` para coluna FK elimina dependência de `createdAt BETWEEN` |

---

## 7. Plano de Implementação em Fases

### Fase 1 — Auditoria e Planejamento ✅ (esta sessão)

- [x] Auditar schema Prisma (SessaoCaixa, Venda, CaixaOperacao, etc.)
- [x] Auditar state Zustand (operations-store, caixa state)
- [x] Auditar APIs de caixa (abrir, fechar, sessões, operação)
- [x] Auditar UI de caixa (abertura, fechamento, status bar)
- [x] Auditar variantes de PDV (Classic, Assistência, Supermercado, Black Edition)
- [x] Mapear pontos de terminal único
- [x] Documentar arquitetura proposta
- [x] Documentar riscos e mitigações

### Fase 2 — Schema e Modelos (estimativa: 1 sessão)

- [ ] Criar modelo `PdvTerminal` no Prisma
- [ ] Adicionar `terminalId` nullable a `SessaoCaixa`
- [ ] Adicionar `terminalId` e `sessaoId` colunas a `Venda`
- [ ] Criar índices compostos
- [ ] Rodar migration (`db:migrate`)
- [ ] Criar Server Actions para CRUD de terminais (`app/actions/terminais.ts`)
- [ ] Criar endpoint REST para listar terminais (`app/api/ops/terminal/route.ts`)
- [ ] Seed: criar "PDV 1" default para cada loja existente
- [ ] Validar: `npx tsc --noEmit` + `npm run build`

### Fase 3 — Seleção de Terminal (estimativa: 1 sessão)

- [ ] Gerar `deviceId` no client (UUID em localStorage)
- [ ] Criar componente `TerminalSelector` (modal/tela)
- [ ] Integrar `terminalId` no `OperationsProvider` state
- [ ] Gate: PDV só renderiza após terminal selecionado
- [ ] Auto-select: se device já tem terminal vinculado + lock válido, pular seleção
- [ ] Atualizar localStorage key para incluir `terminalId`
- [ ] Validar: `npx tsc --noEmit` + `npm run build`

### Fase 4 — Lock e Heartbeat (estimativa: 1 sessão)

- [ ] Criar `POST /api/ops/terminal/lock`
- [ ] Criar `POST /api/ops/terminal/heartbeat`
- [ ] Criar `POST /api/ops/terminal/unlock`
- [ ] Implementar `setInterval` heartbeat no client (60s)
- [ ] Implementar cleanup no `beforeunload` (liberar lock)
- [ ] Implementar `BroadcastChannel` guard (anti-tab-duplo)
- [ ] UI: estado "Ocupado"/"Fantasma" no `TerminalSelector`
- [ ] UI: "Liberar Terminal" com PIN supervisor
- [ ] Validar: `npx tsc --noEmit` + `npm run build`

### Fase 5 — Caixa por Terminal (estimativa: 1 sessão)

- [ ] `POST /api/ops/caixa/abrir` → exigir `terminalId`, guard de sessão duplicada por terminal
- [ ] `GET /api/ops/caixa/sessoes` → filtro por `terminalId`
- [ ] Reconciliação no mount → filtrar por `terminalId` em vez de `take=1`
- [ ] `finalizeSaleTransaction` → incluir `terminalId` no SalePayload
- [ ] `upsertVendaInTransaction` → gravar `terminalId` e `sessaoId` como colunas
- [ ] `POST /api/ops/venda-persist` → propagar `terminalId`
- [ ] Fechamento → filtrar vendas por `sessaoId` coluna (não apenas por janela temporal)
- [ ] Validar: `npx tsc --noEmit` + `npm run build`
- [ ] Teste manual: abrir dois terminais em dois browsers, vender em ambos, fechar ambos

### Fase 6 — Fechamento Consolidado (estimativa: 1 sessão)

- [ ] Criar `GET /api/ops/caixa/consolidado?data=YYYY-MM-DD`
- [ ] UI: componente `CaixaConsolidado` no Histórico de Caixa
- [ ] KPIs por terminal + totais consolidados
- [ ] Filtros por período, terminal, operador
- [ ] Validar: `npx tsc --noEmit` + `npm run build`

### Fase 7 — Testes e Estabilização (estimativa: 1 sessão)

- [ ] Cenário: terminal A vende, terminal B vende, fechar ambos → totais corretos
- [ ] Cenário: terminal fantasma (fechar aba) → heartbeat expira → admin libera
- [ ] Cenário: mesmo operador troca de terminal
- [ ] Cenário: limpar localStorage → re-selecionar terminal
- [ ] Cenário: venda offline → sync → terminal correto
- [ ] Cenário: vendas históricas sem `terminalId` → relatórios tratam como legacy
- [ ] Cenário: PDV Black Edition (se persistência implementada)
- [ ] Teste de regressão: PDV Clássico fluxo completo (abrir → vender → fechar)
- [ ] Teste de regressão: Trocas/Devoluções
- [ ] Teste de regressão: Estoque (decremento/incremento por terminal)

---

## 8. Estratégia de Migração

### Princípios

1. **Zero downtime** — campos novos são nullable; código antigo continua funcionando
2. **Backward compatible** — vendas/sessões sem `terminalId` são tratadas como "Terminal Legacy"
3. **Progressive adoption** — loja pode usar 1 terminal (comportamento idêntico ao atual) ou N terminais
4. **Seed automático** — ao rodar migration, criar "PDV 1" para cada loja existente
5. **Backfill opcional** — script para associar sessões/vendas históricas ao "PDV 1" (se desejado)

### Ordem de Deploy

```
1. Deploy Fase 2 (schema + CRUD terminais)     ← banco atualizado, app funciona igual
2. Deploy Fase 3 (seleção de terminal)          ← UI nova, mas lojas com 1 terminal = auto-select
3. Deploy Fase 4 (lock/heartbeat)               ← proteção ativa
4. Deploy Fase 5 (caixa por terminal)           ← isolamento real
5. Deploy Fase 6 (consolidado)                  ← visão gerencial
6. Deploy Fase 7 (testes)                       ← estabilização
```

Cada fase pode ser deployed independentemente. Se uma fase quebrar, rollback afeta apenas aquela fase.

---

## 9. Integração com Planos de Assinatura

| Plano | Terminais Permitidos | Comportamento |
|-------|---------------------|---------------|
| **Bronze** | 1 | Sem tela de seleção; terminal auto-selecionado |
| **Prata** | 3 | Seleção de terminal com limite |
| **Ouro** | 5 | Seleção com gestão completa |
| **Diamante** | 10+ | Sem limite prático |

Guard server-side: `POST /api/ops/terminal` verifica `count(PdvTerminal WHERE storeId AND ativo)` contra o plano.

---

## 10. Estoque Compartilhado

**O estoque é por loja, não por terminal.** Isso está correto e deve ser mantido:

- `Produto.stock` é scoped por `storeId`
- `MovimentacaoEstoque` é scoped por `storeId`
- Todos os terminais da mesma loja compartilham o mesmo catálogo e saldo
- O risco de estoque negativo em concorrência (duas vendas simultâneas do mesmo produto) é **pré-existente** e independente desta feature

Para mitigar concorrência futura (não escopo desta fase):
- `SELECT FOR UPDATE` no `Produto.stock` durante `upsertVendaInTransaction`
- Ou optimistic locking com `version` field no `Produto`

---

## 11. Checklist de Validação (por fase)

- [ ] `npx tsc --noEmit` — 0 erros
- [ ] `npm run build` — Compiled successfully
- [ ] Auth inalterada
- [ ] Proxy inalterado
- [ ] PDV Clássico funciona (abrir caixa → vender → fechar)
- [ ] PDV Assistência funciona
- [ ] PDV Supermercado funciona
- [ ] Estoque decrementa corretamente
- [ ] Financeiro (MovimentacaoFinanceira) registra corretamente
- [ ] Trocas/Devoluções funcionam
- [ ] Multi-loja preservada (storeId em tudo)
- [ ] Histórico de Vendas legível
- [ ] Sessões históricas (sem terminalId) acessíveis

---

## 12. Conclusão

A arquitetura proposta transforma o OmniGestão de um sistema **single-terminal** para **multi-terminal por loja** usando:

- **PdvTerminal** como entidade de primeiro nível no banco
- **Lock/Heartbeat** baseado em servidor para impedir uso simultâneo
- **DeviceId** no browser para identificar máquinas
- **Sessão de caixa por terminal** para isolamento financeiro
- **Fechamento consolidado** para visão gerencial

A migração é segura (nullable, backward-compatible) e pode ser feita em fases independentes sem quebrar o fluxo de vendas atual.

**Pré-requisito crítico:** implementar persistência de vendas do PDV Black Edition antes da Fase 3 (ou excluí-lo do escopo multi-terminal inicial).
