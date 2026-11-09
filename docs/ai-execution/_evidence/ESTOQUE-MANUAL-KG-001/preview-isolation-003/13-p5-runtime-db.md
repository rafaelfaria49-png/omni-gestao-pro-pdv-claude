# P5 — prova real do banco no deployment Preview da #315 (2026-10-28)

O dono autorizou no chat em 2026-10-28 ("AUTORIZAÇÃO — P5 | PROVA REAL DO BANCO NO VERCEL PREVIEW"). O pedido era:

- deployment `dpl_4NqDo13fVkBdPDd7Z3XxrN6utSLC`;
- Neon `nameless-frost-19035275`, branch `br-wandering-band-b6ov7vmt`, endpoint `ep-red-wave-b6bbj667`, database
  `omnigestao_preview`;
- somente a loja e o admin sintéticos da P2.1;
- um único produto-marcador, com saldo 0, só no `pr315-kg`;
- login no preview, consulta autenticada, depois limpeza.

**Roteiro:** `harness/p5-prova-runtime.cjs`, com 4 fases: `vercel`, `marcar`, `app` e `limpar`.

**Segredos:**
- As URLs de banco vêm de `P2_SECRETS_FILE` e a credencial do admin sintético de `P2_GENERATED_FILE`. Os dois ficam
  fora do repositório.
- O token da Vercel vem do CLI.
- Nada disso vai para argv ou stdout. Toda saída passa pela redação, e por isso o e-mail sintético aparece como
  `<redacted>`.

## 1–2. Deployment e envs (`vercel`, somente leitura)

```
deployment=dpl_4NqDo13fVkBdPDd7Z3XxrN6utSLC url=omni-gestao-albo8ijvp-rafaelfaria49-4373s-projects.vercel.app criado=2026-10-28T02:22:07.559Z state=READY target=preview
git ref=claude/estoque-manual-kg-001 sha=2731097a5f9e5c0778aa35f70b621291003427ec pr=315
checks projeto=true target_preview=true ready=true branch=true sha=true pr=true
env DATABASE_URL id=VUjVxPk2VgPGdjEW escopo=claude/estoque-manual-kg-001 target=preview type=sensitive atualizado=2026-10-27T22:05:33.337Z antes_do_build=true
env DATABASE_URL id=CAgFUTJYNOJb64j1 escopo=genérico target=preview type=sensitive atualizado=2026-10-27T22:05:32.158Z antes_do_build=true
env DIRECT_URL id=BWFYesLFr0hAJWjT escopo=claude/estoque-manual-kg-001 target=preview type=sensitive atualizado=2026-10-27T22:05:33.656Z antes_do_build=true
env DIRECT_URL id=WfY0iLLQ8cbQOXHd escopo=genérico target=preview type=sensitive atualizado=2026-10-27T22:05:32.473Z antes_do_build=true
fonte PREVIEW_KG_RUNTIME_DATABASE_URL: endpoint=ep-red-wave-b6bbj667-pooler usuario=preview_runtime db=omnigestao_preview ok=true
fonte PREVIEW_KG_RUNTIME_DIRECT_URL: endpoint=ep-red-wave-b6bbj667 usuario=preview_runtime db=omnigestao_preview ok=true
```

Os valores sensitive não podem ser lidos pela API. O que comprova o destino é o marcador; as envs só confirmam que o
override da branch existia antes do build.

## 3–5. Marcador só no `pr315-kg` (`marcar`)

Tudo rodou em uma única transação (`psql -1`, `ON_ERROR_STOP`). Antes de qualquer escrita, um `DO` aborta se
`neon.project_id`, `neon.branch_id`, `neon.endpoint_id` ou `current_database()` não forem o alvo.

```
[kg] identidade=nameless-frost-19035275/br-wandering-band-b6ov7vmt/ep-red-wave-b6bbj667/omnigestao_preview txid=11265
[kg] loja_sintetica=1
[kg] triggers_usuario_estoque_produtos=0
[kg] inserido_txid=11265
[kg] movimentacoes_do_marcador=0
[kg] marcador_linhas=1
mesma_transacao=YES (txid 11265)
[main] identidade=nameless-frost-19035275/br-lively-feather-b6esh64a/ep-purple-morning-b6ajdsfk/omnigestao_preview txid=10241
[main] marcador_linhas=0
marcador: id=p5marker4c24a18456e47a79 sku=P5KG-4c24a18456e47a79 nonce=4c24a18456e47a79
```

