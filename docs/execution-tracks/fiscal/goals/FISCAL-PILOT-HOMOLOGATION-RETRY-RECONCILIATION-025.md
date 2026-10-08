<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025",
  "track": "fiscal",
  "title": "Plano governado de preservação imutável, reconciliação histórica 588 e correção explícita da mesma NFC-e; zero transmissão",
  "status": "READY",
  "class": "C3",
  "branch": "plan/fiscal-025-retry-reconciliation",
  "worktree": "C:/Users/rafae/.codex/visualizations/2026/10/08/01a1197c-6cff-7b13-8316-e4eb89fdd8c2/fiscal-025-plan",
  "test_command": "node scripts/track.mjs verify --all",
  "allowlist": [
    "docs/execution-tracks/fiscal/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025-PLAN.md"
  ],
  "gates_liberados": [],
  "read_budget": 180,
  "revisao_independente": true,
  "familia_executor": "openai",
  "risk_tier": "ALTO",
  "reversibilidade": "alta",
  "plan_ref": "FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025",
  "plan_rev": 4,
  "execution_mode": "PLAN_ONLY",
  "implementation_authorized": false,
  "previous_review": {
    "family": "anthropic",
    "verdict": "REQUEST_CHANGES",
    "reviewed_sha": "e3ea89934780fc4cee867f4c6b6f774b5c351a53",
    "source": "Pedido humano de correção B1-B4 em 2026-10-08"
  },
  "rereview_required": true,
  "rereview_executor_family": "google",
  "alternative_reviewer_family": "anthropic",
  "gates_extra": [
    "Re-R independente Google preferencial, Anthropic alternativa, pendente; READY não autoriza implementação",
    "Prova histórica 588 correlacionada READ-ONLY obrigatória antes de 025-C; proveniência insuficiente bloqueia",
    "025-C BLOCKED até guards validados/mergeados em main e Production READY com SHA contendo todos os guards",
    "G-F7 fechado; não ativar loja, armar janela nem consumir ativação",
    "G-F12 fechado; zero Production fiscal",
    "Zero contato SEFAZ; zero SOAP; zero transmissão de documento",
    "Zero rearm do job original e zero segundo job EMISSAO",
    "Qualquer write em banco, inclusive de teste, exige autorização humana posterior específica",
    "025-A: arquitetura/persistência imutável aprovada antes da escolha de implementação",
    "Schema/migration/storage novo exigem gate humano separado após auditoria 025-A",
    "025-B: implementação offline e testes dependem de autorização humana futura",
    "025-C: write em omnigestao_prod exige autorização humana explícita futura e delimitada",
    "025-D: readiness pós-write exige auditoria própria; não libera G-F7 automaticamente"
  ],
  "authorization_source": "Atualização humana em 2026-10-08: Codex/OpenAI executor; Google Gemini/Antigravity revisor preferencial e Anthropic alternativa; preservar escopo original B1-B4 PLAN_ONLY, sem merge antes da revisão independente. Pedido humano anexado em 2026-10-08: criar somente o plano canônico AEP do GOAL 025 em branch nova da origin/main atual, auditar primitives versionadas por leitura, commit/push e PR plan-only para main, solicitar revisão independente somente do plano e parar em READY_FOR_025_PLAN_REVIEW. Não autoriza código, schema/migration, banco, SEFAZ, rearm, janela, alteração de NotaFiscal ou criação de documento Fiscal. Pedido humano de correção em 2026-10-08 autoriza somente B1-B4 documentais após R Anthropic REQUEST_CHANGES no SHA e3ea89934780fc4cee867f4c6b6f774b5c351a53, commit novo docs(fiscal): corrigir plano 025 apos R independente, push normal apenas na branch plan/fiscal-025-retry-reconciliation, atualização do PR #247 e solicitação de re-R formal ao Claude Code/Anthropic; sem sincronizar main e sem merge."
}
-->

## Autorização humana vigente — alteração de executor e revisor

Em 2026-10-08, o humano autorizou IMPLEMENTER=CODEX, IMPLEMENTER_FAMILY=OPENAI,
REVIEWER_FAMILY=GOOGLE, REVIEWER_PREFERRED=GEMINI/ANTIGRAVITY e
ALTERNATIVE_REVIEWER_FAMILY=ANTHROPIC. Esta atualização substitui exclusivamente a
exigência anterior de re-R Anthropic/Claude Code, preservada abaixo como histórico.
A revisão OpenAI mencionada pelo humano é referência, sem aprovação do próprio corretivo.
A R formal anterior sobre e3ea899 foi Anthropic; sua atribuição histórica permanece preservada.
A aprovação final deve vir de IA independente de outra família.

O corretivo ativo continua sendo B1-B4 documentais deste mesmo GOAL, PLAN_ONLY e com
allowlist documental. Nenhuma fase funcional 025-A/B/C/D, schema/storage, write ou
transmissão recebe autorização adicional. Não fechar definitivamente nem fazer merge
antes da revisão independente; se indisponível, parar no gate de revisão.

REREVIEW_REQUIRED=true; REREVIEW_EXECUTOR_FAMILY=google;
ALTERNATIVE_REVIEWER_FAMILY=anthropic; REVIEW_VERDICT=PENDING.

# FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025

Plano de 2026-10-08 (America/Sao_Paulo), revisão documental 2 após R **REQUEST_CHANGES**.
**PLAN-ONLY; implementação não iniciada.** Status AEP **READY**, classe **C3**, risco **ALTO**.
Nenhum gate Fiscal liberado. Re-R formal pelo Claude Code / família Anthropic **obrigatória**.
Ponto de parada desta correção: **AWAITING_FISCAL_025_PLAN_REREVIEW**.

~~~text
R_FAMILY=anthropic
R_VERDICT=REQUEST_CHANGES
R_REVIEWED_SHA=e3ea89934780fc4cee867f4c6b6f774b5c351a53
REREVIEW_REQUIRED=true
REREVIEW_EXECUTOR_FAMILY=anthropic
~~~

