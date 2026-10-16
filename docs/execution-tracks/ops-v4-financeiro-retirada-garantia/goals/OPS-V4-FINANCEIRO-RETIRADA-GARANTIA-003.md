<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Garantia por serviço, termo versionado na entrega e edição auditada",
  "status": "READY",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 10,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-003",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-003",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/garantia-servicos-model.test.ts lib/operacoes-v3/garantia-textos.test.ts lib/operacoes-v3/garantia-templates.test.ts lib/operacoes-v3/garantia-actions.test.ts lib/operacoes-v3/entrega-actions.test.ts lib/operacoes-v3/pos-venda-model.test.ts lib/operacoes-v3/print-model.test.ts lib/operacoes-v3/datas-correcao-model.test.ts lib/operacoes-v3/orcamento-model.test.ts lib/operacoes-v3/orcamento-actions.test.ts lib/operacoes-v3/nova-os-actions.test.ts lib/operacoes-v3/nova-os-model.test.ts lib/operacoes-v3/retorno-actions.test.ts lib/operacoes-v3/historico-aparelho-model.test.ts lib/operacoes-v4/nova-os-draft-from-form.test.ts lib/operacoes-v4/posvenda-v4.test.ts lib/operacoes-v4/documento-mensagem.test.ts lib/operacoes-v4/historico-v4.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/retirada-fluxo-v4.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[2567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-00[123]\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-003/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts test/ops-v4-fluxo-curto-006/retirada.test.tsx test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx && npx --no-install vitest run --config test/ops-v4-fluxo-curto-007/vitest.config.ts test/ops-v4-fluxo-curto-007/retorno.test.tsx && npx --no-install vitest run --config test/ops-datas-retroativas-001/vitest.config.ts && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-003.spec.ts --retries=0 --workers=1",
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
    "components/operacoes-v4-preview/parts/stages/retirada-v4.module.css",
    "components/operacoes-v4-preview/parts/stages/PosVendaStage.tsx",
    "components/operacoes-v4-preview/preview-honesty.test.ts",
    "components/operacoes-v3/components/GarantiaOSV3.tsx",
    "components/operacoes-v3/components/PosVendaV3.tsx",
    "components/operacoes-v3/components/print/PrintPreviewV3.tsx",
    "test/ops-v4-financeiro-retirada-garantia-003/**",
    "e2e/specs/ops-v4-financeiro-retirada-garantia-003.spec.ts",
    "e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts",
    "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/**",
    "docs/execution-tracks/REGISTRY.md",
    "app/actions/operacoes.ts",
    "components/operacoes-v3/components/CorrigirDatasV3.tsx",
    "components/operacoes-v3/components/GarantiaEditorV3.tsx",
    "components/operacoes-v3/components/print/TermoGarantiaDocV3.tsx",
    "components/operacoes-v3/hooks/use-garantia-v3.ts",
    "components/operacoes-v4-preview/parts/NovaOSModal.tsx",
    "e2e/ops-v4-garantias-auth.setup.ts",
    "lib/operacoes-v3/garantia-abertura-server.ts",
    "lib/operacoes-v3/garantia-catalogo.ts",
    "lib/operacoes-v3/garantia-empresa-server.ts",
    "lib/operacoes-v3/garantia-termos-model.ts",
    "lib/operacoes-v3/nova-os-model.ts",
    "lib/operacoes-v3/os-payload-import.test.ts",
    "lib/operacoes-v3/os-payload-lock.ts",
    "lib/operacoes-v4/servicos-autorizados-form.ts",
    "lib/operacoes/services/orcamento-builder.ts",
    "test/ops-v4-fluxo-curto-002/garantia-ui.test.tsx",
    "test/ops-v4-fluxo-curto-007/retorno.test.tsx",
    "test/ops-v4-fluxo-curto-007/retorno.pg.test.ts"
  ],
  "gates_liberados": [],
  "read_budget": 75,
  "revisao_independente": true,
  "familia_executor": "openai",
  "reversibilidade": "baixa"
}
-->

# OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003 — Garantia por serviço e termo versionado

## Autoridade e pré-condições

Autorização do proprietário de 08/10/2026 (ver TRACK), incluindo ajustes
estritamente necessários no núcleo OPERACIONAL de garantia e entrega. Classe
C4, risco ALTO, reversibilidade baixa (documento contratual emitido), R de
outra família obrigatória. `gates_liberados` vazio.

