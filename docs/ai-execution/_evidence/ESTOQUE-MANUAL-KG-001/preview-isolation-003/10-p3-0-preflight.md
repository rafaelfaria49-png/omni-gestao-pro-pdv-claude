# P3.0 — preflight do isolamento da Vercel Preview (2026-10-27, só leitura)

Nenhuma env, deployment, alias ou configuração da Vercel foi alterada. Production e Candidate do Neon não foram
conectados. Nenhum valor de segredo foi impresso.

**Leituras feitas:**
- API Vercel (GET) com o token do CLI 57: projetos, envs (`decrypt=false`), custom environments, envs
  compartilhadas e deployments READY. O inventário está em `10-p3-0-inventario.json` (sem valores).
- Valores **encrypted** de `DATABASE_URL`/`DIRECT_URL`: classificados em memória (endpoint, usuário, db, pooler) e
  descartados.
- Valores **sensitive**: ilegíveis por desenho.

## 1. Projetos e envs (leitura 2026-10-27T20:48Z)

| Projeto | id | Envs | Por branch | Custom env | Compartilhadas (team) | Deployment Protection | Build |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `omni-gestao-pro` (canônico) | `prj_wjkH…` | 100 | 4 branches ops-v4 | nenhuma | nenhuma | **desligada** (`ssoProtection=null`) | normal, Node 20.x |
| `omni-gestao` | `prj_IbJi…` | 15 | nenhuma | nenhuma | nenhuma | `all_except_custom_domains` | Ignored Build Step |

Mudança frente ao inventário de 2026-10-26 (`01`): nenhuma nas chaves e escopos.

## 2. O que controla o Prisma

- O `schema.prisma` da main (`34b70a1`) e o da PR usam **só** `url = env("DATABASE_URL")` (pooled) e
  `directUrl = env("DIRECT_URL")` (direto).
- No código, nenhum `POSTGRES_*`, `PG*`, `NEON_*` ou `datasourceUrl` de runtime. Fora do schema, `process.env.DATABASE_URL`/`DIRECT_URL` só aparece em `app/api/debug/prod-health` (só presença) e
  em scripts locais.
- O build (`scripts/vercel-build.mjs`) só roda `migrate deploy` com `VERCEL_ENV=production`, a flag e o project
  id canônico. Preview → `MIGRATION_SKIPPED`.
- Os `MIGRATION_AUTHORITY_ENABLED` por branch de preview não têm efeito.

| Entrada (omni-gestao-pro) | Escopo | Destino |
| --- | --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | production | sensitive. Pelo `01`, `neondb_owner@omnigestao_prod`. **Não tocar.** |
| `DATABASE_URL` / `DIRECT_URL` genéricos | preview | sensitive. Pelo `01`, `neondb_owner@omnigestao_prod_candidate` no endpoint da produção |
| `DATABASE_URL` / `DIRECT_URL` | preview + 4 branches ops-v4 | sensitive, destino ilegível. Nenhum deployment READY dessas branches |
| `DIRECT_URL` | development | `ep-summer-tooth-acltc6wi` (PROD) · `neondb_owner` · `omnigestao_prod_candidate` · direto. **Fora do escopo** (Development) |
| `omni-gestao`: `DATABASE_URL`/`DIRECT_URL` | só production | Supabase de 2026-05-08. Preview sem DB. **Nada a mudar** |

## 3. Valores prontos para a P3

Os valores vêm de `C:\Projetos\secrets\neon-preview\generated.env`, classificados sem imprimir.

**Prova de login:** os 4 valores fizeram login de leitura nesta fase, com `default_transaction_read_only=on`.
O servidor confirmou o projeto, o branch, o usuário e o tipo das colunas.

| Destino Vercel | Valor | Endpoint | Branch Neon (servidor) | Colunas KG |
| --- | --- | --- | --- | --- |
| Preview genérico `DATABASE_URL` | `PREVIEW_MAIN_RUNTIME_DATABASE_URL` | `ep-purple-morning-b6ajdsfk-pooler`, `pgbouncer=true`, `sslmode=require` | `br-lively-feather-b6esh64a` | integer |
| Preview genérico `DIRECT_URL` | `PREVIEW_MAIN_RUNTIME_DIRECT_URL` | `ep-purple-morning-b6ajdsfk`, `sslmode=require` | `br-lively-feather-b6esh64a` | integer |
| Preview `claude/estoque-manual-kg-001` `DATABASE_URL` | `PREVIEW_KG_RUNTIME_DATABASE_URL` | `ep-red-wave-b6bbj667-pooler` | `br-wandering-band-b6ov7vmt` | double precision |
| Preview `claude/estoque-manual-kg-001` `DIRECT_URL` | `PREVIEW_KG_RUNTIME_DIRECT_URL` | `ep-red-wave-b6bbj667` | `br-wandering-band-b6ov7vmt` | double precision |

Todos usam o usuário `preview_runtime` (só DML) e a database `omnigestao_preview`.

## 4. Mudanças exatas (NÃO aplicadas)

