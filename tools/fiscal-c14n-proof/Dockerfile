ARG JAVA_IMAGE=eclipse-temurin:17.0.13_11-jdk-jammy@sha256:292214e32a0a3032e7f1af0e22491e02452c1f5473ec1d96486958dd4b3a772a
ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

FROM ${JAVA_IMAGE} AS java
FROM ${NODE_IMAGE}

COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/java/openjdk/bin:${PATH}"

WORKDIR /workspace
USER node

CMD ["node", "scripts/fiscal/run-c14n-external-proof.mjs"]
