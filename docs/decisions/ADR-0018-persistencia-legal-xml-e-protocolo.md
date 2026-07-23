---
title: ADR-0018 · Persistência legal do XML assinado/autorizado e do protocolo NFC-e
status: aceita
data: 2026-07-23
autor: GOAL-013
revisores: [Rafael Faria]
aceita_em: 2026-07-23
aceita_por: Rafael Faria
hub: cross
tags: [fiscal, nfce, xml, persistencia, imutabilidade, retencao, storage, multi-loja]
superado_por:
substitui:
---

# ADR-0018 · Persistência legal do XML assinado/autorizado e do protocolo NFC-e

> **Status:** ✅ aceita em 2026-07-23 por Rafael Faria (checkpoint humano do GOAL-013)
> **Decisão em uma frase:** a coluna `NotaFiscal.*` é a fonte primária e obrigatória do XML
> assinado e do XML autorizado + protocolo; ambos são persistidos integralmente, são imutáveis
> após a autorização, não há purga automática nesta geração, e o espelho privado é **opcional**
> — somente se provisionado em GOAL/sprint próprios; enquanto não estiver provisionado, segue-se
> a política **somente-coluna**.

---

## 1. Contexto

A ADR-0017 já garante que, antes da transmissão, a nota persista `xmlAssinado`, série/número
alocados, chave de acesso, SHA-256 dos bytes e estado `TRANSMITINDO`. O ponto de retorno
incerto é resolvido pela consulta por chave com retomada dos **mesmos bytes persistidos**. O
que falta é completar o armazenamento legal do documento autorizado.

Hoje, `markAuthorized` persiste `protocolo`, `cStat`, `xMotivo`, `dataAutorizacao` e
`xmlAutorizado`, mas **não** persiste `digestValue`, `qrCodeData`, `urlConsulta` — metadados já
existentes no schema e exigidos para reimpressão/DANFCE/consulta ao Fisco/consumidor. Também
**não há** guard explícito contra substituição do `xmlAutorizado` ou troca silenciosa de
protocolo, e **não há** reader server-side para consumidores futuros (reimpressão, DANFCE,
download fiscal, Contador HUB read-only).

A ADR-0014 definiu o backend KMS para **segredos** (.pfx/CSC/senha), com Supabase Vault +
Storage privado exclusivo do Fiscal. A política de **storage privado** **não foi
provisionada** para o XML autorizado; defesa em profundidade com bucket fiscal exige
provisionamento/sprint próprios. Logo, a coluna precisa **sozinha** cumprir o requisito legal
de guarda nesta geração.

**Restrições:**

- O GOAL-013 **não** altera `prisma/schema.prisma`, migrations, provider fiscal, DANFCE/UI do
  Contador HUB/PDV, nem ativa SEFAZ real ou produção. **Nenhuma purga automática**.
- O XML autorizado é **imutável** depois de persistido (ADR-0008 P4; ADR-0017 §4.1).
- O storage espelho é **opcional**: `xmlStorageRef` permanece `null` enquanto não houver bucket
  fiscal provisionado e acessível, sem bloquear este GOAL.
- Todo acesso é **server-side**, com **isolamento estrito por `storeId`** (ADR-0003) e guards
  de admin (`lib/fiscal/guard-fiscal-admin.ts`) e serviços autorizados.
- **Nenhum XML completo** em `FiscalLog.detalhe`, logs, erros, trace ou bundle do cliente
  (ADR-0008 P6 já vale para segredos; aqui estende-se ao XML autorizado).
- NFC-e modelo 65 em `HOMOLOGACAO`; produção permanece bloqueada.

**Estado atual relevante:**

- `ADR-0017` aceita em 2026-07-23 — persistência pré-transmissão + reconciliação por chave.
  Texto explícito em ADR-0017 §2: “armazenamento legal completo/retention policy do XML
  autorizado, reservado ao GOAL-013”.
- Schema já expõe: `xmlAssinado`, `xmlAutorizado`, `xmlStorageRef`, `protocolo`, `cStat`,
  `xMotivo`, `dataAutorizacao`, `digestValue`, `qrCodeData`, `urlConsulta`.
