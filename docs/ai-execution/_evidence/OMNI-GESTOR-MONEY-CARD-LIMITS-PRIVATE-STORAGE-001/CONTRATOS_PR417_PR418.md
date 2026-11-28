# Contratos Canônicos Atualizados — PR `#405` → PR `#417` e PR `#418`

**GOAL:** `OMNI-GESTOR-MONEY-CARD-LIMITS-PRIVATE-STORAGE-001`  
**Base validada:** `10f28c2` (`codex/gestor-money-main-reconciliation-001`)

---

## 1. Limites de Cartões de Crédito (G004 + G005)

### Schema & Migration Aditiva
- **Migration:** `prisma/migrations/20261127120000_gastos_cartoes_limites/migration.sql` (nenhuma migration anterior alterada).
- **`cartoes_instrumentos` (`CartaoInstrumento`):**
  - `limiteCentavos Decimal? @db.Decimal(20, 0)` — **`null` significa limite não informado** (nunca `0`). CHECK: `NULL` ou `0..9000000000000`.
  - `updatedAt DateTime @default(now()) @updatedAt`.
- **`cartoes_limites_eventos` (`CartaoLimiteEvento`):**
  - Histórico/auditoria imutável de toda alteração de limite (`CADASTRO`, `ALTERACAO`, `REMOCAO`), com `limiteAnteriorCentavos`, `limiteNovoCentavos`, `motivo`, `autorAdminUserId`, `createdAt`.
  - Protegida por `g004_validar_escopo()`, `g004_imutabilidade()` (bloqueia `UPDATE`/`DELETE`) e RLS `gm_runtime_escopo` (isolamento estrito `PESSOAL` vs `EMPRESA`).

### Contratos de Escrita e Leitura (`lib/gastos/cartoes.ts`)
- `cadastrarCartaoGasto(ctx, { nome, ultimos4?, bandeira?, limiteCentavos?: string | number | null, motivo? })`
  - `limiteCentavos` omitido ou `null` persiste `null`; quando informado grava evento `CADASTRO` em `cartoes_limites_eventos`.
- `editarCartaoGasto(ctx, { cartaoId, nome?, ultimos4?, bandeira?, ativo?, limiteCentavos?: string | number | null, motivo? })`
  - Trava `cartoes_instrumentos` com `FOR UPDATE`, valida autorização e escopo do perfil, grava evento imutável em `cartoes_limites_eventos` quando o limite muda e devolve `{ cartao, resumoLimite, eventoLimite }`.
- `consultarCartoesGasto(ctx, { cartaoId?, incluirInativos?, incluirHistoricoLimites? })`
  - Snapshot `RepeatableRead` + `SET TRANSACTION READ ONLY` + RLS.
  - Retorna por cartão: `limiteCentavos: string | null`, `limiteUtilizadoCentavos: string`, `limiteDisponivelCentavos: string | null`, `limiteExcedidoCentavos: string | null`, `limiteComprometidoPercentual: number | null`, `politicaComprometimento`, `ciclos[]` (faturas por ciclo) e `historicoLimites[]`.
- `consultarHistoricoLimiteCartaoGasto(ctx, cartaoId)` — histórico auditável do cartão no perfil autorizado.

### Política de Comprometimento e Aplicação (`lib/gastos/apply.ts`)
- **Política:** `COMPROMETIMENTO_INTEGRAL_COMPRA_RECOMPOSICAO_NO_PAGAMENTO`.
  - Compras à vista e **todas as parcelas futuras** de uma `COMPRA_CREDITO` comprometem o limite no ato da compra (soma do saldo restante em aberto dos títulos ativos vinculados aos ciclos do cartão).
  - Pagamentos parciais/totais via `PAGAR_FATURA` recompõem o limite exatamente na quantia paga; estornos (`ESTORNAR_PAGAMENTO`) voltam a comprometer.
  - Em `COMPRA_CREDITO`: trava `cartoes_instrumentos` com `FOR UPDATE`, exige todos os ciclos no mesmo cartão (`ciclo_cartao_divergente`, 422) e, quando `limiteCentavos !== null`, recusa excesso com `limite_cartao_insuficiente` (409).
  - Limite de crédito **nunca** compõe `saldoCentavos` das contas.

