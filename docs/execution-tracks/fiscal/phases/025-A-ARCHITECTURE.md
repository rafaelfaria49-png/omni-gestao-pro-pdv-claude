# 025-A · Enquadramento documental da arquitetura imutável

Data: 2026-10-12 (America/Sao_Paulo).
GOAL pai: FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025, plan_rev=5.
Base aprovada: PR #247 MERGED; MERGE_SHA=1fd90905e05656444576cf83c9df6c46919a917a.
R do plano recebido no pedido humano: APPROVE_GOOGLE. Essa aprovação não se transfere à 025-A.

## Autorização e superfície desta subfase

O humano autorizou somente documentação 025-A, auditoria de código por leitura, proposta de arquitetura, commit/push normais na branch própria, PR documental sem merge e solicitação de R independente Google/Gemini, com Anthropic como alternativa. Código, schema, migrations, banco, provisioning e SEFAZ continuam negados.

Metadados descritivos, sem bloco AEP:META e sem cadastro de GOAL executável:

~~~json
{
  "parent_goal": "FISCAL-PILOT-HOMOLOGATION-RETRY-RECONCILIATION-025",
  "parent_plan_rev": 5,
  "phase": "025-A",
  "execution_mode": "PLAN_ONLY",
  "status": "AWAITING_025_A_ARCHITECTURE_REVIEW",
  "branch": "codex/fiscal-025-a-architecture",
  "worktree": "C:/Users/rafae/.codex/worktrees/fiscal-025-a-architecture/omni-gestao",
  "base_main": "1fd90905e05656444576cf83c9df6c46919a917a",
  "executor_family": "openai",
  "independent_review_required": true,
  "preferred_reviewer_family": "google",
  "alternative_reviewer_family": "anthropic",
  "human_architecture_decision": "PENDING",
  "documentary_paths": [
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

documentary_paths descreve o escopo humano desta entrega; não amplia a allowlist de um GOAL AEP aberto, não altera gates nem configura o protocolo.

## Compatibilidade com o AEP vigente

Foi executado status fiscal na worktree limpa da origin/main atual. O GOAL elegível é o plano 025 READY, vinculado a plan/fiscal-025-retry-reconciliation e à worktree original de planejamento. A tentativa exigida de open fiscal recusou com exit 5 por branch distinta, antes de criar .aep-active.

O GOAL canônico contém instrução expressa de não abrir/fechar execução funcional e exige ato governado futuro para delimitar a fase. O pedido atual autoriza metadados documentais, mas proíbe alterar o GOAL aprovado. Portanto esta subfase fica documentada em phases/, sem mover/editar GOAL, mudar protocolo, criar GOAL concorrente no caminho quente ou modificar ledger/derivados. Não se força open na branch do plano nem se ratifica o GOAL 025 como DONE.

O protocolo é opt-in por worktree: sem .aep-active, a allowlist de execução não foi ativada. O escopo documental vem da autorização humana acima. Não executar close fiscal nesta entrega, pois não há sessão aberta e close do pai ratificaria indevidamente o plano/reconciliação. verify --all permanece obrigatório e deve comprovar que os derivados do plano aprovado continuam íntegros.

Uma futura autorização de execução precisa fornecer enquadramento AEP compatível (branch/worktree/GOAL/allowlist/gates/testes), sem inferir liberação a partir desta proposta. Este documento não abre 025-B/C/D.

## Entregas para revisão

- [Proposta ADR-0024](../../../decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md): contrato privado, ameaça, atomicidade/falhas, compatibilidade, recomendação e decisões humanas.
- [Matriz A/B/C](../../../decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md): comparação e perfis de storage.
- [Auditoria sanitizada](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md): evidência por arquivo/linha, testes futuros, validações e limites.
- [Pacote de solicitação de R](../../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/REVIEW_REQUEST.md): escopo e critérios, sem XML/credenciais.
- O resultado atribuível ao revisor será registrado separadamente após a solicitação; nenhum APPROVE próprio Codex.

## Invariantes e ponto de parada

Mesma loja/venda/nota/job/chave, série 1, número 2, contador 3, consulta correlacionada e lineage. Nenhuma segunda NotaFiscal ou EMISSAO proposta. Preservação histórica não autoriza retry, rearm, correção persistida ou inutilização.

CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_CONNECTIONS=0; DB_WRITES=0;
SEFAZ_TRANSMISSIONS=0; HUMAN_ARCHITECTURE_DECISION=PENDING.
FINAL_DECISION=AWAITING_025_A_ARCHITECTURE_REVIEW.
STOP=AWAITING_025_A_ARCHITECTURE_REVIEW.
