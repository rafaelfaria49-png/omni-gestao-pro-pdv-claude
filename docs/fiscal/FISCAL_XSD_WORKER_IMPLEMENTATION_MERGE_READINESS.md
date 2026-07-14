# FISCAL — XSD Worker B2 · Auditoria de Merge Readiness

**GOAL:** `FISCAL-XSD-WORKER-IMPLEMENTATION-MERGE-READINESS`
**GOAL de origem:** `FISCAL-XSD-OFFICIAL-VALIDATION-002` — fase de implementação definitiva **B2**
**Data:** 2026-07-14
**Natureza:** auditoria read-only. Nenhum arquivo de implementação foi alterado. Nenhuma integração foi executada.
Nenhuma correção foi aplicada (a falha encontrada foi **registrada, não corrigida**, conforme o GOAL).

---

## 1. Objetivo

Determinar se a implementação definitiva B2 do GOAL-002 (worker de validação XSD oficial NFC-e) está apta a integrar
a `origin/main`, com base em (a) evidência real da CI corretiva e (b) auditoria de segurança de integração da branch.

## 2. `origin/main`

```
83081c6ae8c3ff7b52f5ecc33fd80e12101b995f
```

Tip: `Merge pull request #3 from rafaelfaria49-png/fiscal/goal-002-xsd-adr-p01` — a `main` já contém o ADR P01 do GOAL-002.

## 3. Branch auditada

```
origin/fiscal/goal-002-xsd-worker-implementation
```

## 4. HEAD

```
878984a73caefb4586a6868f5a1c8fcdd11c48fe
```

Confere com o HEAD esperado (`878984a`).

## 5. Commits

| Hash | Assunto |
|------|---------|
| `775322aa2c0fbd940e2e0f836026f93405ea82ad` | `feat(fiscal): implementar worker B2 de validação XSD` |
| `3565fce412f8577048c19cee8df46fa349ba4adf` | `docs(fiscal): registrar operação e atualização do XSD` |
| `878984a73caefb4586a6868f5a1c8fcdd11c48fe` | `fix(fiscal): preservar bytes do manifesto XSD` |

Exatamente os 3 commits esperados (Rafael Faria · 2026-07-14). Nenhum commit extra.

---

## 6. CI run — **`29326853771` · FALHA** ❌

| Campo | Valor |
|---|---|
| Run | `29326853771` — *"fix(fiscal): preservar bytes do manifesto XSD #2"* |
| Workflow | `Fiscal XSD Worker B2` (`.github/workflows/fiscal-xsd-worker.yml`) |
| Evento | `push` |
| Branch | `fiscal/goal-002-xsd-worker-implementation` |
| **HEAD SHA** | **`878984a73caefb4586a6868f5a1c8fcdd11c48fe`** ✅ **é o HEAD corretivo** |
| **Status / conclusão** | **`Failure`** |
| Duração | 4 min 19 s |
| **Artefatos** | **NENHUM** (`No files were found…`) |

Confirmação do HEAD no log de checkout: `git log -1 --format=%H` → `878984a73caefb4586a6868f5a1c8fcdd11c48fe`.
A execução é, portanto, **prova válida** sobre o commit final — e ela é **vermelha**.

**Regra do GOAL:** *"A execução somente é válida se estiver associada ao commit final `878984a`"* — está.
Logo o resultado **conta**, e é falha.

## 7. Jobs

| Job | Runner | Resultado |
|---|---|---|
| `unit` — Unit and contract | `ubuntu-24.04` | ✅ **SUCESSO** |
| `unit` — Unit and contract | `windows-2022` | ✅ **SUCESSO** |
| `container` — Container, offline integration and supply chain | `ubuntu-24.04` | ❌ **FALHA (55 s)** |

> O job `container` declara `needs: unit`. O simples fato de ele **ter iniciado** é prova formal de que **ambos**
> os jobs da matriz `unit` concluíram com sucesso — incluindo `npx tsc --noEmit` e o ESLint focado.

