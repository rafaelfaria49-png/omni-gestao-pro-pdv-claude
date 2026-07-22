---
title: ADR-0015 · Integração direta com a SEFAZ na homologação inicial
status: aceita
data: 2026-07-22
autor: Codex (checkpoint arquitetural fiscal)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, sefaz, homologacao, provider, soap, paa]
superado_por:
substitui: ADR-0008 Gate G-F5
---

# ADR-0015 · Integração direta com a SEFAZ na homologação inicial

> **Status:** aceita
> **Decisão em uma frase:** A primeira integração fiscal externa do OmniGestão será direta com os
> Web Services de **homologação da SEFAZ**, implementada atrás do contrato `FiscalProvider`, sem
> gateway/PAA e sem qualquer autorização para emissão em produção.

---

## 1. Contexto

A ADR-0008 fixou a arquitetura provider-agnóstica, mas deixou para o Gate G-F5 a escolha entre
SEFAZ direta e gateway. O pipeline dormente já possui contrato `FiscalProvider` e provider STUB,
mas não existe transporte real. Este checkpoint fecha o Gate G-F5 e define a primeira fronteira
externa sem implementar código nem realizar transmissão.

O Manual de Orientação do Contribuinte (MOC) é a especificação oficial da integração entre os
sistemas emissores e as administrações tributárias. O Portal NF-e publica uma relação própria de
Web Services de homologação, por autorizador/UF, atualmente na família 4.00. Esses endpoints e
roteamentos mudam fora do domínio do OmniGestão e, portanto, devem ficar encapsulados no adapter.

O PAA — **Provedor de Assinatura e Autorização de Documentos Fiscais Eletrônicos** — é uma
alternativa regulada e tecnicamente especificada, mas não participa da primeira homologação.

**Restrições obrigatórias:**

- O OmniGestão permanece responsável por toda a semântica fiscal e pelo registro legal resultante.
- A única rede externa inicialmente permitida é a homologação SEFAZ.
- SOAP, WSDL, endpoint, certificado de transporte e peculiaridade de autorizador/UF não podem
  atravessar a fronteira `FiscalProvider` nem contaminar o domínio.
- Gateway e PAA não serão usados como fallback automático.
- Produção continua bloqueada pelo Gate G-F12.
- Esta ADR é somente decisão; não autoriza código, credenciais, certificado real, alteração de
  ambiente, provisionamento ou chamada a Web Service.

**Estado atual relevante:**

- `FiscalProvider` existe em `lib/fiscal/provider/types.ts` e o resolver registra apenas o STUB.
- O request atual de `emitir` carrega o snapshot; antes do provider real, o contrato deverá ser
  evoluído para entregar ao transporte o XML já gerado, assinado e validado pelo pipeline local.
- `ConfiguracaoFiscalLoja.provider` já prevê `SEFAZ_DIRETO`; `fiscalEnabled` permanece default-off.

---

## 2. Decisão

Adotar **`SefazDiretoProvider`** como primeira implementação real de `FiscalProvider`, restrita à
homologação. O adapter de transporte não se torna o domínio fiscal: ele traduz comandos e respostas
canônicos para o protocolo oficial da SEFAZ.

### 2.1 Responsabilidade integral do OmniGestão

O pipeline local é responsável, nesta ordem lógica, por:

1. congelar o snapshot fiscal;
2. calcular tributos;
3. alocar a numeração fiscal de forma atômica;
4. gerar o XML e a chave de acesso;
5. validar o XML contra o XSD oficial versionado;
6. assinar o XML com o certificado autorizado;
7. entregar ao `FiscalProvider` um envelope imutável, assinado e validado;
8. transmitir por meio do provider;
9. interpretar/reconciliar resultado certo, rejeição ou resultado incerto;
10. persistir protocolo, status, resposta e XML autorizado imutável.

Gateway, PAA ou transporte direto nunca recalculam tributos, numeração ou snapshot e não
reconstroem o XML a partir de dados vivos. Reprocessar significa consultar ou retransmitir o mesmo
XML assinado conforme as regras de idempotência, nunca regenerá-lo silenciosamente.

### 2.2 Fronteira `FiscalProvider`

O domínio enxerga somente tipos canônicos. A implementação futura deverá ajustar o contrato atual
antes da transmissão real para que `emitir` receba, no mínimo, um envelope equivalente a:

```text
storeId
notaFiscalId
modelo
ambiente
uf
chaveAcesso
xmlAssinadoValidado
hashDoXml
idempotencyKey/correlationId
```

O contrato não expõe SOAP envelope, WSDL, URL, header específico, namespace de autorizador ou
detalhe de biblioteca HTTP/TLS. `FiscalProviderResponse` continua sendo a resposta canônica para o
pipeline, contendo resultado, `cStat`, `xMotivo`, recibo/protocolo, data de autorização, erros e
eventos necessários à reconciliação.

As operações canônicas permanecem:

