# Recovery 002 — gate real de integração auth

Data: 28/10/2026 (America/Sao_Paulo). Base de execução: `34b70a15583db7608437f04b3ba7779582f4eeb9`. A PR #316 está mergeada em `745fb55cc65644e2be70bc963c72401ec4352015`, ancestral da base. GOAL revisão 8 aberto oficialmente na branch/worktree corretas, tentativa 1/3; sem reabertura de Recovery 001.

## Trabalho preservado

Transporte seletivo dos 32 arquivos do manifesto concluído: 29 deltas aplicados após conferir os blobs e ausência de colisões; três consumidores de navegação integrados por trechos. Preservados useEnterprisePermissions, canAccessPage, contexto pronto do drawer, plataforma/clientes piloto, PDV Clássico, Estoque e os demais itens atuais. Nenhum estado AEP da origem foi transportado. Fonte preservada `7a6df145e68bfea7eac14bf057a0904bb985dc02`.

Implementada somente a passagem externa delimitada de `/dashboard/pessoas` e subrotas no page-access.ts autorizado, mantendo negação para sessão nula/rotas vizinhas, Unidades, Plataforma e Financeiro. Preparadas regressões no page-access.test.ts e no teste existente do consumidor. Runner oficial retargetado para o subtree do sucessor e para incluir essas duas suítes auth; não executado.

A direção visual existente, tokens, temas, telas e contratos 001A/P2 foram preservados no transporte. Nenhuma validação visual ou nova funcionalidade foi declarada concluída.

## Reprodução executada, sem mocks do consumidor

Com Node v24.19.0, `diagnose-auth.mjs` importa os módulos TypeScript reais de page-access, enterprise-permissions, access-policy e proxy-enterprise-dashboard. O hook de resolução apenas resolve aliases/extensões; não substitui funções, permissões ou retornos. Não usa rede, banco, credenciais ou servidor. É diagnóstico de funções puras, não E2E/Vitest completo nem confirmação da falha A3 histórica.

Sessão sintética STORE, OPERADOR, platformAuthority=false, memberships A/B e todos os módulos Enterprise. O papel não tem Configurações Enterprise. Resultado em `auth-consumer-diagnostic.json`:

| Rota | canAccessPage | Consumidor real |
| --- | --- | --- |
| /dashboard/pessoas | true | sem redirect |
| /dashboard/pessoas/funcionarios | true | sem redirect |
| /dashboard/pessoas/configuracoes | true | **/dashboard?access=denied** |
| /dashboard/unidades | false | negado |
| /dashboard/plataforma | false | negado |
| /dashboard/financeiro | false | negado |
| /dashboard/pessoas-extra | false | negado |

Causa deste gate: `lib/auth/proxy-enterprise-dashboard.ts` usa `pathname.includes("configuracoes")` depois de aceitar canAccessPage. Assim impõe `perms.admin.configuracoes` também à subrota local Pessoas. `ConfiguracoesPessoas`/obterEmpregador usam os guards DP existentes, e a revisão 8 exige a passagem externa de todas as subrotas sem derivar capacidades DP de permissões Enterprise. A negação externa impede alcançar o guard DP legítimo. Isso não autoriza conceder Configurações Enterprise ao ator STORE nem alterar bootstrap/guards DP.

O arquivo do consumidor está expressamente fora da allowlist. O GOAL determina: “Se outro path protegido for indispensável, registrar arquivo/linha, pré-condição, resposta/DOM observado, impacto e gate necessário e interromper para autorização humana; não ampliar escopo durante a execução.” A prova aqui é do consumidor puro real; não foi inventada observação de navegador/API.

## Proposta concreta, não aplicada

`PROPOSED_AUTH_CONSUMER.patch` acrescenta retorno limitado a `/dashboard/pessoas` e `/dashboard/pessoas/…`, **depois** de canAccessPage e **antes** dos filtros Enterprise por substring. Preserva o check externo, o gate separado de cookie/Store, as rotas vizinhas, Unidades/Plataforma/Financeiro e os guards DP. O patch foi produzido contra o consumidor inalterado e será conferido com `git apply --unidiff-zero --check`; não foi aplicado. Nenhuma mudança em auth.ts/auth.config.ts/proxy.ts/schema/layout/AEP core.

Gate solicitado: autorização humana específica e regularização formal da allowlist para **lib/auth/proxy-enterprise-dashboard.ts**, sem novos paths de teste (o teste correspondente já está autorizado). Não modificar META ou .aep-active durante esta execução para contornar o gate. A dispensa de revisão externa não dispensa esse limite de escopo.

## Estado honesto e pendências

- Diagnóstico executado: sete cenários, seis comportamentos compatíveis e um bloqueio real de subrota; sem prova runtime de browser/API.
- E2E Store histórico: HYPOTHESIS. Fixture A/B, fluxo canônico/seletor local e coleta correlacionada ainda pendentes; o diagnóstico deste gate não confirma a falha A3.
- Typecheck, Vitest/001A/P2/PostgreSQL, lint, dois builds/PWA, E2E ON/OFF, matriz visual/acessibilidade e Preview/R2: NOT_RUN_GATE. Não foi criada evidência PASS fictícia nem consumida tentativa com runner incompleto.
- Autorrevisão Codex: achado bloqueante AUTH-CONSUMER-01; SELF_REVIEW_NOT_INDEPENDENT. Condição de entrega ainda não satisfeita; nenhuma revisão externa solicitada.
- QA Neon/R2/Vercel e credenciais não foram acessados ou alterados; sem deploy, bucket, banco ou produção.
- Sem fechamento DONE ou PR funcional; o trabalho é preservado em commits locais, e o bloqueio será ratificado pelo comando AEP oficial por gate.
- CURRENT_STATUS/changelog/memória global não alterados: produto não entregue e esses paths não pertencem à allowlist. PR #273 deve continuar aberta/draft.

NEXT_ACTION=HUMAN_AUTHORIZE_AUTH_CONSUMER_SCOPE_AND_FORMAL_AEP_RESUMPTION.
