# Parecer R — OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (revisão 7)

```text
FAMILY=anthropic
REVISOR=Claude Code (Claude Agent SDK), modelo Claude Opus 5.5 (claude-opus-5-5)
SESSÃO=nova sessão; o ID não aparece no meu contexto, ficará nos metadados brutos da CLI
SHA_REVISADO=cd69780c81b3bc159cd5f0810daabc98aae06a34
BASE=60337ff116e831e1e7e13597a4e6622a6df131ed
VERDICT=REQUEST_CHANGES
P0=0
P1=0
P2=1
P3=5
```

A revisão foi somente leitura (Read/Glob/Grep). Nenhum arquivo foi editado e nenhum teste, writer, migration, open/attempt/close ou commit foi executado. Também não li `.env` nem acessei produção. As ferramentas de plano (Write/ExitPlanMode) não estavam disponíveis nesta sessão, por isso o parecer vai direto nesta resposta.

## Escopo efetivamente revisado

- **Pacote:** li LEIA-ME, GOAL-rev7 (contrato A–E e revisões 5 a 7), EXECUTORES.json, candidate.txt, COBERTURA-final.md, aep-check-attempt3 (json e log), candidate-audit-final.json, preview-baseline.json, preview-full-final.log, baseline-main-scope.json, e2e-baseline-final.json, os logs E2E misto e datas (base e candidato) e o veredito-r3.
- **Diff funcional:** li integralmente todos os trechos de produto:
  - o hook `use-pdv-servico-v3.ts`;
  - as telas PdvServicoV3, AtendimentoRapidoV3, ReceberPagamentoV4, FormalizarAprovacaoV4 e OrcamentoDecisaoCluster, e o `use-v4-preview.ts`;
  - os módulos `elegibilidade-comercial`, `formalizacao-aprovacao-model/actions`, `orcamento-actions`, `pdv-servico-actions`, `recebimento-misto-model/service` e `situacao-atendimento-v4`.
- **Fontes completas no SHA atual:** conferi `pdv-servico-actions.ts` (lerPagamentoOSV3, o wrapper e o writer imediato, o registrar misto), `recebimento-misto-service.ts` (travas, replay, recusas terminais, fence), `payment-model.totalCobravelV3`, `atendimento-rapido-actions/model` e os wrappers V4.
- **Testes:** li a suíte PG `recebimento-elegivel.pg.test.ts` (infraestrutura, B1 e todo o bloco R7). Os demais trechos de teste do diff (montados, superfícies, E2E, preview-honesty) foram amostrados por busca, não lidos linha a linha.

## Achado P2

### P2-1 — A resposta moderna da recusa imediata perde o motivo estruturado e o destino comercial (item A)

- **Onde:**
  - `lib/operacoes-v3/pdv-servico-actions.ts:435`: o tipo `RecusaConfirmacaoImediataV3` só tem `estado`, `operacaoId`, `requestFingerprint` e `mensagem`.
  - `pdv-servico-actions.ts:700-703`: quando o erro é `RecebimentoInelegivelErroV3`, a recusa durável é montada e gravada só com `e.message`. `codigo` e `destino` se perdem.
  - `pdv-servico-actions.ts:530`: o replay da recusa durável devolve apenas `mensagem`. Na linha 531, o caller legado recebe um `Error` simples, sem `codigo`/`destino`.
  - `components/operacoes-v3/hooks/use-pdv-servico-v3.ts:175-176`: a UI recebe só o texto.
- **Gatilho:** recebimento imediato pela V3 ou pela V4 (sempre com `confirmacaoClienteV3: true`) sobre orçamento em rascunho, enviado, recusado ou vencido, ou com valores divergentes.
- **Impacto:**
  - O item A exige recusa no servidor "com motivo estruturado e destino (código do 001)". O misto cumpre isso (`comercial` em `pdv-servico-actions.ts:1107/1114`, conferido no R1-7).
  - O imediato moderno, que é o único canal que chega ao navegador num build de produção, não cumpre. O caminho legado lançado tinha `codigo`/`destino` no objeto de erro, então isto é uma regressão de contrato introduzida pelo corretivo da rev7.
  - Não há risco financeiro: nada é gravado e a recusa continua terminal.
  - A cobertura não pega o problema: a B1 PG (`recebimento-elegivel.pg.test.ts:308-309`) só testa o caminho legado lançado.
