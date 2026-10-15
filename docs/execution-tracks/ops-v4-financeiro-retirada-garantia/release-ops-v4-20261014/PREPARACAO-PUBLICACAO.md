# Preparação da publicação integrada — Operações V4

Estado: **BLOQUEADO para main/Production**. Este registro consolida o trabalho existente; não é revisão independente, aprovação técnica, novo GOAL ou fechamento AEP.

## Autoridade e aceite funcional

Na mensagem `CODEX — FINALIZAR RELEASE OPERAÇÕES V4`, o proprietário confirmou que a Preview `6cbf01f` está pronta, com Neon QA isolado, e aprovou o funcionamento. Autorizou reconciliação por merges normais, consolidação dos gates existentes e publicação somente depois de todos os gates obrigatórios atendidos. Esse aceite é funcional; não substitui R nem dispensa gates contratuais.

## Reconciliação executada

Main remota e SHA servido na Production canônica durante a preparação: `6b0b240f7ceb5cd9b8c87e55be55a52ccb04eca2`, deployment `dpl_FXba6VzJXx3bp81jtNGjVmr8GQj3`, `vercelEnv=production`.

Os objetos congelados para a tentativa de R foram:

| Entrega | PR / dependência | SHA reconciliado |
| --- | --- | --- |
| Financeiro 002 | #262 → main | `c102c2d3f271e91ebead709079ac6e00df147db7` |
| Datas UI Promoção 001 | #271 → branch de #262 | `8dff8d6135ef26290eb6d0397e45922123106bdf` |
| Garantias 003 | #272 → branch de #271 | `7fb95ac3cbf6ca2d3b3b25dd8b54e31d0a7a8b31` |

A main foi mergeada normalmente no Financeiro e propagada por merges normais para Datas e Garantias, sem conflitos. Os commits originais, as branches e worktrees foram preservados. O diff entre o integrado final e `6cbf01fa43cc2183a4a45c543f97c3fc13784186` é vazio em `app`, `components`, `lib`, `test`, `e2e`, `prisma`, `package.json`, `package-lock.json`, `scripts`, `vercel.json` e `next.config.ts`. O delta novo é documental/governança proveniente da main. Os commits posteriores deste registro e seu transporte nas dependências são documentais; nenhuma R foi atribuída a eles.

## Evidências reaproveitadas

- Financeiro funcional congelado: `d5570e829057863a9f670823bb3367b527efb391`, base histórica `1fd90905e05656444576cf83c9df6c46919a917a`. O pacote existente de revisão 8/tentativa 2 permanece inalterado.
- Conferência somente leitura do pacote existente: PASS, 627 arquivos, 11.582.596 bytes, 50 vínculos de snapshots Git; manifesto SHA256 `db892bd42610d5c2c80b62d9575d0fff50ba022e88a7b708afef258c571f5d26`; ZIP SHA256 `e3fcfa4478f4124a68da6124f974ce6ac3b500fc7bac788fe33cecf854d9cc3c`. Foram usados os bytes selados do verificador, sem conversão CRLF do checkout Windows.
- Execução anterior desta release: 614 provas aprovadas (356 modelos/servidor, 205 Financeiro com PostgreSQL, 6 PostgreSQL de entrega/versões/concorrência, 5 editor de Garantias, 42 Datas), typecheck e AEP verify --all. Esses resultados foram preservados e não reexecutados nesta consolidação. Não representam R nem comprovam, por simples soma, todos os E2E exigidos nos GOALs.
- Preview aprovada: `6cbf01fa43cc2183a4a45c543f97c3fc13784186`, deployment `dpl_BLby88Le9J7ei6ftThvgSWcKxaRb`, Ready, MIGRATION_SKIPPED e SHA/ambiente Preview confirmados pelo endpoint de versão.
- Smoke anterior na Preview isolada: autenticação, abertura das OS sintéticas, garantias por serviço, versões original/aditivo e editor de datas cancelado sem salvar. Nenhuma alteração em OS ou financeiro reais. Credenciais, dados e artefatos locais de QA não fazem parte desta entrega Git.

## Revisão independente — impedimento real

O Claude Code estava autenticado (`claude.ai`, assinatura Pro), mas autenticação não comprova cota disponível. A única invocação efetiva desta retomada, restrita a código/evidências já públicos no GitHub e sem dados privados de QA, terminou com exit 1 e:

> You've hit your weekly limit · resets 11am (America/Sao_Paulo)

Nenhum parecer foi produzido para qualquer dos três SHAs. `R_HEAD_REVIEWED=NONE`; `R_VERDICT=NONE`; P0/P1/P2/P3 **não avaliados**. Não se registrou APPROVE, REQUEST_CHANGES ou contagem zero fictícia. Não houve repetição de chamadas de cota, troca artificial de família ou mudança em executors.json para liberar o gate.

A rodada única concentrada permanece preparada com objetos separados para Financeiro, Datas e Garantias. O pedido original de revisão completa do Financeiro e os cinco P3 anteriores permanecem preservados. Outra sessão OpenAI não atende a R exigida; Gemini está declarado apenas para C1/C2, enquanto Financeiro/Garantias são C4 e Datas é ALTO.

## Gates que continuam obrigatórios

| Entrega | Situação efetiva |
| --- | --- |
| Financeiro 002 | R elegível completa sobre o objeto final ausente; check oficial e close não executados nesta retomada. GOAL existente e tentativa 2/3 preservados. |
| Datas UI Promoção 001 | Pré-condição Financeiro DONE + main ainda não satisfeita. Não houve open/close desta trilha. Gates de 333 regressões/inventário, 20 cenários do runner mais aplicativo integrado, lint/check e R precisam de comprovação individual conforme o GOAL; não foram considerados atendidos pela aprovação manual ou pela soma 614. |
| Garantias 003 | Pré-condição Financeiro DONE + main ainda não satisfeita. Não houve open/close do 003. R e comprovação completa dos critérios C1–C8/E2E obrigatórios continuam pendentes; os testes unitários/PG e o smoke existentes não foram inflados para substituir esses gates. |

Nenhum state.json, LEDGER.jsonl ou REGISTRY.md foi editado manualmente. Não foi criado GOAL. As PRs continuam draft, dependentes e sem merge. Production não recebeu alterações por esta execução. Antes dos pushes, também foram isoladas as Previews Financeiro/Datas em QA: 17 variáveis por branch, conexões e credenciais próprias, integrações de escrita produtivas desativadas, MIGRATION_AUTHORITY_ENABLED=false. A comparação do conjunto de variáveis Production antes/depois retornou inalterado. Essa configuração não executou schema, seed ou escrita de dados.

## Retomada mínima

Com um revisor Anthropic elegível com cota ou humano qualificado disponível: concluir a única rodada concentrada preparada, com parecer real e separado para cada SHA exigido, e comprovar somente os gates ainda não atendidos. Somente após R válida e gates reais: check e close oficiais, merges normais #262 → #271 → #272 com reconciliação documental das dependências, e acompanhamento da Production canônica até Ready/SHA servido/smoke não destrutivo. Sem reimplementação, novas auditorias genéricas, novo GOAL ou migrations desnecessárias.