A revisão anterior e B1-B4 são registrados conforme o pedido humano. Corrigir o plano não
constitui APPROVE nem fecha a R; o novo SHA publicado deve receber decisão formal Anthropic.
Codex/OpenAI executa estas correções e não realiza a própria re-R.

## Autoridade e ciclo AEP

Este GOAL materializa o planejamento solicitado. READY significa plano disponível para revisão,
sem aprovação de arquitetura, implementação, write ou transmissão. A allowlist atual é
exclusivamente documental; os caminhos prováveis de implementação abaixo não a ampliam.
O test_command atual verifica a governança do plano; não substitui os testes fiscais futuros.

Aplicar o ritual de planejamento de EXECUTION_PROTOCOL §2: criar este GOAL, regenerar derivados
com `node scripts/track.mjs registry`, verificar e commitar com caminhos explícitos.
Não editar state.json, LEDGER.jsonl ou REGISTRY.md manualmente. Preservar integralmente o ledger
e o 024 BLOCKED. Não executar `open fiscal` nem `close fiscal` nesta etapa: não há execução
aberta, e close ratificaria indevidamente a reconciliação como DONE. O protocolo é opt-in por
worktree, e .aep-active permanece ausente.

Após revisão independente e autorização humana futura, um ato governado deverá delimitar fase,
branch/worktree, allowlist, testes e gates antes de executar `status fiscal` -> `open fiscal`.
Cada autorização vale somente para seu escopo; nenhum gate posterior é herdado implicitamente.

Os registros da revisão documental 2, inclusive pedidos exclusivos Anthropic e seus
resultados, são histórico; a autorização vigente acima prevalece. plan_rev atual é 4.

## Fontes e preflight

- Fonte canônica curta: [evidência vigente do 024](../../../ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md),
  resultado BLOCKED_BY_RETRY_RECONCILIATION_REQUIRED; publicada pelo PR #242,
  merge `390a9753296c4494c2c818cbdc31dfa61e0fe63b`. Não copiar sua evidência integral.
- Base original do plano após fetch: `4e87fb13f53fa9f78e229d88b1b8566f95262ad0`; branch
  `plan/fiscal-025-retry-reconciliation`, criada diretamente dessa origin/main. Esta revisão
  parte de `e3ea89934780fc4cee867f4c6b6f774b5c351a53`, na mesma worktree isolada e PR #247,
  sem sincronizar main nem usar a worktree db-migration-reconciliation-001.
- [Auditoria de persistência e validação deste plano](../../../ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025-PLAN.md).
- ADR-0017: retry incerto relê os mesmos bytes; ADR-0018: preservação legal e espelho opcional.
  A exceção de correção 588 precisa de decisão explícita compatível com essas ADRs; não
  transforma o retry exato em permissão de reconstrução nem altera essas ADRs nesta entrega.

O estado do piloto abaixo vem do contexto humano e da evidência canônica do 024. Esta etapa
não abre conexão de banco, não consulta storage externo e não afirma uma nova leitura dos
bytes/snapshots/timestamps históricos. Toda execução futura deve revalidar o estado sob gate
específico; divergência impede a operação.

## Alvo único e estado recebido

| Campo | Valor obrigatório |
| --- | --- |
| store / ambiente / modelo / provider | loja-1 / HOMOLOGACAO / NFCE / SEFAZ_DIRETO |
| fiscalEnabled / G-F7 / G-F12 | false / BLOCKED / BLOCKED |
| vendaId | cmubufz1v000ch2mc5fknbpy6 |
| notaFiscalId / vigente / status | cmubufzhb000mh2mcvwan5e2m / true / TRANSMITINDO |
| série / número / contador proximoNumero | 1 / 2 / 3 |
| chave histórica e candidata esperada | 35260948241205000195650010000000021026842710 |
| jobId / tipo | cmubufzmf000ph2mcu6act9zk / EMISSAO |
| dedupeKey original | fiscal:emissao:v1:venda:cmubufz1v000ch2mc5fknbpy6 |
| job status / proximaTentativaEm / tentativas | AGUARDANDO_RETRY / null / 1 |
| consulta relacionada | cmuchau0k0009h21ck7yhtf7x / CONCLUIDO / NOT_FOUND |
| resposta histórica de autorização | cStat 588 em NFeAutorizacao4; xMotivo original não persistido |
| ultimoErro histórico exato | cStat 588 não consta da matriz 018.2; desfecho incerto. |
| NO_PENDING_AUTOMATIC_RETRY / NO_UNCERTAIN_STATE | true / false |
| NUMBER_REUSE_SAME_NOTA_SUPPORTED / NEW_NOTA_SAME_NUMBER_SUPPORTED | true / false |
| CURRENT_NOTE_CAN_REENTER_CANONICAL_PRETRANSMISSION | false |
| SUFFICIENT_PREVIOUS_ATTEMPT_PRESERVATION_PROVED | false |

A matriz versionada classifica 588 **somente em NFeAutorizacao4** como REJECTED, terminal=true,
numeroConsumido=false, requiresInutilizacao=false, requiresConsultation=false, sem retry
automático. NOT_FOUND, isoladamente, não prova rejeição 588 nem autoriza XML corrigido.


Complemento documental da R independente de 881ee4a (P3): incluir explicitamente
app/api/internal/fiscal/queue/route.ts, action=inutilizar, nos testes e caminhos
prováveis de 025-B. O guard em solicitarInutilizacaoAdministrativa e enqueueInutilizacao
continua obrigatório e protege ambas as rotas e chamadas diretas antes de qualquer write.
Também exigir recusa de cancelFiscalQueueJob/action=cancel para o job original protegido:
cancelamento genérico não pode alterar seu terminal reconciliado, payload ou contadores,
nem quebrar replay idempotente; testar zero writes e isolamento de jobs não protegidos.
A implementação desses guards permanece futura, sujeita a 025-A/B e seus gates.

### Evidência admissível do 588 histórico — B2

A classificação exige a cadeia completa abaixo, provada por leitura **READ-ONLY** antes
de 025-C. A evidência recebida do 024 não fornece hashes/timestamps completos; o plano
não afirma que essa prova já foi realizada. Revalidar a cadeia também no fingerprint/CAS.

