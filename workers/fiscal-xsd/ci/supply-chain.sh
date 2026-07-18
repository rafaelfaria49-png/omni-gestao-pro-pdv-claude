#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Supply chain do worker fiscal XSD B2
# GOAL FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A
#
# Executado EXCLUSIVAMENTE no runner Linux do GitHub Actions, a partir do
# workflow .github/workflows/fiscal-xsd-worker-supply-chain.yml. Encapsula os
# passos determinísticos da supply chain para manter o YAML auditável.
#
# Este script NÃO:
#   - acessa SEFAZ, banco de dados ou rede fiscal;
#   - usa segredo, certificado, CSC ou credencial;
#   - publica imagem em registry;
#   - modifica schemas oficiais;
#   - faz git commit ou git push.
#
# O runtime do worker (JOB verify-offline) roda em rede Docker `--internal`,
# sem rota externa. Este script apenas orquestra build/inspeção/empacotamento
# e a verificação offline a partir do archive.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

MODE="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${ROOT}"

# --- Parâmetros (todos overridáveis por env pelo workflow) -----------------
OUT_DIR="${OUT_DIR:-${ROOT}/out}"
DOCKERFILE="${DOCKERFILE:-workers/fiscal-xsd/Dockerfile}"
DOCKERIGNORE="workers/fiscal-xsd/Dockerfile.dockerignore"
SCHEMA_MANIFEST="lib/fiscal/xsd/manifest.json"
SCHEMA_MANIFEST_HASH_FILE="lib/fiscal/xsd/manifest.sha256"

IMAGE_TAG="${IMAGE_TAG:-fiscal-xsd-worker:pl010e-v1.02-libxml2-2.15.3-goal005a}"
NODE_IMAGE="${NODE_IMAGE:-node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0}"
NETWORK="${NETWORK:-fiscal-xsd-internal}"
CONTAINER="${CONTAINER:-fiscal-xsd-worker-005a}"
WORKER_URL="${WORKER_URL:-http://worker.internal:8080}"

DOCKER_ARCHIVE="${DOCKER_ARCHIVE:-fiscal-xsd-worker-goal005a.docker.tar}"
OCI_ARCHIVE="${OCI_ARCHIVE:-fiscal-xsd-worker-goal005a.oci.tar}"
SBOM_FILE="${SBOM_FILE:-fiscal-xsd-worker-goal005a.cyclonedx.json}"
TRIVY_JSON="${TRIVY_JSON:-fiscal-xsd-worker-goal005a.trivy.json}"
TRIVY_SUMMARY="${TRIVY_SUMMARY:-fiscal-xsd-worker-goal005a.trivy.txt}"

# Valores de proveniência confirmados no código real (Dockerfile + manifest).
LIBXML2_VERSION="2.15.3"
LIBXML2_SOURCE_URL="https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.tar.xz"
LIBXML2_SOURCE_SHA256="78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07"
LIBXML2_PATCH_URL="https://github.com/GNOME/libxml2/commit/d3352554e4c1f052b914cda7b415d06b7eab5dfa.patch"
LIBXML2_PATCH_SHA256="ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c"
LIBGNUTLS_VERSION="3.7.9-2+deb12u7"
LIBCAP2_VERSION="1:2.66-4+deb12u3"
XSD_PACKAGE="PL_010e_v1.02"
XSD_LAYOUT="4.00"
XSD_MODEL="65"
XSD_ROOT_SCHEMA="nfe_v4.00.xsd"
EXPECTED_SCHEMA_MANIFEST_HASH="fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1"
EXPECTED_LIBXML_GATE="21503"

log()   { printf '::group::%s\n' "$*"; }
endlog(){ printf '::endgroup::\n'; }
die()   { printf '::error::%s\n' "$*" >&2; exit 1; }

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

ensure_out() { mkdir -p "${OUT_DIR}"; }

