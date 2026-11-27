# PADARIA-GO-LIVE-FASTTRACK-002 — A2 + prontidão do cliente padaria (2026-10-28)

**Nenhuma alteração produtiva.** Nenhuma conexão a Production/Candidate/Preview, nenhum papel no Neon, nenhuma env ou
deployment da Vercel, nenhuma migration, venda real, commit, push, merge ou deploy. Caixa da `loja-2` não tocado. Código
da #318 não tocado. P4, P5, A1, A1.1, hardening 005 e WIPs preservados. Testes só em PostgreSQL 17 descartável local
(porta 55443, `initdb` no scratchpad) com dados sintéticos e credenciais de teste geradas na sessão.

```
A2=PASS
STORE_BASIC_LOGIN=PASS
PRODUCT_REGISTRATION=PASS
UNIT_STOCK=PASS
UNIT_SALES=PASS (condicional: writer v2 + código de numeração da loja provisionado)
CASH_OPEN_CLOSE=PASS (fechamento pela tela exige PIN de supervisor — bloqueio operacional, ver B2)
BROWSER_RECEIPT=PASS (com atrito: passa por "Impressão não enviada" antes do navegador)
KG_STOCK_PREVIEW=PASS
KG_PRODUCTION=BLOCKED
WEIGHT_SALES=BLOCKED
PRINTER_AUTO=UNVERIFIED
CLIENT_BASIC_GO_LIVE=NO-GO (até B1–B3; nenhum é código)
CLIENT_FULL_GO_LIVE=NO-GO
PRODUCTION_WRITES=0
COMMITS=0
PUSHES=0
DEPLOYS=0
```

## Fase 1 — A2 (credenciais offline)

