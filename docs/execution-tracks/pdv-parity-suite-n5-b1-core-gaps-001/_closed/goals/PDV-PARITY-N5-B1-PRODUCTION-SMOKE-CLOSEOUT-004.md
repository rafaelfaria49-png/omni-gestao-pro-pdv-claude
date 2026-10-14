<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004",
  "track": "pdv-parity-suite-n5-b1-core-gaps-001",
  "title": "N5-B1: smoke autenticado não destrutivo nas duas produções e encerramento operacional",
  "status": "BLOCKED",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-n5b1-production-smoke-closeout-004",
  "worktree": "C:/Projetos/omni-gestao-pdv-n5b1-production-smoke-004",
  "test_command": "node scripts/track.mjs verify --all",
  "allowlist": [
    "docs/pdv/PDV_N5_B1_PRODUCTION_SMOKE_CLOSEOUT_004.md",
    "docs/ai-execution/_evidence/PDV-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004.md",
    "docs/ai-execution/_evidence/PDV_N5_B1_PRODUCTION_SMOKE_CLOSEOUT_004/**"
  ],
  "gates_liberados": [],
  "read_budget": 80,
  "plan_ref": "Autorização humana PDV-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004-PLAN (2026-10-13)",
  "plan_rev": 4,
  "base_commit": "1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d",
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "alta",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-PARITY-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004

Planejamento C3, risco ALTO. Executor futuro: Codex / família `openai`.
Revisão independente R obrigatória, por executor de outra família declarada
em `docs/ai-execution/executors.json`. A revisão ainda não foi realizada.

Este GOAL autoriza somente smoke autenticado, não destrutivo, e documentação
do encerramento operacional N5-B1. Nenhuma alteração produtiva está autorizada.
O status READY representa planejamento; execução somente em sessão futura,
após o merge humano do PR deste plano. GOALs 001, 002 e 003 seguem DONE e imutáveis.

## Proveniência e pré-flight do planejamento

