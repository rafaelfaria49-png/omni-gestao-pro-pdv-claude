<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001",
  "track": "fiscal",
  "title": "Fundação offline isolada do ArchiveBundle/v1 conforme ADR-0024, sem backend real ou transmissão",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta",
  "branch": "goal/fiscal-025b-archive-foundation-001",
  "worktree": "C:/Projetos/omni-gestao-fiscal-025b-archive-001",
  "test_command": "npx vitest run lib/fiscal/archive-offline",
  "allowlist": [
    "lib/fiscal/archive-offline/**",
    "docs/ai-execution/_evidence/FISCAL-025B-OFFLINE-001/**",
    "docs/execution-tracks/fiscal/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 80,
  "plan_ref": "FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001",
  "plan_rev": 1,
  "execution_mode": "OFFLINE_ONLY",
  "implementation_authorized": true,
  "bootstrap_merge_required": true,
  "production_wiring_authorized": false,
  "schema_change_authorized": false,
  "migration_authorized": false,
  "storage_provisioning_authorized": false,
  "db_writes_authorized": false,
  "sefaz_contact_authorized": false,
  "gates_extra": [
    "Implementação autorizada somente após o PR documental deste bootstrap integrar origin/main; antes disso parar em AWAITING_025B_AEP_BOOTSTRAP_MERGE",
    "Código puro e fake em memória somente; sem adapter real, schema, migrations, banco, Docker, cloud ou SEFAZ",
    "Revisão independente de outra família sobre o SHA completo da implementação é obrigatória antes de close; Codex/OpenAI não faz sua própria R",
    "G-F7 e G-F12 BLOCKED; nenhuma capability offline autoriza retry, rearm, ativação ou transmissão",
    "Preservar integralmente o GOAL pai 025 READY/PLAN_ONLY e o ledger; não alterar nem encerrar o pai"
  ],
  "authorization_source": "Pedido humano explícito anexado em 2026-10-14 (America/Sao_Paulo), GOAL FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001: preparar e publicar bootstrap documental AEP em PR para main, sem merge automático; implementação offline previamente autorizada, condicionada à integração desse bootstrap na main. ADR-0024 aceita, arquitetura B (WORM + referência PostgreSQL protegida). Commit/push normal, PR draft da implementação e R independente de outra família; sem backend real, schema/migrations, banco, provisionamento, wiring produtivo ou SEFAZ."
}
-->

# FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001

Fundação offline isolada de 025-B, autorizada pelo humano em 2026-10-14.
Este GOAL não entrega nem encerra 025-B inteiro, 025-C, 025-D ou o GOAL pai 025.
READY permite seleção AEP; a execução continua condicionada ao merge do bootstrap.

## Fontes e preservação

- [ADR-0024 aceita](../../../decisions/ADR-0024-arquivo-historico-worm-referencia-protegida.md):
  arquitetura B, ArchiveBundle/v1 em objeto WORM e referência PostgreSQL protegida.
- [GOAL pai 025](FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.md):
  preservar arquivo, READY, PLAN_ONLY, B1-R1/B2/B3-R1/B4 e histórico de revisões.
- [Auditoria 025-A](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md):
  contratos e limitações; doubles não certificam backend ou imutabilidade real.
- Base confirmada por fetch no bootstrap:
  origin/main = 6b0b240f7ceb5cd9b8c87e55be55a52ccb04eca2.

Nenhum conteúdo histórico privado, XML, QR, snapshot integral, credencial, DSN,
certificado/PFX, senha, CSC ou token pode entrar em logs, erros, evidência ou revisão.
Fixtures devem ser sintéticas. Não obter dados reais para cumprir esta fundação.

## Bootstrap documental e gate de entrada

Aplicar o ritual de planejamento de EXECUTION_PROTOCOL §2, sem .aep-active:
criar somente este GOAL, executar registry e verificar os derivados. Não executar
open, close, block ou import nesta etapa e não editar state/LEDGER/REGISTRY à mão.

O ID deve ser selecionado pelo AEP existente, sem alterar scripts/track.mjs:
CURRENT_GOAL=FISCAL-025B-OFFLINE-ARCHIVE-FOUNDATION-001;
NEXT_GOAL=FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025.
Se a seleção divergir, parar e relatar. O GOAL pai permanece intacto, READY/PLAN_ONLY.

Criar commit/push normal somente do bootstrap e PR documental para main.
Não mergear automaticamente. Enquanto esse PR não estiver integrado em main:
IMPLEMENTATION_STARTED=false; CODE_CHANGED=false;
STOP=AWAITING_025B_AEP_BOOTSTRAP_MERGE.

