# G004 — resultado da execução local

Base exata G003 451b0e41ccf96215ed6c30e45ea2844dd0101faf; branch codex/omni-gestao-gastos-004. Commit ainda NÃO criado. R1 real solicitou correções; o delta foi implementado e validado e aguarda R2 independente, sem herdar aprovação ou exceção de lint.

Implementados os nove modelos e os sete contratos de operação de CONTRATOS_OPERACOES.json. Conta/título/movimento do HUB permanecem canônicos; pessoal global por owner sem Store, somente interno; HTTP novo exclusivamente empresarial. Estorno do HUB conserva chave e pagamento original, inclusive resposta perdida.

## Provas já executadas

| Conjunto | Resultado | Recibo externo |
|---|---:|---|
| unit-focused-r5 | 45 PASS, zero skip | unit-focused-r5.vitest.json |
| pg-domain-review-r9 | 51 PASS, zero skip | pg-domain-review-r9.vitest.json |
| pg-migration-meio-r2 | 6 PASS, zero skip | pg-migration-meio-r2.vitest.json |
| pg-regression-g001-r3 | 24 PASS, zero skip | pg-regression-g001-r3.vitest.json |
| pg-regression-g002-r3 | 97 PASS, zero skip | pg-regression-g002-r3.vitest.json |
| pg-routes-g002-r4 | 41 PASS, zero skip | pg-routes-g002-r4.vitest.json |
| pg-regression-pdv-r3 | 6 PASS, zero skip | pg-regression-pdv-r3.vitest.json |
| v3-g004-r3 | 109 PASS, zero skip | v3-g004-r3.vitest.json |
| pg-regression-g003-r3 | 102 PASS, zero skip | pg-regression-g003-r3.vitest.json |
| unit-regression-r4 | 820 PASS, zero skip | unit-regression-r4.vitest.json |

G004 tem51 cenários PostgreSQL distintos do domínio e6 de migration. Regressões PG:24 G001+97 G002+6 PDV+109 V3/OS+102 G003=338. Total PG distinto395. Unitários820+45, com6 de pagar repetidos=859 distintos. Identidades arquivo+posição do caso+nome completo foram conferidas: casos parametrizados/preexistentes com o mesmo nome têm posições distintas. Retestes não são somados outra vez.

As treze injeções SQL, inclusive falha diferida no COMMIT, provaram snapshot integral anterior igual ao posterior; repetir a mesma identidade após retirar o trigger de QA aplica uma vez. Nenhum trigger/constraint/RLS canônico foi desabilitado. Concorrência observou backends PostgreSQL diferentes e locks reais; sem retry de deadlock ou mudança dos timeouts de aplicação. O primeiro teste dirigido de inativação tinha um oráculo excessivo: exigia recusa mesmo quando SHARE compatível permitia commit antes do UPDATE. Foi corrigido para os dois resultados serializáveis, conservando recusa de qualquer erro SQL/deadlock ou efeito parcial. Não houve relaxamento de regra monetária.

PostgreSQL17.10 exclusivo em C:/Users/rafae/.codex/visualizations/2026/10/21/01a1601f-4e52-74a1-8887-2c958c8c5d2b/G004-execution/pgdata; porta principal55496, alternada temporariamente entre55493/4/5 para os guards originais. current_database/current_user/data_directory/loopback conferidos antes de DDL. Aplicação QA owner NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE; prova efetiva SET ROLE gastos_g004_reader não-owner/NOBYPASSRLS separada. O CREATEROLE do role G001 é somente o probe nativo de QA, sem grant produtivo. Baseline físico pré-G001 gerado do Git e SQLs exatos G001–G004; não se afirma replay de migrations históricas não relacionadas.

