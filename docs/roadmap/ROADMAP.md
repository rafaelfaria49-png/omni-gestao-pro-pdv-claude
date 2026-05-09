# Roadmap — OmniGestão Pro

> Última revisão: Maio 2026 — alinhado à auditoria em `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`.

Este arquivo descreve **fases macro**; detalhes técnicos continuam nos relatórios em `docs/modules/reports/` e em `docs/ai/CURRENT_STATUS.md`.

---

## Fase A — Pronto para operar (fundação já existente)

- Operações HUB V2 com OS persistida (Prisma + payload + timeline).
- Adapters: OS → Contas a Receber; OS → Estoque na entrega (idempotência documentada).
- Núcleo financeiro server-side (receber/pagar services, APIs ops e `/api/financeiro/*`).
- PDV com transação de venda e integrações documentadas; caixa persistido localmente por loja.
- Temas globais e shells de HUB (scroll, `min-w-0`, Lovable isolado).

---

## Fase B — MVP comercial (fechar gaps P0/P1 da auditoria)

1. **Produto único para OS:** decisão explícita HUB V2 vs legado + comunicação na UI/menu.
2. **Auth real no dashboard:** substituir ou restringir o mock de staff (`AccessGate`) para ambientes pagos.
3. **Financeiro na percepção do usuário:** uma entrada principal alimentada por Prisma (ou redirecionamento honesto para painéis legados) até o HUB V2 deixar de depender de mock inline.
4. **Dashboard inicial:** remover métricas fictícias ou conectar a APIs agregadas reais.
5. **Deploy:** checklist ENV + smoke de `Store`/`Cliente`/`Produto` + `tsc`/`build` (ver `docs/ai/DEPLOY.md`).

---

## Fase C — Consolidação multi-módulo

- Vendas HUB: matriz de features real vs demonstração; sync com vendas Prisma.
- WhatsApp: caminho de produção (Meta, webhooks, observabilidade) além da simulação atual.
- Contas a pagar: reduzir trilha dupla localStorage/API quando a UI estiver 100% confortável no server-first.
- Master Console: dados reais multi-loja (Prisma) em vez de fixtures.

---

## Fase D — Expansão

- Marketplace (integrações externas).
- Omni Agent com execução auditável e limites.
- Ledger/carteiras com modelo de dados definitivo (se adotado).
- Documentação de módulos ainda placeholder (`CLIENTES.md`, `VENDAS.md`, `MARKETPLACE.md`, `THEMES.md`).

---

## Fora de escopo imediato

- Refatorações massivas só por conveniência.
- Migrações schema sem necessidade de produto acoplada.