Depois do merge humano, fazer fetch e comprovar que origin/main contém o bootstrap.
Criar a branch e a worktree declaradas nos metadados a partir dessa main, preservando
todos os WIPs de outros terminais. Executar, nesta ordem:

~~~text
node scripts/track.mjs status fiscal
node scripts/track.mjs verify --all
node scripts/track.mjs open fiscal
~~~

Ler este GOAL selecionado e usar exclusivamente a allowlist impressa por open.
Não abrir ou encerrar o GOAL pai. Gates posteriores continuam fechados.

## Contrato ArchiveBundle/v1

Implementar código puro, sem compressão, conforme a ADR-0024:

- Formato binário versionado com cabeçalho e comprimentos explícitos dos segmentos.
- XML original como bytes exatos: sem trim, normalização, compactação, correção,
  parsing/resserialização ou reassinatura do XML histórico.
- Manifesto JSON canônico determinístico UTF-8 e privateState canônico separado.
  Especificar ordem de chaves, tipos, números, null e rejeição de valores inválidos.
- Manifesto com identidade, versão, comprimentos e SHA-256 de xml/privateState.
  manifestSha256 externo sobre os bytes do manifesto; bundleSha256 sobre o objeto
  completo. Nenhum hash contém a si próprio.
- Validação estrita de versão, manifesto, canonicalização, comprimentos e integridade.
  Rejeitar segmentos ausentes/alterados, bytes truncados, extras ou corrompidos.
- Estado privado preserva valores lógicos congelados, sem alegar igualdade textual
  histórica do JSON e sem incluir segredos. Não reconstruir campos históricos ausentes.

## Identidade, idempotência e referência

Definir contratos tipados para attemptId determinístico, sourceFingerprint,
storeId/vendaId/notaFiscalId/jobId original, tipo EMISSAO, dedupeKey original,
modelo/ambiente/provider, serieFiscalId/série/número/chave e discriminador histórico
comprovado; versionId, hashes, linhagem, custódia e referência protegida.

attemptId deriva da identidade fiscal completa e discriminador histórico comprovado,
independentemente do conteúdo. sourceFingerprint cobre identidade, bytes, estado privado,
snapshots, cadeia B2 e versões observadas. Não usar somente updatedAt.
Timestamp volátil, capturedAt, recibo, retainUntil observado e versionId não alteram
a identidade/fingerprint lógico no replay.

Mesmo attemptId + conteúdo idêntico: replay idempotente, mesma referência/versão.
Mesmo attemptId + conteúdo diferente: conflito fail-closed; preservar o vencedor.
Chave opaca privada fixa por tentativa; referência permanente interna, nunca URL assinada.
Resolver sempre store + identidade + versão exata + hashes + sourceFingerprint;
jamais adotar latest, sobrescrever, apagar ou remapear automaticamente.

## Portas abstratas e fake

Definir interfaces puras para putIfAbsent, readExactVersion, verifyRetention,
verifyArchiveIntegrity e resolveProtectedReference. A referência conceitual conserva
identidade/hashes/metadados e localizador, sem réplica integral do bundle/manifesto no DB.

Criar somente fake em memória para testes, com isolamento por loja, criação exclusiva,
conflitos/replay e injeção de falhas antes/depois de PUT. Simular concorrência e falha
entre arquivo e referência/CAS sem mutação parcial; preservar objeto órfão e negar
capability até a prova completa. Resposta perdida nunca implica ausência do objeto.
Retenção desconhecida, versão incorreta ou divergência da referência bloqueiam.

O fake não certifica WORM, retenção, permissões, CAS, isolamento ou restauração reais.
Não modificar o adapter real de storage; não conectar AWS/S3/R2/Neon/Supabase;
não criar bucket, tabela, credencial, cliente de banco ou backend.

## Políticas offline

Implementar funções puras para:

- Validar proveniência histórica positiva do 588 conforme B2: mesmos store/venda/nota/
  job original/dedupe, eventos persisted_before_transmission e uncertain correlacionados,
  hashes históricos iguais aos bytes originais, erro histórico exato, detalhe.code,
  NFeAutorizacao4 e versão executada comprovados, consulta NOT_FOUND correlacionada e
  cronologia coerente. NOT_FOUND isolado, matriz atual ou substring 588 são insuficientes.
- Recusar evidência incompleta/divergente; manter xMotivo histórico como NOT_PERSISTED,
  sem fabricar motivo a partir da matriz atual.
- Validar identidade fiscal completa e bloquear segundo job EMISSAO e segunda nota,
  troca de loja/venda/nota/job, dedupe, versão, série/número/chave ou linhagem.
