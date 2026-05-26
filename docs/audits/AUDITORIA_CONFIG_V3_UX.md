# Auditoria UX — Configurações V3 (honestidade)

Data: 26/05/2026

## Critério

Nenhuma ação deve fingir persistência, integração ou API. Controles futuros usam `SettingsSoonBadge`, `SettingsFutureBlock` ou `disabled` com texto explícito.

## Runtime real (por aba)

| Aba | Persistência | Consumidor |
|-----|----------------|------------|
| Geral | `PUT /api/stores/[id]` + `PUT .../settings` | PDV, documentos, contatos |
| Lojas | `GestaoUnidadesSaas` → APIs stores | Multiloja |
| Plano | Atalho → `/dashboard/billing` (Stripe) | Assinatura |
| Aparência | `ThemeContext` + localStorage tema global | AppShell / hubs |
| PDV | `printerConfig` (fluxo + impressão) | PDV runtime |
| Vendas | `printerConfig.pdvParams` (formas, impostos, mesas) | PDV, orçamentos |
| Financeiro | `cardFees` + localStorage espelho | PDV maquininhas |
| IA | `GET /api/user/credits`, histórico; modelo em `aiMestreModel` | IA Mestre |
| Integrações | Status lido de settings; links reais | — |
| Importação | Importadores reais (universal / avançada) | Cadastros |
| Usuários | `POST/PATCH /api/admin/users` | NextAuth |
| Auditoria | `GET /api/config-audit` | Read-only |
| Segurança | `signOut` NextAuth real | Sessão |

## Integração futura / em breve (honesto)

| Item | Onde | Estado UI |
|------|------|-----------|
| Moeda / fuso horário | Geral | Select desabilitado + badge Em breve |
| Relatório mensal por e-mail | Financeiro | `SettingsFutureBlock` |
| Pré-visualização global de tema | Aparência | Botão disabled + Em breve |
| 2FA, troca de senha, lista de sessões | Segurança | `SettingsFutureBlock` |
| Marketing IA (campanhas) | Integrações | Card Hub · localStorage |
| Marketplace sync | Integrações | Card Hub · sem API sync |
| OpenRouter keys na UI | Integrações | Somente env no servidor |

## Dados locais (não são “API da loja”)

| Item | Onde | Nota na UI |
|------|------|------------|
| KPIs pagar/receber | Financeiro | Texto: cache `localStorage` |
| Modo importação universal/avancada | Importação | Preferência só neste navegador |
| Tema nos cards PDV Next/Assistência | PDV | Prévia; não persiste sem Salvar |
| Centro financeiro espelho | Financeiro | `localStorage` + sync `cardFees` |

## Removido nesta auditoria

- Switch desabilitado `checked={false}` no relatório por e-mail (parecia toggle funcional).
- `Math.random` em skeleton do `sidebar.tsx` (shadcn) → largura fixa.
- Estado local `moeda`/`fuso` em Geral que sugeria edição.
- Card Integrações “Marketing IA” misturado com IA Mestre real → card Hub separado.

## Validação

- `npx tsc --noEmit` — obrigatório após mudanças.
- `npm run build` — rotas Config V3 + APIs de settings.
