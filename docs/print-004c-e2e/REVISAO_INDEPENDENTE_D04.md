# Revisão independente D04

Revisor separado `/root/d04_independent_review`, somente leitura, sem edição, instalação, banco, commit ou push.
A revisão examina segurança, Windows, DPAPI, instalação, concorrência, duplicidade, recuperação e compatibilidade.

**Parecer: APPROVE — código e evidências de `683b0178ad844d10191e7fb2a0c96d28270297b1`**, sem achados técnicos pendentes.
O delta de consolidação do verificador/mutator e seus seis testes também foi revisado e aprovado em leitura separada.
Os checks do último commit consolidado são conferidos na PR antes da entrega; a aprovação nunca inclui D05 físico.

| Achado inicial | Tratamento implementado e conferido |
|---|---|
| Diário aberto antes da exclusão e reclaim por PID | lease do SO anterior ao diário; .lock protegido pelo mesmo FileStream; criação e liberação protocoladas |
| Escrita curta e corrupção intermediária ignorada | escrita completa + fsync; corrupção falha fechado; cauda truncada preservada com hash |
| Host órfão sem identidade e PID reaproveitado | registro durável antes de armar envio; PID/criação/imagem/SID/nonce; encerramento pelo handle verificado |
| Upgrade de host 004C não registrado | detecção por caminho do host e bloqueio conservador, sem matar por inferência |
| Handles do watcher sujeitos ao GC | referências Process estáticas e retorno de WaitForSingleObject verificado |
| Host aberto ao liberar trava e revogação no lote | close antes de release; 401 interrompe o restante do lote, parada persistente |
| Pareamento capaz de consumir dois códigos e sobrescrever credencial | lease comum, checkpoint e config exclusiva antes de permitir outro pareamento |
| ACL preexistente, contentId e release divergente | escritores validados, contentId recalculado e destino comparado ao pacote recebido |
| Start concorrente com manutenção | maintenance.guard mantido até terminar cada script modificador |
| Evidência simulada de morte do supervisor | teste agora cria e mata filhos reais; teste separado força morte do pai do host PowerShell real |

O primeiro ensaio local encontrou restrições de sandbox de arquivos/processos e módulos PowerShell herdados. O host passou
a usar caminho do PowerShell 5.1 e ambiente de módulos controlados, além de DPAPI CurrentUser explícito compatível com o
formato anterior. O runner revelou ACL com SID convertido como nome e múltiplos Nodes no PATH; as correções de identidade
tipada e seleção do primeiro executável validado foram conferidas. O guard Linux recebe tempo limitado para observar EOF,
sem jamais apagar trava. TypeError local fatal é separado de falha do transporte. Um erro de tipo no harness foi corrigido.

## Conferência independente dos artefatos

O revisor consultou a API GitHub, conferiu digests/IDs/head e executou apenas verificadores de leitura, sem repetir bateria
ou instalar software. Windows/Linux D04 run `41946614613`, D03 completo run `41946614583`, attempt 1, checkout técnico
`387d02e6b170401cdc2047169dd39916a94ca544`; ambos os workflows PASS no código `683b017`.

- Windows: 7/7 etapas; core/agente 78/78; recuperação 24/24; instalação/atualização/desinstalação reais no runner,
  tarefa Interactive/Limited/IgnoreNew e DPAPI em outro usuário PASS. Logs e hashes de preservação conferidos.
- Linux D04: 3/3 etapas, 18 casos aprovados e seis exclusivos do Windows cobertos no job Windows.
- D03: 16/16 etapas, retenção 17/17, cenários 35/35, dois agentes 1/1, 004B 3/3, D02 8/8+5/5, Playwright 19/19,
  offline 135/135+10/10, typecheck/lint/build; `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED` conferidos.
- Oito mutações distintas: saída `1`, falha de asserção real e fonte restaurada. O achado final de `exit=null` foi
  corrigido no mutator/consolidador e no novo verificador; seis testes recusam prova falsa, sem usar `FAIL` genérico.
- Pacote externo/interno: digests e 17 arquivos conferem com `git show 683b017`; contentId e SHA-256 reproduzidos;
  sem assinatura. Provas: `ci-windows-683b017.json`, `ci-linux-683b017.json`, `ci-d03-683b017.json`, `package-integrity.json`.

Não houve achado pendente após essa conferência. O histórico das tentativas com falha não é usado como prova de sucesso.

Nenhuma aprovação de código representa homologação física. D05 e produção permanecem sem execução/liberação.
