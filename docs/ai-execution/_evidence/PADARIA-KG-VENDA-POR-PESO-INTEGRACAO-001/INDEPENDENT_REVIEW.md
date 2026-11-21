# Revisão independente — PADARIA-KG-VENDA-POR-PESO-INTEGRACAO-001

Revisor: Codex (gpt-6.1-sol), sandbox read-only, sem rede/banco. Pareceres literais abaixo (caminhos absolutos encurtados).

## R1

VEREDITO=REQUEST_CHANGES

Revisão ancorada em `a6a746d`; as linhas abaixo referem-se a esse commit. O HEAD avançou durante a análise.

- **P1 — Venda confirmada sem saída de estoque.** `lib/ops-upsert-venda.ts:755` e `:1232`. Com SKU antigo e `produtoId` válido, a pré-trava não alcança o produto resolvido. Se ele for excluído antes da baixa, `NOT_FOUND` é ignorado e a venda gera financeiro sem ledger. Reproduzido com transação em memória. **Correção:** travar os produtos pela identidade efetivamente resolvida, em ordem estável, e abortar `NOT_FOUND` no fluxo ao vivo. Observei uma correção concorrente deste último ponto; a pré-trava ainda precisa considerar `produtoId`.

- **P2 — Snapshot KG pode prender indefinidamente a finalização.** `lib/operations-store.tsx:1872`. O POST possui timeout, mas o GET obrigatório do snapshot usa `fetch` sem prazo. Se a conexão ou o corpo ficarem pendurados, a promessa, o estado de envio e o lock entre abas permanecem ocupados. **Correção:** aplicar timeout também ao snapshot e à leitura do corpo, preservando a identidade para retry.

- **P2 — Falha do snapshot escapa do reenvio manual.** `lib/operations-store.tsx:2353`. Quando a consulta encontra a venda, mas o snapshot responde 503, `markSaleConfirmed` lança e `doRetrySyncSale` não converte a exceção em `ManualSyncResult`. Em `components/dashboard/vendas/vendas-arquivo-geral.tsx:719`, isso impede executar `setReenviandoId(null)`. Reproduzido em memória; a identidade permanece preservada. **Correção:** retornar falha estruturada nesse caminho e limpar o loading em `finally`.

- **P2 — Resposta atrasada pode restaurar saldo antigo permanentemente na tela.** `lib/operations-store.tsx:388` e `lib/estoque/catalog-sync.ts:68`. Um snapshot KG com saldo 4,650 pode chegar depois de o catálogo já ter atualizado para 4,300 e sobrescrevê-lo. Como o controlador continua conhecendo a versão atual, os próximos checks retornam `unchanged`. Reproduzido em memória. **Correção:** coordenar os snapshots por versão/geração e invalidar ou recarregar o catálogo após a confirmação.

- **P3 — Testes de precisão podem passar pelo motivo errado.** `lib/vendas/manual-kg-padaria-flow.pg.test.ts:154`. Os pesos `0.0005` e `0.3505` substituem a quantidade, mas mantêm `lineTotal`, total e pagamento em R$ 7,00. Uma implementação que aceitasse esses pesos ainda poderia rejeitar pela divergência monetária, satisfazendo `toBeInstanceOf(Error)`. **Correção:** fornecer valores monetários coerentes com cada caso e exigir a recusa específica de quantidade.

Executei TypeScript de pesagem com `--noEmit` e os 13 casos de captura em harness em memória. Não executei PostgreSQL, migrations, E2E, testes físicos de balança/impressora nem integração executável com #327/#331.
## R2

VEREDITO=REQUEST_CHANGES

- **P2 — O saldo antigo ainda pode permanecer indefinidamente.** [lib/operations-store.tsx:1920](lib/operations-store.tsx:1920). Cenário reproduzido em memória: o catálogo já conhece saldo **4,300 kg** e versão atual; chega o snapshot KG atrasado com **4,650 kg**, sobrescrevendo o estoque; a recarga forçada falha. Como a versão conhecida permanece atual, os próximos checks retornam `unchanged`, mantendo 4,650 kg. A correção da R1 está incompleta. **Correção:** impedir que o snapshot sobrescreva um catálogo comprovadamente posterior, ou invalidar a versão conhecida e manter a recarga pendente até obter um catálogo válido.

