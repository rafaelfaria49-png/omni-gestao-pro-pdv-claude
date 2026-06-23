# AUDITORIA PRÉ-FISCAL — PDV/Vendas pronto para NFC-e/SAT/TEF? (v01)

> **GOAL_PRE_FISCAL_READINESS_AUDIT_V01** · Modo **READ ONLY** (nenhum código alterado).
> Data: 2026-06-18 · Branch: `main` · Escopo: PDV/Vendas + cadastros + multi-loja.
> Método: leitura estática do código real (schema, motor de venda, rotas, pipelines de
> impressão, config de empresa/loja). Sem execução, sem migração, sem mock.

---

## 1. Resumo executivo

**Resposta direta:** ❌ **Ainda NÃO é seguro abrir a frente Fiscal/NFC-e/TEF.** O núcleo
**operacional** do PDV está sólido (motor único, pagamento enterprise, à prazo, correções
seguras, auditoria, multi-loja). Mas a **fundação fiscal é praticamente inexistente** e há
**bloqueios estruturais P0** que precisam ser resolvidos *antes* de qualquer integração com
SEFAZ. Não é um ajuste de borda — é uma **camada nova** (models, identidade fiscal por loja,
máquina de estados da venda).

**Veredito por dimensão:**

| Dimensão | Estado | Pronto p/ fiscal? |
|---|---|---|
| Dados operacionais da venda (itens, total, pagamento, operador, terminal, loja) | 🟢 Sólido | Parcial — falta snapshot fiscal por item |
| Identidade fiscal da loja (CNPJ/IE/regime/certificado/série/CSC/ambiente) | 🔴 Quase ausente | **Não** |
| Produto fiscal (NCM/CEST/CFOP/CST/CSOSN/origem/unidade) | 🔴 Fragmentado e não persistido | **Não** |
| Cupom/comprovante | 🟡 3 pipelines, todos NÃO FISCAIS | Não (esperado) |
| Cancelamento | 🟢 Operacional completo | Falta camada de **evento fiscal** |
| Correção de venda | 🟢 Robusta | Falta **trava por status fiscal** |
| Cliente (consumidor final / CNPJ) | 🟡 CPF/CNPJ ok, endereço não estruturado | Parcial |
| Models fiscais (NotaFiscal/Evento/Série/Certificado) | 🔴 Zero | **Não** |

**3 bloqueios P0 que impedem começar:** (1) não existe **nenhum model fiscal**; (2) não há
**identidade fiscal por loja** (certificado hoje é localStorage single-empresa); (3) a venda
não tem **máquina de estados** nem campo de status fiscal — qualquer venda é editável a
qualquer momento, o que é incompatível com documento autorizado.

---

## 2. Matriz "venda atual" × "requisito fiscal NFC-e"

Legenda: 🟢 existe e serve · 🟡 existe parcial/informal · 🔴 ausente.

### 2.1 Cabeçalho da venda / nota

| Requisito NFC-e | Hoje no OmniGestão | Onde | Status |
|---|---|---|---|
| Identificador da venda | `Venda.pedidoId` (VDA-...) | `schema.prisma:1365` | 🟢 |
| Data/hora emissão | `Venda.at` | `schema.prisma:1371` | 🟢 |
| Loja/estabelecimento | `Venda.storeId` | `schema.prisma:1360` | 🟢 |
| Operador | `Venda.operador` | `schema.prisma:1386` | 🟢 |
| Terminal/PDV | `Venda.terminalId` | `schema.prisma:1396` | 🟢 |
| Total | `Venda.total` | `schema.prisma:1370` | 🟢 |
| Desconto | `payload.discountTotal` (JSONB) | `operations-sale-types.ts:51` | 🟡 (não coluna) |
| **Modelo (65=NFC-e)** | — | — | 🔴 |
| **Série** | — | — | 🔴 |
| **Número da nota** | — | — | 🔴 |
| **Chave de acesso (44)** | — | — | 🔴 |
| **Protocolo de autorização** | — | — | 🔴 |
| **Status SEFAZ / ambiente** | — | — | 🔴 |
| **XML autorizado** | — | — | 🔴 |
| **QR Code / URL consulta** | — | — | 🔴 |
| **CSC / CSC-id** | — | — | 🔴 |
| **Natureza da operação / CFOP da venda** | — | — | 🔴 |

### 2.2 Item da venda

