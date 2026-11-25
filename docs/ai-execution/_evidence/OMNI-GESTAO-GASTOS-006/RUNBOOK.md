# Operação e recuperação G006

Documento para revisão. Nenhum comando de cloud/DDL/grant abaixo foi aplicado fora dos clusters sintéticos exclusivos. Ativação, segredos e deploy exigem gate humano separado. Não usar produção ou serviços de outra trilha.

## Bootstrap e configuração

Gerar Prisma no host com Node24.22.1 e lock existente. O entrypoint usa tsx4.23.1 já fixado em devDependencies; o pacote de worker precisa de npm ci --include=dev ou empacotamento futuro autorizado que o inclua. Não alterar package/lock/vercel/config global para executar este GOAL. Não copiar .env, engine Windows ou tokens para o frontend/imagem/log.

```text
node --import tsx workers/gastos/index.ts
node --import tsx workers/gastos/index.ts --health
node --import tsx workers/gastos/index.ts --once
```

| Variável privada | Contrato |
|---|---|
| GASTOS_WORKER_ENV | teste ou homologacao; production recusado. |
| GASTOS_WORKER_DATABASE_URL | Login omni_gastos_worker. teste só loopback/gastos_g006_test; homologação só banco remoto com nome gastos_g006_hml_<identificador>, idêntico ao GASTOS_WORKER_APPROVED_DATABASE, e sslmode=require. Conferir host/projeto/DB por fonte autorizada antes de configurar. |
| GASTOS_WORKER_APPROVED_DATABASE | Nome exato do banco sintético de homologação aprovado pelo gate, prefixo gastos_g006_hml_. Não é autorização de deploy; host/projeto/DB precisam de conferência humana. |
| GASTOS_WORKER_MODE | STAGING padrão. SIMULADO só em teste com dependência injetada; CLI não fornece transporte. Nenhum modo Meta real. |
| GASTOS_WORKER_CONCURRENCY | 1 padrão, entre1e8; dimensionar pool para concorrência+heartbeats e capacidade do banco. |
| GASTOS_WORKER_LEASE_MS | 30000 padrão, entre3000e300000; heartbeat do claim a cada lease/3. |
| GASTOS_WORKER_POLL_MS | 1000 padrão, entre100e30000; fila continua no banco. |
| GASTOS_WORKER_SEND_TIMEOUT_MS | 10000 padrão, máximo60000 e menor que a lease. |
| GASTOS_WORKER_SHUTDOWN_MS | 20000 padrão, entre1000e60000 e não menor que timeout. |

Health CLI valida login, ausência de super/BYPASS/owner/qualquer DML fora da allowlist técnica e SELECT fora das oito tabelas necessárias, ausência de memberships, RLS das seis tabelas e pulso ATIVO recente60s; retorna códigos/contagens, sem URL/credencial/payload. Não há rota HTTP pública nova. Supervisor do host deverá executar o health por canal privado e alertar sobre ausência de pulso, DLQ, ENVIO_INCERTO e falhas DB. --once é ensaio de um lote, não daemon em nuvem.

O cancelamento cooperativo via AbortSignal é ensaiado em Windows; a entrega real de SIGTERM/SIGINT pelo supervisor Linux precisa da prova cloud. SIGTERM/SIGINT impedem novos claims, cancelam espera e sinalizam o transporte simulado; tarefas em andamento são aguardadas com limite do processo. A deadline nunca marca sucesso. Se o processo terminar, lease vencida permite retomada ou estacionamento incerto conforme a fronteira já persistida. As tarefas de uma rodada são todas aguardadas, inclusive quando uma falha, mantendo o limite de concorrência.

## Papel SQL e confiança

Migration não cria roles nem grants. DBA do ambiente aprovado deve usar logins separados omni_gastos_ingress, omni_gastos_worker e omni_gastos_operator, todos NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE, sem ownership ou membership em papéis privilegiados. Migration owner é separado. Nenhum desses logins é credencial de usuário final; não expor a Supabase/browser/PostgREST. Revisar privilégios herdados e CREATE público, TLS/rotação/segredo antes da implantação.

