# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Readiness da elevação H4 (auditoria)

**Data:** 2026-07-21 · **Branch de auditoria:** `audit/fiscal-dry-run-005b-h4-elevation-readiness`
**Commit auditado:** `fd6b39eb18f28aed3d1a910fc7f38043c83ecd97` (`work/fiscal-dry-run-005b-h4-elevation-prep`)
**origin/main:** `ecc494409ef857391427baf8ce73f0784eff59ce` · **Run H3 aprovado:** [`29796176577`](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29796176577)

> Esta auditoria é **read-only**: não executou o workflow, não alterou o manifesto golden, não tocou a
> branch implementada e não fez merge/rebase/force-push. O único arquivo criado é este relatório.

---

## 1. Classificação

## **B — ajuste pequeno obrigatório**

O caminho H4 está **arquiteturalmente correto e fail-closed**. Todas as garantias exigidas foram
verificadas contra o código real (não apenas contra a descrição do autor), e **nenhum defeito
encontrado é capaz de produzir uma elevação indevida** — todos os modos de falha param a run.

O que impede o **A** é um defeito provado, de uma palavra, no passo de provisionamento do `tsx`
(§6, achado **B-1**): a instalação executa `postinstall` de terceiros no host, contradizendo o
`npm ci --ignore-scripts` que o próprio workflow usa 148 linhas acima — num GOAL cuja tese é
integridade de cadeia de suprimento. Some-se a isso um risco operacional que merece mitigação barata
porque o plano é de **um único dispatch** (§7, achado **B-2**).

| Achado | Tipo | Gravidade | Bloqueia o dispatch? |
|---|---|---|---|
| **B-1** `npm install` do `tsx` sem `--ignore-scripts` (executa `postinstall` do esbuild) | Coerência de supply-chain | P1 | Corrigir antes |
| **B-2** Java 17 por bind-mount nunca exercitado dentro do contêiner | Risco operacional | P2 | Recomendado mitigar |
| **B-3** `h4-elevation.log` / `h4-verify.log` não são publicados quando a elevação falha | Observabilidade | P2 | Recomendado |
| **B-4** `concurrency.cancel-in-progress: true` vale também para a run de elevação | Operacional | P3 | Não |
| **B-5** `git diff --name-only` não enxerga arquivo novo não rastreado | Cobertura residual | P3 | Não |

---

## 2. origin/main, branch e diff exato

```
origin/main                                   = ecc494409ef857391427baf8ce73f0784eff59ce
work/fiscal-dry-run-005b-h4-elevation-prep    = fd6b39eb18f28aed3d1a910fc7f38043c83ecd97
local == origin (branch já pushada)           = sim
merge-base(main, branch)                      = ecc4944  →  1 ahead / 0 behind
```

Fast-forward limpo — **PR direto, sem rebase**.

```
M  .github/workflows/fiscal-dry-run-integrity-proof.yml   (+262 / −1)
A  docs/fiscal/..._005B_H4_ELEVATION_PREP.md              (+174)
```

Exatamente os 2 arquivos declarados. Nenhum arquivo de aplicação, harness, `lib/fiscal`,
`workers/fiscal-xsd`, schema Prisma ou manifesto foi tocado.

---

## 3. Preservação do H3 — **provada mecanicamente**

Esta é a garantia mais forte do commit, e ela se sustenta em dados, não em promessa:

**`--numstat` = 262 inserções, 1 remoção — e a única linha removida é um comentário:**

```diff
-# NÃO eleva o manifesto golden ao estado completo: a elevação é um passo autorizado à parte (H4).
```

Substituída pelo bloco de comentário expandido (linhas 18-21). Portanto **zero linhas executáveis do
caminho H3 foram removidas ou alteradas**. O diff é puramente aditivo.

Confirmação estrutural (parse YAML real, `js-yaml`):