- Autorização: `PDV-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004-PLAN`, 13/10/2026.
- [PR #248](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/248)
  integrado por merge normal: `9b0a0e81f4030c1d3df2592d48021d8206f229af`.
- Main informada pelo humano: `1fd90905e05656444576cf83c9df6c46919a917a`.
- `git fetch origin main` concluído; main corrente observada:
  `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`.
- `git merge-base --is-ancestor 9b0a0e81f4030c1d3df2592d48021d8206f229af origin/main`
  retornou exit 0. Metadados GitHub confirmam PR #248 merged e o mesmo merge SHA.
- `status` na worktree do plano: trilha PAUSED, três GOALs DONE, nenhum READY,
  nenhum GOAL aberto. Sem sessão AEP ativa nesta trilha nas worktrees registradas
  ou alteração pendente da trilha nas worktrees PDV existentes.
- `verify --all` antes das alterações: PASS, dez trilhas e derivados coerentes.
- Os dois projetos Vercel READY são contexto declarado pelo humano; nenhum deploy,
  login ou browser de produção foi inspecionado nesta sessão de planejamento.

O SHA do planejamento é proveniência, não uma ordem para usar main antiga.
Na execução futura, fazer novo fetch, confirmar a ancestralidade do merge #248
e partir exclusivamente da `origin/main` corrente já contendo este plano.
Confirmar que 004 é o único GOAL elegível e que não existe sessão ativa ou
trabalho paralelo conflitante na trilha. Em conflito, PARE sem alterar o estado.

Branch futura: `goal/pdv-n5b1-production-smoke-closeout-004`.
Worktree futura: `C:/Projetos/omni-gestao-pdv-n5b1-production-smoke-004`.
Nessa worktree, seguir `status` → `open` da trilha e a allowlist impressa.
O `base_commit` operacional será calculado pelo AEP via merge-base.

## Objetivo e destinos de produção

Executar `PRODUCTION_AUTHENTICATED_SMOKE` nas duas produções oficiais e registrar
um veredito operacional apoiado por observação real, com cobertura e limites explícitos.

Referências de identidade existentes em `docs/ai/DEPLOY.md` e
`docs/audits/DEPLOY_LEGACY_PROJECT_REAL_USAGE_AUDIT_001.md`, a reconfirmar na execução:

| Projeto Vercel | Domínio Production de referência |
| --- | --- |
| `omni-gestao-pro` | `https://omni-gestao-pro.vercel.app` |
| `omni-gestao` | `https://omni-gestao-pi.vercel.app` |

Preservar a distinção documental entre projeto canônico e projeto legado ativo.
Reconfirmar domínio/alias efetivamente servido e deployment Production de cada um
por fontes read-only. Se a identidade divergir ou não puder ser comprovada, PARE
e registre o bloqueio; este GOAL não autoriza trocar domínio, promover ou refazer deploy.

Para cada produção, registrar deployment ID/URL, estado observado, instante com
fuso, source SHA e a relação comprovada desse SHA com o merge #248. READY, login
ou abertura do shell não provam que o deploy contém o merge. Quando a versão
servida estiver disponível, confrontá-la com os metadados de deployment; separar
a observação dessas fontes da inferência Git de ancestralidade. Deploy não
comprovado contendo #248 impede aprovação e deve ser registrado como BLOCKED.

## Segurança operacional e sessão

- Usar exclusivamente sessão autenticada autorizada já disponível. Verificar
  sessão válida, loja ativa e contexto do terminal em cada produção.
- Nunca solicitar, imprimir, copiar ou registrar senhas. Não armazenar cookies,
  tokens, headers de autenticação ou dados pessoais em evidências.
- Se faltar sessão válida em qualquer produção, interromper o smoke com
  `SMOKE_BLOCKED=AUTH_REQUIRED`. Login público não conta como smoke autenticado.
- Não criar venda real, finalizar pagamento, abrir/fechar caixa, movimentar
  estoque, executar migrations ou modificar configurações permanentes.
- Não interferir em terminal ocupado. Sem terminal autorizado e livre, registrar
  BLOCKED e parar; não assumir posse, limpar carrinho, descartar pendências nem
  alterar sessão operacional existente para viabilizar o smoke.
- Não executar E2E que abra caixa automaticamente. O `test_command` deste GOAL
  verifica governança somente; não executa browser, E2E ou operações de negócio.
- Não alterar StoreSettings, perfil persistente da loja, permissões, capabilities
  ou configuração de terminal para ampliar cobertura. Não usar escrita direta em
  banco/API nem adulterar storage/estado para fabricar um cenário.

## Smoke por produção e superfície

Verificar Classic, Assistência, Supermercado e Venda Completa quando acessíveis
com a configuração atual. Usar navegação já disponível que não persista mudança
de configuração. Executar cada interação apenas após confirmar que ela não
submete venda/pagamento nem altera uma operação existente.

1. Comprovar sessão, loja e terminal corretos e ausência de operação ocupando o terminal.
2. Observar carregamento real da superfície e seus dados, além do shell inicial.
3. Exercitar busca e controles não destrutivos, sem salvar entidades de negócio.
4. Observar feedback e estados de pagamento que possam ser alcançados sem
   finalização. Não clicar em confirmar/pagar/finalizar, acionar atalhos de
   confirmação nem criar transação para desbloquear a tela. Se o passo exigir
   abrir caixa, gravar venda ou mudar configuração, registrar a limitação/bloqueio.
5. Observar erros de interface e console durante a navegação. Registrar origem,
   instante e reprodução segura de cada erro; distinguir baseline documentado
   de erro novo. Sem baseline comprovado, não presumir que um erro é preexistente.

O relatório deve conter oito resultados individuais, com evidência e motivo:

| Produção | Superfície | Status obrigatório |
| --- | --- | --- |
| `omni-gestao-pro` | Classic | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao-pro` | Assistência | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao-pro` | Supermercado | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao-pro` | Venda Completa | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao` | Classic | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao` | Assistência | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao` | Supermercado | PASS / NOT_ACCESSIBLE / BLOCKED |
| `omni-gestao` | Venda Completa | PASS / NOT_ACCESSIBLE / BLOCKED |

- PASS: passos aplicáveis efetivamente observados sem falha; discriminar os
  passos cobertos e eventuais estados não alcançáveis com segurança.
- NOT_ACCESSIBLE: superfície indisponível pela configuração/permissão atual,
  com caminho tentado, evidência e motivo; não equivale a PASS.
- BLOCKED: falha técnica, sessão/terminal inadequado ou pré-condição operacional
  que impede avaliação segura. Documentar o bloqueio, sem tentar corrigi-lo neste GOAL.

Não reutilizar evidência de uma produção como prova da outra. Nenhuma produção
pode receber PASS apenas por READY, /login ou shell; se nenhuma superfície puder
ser avaliada com sessão/loja/terminal válidos, o closeout permanece BLOCKED.

## Contrato PENDING e prova histórica R4

Manter duas afirmações distintas em todos os relatórios:

```text
PRODUCTION_AUTHENTICATED_SMOKE=PASS|BLOCKED
PENDING_PRODUCTION_END_TO_END=NOT_EXECUTED_BY_DESIGN
```

Não provocar PENDING real em produção, falha de rede ou retry de venda real.
Não criar, reenviar, resolver, descartar ou consumir pendência existente.
Reload/hold/resume/retry completos pertencem à prova comportamental R4 já
aprovada, não a este smoke. O segundo contrato exige autorização operacional
adicional; este GOAL não a concede. Abrir o PDV não prova PENDING em produção.

Proveniência histórica a citar, sem declarar reexecução nesta sessão:

- [Evidência R4](../../../ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md)
  e [fechamento 003](../_closed/reports/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003-a1.md):
  identidade persistida imediatamente no cache real da Assistência, reload/remount
  seguro, segunda finalize/identidade nova ZERO, sales corrente nos atalhos,
  paridade clique/teclado, gate único, hold/resume e isolamento loja/terminal.
- Commit técnico aprovado: `a67fedeaced289aa466196a7664f04e3faeac24b`;
  AEP close: `3f4ed151660c277640d7d13ecfe90fc0cf0b52dc`.
- PR #248 registra a aprovação R por `claude-code` / família `anthropic`,
  APPROVE, independência válida e ausência de bloqueadores técnicos; registra
  também a revalidação R4 de 3 arquivos/74 testes e suite canônica de 46 arquivos/662 testes.
- Regressões N5-B1, N1, N3, N4 e scanner aprovadas; typecheck/build aprovados
  na revalidação histórica. Warnings baseline documentados não são prova de
  ausência de erros no console de produção.

O closeout deve separar expressamente teste comportamental/component-level,
revisão R histórica, inferência sobre Git/deploy e observação autenticada no browser.

## Evidência e critérios de encerramento

Usar somente os três paths da allowlist, com capturas/artefatos sanitizados no
diretório autorizado. Registrar:

- PR #248 e SHAs técnico, close e merge; main usada na execução.
- Deploys observados de ambas as produções, fonte da identidade/versão e
  comprovação de inclusão do merge; horário, domínio e contexto não sensível.
- Oito resultados por superfície, passos cobertos, evidências de browser e motivos.
- Restrições de cobertura, bloqueios objetivos e erros de interface/console.
- Regressões R4 aprovadas com links de proveniência, sem extrapolar para produção.
- Riscos residuais submetidos a aceite: superfícies/estados não acessíveis,
  PENDING end-to-end não executado por desenho e limites da janela do smoke.
- Veredito operacional e revisão R futura com executor, família, evidências
  examinadas, decisão e registro explícito dos riscos residuais aceitos.

Somente registrar `N5_B1_CLOSEOUT=APPROVED` se ambas as produções tiverem smoke
autenticado válido, deploy contendo #248 comprovado, todas as superfícies
acessíveis avaliadas sem falha nova e as restrições NOT_ACCESSIBLE claramente
documentadas e aceitas na revisão independente. A falta intencional de prova
PENDING em produção deve permanecer explícita mesmo com closeout aprovado.

Falha, auth ausente, terminal ocupado, deploy não comprovado ou cobertura
essencial bloqueada: registrar `PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED` e
`N5_B1_CLOSEOUT=BLOCKED`, com evidência objetiva. Não ratificar DONE, esconder
o bloqueio, ampliar allowlist ou implementar corretivo produtivo por este GOAL.

Na execução futura, rodar `node scripts/track.mjs verify --all` e
`git diff --check`. Esses comandos validam documentação/governança, não
substituem o smoke nem R. Typecheck/build não são exigidos para esta entrega
exclusivamente documental; nenhum teste que escreva em produção está autorizado.

Somente após aprovação R independente do smoke, evidências e veredito, permitir
commit técnico por caminhos explícitos, `close` AEP e push exclusivamente na
branch `goal/pdv-n5b1-production-smoke-closeout-004`, seguidos de PR documental
contra main. Derivados de fechamento são geridos pelo AEP, nunca editados à mão.
Não executar close de sucesso se houver BLOCKED. O merge permanece exclusivo do humano.

## Limite desta sessão de planejamento

Branch: `plan/pdv-n5b1-production-smoke-closeout-004`, baseada na main corrente,
em worktree dedicada. Alterações intencionais: somente este GOAL e referência no
TRACK; derivados de `registry` entram somente quando efetivamente alterados.
Não alterar GOALs 001–003, relatórios fechados, ledger ou código produtivo.

Validação autorizada: `node scripts/track.mjs registry`,
`node scripts/track.mjs verify --all` e `git diff --check`.
Commit/push autorizados somente na branch de plano; abrir PR contra main.
Não executar `open`/`close` de 004, smoke, acesso autenticado de produção ou
revisão R de execução nesta sessão. Não criar a branch/worktree de implementação,
iniciar N5-B2/N5-C, promover deploy ou fazer merge.

```text
PRODUCTION_FILES=0
NEXT_STEP=HUMANO_MERGEAR_PLANO_SMOKE_004
```

Entregar o PR de planejamento e PARE.
