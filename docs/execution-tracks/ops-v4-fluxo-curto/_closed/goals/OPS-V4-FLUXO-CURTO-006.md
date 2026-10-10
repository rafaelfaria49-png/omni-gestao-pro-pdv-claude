# OPS-V4-FLUXO-CURTO-006 — Recebimento e retirada: caminho curto com dinheiro e estoque corretos

<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-006",
  "track": "ops-v4-fluxo-curto",
  "title": "Recebimento e retirada: caminho curto com dinheiro e estoque corretos",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 13,
  "branch": "goal/ops-v4-fluxo-curto-006",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-006",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v4/retirada-fluxo-v4.test.ts lib/operacoes-v4/recibo-persistido-v4.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/financeiro-v4.test.ts lib/operacoes-v4/receber-pagamento-form.test.ts lib/operacoes-v4/estorno-recebimento-form.test.ts lib/operacoes-v4/os-header-transversal.test.ts lib/operacoes-v3/delivery-financial-guard.test.ts lib/operacoes-v3/entrega-actions.test.ts lib/operacoes-v3/entrega-unificada.test.ts lib/operacoes-v3/payment-model.test.ts lib/operacoes-v3/pdv-servico-a-prazo.test.ts lib/operacoes-v3/os-conta-receber-unica.test.ts lib/operacoes-v3/recebimento-misto-model.test.ts lib/operacoes-v3/pos-venda-model.test.ts lib/operacoes-v3/estoque-sync.test.ts lib/operacoes-v3/datas-operacionais-model.test.ts lib/operacoes-v3/status-machine.test.ts lib/operacoes-v3/orcamento-model.test.ts components/operacoes-v3/hooks/use-pdv-servico-v3.test.ts components/operacoes-v4-preview/financial-projection-surfaces.test.ts components/operacoes-v4-preview/recebimento-transversal.test.ts components/operacoes-v4-preview/status-authority.test.ts components/operacoes-v4-preview/use-financial-projection-v4.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[56]\" && npx --no-install vitest run --config test/ops-v4-fluxo-curto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-003/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-004/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-005/vitest.config.ts && npx --no-install vitest run --config test/ops-v3-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "components/operacoes-v4-preview/parts/stages/EntregaStage.tsx",
    "components/operacoes-v4-preview/parts/stages/FinanceiroStage.tsx",
    "components/operacoes-v4-preview/parts/stages/retirada-v4.module.css",
    "components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx",
    "components/operacoes-v4-preview/parts/ReciboModal.tsx",
    "components/operacoes-v4-preview/parts/EstornoRecebimentoModal.tsx",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/use-financial-projection-v4.ts",
    "components/operacoes-v4-preview/use-financial-projection-v4.test.ts",
    "components/operacoes-v4-preview/types.ts",
    "components/operacoes-v4-preview/os-adapter.ts",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "components/operacoes-v4-preview/financial-projection-surfaces.test.ts",
    "components/operacoes-v4-preview/recebimento-transversal.test.ts",
    "lib/operacoes-v4/retirada-fluxo-v4.ts",
    "lib/operacoes-v4/retirada-fluxo-v4.test.ts",
    "lib/operacoes-v4/recibo-persistido-v4.ts",
    "lib/operacoes-v4/recibo-persistido-v4.test.ts",
    "lib/operacoes-v4/financial-projection.ts",
    "lib/operacoes-v4/financial-projection.test.ts",
    "lib/operacoes-v4/financeiro-v4.ts",
    "lib/operacoes-v4/financeiro-v4.test.ts",
    "lib/operacoes-v4/os-header-transversal.ts",
    "lib/operacoes-v4/os-header-transversal.test.ts",
    "lib/operacoes-v3/pdv-servico-actions.ts",
    "lib/operacoes-v3/payment-model.ts",
    "lib/operacoes-v3/payment-model.test.ts",
    "lib/operacoes-v3/pos-venda-model.ts",
    "lib/operacoes-v3/pos-venda-model.test.ts",
    "lib/operacoes-v3/entrega-actions.ts",
    "lib/operacoes-v3/entrega-actions.test.ts",
    "lib/operacoes-v3/delivery-financial-guard.ts",
    "lib/operacoes-v3/delivery-financial-guard.test.ts",
    "components/operacoes-v3/hooks/use-pdv-servico-v3.ts",
    "components/operacoes-v3/hooks/use-pdv-servico-v3.test.ts",
    "test/ops-v4-fluxo-curto-006/**",
    "e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts",
    "docs/execution-tracks/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 70,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "media"
}
-->