| Verificação | Resultado |
|---|---|
| Passos com `if: ${{ inputs.elevate_manifest }}` | **10** (1 em `verify-bundle`, 9 em `proof-offline`) |
| Todos os passos H4 têm o guard | ✅ 10/10 |
| Algum passo pré-existente ganhou guard | ❌ nenhum |
| "Garantir que o manifesto golden segue PARCIAL" | **incondicional** — segue sendo a última palavra do H3 |
| Ordem dos passos H3 executados com `elevate_manifest=false` | idêntica (os 10 H4 são pulados) |

Com o default (`elevate_manifest=false`) a run é **byte-equivalente ao H3 aprovado** no run
`29796176577`. Os 4 novos `env` (`ELEVATION_PHRASE`, `MANIFEST_PATH`, `TSX_VERSION`, `H4_ARTIFACT`) e
os 2 novos inputs são inertes.

---

## 4. Fluxo H4 — verificação item a item

Todos os itens exigidos pelo GOAL foram confirmados **no código**, e não por leitura do relatório do autor:

| # | Exigência | Verificado | Onde |
|---|---|---|---|
| 1 | H3 padrão inalterado | ✅ | §3 (262/−1, remoção = comentário) |
| 2 | Elevação exige os dois inputs corretos | ✅ | `elevate_manifest=true` + `elevation_confirmation == ELEVATE-GOAL-005B-H4` (comparação exata, linhas 108/334) |
| 3 | Só em `main` com override explícito | ✅ | `GITHUB_REF == refs/heads/main` **e** `allow_branch_override == true` (linhas 106-107 / 332-333) |
| 4 | Só após worker real, matriz 1+8, Java e egress verdes | ✅ | linhas 336-348: `ready.json` (`xmllint`, libxml2 2.15.3, `schemaManifestHash`), rede `Internal=true`, image ID == lock, `matrix.log` (`"status":"xsd_ok"`, `"workerReal":true`, `"egressExternal":0`) |
| 5 | Composition-gate nunca eleva | ✅ | ambas as invocações de `run.ts` passam `FISCAL_XSD_WORKER_URL`; `resolveXsdAdapterFromEnv` (proof.ts:620-626) só cai em composition-gate **sem** a env. `manifestXsdStatus` (proof.ts:266-269) **jamais** retorna `approved-real` para `kind==="composition-gate"` |
| 6 | Manifesto baseline precisa estar parcial | ✅ | linhas 350-358 exigem `proofState==="partial"`, `xsd===false`, `xsdWorkerReal===false` — confirmado contra o golden real |
| 7 | Manifesto final precisa estar completo | ✅ | linhas 391-413; todos os 6 valores exigidos são produzíveis (§5) |
| 8 | Hashes XML invariantes | ✅ | linhas 415-434, contra `git show ${GITHUB_SHA}:manifest.json` |
| 9 | Segundo dry-run termina em exit 0 | ✅ | linhas 446-463; `classifyProofExit` (proof.ts:715-718) devolve 0 com `manifestMatches` + `xsdWorkerReal` |
| 10 | Somente `manifest.json` pode mudar | ✅ | linhas 436-444, igualdade **exata** de string |
| 11 | Artifact com manifesto, hash, patch e evidências | ✅ | §8 |
| 12 | Workflow sem permissão de escrita | ✅ | §9 |

### Ordem dos gates (defesa em profundidade correta)

O gate de autorização H4 roda em `verify-bundle` **antes do checkout e antes do download do bundle de
~143 MB** (linha 100), e é **reafirmado** em `proof-offline` (linha 325) já com evidência
materializada. Autorização mal formada falha barato; elevação sem prova falha tarde — mas falha.

### Injeção de shell

`elevation_confirmation` (único input de texto livre) chega por `env:` e é comparado com aspas —
**nunca interpolado no corpo do script**. Os demais `${{ }}` no shell são `type: boolean`, que só
renderizam `true`/`false`. Sem vetor de injeção.

### `pipefail`

`defaults.run.shell: bash` é **explícito**, o que faz o runner usar
`bash --noprofile --norc -eo pipefail`. Isso é load-bearing: os passos da matriz, da elevação e da
re-verificação terminam em `| tee`, e sem `pipefail` o exit code do `tsx`/`vitest` seria mascarado
pelo `tee`. Com o shell explícito, **não é**. ✅

