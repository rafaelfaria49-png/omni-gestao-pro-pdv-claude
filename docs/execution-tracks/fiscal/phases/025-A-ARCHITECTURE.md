# 025-A · Decisão documental da arquitetura imutável

Data: 2026-10-12 (America/Sao_Paulo).
GOAL pai: FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025, plan_rev=5, preservado.
Base do plano: PR #247 MERGED; MERGE_SHA=1fd90905e05656444576cf83c9df6c46919a917a.
PR desta subfase: [#265](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265).

## Decisão humana e autorização documental

Rafael Faria aprovou explicitamente **B: WORM OBJECT STORAGE + PROTECTED POSTGRESQL REFERENCE**, após a [R independente Google/Gemini](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719) sobre e3c9d4a416972a65b1283b568ae5b13d3897b5c8: APPROVE, NEW_BLOCKERS=NONE, preferência técnica B. A foi rejeitada para o modelo de ameaça administrativa forte; C permanece alternativa documentada, não escolhida.

A [ADR-0024 aceita](../../../decisions/ADR-0024-arquivo-historico-worm-referencia-protegida.md) registra o contrato completo e consta no índice oficial. S3 Object Lock COMPLIANCE é a referência técnica; R2 Bucket Locks só poderá substituí-la mediante nova aceitação humana explícita dos riscos administrativos. Nenhum fornecedor foi contratado ou parâmetro operacional presumido.

A autorização atual permite ajustar somente os documentos necessários nesta branch, reconciliar drift independente de main, commit/push normais, R incremental efetiva no novo SHA e merge exclusivamente documental se os gates aplicáveis estiverem satisfeitos. A R anterior e a aprovação do plano #247 não aprovam automaticamente o delta. Código, schema/migration, provisionamento, acesso/escrita DB, retry/rearm e SEFAZ continuam sem autorização; 025-B/C/D não começam.

Metadados descritivos, sem bloco AEP:META e sem cadastro de GOAL executável:

~~~json
{
  "parent_goal": "FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025",
  "parent_plan_rev": 5,
  "phase": "025-A",
  "execution_mode": "PLAN_ONLY",
  "status": "B_APPROVED_DOCUMENTARY_DECISION",
  "branch": "codex/fiscal-025-a-architecture",
  "worktree": "C:/Users/rafae/.codex/worktrees/fiscal-025-a-architecture/omni-gestao",
  "initial_base_main": "1fd90905e05656444576cf83c9df6c46919a917a",
  "reconciled_base_main": "1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d",
  "drift_merge_commit": "4bb7025ffc5d9384701ce242377dff6289155df6",
  "executor_family": "openai",
  "independent_review_required": true,
  "preferred_reviewer_family": "google",
  "alternative_reviewer_family": "anthropic",
  "prior_reviewed_sha": "e3c9d4a416972a65b1283b568ae5b13d3897b5c8",
  "prior_r_verdict": "APPROVE",
  "prior_review_comment_url": "https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719",
  "incremental_r_required_before_merge": true,
  "human_architecture_decision": "B_APPROVED",
  "immutable_archive_strategy": "WORM_OBJECTS_WITH_PROTECTED_REFERENCE",
  "technical_reference_profile": "S3_OBJECT_LOCK_COMPLIANCE",
  "documentary_paths": [
    "docs/decisions/ADR-0024-arquivo-historico-worm-referencia-protegida.md",
    "docs/decisions/INDEX.md",
    "docs/decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md",
    "docs/decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md",
    "docs/execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md",
    "docs/ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/**"
  ],
  "implementation_authorized": false,
  "schema_change_authorized": false,
  "migration_authorized": false,
  "storage_provisioning_authorized": false,
  "db_writes_authorized": false,
  "sefaz_contact_authorized": false,
  "g_f7": "BLOCKED",
  "g_f12": "BLOCKED"
}
~~~

documentary_paths descreve o escopo humano desta entrega; não amplia allowlist de GOAL AEP aberto, não altera gates nem configura o protocolo. SHA final, parecer incremental, checks e eventual merge são ancorados no PR, sem referência circular dentro do commit.

## AEP e reconciliação de main

A preparação original executou status fiscal; open fiscal recusou com exit 5 por branch distinta da plan/fiscal-025-retry-reconciliation, antes de criar .aep-active. O GOAL pai exige ato governado futuro para execução e não pode ser alterado nesta fase. Essa recusa foi preservada; não houve tentativa de contorná-la, abrir/fechar o pai, editar ledger/derivados ou ratificar o GOAL 025 como DONE.

O protocolo é opt-in por worktree, e .aep-active permanece ausente. A ratificação atual é documental, autorizada pelo humano, fora de goals/ e sem AEP:META. Não executar close fiscal. Uma futura 025-B precisa autorização e enquadramento AEP próprios (GOAL/branch/worktree/allowlist/gates/testes), sem inferir liberação a partir desta ADR.

O fetch autorizado encontrou main em 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d, com alterações independentes das PRs #264/#266 (Pessoas e governança AEP). Merge normal sem conflitos: 4bb7025ffc5d9384701ce242377dff6289155df6. LEDGER/state/REGISTRY herdados são os blobs de main, sem edição manual. verify --all passou após o merge, em dez trilhas e índices derivados. O diff próprio contra essa base permanece somente documental; GOAL 025 rev. 5 e contratos fiscais não mudam.

## Entregas e gates de publicação

- [ADR-0024](../../../decisions/ADR-0024-arquivo-historico-worm-referencia-protegida.md) e [índice](../../../decisions/INDEX.md): decisão B e contrato vigente; [proposta original](../../../decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md) preservada como ponte.
- [Matriz A/B/C](../../../decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md): comparação e perfil técnico.
- [Auditoria](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md) e [validação](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/VALIDATION.md): evidências sanitizadas e limites.
- [Pedido](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/REVIEW_REQUEST.md) e [histórico de R](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/REVIEW_STATUS.md): parecer anterior e protocolo incremental.

Antes de mergear: validar diff/links/segredos/âncoras/AEP, obter R incremental de família independente no HEAD exato, publicar parecer atribuível e verificar checks/regras remotas. Comentário publicado pelo Codex identifica Google como revisor e OpenAI como publicador; não representa review nativa GitHub. Se R/check aplicável bloquear, corrigir apenas dentro do escopo ou parar.

## Invariantes e ponto de parada

Preservar bytes originais, ArchiveBundle/v1, manifesto/hashes sem ciclos, cadeia B2 e tentativa 588, versionId permanente, identidade por loja, referência PostgreSQL protegida, criação exclusiva, CAS, replay idempotente, órfãos, retenção/recuperação e ADR-0017/0018. Mesma venda/nota/job/chave, série 1/número 2/contador 3; zero segunda NotaFiscal ou EMISSAO.

HUMAN_ARCHITECTURE_DECISION=B_APPROVED.
IMMUTABLE_ARCHIVE_STRATEGY=WORM_OBJECTS_WITH_PROTECTED_REFERENCE.
IMPLEMENTATION_AUTHORIZED=false; STORAGE_PROVISIONING_AUTHORIZED=false.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_CONNECTIONS=0; DB_WRITES=0;
SEFAZ_TRANSMISSIONS=0; G_F7=BLOCKED; G_F12=BLOCKED.
FINAL_DECISION=B_APPROVED_DOCUMENTARY_ONLY.
STOP=AWAITING_025_B_AUTHORIZATION, após os gates de encerramento documental; não iniciar 025-B nesta execução.
