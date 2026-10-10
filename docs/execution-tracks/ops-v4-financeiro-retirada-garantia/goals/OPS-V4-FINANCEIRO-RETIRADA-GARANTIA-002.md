<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Recebimento só sobre preço comercialmente elegível e formalização controlada de aprovação pendente",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 6,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-002",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-002",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/elegibilidade-comercial.test.ts lib/operacoes-v3/formalizacao-aprovacao-model.test.ts lib/operacoes-v3/formalizacao-aprovacao-actions.test.ts lib/operacoes-v3/payment-model.test.ts lib/operacoes-v3/pdv-servico-a-prazo.test.ts lib/operacoes-v3/recebimento-misto-model.test.ts lib/operacoes-v3/orcamento-actions.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/atendimento-rapido-model.test.ts lib/operacoes-v3/delivery-financial-guard.test.ts lib/operacoes-v3/os-conta-receber-unica.test.ts lib/operacoes-v4/receber-pagamento-form.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/financeiro-v4.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-00[12]\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts test/ops-v4-fluxo-curto-006/retirada.test.tsx test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx && npx --no-install vitest run --config test/ops-v3-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.config.ts test/ops-datas-retroativas-001/v3-e-correcao.test.tsx && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "lib/operacoes-v3/elegibilidade-comercial.ts",
    "lib/operacoes-v3/elegibilidade-comercial.test.ts",
    "lib/operacoes-v3/formalizacao-aprovacao-model.ts",
    "lib/operacoes-v3/formalizacao-aprovacao-model.test.ts",
    "lib/operacoes-v3/formalizacao-aprovacao-actions.ts",
    "lib/operacoes-v3/formalizacao-aprovacao-actions.test.ts",
    "lib/operacoes-v3/payment-model.ts",
    "lib/operacoes-v3/payment-model.test.ts",
    "lib/operacoes-v3/pdv-servico-actions.ts",
    "lib/operacoes-v3/pdv-servico-a-prazo.test.ts",
    "lib/operacoes-v3/recebimento-misto-service.ts",
    "lib/operacoes-v3/recebimento-misto-model.ts",
    "lib/operacoes-v3/recebimento-misto-model.test.ts",
    "lib/operacoes-v3/orcamento-actions.ts",
    "lib/operacoes-v3/orcamento-actions.test.ts",
    "lib/operacoes-v3/os-conta-receber-unica.test.ts",
    "components/operacoes-v3/pages/PdvServicoV3.tsx",
    "components/operacoes-v3/pages/AtendimentoRapidoV3.tsx",
    "components/operacoes-v3/hooks/use-pdv-servico-v3.ts",
    "lib/operacoes-v4/receber-pagamento-form.ts",
    "lib/operacoes-v4/receber-pagamento-form.test.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.test.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx",
    "components/operacoes-v4-preview/parts/FormalizarAprovacaoV4.tsx",
    "components/operacoes-v4-preview/parts/stages/OrcamentoDecisaoCluster.tsx",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "test/ops-v4-fluxo-curto-006/retirada.test.tsx",
    "test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx",
    "test/ops-v4-recebimento-misto/receber-pagamento.test.tsx",
    "test/ops-v3-recebimento-misto/pdv-servico-misto.test.tsx",
    "test/ops-v3-recebimento-misto/hardening-p1.test.tsx",
    "test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts",
    "test/ops-datas-retroativas-001/v3-e-correcao.test.tsx",
    "test/ops-v4-financeiro-retirada-garantia-001/projecao.pg.test.ts",
    "test/ops-v4-financeiro-retirada-garantia-001/superficies.test.tsx",
    "test/ops-v4-financeiro-retirada-garantia-002/**",
    "e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts",
    "e2e/specs/ops-v4-recebimento-misto-paridade-001.spec.ts",
    "e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts",
    "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 52,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "baixa"
}
-->

# OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 — Recebimento elegível e formalização controlada

## Autoridade e pré-condições

Autorização do proprietário de 08/10/2026 (ver TRACK), incluindo ajustes
estritamente necessários no núcleo OPERACIONAL de aprovação/recebimento.
Classe C4, risco ALTO, reversibilidade baixa (escrita financeira), R de
outra família obrigatória. `gates_liberados` vazio.

Antes do `open`: GOAL 001 DONE e mergeado em main; allowlist ratificada
contra a main integrada (em especial a lista de testes de regressão que
dependem de forma pré-selecionada — ver E). Divergência = plan_rev novo pelo
rito humano.

## Objetivo

Nenhum recebimento novo presume aprovação de orçamento em rascunho; a
aprovação, quando o cliente aprovou, é registrada de forma explícita; e as
OS legadas pagas com aprovação pendente podem ser formalizadas por quem tem
autoridade, sem reescrever o passado.

