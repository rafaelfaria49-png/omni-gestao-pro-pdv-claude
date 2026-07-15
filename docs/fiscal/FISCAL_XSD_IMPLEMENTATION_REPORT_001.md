# Implementação do worker XSD B2

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-OFFICIAL-VALIDATION-002` |
| Fase | implementação definitiva B2 |
| Base | `83081c6ae8c3ff7b52f5ecc33fd80e12101b995f` |
| Branch | `fiscal/goal-002-xsd-worker-implementation` |
| Commit de implementação | `775322a` |
| ADR | ADR-0010 respeitada |
| Estado | entregue na branch; integração/main e homologação externa pendentes |

## Componentes e supply chain

- worker server-only `workers/fiscal-xsd`, sem rota pública;
- base `node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0`;
- libxml2/xmllint 2.15.3; source SHA-256 `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07`;
- patch upstream `d3352554e4c1f052b914cda7b415d06b7eab5dfa`; SHA-256 `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c`;
- pacote oficial `PL_010e_v1.02`, leiaute 4.00, modelo 65, cinco XSDs locais;
- HTTP interno privado + adapter injetável; sem Vercel, PATH, fallback ou segredo;
- `validarXsd` real/fail-closed antes da assinatura; `verProc` padrão reduzido a 20 caracteres;
- 24 cenários sintéticos sem dados ou certificados reais.

## Controles

`spawn` sem shell, caminho absoluto, argumentos fixos, stdin, `--noout`, `--nonet`, `--nocatalogs`
e `--schema`. DTD/ENTITY, schema hint, HTTP/HTTPS, `file://`, caminho absoluto, traversal e symlink
são bloqueados. Limites: payload 2 MiB, saída 64 KiB, timeout 3 s, concorrência 1, backpressure 32.

Container: UID/GID 10001; raiz read-only; `/tmp` tmpfs 32 MiB; memória 768 MiB; 1 CPU; 64 PIDs;
sem capabilities; `no-new-privileges`; rede Docker `internal`. A CI prova egress negativo, inspeciona
limites, gera SBOM SPDX e executa Trivy bloqueando CRITICAL. Não publica imagem nem faz deploy.

`CVE-2026-11979` foi reavaliada em 14/07/2026: é disputada e limitada a `xmlcatalog --shell`, caminho
ausente porque a imagem/contrato executam somente `xmllint` com argumentos fixos. Nova CVE crítica
ou alcançável bloqueia rebuild/rollout.

## Evidência local inicial

| Comando | Resultado |
|---|---|
| `npm ci --ignore-scripts` | OK; 866 pacotes; audit legado: 18 achados fora do delta |
| `npx prisma generate` | OK; cliente ignorado, sem DB/migration/schema |
| `npm run fiscal:xsd:verify-hashes` | OK; manifesto + 5 XSDs |
| `npm run test:fiscal-xsd:unit` | OK; 40 passed, 1 symlink reservado ao Linux |
| `npx tsc --noEmit --incremental false` | OK |
| ESLint fiscal focado | OK |
| `npm test` | OK; 2.395 passed, 2 expected fail, 17 skipped |
| `npm run build` | OK; Next 16.2.0, 104 páginas estáticas |
| integração/segurança local | 10/6 testes definidos e corretamente skipped sem container |
| recaptura source/patch + `git apply --check` | OK; hashes oficiais e patch aplicável sobre 2.15.3 |

Docker não existe na estação Windows. Build/execução real, hash binário, integração, zero egress,
SBOM e scanner são executados no runner Linux da workflow focada e serão registrados após o push.

`dry-run-pipeline.ts` e `fiscal-pipeline.ts` foram alterações adicionais inevitáveis para adaptar o
caller síncrono ao contrato assíncrono e impedir avanço sem `xsd_ok`. O teste do builder mudou apenas
para fixar `verProc`. Não houve banco, migration, schema Prisma, provider SEFAZ, fila fiscal geral,
certificado, emissão, estado de venda ou domínio não fiscal alterado.

O GOAL não está encerrado na `main`: aguarda CI, integração e auditoria humana. Não há homologação
externa (N6=0) nem produção (N7=0). GOAL-003 não foi iniciado.

Riscos remanescentes antes de qualquer hospedagem: escolher a camada de autenticação/autorização do
transporte interno, conectar uma fila persistente (a fila limitada desta fundação é somente local ao
processo), medir capacidade/SLO e definir provedor de container com egress negado por política.
