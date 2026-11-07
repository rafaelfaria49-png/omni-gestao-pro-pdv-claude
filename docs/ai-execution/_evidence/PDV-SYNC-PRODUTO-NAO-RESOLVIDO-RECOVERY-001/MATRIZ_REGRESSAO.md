# MATRIZ_REGRESSAO — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Arquivos novos:
- `lib/ops-upsert-venda-produto-identidade.test.ts` (7) — writer com `TransactionClient` fake.
- `lib/vendas/produto-nao-resolvido-recovery.test.ts` (19) — parser, rótulos, copy, contrato estático do store.
- `lib/vendas/quarantine-recovery-produto-identidade.test.ts` (3) — preflight da quarentena com `db` fake.
- `components/dashboard/vendas/pdv-pending-sync-badge-produto-nao-resolvido.test.ts` (3) — render do banner.

| # | Cenário | Cobertura | Resultado |
|---|---|---|---|
| T01 | Produto válido da loja → venda gravada | identidade: "linha legada…", "SKU editado…" | PASS |
| T02 | Produto inexistente → erro, sem escrita econômica | identidade: "sem produtoId…", "produtoId removido…" (ledger/financeiro vazios) + `ops-upsert-venda-safety` existente | PASS |
| T03 | Produto de outra loja → falha fechada | identidade: "produtoId de OUTRA loja" | PASS |
| T04 | Renomeado/inativado → só identidade verdadeira | identidade: "SKU editado", "não cai para o SKU reatribuído" | PASS |
| T05 | Serviço vs produto | identidade: "linha de serviço com produtoId espúrio" + suites existentes | PASS |
| T06 | Duas linhas do mesmo produto | identidade: "duas linhas… agregam em uma baixa" | PASS |
| T07 | Cadastro corrigido → mesma pendência recuperada | coberto indiretamente (resolução legada por SKU restaurado = T01); **sem teste ponta a ponta** | PARCIAL |
| T08 | ACK perdido após COMMIT | suites existentes de replay (`ops-upsert-venda-replay-conflict`, `venda-persist/v2/route.test`) — não alteradas | PASS (existente) |
| T09 | Dois reenvios concorrentes | dedupe `persistInFlightRef` existente; **sem banco real** | NÃO EXECUTADO (sem PG descartável) |
| T10 | Mesma chave, conteúdo diferente | `ClientSaleIdReusedError` existente; `produtoId` fora do fingerprint | PASS (existente) |
| T11 | Pendência + nova venda independente | contrato FAILED não registra guarda; identidade reaproveitada mantém PENDING (estático) | PARCIAL |
| T12 | Logout/token/troca de loja | não alterado | NÃO COBERTO |
| T13 | Queda/retorno de rede | não alterado (AUTO_RETRY) | PASS (existente) |
| T14 | Caixa válido/fechado | não alterado | PASS (existente) |
| T15 | Totais/estoque sem duplicação | identidade: baixa única, ledger 1 | PASS |
| T16 | Atualização de app/schema local | campos novos opcionais; pendência antiga sem `produtoId` segue legada | PASS (identidade "sem produtoId…") |
| T17 | Banner/Reenviar | banner: identidade da venda + linha; sem PII | PASS |
| T18 | Produtos KG | suites KG existentes (`classic-weight-sale-guard` falha na base por ambiente) | IGUAL À BASE |
| T19 | Payload malformado / 4xx-5xx | parser: tipos estranhos, excesso, HTML 502 | PASS |
| T20 | Carrinho atual não identifica a pendência | rótulos só das linhas da venda pendente | PASS |

## Gates

| Gate | Resultado |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| ESLint nos 13 arquivos tocados | PASS (exit 0, sem saída) |
| Vitest focado (`lib/ops-upsert-venda*`, `lib/vendas`, `lib/pdv`, `lib/operations-s*`, `components/dashboard/vendas`, `app/api/ops/venda-persist`) | base 1469 pass / 215 fail → depois **1501 pass / 215 fail**, **0 regressões** (comparação teste a teste) |
| 215 falhas pré-existentes | idênticas na base: `TypeError … reading 'clear'` (`localStorage` sob Node 26) em 8 arquivos de componente + `pdv-scan-autoclear.static` (marcador do Esc em `pdv-classic.tsx`, arquivo não tocado) |
| `npm run build` | **NÃO EXECUTADO** — 1,3 GB livres no C:, `.next` ~1,5 GB (risco de ENOSPC) |
| Integração com PostgreSQL real (2 conexões) | **NÃO EXECUTADO** — sem banco descartável provisionado; o patch não muda transação/locks |

Limitação aceita (achado F4 da revisão): o desfecho FAILED do `operations-store` é coberto por
contrato estático (texto-fonte), não por execução do provider React. Não há harness de runtime do
`OperationsProvider` no repositório; criar um ficou fora do escopo mínimo.
