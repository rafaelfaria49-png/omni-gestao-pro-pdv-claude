# COMPAT-PROFISSIONAL-001 — evidências

Branch `claude/compat-profissional-001` (worktree isolada sobre `main` `bec341d`).
Nada foi aplicado em Production: sem acesso ao banco produtivo, sem deploy, sem migration fora de banco local descartável.

## Banco local descartável (PostgreSQL 17, `127.0.0.1:55441`, cluster no scratchpad, já apagado)

1. Baseline = `prisma migrate diff --from-empty --to-schema-datamodel <schema da main>` + CHECKs da `20261107120000`.
2. Aplicada a migration `20261113120000_compat_profissional` **exatamente como no repo** (`psql -1 -v ON_ERROR_STOP=1`): OK.
3. Drift banco × `prisma/schema.prisma` depois da migration: `-- This is an empty migration.` (zero).

## Testes

| Suíte | Resultado |
|---|---|
| Vitest catálogo/acessórios/compat/rotas (`lib/catalogo-aparelhos lib/acessorios lib/compat lib/catalog app/api/catalogo`) | 280 passed, 0 failed |
| Integração PostgreSQL real (`compat-store.integration` + `loja-catalogo-store.integration`) | 24/24 |
| Autorização/isolamento das rotas novas (gates reais) | 11/11 |
| Vitest completo | 87 arquivos falham — **os mesmos 87 falham na `main`** (583 falhas lá × 582 aqui; ambiente: Node 26/jsdom, xmllint, bancos `*_TEST_DATABASE_URL` ausentes). Nenhuma falha nova. |

## Verificação visual (app real, `next dev` local + login NextAuth com conta sintética)

`screenshots/` — Películas (consulta embutida), Capinhas (consulta com "onde está", mesma capinha
por status, estoque por modelo × estoque geral), vínculos com confirmação física, painéis/fileiras
(duplicidade por grafia recusada), cores (paleta + cores da loja; "PRETO" recusado), cadastro de
modelo com Fabricante › Marca › Linha e nome padronizado, preferências, relatórios, celular 390 px
(overflow horizontal = 0 px).

Vendas do relatório são linhas sintéticas inseridas no banco local descartável (não passaram pelo
PDV). O fluxo de venda no PDV é coberto pelo E2E `e2e/cadastros-ramos/11` (CI).

## Rodada 2 (2026-11-14)

### PDV real (app local + PostgreSQL descartável + loja/conta/produtos sintéticos) — 20/20
Script Playwright contra o PDV Clássico (`/dashboard/vendas`), caixa aberto na loja sintética:
- capinha genérica com modelo/cor **opcionais**: rótulos "(opcional)", Fumê (desativada na loja) **não** oferecida,
  cor própria "Azul bebê" oferecida; **Enter no campo vazio** adiciona sem identificar; venda gravada com
  `accessorySelection: {version:1}`; baixa de 1 no estoque geral;
- mesma capinha com modelo "Samsung Galaxy A06" + "Azul bebê": "Onde está: Painel 1"; venda gravada com
  `colorKey:"outra"`, `customColorLabel:"Azul bebê"`, modelo; baixa do MESMO estoque geral;
- capinha com modelo **obrigatório**: Enter vazio não adiciona, botão desabilitado, cancelar sem efeito;
- **servidor**: cópia do POST real da venda (que o PDV marcou `tentativa:"finalize"`) reenviada como venda
  nova com `colorKey:"fume"` → **409** "A cor "Fumê" está desativada nesta loja…"; nenhuma venda criada,
  estoque intacto. A MESMA venda como reenvio da fila (`tentativa:"auto"`) → **200**, baixa de 1 (não manda
  venda física paga para "ação necessária").
Capturas: `screenshots/pdv-0*.png`.

### Produção — somente leitura
Sessão com `default_transaction_read_only=on` (confirmado `transaction_read_only = on`) e guarda de
identidade (`omnigestao_prod`: 11 lojas, 2520 vendas, última 2026-11-13). Nenhuma escrita.
- `20261107120000_catalogo_aparelhos_loja` (#339): **aplicada** em 2026-11-08, não revertida,
  checksum `57b3914343f26652…` = repositório; tabelas e 4 CHECKs presentes; 1 modelo manual cadastrado.
- `20261110120000_aparelhos_fisicos_serializados` (#347): **não aplicada** (tabela ausente).
- `20261113120000_compat_profissional`: não aplicada (esperado).
⚠️ Um deploy de Production com migrations liberadas aplicaria **as duas pendentes** (#347 e esta), em ordem.

### CI — análise das falhas da rodada 1
| Job | Causa | Situação |
|---|---|---|
| Ramos e Cadastros / validate (smoke) | **Regressão desta PR**: o formulário de produto passou a importar o provider de loja ativa (puxa `next-auth/react`, que lê `process.env`) → `process is not defined` no harness isolado | Corrigido (loja por prop); smoke local PASS 1440/390/320 |
| Aparelhos / validate | Defeito do script de CI: após o merge do #347 a base já tem `aparelhos_fisicos` e o script reaplicava a migration | Corrigido sem enfraquecer: baseline = main **antes** da migration de aparelhos + aplica ela (com CHECKs) e as posteriores; local: DRIFT_ZERO e 45/45 |
| e2e-authenticated (Padaria, vCard) | Logout com cookie ressuscitado — corrida conhecida (CI #342; correção na PR #345, em auth/proxy). A mesma asserção falhou na execução 43254259521 da branch do #347, sem código do Compat (4 testes) | Pré-existente e intermitente; não alterado aqui (área protegida) |

### Revisão independente (Codex Desktop 0.160, gpt-6.1-sol, sandbox somente leitura)
| Passada | Escopo | Veredito | Resultado |
|---|---|---|---|
| 1 | a3f1953 + fc58117 | REQUEST_CHANGES | 1 P1 (venda offline recusada pelo guard) + 6 P2 (P2021 abortando a transação; principal único; endereço não idempotente; resposta atrasada em Vínculos; devoluções canônicas ignoradas; produto desativado sumia do relatório) |
| 2 | + 0a39b42 | REQUEST_CHANGES | 4/7 confirmados; P1 parcial (venda na fila sem flag; janela dependia do relógio do PDV), recarga pós-gravação, desconto duplo de devolução |
| 3 | + 404a216 | REQUEST_CHANGES | 6/7 confirmados; P2 novo: writer V2 descartava o sinal de finalização |
| 4 | + 590c2d8 | ver PR | — |

Correções principais: o PDV envia `tentativa` (finalize/auto/manual) no POST; o servidor só recusa cor
desativada na finalização ao vivo de venda não registrada offline (relógio fora da decisão); `to_regclass`
antes de consultar a tabela; índices únicos `compat_localizacoes_endereco_key` e
`compat_localizacoes_principal_key` (conferidos em `pg_indexes` — o `migrate diff` do Prisma não os
representa) + tratamento de corrida; recargas com a seleção atual; devolução reconciliada por item.