1. Localizar os eventos persistidos fiscal.emission.persisted_before_transmission e
   fiscal.emission.uncertain com IDs/timestamps e mesmo storeId/vendaId/notaFiscalId.
   Ambos devem apontar ao jobId original cmubufzmf000ph2mcu6act9zk, tipo EMISSAO,
   dedupe v1 original; não aceitar job mais recente ou somente coincidência da venda.
2. Exigir detalhe.bytesSha256 não vazio e idêntico nos dois eventos e compará-lo ao SHA-256
   recalculado dos bytes assinados históricos preservados. Payload mutável, hash calculado
   somente agora ou logs sem esse vínculo não substituem o hash histórico registrado.
3. Comparar ultimoErro histórico por igualdade exata com
   **cStat 588 não consta da matriz 018.2; desfecho incerto.** Preservar texto e proveniência;
   substring 588, aproximação textual ou erro da consulta não servem. Correlacionar também
   detalhe.code do evento uncertain ao caminho histórico que produziu esse erro.
4. Provar que o desfecho veio de emissão **NFeAutorizacao4**, por proveniência histórica
   do serviço/operação e versão de código executada correlacionadas à mesma tentativa.
   Se o evento não registra o serviço, exigir cadeia auditável equivalente dessas fontes;
   o rótulo da matriz atual ou o estado NOT_FOUND não provam o caminho executado.
5. Exigir que consultationJobId do evento uncertain identifique
   cmuchau0k0009h21ck7yhtf7x, tipo CONSULTA, mesmo store/venda/nota/chave/ambiente, e seja
   coerente com o vínculo transmission.consultationJobId do job original quando disponível.
   Correlacionar os eventos fiscal.pilot.consulta_not_found_sem_retransmissao e
   fiscal.queue.completed ao job da consulta, seu CONCLUIDO/NOT_FOUND e cronologia
   persistida posterior à tentativa. Um NOT_FOUND de outra consulta não é admissível.
6. Registrar manifesto sanitizado com IDs dos eventos/jobs, hashes, timestamps observados,
   origem da prova do serviço e comparação exata do erro; manter valores brutos privados.
   Qualquer ausência, multiplicidade ambígua, divergência de hash/identidade/erro/serviço,
   cronologia incoerente ou proveniência insuficiente mantém **025-C BLOCKED**, sem write.

~~~text
SEFAZ_XMOTIVO_HISTORICAL=NOT_PERSISTED
HISTORICAL_588_PROVENANCE_READ_ONLY=NOT_YET_PROVED_IN_025
~~~

Não fabricar xMotivo nem copiar o rótulo da matriz como resposta original da SEFAZ.
O arquivo deve registrar explicitamente a ausência do xMotivo histórico. Mensagem local
futura deve ser identificada como local, sem se apresentar como resposta SEFAZ original.
**NOT_FOUND isoladamente não comprova o 588.** A matriz define a consequência aplicável
após a prova da tentativa; não produz evidência histórica ausente.

A prova exige transação com transaction_read_only=on, SELECTs escopados e ferramenta sem
logging que escreva em banco; não usar xml-storage-reader como reader puro (grava FiscalLog).
Expor somente o manifesto sanitizado, sem XML/segredos. Esta correção não abre conexão de
banco: a leitura futura depende de escopo/acesso aprovado e não libera qualquer write.

## Objetivo funcional futuro

Preservar imutavelmente a tentativa histórica antes de qualquer mutação da nota/job;
reconciliar a nota para REJEITADA/cStat 588 e o job original para terminal coerente, sem retry;
preparar somente uma reentrada explícita de correção D01e da mesma nota e fonte congelada.
Manter série 1, número 2, chave histórica, nota vigente e contador em 3.

Proibido aplicar essa exceção a TRANSMITINDO arbitrário, outras rejeições, denegação, nota já
autorizada/número consumido, outra loja, venda, nota ou job. Também ficam fora de escopo
novo documento Fiscal, segunda NotaFiscal, segunda EMISSAO, inutilização, refaturamento,
mudança de snapshot tributário e efeitos em caixa/estoque/financeiro.

## 025-A — decisão de arquitetura e persistência imutável

A auditoria versionada não encontrou primitive suficiente para arquivar esta tentativa
rejeitada com bytes, metadados e linhagem imutáveis. Resultado obrigatório:

~~~text
IMMUTABLE_ARCHIVE_STRATEGY=PRIVATE_IMMUTABLE_ATTEMPT_ARCHIVE_REQUIRED_PENDING_025_A
SCHEMA_OR_STORAGE_EXTENSION_REQUIRED=true
SCHEMA_CHANGE_REQUIRED=UNDECIDED_PENDING_025_A
025_A=BLOCKED_PENDING_HUMAN_ARCHITECTURE_DECISION
~~~

Mirror-vault inativo, FiscalLog, payload JSON mutável, hash sem bytes e backup genérico não
satisfazem o contrato. O R2 privado do Contador tem criação exclusiva em um caminho, mas
também sobrescrita/delete e escopo de outro HUB; não é arquivo Fiscal imutável pronto.
Triggers do domínio Pessoas não são storage de tentativas Fiscais reutilizável as-is.

A decisão humana 025-A deve escolher e justificar backend, vínculo persistente, fronteira de
imutabilidade, controle de acesso por loja, retenção, recuperabilidade e comportamento em
falhas. Alternativas a avaliar: registro Fiscal próprio com restrição efetiva a UPDATE/DELETE
e referência privada; ou arquivo privado de objetos com criação exclusiva, integridade,
política efetiva de não sobrescrita/remoção e manifesto/vínculo durável. Nome de tabela,
migration, provider e política de storage **não estão escolhidos nem aprovados** neste plano.

Exigir prova de imutabilidade na persistência, inclusive pelas credenciais do runtime;
readonly TypeScript, Object.freeze, chave com hash e convenção append-only não bastam.
Documentar limites administrativos do backend, retenção aprovada e acesso mínimo.
Qualquer nova schema/migration/storage exige **gate humano separado e explícito** após 025-A,
com diff e ambiente delimitados. Qualquer write para provisionamento ou testes em banco
também exige autorização posterior específica. Nada disso é implementado nesta etapa.

