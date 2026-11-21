**VEREDITO: REQUEST_CHANGES**

Três achados confirmados no código e reproduzidos em memória, sem rede ou bancos:

- **P1 — [product-keys.ts:140](lib/pdv/devolucao/product-keys.ts:140): identidade histórica incorreta.** Se A e B foram vendidos com o mesmo nome e B posteriormente herdou o SKU de A, o resolvedor descarta o casamento histórico e aceita o catálogo atual. A reprodução devolveu B e emitiu **R$190** para uma solicitação de A, vendido por **R$10**. Correção: recusar identidade ambígua, exigindo vínculo histórico inequívoco.

- **P2 — [operations-store.tsx:564](lib/operations-store.tsx:564): devolução UN altera estoque KG local.** Quando o Produto.id confirmado está ausente do snapshot local, ocorre fallback pelo SKU. Se esse SKU pertence localmente a um produto KG, o espelho soma a quantidade UN ao peso: reproduzido **2,375 → 3,375 kg**. Correção: havendo `produtoId`, exigir correspondência estrita; impedir compensações UN sobre saldo KG.

- **P2 — [pendencia-financeiro.ts:113](lib/pdv/devolucao/pendencia-financeiro.ts:113): referência financeira KG zerada.** A consulta omite `quantidadeKg` e transforma `quantidade=NULL` em zero. Uma pendência de venda de **1 kg por R$20** registra `valorReferenciaServidor=0`, oferecendo referência incorreta à conciliação manual. Correção: tratar quantidade e bloqueio KG explicitamente, preservando a informação de que a origem existe.

Os sete novos testes não cobrem esses casos; as suítes PG não foram reexecutadas. Durante a revisão, o HEAD avançou de `17dffc7` para `6b85245`, alterando somente E2E; os arquivos dos achados permaneceram iguais.

Produção, rollout e aplicação das migrações não foram verificados.  
Permissões reais e autorização de supervisor não foram exercitadas.  
Conciliação de vales legados e autorização de publicação/merge continuam dependendo de decisão humana.