# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Reparo do fixture positivo

**Data:** 2026-07-20 · **Branch:** `fix/fiscal-dry-run-005b-positive-fixture` (base `7e92194`, o merge do PR #16)
**Run com falha analisado:** [`29791958304`](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29791958304) (Gate H3, `Failure`)

## 1. Contexto

No primeiro dispatch do Gate H3 (run `29791958304`), a fase `proof-offline` reprovou **apenas** no
passo `PROVA (worker real) — matriz 1+8`: o `xmllint` real (libxml2 2.15.3, worker B2) classificou o
**positivo** como `xsd_invalido` (`positive: {xsd:false, status:"xsd_invalido", workerReal:true}`).
Os 8 negativos passaram 8/8; toda a infraestrutura (docker load, identidade da imagem, readiness,
rede `--internal`, zero egress, Java 17 host, hashes/lock) ficou verde. Ou seja: o worker real
funciona e o XML positivo gerado pelo harness é que não conformava ao XSD oficial.

## 2. Diagnóstico exato do `xmllint`

O XML positivo é o assinado produzido pelo próprio harness (`buildNfceXmlResult` → `signNfceXmlDetailed`).
Reproduzido **byte-a-byte** localmente (hashes idênticos aos do golden do run: `signedXmlSha256
d9a3eead…84a2`, `unsignedXmlSha256 5773978…d488`) e validado contra os XSDs oficiais committados
(`lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/`) com o **próprio `xmllint`/libxml2** (via `xmllint-wasm`,
mesmo motor; comando equivalente ao do worker: `xmllint --noout --nonet --nocatalogs --schema
nfe_v4.00.xsd -`):

```
input.xml:23: Schemas validity error : Element '{http://www.portalfiscal.inf.br/nfe}verProc':
  [facet 'maxLength'] The value has a length of '25'; this exceeds the allowed maximum length of '20'.
input.xml fails to validate
```

Diagnóstico normalizado:

| Campo | Valor |
|---|---|
| XPath / elemento | `NFe/infNFe/ide/verProc` (ns `http://www.portalfiscal.inf.br/nfe`) |
| Tipo XSD | `TString` com `xs:maxLength value="20"` (NFe v4.00, `tiposBasico_v4.00.xsd` / `leiauteNFe_v4.00.xsd`) |
| Facet violado | `maxLength` (20) |
| Valor observado | `OmniGestao-FiscalProof005` (comprimento 25) |
| Linha/coluna | linha 23 do XML gerado |
| Ordem / namespace / obrigatoriedade | **corretos** — não são a causa |

**É a única violação.** Patchando somente `verProc` para ≤ 20 chars no XML gerado, o `xmllint` real
retorna `input.xml validates` (VALID). Nenhum outro erro de schema aparece. O erro adicional visto no
XML **não assinado** (`Missing child … Signature`) é esperado (o worker valida o XML **assinado**).

## 3. Causa raiz e classificação

**Causa raiz:** a fixture sintética do harness (`syntheticXmlContext().versaoAplicativo`) fornecia
`"OmniGestao-FiscalProof005"` (25 caracteres), alimentando `<verProc>`, cujo tipo XSD oficial impõe
`maxLength = 20`. O builder compartilhado (`nfce-xml-builder.ts`) apenas repassa o valor
(`verProc = (contexto?.versaoAplicativo ?? NFCE_VER_PROC).trim() || NFCE_VER_PROC`) — comportamento
correto; ele não deve truncar dado de entrada silenciosamente.

**Classificação: A — fixture/snapshot sintético inválido.**
Não é B (a montagem XML do harness está correta), nem C (nenhum defeito na lib Fiscal compartilhada —
`nfce-xml-builder`, `signing`, `dry-run`, XSDs — que ficam **intocados**), nem D (worker/schema/config
corretos: readiness OK, versão libxml2 2.15.3, schema manifest confere). A correção cabe inteiramente
no fixture, dentro da allowlist. **Nenhum código produtivo, worker, schema oficial, lock, Prisma ou
Contador HUB foi tocado.**

## 4. Correção aplicada (mínima)

`versaoAplicativo` da fixture sintética passou de **`"OmniGestao-FiscalProof005"` (25)** para
**`"OmniGestaoProof005"` (18)** — permanece 100% sintético, sem inventar dado fiscal real, sem
enfraquecer o XSD, sem transformar o positivo em XML manual (segue saindo do fluxo real snapshot → XML
→ C14N → assinatura → verificação Java). Adicionada a constante `VER_PROC_MAX_LENGTH = 20` e um
comentário explicando o facet, para travar a regressão na origem.

### Estrutura antes → depois (somente o campo afetado; conteúdo sintético)

```diff
- <verProc>OmniGestao-FiscalProof005</verProc>   <!-- 25 chars → viola maxLength(20) -->
+ <verProc>OmniGestaoProof005</verProc>          <!-- 18 chars → conforme -->
```

Após a correção, o `xmllint` real aprova o positivo assinado: `input.xml validates`.

## 5. Arquivos alterados (todos na allowlist)

| Arquivo | Mudança |
|---|---|
| `tools/fiscal-dry-run-integrity-proof/fixtures.ts` | `versaoAplicativo` → `"OmniGestaoProof005"`; `VER_PROC_MAX_LENGTH`; comentário |
| `tools/fiscal-dry-run-integrity-proof/proof.ts` | novo campo sanitizado `xsdDiagnostics` no resultado (para expor diagnóstico do worker) |
| `tools/fiscal-dry-run-integrity-proof/proof.test.ts` | XSD-H16 rebaselinado; nova regressão **P-16** (verProc ≤ 20) |
| `tools/fiscal-dry-run-integrity-proof/matrix.test.ts` | mensagem do teste positivo mostra diagnósticos normalizados; log inclui `diagnostics` |
| `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` | golden regenerado pelo caminho oficial local (`run.ts --update-manifest`, composition-gate) — **segue PARCIAL** |
| `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_POSITIVE_FIXTURE_REPAIR.md` | este relatório |

## 6. Hashes — antigos → novos

`verProc` faz parte de `infNFe`; muda todo o fluxo XML. O `snapshotSha256` é **invariante** (o snapshot
não carrega `verProc`). `chaveAcesso`/`referenciaId` também são invariantes.

| Hash | Antigo | Novo |
|---|---|---|
| `snapshotSha256` | `efd6f54c362bddb781395514112ff3540418b868c854b1444b1122e8159bae2e` | **igual (invariante)** |
| `unsignedXmlSha256` | `5773978497ce4d63db0ca3e945f1df1306204b871d760bbf66d7e48cc9ffd488` | `ca8adf9772fde2723d7e173511ae48b43a60103ef1b80412ba2e40418e91533f` |
| `referencedNodeC14nSha256` | `5126ad4885f1a6f843a3d8b8e59c3afac33591d199533b8afea82616172233f7` | `5b2914270bb0363ad2ba61b3ac59af8f300bdac27d6faef2d40e0aa71b6cbe34` |
| `signedInfoSha256` | `449cc741f4187087090610abcaaf13195ee8fc82a045d8b91511254919421b69` | `aa1d73a8c58f9bb1b6da172984579652120230cbe0ebcf2e1548a12603ce97b4` |
| `signedXmlSha256` | `d9a3eead89deba74dbf2d6cf54db1562a3ef67c1b671e24a927d72127f3c84a2` | `da650b7053e1c7462780c43d248890b6da6c45c4f077408975e9f91acf43ccb9` |
| `signature.digestValue` | `C2JM/I4Y6H7n1G7YopYEiVLuASw=` | `5U16o3plF2m+5in/+7nm4Zq9ZmM=` |

As expectativas determinísticas hardcoded (proof.test.ts · XSD-H16) foram atualizadas para os novos
valores. Os demais testes de hash comparam contra o golden dinamicamente (P-10, XSD-H15, XSD-H17).

## 7. Testes

- **Regressão nova P-16** (`proof.test.ts`): extrai `<verProc>` do XML gerado e falha se exceder
  `VER_PROC_MAX_LENGTH (20)`; também trava a fonte (`syntheticXmlContext().versaoAplicativo ≤ 20`).
  Falha exatamente se o mesmo campo voltar a estourar o facet.
- **Mensagem do positivo** (`matrix.test.ts`): em falha futura, exibe `status`, `engine` e os
  `xsdDiagnostics` normalizados e sanitizados do worker (sem XML nem segredo) — não mais um seco
  "expected false to be true".
- **Resultados locais:**
  - `proof.test.ts` + `matrix.test.ts`: **88 passed | 12 skipped** (skipped = suíte do worker real, `FISCAL_XSD_WORKER_URL` ausente localmente).
  - `test:fiscal-xsd:unit` (validator, xsd-worker client, dry-run, pipeline, nfce-xml-builder): **41 passed | 1 skipped**.
  - `npx tsc --noEmit`: **0 erros**. · ESLint (arquivos alterados): **limpo**. · `git diff --check`: **limpo**.
  - Determinismo/idempotência/isolamento/assinatura/Java 17 externo: verdes (P-02/P-07/P-08/P-10; `run.ts` → `integrity.deterministic=true`).
  - Negativos preservados: N-01..N-14 verdes; corpus de negativos da matriz inalterado.
- **`npm run build`:** não executado — a mudança está inteiramente em `tools/` (harness CLI) + testes +
  evidência JSON, fora do grafo de build do Next.js (nenhuma rota/layout/config/Server Action/Prisma);
  o `tsc --noEmit` já checou o projeto inteiro. (A máquina também sofre OOM no build por RAM,
  independentemente da mudança.)

## 8. Estado do manifesto

Regenerado pelo **caminho oficial local** (`npx tsx run.ts --update-manifest`, sem
`FISCAL_XSD_WORKER_URL` → composition-gate). Mantém obrigatoriamente:

- `proofState = "partial"`
- `verification.xsd = false`
- `verification.xsdWorkerReal = false`
- `blockingReasons = ["XSD_WORKER_REAL_UNAVAILABLE"]`
- `verification.xsdEngineName = "composition-gate"` · `verification.xsdContract = true`

**A elevação H4 NÃO foi executada** (`--update-manifest` sob composition-gate não eleva; só o worker
real elevaria). Somente as hashes do fluxo XML foram atualizadas.

## 9. Confiança para um novo H3

**Alta.** A causa era única, determinística e de dado (não de infra nem de lib): `verProc` de 25 chars.
Corrigida a fixture para 18 chars, o **mesmo motor `xmllint`/libxml2 (via `xmllint-wasm`) aprova o XML
assinado byte-idêntico ao que o worker validará** (`input.xml validates`). Os 8 negativos e toda a
cadeia de segurança/infra já estavam verdes no run `29791958304`. Expectativa para o próximo dispatch
do Gate H3: `proof-offline` verde, `positive: {xsd:true, status:"xsd_ok", workerReal:true}`, matriz
1+8 aprovada — mantendo o manifesto parcial até a elevação autorizada (H4).

> **Nota:** este reparo **não** dispara workflow, rerun ou novo dispatch. O próximo dispatch do H3 é um
> passo autorizado à parte.