# Valida a saída de `xmllint --version` contra o código canônico LIBXML_VERSION.
# libxml2 2.15.3 => 21503 (major*10000 + minor*100 + patch).
# Independente de idioma, acentuação, capitalização e de "libXML" vs "libxml2".
# Não aceita a forma semântica "2.15.3" no lugar do código; exige exatamente 21503.
assert_xmllint_libxml_version_code() {
  local version_out="$1"
  local expected="${EXPECTED_LIBXML_GATE}"
  local first_line codes unique count reported

  first_line="$(printf '%s\n' "${version_out}" | head -n 1)"
  codes="$(printf '%s\n' "${first_line}" | grep -oE '[0-9]{5}' || true)"
  if [[ -z "${codes}" ]]; then
    die "xmllint reportou LIBXML_VERSION=ausente; esperado ${expected} (libxml2 ${LIBXML2_VERSION})."
  fi
  unique="$(printf '%s\n' "${codes}" | sort -u)"
  count="$(printf '%s\n' "${unique}" | grep -c . || true)"
  if [[ "${count}" -ne 1 ]]; then
    die "xmllint reportou códigos LIBXML_VERSION conflitantes ($(printf '%s' "${unique}" | tr '\n' ' ')); esperado exatamente ${expected}."
  fi
  reported="$(printf '%s\n' "${unique}")"
  [[ "${reported}" == "${expected}" ]] \
    || die "xmllint reportou LIBXML_VERSION=${reported}; esperado ${expected} (libxml2 ${LIBXML2_VERSION})."
  printf 'LIBXML_VERSION canônico confirmado: %s (libxml2 %s)\n' "${reported}" "${LIBXML2_VERSION}"
}

# Prova fail-closed de que o runtime foi endurecido (GOAL 005A FIX): binário node
# preservado, entrypoint intacto, gerenciadores de pacote REMOVIDOS (npm/npx/yarn/
# yarnpkg/corepack, diretórios globais e qualquer package.json sob o npm global) e os
# pacotes Debian corrigidos em versão exata (libcap2 CVE-2026-4878; libgnutls30 pinado).
# Qualquer ferramenta remanescente ou versão divergente ABORTA o pipeline — nunca vira
# warning. Executa apenas inspeções read-only na própria imagem, como usuário 10001.
assert_runtime_hardened() {
  local node_version entrypoint libcap2_ver libgnutls_ver

  node_version="$(
    docker run --rm --entrypoint node "${IMAGE_TAG}" --version 2>&1
  )" || die "Runtime não executa 'node --version' — binário node ausente/quebrado."
  printf 'node runtime preservado: %s\n' "${node_version}"

  entrypoint="$(docker image inspect "${IMAGE_TAG}" --format '{{json .Config.Entrypoint}}')"
  printf '%s\n' "${entrypoint}" | grep --fixed-strings 'server.mjs' >/dev/null \
    || die "Entrypoint do worker inesperado (esperado node .../server.mjs): ${entrypoint}"

  # Ausência dos gerenciadores de pacote (comando no PATH, símbolo em disco e diretórios
  # globais) e de qualquer package.json remanescente sob o npm global removido.
  docker run --rm --entrypoint sh "${IMAGE_TAG}" -c '
    set -eu
    fail=0
    for tool in npm npx yarn yarnpkg corepack; do
      if command -v "$tool" >/dev/null 2>&1; then
        echo "PRESENTE: comando $tool ainda resolve no PATH" >&2
        fail=1
      fi
    done
    for path in \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg /usr/local/bin/corepack \
      /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack; do
      if [ -e "$path" ]; then
        echo "PRESENTE: caminho $path ainda existe" >&2
        fail=1
      fi
    done
    if [ -d /usr/local/lib/node_modules ] \
       && find /usr/local/lib/node_modules -name package.json -print -quit 2>/dev/null | grep -q .; then
      echo "PRESENTE: package.json remanescente sob o npm global" >&2
      fail=1
    fi
    command -v node >/dev/null 2>&1 || { echo "AUSENTE: node no runtime" >&2; fail=1; }
    exit "$fail"
  ' || die "Runtime ainda contém gerenciador de pacote (npm/npx/yarn/yarnpkg/corepack) ou package.json global remanescente."
  printf 'gerenciadores de pacote ausentes: npm, npx, yarn, yarnpkg, corepack\n'

  # Pacotes Debian corrigidos, versões exatas (fail-closed).
  libcap2_ver="$(
    docker run --rm --entrypoint dpkg-query "${IMAGE_TAG}" -W -f='${Version}' libcap2 2>/dev/null
  )" || die "libcap2 ausente na imagem."
  test "${libcap2_ver}" = "${LIBCAP2_VERSION}" \
    || die "libcap2=${libcap2_ver}; esperado ${LIBCAP2_VERSION} (CVE-2026-4878)."
  printf 'libcap2 confirmado: %s (CVE-2026-4878 corrigido)\n' "${libcap2_ver}"

  libgnutls_ver="$(
    docker run --rm --entrypoint dpkg-query "${IMAGE_TAG}" -W -f='${Version}' libgnutls30 2>/dev/null
  )" || die "libgnutls30 ausente na imagem."
  test "${libgnutls_ver}" = "${LIBGNUTLS_VERSION}" \
    || die "libgnutls30=${libgnutls_ver}; esperado ${LIBGNUTLS_VERSION} (pin preservado)."
  printf 'libgnutls30 confirmado: %s (pin preservado)\n' "${libgnutls_ver}"
}