## 8. Windows (`windows-2022`) — ✅ **VERDE** — regressão LF/CRLF **RESOLVIDA**

- `npm run fiscal:xsd:verify-hashes` → **passou**.
- Vitest: **5 arquivos · 40 testes passando · 1 skip**.
- `npx tsc --noEmit --incremental false` → passou. ESLint focado → passou.

**Este era exatamente o ponto que derrubou a 1ª execução (`29326625906`). O commit `878984a` corrigiu.**
Reproduzido de forma independente nesta auditoria (§20).

## 9. Linux (`ubuntu-24.04`, job `unit`) — ✅ **VERDE**

- `npm run fiscal:xsd:verify-hashes` → `{"ok":true,"package":"PL_010e_v1.02","manifestSha256":"fc42d03e…cae1","files":5}`
- Vitest: **5 arquivos · 41 testes passando**.
- `tsc --noEmit` → passou. ESLint focado → passou.

## 10. Container — ❌ **FALHA NO BUILD**

**Job:** `Container, offline integration and supply chain`
**Step exato da falha:** **`Build imutável do worker`** (`docker build --pull --file workers/fiscal-xsd/Dockerfile …`) — **7 s**

**Causa-raiz (log bruto):**

```
#9 [runtime 2/8] RUN groupadd --gid 10001 fiscal-xsd && useradd --uid 10001 --gid 10001 \
      --no-create-home --shell /usr/sbin/nologin fiscal-xsd && mkdir --parents … && chown …
#9 0.238 /bin/sh: 1: groupadd: not found
#9 ERROR: process "/bin/sh -c groupadd …" did not complete successfully: exit code: 127

#10 [libxml2-builder 2/4] RUN apt-get update && apt-get install …
#10 CANCELED

ERROR: failed to build: failed to solve: process "/bin/sh -c groupadd …" \
      did not complete successfully: exit code: 127
##[error]Process completed with exit code 1.
```

**Diagnóstico.** A imagem base `node:20.20.2-bookworm-slim` **não inclui `groupadd`/`useradd`** (utilitários do pacote
`shadow`/`passwd`, removidos nas variantes *slim* do Debian). O `RUN` do estágio `runtime` falha com **exit 127
(command not found)**. Em consequência, o estágio `libxml2-builder` foi **`CANCELED`** e **nenhuma imagem foi produzida**.

> Conforme o GOAL (*"Se falhar, não corrigir nesta auditoria. Registrar o job e step exatos da falha."*), a falha foi
> **apenas registrada**. **Nenhuma correção foi aplicada.**

**Efeito cascata — todos os steps seguintes não executaram (0 s):**
`Criar rede sem egress` · `Readiness com integridade` · `Provar isolamento e limites` · `Testes no container real` ·
`Prova automatizada de zero egress` · `Suíte completa e build Next` · `Registrar hashes` · `Gerar SBOM` · `Trivy`.

`Diagnóstico em falha` confirmou: `Error response from daemon: No such container: fiscal-xsd-worker`.

## 11. Hash do binário — ❌ **NÃO REGISTRADO**

A imagem nunca foi construída; `binary-sha256.txt` e `image-digest.txt` não existem.
(O mecanismo está implementado — o Dockerfile grava `binary.sha256`, o `validator.mjs` confere o hash do `xmllint`,
e o contrato do cliente exige `engine.binaryHash` em `^[a-f0-9]{64}$` — mas **não há valor observado**.)

## 12. SBOM — ❌ **NÃO GERADO**

O step `Gerar SBOM SPDX` (`anchore/sbom-action`, SPDX-JSON) não executou. `fiscal-xsd-worker.spdx.json` **não existe**.
**Sem componentes, sem versão de libxml2 atestada, sem imagem-base atestada.**

## 13. Trivy — ❌ **NÃO EXECUTADO**