- **P2 — `id: ""` ainda permite confirmar outra venda restaurada.** [lib/operations-store.tsx:1932](lib/operations-store.tsx:1932). `saleMatches` continua fazendo fallback para `s.id === token.id`, mesmo quando ambos são vazios. `sanitizeSaleRecords` preserva registros com esse formato. Reproduzi o recovery de A numa fila contendo B com `id: ""` e outro `clientSaleId`: B também foi substituída pelo snapshot de A e marcada como confirmada. **Correção:** exigir `token.id` não vazio no fallback, ou implementar seleção exclusivamente por `clientSaleId` para recovery. Com registros bem formados e identidade válida, refs, `saleLocalKey`, slot persistido e URL funcionaram corretamente.

- **P3 — O teste de exclusão concorrente admite falso positivo.** [lib/vendas/manual-kg-padaria-flow.pg.test.ts:165](lib/vendas/manual-kg-padaria-flow.pg.test.ts:165). Esperar 500 ms não comprova que a venda chegou ao ponto da corrida. Se ela aguardar uma conexão, a exclusão pode terminar antes da resolução do produto. Nesse agendamento, até `a6a746d` rejeita com `FractionalQuantityError`, satisfazendo `toBeInstanceOf(Error)` e deixando venda/financeiro ausentes. Confirmei esse caminho com o código das duas revisões e dependências simuladas. **Correção:** sincronizar explicitamente o estágio da transação, verificar o erro esperado e testar separadamente o tratamento de `NOT_FOUND`.

Nos demais pontos da R1, a pré-trava agora inclui `produtoId`; o snapshot limita recebimento e leitura do corpo a 10 segundos; sua exceção no reenvio manual retorna resultado estruturado, com liberação do botão em `finally`; os testes de precisão passaram a exigir “Peso inválido” com valores monetários ajustados.

Não encontrei regressão adicional nos caminhos examinados: linhas virtuais de OS/avulsos ficam fora da baixa; `NOT_FOUND` aborta quando `enforceStock` está ativo e preserva o comportamento histórico quando desativado; replay existente V1/V2 retorna antes dos efeitos. O controlador descarta checks anteriores e respostas após `dispose`, sem loop identificado. Verifiquei os **9.999 pesos de 0,001 a 9,999 kg** nas funções puras: nenhum foi recusado por precisão. A validação monetária precede a guarda inicial de peso, que ocorre antes de replay e escritas.

Revisão por leitura e verificações locais em memória. Nenhum arquivo alterado; sem rede ou bancos. Não executei a suíte PostgreSQL, teste físico, migração produtiva ou E2E.
## R3

VEREDITO=REQUEST_CHANGES

- **P2 — Fallback HTML ignora a unidade KG.** Em [lib/pdv-print-runtime.ts:137](lib/pdv-print-runtime.ts:137), o HTML continua usando `${quantity}x` e omite o preço/kg. Após vender 0,350 kg a R$ 20,00/kg, escolher **Abrir impressão do navegador** no pós-venda do Clássico ou no aviso de impressão automática produz `0.35x Queijo — R$ 7,00`. Reproduzido em memória, com saída de impressão interceptada. **Correção:** usar `formatReceiptQuantity` nesse HTML e incluir `unitPrice` com `/kg` para KG, preservando a saída UN; cobrir esse fallback no teste.

Demais verificações:

