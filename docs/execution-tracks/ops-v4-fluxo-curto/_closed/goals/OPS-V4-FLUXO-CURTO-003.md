# OPS-V4-FLUXO-CURTO-003 — Abertura curta com serviço já autorizado

<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-003",
  "track": "ops-v4-fluxo-curto",
  "title": "Abertura curta com serviço já autorizado",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "plan_rev": 7,
  "branch": "goal/ops-v4-fluxo-curto-003",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-003",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v4/nova-os-draft-from-form.test.ts lib/operacoes-v4/servicos-autorizados-form.test.ts lib/operacoes-v3/nova-os-model.test.ts lib/operacoes-v3/nova-os-actions.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/status-machine.test.ts lib/operacoes/services/orcamento-builder.test.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-003/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-003.spec.ts",
  "allowlist": [
    "components/operacoes-v4-preview/parts/NovaOSModal.tsx",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/os-adapter.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.test.ts",
    "lib/operacoes-v4/servicos-autorizados-form.ts",
    "lib/operacoes-v4/servicos-autorizados-form.test.ts",
    "lib/operacoes-v3/nova-os-actions.ts",
    "lib/operacoes-v3/nova-os-actions.test.ts",
    "lib/operacoes-v3/nova-os-model.ts",
    "lib/operacoes-v3/nova-os-model.test.ts",
    "lib/operacoes-v3/orcamento-model.ts",
    "lib/operacoes-v3/orcamento-model.test.ts",
    "lib/operacoes-v3/status-machine.ts",
    "lib/operacoes-v3/status-machine.test.ts",
    "lib/operacoes/services/orcamento-builder.ts",
    "lib/operacoes/services/orcamento-builder.test.ts",
    "test/ops-v4-fluxo-curto-003/**",
    "e2e/specs/operacoes-v4-fluxo-curto-003.spec.ts",
    "docs/execution-tracks/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md",
    "docs/ai-execution/protocol.json"
  ],
  "gates_liberados": [
    "G-AEP-CORE"
  ],
  "read_budget": 35,
  "revisao_independente": true,
  "familia_executor": "openai",
  "reversibilidade": "media"
}
-->

## Autoridade e ativação

Contrato humano aprovado: plan_rev 7, nível técnico 4/5, classe C3,
risco ALTO, executor OpenAI e revisão independente obrigatória de outra família.

O EXECUTION_PROTOCOL.md, §2, determina:
“Adicionar ou remover um GOAL em `goals/` é ato **humano**”.

O proprietário materializa este arquivo e o TRACK.md rev 7 em checkout
de planejamento baseado em origin/main. O executor não substitui essa
gravação humana por escrita automática.

Depois da materialização humana:
registry → verify → commit/PR exclusivo de planejamento → integração
do planejamento em main → criação da worktree de produto sobre a main
atualizada → status → open.

