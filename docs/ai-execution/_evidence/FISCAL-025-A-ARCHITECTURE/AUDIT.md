# 025-A · Auditoria documental sanitizada

Data: 2026-10-12 (America/Sao_Paulo). Executor: Codex / OpenAI.
[Proposta de ADR](../../../decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md) ·
[Matriz A/B/C](../../../decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md) ·
[Metadados da fase](../../../execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md).

## Proveniência e limites da evidência

BASE_MAIN=1fd90905e05656444576cf83c9df6c46919a917a.
BRANCH=codex/fiscal-025-a-architecture.
Worktree gerenciada isolada criada a partir da origin/main após git fetch origin main.
Checkout original C:/Projetos/omni-gestao preservado, inclusive suas alterações preexistentes.

GitHub confirmou PR #247 MERGED em 2026-10-11T14:26:47Z, mergeCommit igual à base acima, head histórico 85b0be2e3336557c564cbafd4a2f6374d5a645e9. A consulta de reviews formais retornou lista vazia; APPROVE_GOOGLE é a aprovação do plano recebida diretamente no pedido humano, não um novo parecer produzido ou inferido nesta sessão.

Fonte de identidade/estado: [GOAL 025 rev. 5](../../../execution-tracks/fiscal/goals/FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.md) e [evidência 024](../FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md). Não houve nova observação do piloto. XML, snapshot integral, hashes históricos e cadeia B2 não foram recuperados nesta fase.

DB_CONNECTIONS=0; DB_READ_QUERIES=0; DB_WRITES=0.
CLOUD_RESOURCE_WRITES=0; SEFAZ_CONTACTS=0; SEFAZ_TRANSMISSIONS=0.
Não foram carregados .env, certificados, credenciais, DSNs, XML bruto ou URLs privadas.

## AEP e preservação do plano

status fiscal mostrou pai 025 READY, plan_rev=5, 8 DONE/2 BLOCKED e 12 linhas de ledger. open fiscal recusou antes de criar marcador:

~~~text
FALHA [5] pré-condição de ambiente
  evidência: git rev-parse --abbrev-ref HEAD → codex/fiscal-025-a-architecture (GOAL exige plan/fiscal-025-retry-reconciliation)
  ação: Troque de branch VOCÊ MESMO. O AEP nunca executa checkout/switch/stash/reset.
~~~

A recusa é preservada. Não foi alterada a branch/worktree do pai para contorná-la. O protocolo não seleciona subfase por argumento; abrir o pai ou editar seu metadado conflitaria com a delimitação atual. A autorização humana permite preparar metadados documentais adicionais, registrados fora de goals/ sem bloco AEP:META. .aep-active ausente; nenhum close/DONE/block/registry foi executado.

O parent GOAL, sua evidência PLAN, ledger, state.json, REGISTRY.md, GATES.md e protocol.json devem permanecer com os mesmos blobs Git da base. O checkout Windows aplica CRLF/LF; a comparação também deve confirmar que essa é a única diferença de representação. Sem sessão AEP funcional aberta, não há teste/check/close funcional a certificar. verify --all verifica integridade documental dos derivados; não libera nenhum gate.

## Contratos e adapters auditados por leitura

Os caminhos/linhas abaixo são da base imutável; qualquer leitor pode refazer a inspeção nesse commit. Nenhuma função foi importada/executada com Prisma/provider.