- `markAuthorized` atual: `lib/fiscal/emission/prisma-uncertain-state-persistence.ts:312-374`.
- Storage/backend KMS: `ADR-0014` + `docs/fiscal/FISCAL_KMS_PRODUCTION_ARCH_001.md` —
  definidos, **não** provisionados para XML.

---

## 2. Decisão

Adotar a **política de armazenamento somente-coluna** como fonte primária e obrigatória, com
**imutabilidade** do XML autorizado e do protocolo, e um **espelho privado opcional** que
**não** substitui a coluna. Detalhamento operacional:

### 2.1 Persistência do XML assinado (antes da transmissão)

- Manter o contrato da ADR-0017: persistir `xmlAssinado` + série/número/chave + SHA-256 dos
  bytes UTF-8 no `payload.document.bytesSha256` do `FiscalEmissaoJob` (e, indiretamente, na
  coluna `xmlAssinado`) **antes** de chamar o provider.
- **Impedir substituição silenciosa após o início da transmissão:** o `WHERE` de
  `persistBeforeTransmission` restringe a `status IN (RASCUNHO, VALIDANDO, ASSINADA)` — uma vez
  em `TRANSMITINDO`, o update casa com zero linhas e a operação é recusada. Na retomada por
  consulta, o coordenador **relê** os bytes persistidos e **não chama** preparer/builder/signer
  (ADR-0017 §6); `assertPersistedDocument` ainda revalida o SHA-256 e bloqueia com
  `PERSISTED_BYTES_MISMATCH` se os bytes divergirem.
- **Nada disso é reimplementado aqui.** O mecanismo já existe desde o GOAL-012; este GOAL o
  **eleva a decisão** e o trava com teste de regressão (a substituição pós-`TRANSMITINDO` é
  recusada), em vez de duplicar a lógica.

### 2.2 Persistência do XML autorizado + todos os metadados (após autorização)

`markAuthorized`, **atomicamente** em uma única transação, persiste no `NotaFiscal`:

| Campo | Origem | Notas |
|---|---|---|
| `status = AUTORIZADA` | transição | mantém as transições do GOAL-012 |
| `xmlAutorizado` | `result.xmlAutorizado` | imutável após primeira persistência |
| `protocolo` | `result.protocolo` | imutável após primeira persistência |
| `cStat` | `result.cStat` | `'100'` é o caso canônico; outros códigos de autorização também são válidos |
| `xMotivo` | `result.xMotivo` | espelho do texto SEFAZ |
| `dataAutorizacao` | `now` (Date) | instante da persistência autoritativo |
| `digestValue` | `result.digestValue` (opcional) | novo nesta ADR |
| `qrCodeData` | `result.qrCodeData` (opcional) | novo nesta ADR (CSC/V150) |
| `urlConsulta` | `result.urlConsulta` (opcional) | novo nesta ADR (por UF/ambiente) |
| `ultimoErro = null` | fixo | limpa falhas de tentativas anteriores |
| `xmlStorageRef` | `mirror.storeMirror(...).xmlStorageRef` ou `null` | só se espelho ativo |

Os campos `digestValue`, `qrCodeData`, `urlConsulta` são **opcionais** no tipo
`{ outcome: "AUTHORIZED" }` em `lib/fiscal/emission/uncertain-state.types.ts`. O stub e o
test-stub permanecem sem esses campos; consumers futuros (provider real/GOAL-021) passam a
preenchê-los.

### 2.3 Imutabilidade do XML autorizado e do protocolo

A verificação roda **antes de qualquer escrita**, dentro da mesma transação, e é **independente
do `status`**: o que protege o documento é a presença dos bytes já persistidos, não a transição
de estado. `markAuthorized` deve:

1. **Mesmos bytes + mesmo protocolo + mesmo `cStat` + mesmo `xMotivo`:** convergência
   **idempotente**, sem escrita (nem a `dataAutorizacao` é regravada), sem erro. Mantém
   ADR-0017 §6 (retomada converge sem replicar efeito).
2. **Bytes divergentes de `xmlAutorizado`:** **erro explícito**
   `xml_autorizado_imutavel_diverge`: nenhuma atualização dos dados autorizados, nenhum
   commit da transação. A nota permanece com o XML original.
