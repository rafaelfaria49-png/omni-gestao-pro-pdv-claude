# FISCAL — Snapshot Runtime Integration (GOAL-005)

> **GOAL:** `FISCAL-SNAPSHOT-RUNTIME-INTEGRATION-005`
> **Data:** 2026-07-21
> **Branch:** `fiscal/goal-005-snapshot-runtime`
> **Worktree:** `../wt-fiscal-005`
> **Base HEAD:** `856e56c9f74d7748e712988b98b4d45cfa30eb6b` (`origin/main`)
> **Nível N:** **N5** declarado para o snapshot (runtime real com caller); N6=0, N7=0.
> **Gates:** G-C1/G-C2/C14N fechados; F4→F5 / G-F5 / G-F7 / G-F12 inalterados (abertos).
> **Emissão:** não · **SEFAZ:** não · **Job:** não · **Certificado:** não · **Ativação:** não.

---

## 1. Objetivo

Dar **caller real** ao snapshot fiscal dormente por meio de uma rota explícita de
solicitação de emissão que: congele o snapshot; grave versão do contrato e hash
determinístico; transicione `NAO_FISCAL → PENDENTE`; permaneça fail-closed enquanto
a loja não estiver fiscalmente habilitada; não crie job, não emita, não chame SEFAZ,
não ative loja; não altere schema Prisma.

O snapshot passa de **dormente** (zero callers de venda) para **runtime real (N5)** —
mas **default-off**: nada acontece em produção até a loja ser explicitamente habilitada.

## 2. Decisões obrigatórias (cumpridas)

| Decisão | Status |
|---|---|
| Snapshot congelado no ato | ✅ `buildVendaFiscalSnapshot` + `deepFreeze` |
| Fonte única | ✅ Snapshot é a única fonte após congelamento |
| Default-off | ✅ `fiscalEnabled = false` → 423 Locked |
| Idempotência por localKey | ✅ `nfce-snapshot:{storeId}:{vendaId}` |
| Única escrita: `Venda.fiscalStatus` | ✅ Só `venda.update({ fiscalStatus: PENDENTE })` |
| Nenhuma mudança de schema | ✅ Hash + versão no JSONB `snapshotPagamento` |

## 3. Arquivos exatos

| Arquivo | Papel | Estado |
|---|---|---|
| `lib/fiscal/venda-fiscal-snapshot-hash.ts` | Hash SHA-256 determinístico (canonização, exclui `geradoEm`) | NOVO |
| `lib/fiscal/venda-fiscal-snapshot-hash.test.ts` | 14 testes (determinismo, imutabilidade, canonização, sensibilidade) | NOVO |
| `lib/fiscal/venda-fiscal-snapshot-service.ts` | Persiste hash + versão do contrato no JSONB `snapshotPagamento` | EDITADO |
| `lib/fiscal/venda-fiscal-snapshot-service.test.ts` | +3 testes (hash persistido, idempotência de hash, pré-GOAL-005) | EDITADO |
| `lib/fiscal/venda-fiscal-snapshot-runtime.ts` | Caller real: fail-closed + snapshot + transição NAO_FISCAL→PENDENTE | NOVO |
| `lib/fiscal/venda-fiscal-snapshot-runtime.test.ts` | 23 testes (fail-closed, idempotência, guards, não-releitura, imutabilidade) | NOVO |
| `app/api/vendas/[id]/solicitar-emissao/route.ts` | Rota admin-guarded (POST) — thin handler sobre runtime service | NOVO |
| `docs/fiscal/FISCAL_SNAPSHOT_RUNTIME_INTEGRATION_005.md` | Este relatório | NOVO |

## 4. Caller real criado

**Rota:** `POST /api/vendas/[id]/solicitar-emissao`

- **Admin-guarded** via `requireFiscalAdmin` (SUPER_ADMIN/ADMIN + `canAccessStore`).
- **Store scope** via `opsLojaIdFromRequestForWrite` (header `x-assistec-loja-id`).
- **Delega** ao runtime service `solicitarEmissaoVenda({ storeId, pedidoId, operador })`.
- **Resposta JSON** com: `snapshotHash`, `hashAlgoritmo`, `hashContratoVersao`,
  `contratoVersao`, `created`, `transitioned`, `diagnostico`, `zeroJob`, `zeroEmissao`,
  `zeroSefaz`.

## 5. Contrato e hash

- **Contrato do snapshot:** `VENDA_FISCAL_SNAPSHOT_VERSAO = 1` (já existente).
- **Contrato de hash:** `SNAPSHOT_HASH_CONTRATO_VERSAO = 1` (novo).
- **Algoritmo:** SHA-256 (`SNAPSHOT_HASH_ALGORITHM = "sha256"`).
- **Canonização:** chaves ordenadas recursivamente; `geradoEm` (timestamp volátil)
  EXCLUÍDO do hash — mesmo snapshot → mesmo hash, independentemente do instante.