| Fonte | Observação verificável | Extensão futura necessária |
| --- | --- | --- |
| [storage/types.ts](../../../../lib/fiscal/storage/types.ts), interface XmlStorageMirror | active, storeMirror/readMirror/verifyAgainstColumn; bytes como string, referência nullable; sem criação exclusiva, versionId, retention ou receipt | Porta histórica binária obrigatória e verificável, distinta do mirror autorizado opcional |
| [storage/mirror-vault.ts](../../../../lib/fiscal/storage/mirror-vault.ts) | noop.active=false e factory devolve no-op; nenhuma implantação fiscal real nesse factory | Adapter específico; não atribuir ao R2 do Contador prova de arquivo Fiscal |
| [storage/xml-storage-reader.ts](../../../../lib/fiscal/storage/xml-storage-reader.ts):66 | Seleção escopada, hash do job ou fallback calculado; job escolhido por createdAt/id desc; fiscalLog.create em divergência e toda leitura | Reader histórico puro READ-ONLY, jobId original explícito, hash registrado B2 sem fallback habilitante |
| [storage/xml-protocol-storage.test.ts](../../../../lib/fiscal/storage/xml-protocol-storage.test.ts):17 | Suíte declara Prisma em memória, sem DB/rede/bucket | Não é prova de bloqueio runtime, retenção ou concorrência real |
| [emission/prisma-uncertain-state-persistence.ts](../../../../lib/fiscal/emission/prisma-uncertain-state-persistence.ts):74 | findEmissionJob admite EMISSAO/CONTINGENCIA e usa mais recente | Resolução única por jobId/dedupe/tipo/loja e CAS dessa identidade |
| [mesmo adapter](../../../../lib/fiscal/emission/prisma-uncertain-state-persistence.ts):101 | loadDocument lê colunas; hash pode ser rederivado da string se payload perdeu hash | Arquivamento exige hash histórico corroborado por eventos; hash novo não fabrica proveniência |
| [mesmo adapter](../../../../lib/fiscal/emission/prisma-uncertain-state-persistence.ts):262 | persistBeforeTransmission restringe estados pré-transmissão; altera nota e payload do job e cria log | Não reutilizar para substituir bytes do alvo TRANSMITINDO; archive histórico antes de qualquer fluxo futuro aprovado |
| [mesmo adapter](../../../../lib/fiscal/emission/prisma-uncertain-state-persistence.ts):452 | markAuthorized verifica dados na aplicação/transação; mirror pós-commit, WHERE xmlStorageRef=null | Guard operacional não equivale a privilégio storage imutável; manter a semântica ADR-0018 corrente |
| [mesmo adapter](../../../../lib/fiscal/emission/prisma-uncertain-state-persistence.ts):673 | markRejected grava cStat/xMotivo/erro, projeção venda e mensagem de número consumido; possível inutilização | Operação histórica 588 específica, sem xMotivo fabricado, sem mensagem/efeito inadequado |
| [emission/uncertain-state-coordinator.ts](../../../../lib/fiscal/emission/uncertain-state-coordinator.ts):216 | assertPersistedDocument exige escopo e SHA; em TRANSMITINDO não chama preparer sem autorização de retry; REJEITADA tem bloqueio genérico | Preservar ADR-0017; futuro caminho de correção offline explícito, sem authority externa |
| [mesmo coordinator](../../../../lib/fiscal/emission/uncertain-state-coordinator.ts):470 | Reconciliação chama provider.consult e pode authorizeExactRetransmission depois de NOT_FOUND | Não usar como leitura pura nem para classificar retroativamente 588 |
| [emission/snapshot-reader.ts](../../../../lib/fiscal/emission/snapshot-reader.ts):1 | Reconstrói objeto de snapshots/itens persistidos, com defaults/derivações conservadoras e deepFreeze | Arquivo guarda valores persistidos completos, sem usar objeto reconstruído como prova textual/byte original |
| [reconciliation/uncertain-reconciler.ts](../../../../lib/fiscal/reconciliation/uncertain-reconciler.ts):53 | Scanner de notas envelhecidas; pode logar e upsert CONSULTA | Não é operação histórica 588 nem reader READ-ONLY |
| [queue/queue-admin.ts](../../../../lib/fiscal/queue/queue-admin.ts):93 | FALHA pode virar PENDENTE, alterar payload/maxTentativas e gerar log | Vínculo protegido impede reprocess/cancel do job histórico antes de todo write, inclusive log |
| [queue/prisma-queue-worker.ts](../../../../lib/fiscal/queue/prisma-queue-worker.ts):165 | eligibleWhere exclui AGUARDANDO_RETRY com data null; CAS revalida seleção; ramo INUTILIZACAO no mesmo worker | Guard persistente/fencing também antes de lease/estado e execução de job antigo; terminalização sozinha não protege rearm administrativo |
| [queue/queue-policy.ts](../../../../lib/fiscal/queue/queue-policy.ts) | Retry incerto depende de transmission mutável no payload | Proteção histórica não pode depender desse JSON |
| [prisma/schema.prisma](../../../../prisma/schema.prisma):2472 | NotaFiscal possui Text XML, snapshots JsonB, xmlStorageRef; unicidade identidade fiscal/chave; FiscalEmissaoJob tem dedupe unique por loja e payload JsonB | Não existe modelo próprio de tentativa histórica imutável/custódia/vínculo; extensão necessária para C |
| [migration fiscal foundation](../../../../prisma/migrations/0013_fiscal_foundation/migration.sql) | Estrutura fiscal e unicidade; relações operacionais incluem cascatas | Nova estrutura de arquivo não herda cascatas que apaguem histórico; provar privilégios reais, não inferi-los da migration |
| [matriz cStat](../../../../lib/fiscal/provider/sefaz/sefaz-cstat-matrix.ts):325 | 588 REJECTED restrito a NFeAutorizacao4 | Classificação atual não substitui a prova histórica B2 |

