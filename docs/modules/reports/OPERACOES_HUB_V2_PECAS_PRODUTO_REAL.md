# Operações HUB V2 — Padronização de peças com `Produto.id` real

## Problema

O Operações HUB V2 permite adicionar peças/produtos no orçamento (`payload.orcamento.pecas`) e também diretamente na OS (`payload.pecas`). Parte dessas peças vem de seeds/mock ou inserção manual, e não carrega um identificador real do catálogo.

Como consequência, o adapter **OS → Estoque real** (`lib/operacoes/adapters/os-estoque.ts`) pode **ignorar** itens que não conseguem ser resolvidos para um `Produto` real (Prisma), reduzindo a cobertura do consumo real de estoque (que roda apenas quando a OS vira `entregue`).

## Objetivo

Garantir que **sempre que a peça vier do catálogo real (Cadastros/Prisma)**, o payload persista um `produtoId` real, sem quebrar:

- peças antigas (legado)
- mocks e seeds
- fallback por SKU
- fluxo atual (sem baixar estoque nesta etapa)

## Mudanças (campos novos e compatibilidade)

### `PecaUsada` (payload)

Campos adicionados (opcionais):

- `produtoId?: string` — **novo padrão** para vínculo com Produto real
- `barcode?: string` — código de barras do Produto (`ProdutoDTO.barras`)
- `produtoOrigem?: "prisma" | "mock" | "manual"` — trilha leve de origem
- `custoUnitario?: number` — custo quando disponível no catálogo real

Compatibilidade:

- `id` continua existindo e permanece sendo o **id da linha** no orçamento/OS (ou legado).
- O adapter de estoque mantém **fallback por SKU** e ainda tenta resolver por `id` (legado).

### `PecaEstoque` (mock/estoque local)

Campos opcionais adicionados:

- `produtoId?: string`
- `barcode?: string`
- `origem?: "prisma" | "mock"`

Sem impacto obrigatório: mocks antigos continuam válidos.

## Normalização centralizada

Criado helper em `components/operacoes/lovable/utils/pecas-normalization.ts`:

- `normalizePecaUsada`
- `normalizePecasUsadas`
- `inferProdutoIdFromPeca`
- `isPecaComProdutoReal`
- `getPecaIdentityLabel`

Regra: antes de persistir no payload, a peça é normalizada para:

- preservar `id` legado
- garantir `produtoId` quando presente
- normalizar `sku`/`barcode` (trim/undefined)
- definir `produtoOrigem` (default: `prisma` quando `produtoId` existe; senão `mock`)

## Integração no fluxo (pontos de persistência)

### Orçamento (`payload.orcamento.pecas`)

Em `components/operacoes/lovable/components/operacoes/OrcamentoPanel.tsx`, ao adicionar produto do catálogo real:

- preenche `produtoId = ProdutoDTO.id`
- preserva `sku` e `barcode`
- marca `produtoOrigem = "prisma"`

Em `components/operacoes/lovable/api/os.ts`, no `salvarOrcamento(...)`:

- normaliza `orcamento.pecas` antes de persistir via `updateOSPayload`

### Peças diretas da OS (`payload.pecas`)

Em `components/operacoes/lovable/api/os.ts`, no `addPecaFromEstoque(...)`:

- normaliza a peça antes de salvar
- timeline metadata passa a incluir `produtoId` e `sku` quando existirem

## Impacto no adapter de estoque

Sem alteração de regra de negócio (continua rodando só em `entregue`), mas com compatibilidade:

- `lib/operacoes/adapters/os-estoque.ts` agora tenta resolver por `peca.produtoId` **antes** de tentar por `peca.id` (legado), mantendo o **fallback por SKU**.

Isso melhora a taxa de match quando o payload já estiver padronizado.

## UX (leve)

No `OrcamentoPanel`, a lista de peças exibe um badge discreto:

- **Produto real** quando `produtoOrigem === "prisma"`
- **Mock/manual** caso contrário

## Próximos passos (sugeridos)

- Normalizar também os pontos de criação de peças fora do orçamento quando houver seleção de Produto real (se/onde existir na UI).
- Expandir `inferProdutoIdFromPeca` para heurísticas adicionais (ex.: barcode/SKU lookup client-side) se necessário, sem quebrar o backend.