| Requisito NFC-e (por item) | Hoje | Onde | Status |
|---|---|---|---|
| Descrição | `ItemVenda.nome` | `schema.prisma:1412` | 🟢 |
| Quantidade | `ItemVenda.quantidade` | `schema.prisma:1413` | 🟢 |
| Preço unitário | `ItemVenda.precoUnitario` | `schema.prisma:1414` | 🟢 |
| Total da linha | `ItemVenda.lineTotal` | `schema.prisma:1415` | 🟢 |
| GTIN/EAN | `Produto.barcode` | `schema.prisma:740` | 🟢 |
| **NCM (snapshot na venda)** | só no produto (metadata), não copiado p/ item | — | 🔴 |
| **CFOP por item** | — | — | 🔴 |
| **CST/CSOSN** | — | — | 🔴 |
| **Unidade comercial (UN/KG…)** | — | — | 🔴 |
| **Origem da mercadoria (0-8)** | só no form do produto (descartado) | §5 | 🔴 |
| **Valor de tributos (Lei Transparência)** | "imposto estimado" por alíquota fixa | `pdv-print-runtime.ts:159` | 🟡 (estimativa, não cálculo) |

> ⚠️ **Item virtual:** linhas `__avulso__` / `__os_servico__` / `__os_pecas__`
> (`isVirtualSaleLine`) não têm produto resolvido — para NFC-e exigirão NCM/CFOP próprios
> (item avulso fiscal é um problema real: precisa classificação no ato).

### 2.3 Pagamento

| Requisito NFC-e (`tPag`) | Hoje (`PaymentBreakdownFull`) | Status |
|---|---|---|
| 01 Dinheiro | `dinheiro` | 🟢 valor / 🔴 código tPag |
| 03 Cartão crédito | `cartaoCredito` | 🟢 / 🔴 |
| 04 Cartão débito | `cartaoDebito` | 🟢 / 🔴 |
| 17 PIX | `pix` | 🟢 / 🔴 (sem txid/e2e) |
| 05 Crédito loja / 15 boleto | `carne` / `aPrazo` | 🟡 mapeamento ambíguo |
| 10 Vale | `creditoVale` | 🟡 (é abatimento interno) |
| **CNPJ credenciadora / bandeira / nº autorização (cartão/TEF)** | — | 🔴 |

`PaymentBreakdownFull` em `lib/operations-sale-types.ts:11`.

---

## 3. Bloqueios antes da NFC-e (por área)

### PARTE 1 — Venda normal
🟢 **Operacionalmente completa.** O motor único (`lib/ops-upsert-venda.ts`) grava Venda +
ItemVenda + ledger de estoque + MovimentacaoFinanceira + título à prazo, tudo idempotente e
multi-loja. CPF do comprador existe em `payload.customerCpf` (não em coluna).
🔴 **Falta fiscal:** snapshot fiscal por item (NCM/CFOP/CST/unidade) no momento da venda — hoje
o item não carrega nada tributário.

### PARTE 2 — Cupom atual (3 pipelines paralelos)
1. **`CupomNaoFiscal`** (`components/dashboard/vendas/cupom-nao-fiscal.tsx`) — HTML/clipboard,
   rótulo fixo **"DOCUMENTO NÃO FISCAL"**. Tem loja/CNPJ/operador/cliente/CPF/itens/pagamento.
2. **`printPdvSaleReceipt`** (`lib/pdv-print-runtime.ts`) — ESC/POS térmico + fallback HTML,
   **config por loja** (`StoreSettings.printerConfig`), com operador/cliente/CPF/pagamentos +
   linha "Imposto estimado" (alíquota fixa de config, **não** cálculo fiscal).
3. **Crediário** (`pdv-recebimento-modal` / `crediarioPrintAllowed`) — recibo de baixa de título.

🟡 **Divergência entre pipelines:** os três têm conjuntos de campos diferentes e lógica de
montagem própria (HTML do CupomNaoFiscal ≠ HTML do printPdvSaleReceipt ≠ recibo crediário).
Para NFC-e isso vira risco: o **DANFE-NFC-e** é um quarto formato com regras legais (QR Code,
chave, protocolo, tributos, URL de consulta). **Faltam todos** os campos fiscais.

