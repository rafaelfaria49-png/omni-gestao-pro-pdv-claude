# FISCAL_XML_RETENTION_POLICY_001

| Campo | Valor |
|---|---|
| **Documento** | Política de retenção do XML assinado e do XML autorizado + protocolo NFC-e |
| **GOAL** | `FISCAL-XML-PROTOCOL-STORAGE-013` |
| **ADR vinculada** | [`ADR-0018`](../decisions/ADR-0018-persistencia-legal-xml-e-protocolo.md) |
| **Data** | 2026-07-23 |
| **Autor** | GOAL-013 — aceita por Rafael Faria no checkpoint humano de 2026-07-23 |
| **Status** | `vigente` (ADR-0018 aceita em 2026-07-23) |
| **Escopo** | NFC-e modelo 65 em `HOMOLOGACAO`; produção permanece bloqueada |
| **Piloto** | Matriz RafaCell / São Paulo (ADR-0016) |

---

## 0. Método e honestidade da pesquisa

Esta política cita **apenas atos oficiais**. Nenhum blog, portal de notícias ou material
de fornecedor foi usado como autoridade.

**Fundamento principal do piloto paulista** — os dois atos abaixo, ambos lidos verbatim, bastam
para sustentar o prazo adotado. Nenhum outro dispositivo é necessário:

| Fonte | O que foi lido | Como |
|---|---|---|
| **Ajuste SINIEF 19/2016 (CONFAZ)** | cl. primeira (institui a NFC-e, modelo 65) e **cl. nona** (guarda do arquivo digital) | leitura direta de `confaz.fazenda.gov.br` |
| **RICMS/SP, art. 202** | caput (prazo mínimo de 5 anos + processo pendente) e §§ 1º/2º | leitura direta de `legislacao.fazenda.sp.gov.br` |

**Também verificado** (contexto, não fundamento):

| Fonte | O que foi lido | Como |
|---|---|---|
| Ajuste SINIEF 07/2005 (CONFAZ) | cl. décima (guarda do arquivo digital da NF-e, modelo 55) | leitura direta de `confaz.fazenda.gov.br` |
| CTN (Lei 5.172/1966), art. 195, p.ú. | conservação até a prescrição dos créditos tributários | busca indexada no `planalto.gov.br` |

**Referência complementar, pendente de conferência:** **CTN arts. 173 e 174**. O
`planalto.gov.br` recusou as conexões diretas desta sessão (`ECONNRESET`) e a busca indexada não
devolveu o texto literal. Por decisão do checkpoint humano, **eles não são apresentados como
fundamento textual verificado e não são necessários** para sustentar o prazo do piloto paulista —
que se apoia no Ajuste SINIEF 19/2016 cl. 9ª e no art. 202 do RICMS/SP. Ficam como leitura
complementar futura (pendência R-1).

> ⚠️ **Correção de uma versão anterior deste documento.** Um rascunho anterior atribuía a
> instituição da NFC-e ao *Ajuste SINIEF 16/2015* e citava um *"CTN art. 173, §5º"*. **Ambos
> estavam errados**: a NFC-e é instituída pelo **Ajuste SINIEF 19/2016**, e o art. 173 do CTN
> não possui §5º. As citações foram substituídas pelas verificadas acima.

**Limite de competência:** esta é uma política **técnica de engenharia** sobre onde e por quanto
tempo os bytes ficam guardados. Ela **não** substitui parecer contábil/jurídico (pendência R-3).
A **legislação estadual paulista foi verificada** neste GOAL — ver §2.2.

---

## 1. Princípios

1. **Fonte primária:** a coluna `NotaFiscal.xmlAutorizado` (`@db.Text`) é a fonte da verdade
   legal do XML da NFC-e autorizada. A coluna `NotaFiscal.xmlAssinado` é a fonte da verdade do
   XML assinado antes da transmissão (já garantido pela ADR-0017). Os bytes persistidos são a
   evidência do que foi transmitido e do que foi autorizado.
2. **Imutabilidade:** depois de persistido, o `xmlAutorizado` e o `protocolo` **não podem** ser
   substituídos. Reprocessar com os mesmos bytes converge sem escrever; divergência produz erro
   explícito e o original permanece.
3. **Sem reconstrução:** nenhum consumidor (reimpressão, DANFCE, download fiscal, Contador HUB
   read-only) reconstrói o XML a partir do snapshot, da venda ou da configuração fiscal. A
   leitura devolve **sempre** os bytes persistidos.