O step `Scanner Trivy (bloqueio CRITICAL)` não executou. **Nenhuma vulnerabilidade foi avaliada.**

Configuração auditada (definição, não resultado): `aquasecurity/trivy-action` (SHA pinado), `vuln-type: os,library`,
`ignore-unfixed: true`, `severity: CRITICAL`, `exit-code: "1"` ⇒ CRITICAL bloqueia. Sem allowlist nem supressão silenciosa.

> **Observação de política (a decidir conscientemente):** apenas **CRITICAL** é avaliado. Vulnerabilidades **HIGH não são
> reportadas nem bloqueiam** com esta configuração.

> **Nota lateral (pré-existente, fora do escopo desta branch):** o `npm ci` da CI reporta
> `18 vulnerabilities (3 low, 7 moderate, 8 high)` nas dependências do app. A branch **não adiciona nenhuma
> dependência** (§23), então isso é estado prévio do repositório, não regressão deste GOAL.

## 14. Zero-egress — ❌ **NÃO PROVADO** (runtime nunca ocorreu)

A prova ativa (`docker exec … fetch('https://www.nfe.fazenda.gov.br')` devendo falhar) **não executou**.
As barreiras existem no código/config (rede `--internal`, `xmllint --nonet --nocatalogs`, catálogos XML esvaziados,
rejeição de `http(s):`/`file:` em dependências de schema), mas **não há evidência de runtime**.

## 15. Filesystem read-only — ❌ **NÃO PROVADO** (declarado: `read_only: true`, `/tmp` tmpfs 32 MiB `noexec,nosuid,nodev`)

## 16. Usuário não-root — ❌ **NÃO PROVADO**

Ironicamente, **é exatamente aqui que o build quebrou**: a criação do usuário `10001:10001` é a instrução que falhou.
A intenção (`USER 10001:10001`, `cap_drop: ALL`, `no-new-privileges`) está correta, mas **não foi materializada**.

## 17. Memória e limites — ❌ **NÃO PROVADOS** em runtime

Declarados: `mem_limit 768m` (assert `Memory == 805306368`), `cpus 1.0`, `pids_limit 64`.
Limites de aplicação **auditados em código** (`workers/fiscal-xsd/src/validator.mjs` + `server.mjs`):

```
POLICY = { concurrency: 1, timeoutMs: 3_000, maxPayloadBytes: 2 MiB, maxOutputBytes: 64 KiB,
           libxml2Version: "2.15.3", schemaManifestHash: "fc42d03e…" }
MAX_QUEUE = 32
```

Confere com o exigido (concorrência **1**, fila **32**, timeout **3 s**, payload **2 MiB**, saída **64 KiB**) —
porém **como código, não como runtime observado**.

## 18. Testes

| Suíte | Resultado |
|---|---|
| Unit/contract fiscal — `ubuntu-24.04` | ✅ **5 arquivos · 41 testes** |
| Unit/contract fiscal — `windows-2022` | ✅ **5 arquivos · 40 testes + 1 skip** |
| `npx tsc --noEmit` (ambas plataformas) | ✅ passou |
| ESLint focado (ambas plataformas) | ✅ passou |
| `fiscal:xsd:verify-hashes` (ambas plataformas) | ✅ passou |
| **Integração no container real** | ❌ **não executou** |
| **Segurança no container real** | ❌ **não executou** |
| **Suíte completa (`npm test`)** | ❌ **não executou** |
| **Build Next (`npm run build`)** | ❌ **não executou** |

As suítes de container/segurança **existem e cobrem a matriz exigida** (títulos auditados: `verProc` 20, grafo de
imports offline, idempotência/concorrência, payload > 2 MiB, command injection como dado, DTD/ENTITY, traversal,
XML só via stdin, timeout, hash divergente, binário/XSD ausentes, **"mantém exatamente os 24 cenários obrigatórios"**),
mas **nunca rodaram** — dependem da imagem que não foi construída.

