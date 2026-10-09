<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Informação financeira verdadeira e retirada organizada, com decisões de recebimento e entrega inalteradas",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 4,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-001",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-001",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/delivery-financial-guard.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/financial-projection-actions.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/financeiro-v4.test.ts lib/operacoes-v4/retirada-fluxo-v4.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts lib/operacoes-v4/os-header-transversal.test.ts lib/operacoes-v4/recibo-persistido-v4.test.ts lib/operacoes-v4/pipeline-operacional.test.ts components/operacoes-v4-preview/rails-adapter.test.ts components/operacoes-v4-preview/status-authority.test.ts components/operacoes-v4-preview/focus-workspace.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-005/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts test/ops-v4-fluxo-curto-006/retirada.test.tsx test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx && npx --no-install vitest run --config test/ops-v4-fluxo-curto-007/vitest.config.ts test/ops-v4-fluxo-curto-007/retorno.test.tsx && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-001.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "lib/operacoes-v4/financial-projection.ts",
    "lib/operacoes-v4/financial-projection.test.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.test.ts",
    "lib/operacoes-v4/financeiro-v4.ts",
    "lib/operacoes-v4/financeiro-v4.test.ts",
    "lib/operacoes-v4/retirada-fluxo-v4.ts",
    "lib/operacoes-v4/retirada-fluxo-v4.test.ts",
    "lib/operacoes-v4/proxima-acao-v4.ts",
    "lib/operacoes-v4/proxima-acao-v4.test.ts",
    "lib/operacoes-v4/os-header-transversal.ts",
    "lib/operacoes-v4/os-header-transversal.test.ts",
    "lib/operacoes-v4/recibo-persistido-v4.ts",
    "lib/operacoes-v4/recibo-persistido-v4.test.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/os-adapter.ts",
    "components/operacoes-v4-preview/rails-adapter.ts",
    "components/operacoes-v4-preview/rails-adapter.test.ts",
    "components/operacoes-v4-preview/parts/CommandHeader.tsx",
    "components/operacoes-v4-preview/parts/ProximaAcaoV4.tsx",
    "components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx",
    "components/operacoes-v4-preview/parts/EstornoRecebimentoModal.tsx",
    "components/operacoes-v4-preview/parts/financeiro-stage.module.css",
    "components/operacoes-v4-preview/parts/stages/FinanceiroStage.tsx",
    "components/operacoes-v4-preview/parts/stages/EntregaStage.tsx",
    "components/operacoes-v4-preview/parts/stages/retirada-v4.module.css",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "test/ops-v4-financeiro-retirada-garantia-001/**",
    "e2e/specs/ops-v4-financeiro-retirada-garantia-001.spec.ts",
    "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 40,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "media"
}
-->

# OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — Informação financeira verdadeira e retirada organizada

## Autoridade e pré-condições

Autorização do proprietário de 08/10/2026 (ver TRACK). Classe C4, risco
ALTO, R de outra família obrigatória. `gates_liberados` vazio.

Antes do `open`, comprovar e registrar no relatório:

1. main contém o merge regular do OPS-V4-FLUXO-CURTO-007, com o 007 DONE no
   ledger de `ops-v4-fluxo-curto`. Sem isso: não abrir; reportar
   `DEPENDENCIA_007` com a retomada do TRACK.
2. Os caminhos da allowlist continuam corretos na main integrada (o 007 muda
   `use-v4-preview.ts` e `preview-honesty.test.ts`). Divergência = plan_rev
   seguinte pelo rito humano antes do `open` (a rev 2 já tratou o
   test_command).
3. Worktree nova e limpa, `.aep-active` ausente antes do `open`.

## Objetivo

O atendente vê, sem contradição, o que foi combinado (comercial), quanto
entrou (fatos do título) e o que impede a retirada — com uma única próxima
ação útil — sem mudar NENHUMA decisão server-side de receber ou entregar.

## Contrato funcional

### A — Três dimensões na projeção server-side (sem nova máquina de status)

`projectFinancialOSV4` passa a expor, além dos campos atuais (inalterados):