4. **Sem purga automática:** nenhuma rotina remove ou sobrescreve `xmlAutorizado` ou
   `xmlAssinado`. A coluna é "escrita uma única vez; leitura infinita". Qualquer purga futura
   exige ADR própria.
5. **Acesso somente server-side**, com os guards existentes (`lib/fiscal/guard-fiscal-admin.ts`,
   `enterpriseRoleFromUserRole`, `canAccessStore`). O cliente nunca recebe o XML bruto.
6. **Nenhum XML completo em logs** (`FiscalLog.detalhe`, `console.*`, erro, trace, bundle). A
   auditoria usa só `notaFiscalId`, `chaveAcesso`, hashes SHA-256, `protocolo`, `cStat`,
   `xMotivo`, `serie`, `numero` — nunca o conteúdo.
7. **Isolamento por `storeId`** (ADR-0003): toda leitura e escrita de XML fiscal é escopada por
   loja. Loja A não lê `xmlAutorizado` da loja B.

---

## 2. Fontes oficiais

### 2.1 Ajuste SINIEF 19/2016 — institui a NFC-e (autoridade principal deste documento)

- **Emissor:** CONFAZ / SINIEF.
- **Cláusula primeira (verbatim):** *"Fica instituída a Nota Fiscal de Consumidor Eletrônica-
  NFC-e, modelo 65"*.
- **Cláusula nona (verbatim):** *"O emitente deverá manter a NFC-e em arquivo digital, sob sua
  guarda e responsabilidade, pelo prazo estabelecido na legislação tributária"*.
- **Cláusula décima:** trata do DANFE-NFC-e e da entrega ao consumidor, admitindo substituição
  por consulta via QR-Code / meio eletrônico mediante concordância do consumidor.
- **Aplicação a este projeto:** esta é **a** norma que obriga a guarda do XML da NFC-e. Ela
  fixa o *dever* e delega o *prazo* à legislação tributária (ver §2.3).
- URL: <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2016/AJ_019_16>

### 2.2 RICMS/SP, art. 202 — o prazo aplicável ao piloto paulista (autoridade do prazo)

- **Norma:** Regulamento do ICMS do Estado de São Paulo (Decreto 45.490/2000), art. 202, que
  reproduz a **Lei 6.374/89, art. 67, §5º**.
- **Caput (verbatim):** *"Os documentos fiscais, bem como faturas, duplicatas, guias, recibos e
  todos os demais documentos relacionados com o imposto, deverão ser conservados, no mínimo, pelo
  prazo de 5 (cinco) anos, e, quando relativos a operações ou prestações objeto de processo
  pendente, até sua decisão definitiva, ainda que esta seja proferida após aquele prazo (Lei
  6.374/89, art. 67, § 5º)."*
- **§ 1º:** remete ao § 2º do art. 232. **§ 2º:** em caso de dissolução de sociedade, aplicam-se
  as normas comerciais de guarda dos documentos dos negócios sociais.
- **Aplicação a este projeto:** é **esta** a norma que fecha o "prazo estabelecido na legislação
  tributária" a que a cláusula nona do Ajuste 19/2016 delega, para o piloto da Matriz em São
  Paulo (ADR-0016). Ela fixa **duas** regras, não uma: o **piso de 5 anos** e a **extensão
  indeterminada** enquanto houver processo pendente sobre a operação. A NFC-e modelo 65 é
  documento fiscal eletrônico reconhecido pelo RICMS/SP, portanto está abrangida por "documentos
  fiscais".
- URL: <https://legislacao.fazenda.sp.gov.br/Paginas/art182.aspx>

### 2.3 Ajuste SINIEF 07/2005 — institui a NF-e modelo 55 (referência subsidiária)

- **Cláusula décima (verbatim):** *"O emitente deverá manter a NF-e em arquivo digital, sob sua
  guarda e responsabilidade, pelo prazo estabelecido na legislação tributária..."*.
- **Aplicação:** o Ajuste 07/2005 institui **somente a NF-e modelo 55** — ele **não** institui
  a NFC-e. Vale aqui como referência da mesma doutrina de guarda, e porque o layout do
  `<nfeProc>` e o MOC derivam desse projeto. A obrigação da NFC-e vem do §2.1.
- URL: <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ_007_05>

### 2.4 CTN (Lei 5.172/1966) — contexto federal