---

## 5. Manifesto e invariantes

**Baseline conferido no repositório** (`tools/fiscal-dry-run-integrity-proof/evidence/manifest.json`):

```json
"proofState": "partial",
"blockingReasons": ["XSD_WORKER_REAL_UNAVAILABLE"],
"verification": { "xsd": false, "xsdStatus": "composition-gate",
                  "xsdEngineName": "composition-gate", "xsdWorkerReal": false }
```

Satisfaz exatamente o gate de baseline. ✅

**Alvo completo — todos os 6 valores são realmente produzíveis** (rastreados até a fonte):

| Exigido pelo workflow | Produzido por | Confere |
|---|---|---|
| `proofState = "complete"` | `buildManifestFromProof` (proof.ts:513) quando `blockingReasons` vazio | ✅ |
| `verification.xsd = true` | `xsdRealValidationPassed(evidence)` (proof.ts:531) | ✅ |
| `xsdStatus = "approved-real"` | `manifestXsdStatus` (proof.ts:266-269) | ✅ |
| `xsdEngineName = "xmllint"` | `evidence.engineName` ← worker `engine.name` (validator.mjs:457 = literal `"xmllint"`) | ✅ |
| `xsdWorkerReal = true` | `evidence.workerReal` | ✅ |
| `blockingReasons = []` | `blockingReasonsFrom` (proof.ts:254-256) | ✅ |

Não há descompasso entre o que o workflow exige e o que o harness sabe emitir — o risco de "gate
impossível de satisfazer" (que queimaria o dispatch) **não existe**.

**Invariantes:** os 5 hashes (`snapshotSha256`, `unsignedXmlSha256`, `referencedNodeC14nSha256`,
`signedInfoSha256`, `signedXmlSha256`) + `signature.digestValue` são comparados contra
`git show ${GITHUB_SHA}:${MANIFEST_PATH}` — isto é, **contra o commit efetivamente executado**, como
exigido. Qualquer divergência aborta. Campos legitimamente mutáveis (`xsdEngineVersion`, etc.) ficam
fora da trava, corretamente.

---

## 6. Análise do `tsx` — achado **B-1** (ajuste obrigatório)

Auditado empiricamente em sandbox isolado (`scratchpad`), executando **o comando exato do workflow**.

| Pergunta do GOAL | Resposta verificada |
|---|---|
| Em que momento é instalado? | Linha 362-367, no **host**, entre a reafirmação de pré-condições e a elevação |
| Ocorre antes do isolamento? | ✅ **Sim.** O host tem rede; o isolamento `--internal` vale só para os contêineres. `tsx` já está em `node_modules/.bin` quando o contêiner offline sobe |
| Versão fixa? | ✅ `tsx@4.23.1` fixado (`TSX_VERSION`) — instalado e confirmado 4.23.1 |
| Integridade? | ⚠️ **Parcial** — ver abaixo |
| Altera `package.json` / `package-lock.json`? | ✅ **Não.** Comprovado por hash SHA-256 antes/depois: **ambos byte-idênticos** |
| Smoke test? | ✅ `test -x node_modules/.bin/tsx` + `tsx --version` (linhas 366-367), **antes** da elevação → falha barata |

### O defeito

```yaml
# linha 217  (caminho H3, endurecido)
run: npm ci --ignore-scripts

# linha 365  (caminho H4, NÃO endurecido)
npm install --no-save --no-package-lock "tsx@${TSX_VERSION}"
```

A árvore instalada foi inspecionada:

```
tsx@4.23.1  →  dependencies: { "esbuild": "~0.28.0" }
esbuild@0.28.1  →  scripts: { "postinstall": "node install.js" }
```

Duas consequências, ambas confirmadas e não mencionadas no relatório do autor:

1. **Executa `postinstall` de terceiros no host** — exatamente o que o `--ignore-scripts` da linha 217
   existe para impedir. O host é o mesmo que detém o socket do Docker, o JDK montado e o
   `GITHUB_TOKEN`.
