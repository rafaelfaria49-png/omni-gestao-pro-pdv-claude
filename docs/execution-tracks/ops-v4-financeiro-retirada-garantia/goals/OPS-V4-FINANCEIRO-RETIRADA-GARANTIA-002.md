<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Recebimento só sobre preço comercialmente elegível e formalização controlada de aprovação pendente",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 1,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-002",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-002",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/elegibilidade-comercial.test.ts lib/operacoes-v3/formalizacao-aprovacao-model.test.ts lib/operacoes-v3/formalizacao-aprovacao-actions.test.ts lib/operacoes-v3/payment-model.test.ts lib/operacoes-v3/pdv-servico-a-prazo.test.ts lib/operacoes-v3/recebimento-misto-model.test.ts lib/operacoes-v3/orcamento-actions.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/atendimento-rapido-model.test.ts lib/operacoes-v3/delivery-financial-guard.test.ts lib/operacoes-v4/receber-pagamento-form.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/financeiro-v4.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-00[12]\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts && npx --no-install vitest run --config test/ops-v3-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-v3-recebimento-misto/vitest.pg.config.ts && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.pg.config.ts && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts --retries=0 --workers=1",
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
    "test/ops-v4-financeiro-retirada-garantia-002/**",
    "e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts",
    "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 45,
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