- **Art. 195, parágrafo único** *(verificado)*: os livros obrigatórios de escrituração comercial
  e fiscal e **os comprovantes dos lançamentos neles efetuados** devem ser conservados **até que
  ocorra a prescrição dos créditos tributários decorrentes das operações a que se refiram**.
  Note-se que o CTN também condiciona a guarda a um **evento** (a prescrição), e não a um número
  fixo — a mesma lógica do art. 202 do RICMS/SP quanto ao processo pendente.
- **Arts. 173 e 174** — **referência complementar, pendente de conferência.** Não foram relidos
  nesta sessão e, por decisão do checkpoint humano, **não são apresentados como fundamento
  textual verificado**. O prazo do piloto **não depende deles**: decorre do art. 202 do RICMS/SP
  (§2.2). Ver pendência R-1.

### 2.5 MOC NF-e/NFC-e (ENCAT / Receita Federal / CONFAZ)

- Define o layout do `<nfeProc>`, do `digestValue`, dos dados do QR-Code da NFC-e e da URL de
  consulta por UF/ambiente. É a especificação canônica **do conteúdo** que precisa estar no
  `xmlAutorizado` — não é a fonte do prazo de guarda.
- URL: <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=3GhDwJ/ZeSI%3D>

---

## 3. Política de retenção adotada

| Item | Política | Base | Estado neste GOAL |
|---|---|---|---|
| **Prazo de guarda (piso)** | **Mínimo de 5 anos.** Na dúvida operacional, guardar **mais**, nunca menos. | Ajuste SINIEF 19/2016 cl. 9ª + **RICMS/SP art. 202** | Implementado como "guardar para sempre": **não há** mecanismo de purga |
| **Prazo estendido — processo pendente** | Quando o documento se referir a **operação ou prestação objeto de processo pendente**, conservar **até a decisão definitiva**, ainda que proferida após os 5 anos. O prazo passa a ser **indeterminado** enquanto o processo correr. | **RICMS/SP art. 202**, caput | **Automaticamente satisfeito**: como não há purga, nenhum documento é removido antes de qualquer decisão. Qualquer purga futura terá de implementar esta regra **antes** de existir |
| **Responsável pela retenção** | O **emitente** — a loja proprietária da nota, identificada por `storeId`. | Ajuste SINIEF 19/2016 cl. 9ª ("sob sua guarda e responsabilidade") | A responsabilidade legal é da loja; o sistema materializa a guarda na coluna |
| **Disponibilidade ao Fisco** | XML autorizado (`<nfeProc>`, com protocolo) apresentável em meio eletrônico mediante requisição. | Ajuste SINIEF 19/2016 · MOC | `readAuthorizedDocument` devolve os bytes ao serviço autorizado |
| **Disponibilidade ao consumidor** | DANFE-NFC-e e/ou consulta por QR-Code (`qrCodeData` + `urlConsulta`). | Ajuste SINIEF 19/2016 cl. 10ª | `qrCodeData`/`urlConsulta` **persistidos**; a renderização é do GOAL-021 |
| **Imutabilidade do XML autorizado** | Imutável após a primeira persistência; mesmos bytes convergem, bytes divergentes são recusados. | ADR-0008 P4 · ADR-0017 · ADR-0018 | Implementada em `markAuthorized` |
| **Imutabilidade do protocolo** | Imutável após a autorização. | ADR-0017 · ADR-0018 | Implementada em `markAuthorized` |
| **Purga automática** | **Nenhuma nesta geração.** Uma purga futura só é admissível se, além da ADR própria, souber identificar documentos sob **processo pendente** e preservá-los indefinidamente. | Decisão defensiva + RICMS/SP art. 202 | Respeitada: não existe rotina de limpeza |
| **Backup** | Coberto pelo backup automático do Postgres (Supabase), já que o XML vive em coluna `@db.Text`. | Plano Supabase | Garantido pela decisão coluna-primária |
| **Espelho privado** | Opcional. Se/quando provisionado, grava cópia imutável, preenche `xmlStorageRef` e verifica hash coluna × espelho — **a coluna continua primária**. | ADR-0014 (KMS, não provisionado) · ADR-0018 §2.4 | **No-op**: `active === false`, `xmlStorageRef` nulo |
| **Corrupção do XML assinado** | SHA-256 diverge ⇒ `PERSISTED_BYTES_MISMATCH`; transmissão bloqueada; reconciliação por chave. | ADR-0017 | Já implementado (herdado) |
| **Corrupção do XML autorizado** | Substituição bloqueada; alerta humano; **sem** reconstrução automática. | ADR-0018 §2.8 | Implementada (divergência ⇒ erro) |
| **Perda do XML autorizado** | Nota permanece `AUTORIZADA` em estado degradado; alerta humano; restore do Postgres é o único caminho; **não** se reemite (número já consumido). | ADR-0008 P4 · ADR-0018 §2.7 | Sem rebuild automático |