2. **A versão do `esbuild` NÃO é fixa.** `~0.28.0` é um *range*: a fixação de `tsx@4.23.1` não fixa a
   dependência transitiva que efetivamente roda o `postinstall`. A afirmação de que a versão é "a
   mesma já exercitada" vale para o `tsx`, **não** para o esbuild.

Isto não corrompe o manifesto — `git diff --name-only`, os invariantes e o re-run exit 0 continuam
valendo. É um **defeito de coerência** num GOAL cuja tese inteira é integridade de cadeia de
suprimento.

### Correção recomendada

**Preferida (elimina a classe do problema):** promover `tsx` a **devDependency fixada** em
`package.json` + `package-lock.json`. O `npm ci --ignore-scripts` da linha 217 passa a provê-lo, o
passo 362-367 **desaparece**, e o esbuild entra travado por integridade no lock. O próprio autor já
aponta esse caminho (§9.3 do PREP) — a auditoria recomenda fazê-lo **antes** do dispatch, não depois.
Observação: hoje `tsx` já é usado via `npx tsx` em 4 scripts do `package.json`, então versioná-lo é
ganho geral, não custo deste GOAL.

**Mínima (uma palavra):** acrescentar `--ignore-scripts` à linha 365. O binário do esbuild vem do
pacote de plataforma (`@esbuild/linux-x64`, optionalDependency), então o `postinstall` é dispensável;
e se ainda assim quebrar, o `tsx --version` da linha 367 falha **antes** da elevação — fail-closed.

---

## 7. Análise do Java 17 — achado **B-2**

| Pergunta do GOAL | Resposta verificada |
|---|---|
| Caminho real do `JAVA_HOME` | **Não hardcoded** — resolvido de `JAVA_HOME_17_X64` do runner, com guard de não-vazio (linha 207). Design correto: falha explícita se ausente |
| Propagação | `GITHUB_PATH` + `GITHUB_ENV` (linhas 208-209) → `JAVA_HOME` disponível nos passos seguintes do mesmo job ✅ |
| Verificação | `java -version` + `javac -version` **no host** (linhas 211-215) antes de qualquer uso ✅ |
| Bind-mount | `--volume "${JAVA_HOME}":/opt/java17:ro` — **somente leitura**, contêiner não adultera o JDK ✅ |
| `JAVA_HOME`/`PATH` no contêiner | `JAVA_HOME=/opt/java17` e `PATH=/opt/java17/bin:…` (linhas 384-385) ✅ |
| `run.ts` acha o Java 17? | ✅ **Sim.** `java-external.ts` chama `javac` (linha 64) e `java` (linha 84) como **comandos nus** via `spawnSync` → resolvidos pelo `PATH`, que aponta o JDK montado primeiro |
| Precisa de JDK (não JRE)? | ✅ Sim (`javac --release 17`) — e `JAVA_HOME_17_X64` é JDK |
| Permissões / escrita | Roda como `$(id -u):$(id -g)`; `java-external.ts` escreve só em `tmpdir()` = `/tmp`. O contêiner de elevação **não** usa `--read-only`, e `/tmp` é 1777 ✅ |
| Bibliotecas | Temurin 17 linux-x64 tem baseline glibc antigo; `node:20-bookworm-slim` (glibc 2.36) traz `libstdc++6`/`zlib1g` (o próprio binário do Node depende deles) → compatível na prática |

### O risco (B-2)

**Nenhum passo prova que o JDK montado executa dentro do bookworm antes da elevação.** O
`java -version` da linha 213 roda no **host** (Ubuntu 24.04), não no contêiner. A compatibilidade
runner→imagem é plausível e provavelmente correta, mas é **assumida**.

Se falhar, o comportamento é seguro (`run.ts` trata dependência Java ausente como exit 2 → o passo
falha, nada é elevado). O custo não é de segurança: é **queimar o único dispatch autorizado**, com o
artifact do 005A expirando em **2026-07-26T01:59Z** — restam ~5 dias.

**Mitigação barata (~4 linhas), recomendada:** um smoke test guardado por `elevate_manifest`, antes
da elevação:

