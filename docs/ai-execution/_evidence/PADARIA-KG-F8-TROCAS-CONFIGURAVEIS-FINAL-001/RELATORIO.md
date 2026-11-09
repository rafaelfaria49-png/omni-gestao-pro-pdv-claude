# PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001 — Relatório

Data: 2026-11-09 · Executor: ZCode (GLM-5.3) · Revisor independente: ver §8 (status verdadeiro registrado).

## 1. Escopo e decisão funcional implementada

Trocas/devoluções (F8) de produtos vendidos por peso, com configuração independente por
loja, conforme decisão expressa do proprietário (que rejeitou o bloqueio comercial
anterior da `PADARIA-KG-F8-INTEGRACAO-SEGURA-001`):

```
F8_KG_EXCHANGE_DEFAULT=ENABLED · F8_KG_EXCHANGE_SCOPE=PER_STORE
F8_KG_EXCHANGE_OWNER_CONFIGURABLE=YES · F8_KG_EXCHANGE_PARTIAL=SUPPORTED
F8_KG_UN_MIXED_EXCHANGE=SUPPORTED
```

Trabalho na PR **#336** (branch `claude/padaria-kg-f8-integracao-segura-001`,
worktree `.worktrees/kg-f8-001`), propagado à **#337** por merge. Bases conferidas no
início: main `ce9228c` · #315 `2284491` · #335 `dd264a6` · #336 `a413ad5` · #337
`3a11f61` — idênticas às do GOAL; nenhuma das branches de baixo foi alterada.

## 2. SHAs finais

| Branch | Antes → Depois |
| --- | --- |
| main | `ce9228c` (intocada; MERGE_MAIN=NO) |
| #315 | `2284491` (intocada — nenhum contrato da #315/#335 precisou mudar) |
| #335 | `dd264a6` (intocada) |
| #336 | `a413ad5` → `07df5bb` (implementação + runbook) |
| #337 | `3a11f61` → `38d225f` (merge da #336 + docs readiness/checklist) |

Sem force-push; pilha preservada por merges: main → #315 → #335 → #336 → #337.

## 3. Implementação

### 3.1 Migration aditiva `20261108120000_f8_devolucao_kg_fracionada`
- `itens_devolucao_venda.quantidadeKg NUMERIC(65,30)` + `quantidade` nullable (o par
  exato de `venda_itens` da `20261029120000`); CHECK
  `itens_devolucao_venda_quantity_contract` (XOR quantidade/quantidadeKg, KG > 0 e ≤ 2e9,
  ≤ 3 casas exatas, `inventoryId` obrigatório na linha KG); índice **único parcial**
  `(devolucaoId, inventoryId) WHERE quantidadeKg IS NOT NULL` (duplicata de linha KG por
  devolução é impedida no banco); fingerprint do CHECK retido em COMMENT
  (`f8-kg-return-v1:`) para detectar drift.
- Triggers (mesmos nomes — `manualKgAvailable` continua contando 8 triggers e o
  fingerprint de `venda_itens`, ambos intactos):
  - `manual_kg_guard_return`: venda protegida KG sai do bloqueio ABSOLUTO e passa a
    exigir o escritor transacional do F8 (`omni.f8_kg_return_writer='f8-kg-v1'`); sem o
    GUC mantém `MANUAL_KG_PARTIAL_RETURN_BLOCKED` (gravadores legados protegidos).
  - `manual_kg_guard_return_item`: linha KG exige escritor + **política da loja**
    (`printerConfig->>'pdvTrocasPeso'`; inválido presente = bloqueado) + **teto
    vendido−devolvido por produto** na transação (`f8_kg_return_saldo_disp`;
    `F8_KG_RETURN_EXCEEDS_SOLD`); linha UN aceita quando a venda de origem TEM linha UN
    daquele produto (âncora histórica) — sem âncora, produto por peso no cadastro atual
    segue bloqueado para endpoints legados (verificador 35 checks mantém essa prova).
- Não toca a `07` (A6 intacta), não renomeia trigger, não altera bytes de migrations
  aprovadas; DO-guards recusam aplicação sobre schema divergente.

### 3.2 Servidor
- `lib/pdv/devolucao/trocas-peso-policy.ts` (novo): chave `pdvTrocasPeso`
  (`enabled|disabled`), padrão APROVADO `enabled` na ausência, fail-closed quando
  presente-inválida; helpers de transação (`enterF8KgReturnTransaction`), readiness de
  schema (`f8KgReturnSchemaReady`) e contrato de condição da mercadoria.
