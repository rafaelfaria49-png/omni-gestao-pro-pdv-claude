# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 16,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026 e autorização operacional
ponta a ponta do proprietário para OPS-V4-FLUXO-CURTO-007, plan_rev 16
(rev 14 + desbloqueios humanos das revs 15 e 16), classe derivada C4 (proposta
C3; divergência registrada no GOAL), risco ALTO, fornecida em 08/10/2026
("COMANDO MESTRE — OPS-V4-FLUXO-CURTO-007" e "COMANDO MESTRE — DESBLOQUEAR,
CORRIGIR E PUBLICAR GOAL 007") e em 09/10/2026 ("DECISÃO HUMANA — GOAL 007 /
REV 16").

## Escopo ativo

Somente OPS-V4-FLUXO-CURTO-007 está ativo/elegível, com contrato em
goals/OPS-V4-FLUXO-CURTO-007.md.

OPS-V4-FLUXO-CURTO-001 a 006 permanecem DONE (histórico em _closed/,
inalterado). Não reabrir. A Próxima ação (005) e recebimento ≠ retirada
(006) são contratos obrigatórios de regressão.

GOAL 008 não é elegível.
Não criar outro GOAL para corrigir o 007 (007B, 007-FIX, 007-HARDENING).

O objetivo é o RETORNO pela OS original: localizar a original, herdar
cliente/aparelho/serviço/histórico sem recadastro, registrar só o novo
relato, enquadrar a garantia com honestidade (ativa, vencida/sem cobertura,
não informada, ocorrência antes da entrega) e abrir UM atendimento real,
persistido, vinculado nos dois lados, idempotente sob retry e concorrência —
sem venda, pagamento, movimentação financeira, estoque ou renovação
automática de garantia, preservando integralmente a OS original.

Não criar V5, quarto motor de criação de OS, segunda máquina de status,
motor paralelo a criarOSEnterpriseV3 nem OS avulsa rotulada como garantia.

## Materialização humana e ativação

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL
em goals/ é ato humano.

A decisão textual do proprietário ("COMANDO MESTRE —
OPS-V4-FLUXO-CURTO-007") é materializada com este TRACK rev 14 no checkout
de planejamento C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007-plan, branch
plan/ops-v4-fluxo-curto-007, baseado em origin/main.

Depois, seguir o rito oficial:
registry → verify → verify --all → commit/PR exclusivo de planejamento
→ merge normal (merge commit) em main → worktree de produto sobre a main
atualizada → status → open.

Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Não deixar alterações de goals/** no diff de produto do check 8.

Rev 15 (desbloqueio após o teto de tentativas): o proprietário reativou o
MESMO GOAL (BLOCKED by=externo em 8d1f392, após a R4 em c290ecd), sem GOAL
sucessor. Escopo restrito aos dois P2 da R4 (limite da ocorrência
pré-entrega derivado do prefixo em RetornoOrigemPickerV4.tsx; contenção de
foco do Modal "Finalizar retorno" em PosVendaStage.tsx) e seus testes;
allowlist, test_command e contrato inalterados. Rito: PR exclusivo de
governança (block + desbloqueio) → merge normal na main → merge normal da
main na branch do GOAL → open (tentativa 1 da rev 15).

Rev 16 (novo desbloqueio após o teto da rev 15): o proprietário reativou o
MESMO GOAL (BLOCKED by=decisao em 1a0b125, após a R7 em 343eded com P2=1),
sem GOAL sucessor. Escopo restrito ao R7-01 (restauração de foco do seletor
Retorno / Garantia quando o gatilho da ficha some após resposta perdida e
releitura, em RetornoOrigemPickerV4.tsx) e seus testes; allowlist,
test_command e contrato inalterados. Mesmo rito: PR exclusivo de governança
→ merge normal → merge normal da main na branch do GOAL → open (tentativa 1
da rev 16).

## Ambiente planejado

Branch: goal/ops-v4-fluxo-curto-007.
Worktree: C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007.
Base: origin/main vigente na ativação, após integração do planejamento.

Base conferida em 08/10/2026:
07385d1435c2e4fe8450ef513f9abaa15edabd8e (merge do PR #245, GOAL 006).

A base de produto deve conter esse merge ou descendente. Preservar outras
branches/worktrees (inclusive C:/Projetos/omni-gestao, ocupada por outra
frente, e as worktrees dos GOALs 001–006) e processos externos.

## Contrato funcional (resumo — detalhe no GOAL)

"+ Novo" ganha a entrada "Retorno / Garantia" (ponto de entrada para
abrirRetornoV3, não motor novo), com seletor de OS original por número,
cliente e aparelho (leitura server-side autenticada e filtrada por loja,
DTO sem senha), também aberto pré-selecionado pela ficha (Pós-venda) e pelo
portfólio de Garantias. O operador informa só motivo, observação e a
recepção do novo atendimento (acessórios entregues agora, senha opcional);
senha e acessórios da original nunca são herdados automaticamente. OS não
entregue leva à observação interna da própria OS; o servidor recusa
retorno em OS não entregue ou cancelada.

Idempotência sem gate protegido: operacaoId estável por operação lógica;
reserva sob a trava da original (transação curta, TTL maior que a duração
máxima de função), criação da filha fora da trava só por quem detém a
reserva, adoção da filha por vínculo após falha, vínculo idempotente,
descarte explícito de filha excedente — nunca órfã silenciosa nem
duplicada. connection_limit=1 impede segurar a trava durante a criação.

## Gates

Nenhum gate de caminho liberado (gates_liberados vazio). Classe C4: o gate
humano explícito é a autorização do proprietário de 08/10/2026.

Schema, migrations, seeds, auth, proxy, CI, package.json, lockfile,
Node/Vercel, configuração de deploy, .env, Fiscal, WhatsApp, Marketplace,
AppShell e produção mutante continuam fechados.

Motores e serviços globais (PDV, Caixa, Financeiro, Estoque,
lib/operacoes/**, app/actions/**) e os contratos V3 adjacentes
(nova-os-actions.ts, os-payload-lock.ts, retorno-auto-close*,
entrega-actions.ts, producao-actions.ts, status-*) são só leitura/chamada:
necessidade de editá-los = parar e devolver UMA decisão (PROTECTED_PATH,
WHY_REQUIRED, MINIMAL_DIFF, RISK_IF_NOT_DONE, ALTERNATIVE_WITHIN_SCOPE).

Exceção controlada V3 (allowlist do GOAL): retorno-actions.ts,
pos-venda-model.ts e retorno-atendimento.ts (+ testes). Não é autorização
genérica para lib/operacoes-v3/**.

Não abrir retorno, criar OS, registrar observação, alterar garantia,
receber, movimentar estoque ou caixa fora do PostgreSQL local descartável.
OS-2026-00028 proibida.

## Prova de resultado

Executar T53–T57, E2E 007, test_command do GOAL, regressões dos GOALs
001–006 e dos PRs #234/#235/#237/#238, typecheck, ESLint em todos os
.ts/.tsx alterados, build, diff --check, AEP verify, verify --all e check.

Usar PostgreSQL local descartável (ops_v4_fluxo_007_qa*; o PostgreSQL do
006 roda à parte em ops_v4_fluxo_006_qa*), nunca produção. Massa
sintética (lojas A/B, clientes, OS entregues com garantia ativa, vencida,
sem cobertura e não informada, OS em reparo, OS cancelada, retornos
legados). Concorrência provada de forma determinística em PostgreSQL real
(barreira + pg_stat_activity, nunca sleep).

E2E em e2e/specs/operacoes-v4-fluxo-curto-007.spec.ts, porta isolada 3070
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

Não autodeclarar R. Depois de publicar o 007: parar; não iniciar 008.