```yaml
- name: H4 — provar Java 17 dentro da imagem de execução (bind-mount)
  if: ${{ inputs.elevate_manifest }}
  run: |
    docker run --rm --volume "${JAVA_HOME}":/opt/java17:ro \
      --env PATH=/opt/java17/bin:/usr/local/bin:/usr/bin:/bin \
      "${NODE_IMAGE}" sh -c 'java -version && javac -version'
```

Converte uma falha tardia e cara numa falha precoce e barata.

---

## 8. Workspace, artifact e evidências

| Exigência | Resultado |
|---|---|
| Patch gerado contra o commit executado | ✅ `git diff -- manifest.json` sobre checkout de `GITHUB_SHA`; baseline via `git show ${GITHUB_SHA}:…` |
| `manifest.sha256` corresponde ao manifesto produzido | ✅ `sha256sum` calculado sobre a **cópia publicada** (`out/h4/manifest.json`), não sobre outra fonte |
| `h4-evidence.json` usa dados reais do run | ✅ **Rastreado campo a campo** — `runId`/`commitSha`/`ref` de `GITHUB_*`; `engine.*` de `out/ready.json` (resposta real do worker); positivo/negativos/`egressExternal` de `out/matrix.log`; `java.runtime` de `java -version` real; manifesto lido do arquivo elevado |
| Caminhos JSON corretos | ✅ Verificados contra a fonte: `/ready` devolve `{status, engine}` (server.mjs:162) e `engine` tem `name`/`xmllintVersion`/`libxml2Version`/`binaryHash`/`schemaManifestHash` (validator.mjs:456-463) — **exatamente** o que a evidência desestrutura |
| Shape do evento da matriz | ✅ `matrix.test.ts:212-230` emite `{"event":"matrix_005b","positive":{…},"negatives":{…},"egressExternal":N}` sem espaços → os `grep -F` das linhas 346-348 e a extração da linha 472 casam |
| Contagem de 8 negativos | ✅ 6 de schema + `payload_acima_do_limite` + `timeout` = 8 (matrix.test.ts:154-196); a evidência **falha** se ≠ 8 |
| Nenhum log/arquivo sintético substitui evidência real | ✅ Nenhum valor é fabricado; a montagem **falha** se positivo, negativos, `workerReal`, engine, egress, `databaseWrites` ou `sefazCalls` divergirem |
| Nenhuma informação sensível publicada | ✅ Só hashes, IDs de imagem, versões e metadados de run. Sem segredo, credencial ou XML — `toPublicProofView`/`assertSyntheticSafety` (proof.ts:429-433) já barram chave privada; fixtures são sintéticas |

**Achado B-3 (observabilidade).** O upload H4 (linha 528) é guardado por `if: ${{ inputs.elevate_manifest }}`
— sem `always()`. O artifact de evidências permanente (linha 543, `if: always()`) publica apenas
`proof-host.log`, `matrix.log` e `ready.json`. Logo, **se a elevação falhar, `h4-elevation.log` e
`h4-verify.log` não são publicados em lugar nenhum** — justamente o post-mortem mais necessário num
plano de dispatch único. Correção: acrescentar `out/h4-*.log` ao artifact `always()`.

**Achado B-5.** `git diff --name-only` cobre arquivos rastreados; um arquivo **novo não rastreado**
não apareceria. Risco residual baixo (o `run.ts` escreve só o manifesto; o Java escreve em `/tmp`).
Registre-se que `git status --porcelain` **não** seria substituto direto: `out/` não está no
`.gitignore` e apareceria como `??`, gerando falso positivo. A escolha do autor está correta; a
lacuna é apenas residual.

**Achado B-4.** `concurrency.cancel-in-progress: true` também vale para a run de elevação: um segundo
dispatch cancela o primeiro. Sem impacto de segurança (fail-closed), mas em regime de dispatch único
convém não disparar duas vezes.

---

## 9. Permissões e segurança

```yaml
permissions:
  contents: read
  actions: read
```

Varredura do arquivo inteiro por `git commit` / `git push` / `git add` / `contents: write`:
**nenhuma ocorrência.** O único segredo referenciado é `secrets.GITHUB_TOKEN` (linha 158,
pré-existente, para baixar o artifact do run do 005A).

