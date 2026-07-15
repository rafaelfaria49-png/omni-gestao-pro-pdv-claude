# FISCAL — XSD Worker B2 · Auditoria de Merge Readiness

**GOAL:** `FISCAL-XSD-OFFICIAL-VALIDATION-002` — implementação definitiva **B2** do worker de validação XSD oficial NFC-e.
**Fase:** correção final de supply chain (Trivy CRITICAL) + fechamento da merge readiness.
**Data:** 2026-07-15
**Natureza:** auditoria + correção autorizada. A auditoria inicial classificou **C**; sob autorização
explícita e incremental do usuário, os defeitos foram corrigidos na própria branch fiscal. Esta revisão
final consolida a **última correção autorizada** (patch pinado do `libgnutls30`) e lê a esteira completa.

---

## 1. Objetivo

Determinar se a implementação B2 está apta a integrar a `origin/main`, com base em **evidência real da CI**
(run #7, HEAD `8828b8a`) e em auditoria de segurança de integração contra a `main` atual.

## 2. Estado de referência

| Item | Valor |
|---|---|
| **HEAD inicial (desta sessão)** | `8828b8a814074a68957738a5675ed7630b856eb3` |
| **HEAD final** | `8828b8a814074a68957738a5675ed7630b856eb3` (fix já aplicado/pushado pela sessão anterior) |
| **origin/main** | `066e9f2324f8889c169f3b01b723732214b6b54c` |
| **Branch** | `fiscal/goal-002-xsd-worker-implementation` (local == remoto) |
| **merge-base** | `83081c6ae8c3ff7b52f5ecc33fd80e12101b995f` |
| **ahead / behind** | **10 / 3** |
| **CI final** | run **#7** · `29387989553` · **`completed / success`** |

> ⚠️ A `main` **avançou além** do que o contexto do GOAL indicava (`f1b7a2c`): agora está em
> **`066e9f2`** (mais commits de autenticação/entrada operacional). Toda a análise de merge foi
> **reconfirmada contra `066e9f2`** — ver §7.

## 3. A correção de supply chain (commit `8828b8a`)

Único portão que faltava na run #6 (`0130b5e`): **Trivy**. Pacote vulnerável no runtime:

- `libgnutls30 3.7.9-2+deb12u6` → **CVE-2026-33845 (CRITICAL)** + **CVE-2026-42010 (CRITICAL)**.

**Diff exato** (`workers/fiscal-xsd/Dockerfile`, +7 linhas, estágio `runtime`):

```dockerfile
# Correção de supply chain (Trivy CRITICAL): CVE-2026-33845 e CVE-2026-42010.
# Atualiza EXCLUSIVAMENTE libgnutls30 para a versão oficial corrigida do Debian
# Bookworm (fonte gnutls28 3.7.9-2+deb12u7, via bookworm-security). Versão pinada,
# sem dist-upgrade e sem tocar outros pacotes; índices apt removidos no mesmo layer.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends --only-upgrade libgnutls30=3.7.9-2+deb12u7 \
  && rm -rf /var/lib/apt/lists/*
```

**Menor correção possível:** versão **pinada** (`=3.7.9-2+deb12u7`), `--only-upgrade` (não instala pacote
novo), `--no-install-recommends` (não puxa recomendados), **sem `dist-upgrade`**, índices apt removidos no
**mesmo layer**. Base pinada por digest, UID/GID 10001, non-root, read-only, tmpfs, 768 MiB, concorrência 1,
fila 32, timeout 3 s, payload 2 MiB, saída 64 KiB, zero-egress, ADR-0010/ADR-0011 — **todos inalterados**.
**Sem VEX, sem `.trivyignore`, sem baixar a severidade, sem silenciar CVE.**

### Provas da correção (log da run #7, job "Container…" `87265568987`)

| # | Prova | Evidência |
|---|---|---|
| 1 | Imagem anterior continha `libgnutls30` vulnerável | `Unpacking libgnutls30:amd64 (3.7.9-2+deb12u7) over (3.7.9-2+deb12u6)` |
| 2 | Versão corrigida vem do **Debian oficial** | `Get:1 http://deb.debian.org/debian bookworm/main amd64 libgnutls30 amd64 3.7.9-2+deb12u7` |
| 3 | **Só** `libgnutls30` foi atualizado | Única linha `Unpacking … over …`; `--only-upgrade` + versão pinada |
| 4 | Versão instalada dentro do container | `Setting up libgnutls30:amd64 (3.7.9-2+deb12u7)` |
| 5 | Trivy **não** encontra as 2 CRITICAL | Report Summary: `omni-fiscal-xsd-worker:8828b8a… (debian 12.13)` → **Vulnerabilities: 0** (severity=CRITICAL) |
| 6 | **Nenhuma** nova CRITICAL surgiu | Total CRITICAL na imagem = **0** (Trivy `exit-code` de bloqueio não disparou) |

## 4. Esteira CI completa — run #7 (HEAD `8828b8a`) — TODA VERDE

Três jobs, **todos `success`** (o único step não-verde é *"Diagnóstico em falha"*, `skipped` — só roda em falha):

### Job `Unit and contract (ubuntu-24.04)` ✅
| Step | Resultado |
|---|---|
| `verify-hashes` (manifesto XSD) | ✅ `{"ok":true,…,"files":5}` |
| `test:fiscal-xsd:unit` | ✅ |
| **`npx tsc --noEmit --incremental false`** | ✅ **TypeScript verde** |
| **ESLint fiscal focado** | ✅ **ESLint verde** |

### Job `Unit and contract (windows-2022)` ✅ (paridade Windows, bytes XSD íntegros)

### Job `Container, offline integration and supply chain` ✅
| # | Item | Evidência |
|---|---|---|
| 7 | **Build reproduzível** | ✅ base pinada `node:20.20.2-bookworm-slim@sha256:2cf067…fc0` |
| 8 | **Container runtime** | ✅ `{"status":"ready",…}` |
| 9 | **Non-root** | ✅ usuário `10001:10001` (groupadd/useradd por caminho absoluto) |
| 10 | **Filesystem read-only** | ✅ `HostConfig.ReadonlyRootfs == "true"` |
| 11 | **tmpfs** | ✅ `HOME=/tmp`, `TMPDIR=/tmp`; escrita só em tmpfs |
| 12 | **Zero-egress (runtime)** | ✅ `docker exec … fetch('https://www.nfe.fazenda.gov.br')` → **bloqueado** (step `success`) |
| 13 | **Hash do binário `xmllint`** | ✅ `b58a991a1da85c4a49b449d0f107ea265e0545f8e7c3cd4fadf5eb2f504bb900` |
| — | libxml2 / schemaManifestHash | ✅ `2.15.3` · `fc42d03e…cae1` |
| 14 | **SBOM** | ✅ `syft … -o spdx-json` → `fiscal-xsd-worker.spdx.json` (arquivado) |
| 15 | **Trivy (bloqueio CRITICAL)** | ✅ 0 CRITICAL |
| 16 | **Testes de integração** | ✅ `container.integration.test.ts` — **11 passed** |
| 17 | **Testes de segurança** | ✅ `container.security.test.ts` — **6 passed** |
| 18 | **Suíte completa** | ✅ **174 arquivos passam / 2 skip · 2401 testes passam · 2 expected-fail · 17 skip** |
| 19 | **Build Next** | ✅ `npm run build` verde (no container real, dentro da rede sem egress) |

> A validação real contra os **5 XSDs oficiais** e o **XML assinado validando contra o XSD oficial** já
> haviam sido comprovados na run #6 (HEAD `0130b5e`) e permanecem intocados — o commit `8828b8a` só
> adiciona 7 linhas ao Dockerfile, sem tocar signer, XSD, pipeline, contrato, banco, Prisma ou rotas.

## 5. `validarXsd` — real, fail-closed, dormente ✅

Worker XSD real (não placebo): `infrastructureFailure()` sempre `valid:false`; sucesso exige
`outcome === "VALIDACAO_APROVADA"` + zero issues + atestação de engine (`binaryHash`/`schemaManifestHash`
em `^[a-f0-9]{64}$`); anti-SSRF (só loopback/`*.internal`/allowlist, `redirect:"error"`).
**Frente fiscal permanece dormente:** provider `STUB_HOMOLOGACAO`, sem certificado real, sem persistência,
sem chamada à SEFAZ, sem mudança de status de venda.

## 6. Escopo tocado — sem violações ✅

51 arquivos, todos em: `.github/workflows/fiscal-xsd-worker.yml`, `docker-compose.fiscal-xsd.yml`,
`docs/`, `lib/fiscal/**`, `package.json` (só scripts), `scripts/fiscal/**`, `workers/fiscal-xsd/**`.

| Proibição | Resultado |
|---|---|
| Prisma / migrations · rota pública / `app/**` · PDV · Financeiro · **Contador HUB** · auth / proxy | ✅ nenhum |
| Certificado real · provider SEFAZ · escrita de banco · binário versionado · dependências novas | ✅ nenhum |
| VEX · `.trivyignore` · rebaixar política Trivy · silenciar CVE | ✅ nada disso |

## 7. Merge readiness contra a `main` atual (`066e9f2`) ✅

```
merge-base                    = 83081c6ae8c3ff7b52f5ecc33fd80e12101b995f
rev-list --left-right --count origin/main...HEAD → behind 3 · ahead 10
git merge-tree --write-tree   → 82b5824646d64b9db126703a2e932d6745eb216e   (exit 0)
conflitos                     → NENHUM
```

**Interseção de arquivos (branch ∩ main): ZERO** (`comm -12` vazio — nem `package.json`). A `main` avançou
em autenticação/entrada operacional (`app/login*`, `app/api/auth/contador/*`, `lib/contador/auth/*`,
`components/dashboard/contador/*`, `proxy.ts`, `app/manifest.ts`, `.env.example`) — **nenhum** desses
caminhos existe na branch fiscal.

**Contador HUB:** tocado **pela `main`**, **não** pela branch fiscal → sem colisão. A integração é um
**merge limpo, sem conflito** (não mais fast-forward, pois as branches divergiram em 3 commits da main).

## 8. Classificação

> ## A — PRONTA PARA INTEGRAÇÃO

Toda a esteira está verde no HEAD `8828b8a` (run #7): **Trivy 0 CRITICAL · SBOM · container · non-root ·
read-only · tmpfs · zero-egress · hash do binário · integração · segurança · suíte completa · TypeScript ·
ESLint · build Next**. Integração estruturalmente segura: zero interseção com a `main` (`066e9f2`) e com o
Contador HUB, zero segredos, zero binários, zero dependências novas, merge-tree limpo. Frente fiscal dormente.

| Critério de A | Status |
|---|---|
| CI verde nos 3 jobs (HEAD `8828b8a`) | ✅ run #7 `success` |
| **Trivy CRITICAL = 0** (2 CVEs fechadas, sem novas) | ✅ |
| SBOM · container · non-root · read-only · tmpfs · zero-egress · hash do binário | ✅ |
| Integração · segurança · suíte completa · TypeScript · ESLint · build Next | ✅ |
| merge-tree sem conflito · interseção zero · Contador HUB sem colisão | ✅ |
| No-op removido · fail-closed · sucesso não-forjável · fiscal dormente | ✅ |

## 9. Próximo passo

Integrar por **merge** (não fast-forward; sem conflito) quando o usuário autorizar. **Não abrir PR e não
fazer merge nesta sessão.** Reavaliar, em decisão consciente separada, a política Trivy `CRITICAL-only`
(HIGH ainda não é avaliado).

---

*Auditoria read-only na origem; correção aplicada somente sob autorização explícita (patch pinado do
`libgnutls30`). Nenhum merge, rebase, cherry-pick, reset, stash ou push para `main`.*
