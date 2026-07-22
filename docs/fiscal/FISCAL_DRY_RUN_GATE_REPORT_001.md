# FISCAL_DRY_RUN_GATE_REPORT_001

**Gate executável do dry-run fiscal — matriz item × autoridade × evidência × resultado (GOAL-007)**

| | |
|---|---|
| **GOAL** | `FISCAL-DRY-RUN-GATE-REDEFINE-007` |
| **Data** | 2026-07-22 |
| **Base** | `origin/main` @ `f010ba1` — merge do **PR #23** (`f010ba1b4a310a3a40ed00ddda8258b443ee5890`, GOAL-008 cofre/cert piloto) |
| **Branch** | `fiscal/goal-007-dry-run-gate` · worktree `../wt-fiscal-007` |
| **ADR** | ADR-0013 (ADR-P03) — `docs/decisions/ADR-0013-redefinicao-gate-executavel-dry-run.md` (**aceita** — ratificada por Rafael em 2026-07-22) |
| **G-C4** | **Declarado fechável** por Rafael (2026-07-22) — fechável, não "fechado em produção" (ver §5) |
| **Modo** | 100% A SECO — sem banco, sem SEFAZ, provider simulado, certificado de teste, zero segredo |

> **Autoridades confirmadas mescladas:** GOAL-002/003/004/005/006/008 na `main`; **G-C2** (worker
> XSD, `9e30883`), **G-C3** (C14N externo, `e52d16b`) e **G-C6** (ST/CSOSN 500, `f8df2a4`) fechados.

---

## 1. O que mudou

Substituição do "dry-run verde" frouxo por um **gate de 11 itens** (`runFiscalDryRunGate`), verde
**somente** com **11/11 `aprovado`**. `numeracaoPlaceholder` **eliminado do modo gate** (numeração
real de homologação alocada). Nenhum item é aprovado por ausência de verificação; **falha permanece
falha**; `nao_auferivel` **nunca** conta como aprovado.

**Arquivos (allowlist):**
- `lib/fiscal/dry-run/dry-run-gate.ts` — verificador único dos 11 itens.
- `lib/fiscal/dry-run/dry-run-gate.types.ts` — tipos (`DryRunGateItem`, `DryRunGateReport`).
- `lib/fiscal/dry-run/dry-run-gate-fixtures.ts` — fixture positiva (mix piloto) + negativas.
- `lib/fiscal/dry-run/dry-run-gate.test.ts` — testes focados (12).
- `lib/fiscal/dry-run/index.ts` — export do gate.
- `package.json` — script `test:fiscal-gate`.
- `docs/decisions/ADR-0013-…md`, `docs/architecture/FISCAL_DRY_RUN.md` (§9), este relatório.

---

## 2. Matriz — fixture POSITIVA (mix piloto RafaCell, CSOSN 102)

> Contexto provisionado (worker XSD real fiado). Chave `35260711222333000181650010000000011859594936` ·
> `hashXmlAssinado 2ae7a014…901bc` · `numeracaoPlaceholder = false` · `descartado = true`.

| # | Item | Autoridade | Evidência (resumo) | Resultado |
|---|---|---|---|---|
| 1 | Snapshot imutável válido | Contrato `VendaFiscalSnapshot` + deep-freeze | `versao=1`, `regrasVersion=1`, `congelado=true`, `hash=67068b99…` | ✅ aprovado |
| 2 | Produto fiscal completo | Diagnóstico do snapshot (GOAL-004) | 3 itens, 3 completos, `itensSemFiscal=[]`, `pendencias=[]` | ✅ aprovado |
| 3 | XML estruturalmente correto | Builder NFC-e 4.00 + validação estrutural | `xmlGerado=true`, `hashXml=d47b4e19…`, `estruturalOk=true` | ✅ aprovado |
| 4 | **XSD oficial válido** | **Worker XSD real** (`PL_010e_v1.02`) — G-C2/ADR-0010 | `outcome=VALIDACAO_APROVADA`, engine `xmllint 2.15.3`, `schemaManifestHash=fc42d03e…` | ✅ aprovado¹ |
| 5 | Assinatura válida | XMLDSig RSA-SHA1/SHA-1 — G-C3/ADR-0011 | `assinaturaValida=true`, `referenciaId=NFe3526…4936` | ✅ aprovado |
| 6 | Certificado de teste compatível | `EnvVault` + `validarCertificadoLoja` — GOAL-008/ADR-0009 | `statusSugerido=ATIVO`, `cnpjConfere=true`, `vigente=true`, `cadeia=true` | ✅ aprovado |
| 7 | Numeração controlada real | `allocateFiscalNumber` (série homologação) — GOAL_008 | `serie=1`, `numero=1`, `HOMOLOGACAO`, `numeracaoPlaceholder=false` | ✅ aprovado |
| 8 | Idempotência | localKey + numeração + bytes determinísticos | `reexecucaoHashIgual=true`, `numeroReusado=true`, `contadorNaoTocado=true` | ✅ aprovado |
| 9 | Máquina de estados | Transições do pipeline a seco — GOAL_003 | 9 transições, `falhas=[]` (EMITINDO/AUTORIZADA bloqueiam; REJEITADA edita) | ✅ aprovado |
| 10 | Artefatos e logs | Invariante `descartado` + varredura de segredos | `descartado=true`, 7 etapas, `zeroSegredo=true`, sem PrismaClient | ✅ aprovado |
| 11 | Contrato do provider | `FiscalProvider` record/replay (Mock × Stub) | `simulado=true`, sequência `[validarSnapshot, prepararEmissao, emitir]`, `providerReal=false` | ✅ aprovado |

