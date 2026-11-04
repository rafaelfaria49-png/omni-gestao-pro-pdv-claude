# D03-A — Expurgo, retenção e chaves

GOAL `OMNI-PRINT-D03-EXPURGO-RETENCAO-CHAVES-001`. Opção D03-A confirmada pelo proprietário. Base da PR #327 conferida no GitHub: `027bba5c9c505b349844cd22da62bb480b29b249`. Implementação em branch própria, sem mudar a #327, suas migrations D02 ou outra worktree.

`APPROVED_RELEASE=null`; impressão direta e job produtivo continuam desligados. Nenhum banco externo, dado comercial real, chave de produção, variável de produção, migration produtiva, deploy ou merge foi usado nesta entrega. Homologação física pendente.

## Retenção efetiva

`CONTENT_RETENTION_DAYS=7`, calculados com o relógio do PostgreSQL, sem parâmetro para reduzir o prazo. A validade operacional de conteúdo de 15 minutos e de autorização de 10 minutos continua independente da retenção de sete dias.

| Registro | Regra |
|---|---|
| `print_copies.payload_cipher` e `print_jobs.snapshot_cipher` | retirar somente de job `LOCAL_AGENT` com todas as vias comprovadamente finais, após sete dias do último término comprovável |
| `print_requests.command` consumido | retirar após o maior entre o término do job, consumo, emissão, revogação e expiração, mais sete dias |
| Requisição não consumida | retirar só o comando, após expiração/revogação mais sete dias; se a intenção já tem job, exigir também a conclusão desse job |
| `print_events.details` | somente objeto **vazio** em `JOB_REGISTERED`/`COPY_READY`, sem prova nem chave/hash de evidência, associado a job elegível; todo outro detalhe permanece |
| Documento, job, via, tentativa, evento, requestKey/sendKey, hashes, slot inicial | permanentes; o job nunca executa `DELETE` |
| Prova, motivo, risco, consentimento, origem/primeira via do navegador | permanentes, inclusive `RESULT_UNKNOWN` reconciliado e `COPY_CANCELLED` |
| Referência da chave | permanente: antes de limpar as colunas que o CHECK exige tornar nulas, registrar `snapshotKeyRef` e `payloadKeyRefs` no evento `CONTENT_PURGED`, na mesma transação |

Não se usa `JobView.final` para decidir: essa apresentação inclui resultados incertos. `REGISTERED`, `READY`, `SENDING`, `UNKNOWN`, tentativas `STARTED`/`UNKNOWN` e tentativas que ainda retêm o destino **bloqueiam o expurgo do job inteiro**, independentemente da idade ou lease vencido. O job não promove estados nem faz recuperação de impressão.

Para aceites usa-se `finished_at` e o último evento do job. `PRE_SEND_FAILED` só se torna elegível após também terminar a janela de retry (autorizações/conteúdo). `CANCELLED`/`EXPIRED` exigem evento correlato à própria via. Os dois caminhos de substituição existentes agora gravam `COPY_CANCELLED` individualmente, na mesma transação. Cancelamentos legados sem data inequívoca ficam preservados; evento antigo de navegador não serve como data presumida. Falta de prova ou inconsistência resulta em preservação.

Uma segunda via continua sendo reconstruída da venda confirmada pelo D01-A1: operador autorizado, consentimento assinado vinculado ao risco atual, novo job `REPRINT` e marca de segunda via. Ela não restaura os campos do job anterior. Repetir uma primeira via converge no slot/identidade permanentes e não produz novo envio.

## Job e segurança

`runPrintRetention` é um job em lote, chamado pelo CLI `tools/print-d03/run.ts`. Não há endpoint HTTP, serviço aberto, cron instalado nem agendamento ativo. O padrão é **DRY_RUN**, mesmo com a variável de habilitação definida. Execução exige simultaneamente `--execute` e `OMNI_PRINT_RETENTION_ENABLED=1`.

- Alvo explícito por host, banco e loja, usando somente `OMNI_PRINT_RETENTION_DATABASE_URL`; nenhum fallback para `DATABASE_URL` e nenhum carregamento de `.env`.
- Página de 25 documentos por padrão, máximo 100; cursor por UUID. Uma transação por documento, com o mesmo `FOR UPDATE` usado pelo core. `SKIP LOCKED` permite duas execuções sem repetir alterações.
- Metadados limitados a 1.000 linhas por relação/documento; acima disso **preserva todo o documento** e sinaliza `oversizedDocuments`. Não há varredura ilimitada nem concessão automática para aumentar o limite.
- `statement_timeout=5s`, `lock_timeout=200ms`, `idle_in_transaction_session_timeout=10s`; adaptador Prisma existente com timeout transacional de 15s.
- Falha antes do commit desfaz conteúdo e evento juntos. Falha de resposta após commit é resolvida pela repetição idempotente: conteúdo nulo com carimbo de expurgo não é regravado.
- Métricas por execução/página: documentos examinados, ocupados, grandes, transações concluídas; elegíveis e expurgados por via/job/requisição/evento; erros por código estável. Nenhum SQL, mensagem de erro bruta, segredo, conteúdo, nome de cliente ou URL é registrado.
- Papel dedicado, sem dono/superuser/membership no papel da aplicação. Template `least-privilege.sql`: leitura apenas do ledger, atualizações só nas colunas de expurgo, INSERT de eventos e UPDATE de `id` do documento apenas para obter o lock (alterá-lo é recusado pelo gatilho). Sem DELETE, DDL, mudança de estado ou acesso às vendas.