- **Correção mínima:**
  1. Acrescentar `comercial?: { codigo; destino }` à `RecusaConfirmacaoImediataV3`.
  2. Preenchê-lo quando `e instanceof RecebimentoInelegivelErroV3`, persistir o campo em `recebimentoImediatoRecusasV3` e devolvê-lo no replay (linha 530).
  3. Expor o campo no hook, para que V3 e V4 mostrem o destino.
  4. Adicionar à B1 PG o caso opt-in, esperando `{ estado: "RECUSADO_DEFINITIVAMENTE", comercial: { codigo, destino } }`, para as cinco classes e também no replay.

## Avaliação dos P1 anteriores e do envelope financeiro (nenhum P1 encontrado)

**P1-A — exceção não serve mais como prova negativa.**
- No wrapper `receberOSV3` (`:443`), toda exceção que não seja `RecusaRecebimentoImediatoV3` ou `RecebimentoInelegivelErroV3` sob o savepoint vira INCERTO. Isso inclui auth, permissão, validação, Connection closed e timeout.
- No hook, `recebimentoSemRespostaV3` sempre devolve `true`, e o `catch` nunca remove o envelope.
- O misto opt-in não marca `naoRegistrada` em validação nem em erro lançado (`:1080-1082`, `:1114`).
- Leitura vazia do servidor nunca apaga o `localStorage`: `assimilar` só persiste a pendência do servidor e `sincronizar` relê o local.

**P1-B — envelope único por loja/OS.**
- O hook persiste ID e input completos antes do primeiro `await`, com `emVoo` síncrono contra duplo clique.
- O servidor grava `confirmacaoRecebimentoPendenteV3` na mesma transação da baixa (imediato `:690`; misto `:1098-1100`).
- O fence `conferirPendenciaFinanceiraV3` roda sob a consultiva, depois do replay e antes de período, caixa e elegibilidade, no imediato, no misto (decidir e executar), no a prazo e no estorno.
- A troca de modalidade, de chave ou de conteúdo fica bloqueada na UI (`receber`, `registrarMisto`, `estornar`, PdvServicoV3, ReceberPagamentoV4) e no servidor.
- O reconhecimento passa por auth, permissão por tipo, consultiva, sessão e OS, e compara ID, tipo e fingerprint (`reconhecerConfirmacaoFinanceiraV3`).
- A pendência só existe se a baixa commitou, então apagá-la após reconhecimento não esconde dinheiro.

**Ordem de travas e recusa durável.**
- A ordem advisory → sessão → OS → título foi preservada em todos os writers, inclusive na formalização e no `gerarOrcamentoDaOS`.
- A recusa durável faz rollback ao savepoint, retrava sessão e OS e grava o registro. A requisição atrasada encontra a recusa antes de qualquer escrita.
- O CAS `saldoEsperado` fica congelado no envelope e é a última barreira nos cenários de chaves concorrentes que verifiquei:
  - envelope sobrescrito pela pendência de outro operador;
  - requisição original atrasada depois de outra operação e de reconhecimento;
  - abas com escrita concorrente no `localStorage`.
- Não encontrei caminho que baixe duas vezes ou que deixe uma baixa commitada sem pendência autoritativa visível a um operador autorizado.

**Compatibilidade.** O caller legado (`atendimento-rapido-actions.ts:129`) mantém o retorno e os erros. O replay aceita os fingerprints v1/v2/v3.

**Prova PG.** As sessões são distintas em ID e nome. Há barreira na escrita, espera confirmada por `pg_stat_activity` e contagens reais de título, caixa, movimentação e OS. O split 100 Pix + 70 Dinheiro + 250 a prazo resulta em uma baixa de 170, duas operações de caixa, uma movimentação e uma parcela. Os limites dessa prova estão no P3-3.

## Contratos A–E