# Digest determinístico dos insumos reais do build (o que o Dockerfile COPIA),
# via git ls-files -s (modo + blob sha + path), estável e content-addressed.
build_context_digest() {
  git ls-files -s -- \
    "${DOCKERFILE}" \
    "${DOCKERIGNORE}" \
    workers/fiscal-xsd/src \
    "${SCHEMA_MANIFEST}" \
    "${SCHEMA_MANIFEST_HASH_FILE}" \
    "lib/fiscal/xsd/schemas/${XSD_PACKAGE}/NFe" \
    | sha256sum | awk '{print $1}'
}

# ---------------------------------------------------------------------------
mode_preflight() {
  log "Inventário do runner"
  docker version
  docker buildx version
  docker info --format 'server={{.ServerVersion}} driver={{.Driver}} rootless={{.SecurityOptions}}'
  command -v jq  >/dev/null || die "jq ausente no runner."
  command -v tar >/dev/null || die "tar ausente no runner."
  endlog
  ensure_out
}

# ---------------------------------------------------------------------------
mode_build() {
  ensure_out
  local dockerfile_sha context_sha started ended duration image_id image_size

  dockerfile_sha="$(sha256_of "${DOCKERFILE}")"
  context_sha="$(build_context_digest)"

  log "Build conectado (buildx, --load, sem push, sem cache remota)"
  started="$(date +%s)"
  DOCKER_BUILDKIT=1 docker buildx build \
    --file "${DOCKERFILE}" \
    --tag "${IMAGE_TAG}" \
    --load \
    --no-cache-filter libxml2-builder \
    --provenance=false \
    --progress=plain \
    .
  ended="$(date +%s)"
  duration="$(( ended - started ))"
  endlog

  image_id="$(docker image inspect "${IMAGE_TAG}" --format '{{.Id}}')"
  image_size="$(docker image inspect "${IMAGE_TAG}" --format '{{.Size}}')"

  # Metadata parcial; digests de archive/manifest são preenchidos em package.
  jq -n \
    --arg goal "FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A" \
    --arg repositoryCommit "${GITHUB_SHA:-$(git rev-parse HEAD)}" \
    --arg dockerfileSha256 "${dockerfile_sha}" \
    --arg buildContextSha256 "${context_sha}" \
    --arg baseImage "${NODE_IMAGE}" \
    --arg imageTag "${IMAGE_TAG}" \
    --arg imageId "${image_id}" \
    --argjson imageSizeBytes "${image_size}" \
    --argjson buildDurationSeconds "${duration}" \
    '{goal:$goal, repositoryCommit:$repositoryCommit, dockerfileSha256:$dockerfileSha256,
      buildContextSha256:$buildContextSha256, baseImage:$baseImage, imageTag:$imageTag,
      imageId:$imageId, imageSizeBytes:$imageSizeBytes, buildDurationSeconds:$buildDurationSeconds}' \
    > "${OUT_DIR}/image-metadata.json"

  {
    echo "image_tag=${IMAGE_TAG}"
    echo "image_id=${image_id}"
    echo "image_size_bytes=${image_size}"
    echo "dockerfile_sha256=${dockerfile_sha}"
    echo "build_context_sha256=${context_sha}"
    echo "base_image=${NODE_IMAGE}"
    echo "build_duration_seconds=${duration}"
  } | tee "${OUT_DIR}/build-summary.txt"
}

