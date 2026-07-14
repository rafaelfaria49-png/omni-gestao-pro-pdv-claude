---
title: ADR-0011 · Assinatura XMLDSig da NFC-e em RSA-SHA1/SHA-1 — imposta pelo schema oficial
status: aceita
data: 2026-07-14
autor: Claude Opus 4.8 (GOAL FISCAL-XSD-WORKER-IMPLEMENTATION)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, xmldsig, assinatura, sha1, criptografia, seguranca, conformidade]
substitui:
superado_por:
relacionada: [ADR-0010, ADR-0009]
---

# ADR-0011 · Assinatura XMLDSig da NFC-e em RSA-SHA1/SHA-1 — imposta pelo schema oficial

> **Resumo em uma linha.** O SHA-1 na assinatura XML fiscal **não é escolha arquitetural**: é valor
> `fixed` no schema oficial da NF-e. Usá-lo é obrigatório para emitir; usá-lo **fora** da assinatura
> XML fiscal é proibido.

---

## 1. Contexto e problema

A ADR-0010 decidiu validar o XML fiscal contra o **pacote XSD oficial** (`PL_010e_v1.02`) num worker
containerizado com `xmllint` provisionado (opção B2). Na **primeira execução real** desse worker
contra o pacote oficial — GOAL `FISCAL-XSD-WORKER-IMPLEMENTATION`, CI run `29353961627` — o XML
produzido e assinado pelo nosso próprio pipeline foi **reprovado**.

Investigação: o módulo `lib/fiscal/signing` emitia, deliberadamente e documentado no código,

```
SignatureMethod = http://www.w3.org/2001/04/xmldsig-more#rsa-sha256
DigestMethod    = http://www.w3.org/2001/04/xmlenc#sha256
```

enquanto o schema oficial **fixa** outros valores. Consequência prática: **toda NFC-e assinada por
este sistema seria XSD-inválida e rejeitada pela SEFAZ** na recepção. O defeito estava latente
porque, antes do worker B2, `validarXsd` era um no-op placebo e os testes injetam adapter falso —
nada nunca confrontou a assinatura com o schema real.

### 1.1 Forças de decisão

- **Conformidade fiscal é binária.** Documento que não valida no XSD da SEFAZ não é emitido. Não há
  meio-termo, degradação graciosa ou negociação de algoritmo.
- **SHA-1 é criptograficamente fraco** (colisões práticas desde *SHAttered*, 2017). Adotá-lo é um
  custo de segurança real, não um detalhe.
- **A imposição é externa e verificável.** Não depende de interpretação: está `fixed` em XSD
  versionado, com hash conferido, dentro do repositório.
- **O risco de contaminação é o verdadeiro perigo.** O dano não é o SHA-1 na assinatura fiscal (onde
  é inevitável), e sim o SHA-1 **vazar** para senhas, tokens, integridade interna ou outros domínios
  sob o pretexto de "já usamos SHA-1 no projeto".

---

## 2. Evidência — os algoritmos estão `fixed` no XSD oficial versionado

Conferido **antes** da alteração, nos arquivos versionados e com **integridade validada** contra
`lib/fiscal/xsd/manifest.json` (o manifesto, por sua vez, confere com `manifest.sha256`).

**Arquivo:** `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/xmldsig-core-schema_v1.01.xsd`
**SHA-256 medido:** `f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac`
**SHA-256 declarado no manifesto:** idêntico ✅

| Linha | Trecho literal | Efeito |
|---|---|---|
| **29** | `<attribute name="Algorithm" type="anyURI" use="required" fixed="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` | C14N **fixo** |
| **34** | `<attribute name="Algorithm" type="anyURI" use="required" fixed="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` | `SignatureMethod` **fixo em RSA-SHA1** |
| **52** | `<attribute name="Algorithm" type="anyURI" use="required" fixed="http://www.w3.org/2000/09/xmldsig#sha1"/>` | `DigestMethod` **fixo em SHA-1** |
| **69** | `<element name="Transform" type="ds:TransformType" minOccurs="2" maxOccurs="2"/>` | exatamente **2** `Transform` |
| **94-95** | `<enumeration value="…#enveloped-signature"/>` · `<enumeration value="…REC-xml-c14n-20010315"/>` | únicas URIs de `Transform` |

**Arquivo:** `lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/leiauteNFe_v4.00.xsd`
**SHA-256:** `598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7` (confere com o manifesto)

| Linha | Trecho literal | Efeito |
|---|---|---|
| **6683** | `<xs:element ref="ds:Signature"/>` — **sem** `minOccurs="0"` | `Signature` é **obrigatória** em `TNFe` |

> Em XSD, `fixed` num atributo significa: se o atributo estiver presente, seu valor **tem que ser
> exatamente aquele**. Não é *default*, não é sugestão. Qualquer outra URI reprova a validação.

