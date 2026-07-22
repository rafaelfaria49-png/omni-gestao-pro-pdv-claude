# FISCAL-CERTIFICATE-PILOT-VAULT-008 — Evidências

> **Escopo:** conectar o `EnvVault` existente (ADR-0009) ao caminho de assinatura **a seco** e
> implementar o ciclo seguro do certificado A1 de **teste** (cadastro por referências, validação,
> ativação administrativa, alerta de vencimento, uso na assinatura a seco, fail-closed, zero
> vazamento de segredo). **Dormente:** zero emissão, zero SEFAZ, zero KMS de produção, zero ativação
> fiscal de loja, zero mudança de schema.

## Fonte da especificação (divergência registrada)

O arquivo `docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md` da `origin/main` **não contém** um
"COMANDO 008" numerado nem um "protocolo P0" — é um documento de notas de git-safety e reconciliação
de GOALs. O item "008" da tabela histórica em `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` é
*"Endurecer XMLDSig com certificado de teste — cumprido no GOAL nomeado 003"*, sem relação com um
cofre-piloto de certificado. **A especificação autoritativa desta execução é o comando completo
fornecido na conversa (planejamento Fable 5)**, confirmado pelo Rafael. Nenhum vínculo documental foi
inventado com o arquivo do repositório; a divergência de fonte fica registrada aqui.

## Branch / base / worktree

| Item | Valor |
|---|---|
| Base | `origin/main` = `f09c17043d15f7692e81917ee824c4a2b4e98795` (PR #22 mergeado) |
| Branch | `fiscal/goal-008-cert-pilot-vault` |
| Worktree | `../wt-fiscal-008` (isolada) |
| Runtime | Node v24.14.1 |

## Mecanismo de parse do PFX (checkpoint de dependência — aprovado)

Node **não tem** parser PKCS#12 nativo (comprovado: `createPrivateKey({type:"pkcs12"})` →
`ERR_INVALID_ARG_VALUE`; `X509Certificate` não lê o `.pfx` DER; sem símbolos `pkcs12`/`pfx` em
`crypto`). A OpenSSL CLI **não** existe no runtime serverless da Vercel e `child_process` de openssl
vazaria segredo — descartado.

- **Dependência aprovada por Rafael (checkpoint):** `node-forge@1.4.0` (`BSD-3-Clause OR GPL-2.0`) +
  `@types/node-forge@1.3.14` (MIT), instaladas com `--save-exact`.
- **Uso restrito:** `node-forge` abre **apenas o container PKCS#12** (`.pfx` → PEM). A
  **assinatura/crypto permanece em `node:crypto`** (RSA-SHA1/SHA-1, `fixed` pelo schema — ADR-0011) e
  os **metadados** (validade, serial, fingerprint SHA-1, CNPJ) saem do `X509Certificate`.
- **Higiene:** parse 100% em memória; nenhum arquivo temporário; sem OpenSSL CLI/`child_process`; o
  Buffer do `.pfx` é **zerado** após o parse (`buf.fill(0)`); erros nunca contêm o segredo.
  Limitação honesta: strings JS (senha/PEM) são imutáveis → liberadas ao GC (não há como zerá-las).

## Convenção das referências (ADR-0009 D2)

Segredo **só por referência opaca**, escopada por loja: `canonicalEnvRef(kind, storeId)` →
`FISCAL_A1_PFX_B64_<STORE>` (`.pfx` base64), `FISCAL_A1_SENHA_<STORE>` (senha), `FISCAL_CSC_TOKEN_<STORE>`.
O `EnvVault` resolve a partir de `process.env` (secret de plataforma), **fail-closed** (ref/env vazia
⇒ `null`) e **multi-loja estrito** (rejeita ref canônica de outra loja: `ref_fora_de_escopo`).

## Ciclo do certificado (item 5)

`PENDENTE_VALIDACAO → ATIVO` **somente por ato administrativo explícito** (`PATCH { ativo:true }`),
e **somente** se a validação do `.pfx` resolvido do cofre passar (`validate-then-activate`,
fail-closed). `PATCH { validar:true }` roda a validação sem ativar (reflete o status real:
`INVALIDO`/`EXPIRADO`/pendente). Ativar torna o certificado único na loja e aponta
`ConfiguracaoFiscalLoja.certificadoAtivoId`. **`fiscalEnabled` nunca é ligado.**

## Validação de CNPJ e validade (itens 3–4)

`validarCertificadoLoja` valida: formato/leitura do PKCS#12; par chave×certificado; RSA ≥ 2048;
janela de validade (`notBefore`/`notAfter`); cadeia disponível (≥ titular); e **CNPJ do certificado ×
CNPJ da loja** (`ConfiguracaoFiscalLoja.cnpj`), isolado por `storeId`. Resultado **saneado** (sem
segredo): `ok`, `statusSugerido`, `motivos[]`, `validade`, `cnpj{certificado,loja,confere}`,
`cadeiaDisponivel`, `titularCn`, `serialNumber`, `fingerprintSha1`.

## Auditoria em FiscalLog (item 6)

Validação e ativação gravam `FiscalLog` (append-only, best-effort) via `recordFiscalAdminLog`, com
`operador`/`storeId`/`detalhe` **sem segredo**: ativação → `certificado.ativar` (validade, cnpjConfere,
fingerprint); validação/reprovação → `certificado.update` (ok, motivos). Nenhuma ação nova de enum
foi criada (respeita a allowlist — `lib/fiscal/fiscal-log.ts` intocado).

