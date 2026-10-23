# Pessoas 001B — preservação, reconciliação e plano Recovery 002

Data: 23/10/2026, America/Sao_Paulo. Autorização: missão humana específica “PESSOAS 001B — RATIFICAR BLOCKED E PLANEJAR RECOVERY 002”. Escopo somente documental, preservação/publicação da origem e diagnóstico dirigido por leitura. Nenhum produto, teste de produto, banco, navegador, storage, preview ou produção foi executado/alterado nesta missão.

## Origem e publicação verificáveis

- Repositório/remoto conferidos: `rafaelfaria49-png/omni-gestao-pro-pdv-claude`, origin HTTPS correspondente. Identidade Git local e conta GitHub vinculada conferem com o proprietário.
- Worktree original: `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`, branch `goal/pessoas-001b-recovery-001`, árvore/índice limpos, nenhum arquivo não rastreado, `.aep-active` ausente.
- HEAD local: `7a6df145e68bfea7eac14bf057a0904bb985dc02`; remoto anterior `8648954a4c9d8fddc73b46697d167b1a33f5cf5d`. Ancestralidade e seis commits pendentes conferidos antes do push. Dry-run e push normal concluídos. `ls-remote` confirmou o remoto no mesmo SHA local.
- Referência local criada e conferida: `refs/tags/preserve/pessoas-001b-recovery-001-2026-10-23` → `7a6df145e68bfea7eac14bf057a0904bb985dc02`. Tag somente local; não foi publicada.
- PR [#273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273) conferida aberta/draft antes da publicação. Não houve mudança de estado, edição de descrição, marcação ready ou merge. Sua descrição histórica não substitui o ledger e os relatórios de bloqueio posteriores.

Seis commits preservados/publicados, em ordem:

```text
6752c2e525f8d35a830122a0e86c74900ff08f6f goal(pessoas-001): registrar bloqueio de disco no fechamento 001B
1b418c804717c4b5da677952ff181e244a911e02 goal(pessoas-001): iniciar servidor E2E na raiz do workspace
9acf18758f4db32aed2cb7ac79d64baed244dda5 goal(pessoas-001): selecionar Store pelo cartao semantico no E2E
c1e068bfae361380808c1bb6411f29eb63c7e554 goal(pessoas-001): preservar evidencias da tentativa final
37c5d5880c09d45a22f5ba697f95327be5e66e68 aep(pessoas): block PESSOAS-DP-FRONTEND-001B-RECOVERY-001
7a6df145e68bfea7eac14bf057a0904bb985dc02 goal(pessoas-001): concluir relatorio do bloqueio formal e cleanup
```

O commit oficial `37c5d58...` está no HEAD preservado. Seu log `AEP_BLOCK_A3_2026-10-22.log` registra `attempt --fail` na tentativa 3/3, conversão oficial para BLOCKED, três tentativas preservadas, remoção do marcador e NEW_SESSION. Não foi executado novo comando de tentativa/bloqueio para ratificar de novo. O estado da origem informa dois DONE/dois BLOCKED/cinco eventos.

## Reconciliação oficial, sem alteração manual do histórico

Worktree documental separada: `C:/Projetos/omni-gestao/.worktrees/pessoas-001b-recovery-002-plan`; branch `plan/pessoas-001b-recovery-002`. Base `origin/main` após fetch: `0adec2121ed463844f1af325f05f924f6952eddf`, posterior à main observada na missão (`040fcc76...`). A pasta principal está em outra branch com alterações anteriores/alheias; não foi usada para editar o plano.

Antes da aplicação: árvore/índice limpos, nenhuma sessão AEP, `status pessoas` e `verify --all` PASS, dois DONE/um BLOCKED/quatro eventos e Recovery 001 ainda READY na main. Comando executado primeiro com `--dry-run`:

```text
node scripts/track.mjs reconcile-blocked pessoas --goal=PESSOAS-DP-FRONTEND-001B-RECOVERY-001 --source-ref=refs/remotes/origin/goal/pessoas-001b-recovery-001 --source-commit=7a6df145e68bfea7eac14bf057a0904bb985dc02 --dry-run
```

Dry-run exit 0, um evento a anexar, tentativa histórica 3/3, previous_attempts preservados e nenhum arquivo escrito. Aplicação do mesmo comando sem `--dry-run` exit 0, commit oficial separado:

`ca73bdc3d99dac983e9fec5a9bf7ef89cffbec56 aep(pessoas): reconcile-blocked PESSOAS-DP-FRONTEND-001B-RECOVERY-001`.

Relatório oficial: `docs/execution-tracks/pessoas/_closed/reports/RECONCILE-BLOCKED-7a6df145e68b.json`. A CLI anexou literalmente o sufixo BLOCKED executado e arquivou integralmente o GOAL; não filtrou, reclassificou ou reiniciou tentativas. Verify após reconciliação PASS e árvore limpa. A main só receberá o histórico pelo merge humano da PR documental.

Igualdade de blobs Git da reconciliação e da origem conferida:

| Artefato | Blob idêntico nos dois commits |
| --- | --- |
| `pessoas/LEDGER.jsonl` | `62e21cc915fbd0adc68e5f800c6b4963c6833543` |
| `_closed/goals/PESSOAS-DP-FRONTEND-001B-RECOVERY-001.md` | `be3af264de9fc700157bbd303dc4b8dbbb91f68b` |

Arquivos fechados/relatórios anteriores e os quatro eventos preexistentes não foram editados. O planejamento não acrescenta evento ao ledger. Nenhum `open`, `attempt`, `check`, `block` ou `close` foi executado nesta missão.

## Diagnóstico histórico E2E: HYPOTHESIS

Fontes locais lidas no SHA preservado, sem nova execução: `frontend.e2e.ts`, `playwright.frontend.config.ts`, `auth.ts`, `auth.config.ts`, `/api/stores`, `lib/stores-api-access.ts`, página/componente de Unidades, runner oficial e os JSONs/logs históricos do predecessor. Os [resultados A3](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7a6df145e68bfea7eac14bf057a0904bb985dc02/docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/E2E_ON_FAILURE_A3_2026-10-22.json) e o [relatório final histórico](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/blob/7a6df145e68bfea7eac14bf057a0904bb985dc02/docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-001/FINAL_BLOCKED_2026-10-22.json) são referências fixadas, não prova do sucessor.

| Evidência | Conclusão e limite |
| --- | --- |
| Fixture, linhas 15–18 | A/B existem; usuário ADMIN tem lojaId A, membership somente B. Assimetria confirmada no código. |
| Auth preservado, linhas 34–51 | ADMIN/SUPER_ADMIN mantêm storeAccess all; a derivação por memberships só acontece dentro de `if (!isAdmin)`. A hipótese de A filtrada por esse membership não explica sozinha a execução histórica dessa fixture. |
| Stores API, GET e filterStoresForSession | A resposta é filtrada somente quando a sessão é restricted; lista allowedStoreIds vazia nessa condição resulta em lista vazia. Não há resposta da API da falha A3 retida. |
| A2 no HEAD 1b418c8 | O erro de strict mode registra o texto exato de A em dois elementos, cartão e detalhes. Demonstra presença no DOM daquela execução anterior, sem comprovar a API/sessão da A3. |
| A3 no HEAD 9acf187 | Zero cartões pelo filtro de role=button/descendente de ID exato, por 15 s; falha durante login, antes do Enter e do assert do cookie. Não prova que a Store estava ausente da resposta/DOM. |
| UI Unidades | Carrega `/api/stores`; o cartão tem role=button, tabIndex=0, handler Enter/Space e ID em descendente. A compatibilidade estática não demonstra o DOM runtime da A3. |
| Ajustes locais 1b418c8 / 9acf187 | Mudaram somente cwd do webServer e seletor/ativação/cookie A→B→A; não corrigiram memberships, fixture ou auth. Nenhuma diferença funcional entre 9acf187 e o HEAD preservado. |
| Config Playwright | Trace/screenshot/video estavam off; o JSON retido não contém snapshot DOM, resposta de `/api/stores` ou sessão. Causa histórica continua não confirmada. |

Não foram feitos login, consulta de sessão/API, seed ou abertura de navegador nesta missão read-only. O sucessor deve correlacionar esses três níveis na mesma execução, com dados sintéticos e saneamento, antes de declarar CONFIRMED. Criar memberships A/B é ajuste de fixture planejado; não é prova retroativa nem autorização para alterar a política global.

## Mudanças da main e gate externo ao recorte

Na main fixada `0adec212...`, `auth.ts:29–42` relê memberships no JWT e deriva os IDs permitidos para contas STORE, inclusive ADMIN sem autoridade de plataforma. `prisma/schema.prisma:2222` define STORE como padrão das contas novas. A fixture antiga, se transportada sem adequação, terá B na lista explícita em lugar do fallback lojaId A. Isso é análise da integração futura; não altera a conclusão histórica acima.

Há também uma dependência real de autorização de rotas, demonstrada estaticamente:

- `lib/auth/page-access.ts:12`: Unidades é negada a quem não tem platformAuthority.
- `lib/auth/page-access.ts:31`: Pessoas não está mapeada; `/dashboard/pessoas` e filhos caem em false para o mesmo ator.
- `lib/auth/proxy-enterprise-dashboard.ts:18` e `app/dashboard/layout.tsx:18`: aplicam a decisão e redirecionam antes do frontend local.

**HUMAN_AUTHORIZE_AUTH_INTEGRATION_SCOPE / ALLOWLIST_REPLAN_REQUIRED** está pendente. A decisão deve definir a integração com os guards próprios DP, o fluxo permitido de seleção de Store e os paths/testes necessários. Esses arquivos não foram acrescentados à allowlist. A camada auth exige autorização explícita de CLAUDE/CORE_RULES; se a solução atingir auth.ts/auth.config.ts/proxy.ts, também exige G-AUTH mecânico. Não elevar fixture para PLATFORM, abrir globalmente Unidades, remover guards ou alterar schema para fazer E2E passar. O gate foi reportado; nenhuma implementação começou.

## Sucessor único e transporte futuro

- GOAL: `PESSOAS-DP-FRONTEND-001B-RECOVERY-002`, único READY, revisão 7, C3/ALTO/openai, runner oficial inalterado no planejamento, gates liberados vazios.
- Branch/worktree futuras: `goal/pessoas-001b-recovery-002` / `C:/Projetos/omni-gestao-pessoas-001b-recovery-002`. Não criadas nesta missão. READY é planejamento para autorização; o próximo gate é HUMAN_MERGE_SUCCESSOR_PLAN, seguido das decisões específicas pendentes.
- `transport-manifest.json`: 32 caminhos, 26 adições/seis modificações, blobs da origem/base/main. Base histórica `13700862405a89da3c7d16702318735a88348133`; a comparação foi feita por Git, sem copiar código.
- Sobreposição atual com a main: somente MobileNavSheet.tsx, Sidebar.tsx e dashboard-nav-items.ts. Integrar trechos Pessoas e preservar hooks/filtros/guards/itens atuais; nunca restaurar os três blobs antigos por inteiro.
- Demais correções/testes concluídos são reutilizados, incluindo P2-01 e privacidade. Nenhum estado AEP/evidência/relatório antigo entra no transporte futuro. Ledger canônico reconciliado vem da main mergeada.
- Prioridade: prova login/Stores/cookie, correção de fixture/seletor por evidência, E2E ON/OFF, matriz visual/acessibilidade completa, regressões concretas e fechamento oficial, sem refazer domínio/frontend.
- Autorrevisão Codex preferida e registrada como SELF_REVIEW_NOT_INDEPENDENT. Nenhuma revisão R atribuída ao sucessor; revisao_independente=true mantida, dispensa exclusiva da PR #273 não herdada e decisão formal do sucessor PENDING. Não foi acionada outra IA.
- Preview/R2: autorização específica e bytes reais/integridade/isolamento vinculados ao HEAD aplicável continuam necessários; smokes antigos não homologam automaticamente a integração nova. Produção e folha funcional 002 não autorizadas.

## Verificação e limites da entrega documental

`registry` oficial gerou os derivados; `verify --all` passou antes e depois da reconciliação e após criação do sucessor. Projeção: dois DONE, dois BLOCKED, cinco eventos, um único READY e nenhuma sessão aberta. `git diff --check` passou no conteúdo rastreado; staging e conferência do conjunto final usam somente caminhos explícitos, seguidos de diff check do índice.

Typecheck/build/runner/E2E/matriz visual não se aplicam a esta PR documental e não foram executados. Os 162 testes/typecheck/integração/lint focado/dois builds/PWA pertencem ao HEAD histórico, E2E OFF e matriz visual continuam pendentes para o sucessor. Nenhuma contagem foi promovida a PASS novo.

Arquivos deste planejamento: novo GOAL, TRACK, este relatório/manifesto e state/REGISTRY gerados pela CLI. Reconciliação tem commit separado com ledger/arquivamento/relatório oficial/derivados. Nenhum código produtivo, CURRENT_STATUS.md, CHANGELOG, memória global, histórico fechado anterior ou trabalho alheio foi alterado; o estado de entrega funcional não mudou. Não houve force push/rebase/reset/amend/merge, limpeza extra, `.env`, dados reais, produção ou execução do sucessor.

Pendências para a execução futura: merge humano do plano, autorização da sessão, decisão de integração auth/allowlist, política formal de revisão, autorização/prova preview/R2 e todos os testes/aceites do HEAD novo. **NEXT_GATE=HUMAN_MERGE_SUCCESSOR_PLAN**.