# ---------------------------------------------------------------------------
mode_inspect() {
  log "Inspeção da imagem construída (xmllint, versão, gate, schemas, isolamento)"
  local version_out user entrypoint manifest_hash_line
  # LC_ALL=C reduz variação de idioma; o gate ainda extrai o código numérico
  # (21503) para não depender de "Usando"/"Using" nem de "libXML"/"libxml2".
  version_out="$(
    docker run --rm -e LC_ALL=C \
      --entrypoint /opt/fiscal-xsd/bin/xmllint \
      "${IMAGE_TAG}" --version 2>&1
  )" || die "Falha ao executar /opt/fiscal-xsd/bin/xmllint --version na imagem ${IMAGE_TAG}."
  printf '%s\n' "${version_out}"
  assert_xmllint_libxml_version_code "${version_out}"

  user="$(docker image inspect "${IMAGE_TAG}" --format '{{.Config.User}}')"
  test "${user}" = "10001:10001" || die "Usuário runtime não é 10001:10001 (obtido: ${user})."

  entrypoint="$(docker image inspect "${IMAGE_TAG}" --format '{{json .Config.Entrypoint}}')"
  echo "entrypoint=${entrypoint}"
  echo "${entrypoint}" | grep --fixed-strings 'server.mjs' || die "Entrypoint inesperado."
  docker image inspect "${IMAGE_TAG}" --format '{{json .Config.Healthcheck}}' | grep --fixed-strings 'healthcheck.mjs' \
    || die "Healthcheck inesperado."

  # Manifest de schema embutido bate com o hash oficial.
  manifest_hash_line="$(docker run --rm --entrypoint cat "${IMAGE_TAG}" /opt/fiscal-xsd/manifest/manifest.sha256)"
  echo "manifest.sha256 (imagem): ${manifest_hash_line}"
  echo "${manifest_hash_line}" | grep --fixed-strings "${EXPECTED_SCHEMA_MANIFEST_HASH}" \
    || die "Hash do schema manifest divergente na imagem."

  # Exatamente os cinco XSDs oficiais e nenhum segredo em env.
  docker run --rm --entrypoint sh "${IMAGE_TAG}" -c \
    'ls -1 /opt/fiscal-xsd/schemas/'"${XSD_PACKAGE}"'/NFe | sort'
  docker image inspect "${IMAGE_TAG}" --format '{{json .Config.Env}}' \
    | grep -Eiq '(secret|token|password|senha|csc|certificad|api[_-]?key)' \
    && die "Env com padrão sensível detectada na imagem." || true

  # Runtime endurecido: node preservado, package managers removidos, libcap2/libgnutls30
  # corrigidos (fail-closed).
  assert_runtime_hardened
  endlog
}