O papel é de operação interna para o ledger de múltiplas lojas, **não é uma credencial de lojista**. Todas as seleções e alterações do job são restritas à loja informada. Autorização das APIs de loja/agente permanece a existente. O job não depende das chaves de conteúdo ou assinatura e não modifica autenticação protegida.

Cursor é checkpoint de passagem, não garantia de conclusão. Ele avança inclusive por documento ocupado/com erro. Ao terminar uma passagem, a próxima **sempre começa sem `--after`**, para revisitar esses documentos e os que envelheceram. Não reutilizar o último cursor indefinidamente. Grandes documentos exigem análise e evolução separada do algoritmo; não apagar nem dividir histórico manualmente.

## Limites e chaves

Reutilizados sem duplicar implementação: duas vias, 200 itens, comando 16.384 bytes, snapshot/cupom 65.536 bytes e janela inicial de 30 minutos. O D01-A1 já retorna ao fallback aprovado nos limites de bytes/itens, sem emissão silenciosa em dois canais.

AES-256-GCM de conteúdo e HMAC de assinatura continuam no `PrintCrypto`, com duas chaves aleatórias independentes de 32 bytes, exclusivamente no ambiente protegido. A entrada agora também recusa codificação base64/base64url malformada; mesmo valor e comprimento errado já eram recusados. As chaves deste laboratório são efêmeras/sintéticas; nenhuma chave produtiva foi criada ou cadastrada.

Não há keyring de transição: a chave anterior deixa de abrir conteúdo/verificar tokens. `keyRef` identifica a chave de conteúdo, não um segredo nem a versão da assinatura. Rotação anual ou imediata sob suspeita; responsável e execução real dependem da liberação operacional. Procedimento e limites de recuperação em [RUNBOOK_D03.md](RUNBOOK_D03.md).

S32 é reutilizado: trocar a chave durante envio não interrompe o claim inteiro, não devolve conteúdo ilegível ao agente e não reenvia a via incerta. Relatos atrasados do agente continuam autenticados pela credencial própria e registrados. Tokens antigos falham fechado; uma requisição já preparada pode continuar submetida às autorizações e identidades duráveis existentes, sem criar novo original.

## Validação e revisão

Evidências novas ficam em `evidence/d03/`, separadas das baterias históricas. `verify.mjs` executa core/agente Windows, D03 PostgreSQL, S01–S35 (incluindo S32/S33/S34/S35), dois processos de agente, regressão 004B, D02, Playwright D01-A1/PDV, typecheck, ESLint e build sem autoridade de migration. O workflow próprio usa Node 24 e PostgreSQL 17 descartável; não recebe segredos de produção.

| Verificação local (Node 24 / PostgreSQL 17 descartável) | Resultado |
|---|---|
| Retenção D03, R01–R17 | 17/17 PASS |
| Core, agente Windows, guardas e D01-A1 | 78/78 PASS |
| Cenários S01–S35, incluindo S32/S33 | 35/35 PASS |
| Dois processos reais de agente / regressão 004B | 1/1 e 3/3 PASS |
| Compatibilidade D02 / ensaio de locks | 8/8 e 5/5 PASS |
| Playwright PDV Clássico e D01-A1 | 19/19 PASS, transporte simulado |
| Regressão offline / integração PostgreSQL offline | 135/135 e 10/10 PASS |
| Mutações críticas | 8/8 detectadas por falha de asserção; fonte restaurada |
| Typecheck completo / ESLint | saída 0 / saída 0 |
| Build local de produção | saída 0; `MIGRATION_SKIPPED`; sem migration/deploy |

A consolidação autoritativa é `evidence/d03/VALIDACAO_D03.json`: verifica os códigos de saída dos logs mais recentes e os hashes. Arquivos `summary*.json` preservam as tentativas anteriores, inclusive os erros de preparo corrigidos. O primeiro workflow remoto foi recusado por usar `runner.temp` em contexto não permitido; o diretório Linux foi corrigido e validado por actionlint. CI remoto é acompanhado nos checks da [PR draft #332](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/332), sem merge. Nenhum teste físico é classificado como PASS. Revisão: [REVISAO_INDEPENDENTE_D03.md](REVISAO_INDEPENDENTE_D03.md).

## Limites remanescentes

- Expurgo significa remoção lógica irreversível pelos escritores normais do ledger: os gatilhos recusam restauração e alteração posterior do carimbo. Não é promessa de apagamento físico imediato de páginas MVCC, WAL ou backups. O ciclo de backups/PITR depende da política do provedor, ainda sem execução produtiva.
- Um administrador capaz de restaurar o banco inteiro ou desabilitar gatilhos está fora dessa proteção. Qualquer recuperação deve manter o serviço desligado e reconciliar o ledger/tombstones até o instante do incidente antes de liberar impressão. Restaurar banco anterior ao expurgo diretamente em serviço é proibido pelo runbook.
- UNKNOWN não resolvido, cancelamento legado sem prova e documento acima do limite podem reter conteúdo por mais de sete dias. Isso é a regra conservadora aprovada, não inferência de conclusão.
- Volume comercial real, plano de backup e impacto em cópia autorizada de produção seguem pendentes. Os testes usam somente dados sintéticos, sem acesso comercial.
- Cron produtivo, aplicação D02, homologação física D04/D05 e liberação de `APPROVED_RELEASE` continuam fora desta execução.
