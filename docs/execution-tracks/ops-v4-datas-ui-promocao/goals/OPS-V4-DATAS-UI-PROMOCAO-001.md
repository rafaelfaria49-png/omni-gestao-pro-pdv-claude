<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-DATAS-UI-PROMOCAO-001",
  "track": "ops-v4-datas-ui-promocao",
  "title": "Promover a implementação existente de edição de datas na Operações V4",
  "status": "READY",
  "plan_rev": 1,
  "class": "C3",
  "risk_tier": "ALTO",
  "revisao_independente": true,
  "familia_executor": "openai",
  "reversibilidade": "alta",
  "branch": "codex/ops-v4-datas-ui-promocao-001",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-datas-ui-promocao-001",
  "test_command": "node node_modules/vitest/vitest.mjs run --config test/ops-v4-datas-ui-001/vitest.config.ts",
  "allowlist": [
    "components/operacoes-v4-preview/parts/CorrigirDatasModalV4.tsx",
    "components/operacoes-v4-preview/parts/atendimento/AtendimentoModalShell.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaSections.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx",
    "components/operacoes-v4-preview/parts/stages/entrada-workspace.module.css",
    "components/operacoes-v4-preview/types.ts",
    "components/operacoes-v4-preview/use-entrada-ocupada.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/painel-inicial/Topbar.tsx",
    "components/painel-inicial/workspace-focus-context.tsx",
    "components/ui/command.tsx",
    "test/ops-v4-datas-ui-001/browser/fixture.tsx",
    "test/ops-v4-datas-ui-001/browser/index.html",
    "test/ops-v4-datas-ui-001/browser/p2-check.mjs",
    "test/ops-v4-datas-ui-001/browser/qa.css",
    "test/ops-v4-datas-ui-001/browser/stubs.ts",
    "test/ops-v4-datas-ui-001/entrada-datas.test.tsx",
    "test/ops-v4-datas-ui-001/vitest.config.ts"
  ],
  "gates_liberados": [],
  "read_budget": 48
}
-->

# OPS V4 Datas UI Promoção 001

Plano documental ratificado em branch isolada por autorização humana específica
de 13/10/2026. GOAL READY, plan_rev 1; o PR de governança ainda depende de
aprovação humana e merge na main. READY não autoriza execução funcional.
Nenhum `open`, merge de produto, `close`, push de produto ou deploy foi autorizado.

## Objetivo e origem imutável

Promover o experimento já implementado em
`C:/Projetos/omni-gestao-ops-v4-datas-ui-001`, branch
`experiment/ops-v4-editar-os-datas-ui-001`, HEAD
`183898ee9fa34f0ae6e8ee4feebdd52eef74b301`.

Reutilizar os quatro commits, sem recriar o resumo ou a interface de datas:

1. `1079da972c329def62c85327ec2cb9cdb8c9434f`;
2. `53696cba5cb4b3afbec2dacb2ca14b865a4c31e8`;
3. `a08b4605283338ec4a2238fd61136ee3aef31324`;
4. `183898ee9fa34f0ae6e8ee4feebdd52eef74b301`.

Base original: `1fd90905e05656444576cf83c9df6c46919a917a`.
Main conferida no planejamento: `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`.
A base de execução será a main vigente, registrada pela CLI no `open`.

## Classificação e limites

C3/ALTO: o diff atravessa os módulos da V4, painel global e UI compartilhada.
Afeta Topbar, CommandDialog, WorkspaceFocusProvider, foco/Escape, overlays,
rascunhos, identidade por loja/OS e escritas assíncronas da Entrada.
R de outra família é obrigatória; preferir `claude-code`/`anthropic`, com
independência de autoria e família efetiva registrada. Codex/OpenAI não
é R independente deste GOAL. Rollback de código por revert normal não
desfaz datas operacionais já corrigidas pelo writer existente.

A allowlist acima reproduz exatamente os **18 caminhos reais** do diff
base → HEAD, com 11 arquivos funcionais e 7 de testes/fixture. Não autoriza
escrita em backend, schema, migrations, financeiro, auth, CI, dependências,
deploy ou governança. Nenhum gate de caminho está liberado.
Se a integração exigir esses caminhos ou nova política de datas/garantia,
parar e replanejar classe/allowlist antes de editar.

## Pré-condições de execução

**GOAL 002 financeiro DONE e mergeado na main é pré-condição para executar `open` da promoção.**
O identificador completo é `OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002`.
Na main conferida, seu último resultado ratificado ainda é BLOCKED;
a presença do 002 como GOAL atual/READY não comprova DONE nem integração.
Até DONE + merge normal na main, esta trilha permanece somente planejada
e não pode iniciar execução funcional, mesmo com este GOAL READY.

