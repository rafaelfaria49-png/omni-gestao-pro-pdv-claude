# Relatório de empacotamento XSD/WASM — GOAL-002

## 1. Objetivo e ambiente

Verificar se Next.js 16 com webpack inclui no artefato serverless o worker, o módulo WASM e os cinco XSDs oficiais, sem conectar o spike a uma rota fiscal.

- Windows x64;
- Node.js oficial 20.20.2;
- Next.js 16.2.0;
- webpack, por `npm run build`;
- `xmllint-wasm@5.2.0`;
- pacote `PL_010e_v1.02`.

## 2. Build de controle

O primeiro build, sem configuração de tracing e sem import de produção, foi aprovado, mas a inspeção encontrou:

- 0 arquivos `.wasm` em `.next/server`;
- 0 XSDs oficiais em `.next/server`;
- 0 referências aos assets nos manifestos NFT.

Isso demonstra que apenas versionar o pacote e usar caminhos dinâmicos com `process.cwd()` não basta para o empacotamento serverless.

## 3. Sentinela de tracing

Foi adicionada uma regra temporária em `next.config.mjs`, `outputFileTracingIncludes["/api/version"]`, com:

```text
./lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/*.xsd
./node_modules/xmllint-wasm/index-node.js
./node_modules/xmllint-wasm/xmllint-node.js
./node_modules/xmllint-wasm/xmllint.wasm
./node_modules/xmllint-wasm/package.json
```

A rota serve apenas como sentinela de build: nenhum import ou execução foi introduzido. Quando houver uma implementação aprovada, a regra deve ser movida para a rota/função fiscal consumidora e a sentinela removida.

## 4. Resultado após tracing

O build no Node 20 foi aprovado. `scripts/fiscal/verify-xsd-wasm-packaging.mjs` leu `.next/server/app/api/version/route.js.nft.json`, encontrou 109 entradas e confirmou existência e integridade de nove recursos:

- cinco XSDs oficiais;
- `index-node.js`;
- `xmllint-node.js`;
- `xmllint.wasm`;
- `package.json` do wrapper.

O verificador confere os hashes conhecidos dos XSDs e do WASM. A pasta `.next/server` não contém cópias físicas desses arquivos e não há `.next/standalone`, pois o projeto não usa `output: "standalone"`; no modelo NFT, a lista de tracing é a evidência usada pelo empacotador para copiar dependências da função.

## 5. Tamanho e impacto

| Componente | Bytes |
|---|---:|
| WASM | 778.732 |
| XSDs | 441.480 |
| total mínimo de assets binários/documentais | 1.220.212 |

O total exclui o JavaScript do wrapper e overhead do bundle. O tamanho é pequeno frente a um runtime serverless típico, mas a aceitação final depende do limite vigente da plataforma no momento do deploy.

## 6. Matriz de comprovação

| Item | Resultado |
|---|---|
| build Next.js local/Windows/Node 20 | aprovado |
| tracing dos nove recursos | aprovado |
| hashes após tracing | aprovados |
| execução offline do worker | aprovada em testes locais |
| Linux/CI | não executado |
| deploy Vercel Node | não executado |
| Vercel Edge | incompatível |

Conclusão de empacotamento: **tecnicamente viável com tracing explícito**, ainda não comprovado em deploy Vercel real. Esta conclusão não supera a reprovação de segurança do motor embutido.
