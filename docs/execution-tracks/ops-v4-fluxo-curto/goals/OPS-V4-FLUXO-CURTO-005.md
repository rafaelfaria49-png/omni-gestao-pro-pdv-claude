# OPS-V4-FLUXO-CURTO-005 — Workspace operacional claro: próxima ação real, contexto e execução sem ambiguidade

<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-005",
  "track": "ops-v4-fluxo-curto",
  "title": "Workspace operacional claro: próxima ação real, contexto e execução sem ambiguidade",
  "status": "BLOCKED",
  "class": "C3",
  "risk_tier": "ALTO",
  "plan_rev": 10,
  "branch": "goal/ops-v4-fluxo-curto-005",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-005",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v4/proxima-acao-v4.test.ts lib/operacoes-v4/pipeline-operacional.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/entrada-pendencias.test.ts lib/operacoes-v4/entrada-workspace.test.ts lib/operacoes-v3/status-machine.test.ts components/operacoes-v4-preview/status-authority.test.ts components/operacoes-v4-preview/financial-projection-surfaces.test.ts components/operacoes-v4-preview/focus-workspace.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-005\" && npx --no-install vitest run --config test/ops-v4-fluxo-curto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-003/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-004/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-005/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-003.spec.ts e2e/specs/operacoes-v4-fluxo-curto-004.spec.ts e2e/specs/operacoes-v4-fluxo-curto-005.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "lib/operacoes-v4/proxima-acao-v4.ts",
    "lib/operacoes-v4/proxima-acao-v4.test.ts",
    "components/operacoes-v4-preview/parts/ProximaAcaoV4.tsx",
    "components/operacoes-v4-preview/parts/proxima-acao-v4.module.css",
    "components/operacoes-v4-preview/parts/WorkspaceView.tsx",
    "components/operacoes-v4-preview/parts/CommandHeader.tsx",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/mock-data.ts",
    "components/operacoes-v4-preview/types.ts",
    "components/operacoes-v4-preview/rails-adapter.ts",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "components/operacoes-v4-preview/status-authority.test.ts",
    "test/ops-v4-fluxo-curto-005/**",
    "e2e/specs/operacoes-v4-fluxo-curto-005.spec.ts",
    "docs/execution-tracks/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 45,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "media"
}
-->

## Autoridade e ativação

Contrato humano: autorização operacional ponta a ponta do proprietário
(07/10/2026) — "QUERO INICIAR OPS-V4-FLUXO-CURTO-005" — plan_rev 9,
classe C3, risco ALTO, executor Anthropic (Claude Opus 5.5) e revisão
independente obrigatória de outra família (OpenAI).

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL em
goals/ é ato humano. Este arquivo materializa a decisão textual do
proprietário pelo rito oficial, como no GOAL 004 (58c4435):
registry → verify → verify --all → commit/PR exclusivo de planejamento →
merge NORMAL em main → worktree de produto sobre a main atualizada →
status → open.

