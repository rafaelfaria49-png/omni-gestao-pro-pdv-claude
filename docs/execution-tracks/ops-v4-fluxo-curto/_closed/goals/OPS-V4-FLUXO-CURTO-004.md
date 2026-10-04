# OPS-V4-FLUXO-CURTO-004 — Entrada como complementação operacional, sem segundo wizard

<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-004",
  "track": "ops-v4-fluxo-curto",
  "title": "Entrada como complementação operacional, sem segundo wizard",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "plan_rev": 8,
  "branch": "goal/ops-v4-fluxo-curto-004",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-004",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v4/entrada-workspace.test.ts lib/operacoes-v4/entrada-pendencias.test.ts lib/operacoes-v4/entrada-form.test.ts lib/operacoes-v4/dados-basicos-form.test.ts lib/operacoes-v4/checklist-aplicabilidade.test.ts lib/operacoes-v4/entrada-readback.test.ts components/operacoes-v4-preview/focus-workspace.test.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-004/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-004.spec.ts",
  "allowlist": [
    "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaSections.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaSectionRail.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.test.tsx",
    "components/operacoes-v4-preview/parts/stages/entrada-workspace.module.css",
    "components/operacoes-v4-preview/focus-workspace.test.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "lib/operacoes-v4/entrada-workspace.ts",
    "lib/operacoes-v4/entrada-workspace.test.ts",
    "lib/operacoes-v4/entrada-pendencias.ts",
    "lib/operacoes-v4/entrada-pendencias.test.ts",
    "lib/operacoes-v4/entrada-form.ts",
    "lib/operacoes-v4/entrada-form.test.ts",
    "lib/operacoes-v3/prova-entrada-actions.ts",
    "test/ops-v4-fluxo-curto-004/**",
    "e2e/specs/operacoes-v4-fluxo-curto-004.spec.ts",
    "docs/execution-tracks/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 35,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "media"
}
-->

## Autoridade e ativação

Contrato humano aprovado: plan_rev 8, nível técnico 4/5, classe C3,
risco ALTO, executor Anthropic (Opus 5.5) e revisão independente
obrigatória de outra família: OpenAI / GPT-6.1.

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL
em goals/ é ato humano.

O proprietário materializa este arquivo e o TRACK.md rev 8 no checkout de
planejamento C:/Projetos/omni-gestao-ops-v4-fluxo-curto-004-plan
(branch plan/ops-v4-fluxo-curto-004, base origin/main). O executor não
substitui essa gravação humana por escrita automática.

Depois da materialização humana:
registry → verify → verify --all → commit/PR exclusivo de planejamento
→ merge normal em main → worktree de produto sobre a main atualizada
→ status → open.

