---
title: ADR-0024 · Arquivo histórico WORM com referência PostgreSQL protegida
status: aceita
data: 2026-10-12
autor: Codex / OpenAI
revisores: [Gemini / Google, Rafael Faria / humano]
hub: cross
tags: [fiscal, arquivo, imutabilidade, reconciliacao, multi-loja]
substitui: null
superado_por: null
needs_strong_human_approval: true
---

# ADR-0024 · Arquivo histórico WORM com referência PostgreSQL protegida

> **Status: aceita — decisão humana documental 025-A.** Opção B: bytes originais e manifesto no ArchiveBundle/v1 em objeto privado WORM, com referência permanente PostgreSQL protegida. HUMAN_ARCHITECTURE_DECISION=B_APPROVED. A é rejeitada para a ameaça administrativa forte; C permanece alternativa documentada.
>
> Aprovação explícita de Rafael Faria em 2026-10-12, após [R independente Google/Gemini](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719) sobre e3c9d4a416972a65b1283b568ae5b13d3897b5c8 (APPROVE; NEW_BLOCKERS=NONE; recomendação B). A revisão incremental do SHA final e o merge documental serão registrados no PR #265; o parecer anterior não aprova automaticamente este delta.
>
> Fase exclusivamente documental 025-A do [GOAL 025, plan_rev=5](../execution-tracks/fiscal/goals/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.md), aprovado no PR #247, merge 1fd90905e05656444576cf83c9df6c46919a917a. O plano canônico não é alterado.

## 1. Contexto

O 024 constatou uma nota TRANSMITINDO com resposta histórica 588, job EMISSAO estacionado e consulta NOT_FOUND. A classificação atual da matriz não reconcilia o histórico. Antes de qualquer alteração futura, é necessário recuperar integralmente a tentativa anterior, inclusive se a coluna operacional ou o payload forem alterados depois.

A evidência herdada identifica loja-1, HOMOLOGACAO, NFCE, SEFAZ_DIRETO, mesma venda/nota/job, série 1/número 2 e contador 3. Não houve leitura de banco, XML ou storage nesta fase; hashes, eventos e timestamps reais ainda precisam ser provados pela cadeia B2 do plano. NOT_FOUND sozinho não prova 588. O xMotivo original é NOT_PERSISTED.

A [auditoria de contratos](../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md) confronta o código na base atual com ADR-0017/0018. O espelho ativo resolve para no-op; XmlStorageMirror é opcional, aceita strings e não fornece retenção, criação exclusiva, versão ou recibo verificável. O reader grava FiscalLog. Guards TypeScript/WHERE atuais não demonstram bloqueio de UPDATE/DELETE pelas credenciais runtime.

CURRENT_STATUS e o roadmap são contexto histórico; para o alvo, a autoridade é o GOAL 025 aprovado e sua evidência 024. Nenhuma afirmação de readiness é inferida desses índices.

## 2. Decisão aprovada

### 2.1 Fronteira e modelo de ameaça

Adotar B: um ArchiveBundle/v1 com bytes originais, manifesto e estado privado congelado em WORM object storage; PostgreSQL guarda somente referência protegida, identidade, hashes, linhagem e metadados de custódia necessários à verificação/CAS, sem réplica integral do bundle ou do manifesto. As colunas operacionais mantêm a autoridade prevista na ADR-0018 para o documento corrente.

S3 Object Lock COMPLIANCE é o perfil técnico de referência aprovado para a ameaça administrativa forte, com versionId permanente e separação administrativa. Isso não contrata AWS nem outro fornecedor. Prazo/marco de retenção, conta, região e demais parâmetros operacionais continuam pendentes de gates próprios. R2 Bucket Locks só poderá substituir esse perfil mediante nova aceitação humana explícita dos riscos administrativos; a decisão B atual não concede essa aceitação.

A garantia é: durante a retenção, uma tentativa selada não pode ter bytes, manifesto, identidade ou localizador alterados/excluídos pelas credenciais runtime; releitura devolve exatamente os bytes arquivados e seus hashes. A proteção deve existir no backend mesmo em chamadas diretas que contornem o adapter. Não basta hash na chave, Object.freeze, convenção append-only, backup ou bucket privado.

