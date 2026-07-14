# Revisão de segurança do `xmllint` nativo — GOAL-002

## 1. Componentes e procedência

| Item | Origem oficial | Versão/commit | SHA-256 |
|---|---|---|---|
| source libxml2 | `download.gnome.org/sources/libxml2/2.15/` | 2.15.3 | `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07` |
| correção `--maxmem` | `github.com/GNOME/libxml2/commit/d335255...` | `d3352554e4c1f052b914cda7b415d06b7eab5dfa` | `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c` |
| pacote XSD | Portal Nacional da NF-e | `PL_010e_v1.02` | ZIP `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1` |

O libxml2 usa licença MIT. Nenhum binário de terceiro foi baixado ou aceito como autoridade; os binários B2 são compilados em runners oficiais a partir dos itens hasheados acima.

Fontes primárias: [índice oficial GNOME](https://download.gnome.org/sources/libxml2/2.15/), [release news 2.15.3](https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.news), [manual oficial do xmllint](https://gnome.pages.gitlab.gnome.org/libxml2/xmllint.html), [commit oficial de `--maxmem`](https://github.com/GNOME/libxml2/commit/d3352554e4c1f052b914cda7b415d06b7eab5dfa) e [NVD CVE-2026-11979](https://nvd.nist.gov/vuln/detail/CVE-2026-11979).

## 2. Situação de segurança do motor

O próprio projeto libxml2 alerta que não recomenda a biblioteca para dados não confiáveis sem controles adicionais. Essa advertência é tratada como risco real, não como bloqueio ignorado.

O release 2.15.3 corrige, entre outros, problemas de type confusion no parser, C14N e resolução relativa de `schemaLocation`. A consulta NVD/CPE exata em 14/07/2026 encontrou uma ocorrência para 2.15.3: CVE-2026-11979, disputada, na shell interativa de `xmlcatalog`. O caminho do spike executa somente `xmllint`, nunca `xmlcatalog --shell`, portanto a funcionalidade vulnerável não é alcançável.

O defeito posterior de `--maxmem` não é classificado como CVE, mas inviabiliza o controle documentado no release puro. A matriz usa o patch upstream oficial; produção deve migrar ao primeiro release que o contenha ou manter a aplicação auditada desse patch.

## 3. Modelo de ameaça e controles

| Ameaça | Controle comprovado | Risco residual |
|---|---|---|
| command injection | `spawn` direto, `shell: false`, caminho absoluto e argumentos fixos | comprometimento prévio do binário/host |
| XXE/DTD/entity expansion | preflight rejeita `DOCTYPE`/`ENTITY`; não usa `--noent`; `--nonet`; libxml2 2.15 removeu loaders de rede | bugs no parser antes/depois do preflight; mitigados por processo/limites |
| schema externo/import arbitrário | cinco nomes em allowlist, hashes exatos, diretório temporário fechado e `--nocatalogs` | mudança futura do pacote requer revisão explícita |
| path traversal/symlink | `lstat`, `realpath`, checagem de raiz e proibição de symlink | host comprometido continua fora do modelo |
| XML excessivo | teto de 2 MiB antes do processo | conteúdo válido complexo ainda consome CPU/memória |
| exaustão de memória | `--maxmem` 512 MiB com correção upstream; código 9 é falha técnica | quatro processos podem alcançar 2 GiB; worker/container deve limitar concorrência e memória do processo |
| hang/CPU | timeout rígido de 3 s e encerramento do filho | encerramento de árvore de processo deve ser reforçado no adaptador definitivo Windows |
| log de dado fiscal | XML só em `stdin`; mensagens limitadas e sanitizadas; nenhum XML integral em log | trecho textual do validador pode conter valor curto; produção deve aplicar política de logging mínima |
| binário trocado | SHA-256 antes de cada execução no modo provisionado | rebuild muda hash; manifesto deve ser por plataforma/toolchain |
| XSD trocado | hashes do ZIP/LF exatos antes de cada validação | normalização Git deve permanecer documentada |
| stdout/stderr infinito | limite agregado de 64 KiB; aborta o filho | mensagens truncadas podem reduzir diagnóstico |
| temporário residual | diretório aleatório 0700 e limpeza em `finally` | crash/kill do host pode exigir limpeza periódica do worker |

## 4. Ambiente e execução

O ambiente filho contém apenas locale, `NODE_ENV`, `SystemRoot`/`WINDIR` quando necessários, `TEMP`/`TMP`, `PATH` vazio e variáveis de catálogo vazias. Não herda `DATABASE_URL`, tokens ou segredos da aplicação.

O XML não é gravado em arquivo; os XSDs são copiados para o temporário e o XML segue por `stdin`. A validação não usa rede e não baixa schema em runtime.

## 5. Decisão de segurança

**Resultado:** **APROVADA COM CONDIÇÕES**. Os controles de entrada, processo, rede, integridade, timeout, saída e temporário passaram em Windows/Linux. O controle interno `--maxmem` não é utilizável com o grafo vigente: mesmo após o patch upstream, 512 MiB encerrou com código 9. A aprovação exige limite externo do processo/container e concorrência controlada; sem isso, a opção fica reprovada para produção.

Condições mínimas antes de produção:

1. adotar B2, nunca B1;
2. usar release libxml2 que contenha `d335255…` ou build imutável com o patch oficial hasheado;
3. executar em worker/container dedicado com usuário sem privilégio, filesystem somente leitura salvo temporário, rede de saída bloqueada e limites de memória/CPU/PIDs;
4. limitar concorrência e enfileirar validações;
5. manter SBOM, hashes por plataforma, scanner de CVE e rotina de atualização;
6. testar árvore de processo/timeout no adaptador definitivo;
7. não integrar `validarXsd` até ADR/decisão humana sobre o local de execução.