- Planejamento ratificado e integrado na main por PR documental próprio;
- GOAL `OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002` DONE e integrado na main;
- ambiente isolado com disco/memória suficientes, sem credenciais de produção;
- checkout limpo no caminho declarado, branch nova baseada na main atual;
- `status` e depois `open` desta trilha, lendo apenas o GOAL indicado.

O caminho proposto de worktree só poderá ser materializado em ambiente
liberado. Alteração de host/caminho exige ratificação dos metadados antes
do `open`. Não criar worktree pesada no computador com disco restrito.

Não alterar branch/worktree/PR #262 do financeiro. Não iniciar GOAL 003,
OPS-V4-FLUXO-CURTO-008, migrations ou evolução financeira por esta trilha.
GOAL 003 não bloqueia o planejamento; se for integrado antes da UI, conferir
compatibilidade das regras de garantia antes da promoção.

## Transporte e reconciliação

Fazer `git merge --no-ff --no-commit
183898ee9fa34f0ae6e8ee4feebdd52eef74b301` na branch de promoção, seguido
de staging por caminhos explícitos e commit
`goal(ops-v4-datas-ui-promocao-001): integrate existing date UI experiment`.
Preservar os quatro SHAs como ancestrais e a main como primeiro pai.
Não usar rebase, cherry-pick, reset, force push, squash, amend ou cópia de
arquivos como substituto desse merge.

Reconciliar `use-v4-preview.ts` exclusivamente aqui, depois do 002 na main.
Preservar o financeiro A–E, a identidade/replay, a pendência de recebimento
e o transporte de `comercial={codigo,destino}` oficialmente integrados.
Preservar a seleção alvo de datas, o bloqueio por rascunho/carga/ocupação,
os wrappers de Entrada, respostas tardias e os corretivos de foco/overlays.
Não resolver tomando o hook inteiro de um dos lados. Conflito fora da
allowlist exige revisão formal antes de qualquer escrita.

Main avançando após o `open`: parar a promoção e planejar merge normal
pelo rito humano; não editar `.aep-active` nem integrar caminhos de
governança fora da allowlist em sessão ativa. A CLI reabre o mesmo GOAL
com a base reconciliada, preservando tentativas. Novo SHA exige nova
validação e nova R.

## Aceite e gates pendentes

Todos os itens abaixo estão **PENDENTES** e bloqueiam ratificação/promoção:

1. Build Next integral do SHA candidato em ambiente suficiente, sem migration.
   Não executar localmente enquanto a restrição crítica de disco persistir.
2. Aplicativo Next integrado: Entrada e menu abrem o editor existente;
   cadastro, entrada física, previsão e entrega mantêm os significados;
   não há outro resumo/editor. Validar também Topbar/paleta e consumidores
   compartilhados, seleção loja/OS, recarga, salvamento, erro e mobile.
3. Regressões dos 333 testes informados pelo proprietário: recuperar o
   inventário/comandos anteriores, reexecutá-los no candidato sem skips e
   registrar contagem final, incluindo testes novos e do 002 integrado.
4. Todos os 20 cenários do runner de navegador existente, sem filtro, mais
   os cenários do aplicativo integrado. Fixture sintética não prova Next/DB.
5. Conferência das regras vigentes de datas/garantia: fuso/precisão,
   limites/ordenação, cadastro distinto da entrada, entrega não inventada,
   motivo/permissão, CAS, auditoria e confirmação do impacto na garantia.
6. R de família independente elegível sobre diff completo, resolução de
   conflitos, logs, hashes e SHA exato: APPROVE e P0=P1=P2=0; P3 registrados.
7. Lint dos alterados, typecheck, diff check, ancestralidade dos quatro
   commits, allowlist exata, `verify`, `verify --all` e `check` aprovados.

`test_command` cobre o teste dedicado, não substitui os gates acima.
O `check` não automatiza todos os gates contratuais. Antes de qualquer
`close`, comprovar explicitamente todos eles e obter a R válida.
Artefatos de teste ficam no runner/CI, com destinos declarados previamente;
nenhum novo arquivo versionado de produto fora da allowlist.

Após todos os gates: `check` → R válida → `close` separado. PR de produto,
push, merge e publicação dependem de autorização futura. Respeitar o
veredito de contexto; não seguir para 003 ou 008.

## Fora do escopo e handoff

Data efetiva por pagamento distinta do registro, Caixa/períodos fechados,
relatórios por data efetiva versus lançamento e identidade/idempotência
de estornos permanecem no roadmap financeiro futuro, em contratos próprios.
Não entram na allowlist, nos gates funcionais ou na implementação deste GOAL.

Contrato de promoção e conferência documental consolidados em:
`docs/ai-execution/_evidence/OPS-V4-DATAS-UI-PROMOCAO-001/RATIFICACAO-GOVERNANCA.md`.
As três fontes em `proposta/` foram lidas na worktree principal e preservadas
sem edição ou inclusão do WIP daquela worktree neste PR. Seus hashes estão no relatório.
