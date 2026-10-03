# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 8,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026 e contrato humano
OPS-V4-FLUXO-CURTO-004, plan_rev 8, fornecido em 03/10/2026.

## Escopo ativo

Somente OPS-V4-FLUXO-CURTO-004 está ativo/elegível, com contrato em
goals/OPS-V4-FLUXO-CURTO-004.md.

OPS-V4-FLUXO-CURTO-001, 002 e 003 permanecem DONE.
Não reabrir.

GOALs 005–008 não são elegíveis.
Não criar outro GOAL para corrigir o 004 (004B, 004-FIX, 004-RETRY, 004C).

O objetivo é transformar a etapa Entrada da Operações V4 em espaço de
complementação operacional: dados da abertura aparecem como registrados,
pendências honestas (registrado / falta complementar / opcional) derivam
da OS real, a navegação entre Recepção, Segurança, Inspeção e Evidências
é livre e o salvamento é explícito e localizado, sem segundo wizard.

Não criar V5, duplicar actions V3 nem reconstruir a Nova OS.
Retorno/garantia do GOAL 007 permanece fora deste escopo.

## Materialização humana e ativação

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL
em goals/ é ato humano.

O proprietário materializa o GOAL 004 e este TRACK rev 8 no checkout de
planejamento C:/Projetos/omni-gestao-ops-v4-fluxo-curto-004-plan,
branch plan/ops-v4-fluxo-curto-004, baseado em origin/main.

Depois, seguir o rito oficial:
registry → verify → verify --all → commit/PR exclusivo de planejamento
→ merge normal em main → criação da worktree de produto sobre a main
atualizada → status → open.

Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Não deixar alterações de goals/** no diff de produto do check 8.

## Ambiente planejado

Branch: goal/ops-v4-fluxo-curto-004.
Worktree: C:/Projetos/omni-gestao-ops-v4-fluxo-curto-004.
Base: origin/main vigente na ativação, após integração do planejamento.

Base conferida em 03/10/2026:
556256859408e070d72365cc5fd3cdc999893d91.

A base de produto deve conter esse merge do GOAL 003 ou descendente.
Preservar outras branches/worktrees (inclusive C:/Projetos/omni-gestao,
ocupada por outra frente) e processos externos.

## Contrato funcional

A Entrada deixa de ser wizard: sem numeração de passos, sem progresso
"x de 4", sem Anterior, sem Salvar e continuar, sem avanço automático.
Os quatro grupos viram áreas independentes de complementação.

Na entrada inicial da instância (loja+OS), com carga estabelecida, a área
selecionada é a primeira pendência real "falta complementar"; sem
pendência acionável, estado honesto "Entrada já complementada".
Escolha manual ou edição congelam a área: refresh não a troca.

Pendências derivam só de derivarPendenciasEntradaV4(realOS):
registrado, falta complementar, opcional. Opcional nunca é erro.
Nenhuma pendência bloqueia status, etapa ou navegação.

"Nenhum acessório" é resposta válida (evento acessorio_registrado com
presentes 0). Fotos e assinatura são opcionais. Estado físico padrão só
vira registro depois de salvamento real que inclua estado físico.
Face ID/biometria ausentes são "não informado", nunca "não".

Salvar complementos não muda operacaoStatusV3, status comercial,
orçamento, valorTotal, execução ou entrega. Sem autosave.
Rascunho, mesclagem, conflito e guarda salvar/descartar/cancelar do
GOAL 001 permanecem intactos.

## Gates

Nenhum gate de caminho liberado (gates_liberados vazio).

Schema, migrations, seeds, auth, proxy, CI, package.json, lockfile,
Node/Vercel, configuração de deploy, .env e produção mutante continuam
fechados.

Não alterar app/actions/operacoes.ts.
Escrever somente na allowlist do GOAL/open.

Única exceção fora de lib/operacoes-v4 e components/operacoes-v4-preview:
lib/operacoes-v3/prova-entrada-actions.ts, metadata aditivo (fatias) no
evento da prova de entrada, conforme demonstração do GOAL. Qualquer outro
path de lib/operacoes-v3/** exige parada antes da edição e indicação do
motivo técnico concreto.

Não abrir/fechar caixa, receber pagamento, criar venda/recebimento/título,
movimentar caixa ou estoque, entregar OS, iniciar execução ou diagnóstico,
aprovar orçamento, enviar WhatsApp, emitir fiscal, fazer backfill ou
reclassificar OS antigas.

## Prova de resultado

Executar A01–A14, U01–U12, test_command do GOAL, regressões dos GOALs
001/002/003, typecheck, ESLint focado, build, diff --check, AEP verify,
verify --all e check.

Usar PostgreSQL local descartável, nunca produção.
Cenário P1 (autorizado) e P2 (diagnóstico) com read-back de status
preservado e ausência de efeitos financeiros, caixa, estoque, entrega,
início de execução ou diagnóstico.

E2E em e2e/specs/operacoes-v4-fluxo-curto-004.spec.ts.
Usar porta isolada 3010 ou próxima disponível, sem matar processos.
Sincronizar prontidão real; não usar sleeps arbitrários, skip/fixme,
.first() arbitrário, catch para engolir falha ou reload para mascarar race.

O test_command isolado não substitui homologação e R.

## Publicação e revisão independente

Após validação, conferir diff e allowlist, criar commits normais,
push e PR contra main, com Vercel omni-gestao e omni-gestao-pro em SUCCESS.

Sem amend, rebase, force ou contorno de checks.

Executor Anthropic exige R de outra família: OpenAI, preferencialmente
GPT-6.1, sobre o HEAD candidato exato e suas evidências.

Sem R OpenAI real disponível, entregar o pacote de R definido no GOAL e
parar com:

R_STATUS=AGUARDANDO_OPENAI
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Não executar AEP close nem mergear o produto antes da R.
Não autodeclarar R e não iniciar GOAL 005.