---

## 19. `validarXsd` — **no-op REMOVIDO (real)** ✅

**Antes (`origin/main`)** — placebo; o XML era literalmente ignorado (`_xmlAssinado`):

```ts
export function validarXsd(_xmlAssinado: string | null, options: ValidarXsdOptions = {}): DryRunXsd {
  const xsd = (options.xsd ?? "").trim()
  if (!xsd) return { status: "xsd_nao_configurado", … }   // retorno fixo
  return { status: "xsd_presente_sem_validador", … }      // retorno fixo
}
```

**Depois (branch)** — assíncrona, monta envelope completo (`xmlSha256`, `schemaManifestHash`, `payloadBytes`,
`deadline`) e invoca o worker real via `createConfiguredXsdWorkerClient().validate()`.

**Fail-closed (verificado em código e coberto por testes verdes):**

- `infrastructureFailure()` retorna **sempre** `valid: false`, `engine: null`, `category: "INFRASTRUCTURE"`.
- Cliente: URL ausente/fora da allowlist → `WORKER_INDISPONIVEL`; timeout → `TIMEOUT`; resposta grande/inválida →
  `RESPOSTA_INCERTA`; HTTP ≥ 500 → `FALHA_TRANSITORIA`; demais não-2xx → `FALHA_PERMANENTE`.
- **Sucesso não é forjável:** `isValidationResult()` só aceita `valid: true` com `outcome === "VALIDACAO_APROVADA"`,
  `issues.length === 0` **e** atestação de engine (`binaryHash` e `schemaManifestHash` em `^[a-f0-9]{64}$`).
- **Cross-check de envelope:** `jobId`/`storeId`/`correlationId`/`xmlSha256`/`engine.schemaManifestHash` devem ecoar o request.
- **Anti-SSRF:** só `127.0.0.1`/`localhost`/`::1`/`*.internal`/allowlist; sem credenciais/query/fragmento;
  `redirect: "error"`; `cache: "no-store"`.
- **Infra ≠ XML inválido:** `xsd_ok` · `xsd_invalido` · `xsd_politica_rejeitada` · `xsd_falha_infraestrutura`.

**Fallback placebo: NÃO.**

**Emissão continua desativada** ✅ — a mudança **restringe**, não ativa:

- `dry-run-pipeline.ts`: XSD virou **gate** — assinatura é *pulada* se `xsd.status !== "xsd_ok"`. Assina só com
  **certificado de TESTE descartável** (*"nunca A1 real, nunca transmite"*). Relatório **descarta o XML**; **nada persiste**.
- `fiscal-pipeline.ts`: `podeProvider` e `prontoParaHomologacao` passaram a exigir **também** `xsd.status === "xsd_ok"`.
  Provider segue `STUB_HOMOLOGACAO` (dormente).
- **SEFAZ não é chamada. Venda não muda de status. Banco não é escrito.** Em produção `FISCAL_XSD_WORKER_URL` está
  ausente ⇒ o cliente falha fechado, sem efeito colateral.

**Nit cosmético:** comentário órfão `// 6) XSD (placeholder seguro — sem rede/disco).` em `dry-run-pipeline.ts` —
obsoleto/enganoso, **sem efeito em runtime**.

## 20. Manifesto e bytes — ✅ **PRESERVADOS (fix `878984a` CONFIRMADO em dobro)**

Cadeia de integridade verificada ponta a ponta:

```
OFFICIAL_XSD_MANIFEST_SHA256 (código)  = fc42d03e…cae1
manifest.sha256                        = fc42d03e…cae1
sha256(manifest.json) [medido]         = fc42d03e…cae1   ✅
POLICY.schemaManifestHash (worker)     = fc42d03e…cae1   ✅
```