3. **`protocolo` divergente:** **erro explícito** `protocolo_imutavel_diverge`. Proibido
   trocar silenciosamente o número do protocolo de autorização.
4. **`cStat`/`xMotivo` divergentes para a mesma autorização:** considerados parte da mesma
   evidência; erro `metadados_autorizacao_divergem` se o `xmlAutorizado` for o mesmo mas o
   `cStat`/`xMotivo` divergirem (proteção contra atualização parcial).
5. Nenhuma atualização de **dados vivos** (snapshot, itens, venda, configuração fiscal)
   pode reconstruir o `xmlAutorizado`. Esta regra é reforço textual; a imutabilidade operacional
   está na verificação pré-update.

**Completar ≠ substituir.** Uma nota que já esteja `AUTORIZADA` mas com a coluna **incompleta**
(por exemplo, `xmlAutorizado` nulo após uma falha administrativa) ainda pode ser completada pela
retomada por consulta — preencher um campo vazio com a evidência autoritativa da SEFAZ não é
substituição. Por isso o `WHERE` do update permanece `status IN (TRANSMITINDO, AUTORIZADA)`,
exatamente como no GOAL-012: **este GOAL não remove nenhum comportamento do GOAL-012**, apenas
adiciona a barreira de imutabilidade à frente dele. O que nunca acontece é sobrescrever um campo
já preenchido com valor diferente.

`markAuthorized` devolve `Promise<void>` (interface pública inalterada); em caso de
divergência, **lança** erro com `code` estável (mantendo o alinhamento com
`UncertainStatePersistence`). O coordenador/configurador atual trata apenas os caminhos
esperados; erros de divergência são auditados em `FiscalLog` e propagados.

### 2.4 Espelho privado opcional (sem substituir a coluna)

Exclusivamente **se** houver backend de storage privado **provisionado, configurado e acessível**
(ADR-0014, sprint futura), `markAuthorized` invoca um `XmlStorageMirror`:

- `mirror.active === true` ⇒ `storeMirror` grava uma cópia **imutável**, devolve
  `xmlStorageRef`, e `markAuthorized` persiste `xmlStorageRef` na coluna (a fonte primária
  permanece a coluna).
- `verifyAgainstColumn({storeId, notaFiscalId, xmlStorageRef, columnBytesSha256})` compara o
  hash da cópia com o da coluna; divergência é registrada em `FiscalLog`, jamais silenciada.
- **Leitura futura** detecta divergência coluna × espelho; a coluna vence (decisão de design,
  não bug).
- `mirror.active === false` (estado atual deste GOAL) ⇒ `xmlStorageRef = null`, mirror é
  no-op, sem provisionamento, sem bucket, sem credencial. A coluna é a única fonte.

**O espelho nunca derruba uma autorização.** A gravação da cópia roda **fora da transação**
(é I/O externo) e só depois do commit da coluna. Falha, recusa ou exceção do espelho geram
apenas `FiscalLog` de nível `WARN` (`fiscal.storage.mirror_failed` /
`fiscal.storage.mirror_write_skipped`) — a nota permanece `AUTORIZADA` com os bytes na coluna.
O `WHERE` da gravação do ponteiro exige `xmlStorageRef: null`, de modo que uma referência já
gravada também é imutável.

**Definição do espelho no código** (este GOAL): `noopXmlStorageMirror`, implementação
**inativa**, referência futura para o backend real (sprint própria, **não** este GOAL). Nenhum
recurso externo é criado.

### 2.5 Reader fiscal server-side

Cria-se `lib/fiscal/storage/xml-storage-reader.ts` com `readAuthorizedDocument`, server-only:

- **Exige** `storeId` (lança `store_id_obrigatorio` se ausente/vazio).
- **Valida isolamento:** `where: { id: notaFiscalId, storeId }` — loja A nunca lê documento de
  loja B.
