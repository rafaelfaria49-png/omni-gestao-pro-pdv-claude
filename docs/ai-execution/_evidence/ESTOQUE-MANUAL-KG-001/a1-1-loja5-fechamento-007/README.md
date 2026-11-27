# A1.1 — fechamento do caixa antigo da loja-5 (2026-10-28 13:52Z)

**Contexto:** o A1 (`a1-production-baseline-006`) achou uma sessão `ABERTA` órfã na `loja-5` (TESTE 123), aberta em
2026-05-28 15:46:59Z. **O proprietário a fechou normalmente pela aplicação**; esta conferência só confirma a persistência.

Mesmo protocolo do A1: URL validada sem conectar; `PGOPTIONS` com `default_transaction_read_only=on` e timeouts curtos;
`BEGIN … READ ONLY`; identidade (`project`, `branch`, `endpoint`, database, `transaction_read_only`) conferida no servidor
antes da consulta; `ROLLBACK` no fim. Só `status` e datas da sessão — nenhum valor financeiro. Varredura da saída contra
o arquivo de segredos: 0 vazamentos.

```
A1_1=PASS
LOJA_5_CAIXA_FECHADO=YES
LOJA_5_SESSOES_ABERTAS=0
LOJA_1_SESSOES_ABERTAS=0
LOJA_2_SESSOES_ABERTAS=1 (aberta 2026-10-27 12:05:46Z; loja em operação)
OUTRAS_SESSOES_ABERTAS=0
PRODUCTION_WRITES=0
BLOQUEIO_LOJA_5=RESOLVIDO
ROLLOUT_READINESS=NO-GO
```

| Arquivo | Conteúdo |
| --- | --- |
| `harness/a1-1-loja5.cjs` | cópia do harness do A1 (só muda o arquivo SQL e o `application_name` `kg-a1-1-readonly`) |
| `harness/a1-1-loja5.sql` | identidade com `\if`, 4 consultas `SELECT`, `ROLLBACK` |
| `01-saida-sql.txt` | saída integral |

## Resultado

- Sessão antiga da `loja-5`: `FECHADA`, `abertaEm` 2026-05-28 15:46:59Z, `fechadaEm` **2026-10-28 13:34:37Z** (fechamento do
  proprietário). É a única sessão da loja.
- Caixas `ABERTA` em todo o banco: **1**, da `loja-2`, a mesma vista no A1 (loja operando). `loja-1`: 0. Demais: 0.

## Lojas (classificação do proprietário; cadastro não alterado)

| `storeId` | Nome no cadastro | Classificação |
| --- | --- | --- |
| `loja-1` | RAFACELL ASSISTEC | **real, operacional** |
| `loja-2` | RAFA BRINQUEDOS E VARIEDADES | **real, operacional** |
| `loja-5` | TESTE 123 | teste; caixa encerrado pelo proprietário |
| `loja-6`, `loja-7`, `loja-8`, `loja-9`, `loja-10`, `loja-11`, `loja-teste-caixa`, `cliente-bc1c8ad5-…` (Padaria TESTE) | smart, teste produtos gestao, smart teste 500, gestao teste 239, 123teste, RAFA BRINQUEDOS E VARIEDADES, 🧪 LOJA TESTE CAIXA, Padaria TESTE | teste, sem uso comercial |

Observação: `loja-11` tem **o mesmo nome** da `loja-2` ("RAFA BRINQUEDOS E VARIEDADES") e um lock de terminal parado desde
2026-05-30 (A1). Pelo proprietário, é de teste. No checklist das lojas e no J0, identificar a loja pelo `storeId`, não pelo nome.

## Efeito no runbook

- O risco 2 do A1 (sessão órfã que reprovaria o J0) está **resolvido** sem exceção.
- O J0 continua exigindo `ABERTA` = 0: hoje só falta o fechamento normal da `loja-2` no dia da janela, junto com o checklist.
- Segue pendente do A1: leitura de `cron.job` (database `postgres`, autorização própria).
