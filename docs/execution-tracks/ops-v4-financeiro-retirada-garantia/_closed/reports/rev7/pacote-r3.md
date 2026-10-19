# Revisão independente R — OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002

Você é o revisor independente (papel R, família OpenAI) de um GOAL AEP classe C4,
risco ALTO, implementado por um executor da família Anthropic. Trabalhe SOMENTE
em leitura: não edite, não crie, não apague arquivos, não rode comandos que
escrevam (nada de git commit/checkout/reset/stash, npm install, build, migrations,
escrita em banco). Você pode ler arquivos, rodar `git diff`, `git show`,
`git log` e testes puros (vitest SEM banco) se quiser.

## Alvo exato

- Repositório (worktree): `C:/Projetos/omni-gestao-ops-v4-frg-002`
- Branch: `goal/ops-v4-financeiro-retirada-garantia-002`
- Base (merge-base com origin/main): `7cd2c65c0bc23a9f1922cbc280494e62257251ff` (main com o plano rev 6; o GOAL partiu de `98ef717`, só docs/pessoas entraram depois)
- HEAD candidato a revisar: `6155b4d0d3f905c99f45ade0b029e566bd64a672`
- Diff a revisar: `git diff 7cd2c65c0bc23a9f1922cbc280494e62257251ff 6155b4d0d3f905c99f45ade0b029e566bd64a672`
- Contrato: `docs/execution-tracks/ops-v4-financeiro-retirada-garantia/goals/OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002.md`
  (rev 6, com as seções "Revisão 5" e "Revisão 6") e o `TRACK.md` da mesma pasta. Leia o contrato antes do diff.

Se `git rev-parse HEAD` não for `6155b4d0d3f905c99f45ade0b029e566bd64a672`, PARE e responda `R_VERDICT=INVALID_HEAD`.

## O que o GOAL deveria fazer (resumo — o contrato é a fonte)

Origem: OS com pagamento registrado sobre orçamento ainda em rascunho (caso
OS-2026-00025). O GOAL 001 tornou isso visível; o 002 impede que aconteça de novo
e dá uma saída controlada para o que já aconteceu:

- A. Critério ÚNICO de elegibilidade comercial no servidor
  (`lib/operacoes-v3/elegibilidade-comercial.ts`, sobre
  `reconciliarTotaisFinanceirosV3`) nos três writers de recebimento novo
  (`receberOSV3`, `lancarOSAPrazoV3`, misto `executarSobATrava`), DEPOIS do replay
  e sob as travas existentes; recusa estruturada com destino. Replay da MESMA
  `operacaoId` devolve o original mesmo após mudança comercial.
- B. `gerarOrcamentoDaOS` (wrapper) recusa materializar rascunho sobre título com
  pagamento vigente, sob a trava consultiva dos writers de pagamento.
- C. "Aprovar e receber" na V4: conferir escopo/total → consentimento explícito →
  `aprovarOrcamentoV3` → só com sucesso o recebimento do hook V3 (mesma chave,
  replay, CAS). Aprovado + pagamento falho = "Orçamento aprovado — pagamento não
  confirmado", sem rollback fictício.
- D. "Formalizar aprovação pendente" (`formalizacao-aprovacao-model.ts` puro +
  `formalizacao-aprovacao-actions.ts`): admin + `operacoes.editarOs`, motivo,
  declaração, evidência opcional, assinatura canônica do escopo calculada no
  servidor, ratificação específica se vencido; revalidação sob as MESMAS travas
  dos writers de pagamento; igualdade exata em centavos entre orçamento
  calculado, declarado, título, coluna e `payload.valorTotal`; escrita só do
  payload (orçamento aprovado no instante atual, registro, versão, um evento);
  idempotência por `operacaoId` + fingerprint (conteúdo diferente = conflito).
- E. Nenhuma forma de pagamento pré-selecionada no recebimento da V4, no PDV de
  Serviço V3 e no Atendimento rápido V3; servidor recusa forma vazia.

## Pontos que exigem atenção (bloqueadores possíveis)

- Dinheiro: algum caminho cria 2ª cobrança, 2º título, 2ª OS, baixa sem forma
  escolhida, ou muda pagamento/título/caixa existente? Replay antes da
  elegibilidade em todos os writers? Ordem das travas preservada
  (advisory → sessão FOR SHARE → OS FOR UPDATE → título FOR UPDATE)?
- B: a trava consultiva mantida durante a materialização cria ciclo de trava
  com algum writer? A recusa altera algo?
- D: alguma divergência é corrigida automaticamente? A formalização pode
  retrodatar, renovar validade, mudar preço/garantia/CR/caixa/status? A
  assinatura do escopo é estável e resistente a protótipo/ordem de chaves?
  Permissão verificada antes de qualquer leitura de OS?