- **Retorna bytes persistidos**: `xmlAutorizado`, `xmlAssinado` (pré-transmissão), `protocolo`,
  `cStat`, `xMotivo`, `dataAutorizacao`, `digestValue`, `qrCodeData`, `urlConsulta`,
  `xmlStorageRef` (pode ser `null` se espelho inativo), `bytesSha256` calculado (SHA-256 dos
  `xmlAutorizado`) e `bytesAssinadoSha256` (do job `FiscalEmissaoJob.payload.document.bytesSha256`).
- **Nunca reconstrói** XML a partir de dados vivos. **Nunca permite alteração** (read-only).
- Nenhum XML completo em logs; apenas identificadores (`notaFiscalId`, `chaveAcesso`, hashes,
  `cStat`) podem ser auditados em `FiscalLog`.

### 2.6 Política de retenção (fontes oficiais)

Ver detalhe, método de pesquisa e pendências em
`docs/fiscal/FISCAL_XML_RETENTION_POLICY_001.md`. Resumo:

**Fundamento principal do piloto paulista (ADR-0016) — dois atos, ambos lidos verbatim:**

- **Obrigação de guarda — Ajuste SINIEF 19/2016, cláusula nona:** *"O emitente deverá manter a
  NFC-e em arquivo digital, sob sua guarda e responsabilidade, pelo prazo estabelecido na
  legislação tributária"*. É esta a norma que institui a NFC-e (modelo 65, cl. 1ª) e obriga a
  guarda, delegando o **prazo** à legislação tributária.
- **Prazo — RICMS/SP, art. 202** (Decreto 45.490/2000, reproduzindo a Lei 6.374/89 art. 67 §5º):
  *"Os documentos fiscais [...] deverão ser conservados, no mínimo, pelo prazo de 5 (cinco) anos,
  e, quando relativos a operações ou prestações objeto de processo pendente, até sua decisão
  definitiva, ainda que esta seja proferida após aquele prazo"*. São **duas** regras: o piso de
  5 anos e a **extensão indeterminada sob processo pendente**. A NFC-e modelo 65 é documento
  fiscal eletrônico reconhecido pelo RICMS/SP.
- **Política adotada:** mínimo de 5 anos, **sem teto**, com preservação até decisão definitiva
  quando houver processo pendente, e **nenhuma purga automática** nesta geração.
- **Responsável:** o emitente (a loja proprietária da nota, identificada por `storeId`).
- **Referências complementares:** Ajuste SINIEF 07/2005 (institui a NF-e modelo 55, não a NFC-e)
  e CTN art. 195 p.ú. Os **CTN arts. 173/174 permanecem pendentes de conferência** e **não são
  necessários** para sustentar o prazo do piloto.
- **Disponibilidade ao Fisco:** meio eletrônico, mediante requisição — o XML autorizado (com
  `procNFe`/protocolo) deve ser apresentável.
- **Disponibilidade ao consumidor (NFC-e):** DANFE-NFC-e e/ou consulta por QR-Code (cláusula
  décima do Ajuste 19/2016); `qrCodeData` e `urlConsulta` ficam persistidos para o GOAL-021.
- **Nenhuma purga automática nesta geração.** Qualquer política de purga futura requer ADR
  própria, janela de observação e pré-validação de cumprimento legal; não é parte deste GOAL.

> **Limites declarados:** o texto integral do CTN arts. 173/174 **não** pôde ser relido nesta
> sessão (`planalto.gov.br` recusou as conexões) — permanecem como **referência complementar
> pendente** (R-1), sem sustentar o prazo adotado. O art. 202 do RICMS/SP vale para **São Paulo**;
> outras UFs exigem conferir o regulamento local quando o piloto se expandir (R-6). Esta ADR é
> decisão **de engenharia** sobre onde os bytes ficam guardados; não substitui parecer
> contábil/jurídico (R-3).

### 2.7 Backup e recuperação

- **Postgres (Supabase):** backup automático contém o `xmlAutorizado` na coluna (`@db.Text`).
  Restore do banco devolve o XML persistido com seu `protocolo`.
- **Espelho:** se provisionado no futuro, o backup do storage privado deve ser coordenado com o
  backup do Postgres; divergência coluna × espelho tem de ser auditável (regressão testável).
