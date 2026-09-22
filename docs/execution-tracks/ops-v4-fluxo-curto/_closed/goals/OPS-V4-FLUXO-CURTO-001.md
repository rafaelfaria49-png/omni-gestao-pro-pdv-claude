<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "OPS-V4-FLUXO-CURTO-001",
  "track": "ops-v4-fluxo-curto",
  "title": "Preenchimento único: criação, leitura e edição coerentes",
  "status": "BLOCKED",
  "class": "C3",
  "risk_tier": "ALTO",
  "plan_rev": 5,
  "branch": "goal/ops-v4-fluxo-curto-001",
  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-001",
  "test_command": "npm run typecheck && npx --no-install vitest run --config test/ops-v4-fluxo-curto/vitest.config.ts && npx --no-install vitest run lib/operacoes-v4/entrada-readback.test.ts lib/operacoes-v4/entrada-readback.integration.test.ts lib/operacoes-v3/prova-entrada-actions.test.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-001.spec.ts",
  "allowlist": [
    "components/operacoes-v4-preview/use-ordens-v4.ts",
    "components/operacoes-v4-preview/use-v4-preview.ts",
    "components/operacoes-v4-preview/parts/NovaOSModal.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaStage.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaSections.tsx",
    "lib/operacoes-v4/entrada-form.ts",
    "lib/operacoes-v4/dados-basicos-form.ts",
    "lib/operacoes-v4/identidade-aparelho.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.ts",
    "lib/operacoes-v3/dados-basicos-model.ts",
    "lib/operacoes-v3/dados-basicos-actions.ts",
    "lib/operacoes-v3/nova-os-model.ts",
    "lib/operacoes-v3/nova-os-actions.ts",
    "components/operacoes-v4-preview/os-adapter.ts",
    "lib/operacoes-v4/entrada-readback.test.ts",
    "e2e/specs/operacoes-v4-fluxo-curto-001.spec.ts",
    "components/operacoes-v4-preview/use-ordens-v4.test.tsx",
    "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.test.tsx",
    "lib/operacoes-v4/entrada-form.test.ts",
    "lib/operacoes-v4/dados-basicos-form.test.ts",
    "lib/operacoes-v4/identidade-aparelho.test.ts",
    "lib/operacoes-v4/nova-os-draft-from-form.test.ts",
    "lib/operacoes-v3/dados-basicos-model.test.ts",
    "lib/operacoes-v3/dados-basicos-actions.test.ts",
    "lib/operacoes-v3/nova-os-model.test.ts",
    "lib/operacoes-v3/nova-os-actions.test.ts",
    "lib/operacoes-v3/prova-entrada-actions.ts",
    "lib/operacoes-v3/prova-entrada-actions.test.ts",
    "lib/operacoes-v3/workspace-actions.ts",
    "lib/operacoes-v3/workspace-actions.test.ts",
    "lib/operacoes-v4/entrada-readback.integration.test.ts",
    "package.json",
    "package-lock.json",
    "test/ops-v4-fluxo-curto/**",
    "components/operacoes-v4-preview/OperacoesV4Preview.tsx",
    "components/operacoes-v4-preview/parts/StagePanel.tsx",
    "components/operacoes-v4-preview/parts/WorkspaceView.tsx",
    "components/operacoes-v4-preview/use-entrada-draft-guard.ts",
    "components/operacoes-v4-preview/use-entrada-draft-guard.test.tsx",
    "lib/loja-ativa.tsx",
    "lib/loja-ativa.test.tsx",
    "docs/roadmaps/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/ops-v4-fluxo-curto/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md",
    "docs/ai-execution/protocol.json"
  ],
  "gates_liberados": [
    "G-AEP-CORE",
    "G-CONFIG-DEPLOY"
  ],
  "read_budget": 45,
  "revisao_independente": true,
  "familia_executor": "meta",
  "reversibilidade": "media"
}
-->