| Arquivo | Bytes | SHA-256 |
|---|---|---|
| `nfe_v4.00.xsd` | 716 | `adce3646…27df` ✅ |
| `leiauteNFe_v4.00.xsd` | 352.527 | `598c7178…4bf7` ✅ |
| `tiposBasico_v4.00.xsd` | 22.532 | `772619c8…2047` ✅ |
| `DFeTiposBasicos_v1.00.xsd` | 61.958 | `7fe1dbd8…c6d2` ✅ |
| `xmldsig-core-schema_v1.01.xsd` | 3.747 | `f56744a5…e1ac` ✅ |

**Mecanismo do fix (`878984a`)** — `.gitattributes`: `*.xsd -text`, `manifest.json -text`, `manifest.sha256 -text`.

**Prova 1 — local, Windows (esta auditoria):**
- `core.autocrlf=true` **ativo** (a condição hostil exata).
- `git check-attr --source=<branch> text` → **`text: unset`** ⇒ Git não converte EOL.
- Worktree Windows da branch (HEAD `878984a`): `git status --porcelain` = **0 linhas** (sem modificação fantasma).
- Arquivos no working tree Windows hasheiam **idênticos ao manifesto**.
- `node scripts/fiscal/verify-xsd-artifacts.mjs` (read-only) →
  `{"ok":true,"package":"PL_010e_v1.02","manifestSha256":"fc42d03e…cae1","files":5}` · exit 0.

**Prova 2 — CI, `windows-2022` + `ubuntu-24.04` (run `29326853771`):**
`npm run fiscal:xsd:verify-hashes` **passou nas duas plataformas**, com saída idêntica.

⇒ **A regressão LF/CRLF que derrubou a run `29326625906` está resolvida.** Não é mais um risco.

O script também impõe: exatamente **5** XSDs allowlisted, identidade do pacote (`PL_010e_v1.02` / layout `4.00` /
modelo `65`) e rejeita **symlink, arquivo não-regular e escape de path**.

## 21. `merge-tree` (merge virtual) — ✅ **LIMPO**

```
merge-base                   = 83081c6ae8c3ff7b52f5ecc33fd80e12101b995f   (== origin/main)
git merge-tree --write-tree  → 9203e3891a8efa6d021fbdb87a20a8d003457925
exit code                    → 0
conflitos                    → NENHUM
rev-list --left-right --count origin/main...branch → 0  3
```

**A integração seria um fast-forward puro** (`main` 0 à frente, branch 3 à frente). Zero conflito, zero risco semântico.

`git diff --check` retorna exit 2 **exclusivamente** por *trailing whitespace* **dentro dos `.xsd` oficiais da SEFAZ** —
bytes regulatórios protegidos por `-text`. "Corrigi-los" invalidaria os hashes oficiais. **Não é defeito.**

## 22. Interseções com a `main`

```
git log --oneline 83081c6..origin/main   → (vazio)
```

A `origin/main` **não avançou** desde a base. **Zero commits novos** ⇒ interseção e conflito semântico **impossíveis**.

## 23. Contador HUB — ✅ **ZERO interseção**

Nenhum caminho tocado pertence ao Contador HUB. Os 43 arquivos estão contidos em:
`.github/workflows/fiscal-xsd-worker.yml`, `docker-compose.fiscal-xsd.yml`, `docs/`, `lib/fiscal/**`, `package.json`,
`scripts/fiscal/**`, `workers/fiscal-xsd/**`.

| Proibição | Resultado |
|---|---|
| Prisma / migrations | ✅ nenhum |
| Rota pública / `app/**` | ✅ nenhuma |
| PDV · Financeiro · Contador HUB | ✅ nenhum |
| Certificado real · Provider SEFAZ | ✅ nenhum (segue `STUB_HOMOLOGACAO`) |
| Escrita de banco | ✅ nenhuma |
| Binário compilado versionado | ✅ nenhum (`git diff --numstat` sem blob binário) |

