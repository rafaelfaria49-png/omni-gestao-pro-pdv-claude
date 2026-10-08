<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Garantia por serviço, termo versionado na entrega e edição auditada",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 1,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-003",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-003",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/garantia-servicos-model.test.ts lib/operacoes-v3/garantia-textos.test.ts lib/operacoes-v3/garantia-templates.test.ts lib/operacoes-v3/garantia-actions.test.ts lib/operacoes-v3/entrega-actions.test.ts lib/operacoes-v3/pos-venda-model.test.ts lib/operacoes-v3/print-model.test.ts lib/operacoes-v3/datas-correcao-model.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/orcamento-actions.test.ts lib/operacoes-v3/nova-os-actions.test.ts lib/operacoes-v3/nova-os-model.test.ts lib/operacoes-v3/retorno-actions.test.ts lib/operacoes-v3/historico-aparelho-model.test.ts lib/operacoes-v4/nova-os-draft-from-form.test.ts lib/operacoes-v4/posvenda-v4.test.ts lib/operacoes-v4/documento-mensagem.test.ts lib/operacoes-v4/historico-v4.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/retirada-fluxo-v4.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[2567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-00[123]\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-003/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-007/vitest.config.ts && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.config.ts && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.pg.config.ts && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-003.spec.ts --retries=0 --workers=1",
  "allowlist": [
    "lib/operacoes-v3/garantia-servicos-model.ts",
    "lib/operacoes-v3/garantia-servicos-model.test.ts",
    "lib/operacoes-v3/garantia-textos.ts",
    "lib/operacoes-v3/garantia-textos.test.ts",
    "lib/operacoes-v3/garantia-templates.ts",
    "lib/operacoes-v3/garantia-templates.test.ts",
    "lib/operacoes-v3/garantia-actions.ts",
    "lib/operacoes-v3/garantia-actions.test.ts",
    "lib/operacoes-v3/entrega-actions.ts",
    "lib/operacoes-v3/entrega-actions.test.ts",
    "lib/operacoes-v3/pos-venda-model.ts",
    "lib/operacoes-v3/pos-venda-model.test.ts",
    "lib/operacoes-v3/print-model.ts",
    "lib/operacoes-v3/print-model.test.ts",
    "lib/operacoes-v3/datas-correcao-model.ts",
    "lib/operacoes-v3/datas-correcao-model.test.ts",
    "lib/operacoes-v3/datas-correcao-actions.ts",
    "lib/operacoes-v3/orcamento-model.ts",
    "lib/operacoes-v3/orcamento-model.test.ts",
    "lib/operacoes-v3/orcamento-actions.ts",
    "lib/operacoes-v3/orcamento-actions.test.ts",
    "lib/operacoes-v3/nova-os-actions.ts",
    "lib/operacoes-v3/nova-os-actions.test.ts",
    "lib/operacoes-v3/retorno-actions.ts",
    "lib/operacoes-v3/retorno-actions.test.ts",
    "lib/operacoes-v3/historico-aparelho-model.ts",
    "lib/operacoes-v3/historico-aparelho-model.test.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.test.ts",
    "lib/operacoes-v4/posvenda-v4.ts",
    "lib/operacoes-v4/posvenda-v4.test.ts",
    "lib/operacoes-v4/documento-mensagem.ts",
    "lib/operacoes-v4/documento-mensagem.test.ts",
    "lib/operacoes-v4/historico-v4.ts",
    "lib/operacoes-v4/historico-v4.test.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.ts",
    "lib/operacoes-v4/situacao-atendimento-v4.test.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/os-adapter.ts",
    "components/operacoes-v4-preview/parts/DocPrintModal.tsx",
    "components/operacoes-v4-preview/parts/stages/EntregaStage.tsx",
    "components/operacoes-v4-preview/parts/stages/PosVendaStage.tsx",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "components/operacoes-v3/components/GarantiaOSV3.tsx",
    "components/operacoes-v3/components/PosVendaV3.tsx",
    "components/operacoes-v3/components/print/PrintPreviewV3.tsx",
    "test/ops-v4-financeiro-retirada-garantia-003/**",
    "e2e/specs/ops-v4-financeiro-retirada-garantia-003.spec.ts",
    "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 55,
  "revisao_independente": true,
  "familia_executor": "anthropic",
  "reversibilidade": "baixa"
}
-->

# OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003 — Garantia por serviço e termo versionado

## Autoridade e pré-condições

Autorização do proprietário de 08/10/2026 (ver TRACK), incluindo ajustes
estritamente necessários no núcleo OPERACIONAL de garantia e entrega. Classe
C4, risco ALTO, reversibilidade baixa (documento contratual emitido), R de
outra família obrigatória. `gates_liberados` vazio.

Não reabre o OPS-V4-FLUXO-CURTO-002: multi-garantia foi excluída daquele
contrato e é evolução nova aqui. Os critérios G01–G08/D01–D06 do 002
continuam regressão obrigatória para OS de serviço único.

Antes do `open`: GOAL 002 DONE e mergeado em main; ratificar a allowlist
contra a main integrada, em especial os consumidores de `lerGarantiaV3`
(o 007 passa a gravar a situação da garantia no retorno). Consumidor que
precise mudar e não esteja listado = plan_rev novo antes do `open`.

## Objetivo

O atendente sabe qual garantia vale para cada serviço do aparelho, altera o
prazo só com autoridade e motivo, e o cliente leva um termo que continua o
mesmo na reimpressão.

## Contrato funcional

### A — Garantia por serviço

