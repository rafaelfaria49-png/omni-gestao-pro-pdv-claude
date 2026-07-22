# FISCAL-KMS-PRODUCTION-ARCH-009 — Arquitetura executável do `KmsStorageVault` de produção

> **GOAL:** `FISCAL-KMS-PRODUCTION-ARCH-009`
> **Entrega:** **exclusivamente documental.** Zero código, zero provisionamento, zero credencial,
> zero acesso a produção, zero mudança de schema/auth/proxy/Prisma/banco.
> **Base:** `origin/main` = `d729cb990470fd378c039cec38e430e6188a3f82` (merge do PR #24).
> **Branch/worktree:** `fiscal/goal-009-kms-arch` · `C:\\tmp\\wt-fiscal-009`.
> **Decisão-mãe:** [`ADR-0009`](../decisions/ADR-0009-fiscal-secret-vault.md) — **D3** (backend de
> produção/escala = `KmsStorageVault`: envelope encryption + storage privado, chave mestra fora da
> aplicação). Este GOAL **define a arquitetura executável** que D3 previu; **não reabre** ADR-0009.
> **Gate-alvo:** `G-F12` (virada `HOMOLOGACAO → PRODUCAO` por loja) —
> [`MASTER_FISCAL_EXECUTION_PLAN.md`](../governance/MASTER_FISCAL_EXECUTION_PLAN.md) §4.

---

## Decisão aprovada por Rafael (checkpoint GOAL-009)

> **Backend KMS de produção: Opção A — Supabase Vault** (resolve o item deferido de ADR-0009 D3).
> Aprovação registrada em 22/07/2026, com **10 condições obrigatórias** (mais restritas que a
> recomendação inicial de "DEK por loja"). As condições abaixo **vinculam** a arquitetura deste doc e
> a ADR aceita
> ([`ADR-0014`](../decisions/ADR-0014-supabase-vault-backend-kms-fiscal.md)):

1. **Chave mestra gerenciada pelo Supabase**, **fora da aplicação** e **separada dos dados
   criptografados** (não co-mora com o blob cifrado).
2. **Envelope encryption** (MK wrap DEK; DEK cifra o segredo).
3. **DEK distinta por segredo e por versão do certificado** — **nunca** uma DEK global compartilhada
   entre lojas. (Granularidade **mais fina** que "por loja".)
4. **Vinculação criptográfica** do segredo ao `storeId` + `certificadoId` + `versão` + `finalidade
   fiscal` (AAD/AEAD — ver §3.4).
5. **Blob cifrado em bucket privado exclusivo do Fiscal** (`fiscal-segredos`), distinto do bucket do
   Contador HUB.
6. **Não compartilhar** bucket, políticas (RLS/policies) nem permissões com o Contador HUB. Reuso
   **apenas do padrão técnico** (porta `StorageDocumentosPort`) e da **infraestrutura Supabase**
   (mesmo projeto, cliente `@supabase/supabase-js`, `service_role` server-only).
7. **Nenhum cliente/browser acessa:** `vault.secrets`, segredo descriptografado, bucket fiscal,
   chave (MK) ou DEK. O acesso ao segredo fiscal é **server-only end-to-end** — **diferente** do
   Contador HUB, que usa upload direto do navegador por URL assinada (esse fluxo **não** se aplica ao
   Fiscal).
8. **Acesso somente server-side**, por **serviço fiscal autorizado** e com **privilégio mínimo**.
9. Prever: **rotação**, **revogação**, **versionamento**, **remoção segura**, **auditoria**,
   **recuperação**, **fail-closed**, **isolamento rigoroso por `storeId`**.
10. **Cloud KMS externo (AWS/GCP)** registrado como **evolução futura** — caso surja requisito
    regulatório, HSM dedicado ou custódia independente do Supabase.

> As seções técnicas (§3–§7) e a ADR-0014 estão **alinhadas** a estas condições. As demais
> decisões arquiteturais do checkpoint e a verificação de consistência estão consolidadas no §11.

---

## 0. Fonte da especificação (divergência registrada)

O arquivo `docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md` da `origin/main` **não contém** um
"COMANDO 009" numerado — é um documento de notas de git-safety e reconciliação de GOALs (ver §0.1
abaixo). **A especificação autoritativa desta execução é o comando completo fornecido na conversa
(planejamento Fable 5)**, confirmado pelo Rafael. Nenhum vínculo documental foi inventado com o
arquivo do repositório; a divergência de fonte fica registrada aqui — **mesmo padrão honesto já
adotado pelo GOAL-008** em
[`FISCAL_CERT_PILOT_EVIDENCIAS_001.md`](./FISCAL_CERT_PILOT_EVIDENCIAS_001.md) §"Fonte da especificação".

### 0.1 Colisão de numeração "GOAL-009" (registrar; não renumerar histórico)

A tabela histórica em
[`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`](./FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md)
associa "GOAL 009" a *"Tornar o dry-run auferível, sem stub indulgente"* — **esse slot histórico foi
executado e fechado como GOAL nomeado `FISCAL-DRY-RUN-GATE-007`** (PR #24, merge `d729cb9`, ADR-0013).
O **GOAL nomeado desta execução** é `FISCAL-KMS-PRODUCTION-ARCH-009` (arquitetura KMS de produção) —
**objeto distinto**. Mantém-se a regra do projeto: **colisão de numeração é registrada, o histórico
não é renumerado** (precedente: GOAL-002/003/004/005/008 todos registraram colisões sem renumerar).
**Não confundir** os dois "009":

| Identificador | Significado | Estado |
|---|---|---|
| Tabela histórica GOAL **009** | "Tornar o dry-run auferível" | **CUMPRIDO** no eixo dry-run (GOAL nomeado 007, PR #24) |
| GOAL nomeado `…-009` (este) | Arquitetura KMS de produção (`KmsStorageVault`) | **DEFINIDO documentalmente aqui** — N3, sem implementação |

---

## 1. Pre-flight (evidência)

| Item | Valor | Evidência |
|---|---|---|
| Repositório | `C:/Projetos/omni-gestao` | `git rev-parse --show-toplevel` |
| `origin` | `https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude.git` | `git remote get-url origin` |
| `origin/main` | `d729cb990470fd378c039cec38e430e6188a3f82` | `git log origin/main -1` |
| PRs fiscais #21–#24 | Mesmo repositório `rafaelfaria49-png/omni-gestao-pro-pdv-claude`; todos mergeados em `main` | Metadados da API GitHub |
| PR #24 | **Mergeado** (merge commit = HEAD de `origin/main`) | `d729cb9 Merge pull request #24 from …/fiscal/goal-007-dry-run-gate` |
| PR #24 — status combinado | **success** (Vercel ×2 success) | GitHub API `commits/3998f81/status` |
| PR #24 — check-runs | 4/5 success · 1 failure | GitHub API `commits/3998f81/check-runs` (ver §1.1) |
| Branch/worktree | `fiscal/goal-009-kms-arch` · `C:\tmp\wt-fiscal-009` | `git worktree list` |
| HEAD da worktree | `d729cb9` (= `origin/main`) | `git -C ../wt-fiscal-009 log -1` |

### 1.1 Caracterização do check falho do PR #24

O workflow **`Fiscal XSD Worker B2`** (`.github/workflows/fiscal-xsd-worker.yml`) teve **um job
falho**: *"Container, offline integration and supply chain"* — falha na etapa *"Testes no container
real (executados dentro da rede sem egress)"*; as etapas seguintes (zero-egress, suite+build Next,
hashes, SBOM, Trivy) foram **skipped** em cascata. Os demais jobs do mesmo workflow passaram:

- `Unit and contract (ubuntu-24.04)` ✅ · `Unit and contract (windows-2022)` ✅
- `npm run fiscal:xsd:verify-hashes` ✅ · `npm run test:fiscal-xsd:unit` ✅ · `npx tsc --noEmit` ✅ ·
  `ESLint fiscal focado` ✅
- `Java JSR 105, offline and independent` (workflow `fiscal-c14n-external-proof.yml`) ✅
- `Vercel - omni-gestao` ✅ · `Vercel - omni-gestao-pro` ✅ (combined status = success)

**Leitura honesta:** há **um** check falho, **não bloqueante para o merge** (o PR #24 está mergeado e
`origin/main` é válido; o status combinado é `success`). A falha está confinada ao eixo **supply
chain do worker XSD offline** (prova de container sem egress) — **sem relação** com o cofre fiscal,
com KMS, com build/typecheck ou com este GOAL documental. **Registrada para transparência**; não
impede a execução. Se Rafael quiser reabrir a prova de container, é um GOAL próprio (não este).

---

## 2. Inventário da infraestrutura real (com evidências do repositório)

> **Regra do comando:** "Se o repositório não permitir determinar onde e como o app roda em produção,
> pare e peça o insumo a Rafael. Não presuma infraestrutura." — O repositório **permite determinar**
> a infraestrutura de produção. Inventário abaixo, **lido de `origin/main`** na worktree
> `../wt-fiscal-009`.

### 2.1 Ambiente de deploy — **Vercel** (serverless Node 20)

| Evidência | Local | Citação |
|---|---|---|
| Detecção de runtime Vercel | `next.config.mjs:14` | `const isVercel = process.env.VERCEL === "1"` |
| HSTS só em Vercel (produção) | `next.config.mjs:59-64` | `if (isVercel) { securityHeaders.push({ Strict-Transport-Security … }) }` |
| Engine Node 20 | `package.json:5-7` | `"engines": { "node": "20.x" }` |
| Build = `prisma generate` + `next build --webpack` | `package.json:12` | `"build": "prisma generate && next build --webpack"` |
| Cabeçalhos de segurança (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) | `next.config.mjs:46-57` | — |
| PWA via `@ducanh2912/next-pwa` | `next.config.mjs:1-12` | — |
| `@vercel/analytics` 1.6.1 | `package.json:78` | — |
| Variáveis de ambiente Vercel documentadas (NextAuth, Stripe, WhatsApp, Fiscal) | `CLAUDE.md` §"Environment Variables" | — |

**Restrição crítica de bundle (lida de `next.config.mjs:32-43`):** o bloco `env` do `next.config` é
**inlined via DefinePlugin no bundle do CLIENTE** — só pode conter valores **públicos**. Segredos de
servidor **não** vão nesse bloco; são lidos em runtime via `process.env.*` no Node runtime. **Implica
para o KMS:** a master key / data key / service role **nunca** entram no `env` do `next.config`; só
em secrets de plataforma (Vercel) lidos server-side — **igual ao padrão já adotado pelo `EnvVault` e
pelo adapter do Contador**.

### 2.2 Banco de dados — **Supabase / Postgres**

| Evidência | Local | Citação |
|---|---|---|
| `DATABASE_URL` = pooler transação Supabase (porta 6543, `pgbouncer=true`) | `.env.example:11` | `postgresql://postgres:SENHA@db.<PROJECT_REF>.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1…` |
| `DIRECT_URL` = conexão direta Supabase (porta 5432, `supavisor=true`) — migrations | `.env.example:17` | `…@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require…&supavisor=true` |
| Prisma singleton com safe error handling | `lib/prisma.ts:1-56` | `import { PrismaClient } from "@/generated/prisma"` |
| Tabelas fiscais escopadas por `storeId` (multi-loja estrito, ADR-0003) | `prisma/schema.prisma:2246-2294` | `ConfiguracaoFiscalLoja.storeId @unique` |
| Client Prisma gerado localmente (`@/generated/prisma`) | `lib/prisma.ts:1` | `postinstall: prisma generate` (`package.json:26`) |

### 2.3 Storage disponível — **Supabase Storage (bucket privado + URLs assinadas)**

**Precedente direto e reutilizável** — GOAL 010 (Contador HUB) já opera storage privado em produção:

| Evidência | Local | Citação |
|---|---|---|
| Cliente Supabase instalado | `package.json:74` | `"@supabase/supabase-js": "^2.110.7"` |
| Adapter de storage privado (server-only, `service_role`) | `lib/contador/documentos/storage-supabase.ts:14-146` | `createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })` |
| Bucket **privado** — nunca `getPublicUrl` | `lib/contador/documentos/storage-supabase.ts:3-9` | "`storageRef` é sempre o path privado — nunca `getPublicUrl`, nunca bucket público" |
| Upload direto do navegador por URL assinada (binário **não** passa pela API Next) | `.env.example:43-45` · `storage-supabase.ts:61-78` | `createSignedUploadUrl(storageRef, { upsert: false })` |
| Download por URL assinada de curta duração (≤ 300 s, attachment) | `lib/contador/documentos/config.ts:16` · `storage-supabase.ts:111-129` | `DOWNLOAD_EXPIRACAO_SEG = 300` · `createSignedUrl(storageRef, expira, { download: nomeArquivo })` |
| Erros externos → `StorageError` com mensagem **segura** (sem token/URL assinada) | `lib/contador/documentos/storage-supabase.ts:44-47` · `storage-types.ts:66-74` | `falha(operacao)` → "Falha na operação de storage (${operacao})." |
| Guarda de segurança: rejeita `NEXT_PUBLIC_*SERVICE_ROLE` | `lib/contador/documentos/config.ts:69-76` | `if (chave.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE/i.test(chave)) throw new StorageConfigError(...)` |
| Variáveis documentadas | `.env.example:42-55` | `SUPABASE_URL=` · `SUPABASE_SERVICE_ROLE_KEY=` · `SUPABASE_STORAGE_BUCKET=contador-documentos` |
| Porta de storage (contrato) — `StorageDocumentosPort` | `lib/contador/documentos/storage-types.ts:45-64` | `verificarBucket` · `criarUploadAssinado` · `abrirConteudoPrivado` · `criarDownloadAssinado` · `removerObjeto` · `verificarExistencia` |

**Implica para o KMS:** o "storage privado" do `KmsStorageVault` (ADR-0009 D3) **não precisa de
infra nova** — reusa o mesmo Supabase Storage com bucket privado dedicado (ex. `fiscal-segredos`),
`service_role` server-only, URLs assinadas de curta duração e erros seguros. O pattern é **provado
em produção** pelo Contador HUB.

### 2.4 Variáveis de ambiente documentadas (relevantes para KMS)

| Variável | Papel | Documentada em |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Postgres Supabase (app / migrations) | `.env.example:11,17` |
| `SUPABASE_URL` | URL do projeto Supabase (server-only) | `.env.example:49` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` — bypassa RLS, **server-only**, nunca `NEXT_PUBLIC_*` | `.env.example:50-53` |
| `SUPABASE_STORAGE_BUCKET` | bucket privado (Contador) | `.env.example:54-55` |
| `AUTH_SECRET` / `NEXTAUTH_URL` | NextAuth JWT (server-only) | `CLAUDE.md` |
| `WHATSAPP_ACCESS_TOKEN` (e variantes por loja) | token Meta por loja, **por nome** (ADR-0006) | `CLAUDE.md` |
| `FISCAL_A1_PFX_B64_<STORE>` / `FISCAL_A1_SENHA_<STORE>` / `FISCAL_CSC_TOKEN_<STORE>` | **EnvVault** (piloto) — segredo fiscal por env, por loja | `lib/fiscal/vault/fiscal-secret-vault.ts:78-88` · `lib/fiscal/vault/env-vault.ts:1-14` |

> **Não há**, em `.env.example` nem em `package.json`, qualquer variável/SDK de **cloud KMS externo**
> (AWS KMS, GCP Cloud KMS, Azure Key Vault). Também **não há** `pgsodium`/`libsodium` nativo no
> cliente — Supabase Vault (pgsodium) é operado **pelo projeto Supabase** via SQL, não via SDK no app.

### 2.5 CI/CD — GitHub Actions (eixo fiscal)

| Workflow | Local | Papel |
|---|---|---|
| `fiscal-xsd-worker.yml` | `.github/workflows/` | Unit/contract (ubuntu+windows) + container offline/supply chain |
| `fiscal-xsd-worker-supply-chain.yml` | `.github/workflows/` | Bundle offline aprovado do worker XSD |
| `fiscal-c14n-external-proof.yml` | `.github/workflows/` | Prova externa C14N/XMLDSig (Java JSR 105, container offline) |
| `fiscal-dry-run-integrity-proof.yml` | `.github/workflows/` | Prova de integridade do dry-run |

Scripts fiscais em `package.json`: `test:fiscal-xsd:unit`, `test:fiscal-xsd:integration`,
`test:fiscal-xsd:security`, `test:fiscal-gate`, `test:fiscal-c14n:external`,
`fiscal:xsd:verify-hashes`. **Não há workflow de KMS/vault** — este GOAL é documental; a
implementação futura do `KmsStorageVault` (sprint própria, **não** este GOAL) pode introduzir um
workflow de prova de envelope encryption.

### 2.6 Mecanismo atual do `EnvVault` (o que será migrado)

| Aspecto | Evidência |
|---|---|
| Port único `FiscalSecretVault` (referência opaca, fail-closed, multi-loja) | `lib/fiscal/vault/fiscal-secret-vault.ts:53-67` |
| Backend piloto `EnvVault` — `*Ref` = nome de env por loja | `lib/fiscal/vault/env-vault.ts:41-137` |
| Nomes canônicos por loja | `lib/fiscal/vault/fiscal-secret-vault.ts:78-88` (`canonicalEnvRef`) |
| Escopo multi-loja (rejeita ref de outra loja) | `lib/fiscal/vault/env-vault.ts:51-62` (`assertScope` → `ref_fora_de_escopo`) |
| Fail-closed (ref/env vazia ⇒ `null` ⇒ caller não emite) | `lib/fiscal/vault/env-vault.ts:64-73` |
| Escrita manual no piloto (`put*`/`revoke` → `operacao_nao_suportada` salvo store injetado) | `lib/fiscal/vault/env-vault.ts:96-136` |
| PKCS#12 loader (node-forge, server-only, Buffer zerado) | `lib/fiscal/vault/pkcs12-loader.ts` · `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Mecanismo de parse" |
| Assinatura a seco conectada ao vault | `lib/fiscal/signing/dry-sign-from-vault.ts` |
| Varredura de segredos (zero leak em log/bundle/erro) | `lib/fiscal/vault/secret-scan.ts:1-119` |
| Validação do certificado (CNPJ, vigência, cadeia) | `lib/fiscal/vault/certificado-validacao.ts` |
| Alerta de vencimento | `lib/fiscal/vault/certificado-alerta.ts` |
| Schema: só `*Ref`, nunca bytes/senha em coluna | `prisma/schema.prisma:2296-2322` (`CertificadoDigital.blobRef`/`senhaRef`) · `:2278-2285` (`cscTokenRef`/`providerTokenRef`) |
| Estado (GOAL-008): N5 piloto, zero emissão, zero SEFAZ, zero KMS produção | `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Nível de evidência" |

### 2.7 Bibliotecas de cripto disponíveis no app (relevantes para envelope encryption)

| Biblioteca | Versão | Papel | Local |
|---|---|---|---|
| `node-forge` | `1.4.0` (save-exact) | Parser PKCS#12 (`.pfx`→PEM); **aprovado por Rafael no GOAL-008** | `package.json:96` · `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Mecanismo de parse" |
| `node:crypto` (built-in) | Node 20 | RSA-SHA1/SHA-256 (assinatura XMLDSig, ADR-0011); AES-GCM (envelope) | — |
| `xml-crypto` | `6.1.2` | XMLDSig | `package.json:110` |
| `@xmldom/xmldom` | `0.8.13` | C14N/XML | `package.json:79` |
| `bcryptjs` | `^3.0.3` | Hash de senha de admin (NextAuth) | `package.json:82` |
| **Ausentes:** `aws-sdk`/`@aws-crypto/*`, `@google-cloud/kms`, `libsodium-wrappers`, `pgsodium` (cliente) | — | **Cloud KMS externo NÃO está no stack** | `package.json` |

> **Conclusão do inventário:** a infraestrutura de produção é **Vercel (serverless Node 20) +
> Supabase (Postgres + Storage privado) + GitHub Actions**, com segredos em **Vercel env secrets**
> lidos server-side, storage privado **já provado em produção** (Contador HUB) e cripto app-level via
> `node-forge` + `node:crypto`. **Não há** cloud KMS externo provisionado. As opções de backend KMS
> compatíveis com **esta** infraestrutura estão em §9.

---

## 3. Arquitetura obrigatória do `KmsStorageVault` (executável, ADR-0009 D3)

> **Contrato inegociável herdado de ADR-0009 D1** — o `KmsStorageVault` implementa a **mesma**
> interface `FiscalSecretVault` (`lib/fiscal/vault/fiscal-secret-vault.ts:53-67`); callers e schema
> **não mudam**. A migração piloto→produção **troca só o backend resolvido por ambiente**.

### 3.1 Visão geral (envelope encryption, storage privado exclusivo, chave mestra fora da app)

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │  Aplicação OmniGestão (Vercel, Node 20, SERVER-ONLY)        │
                        │  lib/fiscal/vault/kms-storage-vault.ts (futuro, não este GOAL)│
                        │                                                             │
                        │  getCertificadoPfx(storeId, blobRef)                        │
                        │    1. lê blob cifrado do storage PRIVADO EXCLUSIVO Fiscal    │
                        │    2. lê wrapped DEK + AAD da metadata do blob               │
                        │    3. confere AAD (storeId, certId, versão, finalidade)      │
                        │    4. Supabase Vault: Unwrap(wrappedDek) → DEK (em memória)  │
                        │    5. AES-GCM-Decrypt(blob, DEK, AAD) → .pfx (em memória)    │
                        │    6. zero DEK; devolve Buffer; caller assina e descarta     │
                        │  ❌ browser nunca acessa vault.secrets / bucket / segredo /  │
                        │     DEK / MK (server-only end-to-end — condição 7)           │
                        └───────────────┬───────────────────────────┬─────────────────┘
                                        │                           │
              storage privado EXCLUSIVO │             Supabase Vault│ (MK fora da app)
                                        ▼                           ▼
                  ┌──────────────────────────────┐   ┌──────────────────────────────────┐
                  │ Supabase Storage              │   │ Supabase Vault (pgsodium)        │
                  │  bucket PRIVADO fiscal-       │   │  master key gerenciada pelo      │
                  │  segredos (EXCLUSIVO Fiscal;  │   │  Supabase — FORA da aplicação e  │
                  │  NÃO compartilhado c/ Contador)│  │  SEPARADA dos dados cifrados    │
                  │  path: <storeId>/<certId>/v<n>│   │  Wrap/Unwrap da DEK por segredo  │
                  │   /pfx.aes-gcm                │   │  Audit de uso de chave           │
                  │  metadata: { wrappedDekRef,   │   └──────────────────────────────────┘
                  │   aad{storeId,certId,v,fin},  │
                  │   alg, kid, rot }             │
                  └──────────────────────────────┘
```

> **Decisão aprovada (condições 1, 5, 6, 7):** bucket `fiscal-segredos` é **privado e exclusivo do
> Fiscal** — **não compartilhado** (bucket/policies/permissões) com o Contador HUB; reuso **apenas**
> do padrão técnico (`StorageDocumentosPort`) e da infra Supabase. Master key no **Supabase Vault**
> (fora da app, separada dos dados). **Nenhum browser** acessa `vault.secrets`/bucket/segredo/DEK/MK
> — acesso **server-only end-to-end** (diferente do Contador, que usa upload direto do navegador).

### 3.2 Componentes e responsabilidades (definição executável, sem código)

| Componente | Responsabilidade | Onde mora | Observação |
|---|---|---|---|
| **Master Key (MK)** | Cifra/embrulha a data key; **nunca** toca o app em claro; **separada** dos dados cifrados | **Supabase Vault** (gerenciada pelo Supabase, fora da app — condição 1) | O app só vê `Wrap`/`Unwrap` (resultados), nunca o material da MK |
| **Data Key (DEK)** | Cifra o segredo (AES-GCM 256); **distinta por segredo e por versão do certificado** — nunca global compartilhada entre lojas (condição 3) | Em memória só durante o uso; **wrapped** no storage ao lado do blob | Gerada pelo Vault (`GenerateDataKey`) ou pelo app sob Vault; `zero()` após uso |
| **Wrapped DEK** | DEK cifrada pela MK — persiste no storage, **não** no banco | Metadados do objeto no storage privado exclusivo | Separa segredo do backup do banco |
| **Blob cifrado** | Segredo (`.pfx`/senha/CSC) cifrado com DEK (AES-GCM + nonce + tag) | Storage **privado exclusivo Fiscal** (`fiscal-segredos`), path por loja/segredo/versão: `fiscal/<storeId>/<certId>/v<n>/pfx.aes-gcm` (condições 5, 6) | `blobRef` = este path; bucket **não compartilhado** com o Contador |
| **AAD (binding criptográfico)** | `storeId` + `certificadoId` + `versão` + `finalidade fiscal` associados ao ciphertext (AES-GCM AEAD — condição 4) | Metadata do blob + usado como AAD no `Encrypt`/`Decrypt` | Decifrar com AAD divergente ⇒ falha de autenticação (fail-closed) |
| **Senha / CSC / token** | Segredos pequenos; cada um com **DEK própria** (condição 3), AAD própria, blob próprio | Storage privado exclusivo Fiscal (objeto pequeno) | `senhaRef`/`cscTokenRef`/`providerTokenRef` = path opaco |
| **`KmsStorageVault`** | Implementa `FiscalSecretVault`; orquestra storage + Vault; fail-closed; multi-loja; AAD; auditoria | `lib/fiscal/vault/` (sprint futura — **não** este GOAL) | **Server-only**; Node runtime; nunca Edge; **nunca** exposto ao browser (condição 7) |
| **`FiscalLog` (auditoria)** | `secret.set`/`secret.rotate`/`secret.revoke`/`secret.access` sem o segredo | `lib/fiscal/fiscal-log.ts` (já existe; ações novas na sprint de implementação) | Append-only; `operador`+`storeId`+`detalhe` saneado |

### 3.3 Granularidade da data key — **DECIDIDO: DEK por segredo e por versão do certificado**

> **Decisão aprovada por Rafael (condição 3):** **DEK distinta por segredo e por versão do
> certificado**, **nunca** uma DEK global compartilhada entre lojas. Esta granularidade é **mais
> fina** que "DEK por loja" e substitui a recomendação inicial deste doc.

- **Por segredo:** o `.pfx`, a senha e o CSC têm **DEK próprias** (cada um com nonce e AAD próprios).
  Revogar/rotacionar um segredo **não** exige rekey dos demais — isolamento criptográfico por
  segredo.
- **Por versão do certificado:** cada rotação/reemissão do A1 gera uma **nova versão** (`v<n>` no
  path) com **DEK nova**. Versões anteriores permanecem legíveis (para revalidação/auditoria) até
  decomission, com suas DEKs wrapped próprias. Path: `fiscal/<storeId>/<certId>/v<n>/pfx.aes-gcm`.
- **Nunca global entre lojas:** uma DEK **nunca** cifra segredos de lojas distintas (condição 3 +
  ADR-0003). A wrapped DEK de uma loja/segredo **não** é aceita para outra (validação de AAD — §3.4).
- **Implica:** mais wrapped DEKs no storage (custo operacional maior que "DEK por loja"), **aceito**
  em troca de isolamento criptográfico granular, rotação/revogação independentes por segredo e
  versionamento natural do certificado. Esta é a escolha de Rafael.

### 3.4 Segredo armazenado **somente por referência** + **vinculação criptográfica** (AAD)

**Referência opaca (ADR-0009 D1, ADR-0008 P6):**

- `CertificadoDigital.blobRef` → path do blob cifrado no storage privado exclusivo Fiscal.
- `CertificadoDigital.senhaRef` → path do objeto da senha cifrada.
- `ConfiguracaoFiscalLoja.cscTokenRef` → idem para o token CSC.
- `ConfiguracaoFiscalLoja.providerTokenRef` → idem para o token de gateway (quando houver).
- **Banco guarda só strings opacas + metadados públicos** (serial, fingerprint, titular, `validoDe`/
  `validoAte`, `status`, `ativo`, `versao`). **Nenhum** byte do `.pfx`, senha, CSC ou token em
  coluna — invariante já fixada em `prisma/schema.prisma:2296-2322` e em `ADR-0008 P6`.

**Vinculação criptográfica (condição 4 — AEAD/AAD no AES-GCM):**

- O ciphertext do segredo carrega, como **Additional Authenticated Data (AAD)** do AES-GCM, o
  **binding** a: `storeId` + `certificadoId` + `versão` + `finalidade fiscal`
  (`assinatura_a1` | `csc_nfce` | `token_gateway`).
- A AAD é **autenticada** (não cifrada): decifrar o blob com AAD **divergente** ⇒ falha de
  autenticação GCM (tag mismatch) ⇒ **fail-closed** (caller não emite). Isto prova
  criptograficamente que o segredo pertence àquela loja, àquele certificado, àquela versão e àquela
  finalidade — **impossível " transplantar"** um blob para outra loja/certificado/finalidade.
- A AAD também fica na **metadata do blob** (para verificação server-side antes do `Unwrap`), mas a
  autoridade é a **tag GCM** (quem alterar a metadata sem recifrar não consegue decifrar).
- `assertScope` equivalente ao do `EnvVault` (`env-vault.ts:51-62`) + validação de AAD ⇒
  `ref_fora_de_escopo` se a ref ou a AAD não pertencerem à loja/segredo/versão/finalidade informados.

### 3.5 Chave mestra **fora da aplicação** e **separada dos dados** (condições 1, 10)

- A MK **nunca** é lida em `process.env` pelo app; o app **nunca** cifra/decifra com a MK diretamente.
- O app chama o **Supabase Vault** (pgsodium) para `Wrap(DEK)` / `Unwrap(wrappedDEK)` /
  `GenerateDataKey`. A MK vive no Vault, **gerenciada pelo Supabase**, rotacionada no Vault, auditada
  no Vault — **separada** dos dados cifrados (condição 1).
- **Implica:** mesmo um dump completo do banco + dos env secrets da Vercel + do storage cifrado
  **não** decifra o `.pfx` (falta a MK no Vault e cada DEK só existe wrapped). Esta é a propriedade
  que o `EnvVault` **não** tem (no piloto, quem lê a env decifra) — e é o motivo de D3 exigir KMS em
  produção.
- **Evolução futura (condição 10):** **Cloud KMS externo (AWS KMS / GCP Cloud KMS)** é registrado
  como caminho de evolução — caso surja requisito regulatório, HSM dedicado ou custódia
  independente do Supabase. A migração Supabase Vault → cloud KMS é **rewrap das DEKs** com a nova
  MK (blobs **não** precisam recifrar) + nova ADR. **Não** é o destino desta decisão.

### 3.6 Fail-closed

- `blobRef`/`senhaRef`/`cscTokenRef` **ausente ou vazio** ⇒ `getCertificado*` devolve `null` ⇒
  **caller não emite** (sem fallback global, sem fallback `loja-1`). Idêntico ao `EnvVault`
  (`lib/fiscal/vault/env-vault.ts:64-73`).
- Vault indisponível / storage indisponível / DEK wrapped ausente / AAD divergente ⇒ erro
  `backend_indisponivel` ou `ref_fora_de_escopo` (`FiscalVaultError`, `fiscal-secret-vault.ts:20-38`)
  → caller **não emite**, erro **genérico** ("certificado indisponível") sem expor causa que revele o
  segredo (`FISCAL_SECURITY.md` §4).

### 3.7 Isolamento por `storeId` (condição 9 — rigoroso)

- Path do storage prefixado por loja/segredo/versão: `fiscal/<storeId>/<certId>/v<n>/pfx.aes-gcm`.
- **DEK por segredo e por versão** (§3.3) — uma DEK **nunca** cifra segredos de lojas distintas;
  a wrapped DEK de uma loja/segredo **não** é aceita para outra (validação de AAD — §3.4).
- **AAD** (`storeId`+`certId`+`versão`+`finalidade`) autenticada pelo AES-GCM: decifrar com AAD
  divergente ⇒ falha de tag ⇒ `ref_fora_de_escopo`/fail-closed. **Prova criptográfica** de
  pertencimento (não só validação de string).
- `assertScope` equivalente ao do `EnvVault` (`env-vault.ts:51-62`): `ref_fora_de_escopo` se a ref
  não pertence à loja informada.
- Habilitar uma loja **não** expõe o segredo de outra (ADR-0003, ADR-0009 D9).

### 3.8 Acesso mínimo e **server-only total** (condições 7, 8)

- **Server-only end-to-end (condição 7):** **nenhum cliente/browser** acessa `vault.secrets`, segredo
  descriptografado, bucket fiscal, chave (MK) ou DEK. O `KmsStorageVault` roda **somente** em Node
  runtime (nunca Edge/browser); **nenhuma** rota/action expõe o segredo ao client. **Diferente** do
  Contador HUB (que usa upload direto do navegador por URL assinada — esse fluxo **não** se aplica ao
  Fiscal: o `.pfx`/senha/CSC entram no vault **somente** via serviço fiscal server-side autorizado).
- **Serviço fiscal autorizado + privilégio mínimo (condição 8):** o acesso ao vault é feito
  **somente** pelo serviço fiscal autorizado (assinatura F4 / rotação / revogação admin), com
  privilégio mínimo. Pipeline, provider, UI e IA **nunca** recebem o segredo (`FISCAL_SECURITY.md`
  §7).
- **Quem cadastra/rotaciona/revoga:** admin fiscal apenas (`requireFiscalAdmin`,
  `enterpriseRoleFromUserRole(role) === "admin"` + `canAccessStore`) — `ADR-0009 D6`,
  `lib/fiscal/guard-fiscal-admin.ts`. `gerente`/`caixa`/`tecnico`/`vendedor`/`OPERADOR` **não**
  acessam segredo.
- **Service role Supabase (Fiscal):** server-only, `persistSession:false`, `autoRefreshToken:false`
  (precedente `storage-supabase.ts:31-33`); rejeitada se em `NEXT_PUBLIC_*` (`config.ts:69-76`).
  **Credencial e policies dedicadas ao bucket Fiscal** (condição 6) — **não** compartilhadas com o
  Contador HUB.
- **Vault IAM/policy:** o app só tem permissão de `Wrap`/`Unwrap`/`GenerateDataKey` na MK fiscal no
  Supabase Vault; **não** tem permissão de destruir a MK (revogação é ato admin separado, auditado).

### 3.9 Rotação e **versionamento** (condição 9)

| Segredo | Gatilho | Procedimento (alvo) |
|---|---|---|
| **MK (Supabase Vault)** | Política (ex.: anual) ou incidente | `RotateKey` no Vault (nova versão); **rewrap** das DEKs existentes com a nova versão da MK (**sem recifrar blobs** — só rewrap); decomission da versão antiga após janela de quarentena. Audit no Vault + `FiscalLog secret.rotate`. |
| **DEK (por segredo/versão)** | Rotação da MK (rewrap) ou rotação do segredo | **Rewrap** (recifra só a DEK com nova MK) ou **rekey** (nova DEK + recifrar o blob daquele segredo/versão). Isolado por segredo — **não** afeta demais segredos/lojas (§3.3). |
| **A1 (.pfx) — nova versão** | Expiração anual / revogação AC | **Nova versão** (`v<n+1>`) com **DEK nova** + AAD nova; upload do novo `.pfx` → valida → marca `ativo` → atualiza `certificadoAtivoId` (GOAL-008). Versão antiga permanece legível até decommission. Documentos antigos **imutáveis** (ADR-0008 P4). |
| **Senha do .pfx** | Rotação do A1 | DEK própria + versão própria; acompanha a troca do A1 (novo `senhaRef`). |
| **CSC** | Política SEFAZ/UF ou vazamento | DEK própria; novo `cscId`/`cscTokenRef`; QRs já autorizados permanecem válidos. |

> **Versionamento (condição 9):** cada rotação/reemissão gera uma **nova versão** (`v<n>`) no path e
> na AAD; versões antigas permanecem para revalidação/auditoria até decomission controlado. A trilha
> de versões é auditável em `FiscalLog` + metadata do blob.
>
> **Princípio (ADR-0008 P4):** rotacionar segredo **nunca** altera documento já autorizado — só muda
> o que será usado **daqui para frente**.

### 3.10 Revogação (condição 9)

- `CertificadoDigital.status = REVOGADO` + `ativo = false` + **destruir o material**:
  - **Storage (bucket exclusivo Fiscal):** `removerObjeto(blobRef)` + `removerObjeto(senhaRef)`
    (precedente `storage-supabase.ts:131-140`).
  - **Vault:** revogar/disable a versão da MK (se rotação comprometida) **ou** `vault.secret_drop`
    (se decomission) — ato admin, auditado.
  - **DEK (por segredo/versão):** sem a MK, a wrapped DEK fica inútil; destruir o blob cifrado + a
    wrapped DEK **daquele segredo** já neutraliza — **outros segredos/lojas não afetados** (§3.3).
- **CSC:** emitir novo `cscId`/`cscTokenRef` (token antigo revogado na SEFAZ se aplicável).
- **Documento já autorizado permanece** (XML imutável — ADR-0008 P4); revogação afeta só emissões
  futuras.
- `FiscalLog secret.revoke` (sem o segredo) — `ADR-0009 D8`.

### 3.11 Remoção segura (secure erasure — condição 9)

- **Storage privado exclusivo:** `remove([storageRef])` no bucket fiscal + confirmar
  `verificarExistencia === false` (`storage-supabase.ts:142-145`). Supabase Storage remove o objeto;
  a cifra AES-GCM torna resíduos ilegíveis mesmo se houver eventual remnant físico.
- **DEK em memória:** `Buffer.fill(0)` após uso (precedente `pkcs12-loader` "Buffer do `.pfx` é
  zerado após o parse" — `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Mecanismo de parse"). Limitação
  honesta: **strings JS são imutáveis** (senha/PEM) → liberadas ao GC, não há como zerá-las
  deterministicamente (mesma limitação registrada no GOAL-008).
- **Vault:** `vault.secret_drop` (Supabase Vault) com janela de quarentena; auditado. (Em cloud KMS
  futuro: `ScheduleKeyDeletion`.)
- **Banco:** `*Ref` são só strings — `UPDATE … SET blobRef=NULL, senhaRef=NULL` (não há segredo em
  coluna para "apagar"; só o ponteiro).

### 3.12 Disaster recovery (resumo — detalhe em §5)

- **Backup do banco:** **não** carrega segredo (só `*Ref`) — seguro.
- **Backup do storage (bucket fiscal):** o blob cifrado pode ser backupado (está cifrado); restaurar
  exige a MK no Vault (que **não** está no backup do app) e a AAD correta.
- **Perda da MK (Vault):** blobs tornam-se ilegíveis → **reemissão do certificado A1** (documento
  autorizado é imutável, não depende do A1 — ADR-0008 P4). DR da MK é responsabilidade do Vault
  (Supabase — replicação/rotação controlada).
- **Vault indisponível:** fail-closed (não emite) + fila `FiscalEmissaoJob` + kill-switch por loja +
  contingência offline (F10, fora deste escopo).

### 3.13 Trilha de auditoria (condição 9)

- **`FiscalLog`** (append-only, `lib/fiscal/fiscal-log.ts`): `secret.set`, `secret.rotate`,
  `secret.revoke`, `secret.access` — com `operador`, `storeId`, `certificadoId`, `versão`,
  `finalidade`, `detalhe` **sem o segredo** (`ADR-0009 D7`).
- **Supabase Vault audit:** `Wrap`/`Unwrap`/`GenerateDataKey`/`RotateKey`/`secret_drop` por chamada
  — quem/quando/qual `kid`/qual versão. (pgsodium `vault.audit_history`.)
- **Storage audit (bucket fiscal exclusivo):** `storage.from(bucket).list`/`download`/`remove`
  observáveis via logs Supabase — escopados ao bucket fiscal (não ao Contador).
- **Varredura automatizada (probatória):** `scanForSecrets`/`assertNoSecretLeak`
  (`lib/fiscal/vault/secret-scan.ts:86-118`) — prova determinística de zero ocorrência de
  `.pfx`/senha/chave privada/DEK em log, resposta HTTP, snapshot, erro ou relatório. **Reuso direto**
  no `KmsStorageVault` (já provado no GOAL-008 — `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Varredura de
  segredos — ZERO ocorrência").

---

## 4. Threat model

> Formato obrigatório do comando: ator · ativo · vetor · impacto · mitigação · detecção · resposta.
> Ameaças cruzadas com `FISCAL_SECURITY.md` §9 e `ADR-0009` §4.3.

### T1 — Vazamento do `.pfx` A1 por dump do banco

| Campo | Conteúdo |
|---|---|
| **Ator** | Insider com acesso de DBA / atacante que extrai backup do Postgres |
| **Ativo** | Bytes do `.pfx` A1 (permite emitir/assinar em nome do contribuinte) |
| **Vetor** | `pg_dump` / snapshot Supabase / acesso read-only ao banco |
| **Impacto** | Emissão fiscal indevida em nome da loja; fraude fiscal e financeira |
| **Mitigação** | Segredo **nunca** no banco (só `*Ref` — `schema.prisma:2316-2318`); blob cifrado em storage **privado exclusivo Fiscal**; DEK wrapped no Vault (fora do app); **dump do banco não decifra** (§3.5) |
| **Detecção** | `FiscalLog secret.access` anômala; Vault audit com `Unwrap` sem `secret.access` correspondente; varredura `scanForSecrets` em logs/erros |
| **Resposta** | `secret.revoke` (revoga A1 + DEK); reemissão do A1 na AC; `status=REVOGADO`; alerta SEFAZ se emitido; postmortem |

### T2 — Vazamento do `.pfx` por acesso ao storage privado

| Campo | Conteúdo |
|---|---|
| **Ator** | Insider com `service_role` / atacante que obtém a service role |
| **Ativo** | Blob cifrado do `.pfx` + wrapped DEK |
| **Vetor** | `service_role` bypassa RLS; download do objeto cifrado |
| **Impacto** | Parcial — tem o blob cifrado, **mas sem a MK** (no Vault) a DEK não é unwrapped → `.pfx` indecifrável |
| **Mitigação** | Blob cifrado AES-GCM; DEK wrapped fora do app (Vault); AAD impede "transplantar" o blob para outra loja/cert/finalidade; `service_role` server-only, rejeita `NEXT_PUBLIC_*` (`config.ts:69-76`); URLs assinadas de curta duração (≤300s); erros seguros (`StorageError`); bucket exclusivo Fiscal (policies dedicadas) |
| **Detecção** | Logs Supabase Storage (download fora de janela de assinatura); Vault audit `Unwrap` sem `FiscalLog secret.access`; alerta de uso de service role fora do app |
| **Resposta** | Rotacionar MK (rewrap das DEKs) — torna blobs antigos inúteis sem recifrar; revogar service role; `secret.revoke` se confirmado |

### T3 — Comprometimento da master key no Vault

| Campo | Conteúdo |
|---|---|
| **Ator** | Atacante com acesso administrativo ao Vault (Supabase project owner / admin do projeto) |
| **Ativo** | Master Key |
| **Vetor** | Roubo de credencial de plataforma; abuso de privilégio de admin do projeto Supabase |
| **Impacto** | Crítico — unwrapping de todas as DEKs → decifração de todos os `.pfx` |
| **Mitigação** | MK fora da app; acesso ao projeto Supabase restrito a admin; MFA na plataforma; rotação periódica da MK (rewrap); segregação de papéis (quem administra o Supabase ≠ quem opera a app); auditoria do Vault |
| **Detecção** | Vault audit (`Unwrap` em volume anômalo / fora de janela / por ator inesperado); alerta de rotação não-programada |
| **Resposta** | Rotação de emergência da MK (rewrap de todas as DEKs); reemissão de todos os A1; revogação de CSC; postmortem; revisão de acessos ao projeto Supabase |

### T4 — Vazamento por log / erro / trace / bundle do cliente

| Campo | Conteúdo |
|---|---|
| **Ator** | Qualquer (operador, dev, atacante que lê logs/errors) |
| **Ativo** | `.pfx` bytes (base64/hex), senha, PEM da chave privada, CSC |
| **Vetor** | `console.log` descuidado; stack trace detalhado; `FiscalLog.detalhe` com segredo; bundle `.next/static` |
| **Impacto** | Vazamento de segredo → emissão indevida |
| **Mitigação** | Erros genéricos para falha de segredo (`FISCAL_SECURITY.md` §4.4); `FiscalLog.detalhe` sem segredo (D7); `env` do next.config só valores públicos (`next.config.mjs:32-43`); `scanForSecrets`/`assertNoSecretLeak` em toda camada (`secret-scan.ts`) |
| **Detecção** | `scanForSecrets` em CI (varredura de artifacts `.next/static` — GOAL-008 provou 0 ocorrência); revisão de `FiscalLog.detalhe`; grep de `BEGIN.*PRIVATE KEY`/`FISCAL_A1_*` em artifacts |
| **Resposta** | `secret.revoke` do segredo exposto; rotação; remover o log/trace vazado; postmortem |

### T5 — Cross-loja (quebra de isolamento multi-loja)

| Campo | Conteúdo |
|---|---|
| **Ator** | Bug de escopo no vault / no caller |
| **Ativo** | Segredo fiscal de loja B acessado pela loja A |
| **Vetor** | `storeId` ausente/errado; ref canônica de outra loja aceita; path sem prefixo de loja |
| **Impacto** | Loja emite com certificado de outra; violação ADR-0003 |
| **Mitigação** | `storeId` obrigatório (`store_invalida`); `assertScope` rejeita ref de outra loja (`ref_fora_de_escopo`); path prefixado por loja; **DEK por segredo/versão** (nunca entre lojas); **AAD** autenticada pelo GCM; query Prisma sempre `where:{storeId}` |
| **Detecção** | `FiscalLog` com `storeId` divergente do `certificado.storeId`; teste de isolamento (já provado no GOAL-008 — `certificado-validacao.test.ts` `ref_fora_de_escopo`) |
| **Resposta** | Bloquear acesso; `secret.revoke` se houve uso indevido; corrigir bug; postmortem |

### T6 — Ref órfã (segredo inexistente no storage/KMS)

| Campo | Conteúdo |
|---|---|
| **Ator** | Falha operacional / rotação incompleta / storage removido manualmente |
| **Ativo** | Disponibilidade da emissão |
| **Vetor** | `blobRef` aponta para objeto deletado; wrapped DEK ausente; MK rotacionada sem rewrap |
| **Impacto** | Loja não consegue emitir (degradação operacional, **não** vazamento) |
| **Mitigação** | Fail-closed (`null` ⇒ não emite); validação `verificarExistencia` antes de ativar; alerta de vencimento (GOAL-008) + alerta de ref órfã (healthcheck) |
| **Detecção** | `FiscalLog secret.access` com `segredo_ausente`; healthcheck periódico de refs; tentativa de assinatura a seco periódica (canário) |
| **Resposta** | Reemissão do A1 (nova ref) **ou** restaurar do backup do storage; `secret.rotate`; comunicar loja |

### T7 — Vault indisponível em janela de emissão

| Campo | Conteúdo |
|---|---|
| **Ator** | Indisponibilidade de plataforma (Supabase Vault / Storage) |
| **Ativo** | Disponibilidade da emissão fiscal |
| **Vetor** | Outage do Vault; throttling; rede |
| **Impacto** | Emissão atrasada (a venda **não** é desfeita — ADR-0008 P1: fiscal é pós-commit, assíncrono) |
| **Mitigação** | Fila `FiscalEmissaoJob` com retry/backoff (MASTER_FISCAL_EXECUTION_PLAN §8); fail-closed; kill-switch por loja; contingência offline (F10, fora deste escopo) |
| **Detecção** | Vault audit sem `Unwrap` em janela esperada; métrica de jobs em retry; alerta de `backend_indisponivel` |
| **Resposta** | Retry com backoff; se persistir, kill-switch da loja (`fiscalEnabled=false`) — vendas continuam, jobs pendentes reprocessam; acionar DR do Vault (§5) |

### T8 — Ator não-admin tenta acessar/manipular segredo

| Campo | Conteúdo |
|---|---|
| **Ator** | `gerente`/`caixa`/`tecnico`/`vendedor`/`OPERADOR` |
| **Ativo** | Segredo fiscal / operação de rotação/revogação |
| **Vetor** | Chamada direta a rota/action de segredo sem papel admin |
| **Impacto** | Elevação de privilégio → emissão indevida / revogação indevida |
| **Mitigação** | `requireFiscalAdmin` (`guard-fiscal-admin.ts`); `canAccessStore`; escrita server-only; ADR-0009 D6 |
| **Detecção** | `FiscalLog` com `operador` não-admin (barrado); teste de guard (GOAL-008 provou `ref_fora_de_escopo`/`store_invalida`) |
| **Resposta** | Negar + auditar; investigar tentativa; postmortem se repetido |

---

## 5. Plano de recuperação (disaster recovery)

> **Princípio (ADR-0008 P4):** documento fiscal autorizado é **imutável** — a recuperação de segredo
> **nunca** apaga/reemite documento já autorizado; só restaura a capacidade de emitir **daqui para
> frente**.

### 5.1 Backup

| Ativo | Onde mora | Política de backup | Restaurável sem MK? |
|---|---|---|---|
| `*Ref` + metadados | Postgres (`CertificadoDigital`, `ConfiguracaoFiscalLoja`) | Backup Supabase automático (Postgres) | Sim (só ponteiros — não são segredo) |
| Blob cifrado + wrapped DEK + AAD | Supabase Storage (bucket **privado exclusivo Fiscal**) | Backup/replicação Supabase Storage; **está cifrado** | Parcial — exige MK no Vault + AAD correta para decifrar |
| Master Key | Supabase Vault (fora da app) | DR próprio do Vault (Supabase — replicação/rotação controlada) — **não** está no backup do app | n/a |
| `FiscalLog` | Postgres | Backup Supabase (append-only) | Sim |

### 5.2 Restauração

1. **Postgres restaurado** → `*Ref` apontam para paths do storage (válidos se storage intacto).
2. **Storage restaurado** (bucket fiscal exclusivo) → blobs cifrados disponíveis; wrapped DEKs + AAD na metadata.
3. **Vault ativo** → `Unwrap(wrappedDEK)` → `Decrypt(blob, AAD)` (AAD confere) → `.pfx` disponível.
4. **Validação pós-restore:** `validarCertificadoLoja` (GOAL-008) confere CNPJ/vigência/cadeia; se
   `ok`, certificado permanece `ATIVO`; senão, `INVALIDO`/`EXPIRADO` e reemissão.
5. **Canário:** assinatura a seco (`drySignNfceFromVault`) com o material restaurado → prova
   ponta-a-ponta sem transmitir.

### 5.3 Perda da master key (Supabase Vault)

- **Impacto:** todos os blobs cifrados tornam-se **ilegíveis** (DEK não unwrapa).
- **Documento já autorizado:** **não** depende do A1 (XML imutável) — permanece válido.
- **Recuperação:** **reemissão do certificado A1** na AC (novo `.pfx`, nova versão, nova DEK, novo
  `secret.set`); revalidar; reativar. Emissões futuras usam o novo A1.
- **Prevenção:** DR da MK é responsabilidade do **Supabase Vault** — replicação/backup controlado do
  projeto Supabase; rotação periódica com janela de overlap (versão antiga ativa até todas as DEKs
  rewraped). (Em cloud KMS futuro: replicação da MK no provedor.)

### 5.4 Indisponibilidade do Vault

- **Runtime:** fail-closed (`backend_indisponivel`); caller não emite; **venda não é desfeita**
  (fiscal é pós-commit, assíncrono — ADR-0008 P1).
- **Fila:** `FiscalEmissaoJob` retém jobs com retry/backoff; quando o Vault volta, drena.
- **Kill-switch:** `fiscalEnabled=false` na loja → para de enfileirar; vendas continuam; jobs
  pendentes reprocessam após retorno do Vault.
- **Contingência offline (F10, fora deste escopo):** emissão offline + reprocessamento.

### 5.5 Rotação comprometida (MK ou DEK)

- **MK comprometida (Vault):** rotação de emergência → nova versão da MK; **rewrap de todas as DEKs**
  com a nova versão (blobs **não** precisam recifrar — só a wrapped DEK); decomission da versão
  antiga após janela de quarentena; `FiscalLog secret.rotate` + Vault audit.
- **DEK comprometida (segredo/versão):** **rekey** daquele segredo — nova DEK + recifrar o blob
  daquele segredo/versão; atualizar wrapped DEK na metadata; `secret.rotate` do segredo. **Outros
  segredos/lojas não afetados** (DEK por segredo/versão — §3.3).
- **A1 comprometido:** `secret.revoke` (revoga A1 + destrói blob + neutraliza DEK daquele
  segredo/versão); reemissão na AC (nova versão, nova DEK); novo `secret.set`.

### 5.6 Certificado vencido ou revogado

- **Vencido (`validoAte < now`):** `certificado-alerta.ts` (GOAL-008) avisa 30/15/7 dias antes;
  `status=EXPIRADO`; reemissão do A1 (novo `secret.set`); reativar.
- **Revogado na AC:** `status=REVOGADO`, `ativo=false`, destruir material (§3.10); reemissão se
  aplicável; documento autorizado permanece (correção por evento fiscal — F9).
- **A1 expirado não invalida** documento já autorizado (P4); só bloqueia emissões novas.

---

## 6. Plano de migração `EnvVault` → `KmsStorageVault` por loja

> **Princípio (ADR-0009 §4.1):** trocar `EnvVault` por `KmsStorageVault` é **trocar o backend do
> port**; callers e schema **intactos**. Migração **loja a loja** (ADR-0009 D9, ADR-0003); nunca em
> lote. **Zero exposição do material** durante a migração.

### 6.1 Pré-condições (fora deste GOAL — sprint de implementação)

- `KmsStorageVault` implementado e testado (sprint futura, **não** este GOAL documental).
- **Supabase Vault habilitado** no projeto (MK fiscal provisionada — fora da app).
- **Bucket privado exclusivo do Fiscal** (`fiscal-segredos`) criado — **privado**, **distinto** do
  bucket do Contador HUB, com **policies/RLS e credenciais dedicadas** (condições 5, 6 — **não
  compartilhar** com o Contador).
- `fiscalEnabled=false` e `ambiente=HOMOLOGACAO` na loja até G-F12 (MASTER_FISCAL_EXECUTION_PLAN §7).
- Workflow de prova de envelope encryption + AAD verde (CI).

### 6.2 Sequência por loja (zero downtime de emissão, zero exposição, server-only)

> **Fluxo server-only (condição 7):** o `.pfx`/senha/CSC entram no vault **somente** via serviço
> fiscal server-side autorizado — **não** há upload direto do navegador (diferente do Contador HUB).

| # | Etapa | Ação | Validação (auferível) | Rollback |
|---|---|---|---|---|
| 1 | **Inventário das refs** | Listar `CertificadoDigital` (ativos e pendentes, por versão) e `ConfiguracaoFiscalLoja` da loja: `blobRef`/`senhaRef`/`cscTokenRef`/`providerTokenRef` + metadados. Confirmar quais envs `FISCAL_A1_*_<STORE>` existem na plataforma. | Relatório de refs (sem segredo) bate com o banco | n/a (leitura) |
| 2 | **Criação do segredo criptografado** (server-only, admin) | `KmsStorageVault.putCertificadoPfx(storeId, pfx, senha)` lê o `.pfx` da env atual (via `EnvVault`, **server-side**), gera **DEK própria para este segredo/versão** (`GenerateDataKey` no Vault), cifra o `.pfx` (AES-GCM) com **AAD = `storeId`+`certId`+`versão`+`assinatura_a1`**, grava blob cifrado + wrapped DEK + AAD no storage **privado exclusivo Fiscal**, devolve **novas** `blobRef`/`senhaRef`. Senha e CSC análogos, cada um com **DEK própria** e **AAD própria** (`senhaRef`→finalidade `senha_pfx`; `cscTokenRef`→`csc_nfce`). | `verificarExistencia(novaRef)===true`; AAD confere; `scanForSecrets` sobre logs/erros = `vazou:false`; `FiscalLog secret.set` (com `versão`) | Descartar novas refs; manter env atual |
| 3 | **Validação** (sem ativar) | `PATCH { validar:true }` roda `validarCertificadoLoja` sobre o material resolvido do **novo** vault (`getCertificadoPfx`/`getCertificadoSenha` do `KmsStorageVault`, conferindo AAD); confere CNPJ/vigência/cadeia. Assinatura a seco (`drySignNfceFromVault`) com o novo vault → `valido:true`. | `validarCertificadoLoja.ok===true`; AAD confere; `drySign` verify `valido:true`; `scanForSecrets` = 0; `FiscalLog certificado.update` | Manter `status=PENDENTE_VALIDACAO`; env atual segue ativa |
| 4 | **Ativação controlada** | `PATCH { ativo:true }` (validate-then-activate, fail-closed) — só se a etapa 3 passou. Atualiza `certificadoAtivoId` (aponta para a **versão nova**). O `KmsStorageVault` passa a ser o **backend resolvido** para a loja (por ambiente/flag); o `EnvVault` fica disponível como fallback **temporário** durante a janela de observação. | `ativo=true`; `certificadoAtivoId` aponta para a versão nova; `FiscalLog certificado.ativar`; emissão de homologação usa o novo vault | Reverter `certificadoAtivoId` para o certificado sob `EnvVault` (ainda válido) |
| 5 | **Observação (janela)** | Operar em **HOMOLOGACAO** com o `KmsStorageVault`; monitorar `FiscalLog secret.access`, Vault audit, jobs em retry, `scanForSecrets` em artifacts. | 0 `segredo_ausente`; 0 `ref_fora_de_escopo`/AAD mismatch; 0 leak; Vault audit coerente com `FiscalLog` | Voltar para `EnvVault` (env atual intacta) |
| 6 | **Revogação da ref antiga** (após janela verde) | Remover as envs `FISCAL_A1_PFX_B64_<STORE>`/`FISCAL_A1_SENHA_<STORE>`/`FISCAL_CSC_TOKEN_<STORE>` da plataforma (provisionamento manual — `EnvVault` escrita é manual, `env-vault.ts:96-109`). `FiscalLog secret.revoke` (referência antiga). | Env antiga ausente na plataforma; `EnvVault.getCertificado*(STORE, refAntiga)===null` (fail-closed); `FiscalLog secret.revoke` | Recriar env antiga (material ainda válido se não expirou) — **último recurso** |
| 7 | **Teste de recuperação** | Simular perda/indisponibilidade: (a) restaurar blob do backup do storage (bucket fiscal) → decifrar com Vault + AAD; (b) simular Vault indisponível → fail-closed + fila; (c) rotação de MK → rewrap; (d) AAD divergente → fail-closed. | Canário de assinatura a seco pós-restore = `valido:true`; fail-closed confirmado; rewrap confirmado; AAD mismatch bloqueia | n/a (prova) |
| 8 | **Zero exposição do material** (invariante) | Em **nenhuma** etapa o `.pfx`/senha/CSC/DEK/MK é logado, persistido em claro, enviado ao client/browser ou à IA. Toda operação passa por `scanForSecrets`. | `scanForSecrets` sobre **todos** os logs/erros/respostas de todas as etapas = 0 ocorrência; varredura de artifacts `.next/static` = 0 | n/a (invariante) |

### 6.3 Rollback global da migração (por loja)

- **A qualquer ponto antes da etapa 6:** o `EnvVault` (env atual) está **intacto** — basta apontar
  `certificadoAtivoId` de volta ao certificado sob `EnvVault` e/ou reverter a flag de backend por
  ambiente. **Sem perda de segredo.**
- **Após etapa 6 (env antiga removida):** rollback exige **recriar** a env antiga na plataforma
  (provisionamento manual) — só se o material ainda estiver válido (não expirado/revogado). Por isso
  a etapa 6 só roda após janela de observação verde.
- **Documento já autorizado:** **nunca** é afetado pela migração (imutável, ADR-0008 P4).

---

## 7. Itens do gate `G-F12` auferíveis (checklist de produção)

> O gate `G-F12` (MASTER_FISCAL_EXECUTION_PLAN §4) aprova a virada `HOMOLOGACAO → PRODUCAO` por
> loja. Abaixo, cada item como **critério objetivo verificável** (não alegação).

| # | Item | Critério auferível (como provar) | Evidência esperada |
|---|---|---|---|
| 1 | **Segredo nunca em banco** | `prisma migrate diff` + grep no schema: 0 coluna de `.pfx`/senha/CSC/token em claro; só `*Ref` (String?) | `schema.prisma:2316-2318,2280,2285` (só refs); auditoria de schema |
| 2 | **Segredo nunca em log** | `scanForSecrets`/`assertNoSecretLeak` sobre logs, `FiscalLog.detalhe`, erros, respostas HTTP, snapshots, relatórios → `vazou:false` | `secret-scan.ts`; GOAL-008 provou 0 ocorrência em artifacts `.next` |
| 3 | **Storage privado exclusivo** | `verificarBucket().publico===false`; bucket `fiscal-segredos` **privado e exclusivo do Fiscal**; **0 compartilhamento** de bucket/policies/permissões com o Contador HUB (condições 5, 6); 0 uso de `getPublicUrl` | Check do bucket; auditoria de policies (RLS distintas do Contador) |
| 4 | **Criptografia em repouso** | Blob cifrado AES-GCM 256 no storage; DEK wrapped no Supabase Vault; dump do banco + dump do storage + env secrets **não** decifram (MK fora da app, separada dos dados) | Teste de "dump não decifra" (prova de envelope); Vault audit |
| 5 | **Envelope encryption** | Prova ponta-a-ponta: `Encrypt(DEK, segredo, AAD)` + `Wrap(MK, DEK)` no set; `Unwrap(MK, wrappedDEK)` + `Decrypt(DEK, blob, AAD)` no get; DEK `zero()` após uso; **DEK por segredo/versão** (condição 3) | Teste de envelope (sprint futura); log de operações Vault |
| 6 | **Isolamento por loja + AAD** | Teste: `getCertificado*(lojaA, refDeB)` → `ref_fora_de_escopo`; path prefixado por `storeId`; **AAD** (`storeId`+`certId`+`versão`+`finalidade`) autenticada pelo GCM — decifrar com AAD divergente ⇒ fail-closed; **DEK nunca compartilhada entre lojas** | `certificado-validacao.test.ts` (GOAL-008) + teste de AAD mismatch (sprint futura) |
| 7 | **Rotação** | Prova de `RotateKey` (Vault) + rewrap das DEKs sem recifrar blobs; reemissão de A1 = nova versão com DEK nova; `FiscalLog secret.rotate` gravado; documento autorizado permanece | Teste de rotação; Vault audit; `FiscalLog` |
| 8 | **Revogação** | `secret.revoke` → `removerObjeto` (bucket fiscal) + `status=REVOGADO` + `ativo=false` + Vault revoke/disable; `verificarExistencia===false`; DEK daquele segredo/versão neutralizada (demais não afetados) | Teste de revogação; `FiscalLog secret.revoke` |
| 9 | **Auditoria** | Toda `secret.set/rotate/revoke/access` em `FiscalLog` (append-only) + Vault audit correspondente; `operador`+`storeId`+`certId`+`versão`+`finalidade`+`detalhe` sem segredo | Query de `FiscalLog` por loja; correlação com Vault audit |
| 10 | **Recuperação** | Canário pós-restore: blob restaurado do backup do storage (bucket fiscal) + Vault ativo + AAD confere → `drySign` `valido:true`; fail-closed com Vault down; rewrap pós-rotação de MK | Teste de DR (§5); `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Assinatura a seco" |
| 11 | **Remoção segura** | `removerObjeto` (bucket fiscal exclusivo) + `verificarExistencia===false`; `Buffer.fill(0)` da DEK; `vault.secret_drop` com quarentena | Teste de secure erasure; Vault audit de deleção |
| 12 | **Fail-closed** | `blobRef`/env/Vault ausente / AAD divergente → `getCertificado*===null` ou erro → caller não emite (0 fallback); teste de cada cenário | Matriz fail-closed (GOAL-008 provou 9 cenários — `FISCAL_CERT_PILOT_EVIDENCIAS_001.md` §"Fail-closed provado") |

> **Nível de evidência:** estes itens são **N3 hoje** (definidos documentalmente, sem implementação
> do `KmsStorageVault`). A prova auferível de cada item exige a **sprint de implementação** do
> `KmsStorageVault` (futura, **não** este GOAL) + **G-F12** (homologação ampla F11 verde + aprovação
> humana de Rafael). **N6/N7 exigem retorno real da SEFAZ** — fora deste escopo.

---

## 8. Opções compatíveis **apenas com a infraestrutura realmente encontrada**

> **Regra do comando:** "Apresentar opções compatíveis apenas com a infraestrutura realmente
> encontrada." Inventário (§2) => Vercel + Supabase (Postgres + Storage privado) + GitHub Actions,
> sem cloud KMS externo provisionado, com `@supabase/supabase-js` + `node-forge` + `node:crypto`.

### 8.1 Onde mora a master key (decisão central do backend KMS)

| Opção | Master key mora em… | Envelope | Compatível com a infra? | Custo/complexidade | Estado |
|---|---|---|---|---|---|
| **A — Supabase Vault (pgsodium)** | **Supabase** (MK gerenciada pelo Supabase, fora da app, separada dos dados; `Wrap`/`Unwrap` via Vault) | DEK **por segredo/versão** cifrada com MK do Vault; segredo cifrado com DEK em Storage **privado exclusivo Fiscal**; AAD (`storeId`+`certId`+`versão`+`finalidade`) | **Sim** — já no stack (`@supabase/supabase-js`); sem SDK novo; `FISCAL_SECURITY.md` §3 "Já no stack"; `ADR-0009 §3` opção 3 🟢 | 🟢 baixo OPEX; complexidade média | ✅ **DECIDIDA por Rafael** |
| **B — Cloud KMS externo (AWS KMS / GCP Cloud KMS)** | **Cloud KMS** (MK gerenciada pelo provedor; `GenerateDataKey`/`Encrypt`/`Decrypt` via SDK) | DEK wrapped pela MK no KMS; segredo cifrado com DEK em Storage privado | **Parcial** — **não** há SDK/credencial/env de cloud KMS no app hoje; exige provisionar conta cloud + credenciais + OPEX | 🔴 alto OPEX; complexidade alta (SDK novo, IAM, DR cloud) | 🔜 **Evolução futura** (condição 10) |
| **C — Vercel env secret como master key (envelope app-level)** | **Vercel env** (MK em secret de plataforma; lida server-side) | DEK derivada/embrulhada no app com a MK da env; segredo cifrado com DEK em Storage privado | **Sim** — mesma mecânica do `EnvVault`/ADR-0006; porém a MK **fica na app** (env) — **violando** o requisito D3 "chave mestra fora da aplicação" | 🟡 baixo custo; complexidade baixa; **segurança mais fraca** | ❌ **Descartada** como destino de produção |

### 8.2 Decisão (aprovada por Rafael no checkpoint)

- **DECIDIDA: Opção A (Supabase Vault)** — master key **gerenciada pelo Supabase**, **fora da
  aplicação** e **separada dos dados cifrados** (condição 1), sem SDK novo, reusa o **padrão técnico**
  de storage privado do Contador HUB (mas **bucket/policies/credenciais exclusivos** do Fiscal —
  condições 5, 6), com **DEK por segredo e por versão** (condição 3) + **AAD** (condição 4) +
  **server-only total** (condição 7). Satisfaz ADR-0009 D3.
- **Evolução futura: Opção B (cloud KMS externo)** — registrada como caminho de evolução caso surja
  requisito regulatório, HSM dedicado ou custódia independente do Supabase (condição 10). Migração =
  rewrap das DEKs com a nova MK (blobs não recifram) + nova ADR. **Não** é o destino desta decisão.
- **Descartada: Opção C (env master key)** — não cumpre D3 ("chave mestra fora da aplicação"); é uma
  extensão do `EnvVault`, não um `KmsStorageVault` de produção.

> **Por que houve opções genuinamente concorrentes:** A e B diferem em **onde a master key vive**
> (Supabase vs cloud externa), com trade-offs reais de custo, complexidade, soberania da chave e DR.
> ADR-0009 D3 **deixou explicitamente** essa decisão em aberto ("Não decide o fornecedor exato de
> KMS de produção (Supabase Vault × cloud KMS) — decisão de implementação da F4"). Por isso este GOAL
> produz uma **ADR aceita** (§9) que **resolve** o item deferido de ADR-0009 D3 — agora **decidida
> como A** por Rafael.

---

## 9. ADR aceita (opções concorrentes; **decidida como A**)

Por o inventário revelar **opções genuinamente concorrentes** de backend KMS (§8), foi criada a
**ADR-0014**, alinhada à decisão de Rafael (Opção A + 10 condições):

- **Arquivo:** [`ADR-0014-supabase-vault-backend-kms-fiscal.md`](../decisions/ADR-0014-supabase-vault-backend-kms-fiscal.md).
- **Número final:** **ADR-0014**, primeiro número livre após conferir os arquivos reais da
  `origin/main`; ADR-0010, ADR-0011, ADR-0012 e ADR-0013 já estavam ocupados.
- **Status:** `aceita`, por decisão explícita de Rafael no checkpoint de 22/07/2026.
- **Decisão:** adotar **Opção A (Supabase Vault)** como backend
  do `KmsStorageVault` em produção — MK gerenciada pelo Supabase (fora da app, separada dos dados),
  **DEK por segredo e por versão do certificado** (nunca global entre lojas), **AAD**
  (`storeId`+`certId`+`versão`+`finalidade`), blob cifrado em **bucket privado exclusivo do Fiscal**
  (não compartilhado com o Contador), **server-only total** (nenhum browser acessa
  `vault.secrets`/bucket/segredo/DEK/MK). **Cloud KMS externo (B)** registrado como evolução futura
  (requisito regulatório/HSM/custódia independente); **env master key (C)** descartada como destino.

> Esta ADR **não substitui** ADR-0009 — **complementa e resolve o item deferido em D3** ("fornecedor exato de KMS
> de produção"). ADR-0009 permanece aceita e intocada.

---

## 10. Limites e confirmação de escopo

- **Zero código:** nenhuma linha de código produtivo ou de teste foi escrita. Nenhum `package.json`,
  `package-lock.json`, env, credencial, Prisma, schema, banco, Vercel/Supabase reais, certificado
  real ou KMS real foi tocado.
- **Escopo respeitado:** somente documentação em `docs/**`: três ADRs aceitas, índices,
  arquitetura, plano mestre, roadmap e este relatório.
- **Áreas protegidas intocadas:** auth, proxy, `prisma/schema.prisma`, `lib/prisma.ts`,
  `next.config.mjs`, `tsconfig.json`, PDV, Financeiro, Operações, `lib/fiscal/**` (código),
  `lib/contador/**`, `lib/whatsapp/**`.
- **Não reabre** ADR-0008 nem ADR-0009 (aceitas). Resolve apenas as decisões de G-F5/G-F5.1;
  implementação, G-F7 e G-F12 permanecem abertos. **Não habilita** emissão, `fiscalEnabled`,
  produção ou SEFAZ.
- **Nível de evidência:** **N3** (definido documentalmente). Implementação do `KmsStorageVault` é
  sprint futura (GOAL próprio); G-F12 exige homologação ampla (F11) + aprovação humana.

### 10.1 Arquivos finais do GOAL-009

- `docs/decisions/ADR-0014-supabase-vault-backend-kms-fiscal.md`
- `docs/decisions/ADR-0015-sefaz-direta-homologacao-inicial.md`
- `docs/decisions/ADR-0016-piloto-homologacao-sp-matriz-rafacell.md`
- `docs/decisions/INDEX.md`
- `docs/architecture/FISCAL_SECURITY.md`
- `docs/architecture/NFCE_ARCHITECTURE.md`
- `docs/architecture/INDEX.md`
- `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`
- `docs/roadmaps/ROADMAP_FISCAL.md`
- `docs/fiscal/FISCAL_KMS_PRODUCTION_ARCH_001.md`

---

## 11. Checkpoint concluído e consistência documental

As três decisões humanas do checkpoint foram formalizadas, sem implementação:

1. **ADR-0014 — Supabase Vault:** backend KMS de produção com envelope encryption, DEK distinta
   por segredo/versão, AAD, bucket Fiscal exclusivo, acesso server-side mínimo, ciclo de
   rotação/revogação/recuperação e evolução futura para AWS/GCP KMS.
2. **ADR-0015 — SEFAZ direta:** primeira integração externa direta com a SEFAZ, somente em
   homologação, atrás de `FiscalProvider`; gateway/PAA ficam como alternativa futura.
3. **ADR-0016 — piloto SP/Matriz:** somente Matriz RafaCell Assistec, Taguaí/SP, SEFAZ-SP,
   NFC-e modelo 65 e `tpAmb=2`, sempre pelo `Store.id` real e sem herança.

**Consistência:** a `origin/main` contém arquivos ADR-0010, ADR-0011, ADR-0012 e ADR-0013. O índice
publicado omitia a linha da ADR-0013, embora o arquivo aceito estivesse presente; a linha foi
restaurada. As três ADRs novas, inicialmente preparadas sob números conflitantes 0010/0011/0012,
foram renumeradas exclusivamente para os próximos números livres 0014/0015/0016. Nenhuma ADR
aceita anterior foi renumerada ou editada.

Os PRs fiscais #21, #22, #23 e #24 pertencem ao mesmo repositório remoto desta execução e estão
mergeados em `main`. O commit e o push deste GOAL são feitos somente na branch
`fiscal/goal-009-kms-arch`, sem merge, rebase, force push ou push para `main`.

---

## 12. Referências

- **Decisão-mãe:** [`ADR-0009`](../decisions/ADR-0009-fiscal-secret-vault.md) (D1 port, D2 EnvVault,
  D3 KmsStorageVault, D4–D10). · [`ADR-0008`](../decisions/ADR-0008-fiscal-architecture.md) (P4
  imutável, P6 segredo por referência).
- **Governança:** [`MASTER_FISCAL_EXECUTION_PLAN.md`](../governance/MASTER_FISCAL_EXECUTION_PLAN.md)
  (F1 cofre, F4 assinatura, F12 produção, G-F1/G-F5/G-F7/G-F12). ·
  [`FISCAL_SECURITY.md`](../architecture/FISCAL_SECURITY.md) (§3 estratégia, §4 runtime, §5 rotação,
  §9 ameaças).
- **Precedente de storage privado:** `lib/contador/documentos/storage-supabase.ts` +
  `storage-types.ts` + `config.ts` (GOAL 010). · `.env.example:42-55` (Supabase Storage envs).
- **Mecanismo atual do vault:** `lib/fiscal/vault/fiscal-secret-vault.ts` (port) +
  `env-vault.ts` (piloto) + `secret-scan.ts` (varredura) + `pkcs12-loader.ts`/`certificado-validacao.ts`/
  `certificado-alerta.ts` (GOAL-008). · [`FISCAL_CERT_PILOT_EVIDENCIAS_001.md`](./FISCAL_CERT_PILOT_EVIDENCIAS_001.md).
- **Schema:** `prisma/schema.prisma:2246-2294` (`ConfiguracaoFiscalLoja`) · `:2296-2322`
  (`CertificadoDigital`).
- **Infra:** `next.config.mjs` (Vercel, env-bundle constraint) · `lib/prisma.ts` · `package.json`
  (`@supabase/supabase-js`, `node-forge`, `xml-crypto`). · `.github/workflows/fiscal-*.yml`.
- **ADRs aceitas deste GOAL:**
  [`ADR-0014`](../decisions/ADR-0014-supabase-vault-backend-kms-fiscal.md) ·
  [`ADR-0015`](../decisions/ADR-0015-sefaz-direta-homologacao-inicial.md) ·
  [`ADR-0016`](../decisions/ADR-0016-piloto-homologacao-sp-matriz-rafacell.md).

---

## 13. Validações executadas (doc-only)

| Gate | Resultado | Justificativa |
|---|---|---|
| `npx tsc --noEmit` | **N/A** | Nenhuma mudança em `.ts`/`.tsx` (DELIVERY_CHECKLIST §1.2: só doc não exige type-check) |
| `npm run build` | **N/A** | Nenhuma mudança em config/rotas/layouts/Server Actions/Prisma (DELIVERY_CHECKLIST §1.3: doc não exige build) |
| `npm run lint` | **N/A** | Nenhum código novo |
| `git diff --check` | **limpo** | Sem erro de whitespace ou artefato de merge |
| Números de ADR duplicados | **0** | Arquivos oficiais `docs/decisions/ADR-NNNN-*.md` agrupados por número |
| Referências antigas conflitantes | **0** | Sem caminhos novos sob ADR-0010/0011/0012 ou proposta ADR-0024 |
| Diff exclusivamente documental | **confirmado** | Dez arquivos sob `docs/**`; nenhum código/config/schema |
| Credencial ou segredo real | **0** | Somente nomes de campos, placeholders e requisitos; nenhum valor real |
| Provisionamento/operação externa | **0** | Nenhum bucket, policy, Vault, certificado ou endpoint foi criado/alterado |

---

*Documento de arquitetura executável do `KmsStorageVault` de produção. **Nada aqui implementa** o
vault — a implementação é sprint futura (GOAL próprio), sob `G-F12` e a ADR-0014 já aceita.*
