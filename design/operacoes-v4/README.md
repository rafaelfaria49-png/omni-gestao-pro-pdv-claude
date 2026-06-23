# design/operacoes-v4/

Artefatos de **design** da Operações V4 do OmniGestão Pro.

## O que é

Este diretório contém exclusivamente os artefatos de **design** da Operações V4.
Serve como **fonte de verdade visual** para futuras implementações.

> ⚠️ Nenhum arquivo daqui deve ser utilizado diretamente em produção.
> Não há integração, rota, componente React, hook, Prisma ou Supabase neste pacote.
> É somente o visual.

## Conteúdo

| Arquivo | Descrição |
|---|---|
| `Operacoes-V4-Standalone.html` | Redesign V4 completo, HTML único **self-contained** (CSS + JS embutidos, sem dependência externa). Abra direto no navegador. ≈191 KB. |
| `Operacoes-V4-HANDOFF.md` | Documentação de implementação: estrutura, componentização, fluxos, estados, tokens, responsividade. |
| `README.md` | Este arquivo. |
| `assets/` `css/` `images/` | Pastas para anexos futuros (fontes, SVGs, exports). **Vazias** hoje — o standalone já tem tudo embutido. |

## Como usar

1. Abra `Operacoes-V4-Standalone.html` no navegador para inspecionar qualquer tela/estado.
2. Use `Operacoes-V4-HANDOFF.md` como guia para reconstruir em componentes React reais.
3. Não edite o HTML como se fosse código de produção — ele é referência visual.

## Status

Protótipo visual. **Não integrado.** Integração futura a cargo do Claude Code.
