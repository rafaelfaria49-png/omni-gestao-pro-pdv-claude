# MATRIZ_TESTES — PDV-CADASTROS-SYNC-AUTOMATICO-001

## Testes novos

| Arquivo | Tipo | Casos |
|---|---|---|
| `lib/estoque/catalog-version.test.ts` | unidade + rota (Prisma mockado) | 7 |
| `lib/estoque/catalog-sync.test.ts` | controlador + canal entre abas | 11 |
| `lib/pdv/cart-catalog-reconcile.test.ts` | reconciliador puro | 13 |
| `lib/vendas/sale-attempt-outcome.test.ts` | taxonomia + decisão FAILED/PENDING | 19 |
| `components/dashboard/vendas/pdv-catalog-sync.contract.test.ts` | render do painel + contrato estático | 17 |
| `e2e/cadastros-ramos/09-catalogo-sem-f5.spec.ts` | **E2E autenticado** (CI, Postgres descartável, `next start`) | 1 jornada / 6 etapas |

Atualizado: `lib/vendas/produto-nao-resolvido-recovery.test.ts` (marcadores do ramo FAILED).

## Cenários pedidos (item 14 do GOAL)

| Cenário | Unidade/integração | E2E (CI) |
|---|---|---|
| Edição de SKU | reconciliador: reaponta pelo `Produto.id`; SKU reatribuído não captura a linha | outra aba: linha passa a `E2E-SYNC-002` sem F5 |
| Edição de código de barras / nome | reconciliador: sem divergência, linha intacta | — |
| Edição de preço | reconciliador: divergência; aplicar/manter; preço manual não diverge | outra aba (12,50), outro aparelho (14,00), offline (15,00) |
| Estoque | reconciliador: saldo agregado, ajuste, não controlado | — |
| Exclusão | reconciliador: `removed`; catálogo vazio não acusa | — |
| Abas diferentes | canal: entrega 1 vez, só da loja; fallback `storage` | outra aba, mesmo contexto |
| Aparelhos diferentes | controlador: versão mudou → snapshot | contexto separado, sessão própria |
| Carrinho aberto | contrato: só `inventory` muda; `setCart(prev => …)` | linha única preservada em todas as etapas |
| Erro 409 | taxonomia: 10 códigos → REJECTED → FAILED para venda nova; reaproveitada, rede e 5xx → PENDING | — (exige caixa aberto + venda; coberto em unidade) |
| Offline e recuperação | controlador: rede falha → nada aplicado; `online` dispara | `setOffline(true)` → edição remota → `setOffline(false)` → chega |
| Respostas fora de ordem | controlador: resposta atrasada descartada; dispose não aplica | — |
| Isolamento por loja | canal por loja; rota sem acesso = 403; snapshot de outra loja descartado | — |
| Sem F5 | — | marcador `window.__semF5` intacto do início ao fim |
| Nenhuma venda criada | — | contagem de vendas da loja igual antes/depois |

## Gates locais

| Gate | Resultado |
|---|---|
| `npm run typecheck` (inclui `e2e/`) | PASS |
| ESLint nos arquivos tocados | 0 erros; 4 avisos em `pdv-classic.tsx`, **idênticos na base** |
| Vitest (`lib/ops-upsert-venda*`, `lib/vendas`, `lib/pdv`, `lib/operations-s*`, `lib/estoque`, `components/dashboard/{vendas,estoque}`, `components/cadastros`, `app/api/{ops,produtos}`) | base 1782 aprovados / 292 falhas → depois **1849 / 292**, **0 regressões** (comparação teste a teste) |
| 292 falhas pré-existentes | iguais na base: `localStorage` sob Node 26 nos testes de componente, `pdv-scan-autoclear.static` e rotas com mocks antigos |
| `npm run build` | **NÃO EXECUTADO localmente** (disco C: com ~1,4 GB livres; `.next` ~1,5 GB). Roda no CI (`Ramos e Cadastros`) e no preview da Vercel |
| E2E 09 | **NÃO EXECUTADO localmente** (exige build + Postgres descartável). Só vale depois de passar no CI |

## O que NÃO está provado ainda

- A jornada E2E nunca rodou de fato. Seletores e fluxo foram revisados, mas o primeiro run no CI pode
  exigir ajuste.
- O FAILED por 409 não tem E2E: precisaria de caixa aberto e de provocar a recusa no servidor. A decisão
  é testada em execução (`finalizeFailureDisposition`) e a fiação no store por contrato estático.
- Outros PDVs (Assistência, Supermercado, Venda Completa) recebem o catálogo atualizado e a taxonomia
  (via store), mas **não** têm o painel de revisão nem `produtoId` na linha: escopo deste GOAL é o Clássico.