- Representar inventário B1-R1 completo de inutilizações preexistentes, todos os estados,
  marcas A_INUTILIZAR, eventos, faixas/vínculos indiretos/órfãos/ambiguidades.
  Ocorrência que alcance o alvo ou prova incompleta bloqueia.
- Representar B3-R1 completo de todos os runtimes com escrita: ambos os projetos
  Production, crons/workers, rota interna da fila, deployments antigos, Preview com
  credenciais de produção e processos externos. Cada runtime exige prova de guards/
  SHA/versão efetivos (Production READY quando aplicável) ou incapacidade de escrita
  comprovada; ausência declarada/credencial não verificada/rollback não bastam.
- Recusar preflight sem todas as provas de B2, arquivo/referência/integridade/retenção,
  B1-R1 e B3-R1 completos e revalidados, sem inventar atestações do ambiente real.
- Fazer qualquer capability produzida permanecer OFFLINE_ONLY, com zero autoridade
  para retry/transmissão/rearm/ativação/write. Sucesso de testes não libera 025-C ou G-F7.

Não integrar estas políticas a rotas, workers, provider, preparer ou serviços produtivos.
Inventários são contratos/validações sobre fixtures; nenhuma coleta real está autorizada.

## Testes e critérios de aceite

Cobrir, com fixtures sintéticas e fake em memória:

| Eixo | Provas obrigatórias |
| --- | --- |
| Bundle | Determinismo byte a byte; XML preservado; canonicalização; versão inválida; divergência de hashes/manifesto; ausência/alteração de cada segmento; truncamento, excesso e corrupção |
| Identidade | Replay idêntico; conflito de attemptId sequencial/concorrente; timestamps voláteis; troca de cada identidade; isolamento por loja; dedupe original; segundo job/nota |
| Custódia | Concorrência simulada; falha antes/depois de PUT/resposta perdida; falha antes da referência/CAS; objeto órfão preservado; versionId incorreto; retenção desconhecida; divergência da referência |
| Políticas | B2 incompleto/divergente em cada prova; xMotivo NOT_PERSISTED; B1-R1/B3-R1 incompletos, ambíguos, com ocorrências/drift/versão antiga; preflight sem todas as provas |
| Autoridade | Zero autorização de retry, transmissão, rearm, ativação ou write em sucesso, recusa, replay, concorrência e falha |

Executar testes focados, typecheck canônico e diff-check:

~~~text
npx vitest run lib/fiscal/archive-offline
npm run typecheck
git diff --check
node scripts/track.mjs verify --all
~~~

Sem Docker ou banco de teste real. Não instalar infra nem alterar configuração fora
da allowlist. Build não é exigido para esta fundação sem config/rotas/Prisma/wiring.

## Entrega, revisão independente e fechamento

Registrar evidência sanitizada e limitações em
docs/ai-execution/_evidence/FISCAL-025B-OFFLINE-001/.
Fazer commit local do trabalho com mensagem goal(fiscal-025b): ..., adicionando somente
caminhos explícitos; push normal na branch declarada e abrir PR draft para main.

Solicitar R independente de outra família declarada, Google ou Anthropic, sobre o SHA
completo publicado: diff/allowlist, provas positivas/negativas, check e limites reais.
Codex/OpenAI não pode aprovar sua própria implementação nem substituir R por seus testes.
Sem R efetiva: STOP=AWAITING_025B_OFFLINE_INDEPENDENT_REVIEW.

Executar check e close fiscal somente depois dos checks e da revisão exigida por este
GOAL. Não encerrar o pai nem afirmar toda a fase 025-B concluída. Não mergear automaticamente.

## Limites e relatório obrigatório

~~~text
CODE_EXECUTION_SCOPE=OFFLINE_ONLY
PRODUCTION_WIRING_AUTHORIZED=false
SCHEMA_CHANGE_AUTHORIZED=false
MIGRATION_AUTHORIZED=false
STORAGE_PROVISIONING_AUTHORIZED=false
DB_WRITES_AUTHORIZED=false
SEFAZ_CONTACT_AUTHORIZED=false
G_F7=BLOCKED
G_F12=BLOCKED

BOOTSTRAP_PR=
BOOTSTRAP_COMMIT=
AEP_GOAL_SELECTED=
PARENT_GOAL_PRESERVED=
IMPLEMENTATION_STARTED=
IMPLEMENTATION_BRANCH=
IMPLEMENTATION_COMMIT=
IMPLEMENTATION_PR=
FOCUSED_TESTS=
TYPECHECK=
AEP_VERIFY=
INDEPENDENT_REVIEW=
CODE_CHANGED=
SCHEMA_CHANGED=false
DB_WRITES=0
STORAGE_PROVISIONED=false
SEFAZ_TRANSMISSIONS=0
~~~