# Revisão independente D04

Revisor separado `/root/d04_independent_review`, somente leitura, sem edição, instalação, banco, commit ou push.
A revisão examina segurança, Windows, DPAPI, instalação, concorrência, duplicidade, recuperação e compatibilidade.

**Parecer final: PENDING**, aguardando rechecagem dos corretivos e evidências do último commit/CI.

| Achado inicial | Tratamento implementado, sujeito à conferência final |
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
formato anterior. Resultados reexecutados e CI serão registrados sem atribuir PASS a etapa ausente.

Nenhuma aprovação de código representa homologação física. D05 e produção permanecem sem execução/liberação.