- `fatos` — título da MESMA loja/OS (storeId, localKey canônica,
  `ordemServicoId` coerente), valor do título, recebido bruto, estornado,
  recebido líquido, saldo do título, pagamentos vigentes (identidade do 006)
  e meios efetivamente registrados (fonte de cada um).
  `verificavel: true` SOMENTE quando vínculo, histórico e consistência
  conferem: histórico legível, estorno com referência resolvida, recebido ≤
  valor (+1 centavo), status do título coerente com o saldo. Caso
  contrário, valores `null` (nunca zero) e motivo estruturado.
  Nunca inferir pagamento por status "pago" isolado, timeline, orçamento ou
  espelho `pagamentoV3`.
- `comercial` — orçamento/revisão (ausente, prévia, rascunho, enviado,
  aprovado, recusado, expirado), escopo e total, total aprovado, fontes de
  preço e divergências estruturadas (incl. orçamento × título).
- `acoes` — `podeReceber` e `podeEntregar` (iguais a `canReceive` /
  `canDeliver` de hoje), impedimento `{ codigo, destino }`.

Códigos de impedimento (lista fechada, estendível só por plan_rev):
APROVACAO_COMERCIAL_PENDENTE, ORCAMENTO_RECUSADO, ORCAMENTO_EXPIRADO,
PRECO_AUSENTE, SEM_COBRANCA_EXIGE_AUTORIZACAO, VALORES_DIVERGENTES,
TITULO_NAO_VINCULADO, HISTORICO_INVALIDO, ESTORNO_AMBIGUO,
RECEBIDO_ACIMA_DO_TITULO, FALHA_LEITURA, COBRANCA_NAO_FORMALIZADA,
SALDO_EM_ABERTO, COBRANCA_CANCELADA, PAGAMENTO_ESTORNADO.
Destinos: comercial (etapa/seção de orçamento), financeiro, entrega,
recarregar.

O diagnóstico é estruturado: nenhuma decisão de UI compara frases.

`lib/operacoes-v3/delivery-financial-guard.ts` NÃO é editado. As novas
dimensões reutilizam as funções exportadas dele
(`reconciliarTotaisFinanceirosV3`, `reconciliarRecebimentosFinanceirosV3`).

### B — Equivalência de decisões (prova obrigatória)

Para toda a matriz de fixtures (atual + nova), `deliveryDecision`,
`canDeliver`, `canReceive`, `financialStatus`, `consistencyStatus`,
`consistencyIssues`, `receivedTotal` e `balance` saem idênticos aos de
`85aafb4`. Teste de equivalência compara com saídas congeladas (snapshot
explícito em arquivo de teste, não regenerado no mesmo commit da mudança).
`registrarEntregaV3`, `receberOSV3`, misto e a prazo não mudam.

### C — Uma fonte de view-model para quatro superfícies

Novo módulo puro `lib/operacoes-v4/situacao-atendimento-v4.ts` alimenta
Header (`os-header-transversal`), Financeiro (`financeiro-v4` +
`FinanceiroStage`), Entrega (`retirada-fluxo-v4` + `EntregaStage`) e Próxima
ação (`proxima-acao-v4`). Mesma entrada → mesmo texto nas quatro.

Textos de referência:

- fatos verificáveis e título liquidado: "Pagamento registrado — R$ 420,00"
  e "Saldo do título — R$ 0,00" (nunca "OS liberada").
- pagamento existe mas não verificável: "Há registro de pagamento;
  conferência pendente", sem selo verde de quitação.
- comercial pendente: "Aprovação comercial pendente — revisar autorização".
- "Financeiro indisponível" só para falha de leitura real.

### D — Próxima ação sem circuito