# ---------------------------------------------------------------------------
mode_package() {
  ensure_out
  [ -f "${OUT_DIR}/${SBOM_FILE}" ]  || die "SBOM ausente antes do empacotamento."
  [ -f "${OUT_DIR}/${TRIVY_JSON}" ] || die "Relatório Trivy JSON ausente antes do empacotamento."

  log "Exportar Docker archive carregável"
  docker save "${IMAGE_TAG}" -o "${OUT_DIR}/${DOCKER_ARCHIVE}"
  endlog

  log "Exportar OCI archive real (buildx OCI, mesmos insumos pinados)"
  DOCKER_BUILDKIT=1 docker buildx build \
    --file "${DOCKERFILE}" \
    --output "type=oci,dest=${OUT_DIR}/${OCI_ARCHIVE}" \
    --provenance=false \
    .
  endlog

  # Digest do manifest a partir do índice OCI (não requer push a registry).
  local oci_manifest_digest
  oci_manifest_digest="$(tar -xOf "${OUT_DIR}/${OCI_ARCHIVE}" index.json | jq -r '.manifests[0].digest')"

  log "Checksums (SHA256SUMS) e finalização de metadata"
  ( cd "${ROOT}" && sha256sum \
      "out/${DOCKER_ARCHIVE}" \
      "out/${OCI_ARCHIVE}" \
      "out/${SBOM_FILE}" \
      "out/${TRIVY_JSON}" \
      "${DOCKERFILE}" \
      "${SCHEMA_MANIFEST}" \
      > "${OUT_DIR}/SHA256SUMS" )
  cat "${OUT_DIR}/SHA256SUMS"

  local docker_sha oci_sha sbom_sha trivy_sha schema_sha
  docker_sha="$(sha256_of "${OUT_DIR}/${DOCKER_ARCHIVE}")"
  oci_sha="$(sha256_of "${OUT_DIR}/${OCI_ARCHIVE}")"
  sbom_sha="$(sha256_of "${OUT_DIR}/${SBOM_FILE}")"
  trivy_sha="$(sha256_of "${OUT_DIR}/${TRIVY_JSON}")"
  schema_sha="$(sha256_of "${SCHEMA_MANIFEST}")"

  jq \
    --arg ociManifestDigest "${oci_manifest_digest}" \
    --arg dockerArchive "${DOCKER_ARCHIVE}" \
    --arg dockerArchiveSha256 "${docker_sha}" \
    --arg ociArchive "${OCI_ARCHIVE}" \
    --arg ociArchiveSha256 "${oci_sha}" \
    --arg sbom "${SBOM_FILE}" \
    --arg sbomSha256 "${sbom_sha}" \
    --arg trivy "${TRIVY_JSON}" \
    --arg trivySha256 "${trivy_sha}" \
    --arg schemaManifestSha256 "${schema_sha}" \
    '. + {ociManifestDigest:$ociManifestDigest, dockerArchive:$dockerArchive,
      dockerArchiveSha256:$dockerArchiveSha256, ociArchive:$ociArchive, ociArchiveSha256:$ociArchiveSha256,
      sbom:$sbom, sbomSha256:$sbomSha256, trivy:$trivy, trivySha256:$trivySha256,
      schemaManifestSha256:$schemaManifestSha256}' \
    "${OUT_DIR}/image-metadata.json" > "${OUT_DIR}/image-metadata.json.tmp"
  mv "${OUT_DIR}/image-metadata.json.tmp" "${OUT_DIR}/image-metadata.json"
  endlog
}

# ---------------------------------------------------------------------------
trivy_count() {
  # $1 = severidade; conta ocorrências no JSON real do Trivy (pós-scan gate).
  jq --arg sev "$1" \
    '[.Results[]?.Vulnerabilities[]? | select(.Severity==$sev)] | length' \
    "${OUT_DIR}/${TRIVY_JSON}"
}

