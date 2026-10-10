# GOAL 002 — evidências anteriores ao congelamento, revisão 7

Executor: Codex/OpenAI, autorizado excepcionalmente pelo proprietário para C4. Estes arquivos registram a implementação e suas observações; não constituem revisão R. O pacote final e a execução do AEP check serão produzidos após o commit funcional em ../../../review-rev7/ (evidências ignoradas pelo Git para preservar o SHA avaliado).

## Histórico preservado

- HEAD inicial funcional: f3e3bdf578daa4368a5891bf7fa165584d4c6479.
- Implementação Anthropic preservada: 2223aa3, 7e45876 e 6155b4d0d3f905c99f45ade0b029e566bd64a672.
- Base de comparação de regressões: 98ef7172a915713ad177207112f6aff3db9801a1 (worktree -002-base preservada, inclusive junction).
- PR de governança #261, merge 60337ff116e831e1e7e13597a4e6622a6df131ed. Revisão 7, família openai, classe C4, risco ALTO e R obrigatória. Allowlist, gates, test_command e orçamento preservados. BLOCKED externo 3/3 anterior transportado fielmente; GOAL 003 apenas acompanha plan_rev 7 e não é iniciado.
- Integração normal da main no produto: eb9d8514c942673ad2071a8c5d8c905bf9806172. Nenhum reset, rebase ou force push.

## Diagnóstico e solução

P1-A: a classificação de exceções por mensagem/digest era usada como prova de que a baixa não aconteceu. Connection closed., timeout e recusa de permissão antes do replay podiam apagar a identidade incerta. Agora toda exceção é incerta. A resposta imediata moderna é aditiva: CONFIRMADO com prova, RECUSADO_DEFINITIVAMENTE somente após decisão serializada e recusa persistida, ou INCERTO. A recusa persiste sem expirar: uma requisição original atrasada não pode gravar depois. O contrato legado dos callers server-side é preservado.

P1-B: refs separadas para imediato/misto admitiam outra modalidade com chave nova após resposta perdida. Agora há um envelope único por [storeId, osId], com modalidade, operacaoId e input completo congelado antes do primeiro await. O browser preserva o envelope no localStorage; sincroniza instâncias e eventos de storage. O servidor grava a pendência no MESMO commit financeiro, sob advisory OS → sessão → OS → título. Nova modalidade, novo conteúdo, a prazo e estorno ficam bloqueados enquanto pendente. O reconhecimento autenticado exige ID, modalidade e fingerprint originais; uma leitura sem resultado não prova ausência. Replay vem antes da elegibilidade, do estado atual do caixa e da pendência de outra operação.

Verificar mesma confirmação reenvia exatamente o input original. Troca de OS/loja não recebe resultado tardio no alvo novo. Persistência inválida, permissão insuficiente e falha no reconhecimento mantêm o bloqueio e orientam conferência autorizada. Nenhuma nova tabela/migration/permissão/motor financeiro global. Metadados não incluem credenciais; incluem somente os campos necessários da confirmação financeira.

## Prova vermelha e verde

- RED-BASELINE.md, red-mounted.log: 11 testes montados falharam antes da correção sobre os mesmos fontes de 6155b4d. red-postgres.log: uma resposta perdida seguida de misto admitia segunda baixa/caixa/movimentação. Sem correção antecipada do produto.
- dedicated-tests.log: 109/109 verdes (montados e PostgreSQL real). Identidades, conteúdo alterado, permissão antes de replay, perda de resposta, confirmação negativa durável, caixa fechado, estorno, CAS e barreiras determinísticas com pg_stat_activity são verificados. Contagens incluem título/baixa/caixa/movimentação/a prazo/OS.
- core-tests.log: 493/493; preview-tests.log: 20/20 selecionados pelo filtro oficial do GOAL (os demais são excluídos pelo filtro, sem acrescentar skips).
- goal001-tests.log: 76/76; fluxo003.log: 4/4; fluxo005-pg-tests.log: 47/47; fluxo006-pg-tests.log: 70/70; fluxo006-tests.log: 52/52.
- v3-misto-tests.log: 20/20; v3-misto-pg-tests.log: 109/109; v4-misto-tests.log: 29/29; v4-misto-pg-tests.log: 1/1; datas-tests.log: 10/10; datas-pg-tests.log: 34/34.
- Typecheck e lint passaram nas execuções anteriores; logs vazios indicam ausência de diagnósticos. Builds locais passaram com MIGRATION_SKIPPED; não executaram migration. Serão repetidos no SHA congelado.

## Limitações e observações preservadas