O manifesto elevado sai **exclusivamente como artifact** (retenção 90 dias). A adoção no repositório
permanece um ato humano posterior — por desenho, não por convenção. ✅

Contramedidas materiais confirmadas: elevação em rede `--internal` (sem rota externa), imagem
verificada por SHA-256 e image ID contra o lock, worker `--read-only` / `cap-drop ALL` /
`no-new-privileges`, e workspace montado read-write apenas porque `run.ts` precisa escrever o
manifesto — compensado pela igualdade exata de `git diff --name-only`.

---

## 10. Validações executadas

| Validação | Resultado |
|---|---|
| `git fetch --all --prune` + confirmação de `origin/main`, branch, commit | ✅ |
| Diff exato = 2 arquivos | ✅ |
| Parse YAML real (`js-yaml`, sandbox isolado) | ✅ **sem erros**; 2 jobs, 8 + 28 passos |
| Line endings do **blob commitado** | ✅ `i/lf` (`git ls-files --eol`). O CRLF visto no working tree é artefato do checkout Windows (`w/crlf`) e **não** vai para o runner |
| `git diff --check` (`ecc4944..fd6b39e`) | ✅ limpo (exit 0) |
| Expressões GitHub Actions (`inputs.*` boolean, contexto disponível em ambos os jobs) | ✅ |
| Guards H4 (10/10) e ausência de guard em passos H3 | ✅ |
| Shape de `/ready`, do evento da matriz e do manifesto **contra a fonte** | ✅ |
| Comando `tsx` executado em sandbox isolado | ✅ `package.json`/`package-lock.json` byte-idênticos; `postinstall` do esbuild **confirmado presente** |
| Workflow executado | ❌ **NÃO** — proibido pelo escopo |
| Manifesto golden alterado | ❌ **NÃO** — segue `partial` |
| Branch auditada alterada | ❌ **NÃO** |
| `npx tsc --noEmit` / `npm run build` | **Não aplicável** — a mudança é workflow-only + documentação; nenhum `.ts`/`.tsx`, config, rota ou Prisma foi tocado |

---

## 11. Estratégia recomendada

1. **Aplicar B-1** na branch `work/…-h4-elevation-prep` — de preferência promovendo `tsx` a
   devDependency fixada (elimina o passo 362-367); no mínimo, `--ignore-scripts` na linha 365.
2. **Aplicar B-2** (smoke test do Java no contêiner) e **B-3** (`out/h4-*.log` no artifact `always()`).
   Ambos são aditivos e guardados — não tocam o H3.
3. **Abrir PR** para `main`. Fast-forward limpo, sem rebase (1 ahead / 0 behind).
4. **Dispatch único** na `main`, **antes de 2026-07-26T01:59Z** (expiração do artifact do 005A):
   `allow_branch_override=true`, `elevate_manifest=true`,
   `elevation_confirmation=ELEVATE-GOAL-005B-H4`.
5. **Recolher** `fiscal-dry-run-005b-h4-complete-manifest-<run_id>`, conferir `manifest.sha256` e os
   invariantes, e adotar o manifesto em **passo humano** separado.

Se o tempo até a expiração apertar, os itens 2 e 3 são dispensáveis sem perda de segurança — mas o
**item 1 não é**, porque é o único achado que contradiz a tese do próprio GOAL.

---

## 12. Conclusão

O caminho H4 faz o que promete: é opt-in, fail-closed em 9 condições, puramente aditivo, sem
permissão de escrita, com invariantes travados contra o commit executado e evidências derivadas de
dados reais do run. As afirmações do relatório de preparação foram conferidas contra o código e
**se sustentam** — com uma exceção material: a instalação do `tsx` executa `postinstall` de terceiros
e não fixa a dependência transitiva que os executa, ponto que o PREP não registra.

**Classificação: B — ajuste pequeno obrigatório.** Corrigido o B-1 (e, de preferência, B-2 e B-3),
o commit fica **apto a PR e a um único dispatch de elevação**.