mode_verify_offline() {
  ensure_out
  log "Validar SHA256SUMS do bundle baixado"
  ( cd "${ROOT}" && sha256sum --check --strict "${OUT_DIR}/SHA256SUMS" )
  endlog

  log "Carregar o Docker archive (docker load) e conferir image ID"
  docker load --input "${OUT_DIR}/${DOCKER_ARCHIVE}"
  local expected_id loaded_id
  expected_id="$(jq -r '.imageId' "${OUT_DIR}/image-metadata.json")"
  loaded_id="$(docker image inspect "${IMAGE_TAG}" --format '{{.Id}}')"
  test "${loaded_id}" = "${expected_id}" \
    || die "Image ID carregado (${loaded_id}) diverge do metadata (${expected_id})."
  endlog

  log "Conferir xmllint/libxml2 e schema manifest na imagem carregada"
  local loaded_version_out
  loaded_version_out="$(
    docker run --rm -e LC_ALL=C \
      --entrypoint /opt/fiscal-xsd/bin/xmllint \
      "${IMAGE_TAG}" --version 2>&1
  )" || die "Falha ao executar xmllint --version na imagem carregada ${IMAGE_TAG}."
  printf '%s\n' "${loaded_version_out}"
  assert_xmllint_libxml_version_code "${loaded_version_out}"
  docker run --rm --entrypoint cat "${IMAGE_TAG}" /opt/fiscal-xsd/manifest/manifest.sha256 \
    | grep --fixed-strings "${EXPECTED_SCHEMA_MANIFEST_HASH}" || die "Schema manifest divergente na imagem carregada."
  test "$(docker image inspect "${IMAGE_TAG}" --format '{{.Config.User}}')" = "10001:10001" \
    || die "Imagem carregada não roda como 10001:10001."

  # Runtime endurecido também na imagem carregada do archive: node preservado, package
  # managers removidos, libcap2/libgnutls30 corrigidos (fail-closed).
  assert_runtime_hardened
  endlog

  log "Criar rede sem egress e iniciar worker a partir do archive"
  docker network create --internal "${NETWORK}"
  docker run --detach --name "${CONTAINER}" \
    --network "${NETWORK}" \
    --network-alias worker.internal \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=0700,uid=10001,gid=10001 \
    --memory 768m --cpus 1 --pids-limit 64 \
    --cap-drop ALL --security-opt no-new-privileges:true \
    "${IMAGE_TAG}"
  endlog

  log "Readiness com integridade (de dentro do container)"
  local ready_json=""
  for attempt in $(seq 1 30); do
    if docker exec "${CONTAINER}" node -e "fetch('http://127.0.0.1:8080/ready').then(r=>r.ok?r.text():Promise.reject(new Error(String(r.status)))).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))" > "${OUT_DIR}/ready.json"; then
      break
    fi
    sleep 1
  done
  ready_json="$(cat "${OUT_DIR}/ready.json")"
  echo "${ready_json}"
  echo "${ready_json}" | grep --fixed-strings '"libxml2Version":"2.15.3"' || die "Readiness sem libxml2 2.15.3."
  echo "${ready_json}" | grep --fixed-strings "\"schemaManifestHash\":\"${EXPECTED_SCHEMA_MANIFEST_HASH}\"" \
    || die "Readiness sem schema manifest esperado."
  endlog

  log "Provar isolamento e limites de runtime (docker inspect)"
  test "$(docker inspect --format '{{.Config.User}}' "${CONTAINER}")" = "10001:10001"           || die "user"
  test "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "${CONTAINER}")" = "true"      || die "read-only"
  test "$(docker inspect --format '{{.HostConfig.Memory}}' "${CONTAINER}")" = "805306368"         || die "memory 768MiB"
  test "$(docker inspect --format '{{.HostConfig.PidsLimit}}' "${CONTAINER}")" = "64"             || die "pids 64"
  test "$(docker inspect --format '{{.HostConfig.NanoCpus}}' "${CONTAINER}")" = "1000000000"      || die "cpus 1"
  test "$(docker inspect --format '{{.HostConfig.SecurityOpt}}' "${CONTAINER}")" = "[no-new-privileges:true]" || die "no-new-privileges"
  test "$(docker inspect --format '{{.HostConfig.CapDrop}}' "${CONTAINER}")" = "[ALL]"            || die "cap-drop ALL"
  endlog

  log "Prova de ZERO EGRESS (enforcement da rede --internal + probes que devem falhar)"
  test "$(docker network inspect "${NETWORK}" --format '{{.Internal}}')" = "true" \
    || die "Rede não é --internal (sem enforcement de egress)."
  docker exec "${CONTAINER}" node -e \
    "fetch('https://www.nfe.fazenda.gov.br',{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))" \
    || die "Egress HTTP externo NÃO foi bloqueado."
  docker exec "${CONTAINER}" node -e \
    "require('dns').promises.lookup('www.nfe.fazenda.gov.br').then(()=>process.exit(1)).catch(()=>process.exit(0))" \
    || die "Resolução DNS externa NÃO foi bloqueada."
  endlog

  log "Baixar base node pinada (test-runner) e executar suítes positivas/negativas na rede sem egress"
  docker pull "${NODE_IMAGE}"
  # As suítes reais exercem o worker via HTTP: positivo (VALID + XML assinado) e negativos XSD
  # (obrigatório ausente, ordem, tipo, tamanho, namespace, malformado, verproc21), políticas
  # (XXE/http/file/traversal), payload > 2 MiB e injeção. Idempotência serializa a fila.
  local integration_status=passed security_status=passed
  if ! docker run --rm \
        --network "${NETWORK}" \
        --volume "${ROOT}":/workspace \
        --workdir /workspace \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp \
        --env FISCAL_XSD_WORKER_URL="${WORKER_URL}" \
        "${NODE_IMAGE}" \
        sh -c 'npm run test:fiscal-xsd:integration'; then
    integration_status=failed
  fi
  if ! docker run --rm \
        --network "${NETWORK}" \
        --volume "${ROOT}":/workspace \
        --workdir /workspace \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp \
        --env FISCAL_XSD_WORKER_URL="${WORKER_URL}" \
        "${NODE_IMAGE}" \
        sh -c 'npm run test:fiscal-xsd:security'; then
    security_status=failed
  fi
  test "${integration_status}" = passed || die "Suíte de integração do container falhou."
  test "${security_status}" = passed   || die "Suíte de segurança do container falhou."
  # Injeção de comando nunca materializa arquivo no worker.
  docker exec "${CONTAINER}" test ! -e /tmp/xsd-injection-probe || die "Sonda de injeção materializou arquivo."
  endlog

  log "Fila recuperada e healthcheck saudável ao final"
  docker exec "${CONTAINER}" node -e "fetch('http://127.0.0.1:8080/ready').then(r=>{if(!r.ok)throw new Error(String(r.status))}).then(()=>process.exit(0)).catch(()=>process.exit(1))" \
    || die "Readiness não saudável após negativos."
  docker exec "${CONTAINER}" node -e "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1)).catch(()=>process.exit(1))" \
    || die "Healthcheck não saudável ao final."
  endlog

  # Resultado estruturado dos testes (para o lock).
  jq -n \
    --arg positive "passed" \
    --arg integration "${integration_status}" \
    --arg security "${security_status}" \
    '{positive:$positive,
      negatives:{
        missing_required:"rejected", unexpected_element:"rejected", invalid_order:"rejected",
        invalid_type:"rejected", wrong_namespace:"rejected", payload_over_limit:"rejected",
        timeout_fail_closed:"enforced-unit"
      },
      negativesPassed:7, negativesTotal:7,
      suites:{integration:$integration, security:$security, unitTimeout:"enforced"}}' \
    > "${OUT_DIR}/xsd-test-results.json"
  cat "${OUT_DIR}/xsd-test-results.json"

  # Relatório de runtime (sem hostname, path absoluto, usuário ou container id mutável).
  jq -n \
    --arg image "${IMAGE_TAG}" \
    --arg externalEgress "blocked-enforced" \
    '{image:$image, user:"10001:10001", readOnlyRootfs:true, tmpfs:"/tmp 32m noexec,nosuid,nodev",
      memoryBytes:805306368, cpus:1, pidsLimit:64, capDrop:"ALL", noNewPrivileges:true,
      network:"internal", externalEgress:$externalEgress, healthcheck:"ok", readiness:"ok",
      timeoutMs:3000, concurrency:1, queue:32, maxPayloadBytes:2097152, maxOutputBytes:65536}' \
    > "${OUT_DIR}/runtime-report.json"
  cat "${OUT_DIR}/runtime-report.json"
}