`package.json`: **apenas 4 scripts npm**; **zero novas dependências**.
`docs/ai/CURRENT_STATUS.md`: honesto — GOAL **aberto**, *"sem homologação externa (N6=0), produção (N7=0), emissão ou SEFAZ"*.

## 24. Segredos — ✅ **NENHUM**

Varredura (`BEGIN … PRIVATE KEY`, `password=`, `api_key=`, `secret=`, `sk_live_`, `AKIA…`, `ghp_…`, `xox…`) no escopo
alterado: **nada**. A única correspondência do repositório é `lib/fiscal/signing/__fixtures__/test-cert.ts` —
fixture de certificado de **teste descartável, pré-existente na `main`, NÃO tocado por esta branch**.

Sanitização ativa (`sanitizeIssue()`) remove caminhos, XML e identificadores fiscais das mensagens; travada pelo teste
*"relatório não contém XML, chave privada ou senha"* (verde na CI).

O workflow usa `permissions: contents: read` (confirmado no log: `Contents: read`, `Metadata: read`),
`npm ci --ignore-scripts` e **todas as actions de terceiros pinadas por SHA**.

---

## 25. Classificação

> # C — CORREÇÃO TÉCNICA NECESSÁRIA

**Fundamento.** O GOAL define **C** como *"quando algum requisito real falhar"*. Um requisito real falhou: a CI
corretiva no HEAD correto está **vermelha**, e **toda a evidência de container exigida para o grau A inexiste**.

Critérios de **A** exigidos pelo GOAL × realidade:

| Critério de A | Status |
|---|---|
| CI corretiva final **verde** no HEAD correto | ❌ **Failure** |
| Linux e Windows verdes (job `unit`) | ✅ verdes |
| **Container construído** | ❌ **falhou no build** |
| **Container executado** | ❌ nunca subiu |
| **Testes de integração verdes** | ❌ não executaram |
| **Zero-egress provado** | ❌ não provado |
| **Hash binário registrado** | ❌ inexistente |
| **SBOM gerado** | ❌ inexistente |
| **Trivy sem bloqueio** | ❌ não executado |
| Merge virtual sem conflito | ✅ limpo |
| Escopo correto | ✅ correto |
| No-op removido | ✅ removido |
| Nenhuma ativação fiscal indevida | ✅ nenhuma |

**Não é B.** "Ajuste pequeno" pressupõe a esteira de prova concluída. Aqui **metade das provas obrigatórias não existe**.
**Não é D.** Não há risco estrutural, de segurança ou de escopo: a lógica fiscal está verde nas duas plataformas, o merge
é trivial, e a falha é de **plumbing do Dockerfile**, não de arquitetura.

**A falha é pequena em código, grande em consequência:** uma instrução `RUN` do estágio `runtime` usa `groupadd`/`useradd`,
ausentes na imagem `bookworm-slim`. Ela invalidou todo o braço de container/supply-chain da esteira.

## 26. Estratégia (próximo passo)

1. **Corrigir o `runtime` do `workers/fiscal-xsd/Dockerfile`** (fora desta auditoria) para criar o usuário `10001:10001`
   com utilitário existente na base *slim*. Opções típicas, sem alterar arquitetura:
   - instalar o pacote que fornece os utilitários (`apt-get install --yes --no-install-recommends passwd`) no estágio `runtime`; **ou**
   - usar `addgroup --gid 10001` / `adduser --uid 10001 --system --no-create-home --disabled-login` (BusyBox/Debian `adduser`); **ou**
   - reaproveitar um usuário não-root já existente na imagem, ajustando os asserts de `docker inspect` do workflow.
   > ⚠️ Se o UID/GID mudar, os asserts `Config.User == "10001:10001"` e o `--tmpfs …uid=10001,gid=10001` do workflow
   > e do `docker-compose.fiscal-xsd.yml` precisam acompanhar.