- O INSERT foi direto em `estoque_produtos`, na loja `preview-loja-1`, com `stock=0`, `price=0` e
  `metadata.p5Marker=<nonce>`. Não houve movimentação, venda nem pagamento.
- A leitura do main foi feita com `default_transaction_read_only=on` e não gravou nada. O `txid_current()` dessa
  leitura alocou um xid, sem gravar dados. As leituras seguintes passaram a usar a trava sem `txid_current()`.

## 6–8. Login sintético e consulta pelo app (`app`)

O roteiro fez o login no host do próprio deployment, não no alias da branch, por Auth.js:

1. `GET /api/auth/csrf`;
2. `POST /api/auth/callback/credentials` com `admin@preview.invalid`;
3. `GET /api/auth/session`.

Em seguida chamou `GET /api/ops/inventory/lookup?code=<sku>&_p5=<aleatório>`, com o header
`x-assistec-loja-id: preview-loja-1`, `cache: no-store` e `Cache-Control: no-cache`. Essa rota tem
`dynamic = "force-dynamic"` e só lê do banco.

```
login status=200 cookie_sessao=true erro=false
sessao email=<redacted> role=ADMIN lojaId=preview-loja-1
lookup status=200 x-vercel-cache=MISS age=0 cache-control=public, max-age=0, must-revalidate x-vercel-id=gru1::gru1::t4x7j-1793161729641-7b9b74f1478b
lookup _lojaId=preview-loja-1 itens=1 [dbId=p5marker4c24a18456e47a79 sku=P5KG-4c24a18456e47a79 name=P5 MARCADOR KG 4c24a18456e47a79 stock=0]
KG_MARKER_VISIBLE_IN_APP=YES
```

O login e o lookup só leem: `authorize`, o callback `jwt` e a rota só fazem `findUnique` e `findMany`. O app não
gravou nada.

Logo depois, uma consulta com `harness/p4-conexoes.cjs` (somente leitura) confirmou o destino por outro caminho:

```
== main (br-lively-feather-b6esh64a): sessoes_preview_runtime=0 · 5× integer · migrations=23 kg=0
== pr315-kg (br-wandering-band-b6ov7vmt): sessoes_preview_runtime=1 (pgbouncer:1) · ultima_atividade_runtime=2026-10-28T04:28:48Z · 5× double precision · migrations=24 kg=1
```

## 9. Limpeza (`limpar`)

A limpeza usou a mesma trava, na mesma transação. O `DELETE` filtrou por `id`, `sku`, loja, `name`, `stock=0` e
nonce, e o `DO` exigiu `ROW_COUNT = 1` e 0 movimentações.

```
[kg] identidade=nameless-frost-19035275/br-wandering-band-b6ov7vmt/ep-red-wave-b6bbj667/omnigestao_preview txid=11266
[kg] removido_txid=11266
[kg] marcador_linhas=0
[kg pós] identidade=…/br-wandering-band-b6ov7vmt/ep-red-wave-b6bbj667/omnigestao_preview somente_leitura
[kg pós] marcador_linhas=0
[main pós] identidade=…/br-lively-feather-b6esh64a/ep-purple-morning-b6ajdsfk/omnigestao_preview somente_leitura
[main pós] marcador_linhas=0
```

## Não tocado

- O Neon Production e o Candidate não foram conectados. O Preview main só foi lido.
- Na Vercel não houve alteração de envs, deployments ou aliases; as chamadas foram só GET.
- PR #318: nenhuma ação.
- Não houve migration, commit, push nem merge.
- Não foram usados conta A01, cliente real, vendas, pagamentos nem movimentações de estoque.

## Resultado

```
P5=PASS
DEPLOYMENT_SHA_VERIFIED=YES (2731097a5f9e, PR 315, READY, target preview)
SYNTHETIC_LOGIN=PASS
RUNTIME_DB_TARGET_PROVEN=YES (pr315-kg br-wandering-band-b6ov7vmt)
KG_MARKER_VISIBLE_IN_APP=YES
PREVIEW_MAIN_UNCHANGED=YES
MARKER_CLEANUP=PASS
PRODUCTION_WRITES=0
MERGE=NOT_EXECUTED
DEPLOY=NOT_EXECUTED
PRODUCTION_MIGRATION=NOT_EXECUTED
```
