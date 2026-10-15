# PDV N5-B1 — smoke de produção e closeout 004

Data: 13/10/2026, America/Sao_Paulo (UTC-03:00).
Executor: Codex / família `openai`. GOAL: `PDV-PARITY-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004`.

O closeout permanece **BLOCKED**. Os dois deployments corretos foram identificados,
mas o legado apresentou erro de configuração na obtenção de sessão e onboarding
de loja. O smoke parou nesse gate. Nenhuma das oito combinações recebeu PASS.

```text
PRODUCTION_AUTHENTICATED_SMOKE=BLOCKED
SMOKE_BLOCKED=AUTH_REQUIRED
AUTH_BLOCK_DETAIL=LEGACY_AUTH_CONFIGURATION_ERROR_SESSION_NOT_VALIDATED
PENDING_PRODUCTION_END_TO_END=NOT_EXECUTED_BY_DESIGN
N5_B1_CLOSEOUT=BLOCKED
INDEPENDENT_R_VERDICT=NOT_EXECUTED_AUTH_GATE_BLOCKED
NEXT_STEP=REGISTRAR_PENDENCIA_SMOKE_004
```

## Base e inicialização

- Fetch de origin/main concluído. MAIN_BASE=`66b3044d3888b9b6ee276c4f49c380a80fd2b736`.
- Base publicada informada: `ea0d3a5cdc48da714108f607c8dcc977204e1de9`,
  ancestral da main corrente, que já contém o merge #268.