## Autoridade e ativação

Contrato humano: autorização operacional ponta a ponta do proprietário
(08/10/2026) — "QUERO INICIAR OPS-V4-FLUXO-CURTO-006" — plan_rev 12,
classe C4 (toca fluxo de dinheiro/estoque), risco ALTO, executor Anthropic
(Claude Opus 5.5) e revisão independente obrigatória de outra família
(OpenAI, read-only). Para a classe C4, o gate humano explícito é essa
autorização; nenhum gate de CAMINHO é liberado (gates_liberados vazio).

O EXECUTION_PROTOCOL.md, §2, determina que adicionar ou remover um GOAL em
goals/ é ato humano. Este arquivo materializa a decisão textual do
proprietário pelo rito oficial, como nos GOALs 004 e 005:
registry → verify → verify --all → commit/PR exclusivo de planejamento →
merge NORMAL (merge commit) em main → worktree de produto sobre a main
atualizada → status → open.

Nunca incluir mudanças de goals/** no diff de produto avaliado pelo check 8.
Não editar state.json, LEDGER.jsonl, REGISTRY.md ou GATES.md à mão.

## Base

Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude

Main confirmada na autorização (08/10/2026):
4e87fb13f53fa9f78e229d88b1b8566f95262ad0 (merge do PR #241, GOAL 005).

A base de produto é origin/main vigente após a integração deste
planejamento, descendente de 4e87fb1. Preservar integralmente #234, #235,
#237 e #238. GOALs 001–005 permanecem DONE; não reabrir. GOALs 007–008
continuam inelegíveis.

## Diagnóstico focal (auditoria de 08/10/2026 sobre 4e87fb1)

Já existem e serão REUSADOS, sem duplicar: FinanceiroStage, EntregaStage,
ReceberPagamentoV4 (imediato, split, misto, 100% a prazo), hook V3
usePdvServicoV3 (operacaoId estável, replay, saldoEsperado, pendência
incerta por loja/OS), receberOSV3 / registrarRecebimentoMistoOSV3 /
lancarOSAPrazoV3 / estornarRecebimentoOSV3 (todos sob a trava por OS:
advisory → sessão → OS → título), Conta a Receber única por OS
(localKey os-faturamento:{loja}:{os}, criada sob demanda no primeiro
writer), projeção server-side (financial-projection + delivery-financial-
guard), registrarEntregaV3 (trava por OS, guard financeiro refeito no
servidor, idempotente, data efetiva #237, estoque pelo adapter oficial
uma única vez depois do commit), salvarAssinaturaRetiradaV3, fotos de
saída, garantia (início na entrega efetiva) e o bloco "Próxima ação"
(GOAL 005).

Lacunas de LIGAÇÃO encontradas (são o escopo deste GOAL):

1. Entrega com saldo: "Receber pagamento" tira o operador da Entrega
   (vai para Financeiro); após pagar ele precisa voltar manualmente.
2. A Entrega não mostra a condição financeira (total/recebido/saldo/
   situação), o serviço aprovado nem a garantia prevista no contexto da
   retirada — só um bloqueio ou o botão de confirmar.
3. CHARGE_NOT_CREATED na Entrega aparece como texto técnico ("Total
   positivo sem Conta a Receber correspondente") sem caminho; o motor já
   formaliza o título único no primeiro recebimento/lançamento a prazo.
4. "Retirado por": RegistrarEntregaInputV3.recebidoPor existe, mas a V4
   nunca o envia (sempre cai no nome do cliente).
5. Recibo: o ReciboModal só conhece o comprovante da SESSÃO
   (ultimoRecibo). Após reload diz "Não existe recibo registrado" mesmo
   com recebimento persistido (comprovante gravado em
   timeline[].metadata.comprovante pelos writers canônicos); após estorno
   o comprovante estornado continua sendo oferecido como válido.
6. Flags de sheet/recibo/estorno (receberPagamento, recibo,
   estornoRecebimento) são booleanas globais: trocar de OS/loja com uma
   delas ligada abre a superfície na OS nova (contaminação de UI A→B).
7. Termo de Entrega pode ser emitido antes da entrega (Entrega, menu Docs,
   Histórico) — documento que declara retirada inexistente.
8. Cópia pós-recebimento não distingue "Pagamento quitado — confirmar
   entrega" de "Entrega autorizada a prazo (não quitada)" de forma
   uniforme na Entrega.

Fora do escopo e preexistente (área protegida — Estoque global):
selectEstoquePecaSource (lib/operacoes/services/orcamento-builder.ts) +
consumeEstoqueFromOS (lib/operacoes/adapters/os-estoque.ts) consomem TODAS
as linhas de orcamento.pecas, inclusive alternativas NÃO selecionadas de
grupos de escolha (orçamento multiopção com produto vinculado). Não é
corrigido aqui; se a R exigir, seguir a seção "Gate de área protegida".

## Objetivo

A mesma OS percorre, com clareza e sem atalhos perigosos:
serviço pronto → situação financeira conhecida → receber agora /
parcial / misto / a prazo (quando aplicável) → saldo resolvido ou entrega
autorizada → retirada → entrega formal → documentos/garantia coerentes.
Preço aprovado, título, dinheiro recebido e entrega continuam FATOS
DISTINTOS; pagamento e entrega ficam próximos, mas são DOIS COMANDOS.

## Contrato funcional

### A — Conectar, não reimplementar

Nenhum segundo componente de pagamento (ReceberPagamentoEntregaV4,
CheckoutEntregaV4 ou equivalente), nenhuma action de entrega V4, nenhuma
lógica financeira copiada para a Entrega. Escritas só pelos contratos
existentes: receberOSV3, registrarRecebimentoMistoOSV3, lancarOSAPrazoV3,
estornarRecebimentoOSV3, registrarEntregaV3, salvarAssinaturaRetiradaV3.
Formas de pagamento: somente as que o contrato aceita (dinheiro, PIX,
débito, crédito, split; a prazo pelo contrato próprio). Nada de carteira,
vale, crediário paralelo, parcelado não suportado ou forma fictícia.

### B — Retirada contextual (EntregaStage)

Bloco compacto de retirada, só com dados reais (ausente = "Não
informado", nunca confirmação positiva): código da OS, cliente/aparelho,
serviço aprovado, condição financeira (total, recebido, saldo, situação),
garantia prevista, acessórios/custódia, fotos de saída, documentos, quem
retira e data efetiva. Derivação PURA em lib/operacoes-v4/
retirada-fluxo-v4.ts (sem I/O), a partir da OS resolvida (mesma loja+OS) e
da projeção server-side da MESMA OS (projeção de outra OS = carregando).

### C — Receber pagamento em contexto

Com saldo (OPEN/PARTIAL sem autorização a prazo) ou cobrança ainda não
formalizada (CHARGE_NOT_CREATED com total positivo confiável), a Entrega
oferece "Receber pagamento", que abre o MESMO sheet do ReceberPagamentoV4
(mesmo hook V3, mesma pendência/operacaoId) sem trocar de OS nem sair da
Entrega. Falha: o sheet não fecha como sucesso, o rascunho permanece,
mensagem recuperável, nada liberado. Sucesso terminal: relê o servidor
(lista, detalhe, projeção); NUNCA chama registrarEntregaV3 no callback;
a Entrega passa a dizer "Pagamento registrado. Falta confirmar a
entrega." / "Pagamento quitado — confirmar entrega." e oferece
"Confirmar entrega" explícito. Parcial: mostra o novo saldo e continua
bloqueando. Caixa fechado com valor imediato: negado sem movimento, sem
recibo, sem sucesso local; nunca abre caixa automaticamente.

### D — Estado financeiro compreensível e fail-closed

Distinguir: preço previsto (orçamento não aprovado), cobrança não
formalizada, saldo aberto, parcial, quitado, autorizado a prazo (NÃO
quitado), sem cobrança autorizada, sem cobrança exigindo classificação,
inconsistente, desconhecido, cancelado/estornado. Carregando = "Confirmando
situação financeira…" sem CTA de entrega. UNKNOWN / INCONSISTENT /
CHARGE_NOT_CREATED / erro nunca viram "quitado" nem liberam entrega.

### E — CHARGE_NOT_CREATED

Não criar título só para tirar aviso, nem venda, nem título paralelo V4.
A UI explica: a cobrança da OS é formalizada no primeiro recebimento (ou
lançamento a prazo), no título único da OS. Leitura não cria nada.

### F — Quem retira

Campo "Retirado por" antes da confirmação, pré-preenchido com o nome do
cliente quando houver, editável, obrigatório (sem cadastro novo de
pessoa, sem alterar Cliente); enviado como recebidoPor de
registrarEntregaV3.

### G — Data da entrega (#237 intacto)

Default agora; pode ser passada; nunca futura; nunca antes da entrada;
só-dia nunca exibe horário; registro/auditoria no horário real. Receber
dinheiro agora nunca é retrodatado por uma data de entrega antiga.

### H — Confirmação de entrega separada

Comando explícito, revalidado no servidor (status, financeiro, saldo,
autorizações, loja, permissão, data) por registrarEntregaV3. Sem
cobrança: categoria + motivo obrigatórios, ator/loja/horário derivados no
servidor; sem switch "ignorar cobrança". Pagamento bem-sucedido + entrega
falha: dinheiro, título, caixa e recibo preservados; retomar SOMENTE a
entrega, sem nova cobrança; reload mostra "Pagamento quitado — confirmar
entrega."

### I — Recibo

Recibo só de recebimento REAL persistido da MESMA OS. Comprovante da sessão
(hook, chaveado por loja+OS) ou, após reload, o comprovante persistido
pelos writers canônicos na timeline da OS (derivação pura em
lib/operacoes-v4/recibo-persistido-v4.ts). Estorno invalida o comprovante
estornado (sessão e persistido). Troca A → B nunca mostra recibo de A.
Reimpressão nunca grava nada.

### J — Documentos

Termo de Entrega só após entrega real (antes: indisponível com motivo,
em todas as entradas da V4). Depois: data efetiva, retirante real,
garantia real, OS correta; reimpressão não cria entrega.

### K — Assinatura, garantia, estoque e custo

Assinatura de retirada ≠ assinatura de entrada; captura pós-entrega por
salvarAssinaturaRetiradaV3 (nunca inicia outra entrega). Garantia inicia
uma vez, na entrega canônica; replay/reimpressão/pagamento não renovam.
Estoque pelo adapter oficial: peça vinculada Q → baixa Q uma vez; replay,
duplo clique, reimpressão e pagamento → zero baixa adicional; sem estoque
negativo. Custo (T50): a composição existente suporta peça incluída —
linha de peça kindV3 "interno" (custo, sem valor ao cliente) com
custoUnitario e produtoId, serviço cobrado R$300 —, então total ao
cliente 300, custo 92 (computeTotaisV3), uma baixa; nenhum sistema novo de
composição de custo.

### L — Isolamento OS / loja

Respostas de A nunca abrem recibo/sheet, mudam saldo, fecham modal,
liberam entrega, navegam ou notificam B (targetKey loja+OS; guards de
#238/005 reusados). Flags de sheet/recibo/estorno passam a valer só para a
loja+OS em que foram abertas. Nenhum fallback para caixa/sessão/loja de
outro contexto.

### M — Teclado e acessibilidade

Fluxo inteiro por teclado: Tab lógico, foco visível, Enter/Space em
botão, Escape fecha o sheet quando ocioso, foco volta ao contexto. Sem
listener global de Enter; digitar em input/textarea/select/modal nunca
paga nem entrega.

### N — Frontend design

Skill frontend-design para a parte visual: retirada compacta, tokens
semânticos Omni (sem cor hardcoded), claro/escuro, densidade ERP,
Pipeline/Próxima ação/CommandHeader preservados, sem duplicar "Próxima
ação". 1440/1024/768/390 sem scroll horizontal, CTA cortado ou modal fora
da viewport.

## Áreas protegidas e exceção V3

Não alterar sem novo gate humano: schema, migrations, auth, proxy, .env,
CI, Vercel, Fiscal, WhatsApp, Marketplace, AppShell, PDV geral, Caixa
global, Financeiro global (lib/financeiro/**), Estoque global
(lib/operacoes/adapters/**, lib/operacoes/services/**),
lib/ops-upsert-venda.ts. Não copiar finalizeSaleTransaction (OS não é
venda de PDV). Necessidade nessas áreas = PARAR e devolver UMA decisão:
PROTECTED_PATH / WHY_REQUIRED / MINIMAL_DIFF / RISK_IF_NOT_DONE /
ALTERNATIVE_WITHIN_SCOPE. Não duplicar lógica na V4 para evitar o gate.

Exceção controlada V3 (allowlist explícita, só se indispensável, cada
edição justificada no relatório): pdv-servico-actions.ts, payment-model.ts,
pos-venda-model.ts, entrega-actions.ts, delivery-financial-guard.ts,
use-pdv-servico-v3.ts (+ seus testes). Não é autorização genérica para
lib/operacoes-v3/**. Ordem de travas preservada (advisory da OS → sessão
→ OS → título; estoque: OS → produtos); nenhuma trava server-side nova
sem necessidade.

lib/operacoes-v4/proxima-acao-v4.ts(.test.ts) fica FORA da allowlist:
inspecionada, sem necessidade documentada (a matriz do 005 já cobre
PAID / AUTHORIZED_CREDIT sem "quitado" / CHARGE_NOT_CREATED / loading).
Ela entra no test_command como regressão.

## Allowlist (justificativa)

- EntregaStage.tsx + retirada-v4.module.css: bloco de retirada, receber em
  contexto, retirado por, cópias de estado, termo só após entrega.
- ReceberPagamentoV4.tsx: modo hospedeiro só-sheet para a Entrega (mesmo
  componente/contrato, sem lógica nova).
- ReciboModal.tsx: comprovante da sessão ou persistido; nunca de outra OS.
- use-v4-preview.ts + types.ts: flags chaveadas por loja+OS, abrir o sheet
  na Entrega, confirmarEntrega com recebidoPor, estorno invalida recibo da
  sessão, gating do Termo de Entrega, view-model da retirada.
- retirada-fluxo-v4.ts / recibo-persistido-v4.ts (+ testes): derivações
  puras novas.
- FinanceiroStage.tsx, EstornoRecebimentoModal.tsx, os-adapter.ts,
  use-financial-projection-v4.ts, financial-projection.ts, financeiro-v4.ts,
  os-header-transversal.ts (+ testes): candidatos do plano original, só
  para ligação/consistência de rótulos ou correção de achado da R no
  mesmo GOAL; intocados quando não necessários.
- preview-honesty / financial-projection-surfaces / recebimento-transversal
  (.test.ts): apenas asserções diretamente alteradas pelo 006, com prova
  da diferença contra a main (as 10 falhas preexistentes do
  preview-honesty NÃO são corrigidas aqui).
- Exceção V3 (6 arquivos + testes): ver seção anterior.
- test/ops-v4-fluxo-curto-006/**: UI montada, PostgreSQL, QA bootstrap,
  vitest config. e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts.

## Aceites T43–T52 (PostgreSQL descartável, read-back obrigatório)

T43 título sob demanda: serviço aprovado positivo sem recebimento; abrir
Financeiro/retirada (leitura) não cria título nem venda; UI explica a
formalização; o primeiro recebimento cria UMA Conta a Receber.
T44 parcial e quitação: OS R$300; R$100 → 300/100/200 parcial; R$200 →
300/300/0 quitado; uma Conta a Receber, movimentos corretos, nenhuma venda;
entrega só então disponível (explícita).
T45 split e meios suportados: soma exata, sessão correta, meios persistidos,
replay correto; meio não suportado rejeitado sem efeito.
T46 recebimento negado: caixa fechado, sessão de outra loja/terminal, loja
errada, valor adulterado (saldoEsperado/valor > saldo), projeção
inconsistente → rejeitado, zero recibo/movimento/caixa, entrega bloqueada.
T47 receber antes de pronta: sinal com OS em execução; financeiro
atualizado, status técnico e custódia preservados, zero entrega.
T48 pagou, entrega falhou: pagamento R$300 confirmado; falha controlada
na entrega; dinheiro/título/caixa preservados, OS não entregue; retry só
da entrega, sem nova cobrança; uma única entrega final.
T49 prazo e saldo: (A) a prazo válido → sem caixa, título pendente/parcial,
entrega permitida; (B) saldo sem autorização → entrega bloqueada.
Inclui 350 imediato + 50 a prazo em OS de R$400 (mesma Conta a Receber).
T50 peça incluída e custo: serviço R$300, peça interna custo R$92 vinculada
a produto; total 300, custo 92, estoque baixa 1 uma vez, replay 0.
T51 estorno e recibo recarregado: recebimento persistido; reabrir OS →
recibo da mesma OS; estorno permitido → evento rastreável, saldo correto,
só o devido revertido, nenhuma outra OS afetada, entrega volta a bloquear,
recibo estornado não é mais oferecido.
T52 entrega canônica: OS pronta e apta; retirante + data + entrega;
repetir/recarregar/reimprimir → um único fato de entrega, status
entregue, assinatura distinta da entrada, garantia coerente, sem segunda
baixa, sem nova cobrança, documentos coerentes.

## Segurança S01–S20

S01 duplo clique em Receber. S02 duplo clique em Confirmar entrega. S03
resposta perdida do recebimento (replay, mesma operação). S04 resposta
perdida da entrega (retry idempotente). S05 A→B durante recebimento. S06
A→B durante entrega. S07 troca de loja. S08 projeção stale de outra OS.
S09 financeiro carregando. S10 financeiro com erro. S11 estorno após
quitação antes da entrega. S12 recibo após reload. S13 entrega retroativa
válida. S14 data de entrega inválida. S15 sem cobrança sem categoria. S16
sem cobrança sem motivo. S17 a prazo parcial após sinal. S18 replay de
estoque. S19 replay de garantia. S20 próxima ação após cada estado.

Concorrência determinística em PostgreSQL real (espera de trava conferida
em pg_stat_activity, nunca sleep): (A) dois recebimentos equivalentes → uma
operação econômica; (B) recebimento × entrega → a entrega decide com o
estado commitado; (C) duas entregas → uma efetiva; (D) estorno × entrega →
guard decide com o estado atualizado; (E) troca de OS no cliente (montado)
→ zero contaminação. Revisar ordem de travas recebimento × entrega ×
estorno × estoque (sem deadlock).

## E2E — E01–E15

e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts. Servidor QA isolado (porta
3060 ou próxima livre; nunca matar processo externo), PostgreSQL local
descartável (banco ops_v4_fluxo_006_qa*), usuário/lojas/caixa QA
sintéticos, --retries=0, --workers=1. Pagamentos e entregas reais SÓ no
banco descartável.

E01 parcial 100 + 200. E02 split suportado. E03 caixa fechado. E04 sinal
antes de pronta. E05 pagamento completo → CTA Entrega (sem entrega
automática). E06 pagamento completo → falha da entrega → retry só da
entrega. E07 a prazo → entrega autorizada sem caixa. E08 saldo sem
autorização → entrega bloqueada. E09 sem cobrança auditada. E10 recibo
após reload. E11 estorno → entrega volta a bloquear. E12 duplo clique /
replay da entrega. E13 troca OS A→B. E14 estoque baixa uma vez. E15
documento/garantia pós-entrega. Proibido sleep arbitrário, skip/fixme,
.first() arbitrário, catch que engole falha, reload que mascara race.

## Regressões obrigatórias

GOALs 001–005 (runners test/ops-v4-fluxo-curto*, próxima ação 005 como
contrato), PR #234/#238 (runners test/ops-v3-recebimento-misto: montado no
test_command; PostgreSQL executado e reportado), #235
(test/ops-v4-recebimento-misto), #237 (test/ops-datas-retroativas-001).
Entrada não vira wizard; orçamento não aprova sozinho; execução não avança
por pagamento; 350+50 correto; 100% a prazo sem caixa; retry econômico
idempotente; troca A→B segura; entrega retroativa correta.

## Validação

test_command META; T43–T52; S01–S20; E01–E15; regressões; npm run
typecheck; ESLint em TODOS os .ts/.tsx alterados; npm run build
(MIGRATION_SKIPPED, sem autoridade produtiva); git diff --check; AEP
verify, verify --all, check. preview-honesty completo comparado com a main
(nenhuma falha nova). Revisão visual com frontend-design em
Financeiro/Retirada (aberto, parcial, quitado, a prazo, sem cobrança,
erro/loading, entregue) a 1440/1024/768/390, claro/escuro quando viável.
Falha preexistente é comparada com a main, nunca declarada PASS.

## Revisão independente R

OpenAI/Codex READ-ONLY em sessão nova, preferência gpt-6.1-sol com
raciocínio alto/máximo, sobre o HEAD candidato EXATO. Ataques R01–R20 da
autorização (segunda venda/título, recebimento duplicado por retry,
caixa/movimento duplicados, pagamento perdido após falha da entrega,
entrega automática, saldo liberando entrega, a prazo como quitado, sem
cobrança silenciosa, recibo stale, troca OS/loja, estorno com projeção
stale, estoque em dobro, custo duplicado, garantia em dobro, entregas
concorrentes, deadlock, documento afirmando fato inexistente, regressão
da Próxima ação 005, retrodatação financeira pela data de entrega, meio
não suportado como sucesso). Exigir P0=P1=P2=0 e VERDICT=APPROVE.

## Revisão 13 — desbloqueio humano (08/10/2026)

Histórico das tentativas (R independente OpenAI, gpt-6.1-sol, read-only):
- tentativa 1, R1 em 1769cab: 3 P1 + 4 P2 — corrigidos em a209aec;
- tentativa 2, R2 em a209aec: 1 P1 + 2 P2 — corrigidos em a6bb261 (1fc223e só
  acrescentou asserções de reimpressão em split e misto);
- tentativa 3, R3 em 1fc223e: 1 P1 + 1 P2 (abaixo). O teto de 3 tentativas
  esgotou: BLOCKED (by=decisao) em 4d13498 na branch do GOAL, materializado na
  main pelo PR de governança desta revisão.

Decisão do proprietário (08/10/2026): reativar este MESMO GOAL na rev 13, sem
006-FIX/006B/006C/006-HARDENING nem GOAL sucessor — os dois achados da R3
pertencem ao contrato do 006. As tentativas reiniciam pelo desbloqueio humano
(protocolo §3). O trabalho do PR #245 é preservado: a branch do GOAL integra a
main por merge normal (sem rebase, cherry-pick, reset ou force).

Escopo da rev 13: SOMENTE os dois achados da R3 e seus testes. Nenhuma
ampliação da allowlist (os arquivos já estão nela); test_command, contrato
funcional, matriz, gates e áreas protegidas inalterados. Não reauditar o 006
inteiro, não redesenhar, não tocar motores financeiros, não implementar 007.

P1 — identidade do comprovante (lib/operacoes-v4/recibo-persistido-v4.ts):
- comprovante persistido com operacaoId só casa com o pagamento vigente do
  título que tenha a MESMA identidade (operationId = loteId). Pagamento sem
  identidade, ou com identidade divergente, NÃO valida esse comprovante →
  recibo indisponível. Comprovante sem operacaoId não prova pagamento vigente
  (os writers atuais sempre gravam a identidade) → indisponível;
- proibido adivinhar por valor + ordem; proibido alterar writer financeiro
  para fabricar operationId;
- preservar parcial 100 + 200, split, misto, recibos canônicos válidos,
  reimpressão após reload e comprovante atual da mesma OS;
- regressão exata: OS R$300; PIX 100 op1; PIX 200 op2; estorno dos 200;
  reposição externa 200 em dinheiro com operationId=null → o recibo PIX op2
  nunca é oferecido (indisponível, salvo comprovante persistido legítimo da
  reposição atual). Também: identidade correta → disponível; identidade
  divergente → indisponível. recibo-persistido-v4.test.ts deixa de aceitar
  comprovante com operacaoId × pagamento sem operationId.

P2 — foco do recibo (components/operacoes-v4-preview/parts/ReciboModal.tsx):
- conter Tab/Shift+Tab no recibo, no mesmo padrão nativo do sheet de
  recebimento: Tab no último focável volta ao primeiro; Shift+Tab no primeiro
  vai ao último; foco nunca alcança controle da página de fundo; Enter nunca
  atinge controle de fundo; Escape fecha quando a impressão interna não está
  aberta; foco volta ao controle que abriu. Sem dependência nova, sem sistema
  global de foco;
- testes montados no runner 006 (test/ops-v4-fluxo-curto-006/**) com
  interação real de teclado: K01 foco inicial dentro do recibo; K02 Tab
  percorre só controles do modal; K03 Tab no último volta ao primeiro; K04
  Shift+Tab no primeiro vai ao último; K05 foco nunca no botão de fundo; K06
  Enter com modal aberto não dispara controle de fundo; K07 Escape fecha; K08
  foco retorna ao botão que abriu.

Fora desta revisão (auditoria futura somente leitura, sem ampliar allowlist):
estoque da OS consumindo peça alternativa não escolhida; estorno do
Financeiro podendo mirar pagamento já estornado. Não bloqueiam o aceite do
006, salvo se a correção tocar diretamente essa cadeia e provar regressão.

Validação da rev 13: testes focados; test_command completo; recibo-persistido,
montados 006, teclado, PostgreSQL e E2E 006 pertinentes; regressões 005, #237,
#238; typecheck; ESLint em todos os .ts/.tsx alterados; git diff --check;
build (MIGRATION_SKIPPED); verify; verify --all; check. Nova R independente
OpenAI read-only (R4) sobre o HEAD exato, com foco em R09, R17, focus trap,
Tab/Shift+Tab, Enter contra o fundo, Escape e isolamento OS A/B, e
confirmação de que os ataques já aprovados seguem sem regressão:
P0=P1=P2=0 e VERDICT=APPROVE.

## Autocorreção

UM GOAL. Achado P0/P1/P2 corrige-se no MESMO GOAL (sem 006B/006-FIX/006C/
006-HARDENING), com regressão do achado, camada afetada reexecutada e nova
R sobre SHA novo. Tentativas oficiais do AEP (teto 3). Parar só por: gate
humano literal, path indispensável fora da allowlist/área protegida,
bloqueio externo real, teto de tentativas.

## Commit, PR, R, merge, Production

Diff conferido contra a base AEP e a allowlist; add por caminhos
explícitos; commit goal(ops-v4-fluxo-curto-006): ...; PR exclusivo contra
main. Sem amend, rebase, force, squash ou bypass; main avançando = merge
normal + revalidação. Merge NORMAL só com check/verify/verify --all,
typecheck, lint, build, T43–T52, E2E, regressões, R APPROVE (P0=P1=P2=0) e
Vercel Preview SUCCESS. Production nos dois projetos (omni-gestao e
omni-gestao-pro) e smoke SOMENTE leitura; sem sessão do proprietário =
PROD_SMOKE=OWNER_PENDING_AUTH (sem pedir senha). REAL_PAYMENT_EXECUTED,
REAL_DELIVERY_EXECUTED, REAL_STOCK_MOVEMENT_PROD e
REAL_FINANCIAL_DATA_CHANGED = NO. OS-2026-00028 intocada.