- **Perda de coluna:** se `xmlAutorizado` tornar-se nulo por erro administrativo, o
  `FiscalEmissaoJob` retém `xmlAssinado` + SHA-256; uma nova autorização é **proibida** (número
  já consumido); a nota permanece `AUTORIZADA` em estado degradado e dispara alerta humano.
  **Não** há reconstrução automática do XML autorizado.

### 2.8 Política para corrupção ou divergência de hash

| Cenário | Tratamento |
|---|---|
| Corrupção de `xmlAssinado` (SHA-256 diverge) | já tratado por `assertPersistedDocument` (ADR-0017): `PERSISTED_BYTES_MISMATCH`, transmissão bloqueada, reconciliação por chave |
| Corrupção de `xmlAutorizado` | `markAuthorized` bloqueia substituição; leitura reporta divergência; alerta humano, sem rebuild |
| Divergência coluna × espelho | `verifyAgainstColumn` marca `mirror_divergente`; coluna vence; leitura recorda divergência em `FiscalLog` |
| Perda do `bytesSha256` no job | consulta por chave ainda funciona com `xmlAssinado` relido da coluna; `persistedBytes` reautentica |
| Perda total do `xmlAutorizado` (admin/bug) | nota permanece `AUTORIZADA`; alerta humano; **não** há rebuild; inutilização/correção é evento fiscal futuro |

**O que esta decisão NÃO inclui (escopo fechado):**

- Não ativa SEFAZ real, produção (`tpAmb=1`) ou `fiscalEnabled` — mantém ADR-0017/ADR-0015.
- Não altera `prisma/schema.prisma` nem migrations — usa campos já existentes.
- Não toca `lib/fiscal/provider/**`, DANFCE/renderização, UI do Contador HUB, PDV, caixa,
  financeiro, estoque ou auth/proxy.
- Não provisiona bucket, credencial, role, policy, KMS, certificado ou CSC.
- Não altera o contrato `FiscalProvider`/`UncertainStateFiscalProvider` (apenas estende o tipo
  `AUTHORIZED` com campos opcionais).
- Não implementa purga, retenção automática ou compressão/limpeza.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Decisão |
|---|---|---|---|
| A) Mover o XML para storage externo como único destino | tira texto grande do banco; custo de Postgres menor | depende de bucket/credencial que **não existem**; bloquearia o GOAL; perde a garantia transacional entre XML e protocolo | **Rejeitada** |
| B) Storage externo como destino e coluna apenas como ponteiro | banco leve | a imutabilidade deixa de ser garantida pelo banco; divergência coluna × espelho passa a ter duas fontes de verdade concorrentes | **Rejeitada** |
| C) Persistir **somente-coluna**, com espelho opcional que não substitui a coluna | cumpre o requisito de guarda imediatamente; sem dependência de infra provisionada; backup do Postgres já cobre o XML; espelho futuro entra como defesa em profundidade sem quebrar callers | a coluna `@db.Text` cresce com XML integrais (custo de Postgres) | **Escolhida** |
| D) Adiar `digestValue`/`qrCodeData`/`urlConsulta` | menos mudança agora | deixa reimpressão, DANFCE e consulta do consumidor sem os metadados; obrigaria um segundo passe depois, sem ganho | **Rejeitada** |

---

## 4. Consequências

### 4.1 Positivas

- Requisito legal de guarda é satisfeito sem provisionar infra externa.
- `digestValue/qrCodeData/urlConsulta` ficam disponíveis para reimpressão, download fiscal,
  Contador HUB read-only e DANFCE (GOAL-021) sem alterações de schema.
- Imutabilidade do `xmlAutorizado`/`protocolo` evita duplicidade, troca de evidência e
  divergência após autorização.
- Reader server-side dá aos consumidores futuros um contrato **único** e isolado por loja;
  elimina re-implementação ad-hoc.
- Espelho é evolução futura: o noop já define a interface, sem acoplar este GOAL a backends
  externos.

### 4.2 Negativas / Custos

- Coluna `xmlAutorizado` (`@db.Text`) cresce por nota autorizada; custo de Postgres/Supabase
  aceito nesta geração. Avaliar compressão futura em ADR própria (fora deste GOAL).
