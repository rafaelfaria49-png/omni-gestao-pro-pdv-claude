Solicito alterações: **2 achados P1 e 2 P2**.

**Bloqueadores**

1. **P1 — Reenvio de pagamento incerto pode gerar uma segunda baixa.**  
   [ReceberPagamentoV4.tsx:278](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx:278) recompõe o recebimento imediato usando a sessão atual. O hook vincula a chave pendente ao conteúdo, incluindo essa sessão, e atualiza o saldo após erro.

   Reproduzi com o hook real e backend em memória: pagamento parcial de R$ 100 gravado, resposta perdida, saldo atualizado de R$ 420 para R$ 320; após trocar a sessão, o reenvio criou outra `operacaoId`. O writer real, executado com dependências em memória, aceitou ambas as baixas: R$ 200 recebidos.  
   **Correção:** preservar a confirmação original completa durante o resultado incerto — chave, sessão, linhas e saldo esperado — e reconciliá-la antes de permitir outro pagamento.

2. **P1 — A materialização pode continuar depois que a trava consultiva expira.**  
   [orcamento-actions.ts:121](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/orcamento-actions.ts:121) chama o materializador em outra conexão, enquanto a transação externa mantém a trava por até 15 segundos. O materializador abre sua própria transação; a expiração da externa não cancela essa operação independente.

   Se autorização ou obtenção da conexão atrasar antes da trava da OS, a externa pode liberar a trava, um pagamento entrar e a materialização posterior criar o rascunho. Simulei essa sequência em memória: pagamento de R$ 420 seguido de orçamento rascunho, enquanto o wrapper terminou com `P2028`. **Não reproduzi esse timeout em PostgreSQL.**  
   **Correção:** executar conferência e materialização na mesma transação, preservando a ordem das travas. Aumentar o timeout sozinho não elimina a janela.

3. **P2 — A garantia exibida pode diferir do orçamento consentido.**  
   [ReceberPagamentoV4.tsx:48](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx:48) calcula a orientação sobre garantia a partir de `v.realOS`, embora linhas, total e assinatura venham da conferência atual no servidor.

   Em componente montado, mantive a OS local com garantia de 180 dias e devolvi uma conferência atual de 30 dias. A tela mostrou **180 dias**, mas enviou para aprovação a assinatura do orçamento de **30 dias**.  
   **Correção:** devolver e exibir o efeito sobre a garantia no mesmo snapshot conferido pelo servidor, vinculado à assinatura e ao consentimento.

4. **P2 — Período fechado impede replay a prazo já registrado.**  
   [pdv-servico-actions.ts:776](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/pdv-servico-actions.ts:776) recusa o período fechado antes da transação e da consulta de replay, localizada na linha 790.

   Na reprodução em memória do writer real, a mesma operação retornou corretamente após mudança comercial para rascunho. Depois do fechamento do período, o mesmo reenvio passou a lançar “Período financeiro fechado”, sem devolver o registro original.  
   **Correção:** aplicar a recusa de período somente depois do replay autenticado sob a trava, mantendo o bloqueio para lançamentos novos.

**Conferência dos achados da R1**

| Achado | Resultado no HEAD novo |
|---|---|
| R1-1 | Corrigido: gerações da seleção/loja e instância ativa do formulário. |
| R1-2 | Corrigido: assinatura conferida comparada sob a trava da aprovação. |
| R1-3 | Corrigido: confirmação da formalização preservada no reenvio. |
| R1-4 | Corrigido: recusas definitivas oferecem nova conferência e declarações. |
| R1-5 | Corrigido: valores efetivos e condições das linhas identificados. |
| R1-6 | Replay após mudança comercial corrigido; resta o bloqueador de período acima. |
| R1-7 | Corrigido: código e destino comercial preservados na resposta e no replay. |

**Melhorias P3:** nenhuma.

Revisei o diff completo e fiz reproduções em memória, sem banco ou escrita de arquivos. Os 38 caminhos estão na allowlist; `lovable/api/os.ts` permanece intocado; `git diff --check` passou; HEAD e árvore de trabalho permaneceram preservados. Não reexecutei PostgreSQL, E2E ou build.

```text
R_HEAD_REVIEWED=7e45876db59a7a6fa4e3b0fca950a775db7459cf
R_FAMILY=openai
R_VERDICT=REQUEST_CHANGES
P0=0
P1=2
P2=2
P3=0
```