| Papel | Capacidade necessária |
|---|---|
| ingress | SELECT canais/inbox, INSERT inbox; SELECT/INSERT jobs STAGING apenas via RLS, INSERT de evento técnico do trigger. Sem operação financeira. |
| worker | SELECT canais/inbox, UPDATE estado inbox sob imutabilidade; SELECT/INSERT origens; SELECT/INSERT/UPDATE jobs/pulsos; SELECT/INSERT eventos. SELECT apenas operações/outboxes com origem correspondente via RLS. EXECUTE dos dois helpers estreitos g006_autorizar_escopo/g006_canal_vigente. Sem INSERT/UPDATE/DELETE de dinheiro/auth. |
| operator | SELECT/INSERT/UPDATE canais; SELECT jobs e UPDATE somente de estado, envioEstado, externalMessageId, reconciliacaoRef, falhaCodigo, tentativasCiclo, runAfter, prazoEm e updatedAt (9 colunas; sem lease); SELECT/INSERT eventos; somente SELECT(id,canalId) em inbox e SELECT(id,inboxId) em origens para reconciliar identidade. Sem conteúdo/remetente e sem DML financeiro. |

O script QA FINAL efetivamente aplicado está em E/qa-grants-r4.sql, com hashes/provas de papel no relatório. Não executá-lo automaticamente em banco externo. Os helpers SECURITY DEFINER têm search_path fixo, relações qualificadas, sem SQL dinâmico, EXECUTE PUBLIC revogado e saídas mínimas. Fazem FOR SHARE sem conceder UPDATE de auth/finanças ao worker; logs não incluem a linha privada. Registrar canal/ativação/reprocessamento exige login técnico operador, não um role enviado em body.

Histórico: qa-grants.sql e qa-grants-r3.sql foram substituídos pelo contrato FINAL qa-grants-r4.sql; não usar os grants históricos. O final retira SELECT de financeiro_perfis/financeiro_perfil_membros e limita UPDATE do operador às9colunas descritas na tabela. O health varre todas as relações públicas para INSERT/UPDATE/DELETE/TRUNCATE e SELECT efetivos, inclusive privilégios por coluna e herdados, e recusa qualquer membership. A allowlist de SELECT é canais, inbox, origens, jobs, eventos, pulsos, financeiro_operacoes e gastos_outbox; as duas últimas continuam filtradas por origem/RLS. DELETE/TRUNCATE não são permitidos em nenhuma relação. Cada operação de escrita técnica tem allowlist própria.

No alvo autorizado, o DBA deve fixar UTC nos três logins (aplicado somente nos próprios clusters QA nesta execução):

```sql
ALTER ROLE omni_gastos_ingress SET timezone='UTC';
ALTER ROLE omni_gastos_worker SET timezone='UTC';
ALTER ROLE omni_gastos_operator SET timezone='UTC';
```

As datas novas G006 usam timestamptz(3); claim/lease mantêm instantes absolutos mesmo com sessão Pacific/Honolulu, ensaiada em PostgreSQL. A comparação com createdAt legado G004 interpreta explicitamente esse campo como UTC. Registrar SHOW timezone e identidade do banco/papel na futura prova cloud. credencialRef só aceita WHATSAPP_CANAL_TOKEN_<identificador>; o resolvedor recusa DATABASE_URL, GASTOS_WORKER_DATABASE_URL, NEXTAUTH_SECRET e qualquer referência fora desse namespace.

G007 precisa fornecer binding verificado e locks de revogação no transaction client do port. G006 não oferece binding persistido real nem autoriza mensagem financeira sem ele. Admin ativo, capacidade financeira, ownership pessoal ou membership+grant empresarial e perfil ativo são revalidados antes do início de cada entrega. Referência/versão do binding e versão do canal permanecem fixadas na origem.

## Recuperação

