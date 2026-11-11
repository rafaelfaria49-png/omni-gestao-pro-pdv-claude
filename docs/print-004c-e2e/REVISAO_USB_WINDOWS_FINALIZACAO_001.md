# Revisão independente — USB Windows 001

GOAL `OMNI-PRINT-USB-WINDOWS-FINALIZACAO-REAL-001`, 2026-11-11.
Revisor independente: subagente `usb_print_independent_review`, somente leitura.
Base do delta: `0dbeb5d9267f9920dc1a763649989b3e37546d49` (D05 + main atual).

## Veredito final

**APROVADO TECNICAMENTE. Sem findings pendentes P0–P3 no delta final revisado.**
Não constitui aprovação de merge, deploy, migrations, instalação produtiva ou homologação física.
Build final e CI remoto ainda devem validar o commit corretivo; impressão física Omni Print continua pendente.

## Achados e correções

| Prioridade | Achado reproduzido | Correção reavaliada |
|---|---|---|
| P2 | Guard baseado na flag global da loja bloqueava KG e outros PDVs/OS que compartilham o runtime | `requireAgent` explícito, vinculado ao input de cada venda no Clássico; default preserva outros PDVs; `onUnsupported` libera legado apenas após recusa com zero job |
| P2 | IPv4-mapped IPv6 e IPv6 expandido escapavam do teste de loopback na Vercel | Canonização de TCP/URL e recusa de mapped hexadecimal, loopback expandido e aliases numéricos; regressões de zero socket/fetch |
| P3 | Manifesto não cobria os dois componentes pós-venda alterados | Feedback automático e diálogo pós-venda incluídos no gerador oficial de HASHES |

O revisor repetiu sondagens da rota real transpilada em memória, com auth/fetch controlados: loopbacks recusados com
503/zero fetch; destino de rede configurado preservado. Conferiu React, encerramento dos recursos do ensaio SW,
autorização de plataforma, destinos/redirect, limites e timeout, estado UNKNOWN, isolamento e `APPROVED_RELEASE=null`.
Não alterou arquivos/índice, não acessou banco/produção e não enviou impressão.

Resultados automatizados completos e limites operacionais: `RELATORIO_USB_WINDOWS_FINALIZACAO_001.md`.
