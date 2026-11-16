# PADARIA-KG-PRODUCTION-GO-LIVE-FINAL-001 — 2026-11-16

Executor: Claude Code. Autorização do dono: APPROVED_2026-11-16, condicionada aos gates.
**Resultado: SAFE_PREFLIGHT_COMPLETE_WAITING_FOR_WINDOW.** Nenhuma escrita em Production
(banco, envs, deployments) foi feita nesta execução.

## 1. Reconciliação da pilha com a main `5126589`

| PR | Head antes | Head depois | O que entrou |
| --- | --- | --- | --- |
| #315 | `2284491` | `8028511` | merge main `b51e5ec` (12 conflitos, união KG + vestuário/IMEI) + alinhamento de 2 testes da main ao contrato KG |
| #335 | `dd264a6` | `ae8c9d5` | merge #315 `828bb6d` (7 conflitos) |
| #336 | `ef38260` | `e480893` | merge `dbb4c51` (travas de aparelho portadas ao escritor único F8) + fix `d1f0468` |
| #337 | `3ea671b` | `a7f69dd` | merges; código idêntico à #336 salvo a migration 20261106 e o runner |

Defeitos de integração achados e corrigidos (todos introduzidos pela junção main × pilha):

1. `lib/compat/compat-store.ts` (main) lia `itens_devolucao_venda.quantidade` como obrigatório; desde a
   20261108 a coluna é anulável (linha KG usa `quantidadeKg`) → TS2345. Linha KG soma 0 unidades.
2. P2 da revisão independente: `APARELHO_DEVOLUCAO_NAO_INTEGRADA` (main) não estava em
   `DEVOLUCAO_RECUSA_DEFINITIVA` (#336) → 409 tratado como "aguardar", tentativa incerta presa no
   sessionStorage travava o F8 da aba. Teste RED→GREEN em `trocas-peso-policy.test.ts`.
3. `lib/vestuario/runtime-guards.test.ts` (main) comparava objeto exato sem `ajusteDisponivel` (#315).
4. `produto-ficha-link.component.test.ts` (#315): CadastrosHub da main importa Server Action de
   vestuário (NextAuth) → mock igual ao `business-catalog.component.test`.

## 2. Validação local

- `npm run typecheck`: #315 e #335 exit 0; topo exit 2 (item 1 acima) → corrigido; CI remota é o gate final.
- Suíte KG (`scripts/pdv/run-manual-kg-tests.mjs`, PG 17 descartável 127.0.0.1:55479, Node 22): **86/86** +
  verificador de compatibilidade **35 checks PASS**; valores inteiros históricos preservados.
- `vitest` alvo: `lib/vestuario/` + availability 111/111; ficha-link 4/4; trocas-peso-policy 10/10.

- **CI remota (heads finais): #315 `8028511` 14/14 · #335 `ae8c9d5` 12/12 · #336 `e480893` 12/12 · #337 `a7f69dd` 6/6**, inclusive E2E autenticado. 1ª rodada (antes dos itens 3–4) tinha 4 falhas reais + `pdv-scale-visor` (flaky conhecido), todas resolvidas.

## 3. Revisão independente

- R3 Codex: **não executada** — conta sem cota ("try again at 5:19 PM", log `02-codex-sem-cota.txt`).
- Substituta: revisor Claude de contexto limpo, somente leitura, pacote `03-revisao-pacote.md`:
  **APPROVE_WITH_NOTES**; P2 corrigido (item 2); P3 aberto: falta teste PG das travas de aparelho no
  escritor F8 (proteção conferida por leitura de código).

## 4. Auditoria RO de Production (2026-11-16 16:42Z) — `01-neon-production-readonly.txt`

- Identidade lida do servidor: `dry-mouse-36002471` / `br-muddy-meadow-ac7ah2wl` / `ep-summer-tooth-acltc6wi` /
  `omnigestao_prod`, transação READ ONLY + ROLLBACK.
- `_prisma_migrations`: **29**, 0 pendentes/falhas. Todas as migrations da main aplicadas.
- Checksums: 28 iguais ao blob git (LF). `20261113120000_admin_session_revocation` = mesmo conteúdo em
  **CRLF** (aplicada de checkout Windows pela frente de auth) — não é pendência, registrar.
- KG ausente: 7 colunas `integer`, 0 objetos `manual_kg_*`, 0 CHECKs do `07`; donos = `neondb_owner`.
- ACL do database igual ao retrato A3 (`omni_runtime_v2=c`, `omni_migrator=c`); só `plpgsql` (A7b mantém).
- **Caixas ABERTOS: `loja-1` (desde 13:28Z) e `loja-2` (desde 11:57Z)** — lojas operando → J0 impossível agora.
- Lojas: única padaria cadastrada = `cliente-bc1c8ad5-5c08-4aaa-b125-7c1076a72f2e` "Padaria TESTE".
- Vercel (metadados): Production = `5126589` (`dpl_13BEUE8…`, build `MIGRATION_SKIPPED`);
  `MIGRATION_AUTHORITY_ENABLED` alterada 2026-11-15 23:15Z — o build de vestuário `dpl_9RYm…` rodou
  `MIGRATION_RUN`; os posteriores registram `MIGRATION_SKIPPED`. Reconferir no log do build do J4.
  `PDV_MANUAL_KG_*` e `STOCK_WRITES_FROZEN` ausentes.

## 5. MIG-X

- Checkout #315 (`8028511`) × Production: pendente **exatamente** `20261025120000_estoque_quantidade_fracionada` (`f07242c4…`).
- Topo (#337) × main: só as 4 KG — `20261025` `f07242c4…`, `20261029` `8757ee99…`, `20261106` `56ac126a…`,
  `20261108` `450b451b…`. `07` = `dea40868…` (4.996 B LF) = artefato do A6.

## 6. Gates (situação nesta execução)

| Gate | Status |
| --- | --- |
| A6 | DECIDIDO (aplicar 07 no J9); sha conferido |
| A7 / A7b | A7 PENDENTE (exige confirmação humana de conectores/sessões congelados); A7b PASS (só plpgsql) |
| A8 | PENDENTE — 2 caixas abertos, sem janela marcada |
| V1 | inventário 2026-11-08 mantido; refazer no J0/J7 |
| MIG-X | PASS hoje |
| N1 | não executado (só na janela, J1) |
| L1 | PENDENTE — conferência presencial dos terminais |
| R3 | Codex pendente (sem cota); substituta APPROVE_WITH_NOTES |
| F1 | desligado; storeId da padaria piloto **não confirmado** |