Ameaças consideradas: bug; worker/admin concorrente; replay; payload adulterado; credencial runtime comprometida; DBA/owner; administrador cloud; perda de banco, objeto, permissão ou chave criptográfica. PostgreSQL não resiste ao superuser/owner capaz de remover suas proteções. COMPLIANCE protege a versão retida inclusive contra root, mas não garante disponibilidade, continuidade da conta ou sobrevivência da chave de decriptação. Essas limitações exigem custódia separada, controles de acesso e restauração testada. [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [considerações de operação](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).

Hash detecta alteração comparando com âncora protegida; não autentica sozinho o produtor nem prova que o conteúdo original é verdadeiro. Uma primeira gravação maliciosa ou a perda simultânea de todos os domínios permanece risco. A cadeia B2 antecede o selo; o sistema falha fechado se não conseguir verificá-la.

### 2.2 Contrato lógico privado da tentativa

Nomes abaixo são conceituais, sem aprovação de tabela/migration.

| Bloco | Conteúdo obrigatório / origem |
| --- | --- |
| identity | storeId, vendaId, notaFiscalId, jobId original, tipo EMISSAO, dedupeKey original, tentativa histórica 1, modelo, ambiente, provider, série 1, número 2, chave e serieFiscalId persistidos; discriminador do evento histórico, nunca horário novo |
| xml | XML assinado original como bytes binários exatos; encoding UTF-8, tamanho, SHA-256 calculado e hash histórico com evento/proveniência; sem trim, normalização Unicode, alteração CRLF/LF, compactação, parsing/serialização ou reassinatura |
| metadata | digestValue, qrCodeData, urlConsulta, ultimoErro originais; valores privados, com indicação PRESENT/NULL/NOT_PERSISTED; não recalcular QR ou digest a partir de dados vivos |
| historical588 | cStat=588, operação NFeAutorizacao4, erro histórico exato e detalhe.code; IDs/timestamps de persisted_before_transmission e uncertain, hashes históricos coincidentes, serviço/versão executada comprovados; SEFAZ_XMOTIVO_HISTORICAL=NOT_PERSISTED |
| frozenSource | snapshots Emitente/Destinatario/Pagamento, tributação/diagnóstico, todos os NotaFiscalItem e demais campos congelados necessários; versão da fonte, ordenação de itens e hash canônico; sem Produto/Cliente/Venda vivos como fonte substituta |
| originalState | estado/campos relevantes originais da nota, vigente, XML autorizado/protocolo/cStat/xMotivo presentes ou ausentes; job original, payload relevante, tentativas/maxTentativas, datas, locks e dedupe; série/contador 3 e projeção fiscal da venda observados |
| consultation | job CONSULTA relacionado, mesmo escopo/chave/ambiente, CONCLUIDO/NOT_FOUND, payload relevante, eventos de consulta e completed, IDs/timestamps e cronologia posterior à tentativa |
| lineage | attemptId imutável, correlação histórica, parentAttemptId explícito (ou ausência comprovada), sourceFingerprint, versão do contrato/serializador, hash do manifesto e localizador privado permanente; futuras correções terão lineage separado |
| custody | backend/conta lógica, chave opaca, versionId exato, tamanho/hash integral, modo/retainUntil comprovados e recibo de gravação; capturedAt separado de timestamps históricos; dados de custódia protegidos no vínculo |

O alvo exato está no plano canônico, sem repetir chave/CNPJ/identificadores operacionais em exemplos públicos. Na execução futura, comparar cada identificador por igualdade, sem alias de loja e sem escolher o job mais recente. Preservar o erro exato do plano, nunca fabricar xMotivo SEFAZ a partir da matriz ou de mensagem local.

O XML atual é Text/UTF-8. A captura futura converte a string persistida uma única vez para bytes UTF-8 e exige igualdade com SHA-256 histórico registrado. Isso prova os bytes persistidos/registrados; se a cadeia não comprovar os bytes originalmente transmitidos, bloquear em vez de reconstruir uma certeza. JSONB não preserva a serialização original: snapshots/payload são preservados como valores lógicos congelados e representação canônica, sem alegação de igualdade textual histórica.

Excluir certificado/PFX, senha, CSC, tokens, DSN e credenciais do arquivo. Extrair apenas campos relevantes previamente inventariados; ausência/ambiguidade de campo necessário bloqueia. Uma referência a segredo não contém seu valor. XML, QR, erros e snapshots integrais permanecem privados, inclusive no pacote enviado a revisores.

### 2.3 Formato, fingerprint e referência

Adotar um único objeto binário determinístico ArchiveBundle/v1, sem compressão: cabeçalho versionado com comprimentos, manifesto canônico UTF-8, segmento xml original e segmento privateState canônico UTF-8. O XML é um segmento bruto, nunca uma string reserializada dentro de JSON. O manifesto interno é parte do mesmo objeto WORM; não há janela entre arquivos de XML e manifesto.

O manifesto descreve identidade, versão, comprimentos e SHA-256 de xml/privateState. A regra de canonicalização precisa ser especificada/testada em 025-B (JSON canônico, tipos/ordem/números/null explícitos, sem campos voláteis). manifestSha256 é calculado externamente sobre os bytes do manifesto; bundleSha256 sobre todo o objeto. Nenhum hash contém a si próprio. versionId, recibo, capturedAt e retainUntil observado ficam no registro de custódia e não mudam o fingerprint lógico no replay.

attemptId deriva deterministicamente da identidade completa e discriminador histórico comprovado, não do fingerprint de conteúdo. A chave privada opaca é fixa por attemptId. sourceFingerprint inclui identidade, bytes, campos originais nota/job/consulta/série/venda, snapshots/itens, cadeia B2 e versões observadas. Não usar apenas updatedAt nem inserir now no fingerprint.

A referência permanente é um identificador interno privado, não URL assinada. Resolve para backend + conta lógica + chave + versionId + bundleSha256 + manifestSha256, com storeId, identidade, sourceFingerprint e linhagem vinculados. O manifesto completo e os segmentos permanecem no objeto; a referência PostgreSQL conserva hashes e metadados de custódia/verificação, sem guardar outra cópia integral dos bytes. URL temporária de download, se futuramente necessária, é produzida após autorização, expira e nunca é identidade durável.

### 2.4 Proteções de armazenamento e multi-loja

PostgreSQL: owner NOLOGIN separado; runtime não é owner, superuser, BYPASSRLS nem membro com SET ROLE para esses papéis. Revogar UPDATE, DELETE, TRUNCATE, DDL, TRIGGER e privilégios herdados/PUBLIC sobre referência/custódia/vínculo; runtime comum sem INSERT direto. Inserção exclusiva e selagem por função mínima com owner dedicado, search_path fixo e entradas validadas; gatilhos de bloqueio UPDATE/DELETE/TRUNCATE como defesa adicional, incluindo operações em lote. Nenhuma cascata pode apagar a referência/custódia/vínculo quando loja/nota/job forem removidos; a preservação do objeto é independente dessas relações.

Índices únicos por (storeId, attemptId) e pelo vínculo fiscal completo, CHECKs de identidade/hash/tamanho e relações compostas impedem troca de loja/nota/job. Preservar os identificadores históricos no próprio registro, sem depender só de FK para registro operacional mutável. Trigger/constraint deve impedir alterações da identidade fiscal protegida nas tabelas operacionais, inclusive dedupe, vigente e referências relevantes, ou esses writes devem passar exclusivamente por procedimento protegido. Uma flag no payload não substitui essa proteção.

RLS com FORCE, sem bypass, deve usar identidade de loja autenticada e não falsificável pelo cliente. Uma GUC livremente definida pelo runtime ou um storeId fornecido no pedido não é essa identidade. Propor papel/sessão temporária efetivamente restrita por loja, emitida por custódia independente. A credencial compartilhada atual não recebe garantia de isolamento contra comprometimento; verificar/granularizar privilégios é pré-requisito futuro. Superuser e owner permanecem limites explícitos. [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [privilégios](https://www.postgresql.org/docs/current/ddl-priv.html).

Objetos: bucket privado dedicado, bloqueio de acesso público, sessão por loja/prefixo imutável, transporte cifrado e papel de custódia separado do app. Runtime comum só pode ler o escopo autorizado; executor de arquivamento recebe criação condicional estrita e leitura/verificação daquele alvo. Negar DeleteObject/DeleteObjectVersion, mudança de retenção/legal hold/policy/lifecycle/replicação, acesso a outras lojas e credenciais de controle. Papel de reconciliação não pode administrar bucket nem remover proteções do banco. Broker não emite outra loja por mero parâmetro recebido.

Para S3, exigir criação exclusiva If-None-Match:* no backend/policy, inclusive contra PUT direto sem header; não permitir If-Match como modo de substituição. Neste perfil, restringir a PutObject simples com checksum SHA-256 de upload e limite de tamanho a definir/validar; não presumir tamanho real da tentativa. CopyObject e multipart ficam negados nesse caminho; futura necessidade exige contrato/policy/prova próprios. O ETag não é tratado como SHA-256. [Writes condicionais](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [enforcement por policy](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html).

Object Lock retém versões, não o nome lógico: PUT pode criar outra versão e DELETE sem versionId pode criar delete marker. A composição com policy de criação exclusiva, negação de deletes e referência fixada na versão é obrigatória. Ler sempre por versionId; nunca substituir silenciosamente por latest. Uma versão privilegiada divergente não muda a referência selada. [Operação de Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).

### 2.5 Atomicidade, CAS e falhas

Não existe transação distribuída presumida entre PostgreSQL e objetos. A ordem futura é:

1. Sob acesso READ-ONLY autorizado, capturar uma visão consistente do alvo e a cadeia B2; registrar fingerprint completo e evidências B1-R1/B3-R1. Qualquer lacuna impede o arquivamento habilitante. Nenhuma leitura por xml-storage-reader, worker, reconciler ou adapter com logging em DB.
2. Montar o mesmo bundle a partir dessa visão. Verificar tamanho, hashes e ausência de segredos localmente, sem logs de conteúdo.
3. Gravar exclusivamente a chave fixa com retenção COMPLIANCE já efetiva na criação. Sem janela de objeto desprotegido. Timeout tem resultado desconhecido: HEAD/GET da chave/versão, nunca PUT cego nem compensação por DELETE.
4. Reabrir a versão exata, comparar bytes integrais e hashes, conferir modo/retainUntil/checksum/identidade e recibo. Não confiar apenas no retorno de PUT ou em ETag. Capturar provas de política e permissões efetivas; indisponibilidade ou retenção curta bloqueiam.
5. Somente em 025-C autorizado, sob SERIALIZABLE + locks/CAS compartilhados com admin/worker/enqueue, reler todos os participantes e comparar fingerprint, identidade, estado, contador 3, unicidade, cadeia B2, zero conflitos B1-R1 e inventário completo B3-R1 revalidado. Serializar também inserts por faixa, não apenas linhas já existentes. Lease/efeito externo em curso, runtime antigo/desconhecido ou fencing insuficiente bloqueiam.
6. Na mesma transação: inserir a referência histórica protegida à versão WORM já verificada, com identidade, hashes, linhagem e custódia, inserir vínculo permanente de reconciliação, aplicar exclusivamente os diffs de nota/job/projeção da venda autorizados em 025-C e auditoria sanitizada única. Não inserir bytes ou manifesto completos no PostgreSQL na opção B. Contagens de CAS devem ser exatamente uma por participante. Falha desfaz tudo no banco; o objeto permanece.
7. Replay só retorna sucesso se bundle/referência/vínculo/estado terminal completos coincidem. Não incrementar tentativas, criar novo arquivo/job/nota, repetir log de efeito ou conceder retry. Crash após commit e antes da resposta é resolvido por essa verificação.

A inserção PostgreSQL da referência/custódia é transacional com o vínculo e os efeitos autorizados; o PUT externo permanece fora dessa transação. A recuperação byte a byte lê o ArchiveBundle/v1 por GET do versionId permanente, valida manifesto/segmentos e compara hashes, identidade e linhagem com a referência protegida e a cadeia B2. Não há SELECT bytea nem fallback para colunas correntes como fonte da tentativa histórica na opção B. Receipt/verificação de objeto não elimina TOCTOU de controle administrativo: a versão COMPLIANCE e a retenção asseguram preservação do conteúdo nesse intervalo; permissão/retenção/configuração e disponibilidade são rechecadas, com falha fechada.

| Falha | Resultado obrigatório |
| --- | --- |
| Antes de PUT / validação / permissão | Zero mutação nota/job/venda; arquivo não confirmado |
| PUT interrompido ou resposta perdida | Inspecionar por chave/versão; continuar somente após prova integral; nunca assumir ausência |
| 412 / arquivo já existe | Reabrir; mesmo fingerprint/bytes/manifesto/retention -> reutilizar; divergente -> conflito, sem substituir |
| 409 / disputa de criação | Reconciliar estado do objeto; retry só condicional, limitado e com o mesmo conteúdo; persistência ambígua bloqueia |
| Após objeto e antes de CAS / CAS perde / DB indisponível | Objeto órfão retido, nenhuma mutação parcial no banco; não concede capability |
| Objeto órfão / falha prolongada | Inventário privado autorizado por attemptId; reutilização apenas se visão/fingerprint ainda idênticos e gates vigentes; senão quarentena lógica e decisão humana |
| Mesmo attemptId com fingerprint divergente, em sequência ou concorrência | Um conteúdo pode vencer a criação; divergente falha fechado; registro/objeto vencedor intactos, mesmo se o vencedor ficar órfão |
| Commit DB concluído, resposta perdida | Replay verifica vínculo e estado exatos; zero efeitos duplicados |
| Divergência entre DB, manifesto, versão ou hashes | Bloquear leitura habilitante/reconciliação; alerta sanitizado fora de DB; restauração humana, sem rebuild/overwrite |

Nenhum arquivo existente, incluindo órfão/corrompido, é sobrescrito ou apagado automaticamente. Restore cria destino novo sob gate e mantém origem/evidência; qualquer remapeamento exige evento de custódia append-only e autorização específica, nunca UPDATE do vínculo selado.

### 2.6 Compatibilidade com ADR-0017 e ADR-0018

| Contrato vigente | Compatibilidade / extensão proposta |
| --- | --- |
| ADR-0017: persistência antes de transporte; retry incerto com os mesmos bytes | Integralmente preservado. Arquivar é operação sem transporte; não chamar authorizeExactRetransmission/preparer/provider. Corrigir 588 é fluxo explícito futuro, não retry genérico |
| ADR-0018: coluna primária para XML assinado/autorizado e protocolo; espelho opcional | Colunas operacionais permanecem primárias para o documento corrente. O objeto histórico possui os bytes próprios da tentativa anterior, acessíveis pela referência protegida à versão permanente. WORM obrigatório é requisito novo, restrito ao arquivo histórico 025, sem transformar o mirror autorizado opcional em dependência geral |
| ADR-0018: coluna vence divergência com espelho | Regra continua no mirror atual. Para arquivo histórico, comparar com a coluna corrente após futura correção seria incorreto: o alvo é o registro histórico congelado. Divergência de cópias históricas bloqueia, sem escolher/adotar latest automaticamente |
| ADR-0018: imutabilidade após autorização / ausência de purga | Não alterar dados autorizados. Exceção futura para novos bytes na mesma nota rejeitada precisa gate próprio, arquivo anterior intacto e lineage; esta proposta não autoriza essa escrita. Sem purga automática |

Esta ADR ratifica documentalmente a extensão histórica restrita à 025, com escolha B aprovada pelo humano. ADR-0017/0018 não são editadas ou superadas; a implementação da extensão depende de autorização futura. Reclassificação histórica, correção offline, deploy e qualquer alteração de nota/job permanecem nos gates do plano.

## 3. Alternativas consideradas

A [matriz comparativa](drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md) detalha A (somente PostgreSQL protegido), B (objeto como arquivo, DB somente vínculo) e C (arquivo integral em ambos), inclusive R2. B também precisa vínculo persistente protegido; eliminar esse vínculo não é alternativa admissível.

| Opção | Razão técnica | Recomendação |
| --- | --- | --- |
| A | Melhor atomicidade e menor infra; defesa contra runtime restrito, mas DBA/restore comprometido pode mudar arquivo e âncora juntos | Rejeitada pelo humano para o modelo de ameaça administrativa forte |
| B | WORM COMPLIANCE e referência protegida preservam conteúdo e integridade verificável sem duplicação integral no DB; exigem CAS, órfãos, isolamento e DR | Escolhida e aprovada pelo humano; recomendada pela revisão Google/Gemini |
| C | Acrescenta réplica integral DB e atomicidade local dos bytes/vínculo; mantém PUT externo, órfãos e limites privilegiados do DB | Viável como alternativa documentada, não escolhida: duplicação/WAL/backups e maior operação sem necessidade demonstrada para esta tentativa |

Nenhuma opção implementada ou certificada nesta fase.

## 4. Consequências

### 4.1 Positivas

Preserva identidade e bytes anteriores, torna guards independentes do JSON do job e permite verificar conteúdo WORM contra referência protegida e cadeia B2. Uma única transação protege referência, vínculo e efeitos futuros autorizados. O manifesto WORM conserva identidade e linhagem para recuperação sob gate; hashes são âncoras de integridade, não prova isolada de autenticidade do produtor.

### 4.2 Custos

B evita a réplica integral dos bytes/manifesto no DB, mas mantém custo de referência/índices/WAL/backup e de objeto retido, PUT/GET/verificação, eventual cópia independente, policies, custódia e drills. C acrescentaria duplicação integral, WAL e backups dos bytes sem dispensar o protocolo externo. Para preservar uma tentativa, a revisão Google considerou esse acréscimo de C desnecessário diante de B corretamente protegido. Dimensionar com volume real, cópias, tarifas, operações, réplica/tráfego e trabalho operacional; preço, região/plano e teto orçamentário não foram definidos ou contratados.

### 4.3 Retenção, DR e riscos residuais

A ADR-0018 mantém sua política para os documentos correntes no escopo que já regula. Esta decisão não fixa nem estende automaticamente um prazo à tentativa histórica rejeitada. Prazo aplicável, marco inicial, retainUntil, legal hold, região e responsáveis precisam decisão humana operacional antes de provisionar; não se oferece parecer jurídico novo. Retenção WORM finita não significa vínculo descartável: não implementar expiração/purga do arquivo/vínculo. Extensão deve ocorrer antes do vencimento, por custódia separada, e falha de renovação bloqueia operações habilitantes.

Backups de PostgreSQL precisam incluir referência, identidade, hashes, linhagem, custódia e vínculo, com restore em destino isolado e conferência contra a versão WORM. A recuperação dos bytes depende do objeto, acesso e chaves preservados; backup do PostgreSQL sozinho não recupera o bundle de B. Recomendar segunda cópia de custódia em conta/domínio separado e retenção própria, inventário de réplica comprovado e leitura byte a byte. Replicação assíncrona não equivale a RPO zero; se exigida como parte do selo, aguardar prova da cópia antes do CAS. RPO/RTO, frequência de backup, exercício de perda de banco/objeto/acesso e custo são pendências bloqueantes para aceite operacional. Criptografia não pode depender de chave descartável sob controle do runtime. Object Lock não preserva chaves de decriptação. [Operação e replicação S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).

Riscos: primeira gravação incorreta; abuso de capacidade de criação; indisponibilidade/faturamento; perda de chave; admin mudando futuras policies; sabotagem simultânea das duas custodias; identidade de loja mal emitida; bugs na serialização/CAS; retenção vencida. Mitigar com cadeia B2, revisão humana, quotas, privilégios mínimos, conta separada, inventário/alerta, teste real e restore aprovado. Não prometer imutabilidade absoluta/perpétua.

### 4.4 O que muda imediatamente

Somente documentos necessários à 025-A: esta ADR aceita, índice oficial, ponte da proposta original, matriz, auditoria, fase, validação e revisão. A arquitetura B fica ratificada documentalmente; nenhuma funcionalidade é entregue. Código/schema/migrations, GOAL 025 aprovado e derivados fiscais permanecem intactos. O drift independente de main é incorporado por merge normal, sem edição manual de LEDGER/state/REGISTRY; CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT não recebem alterações desta subfase.

### 4.5 Extensões futuras necessárias

Schema e migration separados: referência à versão WORM, identidade/hashes/linhagem/custódia, vínculo protegido, unicidade/FKs, roles/permissões/RLS e proteções sobre identidade fiscal/guardas; sem cópia integral binária/manifesto no DB para B. Nomes e DDL precisam diff próprio. Storage: adapter binário obrigatório para histórico, criação exclusiva, versão/checksum/retention, releitura, isolamento e DR. O no-op/mirror atual não satisfaz essa porta.

Código: reader histórico puro sem FiscalLog; captura da fonte sem fallback; jobId original explícito; operação 588/CAS transacional; persistência do vínculo; guards B1/B1-R1 em emissão/reconciliação/queue/inutilização/admin/ports/rota interna, inclusive cancelamento do job protegido. Não reutilizar markRejected genérico que registra número consumido. Inventário B3-R1 de todos os runtimes continua obrigatório. Nenhuma extensão implementada aqui.

## 5. Plano de implementação futuro

Owner de decisão: Rafael Faria. A decisão humana 025-A é B_APPROVED, apoiada pela R Google/Gemini no SHA citado acima. O delta documental requer R incremental efetiva no SHA final antes do merge. Depois do encerramento documental, obter autorização separada e enquadramento AEP para código offline 025-B; schema/migration, storage/provisionamento e testes reais em ambiente isolado têm gates próprios. Qualquer write de 025-C depende de B2 + B1-R1 sem ocorrências + B3-R1 completo/guards ativos ou runtime sem escrita, deploys requeridos e autorização delimitada revalidada. 025-D só audita readiness; não abre G-F7/G-F12.

A fase atual não inicia 025-B/C/D, não cria recursos cloud, não conecta DB e não contata SEFAZ.

## 6. Critérios de aceite futuros

A [matriz de testes na auditoria](../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md) separa contratos simulados de provas reais. Aceite operacional requer 100% dos casos negativos/positivos aplicáveis, zero efeito em recusas, mesmas identidades/série 1/número 2/contador 3, zero segunda NotaFiscal/EMISSAO, identidade/lineage recuperáveis e evidências sanitizadas atribuíveis a ambiente, permissões efetivas e versão do backend.

Unitários podem verificar ordem/replay; só provas reais mostram negação de overwrite/delete/TRUNCATE, isolamento das credenciais, disputa de criação/CAS, retenção efetiva e restauração. Nenhuma dessas provas foi executada em 025-A. AEP/diff/scan documental não certificam storage.

## 7. Referências

- [ADR-0017](ADR-0017-estado-incerto-reconciliacao-por-chave.md) e [ADR-0018](ADR-0018-persistencia-legal-xml-e-protocolo.md).
- [Plano 025 canônico](../execution-tracks/fiscal/goals/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.md), [evidência 024](../ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md).
- [Metadados 025-A](../execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md), [auditoria](../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md), [matriz](drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md).
- Fontes técnicas oficiais consultadas em 2026-10-12: links junto às afirmações e na matriz. Sem consulta a ambiente cloud/SEFAZ/banco do projeto.

## 8. Decisão humana e pendências operacionais

B foi aprovada explicitamente para o modelo de ameaça administrativa forte, com S3 Object Lock COMPLIANCE como referência técnica e extensão histórica delimitada da ADR-0018. A foi rejeitada nesse modelo; C permanece alternativa não escolhida. Parecer técnico e aprovação humana são atos distintos, ambos rastreáveis no PR #265.

Continuam pendentes, sob gates próprios: fornecedor/conta/região; escopo por loja e emissão de credenciais; prazo/hold/marco/renovação; custódia/criptografia e disponibilidade de chaves; RPO/RTO/réplica/backup/orçamento; autorização e enquadramento AEP de 025-B; aprovação posterior dos diffs de código/schema/storage e do ambiente de testes. Nenhum desses parâmetros é presumido pela escolha B.

## 9. Blast radius

Hoje: decisão documental B, sem runtime afetado. Futuro: contratos fiscal storage/emission/reconciliation/queue/inutilização, suas rotas administrativas, schema/permissões, custódia/DR. PDV/Financeiro/Estoque não recebem efeitos funcionais desta proposta; a projeção fiscal da venda só poderá mudar no diff aprovado de 025-C.

## 10. Aprovação humana forte

needs_strong_human_approval=true; aprovação humana documental recebida em 2026-10-12.
HUMAN_ARCHITECTURE_DECISION=B_APPROVED.
IMMUTABLE_ARCHIVE_STRATEGY=WORM_OBJECTS_WITH_PROTECTED_REFERENCE.
IMPLEMENTATION_AUTHORIZED=false; SCHEMA_CHANGE_AUTHORIZED=false; MIGRATION_AUTHORIZED=false;
STORAGE_PROVISIONING_AUTHORIZED=false; DB_WRITES_AUTHORIZED=false; SEFAZ_CONTACT_AUTHORIZED=false.
G_F7=BLOCKED; G_F12=BLOCKED. STOP=AWAITING_025_B_AUTHORIZATION.
Esse ponto de parada só permite encerrar/mergear documentação após a R incremental aplicável; não inicia 025-B.

## 11. Duplicidade e compatibilidade

Índice e decisões relacionadas 0017/0018 consultados; 0024 é o próximo número global disponível. A proposta original é mantida como ponte de proveniência para esta ADR aceita e registrada no índice. 0018 cobre colunas operacionais e mirror opcional, não arquivo histórico obrigatório WORM com vínculo protegido sob credenciais runtime. Esta é extensão delimitada, sem substituir/superar ADR-0017/0018.