## Contrato funcional

### A — Critério único de elegibilidade comercial

Novo módulo `lib/operacoes-v3/elegibilidade-comercial.ts` reutiliza
`reconciliarTotaisFinanceirosV3` (a MESMA regra que decide a entrega) —
nenhuma segunda regra de preço. Não basta `totalCobravelV3` devolver zero
nem desabilitar botão.

Recebimento NOVO é recusado no servidor quando a reconciliação comercial é
desconhecida (orçamento real não aprovado: rascunho, enviado, recusado,
expirado) ou inconsistente, com motivo estruturado e destino (código do 001).

Writers mapeados (o executor completa o mapa na leitura e registra no
relatório; caminho não listado que precise mudar = replanejar):

| Fluxo | Writer | Mudança |
| --- | --- | --- |
| Simples/parcial | `receberOSV3` | checa elegibilidade DEPOIS do replay e antes da baixa |
| Misto | `executarRecebimentoMistoOSV3` | idem, depois do replay |
| A prazo | `lancarOSAPrazoV3` | idem (formalizar dívida também presume preço) |
| PDV de Serviço V3 | via `receberOSV3`/misto | mensagem e destino, forma explícita |
| Atendimento rápido | aprova e depois recebe | preservado; prova que continua passando |
| Abertura autorizada (003) | orçamento já nasce aprovado | preservado; prova |
| Sinal/entrada | rótulo `intencao` do mesmo writer | elegível só com preço elegível; não há contrato próprio de sinal na main — o adiantamento 003A (não mergeado) não é inventado aqui |

Elegibilidade não depende de a OS estar pronta (sinal legítimo preservado);
OS cancelada continua recusada como hoje. Estorno não muda.

Replays autenticados de operações já registradas (mesma `operacaoId` e
fingerprint) devolvem o resultado original mesmo que o comercial tenha
mudado depois — a checagem nova vem depois do replay em todos os writers.

Preservar Conta a Receber única, ordem das travas (advisory da OS →
sessão de caixa, quando houver → OS → título), CAS `saldoEsperado`,
idempotência, sessão/terminal,
estornos e a distinção pagamento × dívida × entrega. Motores globais
intocados.

### B — Rascunho sobre OS paga

`gerarOrcamentoDaOS` (wrapper em `orcamento-actions.ts`) recusa materializar
rascunho em OS cujo título já tem pagamento vigente, com mensagem que
orienta à formalização. Sem editar `components/operacoes/lovable/api/os.ts`.

### C — "Aprovar e receber"

Experiência encadeada no recebimento da V4 (e orientação equivalente no PDV
de Serviço V3): mostra escopo, total e forma escolhida; pede consentimento
explícito; chama `aprovarOrcamentoV3` e, só com sucesso, o recebimento —
cada um verificando sua permissão no servidor. Sem permissão de aprovar:
orienta quem pode. Nada marca início de reparo ou entrega implicitamente.

Aprovação ok + recebimento falho → estado "Aprovada — pagamento não
confirmado", sem rollback fictício. Retry reutiliza a mesma `operacaoId` e
reconcilia o resultado incerto (replay/CAS) antes de qualquer nova baixa;
nunca segunda cobrança, título ou OS.

Efeito colateral conhecido de `aprovarOrcamentoV3` (garantia de variante em
best-effort) é exposto no consentimento; mudar esse efeito pertence ao 003.

### D — "Formalizar aprovação pendente"

Ação nova e específica, só porque os caminhos canônicos não atendem com
segurança (`aprovarOrcamentoV3` recusa vencido, grava `valorTotal`, pode
trocar garantia e registra aprovação comum, apagando a ordem real dos fatos).

- Acesso: papel administrador (mapeamento existente
  `enterpriseRoleFromUserRole` = admin) E `operacoes.editarOs`. Nenhuma
  permissão global nova. Sem acesso: negação no servidor com orientação.
- Entrada: `operacaoId`, motivo obrigatório, declaração do responsável,
  referência de evidência (opcional), assinatura do escopo que o operador
  viu (linhas do orçamento, revisão, total em centavos, título, pagamentos
  vigentes) e, se vencido, confirmação específica de ratificação agora.
- Revalidação no servidor, sob as MESMAS travas dos writers de pagamento e
  na mesma ordem: loja, OS, orçamento real em rascunho/enviado, linhas e
  revisão iguais às vistas, título da mesma OS/loja verificável com
  pagamento vigente, totais iguais em centavos (orçamento calculado =
  declarado = título = coluna da OS = `payload.valorTotal` quando houver),
  OS não cancelada, nenhuma mudança concorrente. Valores iguais são
  condição necessária, não prova de autorização.