A primeira conexão foi recusada pelo sandbox; o processo próprio foi reiniciado fora dele. Um aviso de atualização Prisma misturado ao stdout SQL foi isolado e somente o banco vazio desta tentativa foi recriado após prova física/ausência de dados. A primeira migration G004 falhou por parênteses de CASE e sofreu rollback integral, comprovado no catálogo antes da aplicação corrigida. Argumento psql com acento foi substituído por texto ASCII na massa sintética. Logs falhos foram preservados. A primeira checagem direta tsc esgotou o heap padrão; o comando oficial npm run typecheck, com heap de4GB já previsto no projeto, passou antes e depois do build com as fontes finais. O primeiro build foi interrompido após falha de DNS do sandbox ao buscar Google Fonts; o segundo executou o mesmo comando oficial com acesso de rede autorizado e passou. Ambos os recibos foram preservados.

## Qualidade e revisão atuais

TYPECHECK=PASS (typecheck-review-r9, npm run typecheck integral exit0)
LINT_GLOBAL=BASELINE_FAIL (105 erros/113 avisos históricos, mesmos comando/config/deps/Node)
LINT_DELTA=PASS (218 correspondentes, zero novo/removido; lint focado30 arquivos zero erros/avisos)
BUILD=PASS (build-r3, npm run build integral exit0, MIGRATION_SKIPPED)
REVISAO_R=PENDING_DELTA_R2_REAL_SONNET_5_5

Sem conclusão do GOAL nem commit antes dos gates finais e R APPROVED expressa para o lint atual.

## Limites e próximos GOALs

A matriz em CONTRATOS_OPERACOES.json separa os aceites financeiros A06–A12/A16/A19 das partes futuras. A01–A20 não estão declarados completos. G005: reconciliação/base de consultas. G006/G008: entrega/retry da outbox. G007: canal/vínculo. G009/G010: STT/OCR/associação/E2E mídia. Pessoal público/UI/WhatsApp continuam desativados. Node local26.12.1 versus engines24.x é limitação de ambiente preservada, sem alteração de lock/configuração. Storage somente fixture; grants empresariais explícitos e revisão por operador autorizado permanecem gate antes de qualquer implantação.

Sem push/merge/rebase/reset/cherry-pick/deploy, credenciais de produção, DDL/grants/backfill/reparo produtivos, alteração fiscal ou mensagens financeiras externas. O acesso técnico de rede limita-se aos gates autorizados, incluindo fontes públicas do build e a revisão independente Claude Code. As decisões e evidências G001/G002/G003 e os WIPs da checkout primária permanecem preservados; reconferência final pendente do commit.


## Recusa definitiva e expiração do recibo HUB

O recibo só é descartado após ACK da identidade exata ou resposta4xx que identifique a mesma operação e operacaoRejeitada:true. Rede, JSON incompleto,5xx, identidade/flag ausentes ou divergentes mantêm a chave. OperacaoGastoError4xx do handler sinaliza recusa definitiva, após a transação financeira ter falhado sem efeitos. Se a revisão HUB PRONTA expirar sem operação, a aplicação devolve revisao_expirada409; o handler sinaliza a recusa e o browser pode iniciar uma intenção explícita nova. Não renovar silenciosamente revisão, data ou alvo. Uma operação já aplicada continua sendo replay pelo resultado persistido mesmo após a expiração da revisão.

## Limites de implantação e comportamento registrados após R1

O estorno HUB exige PerfilMembro empresarial atual: um operador que conseguia estornar antes pode receber403 até a concessão/revisão explícita por operador autorizado. Não há autoatribuição ou grant produtivo neste GOAL. Pagamentos anteriores ao M1 sem movimentoId/pagamentoId inequívocos e títulos com perfilId NULL podem retornar pagamento_exige_revisao/titulo_indisponivel. O UI atual não oferece resolução desses casos; requerem fluxo autorizado separado antes de uso produtivo, sem heurística ou backfill automático.