Regularização documental autorizada pelo proprietário em 15/10/2026, no
comando "CODEX — FINALIZAR E PUBLICAR OPERAÇÕES V4": "autorizo
excepcionalmente Codex/OpenAI como executor real C4/ALTO". A implementação
experimental reaproveitada, em `fd42b06648ad2abb217bdd7fb5f3bc7b9dec3030`
(`codex/experiment-ops-v4-garantias`), foi executada por Codex/OpenAI;
`familia_executor: openai` registra essa autoria real, sem atribuí-la a
Anthropic. A autorização cobre sua adoção e a execução oficial por
Codex/OpenAI, excepcionalmente em C4/ALTO. Claude Code/Anthropic atua
somente como revisor independente do SHA final, sem implementar ou alterar
o código avaliado.

Esta correção não abre nem fecha o GOAL, não ratifica a execução
experimental como execução AEP anterior e não concede aprovação de R.
Classe, risco, plan_rev, testes, ledger, tentativas, gates e revisão
independente obrigatória permanecem preservados; `executors.json` não é
alterado. O `open` continua condicionado ao 002 DONE e integrado em main.

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

### E — Editor de garantia recolhido (transferido do GOAL 001 na rev 3)

Obrigação OBRIGATÓRIA desta entrega (item G do 001, aceite visual diferido
pelo proprietário em 09/10/2026, decisão A):
- Na Entrega antes da retirada, o editor de garantia deixa de ficar sempre
  aberto: o resumo lateral mostra a garantia vigente e as ações "Ver
  condições" e "Alterar prazo" abrem o detalhamento/edição existente. Nada
  que o contrato exige antes da entrega fica escondido; capacidades,
  permissões (B), auditoria e endpoints preservados.
- `e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts` é adaptado SOMENTE quando
  essa experiência estiver efetivamente implementada, e apenas no caminho de
  chegada ao editor (abrir "Alterar prazo" antes de interagir). Os critérios
  G01–G08/D01–D06 do OPS-V4-FLUXO-CURTO-002 continuam asseridos com a mesma
  força; nenhuma asserção removida ou afrouxada, sem skip/fixme; roda com
  `--retries=0` como regressão obrigatória deste GOAL.
- Até este GOAL ser executado, o editor atual e esse E2E permanecem como
  estão na main.

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
- C8 (rev 3, item E) editor recolhido atrás de "Ver condições"/"Alterar
  prazo" na Entrega; E2E do OPS-V4-FLUXO-CURTO-002 adaptado só no caminho de
  chegada, com as mesmas asserções, `--retries=0`.

Unit + montado + PostgreSQL real (entrega + emissão na mesma escrita,
concorrência entrega × edição de garantia, correção de data) + E2E.

## Regressões obrigatórias

001 e 002 desta trilha; OPS-V4-FLUXO-CURTO-002/006/007 (incl. o E2E
`operacoes-v4-fluxo-curto-002.spec.ts` adaptado pelo item E); #237
(`test/ops-datas-retroativas-001`, incl. PG); #234/#235/#238 quando a
entrega/recebimento for alcançada.

## Validação, R e parada

Como no TRACK. R sobre o SHA exato com atenção a documento contratual,
versões, permissões e entrega. Parar se exigir schema, permissão nova,
caminho protegido ou redação jurídica não validada.

## Revisão 3 (09/10/2026)

Desbloqueio do GOAL 001 na rev 3 ("COMANDO — GOAL 001 / REV 3"): este GOAL
recebe o item E (editor de garantia recolhido, transferido do item G do 001)
e, só para ele, dois caminhos na allowlist —
`components/operacoes-v4-preview/parts/stages/retirada-v4.module.css`
(estilo do resumo recolhido na Entrega) e
`e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts` (adaptação da regressão
antiga quando a experiência existir). Demais objetivos, contrato,
test_command, orçamento e dependência (002 DONE + merge) inalterados; este
GOAL continua NÃO autorizado a abrir antes disso.

## Revisão 4 (09/10/2026)

Somente metadados: `plan_rev` sobe para 4 junto com o desbloqueio do GOAL
001 ("DECISÃO HUMANA — GOAL 001 / REVISÃO 4", restrito ao achado R6;
nenhum GOAL READY da trilha é SUPERSEDED). Objetivo, contrato (incluindo o
item E da rev 3), allowlist, test_command, orçamento e dependência (002
DONE + merge) inalterados; este GOAL continua NÃO autorizado a abrir antes
disso.

## Revisão 5 (09/10/2026)