- `registrar-devolucao.ts`: unidade HISTÓRICA por linha (KG=gramas inteiras,
  UN=inteiro); venda mista devolve por linha (nunca bloqueia a venda); política da loja
  e readiness relidas DENTRO da transação do commit (pós-lock — configuração mudada
  durante fila pendente não aprova nada com estado velho); crédito KG em
  centavos×gramas inteiros (BigInt, meia-casa para cima, acumulado por produto com
  absorção de centavos na última devolução elegível; Σ créditos ≤ total pago);
  condição da mercadoria obrigatória para KG (perecível) e justificativa obrigatória
  fora de `apto_revenda`; estoque só para apto com unidade de cadastro coerente
  (cadastro que mudou de unidade: crédito exato, sem entrada — 0,3 kg nunca vira 300
  UN); fingerprint de replay unit-aware (0,500 = 0.5; milésimos distintos ≠;
  `u500` ≠ `g500`); status da venda (`devolvida`/`parcialmente_devolvida`) por unidade.
- `elegibilidade.ts`: por linha com `unidade`, saldo em kg com 3 casas, política da
  loja no payload (`trocasPesoPermitidas`) e bloqueio explicado apenas nas linhas KG
  quando desativada.
- Rota `POST /api/ops/devolucao`: zod aceita `quantidadeKg` (string) OU `quantidade`
  (inteiro), `condicao`, `justificativa`; novos códigos mapeados (422/409).
- `PUT /api/stores/[id]/settings`: valida valor da chave (`enabled|disabled`, 400) +
  permissão específica `pdv.configTrocasPeso` (403 para caixa/vendedor/técnico);
  auditoria existente (`logs_auditoria`) registra campo/valor antigo/novo/usuário/IP.
- Permissões: `pdv.configTrocasPeso` na matriz (admin/gerente = sim; caixa/vendedor/
  técnico = não), sempre combinada com `admin.configuracoes` + módulo `settings`.

### 3.3 Interface
- **F8** (`trocas-devolucao.tsx`): por linha — unidade (badge KG/UN),
  Vendido/Já devolvido/Disponível (kg com 3 casas e vírgula pt-BR), campo de peso
  editável com vírgula + botão Máx, stepper UN preservado, crédito estimado,
  condição da mercadoria com justificativa; banner somente quando a loja desativou
  trocas por peso (linhas KG bloqueadas, UN livres); cupom/espelho formatam kg;
  sem duplo envio (tentativa incerta com o mesmo localId preservada, fingerprint
  fracionário).
- **Configurações → PDV** (`PdvSection.tsx`): card "Trocas e Devoluções — Produtos
  vendidos por peso" com os textos aprovados, estado do servidor, confirmação
  explícita para desativar (Dialog), leitura apenas para quem não tem a permissão,
  salvar pela rota única com merge de chaves (padrão server-first do GOAL 007).

### 3.4 Fila offline
- `DEVOLUCAO_RECUSA_DEFINITIVA` ganha `TROCA_KG_DESATIVADA_LOJA`,
  `TROCA_KG_SCHEMA_INDISPONIVEL`, `QUANTIDADE_KG_INVALIDA`, `QUANTIDADE_ITEM_INVALIDA`,
  `CONDICAO_MERCADORIA_OBRIGATORIA_KG`, `CONDICAO_MERCADORIA_INVALIDA`,
  `JUSTIFICATIVA_CONDICAO_OBRIGATORIA`, `LINHA_VENDA_QUANTIDADE_INVALIDA` — erro de
  política é recusa definitiva (sem loop), distinto de transitório; replay reenvia o
  MESMO corpo (localId + itens KG exatos); espelho local não soma UN em saldo KG.
- Local mirror: linha KG valida unidade contra o snapshot da venda, exige condição,
  crédito proporcional local; estoque KG continua autoridade do servidor.

## 4. Testes — RED → GREEN

RED provado: suíte reescrita `f8-venda-kg.pg.test.ts` (15 casos) contra o código
anterior = **13 falhas / 15** (o bloqueio antigo recusava tudo que o novo contrato
exige). Após a implementação, GREEN mantido em execuções repetidas.

