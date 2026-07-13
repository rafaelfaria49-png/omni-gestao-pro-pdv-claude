# Pesquisa oficial de validação XSD da NFC-e — GOAL-002

## 1. Escopo e estado da pesquisa

- GOAL: `FISCAL-XSD-OFFICIAL-VALIDATION-002`.
- Fase: pesquisa, diagnóstico e decisão arquitetural; sem implementação.
- Branch: `fiscal/goal-002-xsd-official`.
- HEAD base: `b5289456fed35732dff54ab3f30974dc848065c8`.
- Base remota confirmada: `origin/main` apontava para o mesmo commit no pre-flight de 13/07/2026.
- Data de captura das fontes e dos arquivos: 13/07/2026, fuso `America/Sao_Paulo`.
- Modelo fiscal em escopo: NFC-e, modelo `65`, leiaute `4.00`.

Este ciclo não adiciona schemas ao repositório, não instala biblioteca e não altera código. O pacote oficial foi baixado exclusivamente para diretório temporário, inspecionado, hasheado e compilado para verificar o fechamento das dependências.

## 2. Diagnóstico do repositório

### 2.1 No-op localizado

O placeholder está em `lib/fiscal/dry-run/dry-run-validation.ts:72`, na função `validarXsd(_xmlAssinado, options)`.

Comportamento atual:

1. o argumento `_xmlAssinado` não é lido;
2. sem `options.xsd`, retorna `status: "xsd_nao_configurado"`;
3. com qualquer string XSD não vazia, retorna `status: "xsd_presente_sem_validador"` e `violacoes: []`;
4. o comentário em `lib/fiscal/dry-run/dry-run-validation.ts:82` declara que o validador real libxml/XSD ainda não foi implementado.

O chamador está em `lib/fiscal/dry-run/dry-run-pipeline.ts:191`. A API atual injeta um único `xsd?: string` em `lib/fiscal/dry-run/dry-run-pipeline.ts:42`, desenho insuficiente para o pacote oficial, que possui um entrypoint e quatro dependências locais.

Os estados já previstos em `lib/fiscal/dry-run/dry-run.types.ts:34-37` são:

- `xsd_nao_configurado`;
- `xsd_presente_sem_validador`;
- `xsd_ok`;
- `xsd_invalido`.

### 2.2 Testes que hoje aceitam o placeholder

- `lib/fiscal/dry-run/dry-run.test.ts:38`: o fluxo comum espera `xsd_nao_configurado`, etapa pendente e readiness falso.
- `lib/fiscal/dry-run/dry-run.test.ts:86-95`: o bloco dedicado ao placeholder verifica que a ausência de XSD retorna `xsd_nao_configurado` e que a string mínima `<xs:schema/>` retorna `xsd_presente_sem_validador`, sem tentar validar o XML.
- `lib/fiscal/pipeline/fiscal-pipeline.test.ts:29`: registra o dry-run como pendente por ausência de XSD, mas ainda espera sucesso do provider de emissão; o teste evidencia que o gate XSD ainda não é efetivo no pipeline.

### 2.3 Scripts reais identificados

- testes: `npm test` → `vitest run`;
- TypeScript: `npx tsc --noEmit`;
- ESLint: `npm run lint` → `eslint .`;
- build: `npm run build` → `prisma generate && next build --webpack`.

O projeto declara Node.js `20.x`. O build inclui Prisma, mas Prisma e banco estão fora do escopo desta pesquisa e não foram acionados.

### 2.4 ADRs propostos relacionados

Há uma divergência de referência nos documentos de continuação:

- `ADR-P01 / ADR-0010` trata de matriz de autoridade tributária por jurisdição;
- a proveniência, o versionamento e o processo de atualização dos XSDs são tratados em `ADR-P02 / ADR-0011`.

Assim, `ADR-P02` é a proposta diretamente aplicável ao GOAL-002. Nenhuma ADR definitiva foi criada ou alterada nesta fase.

## 3. Pesquisa oficial

### 3.1 Fonte de autoridade

Fonte primária: [Portal Nacional da NF-e — Esquemas XML](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D).

Na captura de 13/07/2026, a entrada mais recente exibida ao vivo pelo Portal era:

