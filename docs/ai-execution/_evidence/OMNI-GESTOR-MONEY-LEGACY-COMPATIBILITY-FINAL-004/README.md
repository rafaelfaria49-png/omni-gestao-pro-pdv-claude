# OMNI-GESTOR-MONEY-LEGACY-COMPATIBILITY-FINAL-004 — README técnico (sanitizado)

PR #405 (draft) · Gestor Money **desligado** · nenhuma escrita, migration, GRANT/REVOKE ou alteração de env em
Production · nenhum merge · nenhum custo.

> Este documento é a versão **pública e sanitizada**. Não contém identificadores de loja, venda, título, cliente,
> valores monetários individuais, identificadores de infraestrutura, hostnames nem saídas brutas de Production.
> As evidências completas (saídas das leituras, estrutura do banco, ledger, ensaios) ficam **somente em
> armazenamento local fora de qualquer repositório**, com manifesto SHA-256, por decisão do arquiteto.

## 1. Preflight de Production (PREFLIGHT-003, resumo)

Leituras feitas com sessão forçada em `default_transaction_read_only=on` no servidor, transação `READ ONLY`,
trava de identidade antes de qualquer consulta, `statement_timeout`/`lock_timeout` curtos e `ROLLBACK` no fim.

- Código servido em Production = main atual; o build registrou `MIGRATION_SKIPPED`.
- **Runtime da aplicação = papel proprietário das tabelas** (o mesmo das migrations, por pooler), com `BYPASSRLS`.
  O papel restrito criado para o cutover de runtime existe, mas nunca foi adotado. Ver `HANDOFF-INFRA-404.md`.
- Ledger Prisma: 30 migrations aplicadas, 0 incompletas, 0 revertidas, checksums iguais aos arquivos do git
  (2 deles sobre bytes CRLF — conteúdo idêntico, não é pendência).
- Pendentes: Vestuário P03 (já na main e no código servido), Gestor Money G001–G005; SaaS #398 fora da main.
- `prisma migrate diff` Production × main = só a P03 + uma renomeação de índice já conhecida. Sem drift inesperado.
- Auditoria pré-migration: 0 valores NaN/Infinity, 0 vínculos de carteira/fornecedor inválidos, carteiras vazias;
  **1 BLOQUEIO: 13 vendas com vínculo de título de outra loja** (§2).
- Sem vendas entre 23:00 e 11:00 UTC nos últimos 14 dias; nenhuma transação longa no momento da leitura.

## 2. Os 13 vínculos cruzados — diagnóstico (só leitura)

**Origem:** resíduo do incidente de *sequestro de venda por `pedidoId` global*, corrigido em produção em 2026-07-28.
A numeração antiga `VDA-AAAA-NNNN` era gerada por contador local de cada loja, `Venda.pedidoId` é único global e o
upsert antigo casava por `pedidoId` e reatribuía a loja. Prova, para os 13: o identificador (cuid) de cada registro
de venda nasceu **no mesmo minuto** em que o título a receber foi criado na loja A — o registro era a venda a prazo
original da loja A — e depois foi **sobrescrito** (loja, data, total) por uma venda da loja B com o mesmo número,
mantendo o vínculo com o título da loja A. Os payloads ainda carregam a marca de sincronização do cliente
(`syncPending`), saneada pelo fix de julho. **Não há relação com importações**.

| Pergunta | Resposta |
|---|---|
| Loja efetivamente responsável por cada título | **Loja A, nos 13**: título criado para a venda original da loja A; cliente cadastrado na loja A em 11 de 13; todos os recebimentos registrados no caixa da loja A |
| Pagamentos e estornos | 8 liquidados, 1 parcial, 4 pendentes; 9 movimentos de entrada, todos na loja A; **0 estornos** |
| Impacto financeiro | Os recebíveis e o caixa estão **corretos na loja A**. O dano é de histórico de vendas: a loja A perdeu 13 registros de venda (sobrescritos) e a loja B tem 13 vendas cujo vínculo aponta para título alheio. Ordem de grandeza: menos de R$ 500 em títulos |
| Impacto operacional | Na loja B, cancelar/corrigir/devolver essas vendas não toca o título da loja A (todos os leitores filtram por loja); uma venda da loja B já foi cancelada e o título da loja A continuou intacto |
| Exposição entre lojas | **Nenhuma pela aplicação**: detalhe de venda, cancelamento, devolução, trocas e correções buscam títulos com o `storeId` da venda (conferido no código). O vínculo é só uma FK residual |
| Relação com outros danos | Faz parte do passivo de recuperação do incidente de julho (vendas da loja A sobrescritas), que segue pendente e **fora deste GOAL** |

**Dados reais preservados:** nenhuma linha foi alterada. Correção dos 13 (restaurar as vendas da loja A e soltar a
FK residual na loja B) é decisão do dono, com autorização própria, dentro da recuperação do incidente.

## 3. Ajuste do contrato do gatilho G002 (`gastos_validar_titulo_venda`)

A G002 **ainda não foi aplicada em Production**, então foi ajustada nesta PR. Nenhuma migration já aplicada foi
tocada.

Antes: qualquer `UPDATE` que listasse `contaReceberTituloId` ou `storeId` no `SET` revalidava o vínculo — regravar
o mesmo valor (o Prisma lista o campo no `SET` mesmo sem mudança) **congelava** a venda legada.

Agora: `UPDATE` que **não altera** nem o vínculo nem a loja retorna sem validar. Todo o resto continua exigindo
título **ativo e da mesma loja**:

