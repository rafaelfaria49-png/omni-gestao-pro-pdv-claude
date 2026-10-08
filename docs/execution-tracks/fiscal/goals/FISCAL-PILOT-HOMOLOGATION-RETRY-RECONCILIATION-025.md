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
  "plan_rev": 1,
  "execution_mode": "PLAN_ONLY",
  "implementation_authorized": false,
  "gates_extra": [
    "Revisão independente do plano 025 pendente; READY não autoriza implementação",
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
  "authorization_source": "Pedido humano anexado em 2026-10-08: criar somente o plano canônico AEP do GOAL 025 em branch nova da origin/main atual, auditar primitives versionadas por leitura, commit/push e PR plan-only para main, solicitar revisão independente somente do plano e parar em READY_FOR_025_PLAN_REVIEW. Não autoriza código, schema/migration, banco, SEFAZ, rearm, janela, alteração de NotaFiscal ou criação de documento Fiscal."
}
-->

# FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025

Plano de 2026-10-08 (America/Sao_Paulo). **PLAN-ONLY; implementação não iniciada.**
Status AEP inicial **READY**, classe **C3**, risco **ALTO**, revisão independente **obrigatória**.
Nenhum gate Fiscal liberado. Ponto de parada desta entrega: **READY_FOR_025_PLAN_REVIEW**.

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

## Fontes e preflight

- Fonte canônica curta: [evidência vigente do 024](../../../ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md),
  resultado BLOCKED_BY_RETRY_RECONCILIATION_REQUIRED; publicada pelo PR #242,
  merge `390a9753296c4494c2c818cbdc31dfa61e0fe63b`. Não copiar sua evidência integral.
- Base após fetch: `4e87fb13f53fa9f78e229d88b1b8566f95262ad0`; branch nova
  `plan/fiscal-025-retry-reconciliation`, criada diretamente dessa origin/main.
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
| resposta histórica de autorização | cStat 588 em NFeAutorizacao4 |
| NO_PENDING_AUTOMATIC_RETRY / NO_UNCERTAIN_STATE | true / false |
| NUMBER_REUSE_SAME_NOTA_SUPPORTED / NEW_NOTA_SAME_NUMBER_SUPPORTED | true / false |
| CURRENT_NOTE_CAN_REENTER_CANONICAL_PRETRANSMISSION | false |
| SUFFICIENT_PREVIOUS_ATTEMPT_PRESERVATION_PROVED | false |

A matriz versionada classifica 588 **somente em NFeAutorizacao4** como REJECTED, terminal=true,
numeroConsumido=false, requiresInutilizacao=false, requiresConsultation=false, sem retry
automático. NOT_FOUND, isoladamente, não prova rejeição 588 nem autoriza XML corrigido.

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
- cStat 588 histórico, serviço NFeAutorizacao4, xMotivo e IDs/referências da evidência confiável;
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

### Reconciliação específica 588

A operação idempotente deve receber intenção explícita de reconciliação histórica 588,
alvo completo e referência de arquivo verificada; não chamar worker/transporte/consulta externa.

Pré-condições cumulativas: alvo exato da tabela acima, nota vigente TRANSMITINDO,
EMISSAO original AGUARDANDO_RETRY/null sem lease ativo, tentativas preservadas,
evidência correlacionada 588/NFeAutorizacao4, consulta correlacionada CONCLUIDO/NOT_FOUND,
política atual da matriz e ausência de autorização/protocolo/XML autorizado ou denegação.
Ausência, ambiguidade, outra espécie de cStat/serviço, drift de identidade/snapshot/hash,
mudança de estado ou lease concorrente bloqueiam. NOT_FOUND sozinho é insuficiente.

Após arquivo confirmado e hash verificado, uma única transação/CAS deve:

1. Validar novamente escopo, fingerprints, estado, contadores, arquivo e unicidade.
2. Terminalizar a mesma NotaFiscal como REJEITADA, cStat=588, xMotivo confiável e
   ultimoErro coerente; preservar bytes históricos e identidade/snapshots nesta fase.
   Não substituir erro de incerteza sem tê-lo arquivado.
3. Terminalizar o job original em **FALHA**, proximaTentativaEm=null, locks nulos e
   concluidoEm registrado; manter tentativas=1/maxTentativas e payload original recuperáveis.
   Vincular a referência/hash e a classificação terminal à mesma tentativa.
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
No GOAL 025, inclusive implementação offline e eventual reconciliação autorizada,
**zero rearm**, zero consumo de ativação, nenhum incremento de tentativas de emissão.

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

Não alargar persistBeforeTransmission para TRANSMITINDO/REJEITADA genéricos.
Executar as guardas de arquivo/reconciliação/reentrada **antes** de consumir ativação;
se bloqueada, zero consumo. Testar também que um candidato aprovado continua sem autoridade
de transmissão e sem rearm no 025. Uma futura emissão exige outro gate e contexto.

## Ordem dos gates e limites

Todos os gates abaixo estão **pendentes/fechados**. Passar uma fase não libera a seguinte.

| Ordem | Gate | Prova/decisão exigida | Limite |
| --- | --- | --- | --- |
| 1 | 025-A | Decisão humana de arquitetura/persistência imutável e compatibilidade com ADR-0017/0018 | Não implementa nem provisiona; schema/migration/storage novo têm gate separado |
| 2 | 025-B | Implementação offline autorizada, revisão e testes positivos/negativos, integridade e CAS comprovados | Zero SEFAZ, zero banco real sem gate específico, zero rearm |
| 3 | 025-C | Autorização humana explícita futura para writes delimitados em omnigestao_prod | Arquivo antes de mutação; diffs exatos nota/job/projeção da venda; sem preparo persistido/transmissão |
| 4 | 025-D | Auditoria de readiness pós-write e evidências sanitizadas de identidade/arquivo/terminalidade | Não consome ativação nem libera G-F7 |

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
| 588 histórico válido em NFeAutorizacao4 + NOT_FOUND correlacionado | Reconciliável somente após arquivo verificado |
| Outro cStat ou 588 em serviço de consulta | Recusado; sem classificação de rejeição indevida |
| NOT_FOUND sozinho | Insuficiente; não libera reconstrução nem retry |
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
npx vitest run lib/fiscal/emission lib/fiscal/reconciliation lib/fiscal/storage lib/fiscal/queue lib/fiscal/homologation test/fiscal
npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery
~~~

A última linha é a suíte canônica Fiscal ratificada do 023/024.
Exigir xmllint real no PATH, Schemas habilitado e --nonet sobre os mesmos bytes assinados;
nenhum mock/shim/skip substitui XSD. Repetir compact message, produtores compactos, matriz
cStat, envelope, XMLDSig e XSD. Reportar skips opt-in históricos com motivo; nunca chamar
um teste não executado de PASS. Sem contato externo no processo de regressão.

## Arquivos prováveis da implementação, sem autorização de edição atual

- lib/fiscal/emission/**: contrato/capability, fonte congelada, coordinator, persistência e jobId explícito.
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
SEFAZ. Nesta entrega, somente **READY_FOR_025_PLAN_REVIEW**, PR plan-only aberto,
sem merge, implementação, rearm, banco ou transmissão; solicitar revisão independente
exclusivamente deste plano antes de qualquer próxima fase.
