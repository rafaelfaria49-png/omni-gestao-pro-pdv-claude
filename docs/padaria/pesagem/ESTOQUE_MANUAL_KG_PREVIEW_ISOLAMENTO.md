# Estoque manual KG — isolamento do Preview antes do rollout (PR #315 · GOAL 003)

**Status: plano pronto para autorização. Nada executado.** Nenhuma env, projeto Neon, papel, deployment,
push ou merge foi tocado. Evidências: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/preview-isolation-003/`.

## 1. Pré-flight (2026-10-26, leitura)

| Item | Estado |
| --- | --- |
| PR #315 | OPEN, head remoto `b00b230`, CLEAN/MERGEABLE, 11 checks SUCCESS |
| Local | `5e1feb9` (só docs/evidências; 0 arquivo fora de `docs/` desde a R4 `cdb1d19`), sem push |
| Segredos em `5e1feb9` | varredura das linhas adicionadas: 0 literal (os 2 acertos são variáveis `${…pw}` e `PW.omni_*`) |
| `origin/main` | `745fb55`, +5 commits desde a base `a288ea2` — só docs/AEP de Pessoas; `merge-tree` limpo |
| Scripts | R2 APPROVE (`neon-rehearsal-002/R2-codex-veredito.md`); o P3 da R2 (linha "Custo") já está corrigido |
| Migration produtiva | não executada: Production atual é `745fb55` (main, sem a migration KG), build com `MIGRATION_SKIPPED`; produção idêntica antes/depois do ensaio 002 |

## 2. Inventário Vercel (`01-vercel-env-inventario.md`)

**omni-gestao-pro** (canônico, Production real)

| Escopo | Banco | Observação |
| --- | --- | --- |
| Production | `DATABASE_URL`/`DIRECT_URL` → `neondb_owner@omnigestao_prod` (2026-07-27) | 14 deployments READY |
| Preview (genérico) | `neondb_owner@omnigestao_prod_candidate` (2026-07-27) | **mesmo papel e senha da produção**; 53 previews READY (6 da PR #315); candidate = cópia de julho com dados pessoais |
| Preview por branch | `DATABASE_URL`/`DIRECT_URL` próprios em 4 branches ops-v4 (2026-10-14/15) | destino ilegível (sensitive); nenhum deployment READY usa |
| Development | só `DIRECT_URL` → `neondb_owner@omnigestao_prod_candidate`, mesmo endpoint da produção | chega a qualquer máquina via `vercel env pull` |

Também compartilhados Preview+Production (fora do escopo de estoque, relatados): `AUTH_SECRET`,
`CONTADOR_SESSION_SECRET`, `CONTADOR_PIN`, `ADMIN_DEFAULT_PASSWORD`, `NEXTAUTH_URL`, tokens WhatsApp.
Risco hoje contido pelo `jwt` de `auth.ts`, que relê `adminUser` por `sub` + `sessionVersion` no banco de
quem valida: um JWT de preview só vale em produção se o id existir lá. Com banco sintético de ids `cuid`, esse
caminho fica sem alvo.

**omni-gestao** (não canônico): Production cancelada pelo Ignored Build Step (`DATABASE_URL` Supabase de
2026-05-08); Preview **sem** `DATABASE_URL`. Nada a mudar.

Builds de Preview nunca rodam migration: `migration-authority-guard.mjs` devolve SKIP fora de `production`.

## 3. Estratégia proposta

**Projeto Neon separado** `omnigestao-preview`, e não um branch do projeto de produção: um branch herda os
papéis do pai **com a mesma senha** (o clone do ensaio 002 aceitou `neondb_owner` com a senha da
produção), o que manteria a credencial. Projeto novo = cluster, papéis, senhas e endpoint próprios.

| Parâmetro | Valor |
| --- | --- |
| Região / PG | `aws-sa-east-1` (igual à produção), PostgreSQL 17 |
| Compute | 0,25 CU fixo, autosuspend 300 s; branch filho idem |
| Retenção de histórico | mínima do plano (1 dia) |
| Database | `omnigestao_preview` |
| Papéis | `omnigestao_preview_owner` (padrão do projeto, confirmado na P2.0; só migrations, nunca na Vercel) · `preview_runtime` criado **por SQL**, só DML, sem `CREATE` no schema, sem BYPASSRLS (espelha `omni_runtime_v2`: o Preview passa a exercitar o modelo de privilégio de pós-janela) |
| Schema | `prisma migrate diff --from-empty --to-schema-datamodel` do `schema.prisma` da main + `migrate resolve --applied` das 23 migrations (a cadeia 0001–0014 não roda do zero) |
| Branch filho `pr315-kg` | criado do `main` do projeto preview; recebe só `migrate deploy` do prisma da PR (aplica `20261025120000`) |
| Dados | só sintéticos: 1 loja, 1 admin `…@preview.invalid` com id `cuid` e senha gerada nova; produtos UN e KG fictícios. Nenhuma importação da produção nem do candidate |
| Custo | Free: US$ 0 (100 CU-h/projeto/mês; 1 GB). Launch: ~15–30 CU-h × US$ 0,106 + ~0,3 GB × US$ 0,35 ≈ **US$ 2–4/mês**. Plano da conta não conferido (console Neon sem sessão no navegador desta máquina) |
| Ciclo de vida | `pr315-kg` excluído depois do merge da #315; projeto preview permanente; reavaliar o candidate depois da troca de senha |

**Por que o branch filho:** o banco Preview compartilhado fica na main (`integer`). Aplicar a migration KG nele
faria todo preview de outra branch (cliente `Int`) gravar bits de inteiro em `double` (13 → 6e-323) em silêncio.
Sem o filho, o preview da #315 (cliente `Float`) só recebe `22P03` em toda escrita de estoque. Override por
branch na Vercel: `claude/estoque-manual-kg-001` → `pr315-kg`.

**Prova local** (`02-prova-preparo-banco-preview.txt`, PG 17 descartável): base da main aplicada, 23 resolvidas,
`migrate status` "up to date", `migrate deploy` "No pending", drift 0; 110 tabelas com DML do runtime,
0 RLS, runtime sem `CREATE`; no filho, `migrate deploy` aplica só a migration KG, drift 0, 5 colunas `double precision`.

## 4. Sequência operacional (executar só após autorização)

1. **Criar** o projeto `omnigestao-preview` (parâmetros do §3) pelo Console. Conferir plano e limites.
2. **Credenciais:** pelo `omnigestao_preview_owner`, `CREATE ROLE preview_runtime LOGIN PASSWORD :'pw'` (senha por variável
   de ambiente, nunca argv/arquivo). As connection strings ficam em arquivo temporário fora do repo e apagado ao final.
3. **Migrations:** roteiro de `harness/prova-preparo-banco-preview.sh`, com trava de destino
   (`current_database()='omnigestao_preview'` e `neon.project_id` do projeto novo, abortando se for
   `dry-mouse-36002471`); grants do runtime + `ALTER DEFAULT PRIVILEGES`; criar `pr315-kg` e rodar `migrate deploy`
   do prisma da PR só nele.
4. **Conta sintética:** seed mínimo; login validado direto no banco (`bcrypt` confere) antes da Vercel.
5. **Vercel, só `omni-gestao-pro` escopo Preview**, valores colados via stdin
   (`vercel env add … preview [branch] < arquivo`):
   - genérico `DATABASE_URL` (pooler) e `DIRECT_URL` (direto) → `preview_runtime@omnigestao_preview`;
   - override `claude/estoque-manual-kg-001` → `preview_runtime@pr315-kg`;
   - remover `DATABASE_URL`/`DIRECT_URL` dos 4 overrides ops-v4 (passam a cair no genérico).
   Antes de colar, classificar cada valor localmente sem imprimir (host ≠ `ep-summer-tooth-acltc6wi`,
   usuário = `preview_runtime`, database esperado). Production e Development intocados.
6. **Deployment de teste:** `vercel deploy` (preview, sem `--prod`) de um checkout limpo de `origin/main` → banco
   genérico; e o push de `5e1feb9` na PR #315 (§5) → `pr315-kg`.
7. **Prova de destino:** no preview, criar produto `PREVIEW-ISO-003-<nonce>` e uma entrada de estoque;
   - banco preview (`omnigestao_preview_owner`): 1 linha com o nonce; sessão do `preview_runtime` em `pg_stat_activity`;
   - produção, só leitura (`default_transaction_read_only=on`): 0 linhas com o nonce;
   - no `pr315-kg`: entrada 3,960 kg grava `3.96`; no genérico, as colunas seguem `integer`.
8. **Previews antigos:** os 53 READY guardam o retrato antigo (`neondb_owner@candidate`), imutável. Seguem
   funcionando contra o candidate; nenhum ganha acesso novo. Conferir que nenhum deployment novo foi criado com
   a env antiga depois do passo 5 (`/v6/deployments`, `created` > horário da troca).
9. **Contenção residual (janela, §4 da remediação):** o `04` tira o CONNECT de PUBLIC e do `neondb_owner` em
   `omnigestao_prod` e o `05` encerra as sessões, então a credencial dos previews antigos, do Development e dos
   `.env` locais deixa de abrir `omnigestao_prod` (provado direto e pooler no ensaio 002). O caminho humano
   (`CREATEROLE` + `ADMIN OPTION`) fecha com a troca de senha do `neondb_owner` no pós-janela, que também
   desliga o candidate para os previews antigos. A retenção de 30 dias os expira.

## 5. Integração com a PR #315

- **Publicar `5e1feb9` só depois do passo 5.** Hoje cada push na branch cria um preview com
  `neondb_owner` (credencial que alcança a produção); depois do passo 5, o push gera o primeiro preview da #315 já
  isolado e serve de deployment de teste do passo 6.
- **Atualizar a main no mesmo push** (merge de `origin/main`): um push, um preview, um ciclo de CI.
- **Reavaliado em 2026-10-26: a main ganhou código funcional.**
  - Novo head: `34b70a1`, merge da #317 `pdv-padaria-kg-guard-ux-003`.
  - O merge agora **conflita** em `app/api/ops/inventory/lookup/route.ts`, `app/api/ops/inventory/route.ts`,
    `components/dashboard/vendas/pdv-classic.tsx` e `lib/pdv-scan-lookup.ts`.
  - A PR #315 aparece como `CONFLICTING`.
  - Resolver o conflito é mudança funcional depois do R4. Antes da P4 exige uma revisão nova (R5).
  - A #317 não toca `prisma/`, então a P2 não é afetada.
- **Migration nunca pelo build:** o merge na janela exige `MIGRATION_AUTHORITY_ENABLED` ≠ `true` em Production
  (último build: `MIGRATION_SKIPPED`). Com a flag ligada, o build rodaria `migrate deploy` antes do corte; com a
  env já em `omni_runtime_v2`, falharia por falta de DDL. Conferir o log do build do merge (`MIGRATION_SKIPPED`).
- `rollout/*.sql` e `estoque-kg-migration-apply.sql` ficam em `docs/`, fora de qualquer script de build, CI ou
  `package.json`.

## 6. CHECK 07 — decisão pendente (não autorizada)

O ensaio no clone **não** autoriza o 07 em produção.

**Consumidores que contornariam a barreira**

- `increment`/`decrement` de cliente `Int` vira no-op silencioso (soma ~1e-323, absorvida).
- Só existe em `lib/os-itens-stock.ts` e na cópia `components/pdv-github-original/lib/os-itens-stock.ts`.
- Os únicos chamadores estão em `components/pdv-github-original/app/api/…`. Esse caminho não é rota do App
  Router e está excluído do `tsconfig`. Logo, é código morto na PR e na main.
- Nenhum SQL cru grava nas 3 tabelas.

**Código da PR**

- Grava valores absolutos em unidades mínimas, dentro de `MAX_STOCK_UNITS` = teto do CHECK.
- O cast `float8 → numeric` usa 15 dígitos, então ruído de ponto flutuante não dispara o CHECK.
- O VALIDATE passou sobre a cópia dos dados reais.

**O que só o 07 cobre**

- Um build `Int` com a credencial nova, por exemplo:
  - "Redeploy" de deployment antigo (rebuild com a env atual);
  - PR de revert.
- Sem o 07, o ensaio provou a corrupção silenciosa (`6.4e-323`).
- "Instant Rollback" usa o retrato antigo (`neondb_owner`), que o corte de CONNECT já recusa.

**Custos**

- DDL fora da migration aprovada.
- Invisível ao Prisma (sem drift).
- Migration futura nessas colunas precisa de DROP/ADD.
- O erro 23514 loga a linha (nome e preço do produto).
- A venda recusada vira 5xx → AUTO_RETRY ruidoso, não silencioso.

**Recomendação técnica: GO**

- Aplicar na janela, logo após a migration, pelo `omni_migrator`.
- Condições: revisão independente do DDL e autorização explícita própria.
- Sem as duas: NO-GO, e o rollout segue só com B.

## 7. Autorizações humanas necessárias (cada uma específica)

| # | Ação | Reversível |
| --- | --- | --- |
| P1 | Criar projeto Neon `omnigestao-preview` (custo do §3) — **FEITA 2026-10-26**: `nameless-frost-19035275`, org Omni Gestão QA (Free), retenção 0 (`03-p1-projeto-neon.md`) | sim (excluir projeto) |
| P2 | Criar `preview_runtime`, aplicar schema/resolve, seed sintético, branch `pr315-kg` + migration KG nele — P2.0 PASS 2026-10-27 pelo conector Neon (`06-p2-0-check.md`); P2.1 PASS 2026-10-27 (`08-p2-1-main.md`); P2.2 feita pelo dono (`pr315-kg` = `br-wandering-band-b6ov7vmt`); P2.3 PASS 2026-10-27 (`09-p2-3-kg.md`) | sim |
| P3 | Alterar envs do escopo Preview do `omni-gestao-pro` (genérico + override #315 + remover 4 overrides ops-v4) — P3.0 preflight PASS 2026-10-27 (`10-p3-0-preflight.md`); **APLICADA 2026-10-27T22:05Z** (12/12, `11-p3-apply.md`), Production/Development/aliases inalterados | sim (valores antigos seguem nos arquivos locais do operador) |
| P4 | Deployment de teste via CLI + push de `5e1feb9` (+ merge da main) na PR #315 | push não se desfaz |
| P5 | Escritas sintéticas nos previews e leitura RO da produção para a prova de destino | — |

Separadas e opcionais:
- trocar o `DIRECT_URL` de Development;
- `AUTH_SECRET` próprio do Preview (exige editar a entrada hoje compartilhada com Production);
- Deployment Protection Standard;
- excluir o branch `kg-rehearsal-002-temp`;
- decisão do 07.

Os itens da janela seguem no §7 da remediação.
