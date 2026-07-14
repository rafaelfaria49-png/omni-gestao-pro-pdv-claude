# Spike eliminatório `xmllint-wasm` — GOAL-002

## 1. Resultado executivo

- GOAL: `FISCAL-XSD-OFFICIAL-VALIDATION-002`.
- Fase: spike isolado, sem integração com emissão ou `validarXsd`.
- Branch: `fiscal/goal-002-xsd-wasm-spike`.
- HEAD base de `origin/main`: `b5289456fed35732dff54ab3f30974dc848065c8`.
- Pacote oficial: `PL_010e_v1.02.zip`, NFC-e modelo 65, leiaute 4.00.
- Motor avaliado: `xmllint-wasm@5.2.0`, versão exata.
- Classificação: **REJEITADA** para produção nesta versão.

O motor compilou e validou offline o grafo oficial completo, distinguiu XML inválido de falha de infraestrutura, passou no Node 20/Windows, sobreviveu ao tracing do Next.js e apresentou custo pequeno. A reprovação é exclusivamente de segurança: o pacote fixa libxml2 2.13.8, versão afetada por vulnerabilidades publicadas, inclusive CVE-2026-6732 no caminho de XSD e entidades internas e CVE-2025-6021 em rotina do parser. As barreiras do spike reduzem exposição, mas não substituem um motor corrigido.

## 2. Escopo implementado

O experimento está isolado em `lib/fiscal/xsd/xmllint-wasm-spike.ts`. Ele:

1. recebe XML como `string` ou `Uint8Array`;
2. limita a entrada a 2 MiB;
3. rejeita `DOCTYPE` e declarações `ENTITY` antes do motor;
4. confere o SHA-256 bruto oficial e aceita somente a variante LF documentada quando o Git normaliza CRLF;
5. aceita somente os quatro `schemaLocation` relativos do manifesto;
6. entrega o entrypoint e os quatro recursos dependentes em memória;
7. acrescenta `--nonet` ao `xmllint`;
8. limita o heap WASM a 256 páginas iniciais e 512 máximas;
9. normaliza e trunca mensagens, sem registrar o XML;
10. separa documento inválido de erro técnico por `XsdSpikeInfrastructureError`.

Não há import desse módulo por código de produção. `lib/fiscal/dry-run/dry-run-validation.ts:72` e seu no-op permanecem inalterados. Também não houve conexão a rota fiscal, emissão, provider, banco, Prisma, certificado ou segredo.

## 3. Casos exercitados

As fixtures são sintéticas, não contêm certificado ou identificador real e cobrem:

- NFC-e assinada estruturalmente válida;
- entrada UTF-8 em bytes;
- campo obrigatório ausente;
- tipo inválido;
- `xProd` com 121 caracteres;
- namespace incorreto;
- XML malformado;
- `verProc` com 20 caracteres aceito e 21 rejeitado;
- DTD externo e entidade interna bloqueados antes do motor;
- integridade divergente de XSD;
- XSD e WASM ausentes;
- falha do worker/motor;
- entrada acima de 2 MiB;
- repetição e quatro validações concorrentes;
- preload exato dos cinco schemas e argumento `--nonet`.

O resultado final dos testes isolados foi 21/21. Os testes relacionados de fiscal foram 54/54. A suíte completa, repetida em modo CI e com timeout adequado às varreduras globais, passou com 174 arquivos, 2.412 testes aprovados e 2 falhas esperadas.

## 4. Medições reproduzíveis

Ambiente: Windows x64, Node.js oficial `20.20.2`, `xmllint-wasm@5.2.0`.

| Medida | Resultado |
|---|---:|
| primeira validação | 126,06 ms |
| 10 validações quentes, média | 94,64 ms |
| mínimo/máximo quente | 81,54 / 122,94 ms |
| quatro validações concorrentes | 133,95 ms |
| RSS antes | 48.136.192 bytes |
| RSS após primeira validação | 71.499.776 bytes |
| delta RSS da primeira validação | 23.363.584 bytes |
| RSS ao final | 61.726.720 bytes |
| arquivo WASM | 778.732 bytes |
| cinco XSDs | 441.480 bytes |

O teste reproduzível está em `scripts/fiscal/xsd-wasm-spike-metrics.test.ts`. As medidas não são SLO de produção: foram obtidas em uma máquina de desenvolvimento e incluem criação de worker por chamada.

## 5. Compatibilidade e build

| Alvo | Evidência | Classificação |
|---|---|---|
| Windows x64 | testes, TypeScript e build real | comprovado |
| Node 20 | Node oficial 20.20.2, SHA-256 do ZIP verificado | comprovado |
| Next.js 16/webpack | `npm run build` concluído | comprovado localmente |
| Linux | WSL indisponível e Docker ausente | não comprovado |
| CI Linux | teste é portável, mas não executado em runner remoto | não comprovado |
| Vercel Node | NFT inclui os assets; nenhum deploy foi feito | parcialmente comprovado |
| Vercel Edge | usa Worker Threads e filesystem Node | incompatível |

O build de controle, sem tracing explícito, incluiu zero XSD e zero WASM. Por isso o spike adicionou uma sentinela em `outputFileTracingIncludes` da rota `/api/version`, sem importar ou executar o validador. O build seguinte produziu o manifesto NFT com os nove recursos esperados e hashes corretos. Na integração real, a regra deve ser movida para a função fiscal consumidora.

## 6. Comandos e resultados

```text
npm.cmd install --save-exact --ignore-scripts xmllint-wasm@5.2.0
# concluído; package.json e package-lock.json atualizados

node node_modules/vitest/vitest.mjs run \
  lib/fiscal/xsd/xmllint-wasm-spike.test.ts \
  scripts/fiscal/xsd-wasm-spike-metrics.test.ts
# 2 arquivos, 21 testes aprovados

CI=true node node_modules/vitest/vitest.mjs run --testTimeout=30000
# 174 arquivos; 2.412 aprovados; 2 expected fail

node node_modules/typescript/bin/tsc --noEmit --incremental false
# aprovado

npx eslint <arquivos do spike> next.config.mjs
# aprovado

npm run build
# aprovado no Node 20; Next.js 16/webpack

node scripts/fiscal/verify-xsd-wasm-packaging.mjs
# 109 entradas NFT; 9 assets esperados presentes e íntegros
```

A primeira suíte completa, com o timeout padrão de 5 s, teve três timeouts em testes que varrem o repositório e uma tentativa de atualização de snapshot bloqueada pelo sandbox. A repetição em modo CI, sem atualização e com 30 s, passou integralmente. Nenhuma alteração de snapshot entrou no Git.

## 7. Decisão e próximo passo

**Não integrar `xmllint-wasm@5.2.0` em produção.** Para reabrir a opção A, é necessário um release oficial ou fork auditável que embarque libxml2 corrigido para todas as vulnerabilidades aplicáveis — no mínimo uma versão fora das faixas publicadas para CVE-2025-6021 e CVE-2026-6732 —, repetir auditoria, testes, métricas e build em Windows e Linux/CI, e comprovar um deploy Vercel Node.

Se esse requisito não puder ser atendido, seguir para o spike da opção B (`xmllint` nativo isolado) em infraestrutura controlada. O placeholder e o pipeline permanecem bloqueados até decisão de Rafael.
