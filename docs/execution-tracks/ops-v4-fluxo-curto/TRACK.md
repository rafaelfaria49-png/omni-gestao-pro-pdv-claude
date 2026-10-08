# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 11,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026 e autorização operacional
ponta a ponta do proprietário para OPS-V4-FLUXO-CURTO-005, plan_rev 11 (rev 9 +
test_command da rev 10 + desbloqueio humano da rev 11, com exceção na guarda),
fornecida em 07/10/2026.

## Escopo ativo

Somente OPS-V4-FLUXO-CURTO-005 está ativo/elegível, com contrato em
goals/OPS-V4-FLUXO-CURTO-005.md.

OPS-V4-FLUXO-CURTO-001, 002, 003 e 004 permanecem DONE.
Não reabrir.

GOALs 006–008 não são elegíveis.
Não criar outro GOAL para corrigir o 005 (005B, 005-FIX, 005-RETRY, 005C).

O objetivo é tornar o Workspace V4 operacionalmente claro: ao abrir uma
OS, uma "Próxima ação" honesta, derivada só de estado real (status V3,
orçamento, projeção financeira server-side, carga do detalhe), diz o que
fazer, onde acontece e se o clique grava, navega, espera ou não há ação.
A derivação é pura (lib/operacoes-v4/proxima-acao-v4.ts), substitui o
PRIMARY de mock-data como autoridade e alimenta uma superfície única logo
abaixo da pipeline; o header deixa de ter CTA paralelo.

Não criar V5, segunda máquina de status, action nova nem motor novo.
Entrega (GOAL 006) e retorno/garantia (GOAL 007) permanecem fora.

## Materialização humana e ativação

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL
em goals/ é ato humano.

A decisão textual do proprietário ("QUERO INICIAR OPS-V4-FLUXO-CURTO-005")
é materializada com este TRACK rev 9 no checkout de planejamento
C:/Projetos/omni-gestao-ops-v4-fluxo-curto-005-plan, branch
plan/ops-v4-fluxo-curto-005, baseado em origin/main.

Depois, seguir o rito oficial:
registry → verify → verify --all → commit/PR exclusivo de planejamento
→ merge normal em main → criação da worktree de produto sobre a main
atualizada → status → open.

Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Não deixar alterações de goals/** no diff de produto do check 8.

## Ambiente planejado

Branch: goal/ops-v4-fluxo-curto-005.
Worktree: C:/Projetos/omni-gestao-ops-v4-fluxo-curto-005.
Base: origin/main vigente na ativação, após integração do planejamento.

Base conferida em 07/10/2026:
3f6ab52084bcbf6664c8ff2826c51705a68ac1f7 (merge do PR #238).

A base de produto deve conter esse merge ou descendente. Preservar outras
branches/worktrees (inclusive C:/Projetos/omni-gestao, ocupada por outra
frente e a worktree do GOAL 004) e processos externos.

## Contrato funcional

Matriz mínima (detalhe no GOAL): aberta → Iniciar diagnóstico (grava);
diagnostico → Preparar/Revisar orçamento (navega); aguardando_aprovacao →
Aguardando decisão do cliente (espera; abre orçamento, nunca aprova);
aprovado → Iniciar execução (grava, mesma action); aguardando_peca →
Aguardando peça (espera; abre execução); em_execucao → Marcar como pronta
(navega à Execução); pronta/recebida → Receber pagamento (OPEN/PARTIAL),
Confirmar entrega (canDeliver), Revisar financeiro (demais, erro) ou
Carregando situação financeira (loading, sem CTA); entregue → concluído
(pós-venda só navegação); cancelada/desconhecido → sem ação mutante.

Escrita só pelas actions existentes (iniciarDiagnostico/iniciarServico →
aplicarTransicaoStatusV3), com lock por loja+OS contra duplo clique;
respostas de uma OS/loja nunca afetam outra. Pendências da Entrada nunca
bloqueiam. Sem listener global de Enter.

## Gates

Nenhum gate de caminho liberado (gates_liberados vazio).

Schema, migrations, seeds, auth, proxy, CI, package.json, lockfile,
Node/Vercel, configuração de deploy, .env e produção mutante continuam
fechados.

Não alterar app/actions/operacoes.ts nem lib/operacoes-v3/**.
Rev 11 (desbloqueio após o teto de tentativas): única exceção fora da allowlist
original — components/operacoes-v4-preview/use-entrada-draft-guard.ts, só em
confirmarSalvamento (não executar saída cancelada/substituída durante o salvamento),
conforme o GOAL.
Motor financeiro (recebimento misto, ledger, idempotência, estorno, caixa,
ContaReceber, movimentações) intocável: necessidade de editá-lo = parar e
reportar. Escrever somente na allowlist do GOAL/open.

Não receber pagamento, entregar OS, aprovar orçamento, iniciar execução ou
diagnóstico, abrir/fechar caixa, movimentar estoque, enviar WhatsApp,
emitir fiscal, fazer backfill ou reclassificar OS fora do PostgreSQL local
descartável.

## Prova de resultado

Executar N01–N20, C01–C14, P01–P08, E01–E08, test_command do GOAL,
regressões dos GOALs 001/002/003/004 e dos PRs #237/#238, typecheck,
ESLint focado, build, diff --check, AEP verify, verify --all e check.

Usar PostgreSQL local descartável, nunca produção. Estados de dinheiro do
E2E preparados de forma sintética pelo harness QA no banco descartável.

E2E em e2e/specs/operacoes-v4-fluxo-curto-005.spec.ts, porta isolada 3050
ou próxima disponível, --retries=0, sem matar processos. Sincronizar
prontidão real; não usar sleeps arbitrários, skip/fixme, .first()
arbitrário, catch para engolir falha ou reload para mascarar race.

O test_command isolado não substitui homologação e R.

## Publicação e revisão independente

Após validação, conferir diff e allowlist, criar commits normais,
push e PR contra main, com Vercel omni-gestao e omni-gestao-pro em SUCCESS.

Sem amend, rebase, force, squash ou contorno de checks.

Executor Anthropic exige R de outra família (OpenAI) sobre o HEAD
candidato exato e suas evidências, com P0=P1=P2=0 e VERDICT=APPROVE.

Sem R OpenAI real disponível, entregar o pacote de R definido no GOAL e
parar com:

R_STATUS=AGUARDANDO_OPENAI
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Não executar AEP close nem mergear o produto antes da R.
Não autodeclarar R e não iniciar GOAL 006.