Roteiro: `harness/p3-vercel-env.cjs`.
- `plan` é só leitura. Foi executado e imprimiu exatamente as operações abaixo.
- `apply` recusa sem `P3_AUTORIZADO=1` (provado).
- O roteiro altera entradas por **id**, só com `target=[preview]`, e recusa qualquer entrada que inclua production ou
  development.
- O valor vai só no corpo HTTPS da API, como `type=sensitive`.

| # | Operação | Chave | Escopo / branch | id | Valor |
| --- | --- | --- | --- | --- | --- |
| P3-a | PATCH | `DATABASE_URL` | preview genérico | `CAgFUTJYNOJb64j1` | `PREVIEW_MAIN_RUNTIME_DATABASE_URL` |
| P3-a | PATCH | `DIRECT_URL` | preview genérico | `WfY0iLLQ8cbQOXHd` | `PREVIEW_MAIN_RUNTIME_DIRECT_URL` |
| P3-b | POST | `DATABASE_URL` | preview `claude/estoque-manual-kg-001` | novo | `PREVIEW_KG_RUNTIME_DATABASE_URL` |
| P3-b | POST | `DIRECT_URL` | preview `claude/estoque-manual-kg-001` | novo | `PREVIEW_KG_RUNTIME_DIRECT_URL` |
| P3-c (recomendado, separável) | DELETE | `DATABASE_URL` + `DIRECT_URL` | 4 branches ops-v4 | `zDw96…`, `4NqAF…`, `5u6g5…`, `KBjEH…`, `vixMe…`, `kHczi…`, `fEQYz…`, `tbPaD…` | caem no genérico |

**Por que a P3-c.** O destino desses 8 é ilegível. Se apontarem para a produção ou o candidate, um push futuro
nessas branches cria preview com essa credencial. Nenhum deployment READY usa essas entradas. As demais envs dessas
branches (`AUTH_*`, WhatsApp, `CONTADOR_*`) ficam como estão.

**Fica intocado:**
- `DATABASE_URL`/`DIRECT_URL` de Production;
- o `DIRECT_URL` de Development;
- todas as outras chaves;
- o projeto `omni-gestao`;
- aliases e domínios.

**Comando, depois da autorização:**
`P2_GENERATED_FILE=C:\Projetos\secrets\neon-preview\generated.env P3_AUTORIZADO=1 [P3_LIMPAR_OPS_V4=1] node harness/p3-vercel-env.cjs apply`.
Ele relê os metadados ao final.

**Reversão:**
- O valor antigo do genérico é sensitive e não pode ser relido. Voltar a ele exige a cópia do operador, e isso
  reintroduziria a credencial que alcança a produção.
- A P3-b se desfaz com DELETE dos 2 ids novos.

## 5. Precedência, compatibilidade e isolamento

- **Precedência:**
  - Um deployment Preview da branch `claude/estoque-manual-kg-001` usa a entrada com `gitBranch` daquela branch
    para a chave; as outras branches usam a genérica.
  - O override cobre **as duas** chaves. Se cobrisse só uma, o Prisma misturaria `DATABASE_URL` do filho com
    `DIRECT_URL` do main.
  - As envs são retrato do build. Mudanças valem só para deployments **novos** ou **Redeploy**; deployments
    existentes não mudam.
- **Compatibilidade do Prisma:**

  | Combinação | Resultado |
  | --- | --- |
  | Main (cliente `Int`) → preview main (`integer`) | ✓ |
  | PR #315 (cliente `Float`) → `pr315-kg` (`double precision`) | ✓ |
  | Falta do override (Float sobre integer) | `22P03`, sem gravar, visível |
  | Cliente `Int` sobre o `pr315-kg` (a combinação perigosa, 13 → 6e-323) | só se o override vazasse para outra branch, e ele é por nome exato |

  **Depois do merge da #315** a main passa a gerar cliente `Float`, então o preview main precisa receber a
  migration KG antes. Isso fica registrado para o pós-merge.
- **Isolamento:**
  - `preview_runtime` só faz DML: sem `CREATE`, `BYPASSRLS` nem `CREATEROLE` (P2.1).
  - O dono `omnigestao_preview_owner` nunca vai para a Vercel.
  - O projeto Neon é outro, em outra org. A senha não abre a produção.
- **Fica fora desta mudança** (relatado; cada item exige autorização própria):
  - Preview e Production compartilham `AUTH_SECRET`, `CONTADOR_SESSION_SECRET`, `CONTADOR_PIN`,
    `ADMIN_DEFAULT_PASSWORD`, `NEXTAUTH_URL` e os tokens WhatsApp.
  - Contenção do `AUTH_SECRET`: o `jwt` relê o `adminUser` no banco de quem valida, e o banco sintético usa ids `cuid`.
  - Os tokens WhatsApp são reais nos previews.
- **Efeito colateral esperado:** previews de **todas** as outras branches passam a abrir um banco sintético (1 loja,
  1 admin `admin@preview.invalid`), sem os dados do candidate.
  - O CI não depende de preview Vercel: os workflows usam PG local isolado.
  - Quem usa preview para smoke com dados do candidate perde esse uso.