### 2.1 Fontes oficiais

- **Pacote XSD:** *Schemas XML NF-e — 010e v.1.02* (NT 2025.002 v.1.40, NT 2026.002 v.1.0, NT 2026.003 v.1.0),
  publicado em 2026-07-10 pelo **Portal Nacional da NF-e**.
  Índice: `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D`
  Arquivo: `PL_010e_v1.02.zip` · sha256 `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1`
  (proveniência completa em `lib/fiscal/xsd/manifest.json` e `docs/fiscal/FISCAL_XSD_MANIFEST_001.md`).
- **MOC NF-e** — Manual de Orientação ao Contribuinte, item de Assinatura Digital: XMLDSig envelopada,
  *Reference* ao `infNFe`, C14N, digest e assinatura no padrão fixado pelo schema acima.
- A autoridade final, para efeito desta ADR, é o **XSD versionado no repositório** — não a
  documentação em prosa. O XSD é o que o validador executa e o que a SEFAZ aplica.

---

## 3. Alternativas consideradas

| Alternativa | Avaliação |
|---|---|
| **Manter RSA-SHA256/SHA-256** | **Rejeitada.** Fisicamente impossível emitir: reprova no XSD, a SEFAZ rejeita. "Mais seguro" que não emite nota não é uma opção de negócio. |
| **Assinar em SHA-256 e relaxar a validação XSD** | **Rejeitada com veemência.** Esconderia o defeito atrás de um gate enfraquecido e produziria documentos que a SEFAZ rejeitaria em produção. Inverte o propósito da ADR-0010. |
| **Assinar em SHA-1 apenas quando o destino for a SEFAZ** | **Rejeitada.** Dois caminhos de assinatura = dois caminhos de bug. O documento fiscal tem um único formato válido. |
| **RSA-SHA1 + SHA-1, confinado à assinatura XML fiscal** | **ESCOLHIDA.** Único caminho que emite documento válido, com o custo de segurança explicitamente cercado, medido e com gatilho de revisão. |

---

## 4. Decisão

A assinatura XMLDSig da NF-e/NFC-e usa **exatamente** os algoritmos fixados pelo schema oficial:

```
CanonicalizationMethod : http://www.w3.org/TR/2001/REC-xml-c14n-20010315
SignatureMethod        : http://www.w3.org/2000/09/xmldsig#rsa-sha1
DigestMethod           : http://www.w3.org/2000/09/xmldsig#sha1
Transforms             : enveloped-signature + C14N (exatamente 2, nesta ordem)
```

Implementação em `lib/fiscal/signing` (`signer.types.ts`, `xmldsig-builder.ts`, `nfce-signer.ts`):
assinatura (`cryptoSign`), verificação (`cryptoVerify`) e digest do `infNFe` **coerentes em SHA-1**.

### 4.1 Cláusulas inegociáveis

1. **SHA-1 NÃO foi escolhido por preferência arquitetural.** Se a decisão fosse nossa, seria SHA-256.
2. **O uso é imposto** pelo schema/MOC vigente da NF-e/NFC-e — valor `fixed`, verificado em §2.
3. **A decisão limita-se à assinatura XML fiscal** (`lib/fiscal/signing`). Nada além disso.
4. **SHA-1 é PROIBIDO em qualquer outro domínio** deste sistema: senhas, tokens, sessões, PIN,
   integridade interna, idempotência, cache, `localKey`, hashes de auditoria ou de payload.
   Em particular, o hash de integridade do envelope do worker XSD (`xmlSha256`, em
   `lib/fiscal/dry-run/dry-run-validation.ts`) **permanece SHA-256** — e assim deve continuar.
5. **A decisão deve ser revista IMEDIATAMENTE** quando a SEFAZ publicar schema com algoritmo mais
   forte. Não é revisão "quando der": é gatilho (§7).

---

## 5. Escopo — o que muda e o que explicitamente NÃO muda

**Muda (mínimo):** `lib/fiscal/signing/{signer.types.ts, xmldsig-builder.ts, nfce-signer.ts, index.ts}`
e `nfce-signer.test.ts`.

**NÃO muda:** certificado A1 e sua resolução (ADR-0009 · `FiscalSecretVault`); provider SEFAZ (segue
`STUB_HOMOLOGACAO`); fila; banco/Prisma; numeração; ativação fiscal. **A frente fiscal permanece
dormente** — sem emissão, sem transmissão, sem chamada à SEFAZ.

---

## 6. Riscos, mitigação e consequências

### 6.1 Riscos

