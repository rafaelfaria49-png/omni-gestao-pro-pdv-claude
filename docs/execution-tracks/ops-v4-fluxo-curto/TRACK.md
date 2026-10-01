# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 7,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026 e contrato humano
OPS-V4-FLUXO-CURTO-003, plan_rev 7, fornecido em 30/09/2026.

## Escopo ativo

Somente OPS-V4-FLUXO-CURTO-003 está ativo/elegível, com contrato em
goals/OPS-V4-FLUXO-CURTO-003.md.

OPS-V4-FLUXO-CURTO-001 e OPS-V4-FLUXO-CURTO-002 permanecem DONE.
Não reabrir.

GOALs 004–008 não são elegíveis.
Não criar outro GOAL para corrigir o 003.

O objetivo é criar a OS de Serviço já autorizado já comercialmente
aprovada, com orçamento real aprovado e autorização auditável,
abrindo Execução em estado Aprovada/Aguardando início.
O início da execução continua sendo decisão explícita do operador.

Não criar V5, duplicar funcionalidades nem reconstruir Nova OS.
Entrada como complementação pertence ao GOAL 004.
Retorno/garantia do GOAL 007 permanece fora deste escopo.

## Materialização humana e ativação

O EXECUTION_PROTOCOL.md, §2, determina:
“Adicionar ou remover um GOAL em `goals/` é ato **humano**”.

O proprietário materializa o GOAL 003 e este TRACK rev 7 em checkout
de planejamento baseado em origin/main.

Depois, seguir o rito oficial:
registry → verify → commit/PR exclusivo de planejamento → integração
em main → criação da worktree de produto sobre a main atualizada
→ status → open.

Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Não deixar alterações de goals/** no diff de produto do check 8.

## Ambiente planejado

Branch: goal/ops-v4-fluxo-curto-003.
Worktree: C:/Projetos/omni-gestao-ops-v4-fluxo-curto-003.
Base: origin/main vigente na ativação, após integração do planejamento.

Base conferida em 30/09/2026:
c3073f18efa9cbed2d1a1b0f63594b5747274832.

A base de produto deve conter esse merge do GOAL 002 ou descendente.
Preservar outras branches/worktrees e processos externos.

## Contrato funcional

Somente a escolha explícita Serviço já autorizado registra aprovação.

Criar server-side o snapshot comercial final antes de createOS:
itens, serviços, orçamento materializado aprovado, autorização comercial,
status aprovado, garantia prevista e total canônico.

Timestamp e operador da autorização nascem no servidor/sessão.
Não fabricar enviadoEm.
Não compor a abertura por três actions independentes no browser.

Usar o retorno canônico para abrir a OS Aprovada no stage Execução,
com CTA Iniciar execução. Não iniciar serviço automaticamente.

Preservar múltiplos serviços e aceitar a linha atual válida no submit,
sem confirmação redundante. Busy-lock impede criação duplicada pela
mesma interação; falha preserva dados e modal.

precisa_diagnostico continua aberta/Entrada, sem preço obrigatório,
autorização comercial ou orçamento aprovado.
retorno_garantia mantém o comportamento vigente.
Nenhum backfill ou reclassificação de OS legadas.

## Gates

Somente G-AEP-CORE está liberado, restrito ao cadastro e à reconciliação
desta trilha. Não alterar as regras que julgam o GOAL.

A autorização anterior de G-CONFIG-DEPLOY para dependências de teste
não se aplica ao GOAL 003. Não editar package.json, lockfile ou
configuração global por esta revisão.

Schema, migrations, seeds, auth, CI, configuração de deploy, .env e
produção mutante continuam fechados.

Não alterar app/actions/operacoes.ts.
Escrever somente na allowlist do GOAL/open.

Path indispensável fora da allowlist exige parada antes da edição
e indicação do motivo técnico concreto.

Não abrir caixa, receber pagamento, criar venda/recebimento/título
financeiro, movimentar caixa ou estoque, reservar estoque novo,
entregar OS, iniciar garantia operacional, enviar WhatsApp, emitir
fiscal, iniciar execução ou criar/atribuir técnico.

## Prova de resultado

Executar A01–A10, U01–U07, test_command do GOAL, regressões diretamente
tocadas e relevantes dos GOALs 001/002, typecheck, ESLint focado,
build seguro, diff --check, AEP verify, verify --all e check.

Usar PostgreSQL local descartável, nunca produção.

Provar criação/read-back de uma única OS no storeId correto,
Troca de tela 300/92/90, status aprovado, orçamento real aprovado,
total 300, custo 92, garantias coerentes e autorização persistida,
sem efeitos financeiros, caixa, estoque, entrega ou início de execução.

Executar cenário separado de diagnóstico sem preço.

E2E em e2e/specs/operacoes-v4-fluxo-curto-003.spec.ts.
Usar porta isolada 3010 ou próxima disponível, sem matar processos.
Sincronizar prontidão real; não usar sleeps arbitrários, skip/fixme,
.first() arbitrário, catch para engolir falha ou reload para mascarar race.

O test_command isolado não substitui homologação e R.

## Publicação e revisão independente

Após validação, conferir diff e allowlist, criar commits normais,
push e PR contra main, com Vercel Preview e candidato final.

Sem amend, rebase, force ou contorno de checks.

Executor OpenAI exige R de outra família, preferencialmente
Anthropic/Claude, sobre o HEAD candidato e suas evidências.

Entregar o pacote de R definido no GOAL e parar com:

R_STATUS=AGUARDANDO_ANTHROPIC
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Não executar AEP close nem mergear o produto antes da R.
Não autodeclarar R e não iniciar GOAL 004.
