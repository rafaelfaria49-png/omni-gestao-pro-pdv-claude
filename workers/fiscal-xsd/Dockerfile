# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

FROM ${NODE_IMAGE} AS libxml2-builder
ARG LIBXML2_VERSION=2.15.3
ARG LIBXML2_SOURCE_SHA256=78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07
ARG LIBXML2_PATCH_SHA256=ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c
ARG LIBXML2_SOURCE_URL=https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.tar.xz
ARG LIBXML2_PATCH_URL=https://github.com/GNOME/libxml2/commit/d3352554e4c1f052b914cda7b415d06b7eab5dfa.patch

RUN apt-get update \
  && apt-get install --yes --no-install-recommends build-essential ca-certificates curl patch xz-utils \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN curl --fail --location --proto '=https' --tlsv1.2 --output libxml2.tar.xz "${LIBXML2_SOURCE_URL}" \
  && echo "${LIBXML2_SOURCE_SHA256}  libxml2.tar.xz" | sha256sum --check --strict \
  && curl --fail --location --proto '=https' --tlsv1.2 --output maxmem.patch "${LIBXML2_PATCH_URL}" \
  && echo "${LIBXML2_PATCH_SHA256}  maxmem.patch" | sha256sum --check --strict \
  && tar --extract --file libxml2.tar.xz \
  && cd "libxml2-${LIBXML2_VERSION}" \
  && patch --strip=1 --forward < ../maxmem.patch \
  && ./configure \
       --prefix=/opt/libxml2 \
       --disable-shared \
       --enable-static \
       --without-iconv \
       --without-lzma \
       --without-python \
       --without-readline \
       --without-zlib \
  && make --jobs=2 xmllint \
  && make install \
  && /opt/libxml2/bin/xmllint --version 2>&1 | grep --fixed-strings '21503' \
  && sha256sum /opt/libxml2/bin/xmllint | sed 's#  /opt/libxml2/bin/xmllint#  xmllint#' > /opt/libxml2/binary.sha256

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Omni Gestão Fiscal XSD Worker" \
      org.opencontainers.image.description="Validação offline NFC-e 4.00 com pacote oficial PL_010e_v1.02" \
      org.opencontainers.image.source="https://github.com/rafaelfariax/omni-gestao" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    FISCAL_XSD_HOST=0.0.0.0 \
    FISCAL_XSD_PORT=8080 \
    HOME=/tmp \
    TMPDIR=/tmp \
    PATH=/usr/local/bin:/usr/bin:/bin
# Correção de supply chain (Trivy HIGH/CRITICAL): atualiza EXCLUSIVAMENTE os pacotes
# Debian com CVE corrigido, em versões pinadas, sem dist-upgrade e sem tocar outros
# pacotes; índices apt removidos no mesmo layer.
#   - libgnutls30=3.7.9-2+deb12u7  → CVE-2026-33845, CVE-2026-42010 (CRITICAL, preservado)
#   - libcap2=1:2.66-4+deb12u3     → CVE-2026-4878 (HIGH). Versão corrigida do Bookworm
#                                     (substitui 1:2.66-4+deb12u2+b2). Atualização exclusiva,
#                                     sem dist-upgrade e sem wildcard de versão.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends --only-upgrade \
       libgnutls30=3.7.9-2+deb12u7 \
       libcap2=1:2.66-4+deb12u3 \
  && rm -rf /var/lib/apt/lists/*
# Hardening de superfície de ataque (Trivy HIGH): remover os gerenciadores de pacote
# não usados no runtime. O worker inicia apenas com `node /opt/fiscal-xsd/src/server.mjs`
# e importa somente módulos node:*; npm/npx/yarn/corepack não são necessários e carregam
# 12 CVEs HIGH herdados de /usr/local/lib/node_modules/npm/node_modules (cross-spawn,
# glob, minimatch, sigstore, tar). Remoção explícita por caminho conhecido; o binário
# node é preservado. Não atualiza npm e não executa npm install.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /usr/local/bin/corepack \
      /opt/yarn-v* \
  && node --version
# O PATH endurecido acima omite /usr/sbin — groupadd/useradd exigem caminho absoluto
# (ADR-0010: nenhuma dependência de binário implícito no PATH).
RUN /usr/sbin/groupadd --gid 10001 fiscal-xsd \
  && /usr/sbin/useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin fiscal-xsd \
  && mkdir --parents /opt/fiscal-xsd/bin /opt/fiscal-xsd/manifest /opt/fiscal-xsd/schemas/PL_010e_v1.02/NFe \
  && chown --recursive 10001:10001 /opt/fiscal-xsd
COPY --from=libxml2-builder --chown=10001:10001 /opt/libxml2/bin/xmllint /opt/fiscal-xsd/bin/xmllint
COPY --from=libxml2-builder --chown=10001:10001 /opt/libxml2/binary.sha256 /opt/fiscal-xsd/manifest/binary.sha256
COPY --chown=10001:10001 workers/fiscal-xsd/src/ /opt/fiscal-xsd/src/
COPY --chown=10001:10001 lib/fiscal/xsd/manifest.json lib/fiscal/xsd/manifest.sha256 /opt/fiscal-xsd/manifest/
COPY --chown=10001:10001 lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/ /opt/fiscal-xsd/schemas/PL_010e_v1.02/NFe/
WORKDIR /opt/fiscal-xsd
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "/opt/fiscal-xsd/src/healthcheck.mjs"]
ENTRYPOINT ["node", "/opt/fiscal-xsd/src/server.mjs"]