2. **Re-executar a CI** no novo HEAD e exigir **verde nos 3 jobs**.
3. **Coletar os artefatos** `fiscal-xsd-worker-evidence-<sha>`: `ready.json`, `image-digest.txt`, `binary-sha256.txt`,
   `fiscal-xsd-worker.spdx.json`. Registrar **hash do binário**, **SBOM** (libxml2 2.15.3, imagem-base) e **resultado do Trivy**.
4. **Reauditar** apenas as dimensões pendentes (§10–§18). As dimensões §19–§24 já estão fechadas e **não precisam ser
   refeitas**, salvo se a correção tocar código fiscal (não deve).
5. Confirmado o verde ⇒ promover para **A** e integrar por **fast-forward**.
6. Oportunidades cosméticas (não bloqueantes): remover o comentário órfão em `dry-run-pipeline.ts`; decidir
   conscientemente a política Trivy **CRITICAL-only** (HIGH hoje não é avaliado).

## 27. Conclusão

A **lógica fiscal** da implementação B2 está **sólida e provada**: o placebo foi substituído por um validador XSD real
contra o pacote oficial `PL_010e_v1.02`, que **falha fechada** em toda condição adversa, **não pode forjar sucesso**
(exige atestação de engine com hash de binário) e **estreita** — em vez de abrir — os gates fiscais. A frente fiscal
permanece **dormente**: sem emissão, sem SEFAZ, sem escrita de banco, sem mudança de status de venda. Isso está
confirmado por **41 testes (Linux) e 40 (Windows)**, mais `tsc` e ESLint, **verdes na CI no HEAD correto**.

A **correção `878984a` cumpriu seu papel**: a regressão LF/CRLF que derrubou a primeira execução está resolvida —
comprovado **duas vezes**, na CI (`windows-2022` + `ubuntu-24.04`) e localmente em Windows sob `core.autocrlf=true`.

A **integração seria estruturalmente segura**: fast-forward puro, zero conflito, zero interseção com a `main` ou com o
Contador HUB, zero segredos, zero binários, zero dependências novas.

**Mas a esteira de prova está incompleta.** O `docker build` falha em `groupadd: not found` (exit 127), porque
`node:20.20.2-bookworm-slim` não traz `groupadd`/`useradd`. Sem imagem, **não existe** container, readiness, prova de
isolamento, prova de zero-egress, hash de binário, SBOM nem Trivy — exatamente os itens que o grau **A** exige.

**Veredito: C — CORREÇÃO TÉCNICA NECESSÁRIA.** Não abrir PR e não integrar. Corrigir o Dockerfile, re-rodar a CI e
reauditar as dimensões §10–§18.

---

### Anexo — Comandos de verificação (read-only) usados

```bash
git rev-parse origin/main                                        # 83081c6…995f
git rev-parse origin/fiscal/goal-002-xsd-worker-implementation   # 878984a…48fe
git merge-base origin/main origin/fiscal/…                       # 83081c6…995f
git rev-list --left-right --count origin/main...origin/fiscal/…  # 0  3
git merge-tree --write-tree origin/main origin/fiscal/…          # 9203e389… (exit 0)
git log --oneline 83081c6..origin/main                           # (vazio)
git diff --name-status origin/main...origin/fiscal/…             # 43 arquivos, todos fiscais
git diff --numstat origin/main...origin/fiscal/…                 # nenhum blob binário
git check-attr --source=origin/fiscal/… text -- **/*.xsd         # text: unset
git -C ../wt-fiscal-002-xsd-worker status --porcelain            # 0 linhas (limpo)
node scripts/fiscal/verify-xsd-artifacts.mjs                     # {"ok":true,…} exit 0  (Windows)
```

Evidência de CI lida via sessão autenticada do navegador (run `29326853771`, job `87065782121`, log bruto completo).

*Auditoria read-only. Nenhum arquivo de implementação foi alterado; nenhuma worktree de terceiros foi modificada;
nenhuma correção foi aplicada; nenhum merge, rebase, cherry-pick, reset ou stash foi executado.*
