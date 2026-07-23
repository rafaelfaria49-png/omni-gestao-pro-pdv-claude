---
title: ADR-0017 · Estado incerto e reconciliação obrigatória antes de retransmitir
status: aceita
data: 2026-07-23
autor: Codex (GOAL-012)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, idempotencia, reconciliacao, timeout, fila]
superado_por:
substitui:
---

# ADR-0017 · Estado incerto e reconciliação obrigatória antes de retransmitir

> **Status:** aceita
> **Decisão em uma frase:** depois que os bytes assinados forem persistidos e a transmissão começar,
> qualquer resultado não conclusivo mantém a nota em `TRANSMITINDO` e exige consulta por chave;
> somente “não encontrada” autoriza uma única retransmissão dos mesmos bytes.

---

## 1. Contexto

Uma perda de resposta depois do envio não informa se a SEFAZ recebeu e autorizou a NFC-e. Tratar
timeout como falha definitiva e reconstruir/reassinar/retransmitir pode produzir documento
duplicado, divergir da chave já consumida ou perder a evidência exata do que foi enviado.

O schema atual já contém `NotaFiscal.chaveAcesso`, numeração, `xmlAssinado`, estado
`TRANSMITINDO`, fila com dedupe/lease/payload e `FiscalLog`. Portanto a doutrina pode ser
implementada sem migration. O provider continua exclusivamente stub/teste; nenhuma integração
SEFAZ é ativada.

**Restrições:**

- escopo obrigatório por `storeId`, `notaFiscalId` e `vendaId`;
- NFC-e modelo 65 em `HOMOLOGACAO`; produção permanece bloqueada;
- chave, série, número e bytes assinados definidos e persistidos antes do provider;
- número alocado nunca retorna ao contador;
- nenhuma credencial, certificado ou XML é exposto em logs/relatórios.

---

## 2. Decisão

Adotar uma máquina operacional fail-closed com as seguintes fronteiras:

1. o pipeline finaliza chave e XML assinado uma única vez;
2. persiste nota, identidade fiscal, bytes exatos e `TRANSMITINDO` antes da chamada ao provider;
3. um resultado conclusivo é persistido normalmente;
4. timeout, conexão perdida ou retorno desconhecido cria/reencontra um job `CONSULTA` deduplicado
   por `(storeId, notaFiscalId)` e estaciona a emissão em `AGUARDANDO_RETRY` sem data;
5. nota `TRANSMITINDO` jamais chama builder ou signer durante retomada;
6. a consulta é a única autoridade para resolver a incerteza:
   - `AUTHORIZED`: persiste protocolo/retorno disponível e conclui;
   - `NOT_FOUND`: libera uma autorização consumível para transmitir exatamente os bytes
     persistidos;
   - `REJECTED`: mantém o número consumido, marca rejeição e encaminha futura inutilização;
7. autorização de retry vale para uma tentativa. Se um worker morrer depois de consumi-la, nova
   transmissão volta a ficar bloqueada até reconciliação.

O reconciliador varre apenas notas `TRANSMITINDO` mais antigas que um threshold configurável,
respeita pausa global/por loja e não concorre com lease de emissão ainda válido.

**O que esta decisão não inclui:**

- transporte SOAP, endpoint, certificado ou chamada real à SEFAZ;
- produção, `tpAmb=1` ou mudança de `fiscalEnabled`;
- builder XML, XSD, assinatura ou motor tributário;
- armazenamento legal completo/retention policy do XML autorizado, reservado ao GOAL-013;
- chamada de inutilização, reservada ao GOAL-019;
- schema ou migration.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Decisão |
|---|---|---|---|
| Retry automático após timeout | Simples | Pode duplicar documento autorizado sem resposta local | Rejeitada |
| Reconstruir/reassinar na retomada | Reexecuta pipeline conhecido | Pode alterar bytes e invalida a evidência do envio original | Rejeitada |
| Marcar falha definitiva | Fecha o job rapidamente | Confunde ausência de resposta com rejeição | Rejeitada |
| Consulta obrigatória + retomada dos bytes persistidos | Preserva identidade e evita duplicidade | Exige estado estacionado, reconciliador e métricas | **Escolhida** |

---

## 4. Consequências

### 4.1 Positivas

- timeout não produz retransmissão cega;
- takeover de worker converge sem reconstruir o documento;
- chave, número e bytes transmitidos permanecem auditáveis;
- dedupe e isolamento por loja são mantidos no banco atual.

### 4.2 Negativas / Custos

- notas podem permanecer em `TRANSMITINDO` até a consulta;
- a operação precisa monitorar backlog, idade e resultados de reconciliação;
- uma autorização consumida seguida de nova morte exige outra consulta.

### 4.3 Riscos introduzidos

- **Consulta prematura:** threshold mínimo e respeito a lease válido.
- **Job duplicado:** `@@unique([storeId, dedupeKey])` e upsert.
- **Bytes alterados:** SHA-256 e releitura do `xmlAssinado` antes do provider.
- **Loop de retry:** autorização consumível e `AGUARDANDO_RETRY` sem data enquanto incerto.

### 4.4 O que muda imediatamente

- a fila distingue `uncertain` de erro transitório;
- `AGUARDANDO_RETRY` sem data deixa de ser elegível;
- surge o reconciliador e o contrato de consulta/retomada exata;
- surgem métricas e drills A/B/C exclusivamente simulados.

### 4.5 O que muda no longo prazo

- o provider SEFAZ deverá implementar transmissão e consulta sem alterar esta máquina;
- GOAL-013 completa armazenamento/retention do XML autorizado;
- GOAL-019 executa inutilização quando legalmente aplicável.

---

## 5. Plano de implementação

- Implementação candidata: GOAL `FISCAL-UNCERTAIN-STATE-RECONCILIATION-012`.
- Owner humano: Rafael Faria.
- Pré-requisitos de ativação externa: aceite desta ADR, GOAL-013, provider homologado e preflight
  completo da Matriz/SP.
- Critério de pronto desta proposta: drills A/B/C verdes, bytes idênticos no único retry permitido,
  zero transmissão antes da consulta e zero builder/signer na retomada.

---

## 6. Validação / como saberemos que deu certo

- 100% dos resultados incertos geram uma única consulta por nota/loja.
- 0 retransmissões antes de `CONSULTA=NOT_FOUND`.
- 100% das retomadas usam SHA-256 e bytes base64 idênticos aos do primeiro envio.
- 0 chamadas a builder, signer ou allocator na retomada.
- 0 reutilizações de número rejeitado.
- métricas de backlog, idade, consultas pendentes, autorizações, “não encontrada” e rejeições.

---

## 7. Referências

- ADR-0008 (arquitetura fiscal).
- ADR-0015 (SEFAZ direta em homologação).
- ADR-0016 (piloto Matriz/SP).
- `docs/architecture/NFCE_ARCHITECTURE.md`.
- `docs/fiscal/FISCAL_UNCERTAIN_DRILL_001.md`.

---

## 8. Notas / discussão

- O comando atual chama esta decisão de **ADR-P07**. A reconstrução histórica
  `FISCAL_CONTINUATION_ADRS_PROPOSTOS_001.md` chamou o mesmo tema de ADR-P08 e reservou P07 para
  persistência de XML autorizado. O histórico não foi reescrito nem renumerado; para este
  checkpoint, o identificador global livre e inequívoco é **ADR-0017**.
- A decisão não altera ADRs aceitas nem a referência histórica P08.
- Aceitação humana registrada em 2026-07-23 por Rafael Faria, após apresentação dos três drills,
  da identidade dos bytes e dos guards contra retransmissão/reconstrução indevida.