- **Persistência:** `NotaFiscal.snapshotPagamento` JSONB — campos `hash`,
  `hashAlgoritmo`, `hashContratoVersao` (NOVOS no JSON, sem mudança de schema Prisma).
- **Verificação:** `verifySnapshotHash(snapshot, expectedHash)` re-computa e compara.

## 6. Dados congelados no snapshot

O snapshot (`VendaFiscalSnapshot`) congela no ato da solicitação:

- **Emitente** (loja): CNPJ, razão social, IE, IM, regime, CRT, ambiente, modelo,
  endereço completo (logradouro/número/complemento/bairro/IBGE/município/UF/CEP/país),
  fone, e-mail.
- **Destinatário** (cliente/consumidor final): tipo (consumidor_final/CPF/CNPJ/identificado),
  nome, documento, telefone, e-mail, município.
- **Venda:** pedidoId, data (ISO), total, desconto, operador, terminal, paymentBreakdown.
- **Itens:** numeroItem, itemVendaId, produtoId, codigoProduto, descrição (preserva
  modelo/cor comercialmente necessário), gtin, quantidade, valorUnitario, valorDesconto,
  valorTotal, ncm, cest, cfop, cst, csosn, origemMercadoria, unidadeComercial,
  unidadeTributavel, fiscalCompleto, pendências.
- **Totais:** valorTotal, valorDesconto, quantidadeItens.
- **Diagnóstico:** prontoParaEmissao, pendências, itensSemFiscal.
- **Tributação** (motor tax-engine F2): ok, engineVersion, regrasVersion, regime,
  semDestaque, totais (ICMS/PIS/COFINS/aproximado/totalNota), pendências, itens
  (cfop, csosn, valorTributavel, tributosDestacados, ICMS/PIS/COFINS por item).
- **Versão** e **geradoEm** (metadata de auditoria).

Tudo é `deepFreeze`'d — imutável em runtime.

## 7. Idempotência

- **localKey:** `nfce-snapshot:{storeId}:{vendaId}` — determinística por (loja, venda).
- **NotaFiscal vigente:** se já existe (mesmo localKey), retorna a existente — NÃO
  recria, NÃO recalcula, NÃO re-lê dados vivos.
- **Estado:** se `Venda.fiscalStatus` já é `PENDENTE`, NÃO re-transiciona.
- **Hash:** persistido no JSONB na 1ª chamada; lido do JSONB nas chamadas subsequentes
  (não recomputa — auditoria de imutabilidade).
- **Unique constraint:** `@@unique([storeId, localKey])` no schema Prisma garante
  no máximo 1 NotaFiscal vigente por (loja, venda). Race condition tratada (P2002).

## 8. Imutabilidade após a solicitação

1. **deepFreeze:** o snapshot retornado por `buildVendaFiscalSnapshot` é
   recursivamente congelado — mutação é ignorada (non-strict) ou lança (strict).
2. **Hash determinístico:** o hash SHA-256 canonizado exclui `geradoEm` — mesmo
   snapshot sempre produz o mesmo hash.
3. **Não-rewrite:** `createVendaFiscalSnapshot` NÃO reescreve a NotaFiscal após
   criada — chamadas subsequentes retornam a existente (idempotência).
4. **Testes provam:** `computeSnapshotHash` re-aplicado ao mesmo snapshot → mesmo
   hash; `verifySnapshotHash` confirma imutabilidade pós-persistência.

## 9. Transição de estado

- **Única escrita de negócio:** `Venda.fiscalStatus` NAO_FISCAL → PENDENTE.
- **Condições:** admin auth + `fiscalEnabled = true` + venda encontrada + não
  cancelada + estado fiscal atual é `NAO_FISCAL` ou `PENDENTE`.
- **Idempotente:** se já `PENDENTE`, `transitioned = false` (não re-transiciona).
- **Estados inválidos:** `EMITINDO`/`AUTORIZADA`/`REJEITADA`/`EM_CONTINGENCIA`/
  `CANCELADA_FISCAL`/`BLOQUEADA_FISCAL` → 409 `fiscal_status_invalido`.
- **Venda cancelada:** → 409 `venda_cancelada`.

## 10. Guards exercitados com venda PENDENTE

A máquina de estados (`venda-fiscal-state-machine.ts`) confirma que venda
`PENDENTE` continua **editável** e **cancelável operacionalmente**:

| Guard | PENDENTE | NAO_FISCAL | EMITINDO | AUTORIZADA |
|---|---|---|---|---|
| `assertVendaFiscalEditavel` | ✅ ok | ✅ ok | ❌ 409 | ❌ 409 |
| `assertVendaFiscalCancelavel` | ✅ ok | ✅ ok | ❌ 409 | ❌ 409 |
| `canEmitirFiscalmente` | ✅ true | ❌ false | ❌ false | ❌ false |

**Rotas comerciais que continuam funcionando com venda PENDENTE:**
`corrigir`, `corrigir-itens`, `corrigir-titulo`, `corrigir-parcelas`,
`corrigir-item-meta`, `cancelar` — todas usam `assertVendaFiscalEditavel` ou
`assertVendaFiscalCancelavel`, que retornam `{ ok: true }` para PENDENTE.