Um impedimento → uma próxima ação com o destino do código. Pendência
comercial leva à seção comercial, nunca ao Financeiro. UNKNOWN sem motivo
comercial mantém o contrato N11 do OPS-V4-FLUXO-CURTO-005 ("Revisar
financeiro"). A explicação do impedimento aparece uma vez; as demais
superfícies referem-se a ela sem repetir o alerta.

### E — Histórico sem soma dupla

Deduplicar SÓ a apresentação de eventos da mesma operação comprovada:
`loteId` da baixa = `metadata.operacaoId` do evento da OS, ou o vínculo do
misto do 006 (marcador `a_prazo_autorizado` imediatamente seguinte, mesma
`operacaoId` e mesmo `recebidoAgora`). Nunca por valor/horário. Sem
correlação segura: fontes separadas e rotuladas, nunca somadas. Totais vêm
apenas dos fatos do título. Nenhum evento é apagado.

### F — Comprovante

Disponível só para pagamento elegível, persistido e não estornado, com a
identidade 1:1 do 006 (`recibo-persistido-v4`). Com fatos verificáveis e
decisão bloqueada por pendência comercial, a leitura usa o recebido líquido
verificado; nenhuma outra regra muda. Recibo antigo estornado continua
indisponível mesmo com reposição externa de mesmo valor. Reimpressão e
estorno mantêm permissões e contratos vigentes.

### G — Tela (identidade V4 e pipeline Entrada → Diagnóstico → Execução → Entrega → Pós-venda preservados)

- Topo compacto: OS, cliente/aparelho, serviço, estado operacional,
  situação comercial e pagamento. Comercial e Financeiro seguem
  transversais (sem etapa nova obrigatória).
- Entrega antes da entrega: bloco principal "Conferir retirada" (retirante,
  data efetiva, acessórios em custódia, fotos opcionais, confirmar com o
  motivo do impedimento visível) e resumo lateral de garantia; "Ver
  condições" e "Alterar prazo" abrem o detalhamento existente (o formulário
  deixa de ficar sempre aberto). Nenhuma obrigação universal nova de
  foto/assinatura/checklist; nada que o contrato exige antes da entrega é
  escondido.
  **Rev 3:** o recolhimento do editor de garantia ("Ver condições" /
  "Alterar prazo" no lugar do formulário sempre aberto) foi TRANSFERIDO ao
  OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003 (aceite visual diferido). Nesta
  entrega o editor atual e o E2E `e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts`
  permanecem inalterados; o resumo lateral de garantia segue como está.
- Sem cartões vazios permanentes: "Registro de entrega", checklist e
  acessórios só aparecem com conteúdo ou após a entrega. A mera existência
  de garantia não gera registro positivo de entrega (`temRegistro`).
- Após a entrega: registro efetivo, evidências e documentos.
- Documento indisponível: estado visual e motivo.
- Histórico técnico/eventos brutos em área expansível.
- Financeiro com título liquidado e verificável: "Nada a receber — título
  liquidado" no lugar de "Recebimento bloqueado".
- "Pagamento registrado" e "Aparelho entregue" vêm de evidências próprias
  (fatos do título × `entregaV3`/retirada). Status V3 `recebida` não é
  reinterpretado como retirada: o executor documenta o significado canônico
  (status-machine, status-actions, entrega-actions) antes de mudar qualquer
  texto que o cite; sem migração de status.
- Removidos da superfície padrão: avisos duplicados, formulários sempre
  abertos, cartões sem conteúdo, CTAs concorrentes, texto técnico genérico.
  Preservados: capacidades, dados, auditoria, permissões e endpoints.
- Tokens/componentes existentes; sem biblioteca visual nova. 1440, 768 e
  390 px sem rolagem horizontal; foco, Tab/Shift+Tab/Escape e contraste.

### H — Isolamento

Troca rápida de OS/loja e resposta tardia nunca mostram fatos, comprovante
ou impedimento de outro alvo (mesma regra de alvo do 006).

## Não objetivos

Mudar elegibilidade de recebimento/entrega (GOAL 002), formalizar aprovação
(002), garantia por serviço/versões (003), SLA, schema, permissões.

## Allowlist (justificativa)

- `financial-projection.ts` (+test): dimensões A e equivalência B.
- `situacao-atendimento-v4.ts` (+test, novo): view-model único C.
- `financeiro-v4.ts`, `retirada-fluxo-v4.ts`, `proxima-acao-v4.ts`,
  `os-header-transversal.ts` (+tests): consumidores C/D.