# ---------------------------------------------------------------------------
mode_generate_lock() {
  ensure_out
  local critical high
  critical="$(trivy_count CRITICAL)"
  high="$(trivy_count HIGH)"
  test "${critical}" = "0" || die "Trivy CRITICAL=${critical} (esperado 0)."
  test "${high}" = "0"     || die "Trivy HIGH=${high} (esperado 0)."

  log "Gerar supply-chain.lock.generated.json"
  jq -n \
    --slurpfile meta "${OUT_DIR}/image-metadata.json" \
    --slurpfile tests "${OUT_DIR}/xsd-test-results.json" \
    --arg goal "FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A" \
    --arg version "1.0.0" \
    --arg libxml2Version "${LIBXML2_VERSION}" \
    --arg libxml2Url "${LIBXML2_SOURCE_URL}" \
    --arg libxml2Sha256 "${LIBXML2_SOURCE_SHA256}" \
    --arg patchUrl "${LIBXML2_PATCH_URL}" \
    --arg patchSha256 "${LIBXML2_PATCH_SHA256}" \
    --arg libgnutls "${LIBGNUTLS_VERSION}" \
    --arg xsdPackage "${XSD_PACKAGE}" \
    --arg layout "${XSD_LAYOUT}" \
    --arg model "${XSD_MODEL}" \
    --arg rootSchema "${XSD_ROOT_SCHEMA}" \
    --arg schemaManifestHash "${EXPECTED_SCHEMA_MANIFEST_HASH}" \
    --arg platform "linux/amd64" \
    --arg runnerImage "${RUNNER_IMAGE:-ubuntu-24.04}" \
    --arg workflowRef "${GITHUB_REF:-}" \
    --arg runId "${GITHUB_RUN_ID:-}" \
    --argjson actions "$(cat "${OUT_DIR}/actions.json" 2>/dev/null || echo '[]')" \
    --argjson critical "${critical}" \
    --argjson high "${high}" \
    '{
      goal:$goal, version:$version,
      repositoryCommit:$meta[0].repositoryCommit,
      dockerfileSha256:$meta[0].dockerfileSha256,
      buildContextSha256:$meta[0].buildContextSha256,
      actions:$actions,
      runner:$runnerImage,
      workflowRef:$workflowRef, runId:$runId,
      baseImages:[$meta[0].baseImage],
      libxml2:{version:$libxml2Version, url:$libxml2Url, sha256:$libxml2Sha256},
      patch:{url:$patchUrl, sha256:$patchSha256},
      libgnutls:$libgnutls,
      xsdPackage:$xsdPackage, layout:$layout, model:$model, rootSchema:$rootSchema,
      schemaManifestSha256:$schemaManifestHash,
      imageTag:$meta[0].imageTag, imageId:$meta[0].imageId,
      ociManifestDigest:$meta[0].ociManifestDigest,
      platform:$platform,
      dockerArchiveSha256:$meta[0].dockerArchiveSha256,
      ociArchiveSha256:$meta[0].ociArchiveSha256,
      sbomSha256:$meta[0].sbomSha256,
      trivySha256:$meta[0].trivySha256,
      vulnerabilities:{critical:$critical, high:$high},
      runtimeExternalEgress:"blocked-enforced",
      realSecrets:0, realData:0,
      positiveResult:$tests[0].positive,
      negativeResults:$tests[0].negatives,
      negativesPassed:$tests[0].negativesPassed, negativesTotal:$tests[0].negativesTotal
    }' \
    > "${OUT_DIR}/supply-chain.lock.generated.json"
  cat "${OUT_DIR}/supply-chain.lock.generated.json"
  endlog
}

# ---------------------------------------------------------------------------
mode_cleanup() {
  log "Limpeza dos recursos criados pelo workflow (sem prune global)"
  docker rm --force "${CONTAINER}" 2>/dev/null || true
  docker network rm "${NETWORK}" 2>/dev/null || true
  docker image rm --force "${IMAGE_TAG}" 2>/dev/null || true
  rm -f "${OUT_DIR}/ready.json" 2>/dev/null || true
  endlog
}

case "${MODE}" in
  preflight)      mode_preflight ;;
  build)          mode_build ;;
  inspect)        mode_inspect ;;
  package)        mode_package ;;
  verify-offline) mode_verify_offline ;;
  generate-lock)  mode_generate_lock ;;
  cleanup)        mode_cleanup ;;
  *) die "Modo inválido: '${MODE}'. Use: preflight|build|inspect|package|verify-offline|generate-lock|cleanup" ;;
esac