- Escrita: orçamento passa a aprovado com o instante ATUAL; registro
  `formalizacaoAprovacaoV3` (natureza excepcional, ato atual, motivo,
  declaração, evidência, assinatura do escopo, quem/quando, vencimento
  ratificado ou não); nova versão em `orcamentoVersoesV3` com a natureza; um
  evento de timeline. Não retrodata, não renova validade, não altera preço,
  serviços, garantia, Conta a Receber, Caixa, pagamento, status técnico ou
  entrega. Sem reaprovação destrutiva.
- Divergência de valores ou escopo: recusa e leva à conferência; nunca
  corrige automaticamente.
- Idempotência: mesma `operacaoId` + mesmo conteúdo = resultado original;
  conteúdo diferente = conflito explícito.
- UI no destino comercial (`OrcamentoDecisaoCluster`), visível só quando a
  projeção indica APROVACAO_COMERCIAL_PENDENTE com fatos verificáveis.
- Preparar a ferramenta NÃO autoriza usá-la na OS real; a decisão
  operacional é do proprietário depois da conferência.

### E — Forma de pagamento explícita

Nenhuma forma pré-selecionada nas telas de recebimento (V4 recebimento,
PDV de Serviço V3, Atendimento rápido V3); confirmar sem forma é recusado.
Ausência nunca vira Dinheiro. Testes de regressão que dependiam da
pré-seleção passam a escolher a forma explicitamente, sem remover nenhuma
asserção de valor, identidade ou concorrência (lista na allowlist;
ratificar antes do `open`). Nenhuma correção de forma de lançamento
existente.

## Não objetivos

Corretivo de forma, saneamento em massa, executar formalização em dado real,
garantia por serviço (003), schema, nova permissão, motores globais.

## Matriz de aceite (cenários do comando)

- B1 (7) recebimento novo sobre rascunho/enviado/recusado/expirado: recusa
  no servidor com destino; operação já aprovada e sinal com preço elegível
  preservados; abertura autorizada e atendimento rápido preservados.
- B2 (8) aprovar ok + receber falha; timeout/replay após pagamento; retry
  de operação antiga depois de mudança comercial: nenhuma segunda cobrança,
  título ou OS; replay devolve o original.
- B3 (9) formalização: sem permissão, valores/escopo diferentes, revisão
  mudada, vencido sem confirmação, título de outra OS/loja, dupla
  requisição, concorrência com recebimento/estorno: recusa ou recuperação
  correta, sem reescrever passado.
- B4 (4) forma explícita: sem pré-seleção; ausência recusada; lançamento
  existente intocado.
- B5 rascunho recusado em OS com pagamento vigente.
- B6 (14) troca rápida de OS/loja e resposta tardia no "Aprovar e receber"
  e na formalização.

Unit + montado + PostgreSQL real com concorrência determinística (barreira
+ `pg_stat_activity`) + E2E.

## Regressões obrigatórias

001 desta trilha; OPS-V4-FLUXO-CURTO-003/005/006/007; #234/#238
(`test/ops-v3-recebimento-misto`, incl. PG); #235
(`test/ops-v4-recebimento-misto`, incl. PG); #237 quando a superfície for
alcançada; E2E de recebimento afetados.

## Validação, R e parada

Como no TRACK. R sobre o SHA exato com atenção a dinheiro, travas,
idempotência e permissões. Parar se a mudança exigir caminho protegido,
nova permissão, schema ou alteração em motor global.

## Revisão 3 (09/10/2026)

Somente metadados: `plan_rev` sobe para 3 junto com o desbloqueio do GOAL
001 (nenhum GOAL READY da trilha é SUPERSEDED). Objetivo, contrato,
allowlist, test_command, orçamento e dependência (001 DONE + merge)
inalterados; este GOAL continua NÃO autorizado a abrir antes disso.

## Revisão 4 (09/10/2026)

Somente metadados: `plan_rev` sobe para 4 junto com o desbloqueio do GOAL
001 ("DECISÃO HUMANA — GOAL 001 / REVISÃO 4", restrito ao achado R6;
nenhum GOAL READY da trilha é SUPERSEDED). Objetivo, contrato, allowlist,
test_command, orçamento e dependência (001 DONE + merge) inalterados; este
GOAL continua NÃO autorizado a abrir antes disso.

## Revisão 5 (09/10/2026)