> Schemas XML NF-e - 010e v.1.02 - NT 2025.002 v.1.40, NT 2026.002 v.1.0 e NT 2026.003 v.1.0 — publicado em 10/07/2026.

Arquivo oficial capturado: [PL_010e_v1.02.zip](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=akib2DRpJN4%3D).

O índice de busca do Portal ainda apresentava resultado anterior `010e v.1.01`, de 26/06/2026. A decisão desta pesquisa usa a listagem ao vivo e o ZIP servido diretamente pelo Portal em 13/07/2026, que identificam `010e v.1.02`.

### 3.2 Pacote aplicável à NFC-e modelo 65

- Nome do ZIP servido: `PL_010e_v1.02.zip`.
- Diretório interno: `PL_010e_v1.02/NFe/`.
- Versão do pacote: `010e v1.02`.
- Leiaute do documento: `4.00`.
- Entry point para o documento `<NFe>`: `nfe_v4.00.xsd`.

O pacote é compartilhado entre NF-e modelo 55 e NFC-e modelo 65. Em `leiauteNFe_v4.00.xsd`, o tipo do campo `mod` admite os valores `55` e `65`; portanto, o mesmo grafo oficial valida a NFC-e quando o documento declara `<mod>65</mod>`.

Hashes, tamanhos e grafo completo estão em `docs/fiscal/FISCAL_XSD_MANIFEST_001.md`.

### 3.3 Notas Técnicas relacionadas

O rótulo oficial do pacote `010e v1.02` relaciona expressamente:

- [NT 2025.002 — RTC, versão 1.40](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?AspxAutoDetectCookieSupport=1&conteudo=lWEyoabukyw%3D);
- [NT 2026.002, versão 1.00](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?AspxAutoDetectCookieSupport=1&conteudo=3v7VFvaogiA%3D);
- [NT 2026.003, versão 1.00](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?AspxAutoDetectCookieSupport=1&conteudo=2YdaBTIql%2Bk%3D).

Fonte de conferência: [Portal Nacional da NF-e — Notas Técnicas](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=6WfrpZYE4Ik%3D).

O índice de Notas Técnicas consultado também lista a NT 2025.002 v1.50, publicada em 03/06/2026. Isso não muda o identificador do ZIP mais recente servido na página de schemas, cujo próprio rótulo cita v1.40. Na fase de implementação, regras de negócio devem considerar a versão normativa mais recente da NT, enquanto a validação estrutural deve permanecer presa ao pacote XSD oficial identificado e aos seus hashes.

### 3.4 Limites relevantes encontrados no XSD oficial

Os limites abaixo foram extraídos do pacote `010e v1.02`; são exemplos de restrições estruturais que hoje não são exercitadas pelo no-op:

| Campo/tipo | Restrição XSD observada |
|---|---|
| `cNF` | exatamente 8 dígitos |
| `natOp` | 1 a 60 caracteres |
| `mod` | enumeração `55` ou `65` |
| `serie` | `0` ou número de 1 a 3 dígitos sem zero à esquerda |
| `nNF` | 1 a 9 dígitos, começando entre 1 e 9 |
| `dhEmi` | data/hora com timezone no padrão estrito do schema |
| `cMunFG`, `cMun` | exatamente 7 dígitos |
| `verProc` | 1 a 20 caracteres |
| `CNPJ` | 14 posições; base de 12 caracteres `[0-9A-Z]` e 2 dígitos verificadores |
| `CPF` | exatamente 11 dígitos |
| `xNome` | tipicamente 2 a 60 caracteres, conforme o tipo/contexto |
| `IE` | `ISENTO` ou 2 a 14 dígitos |
| `xLgr`, `xBairro` | 2 a 60 caracteres |
| `CEP` | exatamente 8 dígitos |
| `fone` | 6 a 14 dígitos |
| `cProd` | 1 a 60 caracteres |
| `xProd` | 1 a 120 caracteres |
| `cEAN`, `cEANTrib` | `SEM GTIN`, vazio ou GTIN de 8, 12, 13 ou 14 dígitos |
| `NCM` | 2 ou 8 dígitos |
| `CEST` | exatamente 7 dígitos |
| `CFOP` | 4 dígitos, iniciado por 1, 2, 3, 5, 6 ou 7 |
| `uCom`, `uTrib` | 1 a 6 caracteres |
| `qCom`, `qTrib` | até 11 inteiros e 4 casas decimais |
| `vUnCom`, `vUnTrib` | até 11 inteiros e 10 casas decimais |
| `vProd`, `vPag` | até 13 inteiros e exatamente 2 casas decimais |
| `tPag` | exatamente 2 dígitos |