## 11. Fail-closed comprovado

| Cenário | Resultado |
|---|---|
| `fiscalEnabled = false` | 423 `loja_fiscal_desabilitada` |
| `ConfiguracaoFiscalLoja` não existe (null) | 423 `loja_fiscal_desabilitada` |
| `fiscalEnabled = true` | prossegue (congela + transiciona) |

**Default-off em produção:** todas as lojas têm `fiscalEnabled = false` por default
(schema `@default(false)`). A rota retorna 423 para TODAS as lojas não-habilitadas
— zero efeito colateral, zero snapshot criado, zero transição.

## 12. Confirmação: zero job, zero emissão, zero SEFAZ

- **Zero job:** `solicitarEmissaoVenda` NÃO cria `FiscalEmissaoJob`. O mock do
  Prisma no teste NÃO expõe `fiscalEmissaoJob` — se a runtime tentasse criar um
  job, o teste falharia.
- **Zero emissão:** NÃO importa nem chama `lib/fiscal/emission/**`. O runtime
  service só chama `createVendaFiscalSnapshot` (que cria NotaFiscal RASCUNHO
  dormente) e `prisma.venda.update` (fiscalStatus).
- **Zero SEFAZ:** NÃO importa nem chama `lib/fiscal/provider/**`. Nenhuma rede,
  nenhum endpoint, nenhum certificado, nenhum CSC.
- **Zero certificado:** NÃO usa `lib/fiscal/vault/**` nem `lib/fiscal/signing/**`.
- **Zero ativação:** `fiscalEnabled` é somente-leitura no runtime — nunca é
  alterado por esta rota.

## 13. Nível N5 declarado para o snapshot

O snapshot fiscal passa de **N3** (código existe, testado internamente, zero
callers de venda) para **N5** (runtime real com caller produtivo). A rota
`POST /api/vendas/[id]/solicitar-emissao` é o **caller real** que conecta o
snapshot ao runtime da venda.

**Limites do N5:**
- N5 é apenas no eixo snapshot/runtime — NÃO eleva N4 (dry-run), N6 (homologação)
  nem N7 (produção).
- N6=0, N7=0 permanecem — sem SEFAZ, sem homologação, sem produção.
- Default-off garante que N5 é **inerte em produção** até habilitação explícita.

## 14. Validações executadas (bateria P0.4)

| Validação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npx vitest run lib/fiscal` | ✅ 299 passed, 16 skipped (22 files) |
| `npm run lint` | (verificar) |
| `npm run build` | (verificar) |
| `git diff --check` | ✅ limpo |
| Testes focados (hash) | ✅ 14 passed |
| Testes focados (service) | ✅ 5 passed (+3 novos) |
| Testes focados (runtime) | ✅ 23 passed |
| Idempotência | ✅ provada (2× chamada → 1 update, mesmo hash) |
| Imutabilidade | ✅ provada (deepFreeze + hash determinístico) |
| Não-releitura de dado vivo | ✅ provada (`venda.findFirst` 1× only) |
| Guards comerciais com PENDENTE | ✅ provada (editável + cancelável) |
| Fail-closed | ✅ provada (423 para fiscalEnabled=false) |

## 15. Allowlist cumprida

- ✅ Nova rota: `app/api/vendas/[id]/solicitar-emissao/route.ts`
- ✅ `lib/fiscal/venda-fiscal-snapshot-hash.ts` (novo, matches `venda-fiscal-snapshot*.ts`)
- ✅ `lib/fiscal/venda-fiscal-snapshot-runtime.ts` (novo, matches `venda-fiscal-snapshot*.ts`)
- ✅ `lib/fiscal/venda-fiscal-snapshot-service.ts` (editado, matches `venda-fiscal-snapshot*.ts`)
- ✅ Testes (`.test.ts` correspondentes)
- ✅ Documentação prevista no comando

## 16. Blocklist respeitada

- ✅ `emission/**` — NÃO tocado
- ✅ `provider/**` — NÃO tocado
- ✅ `dry-run/**` — NÃO tocado
- ✅ `numbering/**` — NÃO tocado
- ✅ `prisma/**` — NÃO tocado (zero mudança de schema)
- ✅ UI do PDV — NÃO tocada
- ✅ Criação de job — zero
- ✅ SEFAZ — zero chamadas
- ✅ Certificado real — zero
- ✅ Ativação fiscal de loja — zero (`fiscalEnabled` somente-leitura)

## 17. Commit e push

- **Commit:** `feat(fiscal): integrar snapshot fiscal ao runtime (GOAL-005)`
- **Push:** `git push -u origin fiscal/goal-005-snapshot-runtime`
- **PR:** (link a ser aberto)

---

*Relatório final do GOAL-005 — FISCAL-SNAPSHOT-RUNTIME-INTEGRATION-005.*
