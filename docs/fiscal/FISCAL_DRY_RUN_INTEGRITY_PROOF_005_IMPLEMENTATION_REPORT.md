# FISCAL — Prova de Integridade do Dry-Run (GOAL-005)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` |
| Nome humano | Prova de Integridade do Dry-Run Fiscal |
| Tipo | Harness técnico **não produtivo** — composição offline de componentes dormentes |
| Data | 2026-07-17 |
| Branch | `work/fiscal-dry-run-integrity-proof-005` |
| Base documental | PR #10 · merge `ccb8b0f0bb19c4a1e201e78b3c290fa65fabe959` |
| Documento de escopo | [`FISCAL_GOAL_005_SCOPE_RECONCILIATION.md`](./FISCAL_GOAL_005_SCOPE_RECONCILIATION.md) |
| Nível N | **N3** (implementação em branch); máximo futuro **N4** só no eixo dry-run **após** auditoria + merge |
| N6 / N7 | **0** / **0** |
| Emissão / SEFAZ / homologação / produção | **não** |
| Callers produtivos | **0** |
| Gates alterados | **nenhum** |

---

## 1. Objetivo cumprido

Provar, de forma **determinística, reproduzível e exclusivamente offline**, a cadeia íntegra:

fixture sintética → snapshot → XML → C14N → DigestValue → SignedInfo → XMLDSig →
verificação interna → verificação Java 17 (JSR 105) → contrato XSD oficial →
manifesto de hashes → adulteração → idempotência → isolamento multi-loja →
zero persistência / zero egress / zero SEFAZ.

---

## 2. Inventário de componentes reutilizados (sem duplicação)

| Componente | Caminho | Classificação | Uso no GOAL-005 |
|---|---|---|---|
| Snapshot Fiscal | `lib/fiscal/venda-fiscal-snapshot.ts` | real, puro, dormente | entrada canônica |
| Tax engine (congelado no snapshot) | `lib/fiscal/tax-engine/*` | real, puro | via snapshot |
| XML NFC-e 4.00 | `lib/fiscal/xml/nfce-xml-builder.ts` | real, puro, dormente | montagem |
| C14N 1.0 | `lib/fiscal/signing/c14n.ts` | real, puro | canônico |
| Signer XMLDSig RSA-SHA1 | `lib/fiscal/signing/nfce-signer.ts` | real, puro, dormente | assinar/verificar |
| Cert sintético GOAL-003 | `lib/fiscal/signing/__fixtures__/test-cert.ts` | teste sintético | material cripto |
| Dry-run validação | `lib/fiscal/dry-run/dry-run-validation.ts` | real, dormente | estrutura + XSD adapter |
| Pacote XSD oficial | `lib/fiscal/xsd/*` (`PL_010e_v1.02`) | real, versionado | contrato/manifest hash |
| Worker XSD client | `lib/fiscal/xsd-worker/client.ts` | real, adapter | suite opcional com URL |
| Verificador Java | `tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java` | prova GOAL-003 | verificação externa |
| Emission / provider / numbering Prisma | `lib/fiscal/emission/*`, `provider/*`, `numbering/*` | **inadequado** | **não usados** |

**Gate de continuidade:** todos os componentes essenciais existiam e foram **compostos**, não reimplementados.

---

## 3. Arquivos entregues (allowlist)

