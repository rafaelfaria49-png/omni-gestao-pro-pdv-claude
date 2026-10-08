# OPS-V4-FLUXO-CURTO-007 — Retorno pela OS original, sem recadastrar e sem venda presumida

<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-007",
  "track": "ops-v4-fluxo-curto",
  "title": "Retorno pela OS original, sem recadastrar e sem venda presumida",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 15,
  "branch": "goal/ops-v4-fluxo-curto-007",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/retorno-actions.test.ts lib/operacoes-v3/retorno-atendimento.test.ts lib/operacoes-v3/pos-venda-model.test.ts lib/operacoes-v3/retorno-auto-close.test.ts lib/operacoes-v3/retorno-auto-close-actions.test.ts lib/operacoes-v3/nova-os-actions.test.ts lib/operacoes-v3/nova-os-model.test.ts lib/operacoes-v3/garantia-actions.test.ts lib/operacoes-v3/entrega-actions.test.ts lib/operacoes-v3/status-machine.test.ts lib/operacoes-v3/event-model.test.ts lib/operacoes-v4/retorno-origem-v4.test.ts lib/operacoes-v4/posvenda-v4.test.ts lib/operacoes-v4/novo-atendimento.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts lib/operacoes-v4/retirada-fluxo-v4.test.ts lib/operacoes-v4/pipeline-operacional.test.ts components/operacoes-v4-preview/status-authority.test.ts components/operacoes-v4-preview/focus-workspace.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[567]|OPS-V4-NOVO-ATENDIMENTO-COMERCIAL-001|OPS-V4-POSVENDA-RETORNO-GARANTIAS-006\" && npx --no-install vitest run --config test/ops-v4-fluxo-curto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-003/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-004/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-005/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts test/ops-v4-fluxo-curto-006/retirada.test.tsx test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx && npx --no-install vitest run --config test/ops-v3-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-007/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-007.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "components/operacoes-v4-preview/OperacoesV4Preview.tsx",
    "components/operacoes-v4-preview/types.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/parts/NovoAtendimentoLauncher.tsx",
    "components/operacoes-v4-preview/parts/RetornoOrigemPickerV4.tsx",
    "components/operacoes-v4-preview/parts/retorno-origem-v4.module.css",
    "components/operacoes-v4-preview/parts/stages/PosVendaStage.tsx",
    "components/operacoes-v4-preview/parts/ModuleView.tsx",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "lib/operacoes-v4/novo-atendimento.ts",
    "lib/operacoes-v4/novo-atendimento.test.ts",
    "lib/operacoes-v4/posvenda-v4.ts",
    "lib/operacoes-v4/posvenda-v4.test.ts",
    "lib/operacoes-v4/retorno-origem-v4.ts",
    "lib/operacoes-v4/retorno-origem-v4.test.ts",
    "lib/operacoes-v3/retorno-actions.ts",
    "lib/operacoes-v3/retorno-actions.test.ts",
    "lib/operacoes-v3/pos-venda-model.ts",
    "lib/operacoes-v3/pos-venda-model.test.ts",
    "lib/operacoes-v3/retorno-atendimento.ts",
    "lib/operacoes-v3/retorno-atendimento.test.ts",
    "test/ops-v4-fluxo-curto-007/**",
    "e2e/specs/operacoes-v4-fluxo-curto-007.spec.ts",
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

Contrato humano: "COMANDO MESTRE — OPS-V4-FLUXO-CURTO-007" do proprietário
(08/10/2026), modo END_TO_END_COM_RELEASE_CONDICIONADO, risco ALTO,
executor Anthropic (Claude Opus 5.5) e revisão independente obrigatória de
outra família (OpenAI/Codex, read-only). A mensagem autoriza exclusivamente
este GOAL: preparação de governança, implementação, testes, correções do
mesmo escopo, R, PR e publicação condicionada aos gates oficiais. Não
autoriza schema, migrations, auth, proxy, motores financeiros globais nem
outras áreas protegidas. GOAL 008 continua inelegível.

