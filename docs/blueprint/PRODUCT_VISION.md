---
title: Product Vision — OmniGestão Pro
status: vivo
owner: produto + Opus (estratégia)
last_update: 2026-05-27
---

# 🎯 Product Vision — OmniGestão Pro

> **Visão de produto:** quem é o cliente, qual é a dor, qual é a promessa, contra quem competimos, qual é a diferenciação.
> **Estratégia + roadmap macro:** [`MASTER_PLAN.md`](./MASTER_PLAN.md).

---

## 1. Visão (em 1 frase)

> **Ser o ERP que SMB brasileiro escolhe quando quer operar como rede grande sem virar refém de consultor.**

---

## 2. Proposta de valor

**OmniGestão Pro entrega:**
- Operação de balcão fluida (PDV rápido como Avantpro)
- Omnichannel real (PDV + OS + Marketplace + WhatsApp = um sistema)
- IA executora (não chat decorativo — comandos viram ações com auditoria)
- Multi-loja desde o dia 1 (não plano caro)
- Auditoria enterprise (cada centavo rastreável via `payload.historico[]` + `localKey`)
- Onboarding sem consultor (instalação < 30 min)

**Pelo preço/complexidade de:**
- Bling/Tiny premium (não SAP/Linx)

---

## 3. Personas alvo

### 3.1 Persona primária — "Dono operador"
- **Quem:** SMB com 1–5 lojas, dono no operacional diário.
- **Idade:** 35–55.
- **Dor:** "Meu sistema atual me bloqueia mais do que ajuda. Cada operação demanda 3 telas, IA inútil, multi-loja paga caro."
- **Comportamento:** decisão rápida; testa, julga em 1 semana; abandona se atrita.
- **O que quer:** fechar o caixa rápido, ver dinheiro entrando real-time, atender WhatsApp sem trocar de ferramenta.

### 3.2 Persona secundária — "Operador de balcão"
- **Quem:** vendedor/atendente/técnico que vive no PDV/OS.
- **Idade:** 22–40.
- **Dor:** "Sistema lento, atalhos esquisitos, gerente me xinga por bug que não é meu."
- **O que quer:** atalho de teclado, velocidade, não ter que abrir 5 abas.

### 3.3 Persona terciária — "Gerente de rede"
- **Quem:** profissional contratado para administrar 3–10 lojas.
- **Idade:** 30–50.
- **Dor:** "Não consigo comparar lojas, não vejo ruptura, não confio nos dados."
- **O que quer:** painel matriz consolidado, alertas operacionais, drill-down.

---

## 4. Mercado e segmentação

### 4.1 Segmentos verticais alvo
- **Assistência técnica** (celular, eletrônicos) — vertical âncora, alinhado com OS robusta + garantia + catálogo de defeitos.
- **Varejo SMB** (boutique, papelaria, brinquedo) — PDV + Estoque + Marketplace.
- **Distribuidoras pequenas** — Multi-loja + Financeiro + Marketplace.
- **Supermercado de bairro** — PDV alta cadência + balança.
- **Oficina mecânica** — OS técnica + peças + agendamento.

### 4.2 Anti-segmentos (NÃO atender)
- Enterprise (> 50 lojas) — complexidade explode, time de consultoria necessário.
- Indústria com chão de fábrica — MRP/ERP industrial é outro produto.
- E-commerce puro sem balcão — Shopify/Loja Integrada faz melhor.

---

## 5. Concorrência (mapa)

| Concorrente | Fortaleza | Fraqueza | Onde batemos |
|---|---|---|---|
| **Bling** | Cobertura nacional, integrações | UX datada, IA inexistente, PDV fraco | PDV premium + Omni Agent |
| **Tiny ERP** | Simplicidade, marketplace | Multi-loja fraco, sem WhatsApp profundo | Multi-loja + WhatsApp HUB nativo |
| **Conta Azul** | UX moderno, fiscal sólido | PDV fraco, sem OS, sem marketplace | Omnichannel real |
| **Mercado Turbo** | Marketplace top tier | Não é ERP completo | ERP completo + Marketplace bom |
| **OmniSys / TecnoSpeed Assistec** | Assistência técnica vertical | Não é omnichannel | Omnichannel + IA |
| **SAP B1 / Linx Microvix** | Enterprise robusto | Caro, lento, exige consultor | Self-service + preço SMB |
| **GestaoClick** | Preço baixo, simples | Limitado, sem evolução | Plataforma viva + IA |
| **Wati / Take Blip** | WhatsApp puro | Não é ERP | WhatsApp + tudo ao lado |