| Caso | Resultado |
|---|---|
| INSERT com título de outra loja | recusado (`23514`) |
| Venda válida passa a apontar para título de outra loja | recusado |
| Venda legada troca para OUTRO título de outra loja | recusado |
| Venda legada é corrigida para título ativo da mesma loja | permitido |
| Correção para título inativo | recusado |
| Remoção do vínculo | permitida |
| Troca da loja da venda sem coerência com o título | recusada |
| UPDATE de outros campos, ou regravando o mesmo vínculo/loja | permitido (não congela) |
| Leitor da aplicação na loja B procura os títulos da venda legada | **0 títulos** — o vínculo não concede acesso |

Provas (PostgreSQL 17 descartável, dados sintéticos):
- Suíte nova `test/gastos/venda-titulo-legado.pg.test.ts` sobre as **migrations reais** (preparo de aparelhos),
  registrada no runner de PG da CI: **8/8**. Com o corpo antigo do gatilho, **falha 1/8** exatamente no caso
  "não congela" — a suíte detecta a regressão.
- Ensaio sobre a **estrutura real de Production** (só esquema, sem dados) + ledger real + massa sintética: as 5
  migrations aplicadas uma a uma por diretório curado, checksums do ledger = arquivos, P03/SaaS não aplicadas,
  dados idênticos; o caso legado regravado passa; rollback recusado com uso, rollback válido devolve catálogo e
  dados idênticos e o ledger a 30; reaplicação 5/5.
- O teste antigo da auditoria G002 (`migration.postgres.test.ts`) foi alinhado ao contrato novo.

**Não muda:** os gatilhos de títulos/movimentos/carteiras (`gastos_validar_escopo`) continuam estritos com legado
cruzado de fornecedor/carteira; em Production há **0** linhas nessa situação (reconferir no J0).

## 4. Checksums (sha256 dos bytes LF do git)

| Migration | Situação |
|---|---|
| G001 `20261126100000_gastos_perfis_autorizacao` | inalterada |
| G002 `20261126110000_gastos_contas_writers` | **alterada** — `76cec3b2…` → `62bf6616f59c792470e469ec07deb517eb89d591a377f80178d0abafaab7197f` |
| G003 `20261126120000_gastos_readers_documentos` | inalterada |
| G004 `20261126130000_gastos_operacoes_atomicas` | inalterada |
| G005 `20261126140000_gastos_canais_fila_worker` | inalterada |
| P03 `20261116090000_identificadores_etiquetas_p03` | inalterada (não tocada) |

Nenhum ambiente persistente aplicou a G002 antiga: o ledger de Production não a contém; os bancos da CI são recriados.

## 5. Roteiro de implantação individual (pronto, NÃO executado)

Gates: **G-A** autorização expressa por migration · **G-C** backup comprovado (autorização própria) ·
**G-D** janela 03:00–09:00 UTC · **G-E** autoridade automática de migrations confirmada desligada no log do build.
(G-B, a decisão sobre os 13 vínculos, deixou de bloquear a G002: o gatilho não os congela.)

| Passo | Ação | Critério |
|---|---|---|
| J0 | Repetir o preflight read-only | identidade; ledger 30/0/0; 0 tx longa; BLOQUEIOS só os conhecidos |
| J1 | Conferir código servido (main, sem Gestor Money) e `MIGRATION_SKIPPED` | logs do build |
| J2 | Backup: ponto de restauração registrado + branch de proteção **ou** dump lógico cifrado com restauração de prova | restauração conferida por contagem/hash por tabela |
| J3 | Diretório curado = 30 aplicadas (bytes exatos) + só a próxima migration autorizada | `migrate status` lista só ela, sem divergência |
| J4 | `prisma migrate deploy` pela conexão direta com `statement_timeout=60s` (a migration já define `lock_timeout=500ms`) | exit 0; checksum no ledger = arquivo |
| J5 | Verificação read-only: objetos esperados, 0 drift até aquela migration, fingerprint dos dados igual ao J0 | iguais |
| J6 | Repetir J3–J5 para G002 → G005, **uma por vez** | idem |
| J7 | Smoke do código servido sobre o schema novo (PDV à vista/a prazo, Caixa, F9 parcial/estorno, OS, Financeiro) em loja de teste | 0 erro `23514`/`42501`/`P2022` |
| J8 | Só com autorização separada: merge da #405 → deploy com o Gestor Money ausente → J7 | idem |

Migrations **antes** do merge (o código da #405 não roda sobre o schema antigo; o código servido roda sobre o novo).
Falha de migration = transação inteira desfeita; antes de `migrate resolve --rolled-back`, provar ausência de objeto
parcial; havendo qualquer resíduo, parar. Rollback do banco (script atômico com recusa se o Gestor Money já foi
usado) mantido fora do repositório junto das evidências; depois do merge, rollback exige antes voltar o código.

## 6. Arquivos desta PR

| Arquivo | Conteúdo |
|---|---|
| `prisma/migrations/20261126110000_gastos_contas_writers/migration.sql` | gatilho ajustado (+10 linhas) |
| `test/gastos/venda-titulo-legado.pg.test.ts` | suíte PG do contrato (8 casos) |
| `scripts/ci/run-root-pg-suites.mjs` | grupo `gastos_venda_titulo_legado_ci` (migrations reais) |
| `test/gastos/migration.postgres.test.ts` | asserção alinhada ao contrato novo |
| `docs/.../HANDOFF-INFRA-404.md` | handoff sanitizado para a frente de segurança de infraestrutura |
