<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Informação financeira verdadeira e retirada organizada, com decisões de recebimento e entrega inalteradas",
  "status": "BLOCKED",
  "class": "C4",
  "risk_tier": "ALTO",
  "plan_rev": 2,
  "branch": "goal/ops-v4-financeiro-retirada-garantia-001",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-frg-001",
  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v3/delivery-financial-guard.test.ts lib/operacoes-v4/financial-projection.test.ts lib/operacoes-v4/financial-projection-actions.test.ts lib/operacoes-v4/situacao-atendimento-v4.test.ts lib/operacoes-v4/financeiro-v4.test.ts lib/operacoes-v4/retirada-fluxo-v4.test.ts lib/operacoes-v4/proxima-acao-v4.test.ts lib/operacoes-v4/os-header-transversal.test.ts lib/operacoes-v4/recibo-persistido-v4.test.ts lib/operacoes-v4/pipeline-operacional.test.ts components/operacoes-v4-preview/status-authority.test.ts components/operacoes-v4-preview/focus-workspace.test.ts && npx --no-install vitest run components/operacoes-v4-preview/preview-honesty.test.ts -t \"OPS-V4-FLUXO-CURTO-00[567]|OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001\" && npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-005/vitest.config.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-006/vitest.config.ts test/ops-v4-fluxo-curto-006/retirada.test.tsx test/ops-v4-fluxo-curto-006/fluxo-hook.test.tsx && npx --no-install vitest run --config test/ops-v4-fluxo-curto-007/vitest.config.ts test/ops-v4-fluxo-curto-007/retorno.test.tsx && npx --no-install vitest run --config test/ops-v4-recebimento-misto/vitest.config.ts && npx playwright test e2e/specs/ops-v4-financeiro-retirada-garantia-001.spec.ts --retries=0 --workers=1",
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
    "components/operacoes-v4-preview/parts/CommandHeader.tsx",
    "components/operacoes-v4-preview/parts/ProximaAcaoV4.tsx",
    "components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx",
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

## Validação, R e parada

typecheck, ESLint nos alterados, build seguro (sem tocar banco real),
`git diff --check`, `verify`, `verify --all`, `check`. R OpenAI/Codex
read-only sobre o SHA exato. Autocorreção no MESMO GOAL (teto 3). Parar em:
dependência, caminho fora da allowlist, gate, ausência de prova ou de R.
Ao fechar: obedecer o veredito de contexto; o 002 só abre com 001 DONE e
mergeado.