---

## 6. Diferenciais defensáveis

1. **Omni Agent com executores reais** — comando em texto livre faz coisa real no ERP, não simula.
2. **Adapter pattern desacoplado** — adicionar canal/marketplace/módulo sem refactor central.
3. **Auditoria nativa** via `payload.historico[]` + `localKey` — sem retrabalho.
4. **HUBs Lovable isolados** — UI premium sem comprometer core; iteração visual rápida.
5. **Multi-loja desde dia 1** — não vira plano caro.
6. **PDV premium** com 4 perfis (Clássico, Supermercado, Assistência, Venda Completa) + Black Edition.
7. **WhatsApp Cloud API direto** (não Z-API/Evolution como principal) — qualidade Meta tier 1.

---

## 7. Princípios de produto

> Repetidos do `MASTER_PLAN.md §7` (fonte da verdade lá).

1. Real ou nada.
2. Cada centavo rastreável.
3. Operador é cliente (UX de balcão > UX de painel).
4. IA executa, humano decide (destrutivo exige confirmação).
5. SMB instala sozinho (onboarding < 30 min).
6. Multi-loja é regra, não plano.

---

## 8. Tom de marca

- **Profissional, mas direto.** Sem jargão enterprise pomposo, sem gírias casuais.
- **Pragmático.** Mostrar o que funciona, não promessa.
- **Confiável.** Dado financeiro nunca é "aproximado".
- **Brasileiro.** PT-BR nativo, exemplos com realidade brasileira (NFC-e, PIX, MEI, Simples).

---

## 9. Roadmap por persona (alto nível)

| Onda | Dono operador | Operador | Gerente de rede |
|---|---|---|---|
| 1 | Caixa fecha em 1 clique | PDV rápido | — |
| 2 | WhatsApp + OS no mesmo lugar | OS no celular (Fase 5) | Histórico 360° do cliente |
| 3 | Vende em N canais sem trabalho dobrado | Pedido marketplace aparece como venda | ROI por canal |
| 4 | Pede ao Omni Agent e ele faz | Comando por voz (Fase 4) | Painel matriz comparativo |

---

## 10. Métricas de produto (norte)

| Métrica | O que mede | Meta de longo prazo |
|---|---|---|
| Tempo de onboarding (do registro à 1ª venda real) | Frição inicial | **< 30 min** |
| Tempo médio de fechamento de caixa | Velocidade operacional | **< 90s** |
| % de receita rastreável a campanha (Marketing IA) | Eficácia comercial | **> 30%** |
| % de mensagens WhatsApp respondidas pelo Omni Agent | Automação | **> 30%** |
| Churn mensal (cliente cancela) | Saúde do produto | **< 2%/mês** |
| NPS | Recomendação | **> 50** |
| Vendas perdidas (não persistidas) | Confiabilidade | **0/mês** |

---

## 11. O que NÃO somos

- **Não somos um chatbot bonito.** Omni Agent executa ou não fala.
- **Não somos plataforma de e-commerce.** Vendemos integração, não vitrine.
- **Não somos contabilidade.** Exportamos para Domínio/Alterdata, não substituímos.
- **Não somos BPO.** Não rodamos operação do cliente — damos a ferramenta.
- **Não somos consultoria.** Self-service é doutrina.

---

## 12. Como esta visão evolui

- Revisar **trimestralmente** com humano dono.
- Mudança grande (persona, segmento, diferencial) → ADR.
- `last_update` obrigatório.
