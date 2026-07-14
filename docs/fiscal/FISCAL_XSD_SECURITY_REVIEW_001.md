# Revisão de segurança do `xmllint-wasm` — GOAL-002

## 1. Dependência revisada

| Item | Evidência |
|---|---|
| pacote | `xmllint-wasm@5.2.0` |
| origem | registro oficial npm e repositório `noppa/xmllint-wasm` |
| licença | MIT |
| publicação npm | 24/03/2026 17:50:13 UTC |
| tarball | 308.155 bytes; 12 arquivos; 873.194 bytes descompactados |
| SHA-1 npm | `b19867a8a52ceac7bd25a32691206b025504fd95` |
| SRI | `sha512-GVMuR3ViU8R7sakcVm/4GClMtCV8p7xgjXZlc6GmvPpInIz4V41lmRnjSd4uKhVkf5MZj97wEZkPM4RMAhojuQ==` |
| scripts de instalação | nenhum `preinstall`, `install` ou `postinstall` |
| dependências runtime/transitivas | nenhuma |
| peer | `@types/node >=16` |
| WASM | 778.732 bytes; SHA-256 `4e3cc21a67e8dd40ccb59822e4193fd1923b4cda08b40fe8ff8973de5eed9515` |
| motor embutido | libxml2 2.13.8, declarado pelo próprio projeto |

A instalação foi feita com versão exata e `--ignore-scripts`. O tarball baixado foi comparado ao SRI do registro. Não há binário nativo do host nem download em pós-instalação; o código usa Worker Threads e um módulo WebAssembly versionado no pacote.

Fontes: [repositório oficial](https://github.com/noppa/xmllint-wasm), [registro npm](https://www.npmjs.com/package/xmllint-wasm) e [documentação oficial do libxml2](https://gnome.pages.gitlab.gnome.org/libxml2/).

## 2. Auditoria de dependências

`npm audit` após a instalação reportou 18 avisos no projeto inteiro: 3 baixos, 7 moderados, 8 altos e 0 críticos. Com `--omit=dev`, foram 7: 2 baixos, 1 moderado, 4 altos e 0 críticos. `xmllint-wasm` não apareceu no relatório porque não há advisory npm associado ao pacote; isso não cobre vulnerabilidades do libxml2 compilado dentro do WASM.

Os avisos do audit pertencem a dependências preexistentes do repositório. Nenhuma correção automática foi aplicada.

## 3. Vulnerabilidades do motor embutido

A consulta ao NVD para libxml2 2.13.8 retornou sete registros aplicáveis à versão. A triagem por caminho é:

| CVE | Caminho | Relevância para o spike | Tratamento |
|---|---|---|---|
| [CVE-2025-6021](https://nvd.nist.gov/vuln/detail/CVE-2025-6021) | overflow em `xmlBuildQName` | potencialmente aplicável ao parser; versão 2.13.8 está abaixo da correção | risco residual, eliminatório |
| [CVE-2025-8732](https://nvd.nist.gov/vuln/detail/CVE-2025-8732) | catálogo SGML | catálogo não usado | caminho não alcançado pelo desenho |
| [CVE-2026-0989](https://nvd.nist.gov/vuln/detail/CVE-2026-0989) | RelaxNG | RelaxNG não usado | caminho não alcançado |
| [CVE-2026-0990](https://nvd.nist.gov/vuln/detail/CVE-2026-0990) | recursão em catálogo | catálogo não usado | caminho não alcançado |
| [CVE-2026-0992](https://nvd.nist.gov/vuln/detail/CVE-2026-0992) | consumo de recurso em catálogo | catálogo não usado | caminho não alcançado |
| [CVE-2026-6732](https://nvd.nist.gov/vuln/detail/CVE-2026-6732) | XSD + entidade interna, type confusion/DoS | diretamente aplicável ao recurso avaliado | DTD/ENTITY bloqueados antes do motor, mas versão continua vulnerável |
| [CVE-2026-11979](https://nvd.nist.gov/vuln/detail/CVE-2026-11979) | shell `xmlcatalog` | ferramenta não usada | caminho não alcançado |

O NVD classifica CVE-2025-6021 e CVE-2026-6732 com severidade alta. Para CVE-2026-6732, a faixa publicada inclui libxml2 2.13.8 e a correção informada está em 2.15.3. A rejeição prévia de `DOCTYPE`/`ENTITY` é defesa em profundidade comprovada por teste, mas não autoriza manter uma biblioteca vulnerável no limite de confiança fiscal.

## 4. Modelo de ameaça e controles comprovados

Entradas hostis consideradas: XML fiscal arbitrário, expansão/declaração de entidades, referências externas, schema adulterado, arquivo ausente, volume excessivo, mensagens contendo dados do documento e falha do worker.

Controles do spike:

- nenhuma resolução automática de rede; todos os schemas são bytes em memória;
- `--nonet` como segunda barreira;
- grafo fechado por allowlist de cinco nomes relativos;
- rejeição de caminho absoluto, URL, traversal, DTD ou ENTITY nos XSDs;
- SHA-256 obrigatório antes de cada carga inicial, com canonicalização exclusiva de CRLF para LF;
- rejeição de `DOCTYPE` e `ENTITY` no XML antes do worker;
- limite de 2 MiB para o XML;
- heap WASM máximo de 512 páginas;
- Worker Thread para isolamento da execução;
- mensagens normalizadas, sem eco do XML e com máximo de 500 caracteres;
- erro técnico tipado e separado de `valid: false`.

Limitações: não há timeout/cancelamento forte por validação na API pública do wrapper; não foi feito fuzzing; Linux e Vercel real não foram executados; o wrapper cria worker por chamada; o risco de uma falha interna não coberta pelos filtros permanece.

## 5. Decisão de segurança

Classificação: **REJEITADA** para uso produtivo de `xmllint-wasm@5.2.0`.

A decisão não decorre de falha funcional, licença ou cadeia npm. Ela decorre da versão vulnerável do libxml2 congelada dentro do WASM. Um aceite condicional permitiria que o pacote atual chegasse à integração antes de existir correção verificável; isso contraria o caráter eliminatório do spike.

Critérios para nova avaliação:

1. release/fork reproduzível com libxml2 fora de todas as faixas vulneráveis aplicáveis;
2. SRI e SHA-256 fixados;
3. revisão das mudanças do wrapper e do toolchain WASM;
4. repetição dos casos de entidade interna/externa e corpus malicioso;
5. limite temporal cancelável ou isolamento descartável com deadline;
6. teste Linux/CI e deploy real no runtime Node da Vercel;
7. monitoramento contínuo de advisories do wrapper e do libxml2.