- Coberturas derivadas dos serviços/variantes APROVADOS, chaveadas pelo id
  real da linha (duas linhas do mesmo catálogo são duas coberturas; opção
  não selecionada não gera cobertura; reordenar não muda identidade).
- Modelo vem do serviço; "Troca de Tela" mantém o nome. Tela, conector e
  bateria: 90 dias (padrão já estabelecido). Outros serviços preservam seus
  padrões válidos (ex.: software 30, sem cobertura 0); nada é forçado a 90.
- Texto livre só SUGERE modelo (`sugerirGarantiaPorDescricaoV3`); não muda
  cobertura sem confirmação.
- Prazos e condições iguais: resumo compacto. Diferentes: por serviço, sem
  escolher primeiro, maior ou menor, sem descartar linha.
- Persistência aditiva em payload JSON (sem schema): coberturas por serviço
  ao lado de `aberturaV3.garantiaPrevista`, que segue gravado para leitores
  antigos apenas quando há uma condição única; com condições distintas os
  leitores (lista na allowlist) passam a ler as coberturas e nunca
  normalizam um marcador desconhecido para "personalizado 90".
- `lerGarantiaV3` mantém o contrato para OS de serviço único e expõe as
  coberturas; situação agregada nunca promete cobertura de retorno só por
  estar no prazo.
- Nenhuma cobrança nova por criar garantia; retorno não renova garantia.

### B — Edição e permissões

- Confirmar o modelo/prazo padrão: permissão de edição atual.
- Alterar o padrão (modelo ou prazo): permissão existente
  `operacoes.garantia` + motivo. Registrar antes/depois, operador, instante
  e origem. Negação testada no servidor. Nenhum papel ou permissão nova.
- Dias: inteiro positivo; preservar limites técnicos existentes; nenhum teto
  comercial inventado (180/365). Extensão autorizada permitida.
- Mudança de cobertura/condições após emissão não é edição de número: é
  aditivo (D).
- Efeito best-effort de garantia na aprovação de variante
  (`garantiaResultanteAprovacaoV3`) passa a respeitar as coberturas por
  serviço, sem sobrescrever outras linhas.

### C — Modelos e texto

Confrontar `garantia-textos.ts`, `garantia-templates.ts` e consumidores
antes de unificar. Uma fonte canônica com camada de compatibilidade; os
leitores V3 continuam funcionando; nenhum termo antigo é substituído em
massa. Cobertura, condições aplicáveis, cuidados e procedimento organizados
a partir dos textos já aprovados; sem novas exclusões jurídicas, promessas
de prazo ou "sem garantia" genérico. Redação nova fica marcada como
pendente de revisão jurídica e não é publicada como definitiva.

### D — Versões e emissão

- Na entrega efetivamente confirmada (`registrarEntregaV3`), na MESMA
  escrita do registro de entrega: snapshot versionado (versão 1) das
  coberturas por serviço e do conteúdo emitido — empresa (lida no servidor,
  campos ausentes como "não informado"), OS, cliente/aparelho (sem senha),
  serviços, prazos, condições, início/vencimento, instruções de atendimento
  e origem do texto. Sem custo, lucro, observações internas ou
  aceite/assinatura inexistente.
- Falha ao gerar/abrir o documento depois da entrega: recuperável só na
  emissão (reabre a partir da versão), sem nova entrega, estoque ou custo.
- Reimpressão lê a versão emitida; nunca recalcula com catálogo, prazo ou
  dados de empresa atuais.
- Alteração autorizada pós-emissão: aditivo versionado e auditado (v2…),
  preservando a versão original e seu marco.
- Correção de data de entrega (#237): mantém impedimentos e confirmação de
  impacto existentes; com versão emitida, a correção gera versão nova de
  correção de data na mesma escrita, preservando a anterior.
- Legado sem snapshot: limitação identificada na tela; registro existente
  preservado; reemissão explícita (permissão + motivo) cria versão marcada
  como reemissão, nunca como original. Sem backfill em massa.
- Fluxo de impressão atual reaproveitado; sem novo motor de PDF.

## Não objetivos

Nova política comercial de garantia, CRM/NPS/WhatsApp automático,
backfill, schema, nova permissão, Fiscal, alterar elegibilidade financeira.

## Matriz de aceite (cenários do comando)

- C1 (10) duas coberturas, inclusive duas linhas do mesmo catálogo, prazos
  distintos, reordenação e opção não selecionada: nenhum achatamento.
- C2 (11) 90→180 com `operacoes.garantia` + motivo registra antes/depois;
  sem permissão: negado no servidor.
- C3 (12) entrega emite v1; reimpressão após mudança de catálogo/empresa
  mostra v1; aditivo cria v2 preservando v1; correção de data gera versão;
  legado sem snapshot exibe limitação e reemissão marcada.
- C4 (13) falha de documento após entrega: retry não repete entrega,
  estoque ou custo.
- C5 (14) troca rápida de OS/loja e resposta tardia na garantia e no termo.
- C6 (15) impressão sobre modal, Tab/Shift+Tab/Escape, 1440/768/390.
- C7 regressão 002 (serviço único) idêntica.

Unit + montado + PostgreSQL real (entrega + emissão na mesma escrita,
concorrência entrega × edição de garantia, correção de data) + E2E.

## Regressões obrigatórias

001 e 002 desta trilha; OPS-V4-FLUXO-CURTO-002/006/007; #237
(`test/ops-datas-retroativas-001`, incl. PG); #234/#235/#238 quando a
entrega/recebimento for alcançada.

## Validação, R e parada

Como no TRACK. R sobre o SHA exato com atenção a documento contratual,
versões, permissões e entrega. Parar se exigir schema, permissão nova,
caminho protegido ou redação jurídica não validada.