| Item | Avaliação |
|---|---|
| A | Regra única via `reconciliarTotaisFinanceirosV3`. Checada depois do replay e antes de qualquer escrita nos três writers. O sinal continua possível. Ressalva: P2-1. |
| B | `gerarOrcamentoDaOS` faz conferência e materialização no mesmo `tx` sob a consultiva. A UI orienta antes. Ver P3-4. |
| C | Conferência no servidor, consentimento explícito, aprovação limitada ao `conteudoEsperado` sob trava, recusa devolvida (legível em produção) e permissão checada em cada passo. Estado "aprovado — pagamento não confirmado" sem rollback fictício. O retry reusa o envelope. O `saldoEsperado` antes da aprovação é coerente, porque `totalCobravelV3` usa o orçamento real independentemente do status. |
| D | Exige papel admin e `editarOs`. Revalida loja, OS, status do orçamento, assinatura canônica (linhas, revisão, totais, título, lançamentos) e totais em centavos nas cinco fontes. Exige ratificação explícita quando vencido. Grava só o payload: não mexe em colunas, título, caixa, garantia ou status. Replay e conflito por fingerprint. Ver P3-2. |
| E | Nenhuma forma pré-selecionada (V4, PDV V3, Atendimento rápido V3). O servidor recusa ausência no imediato e no misto, e ausência nunca vira Dinheiro. Ver P3-5. |

## Achados P3

1. **Incerteza sem saída para erros determinísticos antes da transação.** Em `pdv-servico-actions.ts:472/479` (imediato) e `:1080-1082` (misto), entrada inválida mantém INCERTO para sempre, e o envelope local daquele navegador não tem como ser encerrado. A UI impede essas entradas, por isso o problema é de liveness, não de segurança. Correção mínima: uma action autorizada que, sob a consultiva, confirme que não há baixa com a `operacaoId` e grave uma recusa-lápide terminal, permitindo descartar o envelope com prova.
2. **Formalização com estado pendente e recusas frágeis.** A confirmação pendente só existe no estado do componente (`FormalizarAprovacaoV4.tsx:60`) e se perde no remount. As recusas sob trava voltam com `naoRegistrada` sem registro durável (`formalizacao-aprovacao-actions.ts:185`). Não é financeiro e uma segunda formalização é impossível, mas não segue o mesmo rigor dos writers de pagamento.
3. **Limites da prova de dois operadores.** Ela usa um mock de sessão mutável em processo, com os dois operadores ADMIN. O teste de segunda chave concorrente usa o mesmo operador. A evidência é suficiente para a serialização, mas limitada para permissões heterogêneas reais.
4. **Título lido sem trava de linha no `gerarOrcamentoDaOS`.** Em `orcamento-actions.ts:118` só a consultiva protege a leitura. Writers globais fora da consultiva (Financeiro) poderiam intercalar. Fica fora do contrato (motores globais intocados).
5. **Atendimento rápido sem validação de forma antes dos efeitos.** O servidor (`atendimento-rapido-actions.ts:71`) não valida `formaPagamento` antes de criar a OS: depende da recusa de `receberOSV3` e da compensação, que cancela a OS. Não há default Dinheiro. O arquivo está fora da allowlist.

## Falhas preexistentes e evidências

- **Preview completo:** são os mesmos 10 FAIL nomeados em `preview-baseline.json` (base 98ef717 contra candidato 3027772). O `preview-full-final.log` mostra os mesmos 10 com a fonte atual (325/335). São asserções de texto de fonte, não de comportamento. Aceito como preexistente.
- **E2E #235 e #237:** falham na mesma asserção na base e no candidato ("Recebido nesta operação", linha 74 contra 76 pelas duas linhas de escolha de forma; aviso de entrega na linha 369). Aceito como preexistente.
- **Fluxo007 T56c:** não abri os logs T56c. Aceito pela declaração de fonte idêntica, sem verificação própria.
- **Base 98ef717 contra main 60337:** `baseline-main-scope.json` registra `changedInScope: []`. Verifiquei apenas pelo JSON, não pelo git.
- **AEP check attempt3 PASS sobre cd69780:** o comando está registrado e o exit é 0, mas o log não traz o stdout dos subprocessos. Não confirmei por conta própria as contagens 809 e 9. Os vermelhos e falhas históricas preservados não foram tratados como aprovação.

## Limites reais desta revisão

- Não executei nada: nem PG, nem E2E, nem build.
- Os trechos de teste do diff foram amostrados (PG R7/B1 lidos; montados, superfícies, E2E e preview por busca).
- Os logs T56c e o MANIFEST (SHA-256) não foram verificados.
- O fence não cobre writers de pagamento fora da V3 (Financeiro, lote), por decisão de escopo.
- Os R1/R2/R3 OpenAI foram usados apenas como contexto, não como R.

**Recomendação de gate:** corrigir o P2-1 e fazer uma nova R sobre o SHA corrigido, lendo então integralmente também os trechos de teste. Com P2 > 0, este candidato não autoriza close, merge ou publicação.