Classificação — divergência registrada: a classe PROPOSTA era C3; a classe
DERIVADA (TASK_LEVELS) é C4. A allowlist atravessa vários módulos de
primeiro nível (≥ C3) e a rubrica responde "sim" a (1) o erro aparece em
DADOS — OS filha duplicada/órfã, vínculo divergente, original alterada — e
(2) esse dano persistido não é revertido por git revert. Não se rebaixa a
classe. O gate humano explícito exigido pela C4 é a autorização textual do
proprietário acima (mesmo critério do GOAL 006); nenhum gate de CAMINHO é
tocado (gates_liberados vazio); R de outra família é obrigatória.

Rito (EXECUTION_PROTOCOL §2): checkout de planejamento
C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007-plan, branch
plan/ops-v4-fluxo-curto-007 → registry → verify → verify --all →
commit/PR exclusivo de planejamento → merge NORMAL (merge commit) em main →
worktree de produto sobre a main atualizada → status → open. Nunca incluir
goals/** no diff de produto (check 8). Não editar state.json, LEDGER.jsonl,
REGISTRY.md ou GATES.md à mão.

## Base

Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude.
Main confirmada no pré-flight (08/10/2026):
07385d1435c2e4fe8450ef513f9abaa15edabd8e (merge do PR #245, GOAL 006).
Trilha em PAUSED, 6 GOALs DONE, 0 bloqueados, nenhum GOAL corrente.
GOALs 001–006 permanecem DONE; não reabrir. Preservar #234, #235, #237,
#238, #245 e #246.

## Diagnóstico focal (auditoria de 08/10/2026 sobre 07385d1)

Já existem e serão REUSADOS: abrirRetornoV3 / finalizarRetornoV3
(lib/operacoes-v3/retorno-actions.ts), criação canônica do atendimento por
criarOSEnterpriseV3 com vinculoRetornoV3 (lista fechada EXTRAS_PERMITIDOS_V3),
leitores puros de pós-venda (lerEntregaV3, lerGarantiaV3, lerRetornosV3,
lerVinculoRetornoV3), mutarPayloadOSV3 (trava da linha da OS), auto-close
do retorno na entrega da filha (retorno-auto-close*), PosVendaStage,
portfólio de Garantias (ModuleView) e o caminho de observação interna
(adicionarObservacaoInternaV3).

Lacunas encontradas (são o escopo deste GOAL):

1. abrirRetornoV3 cria a OS filha (criarOSEnterpriseV3, transação própria)
   ANTES de gravar o vínculo na original, sem identidade de operação: duas
   chamadas simultâneas (duplo clique, dois operadores, retry após timeout)
   leem "nenhum retorno aberto" e criam DUAS filhas; falha entre a criação e
   o vínculo deixa uma filha órfã silenciosa; retry não reconhece a operação.
2. A trava da original NÃO pode ser segurada durante a criação da filha: a
   app usa pgBouncer em modo transação com connection_limit=1
   (app/api/pdv/receber-conta/route.ts, recebimento-lote-service.ts) — uma
   transação interativa esperando outra conexão trava a instância.
3. buildRetornoAtendimentoDraftV3 copia senha e acessórios da original para o
   atendimento novo: credencial e fato de custódia herdados sem confirmação.
4. OS não entregue: abrirRetornoV3 grava "Retorno em garantia aberto" na
   própria OS (pós-venda fingida antes da retirada); OS cancelada não é
   recusada.
5. Não há entrada pelo "+ Novo" nem seletor de OS original; a ficha só abre
   retorno da OS já selecionada; o portfólio de Garantias só abre a OS.
6. abrirRetorno da V4 navega para a filha mesmo que o operador tenha trocado
   de loja/OS durante a chamada (resposta atrasada contamina o contexto).
7. Texto/tipo da timeline trata retorno fora de cobertura como "garantia
   acionada".

## Objetivo

Retorno/garantia como experiência V4 rápida e profissional, apoiada
integralmente no motor V3 e na autoridade do servidor: localizar a OS
original, herdar cliente/aparelho/serviço/histórico sem recadastro, registrar
SÓ o novo relato, enquadrar a garantia com honestidade e abrir UM atendimento
real, persistido, vinculado nos dois lados, idempotente e seguro sob
concorrência — sem venda, pagamento, movimentação financeira, estoque ou
renovação automática de garantia.

## Contrato funcional

### A — Entrada pelo "+ Novo"

Quarta opção do launcher: "Retorno / Garantia" (chip "Volta da OS
original"). É ponto de ENTRADA de interface para o motor V3 existente
(abrirRetornoV3), não um quarto motor de criação: abre o seletor da OS
original e não cria nada ao ser escolhida. Nova OS, Orçamento e Atendimento
rápido preservados. Proibido redirecionar para NovaOSModal com origem
"garantia" simulada.

### B — Seletor da OS original (RetornoOrigemPickerV4)

Busca REAL na loja ativa por número da OS, cliente (nome/telefone) e
aparelho (marca, modelo, IMEI/série) — server action de leitura
buscarOrigensRetornoV3 em retorno-actions.ts: sessão + acesso à loja
(requireEnterpriseWith, hubs.operacoes), consulta sempre filtrada por
storeId no servidor, termo parametrizado (curingas escapados), limite
fechado, DTO mínimo SEM senha/credenciais. Estados distintos: digitando,
carregando, vazio, erro (com tentar de novo). Seleção inequívoca (uma OS),
detalhe da selecionada. Resposta de busca anterior, de outra loja ou de
outro termo nunca sobrescreve a atual (geração + chave de loja). OS
inexistente/de outra loja = "não encontrada"; cancelada/não entregue/retorno
em andamento = inelegível com motivo. A ficha (Pós-venda) e o portfólio de
Garantias abrem o MESMO fluxo com a original pré-selecionada (relida pelo
servidor, nunca confiada do cliente).

### C — Reaproveitamento sem recadastro

Detalhe mostra: número da OS original, cliente existente, aparelho/modelo/
identificação, serviço executado, histórico relevante, data efetiva da
entrega, situação da garantia, retornos anteriores e atendimento de retorno
em andamento. O operador preenche SOMENTE: motivo/novo defeito
(obrigatório), observação nova (opcional) e recepção necessária ao novo
atendimento: acessórios entregues AGORA (os da original aparecem como
sugestão desmarcada) e senha do aparelho (opcional, vazia). Senha,
credenciais e acessórios da original nunca são copiados automaticamente.
Sem nova assinatura, inspeção, entrada física fabricada ou autorização
inventada. A OS original não é reescrita.

### D — Enquadramento (derivação pura em lib/operacoes-v4/retorno-origem-v4.ts)

- Garantia ativa: mostra a cobertura verificada pelo contrato V3 (lerGarantiaV3)
  e o vencimento, sem prometer que o novo defeito está coberto.
- Vencida / sem cobertura: permite registrar, destaca que NÃO há cobertura
  confirmada; qualquer serviço cobrável exige decisão comercial própria
  depois (orçamento do atendimento novo), nunca dedução.
- Garantia não informada: "Garantia não informada" — nunca positiva presumida.
- OS ainda não entregue: não é pós-venda. Oferece o caminho existente de
  ocorrência — observação interna da própria OS (adicionarObservacaoInternaV3)
  — sem criar retorno, atendimento novo ou outro domínio de retrabalho.
  O SERVIDOR recusa abrirRetornoV3 em OS não entregue ou cancelada.
Nenhum cenário cria pagamento, orçamento aprovado ou garantia por dedução.

### E — Motor V3 preservado

O retorno resulta em atendimento real criado por criarOSEnterpriseV3
(rascunho de buildRetornoAtendimentoDraftV3, origem garantia/retorno,
valor zero, garantia própria "Sem garantia" até decisão explícita), com
retornosV3[] na original (osRetornoId/osRetornoCodigo) e vinculoRetornoV3 na
filha (osOrigemId/retornoId), timeline nos dois lados e evento
os_retorno_aberto. Sem OS avulsa rotulada como garantia, sem segunda máquina
de status, sem motor paralelo; finalizarRetornoV3 e o auto-close na entrega
da filha continuam os mesmos contratos.

### F — Idempotência e concorrência (requisito central, sem gate protegido)

Estratégia ratificada no planejamento (sem schema, sem tocar
nova-os-actions.ts, os-payload-lock.ts ou app/actions/operacoes.ts; a
ordem de travas "writers operacionais: SÓ a OS" é preservada — nenhum
writer segura duas OS ao mesmo tempo nem segura a trava durante a criação):

1. Identidade da operação: operacaoId estável gerado no cliente por operação
   lógica (mesmo id em retry do mesmo relato); ausente (chamadores V3
   legados) = o servidor gera um. retornoId determinístico do operacaoId.
2. Reserva sob a trava da original (mutarPayloadOSV3, transação curta):
   relê o payload MAIS RECENTE, revalida loja/entrega/cancelamento/retorno
   aberto e grava em retornosV3[] a entrada "aberto" com operacaoId,
   assinatura do relato (motivo + observação + acessórios; nunca a senha) e
   reserva {token, expiraEm} com TTL de 15 min — maior que a duração
   máxima de uma função na Vercel (300 s padrão, 800 s teto), de modo que o
   dono de uma reserva viva nunca está morto e o dono de uma expirada nunca
   está vivo.
3. Decisão sob a trava: retorno aberto já vinculado + mesmo operacaoId +
   mesma assinatura → replay (devolve o atendimento existente, zero escrita,
   zero evento novo); mesmo operacaoId + assinatura divergente → recusa
   (motivo original preservado); outro operacaoId → recusa "retorno em
   andamento" com o código do atendimento; reserva sem vínculo → procura a
   filha pelo vínculo (osOrigemId + retornoId, loja) e ADOTA se existir;
   sem filha e reserva viva → "abertura em processamento" (nada é criado);
   sem filha e reserva expirada → retomada (mesmo operacaoId) ou descarte
   auditado da reserva interrompida e nova reserva (outro operacaoId).
4. Só quem gravou o token cria a filha (fora da trava). Falha na criação →
   compensação sob a trava: adota a filha se ela existir; senão remove a
   própria reserva. Erro nunca vira sucesso.
5. Vínculo sob a trava: reserva ainda sem vínculo → grava osRetornoId/
   osRetornoCodigo + evento único na timeline (idempotente por retornoId);
   já vinculada à MESMA filha → sucesso idempotente; vinculada a outra filha
   ou reserva descartada → a filha excedente é DESCARTADA explicitamente
   (vinculoRetornoV3.descartadoEm + motivo + evento na timeline dela) e a
   chamada falha apontando o atendimento válido — nunca órfã silenciosa.
Resultado obrigatório: um atendimento válido por operação lógica; nenhuma
filha duplicada vinculada, nenhuma órfã silenciosa, nenhum evento duplicado
por replay. disabled/debounce/localStorage/verificação fora da transação
são apenas UX, nunca a proteção.

Se, durante a execução, a garantia acima se mostrar impossível sem alterar
área protegida: PARAR e devolver PROTECTED_PATH / WHY_REQUIRED /
MINIMAL_DIFF / RISK_IF_NOT_DONE / ALTERNATIVE_WITHIN_SCOPE. Não declarar T56
aprovado sem prova efetiva.

### G — Integração visual do Pós-venda

Original: retorno em aberto/finalizado, vínculo com a filha, "Abrir
atendimento", nenhum botão concorrente de criação enquanto houver retorno
aberto ou reserva; histórico preservado; reserva em processamento visível
como tal. Filha: "Retorno da OS [código]" + "Abrir OS original", novo relato,
status operacional próprio, cobertura de REFERÊNCIA da original na abertura
claramente separada da garantia própria do atendimento (que não nasce
iniciada). Portfólio: contagens canônicas, retorno em andamento ≠ concluído,
agrupamento e isolamento por loja, ação "Abrir retorno" pré-selecionada,
sem mock como autoridade. Design V4 (tokens semânticos, claro/escuro),
responsivo 1440/1024/768/390, loading/erro, diálogos acessíveis (foco
inicial, Tab/Shift+Tab contidos, Escape quando ocioso, foco devolvido,
navegação por setas na lista, sem listener global de Enter).

### H — Preservação absoluta da original

Abrir e concluir retorno não altera na original: valor aprovado, defeito e
orçamento, serviço executado, recebimento/Conta a Receber, data real de
entrega, início/fim da garantia, estoque, custos, histórico e documentos
anteriores. Só retornosV3[] e eventos novos de timeline são acrescentados.
O atendimento novo não é venda: sem Conta a Receber, pagamento, caixa,
estoque, quitação de dívida antiga, estorno ou garantia renovada.

### I — Isolamento loja / OS no cliente

Resposta de busca ou abertura iniciada na loja/OS A nunca navega, abre
diálogo, troca seleção ou notifica sucesso no contexto B; troca de loja
fecha o fluxo. Rascunho do relato preservado por loja+OS durante a sessão
(falha, fechamento e reabertura), descartado após sucesso.

## Áreas protegidas

Não alterar: schema, migrations, seeds, auth, proxy, .env, CI, package.json,
lockfile, Vercel/next.config, Fiscal, WhatsApp, Marketplace, AppShell, PDV,
Caixa, Financeiro (lib/financeiro/**), Estoque e serviços globais
(lib/operacoes/**), app/actions/**, lib/operacoes-v3/nova-os-actions.ts,
lib/operacoes-v3/os-payload-lock.ts e demais lib/operacoes-v3/** fora da
allowlist (retorno-auto-close*, entrega-actions, producao-actions,
status-*: só leitura/chamada). Necessidade = PARAR e devolver UMA decisão
(PROTECTED_PATH, WHY_REQUIRED, MINIMAL_DIFF, RISK_IF_NOT_DONE,
ALTERNATIVE_WITHIN_SCOPE). Não duplicar lógica na V4 para evitar o gate.

## Allowlist (justificativa)

- NovoAtendimentoLauncher.tsx + novo-atendimento.ts(.test): 4ª opção de
  entrada (motor declarado: abrirRetornoV3).
- RetornoOrigemPickerV4.tsx + retorno-origem-v4.module.css (novos): seletor,
  detalhe, enquadramento, relato, recepção, ocorrência pré-entrega.
- OperacoesV4Preview.tsx: montar o seletor na casca, ao lado dos modais.
- use-v4-preview.ts + types.ts: estado do fluxo chaveado por loja, busca e
  abertura com geração/alvo, operacaoId, rascunho por loja+OS, navegação
  segura para a filha, abertura pré-selecionada.
- PosVendaStage.tsx: ficha original/filha (seção G) usando o fluxo único.
- ModuleView.tsx: portfólio (andamento × concluído, ação pré-selecionada).
- posvenda-v4.ts(.test) e retorno-origem-v4.ts(.test, novo): derivações puras.
- retorno-actions.ts(.test): protocolo F, recusa pré-entrega/cancelada, busca.
- pos-venda-model.ts(.test): leitura de operacaoId/assinatura/reserva no
  retorno e de operacaoId/descarte no vínculo (aditivo, puro).
- retorno-atendimento.ts(.test): ratificado no planejamento — necessário
  para não herdar senha/acessórios (lacuna 3) e receber a recepção nova;
  função pura, sem I/O.
- preview-honesty.test.ts: só asserções diretamente alteradas pelo 007
  (launcher com 4 entradas, novo wiring do retorno), com prova da diferença
  contra a main; as 10 falhas preexistentes não são corrigidas aqui.
- test/ops-v4-fluxo-curto-007/**: vitest config, UI montada, PostgreSQL,
  QA bootstrap. e2e/specs/operacoes-v4-fluxo-curto-007.spec.ts.

Fora da allowlist e intocados: NovaOSModal.tsx, atendimento-comercial.ts,
nova-os-draft-from-form.ts (candidatos do plano sem necessidade: o retorno
não passa pela Nova OS).

read_budget 45 (proposta: 35): +10 justificados pela infraestrutura de prova
do 006 reutilizada (PG/E2E/bootstrap/config) e pelos contratos adjacentes
que precisam ser lidos para provar invariantes (auto-close, observação
interna, cancelamento/status, createOS).

## Aceites T53–T57 (PostgreSQL descartável, read-back obrigatório)

T53 retorno por "+ Novo": OS entregue na loja A; Retorno/Garantia; localizar
a original; herança confirmada; novo relato; atendimento real vinculado;
reload comprova o vínculo nos dois lados.
T54 cross-store: operador da loja A tenta abrir retorno de OS da loja B,
inclusive chamando a action com o id direto; servidor nega sem criar
atendimento, reserva, vínculo ou vazar dado de B (busca de A nunca lista B).
T55 ocorrência antes da entrega: OS em reparo leva à observação interna;
servidor recusa retorno; nada de garantia iniciada/renovada.
T56 retry e concorrência: duas chamadas simultâneas reais (mesmo e outro
operacaoId) para a mesma original; resposta perdida + nova chamada;
retorno já aberto; comando divergente; falha entre criação e vínculo
(adoção); reserva expirada (retomada/descarte); filha excedente descartada
explicitamente. Intercalação determinística com barreira e espera
observada no banco (pg_stat_activity), nunca sleep. Prova: uma filha
vinculada, nenhum vínculo divergente, nenhuma órfã silenciosa, nenhum
evento duplicado.
T57 original preservada: retorno coberto e fora de cobertura (abrir e
finalizar) em massa sintética; diff persistido da original antes/depois
limitado a retornosV3[] e eventos novos; zero Conta a Receber, movimento,
caixa, estoque, quitação ou garantia renovada; filha com valor zero.

Validações adicionais: permissões separadas (leitura hubs.operacoes;
abrir = editarOs + criarOs, checadas ANTES de qualquer escrita); troca de
loja/OS durante busca e abertura; respostas atrasadas; erro de rede e
recuperação; rascunho preservado; teclado/foco no seletor e diálogos;
históricos V3/V4 legados (retorno aberto sem filha, retorno sem
operacaoId); duas lojas e múltiplos usuários sintéticos; nenhum evento
duplicado por replay.

## E2E

e2e/specs/operacoes-v4-fluxo-curto-007.spec.ts — servidor QA isolado
(porta 3070 ou próxima livre, prontidão real verificada; nunca matar
processo externo), PostgreSQL local descartável ops_v4_fluxo_007_qa*,
usuário/lojas QA sintéticos, --retries=0 --workers=1, service worker
bloqueado. Cobrir: "+ Novo" → busca → seleção → relato → atendimento →
reload nos dois lados; duplo clique; falha de rede e resposta perdida com
retry; pré-entrega → observação; fora de cobertura; abertura pela ficha e
pelo portfólio; navegação por teclado. Proibido sleep arbitrário,
skip/fixme, .first() arbitrário, catch que engole falha, reload que mascara
race.

## Regressões obrigatórias

GOALs 001–006 (runners test/ops-v4-fluxo-curto*; 006 montado no
test_command; PostgreSQL do 006 executado à parte em banco
ops_v4_fluxo_006_qa* e reportado), PR #234/#238 (ops-v3-recebimento-misto),
#235 (ops-v4-recebimento-misto), #237 (ops-datas-retroativas-001), Próxima
ação 005, recebimento ≠ retirada 006, garantia no marco da entrega, Conta a
Receber única, isolamento loja/OS, auto-close do retorno na entrega da
filha.

## Validação

test_command META; T53–T57; E2E; regressões; npm run typecheck; ESLint em
TODOS os .ts/.tsx alterados; npm run build sem migration de produção;
git diff --check; AEP verify, verify --all, check. preview-honesty completo
comparado com a main (nenhuma falha nova). Falha preexistente comparada com
a main, nunca declarada PASS.

## Revisão independente R

OpenAI/Codex READ-ONLY sobre o HEAD funcional EXATO: diff, allowlist,
contrato, T53–T57, provas de concorrência/idempotência, isolamento
multi-loja, preservação da original, ausência de efeito financeiro,
regressões V3/V4 e navegador. Relatório com R_HEAD_REVIEWED, R_FAMILY,
R_VERDICT, P0, P1, P2, P3. Aprovação = P0=P1=P2=0 e R_VERDICT=APPROVE.
Sem R real: R_STATUS=AGUARDANDO_OPENAI, sem close nem merge.

## Revisão 15 — desbloqueio humano (08/10/2026)

Histórico das tentativas (R independente OpenAI, gpt-6.1-sol, Codex
read-only; a R1 foi anulada porque o HEAD se moveu durante a leitura):
- tentativa 1, R2 em c411e7b: 8 P2 (F1–F8) — corrigidos em 4bff374;
- tentativa 2, R3 em 4bff374: 5 P2 (N1–N5) — corrigidos em c4f691d
  (c290ecd só ajustou a asserção estrutural do preview-honesty);
- tentativa 3, R4 em c290ecd: N1–N5 confirmadas, 2 P2 restantes (abaixo).
  O teto de 3 tentativas esgotou: BLOCKED (by=externo) em 8d1f392 na branch
  do GOAL, materializado na main pelo PR de governança desta revisão, com o
  registro original preservado.

Decisão do proprietário (08/10/2026, "COMANDO MESTRE — DESBLOQUEAR, CORRIGIR
E PUBLICAR GOAL 007"): reativar este MESMO GOAL na rev 15, sem
007-FIX/007B/007-HARDENING nem GOAL sucessor — os dois achados da R4
pertencem ao contrato do 007. As tentativas reiniciam pelo desbloqueio
humano (protocolo §3). O trabalho da branch goal/ops-v4-fluxo-curto-007 é
preservado: ela integra a main por merge normal (sem rebase, cherry-pick,
reset, amend ou force).

Escopo da rev 15: SOMENTE os dois P2 da R4 e seus testes. Os dois arquivos
já estão na allowlist; allowlist, test_command, contrato funcional (T53–T57),
gates, classe C4, risco ALTO, família anthropic, R obrigatória e áreas
protegidas inalterados. Não reauditar o 007 inteiro, não redesenhar, não
tocar motores, não elevar o limite do servidor, não implementar 008.

P2 nº 1 — limite da ocorrência pré-entrega
(components/operacoes-v4-preview/parts/RetornoOrigemPickerV4.tsx):
- o campo aceita 2000 caracteres, mas o envio a adicionarObservacaoInternaV3
  acrescenta o prefixo "Ocorrência antes da entrega: " e o servidor recusa
  conteúdo final acima de 2000 (producao-actions.ts, só leitura);
- o limite do relato passa a ser DERIVADO do texto realmente enviado (2000
  menos o comprimento do prefixo/separadores efetivos), com uma única regra
  para contador, validação e envio — sem número mágico;
- nunca truncar em silêncio (inclusive colagem): acima do limite, impedir o
  salvamento, explicar e preservar integralmente o texto do operador;
- sem transporte do relato entre OS/lojas (N4 preservada);
- testes de fronteira: exatamente o limite, limite+1, 2000 caracteres,
  espaços nas bordas, quebras de linha, Unicode (inclusive par substituto) e
  rascunho/estado preservado após recusa.

P2 nº 2 — contenção de foco do "Finalizar retorno"
(Modal de components/operacoes-v4-preview/parts/stages/PosVendaStage.tsx):
- Tab/Shift+Tab circulam só entre os controles habilitados do diálogo; foco
  inicial dentro; foco nunca alcança a página de fundo; Enter nunca aciona
  controle de fundo; Escape segue a regra de fechamento (não fecha durante o
  salvamento); foco volta ao controle que abriu (ou a destino válido se ele
  sumiu após troca de OS/loja); contenção mantida com controles
  desabilitados (sem focável → o próprio contêiner recebe o foco); camadas
  legítimas em portal não são capturadas indevidamente;
- padrão nativo já usado nos diálogos do 006/007, sem dependência nova nem
  sistema global de foco; regra de negócio da finalização inalterada;
- testes montados com teclado real (userEvent) no runner 007 e navegação
  por teclado no E2E 007.

Validação da rev 15: testes focados; test_command completo; T53–T57;
regressões 001–006 e #234/#235/#237/#238; PostgreSQL descartável; E2E 007
(--retries=0); typecheck; ESLint em todos os .ts/.tsx alterados; build sem
migration; git diff --check; verify; verify --all; check. Nova R
independente OpenAI read-only (R5) sobre o HEAD exato, confirmando os dois
corretivos e a ausência de regressão: P0=P1=P2=0 e R_VERDICT=APPROVE.

## Autocorreção

UM GOAL. Achado P0/P1/P2 corrige-se no MESMO GOAL (sem 007-FIX/007B/GOAL
corretivo), tentativas oficiais do AEP (teto 3), nova R sobre SHA novo.
Parar só por: gate humano literal, path indispensável fora da allowlist/área
protegida, bloqueio externo real, teto de tentativas.

## Commit, PR, R, merge, Production

Diff conferido contra a base AEP e a allowlist; add por caminhos
explícitos; commit goal(ops-v4-fluxo-curto-007): ...; commit AEP de close
separado; PR exclusivo contra main. Sem amend, rebase, force, squash ou
bypass; main avançando = merge normal + revalidação. Merge NORMAL só com
check/verify/verify --all, typecheck, lint, build, T53–T57, E2E, regressões,
R APPROVE e Vercel Preview SUCCESS. Production nos dois projetos
(omni-gestao e omni-gestao-pro) e smoke SOMENTE leitura; sem sessão do
proprietário = PROD_SMOKE=OWNER_PENDING_AUTH (sem pedir senha). Nenhum
retorno, pagamento, estoque ou dado real alterado; OS-2026-00028 intocada.
Depois de publicar: parar; GOAL 008 não iniciado.