---

## 4. Invariantes auditáveis

Cada linha abaixo tem teste correspondente em
`lib/fiscal/storage/xml-protocol-storage.test.ts`:

- O `xmlAutorizado` de uma nota `AUTORIZADA` é **idêntico** em toda leitura futura ao que foi
  persistido na autorização.
- Substituir o `xmlAutorizado` com bytes divergentes lança `xml_autorizado_imutavel_diverge`.
- Substituir o `protocolo` lança `protocolo_imutavel_diverge`.
- Alterar `cStat`/`xMotivo` sobre o mesmo XML lança `metadados_autorizacao_divergem`.
- Ler o XML de outra loja devolve `null` — nunca os bytes.
- Ler sem `storeId` lança `store_id_obrigatorio` **antes** de tocar o banco.
- `FiscalLog.detalhe` não contém nenhum trecho de XML — só hashes e identificadores.
- Com o espelho ativo, divergência coluna × espelho é registrada e **a coluna vence**.
- Falha do espelho **não** derruba uma autorização já persistida.

---

## 5. Alteração futura desta política

Qualquer mudança (purga, compressão, retenção criptográfica, storage externo) exige:

1. Nova ADR referenciando ADR-0017 e ADR-0018.
2. Análise de cumprimento legal com o MOC vigente, os Ajustes SINIEF **e o regulamento de ICMS
   da UF de cada loja** (para SP, o art. 202 do RICMS/SP).
3. **Tratamento explícito do processo pendente** (RICMS/SP art. 202): nenhuma purga pode remover
   documento de operação sob processo não decidido definitivamente.
4. Janela de observação de risco.
5. Aprovação humana (Gate #2).
6. Implementação progressiva por loja — nunca em lote (ADR-0009 D9).

---

## 6. Pendências abertas (não resolvidas neste GOAL)

| # | Pendência | Situação |
|---|---|---|
| R-1 | Texto verbatim do CTN arts. 173/174 | **Aberta, mas não bloqueante.** `planalto.gov.br` recusou as conexões desta sessão. Por decisão do checkpoint, são **referência complementar**: o prazo do piloto se sustenta no RICMS/SP art. 202 sem depender deles |
| R-2 | Prazo de guarda na legislação estadual (RICMS/SP) | ✅ **FECHADA em 2026-07-23.** Art. 202 do RICMS/SP lido verbatim na Sefaz-SP: confirma o piso de **5 anos** e acrescenta a extensão por **processo pendente**. A NFC-e modelo 65 é documento fiscal eletrônico reconhecido pelo RICMS/SP |
| R-3 | Parecer contábil/jurídico formal sobre a política | Aberta — fora da competência de engenharia; decisão de Rafael |
| R-4 | Provisionamento do espelho privado | Aberta — exige bucket/credencial, proibido neste GOAL |
| R-5 | Custo de armazenamento do XML integral em Postgres a longo prazo | Aberta — monitorar; compressão é ADR futura |
| R-6 | Legislação de **outras UFs** quando o piloto sair de SP | Aberta — cada UF tem seu regulamento de ICMS; o art. 202 vale para SP (ADR-0016) |

---

## 7. Referências

- [`ADR-0018`](../decisions/ADR-0018-persistencia-legal-xml-e-protocolo.md) — decisão que esta política detalha
- [`ADR-0008`](../decisions/ADR-0008-fiscal-architecture.md) — P4, snapshot imutável
- [`ADR-0017`](../decisions/ADR-0017-estado-incerto-reconciliacao-por-chave.md) — persistência pré-transmissão e reconciliação
- [`ADR-0016`](../decisions/ADR-0016-piloto-homologacao-sp-matriz-rafacell.md) — piloto SP (origem da pendência R-2)
- [`docs/architecture/NFCE_ARCHITECTURE.md`](../architecture/NFCE_ARCHITECTURE.md)
- Ajuste SINIEF 19/2016: <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2016/AJ_019_16>
- **RICMS/SP art. 202** (Decreto 45.490/2000; Lei 6.374/89 art. 67 §5º):
  <https://legislacao.fazenda.sp.gov.br/Paginas/art182.aspx>
- Ajuste SINIEF 07/2005: <https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ_007_05>
- CTN (Lei 5.172/1966): <https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm>
- Portal NF-e (MOC): <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=3GhDwJ/ZeSI%3D>
