# Spike eliminatório do `xmllint` nativo — GOAL-002

## 1. Resultado executivo

Este ciclo avaliou a opção B em duas modalidades, sem integrar o runner a `validarXsd` ou ao fluxo de emissão:

- **B1 — binário do host:** não previsível. O host Windows local não possui `xmllint`; o runner `windows-2022` encontrou libxml2 2.9.9 via Strawberry Perl; o `ubuntu-24.04` instalou libxml2 2.9.14 pelo APT. As duas versões ficam abaixo do piso 2.15.3 adotado pelo spike.
- **B2 — binário provisionado:** funcionalmente viável em processo isolado quando compilado do source oficial libxml2 2.15.3 e acrescido da correção upstream oficial de `--maxmem`, ainda não publicada em release.

**Classificação eliminatória:** **APROVADA COM CONDIÇÕES**.

Base: `b5289456fed35732dff54ab3f30974dc848065c8`. Branch: `fiscal/goal-002-xmllint-native-spike`. O no-op em `lib/fiscal/dry-run/dry-run-validation.ts:72` não foi alterado.

Commits técnicos publicados, em ordem: `8f96bad`, `a33beb8`, `ae9cf57`, `b242e69` e `6680b5c`. As iterações permaneceram separadas para preservar a trilha dos defeitos encontrados.

## 2. Artefatos experimentais

- `lib/fiscal/xsd-native/xmllint-native-spike.ts`: runner isolado, sem importação por código de produção;
- `lib/fiscal/xsd-native/xmllint-native-spike.test.ts`: contrato, integridade, limites e processo;
- `lib/fiscal/xsd-native/xmllint-native-spike.integration.test.ts`: integração real, ativada somente por variáveis de CI;
- `scripts/fiscal/xsd-native-spike-metrics.test.ts`: medições reproduzíveis;
- `lib/fiscal/xsd-native/schemas/PL_010e_v1.02/NFe/`: cinco XSDs oficiais;
- `lib/fiscal/xsd/__fixtures__/nfce-xsd-spike-fixtures.ts`: XMLs exclusivamente sintéticos;
- `.github/workflows/fiscal-xsd-native-spike.yml`: matriz exclusiva Windows/Linux.

Não foi adicionada dependência npm, não houve mudança de lockfile, Prisma, banco, certificado, segredo, provider ou emissão.

## 3. Contrato do runner

O experimento exige caminho absoluto do executável e não consulta `PATH`. No modo provisionado, calcula SHA-256 do binário antes de executá-lo; identifica a versão real do libxml2 e rejeita versões abaixo de 2.15.3 e a versão 2.13.8 conhecida do spike WASM.

Cada validação:

1. limita o XML UTF-8 a 2 MiB;
2. rejeita `DOCTYPE`, `ENTITY` e hints `schemaLocation` antes de iniciar processo;
3. verifica os cinco XSDs contra hashes exatos e grafo fechado;
4. copia apenas os cinco arquivos permitidos para diretório temporário 0700;
5. envia o XML somente por `stdin`;
6. executa sem shell, com argumentos fixos e ambiente mínimo;
7. usa `--noout --nonet --nocatalogs --schema nfe_v4.00.xsd -`; o harness suporta `--maxmem`, mas a matriz demonstrou que o grafo excede 512 MiB e produção deve impor limite externo no worker;
8. impõe timeout de 3 s e máximo de 64 KiB de saída;
9. sanitiza caminho temporário, identificadores longos e quebras de linha das mensagens;
10. remove o diretório temporário em `finally`.

Os estados de XML inválido/malformado são separados de falha de integridade, compilação do schema, timeout, excesso de saída, versão e falha do motor.

## 4. Casos exercitados