Falha de snapshot DRE ou da auditoria agora aborta integralmente fecharMes, em vez de produzir fechamento incompleto. Os cálculos DRE existentes foram preservados. Instantes Date e o fechamento diário sem data usam America/Sao_Paulo; strings de data civil conservam o dia explicitamente informado. O novo teste PG cobre01:59Z/03:00Z na fronteira outubro/novembro, fechamento diário/mensal, reabertura e replay sem alterar a data econômica.

A migration foi ensaiada por psql -f em baseline físico pré-G001 gerado do Git; não se afirma replay do histórico real nem execução de prisma migrate deploy. O SQL G004 mantém BEGIN/COMMIT explícitos. O pipeline de implantação, seus limites transacionais, a identidade/cutover do banco real e os grants exigem homologação separada; build continuou MIGRATION_SKIPPED. A prova efetiva RLS não-owner é de leitura; não certifica escrita não-owner, permissões produtivas ou proteção contra DBA/owner.

saldoCarteiraGasto relê o ledger sob lock e valida a precisão legada em memória, duas vezes em um pagamento. O custo é linear no histórico e pode provocar timeout seguro de20s em contas extensas; esse limite de disponibilidade exige medição e homologação de carga antes de implantação. Não foi substituído por soma SQL que deixasse de validar as anomalias. As medições de8000 linhas das regressões G002 são locais e não certificam esse caminho nem RTT/carga produtivos.

Documento ligado a título não sustenta uma nova despesa. Documento ligado somente a movimento pode acompanhar outro fato com grupo/chave distintos: deduplicação de bytes não é identidade universal do fato. Associação foto/áudio e deduplicação entre intenções pertencem ao fluxo futuro G006/G010, sem afirmar aceite integral de mídia neste GOAL.

Exceção necessária à recusa definitiva: acesso_negado e operacao_conteudo_divergente conservam o recibo, pois não provam ausência de resultado anterior da identidade. O PG HTTP prova COMMIT sem resposta, grant revogado403 mantendo a chave e restauração de acesso com replay dos IDs, sem outro estorno. Os41 handlers G002 foram repetidos sobre essa versão final; os97 da rodada r3 continuam como prova dos writers/migration, e seus41 casos repetidos são deduplicados por arquivo+nome.

Hashes do lint atual: baseline 67bcd38707df8c3687cbf316e913cb6d5a4a669c0318f94b8af062b2b1a15fbf; G004 7c3f86e9c8ff9fba22685ff69172daa8d68ea30265f197e275476a7d1bba3eb7; diferencial ae3ecf7dd6dd4a11727a06b72778c749a1c8cba1c90cbc01f07ace817f970f6c. A exceção global ainda exige aceite EXPRESSO da R nova para esses hashes.

## Delta após R1 real

O parecer R1 CHANGES_REQUESTED e sua proveniência integral estão preservados em REVISAO_R.json e review-r1-submission. Recusas definitivas de negócio OperacaoGastoError4xx (exceto acesso_negado/conteúdo divergente, que conservam identidade incerta) do PATCH agora identificam operacaoId/operacaoRejeitada:true, liberando o recibo somente para a identidade exata. Rede/JSON/5xx conservam a chave. Revisão HUB expirada retorna recusa definitiva sem renovar data/versão; nova intenção explícita usa chave nova. Se houve COMMIT, replay conserva os IDs mesmo depois da expiração. Provas HTTP/PG cobrem período fechado→reabertura e503→expiração→nova intenção, sem duplicação.

O fechamento diário default e Date explícita usam America/Sao_Paulo, em acordo com o G004. PG prova01:59Z/03:00Z na fronteira outubro/novembro contra fechamento diário/mensal, reabertura e replay posterior sem mudar instante. As13 injeções SQL agora exigem a mensagem do erro injetado, incluindo projeção do título/fatura e contador original de estorno; snapshot integral igual após rollback. As disputas de saldo/estorno/fechamento observam dois PIDs em wait_event_type=Lock ligados ao detentor por pg_blocking_pids antes da liberação.