Nunca incluir mudanças de goals/** no diff de produto avaliado pelo check 8.
Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.
Derivados são atualizados somente pelo mecanismo oficial.

Nenhum gate de caminho é liberado (gates_liberados vazio).
Schema, migrations, seeds, auth, proxy, CI, package.json, lockfile,
Node/Vercel, configuração de deploy, .env e produção mutante continuam
fechados.

## Base e reconciliação focal

Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude

Base conferida em 03/10/2026:
556256859408e070d72365cc5fd3cdc999893d91
(merge do GOAL 003, PR #231).

A base de produto deve ser origin/main vigente depois da integração deste
planejamento e continuar contendo 556256859 ou descendente.

OPS-V4-FLUXO-CURTO-001, 002 e 003 permanecem DONE. Não reabrir.
GOALs 005–008 continuam inelegíveis.

Achados da reconciliação focal que fundamentam este contrato:

1. EntradaWorkspace abre sempre em Recepção, numera os grupos 01–04,
   mostra "x de 4 grupos" com barra de progresso e oferece "Anterior" e
   "Salvar e continuar", que avança sozinho ao próximo grupo.
2. derivarPendenciasEntradaV4 só conhece preenchido/não preenchido:
   fotos e assinatura contam como incompletas; acessórios só contam com
   item presente.
3. O wrapper salvarAcessorios (use-v4-preview.ts) devolve sucesso sem
   gravar quando a lista é igual à semente. Numa OS nova (todos false),
   registrar "nenhum acessório" pela V4 é impossível: nenhum evento
   acessorio_registrado nasce e a pendência fica eterna.
4. persistirPatchProva (V3) materializa provaEntradaV3 com versao 1 e
   estado físico padrão "ok" em qualquer escrita da prova (acessórios,
   identificação, fotos, assinatura). provaEntradaCriadaV3 deixa de ser
   sinal honesto de estado físico conferido.
5. O wrapper salvarProvaEntrada só envia fatias tocadas (R02 do GOAL 001):
   confirmar o estado físico exibido (tudo íntegro) é impossível, e um
   salvamento só de credenciais emite o mesmo evento
   prova_entrada_criada/atualizada, sem registro de quais fatias viajaram.
6. O editor V4 colapsa faceId/biometria ausentes em false: a seção mostra
   checkbox desmarcado e o checklist marca Face ID/Biometria como N/A,
   ou seja, ausente vira "não" de fato.
7. focus-workspace.test.ts fixa por texto o comportamento de wizard
   (início em Recepção, avanço após salvar) e precisa refletir o novo
   contrato.
8. A navegação entre etapas do pipeline já é livre (só a guarda de
   rascunho sujo do GOAL 001 intercepta). O wizard vive dentro do
   workspace da Entrada.

## Exceção V3 justificada (demonstrada antes de qualquer edição)

O contrato atual de salvarProvaEntradaV3 é insuficiente para o item H:
o evento gravado não distingue um salvamento só de credenciais de uma
confirmação do estado físico (ambos geram prova_entrada_* com avariados 0
e avarias 0), e qualquer escrita da prova grava o estado físico padrão.
Sem um marcador persistido, a V4 teria duas saídas desonestas: tratar o
estado padrão como conferido depois de salvar uma senha ou um acessório,
ou nunca permitir registrar "tudo íntegro".

Mudança autorizada, estritamente aditiva, somente em
lib/operacoes-v3/prova-entrada-actions.ts:
salvarProvaEntradaV3 acrescenta ao metadata do evento
prova_entrada_criada/atualizada a lista das fatias efetivamente incluídas
(fatias: subconjunto de estadoFisico, avarias, credenciais).

Proibido nessa exceção: mudar forma ou significado de provaEntradaV3,
sanitização, conferência de baseline, conflito, espelhos legados, nome de
evento, demais actions, schema ou migration. Eventos antigos sem fatias
mantêm o significado anterior (sem backfill, sem reclassificar OS antigas).

Qualquer outra alteração em lib/operacoes-v3/** está fora da allowlist:
parar antes e demonstrar.

## Objetivo

Transformar a etapa Entrada da Operações V4 em espaço de COMPLEMENTAÇÃO
operacional:

abertura da OS → dados essenciais já registrados → Entrada serve para
conferir/complementar o que faltou → navegação livre → complementos
salvos quando existirem → fluxo operacional nunca bloqueado por
"terminar a Entrada".

Princípios:

- o que já foi informado na abertura não é perguntado de novo como se
  faltasse;
- não preenchido não significa errado nem obrigatório;
- valor default da UI nunca é apresentado como fato confirmado do
  aparelho quando nunca foi persistido.

## Contrato funcional

### A — Entrada não é wizard

Remover linguagem e comportamento de quatro passos sequenciais
obrigatórios (Recepção → Segurança → Inspeção → Evidências).
Não existe "terminar a Entrada" como pré-condição para sair, ir a
Diagnóstico, voltar a Execução ou consultar outra etapa.
Preservar somente a guarda de rascunho sujo do GOAL 001:
sair com alteração não salva → Salvar / Descartar / Cancelar.

### B — Navegação não sequencial

Os quatro grupos continuam como áreas independentes (chips compactos).
Remover "Anterior", "Salvar e continuar", avanço automático, numeração de
passos e progresso "x de 4".
Salvar é explícito e localizado ("Salvar alterações"): persiste somente as
fatias do grupo ativo e mantém o mesmo grupo ativo.

### C — Abrir no que realmente falta

Na entrada inicial da instância (chave loja+OS), com a carga da OS
estabelecida, selecionar a primeira área cuja pendência real é
"falta complementar". Sem pendência acionável: mostrar estado honesto
"Entrada já complementada" e manter navegação livre.
Depois de escolha manual de área ou de edição, refresh/reload do detalhe
não troca a área ativa.

### D — Dado da abertura é dado conhecido

Cliente, aparelho, modelo, defeito e demais dados da abertura aparecem
hidratados do servidor como registrados, editáveis quando o contrato
existente permite correção, sem exigir reentrada.
Não reconstruir a NovaOSModal dentro da Entrada.

### E — Pendências honestas

Fonte única: derivarPendenciasEntradaV4(realOS), evolução do mesmo módulo
puro. Sem estado local de conclusão.
Estados: registrado · falta complementar · opcional.
Opcional nunca usa vermelho/erro. Nenhuma pendência bloqueia status,
etapa ou navegação.

Itens e sinais (todos lidos da OS real do servidor):

- Recepção/dados básicos: registrado com recebidoPor; senão falta complementar.
- Recepção/identificação: registrado com algum identificador (modelo da
  abertura conta); senão falta complementar.
- Segurança/acesso: registrado com credencial persistida ou senha da
  abertura; senão opcional.
- Segurança/acessórios: registrado com evento acessorio_registrado
  (inclusive presentes = 0) ou item presente (abertura ou salvo); senão
  falta complementar.
- Inspeção/estado físico: registrado com evento prova_entrada_* cujas
  fatias incluem estadoFisico ou avarias, ou evento legado sem fatias, ou
  valor não padrão persistido (componente não íntegro, observação ou
  avaria); senão falta complementar.
- Inspeção/checklist: registrado com os.checklist salvo; senão falta complementar.
- Evidências/fotos: registrado com foto; senão opcional.
- Evidências/assinatura: registrado com assinatura; senão opcional.

Grupo: falta complementar se algum item falta; senão registrado se algum
item está registrado; senão opcional.

### F — Acessórios: "nenhum" é resposta válida

Ação explícita "Registrar: nenhum acessório recebido" grava pelo wrapper
existente (opção explícita que dispensa a comparação com a semente),
chamando salvarAcessoriosEntradaV3 com todos ausentes e baseline.
O evento acessorio_registrado com presentes = 0 resolve a pendência.
Sem schema, sem tabela, sem acessório fabricado.

### G — Fotos e assinatura são opcionais

Continuam disponíveis e reais, classificadas como opcional/evidência
adicional. Não exigidas para navegar ou prosseguir.
Sem assinatura fake.

### H — Estado físico: não inventar "Íntegro"

Sem registro real do estado físico, a UI deixa explícito que os valores
exibidos são padrão/rascunho não confirmado.
Ação explícita "Confirmar estado exibido" grava pelo wrapper existente
(opção explícita que inclui estadoFisico e avarias com baseline).
Só depois do salvamento real o estado aparece como registrado.
Não mudar o significado persistido do motor V3. Sem schema.

### I — Face ID/biometria: ausente não é "não"

Na camada V4, distinguir não informado / sim / não.
Sem valor persistido: "não informado" (nunca "não"); o checklist só marca
N/A quando o operador registrou explicitamente "não".
Salvar explicitamente persiste true/false pela action atual; voltar para
"não informado" usa a limpeza explícita já existente.
Sem salvar, nenhum fato é criado.

### J — Opcionais continuam opcionais

Local físico, previsão, observações, acesso, fotos, assinatura e demais
complementos seguem opcionais. Nenhuma validação obrigatória nova.

### K — Status da OS não muda

Salvar complementos da Entrada não altera operacaoStatusV3, status
comercial, orçamento, valorTotal, execução ou entrega.
Aprovada continua aprovada e Execução aguarda clique explícito.
Aberta (diagnóstico) continua aberta e o diagnóstico não inicia.

### L — Sem autosave

Salvamento explícito. Nada é gravado por trocar de grupo.

### M — Concorrência e rascunho do GOAL 001 intactos

Chave loja+OS, rascunho em memória, mesclagem de fatias não tocadas,
preservação das tocadas, conflito explícito, guarda
salvar/descartar/cancelar e restauração ao trocar de OS e voltar.
As ações explícitas F e H continuam enviando baseline (esperados) e
respeitam carga estabelecida, busy-lock e conflito.

## Proibições

Não criar V5, schema, migration, seed; não alterar auth/proxy,
package.json, lockfile, Node/Vercel, CI.
Não tocar Fiscal, PDV, Financeiro, Caixa, Estoque, WhatsApp, Marketplace.
Não iniciar execução nem diagnóstico, não aprovar orçamento, não receber
pagamento, não entregar OS, não criar título/venda, não movimentar
estoque, não abrir/fechar caixa, não fazer backfill nem reclassificar OS
antigas, não criar outro motor de Entrada, não duplicar actions V3,
não remover GOALs 001–003, não iniciar GOAL 005.

## Allowlist (justificativa)

- Entrada V4 (workspace, seções, rail, CSS, testes montados do 001) e
  libs puras V4 (workspace, pendências, form): núcleo do contrato.
- use-v4-preview.ts: provado necessário pelos achados 3 e 5 (wrappers
  salvarAcessorios/salvarProvaEntrada ganham opção explícita opcional;
  comportamento padrão e proteções do GOAL 001 inalterados).
- focus-workspace.test.ts: assertivas de texto do wizard (achado 7).
- lib/operacoes-v3/prova-entrada-actions.ts: exceção aditiva demonstrada acima.
- EntradaStage.tsx, EntradaPendenciasPanel.tsx, dados-basicos-form.ts e
  checklist-aplicabilidade.ts ficam fora: não precisam mudar.

## Aceites puros / unidade — A01–A14

- A01 — OS com dados básicos já preenchidos: Recepção NÃO aparece como
  "faltando tudo".
- A02 — Primeira área selecionada deriva da primeira pendência acionável real.
- A03 — Depois de escolha manual do operador, refresh da OS não muda a área ativa.
- A04 — Grupo salvo não navega automaticamente ao próximo grupo.
- A05 — Não existe "Salvar e continuar" como fluxo obrigatório.
- A06 — Acessórios explicitamente registrados com 0 presentes contam como
  resposta registrada, não pendência eterna.
- A07 — Fotos/assinatura sem registro são opcionais e não bloqueiam nem
  computam como Entrada incompleta obrigatória.
- A08 — Sem registro real do estado físico (sem provaEntradaV3 real, ou
  prova materializada por outra fatia), o estado default não é classificado
  como registro confirmado.
- A09 — Face ID/biometria ausentes não são apresentados como "não" confirmado.
- A10 — Salvar Entrada não altera status da OS.
- A11 — Status aprovado do GOAL 003 permanece aprovado depois da complementação.
- A12 — Status aberta do fluxo de diagnóstico permanece aberta depois da
  complementação.
- A13 — Pendências derivam sempre do servidor, não de flag local otimista.
- A14 — Rascunho e conflito do GOAL 001 permanecem intactos.

## Aceites de UI montada — U01–U12

Testes em test/ops-v4-fluxo-curto-004/**.

- U01 — Entrada abre como "complementar/conferir dados", não "passo 1 de 4".
- U02 — Navegação entre Recepção/Segurança/Inspeção/Evidências é livre.
- U03 — Não exige Anterior/Próximo para acessar grupo.
- U04 — Grupo já registrado aparece como registrado, sem pedir reentrada.
- U05 — Grupo faltante aparece como complementável, não erro de sistema.
- U06 — Opcional aparece como opcional.
- U07 — Salvar alterações mantém o mesmo grupo ativo.
- U08 — Trocar de grupo sem dirty é imediato.
- U09 — Trocar de etapa com dirty mantém Salvar/Descartar/Cancelar.
- U10 — Erro de persistência mantém dados digitados e grupo ativo.
- U11 — Após async hydration, fatia não tocada adota servidor e fatia tocada
  é preservada.
- U12 — Conflito concorrente continua bloqueando salvamento até
  revisão/descarte.

## PostgreSQL descartável

Somente PostgreSQL local descartável em loopback. Nunca produção.
Integração explícita (falha com BLOQUEIO_EXPLICITO_PG sem ambiente,
nunca skip), actions V3 reais, sessão QA no seam de auth.

Cenário P1 — OS autorizada: status aprovado, cliente/aparelho/defeito
preenchidos, serviço autorizado, sem prova de entrada completa.
Complementar: identificação faltante, "nenhum acessório", confirmação
explícita do estado físico. Read-back prova: complementos persistidos;
operacaoStatusV3/status aprovado; orçamento aprovado; valorTotal intacto;
nenhum servico_iniciado; nenhum recebimento, venda, título, caixa,
movimento de estoque ou entrega; evento acessorio_registrado presentes 0;
evento da prova com fatias de estado físico.

Cenário P2 — diagnóstico: status aberta, sem preço. Complementar só um
subconjunto (por exemplo acesso). Read-back: continua aberta; sem
autorização comercial nova; sem orçamento aprovado novo; diagnóstico não
iniciou; estado físico continua NÃO registrado (fatias só de credenciais).

## E2E

Criar e2e/specs/operacoes-v4-fluxo-curto-004.spec.ts.
Porta isolada 3010 ou próxima livre; nunca matar processo externo.
PostgreSQL local descartável, usuário QA sintético, AUTH_SECRET e
PLAYWRIGHT_E2E_PASSWORD sintéticos, servidor isolado
(PLAYWRIGHT_BASE_URL, NEXTAUTH_URL, PLAYWRIGHT_E2E_SKIP_WEBSERVER=1),
setup real de autenticação. Não commitar segredo. Não editar a
configuração global do Playwright.

Cenário 1 — autorizado: login QA → V4 → criar OS Serviço já autorizado →
entrar manualmente em Entrada → UI "complementar/conferir", sem wizard →
dados da abertura hidratados → área inicial = pendência real → navegar
direto entre grupos → registrar complementos → salvar → permanece no
grupo → sair sem completar opcionais → status Aprovada → Iniciar execução
ainda exige clique → banco sem efeitos proibidos.

Cenário 2 — diagnóstico: OS aberta/precisa diagnóstico → Entrada abre →
complementar parte → deixar opcional vazio → sair da Entrada → fluxo não
bloqueia → continua aberta → diagnóstico não iniciou automaticamente.

Sincronizar APIs reais. Proibido: sleep arbitrário, .first() arbitrário,
skip, fixme, catch para engolir erro, reload para mascarar race.

## Regressões obrigatórias

- GOAL 001: hidratação async, drafts loja+OS, dirty guard, conflito,
  mesclagem tocado/não tocado (runner test/ops-v4-fluxo-curto e
  entrada-readback, inclusive integração PG).
- GOAL 002: garantia coerente; Entrada não altera garantia.
- GOAL 003: autorizado abre Execução, status aprovado, Iniciar execução
  explícito, sem side effects.

P3 antigos ficam fora, salvo quando causados pelo diff 004 no mesmo
arquivo. O P3 do "Termo de Garantia" segue follow-up separado.

## Validação

Executar: test_command META rev 8; A01–A14; U01–U12; PostgreSQL
descartável; E2E 004; regressões 001/002/003; typecheck; ESLint focado;
build; git diff --check; AEP verify; verify --all; check.
generated/prisma é transitório (npx prisma generate só na worktree) e
não é versionado.

## Autocorreção

Este é UM GOAL. Falha dentro da allowlist: corrigir e continuar.
Não criar 004B, 004-FIX, 004-RETRY, 004C nem outro GOAL corretivo.
Tentativas são as oficiais do AEP (teto 3).
Parar somente por: gate humano literal; path indispensável fora da
allowlist; credencial/serviço externo realmente indisponível; teto de
tentativas; risco real de produção/dados; conflito Git real no escopo.

## Commit e PR

Conferir diff contra a base AEP e a allowlist; adicionar por caminhos
explícitos (nunca git add ., git add -A, commit -a); commit
goal(ops-v4-fluxo-curto-004): ...; push normal; PR contra main;
Vercel omni-gestao e omni-gestao-pro em SUCCESS.
Sem amend, rebase, force ou bypass.
Não executar AEP close nem mergear antes da R.

## Pacote obrigatório para revisão R independente

Executor = Anthropic. A R obrigatória vem de outra família:
OpenAI, preferencialmente GPT-6.1, sobre o HEAD candidato exato.
Se o ambiente não puder convocar OpenAI, não simular independência:
entregar o prompt R completo e parar.

Entregar ao revisor:

GOAL=OPS-V4-FLUXO-CURTO-004
PLAN_REV=8
BASE=<base real>
HEAD=<SHA candidato>
PR=<PR de produto>
EXECUTOR_FAMILY=anthropic
REQUIRED_R_FAMILY=openai

Incluir: arquivos alterados, diff completo, contrato funcional,
A01–A14, U01–U12, evidência PostgreSQL, E2E, regressões 001–003,
typecheck, lint, build, diff-check, AEP verify, verify --all, check,
Vercel e prova de efeitos colaterais ausentes.

A R classifica P0/P1/P2/P3 (P3 não bloqueia). Se APPROVE, declara:

R_FAMILY=openai
EXECUTOR_FAMILY=anthropic
INDEPENDENCE=PASS
HEAD_REVIEWED=<SHA candidato>
VERDICT=APPROVE
READY_FOR_AEP_CLOSE=YES

Se REQUEST_CHANGES: corrigir no mesmo GOAL 004, novo SHA, rerodar
afetados e nova R sobre o SHA corrigido.

O executor Anthropic NÃO autodeclara R. No candidato final, antes da R:

IMPLEMENTADO=SIM
VALIDADO=SIM
PUBLICADO_COMO_PR=SIM
R_STATUS=AGUARDANDO_OPENAI
AEP_CLOSE=PENDENTE
MERGE=PENDENTE

Após R APPROVE real: track.mjs close, verify, verify --all, commit
aep(ops-v4-fluxo-curto): close GOAL 004, push, Vercel, merge NORMAL
(sem squash/rebase/force), Vercel produção em SUCCESS e smoke de
produção somente leitura (sem criar/mutar OS real).

Estado final esperado: GOAL_STATUS=DONE, TRACK_STATUS=PAUSED,
GOAL_005_STARTED=NO.

## Relatório final do executor

No gate R:

GOAL=OPS-V4-FLUXO-CURTO-004
PLAN_REV=8
BASE=
HEAD=
BRANCH=
WORKTREE=
PR=
DIFF_FILES=
ENTRADA_NAO_WIZARD=
FIRST_PENDING=
OPTIONAL_FIELDS=
ACCESSORIES_NONE=
PHYSICAL_STATE_HONESTY=
BIOMETRIC_UNKNOWN=
DIRTY_GUARD=
STATUS_PRESERVATION=
UNIT=
MOUNTED=
POSTGRES=
E2E=
REGRESSAO_001=
REGRESSAO_002=
REGRESSAO_003=
TYPECHECK=
LINT=
BUILD=
DIFF_CHECK=
AEP_VERIFY=
AEP_VERIFY_ALL=
AEP_CHECK=
VERCEL_OMNI_GESTAO=
VERCEL_OMNI_GESTAO_PRO=
IMPLEMENTADO=
VALIDADO=
PUBLICADO_COMO_PR=
R_STATUS=AGUARDANDO_OPENAI
AEP_CLOSE=PENDENTE
MERGE=PENDENTE
BLOCKER=

Não iniciar OPS-V4-FLUXO-CURTO-005.