Esta tabela não substitui o schema nem pretende catalogar todas as facets. A autoridade executável deve ser o conjunto XSD versionado e íntegro.

## 4. Impactos já visíveis no XML atual

Sem executar uma implementação, a inspeção estática revelou pontos que o validador real deverá expor:

1. `lib/fiscal/xml/nfce-xml.types.ts:15` define `NFCE_VER_PROC = "OmniGestao-Fiscal/1.0"`, com 21 caracteres, acima do máximo oficial de 20;
2. o builder usa `numero = 0` quando não há numeração fiscal (`lib/fiscal/xml/nfce-xml-builder.ts:356`), enquanto `nNF` não admite zero; o código já marca essa situação como placeholder e pendência, mas o XSD deve efetivamente rejeitá-la;
3. vários campos textuais são serializados sem uma checagem central das extensões máximas do XSD, por exemplo `cProd`, `xProd`, `natOp`, nomes e endereço;
4. o schema vigente já aceita a base alfanumérica do CNPJ; validações locais que assumam apenas dígitos podem divergir da evolução oficial;
5. a API atual recebe uma única string XSD, mas o pacote depende de cinco arquivos com resolução relativa.

Nenhum desses pontos foi corrigido neste ciclo.

## 5. Requisitos arquiteturais derivados

Uma implementação aceitável deve:

- carregar `nfe_v4.00.xsd` e as quatro dependências pelos nomes oficiais;
- funcionar sem rede durante a validação;
- conferir a integridade dos arquivos locais contra o manifesto SHA-256;
- impedir resolução de DTD, entidade externa ou schema fora do conjunto permitido;
- compilar/cachear o schema com segurança e validar o XML assinado completo;
- produzir erros normalizados com mensagem, arquivo/schema quando disponível, linha e coluna;
- diferenciar schema ausente/corrompido, falha técnica do motor e XML fiscal inválido;
- limitar tamanho de entrada e consumo de memória;
- operar no runtime Node.js, não no Edge, quando executado na Vercel;
- ter testes com XML válido, XML inválido por facet, import ausente, hash divergente, XXE/DOCTYPE e erro de empacotamento.

## 6. Recomendação e decisão pendente

A comparação detalhada está em `docs/fiscal/FISCAL_XSD_VALIDATOR_OPTIONS_001.md`.

Recomendação: seguir, na próxima fase e somente após aprovação humana, com a opção A — biblioteca Node `xmllint-wasm`, usando libxml2 em WebAssembly e preload explícito dos cinco schemas. Antes de integrar ao pipeline, executar um spike eliminatório que comprove:

1. compilação do pacote oficial completo;
2. resultado correto para amostras válidas e inválidas;
3. bloqueio de acesso externo;
4. empacotamento do worker, do `.wasm` e dos XSDs no build Next.js/Vercel;
5. execução em Windows, Linux e CI com Node 20;
6. memória, cold start e mensagens de erro aceitáveis.

Se o spike falhar em empacotamento ou previsibilidade, a opção B (`xmllint` nativo isolado) é o fallback para CI/self-hosted, não para a função Vercel padrão. A opção C (helper Java/Xerces) só se justifica em infraestrutura separada e controlada.

### Decisão necessária de Rafael

Autorizar ou rejeitar a realização do spike da opção A na próxima fase, incluindo a futura inclusão versionada dos cinco XSDs oficiais e de uma dependência Node, mantendo a implementação bloqueada até essa decisão.

## 7. Confirmação de escopo

- Código alterado: não.
- Dependência instalada: não.
- Lockfile alterado: não.
- XSD adicionado ao repositório: não.
- ADR definitiva criada: não.
- Banco, Prisma, emissão, certificado ou segredo acessado: não.