### Contrato obrigatório do arquivo histórico

Antes de alterar nota ou job, preservar em referência privada imutável:

- bytes UTF-8 exatos do XML assinado anterior, sem compactar, normalizar ou reassinar;
- SHA-256 dos bytes, tamanho/encoding e hash do manifesto; comparar hash previamente
  persistido quando disponível e registrar sua proveniência, sem inventar hash anterior;
- digestValue, qrCodeData, urlConsulta e ultimoErro originais;
- storeId, vendaId, notaFiscalId, jobId, modelo, ambiente, série, número, chave e serieFiscalId;
- snapshots congelados necessários (emitente, destinatário, pagamento/tributação, itens),
  versão/hash da fonte e lineage/correlação da tentativa;
- payload relevante original do job, dedupeKey, tentativas/maxTentativas, estado, datas e locks;
- cStat 588 histórico, serviço NFeAutorizacao4 e IDs/referências da cadeia B2;
  ausência do xMotivo histórico deste alvo marcada SEFAZ_XMOTIVO_HISTORICAL=NOT_PERSISTED;
- consulta NOT_FOUND relacionada, chave/ambiente/identidade consultados, resultado,
  timestamps e IDs técnicos, distinguindo momento histórico e momento de arquivamento.

XML/QR/erros/payload/snapshots potencialmente sensíveis ficam somente no arquivo privado.
Não guardar certificado, senha, CSC ou token nesse arquivo; usar apenas referências necessárias.
Nunca expor XML ou segredo em Git, FiscalLog, console, traces ou evidência documental.
Logs/evidência recebem somente IDs, hashes, referências opacas privadas e resultados sanitizados,
sem URL assinada ou conteúdo bruto.

Contrato idempotente por identidade da tentativa + hash do conteúdo/manifesto:
mesma identidade e mesmos bytes/metadados retornam o mesmo arquivo; conteúdo divergente
para a mesma tentativa falha fechado, sem substituição. Reabrir a referência e recalcular
SHA-256 é obrigatório antes de confirmar HISTORICAL_ATTEMPT_ARCHIVED/HASH_VERIFIED.
O vínculo imutável deve sobreviver a novos bytes na coluna atual e à mutação do payload.

A operação precisa de leitura consistente e fingerprint completo da nota/job/fonte consultados.
Se storage e banco não participarem da mesma transação, usar arquivo durável verificado
primeiro, seguido de CAS da reconciliação que compare o fingerprint e a referência.
Falha após arquivo e antes do commit permite replay do mesmo arquivo; arquivo órfão não
autoriza mutação, não é sobrescrito nem apagado por compensação automática.
Falha/ausência/divergência de arquivo ou metadado obrigatório => zero mutação da nota/job.
Não inferir dados faltantes a partir de venda/produto vivos ou das correções do 023.

## 025-B — implementação offline futura, após autorização

025-A aprovado e revisão independente do plano são pré-condições, não aprovação de execução.
Antes de implementar, exigir autorização humana específica, allowlist revisada, testes
delimitados e eventual gate separado para a extensão de persistência. Não liberar transporte.
Testes em memória não provam imutabilidade do backend: provas reais de persistência/CAS
dependem de ambiente isolado e gate de write próprio; sem essas provas, 025-B não passa.

### Guards persistentes contra reemissão e inutilização — B1

025-A deve definir um vínculo **persistente e protegido** entre a reconciliação 588,
o arquivo/tentativa original, store/venda/nota/job e identidade fiscal. Ele deve permanecer
consultável após alterações no JSON/payload e após reinício do runtime; status REJEITADA,
cStat isolado ou flag em JSON mutável não substituem esse vínculo. Falha/ambiguidade na
leitura do vínculo deve recusar o caminho antes de qualquer write.