## Fail-closed provado (item 9)

Matriz coberta por testes (`certificado-validacao.test.ts` + `dry-sign-from-vault.test.ts`):

| Cenário | Resultado |
|---|---|
| `blobRef` ausente | `INVALIDO` / `blobRef_ausente` (não toca o cofre) |
| `senhaRef` ausente | `INVALIDO` / `senhaRef_ausente` |
| `.pfx` ausente no cofre | `INVALIDO` / `pfx_ausente` |
| senha incorreta | `INVALIDO` / `senha_incorreta` |
| certificado inválido (bytes) | `INVALIDO` / `certificado_invalido` |
| certificado vencido | `EXPIRADO` / `certificado_vencido`, `vigente=false` |
| CNPJ divergente | `INVALIDO` / `cnpj_divergente` |
| ref de outra loja (isolamento) | `INVALIDO` / `ref_fora_de_escopo` |
| assinatura a seco sem segredo | `NfceSignError(vault_erro)` — não assina |

## Assinatura a seco com certificado de teste (itens 1 e 10)

`drySignNfceFromVault` conecta o `EnvVault` ao assinador: resolve o A1 de teste por referência → abre
o PKCS#12 em memória → assina um **XML NFC-e sintético** (via `buildVendaFiscalSnapshot` + `buildNfceXml`)
com `node:crypto`. "A seco" = **não** transmite, **não** chama SEFAZ, **não** persiste, **não** gera
DANFE. `verifyNfceSignature` confere a assinatura (`valido:true`). Certificado de teste é gerado em
runtime pela fábrica `__fixtures__/make-test-pfx.ts` (reaproveita a chave RSA-2048 de teste; nunca o
certificado real da RafaCell).

## Varredura de segredos (itens 11–12) — resultado: ZERO ocorrência

Utilitário `scanForSecrets`/`assertNoSecretLeak` procura, no palheiro (resposta HTTP, log, erro,
snapshot, relatório), por: bytes do `.pfx` (base64/hex, inclusive `Buffer` aninhado normalizado),
senha, corpo da chave privada PEM, material decodificado e conteúdo de refs sensíveis.

- **Testes:** cada camada (loader, validação, assinatura a seco) prova `vazou=false` sobre seu
  resultado/erro.
- **Artifacts do build (`.next`):**
  - `pkcs12FromAsn1`/`node-forge` em `.next/static` (client): **0 ocorrências** — parser é server-only.
  - `.next/server`: presente (esperado; server-side é o correto).
  - `senha-teste-omni` / `senha-pfx-teste` / `BEGIN ENCRYPTED PRIVATE KEY` / `SENHA-ULTRA-SECRETA`
    em `.next`: **0 ocorrências**.
  - `FISCAL_A1_PFX_B64` / `FISCAL_A1_SENHA` em `.next/static`: **0 ocorrências**.

## Zero segredo persistido (item 13)

Nenhum `.pfx`, senha ou chave privada é gravado no banco: `CertificadoDigital` guarda só metadados +
`blobRef`/`senhaRef`. Nenhuma mudança de schema (`prisma/**` intocado). O material PEM decodificado
vive apenas em memória durante a assinatura.

## Nível de evidência (piloto)

**N5 (vault piloto):** cofre por referência conectado ao caminho de assinatura, ciclo administrativo
e fail-closed provados com **certificado de teste** e XML sintético. **N6 exige retorno real da SEFAZ
em homologação — não alcançado aqui (fora do escopo).** Zero emissão, zero SEFAZ, zero KMS de produção.

## Validações executadas

| Gate | Resultado |
|---|---|
| `vitest run lib/fiscal/vault` + dry-sign | **50/50** (42 novos GOAL-008 + 8 env-vault) |
| `vitest run lib/fiscal` (suíte completa) | **352 passed / 16 skipped / 0 failed** |
| `tsc --noEmit` | **0 erros** |
| `eslint` (arquivos alterados + FiscalSection) | **0 erros** |
| `npm run build` | **exit 0** (todas as rotas, inclusive `/api/fiscal/certificado`) |
| `git diff --check` | limpo (apenas avisos LF↔CRLF) |
| Varredura de segredos em artifacts | **0 ocorrências** |

## Arquivos (allowlist)

**Novos (`lib/fiscal/vault/`):** `pkcs12-loader.ts`(+test), `certificado-validacao.ts`(+test),
`certificado-alerta.ts`(+test), `secret-scan.ts`(+test), `__fixtures__/make-test-pfx.ts`.
**Novos (`lib/fiscal/signing/`):** `dry-sign-from-vault.ts`(+test).
**Editados:** `lib/fiscal/vault/index.ts`, `lib/fiscal/signing/index.ts`,
`app/api/fiscal/certificado/route.ts` (GET status/alerta),
`app/api/fiscal/certificado/[id]/route.ts` (validate-then-activate),
`components/configuracoes-v3/.../FiscalSection.tsx` (badge de vencimento),
`package.json` + `package-lock.json` (node-forge).

> Fora da allowlist e **não commitado:** `lib/fiscal/tax-engine/__snapshots__/calculator.test.ts.snap`
> aparece como modificado por renormalização LF↔CRLF do checkout da worktree (diff de conteúdo vazio
> em `git diff --ignore-all-space`). Preservado intocado.
