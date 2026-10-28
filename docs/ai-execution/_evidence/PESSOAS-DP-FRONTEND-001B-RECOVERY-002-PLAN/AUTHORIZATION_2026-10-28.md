# Recovery 002 — autorização humana de escopo e revisão 9

Data: **28/10/2026**, America/Sao_Paulo. GOAL: `PESSOAS-DP-FRONTEND-001B-RECOVERY-002`. Fonte: mensagem direta do usuário neste chat, missão **REGULARIZAR AUTH CONSUMER E RETOMADA AEP**, seção **AUTORIZAÇÃO HUMANA — 28/10/2026**. Identificador documental: `HUMAN-RECOVERY-002-AUTH-CONSUMER-2026-10-28`.

## Autorização literal

> Autorizo formalmente acrescentar exclusivamente:
>
> lib/auth/proxy-enterprise-dashboard.ts
>
> à allowlist do Recovery 002.
>
> Autorizo a correção cirúrgica do consumidor para
> reconhecer /dashboard/pessoas e subrotas somente
> depois de canAccessPage aprovar a passagem.
>
> Autorizo publicar por push normal a branch bloqueada
> para preservar e reconciliar os commits existentes.
>
> Autorizo o planejamento de retomada do mesmo GOAL,
> preservando a ratificação BLOCKED e a contagem real.
>
> Não autorizo manipulação manual de .aep-active,
> ledger ou núcleo AEP para simular retomada.

A missão também autoriza reconciliação oficial após dry-run aprovado, commit/push normais e **uma única PR documental para main**. O patch só pode ser aplicado **depois do merge humano do planejamento e abertura AEP legítima**. Não autoriza merge da implementação na main, mudança da PR #273, nova tentativa nesta fase ou transporte adicional de produto.

## Delta autorizado do plano

Mesmo ID, `plan_ref`, branch e worktree de execução. `plan_rev: 8 → 9`. Única inclusão na allowlist, sem remoção nem reordenação dos paths anteriores:

| Path adicional | Limite da edição futura |
| --- | --- |
| `lib/auth/proxy-enterprise-dashboard.ts` | Reconhecer somente igualdade com `/dashboard/pessoas` ou prefixo `/dashboard/pessoas/`, depois de `canAccessPage` aprovar. Preservar cookie/Store guard, guards DP e demais rotas. |

O teste `lib/auth/proxy-enterprise-dashboard.test.ts` já pertence à allowlist. Deve comprovar passagem e negação na camada externa, incluindo `/dashboard/unidades`, `/dashboard/plataforma`, `/dashboard/financeiro`, `/dashboard/configuracoes` e `/dashboard/pessoas-extra` no cenário sem as permissões correspondentes. Não ampliar `auth.ts`, `auth.config.ts`, `proxy.ts`, schema, migrations ou qualquer outro consumidor.

Mantidos integralmente classe C3, risco ALTO, executor openai, read_budget 85, runner, critérios técnicos, matriz visual, QA isolado, contratos 001A/P2 e dispensa externa condicional específica de 25/10. `gates_liberados=[]`; nenhum gate mecânico foi liberado. `condicao_satisfeita=false` e `HUMAN_MERGE_AUTHORIZATION=PENDING` permanecem. Autorrevisão continua `SELF_REVIEW_NOT_INDEPENDENT`.

## Estado preservado e limite de retomada

Origem publicada por push normal: `8bb2cb9019df2620d7ee7edfbf268b6ae2982be3`. BLOCKED oficial: `437abb4d4dc523865710cabf8a281f43dfda1fd9`, tentativa **1/3**, `previous_attempts=[]`. Reconciliação oficial: `bc9275307fff9df390c0ef02b1fb6e8d4ff55057`, um evento literal anexado e GOAL fechado integralmente preservado. Nenhuma sessão ativa nem tentativa nova.

A CLI atual não oferece retomada cumulativa desse BLOCKED sem marcador. O plano proposto revisão 9 permanece **BLOCKED**, sem GOAL READY, para impedir abertura acidental que reinicializaria a sessão. Os novos campos `retomada_aep` são descritivos; não são funcionalidades da CLI. A tentativa 1 já ratificada não vira tentativa zero: próxima corretiva requerida **2/3**, teto 3.

**G-AEP-CORE=REQUESTED_NOT_AUTHORIZED.** A autorização de escopo auth não libera alteração de núcleo. O pedido mínimo e a prova estão em [RECONCILIATION_AND_RESUMPTION_2026-10-28.md](RECONCILIATION_AND_RESUMPTION_2026-10-28.md). Merge desta PR não basta para retomar; mecanismo oficial exige autorização específica, implementação e ratificação humana próprias antes de abertura legítima.

Nenhum acesso a Neon/R2/Vercel, credencial, banco ou produção nesta fase. Não executar patch, runner, E2E ou close. Os 32 arquivos já transportados ficam na origem publicada. PR #273 conferida aberta/draft no SHA `7a6df145e68bfea7eac14bf057a0904bb985dc02`; nenhum ato nessa PR. Worktrees/WIPs externos preservados.
