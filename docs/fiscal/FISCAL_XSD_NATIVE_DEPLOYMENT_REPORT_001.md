# Relatório de deployment do `xmllint` nativo — GOAL-002

## 1. Matriz B1/B2

| Ambiente | B1 — host | B2 — provisionado |
|---|---|---|
| Windows local | ausente; WSL/Docker/toolchain indisponíveis | não compilado localmente; contrato unitário aprovado |
| GitHub `windows-2022` | `C:\Strawberry\c\bin\xmllint.exe`, libxml2 2.9.9; rejeitado por versão | source 2.15.3 + patch oficial; MSVC x64 estático |
| GitHub `ubuntu-24.04` | APT `libxml2-utils`/`libxml2` 2.9.14; rejeitado por versão | source 2.15.3 + patch oficial; ELF x86-64 |
| Vercel Functions | existência/versão de `xmllint` não documentada; não usar | requer empacotar binário Linux x64, bit executável, tracing, ABI/glibc e teste em preview |
| worker containerizado | imagem pode fixar pacote, mas distro ainda varia | melhor destino: source/binário, hash, usuário, rede e recursos controlados |

B1 é operacionalmente rejeitada. Somente B2 fornece versão e cadeia de procedência determinísticas.

## 2. Build reproduzível B2

O workflow baixa o tarball oficial 2.15.3 por HTTPS, confere SHA-256, baixa o patch textual upstream `d335255…`, confere SHA-256, executa `git apply --check` e aplica o patch. Em seguida usa CMake Release, desabilita iconv, zlib, testes e Python e compila apenas `xmllint`/libxml2.

Os binários são publicados somente como artefatos efêmeros de sete dias do spike; não entram no repositório nem no bundle da aplicação. Um rebuild pode produzir hash diferente por toolchain/runner, por isso produção precisará guardar manifesto por plataforma, imagem e compilador.

| Artefato ZIP do run final | Tamanho | Digest GitHub | Expiração |
|---|---:|---|---|
| `xmllint-2.15.3-linux-x64-spike` | 664.849 bytes | `sha256:c47f9a3b569c9307448714d98ebea00e8c3675d0b0cf20529b3d1f62a8d5d052` | 21/07/2026 |
| `xmllint-2.15.3-windows-x64-spike` | 527.981 bytes | `sha256:66f54b0ec0cc06cea6f496fd89c9f5a75b6e6ea819f27f106321bc959e039f8a` | 21/07/2026 |

Resultados definitivos: run `29301137020` aprovado nos dois jobs; 37/37 testes por plataforma. A prova funcional desativou `--maxmem` e manteve timeout, limite de entrada/saída e todos os controles de rede/integridade. Os runs anteriores comprovam que 128 e 512 MiB do contador interno são insuficientes para este grafo.

Linux B2: ELF x86-64 PIE, dinamicamente ligado apenas a `libc.so.6` e loader, 1.470.024 bytes, SHA-256 `9bb9230426f29fd0065547047fc3a7afe798c0e1eb0642bdd24daebbf23406f8`.

Windows B2: PE x64 Release, 1.083.392 bytes, SHA-256 `cb10993e92f93f51112f09b64a011ab8a1bed3124763aaff80af4a4f5ef23d70`.

Dependências importadas pelo PE Windows: `bcrypt.dll`, `KERNEL32.dll`, `VCRUNTIME140.dll` e APIs UCRT de runtime, stdio, conversão, ambiente, tempo, string, heap, filesystem, utility, math e locale. O ZIP do artefato foi baixado em temporário, conferido contra o digest GitHub e o executável repetiu o hash e tamanho registrados no job.

## 3. Métricas

| Métrica | Linux x64 | Windows x64 |
|---|---:|---:|
| cold | 20,62 ms | 79,71 ms |
| warm médio (10) | 20,04 ms | 78,67 ms |
| warm mín.–máx. | 17,95–28,84 ms | 75,48–90,22 ms |
| quatro concorrentes | 57,41 ms | 212,91 ms |
| delta RSS wrapper | 19.087.360 bytes | 11.210.752 bytes |
| versão | 2.15.3 + patch `d335255…` | 2.15.3 + patch `d335255…` |