Não se inferiu a role efetiva do runtime, RLS/ACL/policies implantadas, backup configurado ou bucket Fiscal disponível. A leitura de código comprova contratos versionados, não configuração/imutabilidade do backend real.

## Testes futuros e nível de prova

Todos os testes abaixo: **NOT_RUN em 025-A**. Ambiente isolado, massa sintética por loja, sem omnigestao_prod e sem SEFAZ; writes/provisionamento exigem autorização própria. Evidência real deve identificar SHA/versão backend, papel efetivo, operação, resultado sanitizado e releitura de bytes/hash, sem credenciais.

| Caso | Contrato simulado útil | Prova real obrigatória / resultado |
| --- | --- | --- |
| PostgreSQL UPDATE/DELETE diretos no arquivo/vínculo | Adapter não oferece método de mutação | Mesmas credenciais efetivas runtime; negação do backend e bytes/referência intactos |
| TRUNCATE/DDL/trigger disable/SET ROLE/bypass/cascade | Simular recusa | Tentativas com runtime, inclusive herança/PUBLIC, sem superuser; negar; domínio privilegiado isolado expõe limite de A |
| PUT overwrite, sem If-None-Match ou com If-Match | Ordem/reação 412 | Policy nega criação incondicional/substituição, copy/multipart e modo/retention indevidos; conteúdo original intacto |
| DeleteObject, DeleteObjectVersion, batch delete, delete marker | Adapter não compensa com delete | Runtime negado; GET versionId recupera original; teste privilegiado COMPLIANCE somente com massa descartável sob gate |
| Retenção/hold/policy/lifecycle alterados | Configuração rejeitada | Runtime sem poder de controle; modo/retainUntil efetivos verificados na versão; COMPLIANCE vs GOVERNANCE e remoção R2 demonstrados sob gate separado |
| Leitura A -> B e escrita no prefixo/vínculo de B | Guards de storeId | Credencial/sessão efetiva de A negada no DB e objetos, inclusive storeId/GUC/IDs manipulados; broker não emite B |
| Corrupção de XML/estado/manifesto/âncora | Cada hash divergente bloqueia | Ler bytes reais; corromper apenas cópia de teste permitida, manter WORM original; mismatch detectado, sem overwrite/rebuild |
| Recuperação binária | Fixture com acentos/BOM/CRLF/espaços preservados | GET versão e SELECT bytea são idênticos aos bytes enviados; SHA histórico B2 e comprimentos coincidem; ETag não substitui hash |
| Falha antes/depois de PUT, timeout com gravação concluída | Injeção de crash/ordem | Backend real, rede interrompida de forma controlada, descoberta de versão e CAS; zero mutação parcial |
| Crash antes/depois de commit DB e resposta perdida | Replay de estados | Rollback integral ou replay terminal exato; um vínculo/arquivo/efeito, nenhuma duplicação de audit/tentativa |
| Objeto órfão e snapshot mudou | Quarentena/reuso condicionado | Inventário encontra objeto retido; não apaga/reescreve; drift bloqueia CAS, não gera novo attemptId para contornar conflito |
| Duas capturas idênticas | Dedupe em memória | Concorrência real de PUT e transações DB; mesma versão/referência e um vencedor efetivo |
| Mesmo attemptId, fingerprint divergente | Erro de conflito | PUT exclusivo + UNIQUE/CAS reais; divergente não altera vencedor nem anexa arquivo alternativo habilitante |
| Concorrência com worker/admin/inutilização por faixa | Simular interleavings | SERIALIZABLE/locks/fencing reais, inclusive inserts por faixa e lease/takeover; zero efeito externo, perdedor sem writes de domínio/log |
| Replay/duplicação de job/nota | Mesmo locator e job obrigatório | Mesma nota vigente, chave, série 1/número 2, contador 3, tentativas=1; zero segunda NotaFiscal/EMISSAO e dedupe v1 preservado |
| B2 positiva e cada elo ausente/trocado | Rejeitar elo ausente/ambíguo | Leitura futura READ-ONLY autorizada comprova eventos/IDs/hashes/serviço/erro/consulta/cronologia; NOT_FOUND sozinho não habilita; xMotivo NOT_PERSISTED |
| Snapshot/payload mutate/restart depois do selo | Vínculo continua consultável | Registro protegido e manifesto preservam estado anterior; guards não dependem do JSON; lineage histórico ainda recuperável |
| B1-R1 preexistente / runtime B3-R1 inseguro | Matriz de recusa | Inventários autorizados reais: qualquer inutilização, ambiguidade, runtime desconhecido/antigo ou credencial não verificada bloqueia 025-C |
| Retenção vencendo, réplica atrasada, perda de chave/acesso | Recusa/alerta | RetainUntil e réplica/backup comprovados, política de extensão e drill aprovado; indisponibilidade não produz fallback permissivo |
| Restore do DB e perda de custódia | Plano de recuperação | Restaurar em destino isolado aprovado; conferir versão WORM e bytes/lineage, medir RPO/RTO; remapeamento só por evento/gate, sem UPDATE do vínculo |