- Permissões: cada passo verifica a SUA permissão no servidor (aprovar ≠ receber
  ≠ formalizar)? Nenhuma permissão global nova?
- UI: resposta tardia de outra OS/loja nunca age sobre a seleção atual (C e D)?
  Nada inicia serviço ou entrega implicitamente?
- Produção: mensagens lançadas em Server Actions chegam MASCARADAS ao navegador
  em build de produção (React Flight). Onde o contrato exige orientação ao
  operador, ela não pode depender só da mensagem lançada (ver B: orientação
  espelhada no cliente em `orientacaoGerarOrcamentoV4`, servidor segue decidindo).
- Escopo: só caminhos da allowlist; nada de schema/auth/permissão/motor global;
  `components/operacoes/lovable/api/os.ts` intocado.

## Evidências do executor (sobre `2223aa3`)

- AEP `check` PASSOU sobre `2223aa3` (11/11: árvore limpa, 38 caminhos todos dentro da
  allowlist da rev 6, nenhum gate, `goals/**` intocado, ledger íntegro, upstream ok) com o
  test_command completo exit 0: typecheck; unitários (elegibilidade 34, formalização modelo 48 +
  actions 14, orcamento-actions 36, misto/a prazo/forma/situação…); preview-honesty filtrado
  (005/006/007/001/002) 20; suíte do GOAL (`test/ops-v4-financeiro-retirada-garantia-002`):
  superfícies montadas 14 + hook real 9 + PostgreSQL 27 (B1–B5 com barreira determinística e
  `pg_stat_activity`); suíte do 001 (inclui PG); 006 jsdom 52; #234/#238 jsdom; #235 jsdom 29;
  #237 v3-e-correcao; E2E do GOAL 6/6 contra build de produção local (C feliz, C recusa da
  aprovação no servidor, D, E, B, A no V3) — `verify` e `verify --all` sem divergências.
- Regressões em bancos descartáveis próprios (fora do test_command por exigirem prefixos
  distintos), no candidato: 005 jsdom+PG 47/47; 006 jsdom+PG 70/70; 003 4/4; 004 45/45;
  fluxo-curto 002 15/15; `ops-v4-fluxo-curto` 38/38; #234/#238 PG 109/109 (P1-T7 com fixture
  consistente — rev 6); #235 PG 1/1; #237 PG 34/34 e jsdom 30/30; 007 jsdom+PG 66/67 (só T56c —
  ver abaixo). E2E (build de produção, sem retries): 001 5/5; 002 6/6; 006 15/15 (E03 com forma
  escolhida — rev 6); #234 1/1; #238 2/2; #235 1/2; #237 4/5.
- Pré-existentes, iguais na base `98ef717` (mesmo build/banco/asserção): E2E #235 "V4: débito 350
  + a prazo 50" falha no comprovante (linha 76: o recibo de misto diz "não está disponível para
  reimpressão" — regra de identidade do recibo de GOALs anteriores); E2E #237 "V4 Entrega de dias
  atrás" falha no texto do `window.confirm` (linha 369: ", retirada por …" vem do GOAL 006,
  `2afbdbc`; `EntregaStage.tsx` não foi tocado). preview-honesty COMPLETO: 10 falhas idênticas
  por nome às da base. T56c (007 PG): intermitente na base (2/3 com o recorte T56; 0/4 isolado)
  e no candidato (0/4 isolado) — retorno-actions, nova-os-actions, os-payload-lock e o teste não
  foram alterados. Suíte global (`*.test.ts`): mesmas falhas da base, exceto três varreduras de
  código que estouraram tempo sob carga e passam isoladas (13/13).