- Não existia credencial anterior (`C:\Projetos\secrets\neon-production-kg\` ausente) → nada sobrescrito.
- `harness/a2-credenciais.cjs gerar`: 2 senhas de 256 bits (`crypto.randomBytes(32)`, base64url, sem escape em URL),
  distintas entre si e das senhas legadas; URLs montadas a partir dos hosts de `neon-production.env`:
  `KG_PROD_RUNTIME_V2_DATABASE_URL` (pooler, `pgbouncer=true`), `KG_PROD_RUNTIME_V2_DIRECT_URL` (direto — o `DIRECT_URL`
  de Production usa o runtime) e `KG_MIGRATOR_DIRECT_URL` (só local; nunca na Vercel). Arquivo criado com `flag: "wx"`
  fora de qualquer repositório git.
- `validar` sem conectar: **30/30** (`01-a2-validacao.txt`) — papel, endpoint, `sa-east-1`, database, `sslmode=require`,
  pooler/direto. Segunda execução de `gerar` **recusa** (sem rotação acidental).
- Prova local do consumo: `rollout/01-papeis.sql` rodou num PG descartável com as senhas do A2 por `\getenv` →
  `KG_PAPEIS_OK`, hash `SCRAM-SHA-256` gravado; reexecução recusada (papel já existe); papéis removidos depois.
  Nenhum valor impresso em terminal, log ou arquivo do repositório.

## Fase 2 — prontidão do cliente (ambiente local isolado)

**Código testado:** build de produção existente da #315 (`next start`), cujo código = `main` `34b70a1` + KG (depois do
build só mudaram docs e `eslint.config.mjs`). Não foi possível buildar a `main` pura: a máquina tinha 0,4 GB de RAM livre
(o build do Next 16 já morreu por RAM aqui antes). A `main` pura está coberta pelo CI: suíte autenticada do piloto em
`cc67ad7` (= `main` + 2 commits só de relatório da #318) **38/38**; em `2731097` (#315) **40/40**.

| Prova | Resultado |
| --- | --- |
| Suíte `platform-pilot` completa (5 specs, NextAuth real, migration aditiva, banco vazio), cópia local só com a porta trocada | **40/40** (2ª rodada). A 1ª rodada teve 1 falha **de ambiente**: o teste procura `actions/terminais` no manifesto do build e no Windows o caminho vem com `\` — corrigido só na cópia local (`replace(/\\/g, "/")`) |
| `harness/golive.spec.ts` (novo, loja nova por execução) | **3/3, duas execuções seguidas** com writer v2 + código provisionado |

O que cada requisito do GOAL cobriu:

| # | Requisito | Coberto por | Resultado |
| --- | --- | --- | --- |
| 1–2 | Conta STORE do pacote básico; login, primeiro acesso, menus, permissões | piloto `access` (login real, revogação, negativas), `first-access` (senha obrigatória → assistente → produto → novo login), `client-experience` (menus/visual 1440→320); golive teste 1 (formulário real, `platformAuthority=false`, menu: Painel, PDV Clássico, Cadastros, Estoque, Inventário Assistido, Vendas HUB, Histórico de Caixa, Relatórios, Configurações) | PASS |
| 3 | Cadastro e edição de produto | piloto `client-experience` (ficha canônica), `cadastro-categoria-estoque` (categoria, rascunho, recusa cruzada); golive (writer do app, read-back) | PASS |
| 4 | Entrada de estoque UN, persistência, read-back | piloto "estoque UN: movimentação pelo writer canônico, ficha e lista releem" | PASS |
| 5 | Abertura de caixa e venda UN | golive teste 2: terminal → **Abrir Caixa** (R$ 50) → bipe 2× → **Dinheiro** → **Sim, finalizar**; banco: `ABERTA` com saldo 50, venda R$ 9,00, estoque 10→8, livro com saída | PASS (ver B1) |
| 6 | Fechamento e consistência | golive: **Resumo do Caixa** → PIN → **Fechar Caixa** → esperado R$ 59,00 → contado 59 → `FECHADA`, `saldoContado` 59, `totalVendasServer` 9; piloto CAIXA via API (fecha e confere) | PASS (ver B2) |
| 7 | Comprovante pelo navegador | golive: popup "Recibo PDV" com "NÃO É DOCUMENTO FISCAL", item, total, pagamento; `window.print` chamado 1×; `/api/print/raw` respondeu 403 | PASS com atrito (R1) |
| 8 | Admin da plataforma inacessível | piloto (URL/API/payload/promoção adulterados, claims do navegador, loja B); golive (`/api/admin/supervisor-pin` ≥ 401, `/api/print/raw` 403, menu sem IA Mestre/WhatsApp/Marketplace/Contador/Operações/Financeiro) | PASS |
| 9 | Sem promessa falsa de peso/inventário KG/balança | golive: produto KG bipado → "Venda por peso ainda não liberada", carrinho vazio, nenhum "Ler balança"; piloto `estoque-manual-kg` (PDV recusa); na `main` o mesmo bloqueio veio na #317 (`34b70a1`); Configurações mostra "Integração com balança: indisponível" | PASS |
| 10 | Não interfere nas lojas reais | golive teste 3: contagens de vendas/sessões/movimentações/produtos fora da loja idênticas antes e depois; piloto: negativas multi-loja | PASS — mas ver B1 (colisão de numeração no v1) |

## Achados

**B1 — Loja nova precisa do código de numeração antes da 1ª venda (bloqueio de go-live; não é código).**
- **Writer v1** (flag ausente): o número `VDA-AAAA-NNNN` vem de um contador do navegador que recomeça em `0001` em
  cada loja. A 1ª venda da loja nova gerou `VDA-2026-0001`, que já pertencia a outra loja → o servidor recusou
  (`pedido-id-de-outra-loja`, fail-closed, nada gravado) e a venda ficou em "pendência de sincronização". Em produção
  a `loja-1`/`loja-2` ocupam centenas de números `VDA-2026-…`: no v1 a padaria ficaria com as vendas presas.
- **Writer v2** (gate de Production + flag): sem `Store.codigoNumeracaoVenda` a venda fica "aguardando confirmação"
  (`SALE_NUMBERING_NOT_CONFIGURED`). Com o código, grava e numera `VDA-<código>-2026-000001`.
- Production: a env `SALE_SERVER_NUMBERING_ENABLED` existe desde 2026-08-18, valor sensitive (ilegível). **Confirmar
  que Production está no v2** antes da entrega: pelo número impresso num comprovante recente da `loja-1`/`loja-2`
  (`VDA-<código>-…` = v2) ou por uma leitura read-only autorizada.
- Provisionar o código da padaria é ação de plataforma pelo próprio app (Gestão de Unidades → Numeração de venda,
  `PUT /api/stores/numeracao-venda`, módulo `platform`), não automática.

**B2 — PIN de supervisor é global, não por loja (bloqueio de decisão).** Ver o resumo e fechar o caixa pela tela
exigem o PIN de supervisor. `authenticateSupervisorPin` compara contra **todos** os `User` ADMIN, sem `storeId`; o
console da plataforma só gerencia esse PIN. Entregar a cliente exige escolher:
1. dar a ela o PIN atual — o mesmo que co-assina na RafaCell e na Rafa Brinquedos (só vale onde a sessão tem acesso à
   loja, mas o segredo passa a ser compartilhado);
2. criar um 2º PIN (escrita em produção) — vale também nas lojas do proprietário para quem tiver sessão lá;
3. PIN por loja — mudança de schema (`User` sem `storeId`), GOAL próprio com autorização de schema.

A API `/api/ops/caixa/fechar` não pede PIN (o piloto fecha por ela), mas a cliente usa a tela.

**B3 — Provisionamento em produção.** A padaria ainda não existe na base viva (A1.1: só lojas de teste além de
`loja-1`/`loja-2`). Loja, conta ADMIN (primeiro acesso obrigatório), pacote básico e código de numeração são escritas
de produção feitas pelo proprietário pelo app.

**R1 — Comprovante: atrito para o pacote básico (UX, P2).** "Imprimir agora" tenta a térmica (`/api/print/raw`), que o
pacote básico não tem → diálogo vermelho "Impressão não enviada · Sem permissão para este módulo ou unidade" → só então
"Abrir impressão do navegador" funciona. Correção sugerida (não aplicada): sem impressora configurada ou sem o módulo,
oferecer a impressão do navegador como ação principal. Orientar a cliente até lá.

**R2 — Cabeçalho do comprovante (P3).** Sem endereço cadastrado sai `, - , / - CEP:` e o nome vem como
"Loja <id> - <nome>". Preencher dados da loja no primeiro acesso/Configurações e imprimir um teste no dia 0.

**R3 — `main` pura não rodada localmente pela tela** (RAM). Coberta pelo CI (38/38 em `cc67ad7`) e pela igualdade de
código fora do estoque; o fluxo de tela do PDV foi provado no build da #315.

## Fase 3 — matriz de entrega

| | A — uso básico imediato | B — estoque fracionado KG | C — operação completa da padaria |
| --- | --- | --- | --- |
| Escopo | cadastro, produtos UN, venda UN, caixa, comprovante pelo navegador | entrada manual em KG | venda por peso no PDV, balança, impressão automática |
| Comprovado | tudo localmente (40/40 piloto + 3/3 golive, 2×); CI na `main` | Preview: P5 PASS no `pr315-kg`; local: 2,500 + 0,750 = 3,250 kg (spec KG) | **nada** — venda por peso é bloqueada de propósito; balança e impressão automática sem homologação |
| Pendente | B1 (código + confirmar v2), B2 (PIN), B3 (provisionar), smoke do dia 0 | rollout KG inteiro (A3–A8, J0–J13, P1–P5) | desenvolvimento + homologação física |
| Impede o dia 1? | **sim**, enquanto B1/B2/B3 abertos (sem código a venda trava; sem PIN não fecha caixa pela tela) | não impede A; a cliente cadastra itens por peso só depois | — |
| Situação | **NO-GO → GO** quando B1–B3 fecharem | **BLOCKED** | **NO-GO** |

## Fase 4 — próximo gate do rollout KG

Revisão local dos scripts (sem produção), cruzada com o A1:

| Script | Situação |
| --- | --- |
| `01` | provado localmente com as senhas do A2 (`KG_PAPEIS_OK`, SCRAM); não é idempotente (recusa se o papel existir) — rodar uma vez |
| `02` | `GRANT` idempotente; se surgir tabela nova entre A3 e J3, **rodar de novo** antes do J3 (o `03` só dá default privileges para objetos de `omni_owner`) |
| `03` | `lock_timeout` 15 s por tabela; tabelas de estoque pequenas (A1: ~11 MB) |
| `04` | filtra `rolcanlogin AND NOT rolsuper`: `token_roles` (NOLOGIN) fica fora; `neon_service` e o papel RO perdem CONNECT com o `REVOKE … FROM PUBLIC` (como no ensaio 002) |
| `05`, `06`, `99` | sem achado novo |
| `07` | 5 CHECKs `NOT VALID` + `VALIDATE`; é a única barreira de banco contra "Redeploy/Promote" de build `Int` (runbook §5) — recomendação: aprovar na revisão A6. Comentário "14 deployments" desatualizado (cosmético) |

Risco dos deployments antigos: inalterado e documentado no runbook §2 e §5 (15 Production + 56 previews só saem pelo
corte 04+05; "Redeploy"/"Promote" de build antigo depois do J8 reconstrói `Int` com a credencial nova).

Checklist das duas lojas comerciais (`loja-1` e `loja-2`, por `storeId` — a `loja-11` tem o mesmo nome da `loja-2`):
**necessário**, inclusive Pendências = 0 nas filas offline do navegador e terminais em URL antiga.

Resolvíveis sem alteração produtiva: A2 (feito), revisão/decisão do `07` (A6), conector do ChatGPT (A7), declaração do
congelamento (A8), checklist das lojas, revisão do diff documental do 005. Dependem de produção: A3, A4, J0–J13, P1–P5.

## Evidências

`01-a2-validacao.txt` · `harness/` (A2, seed e spec golive, launcher local) · `telas/` (dashboard do dono, PDV com item,
"Impressão não enviada", resumo protegido por PIN, comprovante do navegador, pós-fechamento). Saídas integrais da suíte e
do golive ficaram em `test-results/` (gitignorado) da worktree.
