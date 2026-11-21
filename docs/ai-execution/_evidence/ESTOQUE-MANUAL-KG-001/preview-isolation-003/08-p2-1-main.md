# P2.1 `main` — PASS (2026-10-27)

**Autorização do dono:** "Autorizo a P2.1 (fase main) no projeto Neon preview nameless-frost-19035275, conforme
05-p2-procedimento.md. Pare após a P2.1."

**Alvo:**
- projeto `nameless-frost-19035275`, branch `br-lively-feather-b6esh64a`;
- endpoint `ep-purple-morning-b6ajdsfk` (host com célula `c-2`), database `omnigestao_preview`;
- papel `omnigestao_preview_owner`.

Toda sessão psql começou pela trava de projeto, branch, endpoint e database. Qualquer divergência teria abortado
a fase (`must` → exit ≠ 0).

**Pré-condições:**
- `origin/main` = `34b70a1` (fetch antes da execução);
- `public` vazio, `preview_runtime` inexistente;
- arquivo gerado novo.

## Saída (redigida pelo roteiro)

```
main=34b70a1 migrations=23
preview_runtime criado
base aplicada (3355 linhas)
resolvidas=23
status: Database schema is up to date!
drift main (0=vazio): 0
tabelas=110 sem_dml_runtime=0 rls=0
runtime create_public=false create_db=false super=false bypassrls=false createrole=false membros=-
colunas KG (esperado integer): estoque_produtos.stock:integer movimentacoes_estoque.quantidade:integer movimentacoes_estoque.estoqueAntes:integer movimentacoes_estoque.estoqueDepois:integer produto_depositos.quantidade:integer
seed: lojas=1 admins=1 bcrypt_confere=true
runtime_login=preview_runtime · ddl_recusado=42501
main: OK · senhas e URLs do runtime gravadas só em P2_GENERATED_FILE
exit=0
```

A saída confere item a item com o esperado no `05` e com a prova local `04`.

## Segredos

- O arquivo gerado é `C:\Projetos\secrets\neon-preview\generated.env`, fora de repositório git (`not a git
  repository`). Ele tem só estas chaves:
  - `PREVIEW_RUNTIME_PASSWORD`
  - `PREVIEW_ADMIN_EMAIL`
  - `PREVIEW_ADMIN_PASSWORD`
  - `PREVIEW_MAIN_RUNTIME_DATABASE_URL` (pooler `ep-purple-morning-b6ajdsfk-pooler.c-2…`)
  - `PREVIEW_MAIN_RUNTIME_DIRECT_URL`
- Varredura do log contra cada valor do arquivo gerado e do arquivo de segredos: **0 vazamentos**.
- A pasta de trabalho (prisma da main extraído e `base.sql`) foi apagada.

## Não feito (fora da autorização)

- P2.2: o branch `pr315-kg` é criado pelo dono no console, a partir do `main` neste estado.
- P2.3 (`kg`), P3 (Vercel), P4 e P5.
- Production, Candidate, Vercel e PR #315 ficaram intocados. Nada foi commitado.