## 6. Deployments antigos com credencial que alcança a produção

| Projeto | READY | Credencial do retrato | Risco |
| --- | --- | --- | --- |
| `omni-gestao-pro` Preview | **55** (31 branches; a PR #315 tem 6, de `a064c57` a `b00b230`; o mais recente é de 2026-10-26, `codex/pdv-padaria-kg-guard-ux-003`) | genérico: `neondb_owner@candidate` no endpoint da produção, **mesma senha da produção** | **ALTO**: o retrato não muda com a P3. Deployment Protection **desligada**, então as URLs são públicas. O app só conecta ao candidate (dados pessoais de julho), mas a credencial embarcada abre `omnigestao_prod` |
| `omni-gestao-pro` Production | 15 (2026-10-23 a 2026-10-27, atual `34b70a1`) | produção | legítimo |
| `omni-gestao` Preview | 53 | sem `DATABASE_URL` | nenhum |
| `omni-gestao` Production | 3 | Supabase antigo (2026-05) | fora do Neon. A senha Supabase já consta como vazada (rotacionar) |

A P3 **não** resolve os 55 retratos. Fecham por um destes caminhos:
- **(a)** corte de CONNECT do `neondb_owner` em `omnigestao_prod` na janela (`rollout/04`/`05`, provado no ensaio 002);
- **(b)** troca de senha do `neondb_owner` no pós-janela, que também desliga o candidate para eles;
- **(c)** excluir os previews antigos (pede autorização; não se desfaz);
- **(d)** ligar Deployment Protection Standard (configuração do projeto, separada).

Expiram também pela retenção. Os mais antigos READY são de 2026-08-16.

## 7. Validação dos deployments novos (P4, sem segredo em comando ou log)

1. **Antes do build:** `plan` de novo. Deve mostrar 0 operações pendentes de PATCH/POST: genérico atualizado,
   override presente.
2. **Deployment de teste da main** (`vercel deploy` sem `--prod`, de checkout limpo de `origin/main`):
   - log com `MIGRATION_SKIPPED`;
   - login `admin@preview.invalid` funciona;
   - no banco, pelo dono e só leitura: `pg_stat_activity` do `br-lively-feather-b6esh64a` mostra `preview_runtime`.
3. **Preview da #315** (depois de conflito resolvido + R5 + push):
   - `pg_stat_activity` do `br-wandering-band-b6ov7vmt` mostra `preview_runtime`;
   - entrada 3,960 kg grava `3.96`;
   - o main segue `integer`.
4. **Prova de destino (P5):**
   - produto `PREVIEW-ISO-003-<nonce>` no preview;
   - no banco preview, 1 linha com o nonce;
   - produção, só leitura (`default_transaction_read_only=on`): 0 linhas.
5. **Deployments criados depois da troca** (`/v6/deployments`, `created` > horário da P3) com o retrato antigo:
   esperado 0.

Os segredos só entram pelos arquivos em `C:\Projetos\secrets\neon-preview\`. Nenhum comando leva URL, senha ou
token em argv.

## 8. PR #315

- Estado: `OPEN`, head remoto `b00b230`, `CONFLICTING`/`DIRTY`. O commit local `5e1feb9` (só docs) não foi enviado.
- `git merge-tree origin/main(34b70a1) HEAD` conflita em `app/api/ops/inventory/lookup/route.ts`,
  `app/api/ops/inventory/route.ts`, `components/dashboard/vendas/pdv-classic.tsx` e `lib/pdv-scan-lookup.ts`.
  Os 4 são funcionais.
- A Vercel faz o build da ponta da branch mesmo com conflito. Por isso, **qualquer push na branch antes da P3 cria o
  7º preview com a credencial que alcança a produção**. A P3 precisa vir antes de qualquer push.
- Ordem: P3 → resolver o conflito (merge de `origin/main`) → R5 → push (P4). A resolução não toca `prisma/`; se tocar,
  refazer a P2.3 em branch novo.

## Resultado

```
P3_PREFLIGHT=PASS
VERCEL_PROJECTS_VERIFIED=omni-gestao-pro (100 envs, 4 overrides ops-v4, 0 compartilhadas, 0 custom env) · omni-gestao (15 envs, Preview sem DB, Ignored Build)
PREVIEW_DEFAULT_TARGET=nameless-frost-19035275 / br-lively-feather-b6esh64a (ep-purple-morning-b6ajdsfk[-pooler]) · preview_runtime · omnigestao_preview
PR315_BRANCH_TARGET=claude/estoque-manual-kg-001 → br-wandering-band-b6ov7vmt (ep-red-wave-b6bbj667[-pooler]) · preview_runtime · omnigestao_preview
PRODUCTION_ENV_UNCHANGED=YES
OLD_DEPLOYMENT_RISK=HIGH: 55 previews READY do omni-gestao-pro com neondb_owner (senha da produção), públicos (Protection off); a P3 não os altera
PR315_CONFLICT_R5_PENDING=YES (4 arquivos funcionais; R5 obrigatória antes da P4)
READY_FOR_P3_ENV_AUTHORIZATION=YES
```
