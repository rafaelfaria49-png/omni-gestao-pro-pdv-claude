# Comparação de opções de validador XSD — GOAL-002

## 1. Premissas

O motor precisa validar XSD 1.0, resolver `xs:include` e `xs:import` do pacote oficial `PL_010e_v1.02`, operar totalmente offline e produzir diagnóstico útil. O destino do projeto inclui desenvolvimento Windows, CI Linux, Node.js 20 e build Next.js com webpack para Vercel.

Esta é uma recomendação de pesquisa, não uma ADR definitiva e não uma autorização para instalar dependências.

## 2. Opções comparadas

### Opção A — biblioteca Node em processo: `xmllint-wasm`

Versão observada na pesquisa de 13/07/2026: `5.2.0`, licença MIT, sem dependências npm declaradas. O projeto empacota o `xmllint`/libxml2 em WebAssembly, usa Worker Threads no Node e documenta preload explícito para arquivos referenciados por `xsd:import` e `xsd:include`.

Fontes primárias:

- [repositório oficial `noppa/xmllint-wasm`](https://github.com/noppa/xmllint-wasm);
- [documentação oficial do pacote npm](https://www.npmjs.com/package/xmllint-wasm);
- [documentação do libxml2](https://gnome.pages.gitlab.gnome.org/libxml2/).

Proposta de uso futuro: passar `nfe_v4.00.xsd` como schema principal e os quatro arquivos restantes como preload, todos lidos do pacote versionado e verificados por hash antes da compilação.

### Opção B — CLI nativa isolada: `xmllint`

Executar processo filho com o binário oficial do libxml2, equivalente conceitualmente a:

```text
xmllint --noout --nonet --schema nfe_v4.00.xsd documento.xml
```

Fonte primária: [manual oficial do `xmllint`](https://gnome.pages.gitlab.gnome.org/libxml2/xmllint.html). O libxml2 é distribuído sob licença MIT.

O comando oferece códigos de saída distintos para documento inválido, XML malformado e erro de compilação do schema, além de mensagens em `stderr`.

### Opção C — serviço/processo auxiliar local: Java JAXP/Xerces

Um helper separado receberia XML por `stdin`/IPC ou HTTP local, compilaria o pacote com `SchemaFactory`/Xerces e devolveria um resultado estruturado. A API padrão Java declara suporte obrigatório a W3C XML Schema 1.0.

Fontes primárias:

- [Java `SchemaFactory`](https://docs.oracle.com/en/java/javase/11/docs/api/java.xml/javax/xml/validation/SchemaFactory.html);
- [Apache Xerces2-J](https://xerces.apache.org/xerces2-j/);
- [recursos de validação do Xerces2-J](https://xerces.apache.org/xerces2-j/features.html).

O Xerces2-J 2.12.2 é publicado sob Apache License 2.0. A licença da distribuição JRE escolhida também precisaria ser analisada.

## 3. Matriz comparativa

| Critério | A — Node/WASM | B — `xmllint` CLI | C — helper Java/Xerces |
|---|---|---|---|
| XSD 1.0 | Sim, via libxml2 | Sim, via libxml2 | Sim, via JAXP/Xerces |
| Imports/includes | Sim, com preload nominal | Sim, por resolução relativa/catálogo | Sim, com `LSResourceResolver`/catálogo |
| Offline | Natural: arquivos fornecidos em memória; a biblioteca documenta que não busca dependências | Sim com arquivos locais e rede bloqueada; `--nonet` reforça versões anteriores do libxml2 | Sim, se acesso externo for explicitamente desativado e o resolver usar allowlist |
| Windows | Mesma dependência JS/WASM; sem toolchain nativo em runtime | Exige distribuir/instalar binário Windows compatível | Exige JRE e helper compatíveis |
| Linux/CI | Portável com Node 20 | Excelente quando a imagem fixa o pacote/binário | Bom quando a imagem fixa JRE/JAR |
| Vercel Node | Possível, sujeito a prova de bundle do worker/`.wasm` e dos XSDs | Frágil: binário nativo precisa ser empacotado para o runtime correto | Inadequado ao padrão: JRE/helper aumenta muito o bundle e não há sidecar persistente |
| Vercel Edge | Não: usa APIs Node/Worker Threads | Não | Não |
| Dependência nativa | Não no host; WebAssembly pré-compilado | Sim, binário e bibliotecas do SO | Sim, runtime Java/processo adicional |
| Impacto no bundle | Documentação do projeto informa cerca de 860 KB para wrapper + WASM, além dos XSDs | Binário/libxml2 adicionados ao artefato da função | JRE/JAR ou serviço separado; maior impacto operacional |
| Isolamento de falha | Worker Thread evita que `process.exit` do wrapper derrube o processo principal | Processo filho fornece isolamento forte | Processo/serviço fornece isolamento forte |
| Mensagens de erro | Estruturadas parcialmente: mensagem, arquivo e linha quando reconhecidos, mais saída bruta | Texto em `stderr`, arquivo/linha e códigos de saída; exige normalizador | `SAXParseException` permite linha/coluna; contrato precisa ser construído |
| Segurança | Sem resolução automática de dependências; ainda requer rejeitar DOCTYPE/XXE, limites e verificação de hash | Executar sem shell, argumentos fixos, `--nonet`, diretório fechado, limites/timeout | Desativar DTD/schema externo, resolver fechado, autenticar IPC, limites/timeout |
| Manutenção | Wrapper comunitário ativo sobre libxml2; acompanhar CVEs tanto do wrapper quanto do libxml2 embutido | libxml2 maduro; atualização do binário é responsabilidade da imagem/deploy | Xerces maduro e estável, mas adiciona stack Java e atualização própria |
| Licença | MIT (wrapper e libxml2) | MIT | Apache 2.0 para Xerces; JRE conforme distribuição |
| Previsibilidade | Alta após comprovar asset tracing e memória no build real | Alta em container/self-hosted com imagem imutável; baixa na Vercel sem controle da imagem | Alta em serviço dedicado; baixa como subprocesso improvisado em serverless |

## 4. Segurança mínima comum

Independentemente do motor:

1. rejeitar `DOCTYPE` e entidades externas antes da validação;
2. não habilitar substituição/expansão de entidades;
3. resolver apenas os quatro nomes dependentes do manifesto;
4. nunca buscar schema por HTTP durante a validação;
5. verificar SHA-256 de todos os XSDs antes de compilar;
6. impor limite de bytes, timeout e orçamento de memória;
7. não incluir o XML fiscal integral em logs; normalizar mensagens sem dados sensíveis;
8. separar `xml_invalido` de erro técnico/de integridade do validador;
9. fixar versões e acompanhar avisos de segurança do motor;
10. testar XML malformado, entity expansion, path traversal e import ausente.

## 5. Vercel e CI

A [documentação oficial de runtimes da Vercel](https://vercel.com/docs/functions/runtimes) informa que a função Node é empacotada com suas dependências, executa em microVM e possui filesystem somente leitura, com `/tmp` gravável. O [runtime Node.js](https://vercel.com/docs/functions/runtimes/node-js) oferece as APIs Node, mas o [Edge runtime](https://vercel.com/docs/functions/runtimes/edge) não oferece filesystem nem APIs nativas Node equivalentes.

Consequências:

- os cinco XSDs, o worker e o `.wasm` precisam estar presentes no bundle de cada função que validar NFC-e;
- os schemas devem ser lidos do bundle somente leitura; não devem ser baixados para `/tmp` em produção;
- o build usa Next.js/webpack, portanto asset tracing precisa ser testado no artefato produzido, não apenas no `next dev`;
- a opção A cabe com folga no limite padrão de bundle, mas tamanho não garante inclusão correta dos assets;
- a opção B depende de um executável compatível com o Linux de produção, permissões de execução e bibliotecas corretas;
- a opção C não pode pressupor sidecar persistente dentro de uma função Vercel.

No CI, a matriz mínima proposta para a próxima fase é Windows + Node 20 e Linux + Node 20. Deve executar testes unitários, compilação real do pacote XSD, TypeScript, ESLint e build Next.js. Um teste pós-build deve abrir o artefato e confirmar a presença/execução do worker, `.wasm` e cinco XSDs sem rede.

## 6. Vantagens e riscos por opção

### A — Node/WASM

Vantagens:

- mesma interface TypeScript e mesmo artefato entre Windows e Linux;
- sem instalação de libxml2 ou Java no host;
- preload explícito combina com o manifesto fechado e offline;
- mensagens já têm estrutura parcial;
- menor impacto operacional e de bundle entre as opções avaliadas.

Riscos:

- projeto wrapper comunitário, embora baseado em libxml2 maduro;
- CVEs do libxml2 ficam presos à versão embutida até atualização do pacote;
- Worker Thread e arquivo `.wasm` podem exigir configuração de tracing/bundle no Next/Vercel;
- consumo de memória WebAssembly e cold start precisam ser medidos;
- mensagens ainda exigem normalização estável para o domínio fiscal.

### B — CLI nativa

Vantagens:

- ferramenta madura, bem conhecida e diretamente documentada pelo libxml2;
- isolamento em processo e códigos de saída claros;
- ótima previsibilidade em container Linux imutável;
- boa ferramenta de referência independente para testes diferenciais no CI.

Riscos:

- distribuição distinta para Windows e Linux;
- empacotamento e permissões do binário na Vercel são frágeis;
- `child_process` aumenta superfície operacional, timeout e gestão de arquivos temporários;
- parsing de `stderr` pode variar entre versões/locales;
- atualização do binário e bibliotecas do SO fica sob responsabilidade do projeto.

### C — helper Java/Xerces

Vantagens:

- suporte sólido a XSD 1.0 e resolução programável;
- bom isolamento e possibilidade de cache compartilhado em serviço dedicado;
- erros ricos com linha/coluna;
- adequado para backend fiscal self-hosted com contrato próprio.

Riscos:

- segunda stack de runtime, build, observabilidade e segurança;
- serviço remoto deixaria de ser uma validação estritamente local/offline;
- processo persistente/sidecar não se encaixa na função Vercel padrão;
- JRE/JAR aumenta bundle, cold start e carga de manutenção;
- complexidade desproporcional ao estágio atual do produto.

## 7. Recomendação objetiva

Escolher **A — `xmllint-wasm`**, condicionada a um spike eliminatório antes da integração. O spike deve usar exatamente o ZIP/manifesto oficial desta pesquisa, sem mocks de schema, e passar em Node 20 no Windows, Linux, CI e build Next/Vercel.

Critério de aprovação da opção A:

- compila e valida o grafo oficial completo offline;
- distingue XML inválido de falha técnica;
- bloqueia DTD/entidades/imports externos;
- preserva mensagens úteis;
- worker, `.wasm` e XSDs sobrevivem ao bundle;
- não excede os orçamentos definidos de latência e memória.

Se qualquer critério eliminatório de Vercel falhar, usar B como referência/validador em CI e reavaliar onde a validação fiscal de produção deve rodar. Não escolher C sem uma decisão explícita de adotar infraestrutura fiscal separada.

## 8. Checkpoint

Decisão necessária de Rafael: autorizar a opção A e o spike da próxima fase, ou escolher B/C e aceitar seus impactos de infraestrutura. Até essa decisão, não instalar pacote, não versionar XSD e não implementar `validarXsd`.

## 9. Resultado do spike autorizado

O checkpoint acima foi atendido e o spike da opção A foi executado em `fiscal/goal-002-xsd-wasm-spike`. O resultado completo está em `FISCAL_XSD_WASM_SPIKE_001.md`, `FISCAL_XSD_SECURITY_REVIEW_001.md` e `FISCAL_XSD_PACKAGING_REPORT_001.md`.

- Funcionalidade XSD 1.0/imports/includes/offline: aprovada.
- Contrato de erro, integridade e bloqueio de DTD/ENTITY: aprovado no spike.
- Windows, Node 20 e build Next/webpack: aprovados.
- Tracing de worker, WASM e XSDs: aprovado localmente.
- Linux/CI remoto e deploy Vercel: não comprovados.
- Segurança do motor: reprovada, pois `xmllint-wasm@5.2.0` embute libxml2 2.13.8 afetado por vulnerabilidades aplicáveis.

Portanto, a recomendação original fica **substituída**: **Opção A — funcionalmente viável, rejeitada na versão avaliada por segurança.** Reavaliar somente com libxml2 corrigido e nova execução do spike. Nenhuma integração com `validarXsd` está autorizada por esse resultado.

O spike posterior da opção B comparou host e provisionamento em Windows/Linux. B1 foi rejeitada porque os hosts forneceram versões divergentes e antigas (2.9.9 e 2.9.14). B2 compilou libxml2 2.15.3 do source oficial; a matriz também encontrou o defeito de `--maxmem` do release e aplicou a correção upstream oficial `d335255…`, fixada por hash.

**Resultado B:** **APROVADA COM CONDIÇÕES** para B2; B1 rejeitada.

Recomendação atual: adotar B2 apenas em worker containerizado com build imutável, limite externo de memória/CPU/PIDs, egress bloqueado e concorrência controlada. A execução direta na Vercel e a dependência do binário do host não estão aprovadas. A opção C continua sendo alternativa apenas mediante decisão explícita de infraestrutura separada. O resultado da opção B está detalhado nos relatórios `FISCAL_XSD_NATIVE_SPIKE_001.md`, `FISCAL_XSD_NATIVE_SECURITY_REVIEW_001.md` e `FISCAL_XSD_NATIVE_DEPLOYMENT_REPORT_001.md`.