- Leitura de XML demanda `find`/`findFirst` na nota — minimizada por `@@index([storeId, status])`
  já existente; consumidores específicos adicionam `@@index` padrão via sprint própria se for
  caso de performance (não neste GOAL).
- Espelho real (se provisionado) introduz operacional extra: backup coordenado, policies,
  recuperação. A coluna mantém-se autoritativa.

### 4.3 Riscos introduzidos

- **Backup tornar-se referência quando coluna é corrompida:** mitigação — `markAuthorized`
  bloqueia substituição; alerta humano; restore Postgres é único caminho; **não** reemitir.
- **`digestValue`/`qrCodeData`/`urlConsulta` com valor nulo em notas pré-GOAL-013:**
  mitigação — campos são opcionais no tipo e no schema; leitura/consumidores futuros (DANFCE)
  tratam `null` com fallback honesto ("metadado não disponível"); não há dado fiscal real
  emitido em produção ainda.
- **Espelho no-op enganoso (parecer que provisiona):** mitigação — `active` é literalmente
  `false`, `xmlStorageRef` fica `null`, a documentação explicita "não provisionado" e nenhum
  bucket/credencial é criado ou consultado.
- **Custo Postgres por XML integral:** mitigação — monitorar tamanho; política de
  compressão/purga é ADR futura, **não** automática aqui.

### 4.4 O que muda imediatamente

- Arquivos afetados (este GOAL):
  - `docs/decisions/ADR-0018-persistencia-legal-xml-e-protocolo.md` (nova).
  - `docs/decisions/INDEX.md` (linha nova).
  - `docs/fiscal/FISCAL_XML_RETENTION_POLICY_001.md` (novo).
  - `docs/architecture/NFCE_ARCHITECTURE.md` (link à ADR-0018 na Etapa 8/9).
  - `lib/fiscal/emission/uncertain-state.types.ts` (tipo `AuthorizedFiscalResult` com os campos
    opcionais + `AuthorizedDivergenceError`/`AuthorizedDivergenceCode`).
  - `lib/fiscal/emission/prisma-uncertain-state-persistence.ts` (`markAuthorized`
    estendido + imutabilidade + idempotência + novos metadados + espelho pós-commit).
  - `lib/fiscal/storage/types.ts` (novo) · `xml-storage-reader.ts` (novo) ·
    `mirror-vault.ts` (novo, no-op) · `index.ts` (novo).
  - Teste novo: `lib/fiscal/storage/xml-protocol-storage.test.ts` (suíte única do GOAL —
    persistência, imutabilidade, reader e espelho compartilham o mesmo Prisma em memória).
- Docs a atualizar: NFCE_ARCHITECTURE.md §8 link; ADR INDEX; eventualmente
  `docs/architecture/FISCAL_SECURITY.md` referência cruzada (não seção nova).
- Outras decisões afetadas: ADR-0017 ( ".. reservado ao GOAL-013") — cumpre-se aqui.
  ADR-0014 (storage privado): não é reaberto; o espelho aqui é **independente** do bucket de
  segredos, e provisionamento (se vier) é sprint própria.

### 4.5 O que muda no longo prazo

- Quando a SEFAZ real entrar homologação (GOALs de provider real), `result.digestValue/
  qrCodeData/urlConsulta` começam a vir populados pelo provider — o schema e o
  `markAuthorized` já estão prontos (sem nova ADR).
- Quando o espelho privado for provisionado, entra uma implementação concreta de
  `XmlStorageMirror` com `active === true` (sprint própria, ADR própria se necessário).
- Quando DANFCE (GOAL-021) consumir o reader, ele já pode usar `xmlAutorizado + protocolo +
  qrCodeData + urlConsulta` sem refazer parsing fiscal.
- Purge/compressão eventual será ADR futura, jamais neste GOAL.

---

## 5. Plano de implementação

**Esta ADR é a decisão por trás do GOAL `FISCAL-XML-PROTOCOL-STORAGE-013` — implementação
acontece neste mesmo GOAL.**