Somente metadados: `plan_rev` sobe para 5 junto com a ratificação pré-`open`
do GOAL 002 (allowlist, test_command e orçamento de leitura do 002; nenhum
GOAL READY da trilha é SUPERSEDED). Objetivo, contrato (incluindo o item E
da rev 3), allowlist, test_command, orçamento e dependência (002 DONE +
merge) inalterados; este GOAL continua NÃO autorizado a abrir antes disso.

## Revisão 6 (10/10/2026)

Somente metadados: `plan_rev` sobe para 6 junto com a ampliação de allowlist
do GOAL 002 durante a execução (P1-T7 de #238 e E03 do E2E do
OPS-V4-FLUXO-CURTO-006; nenhum GOAL READY da trilha é SUPERSEDED). Objetivo,
contrato (incluindo o item E da rev 3), allowlist, test_command, orçamento e
dependência (002 DONE + merge) inalterados; este GOAL continua NÃO autorizado
a abrir antes disso.

## Revisão 9 — ratificação pré-open da entrega existente (16/10/2026)

O GOAL 002 foi fechado oficialmente em `9dbae6d9744d0539ad07b59fbd4bdc97c5351d2a`
e integrado por merge normal do PR #262 na main
`c4f4bb6c187ad1637623299a1a80470f63080e6d`. Esta ratificação técnica
cumpre a pré-condição documental acima antes de qualquer `open` do 003,
sob os comandos do proprietário para reaproveitar integralmente a
implementação já aprovada, regularizar sua autoria e publicar #262 → #271 → #272.
Não representa um novo aceite humano específico de caminhos nem um parecer R.

Os 17 caminhos explícitos adicionados à allowlist já pertencem ao diff
experimental de Garantias aprovado no candidato integrado
`6cbf01fa43cc2183a4a45c543f97c3fc13784186`; ratificam consumidores,
identidade de linha, emissão, editor e regressão necessários ao contrato A–E.
Nenhum deles libera schema, migrations, auth, CI, dependências ou outro
caminho protegido. O orçamento sobe de 55 para 75 arquivos para cobrir
o diff real e seus consumidores. Não se reimplementa funcionalidade.

C4/ALTO, executor real OpenAI, revisão independente Anthropic obrigatória,
contrato funcional, test_command, gates, estado, ledger, tentativas e
`executors.json` são preservados. Esta revisão documental não abre, fecha
nem aprova o GOAL; sua integração exige PR documental e merge normal
com verificações aprovadas. Datas #271 será integrado antes de Garantias #272.

## Proposta rev 10 — exceção restrita para duas regressões (16/10/2026)

PENDENTE DE AUTORIZAÇÃO HUMANA — proposta não ratificada. Não amplia o escopo
ativo, não autoriza edição dos testes, close, merge de produto ou publicação.

A validação obrigatória do candidato `607c19a65fe7061d90c0071cbc0b6ad86c1b38a7`
reproduziu duas falhas de infraestrutura/expectativa também na base da main:
- F3b: a paleta agora restaura o foco a um controle legítimo do launcher; o
  Enter da fixture escolhe uma modalidade antes da asserção de Tab. A proposta
  conserva a verificação de foco sem alcançar o fundo e exercita Enter na raiz
  focável do diálogo antes de Tab/Shift+Tab, sem ativar uma modalidade.
- T56c: iniciar a action após `setTimeout(0)` não prova que a sessão externa
  já adquiriu `FOR UPDATE`. A proposta sinaliza uma Promise imediatamente após
  essa aquisição e aguarda a barreira, preservando a observação da disputa por
  `pg_stat_activity`, a recusa original e a asserção de zero filhas.

Somente os dois caminhos explícitos acima são propostos para a allowlist.
Nenhuma asserção, cenário, guard de banco ou comando de teste é removido.
Nenhum contrato funcional, família, C4/ALTO, gate, orçamento, dependência,
estado, ledger ou executor é modificado; não se reabre outro GOAL.

Se o proprietário autorizar expressamente a exceção ao escopo ativo, registrar
o aceite real neste PR antes de seu merge normal, com verify/verify --all e
checks aprovados. Somente depois atualizar as duas entradas da allowlist de
`.aep-active` conforme o plano ratificado, preservando tentativa 2/3, a falha
da tentativa 1, opened_at, base_commit e demais campos. Não bloquear/reabrir
para reiniciar o contador. R Anthropic real do candidato final continua
obrigatória antes do close e merge #272. Sem autorização, manter este PR draft.