- **R2:** os dois P2 foram corrigidos; verificações em memória cobriram identidade vazia e recarga forçada que falha com check anterior em voo. O P3 substituiu o atraso fixo pela observação do lock no runner isolado; essa parte foi apenas inspecionada.
- **ID vazio:** não encontrei chamador legítimo que dependa de casar exclusivamente por `id === ""`. O recovery KG fornece `clientSaleId`, cujo casamento permanece.
- **Troca de loja:** o controlador descarta respostas após `dispose()`; a confirmação também verifica `storageKey` após aguardar o snapshot.
- **Comprovante:** nas amostras comparadas com `5c203b6`, UN manteve texto, HTML, conteúdo da árvore de tela e bytes ESC/POS. KG preserva a unidade no mapeador e no Clássico, com a falha de consumo no fallback descrita acima.
- **E2E:** permanecem as asserções de identidade estável, item único, saldo 9,7, dois movimentos incluindo a correção e snapshot `{ total: 6, quantity: 0.3, revision: 1 }`.
- **Linhas virtuais:** a regra nova exclui avulsos, serviços e OS por `isVirtualSaleLine`; quantidades inteiras mantêm a validação anterior.

Nenhum arquivo foi alterado. Não acessei rede ou bancos nem executei E2E, migração ou teste físico.
## R4

VEREDITO=REQUEST_CHANGES

- **P2 — A recarga pode ficar sem nenhum gatilho após a confirmação KG.** Em [lib/operations-store.tsx:1923](lib/operations-store.tsx:1923), somente invalidar deixa uma regressão: o catálogo recebe saldo novo de 9,300 kg; uma confirmação atrasada devolve 9,650 kg; o operador sai do Clássico enquanto essa resposta chega. O provider permanece montado, aplica o saldo antigo, mas `catalogWatchersRef=0` impede intervalo, foco, visibilidade e online de consultar o catálogo (`:1400`). Sem remontar o Clássico ou receber aviso de cadastro, o saldo permanece desatualizado indefinidamente. Reproduzi o efeito real em memória: 60 minutos simulados, zero consultas. **Correção:** agendar revalidação após o pós-venda, com retentativas enquanto houver invalidação pendente, independentemente dos watchers.

As demais verificações:

- **P2 da R3 fechado.** O [fallback HTML](lib/pdv-print-runtime.ts:138) imprime `0,350 kg` e `R$ 20,00/kg`. Verifiquei os caminhos forçado e automático com rede simulada. O HTML UN ficou integralmente idêntico a `475f4bc` nas oito combinações verificadas de modo, bobina e unidade explícita/ausente.
- **Prazo:** com Clássico montado, aba visível, rede disponível e consultas concluindo normalmente, a espera pelo próximo check útil pode chegar perto de **33 segundos, mais a latência**: polling de 30 s e throttle de 3 s. Falhas concluídas preservam `known=null` e permitem nova tentativa. Não existe limite absoluto: além do achado acima, uma consulta pendurada continua sendo compartilhada pelos checks seguintes.
- **E2E:** preferir “Continuar sem terminal” corresponde ao fixture, que cria caixa sem `terminalId`. Antes, escolher um terminal arbitrário também não comprovava uma sessão própria. Essa sessão e seu isolamento continuam contemplados nos testes unitários [lib/pdv-caixa-session.test.ts:799](lib/pdv-caixa-session.test.ts:799) e `:1033`. Não localizei E2E equivalente nas suítes revisadas; não identifiquei defeito adicional de produto mascarado pela preferência.

Executei sondagens locais em memória e `git diff --check`. Não executei Vitest completo, E2E, teste físico ou migração. Nenhum arquivo foi alterado; não acessei rede nem bancos.
## R5

VEREDITO=REQUEST_CHANGES

Revisado `1249fe8..20c60de`. **O P2 da R4 permanece em dois cenários verificados. Nenhum P0/P1 identificado.**

- **P2 — Após esgotar as tentativas, voltar à rede não recupera o catálogo sem watchers.** [catalog-sync.ts:154](lib/estoque/catalog-sync.ts:154), combinado com [operations-store.tsx:1403](lib/operations-store.tsx:1403). Reproduzi com o efeito do provider em memória: seis consultas falham; depois a rede volta e eventos de `online`, foco e visibilidade não geram consulta porque `catalogWatchersRef=0`. O saldo permanece **4,650**, embora o autoritativo seja **4,300**. Com falhas imediatas, as tentativas ocorrem aos **2/7/22/52/112/232 segundos**, pois os atrasos são cumulativos. **Correção:** manter a revalidação pendente após o esgotamento e retomá-la na recuperação da rede/foco independentemente dos watchers, até aplicar um snapshot.

