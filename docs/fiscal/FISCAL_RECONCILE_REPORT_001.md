# FISCAL RECONCILE REPORT 001

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-STATUS-RECONCILE-001` |
| Data | 2026-07-13 |
| Branch | `fiscal/goal-001-status-reconcile` |
| HEAD base | `2b9c51accbf7200cfa840103b341d853065b42fc` (`origin/main` após fetch) |
| HEAD final | commit que contém este relatório; hash exato no handoff/pós-push |
| Modo | documentação + reconciliação; banco estritamente read-only |
| Gate destravado | `G-C1` pela publicação desta fonte reconciliada |

## 1. Resumo executivo

A frente fiscal possui fundação relevante, mas permanece dormente. F2–F4 têm código e testes
internos; isso não equivale a XSD oficial, assinatura interoperável, homologação ou produção. O
único acoplamento real fora de `lib/fiscal` são seis guards de correção/cancelamento de venda e as
rotas administrativas de configuração/certificado. Snapshot, pipeline, emissão, numeração,
tax-engine, XML, assinatura e vault não têm caller no fluxo de venda.

O banco configurado contém as oito tabelas fiscais esperadas, todas sem registros fiscais. Na
execução original do GOAL-001, em 13/07/2026, a consulta read-only encontrou 721 vendas, todas com
`fiscalStatus = NAO_FISCAL`. Durante a auditoria de merge readiness realizada posteriormente no
mesmo dia, uma nova consulta agregada encontrou 723 vendas, também todas com
`fiscalStatus = NAO_FISCAL`. A variação de duas vendas representa crescimento operacional normal da
base e não altera a classificação fiscal, pois todas permanecem não fiscais e as oito entidades
fiscais continuam sem registros. Essas contagens são snapshots temporais e podem crescer sem
alterar a classificação fiscal. O diff Prisma 6.19.3 retornou migração vazia; não há drift entre o
datamodel e o banco consultado. Nenhum documento fiscal foi homologado ou emitido em produção.

## 2. Base Git e pré-flight

- A worktree de origem estava em `ad94854` e continha WIP não relacionado; permaneceu intocada.
- `git fetch origin` atualizou a base e a worktree isolada nasceu de `origin/main` em `2b9c51a`.
- Convenção observada no repositório: `goal/`, `work/`, `audit/`, `publish/`; o nome prescrito
  `fiscal/goal-001-status-reconcile` foi mantido.
- `docs/fiscal/` não existia e foi criado conforme allowlist.
- `CURRENT_STATUS.md` real: `docs/ai/CURRENT_STATUS.md`.
- `EXECUTION_LOG.md` da allowlist: `docs/status/EXECUTION_LOG.md`.
- Auditoria factual usada: arquivo externo à base Git, preservado sem alteração,
  `docs/audits/AUDITORIA_FISCAL_RECONCILIACAO_CODIGO_001.md` na worktree de origem.
- Os quatro originais Fable 5 não foram encontrados no repositório, no anexo, na worktree de
  origem ou no perfil local. As versões incorporadas estão marcadas como reconstruções.

## 3. Inventário Git fiscal

Commits fiscais relevantes encontrados em `git log --all -- lib/fiscal`:

| Commit | Evidência |
|---|---|
| `549513d` | identidade fiscal por loja, admin-only e dormente |
| `ca681ed` | máquina de estado fiscal da venda |
| `b5177cf` | snapshot fiscal da venda |
| `a206dce` | abstração de provider fiscal |
| `cd565c8` | pipeline de emissão simulado |
| `2b88411` | numeração fiscal por série |
| `ba0cc12` | tax-engine, XML, XMLDSig, vault, dry-run, provider e pipeline |

O commit `04ce54d`, citado pela auditoria para produto fiscal, existe na história do repositório,
mas não aparece em `git log -- lib/fiscal` porque o arquivo é `lib/produto-fiscal.ts`. Não houve
commit fiscal posterior a `ad94854` nos caminhos reconciliados. A `origin/main` avançou por mudanças
de PDV/acessórios, sem alterar o achado fiscal.

## 4. Inventário de código e callers reais

### 4.1 Callers de `lib/fiscal/**` fora da pasta

Rotas administrativas:

- `app/api/fiscal/config/route.ts` usa guard, identity service, validators e log fiscal.
- `app/api/fiscal/certificado/route.ts` usa guard, validators e log fiscal.
- `app/api/fiscal/certificado/[id]/route.ts` usa guard e log fiscal.

Guards no runtime de vendas — seis rotas confirmadas:

| Rota | Símbolo |
|---|---|
| `app/api/vendas/[id]/corrigir/route.ts` | `assertVendaFiscalEditavel` |
| `app/api/vendas/[id]/corrigir-itens/route.ts` | `assertVendaFiscalEditavel` |
| `app/api/vendas/[id]/corrigir-titulo/route.ts` | `assertVendaFiscalEditavel` |
| `app/api/vendas/[id]/corrigir-parcelas/route.ts` | `assertVendaFiscalEditavel` |
| `app/api/vendas/[id]/corrigir-item-meta/route.ts` | `assertVendaFiscalEditavel` |
| `app/api/vendas/[id]/cancelar/route.ts` | `assertVendaFiscalCancelavel` |

Sem caller fora de `lib/fiscal`: `buildVendaFiscalSnapshot`, `createVendaFiscalSnapshot`,
`emitirNotaFiscalVenda`, `runFiscalPipeline`, allocator de numeração, tax-engine, builder XML,
assinatura, vault e resolver do provider.

### 4.2 Produto fiscal e achado D4

`upsertProduto` está em `app/actions/cadastros.ts:1554`. Ele aceita e mescla `metadata` genérica,
mas não importa `lib/produto-fiscal.ts`, não chama `fiscalInputFromBody` e não normaliza
`metadata.fiscal`. Assim, o Cadastros V2 ainda pode criar produto sem identidade fiscal canônica.

Divergência menor frente à auditoria: além das rotas REST `app/api/produtos/**`, os importadores
`lib/importador-produtos/persist.ts` e `lib/importador-avancado/persistidor.ts` já chamam
`mergeProdutoFiscalIntoMetadata`. Isso melhora importação, mas não resolve a porta principal.

### 4.3 Estado dos componentes

- Provider: registry com somente `STUB_HOMOLOGACAO`; demais enums retornam
  `provider_nao_implementado`.
- Emissão: simulada, sem rede e sem caller de venda.
- XSD: placeholder declarado; não valida contra XSD oficial.
- C14N: implementação autoconsistente, mas com desvios documentados.
- Tax-engine: Simples Nacional interno sem ST/DIFAL/FCP/IPI/ISS; CSOSN 500 fora do escopo atual.
- Fila: tabela/enum/índices no schema; nenhum produtor ou worker.
- QR-Code, DANFCE, contingência e provider real: ausentes.
- `fiscalEnabled`: default false e excluído do upsert administrativo; nenhum caminho de ativação.
- PDV, Caixa, Financeiro e Contador HUB não chamam emissão fiscal.

## 5. Banco — evidência somente leitura

Consultas agregadas em 2026-07-13, sem dados pessoais e sem escrita:

| Entidade/estado | Contagem |
|---|---:|
| tabelas fiscais presentes | 8/8 |
| configurações fiscais | 0 |
| configurações habilitadas | 0 |
| certificados | 0 |
| séries | 0 |
| notas fiscais | 0 |
| itens de nota | 0 |
| eventos | 0 |
| jobs | 0 |
| logs fiscais | 0 |
| vendas totais — snapshot original do GOAL-001 em 13/07/2026 | 721 |
| vendas totais — snapshot posterior da merge readiness em 13/07/2026 | 723 |
| vendas com `fiscalStatus != NAO_FISCAL` | 0 |
| vendas autorizadas | 0 |
| vendas rejeitadas | 0 |
| cancelamentos fiscais | 0 |
| inutilizações | 0 |
| `_prisma_migrations` | ausente |

A autoridade para alegações estruturais N5 é o PostgreSQL configurado consultado diretamente. Não
há autoridade SEFAZ para N6/N7 porque nenhum retorno real existe.

## 6. Diff schema versus banco

Prisma 6.19.3, `DIRECT_URL`, banco como origem e `prisma/schema.prisma` como destino:

```text
prisma migrate diff --from-url <REDACTED> \
  --to-schema-datamodel prisma/schema.prisma --script
```

Resultado: exit `0`, `-- This is an empty migration.`. Classificação: **sem drift**. Artefato
sanitizado: `docs/fiscal/FISCAL_SCHEMA_DATABASE_DIFF_001.md`.

## 7. Bateria e baseline pré-mudança

| Comando | Duração | Exit | Resultado |
|---|---:|---:|---|
| `npx prisma generate` | 3,3 s | 0 | client 6.19.3 gerado; preparação ambiental |
| `npm test` | 10,2 s | 0 | 170 arquivos; 2353 passed; 2 expected fail |
| `npx tsc --noEmit` | 121 s | 0 | sem erros |
| `npm run lint` | 246,6 s | 1 | baseline pré-existente: 105 erros, 118 warnings |
| `npm run build` | 169,9 s | 0 | Next.js 16.2.0; 104 páginas estáticas; build verde |

A primeira tentativa de `npm test`, antes de gerar o client, teve 149 arquivos/2083 testes verdes e
21 suítes sem carga por ausência de `generated/prisma`; foi classificada como preparação ambiental,
não como regressão. Frente à auditoria (160 arquivos/2222 testes + 2 expected fail), a base atual
tem +10 arquivos e +131 testes passados.

O lint vermelho está fora do escopo e concentra erros em artefatos históricos
`components/pdv-github-original/**`; nenhum erro foi corrigido neste GOAL documental.

Validação pós-documentação repetida:

| Comando | Duração | Exit | Resultado pós-mudança |
|---|---:|---:|---|
| `npm test` | 11,2 s | 0 | 170 arquivos; 2353 passed; 2 expected fail |
| `npx tsc --noEmit` | 130,5 s | 0 | sem erros |
| `npm run lint` | 240,6 s | 1 | mesmos 105 erros e 118 warnings do baseline |
| `npm run build` | 84,4 s | 0 | Next.js 16.2.0; 104 páginas estáticas; build verde |

## 8. Classificação F0–F12

Vocabulário: N0 ausente; N1 contrato; N2 código existente; N3 teste interno; N4 dry-run auferível;
N5 runtime real; N6 homologação SEFAZ; N7 produção.

| Fase | Objetivo | Código | Runtime | Banco | Teste interno | Prova externa | Homologação | Produção | N | Bloqueios / próximo GOAL |
|---|---|---|---|---|---|---|---|---|---:|---|
| F0 | plano/governança | docs vigentes | n/a | n/a | revisão interna | não | não | não | N2 | reconciliada no GOAL 001 |
| F1 | cofre/decisão | ADR-0009 + EnvVault | sem caller | refs no schema; 0 dados | verde | não | não | não | N3 | KMS ausente; GOALs 008/produção |
| F2 | tributos | tax-engine | sem caller | n/a | verde | sem contador | não | não | N3 | ST/CSOSN 500; GOALs 003–004 |
| F3 | XML/chave | builder + chave | sem caller | n/a | verde | XSD oficial ausente | não | não | N3 | XSD placeholder; GOALs 005–006 |
| F4 | assinatura A1 | signer + C14N + EnvVault | sem caller | 0 certificados | verde | interoperabilidade ausente | não | não | N3 | C14N irregular; GOALs 007–008 |
| F5 | provider/transmissão | contrato + stub | sem caller real | 0 notas | stub verde | nenhuma SEFAZ | não | não | N1 | G-F5; GOALs 011–014 |
| F6 | QR-Code/CSC | ausente | ausente | refs apenas | ausente | nenhuma | não | não | N0 | GOAL 015 |
| F7 | fila/ativação | schema da fila | guards N5, emissão desconectada | 0 jobs | parcial | nenhuma | não | não | N1 | estado incerto/eventos; GOALs 016–018/022 |
| F8 | DANFCE | ausente | ausente | n/a | ausente | nenhuma | não | não | N0 | GOAL 019 |
| F9 | eventos | contrato/schema + stub | sem serviço real | 0 eventos | parcial | nenhuma | não | não | N1 | GOAL 017 |
| F10 | contingência | ausente | ausente | enums/fields | ausente | nenhuma | não | não | N0 | GOAL 020 |
| F11 | homologação ampla | ausente | ausente | zero evidência | ausente | nenhuma | não | não | N0 | GOAL 021 |
| F12 | produção | KMS/virada ausentes | inalcançável | zero evidência | ausente | nenhuma | não | não | N0 | G-F12; fora da sequência até homologação |

O dry-run atual permanece N3: existe e tem testes, mas XSD e canonicalização não tornam o resultado
auferível. Não foi promovido a N4.

## 9. P-01–P-13

Os quatro arquivos Fable 5 originais, onde a redação completa das P-xx deveria existir, estavam
ausentes. Para impedir desaparecimento silencioso, a tabela abaixo usa uma taxonomia operacional
reconstruída. P-02 e P-09 preservam as pistas explícitas do GOAL; as demais descrições são derivadas
dos passos e achados, e não devem ser citadas como transcrição do Fable 5.

| ID | Descrição operacional | Evidência | Estado anterior | Estado atual | Resolvido? | GOAL | Impacto |
|---|---|---|---|---|---|---|---|
| P-01 | governança/status divergentes | roadmap atrás de `ba0cc12` | aberto | documentos reconciliados | sim | 001 | fonte factual única |
| P-02 | callers e dormência | seis guards; restante sem caller | aberto | inventário exato publicado | sim | 001 | separa código de runtime |
| P-03 | banco fiscal real | 8 tabelas, zero dados fiscais | presumido | confirmado read-only | sim | 001 | prova dormência |
| P-04 | paridade `upsertProduto` | não usa `produto-fiscal` | aberto | confirmado; importadores já melhores | não | 002 | bloqueia mix real |
| P-05 | C14N interoperável | desvios no canonicalizador | aberto | confirmado | não | 007–008 | bloqueia assinatura externa |
| P-06 | XSD oficial | validator placeholder | aberto | confirmado | não | 005–006 | gate dry-run falso |
| P-07 | ST/CSOSN 500 | fora do escopo do tax-engine | aberto | confirmado | não | 003–004 | bloqueia mix varejista |
| P-08 | provider real | registry só com stub | aberto | confirmado; G-F5 aberto | não | 011–014 | bloqueia SEFAZ |
| P-09 | histórico de schema/db:push | `_prisma_migrations` ausente | aberto | confirmado; diff vazio | classificado | futuro de governança | risco de prova por migration |
| P-10 | estado incerto/consulta por chave | contrato no schema, serviço ausente | aberto | confirmado | não | 016 | evita duplicidade em timeout |
| P-11 | fila e eventos antes da ativação | tabela sem produtor/worker | aberto | sequência corrigida | não | 017–018 | bloqueia GOAL 022 |
| P-12 | prova de homologação | zero notas/retornos SEFAZ | aberto | N6=0 confirmado | não | 014–021 | não permite alegar prontidão |
| P-13 | produção gated | `fiscalEnabled` inalcançável | aberto | N7=0; G-F12 aberto | não | após 022/F12 | produção permanece proibida |

Nenhuma série Q-xx foi definida no GOAL recebido ou nas fontes disponíveis; portanto, nenhuma Q-xx
foi inventada ou marcada como resolvida.

## 10. Mapeamento ADR-P01–P14

| Proposta | Número | Colisão em `docs/decisions/**` |
|---|---:|---|
| ADR-P01 | ADR-0010 | não |
| ADR-P02 | ADR-0011 | não |
| ADR-P03 | ADR-0012 | não |
| ADR-P04 | ADR-0013 | não |
| ADR-P05 | ADR-0014 | não |
| ADR-P06 | ADR-0015 | não |
| ADR-P07 | ADR-0016 | não |
| ADR-P08 | ADR-0017 | não |
| ADR-P09 | ADR-0018 | não |
| ADR-P10 | ADR-0019 | não |
| ADR-P11 | ADR-0020 | não |
| ADR-P12 | ADR-0021 | não |
| ADR-P13 | ADR-0022 | não |
| ADR-P14 | ADR-0023 | não |

Nenhuma ADR foi criada ou alterada. Revalidar números contra `origin/main` antes de cada criação.

## 11. Divergências encontradas

### Versus auditoria de 2026-07-12

- `origin/main` atual é `2b9c51a`, não `f42072a`; sem mudança fiscal posterior a `ad94854`.
- Entre a auditoria de 2026-07-12 e o snapshot original do GOAL-001 em 13/07/2026, as vendas
  cresceram de 719 para 721; ambas as novas permaneciam `NAO_FISCAL`.
- A merge readiness, executada posteriormente em 13/07/2026, encontrou 723 vendas; as duas vendas
  adicionais também permaneciam `NAO_FISCAL`, sem registros nas entidades fiscais.
- Suíte cresceu de 160/2222 para 170/2353; 2 expected fail permanecem.
- Importadores de produto também persistem `metadata.fiscal`; a lacuna principal do Cadastros V2
  continua.
- O ponteiro `CURRENT_STATUS.md:2934` continua inválido; na base atual o texto “NF-e — mock” aparece
  por volta da linha 3066, e não representa uma seção fiscal consolidada.

### Versus masterplan/roadmap

- F2–F4 e dry-run existem desde `ba0cc12`, embora o roadmap os trate como próximos/ausentes.
- F2 não cumpre o DoD de CSOSN 500.
- F3 não cumpre validação XSD oficial.
- F4 é internamente testada, mas não provou C14N interoperável.
- O gate “dry-run verde” não é auferível e não destrava F5.
- A doutrina de estado incerto/consulta por chave precisa anteceder ativação por fila.
- `_prisma_migrations` ausente invalida arquivo de migration como prova do banco aplicado.

## 12. Gates e checkpoints

- G-F1: resolvido por ADR-0009.
- G-F5: aberto; decisão humana SEFAZ direto × gateway ainda necessária.
- G-F7: aberto; ativação da loja-piloto não autorizada neste GOAL.
- G-F12: aberto; produção inalcançável.
- Checkpoint de drift: aprovado, diff vazio.
- Checkpoint de ADR: somente mapeamento entregue; nenhuma decisão reaberta.
- Validação contábil/tributária: necessária para P-07 e golden cases; não substituída por testes.

## 13. Arquivos modificados e justificativa

1. `docs/roadmaps/ROADMAP_FISCAL.md` — status F0–F12 e próximo GOAL.
2. `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md` — somente seção 2 de status.
3. `docs/ai/CURRENT_STATUS.md` — nova seção fiscal.
4. `docs/status/EXECUTION_LOG.md` — banner de advertência; histórico intacto.
5. `docs/fiscal/FISCAL_FABLE5_CONTINUATION_MASTERPLAN_001.md` — incorporação reconstruída.
6. `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` — sequência GOAL 001–022.
7. `docs/fiscal/FISCAL_CONTINUATION_ADRS_PROPOSTOS_001.md` — mapa ADR-P01–P14.
8. `docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md` — comandos reais e guardrails.
9. `docs/fiscal/FISCAL_SCHEMA_DATABASE_DIFF_001.md` — diff sanitizado.
10. `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md` — este relatório.

Não houve documento adicional de higienização: nenhuma referência fiscal viva usava o log histórico
como única prova factual.

## 14. Deliberadamente não feito

- Nenhum código, teste, schema, migration, lockfile ou ADR alterado.
- Nenhuma escrita em banco, chamada SEFAZ, emissão, certificado ou segredo real.
- Nenhum lint preexistente corrigido.
- Nenhuma ativação de `fiscalEnabled`.
- Nenhum merge, rebase, stash, reset, force-push ou push para `main`.
- Os originais Fable 5 ausentes não foram fabricados; a reconstrução está rotulada.

## 15. Riscos, pendências e conclusão

Riscos prioritários: gate dry-run falso, C14N irregular, XSD placeholder, ausência de ST, produto do
Cadastros V2 sem normalização fiscal e falta de reconciliação de estado incerto. Todos permanecem
dormentes hoje, mas bloqueiam homologação segura.

Próximo GOAL recomendado: **GOAL 002 — paridade fiscal do `upsertProduto`**, seguido da trilha de
autoridade tributária/ST, XSD e C14N. A frente permanece com teto N3 no motor interno, N6=0 e N7=0.

O commit e o push são executados após revisão literal da allowlist; os hashes e o estado final da
worktree são informados no handoff pós-push, evitando uma autorreferência impossível do commit que
contém este próprio arquivo.

---

## 16. Atualização pós-reconciliação — GOAL-002 XSD integrado (15/07/2026)

| Campo | Valor |
|---|---|
| Evento | Integração + fechamento documental do GOAL `FISCAL-XSD-OFFICIAL-VALIDATION-002` |
| Merge commit | `82c219c4e241b145109a697aa3eb0e5d26a24d93` |
| HEAD fiscal | `d497775e9dd1021d9a54ba6cf8f7b8c0b739f436` |
| Gate | **G-C2 = FECHADO** (G-C1 permanece o da reconciliação GOAL-001) |
| Classificação XSD | no-op **removido**; validação real fail-closed |
| Nível N (eixo XSD) | **N4** (auferível em CI/container; **não** N6/N7) |
| SEFAZ | **nenhuma** chamada · N6=0 |
| Produção / emissão | **não** · N7=0 · `fiscalEnabled` inalcançável |

### O que mudou vs. §8/§9 originais

| Achado GOAL-001 | Estado em 15/07/2026 |
|---|---|
| F3 · XSD placeholder (P-06 aberto) | **XSD oficial integrado** · worker B2 · `validarXsd` real |
| Dry-run N3 por XSD no-op | XSD **auferível**; dry-run **completo** ainda bloqueado por **C14N** (P-05) |
| GOALs 005–006 abertos na trilha XSD | **cumpridos no eixo XSD** (GOAL nomeado 002 fechado) |
| Homologação / produção | **inalteradas** (N6=0, N7=0) |

### Gates atualizados

- **G-C1:** fechado (GOAL-001) — inalterado.
- **G-C2:** **fechado** pela prova XSD B2 + merge + fechamento documental.
- G-F5 / G-F7 / G-F12: **abertos**.
- Homologação SEFAZ e produção: **proibidas** de serem presumidas.

### O que permanece aberto

- C14N interoperável (próximo: `FISCAL-XML-C14N-EXTERNAL-PROOF-003`);
- paridade `upsertProduto`, ST/CSOSN 500, provider real, fila, DANFCE, QR-Code;
- política Trivy **HIGH** como follow-up separado (gate atual = CRITICAL only);
- qualquer transmissão SEFAZ.

Fonte detalhada: [`FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md`](./FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md).