- Revisões de plano pelo rito AEP: rev 5 (pré-`open`, PR #258) e rev 6 (durante a execução,
  PR #259, autorizada pelo proprietário): 7 caminhos de teste fora da allowlist adaptados só na
  entrada/fixture, sem remover asserção.
- Achado de produção tratado: em build de produção a mensagem de um erro LANÇADO numa Server
  Action chega ao navegador como "An error occurred in the Server Components render…" (React
  Flight só envia o digest — confirmado no E2E antes da correção). Onde o contrato exige
  orientação ao operador: C usa `aprovarOrcamentoParaReceberV3` (devolve a recusa; só `Error`
  simples atravessa; falha inesperada vira texto genérico; erro com `digest` segue lançado) e B
  orienta no cliente (`orientacaoGerarOrcamentoV4`, mesmo texto da recusa do servidor, que
  continua decidindo). O mascaramento das demais actions do sistema é pré-existente e fora do
  escopo (relatado ao proprietário).
- Fora do contrato, só relatado: o atendimento rápido da V4 (`AtendimentoRapidoModal.tsx` +
  `atendimento-rapido-form.ts`) continua iniciando a forma em Dinheiro (rev 5, decisão 4).
- `npm run build` (webpack): "Compiled successfully", MIGRATION_SKIPPED, exit 0. ESLint 0
  problemas nos 38 alterados. `git diff --check` limpo.
- Nenhum dado real consultado ou alterado; toda massa é sintética em PostgreSQL local
  descartável; a formalização NÃO foi executada em nenhuma OS real.



## Rodada 3 (R3, última tentativa AEP 3/3) — conferência dos achados da R1 e da R2

R1 (sobre `2223aa3`): 2 P1 + 5 P2 — corrigidos em `7e45876` e confirmados pela R2.
R2 (sobre `7e45876`): 2 P1 + 2 P2 (texto integral abaixo). Corretivo: `6155b4d` (`git show 6155b4d`).
Confira CADA achado da R2 contra o HEAD (reproduza se puder), confirme que os da R1 continuam
corrigidos e revise de novo o diff completo base..HEAD, inclusive efeitos colaterais.

Corretivos declarados da R2:
- (P1) `usePdvServicoV3`: recebimento imediato SEM resposta do servidor (transporte: TypeError,
  AbortError, resposta que não é da action) fixa por OS a confirmação ORIGINAL inteira (chave,
  sessão, linhas, saldo esperado); todo envio seguinte desta OS a repete idêntica até o
  resultado; resposta do servidor (erro com `digest` em produção ou erro comum da action =
  recusa decidida antes do commit, ou chave já gravada com outro conteúdo) libera. O sheet V4
  trava o rascunho em "Reenviar mesma confirmação"; o PDV V3 mostra o resultado não confirmado
  (o botão normal também repete a original — o E2E-C de #238 segue verde).
- (P1) `gerarOrcamentoDaOS`: conferência do pagamento E gravação do rascunho na MESMA transação
  (consultiva → linha da OS via `mutarPayloadOSV3({ tx })`), com o mesmo construtor puro do
  @/api/os (`buildOrcamentoRascunhoFromOS`), no-op com orçamento real; `lovable/api/os.ts`
  intocado; não chama mais o materializador do Lovable em outra conexão.
- (P2) `escopoAprovacaoOrcamentoV3` devolve `garantia` do mesmo snapshot; a tela usa só ela.
- (P2) `lancarOSAPrazoV3`: período fechado verificado só depois do replay, sob a trava.

Evidência sobre `6155b4d`: AEP `check` PASSOU (test_command completo, incl. E2E do GOAL 6/6);
suíte do GOAL 63/63 (PG 30: período fechado após replay a prazo; montados 33: pendência
imediata fixada/liberada/por OS no hook real, sheet travado, garantia do snapshot); unitários
493/493 (incl. materialização na mesma transação e no-op); preview-honesty completo = as mesmas
10 falhas da base; regressões PG 005 47, 006 70, 007 67, 003 4, #234/#238 109, #235 1, #237 34;
E2E 006 16/16, #234 1/1, #238 2/2, #235 1/2 e #237 4/5 (falhas idênticas na base). Sob a máquina
carregada (base `98ef717` também 5x mais lenta no mesmo cenário), o E2E do GOAL passou a usar
espera explícita de 60 s para estados de várias idas ao servidor, `test.setTimeout(240s)` e
um observador de DOM para o toast efêmero de 1,9 s do item B.

### Texto integral da R2
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

### Texto integral da R1
Solicito alterações: **2 achados P1 e 5 P2**.

Bloqueadores:

1. **P1 — Resposta antiga pode disparar pagamento após A→B→A.**  
   [use-v4-preview.ts:2377](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/use-v4-preview.ts:2377) compara apenas os IDs atuais. Se o operador sair de A e voltar antes da resposta da aprovação, `noAlvo()` volta a ser verdadeiro e executa o recebimento da visita anterior. A reprodução em memória resultou em `status: "recebido"` e uma chamada ao pagamento.  
   **Correção:** capturar uma geração da seleção e invalidar a continuação após qualquer troca de OS/loja; conferir também se a instância original do formulário continua ativa.

2. **P1 — A aprovação não está vinculada ao escopo consentido.**  
   [orcamento-actions.ts:508](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/orcamento-actions.ts:508) chama a aprovação apenas com loja e OS. O núcleo aprova o orçamento mais recente, sem comparar revisão ou conteúdo exibido ao operador. Reproduzi uma troca de serviço mantendo o total: a action devolveu `ok: true` e aprovou o serviço diferente. O CAS de saldo não detecta essa mudança de escopo.  
   **Correção:** enviar a identidade do orçamento conferido e compará-la sob a trava da aprovação; exigir nova conferência e consentimento quando houver mudança.

3. **P2 — Resultado incerto não preserva o conteúdo original da formalização.**  
   [FormalizarAprovacaoV4.tsx:90](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/FormalizarAprovacaoV4.tsx:90) recompõe a requisição a partir dos campos atuais. Após `incerto`, motivo, evidência e declarações continuam editáveis. Em componente montado, alterei o motivo e cliquei em “Reenviar”: foi enviada a mesma `operacaoId` com conteúdo diferente. Se o primeiro envio tiver sido gravado, isso produz conflito em vez de recuperar o resultado.  
   **Correção:** conservar uma cópia imutável da confirmação original e reenviá-la até obter resultado definitivo.

4. **P2 — Algumas recusas deixam um botão habilitado que não envia.**  
   [FormalizarAprovacaoV4.tsx:109](/C:/Projetos/omni-gestao-ops-v4-frg-002/components/operacoes-v4-preview/parts/FormalizarAprovacaoV4.tsx:109) zera `operacaoId` para toda resposta com `naoRegistrada`, mas limpa a conferência somente em `escopo_divergente`. Reproduzi `vencido_sem_ratificacao`: “Formalizar aprovação” permaneceu habilitado, o clique seguinte não chamou a action e “Conferir de novo” não apareceu.  
   **Correção:** oferecer nova conferência após essas recusas, recalculando vencimento e identidade e solicitando novamente as declarações pertinentes.

5. **P2 — A conferência da formalização apresenta escopo e valores incorretos.**  
   [formalizacao-aprovacao-model.ts:210](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/formalizacao-aprovacao-model.ts:210) lista todas as alternativas e usa valores brutos, ignorando seleção, desconto da linha e `kindV3`. Reproduzi orçamento de R$ 300 com serviço selecionado de R$ 400 menos R$ 100, alternativa não selecionada de R$ 450 e brinde de R$ 20: a conferência mostrou os três valores brutos, sem distinguir essas condições.  
   **Correção:** apresentar o escopo efetivamente escolhido usando os helpers existentes de valor ao cliente e identificar cortesias e alternativas excluídas, preservando a assinatura completa para revalidação.

6. **P2 — O writer a prazo não cumpre a garantia de replay do item A.**  
   [pdv-servico-actions.ts:768](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/pdv-servico-actions.ts:768) entra diretamente na elegibilidade. `LancarAPrazoInputV3` não recebe identidade da operação e não existe consulta de replay. Na reprodução em memória, repetir o lançamento gerou duas atualizações do título e dois eventos; depois de mudar o comercial para rascunho, o reenvio foi recusado em vez de devolver o original.  
   **Correção:** implementar identidade e fingerprint persistidos, com replay autenticado sob a trava e antes da elegibilidade, conforme exigido para os três writers.

7. **P2 — O misto descarta o motivo comercial estruturado e o destino.**  
   [recebimento-misto-service.ts:479](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/recebimento-misto-service.ts:479) transforma todas as recusas em `comercial_nao_elegivel`, conservando apenas a mensagem. A resposta final em [pdv-servico-actions.ts:930](/C:/Projetos/omni-gestao-ops-v4-frg-002/lib/operacoes-v3/pdv-servico-actions.ts:930) também não contém o destino. Assim, `VALORES_DIVERGENTES → financeiro` e `APROVACAO_COMERCIAL_PENDENTE → comercial` perdem a distinção contratada.  
   **Correção:** preservar código e destino da regra única na recusa, no registro terminal, no replay e na resposta à UI.

Melhorias P3: nenhuma registrada.

A revisão foi estática e por reproduções em memória, sem banco ou escrita em arquivos. Confirmei os 38 caminhos dentro da allowlist, `lovable/api/os.ts` intocado, `git diff --check` limpo e HEAD final inalterado. As suítes PostgreSQL e E2E informadas pelo executor não foram reexecutadas nesta revisão.

```text
R_HEAD_REVIEWED=2223aa3e59e82243261232a033569d0f02339d16
R_FAMILY=openai
R_VERDICT=REQUEST_CHANGES
P0=0
P1=2
P2=5
P3=0
```

## Formato OBRIGATÓRIO da resposta (no fim)

```
R_HEAD_REVIEWED=<sha completo que você revisou>
R_FAMILY=openai
R_VERDICT=APPROVE|REQUEST_CHANGES
P0=<n>
P1=<n>
P2=<n>
P3=<n>
```

Antes desse bloco, liste cada achado com severidade (P0 crítico … P3 melhoria),
arquivo:linha, evidência e correção sugerida. APPROVE só com P0=P1=P2=0.
Separe bloqueadores de melhorias. Não reimplemente.
