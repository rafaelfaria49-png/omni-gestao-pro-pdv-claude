VEREDITO: REQUEST_CHANGES

Revisei `406ea48..3e2e795`, sem editar arquivos, acessar rede ou bancos. Os quatro achados abaixo foram reproduzidos com funções de produção e dependências simuladas em memória.

As correções de identidade ambígua e referência financeira KG fecham os casos verificados. Repetição legítima do mesmo produto, SKU alterado/removido e replay dentro do escritor permaneceram corretos. Sem `dbId`, o espelho com `produtoId` não usa fallback por SKU. A proteção local KG ainda está incompleta.

1. **P1 — Período fechado quebra o replay e permite duplicação.**  
   [route.ts:125](app/api/ops/devolucao/route.ts:125) e [trocas-devolucao.tsx:745](components/dashboard/vendas/trocas-devolucao.tsx:745).  
   Cenário: devolução comitada com resposta perdida; período financeiro fecha; o replay recebe `periodo_fechado` antes da consulta de idempotência. A tela apaga a tentativa incerta. Após reabrir o período, gera outro `localId`; havendo quantidade restante, credita e repõe novamente a mesma devolução física.  
   **Correção:** reconhecer replay existente antes dos bloqueios de nova escrita e preservar a identidade incerta quando a resposta não comprova ausência do registro.

2. **P2 — Confirmação da fila ignora os valores autoritativos.**  
   [operations-store.tsx:3216](lib/operations-store.tsx:3216).  
   Uma devolução offline calculada em R$20, confirmada pelo servidor por R$10 após desconto, mantém `creditIssued`, valor da linha e saldo local em R$20, agora com `syncPending: false`. A reprodução confirmou essa divergência.  
   **Correção:** reconciliar valores, linhas, `produtoId` e a diferença do crédito local com o resultado confirmado.

3. **P2 — Recusa definitiva deixa compensação indevida no saldo KG.**  
   [operations-store.tsx:1095](lib/operations-store.tsx:1095) e [operations-store.tsx:568](lib/operations-store.tsx:568).  
   O carregamento de uma pendência legada ainda soma unidades por SKU em `withPendingDevolucaoStock`. Depois, o estorno introduzido na R1 ignora produtos KG. Resultado reproduzido: saldo `2,375 → 3,375`, permanecendo `3,375` após `DEVOLUCAO_KG_BLOQUEADA`, com a pendência encerrada.  
   **Correção:** aplicar identidade e bloqueio KG também na reconstrução do estoque pendente e reconciliar projeções indevidas com o catálogo autoritativo.

4. **P2 — Arredondamento das parciais perde parte do valor pago.**  
   [registrar-devolucao.ts:445](lib/pdv/devolucao/registrar-devolucao.ts:445).  
   Venda de 100 unidades por R$10, com desconto de R$0,51: pago R$9,49. Cem devoluções de uma unidade emitem R$0,09 cada. A reprodução terminou com **R$9,00 creditados**, 100 unidades repostas e status `devolvida`; faltam R$0,49.  
   **Correção:** distribuir centavos pelo valor acumulado devolvido por produto, absorvendo o restante na última parcial.

Riscos residuais: PostgreSQL, concorrência real e E2E não foram reexecutados; os resultados informados não foram revalidados.  
Sem `dbId`, o estoque confirmado depende da próxima sincronização do catálogo para aparecer localmente.  
Pendências legadas com valores já entregues continuam dependendo de conciliação manual pelo Financeiro.