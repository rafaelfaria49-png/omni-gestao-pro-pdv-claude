# P3 — envs de Preview do `omni-gestao-pro` → Neon preview (2026-10-27, APLICADA)

Autorização do dono (chat, 2026-10-27): "Autorizo a P3: P3-a (genérico Preview → preview main), P3-b (override
claude/estoque-manual-kg-001 → pr315-kg) e P3-c (remover DATABASE_URL/DIRECT_URL dos 4 overrides ops-v4), no
omni-gestao-pro, via harness/p3-vercel-env.cjs apply. Não tocar Production, Development nem aliases. Pare após a P3."

Comando (sem valor em argv; valores lidos de `C:\Projetos\secrets\neon-preview\generated.env` e enviados só no corpo HTTPS):

```
P2_GENERATED_FILE=<generated.env> P3_LIMPAR_OPS_V4=1 node harness/p3-vercel-env.cjs plan           # reconfirmação: 12 operações, ids = preflight
P2_GENERATED_FILE=<generated.env> P3_AUTORIZADO=1 P3_LIMPAR_OPS_V4=1 node harness/p3-vercel-env.cjs apply
```

## Operações (12/12 ok, 2026-10-27T22:05:32–34Z)

| Op | Chave | Escopo | Id | Destino (validado em memória antes do envio) |
| --- | --- | --- | --- | --- |
| PATCH | DATABASE_URL | Preview genérico | `CAgFUTJYNOJb64j1` | `ep-purple-morning-b6ajdsfk-pooler` · `preview_runtime` · `omnigestao_preview` · pgbouncer |
| PATCH | DIRECT_URL | Preview genérico | `WfY0iLLQ8cbQOXHd` | `ep-purple-morning-b6ajdsfk` · `preview_runtime` · `omnigestao_preview` |
| POST | DATABASE_URL | Preview `claude/estoque-manual-kg-001` | novo | `ep-red-wave-b6bbj667-pooler` · `preview_runtime` · `omnigestao_preview` · pgbouncer |
| POST | DIRECT_URL | Preview `claude/estoque-manual-kg-001` | novo | `ep-red-wave-b6bbj667` · `preview_runtime` · `omnigestao_preview` |
| DELETE | DATABASE_URL + DIRECT_URL | Preview `codex/ops-v4-goal003-family-regularization` | `zDw96KY4KTH9QUAf` · `4NqAFylbDJvQ0J1A` | cai no genérico |
| DELETE | DATABASE_URL + DIRECT_URL | Preview `codex/release-ops-v4-datas` | `5u6g5fmi0T3OmDUV` · `KBjEHltia6BT2f77` | cai no genérico |
| DELETE | DATABASE_URL + DIRECT_URL | Preview `goal/ops-v4-financeiro-retirada-garantia-002` | `vixMejVbFms7syBO` · `kHcziEdY1II4ZHDn` | cai no genérico |
| DELETE | DATABASE_URL + DIRECT_URL | Preview `codex/release-ops-v4-vercel` | `fEQYz2QR5TqiAEVm` · `tbPaDlZAlJKYvC9z` | cai no genérico |

Todas as entradas novas/alteradas: `type=sensitive`, `target=[preview]`.

## Conferência pós-apply (só metadados, contra `10-p3-0-inventario.json`)

`omni-gestao-pro`: 100 → 94 envs. Diferença exata = 8 removidas (ops-v4) + 2 genéricas com data nova + 2 novas da
branch da PR. Nenhuma outra entrada mudou.

| Item | Resultado |
| --- | --- |
| Entradas não-preview (Production, Development) | idênticas ao preflight nos 2 projetos (`DATABASE_URL`/`DIRECT_URL` production 2026-07-27, `DIRECT_URL` development 2026-07-27) |
| `omni-gestao` | 15 → 15, sem diferença |
| Deployments criados após o apply | 0 nos 2 projetos (env não dispara build) |
| Alias `omni-gestao-pro.vercel.app` | → `34b70a1` (Production READY de 2026-10-27T01:14Z, inalterado) |
| Alias `omni-gestao-pi.vercel.app` | → `e9eb984` (inalterado) |
| Deployment Protection / Node / custom envs | inalterados (`ssoProtection=null`, 20.x, 0) |
| Neon Production / Candidate | não acessados |

## O que a P3 não faz

- Não muda deployments existentes: cada um guarda o retrato das envs do build. Os 55 Preview READY com
  `neondb_owner` seguem alcançando a produção até corte de CONNECT, troca de senha, exclusão ou Deployment Protection
  (cada um com autorização própria). `OLD_DEPLOYMENT_RISK=HIGH` continua.
- O valor dos novos envs só é provado em runtime no primeiro deployment de Preview (P4, procedimento em
  `10-p3-0-preflight.md` §7).
- Reversão: os valores antigos removidos/sobrescritos eram `sensitive` (ilegíveis na Vercel); recriá-los exige o
  valor que o operador tiver guardado. Não há caminho de volta pela API.

## Efeito colateral esperado

Preview de qualquer branch sem override (inclusive as 4 ops-v4) passa a abrir o main do Neon preview (seed
sintético: 1 loja, 1 admin), não mais os dados de Candidate/produção.

## Resultado

```
P3_ENV_APPLIED=YES (12/12)
PREVIEW_DEFAULT_TARGET=nameless-frost-19035275 / br-lively-feather-b6esh64a · preview_runtime
PR315_BRANCH_TARGET=claude/estoque-manual-kg-001 → br-wandering-band-b6ov7vmt · preview_runtime
OPS_V4_DB_OVERRIDES=removed (8)
PRODUCTION_ENV_UNCHANGED=YES
DEVELOPMENT_ENV_UNCHANGED=YES
ALIASES_UNCHANGED=YES
NEW_DEPLOYMENTS=0
OLD_DEPLOYMENT_RISK=HIGH (inalterado pela P3)
NEXT=P4 (resolver conflitos #315 + R5 + push) — exige autorização
```