- `recibo-persistido-v4.ts` (+test): leitura F.
- `use-v4-preview.ts`, `os-adapter.ts`, `CommandHeader.tsx`,
  `ProximaAcaoV4.tsx`, `ReceberPagamentoV4.tsx`, `FinanceiroStage.tsx`,
  `EntregaStage.tsx`, CSS modules: tela G e isolamento H.
- `preview-honesty.test.ts`: honestidade das superfícies alteradas (sem
  afrouxar asserções; asserção que congela texto antigo é substituída por
  asserção estrutural equivalente, registrada no relatório).
- `test/ops-v4-financeiro-retirada-garantia-001/**`: harness dedicado
  (jsdom + PG descartável), E2E próprio.
- Rev 3: `parts/EstornoRecebimentoModal.tsx` (apenas leitura/exibição e
  sinalização de informação não confiável do modal de estorno) e
  `rails-adapter.ts` (+`rails-adapter.test.ts`, linhas do rail "Recebimento
  da OS"): mesmas regras de C para as superfícies que ainda exibiam valores
  legados com fatos rejeitados (achados de escopo da R3).

## Matriz de aceite (cenários do comando)

- A1 rascunho + título pago válido: fatos e pendência comercial separados;
  entrega bloqueada; próxima ação → comercial.
- A2 orçamento aprovado + pagamento confirmado: quatro superfícies
  coerentes; entrega explícita disponível.
- A3 título de outra OS/loja, valor divergente, histórico inválido, estorno
  ambíguo/referência inexistente, recebido acima do título, falha de
  leitura: sem quitação nem entrega falsas; fatos `null`.
- A4 "Dinheiro" registrado: exibido como registrado, nenhuma escrita.
- A5 mesmo pagamento no título e na timeline: total não duplica; eventos
  auditáveis preservados; sem correlação → fontes separadas.
- A6 comprovante estornado + reposição externa de mesmo valor:
  indisponível.
- A7 equivalência de decisões (B) sobre toda a matriz.
- A8 troca rápida de OS/loja e resposta tardia (H).
- A9 retirada: acessórios em custódia e retirante antes de confirmar;
  estados vazios; 1440/768/390; Tab/Shift+Tab/Escape; impressão sobre modal.
  O recolhimento do editor de garantia (G) NÃO faz parte do aceite do 001
  desde a rev 3: transferido ao GOAL 003; o 001 só prova que o editor atual
  e o E2E do OPS-V4-FLUXO-CURTO-002 seguem inalterados.
- A10 (rev 3) fatos rejeitados em QUALQUER status legado (incl.
  INCONSISTENT): título R$ 420 com duas baixas de R$ 300 e marcador a prazo
  antigo de R$ 320 — Financeiro, Retirada, Header/Próxima ação, Estorno,
  rail e recebimento não afirmam recebido, saldo, parcela vigente nem
  quitação; mostram conferência com motivo.
- A11 (rev 3) meios estritos: split Pix R$ 100 + R$ 320 sem meio
  identificado → Pix R$ 100 e parte não identificada; valores malformados
  (booleano, array, objeto, string vazia, não finito) nunca viram valor.

Unit + montado (hook real com actions espiãs) + PG real (projeção lida do
banco descartável com título/OS sintéticos) + E2E.

## Regressões obrigatórias

OPS-V4-FLUXO-CURTO-005 (config completa), 006/007 (jsdom no test_command;
suas suítes PG rodam à parte nos bancos `ops_v4_fluxo_006_qa*` e
`ops_v4_fluxo_007_qa*`, evidência obrigatória), #235
(`test/ops-v4-recebimento-misto`), guard intacto, testes unitários do
test_command. O executor roda também as suítes 001–004, #234/#238
(`test/ops-v3-recebimento-misto`, incl. PG) e #237
(`test/ops-datas-retroativas-001`) e seus E2E quando a superfície alterada
os alcança; falha preexistente só se separa com prova na main.

## Revisão 3 — desbloqueio humano (09/10/2026)

Histórico das tentativas da rev 2 (R independente OpenAI, Codex read-only):
- tentativa 1, R1 em d9cb6f9: REQUEST_CHANGES P1=3 (histórico ausente/malformado
  vira fato; estorno sem referência libera comprovante; superfícies mostram
  quitado com fatos rejeitados) P2=3 (meio legado sem vínculo; próxima ação
  ignora destinos entrega/recarregar; desvio do item G);
- tentativa 2, R2 em ac72c8f: REQUEST_CHANGES P1=2 P3=1 (`cents()` aceitava
  coerção de array/booleano; recebimento parcial/Entrega exibiam valores
  rejeitados; linha vazia no EOF do E2E);
- tentativa 3, R3 em cd68d45: REQUEST_CHANGES P0=0 P1=1 P2=1 P3=0, com
  GOVERNANCA_PENDENTE=G_EDITOR_GARANTIA_ABERTO, ESTORNO_MODAL_VALORES_LEGADOS,
  TRILHO_LISTA_VALORES_LEGADOS. O teto de 3 tentativas esgotou: BLOCKED
  (by=decisao) em 5bb4bbe na branch do GOAL, materializado na main pelo PR de
  governança desta revisão com o registro original preservado.

Decisão do proprietário (09/10/2026, "COMANDO — GOAL 001 / REV 3"): reativar
este MESMO GOAL na rev 3, sem 001-FIX/001B nem GOAL substituto; não iniciar
002, 003 nem o OPS-V4-FLUXO-CURTO-008. As tentativas reiniciam pelo
desbloqueio humano (protocolo §3). O trabalho da branch é preservado: ela
integra a main por merge normal (sem rebase, cherry-pick, reset, amend ou
force). Classe C4, risco ALTO, família anthropic, R obrigatória, gates e
áreas protegidas inalterados.

Allowlist da rev 3 = rev 2 + `components/operacoes-v4-preview/parts/EstornoRecebimentoModal.tsx`,
`components/operacoes-v4-preview/rails-adapter.ts` e
`components/operacoes-v4-preview/rails-adapter.test.ts`; o test_command passa
a rodar também `rails-adapter.test.ts`. Testes novos de apresentação: por
esses caminhos exatos ou em `test/ops-v4-financeiro-retirada-garantia-001/**`.

### R3-P1 — informação financeira não conciliada exibida como verdade

Reprodução obrigatória (fixture sintética): Conta a Receber de R$ 420 com
duas baixas de R$ 300 (R$ 600) e marcador antigo de parcelamento a prazo
("Vencimento … R$ 320"). Com `fatos.verificavel=false` (ou dado necessário à
afirmação inconsistente), em QUALQUER status legado — inclusive
INCONSISTENT — nenhuma superfície apresenta recebido, saldo, parcela ou
quitação não conciliados como verdade financeira confirmada: Financeiro da
OS, resumo de retirada, cabeçalho e próxima ação, modal de estorno, rail
"Recebimento da OS" e componentes de recebimento que mostram valores.
Mostrar estado de conferência com o motivo estruturado. Detalhes brutos podem
ficar na auditoria/histórico rotulados como não conciliados, nunca como
valores aprovados ou disponíveis.
- Uma regra estrutural única (a de `situacao-atendimento-v4`) decide, para
  todas as superfícies, se um valor do título pode ser afirmado; sem
  esconder linhas por texto/status nem reinterpretar a projeção em cada
  componente.
- Estados distintos e preservados: pagamento comprovado com aprovação
  comercial pendente; histórico/valor inconsistente; consulta financeira
  indisponível; saldo efetivamente aberto. O caso título R$ 420 validamente
  quitado + orçamento em rascunho continua mostrando os fatos verificáveis
  separados da pendência comercial, com a entrega bloqueada.
- Guard de entrega e decisões server-side intocados.
- Estorno: só leitura, exibição e sinalização de informação não confiável;
  writer, autorização (`podeEstornar`, caixa, motivo), valor a estornar,
  idempotência e permissões inalterados.
- Rail: cada linha só usa a projeção da MESMA loja e OS (vínculo por
  `storeId` e `osId`); nunca snapshot antigo para afirmar pagamento ou saldo.

### R3-P2 — forma e valor do pagamento

- Validação estrita dos meios dos fatos: booleano, array, objeto, string
  vazia, não finito ou negativo nunca vira valor monetário (sem coerção
  implícita; os leitores legados das decisões não mudam).
- Split: cada meio mantém o próprio valor registrado. Pix R$ 100 numa baixa
  de R$ 420 é Pix R$ 100 + R$ 320 sem meio identificado — nunca Pix R$ 420.
  O total da baixa nunca é atribuído ao único meio reconhecido quando o
  registro é parcial ou incompleto. Sem dedução de meio por valor, horário ou
  evento sem identidade compatível.
- Preservadas as proteções contra dupla contagem, recibo estornado e
  reposição externa de mesmo valor. Nenhum pagamento real modificado ou
  reclassificado.

### Garantia — decisão A

O recolhimento do editor de garantia vai para o GOAL 003 (ver lá). Nesta
revisão o editor atual não muda e o E2E `operacoes-v4-fluxo-curto-002.spec.ts`
não é alterado, enfraquecido nem excluído.

### Prova da rev 3

Reproduzir os dois achados da R3 antes da correção com fixtures sintéticas;
testes que falham no candidato cd68d45 e passam com a correção, cobrindo no
mínimo: duas baixas de R$ 300 em título de R$ 420 (nenhum resumo afirma
recebimento conciliado); parcela antiga de R$ 320 não aparece como cobrança
vigente validada; o mesmo cenário no Financeiro, Retirada, Estorno e rail;
split Pix R$ 100 + R$ 320; valores malformados; título liquidado íntegro com
orçamento em rascunho (fatos visíveis, entrega bloqueada); estorno, pagamento
parcial, histórico inválido e título de outra loja; troca rápida de OS/loja e
resposta atrasada; regressões da identidade de comprovante do 006; decisões
de recebimento/entrega idênticas (baseline de equivalência congelado, não
regenerado); editor de garantia e E2E legado preservados. test_command
completo; regressões 005–007, #234/#235/#237/#238 e contratos financeiros
adjacentes; suítes PostgreSQL nos bancos descartáveis próprios (evidências
separadas, como na rev 2); typecheck; ESLint dos alterados; build seguro; E2E
sem retries; `git diff --check`; verify; verify --all; check. Nova R
independente OpenAI read-only sobre o SHA exato, conferindo os dois achados
da R3 e toda superfície que poderia vazar valor legado: P0=P1=P2=0 e
R_VERDICT=APPROVE. Corretivos do mesmo contrato seguem no MESMO GOAL, dentro
do teto de tentativas da rev 3.

## Revisão 4 — desbloqueio humano (09/10/2026)

Histórico das tentativas da rev 3 (R independente OpenAI, Codex read-only):
- tentativa 1, R4 em da9bb4a: REQUEST_CHANGES P2=1 (`lerComercialV4` passava
  as linhas do orçamento a `computeTotaisV3` sem validar a estrutura; serviço
  `null` ou `grupoId` numérico lançava exceção e derrubava o lote de
  projeções do rail). Achados P1/P2 da R3 confirmados corrigidos;
- tentativa 2, R5 em cc03fc8: REQUEST_CHANGES P2=1 (campos numéricos e de
  validade do cálculo comercial com objeto não primitivo — `desconto`,
  `valor`, `custoV3`, `quantidade`, `valorUnitario`, `custoUnitario`,
  `validoAte` com `toString` nulo — ainda lançavam TypeError e derrubavam o
  lote);
- tentativa 3, R6 em b3f5fe5: REQUEST_CHANGES P2=1 (abaixo). R4 e R5
  confirmados corrigidos; R3-P1/P2 corrigidos desde a R4. O teto de 3
  tentativas esgotou: BLOCKED (by=decisao) em f8fe8cd na branch do GOAL,
  materializado na main pelo PR de governança desta revisão com o registro
  original preservado.

Decisão do proprietário (09/10/2026, "DECISÃO HUMANA — GOAL 001 / REVISÃO
4"): reativar este MESMO GOAL na rev 4, restrita ao único P2 remanescente da
R6, sem GOAL sucessor nem reinício da implementação; preservar todos os
corretivos das revisões 2 e 3; não alterar regras server-side de
recebimento, estorno ou entrega; não iniciar 002, 003 nem o
OPS-V4-FLUXO-CURTO-008. As tentativas reiniciam pelo desbloqueio humano
(protocolo §3). A branch integra a main por merge normal (sem rebase,
cherry-pick, reset, amend ou force). Classe C4, risco ALTO, família
anthropic, R obrigatória, allowlist, test_command, gates e áreas protegidas
inalterados.

### R6-P2 — rótulo de meio de pagamento não textual

Achado: em `lib/operacoes-v4/financial-projection.ts`, a consulta ao
dicionário `METHOD_LABELS` não se protege de propriedades herdadas. Forma de
pagamento registrada como `"__proto__"` ou `"constructor"` resolve para
objeto/função herdados; `rotuloMeioEstrito` aceita esse valor sem validar o
tipo e o FinanceiroStage lança "Objects are not valid as a React child" com
fatos verificáveis.

Contrato da correção (dentro da allowlist vigente; não mover para
`payment-model.ts` nem outra área por conveniência):
- investigar a cadeia completa `method()` → `rotuloMeioEstrito()` → fatos
  financeiros → consumidores da interface, incluindo os leitores legados do
  mesmo arquivo que usam `method()` ou seus rótulos;
- nenhum rótulo não textual sai dessa cadeia para a UI: consulta só a
  propriedades próprias (ou estrutura equivalente, p.ex. `Map`) e validação
  explícita do tipo de saída;
- valor desconhecido nunca é apresentado como forma reconhecida; sem forma
  verificável, o valor financeiro válido é preservado sem meio inventado
  ("forma não identificada");
- histórico, status, valor, split, caixa, estorno e comprovante persistidos
  não mudam; decisões de recebimento/entrega idênticas (baseline de
  equivalência congelado, não regenerado).

### Prova da rev 4

Antes da R, bateria adversarial restrita ao contrato de interpretação de
dados financeiros e às superfícies autorizadas: `__proto__`, `constructor`,
`toString`, `valueOf`, `hasOwnProperty` e demais nomes herdados pertinentes,
em registro de forma única e em linhas de split; formas não textuais;
strings vazias/espaços; valores monetários inválidos; splits parciais;
registros sem forma identificada; JSON malformado das revisões anteriores.
Os testes demonstram: projeção sem exceção; todo rótulo exposto é texto
válido; nenhuma forma inventada; valor de cada meio correto; sem soma
duplicada; estado financeiro e permissões inalterados; FinanceiroStage e
consumidores relevantes renderizam sem erro React; leitura em lote não falha
por uma OS com metadados inválidos; histórico auditável disponível de modo
honesto. Reprodução vermelha no candidato b3f5fe5 e verde após a correção,
no mínimo para o cenário exato da R6. Regressões, PG descartável, E2E sem
retries, typecheck, ESLint, build seguro, diff-check e AEP como na rev 3;
T56c e impressão legada seguem separados com evidência. Nova R independente
OpenAI read-only sobre o SHA exato, com verificação especial da cadeia de
rótulos e das superfícies que os consomem: P0=P1=P2=0 e R_VERDICT=APPROVE.
Corretivos do mesmo contrato seguem no MESMO GOAL, dentro do teto da rev 4.

## Validação, R e parada

typecheck, ESLint nos alterados, build seguro (sem tocar banco real),
`git diff --check`, `verify`, `verify --all`, `check`. R OpenAI/Codex
read-only sobre o SHA exato. Autocorreção no MESMO GOAL (teto 3). Parar em:
dependência, caminho fora da allowlist, gate, ausência de prova ou de R.
Ao fechar: obedecer o veredito de contexto; o 002 só abre com 001 DONE e
mergeado.
