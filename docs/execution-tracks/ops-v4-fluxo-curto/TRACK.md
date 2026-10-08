# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 12,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026 e autorização operacional
ponta a ponta do proprietário para OPS-V4-FLUXO-CURTO-006, plan_rev 12,
classe C4, risco ALTO, fornecida em 08/10/2026 ("QUERO INICIAR
OPS-V4-FLUXO-CURTO-006").

## Escopo ativo

Somente OPS-V4-FLUXO-CURTO-006 está ativo/elegível, com contrato em
goals/OPS-V4-FLUXO-CURTO-006.md.

OPS-V4-FLUXO-CURTO-001, 002, 003, 004 e 005 permanecem DONE.
Não reabrir. O GOAL 005 (próxima ação) é contrato obrigatório de regressão.

GOALs 007 (retorno/garantia) e 008 não são elegíveis.
Não criar outro GOAL para corrigir o 006 (006B, 006-FIX, 006C, 006-HARDENING).

O objetivo é CONECTAR os motores existentes para que a mesma OS percorra
serviço pronto → situação financeira conhecida → receber agora / parcial /
misto / a prazo → saldo resolvido ou entrega autorizada → retirada →
entrega formal → documentos e garantia coerentes, sem segunda venda,
segundo título, cobrança/caixa/estoque/custo duplicados, recibo de outra
OS, entrega implícita, status técnico avançado por pagamento, quitação
otimista ou garantia iniciada duas vezes. Preço aprovado, título,
dinheiro recebido e entrega continuam fatos distintos e comandos
explícitos separados.

Não criar V5, novo PDV, novo Financeiro, novo Caixa, novo motor de
cobrança ou de estoque, segundo componente de pagamento, action de
entrega V4 nem checkout monolítico "pagar e entregar".

## Materialização humana e ativação

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL
em goals/ é ato humano.

A decisão textual do proprietário ("QUERO INICIAR OPS-V4-FLUXO-CURTO-006")
é materializada com este TRACK rev 12 no checkout de planejamento
C:/Projetos/omni-gestao-ops-v4-fluxo-curto-006-plan, branch
plan/ops-v4-fluxo-curto-006, baseado em origin/main.

Depois, seguir o rito oficial:
registry → verify → verify --all → commit/PR exclusivo de planejamento
→ merge normal (merge commit) em main → worktree de produto sobre a main
atualizada → status → open.

Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Não deixar alterações de goals/** no diff de produto do check 8.

## Ambiente planejado

Branch: goal/ops-v4-fluxo-curto-006.
Worktree: C:/Projetos/omni-gestao-ops-v4-fluxo-curto-006.
Base: origin/main vigente na ativação, após integração do planejamento.

Base conferida em 08/10/2026:
4e87fb13f53fa9f78e229d88b1b8566f95262ad0 (merge do PR #241, GOAL 005).

A base de produto deve conter esse merge ou descendente. Preservar outras
branches/worktrees (inclusive C:/Projetos/omni-gestao, ocupada por outra
frente, e as worktrees do GOAL 005) e processos externos.

## Contrato funcional (resumo — detalhe no GOAL)

Entrega/Retirada vira o contexto operacional final da OS: identidade,
serviço aprovado, condição financeira (total, recebido, saldo, situação
honesta e fail-closed), garantia prevista, acessórios/custódia, fotos,
documentos, quem retira e data efetiva. Com saldo, "Receber pagamento"
abre o MESMO ReceberPagamentoV4 + hook V3 (receberOSV3 /
registrarRecebimentoMistoOSV3) sem sair da OS; sucesso relê o servidor e
nunca entrega sozinho — "Confirmar entrega" continua comando separado
(registrarEntregaV3, com "Retirado por" editável). Recibo só de recebimento
real persistido da mesma OS (reimpressão após reload pela evidência
persistida). Termo de entrega só após entrega real. Estoque e garantia pelos
contratos canônicos, uma única vez.

## Gates

Nenhum gate de caminho liberado (gates_liberados vazio). Classe C4: o gate
humano explícito é a autorização do proprietário de 08/10/2026.

Schema, migrations, seeds, auth, proxy, CI, package.json, lockfile,
Node/Vercel, configuração de deploy, .env, Fiscal, WhatsApp, Marketplace,
AppShell e produção mutante continuam fechados.

Motores globais (PDV geral, Caixa global, Financeiro global, Estoque
global, lib/ops-upsert-venda.ts, finalizeSaleTransaction) intocáveis:
necessidade de editá-los = parar e devolver UMA decisão (PROTECTED_PATH,
WHY_REQUIRED, MINIMAL_DIFF, RISK_IF_NOT_DONE, ALTERNATIVE_WITHIN_SCOPE).

Exceção controlada V3 (somente quando indispensável e documentada no
relatório): lib/operacoes-v3/pdv-servico-actions.ts, payment-model.ts,
pos-venda-model.ts, entrega-actions.ts, delivery-financial-guard.ts e
components/operacoes-v3/hooks/use-pdv-servico-v3.ts. Não é autorização
genérica para lib/operacoes-v3/**. Escrever somente na allowlist do
GOAL/open.

Não receber pagamento, lançar a prazo, estornar, entregar, salvar
assinatura, enviar foto, alterar garantia, movimentar estoque, abrir/fechar
caixa, enviar WhatsApp, emitir fiscal, fazer backfill ou reclassificar OS
fora do PostgreSQL local descartável. OS-2026-00028 proibida.

## Prova de resultado

Executar T43–T52, S01–S20, E01–E15, test_command do GOAL, regressões dos
GOALs 001–005 e dos PRs #234/#235/#237/#238, typecheck, ESLint em todos os
.ts/.tsx alterados, build, diff --check, AEP verify, verify --all e check.

Usar PostgreSQL local descartável, nunca produção. Massa sintética
(lojas A/B, cliente, OS, serviço R$300, custo R$92, peça QA, caixa/sessão
QA, Conta a Receber QA). Concorrência provada de forma determinística em
PostgreSQL real.

E2E em e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts, porta isolada 3060
ou próxima disponível, --retries=0, --workers=1, sem matar processos.
Sincronizar prontidão real; não usar sleeps arbitrários, skip/fixme,
.first() arbitrário, catch para engolir falha ou reload para mascarar race.

O test_command isolado não substitui homologação e R.

## Publicação e revisão independente

Após validação, conferir diff e allowlist, criar commits normais,
push e PR exclusivo contra main, com Vercel omni-gestao e omni-gestao-pro
em SUCCESS.

Sem amend, rebase, force, squash ou contorno de checks. Main avançando:
merge normal e revalidação do delta.

Executor Anthropic exige R de outra família (OpenAI, read-only) sobre o
HEAD candidato exato e suas evidências, com P0=P1=P2=0 e VERDICT=APPROVE.
Achado P0/P1/P2 corrige-se no MESMO GOAL (tentativas AEP, teto 3).

Sem R OpenAI real disponível, entregar o pacote de R e parar com:

R_STATUS=AGUARDANDO_OPENAI
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Não autodeclarar R. Depois de publicar o 006: parar; não iniciar 007/008.