- `emitir`;
- `consultar` por chave/recibo/protocolo;
- `cancelar`;
- `inutilizar`;
- `statusServico`.

### 2.3 Camada de transporte SEFAZ

`SefazDiretoProvider` delega detalhes de wire a uma camada server-side própria, conceitualmente:

```text
Fiscal pipeline
  -> FiscalProvider (contrato canônico)
    -> SefazDiretoProvider (tradução canônica)
      -> SefazEndpointResolver (UF + ambiente + serviço + versão)
      -> SefazSoapTransport (SOAP/TLS/timeouts)
        -> Web Service oficial de homologação
```

Regras:

- O resolver usa catálogo versionado derivado das fontes oficiais; nenhuma regra de negócio contém
  URL ou `if` específico de UF.
- A resolução considera UF, ambiente, modelo, serviço, versão e autorizador competente
  (estadual, SVRS, SVAN ou outro oficialmente indicado).
- O transporte aplica SOAP, namespaces, headers, TLS/mTLS, timeout e parsing estrito. Segredos são
  resolvidos server-side pelo cofre fiscal e nunca entram em log ou tipos do domínio.
- Resposta SOAP crua nunca governa state machine diretamente; primeiro é normalizada.
- Endpoint desconhecido, divergência de ambiente/UF/versão, XSD inválido, assinatura inválida,
  certificado indisponível ou resposta não autenticável resultam em **fail-closed**.

### 2.4 Homologação exclusiva

A primeira implementação real aceita somente:

- `ambiente = HOMOLOGACAO`;
- `tpAmb = 2` no documento/comando correspondente;
- endpoint presente no catálogo oficial de homologação;
- loja-piloto e UF explicitamente autorizadas no GOAL de execução;
- certificado e CSC próprios para o cenário de homologação aplicável.

Qualquer tentativa de resolver endpoint de produção, usar `tpAmb = 1`, ativar configuração de
produção ou transmitir fora da allow-list falha antes da rede. Não haverá credenciais, endpoints ou
feature flag de produção habilitados como consequência desta ADR.

### 2.5 Reconciliação e persistência legal

O OmniGestão mantém a responsabilidade por:

- distinguir rejeição definitiva, autorização, processamento pendente e resultado incerto;
- em timeout/resultado incerto, consultar a SEFAZ por chave/recibo antes de retransmitir;
- impedir nova numeração ou novo XML para a mesma tentativa;
- persistir `cStat`, `xMotivo`, recibo, protocolo, data de autorização, autorizador, versão do
  serviço/schema, hash e correlation id;
- persistir o XML assinado enviado e o XML autorizado/protocolado no formato oficial aplicável,
  imutável e associado à chave de acesso;
- manter resposta/trilha suficiente para auditoria sem registrar certificado, senha, CSC ou DEK;
- retomar a persistência após falha local consultando o estado remoto, sem duplicar autorização.

A autorização externa e a persistência local não formam uma transação distribuída. Por isso,
resultado incerto nunca é tratado como simples “falha e reenviar”; primeiro ocorre reconciliação.

### 2.6 Evolução futura preservada

`FiscalProvider` continua permitindo adapters futuros para:

- gateway fiscal;
- PAA;
- provider alternativo;
- autorizador/contingência oficial;
- fallback controlado e explicitamente aprovado.

Gateway/PAA devem ser reavaliados por nova ADR se houver custo operacional elevado, dificuldade de
manutenção por UF, exigência regulatória, necessidade de contingência terceirizada ou expansão
rápida para muitos estados. Nenhuma falha da SEFAZ autoriza troca automática de provider; fallback
entre provedores exige política explícita, auditoria, idempotência e gate humano.

**O que esta decisão NÃO inclui (escopo fechado):**

- Não implementa `SefazDiretoProvider`, transporte SOAP, catálogo de endpoints ou mudança no
  contrato TypeScript.
- Não baixa XSD/WSDL, não configura certificado/CSC e não chama endpoint externo.
- Não escolhe ainda a UF da loja-piloto nem cadastra contribuintes em homologação.
- Não implementa eventos, contingência, gateway ou PAA.
- Não liga `fiscalEnabled`, não muda `ambiente` e não autoriza produção.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Decisão |
|---|---|---|---|
| **A) SEFAZ direta em homologação atrás de `FiscalProvider`** | Controle do pipeline e do registro legal; valida a arquitetura própria; sem dependência inicial de gateway | SOAP/XSD/certificado; manutenção por autorizador/UF; maior responsabilidade operacional | **Escolhida** |
| B) Gateway fiscal na primeira homologação | Integração mais uniforme; reduz detalhes por UF | Custo/dependência; não valida o transporte direto; delega parte operacional | Não escolhida agora; alternativa futura |
| C) PAA na primeira homologação | Intermedia assinatura e autorização sob modelo regulado | Fluxo e requisitos próprios; adiciona terceiro antes de validar o pipeline local | Não escolhido agora; alternativa futura |
| D) Domínio chamando SOAP/endpoint diretamente | Menos camadas no primeiro request | Acoplamento a UF/protocolo; impede troca de provider e dificulta testes | Proibida |