| Risco | Severidade | Descrição |
|---|---|---|
| **Contaminação de domínio** | **Alta** | Alguém replica SHA-1 para senhas/tokens/integridade "porque o projeto já usa". É o risco real desta ADR. |
| Colisão de SHA-1 na assinatura | Baixa (residual) | Colisão exige controle do conteúdo assinado; aqui o conteúdo é um `infNFe` estruturado, validado por XSD, com chave de acesso e DV. O vetor prático é remoto — mas não nulo. |
| Sinalização errada em auditoria | Média | Scanner de segurança/SAST acusa "SHA-1 fraco" e o achado é fechado como falso-positivo sem contexto. |
| Congelamento por inércia | Média | A SEFAZ moderniza e nós não percebemos, mantendo SHA-1 sem necessidade. |

### 6.2 Mitigação

- **Confinamento declarado em código.** Os comentários de `signer.types.ts` e `xmldsig-builder.ts`
  dizem explicitamente: SHA-1 vale só aqui; para qualquer outro uso, SHA-256.
- **Nome honesto.** As constantes se chamam `ALG_SIGNATURE_RSA_SHA1` / `ALG_DIGEST_SHA1` e o helper
  é `sha1Base64` — nunca um nome que minta sobre o algoritmo que carrega.
- **Testes travam o comportamento**, positivo e negativo (`nfce-signer.test.ts`): os 4 algoritmos
  fixados; exatamente 2 `Transform`; `DigestValue` de **20 bytes** (SHA-1) e não 32 (SHA-256);
  **ausência** dos URIs de SHA-256; digest trocado por SHA-256 **não confere**.
- **O gate XSD é a rede de segurança.** Com o worker B2 (ADR-0010) ativo no dry-run, qualquer regressão
  de algoritmo volta a reprovar imediatamente — foi assim que o defeito apareceu.
- **Superfície mínima.** SHA-1 não aparece em nenhum outro módulo; grep em `lib/fiscal/signing`
  não deixa resíduo de SHA-256 e nenhum outro pacote importa `sha1Base64`.

### 6.3 Consequências

**Positivas:** documento fiscal passa a ser XSD-válido e aceitável pela SEFAZ; o gate XSD deixa de
estar em contradição com o assinador; a decisão criptográfica fica rastreável em vez de implícita
num literal de código.

**Negativas:** carregamos SHA-1 na assinatura fiscal enquanto a SEFAZ não modernizar; scanners vão
acusar; a dívida é externa e não podemos quitá-la sozinhos.

---

## 7. Gatilho de substituição

Esta ADR deve ser **reaberta imediatamente** se qualquer um ocorrer:

1. a SEFAZ publicar pacote XSD cujo `SignatureMethod`/`DigestMethod` `fixed` aponte para algoritmo
   mais forte (ex.: `rsa-sha256`), ou passar a aceitá-lo por `enumeration`;
2. Nota Técnica da NF-e anunciar migração de algoritmo de assinatura;
3. o processo de atualização regulatória de XSD (`docs/fiscal/FISCAL_XSD_REGULATORY_UPDATE_PROCESS_001.md`)
   detectar mudança de bytes nos elementos de `xmldsig-core-schema`.

**Ação no gatilho:** atualizar `ALG_SIGNATURE_*`/`ALG_DIGEST_*` e o par `cryptoSign`/`cryptoVerify`,
migrar os testes, e **superar esta ADR** (`superado_por:`). O gate XSD do dry-run valida a migração
antes de qualquer emissão.

> **Nunca** alterar o algoritmo sem o XSD oficial correspondente versionado e com hash conferido.
> A fonte da verdade é o schema, não a expectativa.

---

## 8. Relação com outras decisões e GOALs

- **ADR-0010** (validação XSD em worker containerizado): é a **causa** desta ADR. Sem o worker B2
  validando contra o pacote oficial, o defeito de algoritmo permaneceria latente e teria sido
  descoberto só na homologação/produção da SEFAZ. Esta ADR é a primeira dívida real que a ADR-0010
  cobrou — e a justifica.
- **ADR-0009** (`FiscalSecretVault`): intocada. A **resolução** do certificado A1 continua sob o cofre;
  esta ADR só define **como** o material já resolvido assina.
- **GOAL responsável pela assinatura:** `BL-FISCAL-005 · F4` (signer + C14N + EnvVault). Esta ADR
  corrige um defeito de conformidade dessa frente; **não** a ativa, não adiciona caller produtivo e
  não altera seu estado dormente (ver `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md`, linha F4).
- **GOAL desta correção:** `FISCAL-XSD-WORKER-IMPLEMENTATION` — evidência em
  `docs/fiscal/FISCAL_XSD_WORKER_IMPLEMENTATION_MERGE_READINESS.md`.

---

## 9. Status

**Aceita** em 2026-07-14. A mudança de algoritmo está implementada, coberta por testes positivos e
negativos, e verificada pelo worker XSD B2 contra o pacote oficial `PL_010e_v1.02`.

A frente fiscal **permanece dormente**: sem emissão, sem SEFAZ, sem persistência, sem caller produtivo.