**Resultado positivo: 11/11 aprovado — gate VERDE (contexto provisionado).**

> ¹ **Honestidade do item 4:** o 11/11 acima usa o adapter FIEL AO CONTRATO (`XSD_OK_ADAPTER`) para
> provar a **fiação**; a evidência registra `engine.binaryHash` (no double = `aaaa…`), o que denuncia
> o test double. Com o **xmllint real** (worker provisionado) a mesma fiação registra o `binaryHash`
> real. **Sem worker provisionado** (execução local pura), o item 4 é **`nao_auferivel`** ⇒ **10/11**
> (gate NÃO verde) — por design, não por defeito.

### 2.1 Execução local pura (sem worker XSD)

| Item 4 | Resultado do gate |
|---|---|
| `nao_auferivel` (`WORKER_INDISPONIVEL`, fail-closed) | **10/11 — NÃO verde** (itens 1,2,3,5,6,7,8,9,10,11 = aprovado) |

---

## 3. Fixtures defeituosas — cada uma reprova no item exato

| Fixture defeituosa | Item alvo | Resultado observado | Gate |
|---|---|---|---|
| Produto fiscal incompleto (item sem CSOSN/CST) | **2** | item 2 `reprovado` (+ item 11 `reprovado` em cascata: o provider recusa snapshot com pendência) | ❌ não verde |
| XML inválido no XSD (worker reprova o schema) | **4** | item 4 `reprovado` (`XML_INVALIDO`) | ❌ não verde |
| Assinatura corrompida | **5** | item 5 `reprovado` (digest/SignatureValue não conferem) | ❌ não verde |
| localKey duplicado (bytes divergentes na reexecução) | **8** | item 8 `reprovado` (reexecução não-idempotente) | ❌ não verde |

> **Cascata do item 2:** um snapshot com produto incompleto também faz o **provider** (item 11)
> recusar — comportamento correto (não é falso-positivo). O **item raiz** é o 2.

---

## 4. Boundary — CSOSN 500 sem fiação de ST (fail-closed, nunca verde)

A fixture com CSOSN 500 **sem identificação de ST retida** é **corretamente bloqueada**:

| Item | Resultado | Leitura |
|---|---|---|
| 2 (produto) | ✅ aprovado | o **cadastro** do produto está completo (NCM/CFOP/CSOSN/origem) |
| 3 (XML) | ❌ **reprovado** | tributação **`st_incompleta`** (ADR-0012) ⇒ XML bloqueado — **raiz** |
| 4/5/7/8 | ❌ (cascata) | sem XML válido: XSD não auferível, sem assinatura, placeholder remanescente, sem bytes |

**Conclusão:** o gate **não fica verde** com um CSOSN 500 "vazio". A **fiação end-to-end da ST**
(venda→snapshot→XML com valores de ST) é **GOAL separado** (ADR-0012 §2) — fora da allowlist deste
GOAL. Por isso a fixture positiva do §2 usa o subconjunto **emitível** do mix piloto (CSOSN 102), e o
CSOSN 500 aparece como **boundary fail-closed**, não como caso verde.

---

## 5. Declarações obrigatórias (honestidade)

- **N4 auferível ≠ N6.** Este gate eleva o dry-run a **N4 auferível**; **não** é homologação.
- **Nenhuma homologação SEFAZ ocorreu.** Zero transmissão, zero provider real, zero banco, zero emissão.
- **Concorrência plena da numeração permanece no GOAL-010.** A reserva de homologação aqui é
  single-thread (idempotente por nota).
- **Item 4 exige o worker XSD real provisionado** para ser aprovado; localmente é `nao_auferivel`.
- **CSOSN 500 end-to-end não é auferível** com as dependências atuais (fiação de ST = GOAL separado).

### 5.1 G-C4 — declarado **fechável** (ratificação de 2026-07-22)

Rafael aceitou a **ADR-P03 (ADR-0013)** e autorizou declarar **G-C4 fechável**. "Fechável" = o critério de
"dry-run verde" agora é **auferível** (matriz de 11 itens, verde só com 11/11). **Não** é "fechado em
produção": item 4 depende do worker XSD real provisionado, a fiação da ST (CSOSN 500) segue pendente
(GOAL separado) e a concorrência plena da numeração permanece no **GOAL-010**. **N4 auferível ≠ N6.**

---

## 6. Como reproduzir

```bash
npm run test:fiscal-gate          # fiação dos 11 itens (12 testes)
npx vitest run lib/fiscal/dry-run lib/fiscal/pipeline
# item 4 com worker REAL: injetar o adapter do worker XSD provisionado (FISCAL_XSD_WORKER_URL)
```

---

*Relatório gerado no worktree `../wt-fiscal-007`. Nada foi transmitido, persistido em banco ou
emitido. Nenhum segredo aparece em log, erro, snapshot ou neste relatório.*
