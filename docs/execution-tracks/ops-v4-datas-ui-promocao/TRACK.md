<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-datas-ui-promocao",
  "title": "Operações V4 — promoção do experimento de datas",
  "plan_rev": 1,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

# TRACK Ops V4 Datas UI Promoção

Plano documental de 13/10/2026, ratificado em branch de governança por
autorização humana específica do proprietário, após `init` oficial.
O PR documental aguarda aprovação e merge na main; este registro não
autoriza execução de produto, merge funcional ou deploy.

Trilha independente de `ops-v4-fluxo-curto` e
`ops-v4-financeiro-retirada-garantia`; não altera seus plan_rev, tentativas,
GOALs, ledger ou candidatos. Apenas um GOAL:
`OPS-V4-DATAS-UI-PROMOCAO-001`, READY/plan_rev 1, C3/ALTO/OpenAI,
com R obrigatória de outra família declarada e elegível.

Reaproveitar por merge normal os quatro commits `1079da9`, `53696cb`,
`a08b460`, `183898e`, até o HEAD completo
`183898ee9fa34f0ae6e8ee4feebdd52eef74b301`. Não implementar de novo o
resumo ou o editor de datas. Preservar todos os testes, foco, overlays e
Entrada ocupada. Branch funcional proposta:
`codex/ops-v4-datas-ui-promocao-001`; checkout proposto:
`C:/Projetos/omni-gestao-ops-v4-datas-ui-promocao-001`, materializado
somente depois da liberação de ambiente e planejamento.

**GOAL 002 financeiro DONE e mergeado na main é pré-condição para executar `open` da promoção.**
Trata-se de `OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002`, concluído por seu
próprio rito e integrado por merge normal. Na main conferida seu último
resultado ratificado é BLOCKED, portanto essa pré-condição não está cumprida.
Até isso acontecer, a trilha pode estar planejada, mas não pode iniciar
execução funcional. READY e o estado derivado RUNNING indicam apenas
a existência de um GOAL elegível; não comprovam `open` ou produto executado.
Resolver o hook compartilhado apenas na branch de promoção, preservando
os contratos financeiros integrados. Não tocar no candidato/PR #262.
Não iniciar GOAL 003, GOAL 008, migrations ou mudanças financeiras.

Antes de ratificação funcional/promoção: build Next completo em ambiente suficiente,
validação do aplicativo integrado, 333 regressões com inventário anterior,
20 casos de navegador mais cenários integrados, regras de datas/garantia,
lint/typecheck, `verify`, `verify --all`, `check` e R independente válida.
Nenhum desses gates funcionais está cumprido por este planejamento.
O GOAL preserva `gates_liberados: []`; a revisão R permanece pendente. Não executar build
no computador enquanto persistir a restrição crítica de disco.

Planejamento humano → registro por CLI/PR documental → main → branch
funcional → `status`/`open` → merge normal do experimento → testes/R →
`close` separado → autorização futura de promoção. Sem rebase,
cherry-pick, reset, force push ou squash. Nunca editar derivados à mão.
Risco ALTO: obedecer o veredito de contexto após o fechamento.

Quatro desdobramentos financeiros permanecem no roadmap futuro, fora do
GOAL UI: data efetiva por pagamento, reconciliação com Caixa/períodos
fechados, relatórios por base temporal e identidade/idempotência de estornos.

## Referência, conferência e rito documental

Main atualizada por fetch e confirmada remotamente em
`1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`; a allowlist do GOAL reproduz
os 18 caminhos do diff real dos quatro commits, sem avanço da main nessa
superfície desde a base do experimento. O comando de teste dedicado foi
validado por inspeção, sem instalar dependências ou executar testes de produto.

Os derivados são gerados exclusivamente por `init`/`registry` e verificados
por `verify` da trilha e `verify --all`. O ledger permanece vazio. O commit
de planejamento usa caminhos explícitos e `AEP_WRITE=1`, pelo ritual
de planejamento dos §§2 e 14 de `docs/ai-execution/EXECUTION_PROTOCOL.md`,
com escopo limitado à governança autorizada. Nenhum gate, adapter, executor
ou regra existente do protocolo pode mudar.

Contrato e proveniência das fontes preservadas:
`docs/ai-execution/_evidence/OPS-V4-DATAS-UI-PROMOCAO-001/RATIFICACAO-GOVERNANCA.md`.