| Arquivo | Tipo |
|---|---|
| `tools/fiscal-dry-run-integrity-proof/fixtures.ts` | fixture sintética |
| `tools/fiscal-dry-run-integrity-proof/proof.ts` | orquestrador |
| `tools/fiscal-dry-run-integrity-proof/java-external.ts` | wrapper Java 17 |
| `tools/fiscal-dry-run-integrity-proof/proof.test.ts` | P-01..P-15 + N-01..N-14 |
| `tools/fiscal-dry-run-integrity-proof/run.ts` | CLI verify/update-manifest |
| `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` | golden determinístico |
| `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005_IMPLEMENTATION_REPORT.md` | este relatório |
| `docs/ai/CURRENT_STATUS.md` | status |
| `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | goals |
| `docs/roadmaps/ROADMAP_FISCAL.md` | roadmap |

**Zero alteração** em módulos produtivos de runtime (signer, XML, snapshot, Prisma, PDV, emission).

---

## 4. Fixture sintética

- Stores: `store-fiscal-proof-a` / `store-fiscal-proof-b` (nunca `loja-1`)
- Empresa: `EMPRESA SINTETICA TESTE` · textos `SEM VALOR FISCAL`
- CNPJ estrutural: `00.000.000/0001-91` (DV válido; **não** empresa real)
- Clock: `2026-01-15T12:00:00.000Z`
- Seed: `FISCAL-DRY-RUN-INTEGRITY-PROOF-005/v1`
- Material cripto: **somente** certificado de teste do GOAL-003
- Algoritmos (ADR-0011, inalterados): C14N 1.0 · RSA-SHA1 · SHA-1 digest

---

## 5. Determinismo e normalização

| Campo | Comportamento |
|---|---|
| XML não assinado / assinado | **byte-determinístico** com clock/seed/store fixos |
| DigestValue / C14N / SignedInfo | **reproduzíveis** (interno ≡ Java) |
| `snapshot.geradoEm` | builder produtivo usa `new Date()` (wall-clock); a prova **normaliza** para o clock injetado **apenas no fingerprint** — sem mudar o builder |
| Manifesto golden | comparado byte a byte |

---

## 6. Provas

### Positivas (P-01..P-15)

Todas cobertas em `proof.test.ts` (31 passed; 1 skipped = XSD worker real sem URL).

### Negativas (N-01..N-14)

Adulteração de total/item/NCM/Digest/Signature/URI/Id/algoritmo/XXE; storeId inválido;
manifesto adulterado; SEFAZ impossível; write produtivo abortado.

### Java

Verificador `FiscalXmlDsigVerifier` (GOAL-003) em Java 17 — digest e validade alinhados ao signer.

### XSD

- **Composição offline (default CI):** adapter injeta o **mesmo contrato** do pacote oficial
  (`XSD_SCHEMA_PACKAGE` + `OFFICIAL_XSD_MANIFEST_SHA256`) e exige `<Signature>` no XML.
  Não substitui o worker `xmllint`; prova o **gate de contrato** usado pelo dry-run.
- **Worker real (opcional):** suite ativa com `FISCAL_XSD_WORKER_URL` (mesmo client B2).

---

## 7. Segurança

| Controle | Resultado |
|---|---|
| Callers produtivos | 0 |
| Database writes | 0 (probe; aborta se ≠ 0) |
| SEFAZ / egress | 0 |
| Credencial real / A1 / CSC / idToken | 0 |
| Dado RafaCell / loja-1 / XML real | 0 |
| Chave privada no manifesto | ausente |
| Provider emission | não importado |

---

## 8. Como rodar

```bash
# suíte da prova (gera/compara golden; Java 17 no PATH)
npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts

# regenerar manifesto (somente quando hashes legítimos mudarem)
# FISCAL_005_UPDATE_MANIFEST=1 npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts

# runner CLI
npx tsx tools/fiscal-dry-run-integrity-proof/run.ts
# npx tsx tools/fiscal-dry-run-integrity-proof/run.ts --update-manifest

# XSD worker real (opcional)
# FISCAL_XSD_WORKER_URL=http://127.0.0.1:18080 npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts
```

---

## 9. Estado de gates e maturidade

| Item | Valor |
|---|---|
| Gate Fiscal global F4→F5 | **aberto** |
| G-F5 / G-F7 / G-F12 | **abertos** |
| G-C1 / G-C2 / C14N F4→F5 técnico | fechados (herdados) |
| Nível atual | **N3** |
| Nível máximo futuro deste eixo | **N4** somente após auditoria + merge controlado |
| N6 / N7 | 0 / 0 |
| Signer | dormente |
| Emissão | não ativada |

---

## 10. Fora de escopo (confirmado)

- Caller PDV/venda/Caixa/API/UI
- Emissão, transmissão, homologação, produção
- Schema/migration/Prisma
- Regra tributária nova
- Contador HUB
- Modernização de algoritmos (ADR-0011 intacto)
- PR / merge / push para main (nesta tarefa: apenas branch)

---

## 11. Validações executadas nesta branch (2026-07-17)

| Comando | Resultado |
|---|---|
| `npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts` | ✅ **31 passed** · 1 skipped (XSD worker real sem `FISCAL_XSD_WORKER_URL` / Docker ausente no host) |
| `npx tsx tools/fiscal-dry-run-integrity-proof/run.ts` | ✅ manifest OK byte-igual · `ok: true` · Java 17 + XSD contrato + safety zero |
| `npx vitest run lib/fiscal` | ✅ **262 passed** · 16 skipped (c14n-external-proof condicional) |
| `npx tsc --noEmit` | ✅ EXIT=0 |
| `npx eslint tools/fiscal-dry-run-integrity-proof --max-warnings 0` | ✅ EXIT=0 |
| `npm run build` | ✅ EXIT=0 (Next.js 16.2 · 103 rotas; harness fora do bundle de produção) |
| Worker XSD Docker local | ⚠️ Docker CLI **não instalado** neste host — suite real permanece opcional/skip |
| Java 17 / `javac` | ✅ Temurin 17.0.13 |

## 12. Próximo passo

1. Auditoria de merge readiness desta branch.
2. PR documental+técnico do harness (sem auto-merge).
3. Aprovação humana.
4. Merge controlado (merge commit).
5. Só então considerar elevação a **N4 no eixo dry-run** — sem abrir G-F5.

**Reconciliação documental ≠ implementação ≠ emissão ≠ SEFAZ.**
