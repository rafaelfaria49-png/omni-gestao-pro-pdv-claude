---
title: Auditoria de GAP — Operações V3 vs Gestão Click / Smart System (assistência de celulares)
hub: operacoes (V3)
tipo: auditoria read-only (sem alteração de código)
status: v01
data: 2026-06-09
owner_humano: Rafael
owner_ia: Opus (Claude Code)
escopo: components/operacoes-v3/** · lib/operacoes-v3/** · app/dashboard/operacoes-v3/**
referencias: AUDITORIA_OPERACOES_V3_COMPLETA_v01.md · BLUEPRINT_OPERACOES_V3_FASE_3C_v01.md · AUDITORIA_PDV_OPERACIONAL_v01.md
pergunta_central: "O que ainda falta para a Operações V3 substituir completamente Gestão Click / Smart System no uso diário de uma assistência de celulares?"
---

# 🔧 Auditoria de GAP — Operações V3 × Gestão Click × Smart System (v01)

> **Read-only.** Nenhum código/schema/commit alterado. O lado **V3 é verificado na fonte**
> (`nova-os-model`, `workspace-model`, `garantia-textos`, `print-model`, `pos-venda-model`, telas).
> O lado **Gestão Click / Smart System** é avaliação **contextual** de capacidades consolidadas desses
> produtos (sistemas de assistência brasileiros maduros) — **não** um teste lado a lado em conta real.
> Classificação por item: **SUPERA · EMPATA · ABAIXO · NÃO EXISTE**.

---

## 1. Resumo executivo

A Operações V3 já tem um **núcleo de prontuário de assistência muito acima da média**: orçamento
profissional (cobrado/brinde/interno + lucro), **máquina de status única**, **entrega unificada e
idempotente** (3D.2), **biblioteca de garantias de nível jurídico** (11 modelos), **via interna**
(custo/lucro oculto do cliente), **senha padrão 3×3 desenhada** e **timeline auditável imutável**. Em
vários pontos **supera** Gestão Click e Smart System.

Mas, para **substituir 100%** esses sistemas no balcão de uma assistência de celulares, faltam itens que
no nicho são **inegociáveis** — e que os concorrentes entregam de fábrica:

1. **🔴 Fotos de entrada/defeito/entrega** — a V3 tem só a *estrutura* (`AnexosV3` é placeholder, "Adicionar" é toast). Sem foto de entrada, a assistência fica exposta a disputa ("o aparelho já chegou riscado").
2. **🔴 Mapa de avarias / estado físico estruturado** — só existe `condicaoAparelho` em **texto livre**. Não há checklist visual de carcaça/tela/tampa com marcação de danos.
3. **🔴 Histórico por aparelho (IMEI/serial)** — o histórico é **por cliente**, não por dispositivo. "Esse mesmo IMEI já passou aqui?" não é respondível.
4. **🔴 Comunicação automática com o cliente** — eventos existem (3C.0) mas **sem assinante/WhatsApp** (vide AUDITORIA_OPERACOES_V3_COMPLETA P0). O cliente nunca é avisado de "orçamento pronto / pode retirar".
5. **🟠 Recepção incompleta** — falta **Conta Google / Conta Apple (iCloud/FRP)**, **operadora**, **serial separado do IMEI**, e **Face ID/biometria como atributo de recepção** (hoje só como teste de checklist).
6. **🟠 Fiscal (NFS-e)** — fora de escopo da V3; concorrentes emitem.

**Veredito:** a V3 **empata ou supera** no *miolo* (orçamento, status, garantia, entrega, auditoria) e
fica **abaixo** justamente nas **bordas de recepção e prova** (fotos, avarias, IMEI-history, comunicação,
contas de bloqueio) — que são o que protege a assistência no dia a dia. **Não substitui ainda**; está a
~2–3 sprints focadas de paridade operacional.

| Bloco | Veredito V3 |
|---|---|
| Orçamento / status / entrega / garantia / via interna / auditoria | **SUPERA / EMPATA** |
| Recepção (contas, operadora, serial, biometria) | **ABAIXO** |
| Estado físico (avarias visuais) | **ABAIXO / NÃO EXISTE** |
| Fotos & anexos | **NÃO EXISTE (funcional)** |
| Histórico por aparelho (IMEI) | **ABAIXO** |
| Comunicação ao cliente / portal | **NÃO EXISTE (ligado)** |
| Fiscal (NFS-e) | **NÃO EXISTE** |

---

## 2. Matriz Gestão Click × Smart System × Operações V3

> ✅ tem/forte · 🟡 parcial · ❌ não tem. Evidência V3 entre parênteses.

### 2.1 Recepção (item 1)
| Campo | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| IMEI | ✅ | ✅ | ✅ (`equipamento.imei`/`numeroSerie`) | EMPATA |
| Serial (separado do IMEI) | ✅ | ✅ | 🟡 (um campo só serve aos dois) | ABAIXO |
| PIN / Senha | ✅ | ✅ | ✅ (3 tipos) | EMPATA |
| Senha padrão (desenho 3×3) | 🟡 | ✅ | ✅ **desenhado e impresso** | SUPERA |
| Conta Google | ✅ | ✅ | ❌ | NÃO EXISTE |
| Conta Apple / iCloud / FRP | ✅ | ✅ | ❌ | NÃO EXISTE |
| Face ID (atributo de recepção) | 🟡 | ✅ | 🟡 (só item de teste no checklist) | ABAIXO |
| Biometria (atributo de recepção) | 🟡 | ✅ | 🟡 (só item de teste no checklist) | ABAIXO |
| Operadora | ✅ | 🟡 | ❌ | NÃO EXISTE |
| Acessórios recebidos | ✅ | ✅ | ✅ (chip/capa/película/carregador/cabo/cartão + livre) | EMPATA |

### 2.2 Estado físico (item 2)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Tela / Tampa / Carcaça / Botões / Câmeras / Falante / Mic / Conector | ✅ (checklist físico) | ✅ | 🟡 (checklist **funcional**: liga/touch/wifi/câmera/falante/mic/carga — `CHECKLIST_ENTRADA_PADRAO_V3`) | ABAIXO |
| **Checklist visual de avarias** (mapa do aparelho) | 🟡 | ✅ | ❌ | NÃO EXISTE |
| **Marcação de avarias** (riscos/trincas por zona) | 🟡 | ✅ | ❌ (só `condicaoAparelho` em texto livre) | NÃO EXISTE |
| Termo de entrada (recibo) | ✅ | ✅ | 🟡 (a OS via cliente impressa funciona como recibo de entrada) | EMPATA |

### 2.3 Diagnóstico (item 3)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Defeito informado (cliente) | ✅ | ✅ | ✅ (`equipamento.defeitoRelatado`) | EMPATA |
| Defeito encontrado | ✅ | ✅ | ✅ (`diagnosticoV3.final/causa`) | EMPATA |
| Diagnóstico técnico | ✅ | ✅ | ✅ (`diagnosticoV3`: inicial/final/causa/solução) | EMPATA |
| Laudo técnico (documento dedicado) | 🟡 | ✅ | 🟡 (conteúdo existe; sem doc "laudo" separado) | ABAIXO |
| Histórico auditável | 🟡 | 🟡 | ✅ **timeline imutável** (`lerHistoricoV3`) | SUPERA |

### 2.4 Histórico do aparelho (item 4)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Mesmo aparelho voltou? | ✅ | ✅ | 🟡 (retorno manual por `osOriginalId`) | ABAIXO |
| Mesmo IMEI voltou? (busca por dispositivo) | ✅ | ✅ | ❌ (busca não indexa IMEI; agrupa por **cliente**) | NÃO EXISTE |
| Serviços anteriores | ✅ (por cliente e aparelho) | ✅ | 🟡 (só **por cliente**, `HistoricoClientesV3`) | ABAIXO |
| Garantias anteriores | ✅ | ✅ | 🟡 (tela Garantias global, não por aparelho) | ABAIXO |

### 2.5 Fotos e anexos (item 5)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Fotos de entrada | ✅ | ✅ | ❌ (`AnexosV3` placeholder; "Adicionar" = toast) | NÃO EXISTE |
| Fotos do defeito | ✅ | ✅ | ❌ | NÃO EXISTE |
| Fotos da entrega | 🟡 | ✅ | ❌ | NÃO EXISTE |
| Upload de documentos | ✅ | 🟡 | ❌ | NÃO EXISTE |

### 2.6 Checklist operacional (item 6)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Checklist de entrada | ✅ | ✅ | ✅ (13 itens, persistido) | EMPATA |
| Checklist de saída | ✅ | ✅ | 🟡 (`checklistTecnico` só **exibido** read-only, sem editor V3) | ABAIXO |
| Checklist **por serviço** (tela/bateria/conector/software) | 🟡 | ✅ | ❌ (checklist genérico, sem template por serviço) | NÃO EXISTE |

### 2.7 Garantias (item 7)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Biblioteca de garantias | 🟡 | 🟡 | ✅ **11 modelos** (`GARANTIA_CATALOGO_V3`) | SUPERA |
| Por tipo de serviço (auto-sugestão) | ❌ | 🟡 | ✅ (`sugerirGarantiaDaOSV3` por palavra-chave) | SUPERA |
| Oxidação (sem cobertura, texto claro) | 🟡 | 🟡 | ✅ | SUPERA |
| Software / Tela / Bateria / Conector / Câmera / Placa / Falante / Mic | 🟡 | 🟡 | ✅ (todos, com cobertura + exclusões) | SUPERA |
| Cálculo de validade a partir da entrega | 🟡 | ✅ | ✅ (`lerGarantiaV3`, derivado da entrega) | EMPATA |

### 2.8 Impressão (item 8)
| Documento / campo | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Ordem de Serviço (via cliente) | ✅ | ✅ | ✅ (empresa, cliente, equip+senha 3×3, acessórios, condição, defeito, checklist, diagnóstico, itens, financeiro, garantia, assinaturas) | EMPATA |
| Comprovante de recebimento | ✅ | ✅ | ✅ (`ReciboPreviewV3`, Fase 2B) | EMPATA |
| Termo de Garantia (dedicado) | 🟡 | ✅ | ✅ (`TermoGarantiaDocV3`) | EMPATA |
| Termo de Entrega | 🟡 | ✅ | ✅ (`TermoEntregaDocV3` + recebido por) | EMPATA |
| Via interna (custo/lucro) | ❌ | 🟡 | ✅ **diferencial** | SUPERA |
| Etiqueta técnica | ✅ | ✅ | 🟡 (estrutura; sem térmica) | ABAIXO |
| **Fotos no documento** | ✅ | ✅ | ❌ | NÃO EXISTE |
| **Avarias/estado físico no documento** | 🟡 | ✅ | ❌ | NÃO EXISTE |
| Endereço completo do cliente | ✅ | ✅ | ❌ (snapshot da OS só guarda nome/tel/doc/email) | ABAIXO |

### 2.9 Assinaturas (item 9)
| Item | Gestão Click | Smart System | **Operações V3** | Classe V3 |
|---|:--:|:--:|:--:|:--:|
| Cliente | ✅ | ✅ | ✅ (campo no documento impresso) | EMPATA |
| Técnico | ✅ | ✅ | ✅ | EMPATA |
| Retirada (entrega) | ✅ | ✅ | ✅ (Termo de Entrega + recebido por) | EMPATA |
| **Assinatura digital / touch capturada** | 🟡 | 🟡 | ❌ (só papel; nada gravado no payload) | ABAIXO |

### 2.10 Fluxo completo (item 10)
`Recepção ✅ → Diagnóstico ✅ → Orçamento ✅ → Aprovação ✅ → Execução ✅ → Recebimento ✅ → Entrega ✅(unificada 3D.2) → Garantia ✅ → Retorno ✅`

O **fluxo operacional fecha ponta a ponta** na V3 (todas as etapas têm write-path real). As lacunas não
estão no *encadeamento*, e sim nas **bordas de cada etapa**: recepção (contas/avarias/fotos), comunicação
ao cliente (sem WhatsApp ligado), fiscal (sem NFS-e) e histórico por aparelho.

---

## 3. Funcionalidades faltantes (NÃO EXISTE)

- **Fotos** de entrada/defeito/entrega + upload de documentos (anexos é placeholder).
- **Mapa/checklist de avarias** (estado físico estruturado por zona).
- **Conta Google / Conta Apple (iCloud/FRP)** na recepção.
- **Operadora** do chip.
- **Histórico por IMEI/aparelho** (busca por dispositivo).
- **Checklist por serviço** (templates: tela/bateria/conector/software).
- **Comunicação automática ao cliente** (WhatsApp por etapa) — eventos sem assinante.
- **Portal do cliente** real (placeholder).
- **Assinatura digital** capturada (touch/foto) gravada na OS.
- **NFS-e / fiscal**.

## 4. Funcionalidades parcialmente prontas (PARCIAL)

- **Recepção**: IMEI/senha/acessórios ✅, mas sem serial separado, contas, operadora, biometria-atributo.
- **Estado físico**: checklist **funcional** ✅, sem **avarias visuais**.
- **Checklist de saída**: dados exibidos (`checklistTecnico`) sem editor V3.
- **Laudo técnico**: conteúdo capturado, sem documento "laudo" dedicado.
- **Histórico**: por cliente ✅, por aparelho ❌.
- **Etiqueta técnica**: estrutura sem impressão térmica.
- **Recebimento (PDV de Serviço)**: real, porém cartão parcelado/crediário/carteira "a conectar".

## 5. Funcionalidades já superiores (SUPERA)

- **Biblioteca de garantias profissional** — 11 modelos com cobertura/exclusões, oxidação sem cobertura, auto-sugestão por serviço. **Acima** de ambos.
- **Via interna** (custo/lucro/itens internos ocultos do cliente) — diferencial raro no nicho.
- **Senha padrão 3×3 desenhada e impressa**.
- **Timeline operacional imutável e auditável** (cada ação vira evento).
- **Máquina de status única + entrega unificada idempotente** (3D.2) — elimina divergência de fluxo.
- **Orçamento com cobrado/brinde/interno + lucro estimado** e histórico de versões.
- **Multi-loja nativo** com isolamento por `storeId`.

---

## 6. Top 20 melhorias prioritárias

> P0 = bloqueia substituição diária · P1 = paridade competitiva · P2 = robustez · P3 = encantamento.

| # | Melhoria | Prioridade | Por quê |
|---|---|:--:|---|
| 1 | **Upload real de fotos** (entrada/defeito/entrega) + storage | **P0** | Prova contra disputa; todo concorrente tem |
| 2 | **Mapa/checklist de avarias** (tela/tampa/carcaça/botões com marcação) | **P0** | Estado físico estruturado na entrada |
| 3 | **Comunicação ao cliente por etapa** (assinante 3C.1 → WhatsApp) | **P0** | "Pronto p/ retirar"; hoje o cliente não é avisado |
| 4 | **Conta Google / Apple (iCloud/FRP) na recepção** | **P0** | Reparo trava sem isso; risco de bloqueio |
| 5 | **Histórico por IMEI/aparelho** (indexar serial + busca) | **P1** | "Esse aparelho já voltou?" |
| 6 | **Fotos no documento impresso** (OS/entrega) | **P1** | Recibo com prova visual |
| 7 | **Avarias no documento impresso** | **P1** | Termo de entrada completo |
| 8 | **Operadora + serial separado** na recepção | **P1** | Paridade de cadastro |
| 9 | **Checklist de saída editável** (V3) | **P1** | Conferência pós-reparo |
| 10 | **Checklist por serviço** (templates tela/bateria/conector/software) | **P1** | Padroniza qualidade |
| 11 | **Assinatura digital capturada** (touch/foto) na OS | **P1** | Reduz papel; prova |
| 12 | **Endereço do cliente no snapshot + impressão** | **P1** | Documento completo |
| 13 | **Portal do cliente real** (acompanhamento + aprovar orçamento) | **P1** | Auto-atendimento |
| 14 | **Laudo técnico** como documento dedicado | **P2** | Casos de seguro/empresa |
| 15 | **Etiqueta térmica** (impressão real) | **P2** | Bancada |
| 16 | **Recebimento: cartão parcelado/crediário/carteira** | **P2** | Fechar formas de pagamento |
| 17 | **NFS-e / fiscal** (adapter) | **P2** | Exigência fiscal |
| 18 | **Catálogo de serviços gerenciável** (CRUD) | **P2** | Hoje só leitura agregada |
| 19 | **Cadastro de técnico** (entidade) + comissão/tempo | **P2** | Métricas reais por técnico |
| 20 | **Notificação de garantia vencendo / NPS pós-entrega** | **P3** | Pós-venda proativo |

---

## 7. Próximas sprints recomendadas

| Sprint | Foco | Itens | Observação |
|---|---|---|---|
| **3E.1 — Prova de Entrada** | Fotos + avarias | #1, #2, #6, #7 | O maior gap de risco; storage (sem BL-07). **P0** |
| **3E.2 — Recepção Completa** | Contas/operadora/serial/biometria | #4, #8, #11, #12 | Cadastro do aparelho à altura do nicho |
| **3C.1 — Comunicação (já desenhada no BLUEPRINT 3C)** | WhatsApp por etapa | #3, #13 | ⚠️ toca `lib/whatsapp` (área protegida) → ADR + opt-out |
| **3E.3 — Aparelho 360°** | Histórico por IMEI | #5, #9, #10 | Device-centric + checklist por serviço |
| **3F — Fiscal & Pagamento** | NFS-e + formas | #16, #17 | Decisão de provedor (compartilha com PDV) |

**Ordem sugerida:** **3E.1 → 3E.2 → 3C.1**. As duas primeiras não tocam área protegida e fecham o que
mais expõe a loja (prova + cadastro). A comunicação (3C.1) entra com ADR.

---

## 8. Pergunta final obrigatória

### "Se a RafaCell migrasse HOJE para a Operações V3, o que ainda faria falta no dia a dia?"

**Faria falta, na prática de balcão:**

1. **Tirar foto do aparelho na entrada** — para não responder por risco/trinca que já chegou. *(não existe)*
2. **Marcar as avarias** num mapa do aparelho em vez de digitar texto. *(não existe)*
3. **Anotar a senha do iCloud/Conta Google** — sem isso, metade dos reparos trava. *(não existe)*
4. **Avisar o cliente automático no WhatsApp** "orçamento pronto" / "pode retirar". *(existe o evento, falta ligar)*
5. **Saber se aquele IMEI já passou aqui** e o que foi feito antes. *(só por cliente, não por aparelho)*
6. **Conferência de saída** (checklist pós-reparo editável) e **checklist específico** do serviço feito. *(parcial)*
7. **Nota fiscal de serviço** quando o cliente pede. *(não existe)*
8. **Assinatura na tela** em vez de papel. *(só papel)*

**O que NÃO faria falta (já está bom ou melhor):** abrir OS completa, orçar com lucro e brinde, controlar
status na bancada, **dar baixa de estoque na entrega** (3D.1/3D.1B), **receber no balcão** (CR + caixa),
**imprimir OS/garantia/entrega/via interna**, **garantia profissional por tipo de serviço**, **timeline
auditável** e **entrega única e consistente** (3D.2).

**Conclusão:** a RafaCell **operaria** na V3 hoje para o miolo do serviço, mas **sentiria falta diária**
de **fotos, avarias, contas de bloqueio, aviso ao cliente e histórico por aparelho** — exatamente as
defesas e conveniências que Gestão Click e Smart System já dão. São **~2–3 sprints focadas** (3E.1/3E.2 +
3C.1) para chegar à **substituição plena** no dia a dia.

---

*Auditoria read-only. Nenhum código, schema, migração ou commit alterado. A comparação com Gestão Click /
Smart System é contextual (capacidades consolidadas), não um teste em conta real; o lado V3 é verificado
na fonte. Prioridades são recomendação técnica — abertura de cada sprint exige decisão humana (e, para
comunicação/WhatsApp, ADR por tocar área protegida).*