# OPS-V4-FLUXO-CURTO-001 — Preenchimento único: criação, leitura e edição coerentes

**Revisão funcional:** 1, preservada · **Envelope operacional:** 2, preservado como histórico · **Revisão vigente do plano (META plan_rev): 5 — aditivo checklist concorrente-safe (T04), pendente de ratificação/reabertura oficial; R2–R4 preservados como histórico (rev 4: aditivo de 21/09/2026, PR #219).** Fontes R2 (docs/roadmaps/ops-v4-fluxo-curto/ em d2b3142) preservadas como históricas, não reescritas. Derivados (state.json, REGISTRY.md, GATES.md) gerados somente por `node scripts/track.mjs registry`. O estado READY abaixo destina-se à instalação autorizada; não significa que houve implementação ou abertura da trilha nesta entrega.
**Nível técnico:** 4/5 · **Classe formal:** C3 · **Risco:** ALTO · **R:** obrigatório, outra família declarada.
**Dependências:** nenhuma entrega desta trilha; pré-flight/ambiente são internos a este GOAL.
**Achados principais:** V4-02, V4-03, V4-11.
**Orçamento proposto de leitura:** até 45 arquivos pertinentes, além dos entrypoints obrigatórios; ratificar na ativação. Não ampliar escopo para caber nesse número.
**Referência:** 7222c76e95add3d83009d66eeeb865fd8b05e4ec; revalidar delta e contratos na ativação.

## Resultado entregue

Ao criar ou reabrir uma OS, os mesmos dados aparecem no resumo, na edição e nos leitores pertinentes. Completar um campo não apaga outro; uma resposta antiga não muda a OS/loja selecionada. Previsão tem o mesmo significado na criação e na edição.

## Implementação end-to-end

### 1. Preparação incorporada, sem GOAL 000

Confirmar remoto/default/main, SHA, trabalho paralelo e scripts; consultar somente os contratos desta entrega e as regras obrigatórias. Preparar a trilha e o ambiente conforme 02_CONTRATO_COMUM.md. Se a base mudou, revisar apenas o delta relevante. Não encerrar após a auditoria quando o escopo aprovado continuar executável. O registro AEP é organização documental, não uma entrega de produto separada.

### 2. Hidratação correta

Identificar a seleção por storeId + osId, distinguir carregamento, erro, ausência e dado confirmado. Inicializar o editor somente com a OS correta. Incorporar a resposta canônica da criação ou aguardar o detalhe sem oferecer formulário vazio editável. No refresh, atualizar campos não tocados e preservar os alterados; conflito em campo editado exige resolução explícita. Descartar resposta tardia, inclusive quando o usuário remove a seleção ou deixa a loja ativa vazia.

### 3. Gravação parcial e rascunho

Enviar alterações intencionais pelo contrato existente; quando ele grava snapshot amplo, adaptá-lo de forma aditiva e testada para não apagar campos alheios. Vazio não significa exclusão, a menos que o usuário tenha escolhido limpar um campo que possa ser limpo. Preservar campos desconhecidos do payload. Proteger contra atualização concorrente que sobrescreva alterações de outra sessão. Não usar remount por atualizadoEm como solução que apaga rascunhos.

### 4. Identidade e cor

Definir uma leitura efetiva única entre equipamento e prova de entrada. Persistir cor no campo próprio, sem reutilizar condição física. IMEI e serial são distintos; não reinterpretar automaticamente registros ambíguos. Acrescentar compatibilidade de leitura sem reescrever o passado. Não converter qualquer condicaoAparelho legado em cor: exibir o original e pedir confirmação quando a proveniência não for inequívoca.

### 5. Recepção e horário

Preencher atendente pela identidade autenticada existente, mantendo a distinção entre atendente e técnico. Usar rótulo único de prioridade com códigos legados preservados. Normalizar a previsão com fuso da loja pelo utilitário canônico; explicitar fuso, inclusive no fallback operacional aprovado. Preservar a política atual de prazo padrão, mas exibi-la como padrão, não promessa escolhida pelo operador. Prazo textual do serviço não vira SLA automaticamente. Previsão no passado exige aviso/aceite explícito, não correção silenciosa.

### 6. Edição em contexto

Depois da carga correta, resumo + Editar dados da abertura. Ao abrir edição, os campos já vêm preenchidos. Salvar mostra falha recuperável e mantém o rascunho. Sair/trocar OS/loja com edição suja oferece salvar, descartar ou cancelar; não colocar PIN ou dados de cliente em armazenamento local genérico.

## Critérios de aceite específicos

- Criar e abrir imediatamente sob atraso artificial: modelo, relato, atendente, cor, prioridade e previsão são iguais aos informados.
- Editar somente cor ou IMEI não apaga cliente, modelo, relato, garantia, preço, previsão ou campos não editados.
- Refresh não apaga texto digitado; uma gravação remota concorrente não é substituída por seed antigo.
- Trocar A→B, OS1→OS2 ou selecionar nenhuma loja descarta respostas antigas e fecha/reset a edição no contexto correto.
- Previsão escolhida em horário da loja corresponde ao mesmo instante no servidor, em outro navegador e no editor.
- Registro legado ambíguo permanece legível e intacto; nenhum backfill automático é executado.

## Superfícies funcionais do plano de origem

Os caminhos produtivos abaixo são os mesmos da allowlist exata do META. Conferir existência e fronteiras antes de editar. Não autoriza todos os diretórios pais. Reutilizar contratos e testes existentes; não reformatar arquivos fora do trecho necessário.

- `components/operacoes-v4-preview/use-ordens-v4.ts`
- `components/operacoes-v4-preview/use-v4-preview.ts`
- `components/operacoes-v4-preview/parts/NovaOSModal.tsx`
- `components/operacoes-v4-preview/parts/stages/EntradaStage.tsx`
- `components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx`
- `components/operacoes-v4-preview/parts/stages/EntradaSections.tsx`
- `lib/operacoes-v4/entrada-form.ts`
- `lib/operacoes-v4/dados-basicos-form.ts`
- `lib/operacoes-v4/identidade-aparelho.ts`
- `lib/operacoes-v4/nova-os-draft-from-form.ts`
- `lib/operacoes-v3/dados-basicos-model.ts`
- `lib/operacoes-v3/dados-basicos-actions.ts`
- `lib/operacoes-v3/nova-os-model.ts`
- `lib/operacoes-v3/nova-os-actions.ts`
- `components/operacoes-v4-preview/os-adapter.ts`

Arquivos novos propostos (nomes planejados, não alegados como existentes):

- `lib/operacoes-v4/entrada-readback.test.ts`
- `e2e/specs/operacoes-v4-fluxo-curto-001.spec.ts`

Revisão 3 — mantida: `lib/operacoes-v3/prova-entrada-actions.ts`, `lib/operacoes-v3/prova-entrada-actions.test.ts`, `lib/operacoes-v4/entrada-readback.integration.test.ts` (para R01/R02).

Revisão 4 — aditivo exato, somente para T01–T11/R01–R05 (propostos, não alegados existentes; não há obrigação de tocar todos):

- `package.json`
- `package-lock.json`
- `test/ops-v4-fluxo-curto/**`
- `components/operacoes-v4-preview/OperacoesV4Preview.tsx`
- `components/operacoes-v4-preview/parts/StagePanel.tsx`
- `components/operacoes-v4-preview/parts/WorkspaceView.tsx`
- `components/operacoes-v4-preview/use-entrada-draft-guard.ts`
- `components/operacoes-v4-preview/use-entrada-draft-guard.test.tsx`
- `lib/loja-ativa.tsx`
- `lib/loja-ativa.test.tsx`

`lib/loja-ativa.tsx` só pode receber ponte opt-in mínima para salvar/descartar/cancelar troca da loja quando houver edição V4, com teste provando comportamento anterior sem registro; sem alterar ACL, seleção automática, cookies/persistência ou comportamento dos demais módulos. Priorizar integração local já disponível.

Testes adjacentes permitidos constam por caminho exato no META desta revisão. Outros caminhos precisam de revisão explícita do contrato antes de editar. Documentação da própria trilha entra somente no caminho dela. No GOAL 008, correção de código fora da allowlist de testes exige a revisão/gate do contrato de origem; não existe autorização genérica de consertar qualquer coisa.

## Autorizações sensíveis

Autorizar, no comando deste GOAL, os ajustes localizados de DTO/read-back e dados básicos em Operações V3/V4. Não autoriza mudança de auth, schema, máquina comercial, Caixa, Financeiro ou Estoque. O registro inicial da trilha, se necessário, tem permissão separada e restrita conforme o contrato comum.

## Testes e leitura posterior

Casos dedicados: T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11. Ver 04_MATRIZ_ACEITE.md para massa, ação e resultado. Rodar a regressão integrada pertinente conforme o contrato comum, não somente o teste novo.

Casos cobertos nesta entrega:

- T01 — Criação com leitura lenta: Resumo e formulário exibem o mesmo dado; salvar permanece bloqueado enquanto a carga não estiver estabelecida.
- T02 — Edição isolada: Só IMEI muda; nenhum campo não editado é apagado.
- T03 — Refresh durante digitação: Rascunho tocado é preservado; dados remotos não sobrescrevem a digitação.
- T04 — Duas sessões editando: Campos independentes se preservam; conflito no mesmo campo é explícito.
- T05 — Troca rápida de OS/loja: Resposta de A não aparece em B; mutação mantém o alvo autorizado capturado.
- T06 — Sem loja/seleção: Dados antigos não ressurgem; nenhuma escrita é disponibilizada sem alvo.
- T07 — Cor e condição independentes: Cor e nota de condição sobrevivem em campos semanticamente distintos.
- T08 — Legado ambíguo: Não converte texto em cor, não perde nota original e não grava backfill.
- T09 — Horário em outro fuso: Mesmo instante prometido; exibição informa o fuso aplicado.
- T10 — Prazo vencido e padrão: Aviso para data vencida e padrão real explícito; não inventa prazo verde.
- T11 — Falha e saída com rascunho: Erro recuperável; salvar/descartar/cancelar claros; sem falsa persistência.

## Não objetivos

Não aprovar OS, alterar valores, receber, entregar, reclassificar garantias antigas ou redesenhar o workspace inteiro. Busca global de modelos de aparelhos não é dependência.

## Commit, PR, revisão, deploy e rollback

Seguir 02_CONTRATO_COMUM.md integralmente. O comando 00_RETOMAR_GOAL_001.txt inclui a autorização de publicação condicionada para este GOAL quando enviado pelo proprietário. Não executar produção mutante para homologar. Não declarar encerramento técnico por simples sucesso de build; exigir aceite de comportamento. Reversão de código não reverte dados: manter compatibilidade e registrar plano de recuperação.

## Evidência da origem

- [E01](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/components/operacoes-v4-preview/parts/NovaOSModal.tsx) — `components/operacoes-v4-preview/parts/NovaOSModal.tsx`
- [E02](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v4/nova-os-draft-from-form.ts) — `lib/operacoes-v4/nova-os-draft-from-form.ts`
- [E04](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v3/nova-os-actions.ts) — `lib/operacoes-v3/nova-os-actions.ts`
- [E05](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/components/operacoes-v4-preview/parts/stages/EntradaStage.tsx) — `components/operacoes-v4-preview/parts/stages/EntradaStage.tsx`
- [E06](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx) — `components/operacoes-v4-preview/parts/stages/EntradaWorkspace.tsx`
- [E07](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/components/operacoes-v4-preview/parts/stages/EntradaSections.tsx) — `components/operacoes-v4-preview/parts/stages/EntradaSections.tsx`
- [E08](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v4/dados-basicos-form.ts) — `lib/operacoes-v4/dados-basicos-form.ts`
- [E09](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v3/dados-basicos-model.ts) — `lib/operacoes-v3/dados-basicos-model.ts`
- [E10](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v4/entrada-form.ts) — `lib/operacoes-v4/entrada-form.ts`
- [E11](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/lib/operacoes-v4/identidade-aparelho.ts) — `lib/operacoes-v4/identidade-aparelho.ts`
- [E12](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7222c76e95add3d83009d66eeeb865fd8b05e4ec/components/operacoes-v4-preview/use-v4-preview.ts) — `components/operacoes-v4-preview/use-v4-preview.ts`

## Envelope operacional R2 — limites que complementam o META

A família `meta` (executor `muse-spark`, modelo `muse-spark-1.3-contributor-free`, fornecedor declarado Meta MSL) é efetivamente declarada em `docs/ai-execution/executors.json` (entrada `slug: muse-spark`, `familia: meta`, classes C1–C3, `verificado: false`). O valor anterior `muse-spark` identificava o executor do relatório recebido e foi corrigido para a família factual antes do open, sem inventar verificação. A revisão R exige outra família efetivamente identificada e declarada; família não declarada não cumpre R.

A allowlist inclui os arquivos exatos de testes adjacentes aos contratos; isso não afirma que todos já existam e não obriga modificá-los. Não ampliar para seus diretórios pais. A gramática é a lida no parser AEP/1.0-R2 de `scripts/track.mjs` na base 469b3aa2ce9fd2bd35abc10856fea4f4dc8dac16.

A liberação `G-AEP-CORE` é EXCLUSIVAMENTE para cadastrar a entrada `tracks["ops-v4-fluxo-curto"]` se ausente e mantê-la consistente com o TRACK. Todo o resto de protocol.json deve permanecer semanticamente idêntico. Scripts do AEP, algoritmos, gates, limites, hooks e default branch permanecem proibidos. REGISTRY/GATES/state/LEDGER são escritos somente pelo script oficial; não editar derivados à mão. Não alterar dados ou contratos de outras trilhas.

O META inclui a preparação porque o check pode avaliar o diff cumulativo desde a base comum da main. Não esconder o commit de preparação da revisão e não trocar a definição de base do protocolo para fazê-lo passar. Allowlist não dispensa o check 8 (`docs/execution-tracks/*/goals/**` não alterado no diff de produto): a preparação documental permanece visível à revisão e o check 8 continua exigido na base real; não alterar o núcleo para fazê-lo passar.

O test_command é um gate automatizado mínimo e FALHÁVEL: `entrada-readback.test.ts` é um arquivo planejado a ser implementado, não um teste já existente/passado. Não usar `echo`, `--passWithNoTests`, asserts triviais, teste duplicando a implementação ou skips para ratificar. Ele não substitui T01–T11, testes de componente, concorrência no banco isolado, E2E, lint, build seguro e R. A lista de evidências deve distinguir claramente o que cada camada prova.

Antes do código, é permitida somente a vinculação factual de branch/worktree/família/comandos ao ambiente real, sem trocar objetivo, reduzir aceites ou ampliar caminhos produtivos. Se a base vigente usa outro caminho indispensável não autorizado, apresentar a divergência específica. Depois do open, não ampliar allowlist por conta própria.

Nenhum comando destrutivo nem efeito de produção foi autorizado para teste. Usar a OS sintética e guardar os resultados em documentos da própria trilha. Não corrigir garantia, aprovar OS, movimentar estoque ou receber valores no GOAL 001.

## Revisão 4 — aditivo 21/09/2026 (vigente; R2 preservado como histórico)

Fontes R2 (pacote recebido em d2b3142: `00_RETOMAR_GOAL_001.txt`, `02_CONTRATO_COMUM.md`, `04_MATRIZ_ACEITE.md`, `TRACK.md` e GOAL em `docs/roadmaps/ops-v4-fluxo-curto/`) preservadas como históricas, não reescritas. A revisão vigente é a 4 neste arquivo + `TRACK.md` do `execution-tracks` (`plan_rev: 4`). Sem outro GOAL documental. Se o #219 já tiver sido integrado, usar atualização documental vinculada ao mesmo 001; não reescrever o merge. A aprovação de d2b3142 não aprova automaticamente o delta posterior: conferir este aditivo contra a autorização humana e cumprir a revisão exigida sem autodeclarar R.

`G-CONFIG-DEPLOY` liberado EXCLUSIVAMENTE para devDependencies de teste em `package.json` e lockfile correspondente: `jsdom`, `@testing-library/react`, `@testing-library/dom` e `@testing-library/user-event`, somente os necessários e em versões verificadas compatíveis com Node/React/Vitest atuais. Não atualizar engines, React, Next, Prisma ou scripts de build/deploy. Não `npm audit fix`/upgrade geral. `G-AEP-CORE` permanece restrito ao cadastro/registro documental já autorizado, sem mudanças de algoritmos/gates/limites/hooks. Reclassificar para cima se a regra real exigir, nunca reduzir R/risco. Classe C3 e risco ALTO não redutíveis.

Criar configuração específica em `test/ops-v4-fluxo-curto/` com descoberta explícita de `.test.tsx`, ambiente DOM só nesses testes, aliases necessários e runner que falhe se não descobrir/executar casos. Não alterar silenciosamente o include/exclude da suíte global. `test_command` no META atualizado antes do open para o runner real da tarefa (`typecheck` + config específica + readback/integração + Playwright do spec 001); typecheck, montagem, integração e E2E obrigatórios não podem ser omitidos no fechamento. Ambiente ausente deve resultar em bloqueio explícito, não skip convertido em PASS.

Correção documental (sem alterar escopo rev 4): `familia_executor` corrigida de `muse-spark` para `meta`, família factual do executor Muse Spark (Meta MSL) efetivamente declarada via entrada `muse-spark/meta` em `executors.json` (tabela substituível, fora do núcleo; `verificado: false`, sem inventar verificação). Classe C3, risco ALTO e R obrigatória preservados; allowlist, `test_command` e gates da rev 4 inalterados.

## Revisão 5 — aditivo checklist concorrente-safe T04 (pendente de ratificação/reabertura oficial)

Objetivo exclusivo: tornar `salvarChecklistEntradaV3` concorrente-safe com a mesma disciplina dos demais write-paths (releitura no LATEST + `updateMany` condicionado a `updatedAt` + `CONFLITO_CONCORRENCIA` explícito), sem alterar `salvarDiagnosticoV3`, `salvarSenhaAcessoriosV3` ou outros motores. Bloqueio conhecido: snapshot amplo + `update` cego em `lib/operacoes-v3/workspace-actions.ts` pode clobber gravação concorrente de outra seção (aceite T04).

Caminhos adicionados à allowlist, somente estes (sem ampliar para `lib/operacoes-v3/**`):

- `lib/operacoes-v3/workspace-actions.ts`
- `lib/operacoes-v3/workspace-actions.test.ts` (regressão específica da disciplina; arquivo ainda inexistente — a allowlist não alega existência, só autoriza o caminho)

Todo o resto da rev 4 preservado: allowlist, `test_command`, gates (`G-AEP-CORE`, `G-CONFIG-DEPLOY`), classe C3, risco ALTO, R obrigatória, `read_budget`, `revisao_independente`, `familia_executor`, `reversibilidade`. Sem GOAL 002. Implementar o corretivo somente após ratificação/reabertura oficial.