As métricas de RSS são do wrapper Node e não substituem medição do pico do processo filho. O grafo oficial excedeu 128 MiB; o limite experimental final do motor é `--maxmem 512 MiB`. O container deve impor um limite externo adicional e limitar concorrência.

## 4. CI e artefatos

Workflow: `.github/workflows/fiscal-xsd-native-spike.yml`, exclusivo da branch do spike e acionável manualmente. Permissões: `contents: read`. Node: 20.20.2. Runners: `windows-2022` e `ubuntu-24.04` x64.

Runs auditados:

- `29299561499`: primeira tentativa; revelou código 9 Windows e integridade Linux;
- `29300171966`: registrou hashes e isolou BOM + defeito oficial de `--maxmem`;
- `29300706952`: hashes multiplataforma aprovados, mas o limite interno de 512 MiB ainda encerrou com código 9;
- `29300924422`: confirmou código 9 com 512 MiB nos dois sistemas;
- `29301137020`: prova funcional final sem `--maxmem`, 37/37 em Windows e 37/37 em Linux, com artefatos publicados.

Todos os runs falhos foram preservados como evidência, e as correções foram feitas em commits separados.

## 5. Build Next.js e tracing

O build `npm run build` passou localmente com Next.js 16.2.0/webpack em 280,3 s. O módulo experimental não é importado por produção; portanto binário e XSDs não aparecem no trace final, como esperado. Nenhum ajuste em `next.config`, package ou lockfile foi necessário.

Isso comprova ausência de regressão no build, mas **não** comprova deploy Vercel do B2. Uma futura integração direta exigiria importar o adaptador, incluir explicitamente os cinco XSDs e o binário Linux x64 no NFT/Output API e executar uma função preview real.

## 6. Vercel

As fontes oficiais da Vercel documentam functions empacotadas, tracing de arquivos, filesystem somente leitura com temporário gravável, limite de bundle e runtime Linux, mas não garantem `xmllint` no host. A função também não oferece sidecar persistente.

Fontes primárias: [Vercel Build Output API](https://vercel.com/docs/build-output-api), [arquivos em funções](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions), [limitações de Functions](https://vercel.com/docs/functions/limitations), [runners hospedados do GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) e [imagens oficiais dos runners](https://github.com/actions/runner-images).

Riscos para B2 dentro da função:

- compatibilidade glibc/arquitetura e bibliotecas dinâmicas;
- preservação do bit executável no artefato;
- tracing do binário e XSDs;
- cold start e concorrência multiplicando processos/memória;
- atualização do binário/patch fora do ciclo normal npm;
- ausência de preview/deploy real neste spike.

Conclusão: Vercel direta permanece **não comprovada** e não deve ser o destino padrão aprovado apenas por este spike.

## 7. Worker containerizado

Um worker interno containerizado permite imagem imutável, egress bloqueado, usuário sem privilégio, filesystem somente leitura, limite de memória/CPU/PIDs, fila e concorrência controlada. Ele mantém a validação offline quanto a schemas, mas adiciona uma chamada interna de rede entre aplicação e worker, autenticação, disponibilidade, observabilidade e operação de uma segunda unidade de deploy.

Essa mudança é arquitetural e exige decisão/ADR. O worker não deve receber certificado nem emitir NFC-e; seu contrato deve ser apenas XML sintético/fiscal por canal interno, resposta estruturada e correlação sem payload em logs.

## 8. Recomendação de deployment

**APROVADA COM CONDIÇÕES** somente como B2 em worker containerizado dedicado. Não usar B1 nem integrar diretamente à função Vercel. O worker deve aplicar limite externo de memória, CPU e PIDs, concorrência inicialmente 1, fila com backpressure, timeout e egress bloqueado. Preferir release libxml2 futuro com a correção `d335255…`; até lá, manter source e patch oficiais fixados por hash.

Não instalar globalmente, não depender de B1 e não inserir binário não versionado no deploy. Até a decisão humana, manter o spike isolado e sem chamada pelo pipeline fiscal.