- preview-full-base.log: 321 passam e 10 falham na base 98ef717. preview-full-candidate.log: 325 passam e os MESMOS 10 testes falham no candidato. O guard de envio imediato foi adaptado à variável que preserva o input original, mantendo a verificação do split e da chamada; nenhuma asserção financeira foi removida.
- fluxo007-pg-tests.log: 66 passam e T56c falha. base-fluxo007-tests.log passou uma vez (67/67). As três observações isoladas T56c-base-1..3 e T56c-candidate-1..3 falham em ambos, inclusive com a mesma mensagem original de interrupção. Fonte da action e do teste T56c são idênticos à base. O teste usa setTimeout(0) para ordenar concorrência; não foi modificado fora da allowlist. Não se declara a regressão 007 integralmente verde.
- e2e-frg002.log preserva a primeira execução: os seis cenários anteriores passaram; o novo replay imediato chegou ao resultado, mas comparava JSON como string e falhou somente por ordem das propriedades. Passou a comparar objetos decodificados, preservando todos os campos.
- e2e-frg002-before-timeout-adjustment.log preserva a execução seguinte: timeout de 25 s no recibo do primeiro cenário. O contexto já mostrava o recibo após o timeout. A mesma asserção agora usa o orçamento IDA_E_VOLTA (60 s) já existente para ida/volta real ao servidor; retries continuam zero. A validação E2E final ainda precisa ser executada no SHA congelado.

## Segurança e revisão

Todos os testes financeiros usaram PostgreSQL local descartável, host 127.0.0.1:45708 e bancos QA com nomes verificados em tempo de execução. Nenhuma mutation em produção, acesso administrativo produtivo ou alteração da OS-2026-00025.

veredito-r1.md, veredito-r2.md, veredito-r3.md e pacote-r3.md são cópias fiéis dos pareceres anteriores OpenAI sobre o candidato Anthropic. NÃO aprovam o novo candidato OpenAI. R final deverá analisar o diff COMPLETO contra 60337ff e o SHA exato por Anthropic ou humano qualificado. Sem APPROVE real e P0=P1=P2=0: não executar close, merge de produto nem deploy. GOAL 003 e 008 permanecem intocados.

Os logs brutos e pareceres anteriores são arquivados sem normalização de fim de linha ou limpeza de espaços. O .gitattributes deste diretório aplica essa preservação somente aos arquivos de evidência, mantendo texto e diffs legíveis e deixando os checks de whitespace dos fontes inalterados.

## Tentativa 1 da revisão 7 — AEP check em 3027772

O check falhou no item 10: o novo E2E misto fotografava o banco ao ver o aviso LOCAL de pendência, antes de a requisição do servidor terminar. A foto inicial era vazia e a foto posterior tinha exatamente uma baixa de R$ 100 e uma parcela de R$ 320. O teste passa a aguardar explicitamente route.fetch + abort da resposta real e exige título/caixa já presentes na foto inicial. Nenhuma asserção econômica removida. attempt1-* preservam check, SHA, contexto e resultado originais. A CLI oficial registrou a falha e abriu tentativa 2/3; o produto não foi fechado/publicado. A correção seguinte altera somente a barreira do novo teste e documentação de evidência.

Prova da barreira corrigida: attempt2-e2e-barreira.log registra 3/3 (autenticação sintética + imediato + misto), sem retries. Ambos comprovam commit real antes da foto, input original após refresh e ausência de segunda baixa/caixa/OS. A validação integral será repetida após este commit.

## Compatibilidade e prova adicional na tentativa 2

A regressão E2E-C de #238 em ec3b5cf mostrou que o botão principal do PDV V3 bloqueava também PIX 50 + PIX 50, representação canonicamente equivalente à confirmação perdida de PIX 100. O teste E2E legítimo ficou intocado. O PDV agora admite somente esse replay equivalente: compara conteúdo completo (incluindo sessão, saldo esperado original e intenção), exige o mesmo escopo e envia SEMPRE o input original congelado. Outra forma/valor/modalidade continua bloqueada e o botão Verificar mesma confirmação continua disponível. Teste montado de #238 confirma bloqueio com forma diferente e igualdade profunda dos dois inputs enviados. v3-replay-equivalente-20.log: 20/20; dedicated-replay-equivalente-109.log: 109/109. A falha E2E anterior é preservada para auditoria.

A prova PostgreSQL de dois operadores agora usa IDs e nomes distintos entre as duas sessões autenticadas simuladas, com writers/guard/locks/contagens reais; a segunda recebe o recibo original com o primeiro operador. operadores-distintos-109.log registra 109/109. Sem mudança nos writers financeiros.