### PARTE 3 — Cancelamento (`app/api/vendas/[id]/cancelar/route.ts`)
🟢 **Operacional completo e seguro:** repõe estoque líquido (`origem:"cancelamento_pdv"`,
idempotente, descontando devoluções), estorna `MovimentacaoFinanceira`, cancela
`ContaReceberTitulo` à prazo, respeita período fechado, exige ACL+permissão, audita.
🔴 **Lacuna fiscal:** é um cancelamento **operacional**, não fiscal. Falta: evento de
cancelamento NFC-e (≤ 30 min em SP), XML de cancelamento, protocolo, e o **bloqueio** de
cancelamento livre depois do prazo (que exige então **NF-e de entrada/devolução**, não cancelamento).

### PARTE 4 — Correção de venda (Workspace F1-F4 + 5 rotas `corrigir*`)
🟢 Hoje permite corrigir pagamento, cliente, observação, **itens/estoque**, título e
parcelas — com PIN supervisor + ACL multi-loja (GOAL recém-entregue) + período fechado.
🔴 **Nenhuma rota verifica status fiscal** (porque ele não existe). **Após autorização da
NFC-e**, quase tudo isso precisa ser **bloqueado** (ver §"o que travar"). Esta é a maior
fonte de risco de inconsistência fiscal futura.

### PARTE 5 — Produtos (fiscal fragmentado)
- **NCM/CEST:** vivem em `Produto.metadata` (JSONB), **sem coluna dedicada**. Há IA de apoio
  (`lib/product-ncm-fiscal-ai.ts`: `suggestNcmFromProductName`, `classifyProductFiscal`).
- **CFOP / origem da mercadoria:** o classificador IA até retorna, e o **form** de produto
  (`gestao-produtos.tsx`) tem os campos… **🔴 mas o `handleSave` (linha 564-574) NÃO os envia**
  no payload para `/api/produtos` — só name/stock/price/precoCusto/category/sku/barcode.
  **São capturados na UI e descartados na persistência.**
- **CST/CSOSN / unidade comercial:** não existem em lugar nenhum.
- **Inconsistência entre editores:** o **importador** grava `metadata.{ncm,cest}`; o **form
  manual** descarta tudo; o **CadastrosHub** lê `metadata.{ncm,cest}`. Três caminhos, três
  comportamentos.

🔴 **Bloqueio P1:** sem NCM/CFOP/CST/origem/unidade **persistidos e confiáveis por produto**,
não há como montar o item da NFC-e.

### PARTE 6 — Caixa e pagamentos
🟢 `PaymentBreakdownFull` cobre as formas reais; fechamento de caixa consolida por forma; o
GOAL recém-entregue alinhou `creditoVale` (regra única: receita à vista = total − aPrazo − vale).
🔴 **Fiscal:** sem `tPag` SEFAZ, sem dados de TEF (CNPJ credenciadora, bandeira, nº autorização,
NSU), sem txid/e2eid do PIX. `carne`/`aPrazo`/`creditoVale` precisam de mapeamento fiscal definido.

### PARTE 7 — Cliente
🟢 `Cliente.document` (CPF/CNPJ), `kind` (PF/PJ), `phone`, `email`, `city`. Consumidor final
funciona (CPF opcional na nota).
🔴 **Endereço não estruturado:** `Cliente` não tem rua/número/bairro/CEP/UF separados
(só `city` string). NFC-e com **destinatário identificado por CNPJ** (e qualquer NF-e modelo 55
futura) exige endereço estruturado + IE do destinatário.

### PARTE 8 — Multi-loja
🟢 `storeId` em tudo; `Store.cnpj` por loja; `Store.address` (JSONB).
🔴 **Faltam por loja:** Inscrição Estadual, regime tributário (Simples Nacional × Normal — muda
CST↔CSOSN), **CSC + CSC-id** (token NFC-e), **série fiscal + contador de número**, **certificado
digital A1 por CNPJ**, **ambiente (homologação/produção)**.
🔴 **Bloqueio P0:** o único lugar com dado fiscal hoje é `lib/config-empresa.tsx` →
`DadosFiscais` = `{certificadoDigitalStatus, tipoCertificado, senhaCertificado?}`, **em
localStorage, single-empresa**. Isso é **incompatível com multi-CNPJ/multi-certificado** e
inseguro para certificado real.

### PARTE 9 — Fiscal-ready (gap de models e integrações)
- **Models fiscais existentes:** **nenhum** (0 ocorrências de nfce/nfe/sat/danfe/certificado/série
  no `schema.prisma`).