1. Inspecionar estado, falhaCodigo, tentativa e datas técnicas. Não copiar conteúdo de inbox, tokens ou JSON financeiro para tickets/logs compartilhados.
2. Job STAGING PROCESSANDO com lease vencida pode ser reclamado com token novo. O token antigo não conclui/renova. Tentativas/prazo esgotados vão a ESTACIONADO.
3. ENVIAR_RESULTADO em INICIADO após expiração vai a ENVIO_INCERTO. Não usar reprocessarJob nesse estado e não reenviar por outro número ou identidade.
4. Para temporário antes de envio ou429 com rejeição comprovada, respeitar runAfter e limite5/ciclo, máximo20 na estrutura e prazo24h. Configuração/auth/payload/poison requer revisão e estacionamento.
5. Operador SQL autorizado chama reprocessarJob para ESTACIONADO sem aceite/incerteza. Motivo enumerado CONFIG_CORRIGIDA/PROVEDOR_RESTAURADO/REVISAO_TECNICA fica em evento append-only. Mesmo id/chave/outbox/origem; contador total e histórico não são apagados. Tentativa que falha novamente preserva ambos.
6. Reconciliação exige evidência específica do mesmo job/canal e ID externo consistente. G006 só ensaia ProvaSimulada. ACEITO não é ENTREGUE; status não pode regredir de entregue. Só NAO_ENVIADO comprovado em job incerto o estaciona como REJEITADO e permite reprocessamento explícito. Port de prova Meta real permanece gate posterior.
7. Queda após commit financeiro antes da resposta: prepararOutbox encontra a operação e a origem imutáveis, cria um único job e nunca chama aplicarOperacaoGasto. Falha de fila não remove o resultado; falha do provedor não muda carteira/título/pagamento. Sem origem WhatsApp, outbox HUB não é enviada.

Nenhum caminho de recuperação altera payload financeiro, perfil, grupo, destinatário ou canal para fazer retry funcionar. Se a autorização ou versão mudou, manter bloqueado e resolver no fluxo autorizado futuro; não fabricar vínculo/loja/sessão. Pessoal global não ganha Store ou acesso por ser administrador de uma loja.

Rotação/ativação que incrementa versão é proibida operacionalmente enquanto houver saída pendente, estacionada ou incerta daquele canal. Antes da mudança, preparar a outbox, conferir zero pendências e interromper novos ingressos no host autorizado. metricasWorker expõe CANAIS_COM_SAIDA_PENDENTE; conferir a identidade e contagem do canal por consulta privada:

```sql
SELECT i."canalId", count(*) AS pendentes
FROM gastos_jobs j JOIN gastos_origens_canal o ON o.id=j."origemId"
JOIN whatsapp_gestao_inbox i ON i.id=o."inboxId"
WHERE j.tipo='ENVIAR_RESULTADO' AND j.estado<>'CONCLUIDO'
GROUP BY i."canalId";
```

Desativação emergencial por revogação pode bloquear jobs antigos, como provado pelo teste P; manter CANAL_ALTERADO estacionado e não rotacionar/reassociar para contornar. Uma saída antiga exige procedimento de rebind auditado a definir/autorizado no G007, sem modificar origem ou aplicar dinheiro novamente.

O banco impõe transições de job/envio inclusive contra UPDATE direto do worker/operador. ENVIO_INCERTO só sai com operador e nova reconciliacaoRef; CONCLUIDO é terminal e ACEITO só avança para ENTREGUE, preservando ID externo. A referência documenta prova obtida pelo port, não substitui prova real do provider. G007 só poderá classificar CONFIG/PAYLOAD/POISON como não enviados antes de qualquer byte transmitido; após a fronteira, dúvida vira TIMEOUT/DESCONHECIDA e não libera reenvio.

## Retenção e rollback

Não há rotina automática de exclusão: inbox/origem/eventos e fatos são preservados. Política de retenção de conteúdo, mídia, logs e backups precisa ser aprovada antes do piloto. O staging não deve ficar indefinidamente com dados reais sem esse gate. Nenhum dado real entrou nos testes.

