# ESTOQUE-KG-RUNBOOK-HARDENING-005 — endurecimento da documentação de rollout (2026-10-28)

**Só documentação.** Nenhuma consulta ao banco produtivo, nenhum papel, credencial, env da Vercel, migration,
deploy, alteração de dados, commit, push ou merge. Registros locais P4 (`fb88ab4`) e P5
(`preview-isolation-003/13-p5-runtime-db.md`, `harness/p5-prova-runtime.cjs`) e os WIPs de
`preview-isolation-003/README.md` e `ESTOQUE_MANUAL_KG_PREVIEW_ISOLAMENTO.md` intocados.

```
ROLLOUT_READINESS=NO-GO
LEGACY_WRITERS_INVENTORIED=YES
ROLE_CUTOVER_READY=NO
QUEUES_AND_CASH_GATES_READY=NO
RECOVERY_PLAN_READY=YES
RUNBOOK_HARDENED=YES (pendente de revisão e commit autorizados)
PRODUCTION_CHANGES=0
```

## Arquivos

| Arquivo | Mudança |
| --- | --- |
| `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_RUNBOOK.md` | reescrito como sequência canônica A1–A8 / J0–J13 / P1–P5 com gates; §2 escritores legados; §3 congelamento; §5 ponto de não-retorno; §6.1 drift 0019; §6.2 Preview `main`; §7 recuperação por fase F0–F4 |
| `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md` | contagens de 2026-10-28; premissa da retenção removida; aponta o runbook como sequência canônica; ponto de não-retorno no passo 8; §7 com congelamento e P2 e mapeamento para A/J/P |
| `…/rollout-readiness-004/README.md` | nota no topo: checklist incorporado ao runbook |

## Correções obrigatórias do GOAL

| # | Pedido | Onde |
| --- | --- | --- |
| 1 | Retenção de 30 dias não elimina deployments; 15 Production + 56 previews só saem do banco pelo corte | runbook §2; remediação §1 item 7, §2, §3 |
| 2 | Drift do índice da 0019 documentado, distinto de drift novo, sem correção automática | runbook §6.1, A1, J10 |
| 3 | Ponto de não-retorno no COMMIT do J8; proibidos redeploy `Int`, revert da #315, CONNECT ao papel antigo | runbook §5, J8, F3; remediação §4 passo 8 |
| 4 | Migration do `main` do Neon Preview após a #315, sem preview `Float` sobre banco `integer` | runbook §6.2 (P2) e congelamento de push até P2 PASS (§3) |
| 5 | Congelamento de merges, sessões de IA, scripts locais e conectores | runbook §3, A7, A8, J0 |
| 6 | Coerência A/J/P com gates e recuperação | runbook §4 (gate por passo) e §7 (fase por passo) |

## Decisões de coerência tomadas (para a revisão conferir)

- **"Desfazer a migration" saiu da tabela de recuperação.** O runbook anterior permitia voltar a `integer` sem fração
  "com o app voltando para `Int` na mesma janela", o que contradiz o ponto de não-retorno pedido. Agora é plano novo,
  revisado, fora deste runbook (§5).
- **Abort antes do J8 ficou explícito (F1/F2):** `99` → envs de volta a `neondb_owner` → revert do merge (permitido só
  antes do COMMIT) → remover build `Int` com `omni_runtime_v2`. O runbook anterior dizia só "nunca voltar o deployment
  anterior" e "desligar a trava sem migrar", que reabre com escrita de estoque falhando `22P03`.
- **J7 refaz a lista de deployments** imediatamente antes do J8, não só no J4: um "Redeploy" de build antigo entre J4 e J8
  nasceria com a credencial nova e sobreviveria ao corte.
- **J10 ganhou NaN/denormais e `migrate status`**; o critério do `migrate diff` passou de "sem diferença" (que falharia
  pela 0019) para "só a renomeação conhecida".
- **Congelamento de push em branches vai até P2 PASS**, não só até J13: é o que impede preview `Float` sobre o `main`
  `integer` do Preview.
- **Risco novo registrado (§5):** "Redeploy"/"Promote" de deployment anterior reconstrói com as envs atuais
  (`omni_runtime_v2`). É caminho humano, não de código; a única barreira de banco é o `07` (A6). P5 traz a decisão de
  remover os deployments de Production anteriores à #315.

## Inconsistências que ficaram (fora dos arquivos autorizados ou com WIP)

- `ESTOQUE_MANUAL_KG_PREVIEW_ISOLAMENTO.md:97` ainda diz "A retenção de 30 dias os expira" e `:23` conta 14 deployments.
  O arquivo tem WIP local não commitado (P4/P5); não foi tocado. Corrigir junto com o commit desse WIP.
- `rollout-remediation/50-vercel-inventario.md:20` (evidência de 2026-10-25) afirma que a retenção já apaga
  deployments. Evidência histórica não foi reescrita; runbook e remediação registram a refutação.
- `rollout/07-guard-check-opcional.sql:6` cita "14 deployments vivos" em comentário. Script não alterado.
- O roteiro `harness/p2-preparo-preview.cjs` recusa o branch `main` na fase `kg`; P2 precisa de fase nova revisada
  ou execução manual (runbook §6.2 passo 4).

## Bloqueios restantes do GO

1. Autorizações humanas: A1, A3, A4, J0–J13 (inclusive J3, envs de Production), P1–P5.
2. Credenciais `omni_runtime_v2`/`omni_migrator` não geradas (A2); `01`/`02` não aplicados em produção (A3)
   → `ROLE_CUTOVER_READY=NO`.
3. Checklist das duas lojas não devolvido; caixas `ABERTA` não conferidos em produção (A1/J0)
   → `QUEUES_AND_CASH_GATES_READY=NO`.
4. Linha de base de produção (fingerprint, lock, dependências, `datacl`, drift real da 0019) não lida (A1).
5. Decisão sobre o `07` (A6) e confirmação do conector Neon do ChatGPT (A7) pendentes.
6. Congelamento ainda não declarado (A8).
7. Este diff documental não foi revisado nem commitado; commitar muda o head da #315 (push exige autorização).

## Próximo gate mínimo autorizável

**A1 — leituras de produção só leitura.** É o menor passo com contato em produção e destrava os itens 3 (caixas) e
4 (linha de base e drift real). Escopo exato: as consultas do runbook §4/A1 em sessão `BEGIN READ ONLY` /
`default_transaction_read_only=on`, mais `prisma migrate status` e `prisma migrate diff --from-url … --to-schema-datamodel`
com o schema da #315; nenhuma escrita, nenhum papel, nenhuma env. Saída registrada em
`_evidence/ESTOQUE-MANUAL-KG-001/` com valores de credencial redigidos.

Sem contato com produção e em paralelo: **A2** (gerar as senhas offline e validar as URLs sem conectar) e a revisão
deste diff (A5).