---

## 4. Consequências

### 4.1 Positivas

- Fecha o Gate G-F5 e mantém a arquitetura provider-agnóstica da ADR-0008.
- O OmniGestão controla cálculo, documento, reconciliação e evidência legal ponta a ponta.
- A primeira homologação exercita a fronteira real sem autorizar produção.
- Gateway/PAA permanecem substituíveis sem contaminar o domínio.

### 4.2 Negativas / Custos

- O projeto assume evolução de schemas, notas técnicas, endpoints e diferenças por autorizador.
- SOAP/mTLS, resultados assíncronos e reconciliação exigem testes de integração rigorosos.
- Expansão multi-UF custa mais do que um gateway uniforme.

### 4.3 Riscos introduzidos

- **Drift de endpoint/schema** · mitigação: catálogo e artefatos versionados a partir do Portal
  oficial; smoke test de `statusServico`; fail-closed.
- **Autorizou remotamente e falhou ao persistir** · mitigação: consulta/reconciliação por chave ou
  recibo antes de retransmitir.
- **Acoplamento a SOAP/UF** · mitigação: `SefazDiretoProvider` + resolver/transport internos;
  domínio e pipeline usam apenas tipos canônicos.
- **Envio acidental à produção** · mitigação: provider inicial aceita apenas homologação, catálogo
  allow-listed e ausência de configuração/credencial de produção.
- **Vazamento de segredo em transporte/log** · mitigação: cofre server-side, TLS context efêmero,
  sanitização e auditoria sem material sensível.

### 4.4 O que muda imediatamente

- O Gate G-F5 passa a resolvido por esta ADR.
- `NFCE_ARCHITECTURE.md`, `MASTER_FISCAL_EXECUTION_PLAN.md`, `ROADMAP_FISCAL.md` e os índices passam
  a registrar SEFAZ direta como primeira integração de homologação.
- Nenhum código, schema, segredo, configuração ou recurso externo muda neste checkpoint.

### 4.5 O que muda no longo prazo

- F5 deverá implementar o adapter direto e provar autorização/reconciliação em homologação.
- O contrato atual baseado em snapshot deverá evoluir para um envelope de XML assinado/validado,
  mantendo compatibilidade conceitual com providers futuros.
- Produção continua condicionada a F6–F11, hardening do cofre e Gate G-F12 separado.

---

## 5. Plano de implementação

**Esta decisão é só arquitetura — implementação vai para GOAL/sprint próprios.**

- Sprint sugerida: F5 — `SefazDiretoProvider` de homologação (após F2–F4 e Dry-Run verde).
- Owner humano: Rafael Faria.
- Pré-requisitos: UF da loja-piloto definida; credenciamento de homologação confirmado; schemas e
  catálogo oficial versionados; certificado/CSC no cofre; XML/XSD/assinatura verdes; threat model
  do transporte e plano de testes de resultado incerto.
- Critério de pronto futuro: NFC-e autorizada em homologação (`cStat = 100`), protocolo e XML
  autorizado persistidos, reconciliação idempotente comprovada, nenhum segredo em logs e toda
  tentativa de produção bloqueada antes da rede.

---

## 6. Validação / como saberemos que deu certo

- 100% das chamadas externas da primeira integração destinadas a endpoints oficiais de homologação.
- 0 dependências de SOAP/WSDL/UF fora do adapter/resolver/transport SEFAZ.
- 0 geração tributária/XML/numeração dentro do provider.
- 100% dos resultados incertos reconciliados antes de qualquer retransmissão.
- 100% das autorizações com protocolo e XML autorizado imutável persistidos.
- 100% das tentativas de ambiente/endpoint de produção falhando antes da rede.
- Gateway/PAA ausentes do runtime da primeira homologação.

---

## 7. Referências

- ADRs relacionadas: ADR-0008, ADR-0009, ADR-0010.
- Arquitetura: `docs/architecture/NFCE_ARCHITECTURE.md` e `FISCAL_SECURITY.md`.
- Governança: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
- Portal NF-e — MOC/manuais: <https://www.nfe.fazenda.gov.br/PORTAl/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=>.
- Portal NF-e — Web Services de homologação: <https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx>.
- Portal NF-e — Nota Técnica 2026.001 (PAA):
  <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=>.

---

## 8. Notas / discussão

- Aprovação humana registrada em 2026-07-22: **integração direta com a SEFAZ para a homologação
  inicial**, com responsabilidade integral do pipeline pelo OmniGestão.
- “Direta” descreve a ausência de gateway/PAA; não significa que o domínio conhece SOAP ou UF.
- “Homologação” é uma fronteira técnica obrigatória, não uma autorização implícita de produção.
- O MOC e as Notas Técnicas oficiais prevalecem sobre exemplos, bibliotecas ou endpoints copiados.