Pulsos de processo sem atualização por 60s deixam de provar saúde; o próximo bootstrap os marca PARADO e o monitor informa PULSOS_EXPIRADOS. Linhas antigas são preservadas para diagnóstico. Antes do piloto, aprovar prazo/rotina de retenção desses metadados junto com a política acima, sem exclusão automática neste GOAL.

Rollback operacional consiste em interromper o worker/ingresso autorizado e desativar o canal via versão, preservando filas, histórico e dinheiro. Não derrubar tabelas/constraints, zerar tentativas, editar outbox G004 ou repetir aplicação como recuperação. Git revert não desfaz lançamentos nem envio externo.

## Prova pendente e parada

Para liberar cloud: autorização explícita do host/projeto/região/orçamento e do candidate, migration/grants revisados, secrets somente técnicos, build/commit identificado, logs/health e queda/reinício observados fora do computador. Apenas dados sintéticos/STAGING, sem transporte real. Não afirmar G006_COMPLETE antes dessa prova. G007/OTP/ingresso Meta/STT/OCR/confirmação e ativação pessoal continuam fora desta entrega.

Correções após R3: homologação aceita somente sslmode=require, sslaccept=strict opcional, schema=public e limites numéricos de pool; parâmetros duplicados, host= e demais overrides são recusados. CANAL_ALTERADO durante INSERT pede nova resolução, sem classificar envelope válido como payload permanente. Datas técnicas novas usam dbgenerated(clock_timestamp()) e o teste inspeciona somente nomes de colunas INSERT, sem payload/params, para provar defaults no banco.

Grants QA finais em E/qa-grants-r4.sql: operador só atualiza estado/envioEstado/externalMessageId/reconciliacaoRef/falhaCodigo/tentativasCiclo/runAfter/prazoEm/updatedAt; não atualiza lease. Reduzir ciclo ou estender prazo só em ESTACIONADO→PRONTO pelo operador; agenda/prazo/ciclo também geram evento. O health nega CREATE em public e no banco e EXECUTE de funções públicas diretamente chamáveis fora da allowlist: dois helpers G006 e o validador somente leitura STABLE/SECURITY INVOKER g004_compensacao_individual_valida(jsonb), herdado via PUBLIC. Funções RETURNS trigger não são APIs chamáveis diretamente. Não revogar PUBLIC de funções herdadas G004, pois alteraria contratos financeiros fora desta trilha; nenhuma permissão financeira é acrescentada. Sondas QA provam a rejeição de CREATE e EXECUTE inesperados.

A função herdada g004_compensacao_individual_valida não é pura: consulta movimentacoes_financeiras com os direitos do chamador. O worker não tem SELECT nessa tabela; a chamada é recusada por permissão e a varredura SELECT do health também recusa uma concessão posterior. A exceção não concede leitura financeira nem execução com privilégios do owner.

Contrato final de UPDATE do operador, para o DBA do alvo já autorizado (papel novo sem grants excedentes/herdados; nenhuma execução externa nesta etapa):

```sql
GRANT SELECT ON public.gastos_jobs TO omni_gastos_operator;
GRANT UPDATE (estado, "envioEstado", "externalMessageId", "reconciliacaoRef",
  "falhaCodigo", "tentativasCiclo", "runAfter", "prazoEm", "updatedAt")
ON public.gastos_jobs TO omni_gastos_operator;
```

Não conceder UPDATE de tabela inteira ou de leaseOwner/leaseToken/leaseUntil ao operador. Antes da ativação, conferir privilégios efetivos (incluindo PUBLIC/memberships) e executar as sondas negativas de lease do QA; qualquer grant anterior excedente precisa ser revogado pelo DBA no gate do alvo.

Limitação R4 a investigar antes de uso real de respostas/G008: o createdAt legado de financeiro_operacoes usa @default(now()). Não foi confirmado se o Prisma o vincula com relógio do app. Se isso ocorrer e houver skew entre hosts, a comparação temporal com a origem DB pode negar um dispatch legítimo (fail-closed), preservando outbox e dinheiro. Confirmar pelo INSERT real instrumentado no alvo autorizado; não alterar G004 nesta fundação por hipótese não comprovada.