Nunca incluir mudanças de goals/** no diff de produto avaliado pelo check 8.
Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Derivados são atualizados somente pelo mecanismo oficial.

G-AEP-CORE está liberado exclusivamente para cadastro/reconciliação da trilha.
Não autoriza alterar as regras do AEP.

## Base e reconciliação focal

Repositório:
rafaelfaria49-png/omni-gestao-pro-pdv-claude

Base conferida na elaboração deste contrato:
c3073f18efa9cbed2d1a1b0f63594b5747274832

Esse commit contém o merge do GOAL 002.

A base de produto deve ser origin/main vigente depois da integração do
planejamento e continuar contendo c3073f18 ou descendente.

OPS-V4-FLUXO-CURTO-001 permanece DONE.
OPS-V4-FLUXO-CURTO-002 permanece DONE.

Não reabrir 001/002.
Não iniciar GOALs 004–008.

Executar somente reconciliação focal antes de editar, dentro do read_budget.

Já existem e devem ser reaproveitados:

- NovaOSModal com Serviço já autorizado / Precisa de diagnóstico / Retorno;
- criarOSEnterpriseV3;
- múltiplos serviços;
- catálogo de serviços;
- venda;
- custo;
- garantia por serviço;
- prazo textual;
- garantia coerente do GOAL 002;
- read-back/hidratação do GOAL 001;
- máquina de status V3;
- orçamento V3;
- Execução;
- Financeiro/Entrega.

Problema atual:
Serviço já autorizado materializa serviço e valor, porém ainda nasce como
OS aberta e o callback a abre na Entrada.

Não criar V5.
Não duplicar funcionalidades.
Não reconstruir a Nova OS.

## Objetivo

Transformar a escolha explícita “Serviço já autorizado” em fluxo curto:

cliente + aparelho + serviço/valor já aprovado
→ criar OS comercialmente aprovada
→ abrir diretamente o próximo contexto operacional
→ operador decide explicitamente quando iniciar execução.

Este GOAL resolve abertura + checkpoint comercial.

A complementação da Entrada sem segundo wizard pertence ao GOAL 004.

## Autorização comercial explícita

Somente a escolha explícita do modo Serviço já autorizado representa
aprovação do cliente.

Nunca inferir autorização simplesmente porque:

- existe serviço;
- valor é maior que zero;
- existe garantia;
- orçamento possui total.

Antes de criar contrato novo, procurar estrutura canônica equivalente.

Se não existir, usar snapshot JSONB aditivo e localizado, preferencialmente:

    autorizacaoComercialV3: {
      autorizada: true,
      registradaEm: <timestamp server-side>,
      registradaPor: <operador da sessão>,
      origem: <origem da recepção>,
      escopo: "servicos_da_abertura",
      total: <total comercial aprovado>
    }

O nome pode mudar somente para reutilizar contrato equivalente mais
canônico já existente.

Regras:

- timestamp nasce no servidor;
- operador nasce da sessão;
- total nasce do cálculo canônico;
- browser não fornece ator/timestamp/total autoritativos;
- precisa_diagnostico não registra autorização;
- retorno_garantia não registra essa autorização neste GOAL;
- sem tabela/schema/migration.

## Criação server-side

Manter criarOSEnterpriseV3 compatível com seus chamadores existentes.

Adicionar caminho explícito autorizado, como criarOSServicoAutorizadoV3,
ou refatorar internamente para um core comum.

Não implementar no cliente:

criar OS → gerar orçamento → aprovar orçamento

como três server actions independentes.

Isso poderia deixar uma OS parcialmente criada.

O caminho server-side autorizado deve montar ANTES da persistência o
snapshot final contendo:

- itens;
- servicosCatalogo;
- orçamento materializado aprovado;
- versão/snapshot de aprovação quando aplicável;
- autorização comercial;
- operacaoStatusV3 aprovado;
- status/projeção compatível aprovado;
- garantia prevista;
- valor comercial canônico.

Reutilizar, quando apropriado:

- mapItensParaServicosCatalogoV3;
- computeTotaisNovaOSV3;
- buildOrcamentoRascunhoFromOS;
- recalcOrcamentoV3;
- helpers da máquina/status.

Não duplicar matemática comercial.

A criação deve chegar a createOS já representando o estado comercial final.

Não alterar app/actions/operacoes.ts.

Preservar o comportamento seguro atual:
criação de OS não cria Conta a Receber, não recebe pagamento e não baixa estoque.

## Orçamento aprovado na abertura

Caso principal:

Troca de tela
Venda = 300
Custo interno = 92
Garantia = 90 dias

Após criação/read-back:

- operacaoStatusV3 = aprovado;
- status/projeção compatível = aprovado;
- orçamento existe;
- orçamento é materializado;
- sintetizado !== true;
- orçamento.status = aprovado;
- orçamento.total = 300;
- serviço = Troca de tela;
- custoV3 = 92;
- prazoGarantiaDias = 90;
- garantia da OS continua coerente com GOAL 002;
- valorTotal = 300;
- respondidoEm está registrado;
- enviadoEm NÃO é fabricado.

Autorização presencial/prévia não significa “orçamento enviado”.

Com dois serviços:
somar exatamente os valores válidos e preservar custo, prazo e garantia
individual de cada linha.

Não criar título financeiro.
Não registrar dinheiro recebido.

## Comportamento após criação

Serviço já autorizado significa:

APROVADO / AGUARDANDO INÍCIO.

Não significa EM EXECUÇÃO.

Depois da criação:

- abrir a OS recém-criada no workspace;
- status exibido = Aprovada;
- abrir o stage operacional correspondente à Execução;
- CTA = Iniciar execução ou equivalente canônico.

O início continua exigindo clique explícito.

Não chamar iniciarServico automaticamente.
Não criar evento servico_iniciado.
Não atribuir técnico automaticamente.

A UI deve usar a OS real retornada pelo servidor.

Não fabricar status "aberta" no callback.

Preferir statusV3FromOS / stageForStatus ou fonte canônica equivalente.

## Modal curto

Não redesenhar toda a Nova OS.

Para Serviço já autorizado, manter evidentes os essenciais:

- Cliente;
- Aparelho;
- Relato/defeito;
- Serviço(s) e valores.

Complementos continuam opcionais/colapsados conforme o contrato existente:

- prioridade;
- local físico;
- previsão;
- prova de entrada;
- demais dados de recepção.

Não obrigar o operador a passar por:

Diagnóstico → Orçamento → Aprovação

quando ele declarou explicitamente que o serviço já foi aprovado.

Não exigir clique redundante em Confirmar serviço se a linha atualmente
aberta já estiver válida no momento do submit.

A validação final deve incluir essa linha válida.

Preservar múltiplos serviços.

## Falhas e idempotência de interação

Aplicar busy-lock na criação.

Duplo clique da mesma interação não pode criar duas OS.

Se a criação falhar:

- preservar dados digitados;
- mostrar erro recuperável;
- não fechar o modal;
- não mostrar sucesso falso.

Não mascarar criação parcial.

A server action retorna a OS canônica criada.

## Fluxos preservados

### precisa_diagnostico

Continua:

- sem exigir preço;
- status aberta;
- sem autorização comercial;
- sem orçamento aprovado;
- fluxo normal/Entrada;
- diagnóstico continua necessário quando realmente necessário.

### retorno_garantia

Preservar comportamento atual.

Não transformar em venda nova.
Não resolver GOAL 007 aqui.

### OS comuns/legadas

Nenhum:

- backfill;
- reclassificação automática;
- mutação retroativa.

## Efeitos colaterais proibidos

A criação autorizada NÃO pode:

- abrir caixa;
- receber pagamento;
- registrar dinheiro recebido;
- criar venda;
- criar recebimento;
- criar título financeiro;
- movimentar caixa;
- baixar estoque;
- movimentar estoque;
- reservar estoque novo;
- entregar OS;
- iniciar garantia operacional de pós-entrega;
- enviar WhatsApp;
- emitir fiscal;
- iniciar execução;
- criar servico_iniciado;
- criar técnico;
- atribuir técnico;
- mudar schema;
- criar migration.

Garantia prevista pode existir na abertura.

Garantia operacional continua iniciando somente na entrega conforme o
motor atual.

## Aceite server-side — A01–A10

Criar `lib/operacoes-v3/nova-os-actions.test.ts` se ainda não existir.

### A01 — status autorizado

Modo Serviço já autorizado explícito com:

Troca de tela
Venda 300
Custo 92
Garantia 90

deve criar OS com status V3 `aprovado`.

### A02 — orçamento materializado aprovado

Após criação:

- orçamento existe;
- sintetizado !== true;
- status = aprovado;
- total = 300.

### A03 — autorização auditável

Autorização persistida contém:

- autorizada = true;
- timestamp server-side;
- operador da sessão;
- origem;
- escopo;
- total canônico = 300.

### A04 — sem envio fictício

Não existe `enviadoEm` fabricado apenas para representar autorização.

### A05 — sem execução automática

Após criar:

- status não é em_execucao;
- não existe evento servico_iniciado;
- nenhuma action de início foi executada automaticamente.

### A06 — ausência de efeitos externos

A abertura não cria:

- recebimento;
- título financeiro;
- caixa;
- venda;
- estoque consumido/movimentado/reservado;
- entrega.

### A07 — múltiplos serviços

Dois serviços válidos preservam:

- soma exata;
- descrição individual;
- custos individuais;
- garantias individuais;
- prazos individuais.

### A08 — diagnóstico preservado

`precisa_diagnostico`:

- não exige preço;
- cria OS aberta;
- não registra autorização comercial;
- não cria orçamento aprovado.

### A09 — retorno preservado

`retorno_garantia`:

- não vira autorização comercial deste GOAL;
- não vira venda nova;
- preserva comportamento anterior.

### A10 — garantia e valor

Troca de tela 300/92/90 preserva:

- garantia da linha = 90;
- garantia geral coerente com GOAL 002;
- custo = 92;
- orçamento.total = 300;
- valorTotal = 300.

## Aceite de UI montada — U01–U07

Criar testes em:

`test/ops-v4-fluxo-curto-003/**`

### U01

Modo Serviço já autorizado usa o novo caminho server-side autorizado.

### U02

Sucesso recebe a OS real aprovada e abre Execução.

### U03

CTA inicial = Iniciar execução ou equivalente canônico.

### U04

Nenhuma chamada automática de iniciarServico.

### U05

Falha preserva formulário e mostra erro recuperável.

### U06

Precisa de diagnóstico continua no fluxo normal/Entrada.

### U07

Linha atualmente aberta e válida pode ser submetida sem exigir clique
redundante em Confirmar serviço.

## PostgreSQL descartável

Usar somente PostgreSQL local descartável.

Nunca produção.

Caso principal:

- Cliente QA sintético;
- Samsung / Galaxy QA;
- Relato = Tela quebrada;
- Serviço = Troca de tela;
- Venda = 300;
- Custo = 92;
- Garantia = 90.

Após criação/read-back provar:

- existe somente 1 OS correspondente;
- storeId correto;
- coluna status coerente;
- operacaoStatusV3 = aprovado;
- orçamento aprovado/materializado;
- sintetizado !== true;
- orçamento.total = 300;
- valorTotal = 300;
- custoV3 = 92;
- garantia da linha = 90;
- garantia geral coerente;
- autorização comercial persistida;
- nenhum recebimento;
- nenhum título financeiro;
- nenhum movimento de caixa;
- nenhum movimento/reserva nova de estoque;
- nenhuma entrega;
- nenhum servico_iniciado.

Executar cenário separado:

Precisa de diagnóstico sem preço
→ OS aberta
→ sem autorização comercial
→ sem orçamento aprovado.

## E2E

Criar:

`e2e/specs/operacoes-v4-fluxo-curto-003.spec.ts`

A porta 3000 é compartilhada no host.

Preferir 3010.

Se estiver ocupada, usar 3011, 3012 ou próxima livre.

Não matar processo externo.

Pode subir build/app isolado com:

PLAYWRIGHT_BASE_URL=http://127.0.0.1:<porta>
NEXTAUTH_URL=http://127.0.0.1:<porta>
PLAYWRIGHT_E2E_SKIP_WEBSERVER=1

Não editar a configuração global do Playwright por causa da porta.

Sincronizar prontidão real de `/api/stores` e `/api/ops/ordens`
quando aplicável.

Não usar:

- sleep arbitrário;
- `.first()` arbitrário;
- skip;
- fixme;
- catch para engolir falha;
- page.reload para mascarar race.

### Cenário E2E principal

1. Login QA.
2. Abrir Operações V4.
3. + Novo.
4. Nova OS.
5. Serviço já autorizado.
6. Cliente sintético.
7. Aparelho sintético.
8. Relato Tela quebrada.
9. Serviço Troca de tela.
10. Venda 300.
11. Custo 92.
12. Garantia 90.
13. Criar sem confirmação redundante da linha válida.
14. Modal fecha.
15. OS recém-criada abre automaticamente.
16. Status = Aprovada.
17. Próximo contexto = Execução.
18. Orçamento = Aprovado.
19. Total = R$ 300.
20. Garantia = 90 dias.
21. CTA = Iniciar execução.
22. Confirmar que a OS ainda NÃO está em execução.

### Cenário E2E diagnóstico

Precisa de diagnóstico sem preço:

- status aberta;
- fluxo normal;
- sem autorização comercial;
- sem orçamento aprovado.

## Validação

Executar:

- A01–A10;
- U01–U07;
- test_command META rev 7;
- regressões diretamente tocadas;
- regressões relevantes do GOAL 001;
- regressões relevantes do GOAL 002;
- PostgreSQL descartável;
- E2E 003;
- typecheck;
- ESLint focado;
- build seguro;
- git diff --check;
- AEP verify;
- AEP verify --all;
- AEP check.

Não executar suíte fiscal global apenas por hábito.

Falhas fiscais externas/preexistentes ficam fora somente quando
comprovadamente não relacionadas ao diff.

## Autocorreção

Este é UM GOAL.

Se um teste/aceite falhar dentro da allowlist:
corrigir e continuar.

Não criar:

- 003B;
- 003-FIX;
- 003-RETRY;
- 003C;
- outro GOAL corretivo.

Tentativas são as oficiais do AEP.

Não pedir nova autorização para correção já coberta pelo mesmo contrato.

Parar somente por:

- gate humano literal;
- path indispensável fora da allowlist;
- credencial/serviço externo realmente indisponível;
- teto de tentativas;
- risco real de produção/dados.

## Commit e PR

Quando tudo estiver verde:

- conferir diff completo;
- conferir allowlist;
- adicionar arquivos por caminhos explícitos;
- criar commit(s) normais de produto;
- push da branch;
- abrir PR contra main;
- obter Vercel Preview;
- preparar HEAD candidato final.

Não usar:

- amend;
- rebase;
- force;
- bypass.

Não executar AEP close antes da R.
Não mergear antes da R.
Não iniciar GOAL 004.

## Pacote obrigatório para revisão R independente

Como executor = OpenAI, a R obrigatória precisa vir de outra família,
preferencialmente Anthropic/Claude.

O executor deve entregar ao revisor:

GOAL=OPS-V4-FLUXO-CURTO-003
PLAN_REV=7
BASE=<base real>
HEAD=<SHA candidato>
PR=<PR de produto>
EXECUTOR_FAMILY=openai
REQUIRED_R_FAMILY=non-openai

Incluir também:

- arquivos alterados;
- diff completo;
- descrição do contrato funcional;
- A01–A10;
- U01–U07;
- evidência PostgreSQL;
- evidência E2E;
- regressões 001/002;
- typecheck;
- lint;
- build;
- diff-check;
- AEP verify;
- verify --all;
- AEP check;
- Vercel Preview;
- prova de efeitos colaterais ausentes.

O revisor precisa julgar o HEAD candidato exato.

Se APPROVE, a R deve declarar, usando a família factual:

R_FAMILY=<familia do revisor>
EXECUTOR_FAMILY=openai
INDEPENDENCE=PASS
HEAD_REVIEWED=<SHA candidato>
VERDICT=APPROVE
READY_FOR_AEP_CLOSE=YES

Se REQUEST CHANGES:

- apontar defeitos concretos;
- correções continuam no mesmo GOAL 003;
- não criar novo GOAL;
- novo SHA exige nova R sobre o candidato corrigido.

O executor OpenAI NÃO autodeclara R.

No candidato final, antes da R:

IMPLEMENTADO=SIM
VALIDADO=SIM
PUBLICADO_COMO_PR=SIM
R_STATUS=AGUARDANDO_ANTHROPIC
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Parar nesse gate.

## Relatório final do executor

Responder somente com candidato final ou blocker humano real:

GOAL=OPS-V4-FLUXO-CURTO-003
PLAN_REV=7
BASE=
HEAD=
BRANCH=
WORKTREE=
PR=
ARQUIVOS=
AUTORIZACAO_COMERCIAL=
STATUS_APOS_CRIACAO=
ORCAMENTO=
TOTAL=
GARANTIA=
EFEITOS_COLATERAIS=
UNIT=
MOUNTED=
POSTGRES=
E2E=
REGRESSAO_001=
REGRESSAO_002=
TYPECHECK=
LINT=
BUILD=
DIFF_CHECK=
AEP_VERIFY=
AEP_VERIFY_ALL=
AEP_CHECK=
VERCEL=
IMPLEMENTADO=
VALIDADO=
PUBLICADO_COMO_PR=
R_STATUS=
AEP_CLOSE=
MERGE=
BLOCKER=

Não iniciar OPS-V4-FLUXO-CURTO-004.