- GOAL: `FISCAL-XML-PROTOCOL-STORAGE-013`.
- Branch: `fiscal/goal-013-xml-storage`.
- Owner humano: Rafael Faria.
- Pré-requisitos de aceitação:
  - pré-flight completo (PR #28 mergeado, schema lido, GOAL-012 lido, storage confirmado não
    provisionado).
  - pesquisa oficial de retenção registrada em `FISCAL_XML_RETENTION_POLICY_001.md`.
  - **Checkpoint humano obrigatório antes de commit/push**.
- Critério de pronto da implementação (testes obrigatórios, todos neste GOAL):
  1. persistência do XML assinado já verde (ADR-0017) — preservada;
  2. persistência do XML autorizado e protocolo — cobre todos os metadados suportados pelo
     schema;
  3. idempotência com mesmos bytes — convergir sem erro;
  4. bloqueio de alteração do XML autorizado — erro explícito;
  5. bloqueio de protocolo divergente — erro explícito;
  6. leitura retorna os bytes originais (reader server-side);
  7. isolamento cross-store — loja A não lê XML de loja B;
  8. **nenhum XML completo em logs** — `FiscalLog.detalhe` contém só hashes/identificadores;
  9. hash válido do `xmlAutorizado` (SHA-256) pelo reader;
  10. divergência coluna × espelho (se espelho ativo) marcada — espelho no-op não ativa;
  11. compatibilidade com estado incerto do GOAL-012 — drill A/B/C continua verde;
  12. **gate fiscal 11/11 preservado** (`npm run test:fiscal-gate`).
- Validação de regressão: `npx tsc --noEmit`; `vitest run lib/fiscal`; `npm run test:fiscal-gate`;
  `npm run build`; `eslint` dos arquivos alterados; `git diff --check`.

---

## 6. Validação / como saberemos que deu certo

- Lendo via `readAuthorizedDocument(storeId, notaFiscalId)`, **100% dos documentos
  `AUTORIZADA`** devolvem os mesmos `xmlAutorizado`/`protocolo`/`cStat` que foram persistidos
  no momento da autorização — ver **bytes idênticos por teste de leitura**.
- 0 substituições silenciosas de `xmlAutorizado` ou `protocolo` em `AUTORIZADA`.
- 0 mudanças em `prisma/schema.prisma` ou migrations.
- 0 XML completo em `FiscalLog.detalhe` — o teste serializa todos os logs produzidos por
  `markAuthorized` + reader e verifica que nenhum trecho do XML aparece (sem precisar tocar
  `secret-scan.ts` neste GOAL).
- 0 leituras cross-store: ler com o `storeId` de outra loja devolve `null`, nunca os bytes.
- 0 ativação de SEFAZ real/provider de produção.
- 0 bucket/KMS/storage provisionado neste GOAL.
- Gate `npm run test:fiscal-gate` mantém **11/11** (evidência executável do gate fiscal).
- Janela de observação: contínua enquanto o módulo fiscal estiver dormente/`HOMOLOGACAO`.

---

## 7. Referências

- ADRs relacionados: ADR-0003 (multi-loja), ADR-0008 (arquitetura fiscal, P4 imutabilidade),
  ADR-0009 (cofre/segredos), ADR-0014 (storage/KMS produção), ADR-0017 (estado
  incerto/reconciliação, reservou este tema).
- Auditorias/relatórios relacionados:
  `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md` (P-10 reservado a ADR-0010 conforme tabela
  histórica) e `docs/fiscal/FISCAL_UNCERTAIN_DRILL_001.md` (drills A/B/C herdados do GOAL-012).