| Suíte | Resultado |
| --- | --- |
| `scripts/pdv/run-manual-kg-tests.mjs` (legacy schema → 3 migrations → verificador → 5 arquivos), na #336 | **86/86**, repetido 3× estável |
| — dentro dele: `f8-venda-kg.pg.test.ts` (15 casos: parcial 0,500+0,875+1,000 de 2,375; desconto proporcional e centavos; mista 1,5 kg + 2 UN + 0,75 kg isolada e conjunta; validações de peso; política on/off com UN preservada e bloqueio NO BANCO; isolamento de loja; 2 caixas concorrentes + replay/conflito; cancelamento × devolução; cadastro alterado pós-venda; cliente legado Int; escrita direta sem writer; CHECKs; PUT inválido; reembolso bloqueado + não recebido sem movimento; elegibilidade por linha) | **15/15** |
| — `verify-manual-kg-migration.mjs` (compatibilidade Prisma-315/RLS/CHECKs) | **35 checks PASS** |
| `troca-imediata.pg.test.ts` (regressão UN; 1 caso reescrito p/ identidade histórica) | **34/34** |
| Runner na **#337 mesclada** (sequência COMPLETA do rollout: `20261025` → `20261029` → `20261106` → `20261108120000`) | **86/86** |
| `trocas-peso-policy.test.ts` (política, fingerprint fracionário, RBAC, fila) | **9/9** |
| `fila-devolucao.test.ts` + `lib/operations-store` | **24/24** |
| E2E autenticado `run-manual-kg-e2e.mjs` (build real + NextAuth + Chromium) | **13/13** |
| `npm run typecheck` / eslint dos alterados / `npm run build` | 0 erros / limpo / `PROXY_PRISMA_ARTIFACT_VERIFIED` |
| Testes de componente jsdom (`fila-devolucao-provider.component.test.ts` e afins) | **não executáveis localmente**: jsdom 29 × Node 26 local quebra até um teste-mínimo de ambiente (prova no log); CI (Node 24) é a autoridade — nenhum desses arquivos teve lógica alterada, apenas o módulo importado ganhou campos opcionais |

## 5. MIG-X / rollout

- Ordem provada em PG 17 descartável (porta 55479, initdb próprio): schema legado
  (Int obrigatório, sem KG) → `20261025120000` → `20261029120000` →
  `20261106120000` → `20261108120000_f8_devolucao_kg_fracionada`, com verificação de
  que valores inteiros históricos não mudam e o verificador de compatibilidade 35/35.
- MIG-X atualizado (runbook §0.1/§0.3 + readiness 10b): pendentes do topo = as 4 KG,
  exatamente; migrations de outras frentes (ex.: `20261107120000` do catálogo, já em
  Production) continuam fora do `migrate deploy` do KG. Nenhum código depende de
  estrutura ausente: a devolução KG exige readiness de schema no commit
  (`TROCA_KG_SCHEMA_INDISPONIVEL` quando faltar).
- Rollout W1→W2→W3→F1 inalterado; gates A7/A8/N1/L1/R3-Codex/F1 inalterados; A6
  (script 07 em J9) intacto.

## 6. Segurança produtiva

`PRODUCTION_WRITES=0 · PRODUCTION_MIGRATIONS=0 · PRODUCTION_DEPLOYS=0 ·
PRODUCTION_MERGES=0 · KG_FLAGS_ENABLED=0` — a configuração nova existe apenas no
código candidato; nada foi publicado. Bancos de teste 100% sintéticos e locais.

## 7. Limpeza

Cluster PG 17 próprio (`C:\tmp\pg17-f8kg-trocas`, porta 55479) e bancos descartáveis
serão removidos ao fim da sessão. Worktrees das outras frentes e WIPs intocados.

## 8. Revisão independente — status verdadeiro

- **Revisão de contexto limpo (mesma família do executor)**: ver §8 do relatório final
  da conversa — subagente de revisão foi despachado com o pacote desta entrega; o
  resultado está registrado abaixo em REVISAO_INDEPENDENTE do relatório final.
- **R3 cruzada Codex da #336**: permanece PENDENTE por limite de cota (reabre
  2026-11-10, conforme `KG_RELEASE_CHECKLIST_DONO.md`). Nenhuma aprovação inventada.

## 9. Pendências externas (herdadas, não criadas aqui)

Gates A7/A8 (rollout), N1 (recuperação Neon), L1 (presencial), R3 Codex (#336), F1
(liberação KG por loja) — todas exigem autorização/presença do dono.
