# FISCAL_PROVIDER_DOSSIE_001 — Dossiê comparativo do transporte fiscal

| Campo | Valor |
|---|---|
| **GOAL** | `FISCAL-PROVIDER-STRATEGY-014` |
| **Tipo** | **Exclusivamente documental.** Zero código, zero conta, zero contrato, zero credencial, zero transmissão |
| **Base** | `origin/main` = `488d213` (merge do PR #29, que trouxe o GOAL-013) |
| **Branch / worktree** | `fiscal/goal-014-provider-strategy` · `C:\Projetos\wt-fiscal-014` |
| **Data da pesquisa** | **2026-07-23** (todos os preços e notas técnicas consultados nesta data) |
| **Decisão-mãe** | [`ADR-0015`](../decisions/ADR-0015-sefaz-direta-homologacao-inicial.md) — SEFAZ direta na homologação inicial |
| **Escopo do piloto** | [`ADR-0016`](../decisions/ADR-0016-piloto-homologacao-sp-matriz-rafacell.md) — Matriz RafaCell Assistec, Taguaí/SP, NFC-e 65, `tpAmb=2` |
| **Status** | ✅ **Decidido em 2026-07-23** — ADR-0015 **ratificada** por Rafael Faria (ver §9) |

> **Este dossiê não reescreve nem duplica a ADR-0015.** Ele reúne a evidência de mercado e
> operacional que a própria ADR-0015 §2.6 exigiu para uma eventual reavaliação, e conclui com uma
> recomendação de **ratificação** ou **substituição formal**. A ADR-0015 histórica permanece
> intocada em qualquer cenário.

---

## 0. Nota de método e honestidade

**O que foi verificado diretamente** (leitura das páginas oficiais/do fornecedor em 2026-07-23):
preços publicados de Focus NFe e NFE.io; ausência de preço publicado em PlugNotas/TecnoSpeed e
eNotas; histórico de versões da NT 2025.002 no Portal NF-e; exigência de credenciamento + CSC pela
SEFAZ-SP; existência da opção "Credenciar só em Homologação".

**O que NÃO foi verificado e está marcado como tal:** qualquer valor sujeito a negociação
comercial; SLA contratual (nenhum dos fornecedores publica SLA numérico em página aberta);
condições de custódia de certificado de cada gateway (dependem de contrato/documentação técnica
restrita). Nada disso foi estimado — está registrado como **insumo humano pendente** (§7).

**Preço de certificado A1:** as fontes encontradas são de revendedores e blogs, não de autoridade
certificadora em página institucional de preço. Registrado como **faixa indicativa de mercado**,
explicitamente **não** como número oficial. Além disso, é custo **comum a todos os cenários** —
não diferencia A de B (§5.3).

**Limite de competência:** este é um dossiê de **engenharia e custo**. Não é parecer jurídico,
contábil nem due diligence de fornecedor. A contratação de qualquer terceiro exige avaliação
própria (LGPD, contrato, responsabilidade civil) fora do escopo deste GOAL.

---

## 1. Estado confirmado antes da decisão

### 1.1 Gates — o que está realmente fechado

| Gate | Tema | Estado factual | Evidência |
|---|---|---|---|
| G-C1 | Reconciliação de status | ✅ fechado | GOAL-001 |
| G-C2 | XSD oficial real (worker containerizado) | ✅ fechado | merge `82c219c`, ADR-0010 |
| G-C3 | C14N/XMLDSig (prova externa) | ✅ fechado | merge `e52d16b` (PR #6), ADR-0011 |
| **G-C4** | **Gate executável do dry-run (matriz de 11 itens)** | ✅ **declarado fechável por Rafael em 2026-07-22** | ADR-0013 §"Ratificação"; `FISCAL_DRY_RUN_GATE_REPORT_001.md` §5.1 |
| G-C6 | ST / CSOSN 500 no motor tributário | ✅ fechado | `f8df2a4`, ADR-0012 |
| G-F1 | Cofre / custódia de segredo | ✅ resolvido | ADR-0009 + ADR-0014 |
| G-F5 | **Escolha do transporte externo** | ✅ **decidido** por ADR-0015 (SEFAZ direta) | ADR-0015 §4.4 |
| G-F5.1 | Escopo da 1ª homologação | ✅ decidido | ADR-0016 |
| G-F7 | Ligar emissão na loja-piloto | ⬜ aberto | — |
| G-F12 | Virada para produção | ⬜ aberto | — |

**G-C4 confirmado fechado**, como o GOAL pediu.

### 1.2 ⚠️ Duas divergências de nomenclatura que preciso reportar

**(a) "G-C5" não existe.** Varri `docs/` inteiro: existem G-C1, G-C2, G-C3, G-C4 e G-C6. **Não há
nenhuma definição de G-C5 em documento algum** do projeto. O GOAL-014 pede para "formalizar o
fechamento do G-C5", mas não há gate com esse rótulo para fechar.

Interpretação proposta (a confirmar por Rafael): **G-C5 é um rótulo novo**, criado por este GOAL
para nomear o gate de *estratégia de transporte fiscal* — a decisão que este dossiê instrui.
Nesse caso não se trata de "fechar algo que estava aberto", e sim de **criar e fechar no mesmo
ato**. Registro assim para não fabricar histórico.

**(b) O plano mestre se contradiz sobre G-F5.** A tabela de estado (linha 57) diz
`F5 | contrato/stub N1 | provider real ausente; G-F5 aberto`, enquanto a tabela de gates
(linha 236) diz `G-F5 ✅ ... resolvido ADR-0015`. Ambas estão no mesmo arquivo.

Leitura correta: **G-F5 como gate de decisão está resolvido** (a ADR-0015 escolheu SEFAZ direta);
**a fase F5 como execução nunca começou** (não existe `SefazDiretoProvider`). A linha 57 usa
"aberto" no sentido de "fase não executada" — redação imprecisa. A correção dessa linha entra na
atualização do plano mestre **após** a decisão.

### 1.3 Registry `FiscalProvider` — estado real

`lib/fiscal/provider/resolver.ts` mantém `REGISTRY` com **uma única fábrica**:
`STUB_HOMOLOGACAO → stubHomologacaoProvider`. Todos os demais tipos resolvem para o erro
controlado `provider_nao_implementado`.

O enum `FiscalProviderTipo` (`prisma/schema.prisma`) **já modela os candidatos**:

```
STUB_HOMOLOGACAO · SEFAZ_DIRETO · GATEWAY_FOCUS · GATEWAY_PLUGNOTAS
GATEWAY_ENOTAS · GATEWAY_NFEIO · SAT_LOCAL
```

**Consequência arquitetural relevante:** trocar de estratégia **não exige mudança de schema nem do
contrato** — exige apenas registrar outra fábrica no `REGISTRY`. A arquitetura agnóstica da
ADR-0008 está de fato preservada e é *executável*, não apenas declarada. Isso reduz materialmente o
custo de reverter qualquer decisão tomada agora.

**Ressalva honesta:** o contrato atual de `emitir` carrega o **snapshot**, não o XML assinado. A
própria ADR-0015 §"Estado atual" registra que ele precisará evoluir para um envelope de XML
assinado/validado antes da transmissão real. Essa evolução é necessária **no cenário A**; num
cenário de gateway, o contrato atual (snapshot) é, ironicamente, **mais próximo** do que o gateway
consome.

---

## 2. Os três cenários

| | Descrição |
|---|---|
| **A — SEFAZ direta** | `SefazDiretoProvider` fala SOAP/mTLS com os Web Services oficiais. O OmniGestão gera XML, valida XSD, assina, transmite, reconcilia e persiste. **É o que a ADR-0015 decidiu.** |
| **B — Gateway fiscal** | Um terceiro (Focus NFe, PlugNotas, eNotas, NFE.io) recebe os dados por REST/JSON, monta o XML, assina, transmite à SEFAZ e devolve o resultado. |
| **C — Arquitetura agnóstica com piloto em gateway** | Mantém `FiscalProvider` e todo o domínio; a **primeira implementação real** é um adapter de gateway. `SefazDiretoProvider` continua possível depois, sem retrabalho de domínio. |

**C não é "B com outro nome".** A diferença é a *ordem*: B trata o gateway como destino
arquitetural; C trata o gateway como **primeira perna**, preservando explicitamente a opção de
internalizar o transporte depois. Em C, o que se decide é o *sequenciamento*, não o destino.

---

## 3. Matriz comparativa — 15 dimensões

Legenda: 🟢 favorável · 🟡 intermediário · 🔴 desfavorável

| # | Dimensão | A — SEFAZ direta | B — Gateway | C — Agnóstico c/ piloto em gateway |
|---|---|---|---|---|
| 1 | **Custo fixo** | 🟢 **R$ 0** de terceiro. SEFAZ não cobra credenciamento nem transmissão | 🔴 R$ 59,90–629,90/mês (Focus) · R$ 220–410/mês (NFE.io) | 🟡 Igual a B no piloto (faixa baixa: R$ 59,90/mês), com opção de zerar depois |
| 2 | **Custo variável / documento** | 🟢 **R$ 0** por documento | 🟡 R$ 0,05/NFC-e excedente (Focus Retail) | 🟡 Igual a B no piloto |
| 3 | **Complexidade** | 🔴 **Alta**: SOAP, WSDL, mTLS, namespaces, catálogo de endpoint por UF/autorizador/versão | 🟢 **Baixa**: REST/JSON | 🟢 Baixa no piloto; a complexidade de A fica **adiada**, não eliminada |
| 4 | **Homologação** | 🟢 SEFAZ-SP oferece **"Credenciar só em Homologação"** — ambiente de teste gratuito e isolado | 🟡 Depende do sandbox do fornecedor; alguns exigem conta ativa | 🟡 Igual a B |
| 5 | **Suporte** | 🔴 Nenhum SLA de fornecedor. Suporte = SEFAZ-SP 0800-0170110 + documentação | 🟢 Suporte comercial contratado (nível varia por plano) | 🟢 Igual a B no piloto |
| 6 | **Manutenção de NT/XSD** | 🔴 **O fator mais pesado** — ver §4. Absorver 100% do churn de layout | 🟢 Absorvido pelo fornecedor (é o principal valor vendido) | 🟢 Absorvido no piloto; volta a ser nosso se internalizarmos |
| 7 | **Custódia do certificado A1** | 🟢 **Alinhada à ADR-0014**: cofre próprio, server-only, DEK por segredo, bucket exclusivo | 🔴 **Conflito arquitetural**: o modelo usual exige entregar o A1 ao gateway — ver §5.3 | 🔴 Mesmo conflito de B durante o piloto |
| 8 | **Disponibilidade / SLA** | 🟡 Dependemos da SEFAZ-SP diretamente; sem intermediário que mascare instabilidade | 🟡 Somam-se **duas** disponibilidades (gateway × SEFAZ); nenhum fornecedor publica SLA numérico aberto | 🟡 Igual a B |
| 9 | **Lock-in** | 🟢 **Nenhum** | 🟡 Real, mas **contido** pelo `FiscalProvider` + enum já modelado | 🟢 Explicitamente temporário por desenho |
| 10 | **Contingência** | 🔴 Contingência oficial (SVC-AN/SVC-RS, offline NFC-e) é **nossa** para implementar | 🟢 Normalmente oferecida pelo fornecedor | 🟢 No piloto, do fornecedor |
| 11 | **Cancelamento** | 🟡 Evento próprio a implementar (F9) | 🟢 Coberto pela API do fornecedor | 🟢 Coberto no piloto |
| 12 | **Consulta** | 🟢 **Já implementada** — GOAL-012 fez a reconciliação por chave; é ativo nosso, independe de fornecedor | 🟡 Via API do fornecedor; nossa reconciliação passa a depender do modelo dele | 🟡 Nossa reconciliação existe, mas precisa de adapter |
| 13 | **Multi-UF** | 🔴 Cada UF/autorizador custa engenharia (endpoint, peculiaridade, credenciamento) | 🟢 Uniforme por desenho | 🟢 Uniforme no piloto |
| 14 | **Aderência futura a NFS-e** | 🔴 **Não ajuda em nada.** NFS-e é municipal (~5.500 municípios, padrões distintos); SEFAZ direta não cobre | 🟢 Focus declara **+3.000 municípios** integrados e **R$ 199 fixos** por município novo em até 15 dias úteis | 🟢 Mesma cobertura no piloto |
| 15 | **Observabilidade e responsabilidade operacional** | 🟡 Observabilidade **total** (vemos o wire), responsabilidade **total** (a culpa é sempre nossa) | 🟡 Observabilidade **mediada** (vemos o que o gateway expõe); responsabilidade **compartilhada** — mas a legal continua do emitente | 🟡 Igual a B no piloto |

**Contagem:** A = 6🟢 / 3🟡 / 6🔴 · B = 7🟢 / 5🟡 / 3🔴 · C = 7🟢 / 6🟡 / 2🔴.

> A contagem é **indicativa, não decisória**: as dimensões não têm peso igual. Custódia do
> certificado (7) e manutenção de NT (6) valem, na prática, muito mais que suporte (5) ou
> cancelamento (11). A leitura ponderada está em §6.

---

## 4. A evidência que mudou de peso: o churn da Reforma Tributária

Este é o achado mais relevante da pesquisa e o único que poderia justificar reabrir a ADR-0015.

**NT 2025.002 — "Reforma Tributária do Consumo: adequações NF-e/NFC-e"** (inclui campos e regras de
validação de IBS/CBS). Histórico de versões publicado no Portal NF-e:

| Versão | Publicação | | Versão | Publicação |
|---|---|---|---|---|
| v1.00 | 28/03/2025 | | v1.33 | 02/12/2025 |
| v1.10 | 09/06/2025 | | v1.34 | 04/12/2025 |
| v1.20 | 30/07/2025 | | v1.35 | 31/03/2026 |
| v1.30 | 03/10/2025 | | v1.36 | 30/04/2026 |
| v1.31 | 11/11/2025 | | v1.40 | 20/05/2026 |
| v1.32 | 25/11/2025 | | **v1.50** | **03/06/2026** |

**12 versões em ~14 meses** — uma a cada ~5 semanas. A NT substitui a NT 2024.002 v1.10, e as
regras de validação de IBS/CBS passaram a valer a partir de **janeiro de 2026**.

Soma-se a **NT 2025.001**, que alterou o **QR-Code da NFC-e para a versão 3** — exatamente o campo
`qrCodeData` que o GOAL-013 acabou de persistir.

**Como isso se traduz por cenário:**

- **Cenário A:** cada versão pode exigir novo pacote XSD, ajuste de builder, regras de validação e
  reteste do dry-run. É trabalho recorrente e **não-negociável** (o layout é imposto). O momento
  atual é, objetivamente, **o pior da década** para assumir manutenção direta de layout.
- **Cenários B/C:** é precisamente o que o fornecedor vende. O churn continua existindo, mas o
  custo marginal por versão sai do nosso backlog.

**Contrapeso honesto — três razões pelas quais isso pesa menos do que parece:**

1. **O piloto é NFC-e de varejo em homologação.** O grosso do churn da RTC concentra-se em IBS/CBS
   e nos leiautes de NF-e; o subconjunto que uma NFC-e de balcão exercita é menor.
2. **Homologação é o lugar certo para sofrer com isso.** Descobrir incompatibilidade de layout em
   `tpAmb=2` não tem consequência legal — é exatamente para isso que o ambiente existe.
3. **Isso já era conhecível em 2026-07-22.** A NT 2025.002 v1.50 é de 03/06/2026, anterior à
   ADR-0015. Não é *fato novo*; é **fato agora quantificado**. Essa distinção importa para decidir
   entre ratificar e substituir (§6).

---

## 5. Custos

### 5.1 Preços públicos encontrados (consulta em 2026-07-23)

**Focus NFe** — <https://focusnfe.com.br/precos/> — a única fonte com tabela aberta e granular:

| Plano | Mensal | CNPJs | Cota incluída | Excedente |
|---|---|---|---|---|
| **Retail (NFC-e)** | **R$ 59,90** | 1 | 500 NFC-e + 100 NF-e | R$ 0,05/NFC-e · R$ 0,15/NF-e |
| Retail+ (NFC-e) | R$ 629,90 | ilimitados | 9.000 NFC-e + 1.000 NF-e | R$ 0,06/NFC-e · R$ 0,15/NF-e |
| Solo | R$ 89,90 | 1 | 100 notas | R$ 0,10/nota |
| Start | R$ 113,90 | 3 (+R$ 37,90/CNPJ) | 100 notas por CNPJ | R$ 0,10/nota |
| Growth | R$ 548,00 | ilimitados | 4.000 notas | R$ 0,12/nota |
| Enterprise | sob consulta | ilimitados | sob medida | — |

Sem taxa de setup e sem fidelidade declarada. Integração com município novo de NFS-e: **R$ 199,00
fixos**, em até 15 dias úteis.

**NFE.io** — <https://nfe.io/precos/emissao-nfce/>:

| Plano | Mensal | Cota | Observação |
|---|---|---|---|
| Base | R$ 220,00 | até 2.000 notas | inclui "Onboarding VIP" |
| Crescimento | R$ 410,00 | até 5.000 notas | inclui "Onboarding VIP" |
| Inicial (anual) | R$ 1.056,00/ano | até 700 notas | limitado a 2 CNPJs |
| Base (anual) | R$ 2.112,00/ano | até 2.000 notas | CNPJs ilimitados |
| Crescimento (anual) | R$ 3.936,00/ano | até 5.000 notas | CNPJs ilimitados |

Descontos de 10% (semestral) e 20% (anual). Preço de excedente **não publicado**.

**Custo da SEFAZ direta:** a SEFAZ-SP **não cobra** credenciamento nem transmissão. O custo do
cenário A é **integralmente engenharia**.

### 5.2 Sem preço público — dependem de cotação (insumo humano)

| Fornecedor | Situação |
|---|---|
| **PlugNotas / TecnoSpeed** | Nenhum preço publicado. O site direciona a formulário comercial ("retorno em até 24h úteis") / `comercial@tecnospeed.com.br` |
| **eNotas** | Nenhum preço publicado na página do Nota Gateway; apenas CTA de contato comercial. Uma fonte secundária menciona plano de entrada com 60 notas/mês e R$ 0,77 por nota adicional — **não confirmado em página de preço oficial; não usar como base** |
| **Focus Enterprise** | "Consulte" |
| **SLA contratual de qualquer fornecedor** | Nenhum publica SLA numérico aberto |

### 5.3 Certificado A1 — custo comum, mas custódia divergente

Faixa **indicativa de mercado** para e-CNPJ A1 (12 meses): **R$ 110 a R$ 500**, com referências em
torno de R$ 220–235. **Fontes são revendedores e blogs, não autoridade certificadora institucional
— tratar como ordem de grandeza, não como cotação.**

O ponto decisivo **não é o preço** (é o mesmo em todos os cenários), e sim **quem guarda a chave**:

- **Cenário A:** o A1 fica no cofre próprio, exatamente como a **ADR-0014** determinou — com as
  **10 condições** aprovadas por Rafael em 22/07/2026: envelope encryption, **DEK distinta por
  segredo e por versão**, vinculação criptográfica a `storeId`+`certificadoId`, bucket privado
  exclusivo do Fiscal, **nenhum acesso de cliente/browser**, acesso server-only por serviço
  autorizado com privilégio mínimo.
- **Cenários B/C:** o modelo usual de gateway exige **enviar o A1 (ou a assinatura) ao terceiro**.
  Isso **não é compatível** com as condições 5, 6 e 7 da ADR-0014 sem reabrir aquela decisão.

**Esta é a tensão arquitetural mais séria do dossiê** — maior que qualquer diferença de preço.
Adotar gateway não custa "R$ 59,90/mês": custa **reabrir a ADR-0014 e redefinir a custódia do
material criptográfico da empresa**. Um gateway que ofereça assinatura local (o A1 nunca sai da
nossa infra) mudaria essa avaliação — e é a **primeira pergunta a fazer em qualquer cotação**
(§7, item 1).

### 5.4 Custo do piloto em 12 meses

| | A — SEFAZ direta | B/C — Gateway (Focus Retail) |
|---|---|---|
| Fornecedor | **R$ 0** | R$ 59,90 × 12 = **R$ 718,80** |
| Certificado A1 | ~R$ 220 (comum) | ~R$ 220 (comum) |
| **Desembolso** | **~R$ 220** | **~R$ 939** |
| **Delta em dinheiro** | — | **~R$ 719/ano** |
| Engenharia | Transporte SOAP/mTLS + catálogo + acompanhamento de NT | Adapter REST + acompanhamento reduzido |

**O delta financeiro é irrelevante** (~R$ 719/ano ≈ poucas horas de engenharia). **A decisão não é
de custo** — é de **responsabilidade operacional e custódia**. Qualquer argumentação centrada em
preço estaria olhando para a variável errada.

---

## 6. Análise e recomendação

### 6.1 O que a evidência efetivamente mostra

**A favor de mudar para gateway:** o churn da RTC é real e quantificado (12 versões/14 meses);
NFS-e é um vazio completo no cenário A e a RafaCell é assistência técnica (vende produto **e**
serviço); o custo é trivial; contingência e cancelamento viriam prontos.

**A favor de manter SEFAZ direta:** o pipeline **já está construído** (GOALs 002–013: XML, XSD real,
assinatura com prova externa, motor tributário com ST/CSOSN 500, numeração, outbox, reconciliação de
estado incerto, persistência legal). Num gateway, boa parte desse caminho é **contornada** — o
gateway monta e assina o XML, tornando builder/XSD/signer/numeração dormentes no caminho de emissão.
A custódia do A1 já foi decidida e arquitetada (ADR-0014, 10 condições) de um jeito **incompatível**
com o modelo usual de gateway. Homologação na SEFAZ-SP é **gratuita e isolada**. E o `FiscalProvider`
já garante que trocar depois é barato — o enum inclusive já modela os quatro gateways.

### 6.2 O teste decisivo

A ADR-0015 §2.6 fixou os gatilhos de reavaliação: *"custo operacional elevado, dificuldade de
manutenção por UF, exigência regulatória, necessidade de contingência terceirizada ou expansão
rápida para muitos estados"*.

Confrontando com a evidência de hoje:

| Gatilho da ADR-0015 | Materializou? |
|---|---|
| Custo operacional elevado | **Não** — o custo de terceiro é R$ 0 e o delta é ~R$ 719/ano |
| Dificuldade de manutenção por UF | **Não** — o piloto é **uma** UF (SP) |
| Exigência regulatória | **Parcialmente** — a RTC é real, mas incide sobre **todos** os cenários; o gateway terceiriza o trabalho, não a obrigação |
| Contingência terceirizada | **Não** — não há operação em produção que exija contingência ainda |
| Expansão rápida para muitos estados | **Não** — não está no horizonte do piloto |

**Nenhum gatilho da própria ADR-0015 se materializou para o escopo do piloto.** O achado da RTC é
*fato quantificado*, não *fato novo* — a NT v1.50 é de 03/06/2026, anterior à aceitação da ADR-0015
em 22/07/2026.

### 6.3 Recomendação

> ## ✅ Recomendo **RATIFICAR a ADR-0015** e **não criar nova ADR**.

Quatro razões, em ordem de peso:

1. **Custódia do A1 (decisiva).** Mudar para gateway obrigaria a reabrir a ADR-0014 e as 10
   condições aprovadas há um dia. Trocar controle criptográfico por R$ 719/ano é uma troca ruim.
2. **O pipeline já existe e só se prova transmitindo.** Treze GOALs construíram exatamente a cadeia
   que o cenário A exercita. Um gateway a deixaria dormente sem nunca ter sido validada ponta a ponta.
3. **Homologação é gratuita e sem risco legal.** É o ambiente certo para descobrir dor de layout.
4. **A reversão é barata e já está arquitetada.** `FiscalProvider` + enum com os quatro gateways
   significam que adotar gateway depois custa **um adapter**, não uma refatoração.

**Mas a ratificação deve vir acompanhada de gatilhos objetivos** — a evidência da RTC é séria demais
para ser apenas arquivada. Proponho registrar no plano mestre que a decisão é **revista por nova ADR**
se qualquer um ocorrer:

- **T1** — o piloto não obtiver `cStat=100` em homologação em **até 2 ciclos de trabalho** por causa
  de layout/NT (e não por erro nosso de cadastro);
- **T2** — a manutenção de NT consumir **mais de ~20% do tempo de engenharia fiscal** em 2 meses
  seguidos;
- **T3** — entrar no roadmap a **segunda UF** ou a **NFS-e** (aí o cenário C passa a ser o favorito);
- **T4** — a produção exigir contingência que não tenhamos condições de operar.

**T3 é o mais provável de disparar.** Se NFS-e entrar no roadmap, a recomendação **inverte** — e aí
o caminho certo é o **cenário C**, não o B: manter o domínio, adicionar adapter de gateway,
preservar SEFAZ direta para NFC-e se fizer sentido. Vale registrar isso desde já para que a decisão
futura não seja tomada do zero.

### 6.4 O que eu explicitamente NÃO recomendo

- **Não** contratar gateway agora "por garantia" — pagar por opção não exercida, com o `FiscalProvider`
  já garantindo a troca, é desperdício.
- **Não** criar ADR nova neste GOAL: sem gatilho materializado, seria churn de governança um dia
  depois da ADR-0015.
- **Não** tratar a decisão como permanente: os gatilhos existem justamente porque a evidência da RTC
  é real.

---

## 7. Insumos humanos pendentes (dependem de contato comercial)

Nenhum destes bloqueia a decisão de ratificar; são necessários **se e quando** um gatilho disparar.

| # | Pergunta | Para quem |
|---|---|---|
| 1 | **O A1 pode permanecer na nossa infraestrutura (assinatura local), ou o gateway exige custódia do certificado?** — pergunta decisiva, ver §5.3 | Focus, PlugNotas, eNotas, NFE.io |
| 2 | SLA contratual numérico (disponibilidade, janela de manutenção, penalidade) | todos |
| 3 | Preço de PlugNotas/TecnoSpeed e eNotas para o perfil NFC-e do piloto | comercial |
| 4 | Preço de excedente da NFE.io (não publicado) | NFE.io |
| 5 | Prazo real de adequação a NT (quanto tempo após publicação) | todos |
| 6 | Tratamento de LGPD e retenção do XML pelo fornecedor — interação com a política de retenção do GOAL-013 | todos |
| 7 | Suporte a contingência oficial (SVC-AN/SVC-RS, offline NFC-e) | todos |

---

## 8. Decisão submetida a Rafael (registro do checkpoint)

1. **Ratificar a ADR-0015?** (recomendação: **sim**, sem nova ADR)
2. **Aceitar os gatilhos T1–T4** como condição da ratificação?
3. **"G-C5"**: confirmar que é rótulo **novo** criado por este GOAL para o gate de estratégia de
   transporte — ou indicar outro nome/numeração (§1.2a).
4. **Corrigir a contradição do plano mestre** sobre G-F5 (§1.2b): G-F5 **decidido**; fase F5
   **autorizada a iniciar**.
5. **Abrir formalmente a fase F5?** (implementar `SefazDiretoProvider` — GOAL próprio, sem produção)

**Todas as cinco foram decididas em 2026-07-23 — ver §9.**

---

## 9. Decisão registrada — 2026-07-23

> **Decisor:** Rafael Faria · **Data:** 2026-07-23 · **Instrumento:** checkpoint humano do GOAL-014.
> Esta seção **registra** a decisão; ela **não** altera a ADR-0015, cujo texto histórico permanece
> exatamente como aceito em 2026-07-22.

### 9.1 Ratificação da ADR-0015

**A ADR-0015 — "Integração direta com a SEFAZ na homologação inicial" — está RATIFICADA.**

- **Nenhuma ADR nova** foi criada por este GOAL.
- **O histórico da ADR-0015 não foi alterado** — nem status, nem texto, nem frontmatter. A
  ratificação é registrada **aqui** e no plano mestre, por referência.
- A decisão permanece: `SefazDiretoProvider` como primeira implementação real de `FiscalProvider`,
  restrita à homologação, sem gateway e sem PAA.

### 9.2 G-C5 — criado e fechado neste ato

**`G-C5 — Estratégia do provider e transporte fiscal`** passa a existir formalmente, com o
seguinte registro de honestidade, que é parte da decisão:

- ⚠️ **O rótulo "G-C5" não existia em nenhum documento do projeto antes deste GOAL.** A varredura
  de `docs/` encontrou G-C1, G-C2, G-C3, G-C4 e G-C6 — nunca G-C5.
- Foi **criado pelo GOAL-014** para nomear a decisão estratégica de provider/transporte.
- É considerado **fechado** pela ratificação da ADR-0015 somada a este dossiê.
- **Nenhum histórico anterior é fabricado para o G-C5.** Ele nasce fechado em 2026-07-23; não há
  período em que tenha estado "aberto", e nenhum documento retroativo o menciona.

### 9.3 Gatilhos de reavaliação — T1 a T4 (aceitos)

| # | Gatilho |
|---|---|
| **T1** | O piloto **não atingir `cStat=100`** em até **dois ciclos de correção** por problemas de NT, layout ou transporte |
| **T2** | Manutenção de NT consumir **mais de ~20% do esforço de engenharia fiscal** durante **dois meses consecutivos** |
| **T3** | Entrada de uma **segunda UF** ou de **NFS-e** no roadmap |
| **T4** | Produção exigir **contingência** que o OmniGestão não consiga operar com segurança |

Ao ocorrer qualquer gatilho, **reavaliar o cenário C** — domínio fiscal próprio + `FiscalProvider`
agnóstico + adapter de gateway.

> ⚠️ **A reavaliação NÃO autoriza mudança automática de provider.** Disparar um gatilho abre uma
> análise, não uma migração. Trocar de provider continua exigindo decisão humana explícita e ADR
> própria, como já determina a ADR-0015 §2.6.

### 9.4 Custódia do certificado A1 — ADR-0014 preservada integralmente

A ratificação **reafirma** a ADR-0014 sem nenhuma flexibilização:

- certificado sob custódia da **infraestrutura própria**;
- **nenhuma entrega automática do A1 a gateway**, em nenhuma hipótese;
- **assinatura local**;
- **envelope encryption**;
- **isolamento por loja**;
- acesso **somente server-side**.

**Qualquer gateway futuro que exija custódia externa do A1 depende de nova decisão humana e de
arquitetura formal** — não é consequência de nenhum gatilho T1–T4 e não pode ser tratado como
detalhe de implementação.

### 9.5 Separação entre decisão e execução em G-F5

A contradição do plano mestre (§1.2b) fica resolvida com a distinção explícita:

| Camada | Estado |
|---|---|
| **Decisão arquitetural** do transporte | ✅ **resolvida** pela ADR-0015 |
| **Fase de execução G-F5** | 🔓 **aberta e não implementada** |

**A execução da integração SEFAZ NÃO está concluída** e não pode ser marcada como tal em nenhum
documento. Não existe `SefazDiretoProvider`; o `REGISTRY` segue com uma única fábrica
(`STUB_HOMOLOGACAO`).

### 9.6 Abertura da fase G-F5 — escopo obrigatório

Fica **formalmente aberta** a fase G-F5 para implementar o `SefazDiretoProvider`, com escopo
inicial **obrigatório e fail-closed**:

| Restrição | Valor |
|---|---|
| Autorizador | **somente SEFAZ-SP** |
| Modelo | **somente NFC-e modelo 65** |
| Ambiente | **somente homologação** |
| `tpAmb` | **somente 2** |
| Loja | **somente Matriz RafaCell** |
| Entrada do provider | **XML previamente assinado e validado** |
| Produção | **zero** |
| `tpAmb=1` | **zero** |
| Ativação automática de `fiscalEnabled` | **zero** |

Qualquer divergência de autorizador, modelo, ambiente, `tpAmb` ou loja é **fail-closed antes da
rede**, conforme ADR-0015 §2.4.

---

## 10. Referências

**Oficiais**
- Portal NF-e — NT 2025.002 (RTC, IBS/CBS): <https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D>
- Portal NF-e — NT 2025.001 (QR-Code NFC-e v3): <https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=trSXReoZPuY%3D>
- Portal NF-e — Web Services de homologação: <https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx>
- SEFAZ-SP — NFC-e (credenciamento, CSC): <https://portal.fazenda.sp.gov.br/servicos/nfce>
- SEFAZ-SP — credenciamento NF-e: <https://www.fazenda.sp.gov.br/nfe/credenciamento.asp>

**Fornecedores** (consulta 2026-07-23)
- Focus NFe — preços: <https://focusnfe.com.br/precos/> · NFC-e: <https://focusnfe.com.br/nfce>
- NFE.io — preços NFC-e: <https://nfe.io/precos/emissao-nfce/>
- PlugNotas/TecnoSpeed — NFC-e (sem preço público): <http://tecnospeed.com.br/plugdfe/nfce/>
- eNotas — Nota Gateway (sem preço público): <https://enotas.com.br/product-gateway/>

**Internas**
- [`ADR-0008`](../decisions/ADR-0008-fiscal-architecture.md) · [`ADR-0009`](../decisions/ADR-0009-fiscal-secret-vault.md) · [`ADR-0013`](../decisions/ADR-0013-redefinicao-gate-executavel-dry-run.md) · [`ADR-0014`](../decisions/ADR-0014-supabase-vault-backend-kms-fiscal.md) · [`ADR-0015`](../decisions/ADR-0015-sefaz-direta-homologacao-inicial.md) · [`ADR-0016`](../decisions/ADR-0016-piloto-homologacao-sp-matriz-rafacell.md) · [`ADR-0018`](../decisions/ADR-0018-persistencia-legal-xml-e-protocolo.md)
- [`MASTER_FISCAL_EXECUTION_PLAN.md`](../governance/MASTER_FISCAL_EXECUTION_PLAN.md) · [`FISCAL_KMS_PRODUCTION_ARCH_001.md`](./FISCAL_KMS_PRODUCTION_ARCH_001.md) · [`FISCAL_DRY_RUN_GATE_REPORT_001.md`](./FISCAL_DRY_RUN_GATE_REPORT_001.md)