### Projeção G005 (`lib/gastos/query.ts` — `ConsultaFinanceiraDTO.cartoes`)
- Atende diretamente a **PR `#418`** (dashboard/cartões) e o **item 7 da PR `#417`** (consulta de faturas por ciclo/cartão no motor conversacional):
  - `ConsultaFinanceiraDTO.cartoes[]` expõe para cada cartão do perfil: `limiteCentavos`, `limiteUtilizadoCentavos`, `limiteDisponivelCentavos`, `limiteExcedidoCentavos`, `limiteComprometidoPercentual`, `politicaComprometimento` e `ciclos[]` (`id`, `identificador`, `competencia`, `vencimento`, `fechamentoEm`, `totalCentavos`, `pagoCentavos`, `restanteCentavos`, `quantidadeTitulos`).

---

## 2. Gate Formal de Storage Privado R2 (`G003-STORAGE`)

### Reaproveitamento da Infraestrutura Existente (`lib/gastos/documentos-storage.ts`)
- Reutiliza `lib/contador/documentos/storage-r2.ts`, `config.ts` e `storage-types.ts` sem contratar novos serviços.
- **Fail-closed absoluto:**
  - `publico: null` (devolvido pelo `HeadBucket` S3 do R2) **NUNCA** é aceito como prova de privacidade.
  - Exige: `GESTOR_MONEY_STORAGE_G003_ENABLED="true"`, `CONTADOR_STORAGE_PROVIDER="r2"`, config R2 válida sem `NEXT_PUBLIC_*` segredos, e `VerificadorPrivacidadeR2G003` comprovando simultaneamente: `bucketExiste === true`, `r2DevPublico === false`, `dominiosPublicosCount === 0`, `probeAnonimoNegado === true` e credencial com escopo mínimo (`restritoAoBucket === true`, `escopoGlobalConta === false`, `podeListarTodosBuckets === false`, `bucketAutorizado === cfg.bucket`).
  - Sem essa comprovação no runtime, `resolverStorageDocumentosG003()` mantém o runtime bloqueado (`503 GateStorageG003Error`, `code: "privacidade_bucket_nao_comprovada"`).
  - Instâncias autênticas carregam símbolo opaco interno verificado por `lib/gastos/documentos.ts` (impossível forjar objeto literal).
  - Namespace estrito `gastos/v1/{perfilId}/{documentoId}` (nunca acessa `contador/...`), criação exclusiva (`409` em sobrescrita), SHA-256 verificado no upload e no download, download assinado `<= 60s` (`attachment`, `Cache-Control: private, no-store, max-age=0`), remoção segura em falha de transação e quarentena de órfãos após 24h.
- **Diagnóstico seguro para UI (`#418`):** `diagnosticarGateStorageG003(env)` expõe apenas flags e nomes de variáveis faltantes (zero segredos).

---

## 3. Verificação das Dependências da PR `#417` (Motor Conversacional G008)

| Dependência comunicada na `#417` | Status na `#405` | Observação |
| --- | --- | --- |
| `TRANSFERENCIA_INTERNA` no G004 | ✅ **Já entregue** (`2554d25`) | `#417` está sobre `3ed6cb7`; ao fazer rebase sobre `#405` o contrato já está disponível para `PESSOAL` e `EMPRESA`. |
| Projeção de faturas por ciclo/cartão no G005 (item 7) | ✅ **Entregue agora** | `ConsultaFinanceiraDTO.cartoes[].ciclos[]` + `consultarCartoesGasto()`. |
| Limite de cartão (cadastro/edição/cálculo) | ✅ **Entregue agora** | `cadastrarCartaoGasto`, `editarCartaoGasto`, `consultarCartoesGasto`. |
| Gate formal `G003-STORAGE` de comprovantes privados | ✅ **Entregue agora** | Preparado com fail-closed até prova de privacidade/escopo R2 no ambiente alvo. |
| `RECEITA` / `RECEBIMENTO` no G004 | ⏳ **Fora deste escopo** | G002 possui `criarRecebimentoFinanceiro`; ampliação de `PropostaGasto` G004 para `RECEITA`/`RECEBIMENTO` requer GOAL próprio sem duplicar motor. |
| Persistência durável conversacional (G008) e binding WhatsApp (G007) | ⏳ **Fora deste escopo** | Pertencem às trilhas G007/G008 (não alteradas aqui). |