- **P2 — Consulta pendurada impede todas as retentativas seguintes.** [catalog-sync.ts:158](lib/estoque/catalog-sync.ts:158), com a consulta sem prazo em [operations-store.tsx:1379](lib/operations-store.tsx:1379). A próxima tentativa só é agendada quando `check()` resolve. Reproduzi separadamente `fetch` e leitura do corpo pendurados: após **15 minutos simulados**, havia somente a consulta iniciada aos 2 segundos, nenhum timer pendente e nenhum aborto. **Correção:** limitar cada tentativa, incluindo o corpo, abortar/invalidar a consulta vencida e avançar o reagendamento, descartando respostas tardias.

No caminho saudável, a recuperação começa em **2 segundos mais a duração da consulta**. **Não existe pior caso finito** na implementação atual.

O cleanup cancela timers e chama `dispose()`; a simulação de cleanup/remontagem do efeito não reaproveitou o controlador anterior. O reagendamento cancela o timer anterior, mas uma consulta já em voo continua até o próximo check forçado ou `dispose()`. Não identifiquei loop: a sequência termina em `updated`, `disposed` ou esgotamento.

Não há fetch imediato no ponto da confirmação KG. Entretanto, **2 segundos não constituem uma barreira vinculada ao término do pós-venda**; não comprovei reabertura da corrida caixa×terminal.

Os três testes novos passaram ao executar seus corpos em adaptador em memória, sem o runner Vitest. Eles cobrem sucesso após falha, cancelamento antes do disparo e esgotamento; não cobrem os dois P2 acima nem o ciclo React completo.

Nenhum arquivo alterado; sem rede ou bancos. Não executei E2E, migração produtiva ou teste físico.
## R6

VEREDITO=APPROVE

Revisão de `20c60de..008d56b`. **Os dois P2 da R5 estão fechados. Não identifiquei P0/P1/P2 restantes na pilha revisada R1–R6, nem novos P3.**

- **Retomada e atraso:** o [agendador](lib/estoque/catalog-sync.ts:160) continua sem watchers e repete o último atraso. Após agendar, o caminho saudável inicia em 2 s e aplica antes de 17 s se a resposta cumprir o prazo. Com falhas persistentes, não há limite global; no patamar final, os inícios ficam separados por 120–135 s. Após recuperação, o pior caso conservador até aplicar é aproximadamente **150 s**: prazo restante de 15 s + espera de 120 s + resposta seguinte de até 15 s. Isso pressupõe execução normal dos timers; suspensão da aba pode ampliar os tempos.

- **Respostas tardias e cancelamento:** a sequência do controlador impede a tentativa antiga de sobrescrever uma posterior, inclusive quando a dependência ignora o abort. Há uma nuance confirmada: vencer 15 s libera o agendador; o pedido só é abortado no próximo check forçado. Antes disso, sua resposta ainda pode ser aplicada, mantendo a próxima recarga agendada. O cancelamento limpa os timers; o [cleanup do provider](lib/operations-store.tsx:1425) também chama `dispose()`, abortando e impedindo aplicações posteriores.

- **Custo e ciclo de vida:** não encontrei loop apertado, acúmulo de timers ou multiplicação de agendadores por novas vendas KG. Verifiquei em memória setup/cleanup/setup e 100 reagendamentos. No patamar final são aproximadamente 30 recargas completas/h por provider, ou 27/h quando todas penduram, além dos gatilhos normais. Novas vendas reiniciam o backoff; abas distintas somam carga.

**Validação executada:** 16/16 testes do arquivo alvo, 108 testes adicionais e sete cenários em memória. `sale-sync-engine` passou após desabilitar Web Storage nativo nos workers do Node 26.

Nenhum arquivo editado ou commit criado. Sem rede ou bancos; não executei E2E, migração produtiva ou teste físico.