Unitários/fixtures não certificam WORM, ACL, role, RLS, CAS ou recuperabilidade. Sem todas as provas reais exigidas pela opção escolhida, 025-B/025-C permanecem bloqueados.

## Validações desta entrega

Verificações documentais da sessão; resultados finais de publicação/revisão serão vinculados no PR, sem hash circular no commit.

- node scripts/track.mjs verify --all: PASS, dez trilhas + REGISTRY.md/GATES.md, sem divergências.
- git diff --check inicial: PASS; checagem do delta completo staged/commit e scan por padrões serão repetidos antes da publicação.
- Integridade de links/tabelas/blocos, escopo e hashes dos arquivos canônicos: ver registro final de validação desta pasta.
- Typecheck/build/testes fiscais/DB/storage: NOT_RUN, por mudança exclusivamente documental; sem dependências ou execução funcional.
- R independente: duas solicitações tentadas com SHA completo; Google recusou auth/trust e Anthropic retornou limite semanal 429. Nenhum parecer obtido; [registro sanitizado](REVIEW_STATUS.md). Nenhum parecer do plano é reciclado como aprovação desta fase.
- CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT: não alterados, pois não houve mudança funcional nem decisão humana de arquitetura.

SECRET_SCAN limita-se aos arquivos novos/delta, por padrões; não é atestado sobre todo o repositório. Revisão/publicação contém somente documentos sanitizados, sem XML, dados integrais, segredos, credentials ou URLs privadas.

## Resultado e decisões

ARCHITECTURE_OPTIONS=A_POSTGRESQL;B_WORM_OBJECTS_WITH_PROTECTED_REFERENCE;C_FULL_POSTGRESQL_PLUS_WORM.
RECOMMENDED_OPTION=C_FULL_POSTGRESQL_PLUS_WORM.
SCHEMA_EXTENSION_NEEDED=true; STORAGE_EXTENSION_NEEDED=true (para C; futuras, sem autorização).
HUMAN_ARCHITECTURE_DECISION=PENDING.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_WRITES=0; SEFAZ_TRANSMISSIONS=0.
FINAL_DECISION=AWAITING_025_A_ARCHITECTURE_REVIEW.
STOP=AWAITING_025_A_ARCHITECTURE_REVIEW.