- Política detalhada de retenção: `docs/fiscal/FISCAL_XML_RETENTION_POLICY_001.md`.
- Atos oficiais que fundamentam a retenção (método de verificação e pendências em
  `FISCAL_XML_RETENTION_POLICY_001.md` §0 e §6):
  - **Ajuste SINIEF 19/2016** — institui a NFC-e, modelo 65 (cl. 1ª) e obriga a guarda do
    arquivo digital (cl. 9ª). *Verificado verbatim.*
    <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2016/AJ_019_16>
  - **RICMS/SP, art. 202** — prazo mínimo de 5 anos + conservação até decisão definitiva sob
    processo pendente (Decreto 45.490/2000; Lei 6.374/89 art. 67 §5º). **Fundamento do prazo no
    piloto.** *Verificado verbatim.* <https://legislacao.fazenda.sp.gov.br/Paginas/art182.aspx>
  - **Ajuste SINIEF 07/2005** — institui a NF-e modelo 55; cl. 10ª, guarda do arquivo digital.
    Referência subsidiária. *Verificado verbatim.*
    <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ_007_05>
  - **CTN (Lei 5.172/1966), art. 195, parágrafo único** — conservação até a prescrição dos
    créditos tributários. *Verificado.* **Arts. 173/174: referência complementar pendente de
    conferência, não usada como fundamento.**
    <https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm>
  - **MOC NF-e/NFC-e** (versão vigente) — layout do `<nfeProc>`, `digestValue`, QR-Code e URL
    de consulta. <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=3GhDwJ/ZeSI%3D>
  - Web Services de homologação — <https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx>

---

## 8. Notas / discussão

- **Numeração (alias P-10 / número global):** o comando deste GOAL chama a decisão de
  **ADR-P10**. A reconciliação histórica do GOAL-001
  (`docs/fiscal/FISCAL_RECONCILE_REPORT_001.md` §10) mapeou **ADR-P10 → ADR-0019** na tabela
  histórica de ADRs propostos. A ADR-0017 (GOAL-012), contudo, fixou o critério de **próximo
  número global livre** estabelecido por `docs/decisions/INDEX.md` §1.1 (sequencial global,
  sem reset) e usou **ADR-0017** — não **ADR-0018** — para o tema "estado incerto" (que no
  histórico se chamava **P-08**). Seguindo o mesmo critério nesta ADR, o **próximo número
  global livre** depois de ADR-0017 é **ADR-0018**. **Decidido no checkpoint de 2026-07-23:**
  vale **ADR-0018**, e **"ADR-P10" permanece apenas como alias histórico** — nenhuma decisão
  anterior é renumerada ou reescrita, e a tabela histórica do `FISCAL_RECONCILE_REPORT_001.md`
  fica como está (registro do que foi proposto à época, não do número final).
- **Idempotência × divergência:** a regra de "convergir com os mesmos bytes" foi escolhida
  para preservar o gate 11/11 do GOAL-012 (drill B usa duas transmissões idênticas — não deve
  falhar; idempotência é o efeito esperado).
- **Espelho no-op:** o no-op **não** cria bucket, credencial nem policy; `active === false`. A
  implementação concreta (se/quando) entra em sprint própria com ADR própria se necessário.
- **`digestValue`/`qrCodeData`/`urlConsulta` opcionais:** foram adicionados como opcionais
  para não quebrar o `stubHomologacaoProvider`/`UncertainStateTestStub` (preenchidos no
  GOAL-021/provider real).
- **Restrição de backup:** esta ADR assume que o backup Postgres (Supabase) é agnóstico ao
  XML (coluna `@db.Text` é backup como texto). Nada garante compressão/envelopamento; essa
  é evolução futura (ADR própria se/quando storage externo; não aqui).
- **Aceitação humana:** ✅ **aceita por Rafael Faria em 2026-07-23**, no checkpoint humano
  obrigatório do GOAL-013 (pré-commit). Condições documentais fixadas na aceitação e já
  incorporadas:
  1. fundamento principal do piloto = **Ajuste SINIEF 19/2016 cl. 9ª + RICMS/SP art. 202**;
  2. política = mínimo de 5 anos, **estendida até decisão definitiva sob processo pendente**,
     sem purga automática nesta geração;
  3. pendência R-2 (legislação estadual) **fechada** — RICMS/SP verificado, NFC-e modelo 65
     reconhecida como documento fiscal eletrônico;
  4. **CTN arts. 173/174 não são apresentados como fundamento verificado** — apenas referência
     complementar pendente (R-1), desnecessária ao prazo do piloto;
  5. invariantes técnicos preservados (coluna primária, espelho opcional inativo, imutabilidade,
     idempotência só para bytes/metadados idênticos, leitura pelos bytes persistidos, isolamento
     por `storeId`, zero XML em logs, zero purga, zero reconstrução por dados vivos);
  6. alias **P-10** mantido como referência histórica, sem renumerar decisões anteriores.