- **Faltam (mínimo):** `ConfiguracaoFiscalLoja` (IE, regime, CSC, ambiente, série), `CertificadoDigital`
  (storage seguro do A1, fora do localStorage), `NotaFiscal`/`DocumentoFiscal` (modelo, série,
  número, chave, status, protocolo, XML, ambiente, vínculo a `Venda`), `EventoFiscal`
  (cancelamento, carta de correção, inutilização), `ContadorNumeracao` (série+número atômico).
- **Integrações necessárias:** provedor de emissão (SEFAZ direto **ou** gateway — Focus NFe /
  PlugNotas / eNotas / NFe.io), storage seguro de certificado, geração/validação de XML, QR Code
  NFC-e, e (se houver) TEF (PayGo/Sitef/Stone Connect) e SAT-CF-e (em SP, alternativa à NFC-e).

---

## 4. Riscos por severidade

### 🔴 P0 — impedem iniciar a frente fiscal
- **P0-A — Sem camada de models fiscais.** Não há onde gravar nota/numeração/evento/XML.
  *Mitigação:* GOAL de schema fiscal aditivo (não destrutivo) antes de tudo.
- **P0-B — Identidade fiscal não é por loja.** Certificado/CSC/IE/regime/série/ambiente
  inexistentes por CNPJ; certificado hoje em localStorage single-empresa. *Mitigação:*
  `ConfiguracaoFiscalLoja` + `CertificadoDigital` por `storeId`.
- **P0-C — Venda sem máquina de estados / status fiscal.** Qualquer venda é editável sempre.
  Documento autorizado precisa virar **imutável**. *Mitigação:* campo de status fiscal + guards.

### 🟠 P1 — bloqueiam emissão correta
- **P1-A — Produto sem dados fiscais persistidos** (NCM/CFOP/CST/CSOSN/origem/unidade);
  CFOP/origem **descartados no save** do form (`gestao-produtos.tsx:564`).
- **P1-B — Item da venda sem snapshot fiscal** (NCM/CFOP/CST/unidade no ato da venda).
- **P1-C — Correções/cancelamento não respeitam status fiscal** (nenhum guard pós-autorização).
- **P1-D — Regime tributário por loja indefinido** (Simples × Normal decide CST vs CSOSN).

### 🟡 P2 — necessários, não bloqueiam o piloto inicial
- **P2-A — Endereço do cliente não estruturado** (necessário p/ destinatário CNPJ).
- **P2-B — Pagamento sem `tPag`/dados TEF/PIX** (mapeamento + captura).
- **P2-C — 3 pipelines de cupom divergentes** → DANFE-NFC-e seria um 4º; consolidar antes.
- **P2-D — "Imposto estimado" é alíquota fixa**, não cálculo (Lei da Transparência exige valor real).

### ⚪ P3 — melhorias
- **P3-A — Item avulso fiscal** (classificação NCM/CFOP no ato da venda avulsa).
- **P3-B — Numeração/série offline** (estratégia de contingência de número).

---

## 5. Recomendação de ordem (o que fazer antes do quê)

1. **Fundação de dados fiscais (P0-A/P0-B):** models `ConfiguracaoFiscalLoja`,
   `CertificadoDigital`, `NotaFiscal`, `EventoFiscal`, `ContadorNumeracao` — **aditivo**, dormente.
2. **Identidade fiscal por loja (P0-B):** migrar `DadosFiscais` do localStorage para DB por
   `storeId`; IE, regime, CSC/CSC-id, ambiente, série.
3. **Máquina de estados da venda (P0-C):** status fiscal + guards nas rotas `corrigir*`/`cancelar`.
4. **Produto fiscal de verdade (P1-A):** persistir NCM/CEST/CFOP/CST/CSOSN/origem/unidade
   (consolidar os 3 editores; parar de descartar CFOP/origem no save).
5. **Snapshot fiscal no item da venda (P1-B):** copiar dados fiscais do produto p/ `ItemVenda`/payload.
6. **Pagamento fiscal (P2-B)** + **endereço do cliente (P2-A)**.
7. **Provedor de emissão + XML + QR + DANFE-NFC-e (consolidar cupom, P2-C).**
8. **Eventos: cancelamento fiscal, contingência, rejeição/reenvio.**
9. **(Opcional/regional) SAT-CF-e e TEF.**

---

## 6. GOALs futuros sugeridos

