# Rollout — migration `20261107120000_catalogo_aparelhos_loja`

GOAL: CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001. **Não aplicada em Production.** Aplicada só no
Neon Candidate sintético `pr-acc-compat` (projeto de Preview `nameless-frost-19035275`), para o Preview da PR.

Checksum (sha256 do `migration.sql`, igual no blob do Git e no Candidate):
`57b3914343f26652fd5269ae9cc4fa09f8faa922153575792850f830911a6e45`.

## O que a migration faz

Aditiva. Cria duas tabelas novas, sem tocar em tabelas existentes (só FK → `stores`):

| Tabela | Conteúdo | Unicidade |
|---|---|---|
| `catalogo_aparelhos_loja_modelos` | modelos cadastrados manualmente por loja | `modelKey` global; `(storeId, brandKey, nameKey)` |
| `catalogo_aparelhos_loja_compat` | decisões da loja sobre pares de película (`adicionar` / `suprimir`) | `(storeId, categoria, modelKeyA, modelKeyB)` |

CHECKs: `acao ∈ {adicionar, suprimir}`, `categoria ∈ {pelicula_tela, capinha}`, par ordenado
`modelKeyA < modelKeyB` **em `COLLATE "C"`** (mesma ordem do código; sem isso um banco ICU/pt_BR recusa
pares válidos como `motorola_moto_g04 × motorola_moto_g_power`), `modelKey LIKE 'manual\_%'`. Independente das migrations KG (#315/#335/#337):
timestamp posterior, nenhum objeto em comum.

## Comportamento antes da migration (código já publicado, tabela ausente)

- Busca de aparelhos/películas: **continua funcionando** só com o catálogo global
  (leituras degradam em silêncio — P2021 → lista vazia, um aviso no log).
- Cadastrar/editar modelo e decidir compatibilidade: **503** "Catálogo da loja indisponível".
- Nada derruba o PDV.

## Atenção: merge na `main` aplica a migration em Production

`scripts/vercel-build.mjs` roda `prisma migrate deploy` quando o guard confirma Production + flag
explícita. Portanto o **merge** desta PR é o momento do rollout — exige autorização do
proprietário e janela própria.

## Passos sugeridos (quando autorizado)

1. Validar em banco descartável (feito neste GOAL): baseline da `main` + esta migration → `prisma
   migrate diff` vazio contra o schema.
2. Aplicar no Candidate e rodar o smoke (feito em 2026-11-07 no Neon `pr-acc-compat`, via Preview da
   PR #339: 25/25 — evidências em `docs/ai-execution/_evidence/CADASTROS-ACESSORIOS-COMPAT-MANUAL-FINALIZACAO-001/`).
3. Antes do merge: `prisma migrate status` de Production só leitura deve listar esta migration como
   a única pendente; conferir o checksum acima.
4. Merge autorizado → deploy aplica a migration → smoke em Production com conta da loja piloto.

## Reversão

`docs/catalogo/rollout/rollback_20261107120000_catalogo_aparelhos_loja.sql` (manual): DROP das
duas tabelas + remoção do registro em `_prisma_migrations`. Perde apenas modelos manuais e
decisões por loja; `Produto.metadata.catalogoAparelhos` e os snapshots de venda (texto) ficam.
Após o DROP, o código volta ao modo degradado descrito acima (sem quebrar).