- [PR #248](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/248):
  MERGED, merge `9b0a0e81f4030c1d3df2592d48021d8206f229af`.
- [PR #267](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/267):
  MERGED, merge `ea0d3a5cdc48da714108f607c8dcc977204e1de9`.
- Branch/worktree solicitadas criadas exclusivamente de origin/main corrente.
- Status canônico: 001/002/003 DONE; 004 único READY; nenhuma outra sessão AEP
  dessa trilha encontrada nas worktrees registradas.
- `node scripts/track.mjs status pdv-parity-suite-n5-b1-core-gaps-001` e depois
  `open`: PASS; tentativa 1/3; base operacional calculada igual à MAIN_BASE.
- WIPs preservados. Nenhum stash, reset, troca de branch, staging ou edição de
  conteúdo na checkout original ou nas demais worktrees.
- Allowlist exclusiva: este relatório, a evidência Markdown 004 e o diretório
  de artefatos 004. Nenhum código produtivo alterado.

## Identidade dos deployments

Observação dos metadados: **13/10/2026 17:08:04 UTC-03:00**.
A resolução de cada alias foi lida por `vercel inspect`; ID, alias atribuído,
target Production e SHA foram confirmados por GET read-only do deployment na API Vercel.
Somente os campos não sensíveis selecionados foram registrados.

| Produção | Papel | Deployment ID | Estado / target | Source SHA |
| --- | --- | --- | --- | --- |
| [omni-gestao-pro](https://omni-gestao-pro.vercel.app) | Canônico | `dpl_3EBwZWF9HKinnMhcqwwpdBUFRrAA` | READY / production | `66b3044d3888b9b6ee276c4f49c380a80fd2b736` |
| [omni-gestao](https://omni-gestao-pi.vercel.app) | Legado ativo | `dpl_qbf9TdT2h66L3drxxiWDFo9EYA12` | READY / production | `66b3044d3888b9b6ee276c4f49c380a80fd2b736` |

URLs imutáveis e instantes completos estão no
[artefato de metadados](../ai-execution/_evidence/PDV_N5_B1_PRODUCTION_SMOKE_CLOSEOUT_004/deployment-metadata.json).
`meta.githubCommitSha` e `gitSource.sha` coincidiram em cada deployment.
Os aliases oficiais constam nas respectivas listas de aliases.

`git merge-base --is-ancestor` retornou exit 0 para os merges #248 e #267
contra o SHA dos dois deployments. **DEPLOY_CONTAINS_PR248=YES_BOTH** é uma
inferência de ancestralidade Git apoiada por metadados, separada da prova de browser.
O resumo da CLI inspect não trouxe SHA; READY sozinho não foi usado para aprovação.

A aba canônica existente mostrou aviso de atualização. Sua versão de cliente
carregada não foi vinculada a um SHA nesta execução; ela não foi recarregada.
O deployment correto no servidor não transforma essa observação parcial em PASS.

## Sessão, loja, terminal e cobertura real

**Canônico:** leitura passiva da aba já existente em `/dashboard/vendas`.
A interface apresentou contexto de usuário, Matriz, Assistência Técnica, PDV1,
caixa já aberto, grade de serviços e carrinho vazio. A sessão corrente do servidor
e a disponibilidade/autorização do terminal não foram revalidadas. Carrinho vazio
não prova que o terminal esteja livre. Nenhum controle de negócio foi acionado.

Foram apenas observados a busca e os botões Dinheiro, PIX, Débito, Crédito,
À prazo e Múltiplo desabilitados com total zero. Não houve digitação de busca,
seleção de itens, clique de pagamento, abertura de modal, atalho de confirmação,
hold/resume, limpeza de carrinho ou atualização do sistema. Esses passos seguem
sem cobertura; a captura não constitui smoke autenticado completo.

**Legado:** abertura read-only de `/dashboard` no mesmo perfil Edge autorizado,
sem inserir credenciais. Após hidratação, o cabeçalho ficou em “Usuário —” e
apareceu “Boas-vindas! Vamos configurar sua loja”, passo 1 de 3, com campos vazios.
O console registrou duas falhas de configuração Auth.js em `_getSession`.
Sessão válida, loja ativa e terminal não foram comprovados.

Uma tentativa read-only de navegação direta a `/api/auth/session` foi impedida
pelo navegador com `net::ERR_BLOCKED_BY_CLIENT`. Esse resultado pertence ao
transporte do navegador e não é evidência de uma resposta HTTP da aplicação.
A falha de sessão relatada acima veio do console da página dashboard.

Nenhum botão do onboarding foi acionado. Não houve criação de loja, alteração
de StoreSettings, alteração de permissões ou tentativa de corrigir autenticação.
A abertura de shell/dashboard do legado não foi aceita como validação de PDV.

## Oito resultados individuais

Códigos de motivo: **G1** = gate de sessão válida nas duas produções bloqueado;
**G2** = versão do cliente e terminal canônico não revalidados;
**G3** = erro Auth.js, onboarding e ausência de contexto operacional válido no legado.

| Produção | Superfície | Resultado | Caminho / evidência / limite |
| --- | --- | --- | --- |
| omni-gestao-pro | Classic | BLOCKED | G1/G2. Apenas /dashboard/vendas existente foi lido em modo Assistência; Classic não exercitado. |
| omni-gestao-pro | Assistência | BLOCKED | G1/G2. Observação parcial de grade, carrinho vazio e pagamentos desabilitados; busca/interação e pré-condições não validadas. |
| omni-gestao-pro | Supermercado | BLOCKED | G1/G2. Navegação específica não executada após o gate; nenhuma conclusão de indisponibilidade por configuração. |
| omni-gestao-pro | Venda Completa | BLOCKED | G1/G2. Navegação específica não executada após o gate; nenhuma conclusão de indisponibilidade por configuração. |
| omni-gestao | Classic | BLOCKED | G3. /dashboard ficou sem sessão/loja/terminal comprovados; PDV não exercitado. |
| omni-gestao | Assistência | BLOCKED | G3. Mesmo gate comum; nenhuma evidência de PDV autenticado. |
| omni-gestao | Supermercado | BLOCKED | G3. Mesmo gate comum; nenhuma evidência de PDV autenticado. |
| omni-gestao | Venda Completa | BLOCKED | G3. Mesmo gate comum; nenhuma evidência de PDV autenticado. |

**Totais:** PASS=0; NOT_ACCESSIBLE=0; BLOCKED=8.
Nenhum NOT_ACCESSIBLE foi inferido da falta de teste. O resultado de uma produção
não foi usado como prova da outra. As quatro superfícies continuam pendentes em
cada produção; não foram alteradas configurações para ampliar cobertura.

## Erros realmente observados

| Origem | Instante UTC-03:00 | Observação |
| --- | --- | --- |
| Legado, console da página /dashboard | 13/10/2026 17:08:29.886 | Auth.js: “There was a problem with the server configuration”; stack em _getSession. |
| Legado, mesmo console | 13/10/2026 17:08:30.112 | Segunda ocorrência da mesma mensagem durante hidratação. |
| Canônico, observação passiva | Janela desta leitura | Zero warn/error capturados pela ferramenta; sem interação/reload, cobertura limitada. |

As mensagens completas sanitizadas, timestamps UTC e origem dos chunks estão em
[browser-observations.json](../ai-execution/_evidence/PDV_N5_B1_PRODUCTION_SMOKE_CLOSEOUT_004/browser-observations.json).
Reprodução segura observada: abertura do dashboard legado e hidratação, sem login
ou submissão de formulário. Não repetir a navegação para provocar erro.

A auditoria histórica do legado relata falhas agregadas de autenticação, mas não
comprova baseline equivalente para estas mensagens. Portanto, não se afirma que
os erros atuais sejam preexistentes nem regressão causada pelo PR #248.
Os warnings históricos de build/ESLint não são baseline de console de produção.

## Histórico aprovado R4 — sem reexecução

- Técnico aprovado: `a67fedeaced289aa466196a7664f04e3faeac24b`.
- AEP close 003: `3f4ed151660c277640d7d13ecfe90fc0cf0b52dc`.
- Merge #248: `9b0a0e81f4030c1d3df2592d48021d8206f229af`.
- [Evidência R4 original](../ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md)
  e [relatório canônico 003](../execution-tracks/pdv-parity-suite-n5-b1-core-gaps-001/_closed/reports/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003-a1.md).
- O corpo atual do [PR #248](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/248)
  registra revisão R **informada pelo humano**: `claude-code` / Anthropic,
  APPROVE, INDEPENDENCE_VALID=YES, TECHNICAL_BLOCKERS=NONE. A API de reviews do PR
  retornou lista vazia; a proveniência desta aprovação é o registro no corpo,
  não uma nova revisão GitHub nem uma revisão efetuada nesta sessão.
- A revalidação de integração registrada no PR contém 3 arquivos / 74 testes R4,
  suite canônica de 46 arquivos / 662 testes, N5-B1/N1/N3/N4/scanner,
  typecheck/build aprovados. A evidência original contém a prova inicial de 34 casos.
- Contratos históricos: cache imediato real da Assistência, identidade PENDING
  reidratada, reload/remount seguro, segunda finalize/identidade nova ZERO,
  sales corrente nos atalhos, paridade clique/teclado, gate convergente,
  hold/resume e isolamento loja/terminal.

Esses resultados pertencem à prova comportamental/component-level e à integração
histórica. Não foram repetidos R4, typecheck, build, Docker ou E2E nesta execução
e não foram usados como substitutos do smoke autenticado.

## Riscos residuais e revisão R

Permanecem sem aceite: autenticação do legado; loja/terminal válidos; versão
efetivamente carregada no cliente canônico; busca/interações; outras superfícies;
estados de pagamento além dos botões desabilitados; erros fora da janela observada.
PENDING end-to-end em produção segue excluído por desenho e requer autorização
operacional adicional. Não se provocaram PENDING real, falha de rede ou retry.

A tabela de executores declara `claude-code` / `anthropic`, diferente de `openai`.
Claude Code 2.1.288 foi localizado; apenas versão/ajuda foram lidas.
Nenhum revisor foi executado ou certificado como disponível com autenticação.
A revisão R do GOAL 004 está **pendente**, sem veredito, exame ou aceite de riscos.
O gate de sessão bloqueado impediu avançar para revisão/aprovação e entrega.
A aprovação histórica R4 não satisfaz a revisão R de 004.

## Entrega e estado AEP

```text
AEP_OPEN=PASS
AEP_CLOSE=NOT_EXECUTED_AUTH_GATE_BLOCKED
VERIFY_ALL=PASS
DIFF_CHECK=PASS
TECHNICAL_FILES_CHANGED=0
COMMIT=NONE
PUSH_BRANCH=NOT_EXECUTED
PR_NUMBER=NONE
PR_URL=NONE
NEXT_STEP=REGISTRAR_PENDENCIA_SMOKE_004
```

A sessão AEP permanece aberta, tentativa 1/3, sem ratificação DONE.
Não foi executado close nem block de estado: block também criaria commit e moveria
o GOAL/derivados; esta execução parou na pendência, conservando a allowlist documental
e o gate de commit/revisão. GOALs 001/002/003, ledger, registry e state não foram editados.
O desbloqueio de autenticação/configuração exige tratamento separado pelo humano;
esta execução não solicita credenciais nem autoriza esse corretivo.

Evidências visuais reais foram sanitizadas por omissão de áreas de identidade.
A captura canônica foi recortada durante a captura; o legado contém campos vazios
e placeholders. Nenhum pixel foi gerado ou alterado. Arquivos finais estão
exclusivamente na allowlist. Exportação temporária necessária pela restrição
de gravação da ferramenta não faz parte da entrega e foi removida após a transferência.
Uma captura separada do aviso de atualização falhou por timeout; não se alega
existência desse arquivo. O aviso foi observado em AX e screenshot apenas.

CURRENT_STATUS, CHANGELOG e MASTER_CONTEXT não foram alterados: escopo exclusivamente
documental de evidência, sem mudança produtiva e fora da allowlist.
Não foram iniciados N5-B2 ou N5-C. Merge de eventual PR futuro reservado ao humano.
