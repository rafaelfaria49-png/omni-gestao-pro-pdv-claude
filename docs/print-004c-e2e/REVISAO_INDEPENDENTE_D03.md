# Revisão independente D03

Revisor: agente separado `/root/d03_independent_review`, somente leitura. Acesso ao diff e às evidências; não editou código, não executou testes, não acessou banco e não fez commit/push. O executor principal executou os testes.

**Parecer de código e documentos: APPROVE. Sem P0/P1/P2/P3 pendentes.** A aprovação não representa homologação física nem substitui os checks ainda em execução.

## Achados corrigidos

| Prioridade | Achado | Correção / evidência |
|---|---|---|
| P2 | Evento antigo de navegador não data cancelamento posterior de uma via SENDING que recebeu NO_EFFECT e foi substituída | exigir `COPY_CANCELLED` correlato; `cancelSafeCopies` registra individualmente na transação existente; R14 reproduz o legado sem evento e exige preservação |
| P2 | Ensaio D02 chamava `psql.exe` também no Ubuntu do workflow novo | nome por plataforma e erro de spawn tratado; SQL/migrations aprovados inalterados |
| P2 documental | Desligar gate global também bloqueia relatos; não existe pausa seletiva de novas emissões | runbook exige pausa humana mantendo gate ligado para drenar ACK; emergência preserva relatos no diário para replay após retomada, sem reenviar bytes |
| P3 | Comparação pós-conexão não decodificava nome de banco da URL | `decodeURIComponent` também na conferência do alvo real |
| P3 | Cursor avança em ocupados/erros; documento acima de 1.000 linhas fica preservado | limites e reinício sem cursor explicitados nos dois documentos |
| P3 | Novos motivos de cancelamento sem tradução no status | rótulos `REPRINT_REPLACED`/`EXPLICIT_FALLBACK` adicionados |

A primeira leitura pediu mudanças no cálculo da data. Após as correções, o revisor confirmou atomicidade dos cancelamentos, manutenção de UNKNOWN/SENDING, provas e consentimentos, referência de chave no evento de expurgo, privilégios mínimos, ausência de DELETE/endpoint público e fidelidade dos procedimentos de recuperação/rotação.

## Evidências verificadas pelo revisor

- D03 PostgreSQL: **17/17**.
- Core/agente/Windows/guardas: **78/78**.
- Cenários 004C: **35/35**, incluindo S32/S33 e D01-A1.
- Dois processos de agente: **1/1**; regressão 004B: **3/3**.
- D02: **8/8** e ensaio **5/5**.
- Playwright PDV/D01-A1: **19/19**, transporte simulado.
- Offline: **135/135** e PostgreSQL **10/10**.

O primeiro ensaio D03 encontrou timeout no hook que clona o banco, não falha de invariante. O timeout foi configurado explicitamente nos hooks e a reexecução 17/17 foi conferida. A integração offline inicial encontrou proprietário incorreto das tabelas do laboratório; aplicação do baseline com o papel do laboratório corrigiu o preparo e 10/10 passou.

Validação técnica adicional concluída pelo executor: typecheck completo, ESLint e build (sem autoridade de migration) com saída 0; oito mutações críticas detectadas, com restauração da fonte. O primeiro workflow foi recusado por contexto `runner.temp` indisponível no `env` do job; correção para diretório temporário Linux e verificação por actionlint. CI remoto é registrado nos checks da PR. Nenhuma aprovação é inventada para etapa ausente: `evidence/d03/VALIDACAO_D03.json` distingue PASS/FAIL/PENDING e referencia hashes dos logs. O manifesto oficial cobre fontes, documentação e evidências.

Impressão física e produção não foram executadas. Gate de release continua fechado.