- `GOAL_NFCE_ARCHITECTURE_BLUEPRINT` — desenho completo da arquitetura fiscal *(já solicitado a seguir)*.
- `GOAL_FISCAL_SCHEMA_FOUNDATION` — models fiscais aditivos e dormentes (autorização de schema).
- `GOAL_FISCAL_IDENTITY_PER_STORE` — identidade fiscal por loja (sai do localStorage).
- `GOAL_VENDA_STATE_MACHINE` — status fiscal + travas de edição pós-autorização.
- `GOAL_PRODUTO_FISCAL_PERSIST` — persistir NCM/CFOP/CST/origem/unidade (fim do descarte no save).
- `GOAL_COMPROVANTE_UNIFICADO` — consolidar os 3 pipelines de cupom antes do DANFE-NFC-e.
- `GOAL_NFCE_PROVIDER_INTEGRATION` — provedor/SEFAZ + XML + QR + autorização.
- `GOAL_FISCAL_EVENTS` — cancelamento fiscal, contingência, rejeição/reenvio.

---

## 7. O que travar / manter editável **após autorização da NFC-e** (referência futura)

| Ação | Pós-autorização |
|---|---|
| Alterar itens / quantidade / preço / total | 🔒 **Bloquear** (exige cancelamento ou NF-e de devolução) |
| Alterar forma de pagamento (muda total/natureza) | 🔒 **Bloquear** |
| Trocar/alterar cliente da nota | 🔒 **Bloquear** (carta de correção não cobre destinatário) |
| Cancelar venda | ⚠️ **Vira evento fiscal** (≤ prazo); após prazo → devolução |
| Observação interna (não sai na nota) | 🟢 Editável (auditado) |
| Vencimento/observação de título à prazo (Contas a Receber) | 🟢 Editável (financeiro ≠ fiscal) |
| Reparcelamento do à prazo | 🟢 Editável (não altera o documento fiscal) |
| Metadados de item (serial/IMEI/lote) | 🟢 Editável se não compõem a nota |

**Deve obrigatoriamente gerar evento fiscal:** cancelamento (dentro do prazo), correção de
dados permitidos (carta de correção), inutilização de numeração saltada.
**Deve virar imutável após autorização:** itens, valores, total, pagamento que altere total,
destinatário, chave/numeração/série, XML.

---

## 8. Checklist antes de abrir a frente Fiscal

- [ ] Schema fiscal aditivo aprovado e aplicado (models nota/evento/série/certificado/config).
- [ ] Identidade fiscal por loja no DB (IE, regime, CSC/CSC-id, ambiente, série) — fora do localStorage.
- [ ] Certificado A1 em storage seguro por CNPJ (não localStorage, não bundle).
- [ ] Regime tributário definido por loja (Simples × Normal) → política CST/CSOSN.
- [ ] Produto com NCM/CFOP/CST/CSOSN/origem/unidade **persistidos** (form para de descartar).
- [ ] Item da venda com snapshot fiscal no ato.
- [ ] Máquina de estados da venda + guards nas rotas `corrigir*`/`cancelar`.
- [ ] Mapeamento de pagamento → `tPag` (+ captura TEF/PIX quando houver).
- [ ] Endereço estruturado do cliente p/ destinatário CNPJ.
- [ ] Provedor de emissão escolhido (SEFAZ direto × gateway) e homologação ativa.
- [ ] DANFE-NFC-e (QR/chave/protocolo/tributos) consolidando os pipelines de cupom.
- [ ] Fluxos de contingência, rejeição e reenvio desenhados.

---

## 9. Conclusão

O PDV/Vendas está **operacionalmente maduro**, mas **fiscalmente em estado zero**: faltam
models, identidade fiscal por loja e máquina de estados — três bloqueios **P0** que precisam
existir *antes* de tocar SEFAZ. O caminho não é "ligar a NFC-e", é **construir a camada fiscal
sobre a base operacional sólida**. A boa notícia: a base operacional (motor único, multi-loja,
correções seguras, auditoria) é exatamente a fundação certa para apoiar a camada fiscal sem
retrabalho — desde que a venda ganhe **estados** e os dados fiscais deixem de ser descartados.

**Próximo GOAL recomendado:** `GOAL_NFCE_ARCHITECTURE_BLUEPRINT` (desenho da arquitetura
completa antes de qualquer schema), seguido de `GOAL_FISCAL_SCHEMA_FOUNDATION`.