- documento NFC-e sintético válido;
- obrigatório ausente;
- tipo inválido;
- campo acima do limite;
- namespace incorreto;
- XML malformado;
- `verProc` de 20 e 21 caracteres;
- DTD e entidade interna;
- entidade externa `file:` e HTTP;
- hint `schemaLocation`;
- XML acima de 2 MiB;
- XSD ausente, adulterado e variante LF exata do Git;
- caminho de executável relativo, inexistente e hash divergente;
- versão antiga/desconhecida;
- metacaracteres como argumentos literais, sem command injection;
- timeout real, excesso real de saída, repetição e quatro processos concorrentes;
- limpeza do temporário em sucesso e erro.

## 5. Descobertas durante a matriz

### 5.1 Final de linha e BOM dos XSDs

O Git normaliza os dois XSDs CRLF para LF no checkout Linux. `xmldsig-core-schema_v1.01.xsd` contém BOM; recodificar texto para calcular hash removia o BOM. O contrato final não canonicaliza conteúdo: aceita somente o hash bruto do ZIP ou o hash LF exato já documentado no manifesto. Qualquer terceiro valor falha fechado.

### 5.2 Defeito de `--maxmem` no release 2.15.3

O release oficial 2.15.3 encerrou com código 9 em Windows para qualquer valor positivo de `--maxmem`. O upstream corrigiu o defeito no commit oficial `d3352554e4c1f052b914cda7b415d06b7eab5dfa`, de 23/05/2026: o limite era inicializado em zero em vez do valor informado.

Para completar o spike sem retirar o limite, a matriz aplica esse patch textual oficial ao source 2.15.3 após verificar SHA-256 `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c`. O grafo ainda excedeu 128 MiB e exigiu teto experimental de 512 MiB. Isto prova B2, mas também cria condições de produção: preferir um release oficial que contenha a correção; se ainda inexistente, documentar e auditar explicitamente o patch no build imutável, impor limite externo e controlar concorrência.

## 6. Evidências e resultados

| Verificação | Resultado |
|---|---|
| Unitário focado local | 25/25 aprovados |
| Suíte fiscal local em modo CI | 277 aprovados; 9 ignorados |
| ESLint focado | aprovado |
| TypeScript completo | aprovado; `--incremental false` usado para evitar escrita de cache |
| Build Next.js/webpack | aprovado em 280,3 s; 104 páginas estáticas; sem integração do spike ao bundle |
| GitHub Actions inicial | run `29299561499`, falhou e revelou limites de memória/hash |
| GitHub Actions diagnóstico | run `29300171966`, falhou e isolou BOM + defeito upstream de `--maxmem` |
| GitHub Actions definitiva | run `29301137020`: Windows e Linux aprovados, 37/37 testes em cada job |

Métricas Linux: binário 1.470.024 bytes, SHA-256 `9bb9230426f29fd0065547047fc3a7afe798c0e1eb0642bdd24daebbf23406f8`; cold 20,62 ms; warm 10 amostras, média 20,04 ms (17,95–28,84); quatro concorrentes 57,41 ms; delta RSS do wrapper 19.087.360 bytes; XSDs 441.374 bytes no checkout LF.

Métricas Windows: binário 1.083.392 bytes, SHA-256 `cb10993e92f93f51112f09b64a011ab8a1bed3124763aaff80af4a4f5ef23d70`; cold 79,71 ms; warm 10 amostras, média 78,67 ms (75,48–90,22); quatro concorrentes 212,91 ms; delta RSS do wrapper 11.210.752 bytes; XSDs 451.403 bytes no checkout CRLF.

## 7. Conclusão

B1 deve ser rejeitada: a versão e a origem variam por host. B2 oferece execução offline, isolamento forte, hashes e diagnóstico útil, mas o release vigente exige patch upstream para que `--maxmem` funcione e a Vercel não oferece garantia de binário compatível no host.

A recomendação é adotar somente B2 em worker containerizado dedicado, com build imutável, egress bloqueado, limite externo de memória/CPU/PIDs e concorrência inicialmente unitária. Não aprovar B1 nem execução direta na Vercel neste momento. O próximo passo depende de decisão humana e não está autorizado neste ciclo.