025-B deve implementar guards obrigatórios em app/api/fiscal/inutilizacao/route.ts e
lib/fiscal/inutilizacao/**, tanto na entrada administrativa quanto nas chamadas diretas:

| Caminho protegido | Recusa obrigatória antes de qualquer write |
| --- | --- |
| POST action=reemitir e reemitirVendaAposRejeicao | Não enfileirar inutilização, trocar vigente, criar sucessora/job, alocar número nem alterar venda |
| POST action=inutilizar e solicitarInutilizacaoAdministrativa | Recusar série 1/número 2 e qualquer faixa que o contenha, mesmo com notaFiscalId omitido ou identidade fornecida divergente |
| swapReissueVigente em prisma-ports | Guard transacional antes de demover a nota ou criar sucessora; chamada direta não contorna a rota |
| demoteVigente em prisma-ports | Guard antes do update de vigente; a nota reconciliada continua vigente=true |
| enqueueInutilizacao | Guard antes de upsertJob, marca A_INUTILIZAR ou FiscalLog, inclusive chamada direta, replay ou pedido por faixa |

A resolução por faixa deve consultar o vínculo pelo escopo fiscal persistido completo
(store/modelo/ambiente/série/número), sem confiar no vendaId/notaFiscalId recebido para
ocultar a nota protegida. Proteger também createReissueNota e qualquer escrita delegada
que viabilize esses caminhos. Revalidar os guards junto ao write em transação/CAS com
serialização contra a reconciliação para evitar corrida entre leitura da guarda e mutação.
Caso protegido recusado produz **zero writes**, inclusive de log, zero enqueue e zero
consumo de ativação. A evidência sanitizada da recusa não deve depender de escrita em DB.

Invariantes pós-reconciliação, inclusive replay, concorrência, admin e chamada direta:
mesma NotaFiscal vigente, mesma chave, série 1/número 2, contador permanece 3,
nenhuma segunda NotaFiscal, nenhum segundo job EMISSAO, dedupe v1 preservada,
nenhuma inutilização indevida e venda permanece **REJEITADA**. O fluxo genérico de reissue
que presume número consumido não pode desfazer a reconciliação 588. Os testes focados
constam da tabela futura e são pré-condição de 025-B e do gate de deploy antes de 025-C.

### Reconciliação específica 588

A operação idempotente deve receber intenção explícita de reconciliação histórica 588,
alvo completo e referência de arquivo verificada; não chamar worker/transporte/consulta externa.

Pré-condições cumulativas: alvo exato da tabela acima, nota vigente TRANSMITINDO,
EMISSAO original AGUARDANDO_RETRY/null sem lease ativo, tentativas preservadas,
cadeia B2 integralmente comprovada para 588/NFeAutorizacao4 e consulta CONCLUIDO/NOT_FOUND,
política atual da matriz e ausência de autorização/protocolo/XML autorizado ou denegação.
Ausência, ambiguidade, outra espécie de cStat/serviço, drift de identidade/snapshot/hash,
mudança de estado ou lease concorrente bloqueiam. NOT_FOUND sozinho é insuficiente.

Após arquivo confirmado e hash verificado, uma única transação/CAS deve:

1. Validar novamente escopo, fingerprints, estado, contadores, arquivo e unicidade.
2. Terminalizar a mesma NotaFiscal como REJEITADA, cStat=588 e ultimoErro local coerente,
   sem inventar/preencher xMotivo histórico ausente nem usar o rótulo da matriz como resposta.
   Preservar bytes históricos e identidade/snapshots nesta fase.
   Não substituir erro de incerteza sem tê-lo arquivado.
3. Terminalizar o job original em **FALHA**, proximaTentativaEm=null, locks nulos e
   concluidoEm registrado; manter tentativas=1/maxTentativas e payload original recuperáveis.
   Vincular a referência/hash e a classificação terminal à mesma tentativa pelo vínculo
   persistente protegido que os guards B1 e de retry administrativo consultam.
4. Preservar série 1/número 2/chave, contador 3 e consulta concluída, sem outra nota/job.
   Alinhar somente a projeção fiscal necessária da venda para REJEITADA na mesma transação;
   essa mutação deve constar explicitamente no diff do gate 025-C, sem efeitos financeiros.
5. Registrar auditoria sanitizada específica 588, numeroConsumido=false,
   requiresInutilizacao=false, requiresConsultation=false, sem enqueue.
   Não reutilizar ação/mensagem genérica de markRejected que afirma número consumido.

Falha de CAS em qualquer participante desfaz a transação inteira. Uma segunda chamada
retorna replay idempotente somente se arquivo e estado terminal completos forem iguais,
sem novo arquivo, incremento de tentativas, log duplicado de efeito ou nova capability.
Estado parcialmente reconciliado ou divergente é conflito, não sucesso presumido.
NO_UNCERTAIN_STATE considera o estado operacional atual do alvo; logs históricos de uncertain
permanecem preservados e não devem ser apagados para produzir esse resultado.

### Job único, vínculo e bloqueio de rearm

Reutilizar obrigatoriamente cmubufzmf000ph2mcu6act9zk e o dedupe v1 da tabela.
Nenhum segundo EMISSAO para a venda/nota, nenhuma rotação de dedupe.
Substituir a resolução ambígua por "mais recente" de findEmissionJob nos caminhos afetados:
toda operação recebe e valida o jobId original/adquirido, storeId, vendaId, notaFiscalId,
tipo EMISSAO e dedupeKey; consultas/CAS retornam exatamente um vínculo, ou recusam.
Um job de contingência/consulta não pode ser escolhido em seu lugar.

FALHA impede aquisição automática, mas hoje queue-admin permite reprocessamento manual
genérico de FALHA. A implementação deverá bloquear esse atalho para o job reconciliado:
sem capability específica 588 e gates posteriores, não pode virar PENDENTE ou receber data.
Não habilitar authorizeExactRetransmission/consultationAuthorizedRetry para bytes corrigidos.
O admin deve consultar o mesmo vínculo persistente protegido, sem confiar em status/JSON
mutável; apagar ou alterar flags do payload não remove a proteção contra retry.
No GOAL 025, inclusive implementação offline e eventual reconciliação autorizada,
**zero rearm**, zero consumo de ativação, nenhum incremento de tentativas de emissão.

### Coordinator: bloqueio específico 588, sem número consumido — B4

Em 025-B, corrigir lib/fiscal/emission/uncertain-state-coordinator.ts para distinguir
REJEITADA reconciliada 588 comprovada pelo vínculo persistente protegido. O caminho
canônico de transmissão deve continuar bloqueado, com código específico planejado
**HISTORICAL_588_OFFLINE_CORRECTION_ONLY** e mensagem local específica planejada:
**Rejeição histórica 588 reconciliada; somente preparo offline mediante capability específica.
Transmissão permanece bloqueada; esta rejeição não consumiu o número.**
Não usar DOCUMENT_ALREADY_REJECTED com a afirmação genérica de número consumido para esse
caso. Código/mensagem e decisão devem ser testados antes de preparer, persistBeforeTransmission,
ativação ou provider. Outras rejeições e denegação/110 permanecem bloqueadas; não ampliar
a exceção por status, cStat isolado ou argumento do caller. markRejected e auditoria também
devem respeitar a semântica específica 588 e a ausência do xMotivo original.

### Reentrada explícita de correção, sem transmissão

Planejar capability/estado próprio, de uso único, vinculado a store/nota/job/tentativa
arquivada, hash da fonte, série/número/chave e versão da reconciliação. Persistência e
controle de consumo integram 025-A; booleano solto em JSON mutável não é autorização.
Ela autoriza apenas preparo offline, não aquisição pelo worker nem autoridade externa.

Exigir cumulativamente:

~~~text
HISTORICAL_ATTEMPT_ARCHIVED=true
HISTORICAL_ATTEMPT_HASH_VERIFIED=true
RECONCILIATION_588_COMPLETED=true
NO_PENDING_AUTOMATIC_RETRY=true
NO_UNCERTAIN_STATE=true
~~~

A capability é negada no estado inicial atual. Somente depois da reconciliação comprovada,
a correção pode usar a **mesma NotaFiscal**, snapshot congelado e lineage verificado.
Manter cNF/dhEmi e demais componentes históricos necessários à mesma chave, sem regeneração
aleatória nem relógio atual para substituir a fonte. Falta de componente verificável bloqueia.
O allocator deve retornar a numeração existente; zero reserveNextNumber/bind/incremento/decremento.

Fluxo permitido: fonte congelada -> builder/serialização compacta canônicos -> nova assinatura
-> XSD real com xmllint/--nonet -> XMLDSig verificada -> backstop D01e -> candidato offline.
Não usar compactação de transporte; trata-se de serialização XML sem whitespace intertag.
Novos bytes têm identidade/hash de tentativa distintos e jamais sobrescrevem o arquivo histórico.
Qualquer persistência do candidato precisa de gate humano de write próprio; não é autorizada
automaticamente pelo write de reconciliação 025-C. O preparo offline não pode deixar a nota
em TRANSMITINDO, agendar o job ou chamar emissão/consulta/provider externos.

A correção é um caminho separado de **preparo offline**, sem reentrada genérica na
persistência pré-transmissão. Mesmo após reconciliação, a nota atual não pode usar o
caminho canônico de persistBeforeTransmission:

~~~text
CANONICAL_PRETRANSMISSION_REENTRY_BLOCKED=RESOLVED_OFFLINE_ONLY
CURRENT_NOTE_CAN_REENTER_CANONICAL_PRETRANSMISSION=false
~~~

RESOLVED_OFFLINE_ONLY descreve a resolução planejada no desenho offline; não prova uma
capability implementada nem reabre a persistência canônica para a nota atual.
Não alargar persistBeforeTransmission para TRANSMITINDO/REJEITADA genéricos.
Executar as guardas de arquivo/reconciliação/reentrada **antes** de consumir ativação;
se bloqueada, zero consumo. Testar também que um candidato aprovado continua sem autoridade
de transmissão e sem rearm no 025. Uma futura emissão exige outro gate e contexto.

## Rastreabilidade dos blockers do GOAL 024 — B4

As resoluções são **planejadas**, não estados de banco já alcançados.

| Blocker de origem | Resolução planejada | Fase responsável | Evidência exigida | Risco residual |
| --- | --- | --- | --- | --- |
| UNCERTAIN_HISTORICAL_NOTE | Provar cadeia B2, arquivar antes de mutar e reconciliar somente o 588 para nota/venda REJEITADA e job original FALHA/null | 025-A define vínculo; 025-B implementa/testa; 025-C aplica sob gate; 025-D audita | Manifesto READ-ONLY correlacionado, archive recuperável/hash verificado, CAS e before/after sanitizados | Proveniência ausente/drift bloqueiam; NOT_FOUND não prova rejeição |
| CANONICAL_PRETRANSMISSION_REENTRY_BLOCKED | RESOLVED_OFFLINE_ONLY: capability restrita ao preparo offline separado e bloqueio/mensagem 588 no coordinator; persistência canônica continua fechada | 025-B; 025-D verifica limites | Testes de capability, código/mensagem específicos e CURRENT_NOTE_CAN_REENTER_CANONICAL_PRETRANSMISSION=false | Não há reentrada canônica nem transmissão; candidato persistido e futura emissão exigem gates próprios |
| PREVIOUS_ATTEMPT_PRESERVATION_REQUIRED | Arquivo privado imutável completo e vínculo durável verificados antes de qualquer mutação | 025-A decide; 025-B prova backend; 025-C verifica antes de CAS; 025-D relê | Bytes exatos/SHA-256/manifesto, metadados originais e prova real de retenção/recuperabilidade | Backend/política ainda não aprovados; hash/log isolado é insuficiente; falha mantém bloqueio |
| UNIQUE_JOB_RECONCILIATION_REQUIRED | Validar/reutilizar somente EMISSAO original e dedupe v1, jobId explícito, guards de admin/reissue/inutilização e identidade fiscal | 025-A vínculo; 025-B guards; antes de 025-C deploy B3; 025-D audita | Unicidade/concorrência, guards diretos e rota, contador 3, mesma nota/chave e SHA Production contendo os guards | Versão antiga, bypass ou ambiguidade bloqueiam; zero segundo job/nota e zero rearm |

## Ordem dos gates e limites

Todos os gates abaixo estão **pendentes/fechados**. Passar uma fase não libera a seguinte.

| Ordem | Gate | Prova/decisão exigida | Limite |
| --- | --- | --- | --- |
| 1 | 025-A | Decisão humana de arquitetura/persistência imutável e compatibilidade com ADR-0017/0018 | Não implementa nem provisiona; schema/migration/storage novo têm gate separado |
| 2 | 025-B | Implementação offline autorizada, revisão e testes positivos/negativos, integridade e CAS comprovados | Zero SEFAZ, zero banco real sem gate específico, zero rearm |
| 3 | 025-C | Cadeia READ-ONLY B2 + deploy B3 comprovados, seguidos de autorização humana explícita futura para writes delimitados em omnigestao_prod | Arquivo antes de mutação; diffs exatos nota/job/projeção da venda; sem preparo persistido/transmissão |
| 4 | 025-D | Auditoria de readiness pós-write e evidências sanitizadas de identidade/arquivo/terminalidade | Não consome ativação nem libera G-F7 |

### Gate obrigatório de deploy antes de write — B3

Antes de autorizar/executar qualquer write de 025-C, todos os guards novos de 025-B devem
estar **implementados e validados**, revisados, **mergeados em main**, **publicados em
Production**, com deployment **READY** comprovado e SHA publicado contendo cada guard.
Esta exigência inclui bloqueio administrativo de retry/reprocessamento, reissue/inutilização
(rota e portas diretas B1), job único/dedupe v1 e preservação da identidade fiscal.

Apresentar evidência sanitizada de testes/revisão, PR/merge e ancestralidade do commit de
guards no SHA publicado, deploymentId, target=Production, status READY, SHA publicado,
alias/runtime canônico ativo e data de verificação. Relacionar cada guard ao commit/caminho
contido nesse SHA. Preview READY, main isolada, deploy BUILDING/ERROR ou SHA sem os guards
não satisfazem o gate. Revalidar imediatamente antes do write; rollback/alias antigo/drift
invalidam a prova e exigem nova verificação.

Se Production executar versão anterior ou não for possível provar todos os guards ativos,
**025-C permanece BLOCKED**. A cadeia READ-ONLY B2 também deve passar antes desse gate.
Passar esses pré-requisitos não autoriza write: ainda é indispensável a autorização humana
específica de 025-C. **Nenhuma autorização atual permite write em omnigestao_prod.**
Merge e deploy de código são ações futuras sujeitas aos respectivos gates; esta correção
não implementa, não sincroniza main, não mergeia nem publica Production.

Antes de 025-C: apresentar ao humano commit revisado, identidade canônica da base,
pré-condições atuais, before/after por campo, procedimento idempotente, controles de
concorrência, recuperação em falha e escopo de acesso. Autorização limitada a reconciliação;
não autoriza migration, rearm ou write de candidato. Não imprimir DSN/segredos.
025-D pode exigir novo gate de preparo persistido, se necessário à prova de readiness.
Somente após 025-D poderá existir **proposta** de novo G-F7, nunca abertura automática.
G-F12 permanece fechado. Nenhuma etapa deste plano autoriza transmitir.

## Testes obrigatórios da implementação futura

| Caso | Resultado obrigatório |
| --- | --- |
| Archive falha, indisponível ou hash/manifesto diverge | Zero mutação nota/job/venda; nenhuma capability |
| Archive repetido com conteúdo igual | Mesma referência; criação exclusiva, sem sobrescrita |
| Mesma tentativa com conteúdo diferente | Recusa; arquivo original intacto |
| Outra loja/nota/job/venda, dedupe ou consulta | Isolamento e recusa sem efeitos |
| 588 histórico válido em NFeAutorizacao4 + NOT_FOUND correlacionado | Reconciliável somente com cadeia B2, arquivo verificado e gates B3/025-C; sem retry |
| Outro cStat ou 588 em serviço de consulta | Recusado; sem classificação de rejeição indevida |
| NOT_FOUND sozinho | Insuficiente; não libera reconstrução nem retry |
| B2: cadeia válida de eventos/job/hash/erro exato/NFeAutorizacao4/consulta | Prova READ-ONLY admissível; ainda exige archive, deploy e gate de write |
| B2: faltar/trocar cada evento, jobId, bytesSha256, erro, serviço ou consultationJobId | Cada variante recusa antes de write; proveniência insuficiente mantém 025-C BLOCKED |
| B2: xMotivo ausente e rótulo da matriz disponível | SEFAZ_XMOTIVO_HISTORICAL=NOT_PERSISTED preservado; nenhum xMotivo fabricado |
| B1: POST reemitir e reemitirVendaAposRejeicao direto na nota reconciliada | Ambos recusam antes de qualquer write/enqueue/alocação; identidade e venda REJEITADA intactas |
| B1: POST inutilizar/solicitarInutilizacaoAdministrativa para 1/2 ou faixa contendo 2 | Recusa com notaFiscalId presente, omitido ou identidade divergente; consulta vínculo fiscal persistido |
| B1: swapReissueVigente direto e createReissueNota delegado/direto | Recusa antes de demote/create; vigente=true e zero segunda NotaFiscal |
| B1: demoteVigente direto | Recusa antes de update; mesma nota vigente e mesma chave |
| B1: enqueueInutilizacao direto/replay/faixa contendo série 1/número 2 | Recusa antes de upsertJob, marca ou log; nenhuma inutilização indevida |
| B1: remover/alterar JSON/payload, reiniciar runtime ou falhar leitura do vínculo | Proteção persistente permanece; falha/ambiguidade recusa antes de write |
| B1: reconciliação concorrente com rota, demote, swap ou enqueue | Guard e write serializados/CAS; nenhum bypass nem efeito parcial; invariantes pós-reconciliação preservadas |
| B1: repetir cada recusa acima | Mesma nota/chave/1/2, contador 3, dedupe v1, zero segunda nota/EMISSAO, venda permanece REJEITADA |
| B3: guards validados e mergeados, Production READY com SHA/alias contendo todos | Pré-requisito de deploy satisfeito; sem autorização 025-C continua sem write |
| B3: cada guard ausente, SHA/alias antigo, Preview, deploy não READY ou rollback | 025-C BLOCKED e zero writes, mesmo com aprovação baseada em prova de deploy anterior |
| B4: coordinator com vínculo 588 reconciliado | HISTORICAL_588_OFFLINE_CORRECTION_ONLY e mensagem específica sem número consumido; zero preparer/persistência/ativação/provider |
| B4: outras rejeições ou denegação/110, com/sem capability simulada | Permanecem bloqueadas; nenhuma ampliação genérica da exceção |
| B4: quatro blockers do 024 e candidato offline válido | Rastreabilidade completa; RESOLVED_OFFLINE_ONLY e reentrada canônica false, zero authority externa |
| Denegação/número consumido ou nota autorizada | Recusa, inclusive protocolo/XML autorizado com status incoerente |
| Segunda reconciliação | Replay idempotente; zero efeito duplicado |
| FALHA/null após reconciliação e relógios diferentes | Job inelegível em worker genérico, piloto armado e takeover |
| Rearm pelo admin genérico ou retry exato | Recusado para a correção 588; nenhuma ativação consumida |
| Série/número/contador antes e depois | Mesma nota, série 1/número 2, chave igual, contador permanece 3 |
| Unicidade em replay e concorrência | Nenhuma segunda NotaFiscal; nenhuma segunda EMISSAO |
| CAS concorrente com worker, admin ou mutação da fonte | Um vencedor; perdedor sem efeitos parciais |
| findEmissionJob com duplicidade e job mais recente diferente | Vincula ao job validado/adquirido; ambiguidade recusa |
| Recuperação dos bytes históricos | Releitura privada byte a byte e SHA-256/manifesto verificados |
| Preparo de novos bytes | Não sobrescreve arquivo; novo hash/lineage e snapshot congelado |
| Reentrada bloqueada no preflight | Zero consumo de ativação, reserva numérica, persistência ou transporte |
| Candidato offline válido | Compacto, reassinado, XSD real/--nonet, XMLDSig e D01e aprovados; zero SEFAZ |
| Falha entre arquivo e CAS / replay após crash | Arquivo preservado, sem mutação parcial, retomada idempotente |
| Ausência de prova no backend real | 025-B pendente; doubles não certificam imutabilidade/concorrência real |

Rodar testes novos de emission/reconciliation/storage/queue/homologation e test/fiscal.
Verificar ausência de XML/segredos nos logs/erros/evidências. Tests de persistência real só
em ambiente isolado aprovado, sem rede SEFAZ; não usar omnigestao_prod para testes.

Regressão Fiscal futura obrigatória (comandos para execução autorizada, **não executados aqui**):

~~~text
npx vitest run lib/fiscal/xml/cstat588-compact-message.test.ts
npx vitest run lib/fiscal/xml/cstat588-produtores-compactos.test.ts
npx vitest run lib/fiscal/provider/sefaz/sefaz-cstat-matrix.test.ts
npx vitest run lib/fiscal/provider/sefaz/sefaz-envelope.test.ts
npx vitest run app/api/fiscal/inutilizacao lib/fiscal/inutilizacao lib/fiscal/emission lib/fiscal/reconciliation lib/fiscal/storage lib/fiscal/queue lib/fiscal/homologation test/fiscal
npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery
~~~

A última linha é a suíte canônica Fiscal ratificada do 023/024.
Exigir xmllint real no PATH, Schemas habilitado e --nonet sobre os mesmos bytes assinados;
nenhum mock/shim/skip substitui XSD. Repetir compact message, produtores compactos, matriz
cStat, envelope, XMLDSig e XSD. Reportar skips opt-in históricos com motivo; nunca chamar
um teste não executado de PASS. Sem contato externo no processo de regressão.

## Arquivos prováveis da implementação, sem autorização de edição atual

- lib/fiscal/emission/**: contrato/capability, fonte congelada, coordinator, persistência e jobId explícito.
- app/api/fiscal/inutilizacao/route.ts e lib/fiscal/inutilizacao/**: guards persistentes B1
  na rota, reissue/admin/enqueue/ports, faixa protegida, CAS e testes focados.
- lib/fiscal/reconciliation/**: operação 588, guardas, idempotência e CAS.
- lib/fiscal/storage/**: arquivo obrigatório, leitura/verificação e referência imutável.
- lib/fiscal/queue/**: job único, admin/worker e recusa de rearm genérico.
- lib/fiscal/homologation/**: preflight antes de ativação, transporte negado.
- lib/fiscal/provider/sefaz/**: integração com matriz/backstop, sem novo transporte.
- test/fiscal/** e testes adjacentes: casos negativos, positivos e concorrência.
- docs/fiscal/**, docs/decisions/** e docs/ai-execution/_evidence/**:
  decisão de arquitetura aprovada e evidência sanitizada.
- prisma/schema.prisma e prisma/migrations/**: **somente** se 025-A concluir indispensável
  e houver gate humano separado. SCHEMA_OR_STORAGE_EXTENSION_REQUIRED=true não é aprovação
  automática de mudança em Prisma; uma extensão de storage pode ser a alternativa decidida.

## Critérios de aceite futuros e ponto de parada

As condições abaixo são **alvos de prova**, não resultados atuais do piloto:

~~~text
HISTORICAL_ATTEMPT_ARCHIVED=true
HISTORICAL_ATTEMPT_HASH_VERIFIED=true
RECONCILIATION_588_COMPLETED=true
NO_PENDING_AUTOMATIC_RETRY=true
NO_UNCERTAIN_STATE=true
SAME_NOTA=true
SAME_SERIES=true
SAME_NUMBER=true
SERIE_NEXT_NUMBER_UNCHANGED=true
UNIQUE_JOB_STRATEGY=true
SAME_FISCAL_KEY=true
SECOND_NOTA_COUNT=0
SECOND_EMISSION_JOB_COUNT=0
IMPROPER_INUTILIZACAO_COUNT=0
VENDA_FISCAL_STATUS_AFTER_RECONCILIATION=REJEITADA
PERSISTENT_RECONCILIATION_GUARDS_VERIFIED=true
HISTORICAL_588_PROVENANCE_READ_ONLY=PROVED_BEFORE_025_C
SEFAZ_XMOTIVO_HISTORICAL=NOT_PERSISTED
PRODUCTION_GUARDS_DEPLOYMENT_READY=PROVED_BEFORE_025_C
PRODUCTION_SHA_CONTAINS_ALL_REQUIRED_GUARDS=PROVED_BEFORE_025_C
CANONICAL_PRETRANSMISSION_REENTRY_BLOCKED=RESOLVED_OFFLINE_ONLY
CURRENT_NOTE_CAN_REENTER_CANONICAL_PRETRANSMISSION=false
D01E_INTERTAG_WHITESPACE=0
XMLDSIG_VALID=true
XSD_VALID=true
EXTERNAL_SEFAZ_CONTACT=false
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0
~~~

Antes de 025-C, flags de arquivo/reconciliação são provadas no runtime de testes isolado
autorizado; não afirmar que omnigestao_prod mudou. Saída possível:
**READY_FOR_RECONCILIATION_WRITE_GATE**. Após eventual write 025-C autorizado e verificado:
**READY_FOR_POST_RECONCILIATION_READINESS_AUDIT**.

Nunca READY_FOR_THIRD_ATTEMPT automaticamente. O sucesso de testes/025-D não é autoridade
SEFAZ. Nesta correção, B1-B4 ficam cobertos **somente no plano**, sujeito à re-R formal.
Manter IMPLEMENTATION_STARTED=false, CODE_CHANGED=false, SCHEMA_CHANGED=false, DB_WRITES=0,
EXTERNAL_SEFAZ_CONTACT=false, G_F7=BLOCKED e G_F12=BLOCKED. Commit novo sem amend e push
normal somente para plan/fiscal-025-retry-reconciliation; atualizar o mesmo PR #247,
sem novo PR nem merge. Após publicar o SHA, solicitar re-R exclusivamente do plano ao
Claude Code / Anthropic, sem revisão própria Codex nem declaração antecipada de APPROVE.
Ponto de parada: **AWAITING_FISCAL_025_PLAN_REREVIEW**.