Ratificação pré-`open` exigida em "Autoridade e pré-condições" e no item E,
feita contra a main integrada `23380ab` (GOAL 001 DONE, PR #254), sob a
autorização do proprietário no comando do GOAL 002 de 09/10/2026 ("Se a
allowlist, os contratos ou os testes exigirem uma alteração formal, fazer a
revisão de planejamento pelo rito AEP antes do `open`"). Cinco regressões
fora da allowlist afirmam exatamente o comportamento que este contrato muda;
todas passam hoje na main (`23380ab`: 25 + 10 + 76 testes verdes, com
PostgreSQL):

| Caminho | Comportamento fixado hoje | Item |
| --- | --- | --- |
| `test/ops-v4-financeiro-retirada-garantia-001/projecao.pg.test.ts` | A1 cria o caso legado chamando `receberOSV3` sobre orçamento em rascunho | A |
| `lib/operacoes-v3/os-conta-receber-unica.test.ts` | Prisma em memória sem a coluna `valorTotal` e orçamento aprovado com `total: 0` (reconciliação inconsistente) recebendo | A |
| `test/ops-v4-financeiro-retirada-garantia-001/superficies.test.tsx` | R2-2 confirma sem escolher a forma e espera `pix` | E |
| `test/ops-datas-retroativas-001/v3-e-correcao.test.tsx` | Atendimento rápido V3 finaliza sem escolher a forma | E |
| `e2e/specs/ops-v4-recebimento-misto-paridade-001.spec.ts` | lista exata das opções de "Forma da linha 1", sem a opção vazia que a forma explícita exige | E |

Decisões:

1. Os cinco caminhos entram na allowlist só para adaptar fixture ou entrada ao
   contrato (estado legado semeado sem o writer; dados comercialmente
   consistentes; forma escolhida explicitamente; opção vazia na lista
   esperada), sem remover asserção de valor, identidade, concorrência ou
   efeito.
2. O test_command passa a rodar também `os-conta-receber-unica.test.ts` e
   `v3-e-correcao.test.tsx` (sem banco). `projecao.pg.test.ts` e
   `superficies.test.tsx` já rodam pela config do 001; o E2E de paridade
   segue como evidência obrigatória à parte, no banco próprio.
3. Orçamento de leitura 45 → 50 (os cinco caminhos novos). Objetivo,
   contrato A–E, não objetivos, classe, risco, R obrigatória e dependência
   inalterados.
4. Achado fora do contrato, só relatado ao proprietário e não incluído: o
   atendimento rápido da V4 (`AtendimentoRapidoModal.tsx` +
   `lib/operacoes-v4/atendimento-rapido-form.ts`) continua iniciando a forma
   em Dinheiro; o item E cobre o recebimento da V4, o PDV de Serviço V3 e o
   atendimento rápido V3.

## Revisão 6 (10/10/2026)

Ampliação de allowlist durante a execução (tentativa 1), pelo rito AEP, sob a
mesma autorização do comando do GOAL 002 ("Se a allowlist, os contratos ou os
testes exigirem uma alteração formal, fazer a revisão de planejamento pelo
rito AEP"; "Não ampliar caminhos ou autorizações silenciosamente"). As
regressões obrigatórias, rodadas no candidato contra a base `98ef717`,
revelaram mais dois caminhos fora da allowlist que fixam exatamente o
comportamento que o contrato muda (os demais cenários dos mesmos arquivos
passam no candidato):

| Caminho | Comportamento fixado hoje | Item |
| --- | --- | --- |
| `test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts` (#238, P1-T7, PostgreSQL) | o fixture `faturamentoVigente500` sobe orçamento, faturamento e coluna para 500 mas deixa `payload.valorTotal` em 400; o misto K 350+150 recebe sobre totais divergentes | A |
| `e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts` (E03) | abre o recebimento com caixa fechado e espera, SEM escolher forma, "Abra o caixa para registrar o valor recebido agora." e o botão "Confirmar R$ …" desabilitado — os dois só existem com uma forma imediata escolhida (antes, Dinheiro pré-selecionado) | E |

Decisões:

1. Os dois caminhos entram na allowlist só para adaptar fixture ou entrada ao
   contrato: o P1-T7 grava `valorTotal: 500` junto do faturamento vigente
   (dados comercialmente consistentes; o cenário — título da OS 500, saldo 150,
   lista antiga da tela em 400 — não depende da divergência); o E03 escolhe a
   forma (Dinheiro) explicitamente antes das MESMAS asserções. Nenhuma
   asserção de valor, identidade, concorrência ou efeito é removida.
2. Ambos seguem como evidência obrigatória à parte, nos bancos próprios
   (`ops_v3_misto_qa*`, `ops_v4_fluxo_006_qa*`); test_command inalterado.
   Orçamento de leitura 50 → 52.
3. Objetivo, contrato A–E, não objetivos, classe, risco, R obrigatória e
   dependências inalterados; 002 e 003 sobem para plan_rev 6 (nenhum
   SUPERSEDED). A tentativa 1 do 002 continua: a branch recebe a main e o
   `.aep-active` é recriado (tentativa 1, sem falha registrada) para carregar a
   allowlist nova.