Nunca incluir mudanças de goals/** no diff de produto avaliado pelo check 8.
Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.

Nenhum gate de caminho é liberado (gates_liberados vazio). Schema,
migrations, seeds, auth, proxy, CI, package.json, lockfile, Node/Vercel,
configuração de deploy, .env e produção mutante continuam fechados.

## Base

Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude

Main confirmada na autorização (07/10/2026):
3f6ab52084bcbf6664c8ff2826c51705a68ac1f7 (merge do PR #238).

A base de produto é origin/main vigente após a integração deste
planejamento, descendente de 3f6ab52. Preservar integralmente #234, #235,
#237 e #238. GOALs 001–004 permanecem DONE; não reabrir.
GOALs 006–008 continuam inelegíveis.

## Diagnóstico focal (fundamenta o contrato)

1. A ação primária do Workspace nasce de PRIMARY (mock-data.ts),
   indexado pelo status V4: o mock ainda governa comportamento real.
2. Em diagnostico e aguardando_aprovacao o CTA ("Enviar orçamento",
   "Registrar aprovação") só navega e dispara o toast
   "Indisponível nesta versão" — mesmo existindo superfície real
   (aba Orçamento: editor, envio, decisão).
3. Em em_execucao / aguardando_peca o CTA diz "Marcar pronta" /
   "Marcar peça chegou", mas só navega: o rótulo promete escrita.
4. Em pronta, rótulos "Entregar OS" / "Revisar cobrança"; com a projeção
   carregando, o CTA cai em "Revisar cobrança" sem dizer que está lendo.
5. aberta → "Iniciar diagnóstico" e aprovado → "Iniciar serviço" gravam
   direto do header sem busy-lock: duplo clique dispara duas escritas
   (o servidor recusa a segunda, mas o cliente envia duas).
6. Sem OS carregada, o CTA usa o snapshot local st.status (não real).
7. O botão exibe o atalho "↵", porém não existe handler de teclado:
   affordance falsa.
8. "recebida" (V3) é projetada para "pronta" na V4; a derivação precisa
   tratá-la explicitamente.
9. O servidor já serializa a transição (aplicarTransicaoStatusV3 sob trava
   da linha da OS; segunda chamada idêntica é recusada com
   "A OS já está neste status"). Não há motor a criar.
10. E2E 003/004 localizam getByRole("button", { name: "Iniciar execução" })
    (substring) na etapa Execução: duplicar esse botão no mesmo ecrã
    quebraria regressões por strict mode — e confundiria o operador.

## Objetivo

Ao abrir qualquer OS no Workspace V4 o operador vê uma "Próxima ação"
honesta, derivada só de estado real: o que é o estado, o que falta, qual a
ação correta, onde ela acontece, se clicar GRAVA, NAVEGA, ESPERA ou não há
ação, e por que algo não pode ser feito agora.

Não criar segunda máquina de status, motor novo, action nova, V5, nem
tocar Financeiro/Entrega/Garantia/Retorno.

## Contrato funcional

### A — Derivação pura e única

Novo módulo puro lib/operacoes-v4/proxima-acao-v4.ts, sem I/O e sem React:
derivarProximaAcaoV4(entrada) → ProximaAcaoV4.

Semântica obrigatória do resultado:

- estado: acao | navegacao | aguardando | bloqueada | concluida | indisponivel
- id estável, titulo, descricao, tone (primary | success | warning |
  danger | neutral), motivo opcional
- efeito: write | navigate | wait | none
- stage (destino real) quando houver, e se o controle real da ação vive
  nessa etapa (para não duplicar botão quando o operador já está nela)
- cta primário opcional (rótulo honesto do efeito, disabled real) e cta
  secundário opcional só de navegação (pós-venda, histórico, retry de leitura)
- write identifica a escrita existente (iniciar_diagnostico | iniciar_execucao)

Autoridade: lib/operacoes-v3/status-machine.ts (statusV3FromOS para
distinguir "recebida", podeTransicionarV3 para autorizar a escrita) e o
resolver V4 resolverStatusV4 (fail-closed "desconhecido"). Nunca decidir por
label nem por PRIMARY. PRIMARY deixa de existir.

Entradas somente já carregadas: OS real resolvida (detalhe ou linha da
lista da MESMA loja+OS), estado de carga do detalhe (estabelecida /
carregando / erro), estado da projeção financeira server-side
(projection / loading / error), orçamento materializado e seu status. Sem
fetch paralelo, sem payload cru em componente, sem pendências da Entrada.

Próxima ação ≠ próximo status: a máquina autoriza transição; a derivação
orienta a operação.

### B — Matriz funcional mínima

- Sem OS real → indisponivel, sem CTA (nunca usa st.status).
- Detalhe com erro → bloqueada "Não foi possível determinar a próxima
  ação", motivo do erro, secundário "Tentar novamente" (reload existente).
- aberta (podeTransicionar → diagnostico) → acao "Iniciar diagnóstico",
  efeito write (iniciarDiagnostico → aplicarTransicaoStatusV3), descrição
  deixa claro que altera o status da OS. Sem carga estabelecida: CTA
  desabilitado com motivo.
- diagnostico sem orçamento materializado → navegacao "Preparar orçamento"
  → Orçamento. Com orçamento materializado → "Revisar orçamento".
  Nunca gera orçamento automaticamente.
- aguardando_aprovacao → aguardando "Aguardando decisão do cliente",
  efeito wait, CTA de navegação "Abrir orçamento". Nunca aprova.
- aprovado → acao "Iniciar execução", efeito write (iniciarServico → mesma
  action). Sem carga estabelecida: desabilitado.
- aguardando_peca → aguardando "Aguardando peça", "A execução pode ser
  retomada quando a peça estiver disponível.", CTA "Abrir execução"
  (navigate). Nunca inventa chegada de peça.
- em_execucao → navegacao "Marcar como pronta" → Execução (onde vive o
  botão real com busy-lock). Navegar nunca marca pronta.
- pronta / recebida (mesmo gate financeiro):
  - projeção carregando → indisponivel "Carregando situação financeira…",
    CTA desabilitado; nunca "Confirmar entrega".
  - leitura com erro → bloqueada "Revisar financeiro" + retry.
  - OPEN / PARTIAL → navegacao "Receber pagamento" → Financeiro.
  - canDeliver = true (PAID, AUTHORIZED_CREDIT, AUTHORIZED_NO_CHARGE) →
    navegacao "Confirmar entrega" → Entrega. Nunca entrega sozinho.
  - qualquer outro (UNKNOWN, INCONSISTENT, CANCELLED, REVERSED, NO_PRICE,
    PRICE_DEFINED, CHARGE_NOT_CREATED, sem projeção) → bloqueada
    "Revisar financeiro" → Financeiro, com motivo. Nunca "Entregar".
  - recebida: título/descrição dizem que falta a confirmação formal de
    entrega; nunca converte para entregue.
- entregue → concluida "Fluxo operacional concluído", sem CTA mutante,
  secundário "Abrir pós-venda" (navegação). Não abre retorno/garantia.
- cancelada → concluida "OS cancelada", sem CTA mutante, secundário
  "Ver histórico" (navegação).
- desconhecido → indisponivel "Status da OS não reconhecido", sem CTA
  mutante, secundário "Ver histórico".

### C — Superfície "Próxima ação"

Bloco compacto logo abaixo da PipelineSpine, fora da área rolável (sempre
visível). Comunica: eyebrow textual por estado (PRÓXIMA AÇÃO · AGUARDANDO ·
REVISAR · CONCLUÍDO · CARREGANDO), título, descrição/motivo e CTA.
Estados distinguidos por texto + ícone, nunca só por cor. Tokens
semânticos do OmniGestão (sem cor hardcoded), claro/escuro, densidade ERP.
Responsivo: 1440/1024 uma linha; 768 sem esmagar CTA; 390 empilha texto +
CTA sem overflow.

Quando a ação real já vive na etapa aberta (ex.: Execução com "Iniciar
execução"/"Marcar como pronta", Financeiro com recebimento, Entrega com
confirmação, Orçamento com decisão), o bloco NÃO duplica o botão: indica
que o controle está nesta etapa. Fora dela, o CTA executa (write) ou leva
até lá (navigate).

### D — Header

O CommandHeader deixa de ter CTA primário próprio e o chip "Fluxo
concluído" derivado de PRIMARY: a superfície única é o bloco (sem fonte
paralela, sem handler duplicado, sem divergência header × card).
O atalho visual "↵" sem handler é removido. Identidade, tickets
(Orçamento/Financeiro/Pós-venda), Docs, Histórico e "⋯" ficam intactos.

### E — Escrita × navegação, sem no-op falso

write aciona só iniciarDiagnostico / iniciarServico já existentes
(runWrite → aplicarTransicaoStatusV3). navigate só muda stage. wait e none
não escrevem. A ação primária nunca mostra "Indisponível nesta versão".

### F — Duplo clique, troca de OS, troca de loja

Lock local da ação primária, síncrono, chaveado por loja+OS: um clique =
no máximo uma escrita; o lock só cai quando a escrita termina e o detalhe
da mesma OS é relido (ou a seleção muda / a escrita falha). Respostas de A
não mudam a próxima ação de B, não navegam B, não notificam B e nunca
disparam ação em B (reuso do contextoAtual/alvoAindaSelecionado do
runWrite). Ação nunca é disparada para loja diferente da capturada.
Sem idempotência paralela no cliente.

### G — Entrada continua não bloqueante

O GOAL 004 permanece válido: pendências da Entrada não entram na
derivação e nunca substituem a próxima ação de status avançado.

### H — Teclado e acessibilidade

Botão nativo: foco visível, nome acessível = rótulo visível, disabled
real. Nenhum listener global de Enter: digitar em input/textarea/select/
editor/modal nunca dispara a próxima ação.

## Proibições

Não tocar motor financeiro (recebimento-misto-service, ledger,
idempotência, estorno, caixa, ContaReceber, movimentações) — se
indispensável, PARAR e reportar. Não implementar GOAL 006 (entrega) nem 007
(retorno/garantia). Não alterar app/actions/operacoes.ts nem
lib/operacoes-v3/**. Não alterar datas (#237) nem usar createdAt como
entrada. Não reabrir a Entrada como wizard. Sem schema/migration/seed,
auth/proxy, package.json/lockfile, CI, Vercel.

## Allowlist (justificativa)

- proxima-acao-v4.ts/.test.ts: derivação pura + matriz N01–N20.
- ProximaAcaoV4.tsx + proxima-acao-v4.module.css: superfície do bloco.
- WorkspaceView.tsx: posiciona o bloco abaixo da pipeline.
- CommandHeader.tsx: remove CTA/chip derivados de PRIMARY e o "↵".
- use-v4-preview.ts: troca PRIMARY/advance pela derivação, expõe a
  próxima ação e o executor com lock.
- mock-data.ts: remove PRIMARY. types.ts e rails-adapter.ts: só comentários
  que citam PRIMARY.
- preview-honesty.test.ts e status-authority.test.ts: asserções antigas de
  rótulo/PRIMARY passam a fixar o contrato novo (fail-closed preservado).
- test/ops-v4-fluxo-curto-005/**: UI montada + PostgreSQL + config.
- e2e/specs/operacoes-v4-fluxo-curto-005.spec.ts.

## Aceites puros — N01–N20

N01 aberta → iniciar diagnóstico (write). N02 diagnóstico sem orçamento →
preparar orçamento. N03 aguardando aprovação → aguardando decisão / abrir
orçamento (wait). N04 aprovado → iniciar execução (write). N05 aguardando
peça → aguardando / execução. N06 em execução → marcar como pronta /
execução (navigate). N07 pronta + OPEN → receber pagamento. N08 pronta +
PARTIAL → receber pagamento. N09 pronta + PAID → confirmar entrega.
N10 pronta + crédito autorizado → confirmar entrega. N11 pronta + UNKNOWN →
revisar financeiro. N12 pronta + INCONSISTENT → revisar financeiro.
N13 financeiro carregando → sem ação perigosa. N14 recebida → entrega.
N15 entregue → concluída / pós-venda. N16 cancelada → sem ação primária
mutante. N17 sem OS → nenhuma ação. N18 leitura com erro → estado seguro.
N19 mesma OS após reload → ação estável (pura/determinística). N20 troca de
OS durante load → sem ação stale.

## UI montada — C01–C14 (test/ops-v4-fluxo-curto-005)

C01 título/descrição/CTA. C02 WAIT sem botão mutante. C03 bloqueio mostra
motivo. C04 loading não mostra entrega. C05 concluída sem transição.
C06 CTA navega ao Financeiro. C07 CTA navega à Entrega. C08 aprovado usa a
ação existente de iniciar execução. C09 duplo clique não duplica write.
C10 troca de OS durante resposta mantém B. C11 troca de loja mantém
isolamento. C12 Entrada pendente não bloqueia status adiantado. C13 Enter
digitando não dispara. C14 mobile sem overflow estrutural.

## PostgreSQL descartável — P01–P08

Loopback, banco descartável, massa sintética, actions V3 reais (seam de
sessão). Ausência de ambiente = BLOQUEIO_EXPLICITO_PG, nunca skip.
P01 aberta → diagnostico. P02 aprovado → em_execucao. P03 em_execucao →
pronta pela ação real da etapa. P04 pronta com saldo → Financeiro.
P05 pronta quitada (helper oficial de recebimento em caixa QA) → Entrega.
P06 confirmar entrega continua separado (status segue pronta). P07 duas
requisições rápidas → uma transição e um evento. P08 troca concorrente de
estado → releitura deriva a ação nova. Read-back sem efeitos colaterais
indevidos (caixa, título, venda, estoque, entrega).

## E2E

e2e/specs/operacoes-v4-fluxo-curto-005.spec.ts. Servidor QA isolado (porta
3050 ou próxima livre, nunca matar processo externo), PostgreSQL local
descartável, usuário QA sintético, --retries=0, workers=1. Estados de
dinheiro preparados de forma sintética pelo harness QA no banco descartável
(nunca clicar pagamento; nunca loja/cliente/OS reais; OS-2026-00028 proibida).

E01 autorizada: próxima ação Iniciar execução; acionar; status muda uma
única vez. E02 aguardando cliente: abrir orçamento; nenhuma aprovação.
E03 em_execucao: aponta à Execução; marcar pronta pelo caminho real.
E04 pronta com saldo: Receber pagamento → Financeiro, sem pagar.
E05 pronta sem saldo: Confirmar entrega → Entrega, sem entregar.
E06 financeiro indisponível: nunca oferece Confirmar entrega.
E07 entregue: concluído / pós-venda. E08 troca A→B com load pendente:
B correta. Sincronizar com APIs/DOM reais; proibido sleep arbitrário,
skip/fixme, .first() arbitrário, catch que engole falha, reload que mascara
race.

## Regressões obrigatórias

GOAL 001 (runner test/ops-v4-fluxo-curto), 002 (runner 002), 003 (runner +
E2E 003), 004 (runner + PG + E2E 004), PR #237 (datas) e PR #238 (hardening
financeiro): Entrada não vira wizard; serviço autorizado continua aprovado;
orçamento não aprova sozinho; recebimento misto 350+50 íntegro; quitado
leva à Entrega; datas retroativas intactas; resposta de A não contamina B.

## Validação

test_command META rev 9; N01–N20; C01–C14; P01–P08; E01–E08; regressões;
npm run typecheck; ESLint focado nos .ts/.tsx alterados; npm run build
(MIGRATION_SKIPPED, sem autoridade produtiva); git diff --check; AEP verify,
verify --all, check. Revisão visual (skill frontend-design) em 1440, 1024 e
390, claro/escuro quando viável. Falha preexistente é comparada com a main,
nunca declarada PASS.

## Revisão 10 — test_command (07/10/2026)

Baseline focal na main ca245ef (antes de qualquer diff do 005):
components/operacoes-v4-preview/preview-honesty.test.ts já falha em 10
testes alheios a este GOAL (varreduras de ReceberPagamentoV4 desatualizadas
pelos PRs de recebimento misto #234/#238 e o termo de garantia do menu Docs).
Com o arquivo inteiro no test_command o check 10 nunca passaria por falha
preexistente fora do escopo.

Correção do plano (sem mudar contrato, allowlist nem gates): o arquivo
continua atualizado pelo 005, mas roda filtrado pelo marcador
"OPS-V4-FLUXO-CURTO-005" (blocos de próxima ação/CTA que este GOAL
reescreveu). As 10 falhas preexistentes ficam relatadas como follow-up
separado; não são corrigidas aqui (escopo fechado).

## Autocorreção

UM GOAL. Achado P0/P1/P2 corrige-se no MESMO GOAL (sem 005B/005-FIX/005C),
com regressão do achado, testes afetados e nova R sobre novo SHA.
Tentativas oficiais do AEP (teto 3). Parar só por: gate humano literal,
path indispensável fora da allowlist, motor financeiro, serviço externo
indisponível, teto de tentativas, risco real de produção/dados, conflito
Git real.

## Commit, PR, R e merge

Diff conferido contra a base AEP e a allowlist; add por caminhos
explícitos; commit goal(ops-v4-fluxo-curto-005): ...; PR exclusivo
"GOAL OPS-V4-FLUXO-CURTO-005" contra main. Sem amend, rebase, force,
squash ou bypass. Se a main avançar: merge normal e revalidação do delta.

R independente OpenAI, sessão read-only, sobre o HEAD exato, com pacote:
contrato, base, HEAD, diff, N01–N20, montados, PG, E2E, screenshots,
regressões 001–004 e #237/#238. Ataques mínimos R01–R12 (divergência
header×card, stale após troca, entrega com loading, entrega com saldo,
aprovação automática, Entrada bloqueando, duplo clique, mock influenciando,
aguardando_peca, OS final, Enter acidental, regressão Financeiro/Entrega).
Exige P0=0, P1=0, P2=0, VERDICT=APPROVE.

Após APPROVE real: track.mjs close, verify, verify --all, merge NORMAL,
Vercel omni-gestao e omni-gestao-pro em SUCCESS e smoke de produção
somente leitura (sem iniciar diagnóstico/execução, marcar pronta, receber,
entregar, cancelar ou salvar). Sem sessão/loja: OWNER_PENDING_AUTH.

Estado final esperado: GOAL_STATUS=DONE, TRACK_STATUS=PAUSED,
GOAL_006_STARTED=NO.

Não iniciar OPS-V4-FLUXO-CURTO-006, 007 ou 008.
